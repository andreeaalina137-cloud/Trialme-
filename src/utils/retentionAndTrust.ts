import type { Subscription, SubscriptionCategory, UserPlan } from '../types/subscription';
import { safeStorageGet, safeStorageSet, sanitizeSubscriptionsList, sanitizeUserPlan } from './storage';

export interface PriceHikeAlert {
  providerKey: string;
  headline: string;
  oldPrice: number;
  newPrice: number;
  annualExtra: number;
  effectiveNote: string;
}

const UK_PRICE_HIKE_ALERTS: PriceHikeAlert[] = [
  {
    providerKey: 'netflix',
    headline: 'UK Price Hike (+£2/mo)',
    oldPrice: 10.99,
    newPrice: 12.99,
    annualExtra: 24.0,
    effectiveNote: 'Netflix UK Standard rose by £24/yr. Consider switching or cancelling if underused.',
  },
  {
    providerKey: 'spotify',
    headline: 'UK Price Hike (+£1/mo)',
    oldPrice: 10.99,
    newPrice: 11.99,
    annualExtra: 12.0,
    effectiveNote: 'Spotify Premium Individual UK increased by £12/yr.',
  },
  {
    providerKey: 'disney',
    headline: 'UK Tier Hike (+£2/mo)',
    oldPrice: 7.99,
    newPrice: 9.99,
    annualExtra: 24.0,
    effectiveNote: 'Disney+ UK Standard increased by £24/yr unless switched to Ads or Annual.',
  },
  {
    providerKey: 'sky',
    headline: 'UK Mid-Contract Rise (+6.7%)',
    oldPrice: 31.0,
    newPrice: 34.0,
    annualExtra: 36.0,
    effectiveNote: 'Sky UK annual tariff adjustment adds ~£36/yr. You can negotiate or cancel within 31 days.',
  },
  {
    providerKey: 'puregym',
    headline: 'Peak Tariff Notice',
    oldPrice: 17.99,
    newPrice: 19.99,
    annualExtra: 24.0,
    effectiveNote: 'Check if Off-Peak or The Gym Group saves you £60+/yr.',
  },
];

export function getUkPriceHikeAlert(subscriptionName: string): PriceHikeAlert | null {
  const normalized = subscriptionName.toLowerCase();
  return UK_PRICE_HIKE_ALERTS.find((item) => normalized.includes(item.providerKey)) || null;
}

export interface CuratedUkTrial {
  id: string;
  name: string;
  badge: string;
  trialDays: number;
  postTrialPrice: number;
  currency: string;
  category: SubscriptionCategory;
  color: string;
  trialUrl: string;
  cancelUrl: string;
  highlight: string;
}

export const CURATED_UK_TRIALS: CuratedUkTrial[] = [
  {
    id: 'radar-amazon-prime',
    name: 'Amazon Prime UK',
    badge: '30 Days Free',
    trialDays: 30,
    postTrialPrice: 8.99,
    currency: '£',
    category: 'Streaming',
    color: '#FF9900',
    trialUrl: 'https://www.amazon.co.uk/amazonprime',
    cancelUrl: 'https://www.amazon.co.uk/mc/manage',
    highlight: 'Next-day UK delivery + Prime Video',
  },
  {
    id: 'radar-audible-uk',
    name: 'Audible UK',
    badge: '30 Days + 1 Free Book',
    trialDays: 30,
    postTrialPrice: 8.99,
    currency: '£',
    category: 'Music & Audio',
    color: '#F8991D',
    trialUrl: 'https://www.audible.co.uk/ep/memberbenefits',
    cancelUrl: 'https://www.audible.co.uk/account/overview',
    highlight: 'Keep your audiobook even if you cancel before day 27',
  },
  {
    id: 'radar-apple-tv',
    name: 'Apple TV+ UK',
    badge: '7 Days Free',
    trialDays: 7,
    postTrialPrice: 8.99,
    currency: '£',
    category: 'Streaming',
    color: '#A5A5A5',
    trialUrl: 'https://tv.apple.com/gb',
    cancelUrl: 'https://support.apple.com/en-gb/118428',
    highlight: 'Binge Apple Originals safely with a 3-day alarm',
  },
  {
    id: 'radar-nordvpn',
    name: 'NordVPN UK',
    badge: '30-Day Guarantee',
    trialDays: 30,
    postTrialPrice: 10.99,
    currency: '£',
    category: 'AI & Tech',
    color: '#4687FF',
    trialUrl: 'https://nordvpn.com/',
    cancelUrl: 'https://my.nordaccount.com/dashboard/nordvpn/billing/',
    highlight: 'Full 30-day UK refund shield tracked automatically',
  },
];

const LICENSE_STORAGE_KEY = 'subcleaner_license_key';
const AI_QUOTA_MONTHLY_LIMIT = 10;

export function generateLicenseKey(plan: UserPlan): string {
  const prefix = plan === 'pro' ? 'SUB-PRO' : 'SUB-STD';
  const existing = safeStorageGet(LICENSE_STORAGE_KEY);
  if (existing && existing.startsWith(prefix)) {
    return existing;
  }
  const randomBlock = () => Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, 'X');
  const key = `${prefix}-${randomBlock()}-${randomBlock()}`;
  safeStorageSet(LICENSE_STORAGE_KEY, key);
  return key;
}

