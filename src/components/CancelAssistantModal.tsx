import React, { useState } from 'react';
import { X, ExternalLink, Mail, MessageSquare, Copy, Check, CheckCircle2, Sparkles, ArrowUpRight } from 'lucide-react';
import type { Subscription } from '../types/subscription';
import type { ConfettiOrigin } from './ConfettiExplosion';
import { getCheaperAlternative } from '../data/cheaperAlternatives';
import { convertFrequencyToMonthly, formatPrice } from '../utils/subscriptionCalculations';
import { playSuccessFanfare } from '../utils/soundEffects';
import { useTranslation } from '../i18n/LanguageContext';

interface CancelAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription;
  subscriptions: Subscription[];
  onConfirmCancellation: (subscriptionId: string) => void;
  currencySymbol: string;
  onCelebrate: (origin: ConfettiOrigin) => void;
}

export const CancelAssistantModal: React.FC<CancelAssistantModalProps> = ({
  isOpen,
  onClose,
  subscription,
  subscriptions,
  onConfirmCancellation,
  currencySymbol,
  onCelebrate,
}) => {
  const { t } = useTranslation();
  const [copiedType, setCopiedType] = useState<'email' | 'sms' | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isAlternativeDismissed, setIsAlternativeDismissed] = useState(false);

  if (!isOpen) return null;

  const defaultGuideSteps = subscription.cancelGuideSteps || [
    `Log into your official ${subscription.name} account dashboard`,
    'Navigate to Account Settings -> Subscriptions, Billing or Membership',
    'Click Cancel Subscription and confirm termination before the next billing cycle',
  ];

  const emailSubject = `Notice of Cancellation: ${subscription.name} Recurring Subscription - ${accountName || '[Account Name]'}`;
  const emailBody = `Dear Customer Support Team at ${subscription.name},

Please accept this email as formal notice of my cancellation of the recurring subscription for ${subscription.name}, associated with account email: ${userEmail || '[Your Account Email / Customer ID]'}.

Account Holder: ${accountName || '[Your Full Name]'}
Service: ${subscription.name}

Under the UK Consumer Rights Act and relevant consumer contract regulations, I request that all upcoming Direct Debits or recurring card payments be stopped immediately.

Please confirm in writing by return email that this subscription has been cancelled and that no further debits will take place.

Thank you for your prompt confirmation.

Yours sincerely,
${accountName || '[Your Full Name]'}`;

  const smsText = `STOP ${subscription.name.toUpperCase()}: Please cancel my recurring subscription for account ${userEmail || '[Email]'}. Please confirm cancellation.`;
  const cheaperAlternative = getCheaperAlternative(subscription, subscriptions);
  const monthlySavings = convertFrequencyToMonthly(subscription.price, subscription.frequency);

  const copyToClipboard = (text: string, type: 'email' | 'sms') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    onCelebrate({ x: event.clientX, y: event.clientY });
    playSuccessFanfare();
    onConfirmCancellation(subscription.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm">
      <div
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto h-[88dvh] w-full bg-[#161616] border-t border-white/15 rounded-t-[28px] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-modal-title"
      >
        {/* Native iOS Bottom Sheet Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/25 rounded-full mx-auto my-3 shrink-0 cursor-pointer"
        />

        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-xs">
              ✂️
            </div>
            <div>
              <h2 id="cancel-modal-title" className="text-sm font-bold text-[#F5F5F5]">
                {t('cancel.title', { name: subscription.name })}
              </h2>
              <p className="text-[11px] text-[#D4AF7C] font-semibold">
                {t('cancel.savingsHeadline', {
                  price: formatPrice(monthlySavings, subscription.currency || currencySymbol),
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#1F1F1F] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {cheaperAlternative && !isAlternativeDismissed && (
            <aside className="relative rounded-3xl border border-[#D4AF7C]/35 bg-[#161616] p-3.5 shadow-lg">
              <button
                type="button"
                onClick={() => setIsAlternativeDismissed(true)}
                className="absolute right-2 top-2 rounded-full p-1 text-[#A0A0A0] transition-colors hover:bg-white/5 hover:text-[#F5F5F5]"
                aria-label={t('cancel.alternativeDismiss')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-2.5 pr-6">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4AF7C]/30 bg-[#D4AF7C]/15 text-[#D4AF7C]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
                    {t('cancel.alternativeEyebrow')}
                  </div>
                  <h3 className="mt-0.5 text-xs font-bold text-[#F5F5F5]">
                    {t('cancel.alternativeTitle', { name: cheaperAlternative.name })}
                  </h3>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#A0A0A0]">
                    {t('cancel.alternativeBody', {
                      price: formatPrice(cheaperAlternative.monthlyPrice, cheaperAlternative.currency),
                      saving: formatPrice(cheaperAlternative.monthlySaving, cheaperAlternative.currency),
                      annualSaving: formatPrice(cheaperAlternative.monthlySaving * 12, cheaperAlternative.currency),
                    })}
                  </p>
                  <a
                    href={cheaperAlternative.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#D4AF7C]/35 bg-[#1F1F1F] px-3 py-1.5 text-[10px] font-bold text-[#D4AF7C] transition-colors hover:border-[#D4AF7C]"
                  >
                    {t('cancel.alternativeCta')}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </aside>
          )}

          {/* Direct cancellation link */}
          {subscription.cancelUrl && (
            <div className="p-4 rounded-3xl bg-[#161616] border border-[#D4AF7C]/35 space-y-2">
              <div className="text-xs font-bold text-[#D4AF7C] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D4AF7C]" />
                {t('cancel.step1Title')}
              </div>
              <p className="text-[11px] text-[#A0A0A0]">
                {t('cancel.step1Desc', { name: subscription.name })}
              </p>
              <a
                href={subscription.cancelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-champagne inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-full text-[#0A0A0A] font-extrabold text-xs cursor-pointer shadow-md"
              >
                <span>{t('cancel.openPortalButton')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Step by step guide */}
          <div className="p-4 rounded-3xl bg-[#1F1F1F]/70 border border-white/[0.08] space-y-2.5">
            <h3 className="font-bold text-[#F5F5F5] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#D4AF7C]" />
              {t('cancel.step2Title')}
            </h3>
            <ol className="space-y-2 pl-1">
              {defaultGuideSteps.map((stepText, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[#A0A0A0]">
                  <span className="w-4 h-4 rounded-full bg-[#0A0A0A] text-[#D4AF7C] font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 border border-[#D4AF7C]/40">
                    {idx + 1}
                  </span>
                  <span>{stepText}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Email Template */}
          <div className="p-4 rounded-3xl bg-[#1F1F1F]/70 border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#F5F5F5] flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-[#D4AF7C]" />
                {t('cancel.emailTemplateTitle')}
              </h3>
              <button
                type="button"
                onClick={() => copyToClipboard(`${emailSubject}\n\n${emailBody}`, 'email')}
                className="px-3 py-1.5 rounded-full bg-[#0A0A0A] border border-white/10 hover:border-[#D4AF7C] text-[#F5F5F5] flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
              >
                {copiedType === 'email' ? (
                  <>
                    <Check className="w-3 h-3 text-[#D4AF7C]" />
                    {t('cancel.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    {t('cancel.copyEmail')}
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder={t('cancel.yourName')}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="input-luxury rounded-full px-3 py-1.5 text-xs"
              />
              <input
                type="email"
                placeholder={t('cancel.yourEmail')}
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="input-luxury rounded-full px-3 py-1.5 text-xs"
              />
            </div>

            <div className="p-2.5 rounded-2xl bg-[#0A0A0A] border border-white/[0.08] font-mono text-[11px] text-[#A0A0A0] max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              <strong className="text-[#F5F5F5] font-sans block mb-1">Subject: {emailSubject}</strong>
              {emailBody}
            </div>

            {subscription.cancelEmail && (
              <a
                href={`mailto:${subscription.cancelEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                className="block text-center py-2 px-3 rounded-full bg-[#D4AF7C]/20 hover:bg-[#D4AF7C]/30 text-[#D4AF7C] font-semibold border border-[#D4AF7C]/35 transition-colors"
              >
                {t('cancel.openInMail')} ({subscription.cancelEmail})
              </a>
            )}
          </div>

          {/* SMS Template */}
          <div className="p-4 rounded-3xl bg-[#1F1F1F]/70 border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#F5F5F5] flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#D4AF7C]" />
                {t('cancel.smsTemplateTitle')}
              </h3>
              <button
                type="button"
                onClick={() => copyToClipboard(smsText, 'sms')}
                className="px-3 py-1.5 rounded-full bg-[#0A0A0A] border border-white/10 hover:border-[#D4AF7C] text-[#F5F5F5] flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {copiedType === 'sms' ? (
                  <>
                    <Check className="w-3 h-3 text-[#D4AF7C]" />
                    {t('cancel.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    {t('cancel.copySms')}
                  </>
                )}
              </button>
            </div>
            <div className="p-2 rounded-2xl bg-[#0A0A0A] border border-white/[0.08] font-mono text-[11px] text-[#A0A0A0]">
              {smsText}
            </div>
          </div>
        </div>

        {/* Footer Confirmation */}
        <div className="p-4 border-t border-white/[0.08] shrink-0 bg-[#161616]/95 space-y-2">
          <button
            onClick={handleConfirm}
            className="w-full py-4 px-5 rounded-full font-black text-sm bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-[0_4px_20px_rgba(212,175,124,0.25)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            <span>{t('cancel.confirmCancellation')} (Add to Savings)</span>
          </button>
          <p className="text-[11px] text-center text-[#A0A0A0]">
            {t('cancel.confirmSubtitle', {
              amount: monthlySavings.toFixed(2),
            })}
          </p>
        </div>
      </div>
    </div>
  );
};
