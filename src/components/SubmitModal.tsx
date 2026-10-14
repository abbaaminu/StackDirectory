import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Zap,
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  CreditCard,
  Lock,
  DollarSign,
  TrendingUp,
  Cpu,
  Mail,
  ShoppingBag,
} from "lucide-react";
import { PricingType, SubmissionFormState, Tool } from "../types/directory";
import { CATEGORIES } from "../data/mockTools";
import { createToolId } from "../lib/submissions";
import {
  isPaddleCheckoutAbandoned,
  isPaddleCheckoutCompleted,
} from "../lib/paddleCheckout";
import { getToolSlug } from "../lib/toolSlug";
import { useModalDismiss } from "../lib/useModalDismiss";

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Persists a submission. `isPaddleCheckout` is true only after Paddle has
   * confirmed the payment, and tells App to report failures instead of falling
   * back to a browser-only save (the customer has already paid).
   */
  onSubmitTool: (newTool: Tool, isPaddleCheckout?: boolean) => Promise<void>;
}

/**
 * Blank form state, shared by the initial `useState` and the reset that follows
 * a successful submission, so the two can never drift apart.
 */
const EMPTY_SUBMISSION: SubmissionFormState = {
  name: "",
  tagline: "",
  description: "",
  website_url: "",
  category: "Developer Tools",
  pricing_type: "Freemium",
  tier: "free",
  customer_email: "",
  is_for_sale: false,
  asking_price: "",
  monthly_revenue: "",
  monthly_profit: "",
  seller_contact: "",
  tech_stack: "Next.js, Supabase, Tailwind CSS",
};

