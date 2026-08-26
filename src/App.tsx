import { useState, useEffect, useCallback } from 'react';
import { Search, X, CheckCircle2, ShoppingBag, LayoutGrid } from 'lucide-react';
import supabase from './lib/supabase';
import type { Tool, PricingType } from './types/directory';
import { Header } from './components/Header';
import { ToolCard } from './components/ToolCard';
import { SubmitModal } from './components/SubmitModal';
import { AcquisitionModal } from './components/AcquisitionModal';

const PRICING_FILTERS: ReadonlyArray<'All' | PricingType> = [
  'All',
  'Free',
  'Freemium',
  'Paid',
];

type ViewMode = 'all' | 'for_sale';

const VOTED_TOOLS_KEY = 'voted_tools';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [pricingFilter, setPricingFilter] = useState<'All' | PricingType>('All');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Submit modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Acquisition modal
  const [selectedAcquisitionTool, setSelectedAcquisitionTool] = useState<Tool | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchApprovedTools = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tools')
        .select('*')
        .eq('is_approved', true)
        .order('upvotes', { ascending: false });

      if (error) {
        console.error('Failed to load tools:', error.message);
        setError(error.message);
        return;
      }

      setTools((data as Tool[]).map((tool) => ({
        ...tool,
        // Restore persistent upvote state across page reloads
        user_has_upvoted: getVotedTools().includes(tool.id),
      })) ?? []);
    } catch (err) {
      console.error('Unexpected error fetching tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tools');
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
      .from('tools')
      .insert(row as unknown as never[]);

    if (error) {
      console.error('Failed to submit tool:', error.message);
      showToast(`❌ Failed to submit "${newTool.name}". Please try again.`);
      return;
    }

    showToast(`📋 "${newTool.name}" submitted for review and will appear once approved.`);
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
      .from('tools')
      .update({ upvotes: nextUpvotes } as never)
      .eq('id', toolId);

        if (error) {
      console.error('Failed to update upvotes:', error.message);
      showToast('❌ Could not update upvote.');
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
          ? { ...t, upvotes: nextUpvotes, user_has_upvoted: !t.user_has_upvoted }
          : t
      )
    );
  };

    // Filter approved tools by view mode, search query and pricing filter
  const displayedTools = tools.filter((tool) => {
    if (viewMode === 'for_sale' && !tool.is_for_sale) {
      return false;
    }

    if (pricingFilter !== 'All' && tool.pricing_type !== pricingFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = tool.name.toLowerCase().includes(q);
      const matchesTagline = tool.tagline.toLowerCase().includes(q);
      const matchesCategory = tool.category.toLowerCase().includes(q);
      const matchesDesc = tool.description.toLowerCase().includes(q);
      const matchesTech = tool.tech_stack?.some((t) => t.toLowerCase().includes(q));
      if (!matchesName && !matchesTagline && !matchesCategory && !matchesDesc && !matchesTech) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
            {/* Header with Submit App button */}
      <Header
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md">
          <div className="p-4 rounded-xl shadow-2xl flex items-center gap-3 bg-zinc-900/95 text-zinc-200 border border-zinc-700 text-xs font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-zinc-500 hover:text-white ml-auto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

            <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">StackDirectory</h1>
            <p className="text-sm text-slate-400 mt-1">
              Discover, upvote, and submit the best developer tools &amp; startups.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900 p-1 gap-1">
            <button
              onClick={() => setViewMode('all')}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                viewMode === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'text-slate-300 hover:text-white border border-transparent',
              ].join(' ')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              All Apps
            </button>
            <button
              onClick={() => setViewMode('for_sale')}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                viewMode === 'for_sale'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'text-slate-300 hover:text-white border border-transparent',
              ].join(' ')}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              For Sale (Acquire Mode)
              <span className="w-5 h-5 rounded-md bg-zinc-800 text-[10px] font-bold grid place-items-center">
                {tools.filter((t) => t.is_for_sale).length}
              </span>
            </button>
          </div>

          {/* Pricing Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Pricing:</span>
            <div className="flex flex-wrap gap-1.5">
              {PRICING_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setPricingFilter(filter)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition',
                    pricingFilter === filter
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-zinc-900 text-slate-300 border-zinc-700 hover:border-zinc-600',
                  ].join(' ')}
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
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-zinc-900 text-white text-sm border border-zinc-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-slate-400">Loading approved tools…</p>
        ) : error ? (
          <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 text-red-200 text-sm">
            <p className="font-semibold mb-1">Failed to load tools</p>
            <p>{error}</p>
          </div>
        ) : displayedTools.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:grid-cols-3">
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
                    <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800">
            <p className="text-slate-400">
              {tools.length === 0
                ? 'No approved tools submitted yet.'
                : 'No tools match your current filters.'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setPricingFilter('All');
                setViewMode('all');
              }}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition"
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
    </div>
  );
}
