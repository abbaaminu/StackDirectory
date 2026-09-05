import React, { useEffect, useState } from "react";
import { Check, Clipboard, LoaderCircle, Mail, X } from "lucide-react";

const SUPPORT_EMAIL = "support@stackbuildco.com";

export const SupportModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [category, setCategory] = useState("General Support");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(false);
    }
  };

  const submitMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!senderName.trim() || !senderEmail.trim() || !message.trim()) {
      setFormError("Please complete your name, email, and message.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SUPPORT_MESSAGE",
          senderName: senderName.trim(),
          senderEmail: senderEmail.trim(),
          category,
          message: message.trim(),
        }),
      });
      if (!response.ok) throw new Error("Support request failed");
      setIsSent(true);
      setSenderName("");
      setSenderEmail("");
      setMessage("");
    } catch {
      setFormError("We could not send your message. Please try again or use one of the email options below.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0e0f17] p-6 text-zinc-100 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support modal"
          className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Mail className="h-5 w-5" />
          </div>
          <h2 id="support-modal-title" className="text-xl font-bold text-white">
            Contact Support
          </h2>
        </div>

        <p className="mt-6 text-sm leading-6 text-zinc-300">
          For legal, account, listing, or technical questions, email our support team at:
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-3 block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-base font-bold text-amber-300 hover:border-amber-500/50"
        >
          {SUPPORT_EMAIL}
        </a>

        {isSent ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-300" role="status">
            Message sent! Our team will reply within 24 hours.
          </div>
        ) : (
          <form onSubmit={submitMessage} className="mt-6 space-y-3">
            {formError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">{formError}</p>}
            <input required value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="Name" aria-label="Name" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-amber-400" />
            <input required type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="Email" aria-label="Email" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-amber-400" />
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400">
              <option>General Support</option>
              <option>App Removal / Update</option>
              <option>Acquisition Inquiry</option>
              <option>Report Listing</option>
            </select>
            <textarea required rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message" aria-label="Message" className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-amber-400" />
            <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60">
              {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Sending..." : "Send Message"}
            </button>
          </form>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void copyEmail()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-xs font-bold text-zinc-950 transition hover:bg-amber-300"
          >
            {isCopied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {isCopied ? "Copied!" : "Copy Email Address"}
          </button>
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${SUPPORT_EMAIL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-700 px-3 py-3 text-xs font-bold text-zinc-200 transition hover:border-amber-400 hover:text-white"
          >
            Open in Gmail
          </a>
          <a
            href={`https://outlook.office.com/mail/deeplink/compose?to=${SUPPORT_EMAIL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-700 px-3 py-3 text-xs font-bold text-zinc-200 transition hover:border-amber-400 hover:text-white"
          >
            Open in Outlook Web
          </a>
        </div>
      </section>
    </div>
  );
};
