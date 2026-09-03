import React, { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, Send, ShieldCheck, X } from "lucide-react";
import type { Tool } from "../types/directory";
import supabase, { isSupabaseConfigured } from "../lib/supabase";
import { sanitizeDealMessage } from "../lib/redact";

interface DealConversation {
  id: string;
  tool_id: string;
  buyer_id: string;
  seller_id?: string | null;
  nda_signed: boolean;
}

interface DealMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
}

interface DealRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: Tool | null;
  userId: string;
}

const LOCAL_CONVERSATIONS = "stackdirectory_deal_conversations";
const LOCAL_MESSAGES = "stackdirectory_deal_messages";

function readLocal<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export const DealRoomModal: React.FC<DealRoomModalProps> = ({ isOpen, onClose, tool, userId }) => {
  const [conversation, setConversation] = useState<DealConversation | null>(null);
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !tool) return;
    let cancelled = false;
    const loadRoom = async () => {
      setIsLoading(true);
      setError(null);
      if (!isSupabaseConfigured || !supabase) {
        const localConversation = readLocal<DealConversation>(LOCAL_CONVERSATIONS).find(
          (item) => item.tool_id === tool.id && item.buyer_id === userId,
        );
        const activeConversation = localConversation || {
          id: `conversation_${tool.id}_${userId}`,
          tool_id: tool.id,
          buyer_id: userId,
          seller_id: null,
          nda_signed: false,
        };
        if (!localConversation) {
          localStorage.setItem(LOCAL_CONVERSATIONS, JSON.stringify([
            ...readLocal<DealConversation>(LOCAL_CONVERSATIONS), activeConversation,
          ]));
        }
        if (!cancelled) {
          setConversation(activeConversation);
          setMessages(readLocal<DealMessage>(LOCAL_MESSAGES).filter((item) => item.conversation_id === activeConversation.id));
          setIsLoading(false);
        }
        return;
      }

      const { data: existing, error: conversationError } = await supabase
        .from("deal_conversations")
        .select("*")
        .eq("tool_id", tool.id)
        .eq("buyer_id", userId)
        .maybeSingle();
      if (conversationError) {
        if (!cancelled) setError("Unable to open the deal room. Please try again.");
        setIsLoading(false);
        return;
      }
      let activeConversation = existing as DealConversation | null;
      if (!activeConversation) {
        const { data: created, error: createError } = await supabase
          .from("deal_conversations")
          .insert({ tool_id: tool.id, buyer_id: userId, nda_signed: false } as never)
          .select("*")
          .single();
        if (createError) {
          if (!cancelled) setError("Unable to create the deal room. Please try again.");
          setIsLoading(false);
          return;
        }
        activeConversation = created as DealConversation;
      }
      const { data: roomMessages } = await supabase
        .from("deal_messages")
        .select("*")
        .eq("conversation_id", activeConversation.id)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setConversation(activeConversation);
        setMessages((roomMessages as DealMessage[]) || []);
        setIsLoading(false);
      }
    };
    void loadRoom();
    return () => { cancelled = true; };
  }, [isOpen, tool, userId]);

  useEffect(() => {
    if (!isOpen || !conversation || !isSupabaseConfigured || !supabase) return;
    const channel = supabase
      .channel(`deal-room-${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "deal_messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        setMessages((current) => current.some((item) => item.id === (payload.new as DealMessage).id) ? current : [...current, payload.new as DealMessage]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversation, isOpen]);

  if (!isOpen || !tool) return null;

  const signNda = async () => {
    if (!conversation) return;
    setIsSigning(true);
    if (!isSupabaseConfigured || !supabase) {
      const next = { ...conversation, nda_signed: true };
      const all = readLocal<DealConversation>(LOCAL_CONVERSATIONS).map((item) => item.id === next.id ? next : item);
      localStorage.setItem(LOCAL_CONVERSATIONS, JSON.stringify(all));
      setConversation(next);
      setIsSigning(false);
      return;
    }
    const { error: updateError } = await supabase.from("deal_conversations").update({ nda_signed: true } as never).eq("id", conversation.id);
    if (updateError) setError("We could not record your NDA agreement. Please try again.");
    else setConversation({ ...conversation, nda_signed: true });
    setIsSigning(false);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !conversation || !draft.trim()) return;
    setIsSubmitting(true);
    const { sanitizedText, hasRedactions } = sanitizeDealMessage(draft.trim());
    setNotice(hasRedactions);
    const message = { conversation_id: conversation.id, sender_id: userId, message_text: sanitizedText };
    if (!isSupabaseConfigured || !supabase) {
      const localMessage: DealMessage = { ...message, id: `message_${Date.now()}`, created_at: new Date().toISOString() };
      localStorage.setItem(LOCAL_MESSAGES, JSON.stringify([...readLocal<DealMessage>(LOCAL_MESSAGES), localMessage]));
      setMessages((current) => [...current, localMessage]);
      setDraft("");
      setIsSubmitting(false);
      return;
    }
    const { data, error } = await supabase.from("deal_messages").insert(message as never).select("*").single();
    if (error) {
      console.error("Deal message error:", error);
      setError("Message could not be sent. Please try again.");
    } else if (data) {
      setMessages((current) => [...current, data as DealMessage]);
      setDraft("");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><ShieldCheck className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-slate-950">Deal Room: {tool.name}</h2><p className="text-xs text-slate-500">Private buyer and founder conversation</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close deal room" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </header>
        {isLoading ? <div className="p-10 text-center text-sm text-slate-500">Opening secure deal room...</div> : !conversation?.nda_signed ? (
          <div className="p-8 text-center"><LockKeyhole className="mx-auto h-10 w-10 text-amber-600" /><h3 className="mt-4 text-xl font-bold text-slate-950">Standard Non-Disclosure &amp; Anti-Circumvention Agreement</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">Before viewing private acquisition details or messaging the founder, agree to keep confidential information private and communicate through this Deal Room.</p><button type="button" onClick={() => void signNda()} disabled={isSigning} className="mt-6 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{isSigning ? "Recording agreement..." : "I Agree & Sign NDA"}</button></div>
        ) : (
          <><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5 min-h-64">{messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p> : messages.map((item) => <div key={item.id} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${item.sender_id === userId ? "ml-auto bg-emerald-600 text-white" : "bg-white text-slate-700 border border-slate-200"}`}><p>{item.message_text}</p><time className="mt-1 block text-[10px] opacity-70">{new Date(item.created_at).toLocaleString()}</time></div>)}</div><div className="border-t border-slate-200 p-4">{notice && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">To protect both parties, external links, phone numbers, and email addresses are automatically masked.</p>}{error && <p className="mb-3 text-xs text-red-600">{error}</p>}<form onSubmit={sendMessage} className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message to the founder..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" /><button type="submit" disabled={isSubmitting} aria-label="Send message" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-white hover:bg-emerald-500 disabled:opacity-60">{isSubmitting ? "Submitting..." : <Send className="h-4 w-4" />}</button></form></div></>
        )}
        {conversation?.nda_signed && <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-2 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> NDA verified for this conversation</div>}
      </section>
    </div>
  );
};

export default DealRoomModal;
