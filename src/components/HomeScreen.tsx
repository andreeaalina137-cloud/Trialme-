import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Trophy,
  Search,
  ShieldCheck,
  TrendingUp,
  BadgeCheck,
  CircleDollarSign,
  Coins,
  Scissors,
  Medal,
  Trash2,
  X,
  Gift,
  CalendarDays,
  BellRing,
  ChevronRight,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import type { Subscription, UserPlan } from '../types/subscription';
import { SubscriptionCard } from './SubscriptionCard';
import { AnimatedCounter } from './AnimatedCounter';
import { CalendarView } from './CalendarView';
import {
  calculateMonthlyTotal,
  calculateAnnualTotal,
  calculateTotalSavings,
  calculateAnnualSavings,
  calculateRenewalForecast,
  convertFrequencyToMonthly,
  formatPrice,
  filterAndSortSubscriptions,
  getDaysUntilNextPayment,
  roundCurrency,
} from '../utils/subscriptionCalculations';
import { isDuplicateSubscription } from '../utils/subscriptionIdentity';
import { CURATED_UK_TRIALS, type CuratedUkTrial } from '../utils/retentionAndTrust';
import { POPULAR_PRESETS, type PopularPreset } from '../data/popularPresets';
import { BrandIcon } from './BrandIcon';
import { GoldBellIcon } from './GoldBellIcon';
import { useTranslation } from '../i18n/LanguageContext';
import { playAchievementChime, playSubtlePop, playSuccessFanfare } from '../utils/soundEffects';
import { ACHIEVEMENTS, getUnlockedAchievementIds } from '../utils/achievements';
import type { ConfettiOrigin } from './ConfettiExplosion';

