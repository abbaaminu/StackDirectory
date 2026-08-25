import React from 'react';
import { Search, Sparkles, Zap, ArrowUpDown, Filter, X } from 'lucide-react';
import { CATEGORIES } from '../data/mockTools';
import { PricingType } from '../types/directory';

interface HeroProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedPricing: string;
  onPricingChange: (pricing: string) => void;
  sortBy: 'featured' | 'upvotes' | 'newest';
  onSortChange: (sort: 'featured' | 'upvotes' | 'newest') => void;
  totalApproved: number;
  featuredCount: number;
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
  onOpenSubmit,
}) => {
  return (
    <section className="pt-8 pb-10">
      {/* Monetization / Tech Stack Banner */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900/90 text-zinc-300 border border-zinc-800 shadow-inner">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Next.js 15 Directory Architecture</span>
          <span className="text-zinc-600">•</span>
          <span className="text-amber-400 font-semibold">{totalApproved} Live Apps</span>
          <span className="text-zinc-600">•</span>
          <span className="text-orange-400 font-semibold">{featuredCount} Featured</span>
        </div>
      </div>

      {/* Main Headline */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
          Discover Next-Gen <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
            Desktop & Web Startups
          </span>
        </h1>
        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          The curated hub for modern developer utilities, AI desktop clients, and productivity software. Submit for free via Supabase review queue or upgrade instantly with Paddle.
        </p>

        {/* Value Prop Badges */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5 bg-zinc-900/60 px-3 py-1.5 rounded-lg border border-zinc-800/80">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            <span>Tier 1: <strong>Free Submission</strong> (Queue Review)</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Tier 2: <strong>Paddle Instant Featured</strong> (Immediate Boost)</span>
          </div>
        </div>
      </div>

      {/* Instant Search and Filters Bar */}
      <div className="mt-10 max-w-4xl mx-auto space-y-4">
        {/* Search Input Box */}
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-zinc-400 pointer-events-none" />
          <input
            id="input-search-tools"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tools, AI desktop apps, frameworks, or categories..."
            className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-zinc-900/90 text-white placeholder-zinc-500 border border-zinc-800 focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 text-sm md:text-base outline-none transition shadow-lg"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  id={`cat-pill-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => onCategoryChange(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm shadow-amber-500/20'
                      : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                  }`}
                >
                  {cat}
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
                className="bg-zinc-900 text-xs text-zinc-300 font-medium px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
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
                onChange={(e) => onSortChange(e.target.value as 'featured' | 'upvotes' | 'newest')}
                className="bg-zinc-900 text-xs text-zinc-300 font-medium px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
              >
                <option value="featured">Featured First</option>
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
