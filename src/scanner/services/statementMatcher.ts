import { getPresets } from '../../services/databaseService';
import type { PresetService } from '../../types/database';
import type { SubscriptionCategory, SubscriptionFrequency } from '../../types/subscription';
import {
  parseLocalDateKey,
  rollForwardPaymentDate,
} from '../../utils/subscriptionCalculations';
import type {
  BillingCycle,
  MatchedSubscription,
  MatchTier,
  ScannedTransaction,
  StatementPreset,
} from '../types/scanner.types';

const FUZZY_MIN_SIMILARITY = 0.75;
const FUZZY_MAX_EDITS = 2;

const OCR_ALIASES: Record<string, string[]> = {
  netflix_standard_uk: [
    'NETFLIX.COM',
    'NETFLIX',
    'NTFLIX',
    'NETFLX',
    'NFLX',
    'NETFLIX UK',
    'NETFLIX COM',
    'NETFLIX ENTERTAINMENT',
  ],
  spotify_premium_uk: [
    'SPOTIFY',
    'SPTFY',
    'SPOTFY',
    'SPOTIFY UK',
    'SPOTIFYUK',
    'SPOTIFY P',
    'SPOTIFY AB',
    'SPOTIFY.COM',
    'SPOTIFY RECURRING',
    'SPOTIFY LIMITED',
  ],
  disney_plus_uk: [
    'DISNEY PLUS',
    'DISNEY+',
    'DISNEYPLUS',
    'DISNEY PLUS UK',
    'DISNEY UK',
    'DISNEY STREAMING',
    'DISNEY MEDIA',
    'THE WALT DISNEY',
    'DISNEY',
    'DISNY',
  ],
  amazon_prime_uk: [
    'AMAZON PRIME',
    'AMZN PRIME',
    'PRIME VIDEO',
    'AMAZON.CO.UK',
    'AMZN MKTP UK',
    'AMZN MKTP',
    'AMAZON DIGITAL',
    'AMAZON VIDEO',
    'AMAZON UK',
    'AMZN UK',
    'AMAZON MEMBERSHIP',
    'AMZN',
  ],
  apple_tv_plus_uk: [
    'APPLE TV',
    'APPLE TV+',
    'TV.APPLE',
    'APPLE.COM BILL',
    'APPLE SERVICES',
    'APPL TV',
  ],
  now_tv_uk: ['NOW TV', 'NOWTV', 'NOW TV UK', 'NOW DIGITAL'],
  sky_stream_uk: [
    'SKY DIGITAL',
    'SKY SUBSCRIPTION',
    'BSKYB',
    'SKY UK',
    'SKY STREAM',
    'SKY TV',
  ],
  youtube_premium_uk: [
    'YOUTUBE PREMIUM',
    'YOUTUBE',
    'YOUTUBEPREMIUM',
    'GOOGLE *YOUTUBE',
    'GOOGLE YOUTUBE',
    'YOUTUBE*PREMIUM',
    'GOOGLE*YOUTUBE',
    'YOUTUBE MEMBER',
    'GOOGLE YOUTUBE PREMIUM',
    'YOUTUBE UK',
    'YOUTBE',
    'YT PREMIUM',
  ],
  audible_uk: ['AUDIBLE', 'AUDIBLEUK', 'AUDIBLE UK', 'AMAZON AUDIBLE'],
  bbc_tv_licence: ['TV LICENSING', 'TV LICENCE', 'BBC TV', 'BBC TV LICENCE'],
  dazn_uk: ['DAZN', 'DAZN UK'],
  paramount_plus_uk: ['PARAMOUNT+', 'PARAMOUNT PLUS', 'PARAMOUNT', 'PARAMOUNT UK'],
  discovery_plus_tnt_uk: [
    'DISCOVERY+',
    'TNT SPORTS',
    'DISCOVERYPLUS',
    'DISCOVERY',
    'DISCOVERY PLUS',
  ],
  the_guardian_digital: ['THE GUARDIAN', 'GUARDIAN', 'GUARDIAN DIGITAL'],
  puregym_core_uk: ['PUREGYM', 'PURE GYM', 'P GYM', 'PUREGYM LTD'],
  the_gym_group_uk: ['THE GYM GROUP', 'THEGYM', 'THE GYM'],
  david_lloyd_uk: ['DAVID LLOYD', 'DAVID LLOYD CLUBS'],
  jd_gyms_uk: ['JD GYMS', 'JD GYM'],
  virgin_active_uk: ['VIRGIN ACTIVE'],
  strava_uk: ['STRAVA'],
  myfitnesspal_premium_uk: ['MYFITNESSPAL', 'MFP PREMIUM'],
  whoop_uk: ['WHOOP'],
  headspace_uk: ['HEADSPACE'],
  calm_premium_uk: ['CALM.COM', 'CALM APP', 'CALM'],
  playstation_plus_uk: ['PLAYSTATION PLUS', 'PLAYSTATION', 'SONY INTERACTIVE', 'PSN'],
  xbox_game_pass_ultimate_uk: ['GAME PASS', 'XBOX', 'MICROSOFT XBOX'],
  nintendo_switch_online_uk: ['NINTENDO SWITCH', 'NINTENDO'],
  chatgpt_plus_uk: ['OPENAI CHATGPT', 'CHATGPT', 'CHATGPT PLUS'],
  claude_pro_uk: ['ANTHROPIC', 'CLAUDE.AI', 'CLAUDE', 'CLAUDE PRO'],
  apple_icloud_200gb_uk: ['ICLOUD', 'APPLE ICLOUD'],
  google_one_ai_uk: [
    'GOOGLE ONE',
    'GOOGLE*ONE',
    'GOOGLE *GOOGLE ONE',
    'GOOGLE*GOOGLE ONE',
    'GOOGLE *SERVICES',
    'GOOGLE STORAGE',
    'G.CO/HELPAY#',
    'GOOGLE*CLOUD',
    'GOOGLE PLAY*GOOGLE ONE',
    'GOOGLE PLAY*ONE',
    'GOOGLE ONE UK',
    'GOOGLEONE',
    'GGL ONE',
    'GOOGLE SERVICES',
  ],
  microsoft_365_personal_uk: [
    'MICROSOFT 365',
    'MSFT 365',
    'MSFT *',
    'MSFT *365',
    'MICROSOFT*365',
    'MICROSOFT*',
    'OFFICE 365',
    'MSFT*OFFICE',
    'MICROSOFT*OFFICE',
    'MICROSOFT OFFICE',
    'MSFT STORAGE',
    'MICROSOFT CORP',
    'MICROSOFT',
    'MSFT',
    'MCRSFT',
  ],
  nordvpn_uk: ['NORDVPN', 'NORD VPN'],
  expressvpn_uk: ['EXPRESSVPN', 'EXPRESS VPN'],
  adobe_creative_cloud_uk: ['ADOBE SYSTEMS', 'ADOBE CC', 'ADOBE', 'ADOBE CREATIVE CLOUD'],
  canva_pro_uk: ['CANVA PRO', 'CANVA'],
  deliveroo_plus_uk: ['DELIVEROO PLUS', 'DELIVEROO'],
  uber_one_uk: ['UBER ONE', 'UBER *ONE', 'UBERONE'],
  just_eat_plus_uk: ['JUST EAT', 'JUSTEAT'],
  hellofresh_uk: ['HELLOFRESH', 'HELLO FRESH'],
  gousto_uk: ['GOUSTO'],
  club_pret_uk: ['PRET A MANGER', 'CLUB PRET', 'PRET'],
  tesco_clubcard_plus_uk: ['TESCO CLUBCARD', 'CLUBCARD PLUS', 'TESCO'],
  asos_premier_uk: ['ASOS PREMIER', 'ASOS'],
  experian_creditexpert_uk: ['EXPERIAN', 'CREDITEXPERT'],
  clearscore_protect_uk: ['CLEARSCORE'],
  equifax_uk: ['EQUIFAX'],
  monzo_perks_uk: ['MONZO PERKS', 'MONZO PLUS'],
  revolut_premium_uk: [
    'REVOLUT PREMIUM',
    'REVOLUT*PREMIUM',
    'TAXA PLAN METAL',
    'TAX PLAN METAL',
    'METAL PLAN FEE',
  ],
};

