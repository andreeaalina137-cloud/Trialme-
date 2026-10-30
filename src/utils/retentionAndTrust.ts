import type { Subscription, SubscriptionCategory, UserPlan } from '../types/subscription';
import type { TrialType, MonetryDatabase } from '../types/database';
import { safeStorageGet, safeStorageSet, sanitizeSubscriptionsList, sanitizeUserPlan } from './storage';
import { getDatabase, subscribeToDatabaseUpdates } from '../services/databaseService';

export interface PriceHikeAlert {
  providerKey: string;
  headline: string;
  oldPrice: number;
  newPrice: number;
  annualExtra: number;
  effectiveNote: string;
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
  notes?: string;
  trialType?: TrialType;
}

const CURATED_TRIAL_METADATA: Record<
  string,
  {
    badge: string;
    color: string;
    trialUrl: string;
    highlight: string;
  }
> = {
  amazon_prime_uk: {
    badge: '30 Days Free',
    color: '#FF9900',
    trialUrl: 'https://www.amazon.co.uk/amazonprime',
    highlight: 'Next-day UK delivery + Prime Video',
  },
  audible_uk: {
    badge: '30 Days + 1 Free Book',
    color: '#F8991D',
    trialUrl: 'https://www.audible.co.uk/ep/memberbenefits',
    highlight: 'Keep your audiobook even if you cancel before day 27',
  },
  apple_tv_plus_uk: {
    badge: '7 Days Free',
    color: '#A5A5A5',
    trialUrl: 'https://tv.apple.com/gb',
    highlight: 'Binge Apple Originals safely with a 3-day alarm',
  },
  nordvpn_uk: {
    badge: '30-Day Guarantee',
    color: '#4687FF',
    trialUrl: 'https://nordvpn.com/',
    highlight: 'Full 30-day UK refund shield tracked automatically',
  },
};

const HIKE_ALERT_METADATA: Record<string, { providerKey: string; headline: string; effectiveNote: string }> = {
  netflix_standard_uk: {
    providerKey: 'netflix',
    headline: 'UK Price Hike (+£2/mo)',
    effectiveNote: 'Netflix UK Standard rose by £24/yr. Consider switching or cancelling if underused.',
  },
  spotify_premium_uk: {
    providerKey: 'spotify',
    headline: 'UK Price Hike (+£1/mo)',
    effectiveNote: 'Spotify Premium Individual UK increased by £12/yr.',
  },
  disney_plus_uk: {
    providerKey: 'disney',
    headline: 'UK Tier Hike (+£2/mo)',
    effectiveNote: 'Disney+ UK Standard increased by £24/yr unless switched to Ads or Annual.',
  },
  sky_stream_uk: {
    providerKey: 'sky',
    headline: 'UK Mid-Contract Rise (+£3/mo)',
    effectiveNote: 'Sky UK annual tariff adjustment adds ~£36/yr. You can negotiate or cancel within 31 days.',
  },
  puregym_core_uk: {
    providerKey: 'puregym',
    headline: 'Peak Tariff Notice (+£3/mo)',
    effectiveNote: 'Check if Off-Peak or The Gym Group saves you £60+/yr.',
  },
  microsoft_365_personal_uk: {
    providerKey: 'microsoft',
    headline: 'Copilot AI Bundle Hike (+£2.50/mo)',
    effectiveNote: 'Microsoft 365 Personal increased by £30/yr after Copilot AI integration.',
  },
};

export function buildPriceHikeAlerts(db: MonetryDatabase = getDatabase()): PriceHikeAlert[] {
  return db.uk_price_hike_alerts.map((raw) => {
    const meta = HIKE_ALERT_METADATA[raw.service_id] || {
      providerKey: raw.service_id.split('_')[0],
      headline: `${raw.service_name} Price Hike`,
      effectiveNote: `${raw.service_name} increased by £${raw.annual_impact_gbp}/yr.`,
    };
    return {
      providerKey: meta.providerKey,
      headline: meta.headline,
      oldPrice: raw.old_price_gbp,
      newPrice: raw.new_price_gbp,
      annualExtra: raw.annual_impact_gbp,
      effectiveNote: meta.effectiveNote,
    };
  });
}

export function buildCuratedUkTrials(db: MonetryDatabase = getDatabase()): CuratedUkTrial[] {
  const trialIdSet = new Set(db.curated_uk_trials);
  return db.presets
    .filter((p) => trialIdSet.has(p.id))
    .map((preset) => {
      const meta = CURATED_TRIAL_METADATA[preset.id] || {
        badge: `${preset.trial_duration_days || 7} Days Free`,
        color: '#D4AF7C',
        trialUrl: preset.cancel_url,
        highlight: preset.notes,
      };
      return {
        id: preset.id,
        name: preset.name,
        badge: meta.badge,
        trialDays: preset.trial_duration_days || 7,
        postTrialPrice: preset.monthly_price_gbp,
        currency: '£',
        category: preset.category,
        color: meta.color,
        trialUrl: meta.trialUrl,
        cancelUrl: preset.cancel_url,
        highlight: meta.highlight,
        notes: preset.notes,
        trialType: preset.trial_type,
      };
    });
}

export let UK_PRICE_HIKE_ALERTS: PriceHikeAlert[] = buildPriceHikeAlerts();
export let CURATED_UK_TRIALS: CuratedUkTrial[] = buildCuratedUkTrials();

subscribeToDatabaseUpdates((updatedDb) => {
  UK_PRICE_HIKE_ALERTS = buildPriceHikeAlerts(updatedDb);
  CURATED_UK_TRIALS = buildCuratedUkTrials(updatedDb);
});

export function getUkPriceHikeAlert(subscriptionName: string): PriceHikeAlert | null {
  const normalized = subscriptionName.toLowerCase();
  return UK_PRICE_HIKE_ALERTS.find((item) => normalized.includes(item.providerKey)) || null;
}

const LICENSE_STORAGE_KEY = 'subcleaner_license_key';
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
