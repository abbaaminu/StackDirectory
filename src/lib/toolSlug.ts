import type { Tool } from "../types/directory";

/**
 * Canonical `?tool=` slug for a listing ("Warp Terminal" → "warp-terminal").
 *
 * Used for deep links (`?tool=…`), share URLs, OG metadata and admin emails.
 * Falls back to the row id when the name contains no alphanumerics, which also
 * keeps legacy id-based links (`?tool=tool_warp_04`) resolvable.
 */
export const getToolSlug = (tool: Pick<Tool, "name" | "id">): string =>
  tool.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
  tool.id;
