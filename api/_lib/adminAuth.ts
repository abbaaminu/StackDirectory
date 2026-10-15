import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { IncomingMessage } from "http";

/**
 * Server-side authorization helpers shared by the endpoints that must act with
 * the service-role key (`api/admin-tools.ts`) or that only an administrator may
 * trigger (`api/send-email.ts` → `APP_APPROVED`).
 *
 * One copy of the allow-list rule means a deployment cannot end up in the state
 * the admin queue was in before: the browser and the API disagreeing about who
 * is an administrator.
 *
 * The public `VITE_` names are accepted alongside the server-only ones so a
 * single deployment variable can serve both runtimes (the browser only uses it
 * to decide which controls to render - Row Level Security protects the data).
 */
export function getAdminEmails(): string[] {
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

/**
 * True for users whose email is allow-listed or whose `app_metadata.role` is
 * `"admin"` (server-issued metadata cannot be self-granted by a client).
 */
export function isAdminRecord(
  user: { email?: string | null; app_metadata?: unknown } | null | undefined,
): boolean {
  if (!user) return false;
  const metadata = user.app_metadata as { role?: unknown } | null | undefined;
  if (metadata?.role === "admin") return true;
  return Boolean(user.email && getAdminEmails().includes(user.email.trim().toLowerCase()));
}

/** Reads the bearer token from the `Authorization` header; `""` when absent. */
export function readBearerToken(req: Pick<IncomingMessage, "headers">): string {
  const header = req.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : "";
}

export type ServiceRoleConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

/**
 * Service-role credentials for the current deployment, or `null` when either
 * half is missing.
 *
 * Callers must validate *before* constructing the client: a client without the
 * service-role key falls back to the anon key, and PostgREST answers an
 * RLS-filtered write with "0 rows matched" and **no** error - the failure mode
 * that made the review queue look like it worked.
 */
export function readServiceRoleConfig(): ServiceRoleConfig | null {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

/** RLS-bypassing client. Throws (`Invalid supabaseUrl`) on a malformed URL. */
export function createServiceRoleClient(config: ServiceRoleConfig) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The concrete client type the factory returns.
 *
 * `ReturnType<typeof createClient>` is *not* interchangeable with this: that
 * helper is generic, so the bare `typeof` instantiates its type parameters with
 * their constraints instead of with the arguments actually used here.
 */
export type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Resolves the Supabase user behind an access token.
 *
 * `user: null` (with the server's reason in `error`) means the token is
 * missing, forged, expired or revoked - never trust the claims in the token
 * itself without this call.
 */
export async function resolveSessionUser(
  client: ServiceRoleClient,
  accessToken: string,
): Promise<{ user: User | null; error: string }> {
  const { data, error } = await client.auth.getUser(accessToken);
  return { user: data?.user ?? null, error: error?.message ?? "" };
}
