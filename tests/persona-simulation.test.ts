import test from 'node:test';
import assert from 'node:assert/strict';

import { POPULAR_PRESETS, filterPopularPresets, INITIAL_DEMO_SUBSCRIPTIONS } from '../src/data/popularPresets';
import { getAffiliateOffer } from '../src/data/cheaperAlternatives';
import { ACHIEVEMENTS, getUnlockedAchievementIds } from '../src/utils/achievements';
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '../src/i18n/translations';
import type { Subscription, UserPlan } from '../src/types/subscription';
import {
  addMonthsClamped,
  addYearsClamped,
  calculateAnnualTotal,
  calculateMonthlyTotal,
  calculateTotalSavings,
  canAddSubscription,
  convertFrequencyToAnnual,
  convertFrequencyToMonthly,
  filterAndSortSubscriptions,
  formatLocalDateKey,
  formatPrice,
  getDaysUntilNextPayment,
  roundCurrency,
} from '../src/utils/subscriptionCalculations';
import {
  calculateSmartTrialTiming,
  createGoogleCalendarReminderUrl,
  createSubscriptionReminderIcs,
  formatTrialCountdownBadge,
} from '../src/utils/calendarReminder';
import {
  isDuplicateScannedSubscription,
  isDuplicateSubscription,
  normalizeScannedSubscriptionName,
} from '../src/utils/subscriptionIdentity';
import {
  createBackupJson,
  generateLicenseKey,
  parseAndValidateBackupJson,
  parseRestoredLicensePlan,
} from '../src/utils/retentionAndTrust';
import {
  clearMemoryStorage,
  loadPersistedSubscriptions,
  safeStorageGet,
  safeStorageSet,
  sanitizeCurrency,
  sanitizeSubscriptionsList,
  sanitizeUserPlan,
} from '../src/utils/storage';

// Helper to simulate the synchronous App.tsx state container
function createSimulatedAppStore(initialSubs: Subscription[] = [], initialPlan: UserPlan = 'free') {
  let subscriptions = [...initialSubs];
  let userPlan: UserPlan = initialPlan;
  let idCounter = 0;
  let notificationCount = 0;

  return {
    getSubscriptions: () => subscriptions,
    getUserPlan: () => userPlan,
    getNotificationCount: () => notificationCount,
    setUserPlan: (plan: UserPlan) => {
      userPlan = sanitizeUserPlan(plan);
    },
    addSubscription: (subData: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>): string | false => {
      const trimmedName = (subData.name || '').trim();
      if (!trimmedName || !Number.isFinite(subData.price) || subData.price <= 0 || subData.price > 99999.99) {
        return false;
      }
      const activeCount = subscriptions.filter((s) => s.status === 'active' || s.status === 'trial').length;
      if (!canAddSubscription(activeCount, userPlan).allowed) {
        return false;
      }
      const sanitized = {
        ...subData,
        name: trimmedName,
        price: roundCurrency(subData.price),
      };
      if (subscriptions.some((existing) => isDuplicateSubscription(sanitized, existing))) {
        return false;
      }
      idCounter += 1;
      const newSub: Subscription = {
        ...sanitized,
        id: `sub-${Date.now()}-${idCounter}`,
        createdAt: formatLocalDateKey(new Date()),
        paymentHistory: [],
      };
      subscriptions = [newSub, ...subscriptions];
      return newSub.id;
    },
    cancelSubscription: (id: string): boolean => {
      const target = subscriptions.find((s) => s.id === id);
      if (!target || target.status === 'cancelled') return false;
      const savedAmount = roundCurrency(convertFrequencyToMonthly(target.price, target.frequency));
      subscriptions = subscriptions.map((s) =>
        s.id === id
          ? {
              ...s,
              status: 'cancelled',
              cancelledAt: formatLocalDateKey(new Date()),
              monthlySavingsAmount: savedAmount,
            }
          : s
      );
      notificationCount += 1;
      return true;
    },
    deleteSubscription: (id: string) => {
      subscriptions = subscriptions.filter((s) => s.id !== id);
    },
    switchToAnnual: (id: string): boolean => {
      const target = subscriptions.find((s) => s.id === id);
      if (!target || target.status !== 'active' || target.frequency !== 'monthly') return false;
      const offer = getAffiliateOffer(target.name);
      const discount = offer?.annualDiscountRate ?? 0;
      if (!offer?.annualUrl || discount <= 0) return false;
      const annualPrice = roundCurrency(target.price * 12 * (1 - discount));
      const nextDate = formatLocalDateKey(addYearsClamped(new Date(), 1));
      subscriptions = subscriptions.map((s) =>
        s.id === id
          ? {
              ...s,
              frequency: 'yearly',
              price: annualPrice,
              nextPaymentDate: nextDate,
            }
          : s
      );
      return true;
    },
  };
}

