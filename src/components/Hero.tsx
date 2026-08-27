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
    <section className="relative pt-8 pb-10 overflow-hidden">
      {/* Flippa-Style City / Architecture Hero Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2000&q=80"
          alt=""
          className="w-full h-full object-cover object-center"
          loading="eager"
        />
        {/* Dark gradient overlay so the bold hero title + tagline stand out clearly */}
        <div className="absolute inset-0 bg-linear-to-b from-slate-950/80 via-slate-950/90 to-[#0a0e1a]" />
      </div>
      {/* Monetization / Tech Stack Banner */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-700/95 text-slate-100 border border-slate-500/70 shadow-inner">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Next.js 15 App Router • Supabase DB • Paddle Billing</span>
          <span className="text-slate-400">•</span>
          <span className="text-amber-300 font-semibold">
            {totalApproved} Live Apps
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-orange-300 font-semibold">
            {forSaleCount} Startups For Sale
          </span>
        </div>
      </div>

      {/* Main Headline */}
      <div className="relative z-10 text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
          Startup Discovery & <br className="hidden sm:inline" />
          <span className="bg-linear-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
            Acquisition Marketplace
          </span>
        </h1>
        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          The hub for next-gen developer utilities, AI apps, and vetted
          micro-SaaS businesses for sale. List for 100% free ($0), boost
          instantly with Paddle ($19 USD), or buy profitable software with 10%
          commission.
        </p>

        {/* Value Prop Badges */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 bg-slate-700/95 px-3 py-1.5 rounded-lg border border-slate-500/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>
              <strong>100% Free</strong> ($0) Review Queue
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-400/60 text-amber-200">
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>
              <strong>$19 Flat</strong> Paddle Instant Featured
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-orange-500/20 px-3 py-1.5 rounded-lg border border-orange-400/60 text-orange-200">
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
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-slate-300 pointer-events-none" />
          <input
            id="input-search-tools"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search startups for sale, MRR, tech stacks, or desktop utilities..."
            className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-slate-700/95 text-white placeholder-slate-400 border border-slate-500/70 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30 text-sm md:text-base outline-none transition shadow-lg"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-4 text-slate-300 hover:text-white p-1"
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
                        ? "bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 text-zinc-950 font-black shadow-md shadow-amber-500/30 ring-1 ring-amber-300"
                        : "bg-amber-500 text-zinc-950 font-bold shadow-sm shadow-amber-500/20"
                      : isMarketplace
                        ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/60 font-semibold"
                        : "bg-slate-600/80 hover:bg-slate-500 text-slate-200 hover:text-white border border-slate-400/60"
                  }`}
                >
                  {isMarketplace && <span>🏷️</span>}
                  <span>{cat}</span>
                  {isMarketplace && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? "bg-zinc-950 text-amber-300" : "bg-amber-500/40 text-amber-100"}`}
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
                className="bg-slate-600 text-xs text-slate-100 font-medium px-3 py-1.5 rounded-lg border border-slate-400/60 hover:border-slate-300 outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
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
                className="bg-slate-600 text-xs text-slate-100 font-medium px-3 py-1.5 rounded-lg border border-slate-400/60 hover:border-slate-300 outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
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
