import React, { useState } from 'react';
import { X, Webhook, Play, CheckCircle2, Copy, Check, ShieldCheck, RefreshCw, Terminal } from 'lucide-react';
import { Tool, PaddleWebhookPayload } from '../types/directory';

interface PaddleWebhookSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  tools: Tool[];
  onTriggerWebhookUpgrade: (toolId: string, customerId: string) => void;
  selectedToolId?: string;
}

export const PaddleWebhookSimulator: React.FC<PaddleWebhookSimulatorProps> = ({
  isOpen,
  onClose,
  tools,
  onTriggerWebhookUpgrade,
  selectedToolId,
}) => {
  const [targetToolId, setTargetToolId] = useState<string>(
    selectedToolId || tools.find((t) => !t.is_featured)?.id || tools[0]?.id || ''
  );
  const [eventType, setEventType] = useState<'transaction.completed' | 'transaction.created'>('transaction.completed');
  const [amount, setAmount] = useState('19.00');
  const [isSimulating, setIsSimulating] = useState(false);
  const [webhookResponse, setWebhookResponse] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetTool = tools.find((t) => t.id === targetToolId);

  const mockPayload: PaddleWebhookPayload = {
    event_id: `evt_${Math.random().toString(36).substring(2, 10)}`,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    data: {
      id: `txn_${Math.random().toString(36).substring(2, 10)}`,
      status: 'completed',
      customer_id: targetTool?.paddle_customer_id || `ctm_pdl_${Math.random().toString(36).substring(2, 8)}`,
      custom_data: {
        tool_id: targetToolId,
        plan_type: 'directory_featured_lifetime',
        submitted_by: 'founder@startup.com',
      },
      details: {
        totals: {
          total: amount,
          currency_code: 'USD',
        },
      },
    },
  };

  const handleSimulateWebhook = () => {
    setIsSimulating(true);
    setWebhookResponse(null);

    setTimeout(() => {
      setIsSimulating(false);

      if (eventType === 'transaction.completed') {
        onTriggerWebhookUpgrade(targetToolId, mockPayload.data.customer_id);
        setWebhookResponse({
          status: 200,
          statusText: 'OK',
          data: {
            success: true,
            message: `Tool "${targetTool?.name || targetToolId}" successfully upgraded to Featured & Approved via Paddle Webhook.`,
            tool_id: targetToolId,
            db_updates: {
              is_featured: true,
              is_approved: true,
              paddle_customer_id: mockPayload.data.customer_id,
            },
          },
        });
      } else {
        setWebhookResponse({
          status: 200,
          statusText: 'OK',
          data: {
            received: true,
            message: 'Event acknowledged, no directory upgrade triggered for uncompleted status.',
          },
        });
      }
    }, 900);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(mockPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c0d14] border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-7 text-zinc-100 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Paddle Webhook Simulator
              <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                POST /api/webhooks/paddle
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Simulate Paddle Billing v2 events to test automated Supabase database upgrades.
            </p>
          </div>
        </div>

        {/* Simulator Controls */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Select Target App / Tool
            </label>
            <select
              value={targetToolId}
              onChange={(e) => setTargetToolId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 focus:border-amber-500 outline-none cursor-pointer"
            >
              {tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_featured ? '★ [Already Featured]' : t.is_approved ? '✓ [Approved]' : '⏳ [Pending Queue]'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Paddle Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 text-xs text-zinc-200 border border-zinc-700 focus:border-amber-500 outline-none cursor-pointer"
            >
              <option value="transaction.completed">transaction.completed (Triggers Upgrade)</option>
              <option value="transaction.created">transaction.created (Pending checkout)</option>
            </select>
          </div>
        </div>

        {/* Payload Preview */}
        <div className="mt-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5 font-mono">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              Webhook Payload (JSON)
            </span>
            <button
              onClick={handleCopyPayload}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-2 py-1 rounded border border-zinc-800 transition"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>

          <div className="bg-[#07080c] border border-zinc-800/90 rounded-xl p-3.5 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-48 scrollbar-thin">
            <pre>{JSON.stringify(mockPayload, null, 2)}</pre>
          </div>
        </div>

        {/* Dispatch Action */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Includes simulated HMAC-SHA256 <code className="text-zinc-300">paddle-signature</code> header</span>
          </div>

          <button
            onClick={handleSimulateWebhook}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:brightness-110 shadow-md shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
          >
            {isSimulating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Webhook...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-zinc-950" />
                <span>Dispatch Test Webhook</span>
              </>
            )}
          </button>
        </div>

        {/* Webhook Response Log */}
        {webhookResponse && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>HTTP 200 Response from /api/webhooks/paddle</span>
            </div>
            <pre className="font-mono text-[11px] text-emerald-200 mt-2 bg-black/40 p-2.5 rounded-lg overflow-x-auto">
              {JSON.stringify(webhookResponse.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
