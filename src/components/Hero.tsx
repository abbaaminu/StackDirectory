import React from "react";
import {
  Search,
  Sparkles,
  Zap,
  X,
  ShoppingBag,
  LayoutGrid,
} from "lucide-react";
import type { PricingFilter } from "../types/directory";
import { PRICING_FILTER_OPTIONS } from "../types/directory";

export type ViewMode = "all" | "for_sale";

export interface HeroProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedPricing: PricingFilter;
  onPricingChange: (pricing: PricingFilter) => void;
  selectedTab: ViewMode;
  onTabChange: (tab: ViewMode) => void;
  totalApproved: number;
  forSaleCount: number;
  onOpenSubmit: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  searchQuery,
  onSearchChange,
  selectedPricing,
  onPricingChange,
  selectedTab,
  onTabChange,
  totalApproved,
  forSaleCount,
  onOpenSubmit,
}) => {
  return (
    <section className="relative bg-white border-b border-slate-200/80 py-10 px-4 overflow-hidden">
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-slate-700 border border-slate-200 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Next.js 15 App Router • Supabase DB • Paddle Billing</span>
          <span className="text-slate-400">•</span>
          <span className="text-amber-600 font-semibold">
            {totalApproved} Live Apps
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-orange-600 font-semibold">
            {forSaleCount} Startups For Sale
          </span>
        </div>
      </div>

      {/* Main Headline */}
      <div className="relative z-10 text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Startup Discovery & <br className="hidden sm:inline" />
          <span className="bg-linear-to-r from-amber-500 via-orange-500 to-amber-600 bg-clip-text text-transparent">
            Acquisition Marketplace
          </span>
        </h1>
        <p className="text-sm sm:text-base text-slate-500 mt-2 max-w-2xl mx-auto text-center">
          The hub for next-gen developer utilities, AI apps, and vetted
          micro-SaaS businesses for sale. List for 100% free ($0), boost
          instantly with Paddle ($19 USD), or buy profitable software with 10%
          commission.
        </p>

        {/* Value Prop Badges */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>
              <strong>100% Free</strong> ($0) Review Queue
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>
              <strong>$19 Flat</strong> Paddle Instant Featured
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 text-orange-700">
            <ShoppingBag className="w-3.5 h-3.5 text-orange-400" />
            <span>
              <strong>Acquire Startups:</strong> Free to list • 10% deal
              commission
            </span>
          </div>
        </div>
      </div>

      {/* Real-Time Search + Filtering */}
      <div className="relative z-10 mt-10 max-w-5xl mx-auto space-y-5">
        {/* Search with clear (X) button */}
        <div className="relative flex items-center max-w-2xl mx-auto">
          <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            id="input-search-tools"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, tagline, category, or tech stack..."
            className="w-full pl-12 pr-11 py-3 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-slate-900 placeholder-slate-400 shadow-inner text-sm md:text-base outline-none transition"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Second row: All Apps / For Sale tabs + Pricing buttons */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
          {/* Tab Toggle: All Apps vs For Sale */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => onTabChange("all")}
              className={[
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition",
                selectedTab === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
              ].join(" ")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              All Apps
            </button>
            <button
              type="button"
              onClick={() => onTabChange("for_sale")}
              className={[
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition",
                selectedTab === "for_sale"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
              ].join(" ")}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              For Sale (Acquire Mode)
              <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold grid place-items-center">
                {forSaleCount}
              </span>
            </button>
          </div>

          {/* Pricing toggle buttons */}
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              {PRICING_FILTER_OPTIONS.map((pricing) => (
                <button
                  key={pricing}
                  type="button"
                  id={`pricing-btn-${pricing.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => onPricingChange(pricing)}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap",
                    selectedPricing === pricing
                      ? "bg-slate-900 text-white border-transparent shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {pricing}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};