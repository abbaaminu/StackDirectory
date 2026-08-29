import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";

export type AuthMode = "login" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthMode;
  onClose: () => void;
}

const CITY_BG =
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80";

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const isLogin = mode === "login";

  // Sync the internal tab whenever the requesting entry point (initialMode) changes
  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [initialMode, isOpen]);

  // Lock body scroll & close on Escape while the modal is open
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please fill in both email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    // NOTE: Real authentication (e.g. Supabase Auth) can be wired in here.
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setEmail("");
      setPassword("");
      onClose();
    }, 900);
  };

  const tabClasses = (active: boolean) =>
    [
      "flex-1 py-2 rounded-lg text-xs font-semibold transition",
      active
        ? "bg-amber-500 text-slate-950 border border-amber-400 shadow-sm"
        : "text-slate-400 border border-transparent hover:text-white",
    ].join(" ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? "Log In" : "Create Account"}
      onClick={(e) => {
        // Backdrop click handler — dismiss only when clicking the overlay itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Light clean panel container */}
      <div className="relative w-full max-w-md rounded-2xl bg-[#0F172A] border border-slate-700 text-white shadow-2xl p-6 animate-slide-up">
        {/* Close (X) button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close auth modal"
          className="absolute top-3 right-3 z-20 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700/50 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top banner: city high-rise background graphic */}
        <div className="relative -mx-6 -mt-6 mb-6 h-32 overflow-hidden">
          <img
            src={CITY_BG}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-linear-to-b from-slate-900/40 via-slate-900/60 to-[#0F172A]" />
          <div className="relative z-10 h-full flex items-end justify-between p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-zinc-950 font-black text-lg shadow-lg shadow-amber-500/30">
                ▲
              </div>
              <div>
                <div className="text-white font-bold tracking-tight">
                  StackDirectory
                </div>
                <div className="text-[11px] text-slate-300 flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>
                    {isLogin
                      ? "Welcome back, log in to continue"
                      : "Create your free account"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab buttons: switch between Log In and Create Account */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-700 bg-slate-800/60">
          <button
            type="button"

            onClick={() => setMode("login")}
            className={tabClasses(isLogin)}
          >
            <span className="inline-flex items-center justify-center gap-1.5 w-full">
              <LogIn className="w-3.5 h-3.5" />
              Log In
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={tabClasses(!isLogin)}
          >
            <span className="inline-flex items-center justify-center gap-1.5 w-full">
              <UserPlus className="w-3.5 h-3.5" />
              Create Account
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#1E293B] border border-slate-700 text-white text-sm placeholder-slate-400 focus:border-amber-400 outline-none transition"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-[#1E293B] border border-slate-700 text-white text-sm placeholder-slate-400 focus:border-amber-400 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            {submitting ? (
              "Please wait…"
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                Log In
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Create Account
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(isLogin ? "signup" : "login")}
              className="inline-flex items-center gap-0.5 font-semibold text-amber-400 hover:text-amber-300 transition"
            >
              {isLogin ? "Create Account" : "Log In"}
              <ArrowRight className="w-3 h-3" />
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};
