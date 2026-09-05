import React, { useState } from "react";
import { ChevronDown, HelpCircle, Mail, X } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "How do I submit my app?",
    answer:
      "Free submissions enter the moderation queue and are reviewed within 24-48 hours. The $19 Featured Tier offers instant auto-approval and top directory placement.",
  },
  {
    question: "How does Acquire Mode / Deal Room work?",
    answer:
      "Buyers can submit non-binding offers and message founders directly. Due diligence, escrow, and final asset transfer are conducted directly between buyer and seller.",
  },
  {
    question: "Is StackDirectory liable for transactions or software quality?",
    answer:
      "No. StackDirectory is a discovery venue. Users and buyers must perform independent due diligence before using or acquiring any listed software.",
  },
  {
    question: "How do upvotes work?",
    answer:
      "Upvotes are locked to 1 per user account or device session to ensure authentic ranking.",
  },
  {
    question: "How do I update or remove my listing?",
    answer:
      "Contact our support team at support@stackbuildco.com with your registered email.",
  },
] as const;

export const FAQModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0e0f17] text-zinc-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="faq-modal-title" className="text-xl font-bold text-white">
                Frequently Asked Questions
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">Answers about StackDirectory</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close frequently asked questions"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scrollbar-thin overflow-y-auto px-6 py-6 sm:px-8">
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, index) => {
              const isOpenItem = openIndex === index;
              const answerId = `faq-answer-${index}`;

              return (
                <div key={item.question} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                  <button
                    type="button"
                    aria-expanded={isOpenItem}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpenItem ? null : index)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-semibold text-white transition hover:bg-zinc-800/70"
                  >
                    <span>{item.question}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-amber-400 transition-transform ${isOpenItem ? "rotate-180" : ""}`} />
                  </button>
                  {isOpenItem && (
                    <div id={answerId} className="border-t border-zinc-800 px-4 pb-4 pt-3 text-sm leading-6 text-zinc-300">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <a
            href="mailto:support@support@stackbuildco.com"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
          >
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
        </div>
      </section>
    </div>
  );
};