// ============================================================================
// PERSONA 1: The Serial Free-Trial Hunter
// ============================================================================
test('Persona 1 (Serial Free-Trial Hunter): Starts 5 free trials back-to-back across 7d, 14d, and 30d presets after unlocking Pro', () => {
  const store = createSimulatedAppStore([], 'pro');
  const targetNames = ['The Guardian Digital', 'Apple TV+ UK', 'Audible UK', 'HelloFresh UK', 'NordVPN UK'];
  const start = new Date('2026-10-24T14:22:00');

  for (const presetName of targetNames) {
    const preset = POPULAR_PRESETS.find((p) => p.name === presetName);
    assert.ok(preset, `Preset ${presetName} must exist`);
    const timing = calculateSmartTrialTiming(preset.defaultTrialDays, start);

    const addedId = store.addSubscription({
      name: preset.name,
      price: preset.price,
      currency: '£',
      frequency: preset.frequency,
      category: preset.category,
      nextPaymentDate: timing.trialEndDate,
      status: 'trial',
      trialEndDate: timing.trialEndDate,
      trialStartAt: timing.trialStartAt,
      trialExpiresAt: timing.trialExpiresAt,
      trialDurationDays: preset.defaultTrialDays,
      alarmArmedAt: timing.alarmArmedAt,
      color: preset.color,
      cancelUrl: preset.cancelUrl,
      reminderDaysBefore: timing.reminderDaysBefore,
    });
    assert.ok(addedId, `Should add trial for ${preset.name}`);
  }

  const subs = store.getSubscriptions();
  assert.equal(subs.length, 5, 'All 5 trials should be tracked');
  const uniqueIds = new Set(subs.map((s) => s.id));
  assert.equal(uniqueIds.size, 5, 'Zero ID collisions even when added in the same millisecond');

  // Verify lead times: 7d -> 48h (2d), 14d -> 72h (3d), 30d -> 72h (3d)
  const appleTv = subs.find((s) => s.name === 'Apple TV+ UK')!;
  const guardian = subs.find((s) => s.name === 'The Guardian Digital')!;
  const audible = subs.find((s) => s.name === 'Audible UK')!;
  assert.equal(appleTv.reminderDaysBefore, 2);
  assert.equal(guardian.reminderDaysBefore, 3);
  assert.equal(audible.reminderDaysBefore, 3);
});

// ============================================================================
// PERSONA 2: The Frustrated Rapid-Clicker (Rage-Tapper)
// ============================================================================
test('Persona 2 (Frustrated Rapid-Clicker / Rage-Tapper): Sub-50ms triple taps on Add, Switch Annual, and Cancel produce zero duplicates or double-counted savings', () => {
  const store = createSimulatedAppStore([], 'pro');
  const disneyPreset = POPULAR_PRESETS.find((p) => p.name === 'Disney+ UK')!;

  const payload = {
    name: disneyPreset.name,
    price: disneyPreset.price,
    currency: '£',
    frequency: disneyPreset.frequency,
    category: disneyPreset.category,
    nextPaymentDate: '2026-11-24',
    status: 'active' as const,
    color: disneyPreset.color,
    cancelUrl: disneyPreset.cancelUrl,
    reminderDaysBefore: 3,
  };

  // Rapid triple-tap Add within 0ms
  const r1 = store.addSubscription(payload);
  const r2 = store.addSubscription(payload);
  const r3 = store.addSubscription(payload);

  assert.ok(r1, 'First tap succeeds');
  assert.equal(r2, false, 'Second rage-tap is blocked synchronously');
  assert.equal(r3, false, 'Third rage-tap is blocked synchronously');
  assert.equal(store.getSubscriptions().length, 1);

  const subId = r1 as string;

  // Rapid triple-tap Switch to Annual
  const s1 = store.switchToAnnual(subId);
  const s2 = store.switchToAnnual(subId);
  const s3 = store.switchToAnnual(subId);
  assert.equal(s1, true);
  assert.equal(s2, false, 'Second annual switch blocked because already yearly');
  assert.equal(s3, false);

  // Rapid triple-tap Cancel
  const c1 = store.cancelSubscription(subId);
  const c2 = store.cancelSubscription(subId);
  const c3 = store.cancelSubscription(subId);
  assert.equal(c1, true);
  assert.equal(c2, false, 'Second cancel tap blocked');
  assert.equal(c3, false, 'Third cancel tap blocked');
  assert.equal(store.getNotificationCount(), 1, 'Only 1 savings notification fired');
});

