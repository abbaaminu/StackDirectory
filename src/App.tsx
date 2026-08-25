import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { ToolCard } from './components/ToolCard';
import { SubmitModal } from './components/SubmitModal';
import { PaddleWebhookSimulator } from './components/PaddleWebhookSimulator';
import { CodeViewerModal } from './components/CodeViewerModal';
import { AdminQueueModal } from './components/AdminQueueModal';
import { AcquisitionModal } from './components/AcquisitionModal';
import { INITIAL_TOOLS } from './data/mockTools';
import { Tool } from './types/directory';
import { Sparkles, Zap, CheckCircle2, AlertCircle, Code2, Plus, ShoppingBag } from 'lucide-react';

export default function App() {
  const [tools, setTools] = useState<Tool[]>(() => {
    try {
      const saved = localStorage.getItem('directory_tools_state');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading saved tools state:', e);
    }
    return INITIAL_TOOLS;
  });

  // Filters and Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPricing, setSelectedPricing] = useState('All');
  const [sortBy, setSortBy] = useState<'featured' | 'upvotes' | 'newest' | 'for_sale'>('featured');

  // Modals & Panels State
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [selectedWebhookToolId, setSelectedWebhookToolId] = useState<string | undefined>(undefined);
  const [selectedAcquisitionTool, setSelectedAcquisitionTool] = useState<Tool | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('directory_tools_state', JSON.stringify(tools));
    } catch (e) {
      console.error('Error saving tools state:', e);
    }
  }, [tools]);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Upvote Handler
  const handleToggleUpvote = (toolId: string) => {
    setTools((prev) =>
      prev.map((tool) => {
        if (tool.id === toolId) {
          const hasUpvoted = !tool.user_has_upvoted;
          return {
            ...tool,
            user_has_upvoted: !hasUpvoted,
            upvotes: hasUpvoted ? Math.max(0, tool.upvotes - 1) : tool.upvotes + 1,
          };
        }
        return tool;
      })
    );
  };

  // Submit Handler
  const handleSubmitTool = (newTool: Tool, isPaddleCheckout: boolean) => {
    setTools((prev) => [newTool, ...prev]);

    if (isPaddleCheckout) {
      showToast(
        `🎉 Paddle Payment Verified! "${newTool.name}" is now live and featured at the top of the directory!`,
        'success'
      );
    } else {
      showToast(
        `📋 "${newTool.name}" submitted to Supabase review queue (is_approved = false).`,
        'info'
      );
    }
  };

  // Paddle Webhook Upgrade Handler
  const handleTriggerWebhookUpgrade = (toolId: string, customerId: string) => {
    setTools((prev) =>
      prev.map((tool) => {
        if (tool.id === toolId) {
          return {
            ...tool,
            is_approved: true,
            is_featured: true,
            paddle_customer_id: customerId,
          };
        }
        return tool;
      })
    );

    const target = tools.find((t) => t.id === toolId);
    showToast(
      `⚡ Webhook Processed: "${target?.name || toolId}" upgraded to Featured & Approved via Paddle transaction.completed!`,
      'success'
    );
  };

  // Admin Queue Actions
  const handleApproveTool = (toolId: string) => {
    setTools((prev) =>
      prev.map((tool) => (tool.id === toolId ? { ...tool, is_approved: true } : tool))
    );
    showToast('Tool approved and published to public directory view.', 'success');
  };

  const handleRejectTool = (toolId: string) => {
    setTools((prev) => prev.filter((tool) => tool.id !== toolId));
    showToast('Tool removed from review queue.', 'info');
  };

  const handleToggleFeature = (toolId: string) => {
    setTools((prev) =>
      prev.map((tool) =>
        tool.id === toolId
          ? { ...tool, is_approved: true, is_featured: !tool.is_featured }
          : tool
      )
    );
  };

  const handleOpenUpgradeForTool = (tool: Tool) => {
    setSelectedWebhookToolId(tool.id);
    setIsWebhookModalOpen(true);
  };

  const handleOpenAcquisition = (tool: Tool) => {
    setSelectedAcquisitionTool(tool);
  };

  // Filtered and Sorted Approved Tools
  const approvedTools = useMemo(() => {
    return tools.filter((tool) => tool.is_approved);
  }, [tools]);

  const pendingTools = useMemo(() => {
    return tools.filter((tool) => !tool.is_approved);
  }, [tools]);

  const forSaleCount = useMemo(() => {
    return approvedTools.filter((tool) => tool.is_for_sale).length;
  }, [approvedTools]);

  const displayedTools = useMemo(() => {
    return approvedTools
      .filter((tool) => {
        // Search filter
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

        // Category filter
        if (selectedCategory === 'Startups For Sale') {
          if (!tool.is_for_sale) {
            return false;
          }
        } else if (selectedCategory !== 'All' && tool.category !== selectedCategory) {
          return false;
        }

        // Pricing filter
        if (selectedPricing !== 'All' && tool.pricing_type !== selectedPricing) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'for_sale') {
          if (a.is_for_sale && !b.is_for_sale) return -1;
          if (!a.is_for_sale && b.is_for_sale) return 1;
          return b.upvotes - a.upvotes;
        }
        if (sortBy === 'featured') {
          // Featured first, then upvotes
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return b.upvotes - a.upvotes;
        }
        if (sortBy === 'upvotes') {
          return b.upvotes - a.upvotes;
        }
        if (sortBy === 'newest') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return 0;
      });
  }, [approvedTools, searchQuery, selectedCategory, selectedPricing, sortBy]);

  const featuredCount = useMemo(
    () => approvedTools.filter((t) => t.is_featured).length,
    [approvedTools]
  );

  return (
    <div className="min-h-screen bg-[#07080d] text-zinc-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-slide-up">
          <div
            className={`p-4 rounded-xl shadow-2xl flex items-center gap-3 border text-xs font-medium ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-900/20'
                : 'bg-zinc-900/95 text-zinc-200 border-zinc-700 shadow-black/40'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <Header
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onOpenCodeViewer={() => setIsCodeModalOpen(true)}
        onOpenWebhookSimulator={() => {
          setSelectedWebhookToolId(undefined);
          setIsWebhookModalOpen(true);
        }}
        onOpenAdminQueue={() => setIsAdminModalOpen(true)}
        pendingCount={pendingTools.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Hero Section with Search & Filter Controls */}
        <Hero
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedPricing={selectedPricing}
          onPricingChange={setSelectedPricing}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalApproved={approvedTools.length}
          featuredCount={featuredCount}
          forSaleCount={forSaleCount}
          onOpenSubmit={() => setIsSubmitModalOpen(true)}
        />

        {/* Directory Grid / Masonry View */}
        <section className="mt-8">
          {displayedTools.length === 0 ? (
            <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 max-w-2xl mx-auto p-8">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">No startups or tools found</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                No listings matched your current search or category filter. Try clearing your search or list your startup for free.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                    setSelectedPricing('All');
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                >
                  Reset Filters
                </button>
                <button
                  onClick={() => setIsSubmitModalOpen(true)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition"
                >
                  Submit Startup
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onToggleUpvote={handleToggleUpvote}
                  onOpenUpgradeForTool={handleOpenUpgradeForTool}
                  onOpenAcquisition={handleOpenAcquisition}
                />
              ))}
            </div>
          )}
        </section>

        {/* Bottom Banner with Quick Architecture Jump */}
        <section className="mt-16 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-zinc-900/90 via-zinc-900/50 to-zinc-900/90 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <Zap className="w-4 h-4 fill-amber-400" />
              <span>Full-Stack Next.js 15 Baseline</span>
            </div>
            <h4 className="text-lg font-bold text-white">
              Ready to deploy this startup acquisition directory to Supabase & Paddle?
            </h4>
            <p className="text-xs text-zinc-400 max-w-xl">
              Copy the complete SQL migration scripts (with startup marketplace fields), Next.js Server Components, Paddle Webhook Route Handler, and Supabase client files directly into your project.
            </p>
          </div>

          <button
            onClick={() => setIsCodeModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition shrink-0"
          >
            <Code2 className="w-4 h-4" />
            <span>Open Code & SQL Migration Hub</span>
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#06070a] py-8 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-bold text-zinc-200">StackDirectory</span>
            <span>—</span>
            <span>Startup Discovery & Acquisition Marketplace (Next.js • Supabase • Paddle)</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <button
              onClick={() => setIsCodeModalOpen(true)}
              className="hover:text-amber-300 transition underline underline-offset-2"
            >
              SQL Schema Migration
            </button>
            <button
              onClick={() => setIsWebhookModalOpen(true)}
              className="hover:text-amber-300 transition underline underline-offset-2"
            >
              Paddle Webhook Handler
            </button>
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="hover:text-amber-300 transition underline underline-offset-2"
            >
              Review Queue ({pendingTools.length})
            </button>
          </div>
        </div>
      </footer>

      {/* Submission Modal */}
      <SubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmitTool={handleSubmitTool}
      />

      {/* Paddle Webhook Simulator Modal */}
      <PaddleWebhookSimulator
        isOpen={isWebhookModalOpen}
        onClose={() => {
          setIsWebhookModalOpen(false);
          setSelectedWebhookToolId(undefined);
        }}
        tools={tools}
        onTriggerWebhookUpgrade={handleTriggerWebhookUpgrade}
        selectedToolId={selectedWebhookToolId}
      />

      {/* Code Viewer Modal */}
      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
      />

      {/* Admin Queue Modal */}
      <AdminQueueModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        tools={tools}
        onApproveTool={handleApproveTool}
        onRejectTool={handleRejectTool}
        onToggleFeature={handleToggleFeature}
      />

      {/* Startup Acquisition Modal */}
      <AcquisitionModal
        isOpen={!!selectedAcquisitionTool}
        onClose={() => setSelectedAcquisitionTool(null)}
        tool={selectedAcquisitionTool}
        onOfferSubmitted={(offerSummary) => {
          showToast(`📬 ${offerSummary}`, 'success');
        }}
      />
    </div>
  );
}

