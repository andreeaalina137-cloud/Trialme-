import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  Calendar,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  BellRing,
  AlertTriangle,
} from 'lucide-react';
import type { Subscription, SubscriptionCategory, SubscriptionFrequency } from '../types/subscription';
import { BrandIcon } from './BrandIcon';
import { GoldBellIcon } from './GoldBellIcon';
import { formatPrice } from '../utils/subscriptionCalculations';
import { calculateSmartTrialTiming, formatArmedAlarmDateTime } from '../utils/calendarReminder';
import { isDuplicateSubscription } from '../utils/subscriptionIdentity';
import { playSubtlePop } from '../utils/soundEffects';

export interface PendingTrialActivation {
  name: string;
  price: number;
  currency?: string;
  frequency?: SubscriptionFrequency;
  category?: SubscriptionCategory;
  defaultTrialDays?: number;
  trialUrl?: string;
  cancelUrl?: string;
  cancelEmail?: string;
  cancelGuideSteps?: string[];
  color?: string;
  notes?: string;
  timestamp?: number;
}

export interface ConfirmedTrialPayload {
  name: string;
  price: number;
  currency: string;
  frequency: SubscriptionFrequency;
  category: SubscriptionCategory;
  activationDate: Date;
  trialDurationDays: number;
  expiryDate: Date;
  reminderDaysBefore: number;
  alarmArmedAt: string;
  cancelUrl?: string;
  cancelEmail?: string;
  cancelGuideSteps?: string[];
  color?: string;
  notes?: string;
}

interface ConfirmTrialActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingTrial: PendingTrialActivation | null;
  onConfirm: (payload: ConfirmedTrialPayload) => void;
  currencySymbol: string;
  existingSubscriptions: Subscription[];
}

