/**
 * Visitor-facing input validation, shared by the forms that collect an email.
 *
 * `AuthModal`, `SubmitModal` and `AcquisitionModal` each carried their own copy
 * of this pattern, which is how one of them ends up accepting what another
 * rejects. The server repeats the check (see `api/_lib/email.ts`) because a
 * client-side rule is a courtesy, never a control.
 */

/** Pragmatic single-line address check (no CR/LF, one `@`, dotted domain). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when `value` looks like an address worth sending mail to. */
export const isValidEmail = (value?: string | null): boolean =>
  typeof value === "string" && EMAIL_PATTERN.test(value.trim());
