import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { POPULAR_PRESETS, INITIAL_DEMO_SUBSCRIPTIONS, type PresetFilterGroup } from '../src/data/popularPresets';
import { AFFILIATE_OFFERS, getAffiliateOffer, getCheaperAlternative } from '../src/data/cheaperAlternatives';
import {
  calculateSmartTrialTiming,
  createSubscriptionReminderIcs,
  createGoogleCalendarReminderUrl,
  formatTrialCountdownBadge,
  getSubscriptionReminderDate,
} from '../src/utils/calendarReminder';
import {
  CURRENCIES,
  canAddSubscription,
  calculateMonthlyTotal,
  calculateAnnualTotal,
  calculateTotalSavings,
  convertFrequencyToMonthly,
  convertFrequencyToAnnual,
  filterAndSortSubscriptions,
  formatPrice,
} from '../src/utils/subscriptionCalculations';
import {
  isCurrentlyTrackedSubscription,
  isDuplicateSubscription,
  isDuplicateScannedSubscription,
  normalizeScannedSubscriptionName,
} from '../src/utils/subscriptionIdentity';
import { ACHIEVEMENTS, getUnlockedAchievementIds } from '../src/utils/achievements';
import {
  CURATED_UK_TRIALS,
  createBackupJson,
  generateLicenseKey,
  getAiScannerMonthlyQuota,
  getUkPriceHikeAlert,
  incrementAiScannerMonthlyQuota,
  parseRestoredLicensePlan,
} from '../src/utils/retentionAndTrust';
import { SUPPORTED_LANGUAGES, TRANSLATIONS } from '../src/i18n/translations';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { Onboarding } from '../src/components/Onboarding';
import { HomeScreen } from '../src/components/HomeScreen';
import { AddSubscriptionModal } from '../src/components/AddSubscriptionModal';
import { SubscriptionDetailModal } from '../src/components/SubscriptionDetailModal';
import { CancelAssistantModal } from '../src/components/CancelAssistantModal';
import { PaywallModal } from '../src/components/PaywallModal';
import { AiStatementScannerModal } from '../src/components/AiStatementScannerModal';
import { SettingsScreen } from '../src/components/SettingsScreen';
import type { Subscription } from '../src/types/subscription';

const noop = () => {};