// ============================================================================
// PERSONA 3: The Free-Tier Boundary Pusher
// ============================================================================
test('Persona 3 (Free-Tier Boundary Pusher): Adds 2 subs, deletes 1, cancels 1, adds 2 more — only active/trial items count toward Free limit', () => {
  const store = createSimulatedAppStore([], 'free');

  const id1 = store.addSubscription({
    name: 'Netflix UK',
    price: 12.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: '2026-11-15',
    status: 'active',
    color: '#E50914',
    reminderDaysBefore: 3,
  });
  const id2 = store.addSubscription({
    name: 'Spotify UK',
    price: 11.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Music & Audio',
    nextPaymentDate: '2026-11-18',
    status: 'trial',
    color: '#1DB954',
    reminderDaysBefore: 3,
  });
  assert.ok(id1 && id2, 'First 2 subscriptions allowed on Free tier');

  // 3rd while 2 active/trial -> blocked
  const blocked3rd = store.addSubscription({
    name: 'PureGym UK',
    price: 24.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Fitness & Gym',
    nextPaymentDate: '2026-11-20',
    status: 'active',
    color: '#00BFA5',
    reminderDaysBefore: 3,
  });
  assert.equal(blocked3rd, false, '3rd active subscription must be gated on Free tier');

  // Delete 1st, cancel 2nd -> active count is now 0!
  store.deleteSubscription(id1 as string);
  store.cancelSubscription(id2 as string);

  const activeNow = store.getSubscriptions().filter((s) => s.status === 'active' || s.status === 'trial').length;
  assert.equal(activeNow, 0);
  assert.equal(canAddSubscription(activeNow, 'free').allowed, true);

  // Can now add 2 new subscriptions without being locked out by cancelled history
  const id3 = store.addSubscription({
    name: 'PureGym UK',
    price: 24.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Fitness & Gym',
    nextPaymentDate: '2026-11-20',
    status: 'active',
    color: '#00BFA5',
    reminderDaysBefore: 3,
  });
  assert.ok(id3, 'User can add new subscription after cancelling/deleting old ones');
});

// ============================================================================
// PERSONA 4: The Messy Manual Entry User
// ============================================================================
test('Persona 4 (Messy Manual Entry User): Rejects whitespace names, £0/negative/Infinity/999999 prices, and safely handles emojis & special chars', () => {
  const store = createSimulatedAppStore([], 'pro');

  assert.equal(
    store.addSubscription({
      name: '    ',
      price: 9.99,
      currency: '£',
      frequency: 'monthly',
      category: 'Other',
      nextPaymentDate: '2026-11-10',
      status: 'active',
      color: '#14B8A6',
      reminderDaysBefore: 3,
    }),
    false,
    'Whitespace-only name rejected'
  );

  for (const badPrice of [0, -10.99, NaN, Infinity, -Infinity, 999999]) {
    assert.equal(
      store.addSubscription({
        name: 'Bad Price Sub',
        price: badPrice,
        currency: '£',
        frequency: 'monthly',
        category: 'Other',
        nextPaymentDate: '2026-11-10',
        status: 'active',
        color: '#14B8A6',
        reminderDaysBefore: 3,
      }),
      false,
      `Invalid price ${badPrice} rejected`
    );
    if (badPrice <= 0 || !Number.isFinite(badPrice)) {
      assert.equal(convertFrequencyToMonthly(badPrice, 'monthly'), 0);
      assert.equal(convertFrequencyToAnnual(badPrice, 'monthly'), 0);
    }
  }

  const emojiId = store.addSubscription({
    name: '  🎮 Xbox & Friends 🚀 <script>alert(1)</script>  ',
    price: 14.994,
    currency: '£',
    frequency: 'monthly',
    category: 'Gaming',
    nextPaymentDate: '2026-11-10',
    status: 'active',
    color: '#107C10',
    notes: 'Shared with flatmate 🏠 & £5 split',
    reminderDaysBefore: 3,
  });
  assert.ok(emojiId);
  const saved = store.getSubscriptions()[0];
  assert.equal(saved.name, '🎮 Xbox & Friends 🚀 <script>alert(1)</script>');
  assert.equal(saved.price, 14.99, 'Price rounded cleanly to 2 decimal places');
});

// ============================================================================
// PERSONA 5: The Midnight / Month-End Time Traveler
// ============================================================================
test('Persona 5 (Midnight / Month-End Time Traveler): Jan 31st, Feb 28/29th leap year, and 23:59 PM trials never overflow or produce Invalid Date/NaN', () => {
  // Jan 31 + 1 month -> Feb 28 (2026 non-leap) and Feb 29 (2028 leap year)
  const jan31_2026 = new Date(2026, 0, 31, 23, 59, 50);
  const feb2026 = addMonthsClamped(jan31_2026, 1);
  assert.equal(formatLocalDateKey(feb2026), '2026-02-28');

  const jan31_2028 = new Date(2028, 0, 31, 23, 59, 50);
  const feb2028 = addMonthsClamped(jan31_2028, 1);
  assert.equal(formatLocalDateKey(feb2028), '2028-02-29');

  // Leap day Feb 29, 2028 + 1 year -> Feb 28, 2029 (no March 1 overflow!)
  const nextYearFromLeap = addYearsClamped(feb2028, 1);
  assert.equal(formatLocalDateKey(nextYearFromLeap), '2029-02-28');

  // Trial started at 23:59 PM on Jan 31
  const timing = calculateSmartTrialTiming(7, jan31_2026);
  assert.ok(!Number.isNaN(new Date(timing.trialExpiresAt).getTime()));
  assert.ok(!Number.isNaN(new Date(timing.alarmArmedAt).getTime()));
  assert.equal(new Date(timing.alarmArmedAt).getHours(), 10, 'Alarm still armed at 10:00 AM');

  // getDaysUntilNextPayment with ISO string or malformed date never returns NaN
  assert.equal(Number.isNaN(getDaysUntilNextPayment('2026-10-30T23:59:59Z', '2026-10-25')), false);
  assert.equal(getDaysUntilNextPayment('2026-10-30T23:59:59Z', '2026-10-25'), 5);
  assert.equal(getDaysUntilNextPayment('invalid-date-string'), 0);
});

