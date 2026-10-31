import type { Subscription, SubscriptionFrequency, UserPlan } from '../types/subscription';

export const CURRENCIES = {
  GBP: { symbol: '£' },
  EUR: { symbol: '€' },
  USD: { symbol: '$' },
  RON: { symbol: 'lei' },
} as const;

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Adds months to a Date without overflowing month-end days (e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsClamped(baseDate: Date, monthsToAdd: number): Date {
  const safeBase = Number.isNaN(baseDate.getTime()) ? new Date() : new Date(baseDate.getTime());
  const targetYear = safeBase.getFullYear();
  const targetMonth = safeBase.getMonth() + monthsToAdd;
  const originalDay = safeBase.getDate();

  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(originalDay, lastDayOfTargetMonth);

  const result = new Date(safeBase.getTime());
  result.setFullYear(targetYear, targetMonth, clampedDay);
  return result;
}

/**
 * Adds years to a Date without overflowing leap day (e.g. Feb 29, 2028 + 1 year -> Feb 28, 2029).
 */
export function addYearsClamped(baseDate: Date, yearsToAdd: number): Date {
  return addMonthsClamped(baseDate, yearsToAdd * 12);
}

/**
 * Formats a Date as local YYYY-MM-DD without UTC timezone shift at 23:59 PM.
 */
export function formatLocalDateKey(date: Date): string {
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return [
    safe.getFullYear(),
    String(safe.getMonth() + 1).padStart(2, '0'),
    String(safe.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Normalises price to a monthly equivalent.
 * Weekly: price × 52 / 12 · Fortnightly: price × 26 / 12 · Quarterly: price / 3
 * · Half-yearly: price / 6 · Yearly: price / 12.
 */
export function convertFrequencyToMonthly(price: number, frequency: SubscriptionFrequency): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  switch (frequency) {
    case 'weekly':
      return (price * 52) / 12;
    case 'fortnightly':
      return (price * 26) / 12;
    case 'quarterly':
      return price / 3;
    case 'half-yearly':
      return price / 6;
    case 'yearly':
      return price / 12;
    case 'monthly':
    default:
      return price;
  }
}

/**
 * Normalises price to an annual equivalent.
 */
export function convertFrequencyToAnnual(price: number, frequency: SubscriptionFrequency): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  switch (frequency) {
    case 'weekly':
      return price * 52;
    case 'fortnightly':
      return price * 26;
    case 'monthly':
      return price * 12;
    case 'quarterly':
      return price * 4;
    case 'half-yearly':
      return price * 2;
    case 'yearly':
    default:
      return price;
  }
}

/**
 * Converts a currency amount to integer pence/cents so totals can be summed without
 * floating-point drift (e.g. 0.1 + 0.2 !== 0.3).
 */
export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}

function sumInMinorUnits(values: number[]): number {
  const pence = values.reduce((sum, value) => sum + toMinorUnits(value), 0);
  return roundCurrency(pence / 100);
}

/**
 * Calculates total monthly spending for active and trial subscriptions.
 */
export function calculateMonthlyTotal(subscriptions: Subscription[]): number {
  return sumInMinorUnits(
    subscriptions
      .filter((sub) => sub.status === 'active' || sub.status === 'trial')
      .map((sub) => convertFrequencyToMonthly(sub.price, sub.frequency))
  );
}

/**
 * Calculates total annual projection for active subscriptions.
 */
export function calculateAnnualTotal(subscriptions: Subscription[]): number {
  return sumInMinorUnits(
    subscriptions
      .filter((sub) => sub.status === 'active' || sub.status === 'trial')
      .map((sub) => convertFrequencyToAnnual(sub.price, sub.frequency))
  );
}

/**
 * Calculates accumulated and projected savings from cancelled subscriptions.
 */
export function calculateTotalSavings(subscriptions: Subscription[]): number {
  return sumInMinorUnits(
    subscriptions
      .filter((sub) => sub.status === 'cancelled')
      .map((sub) =>
        typeof sub.monthlySavingsAmount === 'number' && Number.isFinite(sub.monthlySavingsAmount) && sub.monthlySavingsAmount > 0
          ? sub.monthlySavingsAmount
          : convertFrequencyToMonthly(sub.price, sub.frequency)
      )
  );
}

/**
 * Calculates annualized savings from cancelled subscriptions.
 */
export function calculateAnnualSavings(subscriptions: Subscription[]): number {
  return sumInMinorUnits(
    subscriptions
      .filter((sub) => sub.status === 'cancelled')
      .map((sub) =>
        typeof sub.monthlySavingsAmount === 'number' && Number.isFinite(sub.monthlySavingsAmount) && sub.monthlySavingsAmount > 0
          ? sub.monthlySavingsAmount * 12
          : convertFrequencyToAnnual(sub.price, sub.frequency)
      )
  );
}

/**
 * Parses a strict local YYYY-MM-DD key into a local-midnight Date. Returns null for
 * malformed or impossible dates (e.g. 2026-02-30).
 */
export function parseLocalDateKey(value: string | undefined | null): Date | null {
  if (!value || typeof value !== 'string') return null;
  const clean = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const [year, month, day] = clean.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

/**
 * Returns the n-th billing occurrence after an anchor date. Always computed from the
 * original anchor so month-end days don't drift (Jan 31 → Feb 28 → Mar 31, not Mar 28).
 */
export function addBillingCycles(anchor: Date, frequency: SubscriptionFrequency, cycles: number): Date {
  switch (frequency) {
    case 'weekly': {
      const result = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + cycles * 7);
      return result;
    }
    case 'fortnightly': {
      const result = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + cycles * 14);
      return result;
    }
    case 'quarterly':
      return addMonthsClamped(anchor, cycles * 3);
    case 'half-yearly':
      return addMonthsClamped(anchor, cycles * 6);
    case 'yearly':
      return addYearsClamped(anchor, cycles);
    case 'monthly':
    default:
      return addMonthsClamped(anchor, cycles);
  }
}

