import { useState, useEffect, useCallback } from "react";
import { Search, X, CheckCircle2, ShoppingBag, LayoutGrid } from "lucide-react";
import supabase, { isSupabaseConfigured, pendingToolDefaults } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { Tool, PricingType } from "./types/directory";
import { INITIAL_TOOLS } from "./data/mockTools";
import { Header } from "./components/Header";
import { ToolCard, ToolCardSkeleton } from "./components/ToolCard";
import { SubmitModal } from "./components/SubmitModal";
import { AcquisitionModal } from "./components/AcquisitionModal";
import { AuthModal } from "./components/AuthModal";
import { AdminQueueModal } from "./components/AdminQueueModal";
import { getToolSlug, ToolDetailModal } from "./components/ToolDetailModal";
import { DealRoomModal } from "./components/DealRoomModal";
import { FAQModal } from "./components/FAQModal";
import { TermsModal } from "./components/TermsModal";
import { Footer } from "./components/Footer";

const PRICING_FILTERS: ReadonlyArray<"All" | PricingType> = [
  "All",
  "Free",
  "Freemium",
  "Paid",
];

type ViewMode = "all" | "for_sale";

const VOTED_TOOLS_KEY = "voted_tools";
const LOCAL_TOOLS_KEY = "stackdirectory_tools";

const getToolFromUrl = (toolParam: string, availableTools: Tool[]): Tool | null => {
  const normalizedParam = toolParam.toLowerCase();
  return availableTools.find((tool) =>
    ((tool as Tool & { slug?: string }).slug?.toLowerCase() === normalizedParam) ||
      getToolSlug(tool) === normalizedParam ||
      tool.id.toLowerCase() === normalizedParam,
  ) ?? null;
};

