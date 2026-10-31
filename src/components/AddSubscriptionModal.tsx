import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Check,
  Camera,
  Crown,
  Gift,
  BellRing,
  ShieldCheck,
  CalendarDays,
  ExternalLink,
  Download,
  Search,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { Subscription, SubscriptionCategory, SubscriptionFrequency, UserPlan } from '../types/subscription';
import { POPULAR_PRESETS, type PopularPreset, type PresetFilterGroup } from '../data/popularPresets';
import { BrandIcon } from './BrandIcon';
import { canAddSubscription, formatPrice } from '../utils/subscriptionCalculations';
import { isDuplicateSubscription } from '../utils/subscriptionIdentity';
import {
  calculateSmartTrialTiming,
  createGoogleCalendarReminderUrl,
  downloadSubscriptionReminderIcs,
  formatArmedAlarmDateTime,
} from '../utils/calendarReminder';
import { useTranslation } from '../i18n/LanguageContext';
import { getAffiliateOffer, type AffiliateOffer } from '../data/cheaperAlternatives';
import type { PendingTrialActivation } from './ConfirmTrialActivationModal';

interface PendingAffiliateTrial {
  offer: AffiliateOffer;
  subscription: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>;
}

interface AddSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSubscription: (subData: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>) => string | false;
  currentSubscriptionCount: number;
  userPlan: UserPlan;
  currencySymbol: string;
  onOpenPaywall: () => void;
  onOpenAiScanner: () => void;
  onTrialTracked: (name: string, days: number, subscriptionId: string) => void;
  onStartTrialFlow?: (trialData: PendingTrialActivation) => void;
  subscriptions?: Subscription[];
  bonusSlots?: number;
  onOpenGiftSlot?: () => void;
}

const CATEGORIES: SubscriptionCategory[] = [
  'Streaming',
  'AI & Tech',
  'Music & Audio',
  'Fitness & Gym',
  'Productivity',
  'Gaming',
  'News & Magazines',
  'Food & Delivery',
  'Utilities',
  'Other',
];

const FILTER_GROUPS: PresetFilterGroup[] = [
  'All',
  'Streaming',
  'Gyms',
  'Tech & AI',
  'Food & Delivery',
  'Finance',
];

const PRESET_COLORS = [
  '#D4AF7C',
  '#B79B6B',
  '#E50914',
  '#1DB954',
  '#10A37F',
  '#0072C9',
  '#FF9900',
  '#00CDBC',
  '#8B5CF6',
  '#F59E0B',
];

const TRIAL_DURATION_PRESETS = [7, 14, 30] as const;

