import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { IncomingMessage, ServerResponse } from "http";
import { syncResendAudienceContact } from "./_lib/resendAudience";

/**
 * Admin moderation endpoint — Vercel Serverless Function
 *
 * Endpoint: POST /api/admin-tools
 * Body:     { action: "list" } or { action: AdminToolAction, toolId: string }
 * Headers:  Authorization: Bearer <Supabase access token>
 *
 * Why this exists
 * ---------------
 * The review queue mutated `public.tools` straight from the browser with the
 * anon key. Row Level Security protects that table for anonymous clients, and
 * PostgREST reports "0 rows matched" *without* an error, so the trash button
 * looked like it deleted a listing while the row stayed in Supabase.
 *
 * This function:
 *   1. requires the caller's Supabase access token and resolves the user,
 *   2. re-checks the admin allow-list / `app_metadata.role` server-side, and
 *   3. reads the admin queue or applies a mutation with
 *      SUPABASE_SERVICE_ROLE_KEY (RLS bypassed).
 *
 * Secrets are read from `process.env` only and never reach the browser.
 */

type AdminRequest = IncomingMessage & {
  body?: unknown;
};

/**
 * Mirrors the union in src/lib/adminTools.ts (kept in sync by
 * scripts/verify.tsx, which exercises both).
 */
type AdminToolAction =
  | "list"
  | "approve"
  | "reject"
  | "delete"
  | "feature"
  | "unfeature"
  | "for_sale"
  | "unlist";

const ADMIN_ACTIONS: readonly AdminToolAction[] = [
  "list",
  "approve",
  "reject",
  "delete",
  "feature",
  "unfeature",
  "for_sale",
  "unlist",
];

const COLUMNS = "id, name, is_approved, is_featured, status";

const isAdminAction = (value: unknown): value is AdminToolAction =>
  typeof value === "string" && (ADMIN_ACTIONS as readonly string[]).includes(value);

/**
 * Row changes per action. `approve`/`reject` keep `is_approved` and `status` in
 * agreement because `tools.status` is constrained to pending | approved |
 * rejected (writing anything else is rejected by the database).
 */
function changesForAction(action: AdminToolAction): Record<string, unknown> | null {
  switch (action) {
    case "approve":
      return { is_approved: true, status: "approved" };
    case "reject":
      return { is_approved: false, status: "rejected" };
    case "feature":
      return { is_featured: true };
    case "unfeature":
      return { is_featured: false };
    case "for_sale":
      return { is_for_sale: true };
    case "unlist":
      return { is_for_sale: false };
    case "delete":
      return null;
  }
}

/**
 * Server-side admin allow-list. The public `VITE_` names are accepted as well
 * so a single deployment variable can serve both runtimes.
 */