/**
 * If a renewal date is in the past, rolls it forward to the next valid billing date
 * (on or after today). Dates already in the future are returned unchanged.
 */
export function rollForwardPaymentDate(
  dateKey: string,
  frequency: SubscriptionFrequency,
  today: Date = new Date()
): string {
  const anchor = parseLocalDateKey(dateKey);
  if (!anchor) return dateKey;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (anchor.getTime() >= todayMidnight.getTime()) return dateKey;

  let cycles = 1;
  let candidate = addBillingCycles(anchor, frequency, cycles);
  // Bounded loop (max ~50 years of weekly cycles) to guarantee termination.
  while (candidate.getTime() < todayMidnight.getTime() && cycles < 2600) {
    cycles += 1;
    candidate = addBillingCycles(anchor, frequency, cycles);
  }
  return formatLocalDateKey(candidate);
}

/**
 * Rolls every overdue *active* subscription forward to its next billing date.
 * Trials and cancelled items are left untouched. Returns the same array reference when
 * nothing changes, so it is safe to call inside React effects.
 */
export function normalizeRenewalDates(subscriptions: Subscription[], today: Date = new Date()): Subscription[] {
  let changed = false;
  const next = subscriptions.map((sub) => {
    if (sub.status !== 'active') return sub;
    const rolled = rollForwardPaymentDate(sub.nextPaymentDate, sub.frequency, today);
    if (rolled === sub.nextPaymentDate) return sub;
    changed = true;
    return { ...sub, nextPaymentDate: rolled };
  });
  return changed ? next : subscriptions;
}

/**
 * Lists every charge date (YYYY-MM-DD) for a subscription that falls inside [start, end].
 * Active subscriptions recur from nextPaymentDate; trials first charge at trial end and
 * then recur at their billing frequency. Cancelled subscriptions never charge.
 */
export function getChargeDatesInRange(sub: Subscription, start: Date, end: Date): string[] {
  if (sub.status === 'cancelled') return [];
  const anchorKey = sub.status === 'trial' && sub.trialEndDate ? sub.trialEndDate : sub.nextPaymentDate;
  const anchor = parseLocalDateKey(anchorKey);
  if (!anchor) return [];

  const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const dates: string[] = [];
  for (let cycle = 0; cycle < 2600; cycle += 1) {
    const occurrence = addBillingCycles(anchor, sub.frequency, cycle);
    const ms = occurrence.getTime();
    if (ms > endMs) break;
    if (ms >= startMs) dates.push(formatLocalDateKey(occurrence));
  }
  return dates;
}

export interface RenewalForecastMonth {
  key: string; // YYYY-MM
  label: string; // e.g. "Nov"
  total: number; // exact 2dp total of charges due that month
  isCurrent: boolean;
}

/**
 * Builds an N-month forward renewal forecast (starting with the current month)
 * from real billing dates, summed in pence for exact 2-decimal totals.
 */
