/**
 * Client wrapper around `POST /api/admin-tools`.
 *
 * The review queue used to write to `public.tools` with the browser anon key.
 * Row Level Security protects that table for anonymous clients, so
 * `.delete()`/`.update()` matched zero rows **without** returning an error: the
 * trash icon appeared to work while the row stayed in Supabase. Admin mutations
 * now go through a serverless function that verifies the caller's Supabase
 * session, re-checks the admin allow-list and performs the write with the
 * service-role key (see api/admin-tools.ts).
 *
 * The access token is passed in explicitly (instead of being read from the
 * Supabase client here) so this module stays a pure `fetch` caller and can be
 * unit tested with a stubbed network.
 */
import type { Tool } from "../types/directory";

export type AdminToolAction =
  | "list"
  | "approve"
  | "reject"
  | "delete"
  | "feature"
  | "unfeature"
  | "for_sale"
  | "unlist";

export type AdminActionResult = {
  /** The server confirmed the mutation. */
  ok: boolean;
  /** Rows the server actually touched; `0` means nothing matched. */
  affected: number;
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Human-readable failure reason, ready to show in the queue. */
  error?: string;
};

/** URL of the admin mutation endpoint (Vercel Serverless Function). */
export const ADMIN_TOOLS_ENDPOINT = "/api/admin-tools";

export type AdminToolsListResult = {
  ok: boolean;
  tools: Tool[];
  status: number;
  error?: string;
};

/** Loads admin-visible listings through the authenticated service-role route. */
export const callAdminToolsList = async (
  accessToken: string,
): Promise<AdminToolsListResult> => {
  if (!accessToken?.trim()) {
    return {
      ok: false,
      tools: [],
      status: 401,
      error: "Sign in as an administrator and try again.",
    };
  }

  try {
    const response = await fetch(ADMIN_TOOLS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: "list" }),
    });
    const result = (await response.json().catch(() => null)) as
      | { success?: boolean; tools?: Tool[]; error?: string }
      | null;
    if (!response.ok || result?.success !== true || !Array.isArray(result.tools)) {
      return {
        ok: false,
        tools: [],
        status: response.status,
        error: result?.error ?? `The admin API rejected the request (HTTP ${response.status}).`,
      };
    }
    return { ok: true, tools: result.tools, status: response.status };
  } catch (error) {
    return {
      ok: false,
      tools: [],
      status: 0,
      error: error instanceof Error ? error.message : "The admin API could not be reached.",
    };
  }
};

/**
 * True when the failure is "the endpoint is missing or misconfigured" (no
 * deployment, no service-role key) rather than a decision by the server. Only
 * then may a caller fall back to a direct client-side write.
 */
export const isAdminApiUnavailable = (result: AdminActionResult): boolean =>
  result.status === 0 || result.status >= 500;

/**
 * Runs an admin action against a listing. Never throws: every failure — offline,
 * 401/403, missing service-role key, row not found — is reported as a result so
 * the queue can show the operator what actually happened.
 */
export const callAdminToolAction = async (
  action: AdminToolAction,
  toolId: string,
  accessToken: string,
): Promise<AdminActionResult> => {
  const id = toolId?.trim() ?? "";
  if (!id) {
    return { ok: false, affected: 0, status: 400, error: "Missing listing id." };
  }
  if (!accessToken?.trim()) {
    return {
      ok: false,
      affected: 0,
      status: 401,
      error: "Sign in as an administrator and try again.",
    };
  }

  try {
    const response = await fetch(ADMIN_TOOLS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      body: JSON.stringify({ action, toolId: id }),
    });

    const result = (await response.json().catch(() => null)) as
      | { success?: boolean; affected?: number; error?: string }
      | null;

    if (!response.ok || result?.success === false) {
      return {
        ok: false,
        affected: 0,
        status: response.status,
        error:
          result?.error ??
          `The admin API rejected the request (HTTP ${response.status}).`,
      };
    }

    return {
      ok: true,
      affected: typeof result?.affected === "number" ? result.affected : 1,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      affected: 0,
      status: 0,
      error:
        error instanceof Error
          ? error.message
          : "The admin API could not be reached.",
    };
  }
};
