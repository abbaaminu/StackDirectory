import { Resend } from "resend";
import type { IncomingMessage, ServerResponse } from "http";
import {
  createServiceRoleClient,
  isAdminRecord,
  readBearerToken,
  type ServiceRoleClient,
} from "./_lib/adminAuth";
import { escapeHtml } from "./_lib/email";
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
 * Actions that mutate a row's columns. `delete` and `list` are handled by their
 * own branches in the handler, so excluding them here makes the mapping
 * exhaustive: a new action added to `ADMIN_ACTIONS` stops compiling until it is
 * implemented, instead of falling out of this table and being mistaken for a
 * delete (the old `null` return meant "destroy the row").
 */
type UpdatableAdminAction = Exclude<AdminToolAction, "list" | "delete">;

/**
 * Row changes per action. `approve`/`reject` keep `is_approved` and `status` in
 * agreement because `tools.status` is constrained to pending | approved |
 * rejected (writing anything else is rejected by the database).
 */
function changesForAction(action: UpdatableAdminAction): Record<string, unknown> {
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
  }
}

/**
 * Server-side admin allow-list lives in `api/_lib/adminAuth.ts` so this route and
 * `api/send-email.ts` can never disagree about who may moderate. `app_metadata`
 * is server-issued and cannot be self-granted, which is why a role claim is
 * trusted alongside the configured email list.
 */

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
  // The queue carries unapproved submissions and the caller's role, so neither
  // the CDN nor the browser may cache a response.
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * `Error.message` for anything that was thrown, or "" when there is none.
 *
 * Used by the route's top-level catch: an unhandled lambda crash gives the admin
 * UI nothing to show, so the thrown message is surfaced as the JSON `error`.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "";
}

/** Reads the bearer token from the Authorization header (see `_lib/adminAuth`). */

/** Rows a PostgREST mutation actually touched (`.select()` echoes them). */
function countRows(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data ? 1 : 0;
}

