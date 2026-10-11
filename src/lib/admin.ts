import type { User } from "@supabase/supabase-js";

/**
 * Single source of truth for admin authorization.
 *
 * Before this module existed the header, the review queue and App each applied
 * a *different* rule (some read only `VITE_ADMIN_EMAIL`, others only
 * `VITE_ADMIN_EMAILS`, App also honoured `app_metadata.role`), so an operator
 * configured through the documented comma-separated allow-list could see the
 * "Admin Queue" button but get an "Admin access required" panel — or no button
 * at all. Every surface now calls the helpers below.
 *
 * The allow-list is client-exposed on purpose (Vite inlines `VITE_*` into the
 * bundle): it only decides which controls are rendered. Row-level security is
 * what actually protects the data.
 */

/** Parsed, lower-cased, de-duplicated admin allow-list. */
export const getAdminEmails = (): string[] =>
  Array.from(
    new Set(
      [
        ...(import.meta.env.VITE_ADMIN_EMAILS ?? "").split(","),
        import.meta.env.VITE_ADMIN_EMAIL ?? "",
      ]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

/** True when the given email address is in the configured allow-list. */
export const isAdminEmail = (email?: string | null): boolean =>
  Boolean(email && getAdminEmails().includes(email.trim().toLowerCase()));

/**
 * True for Supabase users whose email is allow-listed or whose
 * `app_metadata.role` is `"admin"` (server-issued, cannot be self-granted).
 */
export const isAdminUser = (user?: User | null): boolean =>
  Boolean(
    user && (user.app_metadata?.role === "admin" || isAdminEmail(user.email)),
  );
