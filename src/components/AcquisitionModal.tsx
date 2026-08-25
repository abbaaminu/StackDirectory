import React, { useState } from 'react';
import { X, DollarSign, TrendingUp, Cpu, Mail, ExternalLink, ShieldCheck, CheckCircle2, Send, Sparkles, AlertCircle, Copy, Check } from 'lucide-react';
import { Tool } from '../types/directory';

interface AcquisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: Tool | null;
}

export const AcquisitionModal: React.FC<AcquisitionModalProps> = ({
  isOpen,
  onClose,
  tool,
}) => {
  const [offerAmount, setOfferAmount] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [buyerMessage, setBuyerMessage] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  if (!isOpen || !tool) return null;

  const askingPrice = tool.asking_price || 0;
  const mrr = tool.monthly_revenue || 0;
  const profit = tool.monthly_profit || 0;
  const arr = mrr * 12;
  const multiple = arr > 0 ? (askingPrice / arr).toFixed(1) : 'N/A';
  const profitMargin = mrr > 0 ? Math.round((profit / mrr) * 100) : 0;
  const commission = Math.round(askingPrice * 0.10);

  const handleCopyEmail = () => {
    if (tool.seller_contact) {
      navigator.clipboard.writeText(tool.seller_contact);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleSubmitInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setHasSent(true);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c0d14] border border-amber-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Ribbon */}
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 shadow-sm shadow-amber-500/20">
            <Sparkles className="w-3.5 h-3.5 fill-zinc-950" />
            STARTUP ACQUISITION DEAL
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            ID: {tool.id}
          </span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              {tool.name}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1 font-medium">
              {tool.tagline}
            </p>
          </div>
          <a
            href={tool.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
          >
            <span>Live App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Financial Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/40">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Asking Price
            </span>
            <span className="text-xl font-black text-white mt-1 block">
              ${askingPrice.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {multiple !== 'N/A' ? `${multiple}x ARR multiple` : 'Valuation'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              Monthly Revenue
            </span>
            <span className="text-xl font-black text-white mt-1 block">
              ${mrr.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              ARR: ${(arr).toLocaleString()}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
              Monthly Profit
            </span>
            <span className="text-xl font-black text-white mt-1 block">
              ${profit.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {profitMargin}% margin
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
              Category & Model
            </span>
            <span className="text-sm font-bold text-white mt-1 block truncate">
              {tool.category}
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {tool.pricing_type}
            </span>
          </div>
        </div>

        {/* Tech Stack Chips */}
        {tool.tech_stack && tool.tech_stack.length > 0 && (
          <div className="mt-5 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 mb-2">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Verified Tech Stack & Architecture:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tool.tech_stack.map((tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 font-mono"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description & Problem Solved */}
        <div className="mt-4 p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed">
          <span className="font-bold text-white block mb-1">Asset Description & Ops:</span>
          {tool.description}
        </div>

        {/* Platform Commission Notice */}
        <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">StackDirectory Escrow & Deal Terms:</span>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Free to list for sale. StackDirectory collects a <strong>10% platform commission fee</strong> (${commission.toLocaleString()} on this deal) upon successful acquisition closure and asset handover.
            </p>
          </div>
        </div>

        {/* Direct Seller Contact / Inquiry Form */}
        <div className="mt-6 border-t border-zinc-800 pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                Contact Seller Directly
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Send an acquisition LOI or discuss metrics with the founder.
              </p>
            </div>

            {tool.seller_contact && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-amber-300 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                  {tool.seller_contact}
                </span>
                <button
                  onClick={handleCopyEmail}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
                  title="Copy seller contact"
                >
                  {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {hasSent ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Acquisition Inquiry Dispatched!</h4>
              <p className="text-xs text-zinc-300 max-w-md mx-auto">
                Your offer and NDA inquiry have been forwarded to <code className="text-emerald-300 font-mono">{tool.seller_contact || 'the founder'}</code>. They will reply within 24-48 hours.
              </p>
              <button
                onClick={() => setHasSent(false)}
                className="text-xs text-amber-400 hover:underline pt-2 font-medium"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitInquiry} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Your Buyer Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="buyer@fund.com"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs border border-zinc-800 focus:border-amber-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Proposed Offer / Budget (USD)
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. $${askingPrice.toLocaleString()}`}
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs border border-zinc-800 focus:border-amber-500 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Message / Due Diligence Questions
                </label>
                <textarea
                  rows={2}
                  value={buyerMessage}
                  onChange={(e) => setBuyerMessage(e.target.value)}
                  placeholder="Hi! I am interested in acquiring this startup. Could you share P&L statements and Stripe MRR verification?"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs border border-zinc-800 focus:border-amber-500 outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Sending Inquiry...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Dispatch Acquisition Inquiry</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
