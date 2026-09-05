import React, { useEffect, useState } from "react";
import { Check, ChevronUp, Copy, ExternalLink, Share2, X } from "lucide-react";
import type { Tool } from "../types/directory";

interface ToolDetailModalProps {
  isOpen: boolean;
  tool: Tool | null;
  onClose: () => void;
  onToggleUpvote: (toolId: string) => void;
}

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export const getToolSlug = (tool: Tool): string =>
  tool.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || tool.id;

export const ToolDetailModal: React.FC<ToolDetailModalProps> = ({
  isOpen,
  tool,
  onClose,
  onToggleUpvote,
}) => {
  const [logoSource, setLogoSource] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  useEffect(() => {
    if (tool) {
      const hostname = getHostname(tool.website_url);
      setLogoSource(tool.icon_url || `https://icon.horse/icon/${hostname}`);
      setLogoFailed(false);
      setIsCopied(false);
      setIsShareMenuOpen(false);
      setShareNotice("");
    }
  }, [tool]);

  if (!isOpen || !tool) return null;

  const hostname = getHostname(tool.website_url);
  const fallback = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
  const toolSlug = (tool as Tool & { slug?: string }).slug || tool.id;
  const shareUrl = `https://apps.stackbuildco.com/?tool=${encodeURIComponent(toolSlug)}`;
  const shareTitle = `${tool.name} - StackDirectory`;
  const shareText = `Check out ${tool.name} on StackDirectory!`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setShareNotice("Link copied to clipboard!");
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(false);
      setShareNotice("Could not copy link.");
    }
  };

  const shareListing = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch {
        // The user may dismiss the native share sheet; keep the direct options available.
      }
    }
    await copyShareLink();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${tool.name} details`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
        <div className="absolute right-4 top-4 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsShareMenuOpen((current) => !current)}
            aria-label="Share listing"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
          {isShareMenuOpen && (
            <div className="absolute right-0 top-11 z-10 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <button type="button" onClick={() => void copyShareLink()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Copy className="h-3.5 w-3.5" /> Copy Link
              </button>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Share on X / Twitter</a>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Share on LinkedIn</a>
              {typeof navigator.share === "function" && <button type="button" onClick={() => void shareListing()} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Share from device</button>}
            </div>
          )}
        </div>

        <div className="flex items-start gap-4 pr-8">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50 text-xl font-black text-emerald-700">
            {logoFailed ? (
              <svg viewBox="0 0 40 40" aria-label={`${tool.name} initial avatar`} className="h-full w-full">
                <rect width="40" height="40" rx="20" fill="#d1fae5" />
                <text x="20" y="25" textAnchor="middle" fontSize="16" fontWeight="700" fill="#047857">{tool.name.slice(0, 1).toUpperCase()}</text>
              </svg>
            ) : (
              <img
                src={logoSource}
                alt={`${tool.name} logo`}
                className="h-full w-full object-cover"
                onError={() => {
                  if (logoSource !== fallback) setLogoSource(fallback);
                  else setLogoFailed(true);
                }}
              />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-emerald-600">{tool.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{tool.tagline}</p>
          </div>
        </div>

        <p className="mt-6 whitespace-pre-line text-sm leading-7 text-slate-600">
          {tool.description || tool.tagline}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{tool.category}</span>
          <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{tool.pricing_type}</span>
          {(tool.tech_stack || []).map((technology) => (
            <span key={technology} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">{technology}</span>
          ))}
        </div>

        {tool.is_for_sale && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Asking Price", `$${(tool.asking_price ?? 0).toLocaleString()}`],
              ["MRR", `$${(tool.monthly_revenue ?? 0).toLocaleString()}/mo`],
              ["Net Profit", `$${(tool.monthly_profit ?? 0).toLocaleString()}/mo`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{label}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {shareNotice && <p className="mb-3 text-xs font-semibold text-emerald-700" role="status">{shareNotice}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Share Listing</h3>
              <p className="mt-1 text-xs text-slate-500">Send this tool page to your network.</p>
            </div>
            <button
              type="button"
              onClick={() => void shareListing()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share Listing
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyShareLink()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-400">
              {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {isCopied ? "Copied" : "Copy Link"}
            </button>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Share on X</a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">LinkedIn</a>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <a href={tool.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:underline">
            Visit {hostname || "website"} <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => onToggleUpvote(tool.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${tool.user_has_upvoted ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-700 hover:border-amber-300 hover:text-amber-700"}`}
          >
            <ChevronUp className="h-4 w-4" />
            {tool.user_has_upvoted ? "Upvoted" : "Upvote"} ({tool.upvotes})
          </button>
        </div>
      </article>
    </div>
  );
};

export default ToolDetailModal;
