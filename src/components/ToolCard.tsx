import React, { useState } from "react";
import {
  ExternalLink,
  ChevronUp,
  Sparkles,
  Zap,
  CheckCircle2,
  Cpu,
  ShoppingBag,
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
        return "bg-emerald-500/30 text-emerald-200 border border-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase";
      case "Freemium":
        return "bg-cyan-500/30 text-cyan-200 border border-cyan-400 px-3 py-1 rounded-full text-xs font-bold uppercase";
      case "Open Source":
        return "bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider";
      case "Paid":
        return "bg-purple-500/30 text-purple-200 border border-purple-400 px-3 py-1 rounded-full text-xs font-bold uppercase";
      default:
        return "bg-slate-600 text-white border border-slate-400 px-3 py-1 rounded-full text-xs font-semibold";
    }
  };

  return (
    <div
      id={`tool-card-${tool.id}`}

      className={`group relative bg-slate-900/90 border border-slate-800 hover:border-amber-400/80 shadow-xl rounded-xl p-4 flex flex-col justify-between transition-all duration-200 ${
        tool.is_for_sale || tool.is_featured
          ? "border-amber-400/70 hover:border-amber-400/80"
          : ""
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
        <div className="flex items-start justify-between gap-3">
          {/* App Identity */}
          <div className="flex items-center gap-3">
            {/* Compact Dynamic Logo: favicon with 2-letter avatar fallback */}
            <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-linear-to-tr from-amber-500 via-orange-500 to-amber-400 flex items-center justify-center shadow-md shrink-0">
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

            <div>
              <div className="flex items-center gap-2">
                <a
                  href={tool.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-white font-bold text-lg hover:text-amber-300"
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
                    <CheckCircle2 className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                  </span>
                )}
              </div>
              <span className="text-slate-300 text-xs">
                {new URL(tool.website_url).hostname.replace("www.", "")}
              </span>
            </div>
          </div>

          {/* Upvote Button with Atomic UI */}
          <button
            id={`btn-upvote-${tool.id}`}
            onClick={handleUpvote}
            className={`flex flex-col items-center justify-center min-w-[50px] px-3 py-2 rounded-xl border transition-all active:scale-95 ${
              tool.user_has_upvoted
                ? "bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-500/20"
                : "bg-slate-600/90 hover:bg-amber-500/20 border border-slate-400/70 hover:border-amber-400 text-slate-100 hover:text-amber-400"
            } ${isUpvoteAnimating ? "scale-110" : ""}`}
            title={
              tool.user_has_upvoted ? "Remove upvote" : "Upvote this startup"
            }
          >
            <ChevronUp
              className={`w-4 h-4 transition ${
                tool.user_has_upvoted
                  ? "text-amber-400 stroke-[3]"
                  : "text-zinc-400"
              }`}
            />
            <span className="text-xs font-bold font-mono leading-none mt-0.5">
              {tool.upvotes}
            </span>
          </button>
        </div>

        {/* Tagline */}
        <p className="mt-2.5 text-sm font-semibold text-zinc-100 leading-snug line-clamp-1">
          {tool.tagline}
        </p>

        {/* Description */}
        <p className="text-slate-200 text-sm leading-relaxed my-3 line-clamp-2">
          {tool.description}
        </p>

        {/* Startup For Sale Highlights Box */}
        {tool.is_for_sale && (
          <div className="mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-amber-400/50 shadow-inner">
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Asking Price */}
              <div className="bg-slate-800/90 p-2 rounded-lg border border-amber-400/40">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Asking Price
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  $
                  {tool.asking_price
                    ? tool.asking_price.toLocaleString()
                    : "Negotiable"}
                </span>
              </div>

              {/* Monthly Revenue (MRR) */}
              <div className="bg-slate-800/90 p-2 rounded-lg border border-slate-500/50">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  MRR
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  $
                  {tool.monthly_revenue !== undefined
                    ? tool.monthly_revenue.toLocaleString()
                    : "0"}
                  <span className="text-[9px] font-normal text-zinc-400">
                    /mo
                  </span>
                </span>
              </div>

              {/* Net Profit */}
              <div className="bg-slate-800/90 p-2 rounded-lg border border-slate-500/50">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                  Net Profit
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  $
                  {tool.monthly_profit !== undefined
                    ? tool.monthly_profit.toLocaleString()
                    : "0"}
                  <span className="text-[9px] font-normal text-zinc-400">
                    /mo
                  </span>
                </span>
              </div>
            </div>

            {/* Tech Stack Chips */}
            {tool.tech_stack && tool.tech_stack.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1 flex-wrap">
                <Cpu className="w-3 h-3 text-zinc-500 shrink-0" />
                {tool.tech_stack.slice(0, 3).map((tech) => (
                  <span
                    key={tech}
                    className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-zinc-100 border border-slate-500/60 font-mono"
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
      <div className="mt-3 pt-2.5 border-t border-slate-600/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category Tag */}
          <span className="bg-slate-600 text-white border border-slate-400/70 px-3 py-1 rounded-full text-xs font-semibold">
            {tool.category}
          </span>

          {/* Pricing Tag */}
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${getPricingBadgeColor(
              tool.pricing_type,
            )}`}
          >
            {tool.pricing_type}
          </span>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          {tool.is_for_sale ? (
            <button
              id={`btn-acquire-${tool.id}`}
              onClick={() => onOpenAcquisition && onOpenAcquisition(tool)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-950 bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-sm shadow-amber-500/30 active:scale-95 transition"
            >
              <ShoppingBag className="w-3.5 h-3.5 fill-zinc-950" />
              <span>Make Offer</span>
            </button>
          ) : (
            !tool.is_featured &&
            onOpenUpgradeForTool && (
              <button
                onClick={() => onOpenUpgradeForTool(tool)}
                className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 hover:underline flex items-center gap-1"
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
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-200 hover:text-white bg-slate-600 hover:bg-slate-500 border border-slate-400/70 hover:border-slate-300 transition"
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
    className="relative bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between animate-pulse"
    aria-hidden="true"
  >
    {/* Top Header Row */}
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* App Monogram / Icon */}
        <div className="w-9 h-9 rounded-lg bg-slate-500/70" />
        <div>
          <div className="h-4 w-32 rounded bg-slate-500/70" />
          <div className="h-3 w-24 rounded bg-slate-500/50 mt-2" />
        </div>
      </div>

      {/* Upvote Button */}
      <div className="flex flex-col items-center justify-center min-w-[50px] px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80">
        <div className="w-4 h-4 rounded bg-slate-500/70" />
        <div className="h-3 w-6 rounded bg-slate-500/70 mt-1.5" />
      </div>
    </div>

    {/* Tagline */}
    <div className="h-3.5 w-3/4 rounded bg-slate-500/60 mt-5" />

    {/* Description */}
    <div className="mt-3 space-y-2">
      <div className="h-3 w-full rounded bg-slate-500/50" />
      <div className="h-3 w-2/3 rounded bg-slate-500/50" />
    </div>

    {/* Footer Meta */}
    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-16 rounded-full bg-slate-500/60" />
        <div className="h-5 w-20 rounded-md bg-slate-500/60" />
      </div>
      <div className="h-8 w-8 rounded-lg bg-slate-500/60" />
    </div>
  </div>
);
