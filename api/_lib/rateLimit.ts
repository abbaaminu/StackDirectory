import type { IncomingMessage } from "http";

/**
 * Best-effort, in-process rate limiter for the public serverless endpoints.
 *
 * `/api/send-email` (an outbound mail relay) and `/api/website-metadata` (an
 * outbound HTTP fetch) are reachable by anyone, so a single visitor must not be
 * able to spend the deployment's Resend quota or its egress budget in a loop.
 *
 * The ledger lives in the lambda instance, so it resets on a cold start and is
 * per-instance rather than global: it is a blunt instrument, not a replacement
 * for a real edge/WAF limit. It still turns "one request can send unlimited
 * mail" into "one client is throttled", which is the difference between a
 * scraper and a mail bomb.
 */

type Bucket = {
  /** Requests observed inside the current window. */
  count: number;
  /** Epoch ms at which the window (and therefore the count) resets. */
  resetAt: number;
};

const BUCKETS = new Map<string, Bucket>();

/** Upper bound on tracked clients, so a spoofed-IP flood cannot grow the map. */
const MAX_BUCKETS = 5_000;

export type RateLimitDecision = {
  allowed: boolean;
  /** Configured ceiling for the window. */
  limit: number;
  /** Requests left in the current window (never negative). */
  remaining: number;
  /** Seconds the caller should wait before retrying (`429` only). */
  retryAfterSeconds: number;
};

/**
 * Records one request for `key` and reports whether it may proceed.
 *
 * Expired buckets are pruned on every call (bounded by `MAX_BUCKETS`) and the
 * oldest bucket is evicted once the map is full, so memory stays flat.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitDecision {
  const now = Date.now();

  for (const [bucketKey, bucket] of BUCKETS) {
    if (bucket.resetAt <= now) BUCKETS.delete(bucketKey);
  }

  const existing = BUCKETS.get(key);
  if (!existing || existing.resetAt <= now) {
    if (BUCKETS.size >= MAX_BUCKETS) {
      const oldestKey = BUCKETS.keys().next().value;
      if (oldestKey !== undefined) BUCKETS.delete(oldestKey);
    }
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: 0,
  };
}

/** Test/dev hook: forgets every bucket so each run starts from a clean slate. */
export function resetRateLimits(): void {
  BUCKETS.clear();
}

type RateLimitRequest = {
  headers?: IncomingMessage["headers"];
  socket?: { remoteAddress?: string | null } | null;
};

/**
 * Client address for rate-limiting, or `""` when it cannot be determined.
 *
 * `x-forwarded-for` is caller-controlled, but every Vercel deployment sets it
 * (and overwrites the client-supplied value), and the worst case of a spoofed
 * value is a per-IP bucket of the attacker's choosing. Callers must skip
 * throttling entirely when this returns `""` - a direct `req.socket` stub with
 * no address (unit tests, local piping) has no client to attribute.
 */
export function clientIpFromRequest(req: RateLimitRequest): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? "";
  const candidate = first.split(",")[0].trim() || req.socket?.remoteAddress?.trim() || "";
  // Normalise the IPv4-mapped form Node reports for IPv4 over a dual-stack
  // socket (`::ffff:1.2.3.4`) so one client cannot hold two buckets.
  return candidate.startsWith("::ffff:") ? candidate.slice(7) : candidate;
}
