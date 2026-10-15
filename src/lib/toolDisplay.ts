import type { PricingType } from "../types/directory";

/**
 * Small presentation helpers shared by the listing surfaces so the card, the
 * detail modal and the admin queue cannot drift apart.
 */

/** Hostname of a listing URL, or `null` when the URL cannot be parsed. */
export const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/**
 * Schemes that must never reach an `href` or an `<img src>`. Listing URLs are
 * user-supplied, so `javascript:` (or a `data:` payload) pasted into the
 * submission form would otherwise become a clickable, executable link.
 */
const BLOCKED_SCHEMES = ["javascript:", "data:", "vbscript:", "file:", "blob:", "about:"];

const HAS_SCHEME = /^https?:\/\//i;

/**
 * Absolute, safe http(s) URL for a listing link, or `null` when the value is
 * unusable.
 *
 * Bare hosts (`warp.dev`, `www.warp.dev/pricing`) are what people actually type
 * into the submission form, and Paddle's `custom_data.website_url` can carry
 * one too. Without this normalisation `<a href="warp.dev">` resolved against
 * the current page (a dead link) and the favicon lookup had nothing to parse.
 * A hostname must contain a dot, which also rejects the
 * `https://` + `javascript:alert(1)` smuggling trick.
 */
export const getSafeWebsiteUrl = (url?: string | null): string | null => {
  const value = (url ?? "").trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (BLOCKED_SCHEMES.some((scheme) => lower.startsWith(scheme))) return null;

  try {
    const parsed = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    // Reject embedded credentials: `https://user:pass@host` would hand a stored
    // secret to anyone who clicks the listing, and a `mailto:` value would be
    // silently rewritten into a credentialed https URL.
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

/** Hostname of a safe listing URL, or `null` when the URL cannot be used. */
export const getSafeHostname = (url?: string | null): string | null => {
  const safeUrl = getSafeWebsiteUrl(url);
  if (!safeUrl) return null;
  try {
    return new URL(safeUrl).hostname;
  } catch {
    return null;
  }
};

/**
 * Google favicon service URL for a listing, or `null` when the URL has no
 * usable domain.
 *
 * Centralised so the card, the detail modal and the submit form always request
 * the same icon: the previous inline copies drifted (some encoded the hostname,
 * some did not) and a `null` return lets a caller render an initials avatar
 * instead of a broken image.
 */
export const getFaviconUrl = (url?: string | null, size = 128): string | null => {
  const hostname = getSafeHostname(url);
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
};

/** Tailwind classes for the pricing badge rendered on listing cards. */
export const getPricingBadgeColor = (type: PricingType | string): string => {
  switch (type) {
    case "Free":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase";
    case "Freemium":
      return "bg-cyan-50 text-cyan-700 border border-cyan-200 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase";
    case "Open Source":
      return "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase";
    case "Paid":
      return "bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase";
  }
};