const TRAP_PRESET_IDS = new Set([
  'adobe_creative_cloud_uk',
  'puregym_core_uk',
  'dazn_uk',
  'david_lloyd_uk',
  'whoop_uk',
  'sky_stream_uk',
  'apple_tv_plus_uk',
]);

const TRAP_NOTE_PATTERN =
  /\bTRAP\b|early (?:termination|cancellation) fee|PIN hurdle|lock-in|NOTICE TRAP|written notice|hardware return/i;

const PRESET_COLORS: Record<string, string> = {
  netflix_standard_uk: '#E50914',
  spotify_premium_uk: '#1DB954',
  disney_plus_uk: '#113CCF',
  amazon_prime_uk: '#FF9900',
  apple_tv_plus_uk: '#A5A5A5',
  now_tv_uk: '#00877C',
  sky_stream_uk: '#0072C9',
  youtube_premium_uk: '#FF0000',
  audible_uk: '#F8991D',
  bbc_tv_licence: '#E01919',
  dazn_uk: '#FAB400',
  paramount_plus_uk: '#0064FF',
  discovery_plus_tnt_uk: '#0056FF',
  the_guardian_digital: '#052962',
  puregym_core_uk: '#00A499',
  the_gym_group_uk: '#FF5A00',
  david_lloyd_uk: '#003B5C',
  jd_gyms_uk: '#D4AF37',
  virgin_active_uk: '#E10A0A',
  strava_uk: '#FC4C02',
  myfitnesspal_premium_uk: '#0066EE',
  whoop_uk: '#10B981',
  headspace_uk: '#F47D31',
  calm_premium_uk: '#38BDF8',
  playstation_plus_uk: '#00439C',
  xbox_game_pass_ultimate_uk: '#107C10',
  nintendo_switch_online_uk: '#E60012',
  chatgpt_plus_uk: '#10A37F',
  claude_pro_uk: '#D97757',
  apple_icloud_200gb_uk: '#3B82F6',
  google_one_ai_uk: '#4285F4',
  microsoft_365_personal_uk: '#0078D4',
  nordvpn_uk: '#4687FF',
  expressvpn_uk: '#DA3940',
  adobe_creative_cloud_uk: '#FA0F00',
  canva_pro_uk: '#7D2AE8',
  deliveroo_plus_uk: '#00CDBC',
  uber_one_uk: '#F59E0B',
  just_eat_plus_uk: '#FF8000',
  hellofresh_uk: '#70C98A',
  gousto_uk: '#E42313',
  club_pret_uk: '#8B1D41',
  tesco_clubcard_plus_uk: '#00539F',
  asos_premier_uk: '#A0A0A0',
  experian_creditexpert_uk: '#1D4ED8',
  clearscore_protect_uk: '#06B6D4',
  equifax_uk: '#B91C1C',
  monzo_perks_uk: '#FF365D',
  revolut_premium_uk: '#38BDF8',
};

