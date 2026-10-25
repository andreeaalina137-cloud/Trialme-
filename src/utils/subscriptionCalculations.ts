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
 */
export function convertFrequencyToMonthly(price: number, frequency: SubscriptionFrequency): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  switch (frequency) {
    case 'weekly':
      return (price * 52) / 12;
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
    case 'monthly':
      return price * 12;
    case 'yearly':
    default:
      return price;
  }
}

/**
 * Calculates total monthly spending for active and trial subscriptions.
 */
export function calculateMonthlyTotal(subscriptions: Subscription[]): number {
  const raw = subscriptions
    .filter((sub) => sub.status === 'active' || sub.status === 'trial')
    .reduce((sum, sub) => sum + convertFrequencyToMonthly(sub.price, sub.frequency), 0);
  return roundCurrency(raw);
}

/**
 * Calculates total annual projection for active subscriptions.
 */
export function calculateAnnualTotal(subscriptions: Subscription[]): number {
  const raw = subscriptions
    .filter((sub) => sub.status === 'active' || sub.status === 'trial')
    .reduce((sum, sub) => sum + convertFrequencyToAnnual(sub.price, sub.frequency), 0);
  return roundCurrency(raw);
}

/**
 * Calculates accumulated and projected savings from cancelled subscriptions.
 */
export function calculateTotalSavings(subscriptions: Subscription[]): number {
  const cancelledSubs = subscriptions.filter((sub) => sub.status === 'cancelled');
  const raw = cancelledSubs.reduce((sum, sub) => {
    const monthlyRate =
      typeof sub.monthlySavingsAmount === 'number' && Number.isFinite(sub.monthlySavingsAmount) && sub.monthlySavingsAmount > 0
        ? sub.monthlySavingsAmount
        : convertFrequencyToMonthly(sub.price, sub.frequency);
    return sum + monthlyRate;
  }, 0);
  return roundCurrency(raw);
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
 * Free plan: maximum 2 active subscriptions. When trying to add a 3rd, prompt paywall!
 * Standard and Pro: unlimited.
 */
export function canAddSubscription(
  currentActiveSubscriptionsCount: number,
  plan: UserPlan
): { allowed: boolean; maxAllowed: number; currentCount: number } {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(currentActiveSubscriptionsCount) ? currentActiveSubscriptionsCount : 0));
  const maxAllowed = plan === 'free' ? 2 : Infinity;
  const allowed = safeCount < maxAllowed;
  return {
    allowed,
    maxAllowed,
    currentCount: safeCount,
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
