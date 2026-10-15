import { Resend } from "resend";
import type { IncomingMessage, ServerResponse } from "http";
import {
  createServiceRoleClient,
  isAdminRecord,
  readBearerToken,
  readServiceRoleConfig,
  resolveSessionUser,
  type ServiceRoleClient,
} from "./_lib/adminAuth";
import { escapeHtml, isValidEmail, sanitizeHeaderValue } from "./_lib/email";
import { clientIpFromRequest, consumeRateLimit } from "./_lib/rateLimit";

type EmailRequest = IncomingMessage & {
  body?: unknown;
};

/**
 * Outbound email endpoint (Vercel Serverless Function).
 *
 * Endpoint: POST /api/send-email
 *
 * It is reachable by anyone, and it sends mail from this deployment's verified
 * Resend domain, so three guards stand between the request body and Resend:
 *
 *   1. a per-client rate limit (`_lib/rateLimit`), which stops one visitor from
 *      spending the whole mail quota in a loop,
 *   2. address validation - a recipient is always caller-supplied, and a
 *      malformed or CR/LF-carrying address either bounces or injects headers,
 *      and
 *   3. a Supabase session for the two types a signed-in user triggers by hand
 *      (`NEW_OFFER`, `APP_APPROVED`). Without it the endpoint is an open relay:
 *      anybody could mail an arbitrary address "your app is now live" from
 *      StackDirectory's own domain. `APP_APPROVED` additionally requires the
 *      caller to be an administrator.
 *
 * `PAYMENT_RECEIPT` is deliberately exempt: it is only ever sent server-to-server
 * by api/paddle-webhook.ts, which has already authenticated Paddle's HMAC
 * signature. `SUPPORT_MESSAGE` is public on purpose (it goes to our own inbox).
 * When Supabase is not configured there is no session to verify and the session
 * guard is skipped - the same "no session available" case the client surfaces.
 */

type NewOfferPayload = {
  type: "NEW_OFFER";
  toolName: string;
  ownerEmail: string;
  offerAmount: number;
  message: string;
  toolSlug: string;
};

type AppApprovedPayload = {
  type: "APP_APPROVED";
  toolName: string;
  submitterEmail: string;
  toolSlug: string;
};

type SupportMessagePayload = {
  type: "SUPPORT_MESSAGE";
  senderName: string;
  senderEmail: string;
  category: string;
  message: string;
};

type PaymentReceiptPayload = {
  type: "PAYMENT_RECEIPT";
  customerEmail: string;
  toolName: string;
  toolSlug: string;
  amount: number;
  currency: string;
  transactionId: string;
  orderNumber?: string;
  itemDescription?: string;
  planLabel?: string;
  category?: string;
  pricingType?: string;
  paidAt?: string;
};

type EmailPayload =
  | NewOfferPayload
  | AppApprovedPayload
  | SupportMessagePayload
  | PaymentReceiptPayload;

/**
 * Ceiling for the JSON body. Every payload here is a short form submission, so
 * 32 KB is generous - and a small cap is what keeps an oversized body from
 * reaching the parser at all.
 */
const MAX_BODY_BYTES = 32_768;

/** Requests one client may make per window (a human sends a handful at most). */
const EMAIL_RATE_LIMIT = 15;
const EMAIL_RATE_WINDOW_MS = 10 * 60 * 1000;