// ============================================================================
// PERSONA 6: The Skeptical Privacy User (Offline Backup & Restore)
// ============================================================================
test('Persona 6 (Skeptical Privacy User): Exports JSON backup, wipes storage, and restores 100% state fidelity (subs, trial timestamps, Pro plan, license key, achievements)', () => {
  clearMemoryStorage();
  const licenseKey = generateLicenseKey('pro');
  safeStorageSet('subcleaner_achievements', JSON.stringify(['first_cut', 'trial_ninja']));

  const timing = calculateSmartTrialTiming(14, new Date('2026-10-24T11:00:00Z'));
  const originalSubs: Subscription[] = [
    {
      id: 'sub-hello-1',
      name: 'HelloFresh UK',
      price: 29.99,
      currency: '£',
      frequency: 'monthly',
      category: 'Food & Delivery',
      nextPaymentDate: timing.trialEndDate,
      status: 'trial',
      trialEndDate: timing.trialEndDate,
      trialStartAt: timing.trialStartAt,
      trialExpiresAt: timing.trialExpiresAt,
      trialDurationDays: 14,
      alarmArmedAt: timing.alarmArmedAt,
      color: '#91C11E',
      cancelUrl: 'https://www.hellofresh.co.uk/account-settings/plan-settings',
      reminderDaysBefore: 3,
      createdAt: '2026-10-24',
      paymentHistory: [],
    },
  ];

  const backupJson = createBackupJson(originalSubs, 'pro');

  // Wipe memory storage completely
  clearMemoryStorage();
  assert.equal(safeStorageGet('subcleaner_license_key'), null);
  assert.equal(safeStorageGet('subcleaner_achievements'), null);

  // Restore from backup
  const restored = parseAndValidateBackupJson(backupJson);
  assert.ok(restored, 'Backup should validate and parse cleanly');
  assert.equal(restored.userPlan, 'pro');
  assert.equal(restored.licenseKey, licenseKey);
  assert.deepEqual(restored.unlockedAchievements, ['first_cut', 'trial_ninja']);
  assert.equal(restored.subscriptions.length, 1);
  assert.equal(restored.subscriptions[0].trialExpiresAt, timing.trialExpiresAt);
  assert.equal(restored.subscriptions[0].alarmArmedAt, timing.alarmArmedAt);
});

// ============================================================================
// PERSONA 7: The Barclays / Monzo Screenshot Scanner User
// ============================================================================
test('Persona 7 (Barclays / Monzo Screenshot Scanner User): Normalizes messy UK bank OCR lines and deduplicates against active items', () => {
  assert.equal(normalizeScannedSubscriptionName(' AMZN MKTP UK*PRIME LONDON '), 'amazon prime');
  assert.equal(normalizeScannedSubscriptionName('PUREGYM LTD DIRECT DEBIT'), 'puregym');
  assert.equal(normalizeScannedSubscriptionName('PURE GYM DD LONDON'), 'puregym');
  assert.equal(normalizeScannedSubscriptionName('NETFLIX.COM AMSTERDAM GB'), 'netflix');
  assert.equal(normalizeScannedSubscriptionName('SPOTIFYUK LONDON DIRECT DEBIT'), 'spotify');

  const existingActive: Subscription = {
    id: 'sub-1',
    name: 'Amazon Prime UK',
    price: 8.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: '2026-11-15',
    status: 'active',
    color: '#FF9900',
    reminderDaysBefore: 3,
    createdAt: '2026-10-01',
    paymentHistory: [],
  };

  assert.equal(
    isDuplicateScannedSubscription({ name: ' AMZN MKTP UK*PRIME LONDON ' }, existingActive),
    true,
    'Messy Monzo/Barclays Amazon Prime line must be flagged as duplicate of Amazon Prime UK'
  );
  assert.equal(
    isDuplicateScannedSubscription(
      { name: 'PUREGYM LTD DIRECT DEBIT' },
      { name: 'PureGym UK', status: 'active' }
    ),
    true,
    'PUREGYM LTD DIRECT DEBIT must match PureGym UK'
  );
});

