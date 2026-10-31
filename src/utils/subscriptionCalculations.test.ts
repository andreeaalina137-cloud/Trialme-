import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertFrequencyToMonthly,
  convertFrequencyToAnnual,
  calculateMonthlyTotal,
  calculateTotalSavings,
  calculateAnnualSavings,
  calculateRenewalForecast,
  rollForwardPaymentDate,
  getDaysUntilNextPayment,
  canAddSubscription,
  formatPrice,
  filterAndSortSubscriptions,
} from './subscriptionCalculations.ts';
import type { Subscription } from '../types/subscription.ts';

const mockSubscriptions: Subscription[] = [
  {
    id: 'sub-1',
    name: 'Netflix UK Standard',
    price: 10.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: '2026-10-20',
    status: 'active',
    color: '#E50914',
    reminderDaysBefore: 3,
    paymentHistory: [],
    createdAt: '2026-01-01',
  },
  {
    id: 'sub-2',
    name: 'Spotify Premium UK',
    price: 11.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Music & Audio',
    nextPaymentDate: '2026-10-18',
    status: 'active',
    color: '#1DB954',
    reminderDaysBefore: 2,
    paymentHistory: [],
    createdAt: '2026-01-01',
  },
  {
    id: 'sub-3',
    name: 'Amazon Prime Yearly',
    price: 95.0,
    currency: '£',
    frequency: 'yearly',
    category: 'Streaming',
    nextPaymentDate: '2026-12-01',
    status: 'cancelled',
    color: '#00A8E1',
    reminderDaysBefore: 7,
    paymentHistory: [],
    createdAt: '2026-01-01',
    monthlySavingsAmount: 95.0 / 12,
  },
];

test('convertFrequencyToMonthly calculates correct monthly amounts', () => {
  assert.equal(convertFrequencyToMonthly(12, 'monthly'), 12);
  assert.equal(convertFrequencyToMonthly(120, 'yearly'), 10);
  assert.equal(convertFrequencyToMonthly(30, 'quarterly'), 10);
  assert.equal(convertFrequencyToMonthly(10, 'weekly'), (10 * 52) / 12);
});

test('convertFrequencyToAnnual calculates correct annual amounts', () => {
  assert.equal(convertFrequencyToAnnual(10, 'monthly'), 120);
  assert.equal(convertFrequencyToAnnual(100, 'yearly'), 100);
  assert.equal(convertFrequencyToAnnual(25, 'quarterly'), 100);
  assert.equal(convertFrequencyToAnnual(5, 'weekly'), 260);
});

test('calculateMonthlyTotal sums only active and trial subscriptions with strict 2-decimal precision', () => {
  const total = calculateMonthlyTotal(mockSubscriptions);
  // Netflix 10.99 + Spotify 11.99 = 22.98 exactly
  assert.equal(total, 22.98);

  // Test float precision with 19.99 + 10.99 (avoids 30.980000000000004)
  const precisionSubs: Subscription[] = [
    { ...mockSubscriptions[0], price: 19.99 },
    { ...mockSubscriptions[1], price: 10.99 },
  ];
  assert.equal(calculateMonthlyTotal(precisionSubs), 30.98);
});

test('calculateTotalSavings and calculateAnnualSavings include cancelled subscriptions and exclude active', () => {
  const savings = calculateTotalSavings(mockSubscriptions);
  assert.equal(savings, 7.92);

  const annualSavings = calculateAnnualSavings(mockSubscriptions);
  assert.equal(annualSavings, 95);
});

test('calculateRenewalForecast projects exact 6-month cash flow in pence', () => {
  const today = new Date(2026, 9, 25); // 25 Oct 2026
  const forecast = calculateRenewalForecast(mockSubscriptions, 6, today);
  assert.equal(forecast.length, 6);
  assert.equal(forecast[0].isCurrent, true);
  for (const month of forecast) {
    assert.ok(Number.isFinite(month.total));
    assert.equal(month.total, Math.round(month.total * 100) / 100);
  }
});

test('rollForwardPaymentDate safely advances overdue dates to next billing cycle without month-end drift', () => {
  const pastDate = '2026-08-31';
  const refDate = new Date(2026, 9, 25); // 25 Oct 2026
  const rolled = rollForwardPaymentDate(pastDate, 'monthly', refDate);
  assert.equal(rolled, '2026-10-31');

  // Leap year roll forward: 2028-02-29 yearly to 2029
  const leapOverdue = '2028-02-29';
  const postLeap = new Date(2028, 5, 1);
  const rolledLeap = rollForwardPaymentDate(leapOverdue, 'yearly', postLeap);
  assert.equal(rolledLeap, '2029-02-28');
});

