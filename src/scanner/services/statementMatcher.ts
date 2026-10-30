import { getPresets } from '../../services/databaseService';
import type { PresetService } from '../../types/database';
import type { SubscriptionCategory } from '../../types/subscription';
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
    'NFLX',
    'NETFLIX UK',
    'NETFLIX COM',
    'NETFLIX ENTERTAINMENT',
  ],
  spotify_premium_uk: [
    'SPOTIFY',
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
    'APPLE.COM/BILL',
    'APPLE TV',
    'APPLE TV+',
    'TV.APPLE',
    'APPLE.COM BILL',
    'APPLE SERVICES',
  ],
  now_tv_uk: ['NOW TV', 'NOWTV', 'NOW TV UK', 'NOW DIGITAL'],
  sky_stream_uk: [
    'SKY DIGITAL',
    'SKY SUBSCRIPTION',
    'BSKYB',
    'SKY UK',
    'SKY STREAM',
    'SKY TV',
    'SKY',
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
  chatgpt_plus_uk: ['OPENAI CHATGPT', 'CHATGPT', 'OPENAI', 'CHATGPT PLUS'],
  claude_pro_uk: ['ANTHROPIC', 'CLAUDE.AI', 'CLAUDE', 'CLAUDE PRO'],
  apple_icloud_200gb_uk: ['ICLOUD', 'APPLE ICLOUD'],
  google_one_ai_uk: [
    'GOOGLE ONE',
    'GOOGLE*ONE',
    'GOOGLE *GOOGLE ONE',
    'GOOGLE STORAGE',
    'GOOGLE*CLOUD',
    'GOOGLE PLAY*GOOGLE ONE',
    'GOOGLE PLAY*ONE',
    'GOOGLE ONE UK',
    'GOOGLEONE',
  ],
  microsoft_365_personal_uk: [
    'MICROSOFT 365',
    'MSFT 365',
    'MSFT *365',
    'MICROSOFT*365',
    'OFFICE 365',
    'MSFT*OFFICE',
    'MICROSOFT*OFFICE',
    'MICROSOFT OFFICE',
    'MSFT STORAGE',
    'MICROSOFT CORP',
    'MICROSOFT',
    'MSFT',
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
  revolut_premium_uk: ['REVOLUT PREMIUM', 'REVOLUT*PREMIUM'],
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

function nextBillingDate(iso: string | null, billingDay: number | null, now = new Date()): string | null {
  const day = billingDay ?? (iso ? Number(iso.slice(8, 10)) : now.getDate());
  if (!day) return null;
  let year = now.getFullYear();
  let month = now.getMonth();
  if (day <= now.getDate()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  const clamped = Math.min(day, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

interface Candidate {
  preset: StatementPreset;
  confidence: number;
  tier: MatchTier;
}

function matchTransaction(tx: ScannedTransaction, presets: StatementPreset[]): Candidate | null {
  const haystack = tx.cleanedMerchant.toUpperCase();
  const rawUpper = tx.rawLine.toUpperCase();
  const hayAlnum = alphanum(tx.cleanedMerchant);
  const rawAlnum = alphanum(tx.rawLine);
  if (hayAlnum.length < 2 && rawAlnum.length < 2) return null;

  let best: Candidate | null = null;

  for (const preset of presets) {
    const aliases = readAliases(preset);
    for (const alias of aliases) {
      const aliasUpper = alias.toUpperCase();
      const aliasAlnum = alphanum(alias);

      if (
        (aliasUpper.length >= 3 && (haystack.includes(aliasUpper) || rawUpper.includes(aliasUpper))) ||
        (aliasAlnum.length >= 4 && (hayAlnum.includes(aliasAlnum) || rawAlnum.includes(aliasAlnum)))
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

  for (const tx of transactions) {
    const candidate = matchTransaction(tx, presets);
    if (!candidate) continue;

    const existing = grouped.get(candidate.preset.id);
    const nextDate = nextBillingDate(tx.dateIso, tx.billingDay, now);
    const payload: MatchedSubscription = {
      id: `scan-${candidate.preset.id}`,
      presetId: candidate.preset.id,
      serviceName: displayName(candidate.preset.name),
      category: candidate.preset.category,
      amountGbp: tx.amountGbp,
      billingCycle: inferBillingCycle(tx.amountGbp, candidate.preset.monthly_price_gbp),
      billingDay: tx.billingDay,
      nextBillingDate: nextDate,
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

    const isNewer = Boolean(tx.dateIso && (!existing.latestIso || tx.dateIso >= existing.latestIso));
    if (isNewer || !existing.latestIso) {
      existing.match.amountGbp = tx.amountGbp;
      existing.match.billingDay = tx.billingDay ?? existing.match.billingDay;
      existing.match.nextBillingDate = nextDate ?? existing.match.nextBillingDate;
      existing.match.billingCycle = inferBillingCycle(tx.amountGbp, candidate.preset.monthly_price_gbp);
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