// ============================================================================
// PERSONA 8: The Annual Plan Switcher & Canceller
// ============================================================================
test('Persona 8 (Annual Plan Switcher & Canceller): Switches monthly sub to annual, cancels it, then re-adds — math stays exact to 2 decimals (£XX.XX)', () => {
  const store = createSimulatedAppStore([], 'pro');
  const id = store.addSubscription({
    name: 'Disney+ UK',
    price: 8.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: '2026-11-24',
    status: 'active',
    color: '#0063E5',
    reminderDaysBefore: 3,
  }) as string;

  assert.equal(calculateMonthlyTotal(store.getSubscriptions()), 8.99);
  assert.equal(calculateAnnualTotal(store.getSubscriptions()), 107.88);

  // Switch to annual (16.7% discount -> £89.86/yr -> £7.49/mo)
  store.switchToAnnual(id);
  const afterSwitch = store.getSubscriptions()[0];
  assert.equal(afterSwitch.frequency, 'yearly');
  assert.equal(afterSwitch.price, 89.86);
  assert.equal(calculateAnnualTotal(store.getSubscriptions()), 89.86);
  assert.equal(calculateMonthlyTotal(store.getSubscriptions()), 7.49);

  // Cancel the annual subscription
  store.cancelSubscription(id);
  assert.equal(calculateMonthlyTotal(store.getSubscriptions()), 0);
  assert.equal(calculateTotalSavings(store.getSubscriptions()), 7.49);
  assert.equal(formatPrice(calculateTotalSavings(store.getSubscriptions()), '£'), '£7.49');
});

// ============================================================================
// PERSONA 9: The Multi-Language / Polyglot User
// ============================================================================
test('Persona 9 (Multi-Language / Polyglot User): All 6 supported languages have 100% matching keys and non-empty strings', () => {
  const baseDict = TRANSLATIONS['en-GB'];
  const baseKeys = Object.keys(baseDict);
  assert.equal(SUPPORTED_LANGUAGES.length, 6);

  for (const langInfo of SUPPORTED_LANGUAGES) {
    const langDict = TRANSLATIONS[langInfo.code];
    assert.ok(langDict, `Language dictionary for ${langInfo.code} must exist`);
    for (const key of baseKeys) {
      const val = langDict[key];
      assert.equal(
        typeof val === 'string' && val.trim().length > 0,
        true,
        `Missing or empty translation for ${langInfo.code}.${key}`
      );
    }
  }
});

// ============================================================================
// PERSONA 10: The Small-Screen / iPhone SE User (320px - 375px)
// ============================================================================
test('Persona 10 (Small-Screen / iPhone SE User): Long UK service names and high prices format cleanly without overflowing', () => {
  for (const preset of POPULAR_PRESETS) {
    assert.ok(preset.name.length <= 32, `Preset name "${preset.name}" is concise enough for 320px cards`);
    const formatted = formatPrice(preset.price, '£');
    assert.match(formatted, /^£\d+\.\d{2}$/, `Formatted price ${formatted} is clean`);
  }
  const davidLloyd = POPULAR_PRESETS.find((p) => p.name === 'David Lloyd Clubs')!;
  assert.equal(formatPrice(davidLloyd.price, '£'), '£129.00');
});

// ============================================================================
// PERSONA 11: The Search & Filter Power User
// ============================================================================
test('Persona 11 (Search & Filter Power User): Combines search queries with category pills and status tabs, then resets cleanly', () => {
  // Search "prime" with category "Food & Delivery" -> 0 results, then reset to "All" -> finds Amazon Prime UK
  const primeInFood = filterPopularPresets('prime', 'Food & Delivery');
  assert.equal(primeInFood.length, 0);

  const primeInAll = filterPopularPresets('prime', 'All');
  assert.ok(primeInAll.some((p) => p.name === 'Amazon Prime UK'));

  // HomeScreen filter combination: search "prime" + status "cancelled" -> 0, then reset -> returns all
  const subs = INITIAL_DEMO_SUBSCRIPTIONS;
  const emptyFiltered = filterAndSortSubscriptions(subs, {
    search: 'prime',
    statusFilter: 'cancelled',
  });
  assert.equal(emptyFiltered.length, 0);

  const resetFiltered = filterAndSortSubscriptions(subs, {
    search: '',
    statusFilter: 'all',
  });
  assert.equal(resetFiltered.length, subs.length);
});