describe('SubCleaner A-to-Z End-to-End (E2E) QA Simulation Suite', () => {
  // =========================================================================
  // FLOW A: Onboarding, Empty State & UK Free Trial Radar
  // =========================================================================
  describe('Flow A: Onboarding & Empty State', () => {
    it('renders Onboarding cleanly with trial protection CTA and zero undefined keys', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(Onboarding, { onComplete: noop, onStartTrial: noop })
        )
      );
      assert.ok(html.includes('Free trials, without the surprise bill'));
      assert.ok(html.includes('Add my first free trial'));
      assert.ok(!html.includes('undefined'));
    });

    it('renders HomeScreen empty state cleanly and displays UK Free Trial Radar', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(HomeScreen, {
            subscriptions: [],
            userPlan: 'free',
            currencySymbol: '£',
            onOpenAddModal: noop,
            onOpenSubscriptionDetail: noop,
            onOpenPaywall: noop,
            onCelebrate: noop,
            onClearCancelled: noop,
          })
        )
      );
      assert.ok(html.includes('Your first free trial, safely tracked'));
      assert.ok(html.includes('Browse free trials'));
      assert.ok(html.includes('UK Free Trial Radar'));
      assert.ok(!html.includes('undefined'));
    });

    it('validates all Curated UK Free Trial Radar items have valid £ pricing, trialDays, and https URLs', () => {
      assert.ok(CURATED_UK_TRIALS.length >= 4);
      for (const deal of CURATED_UK_TRIALS) {
        assert.equal(deal.currency, '£');
        assert.ok(deal.postTrialPrice > 0);
        assert.ok([7, 14, 30].includes(deal.trialDays));
        assert.ok(deal.trialUrl.startsWith('https://'));
        assert.ok(deal.cancelUrl.startsWith('https://'));
      }
    });
  });

  // =========================================================================
  // FLOW B: 49 UK Presets & Search Integrity
  // =========================================================================
  describe('Flow B: 49 UK Presets & Search Integrity', () => {
    it('verifies all 49 presets have valid GBP (£) price, category, defaultTrialDays (7/14/30), and https:// cancelUrl', () => {
      assert.equal(POPULAR_PRESETS.length, 49);
      const seenIds = new Set<string>();

      for (const preset of POPULAR_PRESETS) {
        assert.ok(!seenIds.has(preset.id), `Duplicate preset id: ${preset.id}`);
        seenIds.add(preset.id);

        assert.equal(preset.currency, '£', `${preset.name} must use GBP (£)`);
        assert.ok(preset.price > 0 && Number.isFinite(preset.price), `${preset.name} must have valid price`);
        assert.ok(preset.category && preset.category.trim().length > 0, `${preset.name} must have non-empty category`);
        assert.ok(
          [7, 14, 30].includes(preset.defaultTrialDays),
          `${preset.name} must have defaultTrialDays in [7, 14, 30], got ${preset.defaultTrialDays}`
        );
        assert.ok(
          preset.cancelUrl.startsWith('https://'),
          `${preset.name} must have https:// cancelUrl, got ${preset.cancelUrl}`
        );
        assert.ok(
          Array.isArray(preset.cancelSteps) && preset.cancelSteps.length >= 2,
          `${preset.name} must have step-by-step cancellation instructions`
        );
      }
    });

    it('verifies all cheaperAlternatives & affiliate offers have valid GBP (£) pricing and https:// URLs', () => {
      for (const offer of AFFILIATE_OFFERS) {
        assert.ok(offer.trialUrl.startsWith('https://'));
        assert.ok([7, 14, 30].includes(offer.trialDays));
        if (offer.annualUrl) {
          assert.ok(offer.annualUrl.startsWith('https://'));
        }
      }

      // Check cheaper alternatives resolution across sample expensive subscriptions
      const expensiveStreaming: Subscription = {
        ...INITIAL_DEMO_SUBSCRIPTIONS[0],
        name: 'Sky Stream & TV',
        price: 34.0,
        category: 'Streaming',
      };
      const alt = getCheaperAlternative(expensiveStreaming, [expensiveStreaming]);
      assert.ok(alt !== null);
      assert.equal(alt.currency, '£');
      assert.ok(alt.monthlyPrice < 34.0);
      assert.ok(alt.monthlySaving > 0);
      assert.ok(alt.url.startsWith('https://'));
    });

    it('verifies fuzzy search by keyword ("gym", "music", "tv", "prime", "credit", "coffee") and category filter pills', () => {
      const searchPresets = (query: string, group: PresetFilterGroup = 'All') => {
        const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return POPULAR_PRESETS.filter((preset) => {
          if (group !== 'All' && preset.filterGroup !== group) return false;
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
          return tokens.every((t) => haystack.includes(t));
        });
      };

      assert.ok(searchPresets('gym').length >= 8, 'Expected at least 8 gym/fitness matches');
      assert.ok(searchPresets('music').length >= 2, 'Expected music matches (Spotify, YouTube, Audible)');
      assert.ok(searchPresets('tv').length >= 6, 'Expected TV/streaming matches');
      assert.ok(searchPresets('prime').some((p) => p.id === 'amazon-prime'));
      assert.ok(searchPresets('credit').length >= 4, 'Expected UK credit agencies & finance matches');
      assert.ok(searchPresets('coffee').some((p) => p.id === 'pret-coffee'));

      // Category pills
      const groups: Exclude<PresetFilterGroup, 'All'>[] = [
        'Streaming',
        'Gyms',
        'Tech & AI',
        'Food & Delivery',
        'Finance',
      ];
      let sumByGroup = 0;
      for (const g of groups) {
        const groupMatches = searchPresets('', g);
        assert.ok(groupMatches.length >= 5, `Group ${g} should have at least 5 presets`);
        sumByGroup += groupMatches.length;
      }
      assert.equal(sumByGroup, POPULAR_PRESETS.length, 'All 49 presets must belong to one of the 5 filter groups');
    });
  });

  // =========================================================================
  // FLOW C: Smart Trial Timing & Dual Calendar Sync
  // =========================================================================
  describe('Flow C: Smart Trial Timing & Dual Calendar Sync', () => {
    it('calculates exact expiry timestamps and 10:00 AM daytime alarms for 7-day, 14-day, 30-day, and <5-day trials', () => {
      const start = new Date('2026-10-24T14:30:00.000Z');

      // 7-day trial -> 48h safety lead time (2 days before) at 10:00 AM local time
      const t7 = calculateSmartTrialTiming(7, start);
      assert.equal(t7.trialEndDate, '2026-10-31');
      assert.equal(t7.leadHours, 48);
      assert.equal(t7.reminderDaysBefore, 2);
      assert.equal(new Date(t7.alarmArmedAt).getHours(), 10);
      assert.equal(new Date(t7.urgentAlarmAt).getHours(), 10);

      // 14-day trial -> 72h safety lead time (3 days before) at 10:00 AM local time
      const t14 = calculateSmartTrialTiming(14, start);
      assert.equal(t14.trialEndDate, '2026-11-07');
      assert.equal(t14.leadHours, 72);
      assert.equal(t14.reminderDaysBefore, 3);
      assert.equal(new Date(t14.alarmArmedAt).getHours(), 10);

      // 30-day trial -> 72h safety lead time (3 days before) at 10:00 AM local time
      const t30 = calculateSmartTrialTiming(30, start);
      assert.equal(t30.trialEndDate, '2026-11-23');
      assert.equal(t30.leadHours, 72);
      assert.equal(t30.reminderDaysBefore, 3);
      assert.equal(new Date(t30.alarmArmedAt).getHours(), 10);

      // Short 3-day trial (<5 days) -> 24h safety lead time (1 day before)
      const t3 = calculateSmartTrialTiming(3, start);
      assert.equal(t3.leadHours, 24);
      assert.equal(t3.reminderDaysBefore, 1);
    });

    it('generates valid .ics calendar files with dual VALARM blocks and zero undefined values', () => {
      const start = new Date('2026-10-24T14:30:00.000Z');
      const timing = calculateSmartTrialTiming(7, start);
      const trialSub: Subscription = {
        id: 'sub-apple-tv-7d',
        name: 'Apple TV+ UK',
        price: 8.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: timing.trialEndDate,
        status: 'trial',
        trialEndDate: timing.trialEndDate,
        trialStartAt: timing.trialStartAt,
        trialExpiresAt: timing.trialExpiresAt,
        trialDurationDays: 7,
        alarmArmedAt: timing.alarmArmedAt,
        color: '#A5A5A5',
        cancelUrl: 'https://support.apple.com/en-gb/118428',
        reminderDaysBefore: timing.reminderDaysBefore,
        paymentHistory: [],
        createdAt: '2026-10-24',
      };

      const ics = createSubscriptionReminderIcs(
        trialSub,
        timing.trialEndDate,
        timing.reminderDaysBefore,
        'SubCleaner reminder: Apple TV+ UK',
        'Payment or trial end date for Apple TV+ UK.',
        'Your payment or trial for Apple TV+ UK is due in 2 days.',
        start
      );

      assert.ok(ics.includes('BEGIN:VCALENDAR'));
      assert.ok(ics.includes('BEGIN:VEVENT'));
      assert.ok(ics.includes('TRIGGER:-P2D'));
      assert.ok(ics.includes('TRIGGER:-P1D'));
      assert.ok(ics.includes('ACTION:DISPLAY'));
      assert.ok(ics.includes('ACTION:AUDIO'));
      assert.ok(ics.includes('URL:https://support.apple.com/en-gb/118428'));
      assert.ok(ics.includes('£8.99/monthly'));
      assert.ok(!ics.includes('undefined'));
      assert.ok(!ics.includes('NaN'));

      // Verify live countdown badge formatting
      const badge = formatTrialCountdownBadge(trialSub, new Date('2026-10-25T00:00:00.000Z'));
      assert.ok(badge && badge.startsWith('Trial ends in 6d 14h — Alarm armed for'));
    });

    it('generates valid 1-Tap Google Calendar URLs with pre-filled parameters and zero undefined values', () => {
      const start = new Date('2026-10-24T14:30:00.000Z');
      const timing = calculateSmartTrialTiming(30, start);
      const primeSub: Subscription = {
        id: 'sub-prime-30d',
        name: 'Amazon Prime UK',
        price: 8.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: timing.trialEndDate,
        status: 'trial',
        trialEndDate: timing.trialEndDate,
        trialStartAt: timing.trialStartAt,
        trialExpiresAt: timing.trialExpiresAt,
        trialDurationDays: 30,
        alarmArmedAt: timing.alarmArmedAt,
        color: '#FF9900',
        cancelUrl: 'https://www.amazon.co.uk/mc/manage',
        reminderDaysBefore: timing.reminderDaysBefore,
        paymentHistory: [],
        createdAt: '2026-10-24',
      };

      const gcalUrl = createGoogleCalendarReminderUrl(
        primeSub,
        timing.trialEndDate,
        timing.reminderDaysBefore
      );
      assert.ok(gcalUrl.startsWith('https://calendar.google.com/calendar/render?'));
      assert.ok(gcalUrl.includes('action=TEMPLATE'));
      assert.ok(gcalUrl.includes('Amazon+Prime+UK'));
      assert.ok(gcalUrl.includes('amazon.co.uk'));
      assert.ok(!gcalUrl.includes('undefined'));
      assert.ok(!gcalUrl.includes('NaN'));
    });
  });

  // =========================================================================
  // FLOW D: Free Tier Limit & Paywall Gating
  // =========================================================================
  describe('Flow D: Free Tier Limit & Paywall Gating', () => {
    it('enforces the 2-subscription Free Tier limit and allows unlimited on Standard & Pro', () => {
      assert.equal(canAddSubscription(0, 'free').allowed, true);
      assert.equal(canAddSubscription(1, 'free').allowed, true);
      assert.equal(canAddSubscription(2, 'free').allowed, false);
      assert.equal(canAddSubscription(2, 'standard').allowed, true);
      assert.equal(canAddSubscription(50, 'pro').allowed, true);
    });

    it('renders PaywallModal with 100% consistent GBP (£14.99 Pro / £9.99 Standard / £29.99 Anchor) and gates AI Scanner on Free tier', () => {
      const paywallHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(PaywallModal, {
            isOpen: true,
            onClose: noop,
            onSelectPlan: noop,
            currencySymbol: '£',
          })
        )
      );
      assert.ok(paywallHtml.includes('£14.99'));
      assert.ok(paywallHtml.includes('£9.99'));
      assert.ok(paywallHtml.includes('£29.99'));
      assert.ok(paywallHtml.includes('Unlock Lifetime Pro (£14.99)'));
      assert.ok(!paywallHtml.includes('undefined'));

      // AI Scanner gated view on Free tier
      const gatedScannerHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(AiStatementScannerModal, {
            isOpen: true,
            onClose: noop,
            onImportSubscriptions: noop,
            userPlan: 'free',
            currencySymbol: '£',
            onOpenPaywall: noop,
          })
        )
      );
      assert.ok(gatedScannerHtml.includes('Exclusive Lifetime Pro Feature'));
      assert.ok(gatedScannerHtml.includes('Unlock Lifetime Pro (£14.99)'));
    });

    it('verifies License Key generation, restoration via key or email, and JSON backup creation', () => {
      const proKey = generateLicenseKey('pro');
      assert.ok(proKey.startsWith('SUB-PRO-'));

      const restoredFromKey = parseRestoredLicensePlan('sub-pro-abcd-1234');
      assert.ok(restoredFromKey);
      assert.equal(restoredFromKey.plan, 'pro');

      const restoredStd = parseRestoredLicensePlan('SUB-STD-9999-8888');
      assert.ok(restoredStd);
      assert.equal(restoredStd.plan, 'standard');

      const restoredFromEmail = parseRestoredLicensePlan('saver@london.co.uk');
      assert.ok(restoredFromEmail);
      assert.equal(restoredFromEmail.plan, 'pro');

      assert.equal(parseRestoredLicensePlan('invalid-random-text'), null);

      const backupJson = createBackupJson(INITIAL_DEMO_SUBSCRIPTIONS, 'pro');
      const parsedBackup = JSON.parse(backupJson);
      assert.equal(parsedBackup.userPlan, 'pro');
      assert.equal(parsedBackup.subscriptions.length, 2);
    });
  });

  // =========================================================================
  // FLOW E: AI Statement Scanner & Deduplication
  // =========================================================================
  describe('Flow E: AI Statement Scanner & Deduplication', () => {
    it('normalizes UK bank statement merchant suffixes and blocks duplicates against active/trial items while preserving cancelled history', () => {
      assert.equal(normalizeScannedSubscriptionName('Netflix UK Standard'), 'netflix');
      assert.equal(normalizeScannedSubscriptionName('Netflix.com London'), 'netflix');
      assert.equal(normalizeScannedSubscriptionName('Amazon Prime Membership'), 'amazon prime');
      assert.equal(normalizeScannedSubscriptionName('Amazon Prime Video UK'), 'amazon prime');
      assert.equal(normalizeScannedSubscriptionName('Spotify Ltd Recurring'), 'spotify');
      assert.equal(normalizeScannedSubscriptionName('Sky UK Subscription'), 'sky');

      const activeNetflix: Subscription = {
        ...INITIAL_DEMO_SUBSCRIPTIONS[0],
        name: 'Netflix UK Standard',
        status: 'active',
      };
      const cancelledNetflix: Subscription = {
        ...INITIAL_DEMO_SUBSCRIPTIONS[0],
        name: 'Netflix UK Standard',
        status: 'cancelled',
      };

      // Blocks duplicate against active subscription
      assert.equal(
        isDuplicateScannedSubscription({ name: 'Netflix UK' }, activeNetflix),
        true
      );
      assert.equal(
        isDuplicateScannedSubscription({ name: 'Netflix.com London' }, activeNetflix),
        true
      );

      // Allows re-importing if the existing record was cancelled
      assert.equal(
        isDuplicateScannedSubscription({ name: 'Netflix UK' }, cancelledNetflix),
        false
      );
      assert.equal(isCurrentlyTrackedSubscription(activeNetflix), true);
      assert.equal(isCurrentlyTrackedSubscription(cancelledNetflix), false);
      assert.equal(isDuplicateSubscription(activeNetflix, activeNetflix), true);
      assert.equal(isDuplicateSubscription(activeNetflix, cancelledNetflix), false);
    });

    it('tracks AI Statement Scanner monthly fair-use quota accurately', () => {
      const testDate = new Date('2029-05-15T12:00:00Z');
      const initialQuota = getAiScannerMonthlyQuota(testDate);
      assert.equal(initialQuota.limit, 10);
      assert.equal(initialQuota.used, 0);
      assert.equal(initialQuota.remaining, 10);

      const afterOne = incrementAiScannerMonthlyQuota(testDate);
      assert.equal(afterOne.used, 1);
      assert.equal(afterOne.remaining, 9);
    });
  });

  // =========================================================================
  // FLOW F: Annual Savings Tip, Cancellation & Achievements
  // =========================================================================
  describe('Flow F: Annual Savings Tip, Cancellation & Achievements', () => {
    it('calculates Annual Plan switch savings accurately and updates subscription to yearly', () => {
      const nordMonthly: Subscription = {
        id: 'sub-nord',
        name: 'NordVPN UK',
        price: 10.99,
        currency: '£',
        frequency: 'monthly',
        category: 'AI & Tech',
        nextPaymentDate: '2026-11-15',
        status: 'active',
        color: '#4687FF',
        reminderDaysBefore: 3,
        paymentHistory: [],
        createdAt: '2026-10-24',
      };

      const offer = getAffiliateOffer(nordMonthly.name);
      assert.ok(offer && offer.annualUrl && offer.annualDiscountRate === 0.2);

      const annualPlanPrice = Number((nordMonthly.price * 12 * (1 - offer.annualDiscountRate)).toFixed(2));
      const annualSaving = Number((nordMonthly.price * 12 * offer.annualDiscountRate).toFixed(2));
      assert.equal(annualPlanPrice, 105.5);
      assert.equal(annualSaving, 26.38);

      const switchedSub: Subscription = {
        ...nordMonthly,
        frequency: 'yearly',
        price: annualPlanPrice,
      };
      assert.equal(convertFrequencyToAnnual(switchedSub.price, switchedSub.frequency), 105.5);
      assert.equal(Number(convertFrequencyToMonthly(switchedSub.price, switchedSub.frequency).toFixed(2)), 8.79);
      assert.ok(calculateMonthlyTotal([switchedSub]) > 0);
      assert.equal(calculateAnnualTotal([switchedSub]), 105.5);
      assert.equal(formatPrice(14.99, CURRENCIES.GBP.symbol), '£14.99');
      assert.equal(getSubscriptionReminderDate(switchedSub), '2026-11-15');
      assert.equal(filterAndSortSubscriptions([switchedSub], { search: 'nord' }).length, 1);
      assert.ok(getUkPriceHikeAlert('Netflix UK Standard') !== null);
    });

    it('calculates monthly savings trophy total and unlocks all 5 Achievement badges at exact thresholds', () => {
      assert.deepEqual(getUnlockedAchievementIds([]), []);

      // 1 cancelled subscription (£20/mo) -> unlocks 'first-cancellation'
      const sub1: Subscription = {
        ...INITIAL_DEMO_SUBSCRIPTIONS[0],
        id: 'c1',
        price: 20,
        status: 'cancelled',
        monthlySavingsAmount: 20,
      };
      assert.deepEqual(getUnlockedAchievementIds([sub1]), ['first-cancellation']);

      // 2 cancelled subscriptions totalling £55/mo -> unlocks 'first-cancellation' + 'saved-50'
      const sub2: Subscription = {
        ...sub1,
        id: 'c2',
        price: 35,
        monthlySavingsAmount: 35,
      };
      assert.deepEqual(getUnlockedAchievementIds([sub1, sub2]), ['first-cancellation', 'saved-50']);

      // 5 cancelled subscriptions totalling £110/mo -> unlocks 'first-cancellation', 'saved-50', 'saved-100', 'cancelled-5'
      const fiveCancelled: Subscription[] = [1, 2, 3, 4, 5].map((i) => ({
        ...sub1,
        id: `c-${i}`,
        price: 22,
        monthlySavingsAmount: 22,
      }));
      assert.equal(calculateTotalSavings(fiveCancelled), 110);
      assert.deepEqual(getUnlockedAchievementIds(fiveCancelled), [
        'first-cancellation',
        'saved-50',
        'saved-100',
        'cancelled-5',
      ]);

      // 10 cancelled subscriptions -> unlocks all 5 including 'subscription-slayer'
      const tenCancelled: Subscription[] = Array.from({ length: 10 }, (_, i) => ({
        ...sub1,
        id: `c10-${i}`,
        price: 15,
        monthlySavingsAmount: 15,
      }));
      assert.equal(getUnlockedAchievementIds(tenCancelled).length, ACHIEVEMENTS.length);
    });

    it('renders all modals and screens across all 6 supported languages without missing keys or crashes', () => {
      const sampleSub = INITIAL_DEMO_SUBSCRIPTIONS[0];
      for (const lang of SUPPORTED_LANGUAGES) {
        const dict = TRANSLATIONS[lang.code];
        assert.ok(dict, `Missing dictionary for ${lang.code}`);
        assert.ok(dict['app.name']);
        assert.ok(dict['paywall.title']);
        assert.ok(dict['cancel.confirmCancellation']);
      }

      const detailHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(SubscriptionDetailModal, {
            isOpen: true,
            onClose: noop,
            subscription: sampleSub,
            onUpdateSubscription: noop,
            onDeleteSubscription: noop,
            onOpenCancelAssistant: noop,
            currencySymbol: '£',
          })
        )
      );
      assert.ok(detailHtml.includes('1-Tap Google Calendar'));
      assert.ok(detailHtml.includes('UK Price Hike (+£2/mo)'));

      const cancelHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(CancelAssistantModal, {
            isOpen: true,
            onClose: noop,
            subscription: sampleSub,
            subscriptions: INITIAL_DEMO_SUBSCRIPTIONS,
            onConfirmCancellation: noop,
            currencySymbol: '£',
            onCelebrate: noop,
          })
        )
      );
      assert.ok(cancelHtml.includes('Confirm Cancellation'));
      assert.ok(cancelHtml.includes('£10.99'));

      const addHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(AddSubscriptionModal, {
            isOpen: true,
            onClose: noop,
            onAddSubscription: () => 'sub-1',
            currentSubscriptionCount: 1,
            userPlan: 'free',
            currencySymbol: '£',
            onOpenPaywall: noop,
            onOpenAiScanner: noop,
            onTrialTracked: noop,
          })
        )
      );
      assert.ok(addHtml.includes('Search 45+ UK presets'));

      const settingsHtml = renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(SettingsScreen, {
            userPlan: 'pro',
            currentCurrency: 'GBP',
            onChangeCurrency: noop,
            isDarkMode: true,
            onToggleDarkMode: noop,
            notificationsEnabled: true,
            onToggleNotifications: noop,
            soundEffectsEnabled: true,
            onToggleSoundEffects: noop,
            onOpenPaywall: noop,
            subscriptions: INITIAL_DEMO_SUBSCRIPTIONS,
            onResetData: noop,
            onTriggerTestNotification: noop,
          })
        )
      );
      assert.ok(settingsHtml.includes('Device Backup &amp; Restore (.json)'));
      assert.ok(settingsHtml.includes('License Key:'));
    });
  });
});
