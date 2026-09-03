import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  UserPlus,
  X,
} from "lucide-react";
import supabase, { isSupabaseConfigured } from "../lib/supabase";

export type AuthMode = "login" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated?: () => void;
  onToast?: (message: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  onAuthenticated,
  onToast,
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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setSubmitting(true);
    if (!isSupabaseConfigured || !supabase) {
      window.setTimeout(() => {
        onAuthenticated?.();
        onToast?.("Demo account signed in locally.");
        setSubmitting(false);
        setEmail("");
        setPassword("");
        onClose();
      }, 300);
      return;
    }

    const result = isLogin
      ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
      : await supabase.auth.signUp({ email: trimmedEmail, password });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data.session) onAuthenticated?.();
    onToast?.(
      isLogin
        ? "You are now signed in."
        : result.data.session
          ? "Account created and signed in."
          : "Account created. Check your email to confirm it.",
    );
    setEmail("");
    setPassword("");
    onClose();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!isSupabaseConfigured || !supabase) {
      onAuthenticated?.();
      onToast?.("Demo account signed in locally.");
      onClose();
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) setError(oauthError.message);
  };

  const tabClasses = (active: boolean) =>
    [
      "flex-1 py-2 rounded-lg text-xs font-semibold transition",
      active
        ? "bg-amber-500 text-slate-950 border border-amber-400 shadow-sm"
        : "text-slate-500 border border-transparent hover:text-slate-900",
    ].join(" ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? "Log In" : "Create Account"}
      onClick={(e) => {
        // Backdrop click handler — dismiss only when clicking the overlay itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-2xl p-6 animate-slide-up">
        {/* Close (X) button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close auth modal"
          className="absolute top-3 right-3 z-20 text-slate-400 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6 pr-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-slate-950 font-black text-lg">
              ▲
            </div>
            <div>
              <div className="font-bold tracking-tight text-slate-900">StackDirectory</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {isLogin ? "Welcome back" : "Create your free account"}
              </div>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">
            {isLogin ? "Log in to continue" : "Join the directory"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Access tools, upvotes, submissions, and acquisition listings.</p>
        </div>

        {/* Tab buttons: switch between Log In and Create Account */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 bg-slate-50">
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
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 transition"
          >
            <span className="font-black text-amber-600">G</span>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            <span>or email</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          {/* Email */}
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-700 mb-1.5"
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
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-slate-700 mb-1.5"
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
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition"
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
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
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

          <p className="text-center text-xs text-slate-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(isLogin ? "signup" : "login")}
              className="inline-flex items-center gap-0.5 font-semibold text-amber-700 hover:text-amber-600 transition"
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
