import type { CategoryOption, PricingType, SortOption, Tool } from "../types/directory";
import { ALL_CATEGORIES } from "../types/directory";

/** Parse an ISO timestamp into epoch ms; malformed or missing values sort last. */
const toTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Active criteria driving the interactive directory filters. */
export interface ToolFilterCriteria {
  viewMode: "all" | "for_sale";
  pricingFilter: "All" | PricingType;
  categoryFilter: string;
  searchQuery: string;
}

/** True when a tool matches the active tab, pricing, category and search filters. */
export const matchesToolFilters = (
  tool: Tool,
  { viewMode, pricingFilter, categoryFilter, searchQuery }: ToolFilterCriteria,
): boolean => {
  if (viewMode === "for_sale" && !tool.is_for_sale) return false;

  if (pricingFilter !== "All" && tool.pricing_type !== pricingFilter) {
    return false;
  }

  if (categoryFilter !== ALL_CATEGORIES && tool.category !== categoryFilter) {
    return false;
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;

  return (
    tool.name.toLowerCase().includes(query) ||
    tool.tagline.toLowerCase().includes(query) ||
    tool.category.toLowerCase().includes(query) ||
    tool.description.toLowerCase().includes(query) ||
    Boolean(tool.tech_stack?.some((tech) => tech.toLowerCase().includes(query)))
  );
};

/**
 * Returns a sorted copy of the given listings.
 * "Most Popular" ranks by upvotes (featured listings break ties, then A–Z),
 * while "Recently Added" ranks by created_at (newest first, upvotes break ties).
 */
export const sortTools = (list: Tool[], sortOption: SortOption): Tool[] =>
  [...list].sort((a, b) => {
    if (sortOption === "Recently Added") {
      return (
        toTimestamp(b.created_at) - toTimestamp(a.created_at) ||
        b.upvotes - a.upvotes
      );
    }

    return (
      b.upvotes - a.upvotes ||
      Number(b.is_featured) - Number(a.is_featured) ||
      a.name.localeCompare(b.name)
    );
  });

/**
 * Builds the interactive category pills for a listing scope, alphabetically
 * sorted and prefixed with the "All Categories" reset pill carrying the total.
 */
export const buildCategoryOptions = (
  listings: ReadonlyArray<Tool>,
): CategoryOption[] => [
  { label: ALL_CATEGORIES, count: listings.length },
  ...Array.from(
    new Set(
      listings
        .map((tool) => tool.category)
        .filter((value): value is string => Boolean(value && value.trim())),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((category) => ({
      label: category,
      count: listings.filter((tool) => tool.category === category).length,
    })),
];