test('supports every billing frequency with exact annual and monthly equivalents', () => {
  assert.equal(convertFrequencyToAnnual(10, 'weekly'), 520);
  assert.equal(convertFrequencyToMonthly(10, 'weekly'), 520 / 12);
  assert.equal(convertFrequencyToAnnual(10, 'fortnightly'), 260);
  assert.equal(convertFrequencyToMonthly(10, 'fortnightly'), 260 / 12);
  assert.equal(convertFrequencyToAnnual(30, 'quarterly'), 120);
  assert.equal(convertFrequencyToMonthly(30, 'quarterly'), 10);
  assert.equal(convertFrequencyToAnnual(60, 'half-yearly'), 120);
  assert.equal(convertFrequencyToMonthly(60, 'half-yearly'), 10);
  assert.equal(convertFrequencyToAnnual(120, 'yearly'), 120);
  assert.equal(convertFrequencyToMonthly(120, 'yearly'), 10);
});

test('rolls fortnightly and half-yearly billing dates from the original anchor', () => {
  const reference = new Date(2026, 10, 1);
  assert.equal(rollForwardPaymentDate('2026-10-03', 'fortnightly', reference), '2026-11-14');
  assert.equal(rollForwardPaymentDate('2026-02-28', 'half-yearly', reference), '2027-02-28');
});

test('getDaysUntilNextPayment calculates exact calendar days diff', () => {
  const diff = getDaysUntilNextPayment('2026-10-20', '2026-10-15');
  assert.equal(diff, 5);
  const diffToday = getDaysUntilNextPayment('2026-10-15', '2026-10-15');
  assert.equal(diffToday, 0);
  const diffPast = getDaysUntilNextPayment('2026-10-10', '2026-10-15');
  assert.equal(diffPast, -5);
});

test('getDaysUntilNextPayment stays on calendar days across UK daylight saving time', () => {
  assert.equal(getDaysUntilNextPayment('2026-11-19', '2026-10-20'), 30);
  assert.equal(getDaysUntilNextPayment('2026-11-01', '2026-10-31'), 1);
});

test('canAddSubscription enforces Free tier max 2 active limit and unlocks on Pro/Standard', () => {
  // Free plan has max 2 limit: 0, 1 allowed; 2 active means adding a 3rd is blocked
  assert.equal(canAddSubscription(0, 'free').allowed, true);
  assert.equal(canAddSubscription(1, 'free').allowed, true);
  assert.equal(canAddSubscription(2, 'free').allowed, false);
  assert.equal(canAddSubscription(3, 'free').allowed, false);

  // Free plan with bonus invite slots
  assert.equal(canAddSubscription(2, 'free', 1).allowed, true); // 2 active out of 3 allowed
  assert.equal(canAddSubscription(3, 'free', 1).allowed, false); // 3 active, max reached
  assert.equal(canAddSubscription(3, 'free', 2).allowed, true); // 3 active out of 4 allowed
  assert.equal(canAddSubscription(4, 'free', 2).allowed, false); // 4 active, max reached

  // Standard plan
  assert.equal(canAddSubscription(2, 'standard').allowed, true);
  assert.equal(canAddSubscription(10, 'standard').allowed, true);

  // Pro plan
  assert.equal(canAddSubscription(2, 'pro').allowed, true);
  assert.equal(canAddSubscription(50, 'pro').allowed, true);
});

test('formatPrice formats GBP and other currencies accurately', () => {
  assert.equal(formatPrice(10.99, '£'), '£10.99');
  assert.equal(formatPrice(45.5, 'lei'), '45.50 lei');
  assert.equal(formatPrice(0, '$'), '$0.00');
});

test('filterAndSortSubscriptions filters by status and sorts by renewal', () => {
  const filtered = filterAndSortSubscriptions(
    mockSubscriptions,
    {
      statusFilter: 'active',
      sortBy: 'renewal',
    },
    '2026-10-15'
  );
  assert.equal(filtered.length, 2);
  // Spotify is due Oct 18 (3 days), Netflix Oct 20 (5 days)
  assert.equal(filtered[0].name, 'Spotify Premium UK');
  assert.equal(filtered[1].name, 'Netflix UK Standard');
});
