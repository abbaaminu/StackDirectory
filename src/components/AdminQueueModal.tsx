import React, { useEffect, useState } from "react";
import {
  X,
  ShieldCheck,
  Check,
  XCircle,
  Trash2,
  Zap,
  ExternalLink,
  Clock,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Tool } from "../types/directory";
import supabase, { isSupabaseConfigured } from "../lib/supabase";
import { isAdminUser } from "../lib/admin";
import {
  callAdminToolAction,
  callAdminToolsList,
  isAdminApiUnavailable,
} from "../lib/adminTools";
import { getToolSlug } from "../lib/toolSlug";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "../lib/localStore";
import { useModalDismiss } from "../lib/useModalDismiss";

interface AdminQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  onSetFeature: (toolId: string, isFeatured: boolean) => Promise<boolean>;
  onSetForSale: (toolId: string, isForSale: boolean) => Promise<boolean>;
  /** Lets App drop a deleted listing from the directory grid immediately. */
  onToolDeleted?: (toolId: string) => void;
}

export const AdminQueueModal: React.FC<AdminQueueModalProps> = ({
  isOpen,
  onClose,
  user,
  onSetFeature,
  onSetForSale,
  onToolDeleted,
}) => {
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [updatingToolId, setUpdatingToolId] = useState<string | null>(null);
  /** Listing awaiting the second click on the trash icon. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingToolId, setDeletingToolId] = useState<string | null>(null);

  // Shared allow-list helper (see lib/admin.ts): the queue must accept exactly
  // the accounts the header uses to reveal the "Admin Queue" button.
  const isAdmin = isAdminUser(user);

  // Escape closes the queue and the directory behind it stops scrolling.
  useModalDismiss(isOpen, onClose);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;

    let cancelled = false;
    const fetchTools = async () => {
      setIsLoading(true);
      setQueueError(null);
      setQueueNotice(null);
      setConfirmDeleteId(null);

      if (!isSupabaseConfigured || !supabase) {
        // Offline/demo mode: mirror the submissions queued in this browser.
        if (!cancelled) {
          setAllTools(readJsonArray<Tool>(STORAGE_KEYS.tools));
          setIsLoading(false);
        }
        return;
      }

      if (cancelled) return;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) {
        setQueueError(sessionError?.message || "Sign in again as an administrator to load submissions.");
        setIsLoading(false);
        return;
      }
      const result = await callAdminToolsList(token);
      if (cancelled) return;
      if (!result.ok) setQueueError(result.error ?? "Could not load submissions.");
      else setAllTools(result.tools);
      setIsLoading(false);
    };

    void fetchTools();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isOpen]);

  /**
   * Applies a moderation result to the visible queue. Shared by the API path
   * and the direct-write fallback so both behave identically.
   */
  const applyLocalChanges = (toolId: string, changes: Partial<Tool>): Tool | undefined => {
    const target = allTools.find((tool) => tool.id === toolId);
    setAllTools((current) =>
      current.map((tool) => (tool.id === toolId ? { ...tool, ...changes } : tool)),
    );
    return target;
  };

  const notifySubmitter = (tool: Tool | undefined) => {
    const submitterEmail = tool?.seller_contact?.trim();
    if (!tool || !submitterEmail) return;
    void fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "APP_APPROVED",
        toolName: tool.name,
        submitterEmail,
        toolSlug: getToolSlug(tool),
      }),
    }).catch((notificationError) => {
      console.error("Approval notification failed:", notificationError);
    });
  };

  /** Access token for /api/admin-tools (null without a Supabase session). */
  const getAccessToken = async (): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  /**
   * Last-resort direct write with the anon key. PostgREST reports a write that
   * Row Level Security filtered out as "0 rows matched" *without* an error, so
   * the echoed rows - not the absence of `error` - decide success. That silent
   * no-op is exactly what made the queue look broken.
   */
  const runDirectUpdate = async (
    toolId: string,
    changes: Record<string, unknown>,
  ): Promise<Tool | undefined> => {
    if (!supabase) return undefined;
    const { data: updatedRows, error } = await supabase
      .from("tools")
      .update(changes as never)
      .eq("id", toolId)
      .select("id");

    if (error) {
      setQueueError(error.message);
      return undefined;
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      setQueueError(
        "Supabase matched 0 rows, so nothing changed (a Row Level Security policy blocked the write). Deploy /api/admin-tools with SUPABASE_SERVICE_ROLE_KEY to moderate without RLS policies.",
      );
      return undefined;
    }
    return applyLocalChanges(toolId, changes as Partial<Tool>);
  };

  const updateQueueTool = async (toolId: string, action: "approve" | "reject") => {
    setUpdatingToolId(toolId);
    setQueueError(null);
    setQueueNotice(null);
    setConfirmDeleteId(null);

    // `tools.status` only accepts pending | approved | rejected
    // (see lib/supabase/database.ts). Writing any other value - "active", for
    // example - is rejected by the column constraint, and rejecting must also
    // clear the approval flag so a rejected row can never render as live.
    const changes = action === "approve"
      ? { is_approved: true, status: "approved" as const }
      : { is_approved: false, status: "rejected" as const };

    const finish = (notice: string) => {
      setQueueNotice(notice);
      setUpdatingToolId(null);
    };

    if (!isSupabaseConfigured || !supabase) {
      // Offline/demo mode: the queue only exists in this browser.
      const queued = readJsonArray<Tool>(STORAGE_KEYS.tools).map((tool) =>
        tool.id === toolId ? { ...tool, ...changes } : tool,
      );
      writeJsonArray(STORAGE_KEYS.tools, queued);
      setAllTools(queued);
      finish(`Saved in this browser: listing marked as ${changes.status}.`);
      return;
    }

    // Preferred path: the service-role API, which also works when RLS hides the
    // row from the anon key.
    const token = await getAccessToken();
    if (token) {
      const result = await callAdminToolAction(action, toolId, token);
      if (result.ok) {
        applyLocalChanges(toolId, changes);
        finish(`Listing ${action === "approve" ? "approved" : "rejected"} in Supabase.`);
        return;
      }
      if (!isAdminApiUnavailable(result)) {
        setQueueError(result.error ?? "The listing could not be updated.");
        setUpdatingToolId(null);
        return;
      }
      console.warn(
        "Admin API unavailable - falling back to a direct Supabase write.",
        result.error,
      );
    }

    const target = await runDirectUpdate(toolId, changes);
    if (target) {
      if (action === "approve") notifySubmitter(target);
      finish(`Listing ${action === "approve" ? "approved" : "rejected"}.`);
      return;
    }
    if (!token) {
      setQueueError(
        "Sign in again as an administrator to moderate listings (the admin API needs a verified session).",
      );
    }
    setUpdatingToolId(null);
  };

  const finishDelete = () => {
    setDeletingToolId(null);
    setConfirmDeleteId(null);
  };

  const removeLocally = (toolId: string, notice: string) => {
    setAllTools((current) => current.filter((tool) => tool.id !== toolId));
    onToolDeleted?.(toolId);
    setQueueNotice(notice);
  };

  /**
   * Permanently deletes a listing. Always prefers /api/admin-tools: the anon key
   * cannot delete rows that Row Level Security protects, and a double-click
   * confirm means a mis-click can never destroy a submission.
   */
  const handleDeleteTool = async (tool: Tool) => {
    setDeletingToolId(tool.id);
    setQueueError(null);
    setQueueNotice(null);

    if (!isSupabaseConfigured || !supabase) {
      // Offline/demo mode: drop the record from this browser's queue.
      const queued = readJsonArray<Tool>(STORAGE_KEYS.tools).filter(
        (item) => item.id !== tool.id,
      );
      writeJsonArray(STORAGE_KEYS.tools, queued);
      setAllTools(queued);
      onToolDeleted?.(tool.id);
      setQueueNotice(`Removed "${tool.name}" from this browser's queue.`);
      finishDelete();
      return;
    }

    const token = await getAccessToken();
    if (token) {
      const result = await callAdminToolAction("delete", tool.id, token);
      if (result.ok) {
        removeLocally(tool.id, `Deleted "${tool.name}" from Supabase.`);
        finishDelete();
        return;
      }
      if (!isAdminApiUnavailable(result)) {
        setQueueError(result.error ?? `"${tool.name}" could not be deleted.`);
        finishDelete();
        return;
      }
      console.warn(
        "Admin API unavailable - falling back to a direct Supabase delete.",
        result.error,
      );
    }

    // Fallback: only succeeds when RLS grants DELETE to the anon key. A blocked
    // delete is reported instead of pretending the row is gone.
    const { data: deletedRows, error } = await supabase
      .from("tools")
      .delete()
      .eq("id", tool.id)
      .select("id");

    if (error) {
      setQueueError(error.message);
    } else if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      setQueueError(
        token
          ? "Supabase deleted 0 rows, so the listing is still there. Check SUPABASE_SERVICE_ROLE_KEY on /api/admin-tools."
          : "Sign in again as an administrator: deleting listings needs a verified admin session.",
      );
    } else {
      removeLocally(tool.id, `Deleted "${tool.name}" from Supabase.`);
    }
    finishDelete();
  };

  const handleSetFeature = async (tool: Tool) => {
    const isFeatured = !tool.is_featured;
    setUpdatingToolId(tool.id);
    setQueueError(null);
    const succeeded = await onSetFeature(tool.id, isFeatured);
    if (succeeded) {
      setAllTools((current) => current.map((item) =>
        item.id === tool.id ? { ...item, is_featured: isFeatured } : item,
      ));
      setQueueNotice(`"${tool.name}" ${isFeatured ? "featured" : "removed from featured"} in Supabase.`);
    } else {
      setQueueError(`Could not ${isFeatured ? "feature" : "unfeature"} "${tool.name}".`);
    }
    setUpdatingToolId(null);
  };

  const handleSetForSale = async (tool: Tool) => {
    const isForSale = !tool.is_for_sale;
    setUpdatingToolId(tool.id);
    setQueueError(null);
    const succeeded = await onSetForSale(tool.id, isForSale);
    if (succeeded) {
      setAllTools((current) => current.map((item) =>
        item.id === tool.id ? { ...item, is_for_sale: isForSale } : item,
      ));
      setQueueNotice(`"${tool.name}" ${isForSale ? "listed for sale" : "removed from sale"}.`);
    } else {
      setQueueError(`Could not update the sale status for "${tool.name}".`);
    }
    setUpdatingToolId(null);
  };

  if (!isOpen) return null;
  const pendingTools = allTools.filter((tool) => !tool.is_approved);
  const approvedTools = allTools.filter((tool) => tool.is_approved);
  const featuredTools = allTools.filter((tool) => tool.is_featured);

  if (!isAdmin) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-denied-title"
      >
        <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0c0d14] p-6 text-zinc-100 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 p-1 text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <ShieldCheck className="h-8 w-8 text-red-400" />
          <h2 id="admin-denied-title" className="mt-3 text-lg font-bold text-white">Admin access required</h2>
          <p className="mt-1 text-sm text-zinc-400">This moderation queue is restricted to authorized administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-queue-title"
    >
      <div className="relative w-full max-w-3xl bg-[#0c0d14] border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-7 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 id="admin-queue-title" className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Supabase Review Queue & Mod Panel
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Review free user submissions (
              <code className="text-zinc-300">is_approved = false</code>) and
              manage directory listings.
            </p>
          </div>
        </div>

        {/* Pending Queue Section */}
        <div className="mt-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Pending Review Queue
              </h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {pendingTools.length} Pending
            </span>
          </div>

          {queueError && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {queueError}
            </div>
          )}

          {queueNotice && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              {queueNotice}
            </div>
          )}

          {isLoading ? (
            <div className="mt-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 py-8 text-center text-xs text-zinc-500">
              Loading pending submissions...
            </div>
          ) : pendingTools.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/60 mt-3">
              No pending apps in the queue. All submissions are approved or
              upgraded!
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {pendingTools.map((tool) => (
                <div
                  key={tool.id}
                  className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {tool.name}
                      </span>
                      <span className="text-[11px] px-2 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {tool.category}
                      </span>
                      <span className="text-[11px] px-2 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {tool.pricing_type}
                      </span>
                      {tool.is_for_sale && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          For Sale ($
                          {tool.asking_price?.toLocaleString() || "N/A"}) • MRR
                          ${tool.monthly_revenue || 0}/mo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{tool.tagline}</p>
                    <p className="text-[11px] text-zinc-400">
                      Submitted by{" "}
                      {tool.seller_contact ? (
                        <a
                          href={`mailto:${tool.seller_contact}`}
                          className="text-amber-300 hover:underline"
                        >
                          {tool.seller_contact}
                        </a>
                      ) : (
                        <span className="text-zinc-500">email not provided</span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Submitted {new Date(tool.created_at).toLocaleString()}
                    </p>
                    <a
                      href={tool.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-amber-400/80 hover:underline flex items-center gap-1 font-mono"
                    >
                      <span>{tool.website_url}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void updateQueueTool(tool.id, "approve")}
                      disabled={updatingToolId === tool.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition"
                      title="Approve Free Submission"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSetFeature(tool)}
                      disabled={updatingToolId === tool.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition"
                      title={tool.is_featured ? "Remove featured status" : "Promote to Featured"}
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>{tool.is_featured ? "Unfeature" : "Feature"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSetForSale(tool)}
                      disabled={updatingToolId === tool.id}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition"
                      title="Toggle acquisition listing"
                    >
                      {tool.is_for_sale ? "Hide Sale" : "For Sale"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void updateQueueTool(tool.id, "reject")}
                      disabled={updatingToolId === tool.id || deletingToolId === tool.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition disabled:opacity-60"
                      title="Reject this submission (keeps the row, marks it rejected)"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    {confirmDeleteId === tool.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteTool(tool)}
                          disabled={deletingToolId === tool.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 border border-red-500 transition disabled:opacity-60"
                          title="Delete this row from Supabase permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>
                            {deletingToolId === tool.id ? "Deleting..." : "Confirm delete"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-700 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(tool.id)}
                        disabled={deletingToolId === tool.id}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition disabled:opacity-60"
                        title="Delete this listing from Supabase"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Directory Summary Stats */}
        <div className="mt-6 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xl font-bold text-white">
              {approvedTools.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Approved Tools
            </div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xl font-bold text-amber-400">
              {featuredTools.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Paddle Featured
            </div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xl font-bold text-zinc-300">
              {pendingTools.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Pending Queue
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
