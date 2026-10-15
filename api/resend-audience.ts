import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "http";
import { syncResendAudienceContact } from "./_lib/resendAudience";

type AudienceRequest = IncomingMessage & { body?: unknown };

function respond(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBearerToken(req: AudienceRequest): string {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = value ? /^Bearer\s+(.+)$/i.exec(value.trim()) : null;
  return match?.[1].trim() ?? "";
}

async function readPayload(req: AudienceRequest): Promise<{ toolId?: unknown }> {
  if (req.body && typeof req.body === "object") {
    return req.body as { toolId?: unknown };
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}") as { toolId?: unknown };
  }
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_192) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as { toolId?: unknown });
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

/** Best-effort sync after a persisted submission; user data is read server-side. */
export default async function handler(req: AudienceRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    respond(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  let payload: { toolId?: unknown };
  try {
    payload = await readPayload(req);
  } catch (error) {
    respond(res, 400, {
      success: false,
      error: error instanceof Error ? error.message : "Invalid JSON body.",
    });
    return;
  }

  const toolId = typeof payload.toolId === "string" ? payload.toolId.trim() : "";
  if (!toolId) {
    respond(res, 400, { success: false, error: "Missing toolId." });
    return;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[Resend Audience] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    respond(res, 500, { success: false, error: "Submission verification is not configured." });
    return;
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    respond(res, 401, { success: false, error: "A valid session is required." });
    return;
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !userData?.user) {
      respond(res, 401, { success: false, error: "Invalid or expired session." });
      return;
    }

    const { data: tool, error: toolError } = await supabaseAdmin
      .from("tools")
      .select("id, name, seller_contact")
      .eq("id", toolId)
      .maybeSingle();
    if (toolError) {
      console.error("[Resend Audience] Could not verify submitted listing:", toolError.message);
      respond(res, 500, { success: false, error: "Could not verify the submitted listing." });
      return;
    }
    if (!tool) {
      respond(res, 404, { success: false, error: "Submitted listing was not found." });
      return;
    }

    const submitterEmail =
      typeof tool.seller_contact === "string" ? tool.seller_contact.trim() : "";
    if (!submitterEmail) {
      respond(res, 200, { success: true, synced: false });
      return;
    }

    const synced = await syncResendAudienceContact(submitterEmail, tool.name ?? "");
    respond(res, 200, { success: true, synced });
  } catch (error) {
    console.error("[Resend Audience] Submission sync failed:", error);
    respond(res, 500, { success: false, error: "Could not sync the submission contact." });
  }
}