function respond(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  // Never let a CDN or a browser replay one caller's mail request for another.
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEmailPayload(value: unknown): value is EmailPayload {
  if (!isRecord(value) || !["NEW_OFFER", "APP_APPROVED", "SUPPORT_MESSAGE", "PAYMENT_RECEIPT"].includes(String(value.type))) {
    return false;
  }

  const requiredStrings = value.type === "NEW_OFFER"
    ? ["toolName", "ownerEmail", "message", "toolSlug"]
    : value.type === "APP_APPROVED"
      ? ["toolName", "submitterEmail", "toolSlug"]
        : value.type === "PAYMENT_RECEIPT"
          ? ["customerEmail", "toolName", "toolSlug", "currency", "transactionId"]
          : ["senderName", "senderEmail", "category", "message"];

  return requiredStrings.every((key) => typeof value[key] === "string" && value[key].trim()) &&
    (value.type !== "NEW_OFFER" || (typeof value.offerAmount === "number" && Number.isFinite(value.offerAmount))) &&
    (value.type !== "PAYMENT_RECEIPT" || (typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0));
}

/** Email types only a signed-in user may trigger (see the module doc block). */
const SESSION_REQUIRED_TYPES: ReadonlyArray<EmailPayload["type"]> = [
  "NEW_OFFER",
  "APP_APPROVED",
];

/**
 * Validation error for the addresses in a payload, or `""` when every address
 * that will be used as a recipient/from value is deliverable.
 *
 * A support message is exempt from the recipient check: it is addressed to our
 * own inbox, not to a caller-supplied one.
 */
function payloadAddressError(payload: EmailPayload): string {
  if (payload.type === "SUPPORT_MESSAGE") {
    return isValidEmail(payload.senderEmail)
      ? ""
      : "A valid sender email address is required.";
  }

  const recipient =
    payload.type === "NEW_OFFER"
      ? payload.ownerEmail
      : payload.type === "APP_APPROVED"
        ? payload.submitterEmail
        : payload.customerEmail;

  return isValidEmail(recipient)
    ? ""
    : "A valid recipient email address is required.";
}

/**
 * Enforces the session requirement for the hand-triggered email types.
 *
 * Returns `null` when the request may proceed. Throws only if Supabase itself is
 * unreachable, which the handler reports as a 500.
 */
async function authorizeEmailRequest(
  payload: EmailPayload,
  req: EmailRequest,
): Promise<{ status: number; error: string } | null> {
  if (!SESSION_REQUIRED_TYPES.includes(payload.type)) return null;

  const config = readServiceRoleConfig();
  // No Supabase credentials (local demo / unconfigured deployment): there is no
  // session to verify, so the endpoint keeps its previous best-effort behaviour.
  if (!config) return null;

  const token = readBearerToken(req);
  if (!token) return { status: 401, error: "A valid session is required." };

  let client: ServiceRoleClient;
  try {
    client = createServiceRoleClient(config);
  } catch (configError) {
    console.error("[Email] Supabase admin client creation failed:", configError);
    return { status: 500, error: "Email sending is not configured." };
  }

  const { user } = await resolveSessionUser(client, token);
  if (!user) return { status: 401, error: "Invalid or expired session." };

  if (payload.type === "APP_APPROVED" && !isAdminRecord(user)) {
    return {
      status: 403,
      error: "Only an administrator can send an approval notification.",
    };
  }

  return null;
}

/** Formats Paddle's decimal amount using the transaction currency. */
function formatCurrencyAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

/** Renders an ISO/epoch timestamp as a stable UTC label (never throws). */
function formatTimestamp(value?: string): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function renderDetailRows(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;word-break:break-word;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
}

/** Builds the instant payment receipt + submission summary sent to the buyer. */
function buildReceiptEmail(payload: PaymentReceiptPayload, from: string) {
  const listingUrl = `https://apps.stackbuildco.com/?tool=${encodeURIComponent(payload.toolSlug)}`;
  const itemLabel =
    payload.itemDescription?.trim() ||
    payload.planLabel?.trim() ||
    "Featured Listing (instant approval + boost)";

  const receiptRows: Array<[string, string]> = [
    ["Item", itemLabel],
    ["Amount paid", formatCurrencyAmount(payload.amount, payload.currency)],
    ["Payment status", "Paid"],
    ["Transaction ID", payload.transactionId],
  ];
  if (payload.orderNumber?.trim()) {
    receiptRows.push(["Order number", payload.orderNumber.trim()]);
  }
  receiptRows.push(["Date", formatTimestamp(payload.paidAt)]);

  const submissionRows: Array<[string, string]> = [["Listing", payload.toolName]];
  if (payload.category?.trim()) submissionRows.push(["Category", payload.category.trim()]);
  if (payload.pricingType?.trim()) submissionRows.push(["Pricing model", payload.pricingType.trim()]);
  submissionRows.push(["Listing URL", listingUrl]);

  return {
    from,
    to: payload.customerEmail,
    replyTo: "support@stackbuildco.com",
    subject: `Receipt: "${payload.toolName}" is now a Featured listing on StackDirectory`,
    html:
      `<div style="background:#f1f5f9;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
      `<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">` +
      `<div style="background:#0f172a;padding:28px 24px;">` +
      `<p style="margin:0;color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">StackDirectory</p>` +
      `<h1 style="margin:10px 0 0;color:#ffffff;font-size:22px;line-height:1.3;">Payment confirmed &mdash; your listing is live</h1>` +
      `<p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">Thanks for submitting <strong style="color:#ffffff;">${escapeHtml(payload.toolName)}</strong>. Your payment went through and the listing has been instantly approved and boosted. Here is your receipt and submission summary.</p>` +
      `</div>` +
      `<div style="padding:24px;">` +
      `<h2 style="margin:0 0 4px;color:#0f172a;font-size:15px;letter-spacing:.08em;text-transform:uppercase;">Receipt</h2>` +
      `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">${renderDetailRows(receiptRows)}</table>` +
      `<h2 style="margin:0 0 4px;color:#0f172a;font-size:15px;letter-spacing:.08em;text-transform:uppercase;">Submission details</h2>` +
      `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">${renderDetailRows(submissionRows)}</table>` +
      `<p style="margin:0 0 24px;"><a href="${listingUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;">View your live listing</a></p>` +
      `<h2 style="margin:0 0 8px;color:#0f172a;font-size:15px;letter-spacing:.08em;text-transform:uppercase;">What happens next</h2>` +
      `<ul style="margin:0 0 20px;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">` +
      `<li>Your listing is approved and pinned to the <strong>Featured</strong> section of the directory.</li>` +
      `<li>It is now visible in search, category browsing and the homepage grid.</li>` +
      `<li>Community upvotes start counting on your listing immediately.</li>` +
      `</ul>` +
      `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Need to change a detail, or want a refund within 14 days? Reply to this email or contact <a href="mailto:support@stackbuildco.com" style="color:#0f172a;">support@stackbuildco.com</a> quoting transaction ID <strong>${escapeHtml(payload.transactionId)}</strong>.</p>` +
      `</div>` +
      `</div>` +
      `</div>`,
  };
}

export default async function handler(req: EmailRequest, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    respond(res, 405, { success: false, error: "Method not allowed" });
    return;
  }

  // Throttle before the body is parsed, so an unauthenticated loop costs almost
  // nothing. A request with no attributable client address (local piping, the
  // unit-test harness) is not throttled: there is no client to throttle.
  const clientIp = clientIpFromRequest(req);
  if (clientIp) {
    const decision = consumeRateLimit(
      `send-email:${clientIp}`,
      EMAIL_RATE_LIMIT,
      EMAIL_RATE_WINDOW_MS,
    );
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      respond(res, 429, {
        success: false,
        error: "Too many requests. Please try again in a few minutes.",
      });
      return;
    }
  }

  try {
    const payload = req.body && typeof req.body === "object"
      ? req.body
      : JSON.parse((await collectBody(req)) || "{}");

    if (!isEmailPayload(payload)) {
      respond(res, 400, { success: false, error: "Invalid email payload" });
      return;
    }

    // Addresses are caller-supplied, so they are validated before Resend sees
    // them: an invalid recipient bounces, and a CR/LF-carrying one injects
    // headers into the mail.
    const addressError = payloadAddressError(payload);
    if (addressError) {
      respond(res, 400, { success: false, error: addressError });
      return;
    }

    // A hand-triggered notification must carry the session of the user who
    // triggered it (see the module doc block).
    const authFailure = await authorizeEmailRequest(payload, req);
    if (authFailure) {
      respond(res, authFailure.status, {
        success: false,
        error: authFailure.error,
      });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "StackDirectory <onboarding@resend.dev>";
    if (!apiKey) {
      respond(res, 500, { success: false, error: "RESEND_API_KEY is not configured" });
      return;
    }

    const resend = new Resend(apiKey);
    // Single-line, length-capped values for every header field. A support
    // message has no listing name, so only the listing mails derive one.
    const toolName =
      payload.type === "SUPPORT_MESSAGE"
        ? ""
        : sanitizeHeaderValue(payload.toolName, 120);
    const listingUrl = payload.type === "NEW_OFFER" || payload.type === "APP_APPROVED"
      ? `https://apps.stackbuildco.com/?tool=${encodeURIComponent(payload.toolSlug)}`
      : "";
    const email = payload.type === "NEW_OFFER"
      ? {
          from,
          to: payload.ownerEmail.trim(),
          subject: `New offer for ${toolName}`,
          html: `<h2>New offer received</h2><p><strong>${escapeHtml(payload.toolName)}</strong> received a new acquisition offer.</p><p><strong>Offer amount:</strong> $${payload.offerAmount.toLocaleString("en-US")}</p><p><strong>Message:</strong> ${escapeHtml(payload.message) || "No message provided."}</p><p><a href="${listingUrl}">Open the deal room</a></p>`,
        }
      : payload.type === "APP_APPROVED"
        ? {
          from,
          to: payload.submitterEmail.trim(),
          subject: `${toolName} is now live on StackDirectory`,
          html: `<h2>Your app has been approved!</h2><p>Congratulations, <strong>${escapeHtml(payload.toolName)}</strong> is now live on StackDirectory.</p><p><a href="${listingUrl}">View your live listing</a></p>`,
          }
        : payload.type === "PAYMENT_RECEIPT"
          ? buildReceiptEmail(payload, from)
        : {
            from,
            to: "support@stackbuildco.com",
            // The Resend SDK maps camelCase `replyTo` onto the API's `reply_to`
            // field; passing `reply_to` here would be silently dropped and
            // support replies would go to the sending address instead.
            replyTo: sanitizeHeaderValue(payload.senderEmail, 200),
            subject: `[${sanitizeHeaderValue(payload.category, 60)}] Support message from ${sanitizeHeaderValue(payload.senderName, 120)}`,
            html: `<h2>New support message</h2><p><strong>From:</strong> ${escapeHtml(payload.senderName)} (${escapeHtml(payload.senderEmail)})</p><p><strong>Category:</strong> ${escapeHtml(payload.category)}</p><p><strong>Message:</strong></p><p>${escapeHtml(payload.message).replace(/\n/g, "<br />")}</p>`,
          };

    // Paddle retries a webhook until it gets a 2xx and can also deliver the same
    // event twice, so a receipt must be idempotent: the key is derived from the
    // Paddle transaction id, and Resend drops the repeat instead of emailing the
    // buyer a second receipt.
    const sendOptions =
      payload.type === "PAYMENT_RECEIPT"
        ? { idempotencyKey: `stackdirectory-receipt-${payload.transactionId}` }
        : undefined;

    const { error } = await resend.emails.send(email, sendOptions);
    if (error) {
      console.error("Resend email failed:", error);
      respond(res, 502, { success: false, error: "Email could not be sent" });
      return;
    }

    respond(res, 200, { success: true });
  } catch (error) {
    console.error("Email endpoint failed:", error);
    respond(res, 500, { success: false, error: "Internal server error" });
  }
}
