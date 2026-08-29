import React, { useState } from "react";
import {
  ExternalLink,
  ChevronUp,
  Sparkles,
  Zap,
  CheckCircle2,
  Cpu,
  ShoppingBag,
  Star,
  Heart,
} from "lucide-react";
import { Tool } from "../types/directory";

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
};

interface ToolCardProps {
  tool: Tool;
  onToggleUpvote: (toolId: string) => void;
  onOpenUpgradeForTool?: (tool: Tool) => void;
  onOpenAcquisition?: (tool: Tool) => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  onToggleUpvote,
  onOpenUpgradeForTool,
  onOpenAcquisition,
}) => {
  const [isUpvoteAnimating, setIsUpvoteAnimating] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Compact, dynamic favicon logo (graceful 2-letter avatar fallback)
  const domain = getHostname(tool.website_url);
  const logoSrc =
    tool.icon_url ||
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUpvoteAnimating(true);
    onToggleUpvote(tool.id);
    setTimeout(() => setIsUpvoteAnimating(false), 300);
  };

  const getPricingBadgeColor = (type: string) => {
    switch (type) {
      case "Free":
        return "bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-semibold";
      case "Freemium":
        return "bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full text-xs font-semibold";
      case "Open Source":
        return "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-2 py-0.5 rounded-full text-xs font-semibold";
      case "Paid":
        return "bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-xs font-semibold";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full text-xs font-semibold";
    }
  };

  return (
    <div
      id={`tool-card-${tool.id}`}

      className={`group relative bg-white rounded-xl p-3.5 shadow-md flex flex-col justify-between min-h-[110px] transition-all duration-200 ${
        tool.is_for_sale || tool.is_featured
          ? "border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.25)]"
          : "border border-slate-200 hover:border-amber-400/80"
      }`}
    >
      {/* Badges / Ribbons on Top */}
      <div className="absolute -top-3 left-5 flex items-center gap-2">
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

      {/* Top Header Row */}
      <div>
        <div className="flex items-start justify-between gap-2.5 mb-1.5">
          {/* App Identity */}
          <div className="flex items-center gap-3">
            {/* Compact Dynamic Logo: favicon with 2-letter avatar fallback */}
            <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 bg-linear-to-tr from-amber-500 via-orange-500 to-amber-400">
              {!logoFailed ? (
                <img
                  src={logoSrc}
                  alt={`${tool.name} logo`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-slate-950 font-black text-xs tracking-wide">
                  {tool.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <a
                  href={tool.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-bold text-slate-900 hover:text-amber-600 leading-tight truncate"
                  title={`Visit ${tool.website_url}`}
                >
                  {tool.name}
                </a>
                {(tool.is_featured || tool.is_for_sale) && (
                  <span
                    title={
                      tool.is_for_sale
                        ? "Startup Acquisition Listing"
                        : "Verified & Paddle Featured Upgrade"
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
                  </span>
                )}
              </div>
              {/* Domain URL */}
              <div className="text-xs text-slate-400 mt-0.5 truncate">
                {new URL(tool.website_url).hostname.replace("www.", "")}
              </div>
              {/* Star Rating & Reviews Row */}
              <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>{tool.rating ?? "4.5"}</span>
                <span className="text-slate-500">
                  ({tool.reviews ?? 42} reviews)
                </span>
              </div>
            </div>
          </div>

          {/* Favorite Heart Icon */}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={
              tool.is_favorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
            aria-label={
              tool.is_favorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
            className="shrink-0 mt-0.5"
          >
            <Heart
              className={`w-4 h-4 text-slate-400 hover:text-rose-500 cursor-pointer ${
                tool.is_favorite ? "text-rose-500 fill-rose-500" : ""
              }`}
            />
          </button>

          {/* Upvote Button with Atomic UI */}
          <button
            id={`btn-upvote-${tool.id}`}
            onClick={handleUpvote}
            className={`flex flex-col items-center justify-center min-w-12.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all active:scale-95 ${
              tool.user_has_upvoted
                ? "bg-amber-50 border border-amber-300 text-amber-700"
                : "bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 text-slate-800"
            } ${isUpvoteAnimating ? "scale-110" : ""}`}
            title={
              tool.user_has_upvoted ? "Remove upvote" : "Upvote this startup"
            }
          >
            <ChevronUp
              className={`w-4 h-4 transition ${
                tool.user_has_upvoted
                  ? "text-amber-600 stroke-3"
                  : "text-slate-400"
              }`}
            />
            <span className="text-xs font-bold font-mono leading-none mt-0.5">
              {tool.upvotes}
            </span>
          </button>
        </div>

        {/* Description / Tagline */}
        <p className="text-xs text-slate-600 line-clamp-2 leading-snug mt-1">
          {tool.description || tool.tagline}
        </p>

        {/* Startup For Sale Highlights Box */}
        {tool.is_for_sale && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Asking Price */}
              <div className="bg-white p-2 rounded-lg border border-amber-200">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                  Asking Price
                </span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  $
                  {tool.asking_price
                    ? tool.asking_price.toLocaleString()
                    : "Negotiable"}
                </span>
              </div>

              {/* Monthly Revenue (MRR) */}
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                  MRR
                </span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  $
                  {tool.monthly_revenue !== undefined
                    ? tool.monthly_revenue.toLocaleString()
                    : "0"}
                  <span className="text-[9px] font-normal text-slate-500">
                    /mo
                  </span>
                </span>
              </div>

              {/* Net Profit */}
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider block">
                  Net Profit
                </span>
                <span className="text-sm font-black text-slate-900 mt-0.5 block">
                  $
                  {tool.monthly_profit !== undefined
                    ? tool.monthly_profit.toLocaleString()
                    : "0"}
                  <span className="text-[9px] font-normal text-slate-500">
                    /mo
                  </span>
                </span>
              </div>
            </div>

            {/* Tech Stack Chips */}
            {tool.tech_stack && tool.tech_stack.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1 flex-wrap">
                <Cpu className="w-3 h-3 text-slate-400 shrink-0" />
                {tool.tech_stack.slice(0, 3).map((tech) => (
                  <span
                    key={tech}
                    className="px-1.5 py-0.2 rounded text-[10px] bg-white text-slate-600 border border-slate-200 font-mono"
                  >
                    {tech}
                  </span>
                ))}
                {tool.tech_stack.length > 3 && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    +{tool.tech_stack.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Meta: Category, Pricing, & CTAs */}
      <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category Tag */}
          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
            {tool.category}
          </span>

          {/* Pricing Tag */}
          <span className={getPricingBadgeColor(tool.pricing_type)}>
            {tool.pricing_type}
          </span>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          {tool.is_for_sale ? (
            <button
              id={`btn-acquire-${tool.id}`}
              onClick={() => onOpenAcquisition && onOpenAcquisition(tool)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-500/30 active:scale-95 transition"
            >
              <ShoppingBag className="w-3.5 h-3.5 fill-zinc-950" />
              <span>Make Offer</span>
            </button>
          ) : (
            !tool.is_featured &&
            onOpenUpgradeForTool && (
              <button
                onClick={() => onOpenUpgradeForTool(tool)}
                className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                title="Simulate Paddle Upgrade"
              >
                <Zap className="w-3 h-3" />
                <span>Boost</span>
              </button>
            )
          )}

          <a
            id={`link-visit-${tool.id}`}
            href={tool.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-amber-600 bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 transition"
            title={`Visit ${tool.name}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
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
    className="relative bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between min-h-27.5 animate-pulse"
    aria-hidden="true"
  >
    {/* Top Header Row */}
    <div className="flex items-start justify-between gap-2.5 mb-1.5">
      <div className="flex items-center gap-3">
        {/* App Monogram / Icon */}
        <div className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100" />
        <div>
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-24 rounded bg-slate-200/80 mt-2" />
        </div>
      </div>

      {/* Upvote Button */}
      <div className="flex flex-col items-center justify-center min-w-12.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-100">
        <div className="w-4 h-4 rounded bg-slate-200" />
        <div className="h-3 w-6 rounded bg-slate-200 mt-1.5" />
      </div>
    </div>

    {/* Tagline */}
    <div className="h-3.5 w-3/4 rounded bg-slate-200 mt-5" />

    {/* Description */}
    <div className="mt-3 space-y-2">
      <div className="h-3 w-full rounded bg-slate-200/80" />
      <div className="h-3 w-2/3 rounded bg-slate-200/80" />
    </div>

    {/* Footer Meta */}
    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-16 rounded-full bg-slate-200" />
        <div className="h-5 w-20 rounded-md bg-slate-200" />
      </div>
      <div className="h-8 w-8 rounded-lg bg-slate-200" />
    </div>
  </div>
);
