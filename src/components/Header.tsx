import React from "react";
import { LogIn, Plus, UserPlus } from "lucide-react";

interface HeaderProps {
  onOpenSubmit: () => void;
  onOpenAuth?: (mode: "login" | "signup") => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSubmit, onOpenAuth }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0B0F17]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-linear-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-black text-lg">
            ▲
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                StackDirectory
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Log In (slate outline button) */}
          {onOpenAuth && (
            <button
              id="btn-login-header"
              onClick={() => onOpenAuth("login")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 border border-slate-600 hover:border-amber-400/70 hover:text-amber-300 transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
          )}

          {/* Sign Up (accent amber button) */}
          {onOpenAuth && (
            <button
              id="btn-signup-header"
              onClick={() => onOpenAuth("signup")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-zinc-950 bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-md shadow-amber-500/20 active:scale-95 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
          )}

          {/* Submit App CTA */}
          <button
            id="btn-submit-app-header"
            onClick={onOpenSubmit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-950 bg-linear-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-md shadow-amber-500/20 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Submit App</span>
          </button>
        </div>
      </div>
    </header>
  );
};
