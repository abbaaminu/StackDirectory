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

interface AcquisitionOffer {
  id: string;
  tool_id: string;
  buyer_id?: string;
  offer_amount: number;
  message?: string | null;
  status: string;
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
const LOCAL_OFFERS = "stackdirectory_acquisition_offers";

const getToolSlug = (tool: Tool): string =>
  tool.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || tool.id;

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
  const [offers, setOffers] = useState<AcquisitionOffer[]>([]);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

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
          setOffers(readLocal<AcquisitionOffer>(LOCAL_OFFERS).filter((item) => item.tool_id === tool.id && item.buyer_id === userId));
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
      const { data: existingOffers, error: offersError } = await supabase
        .from("acquisition_offers")
        .select("*")
        .eq("tool_id", tool.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setConversation(activeConversation);
        setMessages((roomMessages as DealMessage[]) || []);
        if (offersError) setError("Unable to load existing offers.");
        setOffers((existingOffers as AcquisitionOffer[]) || []);
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

  const submitOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(offerAmount);
    if (!conversation || !tool || !Number.isFinite(amount) || amount <= 0) {
      setError("Please enter a valid offer amount.");
      return;
    }

    setIsSubmittingOffer(true);
    setError(null);
    const messageText = offerMessage.trim();
    const formattedMessage = `[OFFER SUBMITTED] $${amount.toLocaleString("en-US")} USD: ${messageText}`;
    try {
      if (!isSupabaseConfigured || !supabase) {
        const localOffer: AcquisitionOffer = {
          id: `offer_${Date.now()}`,
          tool_id: tool.id,
          buyer_id: userId,
          offer_amount: amount,
          message: messageText,
          status: "pending",
          created_at: new Date().toISOString(),
        };
        const localOffers = [...readLocal<AcquisitionOffer>(LOCAL_OFFERS), localOffer];
        localStorage.setItem(LOCAL_OFFERS, JSON.stringify(localOffers));
        const localMessage: DealMessage = {
          id: `message_${Date.now()}`,
          conversation_id: conversation.id,
          sender_id: userId,
          message_text: formattedMessage,
          created_at: new Date().toISOString(),
        };
        localStorage.setItem(LOCAL_MESSAGES, JSON.stringify([...readLocal<DealMessage>(LOCAL_MESSAGES), localMessage]));
        setOffers((current) => [localOffer, ...current]);
        setMessages((current) => [...current, localMessage]);
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const buyerEmail = authData.user?.email || `${userId}@local.invalid`;
        const buyerName = authData.user?.user_metadata?.full_name || buyerEmail;
        const { data: createdOffer, error: offerError } = await supabase
          .from("acquisition_offers")
          .insert({
            tool_id: tool.id,
            buyer_id: userId,
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            offer_amount: amount,
            message: messageText || null,
            status: "pending",
          } as never)
          .select("*")
          .single();
        if (offerError) throw offerError;

        const { data: createdMessage, error: messageError } = await supabase
          .from("deal_messages")
          .insert({
            conversation_id: conversation.id,
            sender_id: userId,
            message_text: formattedMessage,
          } as never)
          .select("*")
          .single();
        if (messageError) throw messageError;
        setOffers((current) => [createdOffer as AcquisitionOffer, ...current]);
        setMessages((current) => [...current, createdMessage as DealMessage]);
      }
      const ownerEmail = tool.seller_contact?.trim();
      if (ownerEmail) {
        void fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "NEW_OFFER",
            toolName: tool.name,
            ownerEmail,
            offerAmount: amount,
            message: messageText,
            toolSlug: getToolSlug(tool),
          }),
        }).catch((notificationError) => {
          console.error("Offer notification failed:", notificationError);
        });
      }
      setOfferAmount("");
      setOfferMessage("");
      setIsOfferModalOpen(false);
    } catch (submitError) {
      console.error("Offer submission failed:", submitError);
      setError("Could not submit your offer. Please try again.");
    } finally {
      setIsSubmittingOffer(false);
    }
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
          <><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5 min-h-64">{offers.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Active Offer:</strong> ${offers[0].offer_amount.toLocaleString("en-US")} <span className="ml-2 inline-flex rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs font-bold uppercase">{offers[0].status.charAt(0).toUpperCase() + offers[0].status.slice(1)}</span></div>}{messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p> : messages.map((item) => <div key={item.id} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${item.sender_id === userId ? "ml-auto bg-emerald-600 text-white" : "bg-white text-slate-700 border border-slate-200"}`}><p>{item.message_text}</p><time className="mt-1 block text-[10px] opacity-70">{new Date(item.created_at).toLocaleString()}</time></div>)}</div><div className="border-t border-slate-200 p-4">{notice && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">To protect both parties, external links, phone numbers, and email addresses are automatically masked.</p>}{error && <p className="mb-3 text-xs text-red-600">{error}</p>}{tool.is_for_sale && <button type="button" onClick={() => setIsOfferModalOpen(true)} className="mb-3 w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300">Submit Offer</button>}<form onSubmit={sendMessage} className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message to the founder..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" /><button type="submit" disabled={isSubmitting} aria-label="Send message" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-white hover:bg-emerald-500 disabled:opacity-60">{isSubmitting ? "Submitting..." : <Send className="h-4 w-4" />}</button></form></div></>
        )}
        {conversation?.nda_signed && <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-2 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> NDA verified for this conversation</div>}
      </section>
      {isOfferModalOpen && <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
        <form onSubmit={submitOffer} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-950">Submit Formal Offer</h3><button type="button" onClick={() => setIsOfferModalOpen(false)} aria-label="Close offer form" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <label className="mt-5 block text-sm font-semibold text-slate-700">Offer Amount ($ USD)<input type="number" min="1" step="0.01" required value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-400" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Introductory Note / Terms<textarea rows={4} value={offerMessage} onChange={(event) => setOfferMessage(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-400" /></label>
          <button type="submit" disabled={isSubmittingOffer} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{isSubmittingOffer ? "Submitting offer..." : "Submit Offer"}</button>
        </form>
      </div>}
    </div>
  );
};

export default DealRoomModal;
