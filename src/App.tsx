import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X, CheckCircle2, ShoppingBag, LayoutGrid, ArrowUpDown, Clock, Tag, TrendingUp } from "lucide-react";
import supabase, { isSupabaseConfigured, pendingToolDefaults } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { PricingType, SortOption, Tool } from "./types/directory";
import {
  ALL_CATEGORIES,
  PRICING_FILTER_OPTIONS,
  SORT_OPTIONS,
} from "./types/directory";
import { buildCategoryOptions, matchesToolFilters, sortTools } from "./lib/toolFilters";
import { isAdminUser } from "./lib/admin";
import {
  type AdminToolAction,
  callAdminToolAction,
  isAdminApiUnavailable,
} from "./lib/adminTools";
import { getToolSlug } from "./lib/toolSlug";
import {
  buildToolInsertRow,
  isDuplicateRowError,
  submissionRejectionReason,
} from "./lib/submissions";
import { syncSubmittedToolToResend } from "./lib/resendAudience";
import {
  readJsonArray,
  readStringArray,
  STORAGE_KEYS,
  writeJsonArray,
  writeStringArray,
} from "./lib/localStore";
import { INITIAL_TOOLS } from "./data/mockTools";
import { Header } from "./components/Header";
import { ToolCard, ToolCardSkeleton } from "./components/ToolCard";
import { SubmitModal } from "./components/SubmitModal";
import { AcquisitionModal } from "./components/AcquisitionModal";
import { AuthModal } from "./components/AuthModal";
import { AdminQueueModal } from "./components/AdminQueueModal";
import { ToolDetailModal } from "./components/ToolDetailModal";
import { DealRoomModal } from "./components/DealRoomModal";
import { FAQModal } from "./components/FAQModal";
import { TermsModal } from "./components/TermsModal";
import { Footer } from "./components/Footer";
import { SupportModal } from "./components/SupportModal";
import { FeaturedBadgeIcon } from "./components/icons/FeaturedBadgeIcon";

type ViewMode = "all" | "for_sale";

const getToolFromUrl = (toolParam: string, availableTools: Tool[]): Tool | null => {
  const normalizedParam = toolParam.toLowerCase();
  return availableTools.find((tool) =>
    (tool.slug?.toLowerCase() === normalizedParam) ||
      getToolSlug(tool) === normalizedParam ||
      tool.id.toLowerCase() === normalizedParam,
  ) ?? null;
};

