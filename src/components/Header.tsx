import React from 'react';
import { Sparkles, Code2, Webhook, Plus, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onOpenSubmit: () => void;
  onOpenCodeViewer: () => void;
  onOpenWebhookSimulator: () => void;
  onOpenAdminQueue: () => void;
  pendingCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSubmit,
  onOpenCodeViewer,
  onOpenWebhookSimulator,
  onOpenAdminQueue,
  pendingCount,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#090a0f]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-black text-lg">
            ▲
          </div>
          <div>
                        <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">StackDirectory</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin Queue Button */}
          <button
            id="btn-admin-queue"
            onClick={onOpenAdminQueue}
            className="relative hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition"
            title="Review queue for free submissions"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Review Queue</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded-full font-bold border border-amber-500/30">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Paddle Webhook Simulator */}
          <button
            id="btn-paddle-simulator"
            onClick={onOpenWebhookSimulator}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition"
          >
            <Webhook className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Paddle Webhook Simulator</span>
            <span className="sm:hidden">Webhook</span>
          </button>

          {/* View Code / Architecture Modal */}
          <button
            id="btn-view-code"
            onClick={onOpenCodeViewer}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 transition"
          >
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Next.js & SQL Code</span>
            <span className="sm:hidden">Code</span>
          </button>

          {/* Submit App CTA */}
          <button
            id="btn-submit-app-header"
            onClick={onOpenSubmit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-md shadow-amber-500/20 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Submit App</span>
          </button>
        </div>
      </div>
    </header>
  );
};