export const AddSubscriptionModal: React.FC<AddSubscriptionModalProps> = ({
  isOpen,
  onClose,
  onAddSubscription,
  currentSubscriptionCount,
  userPlan,
  currencySymbol,
  onOpenPaywall,
  onOpenAiScanner,
  onTrialTracked,
  onStartTrialFlow,
  subscriptions = [],
  bonusSlots = 0,
  onOpenGiftSlot,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'quick' | 'manual'>('quick');

  const [presetSearch, setPresetSearch] = useState('');
  const [selectedFilterGroup, setSelectedFilterGroup] = useState<PresetFilterGroup>('All');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('monthly');
  const [category, setCategory] = useState<SubscriptionCategory>('Streaming');
  const [nextPaymentDate, setNextPaymentDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [isTrial, setIsTrial] = useState(false);
  const [manualTrialDays, setManualTrialDays] = useState<number>(7);
  const [isManualCustomTrial, setIsManualCustomTrial] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [color, setColor] = useState('#D4AF7C');
  const [notes, setNotes] = useState('');
  const [cancelUrl, setCancelUrl] = useState('');
  const [reminderDaysBefore, setReminderDaysBefore] = useState(3);
  const [validationError, setValidationError] = useState('');
  const [duplicateNotice, setDuplicateNotice] = useState(false);
  const [pendingAffiliateTrial, setPendingAffiliateTrial] = useState<PendingAffiliateTrial | null>(null);
  const [pendingTrialDays, setPendingTrialDays] = useState<number>(30);
  const [isPendingCustomDays, setIsPendingCustomDays] = useState(false);
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'quick') {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, activeTab]);

  const filteredPresets = useMemo(() => {
    const query = presetSearch.toLowerCase().trim();
    const tokens = query ? query.split(/\s+/) : [];

    return POPULAR_PRESETS.filter((preset) => {
      if (selectedFilterGroup !== 'All' && preset.filterGroup !== selectedFilterGroup) {
        return false;
      }
      if (tokens.length === 0) return true;

      const haystack = [
        preset.name,
        preset.category,
        preset.filterGroup,
        preset.description,
        ...(preset.keywords || []),
      ]
        .join(' ')
        .toLowerCase();

      return tokens.every((token) => haystack.includes(token));
    });
  }, [presetSearch, selectedFilterGroup]);

  if (!isOpen) return null;

  const checkPlanAndProceed = (callback: () => void) => {
    const { allowed } = canAddSubscription(currentSubscriptionCount, userPlan, bonusSlots);
    if (!allowed) {
      onOpenPaywall();
      return;
    }
    callback();
  };

  const applyManualTrialDuration = (days: number) => {
    const safeDays = Math.max(1, Math.round(days));
    setManualTrialDays(safeDays);
    const timing = calculateSmartTrialTiming(safeDays);
    setTrialEndDate(timing.trialEndDate);
    setNextPaymentDate(timing.trialEndDate);
    setReminderDaysBefore(timing.reminderDaysBefore);
  };

  const handleQuickAdd = (preset: PopularPreset) => {
    checkPlanAndProceed(() => {
      const added = onAddSubscription({
        name: preset.name,
        price: preset.price,
        currency: preset.currency || currencySymbol,
        frequency: preset.frequency,
        category: preset.category,
        nextPaymentDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'active',
        color: preset.color,
        cancelUrl: preset.cancelUrl,
        cancelEmail: preset.cancelEmail,
        cancelGuideSteps: preset.cancelSteps,
        notes: preset.description,
        reminderDaysBefore: 3,
      });
      setDuplicateNotice(!added);
      if (added) onClose();
    });
  };

  const handleAffiliateTrial = (
    offer: AffiliateOffer | undefined,
    trial: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>,
    defaultDays: number
  ) => {
    if (!offer) return;
    checkPlanAndProceed(() => {
      if (onStartTrialFlow) {
        onStartTrialFlow({
          name: trial.name,
          price: trial.price,
          currency: trial.currency || currencySymbol,
          frequency: trial.frequency,
          category: trial.category,
          defaultTrialDays: defaultDays,
          trialUrl: offer.trialUrl,
          cancelUrl: trial.cancelUrl,
          cancelEmail: trial.cancelEmail,
          cancelGuideSteps: trial.cancelGuideSteps,
          color: trial.color,
          notes: trial.notes,
        });
        onClose();
        return;
      }
      window.open(offer.trialUrl, '_blank', 'noopener,noreferrer');
      setDuplicateNotice(false);
      setPendingTrialDays(defaultDays);
      setIsPendingCustomDays(!TRIAL_DURATION_PRESETS.includes(defaultDays as 7 | 14 | 30));
      setPendingAffiliateTrial({ offer: { ...offer, trialDays: defaultDays }, subscription: trial });
    });
  };

  const triggerCalendarAutoSync = (subWithId: Subscription, syncMode: 'ics' | 'gcal' | 'both') => {
    const reminderDate = subWithId.trialEndDate || subWithId.nextPaymentDate;
    const reminderDays = subWithId.reminderDaysBefore || 3;
    if (!reminderDate) return;

    if (syncMode === 'ics' || syncMode === 'both') {
      downloadSubscriptionReminderIcs(
        subWithId,
        reminderDate,
        reminderDays,
        t('calendar.summary', { name: subWithId.name }),
        t('calendar.description', { name: subWithId.name }),
        t('calendar.alarm', { name: subWithId.name, days: reminderDays }),
        t('calendar.fileName', { name: subWithId.name })
      );
    }
    if (syncMode === 'gcal' || syncMode === 'both') {
      const url = createGoogleCalendarReminderUrl(
        subWithId,
        reminderDate,
        reminderDays,
        t('calendar.summary', { name: subWithId.name }),
        t('calendar.alarm', { name: subWithId.name, days: reminderDays })
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleConfirmAffiliateTrial = (syncMode: 'ics' | 'gcal' = 'ics') => {
    if (!pendingAffiliateTrial) return;
    checkPlanAndProceed(() => {
      const timing = calculateSmartTrialTiming(pendingTrialDays);
      const enrichedSub: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'> = {
        ...pendingAffiliateTrial.subscription,
        nextPaymentDate: timing.trialEndDate,
        trialEndDate: timing.trialEndDate,
        trialStartAt: timing.trialStartAt,
        trialExpiresAt: timing.trialExpiresAt,
        trialDurationDays: pendingTrialDays,
        alarmArmedAt: timing.alarmArmedAt,
        reminderDaysBefore: timing.reminderDaysBefore,
      };

      const subscriptionId = onAddSubscription(enrichedSub);
      setDuplicateNotice(!subscriptionId);
      if (subscriptionId) {
        const subWithId: Subscription = {
          ...enrichedSub,
          id: subscriptionId,
          createdAt: new Date().toISOString().split('T')[0],
          paymentHistory: [],
        };

        triggerCalendarAutoSync(subWithId, syncMode);

        onTrialTracked(
          enrichedSub.name,
          pendingTrialDays,
          subscriptionId
        );
        setPendingAffiliateTrial(null);
        onClose();
      }
    });
  };

  const handlePresetAffiliateTrial = (preset: PopularPreset) => {
    const offer = getAffiliateOffer(preset.name);
    const trialDays = preset.defaultTrialDays ?? offer?.trialDays ?? 30;
    if (expandedPresetId === preset.id) {
      setExpandedPresetId(null);
      return;
    }
    setDuplicateNotice(false);
    setPendingTrialDays(trialDays);
    setIsPendingCustomDays(!TRIAL_DURATION_PRESETS.includes(trialDays as 7 | 14 | 30));
    setExpandedPresetId(preset.id);
  };

  const handleConfirmInlinePresetTrial = (preset: PopularPreset, syncMode: 'ics' | 'gcal' = 'ics') => {
    checkPlanAndProceed(() => {
      const offer = getAffiliateOffer(preset.name);
      const trialUrl = preset.trialUrl || offer?.trialUrl;
      if (onStartTrialFlow) {
        onStartTrialFlow({
          name: preset.name,
          price: preset.price,
          currency: preset.currency || currencySymbol,
          frequency: preset.frequency,
          category: preset.category,
          defaultTrialDays: pendingTrialDays,
          trialUrl,
          cancelUrl: preset.cancelUrl,
          cancelEmail: preset.cancelEmail,
          cancelGuideSteps: preset.cancelSteps,
          color: preset.color,
          notes: preset.description,
        });
        setExpandedPresetId(null);
        onClose();
        return;
      }
      if (trialUrl) {
        window.open(trialUrl, '_blank', 'noopener,noreferrer');
      }
      const timing = calculateSmartTrialTiming(pendingTrialDays);
      const enrichedSub: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'> = {
        name: preset.name,
        price: preset.price,
        currency: preset.currency || currencySymbol,
        frequency: preset.frequency,
        category: preset.category,
        nextPaymentDate: timing.trialEndDate,
        status: 'trial',
        trialEndDate: timing.trialEndDate,
        trialStartAt: timing.trialStartAt,
        trialExpiresAt: timing.trialExpiresAt,
        trialDurationDays: pendingTrialDays,
        alarmArmedAt: timing.alarmArmedAt,
        color: preset.color,
        cancelUrl: preset.cancelUrl,
        cancelEmail: preset.cancelEmail,
        cancelGuideSteps: preset.cancelSteps,
        notes: preset.description,
        reminderDaysBefore: timing.reminderDaysBefore,
      };

      const subscriptionId = onAddSubscription(enrichedSub);
      setDuplicateNotice(!subscriptionId);
      if (subscriptionId) {
        const subWithId: Subscription = {
          ...enrichedSub,
          id: subscriptionId,
          createdAt: new Date().toISOString().split('T')[0],
          paymentHistory: [],
        };
        triggerCalendarAutoSync(subWithId, syncMode);
        onTrialTracked(enrichedSub.name, pendingTrialDays, subscriptionId);
        setExpandedPresetId(null);
        onClose();
      }
    });
  };

  const handleManualAffiliateTrial = () => {
    const offer = getAffiliateOffer(name);
    const parsedPrice = parseFloat(price);
    if (!offer || !name.trim() || isNaN(parsedPrice) || parsedPrice <= 0) return;
    const trialDays = isTrial ? manualTrialDays : offer.trialDays;
    const timing = calculateSmartTrialTiming(trialDays);
    handleAffiliateTrial(
      offer,
      {
        name: name.trim(),
        price: parsedPrice,
        currency: currencySymbol,
        frequency,
        category,
        nextPaymentDate: timing.trialEndDate,
        status: 'trial',
        trialEndDate: timing.trialEndDate,
        trialStartAt: timing.trialStartAt,
        trialExpiresAt: timing.trialExpiresAt,
        trialDurationDays: trialDays,
        alarmArmedAt: timing.alarmArmedAt,
        color,
        notes: notes.trim(),
        cancelUrl: cancelUrl.trim() || undefined,
        reminderDaysBefore: timing.reminderDaysBefore,
      },
      trialDays
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError('Please enter a name for the subscription.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 99999.99) {
      setValidationError('Please enter a valid price amount between £0.01 and £99,999.99.');
      return;
    }
    setValidationError('');

    if (subscriptions.some((existing) => isDuplicateSubscription({ name: name.trim() }, existing))) {
      setDuplicateNotice(true);
      return;
    }
    checkPlanAndProceed(() => {
      const timing = isTrial ? calculateSmartTrialTiming(manualTrialDays) : null;
      const finalTrialEnd = isTrial ? trialEndDate || timing?.trialEndDate : undefined;
      const finalNextPayment = isTrial && finalTrialEnd ? finalTrialEnd : nextPaymentDate;

      const subPayload: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'> = {
        name: name.trim(),
        price: parsedPrice,
        currency: currencySymbol,
        frequency,
        category,
        nextPaymentDate: finalNextPayment,
        status: isTrial ? 'trial' : 'active',
        trialEndDate: finalTrialEnd,
        trialStartAt: timing?.trialStartAt,
        trialExpiresAt: timing?.trialExpiresAt,
        trialDurationDays: isTrial ? manualTrialDays : undefined,
        alarmArmedAt: timing?.alarmArmedAt,
        color,
        notes: notes.trim(),
        cancelUrl: cancelUrl.trim() || undefined,
        reminderDaysBefore: timing ? timing.reminderDaysBefore : reminderDaysBefore,
      };

      const added = onAddSubscription(subPayload);
      if (added) {
        if (isTrial) {
          const subWithId: Subscription = {
            ...subPayload,
            id: added,
            createdAt: new Date().toISOString().split('T')[0],
            paymentHistory: [],
          };
          triggerCalendarAutoSync(subWithId, 'ics');
          onTrialTracked(subPayload.name, manualTrialDays, added);
        }
        setDuplicateNotice(false);
        onClose();
      } else {
        setDuplicateNotice(true);
      }
    });
  };

  const pendingTimingPreview = pendingAffiliateTrial
    ? calculateSmartTrialTiming(pendingTrialDays)
    : null;

  const manualTimingPreview = isTrial
    ? calculateSmartTrialTiming(manualTrialDays)
    : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter"
    >
      {/* Native Mobile Slide-Up Bottom Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto h-[88dvh] rounded-t-[32px] bg-[#161616] border-t border-white/15 shadow-[0_-12px_40px_rgba(0,0,0,0.8)] z-50 flex flex-col overflow-hidden modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-sub-title"
      >
        {/* Native iOS Top Drag-Handle Pill */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150"
        />

        {/* Header */}
        <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <h2 id="add-sub-title" className="text-base font-extrabold text-[#F5F5F5]">
              {t('add.title')}
            </h2>
            {userPlan === 'free' ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/35">
                {t('add.freeCounter', { count: currentSubscriptionCount })}
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/35">
                Lifetime Unlimited
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-[#161616] border border-white/10 text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Free limit banner if at limit */}
        {userPlan === 'free' && currentSubscriptionCount >= 2 && (
          <div className="px-5 pt-3 pb-1">
            <div
              onClick={onOpenPaywall}
              className="p-3 rounded-2xl bg-[#1F1F1F] border border-[#D4AF7C]/40 flex items-center justify-between cursor-pointer hover:border-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out"
            >
              <div className="flex items-center gap-2.5">
                <Crown className="w-5 h-5 text-[#D4AF7C] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#D4AF7C]">
                    Free Tier Limit Reached (2/2)
                  </div>
                  <div className="text-[11px] text-[#A0A0A0]">
                    Upgrade to Lifetime Pro (£14.99) to add unlimited trials!
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-[#D4AF7C] underline shrink-0">Upgrade</span>
            </div>
          </div>
        )}

        {/* Compact AI and Pro access */}
        <div className="flex gap-2 px-5 pt-2.5 pb-1">
          <button
            onClick={() => {
              onClose();
              onOpenAiScanner();
            }}
            className="btn-secondary-luxury min-h-[42px] flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-[#F5F5F5] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
          >
            <Camera className="h-4 w-4 shrink-0 text-[#D4AF7C]" />
            <span className="truncate">{t('add.aiScannerBannerTitle')}</span>
          </button>
          {userPlan !== 'pro' && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPaywall();
              }}
              className="min-h-[42px] group flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-[#D4AF7C]/40 bg-[#D4AF7C]/15 px-3 py-2 text-xs font-extrabold text-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out hover:bg-[#D4AF7C]/25 cursor-pointer"
            >
              <Crown className="h-4 w-4 shrink-0 text-[#D4AF7C]" />
              <span className="truncate">{t('paywall.lifetimeProTitle')}</span>
              <span className="rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] px-2 py-0.5 text-[10px] font-black text-[#0A0A0A]">
                {t('settings.upgradeButton')}
              </span>
            </button>
          )}
        </div>

        {/* Tabs: Quick-Add vs Manual */}
        <div className="flex border-b border-white/10 px-5 pt-1 shrink-0">
          <button
            onClick={() => setActiveTab('quick')}
            className={`min-h-[42px] flex-1 py-2.5 text-xs font-bold text-center border-b-2 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
              activeTab === 'quick'
                ? 'border-[#D4AF7C] text-[#D4AF7C]'
                : 'border-transparent text-[#A0A0A0] hover:text-[#F5F5F5]'
            }`}
          >
            {t('add.tabQuick')} ({POPULAR_PRESETS.length})
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`min-h-[42px] flex-1 py-2.5 text-xs font-bold text-center border-b-2 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
              activeTab === 'manual'
                ? 'border-[#D4AF7C] text-[#D4AF7C]'
                : 'border-transparent text-[#A0A0A0] hover:text-[#F5F5F5]'
            }`}
          >
            {t('add.tabManual')}
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto overscroll-y-contain flex-1 space-y-3">
          {pendingAffiliateTrial && pendingTimingPreview && (
            <aside
              className="rounded-3xl border border-[#D4AF7C]/40 bg-[#161616] p-3.5 shadow-lg space-y-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D4AF7C]/30 bg-[#D4AF7C]/15 text-[#D4AF7C]">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-[#F5F5F5]">
                    {t('affiliate.confirmTitle')}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#A0A0A0]">
                    {t('affiliate.confirmBody', { name: pendingAffiliateTrial.subscription.name })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPendingAffiliateTrial(null)}
                  className="btn-secondary-luxury min-h-[42px] rounded-full px-3.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  {t('affiliate.confirmNotStarted')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmAffiliateTrial('ics')}
                  className="btn-champagne min-h-[42px] flex-1 flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold text-[#0A0A0A] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('affiliate.confirmStarted')} (.ics)</span>
                </button>
              </div>
            </aside>
          )}

          {duplicateNotice && (
            <div role="status" className="rounded-full border border-[#D4AF7C]/35 bg-[#161616] px-4 py-2.5 text-xs text-[#D4AF7C]">
              {t('add.duplicateNotice')}
            </div>
          )}

          {userPlan === 'free' && currentSubscriptionCount >= 2 + bonusSlots && onOpenGiftSlot && (
            <div className="rounded-2xl border border-[#D4AF7C]/30 bg-[#1F1F1F] p-3 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Gift className="w-4 h-4 text-[#D4AF7C] shrink-0" />
                <span className="text-[11px] text-[#A0A0A0] truncate">
                  Free limit reached ({currentSubscriptionCount}/{2 + bonusSlots}). Invite a mate for +1 free slot!
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGiftSlot();
                }}
                className="text-xs font-bold text-[#D4AF7C] hover:underline shrink-0 cursor-pointer"
              >
                Gift Slot
              </button>
            </div>
          )}

          {activeTab === 'quick' ? (
            <div className="space-y-3">
              {/* Instant Live Search Bar & Horizontal Category Pills */}
              <div className="space-y-2.5 sticky top-0 z-10 bg-[#161616]/95 backdrop-blur-xl pb-2 pt-0.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#D4AF7C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    placeholder="Search 49 UK services... (Search 45+ UK presets)"
                    aria-label="Search 49 UK services (Search 45+ UK presets)"
                    className="input-luxury w-full min-h-[46px] rounded-full pl-10 pr-9 py-2.5 text-xs"
                  />
                  {presetSearch && (
                    <button
                      type="button"
                      onClick={() => setPresetSearch('')}
                      aria-label="Clear preset search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#A0A0A0] hover:text-[#F5F5F5] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Horizontal Scrollable Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {FILTER_GROUPS.map((group) => {
                    const active = selectedFilterGroup === group;
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() => setSelectedFilterGroup(group)}
                        className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                          active
                            ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md shadow-[#D4AF7C]/20'
                            : 'bg-[#1F1F1F] text-[#A0A0A0] border border-white/10 hover:text-[#F5F5F5] hover:border-[#D4AF7C]/40'
                        }`}
                      >
                        {group}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#A0A0A0] font-medium px-0.5">
                <span>Tap Free Trial for 10am alarm or + to track active</span>
                <span className="shrink-0 font-mono text-[#D4AF7C] font-bold ml-2">
                  {filteredPresets.length} services
                </span>
              </div>

              {filteredPresets.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredPresets.map((preset) => {
                    const affiliateOffer = getAffiliateOffer(preset.name);
                    const defaultDays = preset.defaultTrialDays ?? affiliateOffer?.trialDays ?? 30;
                    const isDrawerOpen = expandedPresetId === preset.id;
                    const drawerTiming = isDrawerOpen ? calculateSmartTrialTiming(pendingTrialDays) : null;

                    return (
                      <div
                        key={preset.id}
                        className="rounded-2xl overflow-hidden border border-white/[0.06] transition-colors"
                      >
                        {/* Spacious Service Row — Zero Truncated Service Names */}
                        <div
                          onClick={() => handlePresetAffiliateTrial(preset)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handlePresetAffiliateTrial(preset);
                            }
                          }}
                          className="min-h-[72px] p-3.5 rounded-2xl bg-[#1F1F1F]/60 flex items-center justify-between gap-3 cursor-pointer select-none active:scale-[0.99] transition-transform duration-150 ease-out"
                        >
                          {/* Left: 44x44px Icon + Full Service Name & Price/Category/Trial Badge */}
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-2xl shrink-0 overflow-hidden flex items-center justify-center">
                              <BrandIcon name={preset.name} category={preset.category} color={preset.color} size="preset" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm text-[#F5F5F5] leading-snug break-normal">
                                {preset.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#A0A0A0] mt-1">
                                <span className="font-mono font-bold text-xs text-[#F5F5F5] tabular-nums">
                                  {formatPrice(preset.price, preset.currency)}/mo
                                </span>
                                <span className="text-[#A0A0A0]/40">·</span>
                                {(() => {
                                  if (!preset.hasFreeTrial && preset.trialType === 'none') {
                                    return (
                                      <span className="rounded-full bg-zinc-800/80 border border-zinc-600/50 px-2 py-0.5 text-[10px] font-semibold text-[#A0A0A0]">
                                        No UK Free Trial
                                      </span>
                                    );
                                  }
                                  if (preset.trialType === 'cooling_off') {
                                    return (
                                      <span className="rounded-full bg-amber-500/10 border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                        14-Day Cooling-Off
                                      </span>
                                    );
                                  }
                                  if (preset.trialType === 'money_back') {
                                    return (
                                      <span className="rounded-full bg-sky-500/10 border border-sky-500/40 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                                        30-Day Refund Shield
                                      </span>
                                    );
                                  }
                                  if (preset.trialType === 'promo_discount') {
                                    return (
                                      <span className="rounded-full bg-purple-500/10 border border-purple-500/40 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                                        Promo Intro Offer
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="rounded-full bg-[#D4AF7C]/15 border border-[#D4AF7C]/30 px-2 py-0.5 text-[10px] font-semibold text-[#D4AF7C]">
                                      {defaultDays}-Day Trial
                                    </span>
                                  );
                                })()}
                                <span>·</span>
                                <span className="truncate">{preset.category}</span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Secondary Free Trial button + Gold Add Button */}
                          {(() => {
                            const isTracked = subscriptions.some((s) => isDuplicateSubscription({ name: preset.name }, s));
                            return (
                              <div className="shrink-0 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isTracked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isTracked) return;
                                    if (onStartTrialFlow) {
                                      checkPlanAndProceed(() => {
                                        const offer = getAffiliateOffer(preset.name);
                                        const trialDays = preset.defaultTrialDays ?? offer?.trialDays ?? 30;
                                        const trialUrl = preset.trialUrl || offer?.trialUrl;
                                        onStartTrialFlow({
                                          name: preset.name,
                                          price: preset.price,
                                          currency: preset.currency || currencySymbol,
                                          frequency: preset.frequency,
                                          category: preset.category,
                                          defaultTrialDays: trialDays,
                                          trialUrl,
                                          cancelUrl: preset.cancelUrl,
                                          cancelEmail: preset.cancelEmail,
                                          cancelGuideSteps: preset.cancelSteps,
                                          color: preset.color,
                                          notes: preset.description,
                                        });
                                        onClose();
                                      });
                                      return;
                                    }
                                    handlePresetAffiliateTrial(preset);
                                  }}
                                  aria-label={isTracked ? `${preset.name} already tracked` : `Start ${preset.name} free trial`}
                                  className={`min-h-[38px] px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all duration-150 ease-out ${
                                    isTracked
                                      ? 'border border-emerald-500/40 text-emerald-400 bg-emerald-500/10 cursor-default opacity-90'
                                      : isDrawerOpen
                                      ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold shadow-md shadow-[#D4AF7C]/20 border-transparent cursor-pointer active:scale-[0.97]'
                                      : 'border border-[#D4AF7C]/40 text-[#D4AF7C] hover:border-[#D4AF7C] bg-[#1F1F1F] shadow-sm cursor-pointer active:scale-[0.97]'
                                  }`}
                                >
                                  {isTracked ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                      <span>Added ✓</span>
                                    </>
                                  ) : (
                                    <>
                                      <Gift className="w-3.5 h-3.5 shrink-0" />
                                      <span>Free Trial</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  disabled={isTracked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isTracked) return;
                                    handleQuickAdd(preset);
                                  }}
                                  aria-label={isTracked ? `${preset.name} already added` : `Add ${preset.name}`}
                                  className={`min-h-[38px] px-3.5 py-2 rounded-full font-bold flex items-center justify-center gap-1 shadow-md transition-all ${
                                    isTracked
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default opacity-90'
                                      : 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-[#D4AF7C]/20 hover:brightness-110 active:scale-[0.97] cursor-pointer'
                                  }`}
                                >
                                  {isTracked ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                                      <span>Added ✓</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
                                      <span>Add</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        {isDrawerOpen && drawerTiming && (
                          <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-2.5 bg-[#1F1F1F]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[#F5F5F5] flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[#D4AF7C]" />
                                Trial Duration & Auto-Alarm:
                              </span>
                              <span className="font-mono font-bold text-[#D4AF7C]">
                                {pendingTrialDays}d ({drawerTiming.leadHours}h safety lead)
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                              {TRIAL_DURATION_PRESETS.map((d) => {
                                const isSelected = !isPendingCustomDays && pendingTrialDays === d;
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => {
                                      setIsPendingCustomDays(false);
                                      setPendingTrialDays(d);
                                    }}
                                    className={`min-h-[38px] rounded-full text-xs font-bold active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                                      isSelected
                                        ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md shadow-[#D4AF7C]/20'
                                        : 'bg-[#161616] text-[#F5F5F5] border border-white/10 hover:border-[#D4AF7C]/50'
                                    }`}
                                  >
                                    {d} Days
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => setIsPendingCustomDays(true)}
                                className={`min-h-[38px] rounded-full text-xs font-bold active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                                  isPendingCustomDays
                                    ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md shadow-[#D4AF7C]/20'
                                    : 'bg-[#161616] text-[#F5F5F5] border border-white/10 hover:border-[#D4AF7C]/50'
                                }`}
                              >
                                Custom
                              </button>
                            </div>

                            {isPendingCustomDays && (
                              <div className="flex items-center gap-2 pt-0.5">
                                <label className="text-xs text-[#A0A0A0]">Custom days:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={pendingTrialDays}
                                  onChange={(e) => setPendingTrialDays(Math.max(1, parseInt(e.target.value, 10) || 7))}
                                  className="input-luxury w-20 rounded-full px-3 py-1.5 text-xs font-mono"
                                />
                              </div>
                            )}

                            <div className="rounded-2xl bg-[#161616] border border-[#D4AF7C]/30 px-3.5 py-2.5 text-xs text-[#F5F5F5] flex flex-wrap items-center justify-between gap-1.5">
                              <span>Expires: <strong className="text-[#D4AF7C]">{formatArmedAlarmDateTime(drawerTiming.trialExpiresAt)}</strong></span>
                              <span>10am Alarm: <strong className="text-[#D4AF7C]">{formatArmedAlarmDateTime(drawerTiming.alarmArmedAt)}</strong></span>
                            </div>

                            {preset.notes && (
                              <div className="rounded-2xl p-3.5 bg-[#0A0A0A] border border-[#D4AF37]/50 shadow-md shadow-[#D4AF37]/10 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                                  <AlertTriangle className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                                  <span>Smart Trap Warning / Cancellation Tip</span>
                                </div>
                                <p className="text-xs text-[#F5F5F5]/90 leading-relaxed">{preset.notes}</p>
                                {preset.cancelUrl && (
                                  <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
                                    <span className="text-[#A0A0A0]">Cancellation URL:</span>
                                    <a
                                      href={preset.cancelUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#D4AF37] hover:underline flex items-center gap-1 font-mono font-bold"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span>Open Portal</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleConfirmInlinePresetTrial(preset, 'ics')}
                                className="btn-champagne min-h-[44px] flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-extrabold text-[#0A0A0A] cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 shrink-0" />
                                <span>Start Trial + .ics Alarm</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleConfirmInlinePresetTrial(preset, 'gcal')}
                                className="btn-secondary-luxury min-h-[44px] flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold text-[#F5F5F5] cursor-pointer"
                              >
                                <CalendarDays className="w-3.5 h-3.5 shrink-0 text-[#D4AF7C]" />
                                <span>1-Tap Google Calendar</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-[#A0A0A0]" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setName(preset.name);
                                setPrice(preset.price.toString());
                                setCategory(preset.category);
                                setColor(preset.color);
                                setCancelUrl(preset.cancelUrl);
                                setNotes(preset.notes || preset.description);
                                if (preset.hasFreeTrial) {
                                  setIsTrial(true);
                                  applyManualTrialDuration(preset.trialDurationDays || preset.defaultTrialDays);
                                } else {
                                  setIsTrial(false);
                                }
                                setActiveTab('manual');
                              }}
                              className="w-full py-1.5 text-center text-[11px] font-semibold text-[#A0A0A0] hover:text-[#D4AF7C] transition-colors cursor-pointer"
                            >
                              Customize in Manual Entry →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#161616] p-6 text-center space-y-2.5">
                  <p className="text-xs font-bold text-[#F5F5F5]">No UK presets match "{presetSearch}"</p>
                  <p className="text-[11px] text-[#A0A0A0]">
                    Switch to Manual Entry to add any custom subscription with smart trial protection.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {(presetSearch || selectedFilterGroup !== 'All') && (
                      <button
                        type="button"
                        onClick={() => {
                          setPresetSearch('');
                          setSelectedFilterGroup('All');
                        }}
                        className="btn-secondary-luxury min-h-[42px] inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reset Filters
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setName(presetSearch);
                        setActiveTab('manual');
                      }}
                      className="btn-champagne min-h-[42px] inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold text-[#0A0A0A] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add "{presetSearch}" Manually
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              {validationError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                  {validationError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                  {t('add.nameLabel')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. PureGym London, Sky Broadband, ChatGPT..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-luxury w-full rounded-full px-4 py-2.5 text-sm"
                  required
                />
              </div>

              {(() => {
                const matchedPreset = name.trim()
                  ? POPULAR_PRESETS.find(
                      (p) =>
                        p.name.toLowerCase() === name.trim().toLowerCase() ||
                        p.name.toLowerCase().includes(name.trim().toLowerCase())
                    )
                  : null;
                if (!matchedPreset) return null;
                return (
                  <div className="rounded-2xl p-3.5 bg-[#0A0A0A] border border-[#D4AF37]/50 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Smart Trap Warning / Cancellation Tip</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setName(matchedPreset.name);
                          setPrice(matchedPreset.price.toString());
                          setCategory(matchedPreset.category);
                          setColor(matchedPreset.color);
                          setCancelUrl(matchedPreset.cancelUrl);
                          setNotes(matchedPreset.notes || matchedPreset.description);
                          if (matchedPreset.hasFreeTrial) {
                            setIsTrial(true);
                            applyManualTrialDuration(matchedPreset.trialDurationDays || matchedPreset.defaultTrialDays);
                          }
                        }}
                        className="text-[10px] text-[#D4AF7C] underline font-bold cursor-pointer"
                      >
                        Auto-fill £{matchedPreset.price} & Info
                      </button>
                    </div>
                    <p className="text-xs text-[#F5F5F5]/90 leading-relaxed">{matchedPreset.notes}</p>
                  </div>
                );
              })()}

              {getAffiliateOffer(name) && (
                <button
                  type="button"
                  onClick={handleManualAffiliateTrial}
                  disabled={!name.trim() || !price || Number(price) <= 0}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D4AF7C]/35 bg-[#1F1F1F] px-4 py-2.5 text-left text-xs font-bold text-[#D4AF7C] shadow-sm active:scale-[0.97] transition-all duration-150 ease-out hover:border-[#D4AF7C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Gift className="h-4 w-4 shrink-0 text-[#D4AF7C]" />
                  <span>{t('affiliate.trialCta')}</span>
                  <BellRing className="h-3.5 w-3.5 shrink-0 text-[#D4AF7C]" />
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                    {t('add.priceLabel', { symbol: currencySymbol })}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 19.99"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-sm font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                    {t('add.frequencyLabel')}
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half-yearly">Half-yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                    {t('add.nextPaymentLabel')}
                  </label>
                  <input
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                    {t('add.reminderLabel')}
                  </label>
                  <select
                    value={reminderDaysBefore}
                    onChange={(e) => setReminderDaysBefore(Number(e.target.value))}
                    className="input-luxury w-full rounded-full px-4 py-2.5 text-xs"
                  >
                    <option value={1}>24h before</option>
                    <option value={2}>48h before</option>
                    <option value={3}>3 days before</option>
                    <option value={7}>7 days before</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                  {t('add.categoryLabel')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`text-xs px-3.5 py-1.5 rounded-full font-medium active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                        category === cat
                          ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold shadow-sm shadow-[#D4AF7C]/20'
                          : 'bg-[#1F1F1F] text-[#A0A0A0] hover:text-[#F5F5F5] border border-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#1F1F1F] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-[#F5F5F5]">
                    {t('add.trialToggle')}
                  </div>
                  <input
                    type="checkbox"
                    checked={isTrial}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsTrial(checked);
                      if (checked) {
                        applyManualTrialDuration(manualTrialDays);
                      }
                    }}
                    className="w-4 h-4 rounded accent-[#D4AF7C] cursor-pointer"
                    id="trial-toggle"
                  />
                </div>
                {isTrial && manualTimingPreview && (
                  <div className="space-y-2.5 pt-2 border-t border-white/10">
                    <div className="grid grid-cols-4 gap-1.5">
                      {TRIAL_DURATION_PRESETS.map((d) => {
                        const selected = !isManualCustomTrial && manualTrialDays === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setIsManualCustomTrial(false);
                              applyManualTrialDuration(d);
                            }}
                            className={`rounded-full py-1.5 text-[11px] font-bold active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                              selected
                                ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-sm shadow-[#D4AF7C]/20'
                                : 'bg-[#161616] text-[#F5F5F5] border border-white/10 hover:border-[#D4AF7C]/50'
                            }`}
                          >
                            {d} Days
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setIsManualCustomTrial(true)}
                        className={`rounded-full py-1.5 text-[11px] font-bold active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                          isManualCustomTrial
                            ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-sm shadow-[#D4AF7C]/20'
                            : 'bg-[#161616] text-[#F5F5F5] border border-white/10 hover:border-[#D4AF7C]/50'
                        }`}
                      >
                        Custom
                      </button>
                    </div>

                    {isManualCustomTrial && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#A0A0A0]">Trial days:</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={manualTrialDays}
                          onChange={(e) => applyManualTrialDuration(Math.max(1, parseInt(e.target.value, 10) || 7))}
                          className="input-luxury w-20 rounded-full px-3 py-1 text-xs font-mono"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="trial-date" className="block text-[11px] text-[#D4AF7C] mb-1">
                        {t('add.trialEndDateLabel')}
                      </label>
                      <input
                        id="trial-date"
                        type="date"
                        value={trialEndDate}
                        onChange={(e) => {
                          setTrialEndDate(e.target.value);
                          setNextPaymentDate(e.target.value);
                        }}
                        className="input-luxury w-full rounded-full px-4 py-2 text-xs"
                      />
                    </div>

                    <div className="rounded-2xl bg-[#161616] border border-[#D4AF7C]/35 px-3 py-2 text-[10px] text-[#D4AF7C] flex items-center justify-between">
                      <span>Safety Alarm: <strong>{manualTimingPreview.leadHours}h before (10:00 AM)</strong></span>
                      <span>+ 24h Urgent Alert</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                  {t('add.colorLabel')}
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      className="w-7 h-7 rounded-full flex items-center justify-center active:scale-[0.95] transition-transform cursor-pointer"
                      style={{ backgroundColor: c }}
                      aria-label={`Select colour ${c}`}
                    >
                      {color === c && <Check className="w-4 h-4 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                  {t('add.cancelUrlLabel')}
                </label>
                <input
                  type="url"
                  placeholder="https://puregym.com/member/ or service cancellation page"
                  value={cancelUrl}
                  onChange={(e) => setCancelUrl(e.target.value)}
                  className="input-luxury w-full rounded-full px-4 py-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F5F5F5] mb-1.5">
                  {t('add.notesLabel')}
                </label>
                <textarea
                  placeholder="e.g. Paid from Monzo joint account, renewal every 15th..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="input-luxury w-full rounded-2xl px-3.5 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                className="btn-champagne w-full py-4 px-4 rounded-full font-extrabold text-sm text-[#0A0A0A] active:scale-[0.97] transition-all duration-150 ease-out flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(212,175,124,0.28)]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                {t('add.submitButton')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
