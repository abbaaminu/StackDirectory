import React, { useEffect, useState } from "react";
import { Check, ChevronUp, Copy, ExternalLink, Handshake, Heart, Share2, Trash2, X } from "lucide-react";
import type { Tool } from "../types/directory";
import { handleVisitWebsite } from "../lib/trackToolClick";
import { getFaviconUrl, getSafeHostname, getSafeWebsiteUrl, initialToolImageSource, nextToolImageSource, resolveToolImageSrc, type ToolImageSource } from "../lib/toolDisplay";
import { applyToolOgMetadata, buildToolOgMetadata } from "../lib/toolOgMetadata";
import { getToolSlug } from "../lib/toolSlug";
import { useModalDismiss } from "../lib/useModalDismiss";

interface ToolDetailModalProps {
  isOpen: boolean;
  tool: Tool | null;
  onClose: () => void;
  onToggleUpvote: (toolId: string) => void;
  onToggleFavorite?: (toolId: string) => void;
  onOpenAcquisition?: (tool: Tool) => void;
  isAdmin?: boolean;
  onAdminDelete?: (toolId: string) => Promise<boolean>;
}

export const ToolDetailModal: React.FC<ToolDetailModalProps> = ({
  isOpen,
  tool,
  onClose,
  onToggleUpvote,
  onToggleFavorite,
  onOpenAcquisition,
  isAdmin = false,
  onAdminDelete,
}) => {
  // Sanitised once for the state, the reset effect and the render below:
  // `icon_url`/`website_url` are user-supplied, so neither may reach `src`
  // unchecked, and a bare host entered in the submit form still needs a favicon.
  const toolIconUrl = getSafeWebsiteUrl(tool?.icon_url);
  const toolFaviconUrl = getFaviconUrl(tool?.website_url);
  const hasToolIcon = Boolean(toolIconUrl);
  // Ordered logo chain: custom icon -> /api/favicon (the site's own icon, or a
  // generated avatar) -> letter avatar. `logoFailed` used to be a second source
  // of truth; it is now derived from the chain position, so the two cannot
  // disagree. The lazy initialiser means the first paint (and SSR) already shows
  // the real logo rather than flashing the avatar.
  const [logoSource, setLogoSource] = useState<ToolImageSource>(() =>
    initialToolImageSource(hasToolIcon, Boolean(toolFaviconUrl)),
  );
  const [isCopied, setIsCopied] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [confirmAdminDelete, setConfirmAdminDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Escape closes the detail modal and freezes the grid scrolling behind it.
  useModalDismiss(isOpen, onClose);

  useEffect(() => {
    if (tool) {
      // A different listing gets a fresh chain; the stored values were already
      // sanitised above, so a `javascript:`/`data:` icon can never be a source.
      setLogoSource(initialToolImageSource(hasToolIcon, Boolean(toolFaviconUrl)));
      setIsCopied(false);
      setIsShareMenuOpen(false);
      setShareNotice("");
      setConfirmAdminDelete(false);
      setIsDeleting(false);
    }
  }, [tool]);

  const toolSlug = tool ? tool.slug || getToolSlug(tool) : "";
  const shareUrl = `https://apps.stackbuildco.com/?tool=${encodeURIComponent(toolSlug)}`;
  const ogImageUrl = tool
    ? `https://apps.stackbuildco.com/api/og?title=${encodeURIComponent(tool.name)}&tagline=${encodeURIComponent(tool.tagline)}&category=${encodeURIComponent(tool.category)}&pricing=${encodeURIComponent(tool.pricing_type)}`
    : "";

  // The listing's own preview cards stay in the head while it is open, then the
  // site's defaults come back - closing a modal must not delete the tags
  // index.html shipped with (see lib/toolOgMetadata.ts).
  useEffect(() => {
    if (!isOpen || !tool) return;

    // `HTMLMetaElement` is spelled out because the DOM's overloaded
    // `createElement` does not let TypeScript infer which element the head
    // owner produces - see the `HeadOwnerLike` doc comment.
    return applyToolOgMetadata<HTMLMetaElement>(
      document,
      buildToolOgMetadata({
        name: tool.name,
        tagline: tool.tagline,
        imageUrl: ogImageUrl,
        shareUrl,
      }),
    );
  }, [isOpen, ogImageUrl, shareUrl, tool]);

  if (!isOpen || !tool) return null;

  const websiteUrl = getSafeWebsiteUrl(tool.website_url);
  const hostname = getSafeHostname(tool.website_url) ?? "";
  // `null` once the chain is exhausted, which renders the letter avatar.
  const logoSrc = resolveToolImageSrc(logoSource, toolIconUrl, toolFaviconUrl);
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
            onClick={() => onToggleFavorite?.(tool.id)}
            aria-pressed={Boolean(tool.is_favorite)}
            aria-label={tool.is_favorite ? "Remove from favorites" : "Save to favorites"}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition hover:bg-slate-100 ${tool.is_favorite ? "text-rose-600" : "text-slate-600 hover:text-slate-900"}`}
          >
            <Heart className={`h-4 w-4 ${tool.is_favorite ? "fill-rose-600" : ""}`} />
            <span className="hidden sm:inline">{tool.is_favorite ? "Saved" : "Save"}</span>
          </button>
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
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={`${tool.name} logo`}
                className="h-full w-full object-cover"
                // Advances down the shared source chain and stops at the avatar,
                // so a dead icon URL cannot loop.
                onError={(event) => {
                  const image = event.currentTarget as HTMLImageElement;
                  console.warn(
                    `[ToolDetailModal] Logo failed to load for listing ${tool.id}: ${image.currentSrc || image.src}`,
                  );
                  setLogoSource((current) => nextToolImageSource(current));
                }}
              />
            ) : (
              <svg viewBox="0 0 40 40" aria-label={`${tool.name} initial avatar`} className="h-full w-full">
                <rect width="40" height="40" rx="20" fill="#d1fae5" />
                <text x="20" y="25" textAnchor="middle" fontSize="16" fontWeight="700" fill="#047857">{tool.name.slice(0, 1).toUpperCase()}</text>
              </svg>
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
          <div className="flex flex-wrap items-center gap-3">
          {websiteUrl ? (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" onClick={() => handleVisitWebsite(tool)} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:underline">
              Visit {hostname || "website"} <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            // Submissions can carry an unusable URL (blank, or a scheme we
            // refuse to navigate to). Saying so beats a dead/unsafe link.
            <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-400">
              Website unavailable <ExternalLink className="h-4 w-4" />
            </span>
          )}
          <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {tool.click_count || 0} referral clicks
          </span>
          </div>
          {tool.is_for_sale && onOpenAcquisition && (
            <button
              type="button"
              onClick={() => onOpenAcquisition(tool)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              <Handshake className="h-4 w-4" />
              Make an Offer
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleUpvote(tool.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${tool.user_has_upvoted ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-700 hover:border-amber-300 hover:text-amber-700"}`}
          >
            <ChevronUp className="h-4 w-4" />
            {tool.user_has_upvoted ? "Upvoted" : "Upvote"} ({tool.upvotes})
          </button>
          {isAdmin && onAdminDelete && (
            confirmAdminDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    const deleted = await onAdminDelete(tool.id);
                    setIsDeleting(false);
                    if (deleted) setConfirmAdminDelete(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Confirm delete"}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmAdminDelete(false)}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmAdminDelete(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Admin Delete
              </button>
            )
          )}
        </div>
      </article>
    </div>
  );
};

export default ToolDetailModal;