function alphanum(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function consonantSkeleton(value: string): string {
  return alphanum(value).replace(/[AEIOU]/g, '');
}

function isConsonantMatch(left: string, right: string): boolean {
  const a = consonantSkeleton(left);
  const b = consonantSkeleton(right);
  if (a.length < 5 || b.length < 5) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.65;
}

const GENERIC_SUBSCRIPTION_PATTERN =
  /\b(?:SUBSCRIPTION|MEMBERSHIP|PREMIUM|MONTHLY|ANNUAL|RECURRING|PLAN|PASS)\b/i;

// Merchant names that are common one-off UK purchases. These must never become
// subscriptions merely because a broad preset alias contains the same brand.
const NON_SUBSCRIPTION_MERCHANT_PATTERN =
  /\b(?:TESCO\s+(?:STORES?|SUPERMARKET|SUPERMARKETS)|SAINSBUR(?:Y|YS|IES)|ASDA(?:\s+SUPERSTORE)?|LIDL(?:\s+GB)?|ALDI(?:\s+STORES?)?|GREGGS|TFL(?:\.GOV\.UK)?|TRANSPORT\s+FOR\s+LONDON|UBER\s*\*?\s*TRIP|DELIVEROO(?!\s+PLUS)|JUST\s*EAT(?!\s*\+|\s+PLUS)|COSTA\s+COFFEE|JD\s+WETHERSPOON|POST\s+OFFICE\s+COUNTER|FASTER\s+PAYMENT|TRANSFER|DE\s+LA|PLAT(?:A|Ă)\s+DE\s+LA)\b/i;

function isOneOffMerchant(tx: ScannedTransaction): boolean {
  const value = `${tx.cleanedMerchant} ${tx.rawLine}`;
  return NON_SUBSCRIPTION_MERCHANT_PATTERN.test(value);
}

function inferUnknownCategory(merchant: string): SubscriptionCategory {
  const value = merchant.toUpperCase();
  if (/NETFLIX|DISNEY|YOUTUBE|STREAM|TV|VIDEO|DAZN|PARAMOUNT/.test(value)) return 'Streaming';
  if (/SPOTIFY|AUDIBLE|MUSIC|AUDIO/.test(value)) return 'Music & Audio';
  if (/GYM|FITNESS|STRAVA|HEALTH/.test(value)) return 'Fitness & Gym';
  if (/MICROSOFT|GOOGLE|ADOBE|CANVA|SOFTWARE|CLOUD|AI/.test(value)) return 'Productivity';
  return 'Other';
}

function unknownMerchantKey(merchant: string, rawLine = ''): string {
  if (/GOOGLE\s*PLAY[\s\S]{0,80}PASS|PLAY\s*PASS/i.test(`${merchant} ${rawLine}`)) {
    return 'unknown-GOOGLEPLAYPASS';
  }
  return `unknown-${alphanum(merchant).slice(0, 48)}`;
}

function unknownMerchantDisplay(merchant: string, rawLine: string): string {
  if (/GOOGLE\s*PLAY[\s\S]{0,80}PASS|PLAY\s*PASS/i.test(`${merchant} ${rawLine}`)) {
    return 'Google Play Pass';
  }
  return merchant;
}

function brandToken(name: string): string {
  return alphanum(
    name.replace(/\b(UK|STANDARD|PREMIUM|MEMBERSHIP|PLUS|THE|AND|GROUP|CORE)\b/gi, ' ')
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function displayName(name: string): string {
  return name
    .replace(/\s*\((?:Cloud \/ AI|Cloud|AI)\)/i, '')
    .replace(/\s+UK\s+Standard\b/i, '')
    .replace(/\s+Standard\s+UK\b/i, '')
    .replace(/\s+Premium\s+UK\b/i, ' Premium')
    .replace(/\s+Personal\b/i, '')
    .replace(/\s+UK\b/i, '')
    .trim();
}

function readAliases(preset: StatementPreset): string[] {
  const extras = preset.ocr_aliases ?? [];
  const local = OCR_ALIASES[preset.id] ?? [];
  return [...extras, ...local];
}

function isTrap(preset: StatementPreset): boolean {
  return TRAP_PRESET_IDS.has(preset.id) || TRAP_NOTE_PATTERN.test(preset.notes);
}

function trapLabel(preset: StatementPreset): string | null {
  if (!isTrap(preset)) return null;
  if (preset.id === 'adobe_creative_cloud_uk') return 'Early termination fee';
  if (preset.id === 'puregym_core_uk') return 'Cancellation PIN hurdle';
  const noteTrap = preset.notes.match(/[A-Z][A-Z0-9 /-]{2,24}TRAP/i);
  return noteTrap ? noteTrap[0].replace(/:/g, '').trim() : 'Cancellation trap';
}

function inferBillingCycle(amount: number, monthlyPrice: number): BillingCycle {
  if (monthlyPrice > 0 && amount >= monthlyPrice * 8) return 'Annual';
  if (amount >= 80 && amount % 1 !== 0 && amount > monthlyPrice * 6) return 'Annual';
  return 'Monthly';
}

function frequencyForCycle(cycle: BillingCycle): SubscriptionFrequency {
  return cycle === 'Annual' ? 'yearly' : 'monthly';
}

export function calculateNextBillingDate(
  lastPaymentDate: string | null,
  cycle: BillingCycle,
  now = new Date(),
): string | null {
  if (!lastPaymentDate || !parseLocalDateKey(lastPaymentDate)) return null;
  return rollForwardPaymentDate(lastPaymentDate, frequencyForCycle(cycle), now);
}

export function calculateDaysUntilNextPayment(nextPaymentDate: string | null, now = new Date()): number | null {
  if (!nextPaymentDate) return null;
  const parsed = parseLocalDateKey(nextPaymentDate);
  if (!parsed) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000));
}

interface Candidate {
  preset: StatementPreset;
  confidence: number;
  tier: MatchTier;
}

function matchTransaction(tx: ScannedTransaction, presets: StatementPreset[]): Candidate | null {
  if (isOneOffMerchant(tx)) return null;
  const haystack = tx.cleanedMerchant.toUpperCase();
  const rawUpper = tx.rawLine.toUpperCase();
  const hayAlnum = alphanum(tx.cleanedMerchant);
  const rawAlnum = alphanum(tx.rawLine);
  if (hayAlnum.length < 2 && rawAlnum.length < 2) return null;

  let best: Candidate | null = null;

  for (const preset of presets) {
    // Apple.com/bill is shared by Apple services. Explicit iCloud or Apple TV
    // tokens must override catalogue iteration order.
    if (preset.id === 'apple_tv_plus_uk' && /ICLOUD/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'apple_icloud_200gb_uk' && /APPLE\s*(?:TV|TV\+)|TV\.APPLE/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'google_one_ai_uk' && /PLAY\s*PASS/i.test(`${haystack} ${rawUpper}`)) continue;
    const aliases = readAliases(preset);
    for (const alias of aliases) {
      const aliasUpper = alias.toUpperCase();
      const aliasAlnum = alphanum(alias);

      if (
        (aliasUpper.length >= 3 && (haystack.includes(aliasUpper) || rawUpper.includes(aliasUpper))) ||
        (aliasAlnum.length >= 4 && (hayAlnum.includes(aliasAlnum) || rawAlnum.includes(aliasAlnum))) ||
        isConsonantMatch(alias, tx.cleanedMerchant)
      ) {
        const candidate: Candidate = { preset, confidence: 0.99, tier: 1 };
        if (!best || candidate.confidence > best.confidence) best = candidate;
      }
    }

    const nameAlnum = alphanum(preset.name);
    const token = brandToken(preset.name);
    if (
      hayAlnum === nameAlnum ||
      rawAlnum.includes(nameAlnum) ||
      (token.length >= 5 && (hayAlnum === token || hayAlnum.includes(token) || rawAlnum.includes(token)))
    ) {
      const candidate: Candidate = { preset, confidence: 0.9, tier: 2 };
      if (!best || candidate.confidence > best.confidence) best = candidate;
    }

    if (hayAlnum.length >= 4) {
      let fuzzy = 0;
      if (token.length >= 4) fuzzy = Math.max(fuzzy, similarity(hayAlnum, token));
      for (const alias of aliases) {
        const aliasAlnum = alphanum(alias);
        if (aliasAlnum.length < 4) continue;
        fuzzy = Math.max(fuzzy, similarity(hayAlnum, aliasAlnum));
      }
      const edits = token.length >= 4 ? levenshtein(hayAlnum, token) : FUZZY_MAX_EDITS + 1;
      if (fuzzy >= FUZZY_MIN_SIMILARITY && fuzzy < 0.9 && edits <= FUZZY_MAX_EDITS) {
        const confidence = Math.min(0.89, Math.max(0.75, fuzzy));
        const candidate: Candidate = { preset, confidence, tier: 3 };
        if (!best || candidate.confidence > best.confidence) best = candidate;
      }
    }
  }

  return best;
}

function isPotentialUnknownSubscription(tx: ScannedTransaction): boolean {
  const merchant = tx.cleanedMerchant.trim();
  if (merchant.length < 3) return false;
  if (isOneOffMerchant(tx)) return false;
  // Repeated grocery, transport and retail payments are common in statements.
  // Surface a new merchant only when the statement contains an explicit
  // subscription signal; known catalogue presets are matched above.
  return GENERIC_SUBSCRIPTION_PATTERN.test(`${merchant} ${tx.rawLine}`);
}

function toStatementPreset(preset: PresetService): StatementPreset {
  const maybeAliases = (preset as PresetService & { ocr_aliases?: unknown }).ocr_aliases;
  return {
    id: preset.id,
    name: preset.name,
    category: preset.category as SubscriptionCategory,
    monthly_price_gbp: preset.monthly_price_gbp,
    notes: preset.notes,
    cancel_url: preset.cancel_url,
    ocr_aliases: Array.isArray(maybeAliases)
      ? maybeAliases.filter((alias): alias is string => typeof alias === 'string')
      : undefined,
  };
}

export function matchStatementTransactions(
  transactions: ScannedTransaction[],
  now = new Date()
): MatchedSubscription[] {
  const presets = getPresets().map(toStatementPreset);
  const grouped = new Map<
    string,
    { match: MatchedSubscription; occurrences: number; latestIso: string | null }
  >();
  const occurrenceCounts = new Map<string, number>();
  for (const tx of transactions) {
    const merchantKey = alphanum(tx.cleanedMerchant);
    occurrenceCounts.set(merchantKey, (occurrenceCounts.get(merchantKey) ?? 0) + 1);
  }

  for (const tx of transactions) {
    const candidate = matchTransaction(tx, presets);
    if (!candidate) {
      const merchantKey = alphanum(tx.cleanedMerchant);
      const occurrenceCount = occurrenceCounts.get(merchantKey) ?? 0;
      if (!isPotentialUnknownSubscription(tx)) continue;

      const unknownId = unknownMerchantKey(tx.cleanedMerchant, tx.rawLine);
      const existingUnknown = grouped.get(unknownId);
      const unknownPayload: MatchedSubscription = {
        id: `scan-${unknownId}`,
        presetId: unknownId,
        serviceName: unknownMerchantDisplay(tx.cleanedMerchant, tx.rawLine),
        category: inferUnknownCategory(tx.cleanedMerchant),
        amountGbp: tx.amountGbp,
        billingCycle: 'Monthly',
        billingDay: tx.billingDay,
        lastPaymentDate: tx.dateIso,
        nextBillingDate: calculateNextBillingDate(tx.dateIso, 'Monthly', now),
        daysUntilNextPayment: calculateDaysUntilNextPayment(
          calculateNextBillingDate(tx.dateIso, 'Monthly', now),
          now,
        ),
        confidence: occurrenceCount > 1 ? 0.78 : 0.62,
        matchTier: 3,
        isVerifiedRecurring: occurrenceCount > 1,
        hasCancellationTrap: false,
        trapLabel: null,
        color: '#D4AF37',
        cancelUrl: '',
        selected: true,
      };

      if (!existingUnknown) {
        grouped.set(unknownId, {
          match: unknownPayload,
          occurrences: 1,
          latestIso: tx.dateIso,
        });
      } else {
        existingUnknown.occurrences += 1;
        if (tx.dateIso && (!existingUnknown.latestIso || tx.dateIso >= existingUnknown.latestIso)) {
          existingUnknown.match.amountGbp = tx.amountGbp;
          existingUnknown.match.billingDay = tx.billingDay ?? existingUnknown.match.billingDay;
          existingUnknown.match.lastPaymentDate = tx.dateIso;
          existingUnknown.match.nextBillingDate = unknownPayload.nextBillingDate ?? existingUnknown.match.nextBillingDate;
          existingUnknown.match.daysUntilNextPayment =
            unknownPayload.daysUntilNextPayment ?? existingUnknown.match.daysUntilNextPayment;
          existingUnknown.latestIso = tx.dateIso;
        }
        existingUnknown.match.isVerifiedRecurring = existingUnknown.occurrences > 1;
      }
      continue;
    }

    const existing = grouped.get(candidate.preset.id);
    const billingCycle = inferBillingCycle(tx.amountGbp, candidate.preset.monthly_price_gbp);
    const nextDate = calculateNextBillingDate(tx.dateIso, billingCycle, now);
    const payload: MatchedSubscription = {
      id: `scan-${candidate.preset.id}`,
      presetId: candidate.preset.id,
      serviceName: displayName(candidate.preset.name),
      category: candidate.preset.category,
      amountGbp: tx.amountGbp,
      billingCycle,
      billingDay: tx.billingDay,
      lastPaymentDate: tx.dateIso,
      nextBillingDate: nextDate,
      daysUntilNextPayment: calculateDaysUntilNextPayment(nextDate, now),
      confidence: candidate.confidence,
      matchTier: candidate.tier,
      isVerifiedRecurring: false,
      hasCancellationTrap: isTrap(candidate.preset),
      trapLabel: trapLabel(candidate.preset),
      color: PRESET_COLORS[candidate.preset.id] ?? '#D4AF37',
      cancelUrl: candidate.preset.cancel_url,
      selected: true,
    };

    if (!existing) {
      grouped.set(candidate.preset.id, {
        match: payload,
        occurrences: 1,
        latestIso: tx.dateIso,
      });
      continue;
    }

    // Dated transaction rows are authoritative over undated summary rows.
    // If both rows are dated, keep the latest transaction amount; if neither
    // has a date, preserve the first extracted amount instead of letting a
    // summary page overwrite it.
    const shouldUseTransactionAmount =
      (Boolean(tx.dateIso) && !existing.latestIso) ||
      (Boolean(tx.dateIso && existing.latestIso) && tx.dateIso! >= existing.latestIso!);
    if (shouldUseTransactionAmount) {
      existing.match.amountGbp = tx.amountGbp;
      existing.match.billingDay = tx.billingDay ?? existing.match.billingDay;
      existing.match.lastPaymentDate = tx.dateIso ?? existing.match.lastPaymentDate;
      existing.match.nextBillingDate = nextDate ?? existing.match.nextBillingDate;
      existing.match.billingCycle = billingCycle;
      existing.match.daysUntilNextPayment =
        calculateDaysUntilNextPayment(existing.match.nextBillingDate, now);
      existing.latestIso = tx.dateIso ?? existing.latestIso;
    }
    if (candidate.confidence > existing.match.confidence) {
      existing.match.confidence = candidate.confidence;
      existing.match.matchTier = candidate.tier;
    }
    existing.occurrences += 1;
    existing.match.isVerifiedRecurring = existing.occurrences > 1;
  }

  return Array.from(grouped.values())
    .map((entry) => entry.match)
    .sort((a, b) => b.amountGbp - a.amountGbp);
}
