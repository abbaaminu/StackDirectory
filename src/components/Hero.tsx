import React from "react";
import {
  Search,
  Sparkles,
  Zap,
  ArrowUpDown,
  Filter,
  X,
  ShoppingBag,
  DollarSign,
} from "lucide-react";
import { CATEGORIES } from "../data/mockTools";
import { PricingType } from "../types/directory";

interface HeroProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedPricing: string;
  onPricingChange: (pricing: string) => void;
  sortBy: "featured" | "upvotes" | "newest" | "for_sale";
  onSortChange: (sort: "featured" | "upvotes" | "newest" | "for_sale") => void;
  totalApproved: number;
  featuredCount: number;
  forSaleCount: number;
  onOpenSubmit: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedPricing,
  onPricingChange,
  sortBy,
  onSortChange,
  totalApproved,
  featuredCount,
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

      {/* Instant Search and Filters Bar */}
      <div className="relative z-10 mt-10 max-w-4xl mx-auto space-y-4">
        {/* Search Input Box */}
        <div className="relative flex items-center max-w-2xl mx-auto">
          <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            id="input-search-tools"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search startups for sale, MRR, tech stacks, or desktop utilities..."
            className="w-full pl-12 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white text-slate-900 placeholder-slate-400 shadow-inner text-sm md:text-base outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-4 text-slate-400 hover:text-slate-900 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          {/* Category Pills including 🏷️ Startups For Sale */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat;
              const isMarketplace = cat === "Startups For Sale";

              return (
                <button
                  key={cat}
                  id={`cat-pill-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => onCategoryChange(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? isMarketplace
                        ? "bg-slate-900 text-white font-bold shadow-sm ring-1 ring-slate-900"
                        : "bg-slate-900 text-white font-medium shadow-sm"
                      : isMarketplace
                        ? "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50 font-semibold"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {isMarketplace && <span>🏷️</span>}
                  <span>{cat}</span>
                  {isMarketplace && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? "bg-slate-900 text-amber-400" : "bg-amber-100 text-amber-700"}`}
                    >
                      {forSaleCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pricing & Sort Dropdowns */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Pricing Filter */}
            <div className="relative">
              <select
                id="select-pricing-filter"
                value={selectedPricing}
                onChange={(e) => onPricingChange(e.target.value)}
                className="bg-white text-xs text-slate-700 font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 outline-none cursor-pointer focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="All">All Pricing</option>
                <option value="Free">Free</option>
                <option value="Freemium">Freemium</option>
                <option value="Paid">Paid</option>
                <option value="Open Source">Open Source</option>
              </select>
            </div>

            {/* Sort Filter */}
            <div className="relative">
              <select
                id="select-sort-filter"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as any)}
                className="bg-white text-xs text-slate-700 font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 outline-none cursor-pointer focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="featured">Featured First</option>
                <option value="for_sale">🏷️ For Sale First</option>
                <option value="upvotes">Most Upvoted</option>
                <option value="newest">Newest Added</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