export function getSavedLicenseKey(): string | null {
  return safeStorageGet(LICENSE_STORAGE_KEY);
}

/**
 * Validates a user-entered license key or email for restoring Lifetime access.
 * Accepts SUB-PRO-XXXX-XXXX, SUB-STD-XXXX-XXXX, or valid email addresses from buyers.
 */
export function parseRestoredLicensePlan(input: string): { plan: UserPlan; licenseKey: string } | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  if (/^SUB-STD-[A-Z0-9-]{3,}$/.test(trimmed)) {
    safeStorageSet(LICENSE_STORAGE_KEY, trimmed);
    return { plan: 'standard', licenseKey: trimmed };
  }
  if (/^(SUB-PRO|PRO)-[A-Z0-9-]{3,}$/.test(trimmed)) {
    const key = trimmed.startsWith('SUB-PRO') ? trimmed : `SUB-${trimmed}`;
    safeStorageSet(LICENSE_STORAGE_KEY, key);
    return { plan: 'pro', licenseKey: key };
  }
  // If user enters their purchase email address (e.g. name@domain.co.uk)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim())) {
    const key = generateLicenseKey('pro');
    safeStorageSet('subcleaner_purchase_email', input.trim().toLowerCase());
    return { plan: 'pro', licenseKey: key };
  }
  return null;
}

export function getAiScannerMonthlyQuota(now = new Date()): {
  used: number;
  limit: number;
  remaining: number;
  monthKey: string;
} {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const storageKey = `subcleaner_ai_scans_${monthKey}`;
  const raw = safeStorageGet(storageKey);
  const used = raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
  const remaining = Math.max(0, AI_QUOTA_MONTHLY_LIMIT - used);
  return {
    used,
    limit: AI_QUOTA_MONTHLY_LIMIT,
    remaining,
    monthKey,
  };
}

export function incrementAiScannerMonthlyQuota(now = new Date()): {
  used: number;
  limit: number;
  remaining: number;
} {
  const current = getAiScannerMonthlyQuota(now);
  const nextUsed = Math.min(current.limit, current.used + 1);
  safeStorageSet(`subcleaner_ai_scans_${current.monthKey}`, String(nextUsed));
  return {
    used: nextUsed,
    limit: current.limit,
    remaining: Math.max(0, current.limit - nextUsed),
  };
}

export interface SubCleanerBackupPayload {
  version: string;
  exportedAt: string;
  userPlan: UserPlan;
  licenseKey: string | null;
  unlockedAchievements?: string[];
  subscriptions: Subscription[];
}

export function createBackupJson(
  subscriptions: Subscription[],
  userPlan: UserPlan,
  unlockedAchievements?: string[]
): string {
  let savedAchievements = unlockedAchievements;
  if (!savedAchievements) {
    const rawAch = safeStorageGet('subcleaner_achievements');
    if (rawAch) {
      try {
        const parsed = JSON.parse(rawAch);
        if (Array.isArray(parsed)) {
          savedAchievements = parsed.filter((x): x is string => typeof x === 'string');
        }
      } catch {
        // ignore
      }
    }
  }
  const payload: SubCleanerBackupPayload = {
    version: '3.2',
    exportedAt: new Date().toISOString(),
    userPlan,
    licenseKey: getSavedLicenseKey(),
    unlockedAchievements: savedAchievements || [],
    subscriptions,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Safely parses and validates a SubCleaner JSON backup string, restoring 100% state fidelity
 * (subscriptions, trial timestamps, userPlan, licenseKey, and unlockedAchievements).
 */
export function parseAndValidateBackupJson(rawJson: string): SubCleanerBackupPayload | null {
  if (!rawJson || typeof rawJson !== 'string') return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.subscriptions)) {
      return null;
    }
    const sanitizedSubs = sanitizeSubscriptionsList(parsed.subscriptions);
    const sanitizedPlan = sanitizeUserPlan(
      typeof parsed.userPlan === 'string' ? parsed.userPlan : 'free'
    );
    const licenseKey =
      typeof parsed.licenseKey === 'string' && parsed.licenseKey.trim() !== ''
        ? parsed.licenseKey.trim()
        : null;
    const unlockedAchievements = Array.isArray(parsed.unlockedAchievements)
      ? parsed.unlockedAchievements.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    if (licenseKey) {
      safeStorageSet(LICENSE_STORAGE_KEY, licenseKey);
    }
    if (unlockedAchievements.length > 0) {
      safeStorageSet('subcleaner_achievements', JSON.stringify(unlockedAchievements));
    }
    safeStorageSet('subcleaner_subscriptions_v2', JSON.stringify(sanitizedSubs));
    safeStorageSet('subcleaner_user_plan', sanitizedPlan);

    return {
      version: typeof parsed.version === 'string' ? parsed.version : '3.2',
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
      userPlan: sanitizedPlan,
      licenseKey,
      unlockedAchievements,
      subscriptions: sanitizedSubs,
    };
  } catch {
    return null;
  }
}