export default function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [localAuthenticated, setLocalAuthenticated] = useState(false);
  const [isAdminQueueOpen, setIsAdminQueueOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [pricingFilter, setPricingFilter] = useState<"All" | PricingType>(
    "All",
  );
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [sortOption, setSortOption] = useState<SortOption>("Most Popular");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);

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
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** Pending auto-hide timer for the visible toast. */
  const toastTimerRef = useRef<number | null>(null);
  const isAuthenticated = Boolean(session || localAuthenticated);

  const openToolDetails = (tool: Tool) => {
    setSelectedDetailTool(tool);
    const url = new URL(window.location.href);
    url.searchParams.set("tool", getToolSlug(tool));
    window.history.pushState({ tool: getToolSlug(tool) }, "", url);
  };

  const closeToolDetails = () => {
    setSelectedDetailTool(null);
    // `replaceState`, not `pushState`: opening a listing already pushed its own
    // history entry, so pushing another one here left the visitor with
    // [.., ?tool=x, /] - pressing Back immediately reopened the modal they had
    // just closed. Replacing the entry drops the deep link without trapping them
    // in a Back loop.
    window.history.replaceState({}, "", window.location.pathname);
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
        const stored = readJsonArray<Tool>(STORAGE_KEYS.tools);
        const votedIds = readStringArray(STORAGE_KEYS.votedTools);
        const savedIds = readStringArray(STORAGE_KEYS.savedTools);
        setTools([...INITIAL_TOOLS, ...stored].map((tool) => ({
          ...tool,
          user_has_upvoted: votedIds.includes(tool.id),
          is_favorite: savedIds.includes(tool.id),
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

      const votedIds = readStringArray(STORAGE_KEYS.votedTools);
      const savedIds = readStringArray(STORAGE_KEYS.savedTools);
      setTools(
        ((data as Tool[]) ?? []).map((tool) => ({
          ...tool,
          // Restore persistent upvote / bookmark state across page reloads
          user_has_upvoted: votedIds.includes(tool.id),
          is_favorite: savedIds.includes(tool.id),
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

  /**
   * Hides the visible toast and cancels its pending timer. Only one toast is on
   * screen at a time, so the previous timer must be cleared before the next one
   * is scheduled - otherwise the earlier toast's timer would hide the newer
   * message seconds before its own 4s window is over.
   */
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback(
    (message: string) => {
      dismissToast();
      setToastMessage(message);
      toastTimerRef.current = window.setTimeout(() => {
        toastTimerRef.current = null;
        setToastMessage(null);
      }, 4000);
    },
    [dismissToast],
  );

  // Never leave a timer running once the app that owns the toast is gone.
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  // Keep the Supabase session in sync and confirm the sign-in to the visitor.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // Supabase also emits `INITIAL_SESSION` on every page load and
      // `TOKEN_REFRESHED` roughly hourly, so toasting on *any* session would
      // greet a returning visitor with "Authentication state updated." before
      // they touched anything. Only a real sign-in is worth announcing.
      if (event === "SIGNED_IN" && nextSession) {
        showToast("Authentication state updated.");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [showToast]);

  /** True for Supabase users whose email is allow-listed or whose
   *  `app_metadata.role` is `"admin"`. The review queue is only mounted for
   *  admins, and it re-checks internally (see lib/admin.ts). */
  const isAdmin = isAdminUser(session?.user);

  const updateAdminTool = async (
    toolId: string,
    updates: Partial<Tool>,
    action: AdminToolAction,
  ): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) {
      const next = readJsonArray<Tool>(STORAGE_KEYS.tools).map((tool) =>
        tool.id === toolId ? { ...tool, ...updates } : tool,
      );
      writeJsonArray(STORAGE_KEYS.tools, next);
      await fetchApprovedTools();
      return true;
    }

    // The review queue's Feature / For Sale toggles go through the same
    // service-role endpoint as its delete button: a write that Row Level
    // Security filters out reports no error at all, so the server's row count
    // (not the absence of an `error`) is what proves the update happened.
    const token = session?.access_token ?? null;
    if (token) {
      const result = await callAdminToolAction(action, toolId, token);
      if (result.ok) {
        await fetchApprovedTools();
        return true;
      }
      if (!isAdminApiUnavailable(result)) {
        showToast(`❌ ${result.error ?? "Could not update this listing."}`);
        return false;
      }
    }

    const { data: updatedRows, error } = await supabase
      .from("tools")
      .update(updates as never)
      .eq("id", toolId)
      .select("id");

    if (error || !Array.isArray(updatedRows) || updatedRows.length === 0) {
      showToast("❌ Could not update this listing (the write was blocked or matched no row).");
      return false;
    }
    await fetchApprovedTools();
    return true;
  };

  const handleSignOut = async () => {
    setLocalAuthenticated(false);
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    showToast("You have been signed out.");
  };

  // Submit a new tool into Supabase (goes to review queue with is_approved = false)
  //
  // `isPaddleCheckout` is true only when the caller is the paid $5 Featured flow
  // **after** Paddle confirmed the payment (see SubmitModal.tsx). In that case a
  // persistence failure must surface as an error - never as a local-only save -
  // because the customer has already paid for a Featured slot.
  const handleSubmitTool = async (newTool: Tool, isPaddleCheckout = false) => {
    // The client-generated id is persisted explicitly: the Paddle webhook
    // upgrades (or inserts) the row whose id matches custom_data.tool_id
    // (see lib/submissions.ts).
    const row = buildToolInsertRow(newTool);

    /**
     * Keeps a rejected submission in this browser so the visitor's typing is not
     * lost. `notice` must carry the real outcome: a local save is **not** a
     * submission, so the visitor may never be told the app is queued for review.
     */
    const saveSubmissionLocally = async (notice: string) => {
      try {
        const queued = readJsonArray<Tool>(STORAGE_KEYS.tools);
        const persisted = writeJsonArray(STORAGE_KEYS.tools, [
          ...queued,
          { ...newTool, ...pendingToolDefaults },
        ]);
        if (!persisted) throw new Error("Local storage is unavailable.");
        showToast(notice);
        await fetchApprovedTools();
      } catch {
        showToast(`❌ Could not save "${newTool.name}" in this browser.`);
      }
    };

    if (!isSupabaseConfigured || !supabase) {
      if (isPaddleCheckout) {
        throw new Error(
          "Supabase is not configured, so the paid Featured listing could not be saved.",
        );
      }
      await saveSubmissionLocally(`📋 "${newTool.name}" saved locally for review.`);
      return;
    }

    const { error } = await supabase.from("tools").insert(row as never);

    if (error) {
      console.error("Failed to submit tool:", error.message);
      // A paid listing can hit the primary key when api/paddle-webhook.ts got
      // to the payment first and already created this exact id: the customer has
      // the Featured listing they paid for, so this is a success, not an error.
      if (isPaddleCheckout && isDuplicateRowError(error)) {
        showToast(`✅ Payment received — "${newTool.name}" is already live as a Featured listing.`);
        await fetchApprovedTools();
        return;
      }
      if (isPaddleCheckout) {
        throw new Error(error.message);
      }

      // Supabase refused the row. This used to be swallowed into a
      // "saved locally for review" toast while SubmitModal showed the green
      // "submitted successfully" banner — so a rejected submission looked
      // queued and the review queue silently stayed empty (a single unknown
      // column, e.g. the `icon_url` that `public.tools` does not have, fails the
      // whole insert). Keep the visitor's data in this browser, state the real
      // reason from the server, and rethrow so the modal shows an inline error
      // and no false success instead of closing as if it worked.
      const reason = submissionRejectionReason(error);
      await saveSubmissionLocally(
        `❌ Supabase rejected "${newTool.name}": ${reason}. Saved in this browser only — it is NOT in the review queue.`,
      );
      throw new Error(reason);
    }

    if (session?.access_token) {
      syncSubmittedToolToResend(newTool.id, session.access_token);
    }

    showToast(
      isPaddleCheckout
        ? `✅ Payment received — "${newTool.name}" is queued and the Paddle webhook is activating its Featured slot.`
        : `📋 "${newTool.name}" submitted for review and will appear once approved.`,
    );
    await fetchApprovedTools();
  };

  /**
   * Drops a listing that an admin deleted from the review queue, so the grid and
   * any open detail modal stop showing a row that no longer exists.
   */
  const handleToolDeleted = (toolId: string) => {
    setTools((current) => current.filter((tool) => tool.id !== toolId));
    setSelectedDetailTool((current) => (current?.id === toolId ? null : current));
    showToast("🗑️ Listing deleted from Supabase.");
  };

  const handleAdminDeleteTool = async (toolId: string): Promise<boolean> => {
    const token = session?.access_token;
    if (!isAdmin || !token) {
      showToast("❌ Sign in as an administrator to delete listings.");
      return false;
    }
    const result = await callAdminToolAction("delete", toolId, token);
    if (!result.ok) {
      showToast(`❌ ${result.error ?? "Could not delete this listing."}`);
      return false;
    }
    handleToolDeleted(toolId);
    return true;
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
      const votedTools = readStringArray(STORAGE_KEYS.votedTools);
      const isUpvoting = !tool.user_has_upvoted;
      writeStringArray(
        STORAGE_KEYS.votedTools,
        isUpvoting ? [...new Set([...votedTools, toolId])] : votedTools.filter((id) => id !== toolId),
      );
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
    const votedTools = readStringArray(STORAGE_KEYS.votedTools);
    if (result?.voted) writeStringArray(STORAGE_KEYS.votedTools, [...new Set([...votedTools, toolId])]);
    else writeStringArray(STORAGE_KEYS.votedTools, votedTools.filter((id) => id !== toolId));

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

  // Bookmarks are device-scoped (see lib/localStore.ts) and are applied to the
  // loaded listings so the card heart and the toast stay in sync.
  const handleToggleFavorite = (toolId: string) => {
    const savedIds = readStringArray(STORAGE_KEYS.savedTools);
    const isSaving = !savedIds.includes(toolId);
    const persisted = writeStringArray(
      STORAGE_KEYS.savedTools,
      isSaving ? [...savedIds, toolId] : savedIds.filter((id) => id !== toolId),
    );
    setTools((prev) =>
      prev.map((tool) => (tool.id === toolId ? { ...tool, is_favorite: isSaving } : tool)),
    );
    setSelectedDetailTool((current) =>
      current?.id === toolId ? { ...current, is_favorite: isSaving } : current,
    );
    showToast(
      persisted
        ? isSaving
          ? "Saved to your favorites."
          : "Removed from your favorites."
        : // Private mode / full quota: say so instead of implying it was stored.
          "Favorites could not be saved in this browser.",
    );
  };

  // Listings inside the active All Apps / For Sale tab - drives category counts
  const viewScopedTools = tools.filter(
    (tool) => viewMode !== "for_sale" || tool.is_for_sale,
  );

  // Interactive category pills, each labelled with its live listing count
  const categoryOptions = buildCategoryOptions(viewScopedTools);

  // Filter approved tools by view mode, pricing, category and search query
  const filteredTools = tools.filter((tool) =>
    matchesToolFilters(tool, {
      viewMode,
      pricingFilter,
      categoryFilter,
      searchQuery,
    }),
  );

  // Apply the interactive sort order to a copy so React state stays untouched
  const displayedTools = sortTools(filteredTools, sortOption);

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
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
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
              type="button"
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
              type="button"
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
              {PRICING_FILTER_OPTIONS.map((filter) => (
                <button
                  type="button"
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
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sort + Category Filter Controls */}
        <div className="flex flex-col gap-3 mb-4 xl:flex-row xl:items-start xl:justify-between">
          {/* Sort options: Most Popular / Recently Added */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Sort
            </span>
            <div
              role="group"
              aria-label="Sort listings"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 gap-1 shadow-sm"
            >
              {SORT_OPTIONS.map((option) => {
                const isActive = sortOption === option;
                const SortIcon = option === "Most Popular" ? TrendingUp : Clock;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSortOption(option)}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                      isActive
                        ? "bg-slate-900 text-white border-transparent"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent",
                    ].join(" ")}
                  >
                    <SortIcon className="w-3.5 h-3.5" />
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category filter pills with live listing counts */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Tag className="w-3.5 h-3.5" />
              Category
            </span>
            <div
              role="group"
              aria-label="Filter by category"
              className="flex flex-wrap gap-1.5"
            >
              {categoryOptions.map(({ label, count }) => {
                const isActive = categoryFilter === label;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setCategoryFilter(label)}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap",
                      isActive
                        ? "bg-amber-500 text-slate-950 border-transparent shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {label}
                    <span
                      className={[
                        "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        isActive
                          ? "bg-slate-950/15 text-slate-950"
                          : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Active sort / category summary */}
        <p className="mb-4 text-xs text-slate-500">
          Showing{" "}
          <strong className="text-slate-900">{displayedTools.length}</strong>{" "}
          {displayedTools.length === 1 ? "listing" : "listings"} sorted by{" "}
          <strong className="text-slate-900">{sortOption}</strong>
          {categoryFilter !== ALL_CATEGORIES ? (
            <>
              {" "}
              in <strong className="text-slate-900">{categoryFilter}</strong>
            </>
          ) : null}
        </p>

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
          <>
            {displayedTools.some((tool) => tool.is_featured) && (
              <div className="max-w-7xl mx-auto px-4 pt-8">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 shrink-0">
                  <FeaturedBadgeIcon className="h-5 w-5 shrink-0" />
                  <span className="bg-linear-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-300">
                    FEATURED RECOMMENDATIONS
                  </span>
                </div>
              </div>
            )}
            <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onToggleUpvote={handleToggleUpvote}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenAcquisition={(t) => setSelectedAcquisitionTool(t)}
                  onOpenDetails={openToolDetails}
                  onOpenDealRoom={(t) => setSelectedDealRoomTool(t)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500">
              {tools.length === 0
                ? "No approved tools submitted yet."
                : "No tools match your current filters."}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPricingFilter("All");
                setViewMode("all");
                setSortOption("Most Popular");
                setCategoryFilter(ALL_CATEGORIES);
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
              <button type="button" onClick={() => { setAuthMode("signup"); setIsAuthOpen(true); }} className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition">Sign Up Free</button>
              <button type="button" onClick={() => { setAuthMode("login"); setIsAuthOpen(true); }} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition">Log In</button>
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
        // The offline offer record is keyed by buyer, and the deal room reads it
        // back by the same id (see src/lib/localStore.ts).
        userId={session?.user.id ?? "local-demo-user"}
        onOpenDealRoom={(tool) => {
          setSelectedAcquisitionTool(null);
          setSelectedDealRoomTool(tool);
        }}
      />}

      <ToolDetailModal
        isOpen={Boolean(selectedDetailTool)}
        tool={selectedDetailTool}
        isAdmin={isAdmin}
        onClose={closeToolDetails}
        onToggleUpvote={(toolId) => void handleToggleUpvote(toolId)}
        onToggleFavorite={handleToggleFavorite}
        onAdminDelete={handleAdminDeleteTool}
        onOpenAcquisition={(tool) => {
          setSelectedDetailTool(null);
          setSelectedAcquisitionTool(tool);
        }}
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

      {isAuthenticated && isAdmin && <AdminQueueModal
        isOpen={isAdminQueueOpen}
        onClose={() => setIsAdminQueueOpen(false)}
        user={session?.user}
        onSetFeature={(toolId, isFeatured) => updateAdminTool(toolId, { is_featured: isFeatured }, isFeatured ? "feature" : "unfeature")}
        onSetForSale={(toolId, isForSale) => updateAdminTool(toolId, { is_for_sale: isForSale }, isForSale ? "for_sale" : "unlist")}
        onToolDeleted={handleToolDeleted}
      />}

      <Footer
        onOpenFAQ={() => setIsFAQOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenSupport={() => setIsSupportOpen(true)}
      />
      <FAQModal isOpen={isFAQOpen} onClose={() => setIsFAQOpen(false)} />
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
}
