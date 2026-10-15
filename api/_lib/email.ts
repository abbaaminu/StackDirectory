/**
 * Email helpers shared by every serverless function that talks to Resend.
 *
 * `api/` deliberately does not import from `src/` (that would pull browser
 * modules into the Node runtime), so this is the single server-side copy of the
 * address/HTML rules. `api/send-email.ts`, `api/admin-tools.ts` and
 * `api/_lib/resendAudience.ts` all use it, which is what keeps them from
 * disagreeing about what a valid address looks like.
 */

/** Pragmatic single-line address check (no CR/LF, one `@`, dotted domain). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when `value` looks like a deliverable email address. */
export const isValidEmail = (value: unknown): value is string =>
  typeof value === "string" && EMAIL_PATTERN.test(value.trim());

/**
 * Value safe to place in a mail header (subject, reply-to, from).
 *
 * CR/LF are stripped rather than escaped: a header value is not HTML, and a
 * newline smuggled into a subject is how a mail-injection attack adds headers
 * (a second `Bcc:`/`From:` line) of its own. The length cap keeps a hostile
 * payload from bloating the request to Resend.
 */
export const sanitizeHeaderValue = (value: unknown, maxLength = 200): string =>
  (typeof value === "string" ? value : "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLength);

/** Escapes the five characters that can break out of HTML text/attributes. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
