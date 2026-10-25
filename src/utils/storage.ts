import type {
  AppCurrency,
  Subscription,
  SubscriptionCategory,
  SubscriptionFrequency,
  SubscriptionStatus,
  UserPlan,
} from '../types/subscription';

const memoryStorage = new Map<string, string>();

function getStorageBackend(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Fallback to in-memory storage if browser storage is blocked
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    },
  };
}

export function safeStorageGet(key: string): string | null {
  try {
    return getStorageBackend().getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): boolean {
  try {
    getStorageBackend().setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(key: string): boolean {
  try {
    getStorageBackend().removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearMemoryStorage(): void {
  memoryStorage.clear();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  } catch {
    // ignore
  }
}

export function sanitizeUserPlan(raw: unknown): UserPlan {
  if (raw === 'pro' || raw === 'standard' || raw === 'free') {
    return raw;
  }
  return 'free';
}

export function sanitizeCurrency(raw: unknown): AppCurrency {
  if (raw === 'GBP' || raw === 'EUR' || raw === 'USD' || raw === 'RON') {
    return raw;
  }
  return 'GBP';
}

const VALID_FREQUENCIES = new Set<SubscriptionFrequency>(['monthly', 'yearly', 'weekly']);
const VALID_STATUSES = new Set<SubscriptionStatus>(['active', 'trial', 'cancelled']);
const VALID_CATEGORIES = new Set<SubscriptionCategory>([
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
]);

export function sanitizeSubscriptionItem(raw: unknown, index = 0): Subscription | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;

  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) return null;

  const numPrice = typeof item.price === 'number' ? item.price : Number(item.price);
  if (!Number.isFinite(numPrice) || numPrice <= 0) return null;

  const price = Math.round((Math.min(numPrice, 50000) + Number.EPSILON) * 100) / 100;
  const frequency: SubscriptionFrequency = VALID_FREQUENCIES.has(item.frequency as SubscriptionFrequency)
    ? (item.frequency as SubscriptionFrequency)
    : 'monthly';
  const status: SubscriptionStatus = VALID_STATUSES.has(item.status as SubscriptionStatus)
    ? (item.status as SubscriptionStatus)
    : 'active';
  const category: SubscriptionCategory = VALID_CATEGORIES.has(item.category as SubscriptionCategory)
    ? (item.category as SubscriptionCategory)
    : 'Other';

  const rawNextDate = typeof item.nextPaymentDate === 'string' ? item.nextPaymentDate.slice(0, 10) : '';
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(rawNextDate) && !Number.isNaN(new Date(`${rawNextDate}T00:00:00Z`).getTime());
  const fallbackDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextPaymentDate = isValidDate ? rawNextDate : fallbackDate;

  const id = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : `sub-recovered-${Date.now()}-${index}`;

  const reminderNum = Number(item.reminderDaysBefore);
  const reminderDaysBefore = Number.isFinite(reminderNum) && reminderNum > 0
    ? Math.min(30, Math.round(reminderNum))
    : 3;

  return {
    id,
    name,
    price,
    currency: typeof item.currency === 'string' && item.currency.trim() ? item.currency.trim() : '£',
    frequency,
    category,
    nextPaymentDate,
    status,
    trialEndDate: typeof item.trialEndDate === 'string' ? item.trialEndDate.slice(0, 10) : undefined,
    trialStartAt: typeof item.trialStartAt === 'string' ? item.trialStartAt : undefined,
    trialExpiresAt: typeof item.trialExpiresAt === 'string' ? item.trialExpiresAt : undefined,
    trialDurationDays: typeof item.trialDurationDays === 'number' && Number.isFinite(item.trialDurationDays)
      ? item.trialDurationDays
      : undefined,
    alarmArmedAt: typeof item.alarmArmedAt === 'string' ? item.alarmArmedAt : undefined,
    color: typeof item.color === 'string' && item.color.trim() ? item.color.trim() : '#14B8A6',
    notes: typeof item.notes === 'string' ? item.notes : undefined,
    cancelUrl: typeof item.cancelUrl === 'string' ? item.cancelUrl : undefined,
    cancelEmail: typeof item.cancelEmail === 'string' ? item.cancelEmail : undefined,
    cancelGuideSteps: Array.isArray(item.cancelGuideSteps)
      ? item.cancelGuideSteps.filter((s): s is string => typeof s === 'string')
      : undefined,
    reminderDaysBefore,
    paymentHistory: Array.isArray(item.paymentHistory) ? item.paymentHistory : [],
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : nextPaymentDate,
    cancelledAt: typeof item.cancelledAt === 'string' ? item.cancelledAt : undefined,
    monthlySavingsAmount: typeof item.monthlySavingsAmount === 'number' && Number.isFinite(item.monthlySavingsAmount)
      ? Math.round((item.monthlySavingsAmount + Number.EPSILON) * 100) / 100
      : undefined,
  };
}

export function sanitizeSubscriptionsList(raw: unknown): Subscription[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const result: Subscription[] = [];

  raw.forEach((entry, index) => {
    const clean = sanitizeSubscriptionItem(entry, index);
    if (!clean) return;
    let uniqueId = clean.id;
    if (seenIds.has(uniqueId)) {
      uniqueId = `${clean.id}-${index}`;
    }
    seenIds.add(uniqueId);
    result.push({ ...clean, id: uniqueId });
  });

  return result;
}

export function loadPersistedSubscriptions(fallback: Subscription[] = []): Subscription[] {
  const rawJson = safeStorageGet('subcleaner_subscriptions_v2') ?? safeStorageGet('subcleaner_subscriptions');
  if (!rawJson) return fallback;
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return fallback;
    return sanitizeSubscriptionsList(parsed);
  } catch {
    return fallback;
  }
}
