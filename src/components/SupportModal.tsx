import React, { useEffect, useState } from "react";
import { Check, Clipboard, Mail, X } from "lucide-react";

const SUPPORT_EMAIL = "support@stackbuildco.com";

export const SupportModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [isCopied, setIsCopied] = useState(false);

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