function getAdminEmails(): string[] {
  return Array.from(
    new Set(
      [
        ...(process.env.ADMIN_EMAILS ?? "").split(","),
        ...(process.env.VITE_ADMIN_EMAILS ?? "").split(","),
        process.env.ADMIN_EMAIL ?? "",
        process.env.VITE_ADMIN_EMAIL ?? "",
      ]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isAdminUser(user: { email?: string | null; app_metadata?: unknown } | null): boolean {
  if (!user) return false;
  // `app_metadata` is server-issued and cannot be self-granted.
  const metadata = user.app_metadata as { role?: unknown } | null | undefined;
  if (metadata?.role === "admin") return true;
  return Boolean(
    user.email && getAdminEmails().includes(user.email.trim().toLowerCase()),
  );
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

function respond(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Reads the bearer token from the Authorization header. */
function readBearerToken(req: AdminRequest): string {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : "";
}

/** Rows a PostgREST mutation actually touched (`.select()` echoes them). */
function countRows(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data ? 1 : 0;
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

async function sendApprovalNotification(tool: {
  id: string;
  name: string;
  seller_contact?: unknown;
}): Promise<void> {
  const submitterEmail =
    typeof tool.seller_contact === "string" ? tool.seller_contact.trim() : "";
  if (!submitterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
    console.error(
      `[Admin Tools] Approval email skipped for listing ${tool.id}: submitter email is missing or invalid.`,
    );
    return;
  }

  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!from) throw new Error("RESEND_FROM_EMAIL is not configured.");

    const toolSlug =
      tool.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      tool.id;
    const listingUrl = `https://apps.stackbuildco.com/?tool=${encodeURIComponent(toolSlug)}`;
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: submitterEmail,
      subject: `${tool.name} is now live on StackDirectory`,
      html:
        `<h2>Your app has been approved!</h2>` +
        `<p>Congratulations, <strong>${escapeHtml(tool.name)}</strong> is now live on StackDirectory.</p>` +
        `<p><a href="${listingUrl}">View your live listing</a></p>`,
    });
    if (error) {
      console.error("[Admin Tools] Approval email delivery failed:", error);
    }
  } catch (emailError) {
    console.error("[Admin Tools] Approval email delivery failed:", emailError);
  }
}

export default async function handler(req: AdminRequest, res: ServerResponse) {
  if (req.method !== "POST") {
    respond(res, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const rawBody = typeof req.body === "string" ? req.body : await collectBody(req);
    let payload: { action?: unknown; toolId?: unknown };
    try {
      payload =
        req.body && typeof req.body === "object"
          ? (req.body as { action?: unknown; toolId?: unknown })
          : (JSON.parse(rawBody || "{}") as { action?: unknown; toolId?: unknown });
    } catch {
      respond(res, 400, { success: false, error: "Invalid JSON body." });
      return;
    }

    const action = payload.action;
    const toolId = typeof payload.toolId === "string" ? payload.toolId.trim() : "";

    if (!isAdminAction(action)) {
      respond(res, 400, { success: false, error: "Unknown admin action." });
      return;
    }
    if (action !== "list" && !toolId) {
      respond(res, 400, { success: false, error: "Missing toolId." });
      return;
    }

    const supabaseUrl =
      process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "[Admin Tools] Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL (or VITE_SUPABASE_URL) environment variables.",
      );
      respond(res, 500, {
        success: false,
        error:
          "Server is not configured for admin writes. Set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL) in Vercel.",
      });
      return;
    }

    const accessToken = readBearerToken(req);
    if (!accessToken) {
      respond(res, 401, {
        success: false,
        error: "Missing Supabase access token. Sign in as an administrator.",
      });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the caller's JWT against Supabase itself: a forged or expired
    // token is rejected here, before any write happens.
    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !userData?.user) {
      respond(res, 401, {
        success: false,
        error: "Invalid or expired session. Sign in again as an administrator.",
      });
      return;
    }

    if (!isAdminUser(userData.user)) {
      respond(res, 403, {
        success: false,
        error:
          "This account is not an administrator. Add it to ADMIN_EMAILS (or grant the `admin` app_metadata role).",
      });
      return;
    }

    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("tools")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[Admin Tools] Queue fetch failed:", error.message);
        respond(res, 500, { success: false, error: "Supabase rejected the queue request." });
        return;
      }
      respond(res, 200, { success: true, tools: data ?? [] });
      return;
    }

    const changes = changesForAction(action);

    if (!changes) {
      const { data: deletedRows, error } = await supabaseAdmin
        .from("tools")
        .delete()
        .eq("id", toolId)
        .select(COLUMNS);

      if (error) {
        console.error("[Admin Tools] Delete failed:", error.message);
        const invalidId = (error as { code?: string }).code === "22P02";
        respond(res, invalidId ? 400 : 500, {
          success: false,
          error: invalidId
            ? "That listing id is not a valid Supabase uuid, so it cannot be deleted."
            : "Supabase rejected the delete.",
        });
        return;
      }

      const affected = countRows(deletedRows);
      if (affected === 0) {
        respond(res, 404, {
          success: false,
          error: "No listing matched that id, so nothing was deleted.",
        });
        return;
      }

      console.log(`[Admin Tools] Deleted listing ${toolId} as ${userData.user.email}.`);
      respond(res, 200, { success: true, action, toolId, affected });
      return;
    }

    const { data: updatedRows, error } = await supabaseAdmin
      .from("tools")
      .update(changes as never)
      .eq("id", toolId)
      .select(action === "approve" ? `${COLUMNS}, seller_contact` : COLUMNS);

    if (error) {
      console.error(`[Admin Tools] ${action} failed:`, error.message);
      respond(res, 500, { success: false, error: "Supabase rejected the update." });
      return;
    }

    const affected = countRows(updatedRows);
    if (affected === 0) {
      respond(res, 404, {
        success: false,
        error: "No listing matched that id, so nothing was changed.",
      });
      return;
    }

    if (action === "approve" && Array.isArray(updatedRows)) {
      const approvedTool = updatedRows[0] as {
        id?: unknown;
        name?: unknown;
        seller_contact?: unknown;
      };
      if (typeof approvedTool.name === "string" && typeof approvedTool.id === "string") {
        await Promise.all([
          sendApprovalNotification({
            id: approvedTool.id,
            name: approvedTool.name,
            seller_contact: approvedTool.seller_contact,
          }),
          syncResendAudienceContact(
            typeof approvedTool.seller_contact === "string"
              ? approvedTool.seller_contact
              : "",
            approvedTool.name,
          ),
        ]);
      }
    }

    respond(res, 200, { success: true, action, toolId, affected });
  } catch (err) {
    console.error("[Admin Tools] Handler error:", err);
    respond(res, 500, {
      success: false,
      error: "Internal server error processing the admin request.",
    });
  }
}