/** HTML-escapes listing names in the approval mail (see `_lib/email`). */

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
  // The whole route is wrapped: a throw from Supabase, Resend, the body parser or
  // a missing environment variable must become a JSON 500 instead of an
  // unhandled lambda crash (which the admin UI can only render as "unavailable").
  try {
    if (req.method !== "POST") {
      respond(res, 405, { success: false, error: "Method not allowed" });
      return;
    }

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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

    // Validate the environment before the client is constructed: without the
    // service-role key the write silently fell through to RLS (PostgREST reports
    // "0 rows matched" *without* an error, so the queue looked like it worked).
    if (!serviceRoleKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      console.error(
        "[Admin Tools] Set SUPABASE_SERVICE_ROLE_KEY in Vercel -> Project Settings -> Environment Variables, then redeploy.",
      );
      respond(res, 500, {
        success: false,
        error:
          "Server is not configured for admin writes: SUPABASE_SERVICE_ROLE_KEY is missing. Set it in Vercel and redeploy.",
      });
      return;
    }

    if (!supabaseUrl) {
      console.error("[Admin Tools] Missing SUPABASE_URL (or VITE_SUPABASE_URL).");
      respond(res, 500, {
        success: false,
        error:
          "Server is not configured for admin writes: SUPABASE_URL (or VITE_SUPABASE_URL) is missing. Set it in Vercel and redeploy.",
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

    // `createClient` throws on a malformed URL ("Invalid supabaseUrl: ..."),
    // which is an environment misconfiguration rather than a client error, so it
    // is reported as such instead of bubbling up as a generic handler failure.
    let supabaseAdmin: ServiceRoleClient;
    try {
      supabaseAdmin = createServiceRoleClient({ supabaseUrl, serviceRoleKey });
    } catch (clientError) {
      console.error("[Admin Tools] Supabase admin client creation failed:", clientError);
      respond(res, 500, {
        success: false,
        error: `Server is not configured for admin writes: ${errorMessage(clientError)}`,
      });
      return;
    }

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

    if (!isAdminRecord(userData.user)) {
      respond(res, 403, {
        success: false,
        error:
          "This account is not an administrator. Add it to ADMIN_EMAILS (or grant the `admin` app_metadata role).",
      });
      return;
    }

    if (action === "list") {
      // Ordering the queue by `created_at` is only a nicety, but `public.tools`
      // is live and has already drifted from this code once (an unmapped column
      // made Postgres answer 42703 and killed the whole request). A row that
      // cannot be ordered is still a row an admin needs to moderate, so the
      // query is retried without the clause instead of 500-ing the queue.
      let { data, error } = await supabaseAdmin
        .from("tools")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn(
          "[Admin Tools] Ordered queue fetch failed, retrying unordered:",
          error.code ?? "",
          error.message,
        );
        ({ data, error } = await supabaseAdmin.from("tools").select("*"));
      }

      if (error) {
        console.error(
          "[Admin Tools] Queue fetch failed:",
          error.code ?? "",
          error.message,
        );
        respond(res, 500, {
          success: false,
          error: `Supabase rejected the queue request (${error.code ?? "unknown"}): ${error.message}`,
        });
        return;
      }
      respond(res, 200, { success: true, tools: data ?? [] });
      return;
    }

    // `delete` gets its own explicit branch so it can never be reached by
    // accident from the column mapping below (see `changesForAction`).
    if (action === "delete") {
      const { data: deletedRows, error } = await supabaseAdmin
        .from("tools")
        .delete()
        .eq("id", toolId)
        .select(COLUMNS);

      if (error) {
        console.error(
          "[Admin Tools] Delete failed:",
          error.code ?? "",
          error.message,
        );
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

    const changes = changesForAction(action);

    // Defensive: unreachable while `changesForAction` stays exhaustive, but an
    // action with no column mapping must be reported instead of writing
    // something the caller did not ask for.
    if (!changes) {
      console.error(
        `[Admin Tools] No column mapping for action "${action}" - refusing to write.`,
      );
      respond(res, 400, {
        success: false,
        error: `Unsupported admin action: ${action}.`,
      });
      return;
    }

    const updateErrorTag = "Supabase rejected the update.";
    const { data: updatedRows, error } = await supabaseAdmin
      .from("tools")
      .update(changes as never)
      .eq("id", toolId)
      .select(action === "approve" ? `${COLUMNS}, seller_contact` : COLUMNS);

    if (error) {
      console.error(
        `[Admin Tools] ${action} failed:`,
        error.code ?? "",
        error.message,
      );
      const invalidId = (error as { code?: string }).code === "22P02";
      respond(res, invalidId ? 400 : 500, {
        success: false,
        error: invalidId
          ? "That listing id is not a valid Supabase uuid, so it cannot be updated."
          : `${updateErrorTag} (${error.code ?? "unknown"}): ${error.message}`,
      });
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
        // `allSettled`, not `all`: the row has already been approved, so a
        // transient Resend failure must not turn a successful moderation action
        // into a 500 that pushes the admin to approve the listing twice.
        const [emailResult, audienceResult] = await Promise.allSettled([
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
        if (emailResult.status === "rejected") {
          console.error("[Admin Tools] Approval email rejected:", emailResult.reason);
        }
        if (audienceResult.status === "rejected") {
          console.error("[Admin Tools] Audience sync rejected:", audienceResult.reason);
        }
      }
    }

    respond(res, 200, { success: true, action, toolId, affected });
  } catch (error) {
    // Last line of defence: anything that escaped the checks above (a PostgREST
    // throw, a Resend network error, a malformed body) is answered as JSON so the
    // admin UI shows the reason instead of a crashed function. `headersSent` is
    // checked because a throw *after* `respond` cannot send a second status line.
    console.error("[Admin Tools] Handler error:", error);
    if (!res.headersSent) {
      respond(res, 500, {
        success: false,
        error: errorMessage(error) || "Internal server error",
      });
    }
  }
}
