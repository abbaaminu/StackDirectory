import React, { useState } from "react";
import {
  ChevronUp,
  Sparkles,
  ShoppingBag,
  Star,
  Heart,
} from "lucide-react";
import { Tool } from "../types/directory";

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

interface ToolCardProps {
  tool: Tool;
  onToggleUpvote: (toolId: string) => void;
  onOpenUpgradeForTool?: (tool: Tool) => void;
  onOpenAcquisition?: (tool: Tool) => void;
  onOpenDetails?: (tool: Tool) => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  onToggleUpvote,
  onOpenDetails,
}) => {
  const [isUpvoteAnimating, setIsUpvoteAnimating] = useState(false);
  const [logoSource, setLogoSource] = useState<"custom" | "horse" | "google" | "initial">(
    tool.icon_url ? "custom" : "horse",
  );

  // Compact, dynamic favicon logo (graceful 2-letter avatar fallback)
  const domain = getHostname(tool.website_url);
  const faviconFallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const logoSrc = logoSource === "custom" && tool.icon_url
    ? tool.icon_url
    : logoSource === "horse"
      ? `https://icon.horse/icon/${domain}`
      : faviconFallback;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUpvoteAnimating(true);
    onToggleUpvote(tool.id);
    setTimeout(() => setIsUpvoteAnimating(false), 300);
  };

  const getPricingBadgeColor = (type: string) => {
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

  return (
    <div
      id={`tool-card-${tool.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails?.(tool)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpenDetails?.(tool);
      }}
      className={`group relative bg-white border border-slate-200/80 hover:border-amber-400/90 shadow-xs hover:shadow-md rounded-2xl p-4 flex items-start gap-3.5 transition-all duration-200 ${
        tool.is_for_sale || tool.is_featured ? "border-amber-400/70" : ""
      }`}
    >
      {/* Badges / Ribbons on Top */}
      <div className="absolute -top-3 left-5 flex items-center gap-2 z-10">
        {tool.is_for_sale && (
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 text-zinc-950 shadow-md shadow-amber-500/30 tracking-wider">
            <ShoppingBag className="w-3 h-3 fill-zinc-950" />
            <span>FOR SALE</span>
          </div>
        )}

        {tool.is_featured && !tool.is_for_sale && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-linear-to-r from-amber-400 to-orange-400 text-zinc-950 shadow-md shadow-amber-500/20">
            <Sparkles className="w-3 h-3 fill-zinc-950" />
            <span>FEATURED APP</span>
          </div>
        )}
      </div>

      {/* Left Upvote Button (Product Hunt format) */}
      <button
        id={`btn-upvote-${tool.id}`}
        onClick={handleUpvote}
        className={`flex flex-col items-center justify-center w-12 h-14 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-600 transition-all shrink-0 cursor-pointer ${
          tool.user_has_upvoted ? "bg-amber-50 border-amber-300 text-amber-600" : ""
        } ${isUpvoteAnimating ? "scale-110" : ""}`}
        title={tool.user_has_upvoted ? "Remove upvote" : "Upvote this startup"}
        aria-label={tool.user_has_upvoted ? "Remove upvote" : "Upvote this startup"}
      >
        <ChevronUp
          className={`w-4 h-4 transition ${
            tool.user_has_upvoted ? "text-amber-600 stroke-3" : ""
          }`}
        />
        <span className="text-xs font-bold leading-none mt-0.5 font-mono">
          {tool.upvotes}
        </span>
      </button>

      {/* Main Card Content (Middle) */}
      <div className="flex-1 min-w-0">
        {/* Top Row: favicon, title, rating */}
        <div className="flex items-start gap-2.5">
          {/* Circular brand favicon */}
          <div className="relative w-9 h-9 rounded-full border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center bg-linear-to-tr from-amber-500 via-orange-500 to-amber-400">
            {logoSource !== "initial" ? (
              <img
                src={logoSrc}
                alt={`${tool.name} logo`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setLogoSource((current) => current === "horse" ? "google" : "initial")}
                className="w-full h-full object-cover"
              />
            ) : (
              <svg viewBox="0 0 40 40" aria-label={`${tool.name} initial avatar`} className="h-full w-full">
                <rect width="40" height="40" rx="20" fill="#d1fae5" />
                <text x="20" y="25" textAnchor="middle" fontSize="16" fontWeight="700" fill="#047857">{tool.name.slice(0, 1).toUpperCase()}</text>
              </svg>
            )}
          </div>

          <div className="min-w-0">
            <a
              href={tool.website_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-base text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer transition-colors truncate block"
              title={`Visit ${tool.website_url}`}
            >
              {tool.name}
            </a>
            {/* Star rating */}
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-xs font-semibold text-slate-700">
                {tool.rating ?? "4.5"}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-snug">
          {tool.description || tool.tagline}
        </p>

        {/* Bottom Badges */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-md">
            {tool.category}
          </span>
          <span className={getPricingBadgeColor(tool.pricing_type)}>
            {tool.pricing_type}
          </span>
        </div>
      </div>

      {/* Right Action: Bookmark / Favorite (Top Corner) */}
      <button
        type="button"
              onClick={(e) => e.stopPropagation()}
        title={tool.is_favorite ? "Remove from favorites" : "Add to favorites"}
        aria-label={tool.is_favorite ? "Remove from favorites" : "Add to favorites"}
        className="shrink-0 ml-auto mt-0.5"
      >
        <Heart
          className={`w-4 h-4 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors shrink-0 ${
            tool.is_favorite ? "text-rose-500 fill-rose-500" : ""
          }`}
        />
      </button>
    </div>
  );
};

/**
 * Skeleton placeholder that mirrors the ToolCard layout.
 * Rendered while tool data is being fetched so the grid
 * keeps a stable layout and clearly signals a loading state.
 */
export const ToolCardSkeleton: React.FC = () => (
  <div
    className="relative bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3.5 animate-pulse"
    aria-hidden="true"
  >
    {/* Left Upvote Skeleton */}
    <div className="flex flex-col items-center justify-center w-12 h-14 rounded-xl border border-slate-200 bg-slate-50 shrink-0">
      <div className="w-4 h-4 rounded bg-slate-200" />
      <div className="h-3 w-6 rounded bg-slate-200 mt-1.5" />
    </div>

    {/* Middle Content Skeleton */}
    <div className="flex-1 min-w-0">
      <div className="flex items-start gap-2.5">
        {/* Favicon Skeleton */}
        <div className="w-9 h-9 rounded-full border border-slate-100 bg-slate-100 shrink-0" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-12 rounded bg-slate-200 mt-1.5" />
        </div>
      </div>

      {/* Description Skeleton */}
      <div className="h-3 w-full rounded bg-slate-200 mt-3" />
      <div className="h-3 w-2/3 rounded bg-slate-200 mt-2" />

      {/* Badges Skeleton */}
      <div className="flex items-center gap-1.5 mt-3">
        <div className="h-4 w-16 rounded-md bg-slate-200" />
        <div className="h-4 w-16 rounded-md bg-slate-200" />
      </div>
    </div>
  </div>
);
