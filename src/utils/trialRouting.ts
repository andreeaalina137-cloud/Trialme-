import { POPULAR_PRESETS, type PopularPreset } from '../data/popularPresets';
import type { PendingTrialActivation } from '../components/ConfirmTrialActivationModal';
import { getAffiliateOffer } from '../data/cheaperAlternatives';

export function buildTrialUrl(presetId: string): string {
  return `?trial=${encodeURIComponent(presetId)}`;
}

export function parseTrialIdentifier(urlOrSearch: string, pathname?: string): string | null {
  if (!urlOrSearch && !pathname) return null;

  // 1. Try search query params
  try {
    const searchPart = urlOrSearch.includes('?') ? urlOrSearch.split('?')[1] : urlOrSearch;
    const params = new URLSearchParams(searchPart);
    const trialQuery = params.get('trial');
    if (trialQuery && trialQuery.trim()) {
      return decodeURIComponent(trialQuery.trim());
    }
  } catch {
    // URLSearchParams error guard
  }

  // 2. Try pathname /trial/:id
  const targetPath = pathname || (urlOrSearch.startsWith('/') ? urlOrSearch.split('?')[0] : '');
  const match = targetPath.match(/\/trial\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

export function findPresetByTrialIdentifier(identifier: string): PopularPreset | undefined {
  if (!identifier) return undefined;
  const clean = identifier.trim().toLowerCase();

  // 1. Exact ID match
  const exact = POPULAR_PRESETS.find((p) => p.id.toLowerCase() === clean);
  if (exact) return exact;

  // 2. ID prefix / alias match (e.g. 'netflix' -> 'netflix_standard_uk', 'spotify' -> 'spotify_premium_uk')
  const byPrefix = POPULAR_PRESETS.find((p) => {
    const pId = p.id.toLowerCase();
    return pId.startsWith(clean) || clean.startsWith(pId);
  });
  if (byPrefix) return byPrefix;

  // 3. Name match
  const byName = POPULAR_PRESETS.find((p) => {
    const pName = p.name.toLowerCase();
    return pName.includes(clean) || clean.includes(pName);
  });
  if (byName) return byName;

  // 4. Keywords match
  return POPULAR_PRESETS.find((p) => p.keywords?.some((k) => k.toLowerCase() === clean));
}

export function createPendingTrialFromPreset(
  preset: PopularPreset,
  currencySymbol = '£'
): PendingTrialActivation {
  const offer = getAffiliateOffer(preset.name);
  const trialDays = preset.defaultTrialDays ?? offer?.trialDays ?? preset.trialDurationDays ?? 30;
  const trialUrl = preset.trialUrl || offer?.trialUrl;

  return {
    name: preset.name,
    price: preset.price,
    currency: preset.currency || currencySymbol,
    frequency: preset.frequency,
    category: preset.category,
    defaultTrialDays: trialDays,
    trialUrl,
    cancelUrl: preset.cancelUrl,
    cancelEmail: preset.cancelEmail,
    cancelGuideSteps: preset.cancelSteps,
    color: preset.color,
    notes: preset.description || preset.notes,
  };
}
