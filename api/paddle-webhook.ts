import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "http";
import { syncResendAudienceContact } from "./_lib/resendAudience";

type WebhookRequest = IncomingMessage & {
  body?: unknown;
};

/**
 * Paddle Webhook Handler — Vercel Serverless Function
 *
 * Endpoint: POST /api/paddle-webhook
 *
 * Every request must carry Paddle's `Paddle-Signature` header: it is verified
 * against `PADDLE_WEBHOOK_SECRET_KEY` (HMAC-SHA256 over `ts:rawBody`) before the
 * body is trusted, so a forged `transaction.completed` cannot feature a listing.
 * In production a missing secret fails closed.
 *
 * On a `transaction.completed` event, reads `custom_data.tool_id` (or the
 * top-level `tool_id`) passed at checkout time and upgrades that tool in
 * Supabase to `is_approved = true` and `is_featured = true`. When no row matches
 * (the buyer never returned to the tab that would have inserted the pending
 * row), the listing is created from the same signed `custom_data` instead, so a
 * paying customer is never left without the Featured slot they bought.
 *
 * Once the listing is live it also triggers an instant Resend confirmation
 * receipt (POST /api/send-email with `type: "PAYMENT_RECEIPT"`) containing the
 * payment receipt and the submission details for the listing the buyer paid to
 * promote. Email delivery is best-effort: a receipt failure is logged and
 * reported as `emailSent: false`, but never fails the webhook response, so
 * Paddle does not re-deliver a transaction that was already upgraded.
 *
 * Two guards keep a replay from being profitable or destructive:
 *   - when PADDLE_FEATURED_PRICE_ID (or VITE_PADDLE_PRICE_ID) is configured, a
 *     transaction that paid for a *different* price id is acknowledged with
 *     `ignored: "price_mismatch"` and never features a listing, and
 *   - a delivery whose `transactionId:tool_id` pair was already processed is
 *     acknowledged with `duplicate: true` instead of repeating the upgrade,
 *     receipt email and audience sync (see `rememberProcessedEvent`).
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY (server-side secret) so it bypasses
 * Row Level Security. Never expose this key to the browser/vite runtime.
 */

