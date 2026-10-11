import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "http";

type WebhookRequest = IncomingMessage & {
  body?: unknown;
};

/**
 * Paddle Webhook Handler — Vercel Serverless Function
 *
 * Endpoint: POST /api/paddle-webhook
 *
 * On a `transaction.completed` event, reads `custom_data.tool_id` (or the
 * top-level `tool_id`) passed at checkout time and upgrades that tool in
 * Supabase to `is_approved = true` and `is_featured = true`.
 *
 * Once the listing is live it also triggers an instant Resend confirmation
 * receipt (POST /api/send-email with `type: "PAYMENT_RECEIPT"`) containing the
 * payment receipt and the submission details for the listing the buyer paid to
 * promote. Email delivery is best-effort: a receipt failure is logged and
 * reported as `emailSent: false`, but never fails the webhook response, so
 * Paddle does not re-deliver a transaction that was already upgraded.
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

/** Absolute base URL of this deployment, used to call our own /api/send-email. */
function resolveBaseUrl(req: WebhookRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
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
    // Vercel may provide a parsed body; fall back to reading the raw stream.
    const payload: PaddleWebhookPayload =
      req.body && typeof req.body === "object"
        ? (req.body as PaddleWebhookPayload)
        : JSON.parse((await collectBody(req)) || "{}");

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
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "[Paddle Webhook] Missing SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL environment variables.",
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

    // 5. Update the tool: approve + feature it (bypasses RLS via service role).
    //    `.select(...)` echoes the updated row so the receipt can quote the real
    //    submission details without a second query.
    const { data: updatedRows, error } = await supabaseAdmin
      .from("tools")
      .update({
        is_approved: true,
        is_featured: true,
        status: "active",
      } as never)
      .eq("id", toolId.trim())
      .select("id, name, category, pricing_type, website_url");

    if (error) {
      console.error("[Paddle Webhook] Database update failed:", error.message);
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

    const updatedTool = (Array.isArray(updatedRows) ? updatedRows[0] : updatedRows) as
      | PaddleToolRow
      | null
      | undefined;

    if (updatedTool) {
      console.log(
        `[Paddle Webhook] Successfully upgraded tool "${updatedTool.name ?? toolId}" to Featured & Approved.`,
      );
    } else {
      console.warn(
        `[Paddle Webhook] No tool row matched id "${toolId.trim()}" — nothing was upgraded.`,
      );
    }

    // 6. Trigger the instant Resend confirmation receipt for the buyer.
    //    Best-effort: the payment already succeeded and the listing is already
    //    live, so email problems must never fail the webhook response.
    const customerEmail =
      data?.customer?.email?.trim() || customData.customer_email?.trim() || "";
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
      updatedTool?.name?.trim() ||
      (typeof customData.tool_name === "string" ? customData.tool_name.trim() : "");

    const receiptToolName = knownToolName || "Your StackDirectory listing";

    const slugSource =
      (typeof customData.tool_slug === "string" ? customData.tool_slug.trim() : "") ||
      knownToolName ||
      updatedTool?.id ||
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
            transactionId: typeof data?.id === "string" ? data.id : "unknown",
            orderNumber: typeof data?.invoice_number === "string" ? data.invoice_number : "",
            itemDescription: data?.items?.[0]?.price?.description ?? "",
            planLabel: RECEIPT_PLAN_LABEL,
            category: updatedTool?.category ?? "",
            pricingType: updatedTool?.pricing_type ?? "",
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

    // 7. Return success JSON
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, emailSent }));
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
