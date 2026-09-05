import React, { useEffect, useState } from "react";
import {
  X,
  ShieldCheck,
  Check,
  Trash2,
  Zap,
  ExternalLink,
  Clock,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Tool } from "../types/directory";
import supabase from "../lib/supabase";

const getToolSlug = (tool: Tool): string =>
  tool.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || tool.id;

interface AdminQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  tools: Tool[];
  onToggleFeature: (toolId: string) => void;
  onToggleForSale: (toolId: string) => void;
}

export const AdminQueueModal: React.FC<AdminQueueModalProps> = ({
  isOpen,
  onClose,
  user,
  tools,
  onToggleFeature,
  onToggleForSale,
}) => {
  const [allTools, setAllTools] = useState<Tool[]>(tools);
  const [isLoading, setIsLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [updatingToolId, setUpdatingToolId] = useState<string | null>(null);
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAIL || "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase());
  const isAdmin = Boolean(
    user?.email && adminEmails.includes(user.email.toLowerCase()),
  );

  useEffect(() => {
    if (!isOpen || !isAdmin) return;

    let cancelled = false;
    const fetchTools = async () => {
      if (!supabase) {
        setQueueError("Supabase is not configured.");
        return;
      }

      setIsLoading(true);
      setQueueError(null);
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .order("created_at", { ascending: false });

      console.log("Admin Queue Fetched Tools:", data, "Error:", error);

      if (cancelled) return;
      if (error) {
        setQueueError(error.message);
      } else {
        setAllTools((data as Tool[]) ?? []);
      }
      setIsLoading(false);
    };

    void fetchTools();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isOpen]);

  const updateQueueTool = async (toolId: string, action: "approve" | "reject") => {
    if (!supabase) {
      setQueueError("Supabase is not configured.");
      return;
    }

    setUpdatingToolId(toolId);
    setQueueError(null);
    const { error } = await supabase
      .from("tools")
      .update(
        (action === "approve"
          ? { is_approved: true, status: "active" }
          : { status: "rejected" }) as never,
      )
      .eq("id", toolId);

    if (error) {
      setQueueError(error.message);
    } else {
      const approvedTool = allTools.find((tool) => tool.id === toolId);
      setAllTools((current) => current.map((tool) =>
        tool.id === toolId
          ? {
              ...tool,
              is_approved: action === "approve" ? true : tool.is_approved,
              status: action === "approve" ? "approved" : "rejected",
            }
          : tool,
      ));
      const submitterEmail = approvedTool?.seller_contact?.trim();
      if (action === "approve" && approvedTool && submitterEmail) {
        void fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "APP_APPROVED",
            toolName: approvedTool.name,
            submitterEmail,
            toolSlug: getToolSlug(approvedTool),
          }),
        }).catch((notificationError) => {
          console.error("Approval notification failed:", notificationError);
        });
      }
    }
    setUpdatingToolId(null);
  };

  if (!isOpen) return null;

  const pendingTools = allTools.filter((tool) => !tool.is_approved);
  const approvedTools = allTools.filter((tool) => tool.is_approved);
  const featuredTools = allTools.filter((tool) => tool.is_featured);

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0c0d14] p-6 text-zinc-100 shadow-2xl">
          <button onClick={onClose} className="absolute right-5 top-5 p-1 text-zinc-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <ShieldCheck className="h-8 w-8 text-red-400" />
          <h2 className="mt-3 text-lg font-bold text-white">Admin access required</h2>
          <p className="mt-1 text-sm text-zinc-400">This moderation queue is restricted to authorized administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0c0d14] border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-7 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
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
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
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

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void updateQueueTool(tool.id, "approve")}
                      disabled={updatingToolId === tool.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition"
                      title="Approve Free Submission"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() => onToggleFeature(tool.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition"
                      title="Promote to Featured"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Feature</span>
                    </button>

                    <button
                      onClick={() => onToggleForSale(tool.id)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition"
                      title="Toggle acquisition listing"
                    >
                      {tool.is_for_sale ? "Hide Sale" : "For Sale"}
                    </button>

                    <button
                      onClick={() => void updateQueueTool(tool.id, "reject")}
                      disabled={updatingToolId === tool.id}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition"
                      title="Reject / Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
