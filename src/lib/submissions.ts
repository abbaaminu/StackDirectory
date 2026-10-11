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
 * `public.tools` row for a new submission: explicit id (see `createToolId`),
 * moderation defaults, and the marketplace columns the schema requires.
 */
export const buildToolInsertRow = (tool: Tool) => ({
  id: tool.id,
  name: tool.name,
  tagline: tool.tagline,
  description: tool.description,
  website_url: tool.website_url,
  icon_url: tool.icon_url ?? null,
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
