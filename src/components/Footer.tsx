import React from "react";

interface FooterProps {
  onOpenFAQ: () => void;
  onOpenTerms: () => void;
  onOpenSupport: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenFAQ, onOpenTerms, onOpenSupport }) => (
  <footer className="relative z-10 border-t border-slate-200 bg-white/80 px-4 py-6 text-slate-600 backdrop-blur-sm">
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs sm:flex-row">
      <p>© 2026 StackDirectory by StackBuild Co</p>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <button type="button" onClick={onOpenFAQ} className="transition hover:text-slate-950 hover:underline">
          FAQs
        </button>
        <button type="button" onClick={onOpenTerms} className="transition hover:text-slate-950 hover:underline">
          Terms &amp; Conditions
        </button>
        <button type="button" onClick={onOpenSupport} className="transition hover:text-slate-950 hover:underline">
          Contact Support
        </button>
      </nav>
    </div>
  </footer>
);