interface HomeScreenProps {
  subscriptions: Subscription[];
  userPlan: UserPlan;
  currencySymbol: string;
  onOpenAddModal: () => void;
  onOpenSubscriptionDetail: (sub: Subscription) => void;
  onOpenCancelSub?: (sub: Subscription) => void;
  onOpenAiScanner?: () => void;
  onOpenCalendar?: () => void;
  onLoadShowcaseTrials?: () => void;
  onOpenPaywall: () => void;
  onCelebrate: (origin: ConfettiOrigin) => void;
  onClearCancelled: () => void;
  onStartRadarTrial?: (trial: CuratedUkTrial) => void;
  onQuickAddPreset?: (preset: PopularPreset, asTrial?: boolean) => void;
  activeSection?: 'dashboard' | 'trials' | 'subscriptions' | 'calendar' | 'reports';
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  subscriptions,
  userPlan,
  currencySymbol,
  onOpenAddModal,
  onOpenSubscriptionDetail,
  onOpenCancelSub,
  onLoadShowcaseTrials,
  onOpenPaywall,
  onCelebrate,
  onClearCancelled,
  onStartRadarTrial,
  onQuickAddPreset,
  activeSection = 'dashboard',
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'cancelled' | 'renewingSoon'>('all');
  const [isConfirmingClearCancelled, setIsConfirmingClearCancelled] = useState(false);
  const [showTrialRadar, setShowTrialRadar] = useState(false);
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);

  const monthlyTotal = calculateMonthlyTotal(subscriptions);
  const annualTotal = calculateAnnualTotal(subscriptions);
  const totalSavings = calculateTotalSavings(subscriptions);
  const annualSavings = calculateAnnualSavings(subscriptions);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthSavings = roundCurrency(
    subscriptions
      .filter((subscription) => subscription.status === 'cancelled' && subscription.cancelledAt?.slice(0, 7) === currentMonth)
      .reduce((sum, subscription) => {
        const amt = subscription.monthlySavingsAmount ?? convertFrequencyToMonthly(subscription.price, subscription.frequency);
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0)
  );

  const activeSubs = subscriptions
    .filter((s) => s.status === 'active' || s.status === 'trial')
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));

  const activeCount = activeSubs.length;
  const trialCount = subscriptions.filter((s) => s.status === 'trial').length;
  const cancelledCount = subscriptions.filter((s) => s.status === 'cancelled').length;
  const unlockedAchievementIds = getUnlockedAchievementIds(subscriptions);
  const previousSavings = useRef(totalSavings);
  const [isSavingsBoosted, setIsSavingsBoosted] = useState(false);
  const [celebratingAchievementIds, setCelebratingAchievementIds] = useState<string[]>([]);

  useEffect(() => {
    const oldSavings = previousSavings.current;
    previousSavings.current = totalSavings;
    if (totalSavings <= oldSavings) {
      if (totalSavings < oldSavings) setIsSavingsBoosted(false);
      return;
    }

    setIsSavingsBoosted(true);
    const timeout = window.setTimeout(() => setIsSavingsBoosted(false), 800);
    return () => window.clearTimeout(timeout);
  }, [totalSavings]);

  useEffect(() => {
    let previouslyUnlocked: string[] = [];
    try {
      const saved = localStorage.getItem('subcleaner_achievements_unlocked');
      previouslyUnlocked = saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      previouslyUnlocked = [];
    }

    const newlyUnlocked = unlockedAchievementIds.filter((id) => !previouslyUnlocked.includes(id));
    try {
      localStorage.setItem(
        'subcleaner_achievements_unlocked',
        JSON.stringify([...new Set([...previouslyUnlocked, ...unlockedAchievementIds])])
      );
    } catch {
      // Storage unavailable fallback
    }

    if (newlyUnlocked.length === 0) return;
    setCelebratingAchievementIds(newlyUnlocked);
    playAchievementChime();
    const timeout = window.setTimeout(() => setCelebratingAchievementIds([]), 1200);
    return () => window.clearTimeout(timeout);
  }, [subscriptions]);

  const filteredSubs = filterAndSortSubscriptions(subscriptions, {
    search: searchQuery,
    statusFilter: activeSection === 'trials' ? 'trial' : statusFilter,
    sortBy: 'renewal',
  });

  const nearestSub =
    activeSubs.find((s) => s.status === 'trial') ??
    activeSubs[0] ??
    null;

  const nearestDueDate = nearestSub
    ? (nearestSub.status === 'trial' && nearestSub.trialEndDate ? nearestSub.trialEndDate : nearestSub.nextPaymentDate)
    : null;
  const nearestDaysLeft = nearestDueDate ? Math.max(0, getDaysUntilNextPayment(nearestDueDate)) : 0;
  const nearestDuration = nearestSub?.trialDurationDays || 30;
  const nearestProgressPercent = nearestSub
    ? Math.min(92, Math.max(12, Math.round(((nearestDuration - Math.min(nearestDuration, nearestDaysLeft)) / nearestDuration) * 100)))
    : 38;

  const formatRenewalDate = (dateStr?: string) => {
    if (!dateStr) return '24 Dec 2025';
    const parsed = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const myTrialsList =
    filteredSubs.length > 1 && nearestSub && statusFilter === 'all' && !searchQuery
      ? filteredSubs.filter((s) => s.id !== nearestSub.id)
      : filteredSubs;

  const matchingPresets = searchQuery.trim()
    ? POPULAR_PRESETS.filter((preset) => {
        const tokens = searchQuery.toLowerCase().trim().split(/\s+/);
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
      }).slice(0, 6)
    : [];

  const renewalForecast = React.useMemo(
    () => calculateRenewalForecast(subscriptions, 6),
    [subscriptions]
  );
  const maxForecastTotal = React.useMemo(
    () => Math.max(...renewalForecast.map((m) => m.total), 1),
    [renewalForecast]
  );
  const monthlyChartBars = React.useMemo(
    () =>
      renewalForecast.map((item) => {
        const heightPercent =
          item.total > 0
            ? Math.max(18, Math.min(100, Math.round((item.total / maxForecastTotal) * 100)))
            : 10;
        return {
          label: item.label,
          total: item.total,
          height: `${heightPercent}%`,
          active: item.isCurrent,
        };
      }),
    [renewalForecast, maxForecastTotal]
  );

  return (
    <div className="min-h-full bg-[#0A0A0A]">
      {/* Sticky Native Mobile App Bar */}
      <header className="h-14 backdrop-blur-xl bg-[#0A0A0A]/90 sticky top-0 z-30 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-extrabold tracking-tight text-[#D4AF7C]">
            TrialMe
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/30 uppercase">
            UK
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSearchBar((v) => !v)}
            className="h-10 w-10 rounded-full bg-[#161616] border border-white/10 flex items-center justify-center text-[#F5F5F5] active:scale-[0.95] transition-all duration-150 ease-out cursor-pointer"
            aria-label="Toggle search and filters"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#D4AF7C]" />
          </button>
          <button
            type="button"
            onClick={() => {
              playSubtlePop();
              onOpenAddModal();
            }}
            className="h-10 w-10 rounded-full bg-[#161616] border border-white/10 flex items-center justify-center text-[#F5F5F5] active:scale-[0.95] transition-all duration-150 ease-out cursor-pointer"
            aria-label={t('home.ctaAdd')}
          >
            <Plus className="w-5 h-5 text-[#F5F5F5] stroke-[2.2]" />
          </button>
        </div>
      </header>

      {/* Pure Mobile Feed (Comfortable spacing, no side bars) */}
      <div className="space-y-4 px-4 pt-3 pb-28">
        {/* Search & Filter Drawer (when toggled or search active) */}
        {(showSearchBar || searchQuery || statusFilter !== 'all') && (
          <div className="rounded-3xl bg-[#161616] border border-white/[0.08] p-3.5 space-y-2.5 shadow-xl">
            <div className="relative">
              <Search className="w-4 h-4 text-[#A0A0A0] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('home.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-luxury min-h-[44px] w-full rounded-full pl-10 pr-9 py-2 text-xs"
                aria-label={t('home.searchLabel')}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#A0A0A0] hover:text-[#F5F5F5] cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
              {(['all', 'active', 'trial', 'renewingSoon', 'cancelled'] as const).map((filterKey) => {
                const isSelected = statusFilter === filterKey;
                const labels: Record<typeof filterKey, string> = {
                  all: `${t('home.filterAll')} (${subscriptions.length})`,
                  active: `${t('home.filterActive')} (${activeCount})`,
                  trial: `Free Trials (${trialCount})`,
                  renewingSoon: t('home.filterDueSoon'),
                  cancelled: `${t('home.filterCancelled')} (${cancelledCount})`,
                };
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setStatusFilter(filterKey)}
                    className={`px-3.5 py-2 rounded-full font-bold shrink-0 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-md shadow-[#D4AF7C]/20'
                        : 'bg-[#1F1F1F] text-[#A0A0A0] border border-white/10 hover:text-[#F5F5F5]'
                    }`}
                  >
                    {labels[filterKey]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* HERO CARD: "Upcoming Deadline" */}
        {activeSection !== 'subscriptions' && (
          <div className="rounded-3xl bg-[#161616] border border-white/[0.08] p-5 space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-[#F5F5F5] tracking-tight">
                Upcoming Deadline
              </h2>
              <span className="rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] px-3.5 py-1 text-xs font-extrabold text-[#0A0A0A] shadow-sm">
                {nearestDaysLeft === 0
                  ? 'Ends today'
                  : nearestDaysLeft === 1
                  ? '1 day left'
                  : `${nearestDaysLeft} days left`}
              </span>
            </div>

            {nearestSub ? (
              <>
                <div
                  onClick={() => onOpenSubscriptionDetail(nearestSub)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenSubscriptionDetail(nearestSub);
                    }
                  }}
                  className="flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.98] transition-all duration-150 ease-out pt-0.5"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <BrandIcon
                      name={nearestSub.name}
                      category={nearestSub.category}
                      color={nearestSub.color}
                    />
                    <div className="min-w-0">
                      <div className="text-lg font-extrabold text-[#F5F5F5] leading-snug group-hover:text-[#D4AF7C] transition-colors">
                        {nearestSub.name.replace(' UK Standard', '').replace(' UK', '')}
                      </div>
                      <div className="text-xs text-[#A0A0A0]">
                        {nearestSub.status === 'trial' ? 'Free trial' : 'Active subscription'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A0A0A0] group-hover:text-[#D4AF7C] shrink-0" />
                </div>

                {/* Expected Charge Row + Champagne Gold Progress Bar on #1F1F1F track */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-xs text-[#A0A0A0]">Expected charge</span>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-[#F5F5F5] tabular-nums">
                        {formatPrice(nearestSub.price, nearestSub.currency || currencySymbol)}/month
                      </div>
                      <div className="text-[11px] text-[#A0A0A0]">
                        Renews {formatRenewalDate(nearestSub.nextPaymentDate)}
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[#1F1F1F] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] shadow-[0_0_12px_rgba(212,175,124,0.45)] transition-all duration-500"
                      style={{ width: `${nearestProgressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Two Equal Touch Buttons: View Details & Cancel Trial */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenSubscriptionDetail(nearestSub)}
                    className="btn-secondary-luxury min-h-[46px] rounded-full py-2.5 px-4 text-xs font-bold text-[#F5F5F5] text-center active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCancelSub) {
                        onOpenCancelSub(nearestSub);
                      } else {
                        onOpenSubscriptionDetail(nearestSub);
                      }
                    }}
                    className="btn-secondary-luxury min-h-[46px] rounded-full py-2.5 px-4 text-xs font-bold text-[#F5F5F5] hover:border-rose-400/50 hover:text-rose-200 text-center active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
                  >
                    Cancel Trial
                  </button>
                </div>
              </>
            ) : (
              <div className="py-4 text-center space-y-3">
                <p className="text-xs text-[#A0A0A0]">No upcoming trial deadlines yet.</p>
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold shadow-lg shadow-[#D4AF7C]/20 min-h-[46px] px-5 py-2.5 text-xs active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
                >
                  + Add Your First Free Trial
                </button>
              </div>
            )}
          </div>
        )}

        {/* MY TRIALS SECTION */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-[#F5F5F5]">
              {activeSection === 'subscriptions' ? 'All Subscriptions' : 'My Trials'}
            </h2>
            <div className="flex items-center gap-3">
              {onLoadShowcaseTrials && subscriptions.length <= 2 && (
                <button
                  type="button"
                  onClick={onLoadShowcaseTrials}
                  className="text-xs font-bold text-[#D4AF7C] hover:underline cursor-pointer"
                >
                  + Load 5 Trials
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSearchBar((v) => !v)}
                className="text-xs font-semibold text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              >
                See all
              </button>
            </div>
          </div>

          {statusFilter === 'cancelled' && cancelledCount > 0 && (
            <div className="flex justify-end">
              {isConfirmingClearCancelled ? (
                <div className="flex items-center gap-2 rounded-full border border-rose-400/20 bg-[#161616] px-3 py-1.5 text-[10px]">
                  <span className="text-[#A0A0A0]">{t('home.confirmClearCancelled')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearCancelled();
                      setIsConfirmingClearCancelled(false);
                    }}
                    className="font-bold text-rose-300 transition-colors hover:text-white"
                  >
                    {t('home.clearCancelledConfirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClearCancelled(false)}
                    className="rounded-full p-0.5 text-[#A0A0A0] transition-colors hover:text-[#F5F5F5]"
                    aria-label={t('home.cancelClearCancelled')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearCancelled(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#161616] px-3 py-1.5 text-[10px] font-semibold text-[#A0A0A0] transition-colors hover:border-[#D4AF7C]/40 hover:text-[#F5F5F5]"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('home.clearCancelled')}
                </button>
              )}
            </div>
          )}

          {filteredSubs.length > 0 ? (
            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout" initial={false}>
                {(activeSection === 'subscriptions'
                  ? filteredSubs
                  : myTrialsList.length > 0
                  ? myTrialsList
                  : filteredSubs
                ).map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    onClick={() => onOpenSubscriptionDetail(sub)}
                    currencySymbol={currencySymbol}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-3xl bg-[#161616] border border-white/[0.08] p-7 text-center space-y-3 shadow-xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4AF7C]/35 bg-[#D4AF7C]/10 text-[#D4AF7C]">
                {subscriptions.length === 0 && !searchQuery ? (
                  <Gift className="h-5 w-5" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-bold text-sm text-[#F5F5F5]">
                  {subscriptions.length === 0 && !searchQuery
                    ? t('home.emptyTrialTitle')
                    : t('home.noSubsFound')}
                </p>
                <p className="text-xs text-[#A0A0A0] mt-1">
                  {subscriptions.length === 0 && !searchQuery
                    ? t('home.emptyTrialDesc')
                    : searchQuery
                    ? t('home.noSubsFoundDesc')
                    : t('home.noSubsStart')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {subscriptions.length > 0 && (searchQuery !== '' || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="btn-secondary-luxury min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
                <button
                  onClick={onOpenAddModal}
                  className="rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold shadow-lg shadow-[#D4AF7C]/20 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
                >
                  <Gift className="h-3.5 w-3.5" />
                  <span>
                    {subscriptions.length === 0 && !searchQuery
                      ? t('home.emptyTrialCta')
                      : t('home.addPopularNow')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Matching UK Presets when searching */}
          {matchingPresets.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-[#D4AF7C] font-bold px-1">
                <span>Quick-Add from UK Preset Directory ({matchingPresets.length})</span>
                <span className="text-[10px] text-[#A0A0A0]">1-Tap Setup</span>
              </div>
              <div className="space-y-2">
                {matchingPresets.map((preset) => {
                  const isTracked = activeSubs.some((s) => isDuplicateSubscription({ name: preset.name }, s));
                  return (
                    <div
                      key={preset.id}
                      className="min-h-[68px] py-3 px-4 rounded-2xl bg-[#161616] border border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <BrandIcon name={preset.name} category={preset.category} color={preset.color} size="preset" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-[#F5F5F5] leading-snug">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-[#A0A0A0] mt-0.5">
                            {formatPrice(preset.price, preset.currency)}/
                            {preset.frequency === 'yearly' ? 'yr' : 'mo'} · {preset.category}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {preset.defaultTrialDays && (
                          <button
                            type="button"
                            disabled={isTracked}
                            onClick={() => {
                              if (isTracked) return;
                              if (onQuickAddPreset) {
                                onQuickAddPreset(preset, true);
                                setSearchQuery('');
                              } else {
                                onOpenAddModal();
                              }
                            }}
                            className={`min-h-[38px] rounded-full px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-all duration-150 ease-out ${
                              isTracked
                                ? 'border border-emerald-500/40 text-emerald-400 bg-emerald-500/10 cursor-default opacity-90'
                                : 'btn-secondary-luxury text-[#D4AF7C] active:scale-[0.97] cursor-pointer'
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
                        )}
                        <button
                          type="button"
                          disabled={isTracked}
                          onClick={() => {
                            if (isTracked) return;
                            if (onQuickAddPreset) {
                              onQuickAddPreset(preset, false);
                              setSearchQuery('');
                            } else {
                              onOpenAddModal();
                            }
                          }}
                          className={`min-h-[38px] px-3.5 py-2 rounded-full font-bold flex items-center justify-center gap-1 shadow-md transition-all duration-150 ease-out ${
                            isTracked
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default opacity-90'
                              : 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-[#D4AF7C]/20 active:scale-[0.97] cursor-pointer'
                          }`}
                          aria-label={isTracked ? `${preset.name} already added` : `Add ${preset.name}`}
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Total Potential Charges & Cash-Flow Projection Card */}
        <div className="rounded-3xl bg-[#161616] border border-white/[0.08] p-4 space-y-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[#A0A0A0]">Total Potential Charges</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold text-[#F5F5F5] tabular-nums">
                  <AnimatedCounter
                    value={monthlyTotal}
                    currencySymbol={currencySymbol}
                    className="text-[#F5F5F5]"
                  />
                </span>
                <span className="text-xs text-[#A0A0A0]">
                  /mo · {formatPrice(annualTotal, currencySymbol)}/yr
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCalendarSheet((v) => !v)}
              className="btn-secondary-luxury min-h-[40px] px-3.5 py-2 rounded-full text-xs font-bold text-[#D4AF7C] flex items-center gap-1.5 active:scale-[0.97] transition-all cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5 text-[#D4AF7C]" />
              <span>{showCalendarSheet ? 'Hide Calendar' : 'Calendar'}</span>
            </button>
          </div>

          {/* Vertical Bar Chart Visual (6-Month Projection) */}
          <div className="pt-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#A0A0A0] mb-1.5">
              <span>Monthly Renewal Forecast</span>
              <span className="text-[#D4AF7C] font-semibold">{trialCount} active trials</span>
            </div>
            <div className="h-20 rounded-2xl bg-[#0A0A0A]/70 border border-white/[0.06] p-2.5 flex items-end justify-between gap-2.5">
              {monthlyChartBars.map((bar, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full bg-[#1F1F1F]/70 rounded-t-lg h-full max-h-[48px] flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        bar.active
                          ? 'bg-gradient-to-t from-[#B79B6B] to-[#D4AF7C] shadow-[0_0_10px_rgba(212,175,124,0.4)]'
                          : 'bg-gradient-to-t from-[#1F1F1F] to-[#B79B6B]/70'
                      }`}
                      style={{ height: bar.height }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono ${bar.active ? 'text-[#D4AF7C] font-bold' : 'text-[#A0A0A0]'}`}>
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {userPlan === 'free' && (
            <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#A0A0A0]">
              <span>{t('home.freeLimitWarning', { count: activeCount })}</span>
              <button
                type="button"
                onClick={onOpenPaywall}
                className="font-bold text-[#D4AF7C] hover:underline cursor-pointer"
              >
                {t('home.unlockLifetime')}
              </button>
            </div>
          )}

          {showCalendarSheet && (
            <div className="pt-2">
              <CalendarView
                subscriptions={subscriptions}
                currencySymbol={currencySymbol}
                onSelectSubscription={onOpenSubscriptionDetail}
                compact
              />
            </div>
          )}
        </div>

        {/* UK Free Trial Radar */}
        <section className="rounded-3xl bg-[#161616] border border-white/[0.08] p-4 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#D4AF7C]/35 bg-[#D4AF7C]/15 text-[#D4AF7C]">
                <Gift className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-[#F5F5F5] truncate">
                    UK Free Trial Radar
                  </h3>
                  <span className="rounded-full bg-[#D4AF7C]/15 border border-[#D4AF7C]/35 px-2 py-0.5 text-[9px] font-bold text-[#D4AF7C]">
                    Auto-Alarm
                  </span>
                </div>
                <p className="text-[11px] text-[#A0A0A0] truncate">
                  Curated UK trials with 10:00 AM cancellation alarm
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTrialRadar((v) => !v)}
              className="btn-secondary-luxury min-h-[40px] shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
            >
              {showTrialRadar ? 'Hide' : 'Explore (4)'}
            </button>
          </div>

          {showTrialRadar && (
            <div className="mt-3.5 space-y-2.5 pt-3.5 border-t border-white/[0.07]">
              {CURATED_UK_TRIALS.map((deal) => {
                const isTracked = activeSubs.some((s) => isDuplicateSubscription({ name: deal.name }, s));
                return (
                  <div
                    key={deal.id}
                    className="rounded-2xl border border-white/[0.07] bg-[#1F1F1F] p-3.5 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-xs text-[#F5F5F5]">{deal.name}</span>
                        <span className="shrink-0 rounded-full bg-[#D4AF7C]/20 border border-[#D4AF7C]/35 px-2 py-0.5 text-[9px] font-extrabold text-[#D4AF7C]">
                          {deal.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A0A0A0] mt-1 leading-snug">{deal.highlight}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isTracked}
                      onClick={() => {
                        if (isTracked) return;
                        window.open(deal.trialUrl, '_blank', 'noopener,noreferrer');
                        if (onStartRadarTrial) {
                          onStartRadarTrial(deal);
                        } else {
                          onOpenAddModal();
                        }
                      }}
                      className={`rounded-full font-bold shadow-lg min-h-[44px] w-full px-3 py-2 text-xs flex items-center justify-center gap-1.5 transition-all duration-150 ease-out ${
                        isTracked
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default opacity-90'
                          : 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow-[#D4AF7C]/20 active:scale-[0.97] cursor-pointer'
                      }`}
                    >
                      {isTracked ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Tracked ✓</span>
                        </>
                      ) : (
                        <>
                          <BellRing className="w-3.5 h-3.5 shrink-0" />
                          <span>Start Trial + 3-Day Alarm</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Savings Trophy & Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-3xl bg-[#161616] border border-white/[0.08] p-5 shadow-xl space-y-4"
        >
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/40">
                <Trophy className="w-3 h-3 text-[#D4AF7C]" />
                {t('home.savedSoFarTitle')}
              </span>

              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-3xl font-extrabold text-[#F5F5F5] tracking-tight tabular-nums">
                  <AnimatedCounter
                    value={totalSavings}
                    currencySymbol={currencySymbol}
                    className={`text-[#D4AF7C] ${isSavingsBoosted ? 'animate-savings-counter' : ''}`}
                  />
                </span>
                <span className="text-xs text-[#A0A0A0] font-semibold">{t('home.savedPerMonth')}</span>
              </div>

              <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-[#1F1F1F] px-3 py-1 text-[11px]">
                <span className="text-[#A0A0A0]">{t('home.thisMonthSavings')}</span>
                <span className="font-bold text-[#D4AF7C]">{formatPrice(thisMonthSavings, currencySymbol)}</span>
              </div>

              <p className="text-xs text-[#A0A0A0] leading-snug pt-0.5">
                {cancelledCount > 0
                  ? cancelledCount === 1
                    ? t('home.savedSubsCountSingle')
                    : t('home.savedSubsCount', { count: cancelledCount })
                  : t('home.savedZeroDesc')}
              </p>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={(event) => {
                onCelebrate({ x: event.clientX, y: event.clientY });
                playSuccessFanfare();
              }}
              aria-label={t('home.celebrateSavings')}
              className="w-14 h-14 rounded-full bg-[#1F1F1F] border border-[#D4AF7C]/40 flex items-center justify-center shrink-0 shadow-lg cursor-pointer"
            >
              <Trophy className="w-7 h-7 text-[#D4AF7C] fill-[#D4AF7C]/30 animate-trophy" />
            </motion.button>
          </div>

          {cancelledCount > 0 && (
            <div className="relative z-10 pt-3 border-t border-white/[0.07] flex items-center justify-between text-xs text-[#F5F5F5] font-medium">
              <span className="flex items-center gap-1 text-[#A0A0A0]">
                <TrendingUp className="w-3.5 h-3.5 text-[#D4AF7C]" />
                {t('home.annualizedSavings')}:
              </span>
              <span className="font-bold text-[#D4AF7C] font-mono tabular-nums">
                +{formatPrice(annualSavings, currencySymbol)} {t('home.savedAnnualEst')}
              </span>
            </div>
          )}

          {/* Achievements Row */}
          <div className="pt-2 border-t border-white/[0.07] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A0A0A0]">
                {t('home.achievements')}
              </span>
              <span className="text-[10px] font-semibold text-[#D4AF7C]">
                {t('home.achievementsUnlocked', {
                  unlocked: unlockedAchievementIds.length,
                  total: ACHIEVEMENTS.length,
                })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ACHIEVEMENTS.map((achievement, index) => {
                const isUnlocked = unlockedAchievementIds.includes(achievement.id);
                const isCelebrating = celebratingAchievementIds.includes(achievement.id);
                const AchievementIcon = [BadgeCheck, CircleDollarSign, Coins, Scissors, Medal][index];

                return (
                  <div
                    key={achievement.id}
                    className={`flex items-center gap-2 rounded-2xl border p-2.5 ${
                      isUnlocked
                        ? 'border-[#D4AF7C]/40 bg-[#D4AF7C]/15 text-[#D4AF7C]'
                        : 'border-white/[0.05] bg-[#1F1F1F] text-[#A0A0A0]/60'
                    } ${isCelebrating ? 'animate-achievement-unlock' : ''}`}
                    aria-label={`${t(achievement.titleKey)}${
                      isUnlocked ? `, ${t('home.achievementUnlocked')}` : `, ${t('home.achievementLocked')}`
                    }`}
                  >
                    <AchievementIcon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold leading-tight truncate">
                        {t(achievement.titleKey)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Smart Trial Reminder Notifications Mobile Card */}
        {activeSubs.length > 0 && (
          <div className="rounded-3xl bg-[#161616] border border-white/[0.08] p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-extrabold text-[#F5F5F5] uppercase tracking-wider">
                Smart Trial Alerts
              </h3>
              <span className="text-[10px] font-bold text-[#D4AF7C] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                10:00 AM Guard
              </span>
            </div>

            <div className="space-y-2.5">
              {activeSubs.slice(0, 2).map((sub, idx) => {
                const days = Math.max(1, getDaysUntilNextPayment(sub.nextPaymentDate));
                const displayName = sub.name.replace(' UK Standard', '').replace(' Premium UK', '').replace(' UK', '');

                return (
                  <div
                    key={sub.id}
                    onClick={() => onOpenSubscriptionDetail(sub)}
                    className="rounded-[20px] border border-white/[0.08] bg-[#1F1F1F]/80 p-3.5 space-y-2 cursor-pointer hover:border-[#D4AF7C]/30 active:scale-[0.99] transition-all duration-150 select-none shadow-sm"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="h-6 w-6 rounded-md bg-[#D4AF7C]/15 border border-[#D4AF7C]/25 flex items-center justify-center shrink-0 mt-0.5">
                        <GoldBellIcon size="xs" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#A0A0A0] uppercase tracking-wider">TrialMe</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF7C]/15 text-[#D4AF7C] border border-[#D4AF7C]/25">
                            {days}d left
                          </span>
                        </div>
                        <p className="text-xs text-[#F5F5F5] mt-1 font-semibold leading-snug">
                          {idx === 0
                            ? `${displayName} trial ends in ${days} days`
                            : `Upcoming: ${displayName} renewal`}
                        </p>
                        <p className="text-[11px] text-[#A0A0A0] mt-0.5 leading-snug">
                          {formatPrice(sub.price, sub.currency || currencySymbol)}/{sub.frequency === 'yearly' ? 'yr' : 'mo'} · 10:00 AM auto-alert active
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.05]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenCancelSub) onOpenCancelSub(sub);
                          else onOpenSubscriptionDetail(sub);
                        }}
                        className="btn-cancel-soft py-1 px-3 text-[11px] font-semibold rounded-full active:scale-[0.97] transition-all cursor-pointer"
                      >
                        Cancel Trial
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSubscriptionDetail(sub);
                        }}
                        className="btn-secondary-luxury py-1 px-3 text-[11px] font-bold text-[#D4AF7C] rounded-full active:scale-[0.97] transition-all cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
