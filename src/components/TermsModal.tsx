import React, { useEffect } from "react";
import { FileText, X } from "lucide-react";

export const TermsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0e0f17] text-zinc-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-xl font-bold text-white">
                Terms &amp; Legal Disclaimers
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">StackDirectory by StackBuild Co</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close terms and legal disclaimers"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="scrollbar-thin overflow-y-auto px-6 py-6 sm:px-8">
          <p className="mb-6 text-sm leading-6 text-zinc-300">
            Please review these important terms before using StackDirectory, its listings, or its deal room features.
          </p>

          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Platform Role</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                StackDirectory, operated by StackBuild Co, acts strictly as an informational directory and listing venue. We do not own, verify, audit, or guarantee any third-party apps, software, source code, metrics including MRR or profit, or claims made by sellers or developers.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Strict Limitation of Liability</h3>
              <p className="mt-2 text-sm font-semibold uppercase leading-6 text-zinc-200">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, STACKDIRECTORY AND STACKBUILD CO SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, FINANCIAL LOSSES, CODE VULNERABILITIES, DATA BREACHES, OR FAILED ACQUISITION TRANSACTIONS ARISING FROM THE USE OF ANY LISTED APP OR DEAL ROOM NEGOTIATION.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Buyer &amp; User Due Diligence</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Buyers and users are solely responsible for performing their own technical, financial, and legal due diligence before purchasing, acquiring, or using any software listed on StackDirectory.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">“As-Is” Provision</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                All listings and tools are provided on an “AS IS” and “AS AVAILABLE” basis without warranties of any kind, whether express, implied, statutory, or otherwise.
              </p>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Contact Notice</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Legal or support inquiries should be addressed to{" "}
                <a className="font-semibold text-amber-300 hover:text-amber-200 hover:underline" href="mailto:support@stackbuildco.com">
                  support@stackbuildco.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
};
