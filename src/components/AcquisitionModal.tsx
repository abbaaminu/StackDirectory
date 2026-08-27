import React, { useState } from "react";
import {
  X,
  DollarSign,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  Send,
  AlertCircle,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { Tool } from "../types/directory";
import supabase from "../lib/supabase";

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
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [offerAmount, setOfferAmount] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !tool) return null;

  const askingPrice = tool.asking_price ?? 0;

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Basic validation
    if (!buyerName.trim()) {
      setErrorMsg("Please provide your name.");
      return;
    }
    if (!buyerEmail.trim()) {
      setErrorMsg("Please provide your email.");
      return;
    }
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg("Please enter a valid offer amount in USD.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("acquisition_offers").insert({
        tool_id: tool.id,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        offer_amount: amount,
        message: message.trim() || null,
        status: "pending",
      } as never);

      if (error) {
        console.error("[Acquisition] Failed to insert offer:", error.message);
        setErrorMsg(
          "Could not submit your offer. Please try again in a moment.",
        );
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setHasSubmitted(true);
    } catch (err) {
      console.error("[Acquisition] Unexpected error:", err);
      setErrorMsg(
        "Something went wrong submitting your offer. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form state when closing so it's fresh next time
    setBuyerName("");
    setBuyerEmail("");
    setOfferAmount("");
    setMessage("");
    setErrorMsg(null);
    setHasSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-2xl p-6 sm:p-7 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 shadow-sm shadow-amber-500/20">
            <Sparkles className="w-3.5 h-3.5 fill-zinc-950" />
            MAKE AN OFFER
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            ID: {tool.id}
          </span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {tool.name}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 mt-0.5 font-medium line-clamp-2">
              {tool.tagline}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              Asking Price
            </span>
            <span className="text-lg font-black text-white block">
              ${askingPrice.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-500 block">
              {tool.pricing_type} · {tool.category}
            </span>
          </div>
        </div>

        {hasSubmitted ? (
          /* Confirmation State */
          <div className="mt-6 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h4 className="text-base font-bold text-white">Offer submitted!</h4>
            <p className="text-sm text-zinc-300 max-w-sm mx-auto leading-relaxed">
              The startup owner and StackBuild team will review your inquiry.
            </p>
            <div className="text-xs text-zinc-400 space-y-1 pt-1">
              <p>
                <span className="text-zinc-500">Buyer:</span> {buyerName} ·{" "}
                {buyerEmail}
              </p>
              <p>
                <span className="text-zinc-500">Offer:</span> $
                {parseFloat(offerAmount || "0").toLocaleString()} USD
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Done
            </button>
          </div>
        ) : (
          /* Offer Form State */
          <form onSubmit={handleSubmitOffer} className="mt-5 space-y-4">
            {/* Buyer Name */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Buyer Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Cooper"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Buyer Email */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Buyer Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="email"
                  required
                  placeholder="buyer@fund.com"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Offer Amount */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Offer Amount ($USD) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500" />
                <input
                  type="number"
                  required
                  min={1}
                  step="any"
                  placeholder={askingPrice ? `${askingPrice}` : "25000"}
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition placeholder:text-zinc-600"
                />
              </div>
              {askingPrice > 0 && (
                <p className="text-[11px] text-zinc-500 mt-1">
                  Asking price is ${askingPrice.toLocaleString()}. Offers may be
                  negotiated.
                </p>
              )}
            </div>

            {/* Optional Message / Proof of Funds */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Message / Proof of Funds (Optional)
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-3.5 h-3.5 text-zinc-500" />
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a note with verification, funding details, or questions for the seller..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition placeholder:text-zinc-600 resize-none"
                />
              </div>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Trust Note */}
            <div className="flex items-start gap-2 text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Your offer is sent privately to the StackBuild team who will
                review it on behalf of the startup owner.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Offer</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