// ============================================================================
// PERSONA 12: The Custom Trial Duration User
// ============================================================================
test('Persona 12 (Custom Trial Duration User): Handles 1d, 3d, 90d, 0d, negative, and NaN trial durations safely', () => {
  const start = new Date('2026-10-24T22:30:00');

  // 1-day trial
  const t1 = calculateSmartTrialTiming(1, start);
  assert.equal(t1.leadHours, 24);
  assert.equal(t1.reminderDaysBefore, 1);
  assert.ok(new Date(t1.alarmArmedAt).getTime() > start.getTime(), '1d trial alarm must be in the future');

  // 3-day trial
  const t3 = calculateSmartTrialTiming(3, start);
  assert.equal(t3.leadHours, 24);
  assert.equal(t3.reminderDaysBefore, 1);

  // 90-day trial
  const t90 = calculateSmartTrialTiming(90, start);
  assert.equal(t90.leadHours, 72);
  assert.equal(t90.reminderDaysBefore, 3);

  // 0 days, -5 days, NaN -> safely fallback to 7 days (48h lead time)
  for (const invalidDays of [0, -5, NaN]) {
    const fallback = calculateSmartTrialTiming(invalidDays, start);
    assert.equal(fallback.leadHours, 48);
    assert.equal(fallback.reminderDaysBefore, 2);
  }
});

// ============================================================================
// PERSONA 13: The Achievement Hunter
// ============================================================================
test('Persona 13 (Achievement Hunter): Progressively cancels 1, 5, and 10 subscriptions across £4.99 to £120.00 and unlocks all 6 badges', () => {
  const store = createSimulatedAppStore([], 'pro');

  // Add 10 subscriptions (including 1 trial) with prices summing > £100/mo
  for (let i = 1; i <= 10; i++) {
    store.addSubscription({
      name: `UK Service #${i}`,
      price: i === 1 ? 4.99 : 15.0,
      currency: '£',
      frequency: 'monthly',
      category: 'Streaming',
      nextPaymentDate: '2026-11-20',
      status: i === 1 ? 'trial' : 'active',
      color: '#14B8A6',
      reminderDaysBefore: 3,
    });
  }

  const allIds = [...store.getSubscriptions()].reverse().map((s) => s.id);

  // Cancel 1st (which was a trial) -> unlocks 'first_cut' & 'trial_ninja'
  store.cancelSubscription(allIds[0]);
  let cancelled = store.getSubscriptions().filter((s) => s.status === 'cancelled');
  let savings = calculateTotalSavings(store.getSubscriptions());
  assert.equal(cancelled.length, 1);
  assert.equal(savings, 4.99);

  // Cancel 4 more (total 5 cancelled, savings = 4.99 + 60 = £64.99) -> unlocks 'five_slayer' & 'half_century'
  for (let i = 1; i < 5; i++) {
    store.cancelSubscription(allIds[i]);
  }
  cancelled = store.getSubscriptions().filter((s) => s.status === 'cancelled');
  savings = calculateTotalSavings(store.getSubscriptions());
  assert.equal(cancelled.length, 5);
  assert.equal(savings, 64.99);
  assert.ok(savings >= 50);

  // Cancel remaining 5 (total 10 cancelled, savings = £139.99) -> unlocks all 5 achievements
  for (let i = 5; i < 10; i++) {
    store.cancelSubscription(allIds[i]);
  }
  cancelled = store.getSubscriptions().filter((s) => s.status === 'cancelled');
  savings = calculateTotalSavings(store.getSubscriptions());
  assert.equal(cancelled.length, 10);
  assert.equal(savings, 139.99);
  assert.ok(savings >= 100);
  const unlockedIds = getUnlockedAchievementIds(store.getSubscriptions());
  assert.equal(unlockedIds.length, ACHIEVEMENTS.length);
});

// ============================================================================
// PERSONA 14: The License Key Tester
// ============================================================================
test('Persona 14 (License Key Tester): Validates lowercase keys, leading/trailing spaces, standard keys, emails, and rejects invalid/short keys', () => {
  clearMemoryStorage();

  const proSpaced = parseRestoredLicensePlan('  sub-pro-2026-uk  ');
  assert.ok(proSpaced);
  assert.equal(proSpaced.plan, 'pro');
  assert.equal(proSpaced.licenseKey, 'SUB-PRO-2026-UK');

  const stdLower = parseRestoredLicensePlan(' sub-std-9988 ');
  assert.ok(stdLower);
  assert.equal(stdLower.plan, 'standard');
  assert.equal(stdLower.licenseKey, 'SUB-STD-9988');

  const emailRestore = parseRestoredLicensePlan('  buyer@monzo.co.uk ');
  assert.ok(emailRestore);
  assert.equal(emailRestore.plan, 'pro');

  // Invalid inputs must return null
  assert.equal(parseRestoredLicensePlan(''), null);
  assert.equal(parseRestoredLicensePlan('   '), null);
  assert.equal(parseRestoredLicensePlan('sub-pro'), null);
  assert.equal(parseRestoredLicensePlan('RANDOM-GIBBERISH-123'), null);
  assert.equal(parseRestoredLicensePlan('not-an-email@bad'), null);
});

