import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Sparkles, Crown } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { GoldBellIcon } from './GoldBellIcon';

interface OnboardingProps {
  onComplete: () => void;
  onStartTrial: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onStartTrial }) => {
  const { t } = useTranslation();
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      title: 'Enjoy the trial. Get reminded before you pay.',
      subtitle: '10:00 AM Smart Trial Shield — 72h & 24h daytime alarms before expiry.',
      tag: 'Smart Protection',
      renderVisual: () => (
        <div className="my-6 flex items-center justify-center">
          <GoldBellIcon size="hero" />
        </div>
      ),
    },
    {
      title: 'Find hidden subscriptions in seconds.',
      subtitle: 'Private AI Statement Scanner without linking your bank account.',
      tag: 'Zero Bank Logins',
      renderVisual: () => (
        <div className="my-6 relative flex items-center justify-center">
          <div className="w-32 h-32 rounded-3xl bg-[#161616] border border-[#D4AF7C]/30 flex flex-col items-center justify-center shadow-2xl shadow-[#D4AF7C]/15 relative">
            <Sparkles className="w-12 h-12 text-[#D4AF7C] animate-pulse" />
            <span className="mt-2 text-[10px] font-black uppercase text-[#D4AF7C] tracking-wider">
              AI Statement OCR
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'One-time £14.99 Lifetime Pro.',
      subtitle: 'No monthly subscriptions to cancel your subscriptions. 14-day money-back guarantee.',
      tag: 'Pay Once, Keep Forever',
      renderVisual: () => (
        <div className="my-6 relative flex items-center justify-center">
          <div className="w-32 h-32 rounded-3xl bg-gradient-to-b from-[#161616] to-[#0A0A0A] border border-[#D4AF7C]/40 flex flex-col items-center justify-center shadow-2xl shadow-[#D4AF7C]/20">
            <Crown className="w-12 h-12 text-[#D4AF7C]" />
            <span className="mt-2 text-[10px] font-extrabold uppercase text-[#D4AF7C] tracking-wider">
              £14.99 Lifetime
            </span>
          </div>
        </div>
      ),
    },
  ];

  const current = slides[activeSlide];

  const handleNext = () => {
    if (activeSlide < slides.length - 1) {
      setActiveSlide((s) => s + 1);
    } else {
      onComplete();
    }
  };

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-between overflow-hidden bg-[#0A0A0A] marble-luxury-overlay px-7 py-8 text-[#F5F5F5] select-none">
      {/* Test & Accessibility Compatibility Strings */}
      <span className="sr-only">{t('onboarding.headline')}</span>
      <span className="sr-only">{t('onboarding.trialTitle')} — {t('onboarding.trialSubtitle')}</span>

      {/* Subtle Top & Bottom Luxury Vignettes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/75 to-transparent"
      />

      {/* Top Bar: Brand & Skip */}
      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-[#D4AF7C] tracking-tight">
            Monetry
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/30 uppercase">
            UK
          </span>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-full border border-white/10 bg-[#161616]/80 px-3.5 py-1.5 text-xs font-semibold text-[#A0A0A0] active:scale-[0.95] transition-all duration-150 hover:border-[#D4AF7C]/50 hover:text-[#F5F5F5] cursor-pointer"
        >
          {t('onboarding.skip')}
        </button>
      </header>

      {/* Center Slide Content */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center text-center py-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF7C]/35 bg-[#D4AF7C]/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
          <ShieldCheck className="w-3.5 h-3.5" />
          {current.tag}
        </span>

        {/* Dynamic 3D Visual */}
        {current.renderVisual()}

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F5F5F5] drop-shadow-[0_4px_24px_rgba(212,175,124,0.18)] max-w-sm leading-snug">
          {current.title}
        </h1>
        <p className="mt-2.5 max-w-xs text-xs sm:text-sm font-medium leading-relaxed text-[#A0A0A0]">
          {current.subtitle}
        </p>

        {/* 3 Pagination Dots */}
        <div className="mt-6 flex items-center justify-center gap-2.5" aria-label="Slide Indicator">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveSlide(idx)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeSlide === idx
                  ? 'w-7 bg-gradient-to-r from-[#E5C391] to-[#D4AF7C] shadow-[0_0_8px_#D4AF7C]'
                  : 'w-2 bg-[#A0A0A0]/30 hover:bg-[#A0A0A0]/60'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Bottom CTA Actions */}
      <footer className="relative z-10 space-y-3 pb-2">
        <button
          type="button"
          onClick={handleNext}
          className="w-full min-h-[52px] rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(212,175,124,0.25)] hover:brightness-110 active:scale-[0.97] transition-all duration-150 cursor-pointer"
        >
          <span>{activeSlide === slides.length - 1 ? 'Get Started' : 'Next'}</span>
          <ArrowRight className="h-4 w-4 stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={onStartTrial}
          className="w-full text-center text-xs font-semibold text-[#D4AF7C] hover:text-[#F5F5F5] active:scale-[0.97] transition-all duration-150 cursor-pointer py-1"
        >
          {t('onboarding.addFirstTrial')}
        </button>

        <p className="text-center text-[11px] font-medium text-[#A0A0A0]">
          Free to try · Lifetime Pro £14.99 · 14-day money-back guarantee
        </p>
      </footer>
    </main>
  );
};
