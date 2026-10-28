import React, { useState } from 'react';
import { X, Check, Sparkles, Zap, Crown, ShieldCheck, Lock, KeyRound } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { UserPlan } from '../types/subscription';
import { formatPrice } from '../utils/subscriptionCalculations';
import { generateLicenseKey, parseRestoredLicensePlan } from '../utils/retentionAndTrust';
import { playSubtlePop, playSuccessFanfare } from '../utils/soundEffects';
import { useTranslation } from '../i18n/LanguageContext';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlan: (plan: UserPlan) => void;
  currencySymbol: string;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onSelectPlan,
  currencySymbol,
}) => {
  const { t } = useTranslation();
  const [selectedTier, setSelectedTier] = useState<'standard' | 'pro'>('pro');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRestoreBox, setShowRestoreBox] = useState(false);
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreError, setRestoreError] = useState('');

  if (!isOpen) return null;

  const proPriceText = formatPrice(14.99, currencySymbol);
  const stdPriceText = formatPrice(9.99, currencySymbol);
  const anchorPriceText = formatPrice(29.99, currencySymbol);

  const handlePurchase = (tier: 'standard' | 'pro') => {
    playSubtlePop();
    setIsProcessing(true);
    setTimeout(() => {
      generateLicenseKey(tier);
      setIsProcessing(false);
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#D4AF7C', '#B79B6B', '#F5F5F5', '#E2C391'],
      });
      playSuccessFanfare();
      onSelectPlan(tier);
      onClose();
    }, 700);
  };

  const handleRestore = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const parsed = restoreInput.trim() ? parseRestoredLicensePlan(restoreInput) : null;
      if (restoreInput.trim() && !parsed) {
        setIsProcessing(false);
        setRestoreError('Enter a valid SUB-PRO / SUB-STD key or your purchase email.');
        return;
      }
      const restoredPlan = parsed ? parsed.plan : 'pro';
      generateLicenseKey(restoredPlan);
      setIsProcessing(false);
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#D4AF7C', '#B79B6B', '#F5F5F5', '#E2C391'],
      });
      playSuccessFanfare();
      onSelectPlan(restoredPlan);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <div
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto h-[88dvh] w-full bg-[#161616] border-t border-white/15 rounded-t-[32px] flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] overflow-hidden modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
      >
        {/* Native iOS Bottom Sheet Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150"
        />

        {/* Top Hero Banner */}
        <div className="relative overflow-hidden p-5 pb-4 bg-[#161616] marble-luxury-overlay border-b border-white/10">
          <div className="absolute top-3 right-3 z-20">
            <button
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.95] transition-all duration-150 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative z-10 flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/40">
              <Crown className="w-3.5 h-3.5 text-[#D4AF7C]" />
              {t('paywall.pill')}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#1F1F1F] text-[#F5F5F5] border border-white/10">
              <Lock className="w-3 h-3 text-[#D4AF7C]" />
              No Open Banking Needed
            </span>
          </div>

          <h2 id="paywall-title" className="relative z-10 text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight leading-snug">
            {t('paywall.title')}
          </h2>

          <p className="relative z-10 text-sm font-bold text-[#D4AF7C] mt-1">
            {t('paywall.subtitle')}
          </p>

          <p className="relative z-10 text-xs text-[#A0A0A0] mt-1 leading-relaxed">
            {t('paywall.body')}
          </p>

          <div className="relative z-10 mt-3 flex items-center gap-2 text-xs text-[#F5F5F5] bg-[#1F1F1F] p-2.5 rounded-2xl border border-white/10">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#D4AF7C]" />
            <span className="text-[11px] font-medium text-[#F5F5F5]/90">
              {t('paywall.socialProof')} · Costs less than 1 forgotten trial renewal!
            </span>
          </div>
        </div>

        {/* Scrollable Plan Selection */}
        <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
          {/* Pro Tier (Featured / Upsell) */}
          <button
            type="button"
            onClick={() => setSelectedTier('pro')}
            aria-pressed={selectedTier === 'pro'}
            className={`relative w-full p-4 text-left rounded-3xl border transition-all active:scale-[0.98] cursor-pointer ${
              selectedTier === 'pro'
                ? 'bg-[#1F1F1F] glow-gold border-[#D4AF7C] shadow-xl'
                : 'bg-[#161616] border-white/10 hover:border-[#D4AF7C]/50'
            }`}
          >
            <div className="absolute -top-3 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider btn-champagne text-[#0A0A0A] shadow-sm">
              {t('paywall.recommendedBadge')}
            </div>

            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-extrabold text-base text-[#F5F5F5] flex items-center gap-1.5">
                  {t('paywall.lifetimeProTitle')}
                  <Sparkles className="w-4 h-4 text-[#D4AF7C]" />
                </h3>
                <p className="text-[11px] text-[#A0A0A0]">{t('paywall.lifetimeProDesc')}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#A0A0A0] line-through font-mono">
                  {anchorPriceText}
                </div>
                <div className="text-2xl font-black text-[#D4AF7C] font-mono leading-none">
                  {proPriceText}
                </div>
                <div className="text-[10px] text-[#A0A0A0] font-medium mt-0.5">{t('paywall.oneTime')}</div>
              </div>
            </div>

            <div className="space-y-1.5 mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 text-[#F5F5F5]">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span><strong>{t('paywall.featureUnlimited')}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-[#F5F5F5]">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span><strong>{t('paywall.featureAiScanner')}</strong> (10 scans/mo fair-use)</span>
              </div>
              <div className="flex items-center gap-2 text-[#F5F5F5]">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>{t('paywall.featureCancelAssistant')}</span>
              </div>
              <div className="flex items-center gap-2 text-[#F5F5F5]">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>{t('paywall.featureExport')} & JSON Cloud-Free Backup</span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[#D4AF7C]/30 bg-[#0A0A0A]/70 px-3 py-2 text-[10px] font-semibold leading-relaxed text-[#D4AF7C]">
              {t('paywall.proValueLine')}
            </div>
          </button>

          {/* Standard Tier (Decoy / Anchor) */}
          <button
            type="button"
            onClick={() => setSelectedTier('standard')}
            aria-pressed={selectedTier === 'standard'}
            className={`w-full p-4 text-left rounded-3xl border transition-all active:scale-[0.98] cursor-pointer ${
              selectedTier === 'standard'
                ? 'bg-[#1F1F1F] border-[#D4AF7C]'
                : 'bg-[#161616] border-white/10 hover:border-[#D4AF7C]/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-sm text-[#F5F5F5]">{t('paywall.lifetimeStdTitle')}</h3>
                <p className="text-[11px] text-[#A0A0A0]">{t('paywall.lifetimeStdDesc')}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-[#F5F5F5] font-mono">
                  {stdPriceText}
                </div>
                <div className="text-[10px] text-[#A0A0A0] font-medium">{t('paywall.oneTime')}</div>
              </div>
            </div>

            <div className="space-y-1 mt-2.5 pt-2.5 border-t border-white/10 text-[#F5F5F5]/90">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>{t('paywall.featureUnlimitedStd')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>{t('paywall.featureRemindersStd')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>{t('paywall.featureBasicCancel')}</span>
              </div>
            </div>
          </button>

          {showRestoreBox && (
            <div className="rounded-3xl border border-white/10 bg-[#161616] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#D4AF7C] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Restore via License Key or Purchase Email
                </span>
                <button
                  type="button"
                  onClick={() => setShowRestoreBox(false)}
                  className="text-[10px] text-[#A0A0A0] hover:text-[#F5F5F5] cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={restoreInput}
                  onChange={(e) => {
                    setRestoreInput(e.target.value);
                    setRestoreError('');
                  }}
                  placeholder="SUB-PRO-XXXX or email@domain.co.uk"
                  className="input-luxury min-h-[42px] flex-1 rounded-full px-4 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={handleRestore}
                  className="btn-champagne min-h-[42px] px-4 py-2 rounded-full font-bold text-xs text-[#0A0A0A] cursor-pointer"
                >
                  Verify
                </button>
              </div>
              {restoreError && <p className="text-[10px] text-rose-400">{restoreError}</p>}
            </div>
          )}
        </div>

        {/* Purchase CTA */}
        <div className="p-4 border-t border-white/10 shrink-0 bg-[#161616]/90 backdrop-blur-xl space-y-2.5">
          <button
            onClick={() => handlePurchase(selectedTier)}
            disabled={isProcessing}
            className="btn-champagne min-h-[48px] w-full py-4 px-6 rounded-full font-black text-sm text-[#0A0A0A] active:scale-[0.97] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <span>{t('paywall.processing')}</span>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-[#0A0A0A]" />
                <span>
                  {selectedTier === 'pro'
                    ? currencySymbol === '£'
                      ? t('paywall.buyPro')
                      : `${t('paywall.lifetimeProTitle')} (${proPriceText})`
                    : currencySymbol === '£'
                    ? t('paywall.buyStd')
                    : `${t('paywall.lifetimeStdTitle')} (${stdPriceText})`}
                </span>
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[11px] text-[#A0A0A0] px-2">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
              {t('paywall.moneyBack')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRestoreBox((v) => !v)}
                className="hover:text-[#D4AF7C] underline cursor-pointer text-[10px]"
              >
                Enter Key
              </button>
              <button
                onClick={handleRestore}
                className="hover:text-[#D4AF7C] underline cursor-pointer"
              >
                {t('paywall.restore')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