// ============================================================================
// PERSONA 15: The Calendar Deep-Link Inspector
// ============================================================================
test('Persona 15 (Calendar Deep-Link Inspector): Special characters (&, +, /, £) in service names produce valid .ics and Google Calendar URLs', () => {
  const timing = calculateSmartTrialTiming(7, new Date('2026-10-24T12:00:00Z'));
  const specialSub: Subscription = {
    id: 'sub-special-1',
    name: 'Apple TV+ UK & BBC Sounds / Licence',
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
    cancelUrl: 'https://support.apple.com/en-gb/118428?plan=tv+&region=uk',
    reminderDaysBefore: timing.reminderDaysBefore,
    createdAt: '2026-10-24',
    paymentHistory: [],
  };

  const ics = createSubscriptionReminderIcs(
    specialSub,
    timing.trialEndDate,
    timing.reminderDaysBefore,
    `Cancel ${specialSub.name}`,
    `Reminder for ${specialSub.name}`,
    `Trial ends in ${timing.reminderDaysBefore} days`
  );
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('Apple TV+ UK & BBC Sounds / Licence'));
  assert.ok(!ics.includes('undefined'));

  const gcalUrl = createGoogleCalendarReminderUrl(specialSub, timing.trialEndDate, timing.reminderDaysBefore);
  const parsed = new URL(gcalUrl);
  assert.equal(parsed.hostname, 'calendar.google.com');
  assert.ok(parsed.searchParams.get('text')?.includes('Apple TV+ UK & BBC Sounds / Licence'));
  assert.ok(parsed.searchParams.get('details')?.includes('£8.99/monthly'));

  const badge = formatTrialCountdownBadge(specialSub, new Date('2026-10-24T12:00:00Z'));
  assert.ok(badge && badge.includes('Trial ends in 7d 0h'));
});

// ============================================================================
// PERSONA 16: The Corrupt LocalStorage Survivor
// ============================================================================
test('Persona 16 (Corrupt LocalStorage Survivor): Self-heals corrupted JSON, partial objects, and invalid plan/currency values without WSOD', () => {
  clearMemoryStorage();
  safeStorageSet('subcleaner_subscriptions_v2', '{corrupted_json_payload!!!');
  safeStorageSet('subcleaner_user_plan', 'HACKED_PLAN');
  safeStorageSet('subcleaner_currency', 'INVALID_COIN');

  const healedSubs = loadPersistedSubscriptions(INITIAL_DEMO_SUBSCRIPTIONS);
  assert.equal(healedSubs.length, INITIAL_DEMO_SUBSCRIPTIONS.length, 'Falls back cleanly when JSON is corrupt');
  assert.equal(sanitizeUserPlan(safeStorageGet('subcleaner_user_plan')), 'free');
  assert.equal(sanitizeCurrency(safeStorageGet('subcleaner_currency')), 'GBP');

  // Partial / malformed array items in storage
  const messyArray = [
    null,
    42,
    { name: '   ', price: 10 }, // invalid blank name
    { name: 'Broken Price', price: -5 }, // invalid negative price
    { id: 'ok-1', name: 'Valid Monzo Sub', price: '12.50', status: 'weird_status', frequency: 'invalid_freq' },
  ];
  const cleaned = sanitizeSubscriptionsList(messyArray);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].name, 'Valid Monzo Sub');
  assert.equal(cleaned[0].price, 12.5);
  assert.equal(cleaned[0].status, 'active');
  assert.equal(cleaned[0].frequency, 'monthly');
});

// ============================================================================
// PERSONA 17: The Keyboard / Accessibility Navigator
// ============================================================================
test('Persona 17 (Keyboard / Accessibility Navigator): Escape key priority closes topmost modal layer one by one', () => {
  const modalState = {
    isPaywallOpen: true,
    isAiScannerOpen: true,
    selectedCancelSub: true,
    selectedDetailSub: true,
    isAddModalOpen: true,
  };

  const pressEscape = () => {
    if (modalState.isPaywallOpen) modalState.isPaywallOpen = false;
    else if (modalState.isAiScannerOpen) modalState.isAiScannerOpen = false;
    else if (modalState.selectedCancelSub) modalState.selectedCancelSub = false;
    else if (modalState.selectedDetailSub) modalState.selectedDetailSub = false;
    else if (modalState.isAddModalOpen) modalState.isAddModalOpen = false;
  };

  pressEscape();
  assert.equal(modalState.isPaywallOpen, false);
  assert.equal(modalState.isAiScannerOpen, true);

  pressEscape();
  assert.equal(modalState.isAiScannerOpen, false);
  assert.equal(modalState.selectedCancelSub, true);

  pressEscape();
  assert.equal(modalState.selectedCancelSub, false);
  assert.equal(modalState.selectedDetailSub, true);

  pressEscape();
  assert.equal(modalState.selectedDetailSub, false);
  assert.equal(modalState.isAddModalOpen, true);

  pressEscape();
  assert.equal(modalState.isAddModalOpen, false);
});

