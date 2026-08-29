import { useState, useEffect, useCallback } from "react";
import { Search, X, CheckCircle2, ShoppingBag, LayoutGrid } from "lucide-react";
import supabase from "./lib/supabase";
import type { Tool, PricingType } from "./types/directory";
import { Header } from "./components/Header";
import { ToolCard, ToolCardSkeleton } from "./components/ToolCard";
import { SubmitModal } from "./components/SubmitModal";
import { AcquisitionModal } from "./components/AcquisitionModal";
import { AuthModal } from "./components/AuthModal";

const PRICING_FILTERS: ReadonlyArray<"All" | PricingType> = [
  "All",
  "Free",
  "Freemium",
  "Paid",
];

type ViewMode = "all" | "for_sale";

const VOTED_TOOLS_KEY = "voted_tools";

const getVotedTools = (): string[] => {
  try {
    const raw = localStorage.getItem(VOTED_TOOLS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const saveVotedTools = (ids: string[]) => {
  try {
    localStorage.setItem(VOTED_TOOLS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures (e.g. quota / private mode)
  }
};

export default function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [pricingFilter, setPricingFilter] = useState<"All" | PricingType>(
    "All",
  );
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // Submit modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Acquisition modal
  const [selectedAcquisitionTool, setSelectedAcquisitionTool] =
    useState<Tool | null>(null);

  // Auth modal (Log In / Sign Up)
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchApprovedTools = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .eq("is_approved", true)
        .order("upvotes", { ascending: false });

      if (error) {
        console.error("Failed to load tools:", error.message);
        setError(error.message);
        return;
      }

      setTools(
        (data as Tool[]).map((tool) => ({
          ...tool,
          // Restore persistent upvote state across page reloads
          user_has_upvoted: getVotedTools().includes(tool.id),
        })) ?? [],
      );
    } catch (err) {
      console.error("Unexpected error fetching tools:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovedTools();
  }, [fetchApprovedTools]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Submit a new tool into Supabase (goes to review queue with is_approved = false)
  const handleSubmitTool = async (newTool: Tool) => {
    const row = {
      name: newTool.name,
      tagline: newTool.tagline,
      description: newTool.description,
      website_url: newTool.website_url,
      pricing_type: newTool.pricing_type,
      category: newTool.category,
      upvotes: newTool.upvotes ?? 0,
      is_approved: newTool.is_approved ?? false,
      is_featured: newTool.is_featured ?? false,
      paddle_customer_id: newTool.paddle_customer_id ?? null,
      is_for_sale: newTool.is_for_sale ?? false,
      asking_price: newTool.asking_price ?? null,
      monthly_revenue: newTool.monthly_revenue ?? 0,
      monthly_profit: newTool.monthly_profit ?? 0,
      seller_contact: newTool.seller_contact ?? null,
      tech_stack: newTool.tech_stack ?? [],
    };

    const { error } = await supabase
      .from("tools")
      .insert(row as unknown as never[]);

    if (error) {
      console.error("Failed to submit tool:", error.message);
      showToast(`❌ Failed to submit "${newTool.name}". Please try again.`);
      return;
    }

    showToast(
      `📋 "${newTool.name}" submitted for review and will appear once approved.`,
    );
    await fetchApprovedTools();
  };

  // Toggle upvote: increment/decrement upvotes in Supabase
  const handleToggleUpvote = async (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;

    const nextUpvotes = tool.user_has_upvoted
      ? Math.max(0, tool.upvotes - 1)
      : tool.upvotes + 1;

    const { error } = await supabase
      .from("tools")
      .update({ upvotes: nextUpvotes } as never)
      .eq("id", toolId);

    if (error) {
      console.error("Failed to update upvotes:", error.message);
      showToast("❌ Could not update upvote.");
      return;
    }

    // Persist upvote state so it survives page reloads
    const votedTools = getVotedTools();
    const isUpvoting = !tool.user_has_upvoted;
    if (isUpvoting && !votedTools.includes(toolId)) {
      saveVotedTools([...votedTools, toolId]);
    } else if (!isUpvoting) {
      saveVotedTools(votedTools.filter((id) => id !== toolId));
    }

    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? {
              ...t,
              upvotes: nextUpvotes,
              user_has_upvoted: !t.user_has_upvoted,
            }
          : t,
      ),
    );
  };

  // Filter approved tools by view mode, search query and pricing filter
  const displayedTools = tools.filter((tool) => {
    if (viewMode === "for_sale" && !tool.is_for_sale) {
      return false;
    }

    if (pricingFilter !== "All" && tool.pricing_type !== pricingFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = tool.name.toLowerCase().includes(q);
      const matchesTagline = tool.tagline.toLowerCase().includes(q);
      const matchesCategory = tool.category.toLowerCase().includes(q);
      const matchesDesc = tool.description.toLowerCase().includes(q);
      const matchesTech = tool.tech_stack?.some((t) =>
        t.toLowerCase().includes(q),
      );
      if (
        !matchesName &&
        !matchesTagline &&
        !matchesCategory &&
        !matchesDesc &&
        !matchesTech
      ) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="bg-[#0B0F17] min-h-screen text-slate-100 font-sans relative overflow-x-hidden">
      {/* Ambient Header Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(100%_50%_at_50%_0%,rgba(245,158,11,0.12)_0%,transparent_100%)]" />
      {/* Header with Submit App button */}
      <Header
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md">
          <div className="p-4 rounded-xl shadow-2xl flex items-center gap-3 bg-white text-slate-800 border border-slate-200 text-xs font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-slate-900 ml-auto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">StackDirectory</h1>
            <p className="text-sm text-slate-500 mt-1">
              Discover, upvote, and submit the best developer tools &amp;
              startups.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 gap-1 shadow-sm">
            <button
              onClick={() => setViewMode("all")}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                viewMode === "all"
                  ? "bg-slate-900 text-white border-transparent"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent",
              ].join(" ")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              All Apps
            </button>
            <button
              onClick={() => setViewMode("for_sale")}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                viewMode === "for_sale"
                  ? "bg-slate-900 text-white border-transparent"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent",
              ].join(" ")}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              For Sale (Acquire Mode)
              <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold grid place-items-center">
                {tools.filter((t) => t.is_for_sale).length}
              </span>
            </button>
          </div>

          {/* Pricing Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Pricing:</span>
            <div className="flex flex-wrap gap-1.5">
              {PRICING_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setPricingFilter(filter)}
                  className={[
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition",
                    pricingFilter === filter
                      ? "bg-slate-900 text-white border-transparent"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, tagline, category, or tech stack..."
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-7xl mx-auto px-4"
            aria-busy="true"
            aria-label="Loading tools"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <ToolCardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="border border-red-300 bg-red-50 rounded-lg p-4 text-red-700 text-sm">
            <p className="font-semibold mb-1">Failed to load tools</p>
            <p>{error}</p>
          </div>
        ) : displayedTools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-7xl mx-auto px-4">
            {displayedTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onToggleUpvote={handleToggleUpvote}
                onOpenAcquisition={(t) => setSelectedAcquisitionTool(t)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500">
              {tools.length === 0
                ? "No approved tools submitted yet."
                : "No tools match your current filters."}
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setPricingFilter("All");
                setViewMode("all");
              }}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </main>

      {/* Submit Tool Modal */}
      <SubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitTool={handleSubmitTool}
      />

      {/* Acquisition Modal */}
      <AcquisitionModal
        isOpen={!!selectedAcquisitionTool}
        onClose={() => setSelectedAcquisitionTool(null)}
        tool={selectedAcquisitionTool}
      />

      {/* Auth Modal (Log In / Sign Up) */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}
