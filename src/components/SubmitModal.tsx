import React, { useState } from 'react';
import { X, Sparkles, Zap, ShieldAlert, CheckCircle2, ArrowRight, CreditCard, Lock } from 'lucide-react';
import { PricingType, SubmissionFormState, Tool } from '../types/directory';
import { CATEGORIES } from '../data/mockTools';

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitTool: (newTool: Tool, isPaddleCheckout: boolean) => void;
}

export const SubmitModal: React.FC<SubmitModalProps> = ({
  isOpen,
  onClose,
  onSubmitTool,
}) => {
  const [formData, setFormData] = useState<SubmissionFormState>({
    name: '',
    tagline: '',
    description: '',
    website_url: '',
    category: 'Developer Tools',
    pricing_type: 'Freemium',
    tier: 'paddle_featured',
    customer_email: '',
  });

  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name.trim() || !formData.tagline.trim() || !formData.website_url.trim()) {
      setErrorMsg('Please fill in all required fields (Name, Tagline, and Website URL).');
      return;
    }

    let normalizedUrl = formData.website_url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const toolId = `tool_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    if (formData.tier === 'paddle_featured') {
      // Simulate Paddle Checkout flow
      setIsProcessingCheckout(true);
      setTimeout(() => {
        setIsProcessingCheckout(false);
        setShowCheckoutSuccess(true);

        const newTool: Tool = {
          id: toolId,
          name: formData.name.trim(),
          tagline: formData.tagline.trim(),
          description: formData.description.trim() || formData.tagline.trim(),
          website_url: normalizedUrl,
          category: formData.category,
          pricing_type: formData.pricing_type,
          upvotes: 1,
          is_approved: true, // Upgraded instantly via Paddle
          is_featured: true, // Upgraded instantly via Paddle
          paddle_customer_id: `ctm_pdl_${Math.random().toString(36).substring(2, 9)}`,
          created_at: new Date().toISOString(),
          user_has_upvoted: true,
        };

        setTimeout(() => {
          onSubmitTool(newTool, true);
          setShowCheckoutSuccess(false);
          onClose();
        }, 1200);
      }, 1500);
    } else {
      // Free Submission -> Queue for review
      const newTool: Tool = {
        id: toolId,
        name: formData.name.trim(),
        tagline: formData.tagline.trim(),
        description: formData.description.trim() || formData.tagline.trim(),
        website_url: normalizedUrl,
        category: formData.category,
        pricing_type: formData.pricing_type,
        upvotes: 0,
        is_approved: false, // Free queue
        is_featured: false,
        paddle_customer_id: null,
        created_at: new Date().toISOString(),
        user_has_upvoted: false,
      };

      onSubmitTool(newTool, false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#0e0f17] border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Submit Your Startup / Desktop App</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            List on StackDirectory
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Choose between standard free review queue or instant Paddle featured launch.
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Plan Tier Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Free Tier Card */}
            <div
              onClick={() => setFormData({ ...formData, tier: 'free' })}
              className={`cursor-pointer rounded-xl p-4 border transition-all ${
                formData.tier === 'free'
                  ? 'bg-zinc-800/80 border-zinc-500 ring-1 ring-zinc-400'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Free Queue</span>
                <span className="text-sm font-black text-white">$0</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                App is saved to Supabase with <code className="text-zinc-300">is_approved = false</code>. Subject to manual review queue.
              </p>
            </div>

            {/* Paddle Instant Featured Tier Card */}
            <div
              onClick={() => setFormData({ ...formData, tier: 'paddle_featured' })}
              className={`cursor-pointer rounded-xl p-4 border transition-all relative overflow-hidden ${
                formData.tier === 'paddle_featured'
                  ? 'bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-amber-500/5 border-amber-500 ring-2 ring-amber-500/30'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-amber-500/40'
              }`}
            >
              <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-zinc-950 text-[9px] font-black px-2 py-0.5 rounded-bl">
                INSTANT LAUNCH
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">Paddle Featured</span>
                </div>
                <span className="text-sm font-black text-amber-400 mr-12">$49</span>
              </div>
              <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">
                Instant approval, glowing gold border, priority top positioning, and webhook upgrade simulation.
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3.5 pt-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Startup / App Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. SupaSearch AI"
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Tagline (One-sentence punchline) *
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                placeholder="e.g. Ultra-fast semantic vector search for Postgres databases"
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Website URL *
                </label>
                <input
                  type="text"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://yourapp.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition cursor-pointer"
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Pricing Model
                </label>
                <select
                  value={formData.pricing_type}
                  onChange={(e) => setFormData({ ...formData, pricing_type: e.target.value as PricingType })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition cursor-pointer"
                >
                  <option value="Free">Free</option>
                  <option value="Freemium">Freemium</option>
                  <option value="Paid">Paid</option>
                  <option value="Open Source">Open Source</option>
                </select>
              </div>

              {formData.tier === 'paddle_featured' && (
                <div>
                  <label className="block text-xs font-medium text-amber-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Billing Email (Paddle)
                  </label>
                  <input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    placeholder="founder@startup.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-amber-500/40 focus:border-amber-500 outline-none transition"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Full Description (Optional)
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Explain the core problem solved, architecture, and desktop features..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition resize-none"
              />
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
            >
              Cancel
            </button>

            {formData.tier === 'paddle_featured' ? (
              <button
                type="submit"
                disabled={isProcessingCheckout || showCheckoutSuccess}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
              >
                {isProcessingCheckout ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Opening Paddle Checkout...</span>
                  </>
                ) : showCheckoutSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                    <span>Payment Verified! Upgrading...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Pay $49 with Paddle & Launch Instantly</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 transition"
              >
                <span>Submit to Free Review Queue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