export function toDateTimeLocalString(date: Date): string {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  const hours = String(safeDate.getHours()).padStart(2, '0');
  const minutes = String(safeDate.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDisplayDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const DURATION_PRESETS = [3, 7, 14, 30] as const;

export const ConfirmTrialActivationModal: React.FC<ConfirmTrialActivationModalProps> = ({
  isOpen,
  onClose,
  pendingTrial,
  onConfirm,
  currencySymbol,
  existingSubscriptions,
}) => {
  const [step, setStep] = useState<'question' | 'confirm'>('question');
  const [activationInput, setActivationInput] = useState<string>(() => toDateTimeLocalString(new Date()));
  const [durationMode, setDurationMode] = useState<'3' | '7' | '14' | '30' | 'custom'>('7');
  const [customDays, setCustomDays] = useState<number>(7);

  // Initialize form when pending trial changes or modal opens
  useEffect(() => {
    if (isOpen && pendingTrial) {
      setStep('question');
      setActivationInput(toDateTimeLocalString(new Date()));
      const initialDays = pendingTrial.defaultTrialDays || 7;
      if (DURATION_PRESETS.includes(initialDays as 3 | 7 | 14 | 30)) {
        setDurationMode(String(initialDays) as '3' | '7' | '14' | '30');
        setCustomDays(initialDays);
      } else {
        setDurationMode('custom');
        setCustomDays(initialDays);
      }
    }
  }, [isOpen, pendingTrial]);

  const activeDurationDays = useMemo(() => {
    if (durationMode === 'custom') {
      return Math.max(1, Math.min(365, customDays || 1));
    }
    return Number(durationMode);
  }, [durationMode, customDays]);

  const parsedActivation = useMemo(() => {
    const d = new Date(activationInput);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [activationInput]);

  const calculatedExpiryDate = useMemo(() => {
    return new Date(parsedActivation.getTime() + activeDurationDays * 24 * 60 * 60 * 1000);
  }, [parsedActivation, activeDurationDays]);

  const timing = useMemo(() => {
    return calculateSmartTrialTiming(activeDurationDays, parsedActivation);
  }, [activeDurationDays, parsedActivation]);

  const isDuplicate = useMemo(() => {
    if (!pendingTrial) return false;
    return existingSubscriptions.some((existing) =>
      isDuplicateSubscription({ name: pendingTrial.name }, existing)
    );
  }, [pendingTrial, existingSubscriptions]);

  if (!isOpen || !pendingTrial) return null;

  const currency = pendingTrial.currency || currencySymbol;
  const frequency = pendingTrial.frequency || 'monthly';
  const category = pendingTrial.category || 'Other';
  const color = pendingTrial.color || '#D4AF7C';

  const handleYesStarted = () => {
    playSubtlePop();
    setStep('confirm');
  };

  const handleConfirm = () => {
    playSubtlePop();
    onConfirm({
      name: pendingTrial.name,
      price: pendingTrial.price,
      currency,
      frequency,
      category,
      activationDate: parsedActivation,
      trialDurationDays: activeDurationDays,
      expiryDate: calculatedExpiryDate,
      reminderDaysBefore: timing.reminderDaysBefore,
      alarmArmedAt: timing.alarmArmedAt,
      cancelUrl: pendingTrial.cancelUrl,
      cancelEmail: pendingTrial.cancelEmail,
      cancelGuideSteps: pendingTrial.cancelGuideSteps,
      color,
      notes: pendingTrial.notes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md modal-backdrop-enter sm:items-center sm:p-4">
      <div
        className="fixed inset-x-0 bottom-0 max-w-md mx-auto w-full bg-[#161616] border-t border-white/15 rounded-t-[32px] sm:rounded-3xl sm:border sm:border-white/10 flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] overflow-hidden modal-sheet-enter max-h-[92dvh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-trial-title"
      >
        {/* Native iOS Bottom Sheet Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150 sm:hidden"
        />

        {step === 'question' ? (
          /* STEP 1: Elegant Question Dialog */
          <div className="p-6 pt-2 pb-6 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-95 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Glowing Brand Icon Badge */}
            <div className="relative">
              <div className="w-16 h-16 rounded-3xl bg-[#D4AF7C]/15 border border-[#D4AF7C]/35 flex items-center justify-center shadow-[0_0_24px_rgba(212,175,124,0.18)]">
                <BrandIcon name={pendingTrial.name} category={category} color={color} size="preset" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0A0A0A] border border-[#D4AF7C]/40 flex items-center justify-center text-[#D4AF7C]">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Free Trial Shield
              </span>
              <h2
                id="confirm-trial-title"
                className="text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight leading-snug px-2"
              >
                Did you successfully start the <span className="text-[#D4AF7C]">{pendingTrial.name}</span> free trial?
              </h2>
              <p className="text-xs text-[#A0A0A0] leading-relaxed max-w-xs mx-auto">
                Confirm your trial and Monetry will arm an automated smart reminder before the renewal date, so you never get caught by an unwanted charge.
              </p>
            </div>

            {/* Post-trial price info pill */}
            <div className="w-full rounded-2xl bg-[#0A0A0A]/80 border border-white/[0.08] p-3 flex items-center justify-between text-xs">
              <span className="text-[#A0A0A0]">Price after trial:</span>
              <span className="font-bold text-[#F5F5F5] font-mono">
                {formatPrice(pendingTrial.price, currency)}/{frequency === 'yearly' ? 'yr' : 'mo'}
              </span>
            </div>

            {pendingTrial.notes && (
              <div className="w-full rounded-2xl bg-[#0A0A0A] border border-[#D4AF37]/50 p-3 text-left space-y-1 shadow-sm">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Smart Trap Warning / Cancellation Tip</span>
                </div>
                <p className="text-xs text-[#F5F5F5]/90 leading-relaxed">{pendingTrial.notes}</p>
              </div>
            )}

            {isDuplicate && (
              <div className="w-full rounded-2xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-left text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>You already have {pendingTrial.name} tracked. Confirming will create another trial entry.</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleYesStarted}
                className="btn-champagne min-h-[48px] w-full py-4 px-6 rounded-full font-black text-sm text-[#0A0A0A] flex items-center justify-center gap-2 active:scale-[0.97] transition-all duration-150 cursor-pointer shadow-[0_4px_20px_rgba(212,175,124,0.28)] hover:brightness-110"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Yes, I started it</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] w-full py-2.5 px-6 rounded-full font-bold text-xs text-[#A0A0A0] hover:text-[#F5F5F5] bg-[#1F1F1F]/60 border border-white/10 hover:border-white/20 active:scale-[0.97] transition-all duration-150 cursor-pointer"
              >
                <span>Not yet</span>
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: Refined Confirmation Screen */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#161616]">
              <button
                type="button"
                onClick={() => setStep('question')}
                className="min-h-[36px] px-2.5 rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <h2 className="text-sm font-extrabold text-[#F5F5F5] tracking-tight">
                Confirm Free Trial
              </h2>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-95 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Service Preview Card */}
              <div className="rounded-2xl border border-white/10 bg-[#1F1F1F]/70 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <BrandIcon name={pendingTrial.name} category={category} color={color} size="preset" />
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs text-[#F5F5F5] truncate">{pendingTrial.name}</div>
                    <div className="text-[10px] text-[#A0A0A0] truncate">{category} · Free Trial</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-extrabold text-[#D4AF7C] font-mono">
                    {formatPrice(pendingTrial.price, currency)}
                  </div>
                  <div className="text-[9px] text-[#A0A0A0]">after trial</div>
                </div>
              </div>

              {/* 1. Activation Date & Time */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#A0A0A0] uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#D4AF7C]" />
                    Activation Date & Time
                  </span>
                  <span className="text-[10px] text-[#D4AF7C] font-semibold lowercase">editable</span>
                </label>
                <input
                  type="datetime-local"
                  value={activationInput}
                  onChange={(e) => setActivationInput(e.target.value)}
                  className="input-luxury w-full rounded-2xl px-3.5 py-2.5 text-xs text-[#F5F5F5] font-mono focus:border-[#D4AF7C] focus:ring-1 focus:ring-[#D4AF7C] outline-none"
                />
                <p className="text-[10px] text-[#A0A0A0] pl-1">
                  Started: {formatDisplayDateTime(parsedActivation)}
                </p>
              </div>

              {/* 2. Trial Duration Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#A0A0A0] uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#D4AF7C]" />
                    Trial Duration
                  </span>
                  <span className="text-[#D4AF7C] font-mono font-bold lowercase">
                    {activeDurationDays} {activeDurationDays === 1 ? 'day' : 'days'}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {DURATION_PRESETS.map((days) => {
                    const isSelected = durationMode === String(days);
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          playSubtlePop();
                          setDurationMode(String(days) as '3' | '7' | '14' | '30');
                        }}
                        className={`py-2 px-1.5 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer border text-center ${
                          isSelected
                            ? 'bg-[#D4AF7C]/20 border-[#D4AF7C] text-[#D4AF7C] shadow-[0_0_12px_rgba(212,175,124,0.25)]'
                            : 'bg-[#1F1F1F] border-white/10 text-[#A0A0A0] hover:text-[#F5F5F5] hover:border-white/20'
                        }`}
                      >
                        {days}d
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      playSubtlePop();
                      setDurationMode('custom');
                    }}
                    className={`py-2 px-1.5 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer border text-center ${
                      durationMode === 'custom'
                        ? 'bg-[#D4AF7C]/20 border-[#D4AF7C] text-[#D4AF7C] shadow-[0_0_12px_rgba(212,175,124,0.25)]'
                        : 'bg-[#1F1F1F] border-white/10 text-[#A0A0A0] hover:text-[#F5F5F5] hover:border-white/20'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {durationMode === 'custom' && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={customDays}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1));
                        setCustomDays(val);
                      }}
                      className="input-luxury w-24 rounded-xl px-3 py-1.5 text-xs font-mono text-[#F5F5F5] text-center"
                    />
                    <span className="text-xs text-[#A0A0A0] font-medium">days free trial</span>
                  </div>
                )}
              </div>

              {/* 3. Calculated Expiry Date (Updated Live!) */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#1F1F1F] to-[#161616] border border-[#D4AF7C]/35 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
                    <Clock className="w-3.5 h-3.5" />
                    Calculated Expiry Date
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#D4AF7C]/15 border border-[#D4AF7C]/30 text-[10px] font-extrabold text-[#D4AF7C]">
                    {activeDurationDays}d trial period
                  </span>
                </div>

                <div className="text-sm font-black text-[#F5F5F5] tracking-tight">
                  {formatDisplayDateTime(calculatedExpiryDate)}
                </div>

                <div className="text-[11px] text-[#A0A0A0] pt-1.5 border-t border-white/[0.06] flex items-start gap-2">
                  <GoldBellIcon size="xs" />
                  <div className="leading-snug">
                    Smart Shield will sound daytime alarm on{' '}
                    <strong className="text-[#F5F5F5]">{formatArmedAlarmDateTime(timing.alarmArmedAt)}</strong>{' '}
                    ({timing.reminderDaysBefore}d before expiry at 10:00 AM).
                  </div>
                </div>
              </div>
            </div>

            {/* Primary CTA Footer */}
            <div className="p-4 border-t border-white/[0.08] shrink-0 bg-[#161616]/95">
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-champagne min-h-[48px] w-full py-3.5 px-6 rounded-full font-black text-sm text-[#0A0A0A] flex items-center justify-center gap-2 active:scale-[0.97] transition-all duration-150 cursor-pointer shadow-[0_4px_20px_rgba(212,175,124,0.28)] hover:brightness-110"
              >
                <BellRing className="w-4 h-4 stroke-[2.5]" />
                <span>Confirm & Set Reminder</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