const getVotedTools = (): string[] => {
  try {
    const raw = localStorage.getItem(VOTED_TOOLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
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
  const [session, setSession] = useState<Session | null>(null);
  const [localAuthenticated, setLocalAuthenticated] = useState(false);
  const [adminTools, setAdminTools] = useState<Tool[]>([]);
  const [isAdminQueueOpen, setIsAdminQueueOpen] = useState(false);
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
  const [selectedDetailTool, setSelectedDetailTool] = useState<Tool | null>(null);
  const [selectedDealRoomTool, setSelectedDealRoomTool] = useState<Tool | null>(null);

  // Auth modal (Log In / Sign Up)
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isFAQOpen, setIsFAQOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const isAuthenticated = Boolean(session || localAuthenticated);

  const openToolDetails = (tool: Tool) => {
    setSelectedDetailTool(tool);
    const url = new URL(window.location.href);
    url.searchParams.set("tool", getToolSlug(tool));
    window.history.pushState({ tool: getToolSlug(tool) }, "", url);
  };

  const closeToolDetails = () => {
    setSelectedDetailTool(null);
    window.history.pushState({}, "", window.location.pathname);
  };

  useEffect(() => {
    const syncToolFromUrl = () => {
      const toolParam = new URLSearchParams(window.location.search).get("tool");
      setSelectedDetailTool(toolParam ? getToolFromUrl(toolParam, tools) : null);
    };

    syncToolFromUrl();
    window.addEventListener("popstate", syncToolFromUrl);
    return () => window.removeEventListener("popstate", syncToolFromUrl);
  }, [tools]);

  const fetchApprovedTools = useCallback(async () => {
    try {
      setLoading(true);
      if (!isSupabaseConfigured || !supabase) {
        let stored: Tool[] = [];
        try {
          const parsed = JSON.parse(localStorage.getItem(LOCAL_TOOLS_KEY) || "[]");
          stored = Array.isArray(parsed) ? parsed : [];
        } catch {
          stored = [];
        }
        setTools([...INITIAL_TOOLS, ...stored].map((tool) => ({
          ...tool,
          user_has_upvoted: getVotedTools().includes(tool.id),
        })));
        setError(null);
        return;
      }
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
        ((data as Tool[]) ?? []).map((tool) => ({
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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) showToast("Authentication state updated.");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const isAdmin = Boolean(
    session?.user.app_metadata?.role === "admin" ||
      (session?.user.email &&
        [
          ...(import.meta.env.VITE_ADMIN_EMAILS ?? "")
            .split(",")
            .map((email: string) => email.trim().toLowerCase()),
          import.meta.env.VITE_ADMIN_EMAIL?.trim().toLowerCase(),
        ]
          .filter(Boolean)
          .includes(session.user.email.toLowerCase())),
  );

  const openAdminQueue = async () => {
    if (!isAdmin) {
      showToast("Admin access is restricted to authorized accounts.");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      const stored = JSON.parse(localStorage.getItem(LOCAL_TOOLS_KEY) || "[]") as Tool[];
      setAdminTools(stored);
    } else {
      const { data, error } = await supabase.from("tools").select("*").order("created_at", { ascending: false });
      if (error) {
        showToast("Could not load the review queue.");
        return;
      }
      setAdminTools((data as Tool[]) ?? []);
    }
    setIsAdminQueueOpen(true);
  };

  const updateAdminTool = async (toolId: string, updates: Partial<Tool>) => {
    if (!isSupabaseConfigured || !supabase) {
      const stored = JSON.parse(localStorage.getItem(LOCAL_TOOLS_KEY) || "[]") as Tool[];
      const next = stored.map((tool) => tool.id === toolId ? { ...tool, ...updates } : tool);
      localStorage.setItem(LOCAL_TOOLS_KEY, JSON.stringify(next));
      setAdminTools(next);
      await fetchApprovedTools();
      return;
    }
    const { error } = await supabase.from("tools").update(updates as never).eq("id", toolId);
    if (error) {
      showToast("Could not update this listing.");
      return;
    }
    setAdminTools((current) => current.map((tool) => tool.id === toolId ? { ...tool, ...updates } : tool));
    await fetchApprovedTools();
  };

  const handleSignOut = async () => {
    setLocalAuthenticated(false);
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    showToast("You have been signed out.");
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
      ...pendingToolDefaults,
      is_featured: newTool.is_featured ?? false,
      paddle_customer_id: newTool.paddle_customer_id ?? null,
      is_for_sale: newTool.is_for_sale ?? false,
      asking_price: newTool.asking_price ?? null,
      monthly_revenue: newTool.monthly_revenue ?? 0,
      monthly_profit: newTool.monthly_profit ?? 0,
      seller_contact: newTool.seller_contact ?? null,
      tech_stack: newTool.tech_stack ?? [],
    };

    const saveSubmissionLocally = async () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_TOOLS_KEY) || "[]");
        const existing = Array.isArray(parsed) ? parsed as Tool[] : [];
        localStorage.setItem(LOCAL_TOOLS_KEY, JSON.stringify([
          ...existing,
          { ...newTool, ...pendingToolDefaults },
        ]));
        showToast(`📋 "${newTool.name}" saved locally for review.`);
        await fetchApprovedTools();
      } catch {
        showToast(`❌ Could not save "${newTool.name}" in this browser.`);
      }
    };

    if (!isSupabaseConfigured || !supabase) {
      await saveSubmissionLocally();
      return;
    }

    const { error } = await supabase.from("tools").insert(row as never);

    if (error) {
      console.error("Failed to submit tool:", error.message);
      await saveSubmissionLocally();
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

    const userId = session?.user.id || (localAuthenticated ? "local-demo-user" : null);
    if (!userId) {
      setAuthMode("login");
      setIsAuthOpen(true);
      showToast("Please sign in to upvote a tool.");
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      const nextUpvotes = tool.user_has_upvoted ? Math.max(0, tool.upvotes - 1) : tool.upvotes + 1;
      const votedTools = getVotedTools();
      const isUpvoting = !tool.user_has_upvoted;
      saveVotedTools(isUpvoting ? [...new Set([...votedTools, toolId])] : votedTools.filter((id) => id !== toolId));
      setTools((prev) => prev.map((item) => item.id === toolId ? { ...item, upvotes: nextUpvotes, user_has_upvoted: isUpvoting } : item));
      setSelectedDetailTool((current) => current?.id === toolId ? { ...current, upvotes: nextUpvotes, user_has_upvoted: isUpvoting } : current);
      showToast(isUpvoting ? "Upvote added." : "Upvote removed.");
      return;
    }

    const { data, error } = await supabase.rpc("toggle_tool_upvote", {
      target_tool_id: toolId,
      voter_id: userId,
    } as never);

    if (error) {
      console.error("Failed to update upvotes:", error.message);
      showToast("❌ Could not update upvote.");
      return;
    }

    const result = data as { voted: boolean; upvotes: number } | null;
    const votedTools = getVotedTools();
    if (result?.voted) saveVotedTools([...new Set([...votedTools, toolId])]);
    else saveVotedTools(votedTools.filter((id) => id !== toolId));

    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? {
              ...t,
              upvotes: result?.upvotes ?? t.upvotes,
              user_has_upvoted: result?.voted ?? t.user_has_upvoted,
            }
          : t,
      ),
    );
    setSelectedDetailTool((current) =>
      current?.id === toolId
        ? {
            ...current,
            upvotes: result?.upvotes ?? current.upvotes,
            user_has_upvoted: result?.voted ?? current.user_has_upvoted,
          }
        : current,
    );
    showToast(result?.voted ? "Upvote added." : "Upvote removed.");
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
    <div className="bg-[#F8FAFC] min-h-screen text-slate-900 font-sans relative overflow-x-hidden">
      {/* Ambient Header Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-130 bg-[radial-gradient(100%_50%_at_50%_0%,rgba(245,158,11,0.12)_0%,transparent_100%)]" />
      {/* Header with Submit App button */}
      <Header
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
        onOpenAdminQueue={() => setIsAdminQueueOpen(true)}
        isAuthenticated={isAuthenticated}
        user={session?.user}
        userEmail={session?.user.email ?? (localAuthenticated ? "demo@stackdirectory.local" : undefined)}
        onSignOut={() => void handleSignOut()}
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

      {isAuthenticated ? <main className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
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
          <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onToggleUpvote={handleToggleUpvote}
                onOpenAcquisition={(t) => setSelectedAcquisitionTool(t)}
                onOpenDetails={openToolDetails}
                onOpenDealRoom={(t) => setSelectedDealRoomTool(t)}
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
      </main> : (
        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <section className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
              Built for builders and buyers
            </span>
            <h1 className="mt-6 text-4xl sm:text-6xl font-black tracking-tight text-slate-950">
              The #1 Directory &amp; Marketplace for Developer Tools &amp; Micro-SaaS
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600">
              Find the tools that make your next product faster, then discover proven micro-SaaS businesses ready for their next chapter. Join a focused community where makers share useful software, earn recognition, and connect with serious buyers.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <button onClick={() => { setAuthMode("signup"); setIsAuthOpen(true); }} className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition">Sign Up Free</button>
              <button onClick={() => { setAuthMode("login"); setIsAuthOpen(true); }} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition">Log In</button>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {["Discover", "Upvote", "Acquire"].map((feature) => <span key={feature} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm">{feature}</span>)}
            </div>
          </section>
          <section className="relative mt-16 max-w-4xl mx-auto" aria-label="Featured tools preview">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-75">
              {INITIAL_TOOLS.filter((tool) => tool.is_featured).slice(0, 2).map((tool) => (
                <article key={tool.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-left">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-slate-900 truncate">{tool.name}</h2>
                    <span className="text-xs font-bold text-amber-700">{tool.upvotes} votes</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{tool.tagline}</p>
                  <span className="mt-4 inline-block rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{tool.category}</span>
                </article>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/45 backdrop-blur-[2px]">
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-md">Sign in to unlock full directory &amp; upvoting</span>
            </div>
          </section>
        </main>
      )}

      {/* Submit Tool Modal */}
      {isAuthenticated && <SubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitTool={handleSubmitTool}
      />}

      {/* Acquisition Modal */}
      {isAuthenticated && <AcquisitionModal
        isOpen={!!selectedAcquisitionTool}
        onClose={() => setSelectedAcquisitionTool(null)}
        tool={selectedAcquisitionTool}
        onOpenDealRoom={(tool) => {
          setSelectedAcquisitionTool(null);
          setSelectedDealRoomTool(tool);
        }}
      />}

      <ToolDetailModal
        isOpen={Boolean(selectedDetailTool)}
        tool={selectedDetailTool}
        onClose={closeToolDetails}
        onToggleUpvote={(toolId) => void handleToggleUpvote(toolId)}
      />

      {isAuthenticated && <DealRoomModal
        isOpen={Boolean(selectedDealRoomTool)}
        tool={selectedDealRoomTool}
        userId={session?.user.id ?? "local-demo-user"}
        onClose={() => setSelectedDealRoomTool(null)}
      />}

      {/* Auth Modal (Log In / Sign Up) */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onAuthenticated={() => setLocalAuthenticated(true)}
        onToast={showToast}
      />

      {isAuthenticated && <AdminQueueModal
        isOpen={isAdminQueueOpen}
        onClose={() => setIsAdminQueueOpen(false)}
        user={session?.user}
        tools={adminTools}
        onToggleFeature={(toolId) => {
          const tool = adminTools.find((item) => item.id === toolId);
          if (tool) void updateAdminTool(toolId, { is_featured: !tool.is_featured });
        }}
        onToggleForSale={(toolId) => {
          const tool = adminTools.find((item) => item.id === toolId);
          if (tool) void updateAdminTool(toolId, { is_for_sale: !tool.is_for_sale });
        }}
      />}

      <Footer
        onOpenFAQ={() => setIsFAQOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
      />
      <FAQModal isOpen={isFAQOpen} onClose={() => setIsFAQOpen(false)} />
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
}