export function calculateRenewalForecast(
  subscriptions: Subscription[],
  months = 6,
  today: Date = new Date()
): RenewalForecastMonth[] {
  const result: RenewalForecastMonth[] = [];
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i < months; i += 1) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const rangeStart = i === 0 ? todayMidnight : monthStart;
    let pence = 0;
    subscriptions.forEach((sub) => {
      const charges = getChargeDatesInRange(sub, rangeStart, monthEnd).length;
      pence += charges * toMinorUnits(sub.price);
    });
    result.push({
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      label: monthStart.toLocaleDateString('en-GB', { month: 'short' }),
      total: pence / 100,
      isCurrent: i === 0,
    });
  }
  return result;
}

/**
 * Returns integer days until next payment date.
 * If negative, payment was in the past. Never returns NaN.
 */
export function getDaysUntilNextPayment(dateStr: string, fromDateStr?: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parseDateOnly = (value: string): number | null => {
    const clean = value.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
    const [year, month, day] = clean.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const utc = Date.UTC(year, month - 1, day);
    return Number.isNaN(utc) ? null : utc;
  };
  const target = parseDateOnly(dateStr);
  if (target === null) return 0;
  const today = new Date();
  const parsedFrom = fromDateStr ? parseDateOnly(fromDateStr) : null;
  const now = parsedFrom !== null
    ? parsedFrom
    : Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = target - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Number.isFinite(days) ? days : 0;
}

/**
 * Checks whether user can add another subscription under their current plan.
 * Free plan: base 2 active subscriptions + bonus slots earned via friend invites.
 * Standard and Pro: unlimited.
 */
export function canAddSubscription(
  currentActiveSubscriptionsCount: number,
  plan: UserPlan,
  bonusSlots: number = 0
): { allowed: boolean; maxAllowed: number; currentCount: number; bonusSlots: number } {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(currentActiveSubscriptionsCount) ? currentActiveSubscriptionsCount : 0));
  const safeBonus = Math.max(0, Math.floor(Number.isFinite(bonusSlots) ? bonusSlots : 0));
  const maxAllowed = plan === 'free' ? 2 + safeBonus : Infinity;
  const allowed = safeCount < maxAllowed;
  return {
    allowed,
    maxAllowed,
    currentCount: safeCount,
    bonusSlots: safeBonus,
  };
}

/**
 * Format currency with British formatting and symbol.
 */
export function formatPrice(amount: number, symbol = '£'): string {
  if (!Number.isFinite(amount) || amount === null || amount === undefined) {
    return symbol === 'lei' ? '0.00 lei' : `${symbol}0.00`;
  }
  const formatted = roundCurrency(amount).toFixed(2);
  if (symbol === 'lei') {
    return `${formatted} lei`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Filters and sorts subscriptions.
 */
export function filterAndSortSubscriptions(
  subscriptions: Subscription[],
  options: {
    search?: string;
    statusFilter?: 'all' | 'active' | 'trial' | 'cancelled' | 'renewingSoon';
    sortBy?: 'renewal' | 'priceDesc' | 'priceAsc' | 'name';
  },
  referenceDateStr?: string
): Subscription[] {
  let result = [...subscriptions];

  // Search filter
  if (options.search && options.search.trim() !== '') {
    const q = options.search.toLowerCase().trim();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  // Status filter
  if (options.statusFilter && options.statusFilter !== 'all') {
    if (options.statusFilter === 'renewingSoon') {
      result = result.filter((s) => {
        if (s.status === 'cancelled') return false;
        const days = getDaysUntilNextPayment(s.nextPaymentDate, referenceDateStr);
        return days >= 0 && days <= 5;
      });
    } else {
      result = result.filter((s) => s.status === options.statusFilter);
    }
  }

  // Sorting
  const sortBy = options.sortBy || 'renewal';
  result.sort((a, b) => {
    if (sortBy === 'priceDesc') {
      return (
        convertFrequencyToMonthly(b.price, b.frequency) -
        convertFrequencyToMonthly(a.price, a.frequency)
      );
    }
    if (sortBy === 'priceAsc') {
      return (
        convertFrequencyToMonthly(a.price, a.frequency) -
        convertFrequencyToMonthly(b.price, b.frequency)
      );
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    // Default: renewal date
    const daysA = getDaysUntilNextPayment(a.nextPaymentDate, referenceDateStr);
    const daysB = getDaysUntilNextPayment(b.nextPaymentDate, referenceDateStr);
    return daysA - daysB;
  });

  return result;
}
