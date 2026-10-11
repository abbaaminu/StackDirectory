import { Resend } from "resend";
import type { IncomingMessage, ServerResponse } from "http";

type EmailRequest = IncomingMessage & {
  body?: unknown;
};

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

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
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
    res.statusCode = 405;
    res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
    return;
  }

  try {
    const payload = req.body && typeof req.body === "object"
      ? req.body
      : JSON.parse((await collectBody(req)) || "{}");

    if (!isEmailPayload(payload)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, error: "Invalid email payload" }));
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || "StackDirectory <onboarding@resend.dev>";
    if (!apiKey) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: "RESEND_API_KEY is not configured" }));
      return;
    }

    const resend = new Resend(apiKey);
    const listingUrl = payload.type === "NEW_OFFER" || payload.type === "APP_APPROVED"
      ? `https://apps.stackbuildco.com/?tool=${encodeURIComponent(payload.toolSlug)}`
      : "";
    const email = payload.type === "NEW_OFFER"
      ? {
          from,
          to: payload.ownerEmail,
          subject: `New offer for ${payload.toolName}`,
          html: `<h2>New offer received</h2><p><strong>${escapeHtml(payload.toolName)}</strong> received a new acquisition offer.</p><p><strong>Offer amount:</strong> $${payload.offerAmount.toLocaleString("en-US")}</p><p><strong>Message:</strong> ${escapeHtml(payload.message) || "No message provided."}</p><p><a href="${listingUrl}">Open the deal room</a></p>`,
        }
      : payload.type === "APP_APPROVED"
        ? {
          from,
          to: payload.submitterEmail,
          subject: `${payload.toolName} is now live on StackDirectory`,
          html: `<h2>Your app has been approved!</h2><p>Congratulations, <strong>${escapeHtml(payload.toolName)}</strong> is now live on StackDirectory.</p><p><a href="${listingUrl}">View your live listing</a></p>`,
          }
        : payload.type === "PAYMENT_RECEIPT"
          ? buildReceiptEmail(payload, from)
        : {
            from,
            to: "support@stackbuildco.com",
            reply_to: payload.senderEmail,
            subject: `[${payload.category}] Support message from ${payload.senderName}`,
            html: `<h2>New support message</h2><p><strong>From:</strong> ${escapeHtml(payload.senderName)} (${escapeHtml(payload.senderEmail)})</p><p><strong>Category:</strong> ${escapeHtml(payload.category)}</p><p><strong>Message:</strong></p><p>${escapeHtml(payload.message).replace(/\n/g, "<br />")}</p>`,
          };

    const { error } = await resend.emails.send(email);
    if (error) {
      console.error("Resend email failed:", error);
      res.statusCode = 502;
      res.end(JSON.stringify({ success: false, error: "Email could not be sent" }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("Email endpoint failed:", error);
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: "Internal server error" }));
  }
}
