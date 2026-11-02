import type { RecurrenceClassification, RecurrenceSummary } from '../types/scanner.types';
import {
  parseLocalDateKey,
  formatLocalDateKey,
  addBillingCycles,
  roundCurrency,
} from '../../utils/subscriptionCalculations';

/**
 * Deterministic Mathematical Recurrence Engine for Monetry.
 *
 * Analyzes candidate transactions using date intervals, variance statistics,
 * and amount consistency. Strictly separates confirmed subscriptions from
 * ordinary repeated spending, unknown merchants, and insufficient data.
 * Pure and deterministic (no floating-point drift, no timezone shifts).
 */

export interface RecurrenceOptions {
  /** Allowed interval range in days for weekly recurrence. Default [6, 8]. */
  weeklyTolerance?: [number, number];
  /** Allowed interval range in days for fortnightly recurrence. Default [13, 15]. */
  fortnightlyTolerance?: [number, number];
  /**
   * Allowed interval range in days for monthly recurrence. Default [26, 34].
   * Explicitly accommodates UK BACS weekend shifts, 28-day February, and 30/31-day months.
   */
  monthlyTolerance?: [number, number];
  /** Allowed interval range in days for annual recurrence. Default [350, 380]. */
  annualTolerance?: [number, number];
  /** Max relative amount variation ((max - min) / mean) before flagged as variable spending. Default 0.08 (±8%). */
  maxAmountVariation?: number;
  /** Whether the merchant matches a known catalogue preset or confirmed learning record. */
  isKnownMerchant?: boolean;
  /** Whether the transaction carries explicit bank markers (Direct Debit, CPA, Card Subscription). */
  hasExplicitBankMarker?: boolean;
  /** Explicit currencies associated with transactions (e.g. ['GBP', 'GBP']). */
  currencies?: (string | null | undefined)[];
  /** Reference date for projecting expected next renewal date. */
  now?: Date;
}

export const DEFAULT_RECURRENCE_OPTIONS: Readonly<Required<Omit<RecurrenceOptions, 'currencies' | 'now'>>> = Object.freeze({
  weeklyTolerance: [6, 8] as [number, number],
  fortnightlyTolerance: [13, 15] as [number, number],
  monthlyTolerance: [26, 34] as [number, number],
  annualTolerance: [350, 380] as [number, number],
  maxAmountVariation: 0.08,
  isKnownMerchant: false,
  hasExplicitBankMarker: false,
});

/**
 * Calculates expected next payment date advancing from `lastDate` by `cycle`.
 * When `now` is provided, rolls forward until the date is today or in the future.
 */
export function calculateExpectedNextDate(
  lastDateIso: string,
  cycle: 'weekly' | 'monthly' | 'annual',
  now?: Date,
): string | null {
  const parsed = parseLocalDateKey(lastDateIso);
  if (!parsed) return null;

  const frequency = cycle === 'annual' ? 'yearly' : cycle === 'weekly' ? 'weekly' : 'monthly';
  let next = addBillingCycles(parsed, frequency, 1);

  if (now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let cycles = 1;
    while (next.getTime() < today.getTime() && cycles < 120) {
      cycles += 1;
      next = addBillingCycles(parsed, frequency, cycles);
    }
  }

  return formatLocalDateKey(next);
}

/**
 * Analyzes transaction dates and amounts to detect recurring patterns.
 *
 * Rules:
 * - Single occurrence -> NEVER recurring (INSUFFICIENT_DATA).
 * - Variable amounts or irregular intervals -> ORDINARY_REPEATED_PURCHASE.
 * - 2 occurrences -> POSSIBLE_RECURRING (or CONFIRMED if explicit bank signal).
 * - Unknown merchants -> require >= 3 occurrences for STRONG_RECURRING_CANDIDATE / UNKNOWN_REQUIRES_CONFIRMATION.
 */
