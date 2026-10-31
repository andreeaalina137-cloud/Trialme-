import React, { useState } from 'react';
import { X, Edit3, Trash2, ShieldAlert, RotateCcw, CalendarDays, Download, Lightbulb, ExternalLink, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { Subscription, UserPlan } from '../types/subscription';
import { BrandIcon } from './BrandIcon';
import {
  addYearsClamped,
  convertFrequencyToAnnual,
  formatLocalDateKey,
  formatPrice,
  getDaysUntilNextPayment,
  rollForwardPaymentDate,
  roundCurrency,
} from '../utils/subscriptionCalculations';
import {
  createGoogleCalendarReminderUrl,
  downloadSubscriptionReminderIcs,
  getSubscriptionReminderDate,
} from '../utils/calendarReminder';
import { getUkPriceHikeAlert } from '../utils/retentionAndTrust';
import { useTranslation } from '../i18n/LanguageContext';
import { getAffiliateOffer } from '../data/cheaperAlternatives';
import { useMonetryData } from '../context/DatabaseContext';

interface SubscriptionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  onUpdateSubscription: (updated: Subscription) => void;
  onDeleteSubscription: (id: string) => void;
  onOpenCancelAssistant: (sub: Subscription) => void;
  currencySymbol: string;
  userPlan?: UserPlan;
  activeSubscriptionsCount?: number;
  bonusSlots?: number;
  onOpenPaywall?: () => void;
}

