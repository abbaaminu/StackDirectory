import type { Tool } from "../types/directory";
import { pendingToolDefaults } from "./supabase";

/**
 * RFC 4122 v4 UUID built from `crypto.getRandomValues` (available in every
 * browser, including non-secure origins, unlike `crypto.randomUUID`).
 */
const uuidV4 = (): string => {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Id assigned to a brand-new listing.
 *
 * The SAME value must be used twice: as `tools.id` in the insert and as
 * `custom_data.tool_id` in the Paddle checkout. The webhook upgrades the row
 * whose id matches the payload, so generating the id anywhere else (or letting
 * Postgres default the primary key) silently breaks the paid Featured flow.
 * `tools.id` is a uuid column, hence the uuid shape.
 */
export const createToolId = (): string => uuidV4();

/**
 * True when an insert failed only because that row already exists (`23505`).
 *
 * The paid flow needs this: SubmitModal inserts the listing when Paddle reports
 * `checkout.completed`, while api/paddle-webhook.ts creates the very same row
 * (`custom_data.tool_id`) when the buyer never returns to the tab. Whichever
 * wins the race, the customer ends up with their Featured listing — so a
 * duplicate-key error on the paid path means "already handled", not "failed".
 * (The webhook keeps its own copy: `api/` must not import this module, which
 * pulls in the browser Supabase client.)
 */
export const isDuplicateRowError = (
  error: { code?: string; message?: string } | null | undefined,
): boolean => {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
};

/**
 * Every column a browser submission may send to `public.tools`.
 *
 * This list is the contract with the *deployed* Supabase table, verified against
 * `/rest/v1/tools`: the live schema also carries `mrr`, `user_id` and
 * `click_count`, but a submission never sets them.
 *
 * It deliberately has **no `icon_url`**. The live table has never had that
 * column, so sending it made PostgREST reject the entire insert with
 * `42703 column tools.icon_url does not exist`. Icons are derived from
 * `website_url` in the UI instead, with a Google favicon and brand-colored
 * initial fallback.
 *
 * `scripts/verify.tsx` asserts `buildToolInsertRow` never grows a key outside
 * this list, so future column drift fails loudly instead of silently.
 */
export const TOOL_INSERT_COLUMNS = [
  "id",
  "name",
  "tagline",
  "description",
  "website_url",
  "pricing_type",
  "category",
  "upvotes",
  "status",
  "is_approved",
  "is_featured",
  "paddle_customer_id",
  "is_for_sale",
  "asking_price",
  "monthly_revenue",
  "monthly_profit",
  "seller_contact",
  "tech_stack",
] as const;

/**
 * True when a write was rejected because it referenced a column the live table
 * does not have.
 *
 * `42703` is Postgres' "undefined column"; `PGRST204` is PostgREST's schema-cache
 * variant ("Could not find the 'x' column ... in the schema cache"). Both mean
 * the deployed schema and the code have drifted apart — exactly the class of bug
 * that silently emptied the review queue, so the caller can explain it instead
 * of guessing.
 */
export const isUnknownColumnError = (
  error: { code?: string; message?: string } | null | undefined,
): boolean => {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|could not find the .* column|schema cache/i.test(error.message ?? "")
  );
};

/**
 * Visitor-facing reason for a rejected submission, shared by the toast and the
 * inline error in SubmitModal so the two can never disagree.
 *
 * Kept pure (no Supabase/React imports) so the suite can pin the wording: a
 * rejected insert must never read like something that made it into the queue.
 */
export const submissionRejectionReason = (
  error: { code?: string; message?: string } | null | undefined,
): string => {
  const message = error?.message?.trim() || "Supabase rejected the submission.";
  return isUnknownColumnError(error)
    ? `The submitted columns do not match the deployed Supabase schema (${message})`
    : message;
};

/**
 * `public.tools` row for a new submission: explicit id (see `createToolId`),
 * moderation defaults, and the marketplace columns the schema requires.
 *
 * `is_approved` / `is_featured` stay false (see `pendingToolDefaults`) so the row
 * satisfies the "Anyone can submit a tool" RLS policy —
 * `WITH CHECK (is_approved = FALSE AND is_featured = FALSE)` — and lands in the
 * moderation queue instead of the public directory.
 *
 * Only columns from `TOOL_INSERT_COLUMNS` may appear here: one unknown column
 * fails the whole insert.
 */
export const buildToolInsertRow = (tool: Tool) => ({
  id: tool.id,
  name: tool.name,
  tagline: tool.tagline,
  description: tool.description,
  website_url: tool.website_url,
  pricing_type: tool.pricing_type,
  category: tool.category,
  upvotes: tool.upvotes ?? 0,
  ...pendingToolDefaults,
  is_featured: tool.is_featured ?? false,
  paddle_customer_id: tool.paddle_customer_id ?? null,
  is_for_sale: tool.is_for_sale ?? false,
  asking_price: tool.asking_price ?? null,
  monthly_revenue: tool.monthly_revenue ?? 0,
  monthly_profit: tool.monthly_profit ?? 0,
  seller_contact: tool.seller_contact ?? null,
  tech_stack: tool.tech_stack ?? [],
});
