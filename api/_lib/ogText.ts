/**
 * Query-string text for the generated Open Graph card (`api/og.tsx`).
 *
 * The card is laid out from `?title=`/`?tagline=`/`?category=`/`?pricing=`, so
 * every value is caller-controlled: a link to
 * `https://…/api/og?title=<a few hundred kB of text>` - or one carrying newlines
 * and control characters - used to be handed verbatim to satori, which is a free
 * CPU/memory amplifier for anyone who can get that URL in front of a scraper.
 *
 * The limits live here rather than inline because they are the contract between
 * the card and the tags `src/lib/toolOgMetadata.ts` writes: the image must stay
 * truthful about the listing, and it must never render an empty string where the
 * site's own copy belongs.
 */

/** Maximum characters rendered per card field. */
export const OG_TEXT_LIMITS = {
  title: 120,
  tagline: 160,
  category: 40,
  pricing: 20,
} as const;

/** C0/C1 controls, which have no business on a canvas. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const WHITESPACE_RUN = /\s+/g;

/**
 * One single-line, length-capped card field, or `fallback` when the caller
 * supplied nothing usable.
 *
 * Truncation keeps the ellipsis inside `maxLength`, so a capped field and an
 * uncapped one always fit the same box.
 */
export function ogText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;

  const cleaned = value.replace(CONTROL_CHARACTERS, " ").replace(WHITESPACE_RUN, " ").trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= maxLength) return cleaned;

  const room = Math.max(0, maxLength - 3);
  return `${cleaned.slice(0, room).trimEnd()}...`;
}