type PaddleWebhookPayload = {
  event_type: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    currency_code?: string;
    invoice_number?: string | null;
    billed_at?: string;
    created_at?: string;
    customer?: {
      id?: string;
      email?: string;
      name?: string | null;
    };
    details?: {
      totals?: {
        subtotal?: string | number;
        tax?: string | number;
        total?: string | number;
        grand_total?: string | number;
        currency_code?: string;
      };
    };
    items?: Array<{
      quantity?: number;
      price?: {
        id?: string;
        description?: string;
        unit_price?: {
          amount?: string | number;
          currency_code?: string;
        };
      };
    }>;
    custom_data?: {
      tool_id?: string;
      plan_type?: string;
      submitted_by?: string;
      /**
       * Optional extras. When present they let the buyer receipt render the
       * real submission details even if the tool row lookup misses.
       */
      customer_email?: string;
      tool_name?: string;
      tool_slug?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type PaddleToolRow = {
  id?: string;
  name?: string;
  category?: string;
  pricing_type?: string;
  website_url?: string;
};

const DEFAULT_CURRENCY = "USD";
/** $5.00 USD — mirrors VITE_PADDLE_PRICE_ID (500 cents). */
const FALLBACK_FEATURED_PRICE_MINOR = 500;
const RECEIPT_PLAN_LABEL = "Featured Listing (instant approval + boost)";

/**
 * Paddle reports money as an integer number of minor units (500 = $5.00), and
 * webhook payloads may serialise that value as either a number or a string.
 */
function parseMinorUnits(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Mirrors the client-side slug helper in ToolDetailModal/App. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Reads a trimmed string out of Paddle's `custom_data` (numbers included). */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * PostgREST reports a unique-violation insert as `23505`. The code is checked
 * first because the human-readable message varies by Postgres version.
 */
function isDuplicateKeyError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

/**
 * Best-effort replay ledger: `transactionId:listingId` → when it was processed.
 *
 * Paddle retries a delivery until it receives a 2xx and may also deliver the
 * same event twice, and a signed body stays valid for five minutes, so a naive
 * handler can run its side effects (receipt email, audience sync, and — if the
 * listing was moderated away in between — re-creating a deleted row) twice.
 *
 * The ledger lives in the lambda instance, so a cold start forgets it; the
 * receipt is additionally guarded by a Resend idempotency key. This closes the
 * common duplicate-delivery case with no extra infrastructure.
 */
const PROCESSED_EVENTS = new Map<string, number>();
const PROCESSED_EVENT_TTL_MS = 15 * 60 * 1000;
const PROCESSED_EVENT_LIMIT = 500;

/** Records an event key. Returns `false` when it was already processed. */
function rememberProcessedEvent(key: string): boolean {
  const now = Date.now();
  for (const [existingKey, seenAt] of PROCESSED_EVENTS) {
    if (now - seenAt > PROCESSED_EVENT_TTL_MS) PROCESSED_EVENTS.delete(existingKey);
  }

  const seenAt = PROCESSED_EVENTS.get(key);
  if (seenAt !== undefined && now - seenAt <= PROCESSED_EVENT_TTL_MS) return false;

  if (PROCESSED_EVENTS.size >= PROCESSED_EVENT_LIMIT) {
    const oldestKey = PROCESSED_EVENTS.keys().next().value;
    if (oldestKey !== undefined) PROCESSED_EVENTS.delete(oldestKey);
  }
  PROCESSED_EVENTS.set(key, now);
  return true;
}

/** Exported so the replay guard can be exercised by scripts/verify.tsx. */
export function hasProcessedEvent(key: string): boolean {
  const seenAt = PROCESSED_EVENTS.get(key);
  return seenAt !== undefined && Date.now() - seenAt <= PROCESSED_EVENT_TTL_MS;
}

/**
 * Forgets an event key so the next delivery may retry it.
 *
 * The key is recorded *before* the database work, and Paddle only retries a
 * delivery that did **not** get a 2xx. So a transient Supabase failure had to
 * release the key again: otherwise Paddle's retry was answered
 * `duplicate: true` and the paying customer's listing was never featured.
 */
function forgetProcessedEvent(key: string): void {
  PROCESSED_EVENTS.delete(key);
}

/**
 * The Paddle price id that buys a Featured Listing.
 *
 * `PADDLE_FEATURED_PRICE_ID` is the documented server-side name; the public
 * `VITE_PADDLE_PRICE_ID` / `PADDLE_PRICE_ID` names are accepted so a deployment
 * that already has one variable set still gets the check. Returns "" when the
 * deployment has not configured any, in which case verification is skipped.
 */
function resolveFeaturedPriceId(): string {
  return (
    process.env.PADDLE_FEATURED_PRICE_ID?.trim() ||
    process.env.PADDLE_PRICE_ID?.trim() ||
    process.env.VITE_PADDLE_PRICE_ID?.trim() ||
    ""
  );
}

/** `tools.pricing_type` is constrained to these four values in Supabase. */
const PRICING_TYPES = ["Free", "Freemium", "Paid", "Open Source"] as const;

/**
 * Complete `public.tools` row for a paid Featured listing that has no database
 * record yet.
 *
 * The client (SubmitModal.tsx) inserts its pending row only after
 * `checkout.completed` has fired, so a buyer who closes the tab while the
 * payment is settling would otherwise pay for a listing that never appears.
 * Everything here comes from the HMAC-verified webhook payload, and the row is
 * created already approved + featured because the payment is what it bought.
 *
 * Returns `null` when the payload does not carry enough detail to build a
 * listing (no name or no URL) - fabricating one would be worse than a log line.
 *
 * Column list mirrors `buildToolInsertRow` in src/lib/submissions.ts. Never add
 * `icon_url`: `public.tools` has no such column, so a single unknown column makes
 * Postgres reject the whole insert (`42703`) and the paying customer would end up
 * with no listing. The UI derives the icon from `website_url` instead.
 */
function buildPaidListingRow(
  customData: Record<string, unknown>,
  options: { id: string; customerId: string; websiteUrl: string },
): Record<string, unknown> | null {
  const name = text(customData.tool_name);
  if (!name || !options.websiteUrl) return null;

  const tagline = text(customData.tagline) || `${name} — featured listing on StackDirectory.`;
  const requestedPricing = text(customData.pricing_type);
  const submitterEmail =
    text(customData.seller_contact) || text(customData.customer_email);
  const techStack = text(customData.tech_stack)
    .split(",")
    .map((technology) => technology.trim())
    .filter(Boolean);

  return {
    id: options.id,
    name,
    tagline,
    description: text(customData.description) || tagline,
    website_url: options.websiteUrl,
    pricing_type: (PRICING_TYPES as readonly string[]).includes(requestedPricing)
      ? requestedPricing
      : "Freemium",
    category: text(customData.category) || "Developer Tools",
    upvotes: 0,
    is_approved: true,
    is_featured: true,
    status: "approved",
    paddle_customer_id: options.customerId || null,
    is_for_sale: false,
    asking_price: null,
    monthly_revenue: 0,
    monthly_profit: 0,
    seller_contact: submitterEmail || null,
    tech_stack: techStack,
  };
}

/**
 * Absolute base URL of this deployment, used to call our own /api/send-email.
 *
 * `APP_URL` always wins. The forwarding headers are a development convenience
 * only: in production this request arrives from Paddle, not from a browser, so
 * `x-forwarded-host`/`host` are caller-controlled and a spoofed value would make
 * us POST the buyer's receipt payload to a domain of the caller's choosing.
 * Production therefore falls back to the deployed URL instead of the header.
 */
function resolveBaseUrl(req: WebhookRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[Paddle Webhook] APP_URL is not configured - posting the receipt to the default production URL instead of the request Host header.",
    );
    return "https://apps.stackbuildco.com";
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost ?? req.headers.host;
  if (host) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto ?? "https")
      .split(",")[0]
      .trim();
    return `${proto || "https"}://${host.split(",")[0].trim()}`;
  }

  return "https://apps.stackbuildco.com";
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Guard against extremely large payloads (max ~1MB)
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** Paddle sends `Paddle-Signature: ts=<unix>;h1=<hex hmac>[;h1=…]`. */
function parsePaddleSignature(header: string | undefined): {
  timestamp: string;
  signatures: string[];
} | null {
  if (!header) return null;

  let timestamp = "";
  const signatures: string[] = [];

  for (const segment of header.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (!value) continue;
    if (key === "ts") timestamp = value;
    else if (key === "h1") signatures.push(value.toLowerCase());
  }

  return timestamp && signatures.length ? { timestamp, signatures } : null;
}

/** Rejects replayed payloads: the signed timestamp must be recent. */
function isFreshSignature(timestamp: string, toleranceSeconds = 300): boolean {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return false;
  // Tolerate millisecond timestamps in addition to Paddle's seconds.
  const seconds = parsed > 1_000_000_000_000 ? parsed / 1000 : parsed;
  return Math.abs(Date.now() / 1000 - seconds) <= toleranceSeconds;
}

/**
 * Verifies Paddle's HMAC-SHA256 webhook signature over the raw body
 * (`HMAC(ts + ":" + rawBody)`, keyed with the notification destination secret).
 *
 * Exported so the verification logic can be exercised by tests without a live
 * Paddle account.
 */
export function verifyPaddleSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
): boolean {
  const parsed = parsePaddleSignature(header);
  if (!parsed || !secret || !rawBody) return false;
  if (!isFreshSignature(parsed.timestamp)) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}:${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return parsed.signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    return (
      provided.length === expectedBuffer.length &&
      timingSafeEqual(provided, expectedBuffer)
    );
  });
}

