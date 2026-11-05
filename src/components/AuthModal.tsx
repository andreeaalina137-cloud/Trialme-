import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { login, signup, type AuthUser, sanitizeReturnToUrl } from '../services/authService';
import { playSubtlePop, playTaDing } from '../utils/soundEffects';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, returnToUrl: string | null) => void;
  returnToUrl?: string | null;
  initialMode?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  returnToUrl,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let user: AuthUser;
      if (mode === 'signup') {
        user = await signup(email, password, name);
      } else {
        user = await login(email, password);
      }
      playTaDing();
      const safeReturn = returnToUrl ? sanitizeReturnToUrl(returnToUrl) : null;
      onSuccess(user, safeReturn);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = (newMode: 'login' | 'signup') => {
    playSubtlePop();
    setMode(newMode);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md modal-backdrop-enter sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="fixed inset-x-0 bottom-0 sm:relative sm:inset-auto max-w-md mx-auto w-full bg-[#161616] border-t border-white/15 rounded-t-[32px] sm:rounded-3xl sm:border sm:border-white/10 flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] overflow-hidden modal-sheet-enter max-h-[92dvh]">
        {/* iOS Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150 sm:hidden"
        />

        <div className="p-6 pt-2 pb-6 flex flex-col space-y-4">
          {/* Top Bar: Close */}
          <div className="w-full flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure Monetry Access
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-95 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Title & Subtitle */}
          <div>
            <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight">
              {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
            </h2>
            <p className="text-xs text-[#A0A0A0] mt-1">
              {mode === 'login'
                ? 'Sign in to activate your free trial shield and arm smart renewal alarms.'
                : 'Join Monetry to protect your bank balance from forgotten subscriptions.'}
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-[#0A0A0A] border border-white/10">
            <button
              type="button"
              onClick={() => toggleMode('login')}
              className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => toggleMode('signup')}
              className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-semibold text-[#A0A0A0] mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Sarah Jenkins"
                    className="w-full bg-[#0A0A0A] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#F5F5F5] placeholder-[#A0A0A0]/60 focus:border-[#D4AF7C] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[#A0A0A0] mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.co.uk"
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#F5F5F5] placeholder-[#A0A0A0]/60 focus:border-[#D4AF7C] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#A0A0A0] mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#F5F5F5] placeholder-[#A0A0A0]/60 focus:border-[#D4AF7C] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[46px] rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF7C]/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In & Continue' : 'Create Account & Continue'}</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-[#A0A0A0] pt-1">
            By continuing you agree to Monetry’s Terms & Privacy Policy. 100% private & bank-grade secure.
          </p>
        </div>
      </div>
    </div>
  );
};
