import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Subscription, UserPlan } from '../types/subscription';
import {
  calculateAnnualTotal,
  calculateMonthlyTotal,
  calculateRenewalForecast,
  calculateTotalSavings,
  convertFrequencyToMonthly,
  filterAndSortSubscriptions,
  formatPrice,
  roundCurrency,
} from '../utils/subscriptionCalculations';
import { isDuplicateSubscription } from '../utils/subscriptionIdentity';
import { CURATED_UK_TRIALS, type CuratedUkTrial } from '../utils/retentionAndTrust';
import { POPULAR_PRESETS, hasActiveUkFreeTrial, type PopularPreset } from '../data/popularPresets';
import { BrandIcon } from './BrandIcon';
import { useTranslation } from '../i18n/LanguageContext';
import { playAchievementChime, playSubtlePop } from '../utils/soundEffects';
import { getUnlockedAchievementIds } from '../utils/achievements';
import type { ConfettiOrigin } from './ConfettiExplosion';
import { TopBar } from './monetry/TopBar';
import { CalendarDrawer } from './monetry/CalendarDrawer';
import { OffersDrawer } from './monetry/OffersDrawer';
import { UpcomingBanner } from './monetry/UpcomingBanner';
import { HeroCard } from './monetry/HeroCard';
import { TrialsSection } from './monetry/TrialsSection';
import { SubPreviewList } from './monetry/SubPreviewList';
import { SubRow } from './monetry/SubRow';
import { AlertsCard } from './monetry/AlertsCard';
import { RadarCard } from './monetry/RadarCard';
import { SavingsCard } from './monetry/SavingsCard';

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
  bonusSlots?: number;
  onOpenGiftSlot?: () => void;
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
  onClearCancelled,
  onStartRadarTrial,
  onQuickAddPreset,
  activeSection = 'dashboard',
  bonusSlots = 0,
  onOpenGiftSlot,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'trial' | 'cancelled' | 'renewingSoon'
  >('all');
  const [isConfirmingClearCancelled, setIsConfirmingClearCancelled] = useState(false);
  const [showCalendarDrawer, setShowCalendarDrawer] = useState(false);
  const [offersDrawerState, setOffersDrawerState] = useState<{
    open: boolean;
    mode: 'radar' | 'alternatives';
  }>({ open: false, mode: 'radar' });
  const [localSection, setLocalSection] = useState<'dashboard' | 'subscriptions'>(
    activeSection === 'subscriptions' ? 'subscriptions' : 'dashboard'
  );

  useEffect(() => {
    setLocalSection(activeSection === 'subscriptions' ? 'subscriptions' : 'dashboard');
  }, [activeSection]);

  const monthlyTotal = calculateMonthlyTotal(subscriptions);
  const annualTotal = calculateAnnualTotal(subscriptions);
  const totalSavings = calculateTotalSavings(subscriptions);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthSavings = roundCurrency(
    subscriptions
      .filter(
        (subscription) =>
          subscription.status === 'cancelled' &&
          subscription.cancelledAt?.slice(0, 7) === currentMonth
      )
      .reduce((sum, subscription) => {
        const amt =
          subscription.monthlySavingsAmount ??
          convertFrequencyToMonthly(subscription.price, subscription.frequency);
        return sum + (Number.isFinite(amt) ? amt : 0);
      }, 0)
  );

  const activeSubs = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active' || s.status === 'trial')
        .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate)),
    [subscriptions]
  );

  const activeOnlyCount = subscriptions.filter((s) => s.status === 'active').length;
  const activeCount = activeSubs.length;
  const trialSubs = subscriptions.filter((s) => s.status === 'trial');
  const trialCount = trialSubs.length;
  const cancelledCount = subscriptions.filter((s) => s.status === 'cancelled').length;
  const unlockedAchievementIds = getUnlockedAchievementIds(subscriptions);
  const previousSavings = useRef(totalSavings);

  useEffect(() => {
    previousSavings.current = totalSavings;
  }, [totalSavings]);

  useEffect(() => {
    let previouslyUnlocked: string[] = [];
    try {
      const saved = localStorage.getItem('subcleaner_achievements_unlocked');
      previouslyUnlocked = saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      previouslyUnlocked = [];
    }

    const newlyUnlocked = unlockedAchievementIds.filter(
      (id) => !previouslyUnlocked.includes(id)
    );
    try {
      localStorage.setItem(
        'subcleaner_achievements_unlocked',
        JSON.stringify([...new Set([...previouslyUnlocked, ...unlockedAchievementIds])])
      );
    } catch {
      // Storage unavailable fallback
    }

    if (newlyUnlocked.length > 0) {
      playAchievementChime();
    }
  }, [subscriptions, unlockedAchievementIds]);

  const filteredSubs = useMemo(
    () =>
      filterAndSortSubscriptions(subscriptions, {
        search: searchQuery,
        statusFilter: activeSection === 'trials' ? 'trial' : statusFilter,
        sortBy: 'renewal',
      }),
    [subscriptions, searchQuery, activeSection, statusFilter]
  );

  const matchingPresets = useMemo(
    () =>
      searchQuery.trim()
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
        : [],
    [searchQuery]
  );

  const renewalForecast = useMemo(
    () => calculateRenewalForecast(subscriptions, 6),
    [subscriptions]
  );

  const handleStartCuratedTrial = (deal: CuratedUkTrial) => {
    if (onStartRadarTrial) {
      onStartRadarTrial(deal);
    } else {
      onOpenAddModal();
    }
  };

  return (
    <div className="min-h-full bg-[#0A0A0A]">
      {/* Sticky Base44 TopBar */}
      <TopBar
        calendarOpen={showCalendarDrawer}
        onToggleCalendar={() => setShowCalendarDrawer((v) => !v)}
        onOpenFilters={() => setShowSearchBar((v) => !v)}
        onOpenAdd={() => {
          playSubtlePop();
          onOpenAddModal();
        }}
      />

      {/* Slide-down Base44 Renewal Calendar Drawer */}
      <CalendarDrawer
        open={showCalendarDrawer}
        subscriptions={subscriptions}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onSelect={onOpenSubscriptionDetail}
        onClose={() => setShowCalendarDrawer(false)}
      />

      {/* Main Content Feed */}
      <div className="space-y-4 px-4 pt-3 pb-24">
        {/* Search & Filter Drawer (when toggled or in Subscriptions view) */}
        {(showSearchBar ||
          searchQuery ||
          statusFilter !== 'all' ||
          localSection === 'subscriptions') && (
          <div className="specular p-3.5 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-white/45 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('home.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-luxury min-h-[40px] w-full rounded-full pl-9 pr-8 py-1.5 text-xs"
                aria-label={t('home.searchLabel')}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/45 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] no-scrollbar">
              {(['all', 'active', 'trial', 'renewingSoon', 'cancelled'] as const).map(
                (filterKey) => {
                  const isSelected = statusFilter === filterKey;
                  const labels: Record<typeof filterKey, string> = {
                    all: `${t('home.filterAll')} (${activeCount})`,
                    active: `${t('home.filterActive')} (${activeOnlyCount})`,
                    trial: `Free Trials (${trialCount})`,
                    renewingSoon: t('home.filterDueSoon'),
                    cancelled: `${t('home.filterCancelled')} (${cancelledCount})`,
                  };
                  return (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setStatusFilter(filterKey)}
                      className={`px-3 py-1.5 rounded-full font-semibold shrink-0 transition cursor-pointer ${
                        isSelected
                          ? 'btn-gold'
                          : 'border border-white/10 bg-white/[0.03] text-white/60 hover:text-white'
                      }`}
                    >
                      {labels[filterKey]}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {localSection === 'subscriptions' ? (
          /* Dedicated Subscriptions View (Base44 subscriptions.jsx layout) */
          <section className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow">All Recurring Plans</p>
                <h1 className="font-heading text-[20px] font-bold tracking-tight text-white">
                  Subscriptions
                </h1>
              </div>
              <span className="chip-gold rounded-full px-3 py-1 font-mono text-[11.5px] font-semibold tabular-nums">
                {formatPrice(monthlyTotal, currencySymbol)}/mo
              </span>
            </div>

            {statusFilter === 'cancelled' && cancelledCount > 0 && (
              <div className="flex justify-end">
                {isConfirmingClearCancelled ? (
                  <div className="flex items-center gap-2 rounded-full border border-rose-400/25 bg-[#131315] px-3 py-1 text-[10.5px]">
                    <span className="text-white/60">{t('home.confirmClearCancelled')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearCancelled();
                        setIsConfirmingClearCancelled(false);
                      }}
                      className="font-bold text-rose-300 transition hover:text-white"
                    >
                      {t('home.clearCancelledConfirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingClearCancelled(false)}
                      className="rounded-full p-0.5 text-white/45 hover:text-white"
                      aria-label={t('home.cancelClearCancelled')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClearCancelled(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-medium text-white/65 transition hover:border-[#D4AF7C]/35 hover:text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('home.clearCancelled')}
                  </button>
                )}
              </div>
            )}

            {filteredSubs.length > 0 ? (
              <div className="specular divide-y divide-white/[0.05] p-1.5">
                {filteredSubs.map((sub) => (
                  <SubRow
                    key={sub.id}
                    sub={sub}
                    currencySymbol={currencySymbol}
                    formatPrice={formatPrice}
                    onSelect={onOpenSubscriptionDetail}
                  />
                ))}
              </div>
            ) : (
              <div className="specular p-6 text-center space-y-2.5">
                <p className="text-[13.5px] font-semibold text-white">
                  {subscriptions.length === 0 && !searchQuery
                    ? t('home.emptyTrialTitle')
                    : t('home.noSubsFound')}
                </p>
                <p className="text-[11.5px] text-white/50">
                  {subscriptions.length === 0 && !searchQuery
                    ? t('home.emptyTrialDesc')
                    : searchQuery
                      ? t('home.noSubsFoundDesc')
                      : t('home.noSubsStart')}
                </p>
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="btn-gold inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11.5px] font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {subscriptions.length === 0 && !searchQuery
                    ? t('home.emptyTrialCta')
                    : t('home.addPopularNow')}
                </button>
              </div>
            )}
          </section>
        ) : (
          /* Base44 Dashboard Feed (index.jsx layout) */
          <>
            {/* 1. Upcoming Banner */}
            <UpcomingBanner
              subscriptions={subscriptions}
              currencySymbol={currencySymbol}
              onSelect={onOpenSubscriptionDetail}
            />

            {/* 2. Hero Card with 6-Month Renewal Forecast */}
            <HeroCard
              monthlyTotal={monthlyTotal}
              annualTotal={annualTotal}
              trialCount={trialCount}
              forecastMonths={renewalForecast}
              currencySymbol={currencySymbol}
              formatPrice={formatPrice}
              userPlan={userPlan}
              freeSlotsUsed={activeCount}
              freeSlotsLimit={2 + bonusSlots}
              onOpenGiftSlot={onOpenGiftSlot || onOpenPaywall}
              onOpenPaywall={onOpenPaywall}
            />

            {/* 3. My Trials Section */}
            <TrialsSection
              trials={trialSubs}
              currencySymbol={currencySymbol}
              formatPrice={formatPrice}
              onSelect={onOpenSubscriptionDetail}
              onAddTrial={onOpenAddModal}
              onBrowseTrials={() =>
                setOffersDrawerState({ open: true, mode: 'radar' })
              }
              onLoadSampleTrials={onLoadShowcaseTrials}
            />

            {/* 4. All Subscriptions Preview List (or Filtered Search View) */}
            {searchQuery || statusFilter !== 'all' ? (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-[15px] font-semibold text-white">
                    {statusFilter === 'cancelled'
                      ? `Cancelled / Saved (${cancelledCount})`
                      : `Filtered Subscriptions (${filteredSubs.length})`}
                  </h2>
                  {statusFilter === 'cancelled' && cancelledCount > 0 && (
                    <button
                      type="button"
                      onClick={onClearCancelled}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-white/65 hover:text-white"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('home.clearCancelled')}
                    </button>
                  )}
                </div>
                {filteredSubs.length > 0 ? (
                  <div className="specular divide-y divide-white/[0.05] p-1.5">
                    {filteredSubs.map((sub) => (
                      <SubRow
                        key={sub.id}
                        sub={sub}
                        currencySymbol={currencySymbol}
                        formatPrice={formatPrice}
                        onSelect={onOpenSubscriptionDetail}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="specular p-4 text-center text-[12px] text-white/50">
                    {t('home.noSubsFound')}
                  </div>
                )}
              </section>
            ) : (
              <SubPreviewList
                subscriptions={subscriptions}
                currencySymbol={currencySymbol}
                formatPrice={formatPrice}
                onSelect={onOpenSubscriptionDetail}
                onViewAll={() => setLocalSection('subscriptions')}
                onAddFirst={onOpenAddModal}
              />
            )}

            {/* Matching UK Presets when searching */}
            {matchingPresets.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-[#D4AF7C] font-semibold px-1">
                  <span>
                    Quick-Add from UK Preset Directory ({matchingPresets.length})
                  </span>
                  <span className="text-[10px] text-white/45">1-Tap Setup</span>
                </div>
                <div className="space-y-2">
                  {matchingPresets.map((preset) => {
                    const isTracked = activeSubs.some((s) =>
                      isDuplicateSubscription({ name: preset.name }, s)
                    );
                    return (
                      <div
                        key={preset.id}
                        className="specular py-2.5 px-3.5 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <BrandIcon
                            name={preset.name}
                            category={preset.category}
                            color={preset.color}
                            size="preset"
                            linkContext="discovery"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[13px] text-white truncate">
                              {preset.name}
                            </div>
                            <div className="text-[11px] text-white/45 mt-0.5">
                              {formatPrice(preset.price, preset.currency)}/
                              {preset.frequency === 'yearly' ? 'yr' : 'mo'} ·{' '}
                              {preset.category}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasActiveUkFreeTrial(preset) && !isTracked && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onQuickAddPreset) {
                                  onQuickAddPreset(preset, true);
                                  setSearchQuery('');
                                } else {
                                  onOpenAddModal();
                                }
                              }}
                              className="chip-gold h-8 rounded-full px-2.5 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <span>Free Trial</span>
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
                            className={`h-8 px-3 rounded-full text-[11px] font-semibold flex items-center justify-center gap-1 ${
                              isTracked
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 cursor-default'
                                : 'btn-gold cursor-pointer'
                            }`}
                          >
                            {isTracked ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
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

            {/* 5. Smart Trial & Renewal Alerts Card */}
            <AlertsCard
              subscriptions={subscriptions}
              currencySymbol={currencySymbol}
              formatPrice={formatPrice}
              onSelect={onOpenSubscriptionDetail}
              onCancelSub={(sub) => {
                if (onOpenCancelSub) onOpenCancelSub(sub);
                else onOpenSubscriptionDetail(sub);
              }}
            />

            {/* 6. UK Free Trial Radar Card */}
            <RadarCard
              trials={CURATED_UK_TRIALS}
              onExplore={() =>
                setOffersDrawerState({ open: true, mode: 'radar' })
              }
              onSelectTrial={handleStartCuratedTrial}
            />

            {/* 7. Savings Trophy & Achievements Card */}
            <SavingsCard
              monthlySavings={totalSavings}
              thisMonthSavings={thisMonthSavings}
              cancelledCount={cancelledCount}
              unlockedAchievementIds={unlockedAchievementIds}
              currencySymbol={currencySymbol}
              formatPrice={formatPrice}
              onExploreAlternatives={() =>
                setOffersDrawerState({ open: true, mode: 'alternatives' })
              }
              t={t}
            />
          </>
        )}
      </div>

      {/* Offers Drawer (UK Free Trial Radar & Cheaper Alternatives) */}
      <OffersDrawer
        open={offersDrawerState.open}
        mode={offersDrawerState.mode}
        trials={CURATED_UK_TRIALS}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
        onStartTrial={handleStartCuratedTrial}
        onClose={() =>
          setOffersDrawerState((prev) => ({ ...prev, open: false }))
        }
      />
    </div>
  );
};
