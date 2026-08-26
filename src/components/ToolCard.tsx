import React, { useState } from 'react';
import { ExternalLink, ChevronUp, Sparkles, Zap, CheckCircle2, Cpu, ShoppingBag } from 'lucide-react';
import { Tool } from '../types/directory';

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

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUpvoteAnimating(true);
    onToggleUpvote(tool.id);
    setTimeout(() => setIsUpvoteAnimating(false), 300);
  };

                const getPricingBadgeColor = (type: string) => {
    switch (type) {
      case 'Free':
        return 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold';
      case 'Freemium':
        return 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold';
      case 'Open Source':
        return 'bg-fuchsia-950/80 text-fuchsia-400 border border-fuchsia-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold';
      case 'Paid':
        return 'bg-purple-950/80 text-purple-400 border border-purple-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-full text-xs';
    }
  };

    return (
    <div
      id={`tool-card-${tool.id}`}

      className={`group relative bg-[#131b2e] border border-slate-700/60 hover:border-amber-500/70 shadow-lg hover:shadow-amber-500/10 transition-all duration-300 rounded-xl p-5 flex flex-col justify-between ${
        tool.is_for_sale || tool.is_featured
          ? 'border-amber-500/40 hover:border-amber-400'
          : ''
      }`}
    >
      {/* Badges / Ribbons on Top */}
      <div className="absolute -top-3 left-5 flex items-center gap-2">
        {tool.is_for_sale && (
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 text-zinc-950 shadow-md shadow-amber-500/30 tracking-wider">
            <ShoppingBag className="w-3 h-3 fill-zinc-950" />
            <span>FOR SALE</span>
          </div>
        )}

        {tool.is_featured && !tool.is_for_sale && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 shadow-md shadow-amber-500/20">
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
                                                {/* App Monogram / Icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base text-white shadow-md bg-gradient-to-br from-amber-500 via-orange-500 to-indigo-600`}
            >
              {tool.name.slice(0, 2).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <a
                  href={tool.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-white font-semibold text-lg hover:text-amber-400 transition-colors"
                  title={`Visit ${tool.website_url}`}
                >
                  {tool.name}
                </a>
                {(tool.is_featured || tool.is_for_sale) && (
                  <span title={tool.is_for_sale ? "Startup Acquisition Listing" : "Verified & Paddle Featured Upgrade"}>
                    <CheckCircle2 className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {new URL(tool.website_url).hostname.replace('www.', '')}
              </span>
            </div>
          </div>

          {/* Upvote Button with Atomic UI */}
          <button
            id={`btn-upvote-${tool.id}`}
            onClick={handleUpvote}
            className={`flex flex-col items-center justify-center min-w-[50px] px-2.5 py-1.5 rounded-xl border transition active:scale-95 ${
              tool.user_has_upvoted
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-500/20'
                : 'bg-zinc-900 hover:bg-zinc-800/90 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            } ${isUpvoteAnimating ? 'scale-110' : ''}`}
            title={tool.user_has_upvoted ? 'Remove upvote' : 'Upvote this startup'}
          >
            <ChevronUp
              className={`w-4 h-4 transition ${
                tool.user_has_upvoted ? 'text-amber-400 stroke-[3]' : 'text-zinc-400'
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
        <p className="mt-1.5 text-xs text-zinc-400 leading-snug line-clamp-2">
          {tool.description}
        </p>

        {/* Startup For Sale Highlights Box */}
        {tool.is_for_sale && (
          <div className="mt-3 p-2.5 rounded-lg bg-slate-950/60 border border-amber-500/30 shadow-inner">
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Asking Price */}
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-amber-500/20">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Asking Price
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  ${tool.asking_price ? tool.asking_price.toLocaleString() : 'Negotiable'}
                </span>
              </div>

              {/* Monthly Revenue (MRR) */}
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  MRR
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  ${tool.monthly_revenue !== undefined ? tool.monthly_revenue.toLocaleString() : '0'}
                  <span className="text-[9px] font-normal text-zinc-400">/mo</span>
                </span>
              </div>

              {/* Net Profit */}
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                  Net Profit
                </span>
                <span className="text-sm font-black text-white mt-0.5 block">
                  ${tool.monthly_profit !== undefined ? tool.monthly_profit.toLocaleString() : '0'}
                  <span className="text-[9px] font-normal text-zinc-400">/mo</span>
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
                    className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono"
                  >
                    {tech}
                  </span>
                ))}
                {tool.tech_stack.length > 3 && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    +{tool.tech_stack.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

            {/* Footer Meta: Category, Pricing, & CTAs */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category Tag */}
          <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-full text-xs">
            {tool.category}
          </span>

          {/* Pricing Tag */}
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${getPricingBadgeColor(
              tool.pricing_type
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-sm shadow-amber-500/30 active:scale-95 transition"
            >
              <ShoppingBag className="w-3.5 h-3.5 fill-zinc-950" />
              <span>Make Offer</span>
            </button>
          ) : (
            !tool.is_featured && onOpenUpgradeForTool && (
              <button
                onClick={() => onOpenUpgradeForTool(tool)}
                className="text-[11px] font-semibold text-amber-400/80 hover:text-amber-300 hover:underline flex items-center gap-1"
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
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition"
            title={`Visit ${tool.name}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

