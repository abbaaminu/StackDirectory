import type { IncomingMessage, ServerResponse } from "http";
import { clientIpFromRequest, consumeRateLimit } from "./_lib/rateLimit";
import { resolvePublicUrl } from "./_lib/publicUrl";
import {
  avatarSvg,
  extractIconHref,
  isImageContentType,
  normalizeContentType,
  normalizeIconDomain,
  pickIconSize,
} from "./_lib/toolIcon";

/**
 * First-party icon endpoint (Vercel Serverless Function).
 *
 * Endpoint: GET /api/favicon?domain=<host>&size=<px>
 *
 * The listing cards used to point straight at Google's favicon service
 * (`https://www.google.com/s2/favicons?domain=...`). That service is a
 * third party we do not control, and it answers **404** for any site it has not
 * indexed - which is every listing on a fresh subdomain. The cards therefore
 * showed an empty circle and the browser console filled up with
 * `t2.gstatic.com/faviconV2 ... 404 (Not Found)`.
 *
 * This route fixes that at the source, and its contract is deliberately narrow:
 *
 *   * it answers with a 200 image **always** - the site's own icon when one can
 *     be fetched (`X-Icon-Source: favicon|link`), otherwise a generated
 *     brand-coloured avatar (`X-Icon-Source: avatar`), so a listing can never
 *     render an empty slot again;
 *   * it fetches only from the requested host (plus redirects that pass the
 *     same public-address check), so it cannot be used as an open proxy or to
 *     reach the deployment's own network;
 *   * it is rate-limited and edge-cached, so one visitor cannot turn the
 *     deployment into an icon farm.
 *
 * `icon_url` is not a column on `public.tools` (see src/lib/submissions.ts), so
 * an icon is always derived from `website_url` - here, at render time, from the
 * same origin that serves the app.
 */

/** Largest icon forwarded to the browser. ICO files are frequently ~100 KB. */
const MAX_ICON_BYTES = 512_000;

/** Largest page scanned for a `<link rel="icon">`. */
const MAX_PAGE_BYTES = 400_000;

/** Ceiling for a single request (redirects included). */
const HOP_TIMEOUT_MS = 6_000;

/** Ceiling for the whole resolution, so the function cannot outlive the caller. */
const TOTAL_BUDGET_MS = 9_000;

const MAX_REDIRECTS = 3;

/** Icon lookups one client may trigger per window, shared across its listings. */
const ICON_RATE_LIMIT = 120;
const ICON_RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * A real icon is content-addressed by its own host and effectively immutable -
 * cache it for a year at the edge, a day in the browser.
 */
const ICON_CACHE_CONTROL = "public, max-age=86400, s-maxage=31536000, immutable";

/**
 * A generated avatar is a *degradation*, so it is cached far less aggressively:
 * when the site eventually publishes an icon we want it picked up the next day
 * rather than in a year's time.
 */
const AVATAR_CACHE_CONTROL = "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400";

const USER_AGENT = "StackDirectoryIconBot/1.0";

type IconSource = "favicon" | "link";

type IconAsset = {
  bytes: Buffer;
  contentType: string;
  source: IconSource;
};

type Resolved = {
  bytes: Buffer;
  contentType: string;
  url: string;
};


type IconResponse = {
  status: number;
  bytes: Buffer;
  contentType: string;
  cacheControl: string;
  source: string;
  /** True for a `HEAD` request: same headers, no body. */
  head?: boolean;
};

/**
 * Writes one image response.
 *
 * `X-Icon-Source` records which branch answered, which is what makes the
 * "which cards have a real icon?" question answerable from `curl -I` alone.
 * `nosniff` stops a browser from re-interpreting a forwarded SVG, and a
 * forwarded SVG additionally carries a locked-down CSP so that opening the
 * endpoint directly cannot execute anything the third-party site embedded.
 */
function sendIcon(res: ServerResponse, response: IconResponse): void {
  res.statusCode = response.status;
  res.setHeader("Content-Type", response.contentType);
  res.setHeader("Content-Length", String(response.bytes.byteLength));
  res.setHeader("Cache-Control", response.cacheControl);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Icon-Source", response.source);
  if (response.contentType.startsWith("image/svg+xml")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  if (response.head) {
    res.end();
    return;
  }
  res.end(response.bytes);
}

/** Answers with the generated avatar - the endpoint's never-fails path. */
function sendAvatar(
  res: ServerResponse,
  label: string,
  size: number,
  options: { status: number; cacheControl: string; source: string; head?: boolean },
): void {
  sendIcon(res, {
    status: options.status,
    bytes: Buffer.from(avatarSvg(label, size), "utf8"),
    contentType: "image/svg+xml; charset=utf-8",
    cacheControl: options.cacheControl,
    source: options.source,
    head: options.head,
  });
}

/** Reads at most `limit` bytes, or `null` when the body is larger/empty. */
async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) return null;
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > 0 && buffer.byteLength <= limit ? buffer : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(bytes);
}

