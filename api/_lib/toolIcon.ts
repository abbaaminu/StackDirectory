/**
 * Pure helpers behind `/api/favicon`.
 *
 * Kept free of `node:` imports and of the network so the whole decision surface -
 * which domain is acceptable, which `<link rel="icon">` wins, what the generated
 * avatar looks like - is unit-testable in `scripts/verify.tsx` without a stubbed
 * `fetch`.
 */

/** Rendered size of the *generated* avatar (real icons are forwarded untouched). */
export const DEFAULT_ICON_SIZE = 64;

/** Ceiling for `?size=`, so a caller cannot ask for a 20 000px canvas. */
export const MAX_ICON_SIZE = 256;

/** Smallest useful size; below this the letter stops being legible. */
export const MIN_ICON_SIZE = 16;

/**
 * Clamps `?size=` / `?sz=` to a sane icon size.
 *
 * Anything unparseable falls back to `DEFAULT_ICON_SIZE` rather than propagating
 * `NaN` into the SVG's `width` attribute (which browsers drop, leaving an
 * unsized image).
 */
export function pickIconSize(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_ICON_SIZE;
  return Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, parsed));
}

/** Local suffixes that never name a public website. */
const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

/** A bare dotted IPv4 literal, which is never a hostname we should fetch. */
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Allowed characters in a hostname after lower-casing (no `%`, `_` or IDN bytes). */
const HOSTNAME_CHARS = /^[a-z0-9.-]+$/;

/** One DNS label: alphanumeric at both ends, hyphens only inside. */
const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Hostname from the `?domain=` parameter, or `null` when it is not a plausible
 * public host.
 *
 * This is a *shape* check - the DNS/private-address check happens per hop in
 * `resolvePublicUrl` (api/_lib/publicUrl.ts). Rejecting here is still worth it:
 * anything with a scheme, path, port, credential pair or percent-encoding is a
 * caller error, and `localhost`/`*.local`/`*.internal`/IP literals are the first
 * things an SSRF attempt reaches for. Rejecting them means the endpoint answers
 * its generated avatar instead of making a request we would have to police.
 */
export function normalizeIconDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (!host.includes(".")) return null;
  if (!HOSTNAME_CHARS.test(host)) return null;
  // Every dot-separated label must be a legal DNS label, which rejects
  // ".warp.dev", "warp..dev" and "-warp.dev" in one rule rather than three.
  if (host.split(".").some((label) => !HOSTNAME_LABEL.test(label))) return null;
  if (host === "localhost" || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  if (IPV4_LITERAL.test(host)) return null;
  // A port or an IPv6 literal always carries a colon, which `HOSTNAME_CHARS`
  // already rejects; this is the belt to that braces.
  if (host.includes(":")) return null;
  return host;
}

/** `image/*` message types only - never `text/html` or `application/octet-stream`. */
const IMAGE_CONTENT_TYPE = /^image\/[a-z0-9][a-z0-9.+-]*\s*(?:;\s*charset=[\w-]+)?$/i;

/**
 * True when an upstream `Content-Type` actually is an image.
 *
 * This is the check that makes the endpoint usable at all: a SPA host (Vercel's
 * catch-all rewrite does this) answers `/favicon.ico` with `200 text/html` and a
 * copy of `index.html`, so status alone would forward an HTML document as an
 * image and every card would render a broken image again.
 */
export function isImageContentType(value: string | null | undefined): boolean {
  return IMAGE_CONTENT_TYPE.test((value ?? "").trim());
}

/** `image/png; charset=utf-8` -> `image/png` (SVG keeps a charset for safety). */
export function normalizeContentType(value: string): string {
  const [type] = value.split(";");
  const normalized = type.trim().toLowerCase();
  return normalized === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : normalized;
}

const LINK_TAG = /<link\b[^>]*>/gi;
const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

/** Attribute map for a single tag, lower-cased keys. */
function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), (match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return attributes;
}

/** Longest `href` accepted from a page - longer is a payload, not an icon. */
const MAX_ICON_HREF = 2_048;

/**
 * Icon URL declared by a page, resolved against the page URL, or `null`.
 *
 * `rel="icon"` (and `shortcut icon`) wins over `apple-touch-icon`: the former is
 * the tab icon the site chose, the latter is a 180x180 home-screen tile.
 * `data:` hrefs are ignored on purpose - they cannot be cached, and forwarding a
 * caller's inline SVG through our own origin is a stored-XSS shape we do not
 * need.
 */
export function extractIconHref(html: string, pageUrl: string | URL): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }

  const candidates: Array<{ href: string; rank: number }> = [];
  for (const tag of html.match(LINK_TAG) ?? []) {
    const attributes = parseAttributes(tag);
    const rel = (attributes.get("rel") ?? "").toLowerCase();
    const href = attributes.get("href") ?? "";
    if (!href || href.length > MAX_ICON_HREF) continue;

    const isAppleTouch = /(^|\s)apple-touch-icon(-precomposed)?(\s|$)/.test(rel);
    const isIcon = /(^|\s)(shortcut\s+)?icon(\s|$)/.test(rel);
    if (!isAppleTouch && !isIcon) continue;

    try {
      const resolved = new URL(href, base);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      candidates.push({ href: resolved.toString(), rank: isAppleTouch ? 1 : 0 });
    } catch {
      // A malformed href must not stop the next candidate from being considered.
    }
  }

  candidates.sort((left, right) => left.rank - right.rank);
  return candidates[0]?.href ?? null;
}

/** Brand palette pairs (start, end) matching the listing cards' own gradients. */
const AVATAR_COLORS: ReadonlyArray<readonly [string, string]> = [
  ["#059669", "#0f766e"],
  ["#d97706", "#b45309"],
  ["#0284c7", "#4338ca"],
  ["#7c3aed", "#be185d"],
  ["#0f172a", "#334155"],
];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** XML-escapes a value before it reaches the SVG. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** One upper-case character for the avatar, from a domain or a listing name. */
export function iconLabel(value: string): string {
  const character = value.trim().replace(/^www\./i, "").charAt(0);
  return (character || "?").toUpperCase();
}

/** Stable palette index for a label, so one domain always gets one colour. */
function avatarColorIndex(value: string): number {
  let hash = 0;
  for (const character of value.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1_000_003;
  }
  return hash % AVATAR_COLORS.length;
}

/**
 * The generated stand-in icon: a brand-coloured disc with the domain's letter.
 *
 * This is what makes the endpoint's promise ("always a 200 image") true. A
 * domain with no usable favicon - an unregistered subdomain, a parked host, a
 * site behind a proxy - previously produced a third-party 404 in the browser
 * console and, on the cards, an empty circle.
 */
export function avatarSvg(label: string, size: number = DEFAULT_ICON_SIZE): string {
  const initial = escapeXml(iconLabel(label));
  const [from, to] = AVATAR_COLORS[avatarColorIndex(label)];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" ` +
    `role="img" aria-label="${escapeXml(label)} icon">` +
    `<defs><linearGradient id="icon" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="128" height="128" rx="64" fill="url(#icon)"/>` +
    `<text x="64" y="85" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" ` +
    `font-size="64" font-weight="700" fill="#ffffff">${initial}</text></svg>`
  );
}