export function analyzeRecurrence(
  dates: readonly (string | null | undefined)[],
  amounts: readonly number[],
  options: RecurrenceOptions = {},
): RecurrenceSummary {
  const reasons: string[] = [];
  const opts = { ...DEFAULT_RECURRENCE_OPTIONS, ...options };

  // 1. Separate currencies & validate
  if (options.currencies && options.currencies.length > 0) {
    const distinctCurrencies = new Set(
      options.currencies.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => c.toUpperCase()),
    );
    if (distinctCurrencies.size > 1) {
      reasons.push(`MIXED_CURRENCIES: ${Array.from(distinctCurrencies).join(', ')}`);
      return {
        classification: 'ORDINARY_REPEATED_PURCHASE',
        cycle: null,
        confidence: 0.1,
        occurrences: amounts.length,
        meanIntervalDays: null,
        intervalStdDevDays: null,
        amountVariation: null,
        expectedNextDate: null,
        reasons,
      };
    }
  }

  // 2. Filter valid amounts and dated entries
  const validAmounts = amounts.filter((a) => typeof a === 'number' && Number.isFinite(a) && a > 0);
  const totalOccurrences = validAmounts.length;

  const datedEntries: { iso: string; timestamp: number; amount: number }[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const rawDate = dates[i];
    const amount = amounts[i];
    if (!rawDate || typeof rawDate !== 'string') continue;
    const parsed = parseLocalDateKey(rawDate);
    if (!parsed) continue;
    const amountVal = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 0;
    datedEntries.push({
      iso: formatLocalDateKey(parsed),
      timestamp: Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
      amount: amountVal,
    });
  }

  datedEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Group timestamps to handle same-day duplicates cleanly without 0-day interval corruption
  const uniqueDatesMap = new Map<number, string>();
  for (const entry of datedEntries) {
    uniqueDatesMap.set(entry.timestamp, entry.iso);
  }
  const uniqueTimestamps = Array.from(uniqueDatesMap.keys()).sort((a, b) => a - b);
  const uniqueDateCount = uniqueTimestamps.length;

  if (datedEntries.length > uniqueDateCount) {
    reasons.push('SAME_DAY_TRANSACTIONS: distinct payments detected on the same date');
  }

  // 3. Check for insufficient data
  if (totalOccurrences < 2 || uniqueDateCount < 2) {
    reasons.push(
      totalOccurrences < 2
        ? 'INSUFFICIENT_DATA: single transaction cannot be statistically classified as recurring'
        : 'INSUFFICIENT_DATA: at least 2 distinct transaction dates required for interval analysis',
    );
    return {
      classification: 'INSUFFICIENT_DATA',
      cycle: null,
      confidence: 0,
      occurrences: totalOccurrences,
      meanIntervalDays: null,
      intervalStdDevDays: null,
      amountVariation: null,
      expectedNextDate: null,
      reasons,
    };
  }

  // 4. Amount variation analysis
  const minAmount = Math.min(...validAmounts);
  const maxAmount = Math.max(...validAmounts);
  const meanAmount = validAmounts.reduce((sum, v) => sum + v, 0) / validAmounts.length;
  const amountVariation = meanAmount > 0 ? roundCurrency((maxAmount - minAmount) / meanAmount) : 0;

  // Check if amount is fixed or within tolerance (e.g. ±8% FX variance or exact match)
  const isFixedAmount = maxAmount - minAmount < 0.01;
  const isAmountConsistent = isFixedAmount || amountVariation <= opts.maxAmountVariation;

  if (!isAmountConsistent) {
    reasons.push(`VARIABLE_AMOUNT: relative variation ${(amountVariation * 100).toFixed(1)}% exceeds threshold`);
  }

  // 5. Interval statistics calculation
  const intervals: number[] = [];
  for (let i = 1; i < uniqueTimestamps.length; i += 1) {
    const diffDays = Math.round((uniqueTimestamps[i] - uniqueTimestamps[i - 1]) / 86_400_000);
    intervals.push(diffDays);
  }

  const sumIntervals = intervals.reduce((acc, val) => acc + val, 0);
  const meanIntervalDays = roundCurrency(sumIntervals / intervals.length);

  const variance =
    intervals.reduce((acc, val) => acc + Math.pow(val - meanIntervalDays, 2), 0) / intervals.length;
  const intervalStdDevDays = roundCurrency(Math.sqrt(variance));

  // 6. Recurrence Cycle Detection
  let detectedCycle: 'weekly' | 'monthly' | 'annual' | null = null;

  const isWeekly = intervals.every(
    (d) =>
      (d >= opts.weeklyTolerance[0] && d <= opts.weeklyTolerance[1]) ||
      (d >= opts.fortnightlyTolerance[0] && d <= opts.fortnightlyTolerance[1]),
  );

  const isMonthlyInterval = intervals.every(
    (d) => d >= opts.monthlyTolerance[0] && d <= opts.monthlyTolerance[1],
  );

  // Day-of-month consistency check for monthly cycles (within ±3 calendar days)
  const daysOfMonth = uniqueTimestamps.map((ts) => new Date(ts).getUTCDate());
  const maxDay = Math.max(...daysOfMonth);
  const minDay = Math.min(...daysOfMonth);
  const isCalendarDayConsistent = maxDay - minDay <= 3;

  const isMonthly = isMonthlyInterval || (isCalendarDayConsistent && meanIntervalDays >= 25 && meanIntervalDays <= 35);

  const isAnnual = intervals.every(
    (d) => d >= opts.annualTolerance[0] && d <= opts.annualTolerance[1],
  );

  if (isAnnual) {
    detectedCycle = 'annual';
    reasons.push(`ANNUAL_INTERVAL: intervals in [${opts.annualTolerance.join(', ')}] days`);
  } else if (isMonthly) {
    detectedCycle = 'monthly';
    reasons.push(
      isMonthlyInterval
        ? `MONTHLY_INTERVAL: intervals in [${opts.monthlyTolerance.join(', ')}] days`
        : `CALENDAR_MONTH_CONSISTENT: billing days consistent within ±3 days`,
    );
  } else if (isWeekly) {
    detectedCycle = 'weekly';
    reasons.push(`WEEKLY_INTERVAL: intervals in [${opts.weeklyTolerance.join(', ')}] days`);
  } else {
    reasons.push(`IRREGULAR_INTERVALS: mean ${meanIntervalDays}d, stdDev ${intervalStdDevDays}d does not fit cycle`);
  }

  // 7. Expected next renewal date
  const latestIso = datedEntries[datedEntries.length - 1].iso;
  const expectedNextDate = detectedCycle ? calculateExpectedNextDate(latestIso, detectedCycle, opts.now) : null;

  // 8. Classification Decision
  let classification: RecurrenceClassification;
  let confidence: number;

  if (!detectedCycle || !isAmountConsistent) {
    classification = 'ORDINARY_REPEATED_PURCHASE';
    confidence = Math.max(0.1, 0.4 - Math.min(0.3, amountVariation));
    reasons.push('ORDINARY_PURCHASE: irregular intervals or variable amount spending');
  } else if (totalOccurrences === 2) {
    if (opts.hasExplicitBankMarker || opts.isKnownMerchant) {
      classification = 'CONFIRMED_SUBSCRIPTION';
      confidence = opts.hasExplicitBankMarker ? 0.95 : 0.88;
      reasons.push(opts.hasExplicitBankMarker ? 'EXPLICIT_BANK_MARKER' : 'KNOWN_MERCHANT_MATCH');
    } else {
      classification = 'POSSIBLE_RECURRING';
      confidence = 0.65;
      reasons.push('POSSIBLE_RECURRING: 2 occurrences with matching interval (needs confirmation)');
    }
  } else {
    // totalOccurrences >= 3 with stable intervals and consistent amounts
    if (opts.hasExplicitBankMarker) {
      classification = 'CONFIRMED_SUBSCRIPTION';
      confidence = 0.98;
      reasons.push('CONFIRMED_SUBSCRIPTION: explicit bank indicator with confirmed mathematical recurrence');
    } else if (opts.isKnownMerchant) {
      classification = 'CONFIRMED_SUBSCRIPTION';
      confidence = 0.95;
      reasons.push('CONFIRMED_SUBSCRIPTION: catalogue merchant with confirmed mathematical recurrence');
    } else {
      // Unknown merchant with >= 3 occurrences
      if (intervalStdDevDays <= 2.0 && amountVariation <= 0.05) {
        classification = 'STRONG_RECURRING_CANDIDATE';
        confidence = 0.86;
        reasons.push('STRONG_RECURRING_CANDIDATE: >=3 occurrences with high interval and amount stability');
      } else {
        classification = 'UNKNOWN_REQUIRES_CONFIRMATION';
        confidence = 0.76;
        reasons.push('UNKNOWN_REQUIRES_CONFIRMATION: recurring pattern detected on unknown merchant');
      }
    }
  }

  return {
    classification,
    cycle: detectedCycle,
    confidence: roundCurrency(confidence),
    occurrences: totalOccurrences,
    meanIntervalDays,
    intervalStdDevDays,
    amountVariation,
    expectedNextDate,
    reasons,
  };
}
