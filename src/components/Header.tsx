import React from "react";
import { LogIn, Plus, UserPlus, LogOut } from "lucide-react";

interface HeaderProps {
  onOpenSubmit: () => void;
  onOpenAuth?: (mode: "login" | "signup") => void;
  onOpenAdmin?: () => void;
  isAuthenticated: boolean;
  userEmail?: string;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSubmit, onOpenAuth, onOpenAdmin, isAuthenticated, userEmail, onSignOut }) => {
  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-linear-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-black text-lg">
            ▲
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                StackDirectory
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isAuthenticated && onOpenAuth && (
            <button
              id="btn-login-header"
              onClick={() => onOpenAuth("login")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400 bg-white transition-all active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
          )}

          {!isAuthenticated && onOpenAuth && (
            <button
              id="btn-signup-header"
              onClick={() => onOpenAuth("signup")}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-1.5 rounded-lg text-sm shadow-sm transition-all active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
          )}

          {isAuthenticated && userEmail && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 max-w-44" title={userEmail}>
              <span className="h-7 w-7 rounded-full bg-amber-100 text-amber-800 grid place-items-center font-bold shrink-0">
                {userEmail.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{userEmail}</span>
            </div>
          )}
          {isAuthenticated && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            >
              Review Queue
            </button>
          )}
          {isAuthenticated && (
            <>
              <button id="btn-submit-app-header" onClick={onOpenSubmit} className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-1.5 rounded-lg text-sm shadow-sm transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Submit App</span>
              </button>
              <button onClick={onSignOut} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition" title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