/**
 * Fetches `url`, following at most `MAX_REDIRECTS` hops.
 *
 * Redirects are followed manually so every hop is re-checked by
 * `resolvePublicUrl`: a public host may legitimately redirect its icon to a CDN,
 * but the same mechanism would otherwise let it reach `127.0.0.1` or
 * `169.254.169.254` through our network. Any failure - a refused connection, an
 * unresolvable subdomain, a timeout, a hop that fails the address check -
 * surfaces as `null` and is answered with the generated avatar.
 */
async function fetchFollowing(
  url: URL,
  accept: string,
  maxBytes: number,
): Promise<Resolved | null> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let current = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(HOP_TIMEOUT_MS, remaining));
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: accept, "User-Agent": USER_AGENT },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) return null;
        current = await resolvePublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const bytes = await readCapped(response, maxBytes);
      return bytes ? { bytes, contentType, url: current.toString() } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

/** Fetches an icon URL and keeps it only when it really is an image. */
async function fetchIcon(rawUrl: string, source: IconSource): Promise<IconAsset | null> {
  let url: URL;
  try {
    url = await resolvePublicUrl(rawUrl);
  } catch {
    return null;
  }

  const resolved = await fetchFollowing(url, "image/*,*/*;q=0.8", MAX_ICON_BYTES);
  if (!resolved || !isImageContentType(resolved.contentType)) return null;
  return {
    bytes: resolved.bytes,
    contentType: normalizeContentType(resolved.contentType),
    source,
  };
}

/** Reads a page's HTML, so its declared icon can be discovered. */
async function fetchPage(host: string): Promise<{ html: string; url: string } | null> {
  let url: URL;
  try {
    url = await resolvePublicUrl(`https://${host}/`);
  } catch {
    return null;
  }

  const resolved = await fetchFollowing(url, "text/html,application/xhtml+xml", MAX_PAGE_BYTES);
  if (!resolved) return null;
  if (!/text\/html|application\/xhtml\+xml/i.test(resolved.contentType)) return null;
  return { html: resolved.bytes.toString("utf8"), url: resolved.url };
}

/**
 * The site's own icon, or `null` when it has none we can use.
 *
 * `/favicon.ico` is tried first because it is one hop and answers for most
 * sites. When it is missing *or* is not an image (a Vercel SPA rewrite answers
 * `200 text/html` for it, which is exactly what devfolio.stackbuildco.com
 * serves), the page is read and its declared `<link rel="icon">` is used
 * instead - that is where clause.stackbuildco.com's `/clauseguard-logo.svg`
 * comes from, so this step is what turns a fallback disc into the real brand
 * mark.
 */
async function resolveIconAsset(host: string): Promise<IconAsset | null> {
  const direct = await fetchIcon(`https://${host}/favicon.ico`, "favicon");
  if (direct) return direct;

  const page = await fetchPage(host);
  if (!page) return null;
  const href = extractIconHref(page.html, page.url);
  if (!href) return null;
  return fetchIcon(href, "link");
}

/** Query string of a request, tolerating a missing or malformed `req.url`. */
function readQuery(req: IncomingMessage): URLSearchParams {
  try {
    return new URL(req.url ?? "", "https://stackdirectory.local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const isHead = req.method === "HEAD";
  if (req.method !== "GET" && !isHead) {
    res.setHeader("Allow", "GET, HEAD");
    sendIcon(res, {
      status: 405,
      bytes: Buffer.from("Method not allowed", "utf8"),
      contentType: "text/plain; charset=utf-8",
      cacheControl: "no-store",
      source: "method",
    });
    return;
  }

  const query = readQuery(req);
  const domain = normalizeIconDomain(query.get("domain") ?? query.get("host"));
  const size = pickIconSize(query.get("size") ?? query.get("sz"));

  // Unlike `/api/website-metadata`, this route is hit once per listing card, so
  // the ceiling is per client and generous; the browser cache means a real page
  // view costs one request per distinct domain. An unidentifiable client (the
  // unit-test harness, local piping) is not throttled at all.
  const clientIp = clientIpFromRequest(req);
  if (clientIp) {
    const decision = consumeRateLimit(`api-favicon:${clientIp}`, ICON_RATE_LIMIT, ICON_RATE_WINDOW_MS);
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      sendAvatar(res, domain ?? "", size, {
        status: 429,
        cacheControl: "no-store",
        source: "throttled",
        head: isHead,
      });
      return;
    }
  }

  // A request we cannot attribute to a public host still gets an image: the card
  // has nothing to fall back to once the browser has already asked us.
  if (!domain) {
    sendAvatar(res, "", size, {
      status: 400,
      cacheControl: "no-store",
      source: "invalid",
      head: isHead,
    });
    return;
  }

  // Every failure mode - DNS, TLS, timeout, a non-image body, an oversized one -
  // lands on the avatar, so a listing never renders an empty slot.
  let asset: IconAsset | null = null;
  try {
    asset = await resolveIconAsset(domain);
  } catch {
    asset = null;
  }

  if (asset) {
    sendIcon(res, {
      status: 200,
      bytes: asset.bytes,
      contentType: asset.contentType,
      cacheControl: ICON_CACHE_CONTROL,
      source: asset.source,
      head: isHead,
    });
    return;
  }

  sendAvatar(res, domain, size, {
    status: 200,
    cacheControl: AVATAR_CACHE_CONTROL,
    source: "avatar",
    head: isHead,
  });
}