export default async function handler(
  req: WebhookRequest,
  res: ServerResponse,
) {
  // Only accept POST requests from Paddle
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
    return;
  }

  try {
    // Signature verification needs the exact bytes Paddle signed, so the raw
    // stream is always read first. A pre-parsed body is only used when the
    // stream has already been consumed upstream.
    const rawBody = typeof req.body === "string" ? req.body : await collectBody(req);
    const payload: PaddleWebhookPayload =
      req.body && typeof req.body === "object"
        ? (req.body as PaddleWebhookPayload)
        : JSON.parse(rawBody || "{}");

    // 1. Authenticate the caller.
    //    Without this, anyone who found the endpoint could POST a fabricated
    //    `transaction.completed` event and have any listing approved+featured.
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET_KEY?.trim() ?? "";
    const signatureHeader = req.headers["paddle-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!webhookSecret) {
      if (process.env.NODE_ENV === "production") {
        console.error(
          "[Paddle Webhook] PADDLE_WEBHOOK_SECRET_KEY is not configured - refusing unverifiable webhook.",
        );
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "Webhook signature verification is not configured.",
          }),
        );
        return;
      }
      console.warn(
        "[Paddle Webhook] PADDLE_WEBHOOK_SECRET_KEY is not set - skipping signature verification (development only).",
      );
    } else if (!verifyPaddleSignature(rawBody, signature, webhookSecret)) {
      console.warn("[Paddle Webhook] Rejected webhook with a missing or invalid signature.");
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "Invalid webhook signature" }));
      return;
    }

    const { event_type, data } = payload;

    if (!event_type || typeof event_type !== "string") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "Invalid webhook payload" }));
      return;
    }

    // 2. Only handle successful (completed) transactions
    if (event_type !== "transaction.completed") {
      console.log(
        `[Paddle Webhook] Ignored non-completed event: ${event_type ?? "(missing)"}`,
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, emailSent: false }));
      return;
    }

    // 3. Extract the tool_id from custom_data (or fall back to top-level tool_id)
    const customData = data?.custom_data ?? {};
    const toolId =
      customData.tool_id ?? (data as Record<string, unknown>)?.tool_id;

    if (typeof toolId !== "string" || !toolId.trim()) {
      console.warn("[Paddle Webhook] Missing tool_id in custom_data payload.");
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "Missing tool_id" }));
      return;
    }

    // 4. Build a server-side Supabase admin client using the Service Role Key
    //    SUPABASE_URL is the canonical server-side name; the VITE_ name is
    //    accepted so one deployment variable can serve both runtimes.
    const supabaseUrl =
      process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "[Paddle Webhook] Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL (or VITE_SUPABASE_URL) environment variables.",
      );
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          error: "Server is not configured for webhook upgrades.",
        }),
      );
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 5. Someone paid. Two guards run first (price + replay), then the listing is
    //    approved + featured (the service role bypasses RLS).
    //    `.select(...)` echoes the updated row so the receipt can quote the real
    //    submission details without a second query, and `tools.status` is
    //    constrained to pending | approved | rejected (see
    //    src/lib/supabase/database.ts) - writing "active" fails the column
    //    constraint and would abort the whole upgrade.
    const matchingValue = toolId.trim();
    const customWebsiteUrl = text(customData.website_url);
    const paddleCustomerId = text(data?.customer_id);
    const transactionId = text(data?.id) || "unknown";

    // 5a. Only a Featured Listing purchase may feature a listing. Paddle signs
    //     the body, but `custom_data` and the price come from whichever checkout
    //     produced the transaction, so a cheaper product pointed at this same
    //     notification destination could otherwise be replayed as a Featured
    //     purchase. When the expected price id is configured, the transaction
    //     has to prove it paid for it.
    const expectedPriceId = resolveFeaturedPriceId();
    if (expectedPriceId) {
      const itemPriceIds = (data?.items ?? [])
        .map((item) => text(item?.price?.id))
        .filter(Boolean);

      if (itemPriceIds.length > 0 && !itemPriceIds.includes(expectedPriceId)) {
        console.error(
          `[Paddle Webhook] Transaction ${transactionId} paid for price(s) "${itemPriceIds.join(", ")}" but the Featured Listing price is "${expectedPriceId}" - ignoring the event.`,
        );
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: true,
            ignored: "price_mismatch",
            emailSent: false,
            created: false,
          }),
        );
        return;
      }

      if (itemPriceIds.length === 0) {
        console.warn(
          `[Paddle Webhook] Transaction ${transactionId} carries no item price id - the Featured price check could not be applied.`,
        );
      }
    } else {
      console.warn(
        "[Paddle Webhook] PADDLE_FEATURED_PRICE_ID is not configured - any completed transaction on this destination is treated as a Featured Listing purchase.",
      );
    }

    // 5b. Acknowledge replays without re-running the side effects below.
    const processedEventKey = `${transactionId}:${matchingValue}`;
    if (!rememberProcessedEvent(processedEventKey)) {
      console.warn(
        `[Paddle Webhook] Duplicate delivery for transaction ${transactionId} (listing ${matchingValue}) - acknowledged without re-upgrading.`,
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: true,
          duplicate: true,
          emailSent: false,
          created: false,
        }),
      );
      return;
    }

    const featuredUpgrade: Record<string, unknown> = {
      is_approved: true,
      is_featured: true,
      status: "approved",
    };
    // Record which Paddle customer paid so the queue can reconcile a listing
    // with its receipt.
    if (paddleCustomerId) featuredUpgrade.paddle_customer_id = paddleCustomerId;

    let { data: updatedRows, error } = await supabaseAdmin
      .from("tools")
      .update(featuredUpgrade as never)
      .eq("id", matchingValue)
      .select("id, name, category, pricing_type, website_url");

    const countRows = (rows: unknown): number =>
      Array.isArray(rows) ? rows.length : rows ? 1 : 0;

    let matchedRowCount = countRows(updatedRows);

    if (!error && matchedRowCount === 0 && customWebsiteUrl) {
      // Legacy or mismatched custom_data: retry against the listing URL so a
      // buyer who paid is never left without the upgrade.
      console.warn(
        `[Paddle Webhook] No tool row matched id "${matchingValue}" - retrying by website_url.`,
      );
      ({ data: updatedRows, error } = await supabaseAdmin
        .from("tools")
        .update(featuredUpgrade as never)
        .eq("website_url", customWebsiteUrl)
        .select("id, name, category, pricing_type, website_url"));

      matchedRowCount = countRows(updatedRows);
    }

    if (error) {
      console.error("[Paddle Webhook] Database update failed:", error.message);
      // The upgrade did not happen and this response is a 500, so Paddle will
      // retry: release the replay guard or that retry would be acknowledged as
      // a duplicate and the paid Featured slot would be lost for good.
      forgetProcessedEvent(processedEventKey);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          error: "Failed to update tool listing.",
        }),
      );
      return;
    }

    const asToolRow = (rows: unknown): PaddleToolRow | null => {
      const row = Array.isArray(rows) ? rows[0] : rows;
      return (row as PaddleToolRow | null) ?? null;
    };

    let updatedTool = asToolRow(updatedRows);
    let createdTool: PaddleToolRow | null = null;

    if (updatedTool) {
      console.log(
        `[Paddle Webhook] Successfully upgraded tool "${updatedTool.name ?? toolId}" to Featured & Approved.`,
      );
    } else {
      // 6. Nothing matched. The buyer paid from a browser that never came back
      //    to create its pending row (SubmitModal.tsx only inserts after
      //    checkout.completed), so create the listing here instead of losing the
      //    purchase. The row id is the same `custom_data.tool_id` the client
      //    would have used, so the two paths can never produce two listings.
      const insertRow = buildPaidListingRow(customData, {
        id: matchingValue,
        customerId: paddleCustomerId,
        websiteUrl: customWebsiteUrl,
      });

      if (!insertRow) {
        console.error(
          `[Paddle Webhook] Paid transaction "${text(data?.id) || "unknown"}" references tool_id "${matchingValue}" but carries no tool_name/website_url, so no listing could be created. Manual follow-up required.`,
        );
      } else {
        const { error: insertError } = await supabaseAdmin
          .from("tools")
          .insert(insertRow as never);

        if (!insertError) {
          createdTool = {
            id: matchingValue,
            name: String(insertRow.name ?? ""),
            category: String(insertRow.category ?? ""),
            pricing_type: String(insertRow.pricing_type ?? ""),
            website_url: String(insertRow.website_url ?? ""),
          };
          console.log(
            `[Paddle Webhook] Created and featured the paid listing "${createdTool.name}" (${matchingValue}).`,
          );
        } else if (isDuplicateKeyError(insertError)) {
          // Unique violation: the browser inserted its own row between the two
          // lookups. Upgrade that row instead of failing the webhook.
          console.warn(
            "[Paddle Webhook] The listing appeared during the insert - upgrading it instead.",
          );
          const { data: racedRows, error: raceError } = await supabaseAdmin
            .from("tools")
            .update(featuredUpgrade as never)
            .eq("id", matchingValue)
            .select("id, name, category, pricing_type, website_url");

          if (raceError) {
            console.error("[Paddle Webhook] Race recovery update failed:", raceError.message);
          } else {
            updatedTool = asToolRow(racedRows);
          }
        } else {
          console.error("[Paddle Webhook] Failed to create the paid listing:", insertError.message);
          // Same reason as the update path: a 500 means Paddle retries, and the
          // retry must be allowed to try the insert again.
          forgetProcessedEvent(processedEventKey);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: false,
              error: "Failed to create the paid Featured listing.",
            }),
          );
          return;
        }
      }
    }

    // The listing the receipt should describe, whichever path created it.
    const effectiveTool = updatedTool ?? createdTool;

    // 7. Trigger the instant Resend confirmation receipt for the buyer.
    //    Best-effort: the payment already succeeded and the listing is already
    //    live, so email problems must never fail the webhook response.
    const customerEmail =
      data?.customer?.email?.trim() || customData.customer_email?.trim() || "";
    const submitterEmail =
      text(customData.seller_contact) || customerEmail;
    if (submitterEmail) {
      await syncResendAudienceContact(
        submitterEmail,
        effectiveTool?.name ?? text(customData.tool_name),
      );
    }
    const currency =
      (typeof data?.currency_code === "string" && data.currency_code.trim()) ||
      data?.details?.totals?.currency_code ||
      DEFAULT_CURRENCY;

    const paddleItems = data?.items ?? [];
    const itemMinorTotal = paddleItems.reduce<number>((total, item) => {
      const unitAmount = parseMinorUnits(item?.price?.unit_price?.amount);
      if (unitAmount === null) return total;
      const quantity = parseMinorUnits(item?.quantity) ?? 1;
      return total + unitAmount * quantity;
    }, 0);

    const amountMinor =
      parseMinorUnits(data?.details?.totals?.grand_total) ??
      parseMinorUnits(data?.details?.totals?.total) ??
      (itemMinorTotal > 0 ? itemMinorTotal : FALLBACK_FEATURED_PRICE_MINOR);

    const knownToolName =
      effectiveTool?.name?.trim() ||
      (typeof customData.tool_name === "string" ? customData.tool_name.trim() : "");

    const receiptToolName = knownToolName || "Your StackDirectory listing";

    const slugSource =
      (typeof customData.tool_slug === "string" ? customData.tool_slug.trim() : "") ||
      knownToolName ||
      effectiveTool?.id ||
      toolId;

    const toolSlug = slugify(slugSource) || toolId.trim();

    let emailSent = false;
    if (!customerEmail) {
      console.warn(
        "[Paddle Webhook] No customer email on the transaction — receipt email skipped.",
      );
    } else {
      try {
        const response = await fetch(`${resolveBaseUrl(req)}/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PAYMENT_RECEIPT",
            customerEmail,
            toolName: receiptToolName,
            toolSlug,
            amount: Math.round(amountMinor) / 100,
            currency,
            transactionId,
            orderNumber: typeof data?.invoice_number === "string" ? data.invoice_number : "",
            itemDescription: data?.items?.[0]?.price?.description ?? "",
            planLabel: RECEIPT_PLAN_LABEL,
            category: effectiveTool?.category ?? "",
            pricingType: effectiveTool?.pricing_type ?? "",
            paidAt: data?.billed_at ?? data?.created_at ?? new Date().toISOString(),
          }),
        });

        const result = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
        } | null;

        emailSent = response.ok && result?.success !== false;
        if (emailSent) {
          console.log(`[Paddle Webhook] Receipt email sent to ${customerEmail}.`);
        } else {
          console.error(
            "[Paddle Webhook] Receipt email failed:",
            response.status,
            result?.error ?? "unknown error",
          );
        }
      } catch (emailError) {
        console.error("[Paddle Webhook] Receipt email request threw:", emailError);
      }
    }

    // 8. Return success JSON. `created` reports whether this delivery had to
    //    create the listing because no row existed yet.
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, emailSent, created: Boolean(createdTool) }));
  } catch (err) {
    console.error("[Paddle Webhook] Handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: "Internal server error processing webhook.",
      }),
    );
  }
}
