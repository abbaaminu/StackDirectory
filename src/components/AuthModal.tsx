import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';

export type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}

const CITY_BG =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  mode,
  onClose,
  onSwitchMode,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while the modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isLogin = mode === 'login';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please fill in both email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    // NOTE: Real authentication (e.g. Supabase Auth) can be wired in here.
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setEmail('');
      setPassword('');
      onClose();
    }, 900);
  };

  const tabClasses = (active: boolean) =>
    [
      'px-3.5 py-1.5 rounded-lg transition text-xs font-semibold',
      active
        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
        : 'text-slate-300 border border-transparent hover:text-white',
    ].join(' ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? 'Log In' : 'Sign Up'}
    >
      <div className="relative w-full max-w-4xl grid md:grid-cols-2 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl animate-slide-up">
        {/* Left: City Design Panel (Flippa-style) */}
        <div className="relative hidden md:block min-h-[540px]">
          <img
            src={CITY_BG}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-slate-950/40" />
          <div className="relative z-10 h-full flex flex-col justify-end p-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-zinc-950 font-black text-lg shadow-lg shadow-amber-500/30 mb-4">
              ▲
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight leading-tight">
              {isLogin ? 'Welcome back to StackDirectory' : 'Join StackDirectory'}
            </h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Discover, upvote, and submit the best developer tools & startups for sale.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-amber-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>100% Free — Boost with Paddle anytime</span>
            </div>
          </div>
        </div>

        {/* Right: Auth Form Panel */}
        <div className="relative bg-[#0c0d14] p-7 sm:p-8">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close auth modal"
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Mobile-only brand */}
          <div className="md:hidden flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-zinc-950 font-black text-sm">
              ▲
            </div>
            <span className="text-lg font-bold text-white">StackDirectory</span>
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">
            {isLogin ? 'Log In' : 'Sign Up'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isLogin
              ? 'Access your saved favorites and manage listings.'
              : 'Create a free account to submit and manage tools.'}
          </p>

          {/* Mode Tabs */}
          <div className="mt-5 inline-flex items-center rounded-xl border border-slate-800 bg-slate-900/60 p-1 gap-1">
            <button
              type="button"
              onClick={() => onSwitchMode('login')}
              className={tabClasses(isLogin)}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('signup')}
              className={tabClasses(!isLogin)}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 placeholder-slate-500 focus:border-amber-400/70 focus:ring-1 focus:ring-amber-500/30 outline-none transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-slate-900 text-white text-sm border border-slate-700 placeholder-slate-500 focus:border-amber-400/70 focus:ring-1 focus:ring-amber-500/30 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 hover:brightness-110 shadow-md shadow-amber-500/25 active:scale-[0.98] transition disabled:opacity-60 disabled:pointer-events-none"
            >
              {submitting ? (
                'Please wait…'
              ) : isLogin ? (
                <>
                  <LogIn className="w-4 h-4" />
                  Log In
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </>
              )}
            </button>

            <p className="text-center text-xs text-slate-500">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => onSwitchMode(isLogin ? 'signup' : 'login')}
                className="inline-flex items-center gap-0.5 font-semibold text-amber-400 hover:text-amber-300 transition"
              >
                {isLogin ? 'Sign Up' : 'Log In'}
                <ArrowRight className="w-3 h-3" />
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

