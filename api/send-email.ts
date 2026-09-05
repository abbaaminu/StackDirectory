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

type EmailPayload = NewOfferPayload | AppApprovedPayload;

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
  if (!isRecord(value) || (value.type !== "NEW_OFFER" && value.type !== "APP_APPROVED")) {
    return false;
  }

  const requiredStrings = value.type === "NEW_OFFER"
    ? ["toolName", "ownerEmail", "message", "toolSlug"]
    : ["toolName", "submitterEmail", "toolSlug"];

  return requiredStrings.every((key) => typeof value[key] === "string" && value[key].trim()) &&
    (value.type === "APP_APPROVED" || (typeof value.offerAmount === "number" && Number.isFinite(value.offerAmount)));
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
    const listingUrl = `https://apps.stackbuildco.com/?tool=${encodeURIComponent(payload.toolSlug)}`;
    const email = payload.type === "NEW_OFFER"
      ? {
          from,
          to: payload.ownerEmail,
          subject: `New offer for ${payload.toolName}`,
          html: `<h2>New offer received</h2><p><strong>${escapeHtml(payload.toolName)}</strong> received a new acquisition offer.</p><p><strong>Offer amount:</strong> $${payload.offerAmount.toLocaleString("en-US")}</p><p><strong>Message:</strong> ${escapeHtml(payload.message) || "No message provided."}</p><p><a href="${listingUrl}">Open the deal room</a></p>`,
        }
      : {
          from,
          to: payload.submitterEmail,
          subject: `${payload.toolName} is now live on StackDirectory`,
          html: `<h2>Your app has been approved!</h2><p>Congratulations, <strong>${escapeHtml(payload.toolName)}</strong> is now live on StackDirectory.</p><p><a href="${listingUrl}">View your live listing</a></p>`,
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