export const SubscriptionDetailModal: React.FC<SubscriptionDetailModalProps> = ({
  isOpen,
  onClose,
  subscription,
  onUpdateSubscription,
  onDeleteSubscription,
  onOpenCancelAssistant,
  currencySymbol,
  userPlan,
  activeSubscriptionsCount,
  bonusSlots = 0,
  onOpenPaywall,
}) => {
  const { t } = useTranslation();
  const { findPresetByNameOrAlias } = useMonetryData();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [calendarSyncedNotice, setCalendarSyncedNotice] = useState<'ics' | 'gcal' | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [nextPaymentDate, setNextPaymentDate] = useState('');
  const [reminderDays, setReminderDays] = useState(3);
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (subscription) {
      setName(subscription.name);
      setPrice(subscription.price.toString());
      setNextPaymentDate(subscription.nextPaymentDate);
      setReminderDays(subscription.reminderDaysBefore || 3);
      setNotes(subscription.notes || '');
      setIsEditing(false);
      setIsConfirmingDelete(false);
      setCalendarSyncedNotice(null);
    }
  }, [subscription]);

  if (!isOpen || !subscription) return null;

  const daysRemaining = getDaysUntilNextPayment(subscription.nextPaymentDate);
  const annualCost = convertFrequencyToAnnual(subscription.price, subscription.frequency);
  const isCancelled = subscription.status === 'cancelled';
  const isTrial = subscription.status === 'trial';
  const matchedPreset = findPresetByNameOrAlias(subscription.name);
  const affiliateOffer = getAffiliateOffer(subscription.name);
  const priceHikeAlert = !isCancelled ? getUkPriceHikeAlert(subscription.name) : null;
  const annualDiscountRate = affiliateOffer?.annualDiscountRate ?? 0;
  const annualPlanPrice = subscription.price * 12 * (1 - annualDiscountRate);
  const annualSaving = subscription.price * 12 * annualDiscountRate;
  const canSwitchAnnual = subscription.status === 'active' && subscription.frequency === 'monthly'
    && !!affiliateOffer?.annualUrl && annualDiscountRate > 0;
  const calendarReminderDate = getSubscriptionReminderDate(subscription);
  const reminderDaysBefore = subscription.reminderDaysBefore || 3;

  const handleCalendarSync = () => {
    if (!calendarReminderDate || isCancelled) return;
    const subName = subscription.name;
    downloadSubscriptionReminderIcs(
      subscription,
      calendarReminderDate,
      reminderDaysBefore,
      t('calendar.summary', { name: subName }),
      t('calendar.description', { name: subName }),
      t('calendar.alarm', { name: subName, days: reminderDaysBefore }),
      t('calendar.fileName', { name: subName })
    );
    setCalendarSyncedNotice('ics');
  };

  const handleGoogleCalendarSync = () => {
    if (!calendarReminderDate || isCancelled) return;
    const subName = subscription.name;
    const gcalUrl = createGoogleCalendarReminderUrl(
      subscription,
      calendarReminderDate,
      reminderDaysBefore,
      t('calendar.summary', { name: subName }),
      t('calendar.alarm', { name: subName, days: reminderDaysBefore })
    );
    window.open(gcalUrl, '_blank', 'noopener,noreferrer');
    setCalendarSyncedNotice('gcal');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(price);
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 99999.99) return;
    const finalDate = subscription.status === 'active'
      ? rollForwardPaymentDate(nextPaymentDate, subscription.frequency)
      : nextPaymentDate;
    onUpdateSubscription({
      ...subscription,
      name: name.trim(),
      price: roundCurrency(parsedPrice),
      nextPaymentDate: finalDate,
      reminderDaysBefore: reminderDays,
      notes: notes.trim(),
    });
    setIsEditing(false);
  };

  const handleReactivate = () => {
    if (userPlan === 'free' && typeof activeSubscriptionsCount === 'number' && activeSubscriptionsCount >= 2 + bonusSlots) {
      if (onOpenPaywall) {
        onOpenPaywall();
      }
      return;
    }
    const rolledDate = rollForwardPaymentDate(subscription.nextPaymentDate, subscription.frequency);
    onUpdateSubscription({
      ...subscription,
      status: 'active',
      nextPaymentDate: rolledDate,
      cancelledAt: undefined,
      monthlySavingsAmount: undefined,
    });
  };

  const handleAnnualSwitch = () => {
    if (!affiliateOffer?.annualUrl || !canSwitchAnnual) return;
    window.open(affiliateOffer.annualUrl, '_blank', 'noopener,noreferrer');
    const nextPayment = addYearsClamped(new Date(), 1);
    const nextPaymentDate = formatLocalDateKey(nextPayment);
    onUpdateSubscription({
      ...subscription,
      frequency: 'yearly',
      price: roundCurrency(annualPlanPrice),
      nextPaymentDate,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <div
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto h-[88dvh] w-full bg-[#161616] border-t border-white/15 rounded-t-[32px] flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] overflow-hidden modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
      >
        {/* Native iOS Bottom Sheet Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150"
        />

        {/* Header with real brand icon */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#161616]">
          <div className="flex items-center gap-3">
            <BrandIcon
              name={subscription.name}
              category={subscription.category}
              color={subscription.color}
            />
            <div>
              <h2 id="detail-modal-title" className="text-base font-bold text-[#F5F5F5]">
                {subscription.name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#A0A0A0]">
                <span>{subscription.category}</span>
                <span aria-hidden="true" className="text-[#A0A0A0]/40">·</span>
                <span className="capitalize">{subscription.frequency}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 rounded-full hover:bg-[#1F1F1F] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.95] transition-all duration-150 cursor-pointer"
              aria-label={isEditing ? 'Cancel Edit' : 'Edit Subscription'}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#1F1F1F] text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.95] transition-all duration-150 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1">
                  {t('add.nameLabel')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-luxury w-full rounded-full px-4 py-2.5 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1">
                    {t('add.priceLabel', { symbol: subscription.currency || currencySymbol })}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-sm font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1">
                    {t('detail.nextBilling')}
                  </label>
                  <input
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1">
                  {t('add.reminderLabel')}
                </label>
                <select
                  value={reminderDays}
                  onChange={(e) => setReminderDays(Number(e.target.value))}
                  className="input-luxury w-full rounded-full px-4 py-2.5 text-xs"
                >
                  <option value={1}>24h before</option>
                  <option value={2}>48h before</option>
                  <option value={3}>3 days before</option>
                  <option value={7}>7 days before</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1">
                  {t('detail.notesLabel')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="input-luxury w-full rounded-2xl px-3.5 py-2.5 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="btn-champagne flex-1 py-3 px-4 rounded-full font-extrabold text-[#0A0A0A] cursor-pointer"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary-luxury py-3 px-4 rounded-full font-medium cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Cost card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-3xl bg-[#1F1F1F] border border-white/[0.08]">
                  <div className="text-[11px] uppercase tracking-wider text-[#A0A0A0] font-semibold">
                    {t('detail.currentCost')}
                  </div>
                  <div className="text-xl font-black text-[#F5F5F5] mt-0.5 font-mono">
                    {formatPrice(subscription.price, subscription.currency || currencySymbol)}
                    <span className="text-xs font-normal text-[#A0A0A0]">
                      /{subscription.frequency === 'yearly' ? 'yr' : subscription.frequency === 'weekly' ? 'wk' : 'mo'}
                    </span>
                  </div>
                </div>
                <div className="p-3.5 rounded-3xl bg-[#1F1F1F] border border-white/[0.08]">
                  <div className="text-[11px] uppercase tracking-wider text-[#A0A0A0] font-semibold">
                    {t('detail.annualForecast')}
                  </div>
                  <div className="text-xl font-black text-[#D4AF7C] mt-0.5 font-mono">
                    {formatPrice(annualCost, subscription.currency || currencySymbol)}
                    <span className="text-xs font-normal text-[#A0A0A0]">/yr</span>
                  </div>
                </div>
              </div>

              {/* UK Price Hike Alert Banner */}
              {priceHikeAlert && (
                <div className="rounded-3xl border border-[#D4AF7C]/40 bg-[#1F1F1F] p-3 flex items-start gap-2.5">
                  <TrendingUp className="w-4 h-4 text-[#D4AF7C] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-[#D4AF7C]">
                        {priceHikeAlert.headline}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-rose-300">
                        +£{priceHikeAlert.annualExtra.toFixed(0)}/yr
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A0A0A0] mt-0.5 leading-relaxed">
                      {priceHikeAlert.effectiveNote}
                    </p>
                  </div>
                </div>
              )}

              {canSwitchAnnual && affiliateOffer?.annualUrl && (
                <aside className="rounded-3xl border border-[#D4AF7C]/35 bg-[#1F1F1F] p-3">
                  <button
                    type="button"
                    onClick={() => window.open(affiliateOffer.annualUrl, '_blank', 'noopener,noreferrer')}
                    className="flex w-full items-start gap-2 text-left text-[11px] font-semibold leading-relaxed text-[#F5F5F5] hover:text-[#D4AF7C]"
                  >
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF7C]" />
                    <span>{t('affiliate.annualTip', {
                      saving: formatPrice(annualSaving, subscription.currency || currencySymbol),
                    })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAnnualSwitch}
                    className="btn-champagne mt-2 flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-[10px] font-extrabold text-[#0A0A0A] cursor-pointer"
                  >
                    {t('affiliate.annualSwitch', {
                      price: formatPrice(annualPlanPrice, subscription.currency || currencySymbol),
                    })}
                  </button>
                </aside>
              )}

              {/* Status and Next Payment */}
              <div className="p-4 rounded-3xl bg-[#1F1F1F] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <span className="text-[#A0A0A0]">{t('detail.statusLabel')}</span>
                  {isCancelled ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {t('home.cancelledBadge')} ({t('home.savedBadge')})
                    </span>
                  ) : isTrial ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/35">
                      {t('home.trialBadge')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/35">
                      {t('home.filterActive')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <span className="text-[#A0A0A0]">{t('detail.nextBilling')}</span>
                  <span className="font-semibold text-[#F5F5F5] font-mono">{subscription.nextPaymentDate}</span>
                </div>

                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <span className="text-[#A0A0A0]">{t('detail.timeRemaining')}</span>
                  <span className={`font-semibold ${daysRemaining <= 3 ? 'text-[#D4AF7C]' : 'text-[#F5F5F5]'}`}>
                    {daysRemaining < 0
                      ? `Billed ${Math.abs(daysRemaining)} days ago`
                      : daysRemaining === 0
                      ? t('home.dueToday')
                      : daysRemaining === 1
                      ? t('home.dueTomorrow')
                      : t('home.dueInDays', { days: daysRemaining })}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#A0A0A0]">{t('detail.remindersLabel')}</span>
                  <span className="font-semibold text-[#F5F5F5]">
                    {t('detail.remindDays', { days: subscription.reminderDaysBefore || 3 })}
                  </span>
                </div>

                {!isCancelled && (
                  <div className="border-t border-white/[0.08] pt-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#A0A0A0] flex items-center justify-between">
                      <span>Phone Calendar Auto-Alarm ({reminderDaysBefore}d before)</span>
                      <span className="text-[#D4AF7C] font-semibold">Works offline</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleGoogleCalendarSync}
                        disabled={!calendarReminderDate}
                        className="btn-champagne flex items-center justify-between gap-2 rounded-full px-3.5 py-2.5 text-left font-extrabold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0" />
                          <span className="text-[11px] truncate">1-Tap Google Calendar</span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={handleCalendarSync}
                        disabled={!calendarReminderDate}
                        className="btn-secondary-luxury flex items-center justify-between gap-2 rounded-full px-3.5 py-2.5 text-left font-semibold text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0 text-[#D4AF7C]" />
                          <span className="text-[11px] truncate">{t('detail.syncCalendar')} (.ics)</span>
                        </span>
                        <Download className="h-3.5 w-3.5 shrink-0 text-[#D4AF7C]" />
                      </button>
                    </div>

                    {calendarSyncedNotice && (
                      <div className="flex items-center gap-1.5 rounded-full bg-[#0A0A0A] border border-[#D4AF7C]/35 px-3 py-1.5 text-[10px] text-[#D4AF7C]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D4AF7C]" />
                        <span>
                          {calendarSyncedNotice === 'gcal'
                            ? 'Opened Google Calendar! Tap Save in the tab to lock in your 3-day alarm.'
                            : 'Downloaded .ics alarm! Tap the downloaded file on iPhone/Outlook to import.'}
                        </span>
                      </div>
                    )}

                    {!calendarReminderDate && (
                      <p className="mt-1.5 text-[10px] text-[#A0A0A0]">{t('detail.calendarUnavailable')}</p>
                    )}
                  </div>
                )}
              </div>

              {(subscription.notes || matchedPreset?.notes) && (
                <div className="p-4 rounded-3xl bg-[#0A0A0A] border border-[#D4AF37]/50 shadow-md shadow-[#D4AF37]/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span>Smart Trap Warning / Cancellation Tip</span>
                    </div>
                    {matchedPreset && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          matchedPreset.trial_type === 'none'
                            ? 'bg-zinc-800 text-[#A0A0A0] border border-zinc-700'
                            : matchedPreset.trial_type === 'cooling_off'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : matchedPreset.trial_type === 'money_back'
                            ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                            : matchedPreset.trial_type === 'promo_discount'
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                            : 'bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/30'
                        }`}
                      >
                        {matchedPreset.trial_type === 'none'
                          ? 'No UK Free Trial'
                          : matchedPreset.trial_type === 'cooling_off'
                          ? '14-Day Cooling-Off'
                          : matchedPreset.trial_type === 'money_back'
                          ? '30-Day Refund Shield'
                          : matchedPreset.trial_type === 'promo_discount'
                          ? 'Promo Intro Offer'
                          : `${matchedPreset.trial_duration_days}d Free Trial`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#F5F5F5]/90 leading-relaxed">
                    {subscription.notes || matchedPreset?.notes}
                  </p>
                  {(subscription.cancelUrl || matchedPreset?.cancel_url) && (
                    <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
                      <span className="text-[#A0A0A0]">Cancellation Portal:</span>
                      <a
                        href={subscription.cancelUrl || matchedPreset?.cancel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#D4AF37] hover:underline flex items-center gap-1 font-mono font-bold"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 rounded-3xl bg-[#1F1F1F] border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#F5F5F5]">{t('detail.historyLabel')}</span>
                  <span className="text-[10px] text-[#D4AF7C]">Direct Debit verified</span>
                </div>
                {subscription.paymentHistory && subscription.paymentHistory.length > 0 ? (
                  <div className="space-y-1.5">
                    {subscription.paymentHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1.5 px-3 rounded-full bg-[#0A0A0A]/80 border border-white/[0.08]"
                      >
                        <span className="text-[#A0A0A0] font-mono text-[11px]">{item.date}</span>
                        <span className="font-mono font-bold text-[#F5F5F5]">
                          {formatPrice(item.amount, item.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-2 text-center text-[#A0A0A0] text-[11px]">
                    Billing scheduled starting {subscription.createdAt || 'this month'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/[0.08] shrink-0 bg-[#161616]/95 space-y-2">
          {!isCancelled ? (
            <button
              onClick={() => {
                onClose();
                onOpenCancelAssistant(subscription);
              }}
              className="btn-cancel-soft w-full py-4 px-6 rounded-full font-bold text-sm active:scale-[0.97] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <span>{t('detail.cancelThis')}</span>
            </button>
          ) : (
            <button
              onClick={handleReactivate}
              className="btn-secondary-luxury w-full py-4 px-4 rounded-full font-bold text-sm active:scale-[0.97] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#D4AF7C]" />
              <span>{t('detail.reactivate')}</span>
            </button>
          )}

          <div className="flex justify-between items-center px-1 pt-1">
            {!isConfirmingDelete ? (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('detail.delete')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-rose-300 font-medium">{t('detail.confirmDelete')}</span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSubscription(subscription.id);
                    onClose();
                  }}
                  className="px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                >
                  {t('detail.yesDelete')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-2.5 py-1 rounded-full bg-[#1F1F1F] text-[#A0A0A0] text-[11px] cursor-pointer"
                >
                  {t('detail.cancelDelete')}
                </button>
              </div>
            )}
            <span className="text-[10px] text-[#A0A0A0] font-mono">Ref: {subscription.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