export const SubmitModal: React.FC<SubmitModalProps> = ({
  isOpen,
  onClose,
  onSubmitTool,
}) => {
  const [formData, setFormData] = useState<SubmissionFormState>(EMPTY_SUBMISSION);

  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // (`step`, the wizard progress indicator, is derived from the form further down.)
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [paymentUnavailable, setPaymentUnavailable] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /** Set when Paddle took the payment but the row could not be persisted. */
  const [paidSaveError, setPaidSaveError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * The paid listing waiting for Paddle's confirmation. Nothing is written to
   * the database while this is only a ref: the insert happens in
   * `finalizePaidSubmission`, triggered by `checkout.completed`.
   */
  const pendingCheckoutToolRef = useRef<Tool | null>(null);
  /** Paddle can deliver `checkout.completed` more than once - insert only once. */
  const paidSubmissionHandledRef = useRef(false);
  /** Latest finalize implementation, so Paddle's callback never sees a stale closure. */
  const finalizePaidSubmissionRef = useRef<() => void>(() => {});
  /** Pending auto-close timer scheduled by `resetSubmitModal`. */
  const resetTimerRef = useRef<number | null>(null);

  // Escape closes the modal and the grid behind it stops scrolling.
  useModalDismiss(isOpen, onClose);

  const priceId = import.meta.env.VITE_PADDLE_PRICE_ID;
  const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;

  /**
   * Wizard progress, derived from the form instead of tracked in state. The old
   * `step` state was only ever set back to 1 when a submission succeeded, so a
   * visitor who reopened the modal could see "3. Checkout / Submit" highlighted
   * above an empty form.
   */
  const step: 1 | 2 | 3 =
    isSubmitting || showCheckoutSuccess || submissionSuccess
      ? 3
      : formData.name?.trim() && formData.website_url?.trim()
        ? 2
        : 1;

  const getUrlDetails = (value: string) => {
    try {
      const normalized = value.match(/^https?:\/\//i) ? value : `https://${value}`;
      const url = new URL(normalized);
      if (!url.hostname.includes(".")) return null;
      const domain = url.hostname.replace(/^www\./i, "");
      const firstLabel = domain.split(".")[0].replace(/[-_]+/g, " ");
      const name = firstLabel.replace(/\b\w/g, (letter) => letter.toUpperCase());
      return { normalized: url.toString(), domain, name };
    } catch {
      return null;
    }
  };

  const applyUrlDefaults = (value: string) => {
    const details = getUrlDetails(value);
    if (!details) {
      setFormData((current) => ({ ...current, website_url: value }));
      return;
    }
    setFormData((current) => ({
      ...current,
      website_url: value,
      name: current.name.trim() ? current.name : details.name,
      icon_url: current.icon_url || `https://www.google.com/s2/favicons?domain=${details.domain}&sz=128`,
    }));
  };

  useEffect(() => {
    const details = getUrlDetails(formData.website_url);
    if (details && !formData.icon_url) {
      setFormData((current) => ({
        ...current,
        name: current.name.trim() ? current.name : details.name,
        icon_url: `https://www.google.com/s2/favicons?domain=${details.domain}&sz=128`,
      }));
    }
  }, [formData.website_url, formData.icon_url]);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
      setIsProcessingCheckout(false);
      // Drop a pending "close after success" timer so it can never fire on a
      // modal the user has reopened in the meantime.
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      // A pending paid listing deliberately survives the close: Paddle may still
      // deliver checkout.completed, and that payment must not be lost.
      return;
    }
    if (window.Paddle && clientToken) {
      try {
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event) => {
            // Paddle Billing reports `checkout.completed` here (see
            // lib/paddleCheckout.ts) — this is the only signal that may create
            // the paid listing.
            if (isPaddleCheckoutCompleted(event)) {
              finalizePaidSubmissionRef.current();
              return;
            }
            if (isPaddleCheckoutAbandoned(event)) {
              if (paidSubmissionHandledRef.current) return;
              // Nothing was paid for, so drop the held listing.
              pendingCheckoutToolRef.current = null;
              setIsProcessingCheckout(false);
              setIsSubmitting(false);
              setShowCheckoutSuccess(false);
            }
          },
        });
      } catch (error) {
        console.error("Paddle initialization failed:", error);
        setPaymentError(error instanceof Error ? error.message : String(error));
        // The overlay can never open in this state, so offer the free fallback.
        setPaymentUnavailable(true);
      }
    }

    // Unmount safety net: no timer may outlive the component that owns it.
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [isOpen, clientToken]);

  /** Clears the form and closes the modal a moment after a successful submit. */
  const resetSubmitModal = (delayMs = 1500) => {
    // A second success must not stack a second timer behind the first one.
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setSubmissionSuccess(false);
      setShowCheckoutSuccess(false);
      setPaymentUnavailable(false);
      setPaymentError(null);
      setPaidSaveError(null);
      setFormData(EMPTY_SUBMISSION);
      pendingCheckoutToolRef.current = null;
      paidSubmissionHandledRef.current = false;
      onClose();
    }, delayMs);
  };

  /**
   * Persists the paid Featured listing. This is the ONLY database write on the
   * paid path, and it runs exclusively because Paddle reported
   * `checkout.completed`: an abandoned or still-open overlay must never leave a
   * row behind. api/paddle-webhook.ts mirrors this by inserting the same
   * `custom_data.tool_id` if the buyer never returns to the tab, so the two
   * paths converge on one row instead of duplicating it.
   */
  const finalizePaidSubmission = async () => {
    const pendingTool = pendingCheckoutToolRef.current;
    if (!pendingTool || paidSubmissionHandledRef.current) return;
    paidSubmissionHandledRef.current = true;

    setPaymentError(null);
    setPaidSaveError(null);
    setIsProcessingCheckout(false);
    setShowCheckoutSuccess(true);
    setIsSubmitting(true);

    try {
      await onSubmitTool(pendingTool, true);
      setSubmissionSuccess(true);
      resetSubmitModal();
    } catch (error) {
      console.error("Paid Featured submission could not be saved:", error);
      // The payment succeeded, so this must not be downgraded to a local-only
      // save. Allow a retry that saves the same listing without paying again.
      paidSubmissionHandledRef.current = false;
      setPaidSaveError(
        "Paddle confirmed your payment, but we could not save the listing automatically. Your payment is safe — retry saving below and you will not be charged again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  finalizePaidSubmissionRef.current = () => void finalizePaidSubmission();

  const handleAutoFill = async () => {
    const details = getUrlDetails(formData.website_url);
    if (!details) {
      setErrorMsg("Enter a valid website URL before using Auto-fill Details.");
      return;
    }
    setIsAutoFilling(true);
    setAutoFillMessage("");
    try {
      const response = await fetch(details.normalized, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error("Website unavailable");
      const html = await response.text();
      const document = new DOMParser().parseFromString(html, "text/html");
      const title = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.title;
      const description = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || document.querySelector('meta[name="description"]')?.getAttribute("content");
      const image = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
      setFormData((current) => ({
        ...current,
        name: current.name.trim() || title?.trim() || details.name,
        tagline: current.tagline.trim() || description?.trim() || `A developer tool from ${details.domain}`,
        description: current.description.trim() || description?.trim() || current.tagline.trim(),
        icon_url: image || current.icon_url || `https://www.google.com/s2/favicons?domain=${details.domain}&sz=128`,
      }));
      setAutoFillMessage("Details filled from the website.");
    } catch {
      setFormData((current) => ({
        ...current,
        name: current.name.trim() || details.name,
        tagline: current.tagline.trim() || `Developer tool at ${details.domain}`,
        icon_url: current.icon_url || `https://www.google.com/s2/favicons?domain=${details.domain}&sz=128`,
      }));
      setAutoFillMessage("Could not read the site directly. Added domain-based details.");
    } finally {
      setIsAutoFilling(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setPaymentUnavailable(false);
    setPaymentError(null);

    const nameValid = Boolean(formData.name?.trim());
    const taglineValid = Boolean(formData.tagline?.trim());
    const websiteUrlValid = Boolean(formData.website_url?.trim());
    const categoryValid = Boolean(formData.category?.trim());

    if (!nameValid || !taglineValid || !websiteUrlValid || !categoryValid) {
      setErrorMsg(
        "Please fill in all required fields (App Name, Tagline, Website URL, and Category).",
      );
      return;
    }

    if (formData.is_for_sale) {
      const askingPriceValid = Boolean(formData.asking_price) && Number(formData.asking_price) > 0;
      const sellerContactValid = Boolean(formData.seller_contact?.trim());
      if (!askingPriceValid) {
        setErrorMsg(
          "Please enter a valid Asking Price for your startup listing.",
        );
        return;
      }
      if (!sellerContactValid) {
        setErrorMsg(
          "Please provide a seller contact email or link for potential buyers.",
        );
        return;
      }
    }

    let normalizedUrl = formData.website_url.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Shared with the Paddle payload below: the webhook upgrades the row whose
    // id matches custom_data.tool_id (see lib/submissions.ts).
    const toolId = createToolId();

    // Parse tech stack array
    const parsedTechStack = formData.tech_stack
      ? formData.tech_stack
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const baseTool: Tool = {
      id: toolId,
      name: formData.name.trim(),
      tagline: formData.tagline.trim(),
      description: formData.description.trim() || formData.tagline.trim(),
      website_url: normalizedUrl,
      icon_url: formData.icon_url || `https://icon.horse/icon/${getUrlDetails(normalizedUrl)?.domain || ""}`,
      category:
        formData.category === "All" ? "Developer Tools" : formData.category,
      pricing_type: formData.pricing_type,
      upvotes: formData.tier === "paddle_featured" ? 1 : 0,
      is_approved: false,
      is_featured: false,
      status: "pending",
      paddle_customer_id: null,
      created_at: new Date().toISOString(),
      user_has_upvoted: formData.tier === "paddle_featured",

      // Startup Marketplace fields
      is_for_sale: formData.is_for_sale,
      asking_price: formData.is_for_sale
        ? Number(formData.asking_price) || 0
        : undefined,
      monthly_revenue: formData.is_for_sale
        ? Number(formData.monthly_revenue) || 0
        : 0,
      monthly_profit: formData.is_for_sale
        ? Number(formData.monthly_profit) || 0
        : 0,
      seller_contact: formData.is_for_sale
        ? formData.seller_contact?.trim()
        : undefined,
      tech_stack: formData.is_for_sale ? parsedTechStack : undefined,
    };

    const handleDirectSubmit = async () => {
      let submitted = false;
      try {
        await onSubmitTool(baseTool, false);
        setSubmissionSuccess(true);
        submitted = true;
      } catch (error) {
        console.error("Direct submission failed:", error);
        // App rethrows with the server's own reason (see handleSubmitTool), so
        // show it: a submission that never reached the queue must not look like
        // a generic hiccup the visitor can just retry blind.
        const reason =
          error instanceof Error && error.message.trim()
            ? ` ${error.message.trim()}`
            : "";
        setErrorMsg(`We could not submit your app for review.${reason}`);
      } finally {
        setIsSubmitting(false);
      }
      if (!submitted) return;
      resetSubmitModal();
    };

    if (formData.tier === "paddle_featured") {
      const paddle = window.Paddle;
      if (!paddle || !clientToken || !priceId) {
        const diagnostic = !paddle
          ? "Error: Paddle SDK not loaded on window"
          : !clientToken
            ? "Error: VITE_PADDLE_CLIENT_TOKEN is missing"
            : "Error: VITE_PADDLE_PRICE_ID is missing";
        setPaymentError(diagnostic);
        // Checkout cannot even start, so surface the banner that lets the user
        // submit the very same listing for free instead.
        setPaymentUnavailable(true);
        return;
      }

      // The listing is held in memory only. The database insert happens in
      // finalizePaidSubmission, which runs when Paddle reports
      // `checkout.completed` - or in api/paddle-webhook.ts when this tab never
      // comes back - so an abandoned checkout never creates a listing.
      pendingCheckoutToolRef.current = baseTool;
      paidSubmissionHandledRef.current = false;
      setPaymentError(null);
      setPaidSaveError(null);
      setShowCheckoutSuccess(false);
      setIsSubmitting(true);
      setIsProcessingCheckout(true);

      try {
        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: (formData.customer_email) ? { email: formData.customer_email || "" } : undefined,
          // Every value is a string - Paddle rejects nested or non-string
          // custom_data. tool_name / tool_slug / website_url / customer_email
          // are the fallbacks api/paddle-webhook.ts uses when it cannot read the
          // row by id; category / pricing_type / tagline / description let that
          // webhook build the complete row when it has to insert one.
          customData: {
            tool_id: baseTool.id,
            plan_type: "featured_listing",
            tool_name: baseTool.name,
            tool_slug: getToolSlug(baseTool),
            website_url: baseTool.website_url,
            customer_email: formData.customer_email?.trim() || "",
            category: baseTool.category,
            pricing_type: baseTool.pricing_type,
            tagline: baseTool.tagline,
            description: baseTool.description,
          },
          settings: { displayMode: "overlay" },
        });
      } catch (error) {
        console.error("Paddle checkout failed:", error);
        // The overlay never opened, so nothing can be paid for: release the
        // held listing.
        pendingCheckoutToolRef.current = null;
        setIsProcessingCheckout(false);
        setIsSubmitting(false);
        setPaymentError(error instanceof Error ? error.message : String(error));
        setErrorMsg("Payment could not be opened. Please check your Paddle configuration and try again.");
      }
    } else {
      // Free Submission -> Queue for review
      setIsSubmitting(true);
      void handleDirectSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-[#0e0f17] border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>List Startup, Micro-SaaS & Developer Tools</span>
          </div>
          <h2 id="submit-modal-title" className="text-2xl font-bold text-white tracking-tight">
            Submit to StackDirectory
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Standard directory listings are 100% free. Upgrade to Featured
            Launch with Paddle ($5).
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-[11px] font-semibold">
          {["Tool details", "Listing tier", "Checkout / Submit"].map((label, index) => (
            <div key={label} className={`border-b-2 pb-2 ${step >= index + 1 ? "border-amber-400 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
              <span className="mr-1">{index + 1}.</span>{label}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {submissionSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            App submitted successfully for review!
          </div>
        )}

        {paymentUnavailable && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Payment gateway is currently in test mode or unconfigured. Please contact support or submit as free.</p>
            <button
              type="button"
              onClick={() => {
                setFormData((current) => ({ ...current, tier: "free" }));
                setPaymentUnavailable(false);
                window.setTimeout(() => formRef.current?.requestSubmit(), 0);
              }}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Submit as Free Listing
            </button>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Plan Tier Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Free Tier Card (100% Free) */}
            <div
              onClick={() => setFormData({ ...formData, tier: "free" })}
              className={`cursor-pointer rounded-xl p-4 border transition-all ${
                formData.tier === "free"
                  ? "bg-zinc-800/80 border-zinc-500 ring-1 ring-zinc-400"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Free Submission
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    100% FREE
                  </span>
                </div>
                <span className="text-sm font-black text-white">$0</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                Standard manual review. Submitted listings are verified by our
                team before going live—100% free.
              </p>
            </div>

            {/* Paddle Featured Tier ($5) */}
            <div
              onClick={() =>
                setFormData({ ...formData, tier: "paddle_featured" })
              }
              className={`cursor-pointer rounded-xl p-4 border transition-all relative overflow-hidden ${
                formData.tier === "paddle_featured"
                  ? "bg-linear-to-br from-amber-500/15 via-orange-500/10 to-amber-500/5 border-amber-500 ring-2 ring-amber-500/30"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-amber-500/40"
              }`}
            >
              <div className="absolute top-0 right-0 bg-linear-to-l from-amber-500 to-orange-500 text-zinc-950 text-[9px] font-black px-2 py-0.5 rounded-bl">
                INSTANT LAUNCH
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    PADDLE FEATURED $5
                  </span>
                </div>
                <span className="text-sm font-black text-amber-400 mr-12">
                  $5
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 mt-2 leading-relaxed">
                Priority review, gold badge after payment confirmation, and a
                Paddle webhook-backed monthly subscription.
              </p>
            </div>
          </div>

          {/* Acquisition Marketplace Toggle (Acquire / Microns mode) */}
          <div className="p-4 rounded-xl bg-linear-to-r from-zinc-900/90 via-amber-500/5 to-zinc-900/90 border border-amber-500/30 shadow-inner">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <label
                    htmlFor="toggle-marketplace"
                    className="text-xs font-bold text-white cursor-pointer flex items-center gap-2"
                  >
                    List this startup for sale (Acquire/Microns mode)
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Marketplace
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Attract buyers, show MRR and net profit, and collect
                    acquisition offers.
                  </p>
                </div>
              </div>

              {/* Custom Toggle Switch */}
              <button
                type="button"
                id="toggle-marketplace"
                role="switch"
                aria-checked={formData.is_for_sale}
                onClick={() =>
                  setFormData({
                    ...formData,
                    is_for_sale: !formData.is_for_sale,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.is_for_sale ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    formData.is_for_sale ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Helper text with 10% platform commission fee disclaimer */}
            <p className="text-[11px] text-amber-300/90 mt-3 pt-2.5 border-t border-zinc-800/80 leading-relaxed flex items-center gap-1.5">
              <span>💡</span>
              <span>
                <strong>Commission notice:</strong> Free to list for sale.
                StackDirectory collects a{" "}
                <strong>10% platform commission fee</strong> upon successful
                acquisition deal closure.
              </span>
            </p>

            {/* Conditional Acquisition Inputs */}
            {formData.is_for_sale && (
              <div className="mt-4 space-y-3 pt-3 border-t border-amber-500/20 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      Asking Price ($ USD) *
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="number"
                        min="0"
                        value={formData.asking_price}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            asking_price: e.target.value,
                          })
                        }
                        placeholder="25000"
                        required={formData.is_for_sale}
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 text-white text-xs border border-amber-500/40 focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                      Monthly Revenue (MRR $)
                    </label>
                    <div className="relative">
                      <TrendingUp className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-emerald-500" />
                      <input
                        type="number"
                        min="0"
                        value={formData.monthly_revenue}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            monthly_revenue: e.target.value,
                          })
                        }
                        placeholder="1450"
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 text-white text-xs border border-zinc-700 focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                      Monthly Profit ($)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-cyan-500" />
                      <input
                        type="number"
                        min="0"
                        value={formData.monthly_profit}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            monthly_profit: e.target.value,
                          })
                        }
                        placeholder="1100"
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 text-white text-xs border border-zinc-700 focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      Seller Contact Email / Telegram *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="text"
                        value={formData.seller_contact}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            seller_contact: e.target.value,
                          })
                        }
                        placeholder="founder@mystartup.com or @telegram_handle"
                        required={formData.is_for_sale}
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 text-white text-xs border border-amber-500/40 focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                      Tech Stack Tags (Comma separated)
                    </label>
                    <div className="relative">
                      <Cpu className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="text"
                        value={formData.tech_stack}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            tech_stack: e.target.value,
                          })
                        }
                        placeholder="Next.js 15, Supabase, Tailwind, Stripe, Python"
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 text-white text-xs border border-zinc-700 focus:border-amber-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Standard Form Fields */}
          <div className="space-y-3.5 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Startup / App Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, tagline: e.target.value })
                }
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
                  onChange={(e) => applyUrlDefaults(e.target.value)}
                  placeholder="https://yourapp.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => void handleAutoFill()}
                  disabled={isAutoFilling}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-60"
                >
                  {isAutoFilling ? "Fetching details..." : "Auto-fill Details"}
                </button>
                {autoFillMessage && <p className="mt-1 text-[10px] text-emerald-400">{autoFillMessage}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Primary Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition cursor-pointer"
                >
                  {CATEGORIES.filter(
                    (c) => c !== "All" && c !== "Startups For Sale",
                  ).map((cat) => (
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pricing_type: e.target.value as PricingType,
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-zinc-800 focus:border-amber-500 outline-none transition cursor-pointer"
                >
                  <option value="Free">Free</option>
                  <option value="Freemium">Freemium</option>
                  <option value="Paid">Paid</option>
                  <option value="Open Source">Open Source</option>
                </select>
              </div>

              {formData.tier === "paddle_featured" && (
                <div>
                  <label className="text-xs font-medium text-amber-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Billing Email (Paddle $5)
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.customer_email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customer_email: e.target.value,
                      })
                    }
                    placeholder="founder@startup.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm border border-amber-500/40 focus:border-amber-500 outline-none transition"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Full Description / Metrics Overview (Optional)
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Explain the product, user growth, architecture, and reason for selling (if applicable)..."
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

            {formData.tier === "paddle_featured" ? (
              <div className="flex flex-col items-end gap-2">
                {paymentError && (
                  <div className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                    {paymentError}
                  </div>
                )}
                {paidSaveError && (
                  <div className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
                    <p>{paidSaveError}</p>
                    <button
                      type="button"
                      onClick={() => finalizePaidSubmissionRef.current()}
                      disabled={isSubmitting}
                      className="mt-2 rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
                    >
                      Retry saving my listing (no extra charge)
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || isProcessingCheckout || showCheckoutSuccess}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-zinc-950 bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving your Featured listing...</span>
                    </>
                  ) : isProcessingCheckout ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Waiting for Payment...</span>
                    </>
                  ) : showCheckoutSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                      <span>Payment Verified!</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pay $5 with Paddle</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 transition"
              >
                {isSubmitting ? <span>Submitting...</span> : <span>Submit 100% Free ($0) to Queue</span>}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
