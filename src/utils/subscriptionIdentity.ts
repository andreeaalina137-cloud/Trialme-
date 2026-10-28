interface SubscriptionIdentity {
  id?: string;
  name: string;
  cancelUrl?: string;
  status?: 'active' | 'trial' | 'cancelled';
  trialEndDate?: string;
  nextPaymentDate?: string;
}

function normalizedName(name: string): string {
  return name.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const SCAN_NAME_SUFFIXES = new Set([
  'uk',
  'gb',
  'membership',
  'video',
  'plus',
  'premium',
  'standard',
  'subscription',
  'direct',
  'debit',
  'dd',
  'recurring',
  'ltd',
  'plc',
  'london',
  'luxembourg',
  'dublin',
  'com',
  'co',
  'digital',
  'stream',
  'tv',
  'bill',
  'mktp',
  'services',
  'europe',
  'monthly',
  'annual',
]);

const UK_BANK_OCR_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\b(amzn|amazon)\b.*\bprime\b/i, canonical: 'amazon prime' },
  { pattern: /\bprime\s+video\b/i, canonical: 'amazon prime' },
  { pattern: /\bpure\s*gym(uk|ltd)?\b/i, canonical: 'puregym' },
  { pattern: /\bthe\s+gym\s*(group)?\b/i, canonical: 'the gym group' },
  { pattern: /\bnetflix(uk|com)?\b/i, canonical: 'netflix' },
  { pattern: /\bspotify(uk|ab|gb)?\b/i, canonical: 'spotify' },
  { pattern: /\baudible(uk|co)?\b/i, canonical: 'audible' },
  { pattern: /\bhello\s*fresh(uk)?\b/i, canonical: 'hellofresh' },
  { pattern: /\bnord\s*vpn\b/i, canonical: 'nordvpn' },
  { pattern: /\bexpress\s*vpn\b/i, canonical: 'expressvpn' },
  { pattern: /\bapple\b.*\b(tv|one|icloud)\b/i, canonical: 'apple' },
  { pattern: /\bdisney\b/i, canonical: 'disney' },
  { pattern: /\byoutube\b/i, canonical: 'youtube' },
  { pattern: /\bdeliveroo\b/i, canonical: 'deliveroo' },
  { pattern: /\buber\s*one\b/i, canonical: 'uber one' },
  { pattern: /\bjust\s*eat\b/i, canonical: 'just eat' },
  { pattern: /\bchatgpt\b|\bopenai\b/i, canonical: 'chatgpt' },
  { pattern: /\bclaude\b|\banthropic\b/i, canonical: 'claude pro' },
];

export function normalizeScannedSubscriptionName(name: string): string {
  const cleaned = normalizedName(name);
  if (!cleaned) return '';

  for (const alias of UK_BANK_OCR_ALIASES) {
    if (alias.pattern.test(cleaned)) {
      return alias.canonical;
    }
  }

  const parts = cleaned.split(' ').filter(Boolean);
  while (parts.length > 1 && SCAN_NAME_SUFFIXES.has(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(' ');
}

function providerHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isCurrentlyTrackedSubscription(subscription: SubscriptionIdentity, today = new Date()): boolean {
  if (subscription.status === 'cancelled') return false;
  if (subscription.status !== 'trial') return true;

  const trialEndDate = subscription.trialEndDate || subscription.nextPaymentDate;
  if (!trialEndDate) return true;

  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return trialEndDate >= todayKey;
}

export function isDuplicateSubscription(
  candidate: SubscriptionIdentity,
  existing: SubscriptionIdentity
): boolean {
  if (existing.status && !isCurrentlyTrackedSubscription(existing)) return false;
  if (candidate.id && existing.id && candidate.id === existing.id) return true;

  const candidateName = normalizedName(candidate.name);
  const existingName = normalizedName(existing.name);
  if (!candidateName || !existingName) return false;

  const candidateProvider = providerHost(candidate.cancelUrl);
  const existingProvider = providerHost(existing.cancelUrl);
  const providersCompatible = !candidateProvider || !existingProvider || candidateProvider === existingProvider;

  if (candidateName === existingName) {
    return providersCompatible;
  }

  // Also check OCR / suffix-normalized names (e.g. "Netflix" vs "Netflix UK", "Spotify" vs "Spotify Ltd")
  const normCandScanned = normalizeScannedSubscriptionName(candidate.name);
  const normExistScanned = normalizeScannedSubscriptionName(existing.name);
  if (normCandScanned && normExistScanned && normCandScanned === normExistScanned) {
    return providersCompatible;
  }

  return false;
}

export function isDuplicateScannedSubscription(
  candidate: SubscriptionIdentity,
  existing: SubscriptionIdentity
): boolean {
  if (existing.status && !isCurrentlyTrackedSubscription(existing)) return false;
  const candidateName = normalizeScannedSubscriptionName(candidate.name);
  return candidateName !== '' && candidateName === normalizeScannedSubscriptionName(existing.name);
}
