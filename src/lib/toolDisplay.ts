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