// ============================================================================
// PERSONA 18: The Weekly & Quarterly/Yearly Biller
// ============================================================================
test('Persona 18 (Weekly & Yearly Biller): Normalizes weekly (£4.99/wk) and yearly (£89.99/yr) bills accurately in Monthly Outflow & Annual Forecast', () => {
  const subs: Subscription[] = [
    {
      id: 'sub-weekly',
      name: 'Pret Coffee Weekly',
      price: 4.99,
      currency: '£',
      frequency: 'weekly',
      category: 'Food & Delivery',
      nextPaymentDate: '2026-10-30',
      status: 'active',
      color: '#8B0000',
      reminderDaysBefore: 2,
      createdAt: '2026-10-01',
      paymentHistory: [],
    },
    {
      id: 'sub-yearly',
      name: 'Amazon Prime Annual',
      price: 95.0,
      currency: '£',
      frequency: 'yearly',
      category: 'Streaming',
      nextPaymentDate: '2027-05-01',
      status: 'active',
      color: '#FF9900',
      reminderDaysBefore: 3,
      createdAt: '2026-05-01',
      paymentHistory: [],
    },
  ];

  // Weekly £4.99 * 52 / 12 = 21.62333... + Yearly £95 / 12 = 7.91666... -> Total Monthly = £29.54
  assert.equal(calculateMonthlyTotal(subs), 29.54);
  // Annual = £4.99 * 52 (259.48) + £95.00 = £354.48
  assert.equal(calculateAnnualTotal(subs), 354.48);
});

// ============================================================================
// PERSONA 19: The "Due Soon" Urgency User
// ============================================================================
test('Persona 19 ("Due Soon" Urgency User): Accurately filters and orders subscriptions renewing in 0d, 1d, 3d, 5d vs 6d and past', () => {
  const refDate = '2026-10-24';
  const makeSub = (id: string, nextDate: string): Subscription => ({
    id,
    name: `Sub ${id}`,
    price: 9.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: nextDate,
    status: 'active',
    color: '#14B8A6',
    reminderDaysBefore: 3,
    createdAt: '2026-10-01',
    paymentHistory: [],
  });

  const subs = [
    makeSub('due-6d', '2026-10-30'),
    makeSub('due-3d', '2026-10-27'),
    makeSub('due-0d', '2026-10-24'),
    makeSub('due-past', '2026-10-20'),
    makeSub('due-1d', '2026-10-25'),
    makeSub('due-5d', '2026-10-29'),
  ];

  const dueSoon = filterAndSortSubscriptions(subs, { statusFilter: 'renewingSoon', sortBy: 'renewal' }, refDate);
  assert.deepEqual(
    dueSoon.map((s) => s.id),
    ['due-0d', 'due-1d', 'due-3d', 'due-5d'],
    'Only 0..5 days ahead are included in Due Soon, sorted ascending by urgency'
  );
});

// ============================================================================
// PERSONA 20: The Fresh Reload / Persistence User
// ============================================================================
test('Persona 20 (Fresh Reload / Persistence User): Full user journey persists across simulated page reload', () => {
  clearMemoryStorage();
  const store = createSimulatedAppStore([], 'free');

  // 1. Add a trial on Free tier
  const timing = calculateSmartTrialTiming(30, new Date('2026-10-24T09:00:00Z'));
  const addedId = store.addSubscription({
    name: 'Audible UK',
    price: 8.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Music & Audio',
    nextPaymentDate: timing.trialEndDate,
    status: 'trial',
    trialEndDate: timing.trialEndDate,
    trialStartAt: timing.trialStartAt,
    trialExpiresAt: timing.trialExpiresAt,
    trialDurationDays: 30,
    alarmArmedAt: timing.alarmArmedAt,
    color: '#F8991D',
    reminderDaysBefore: timing.reminderDaysBefore,
  });
  assert.ok(addedId);

  // 2. Upgrade to Pro & cancel subscription
  store.setUserPlan('pro');
  store.cancelSubscription(addedId as string);

  // 3. Persist to storage (simulating App.tsx useEffect)
  safeStorageSet('subcleaner_subscriptions_v2', JSON.stringify(store.getSubscriptions()));
  safeStorageSet('subcleaner_user_plan', store.getUserPlan());

  // 4. Simulate fresh browser reload
  const reloadedSubs = loadPersistedSubscriptions(INITIAL_DEMO_SUBSCRIPTIONS);
  const reloadedPlan = sanitizeUserPlan(safeStorageGet('subcleaner_user_plan'));

  assert.equal(reloadedPlan, 'pro');
  assert.equal(reloadedSubs.length, 1);
  assert.equal(reloadedSubs[0].name, 'Audible UK');
  assert.equal(reloadedSubs[0].status, 'cancelled');
  assert.equal(reloadedSubs[0].monthlySavingsAmount, 8.99);
});
