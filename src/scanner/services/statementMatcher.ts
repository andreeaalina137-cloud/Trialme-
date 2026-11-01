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
  ScannerGateScores,
  ScannerReasonCode,
  StatementPreset,
  SubscriptionEvidence,
  PriceAlert,
  ConfirmingTransaction,
} from '../types/scanner.types';
import {
  FLAG_PRICE_HIKE,
  FLAG_TRIAL_CONVERTED,
  FLAG_VALID_BANK_SUB,
} from '../types/scanner.types';
import {
  extractCanonicalMerchantKey,
  areMerchantsFuzzyMatch,
} from './statementNormalizer';
import { getScannerLearning } from './scannerLearningMemory';

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
    'APPL TV',
  ],
  apple_music_uk: ['APPLE MUSIC', 'APPLE.COM/BILL APPLE MUSIC'],
  apple_one_uk: ['APPLE ONE', 'APPLE.COM/BILL APPLE ONE'],
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
  tesco_clubcard_plus_uk: ['TESCO CLUBCARD', 'CLUBCARD PLUS'],
  tesco_mobile_uk: ['TESCO MOBILE'],
  asos_premier_uk: ['ASOS PREMIER', 'ASOS'],
  experian_creditexpert_uk: ['EXPERIAN', 'CREDITEXPERT'],
  clearscore_protect_uk: ['CLEARSCORE'],
  equifax_uk: ['EQUIFAX'],
  monzo_perks_uk: ['MONZO PERKS', 'MONZO PLUS', 'MONZO MAX'],
  revolut_premium_uk: [
    'REVOLUT PREMIUM',
    'REVOLUT*PREMIUM',
    'PREMIUM PLAN FEE',
    'PREMIUM PLAN',
    'TAXA PLAN METAL',
    'TAX PLAN METAL',
    'METAL PLAN FEE',
  ],
  three_uk: ['H3G', 'THREE', 'THREE UK', '3 MOBILE', 'THREE MOBILE'],
  o2_uk: ['O2', 'O2 UK', 'O2 MOBILE', 'TELEFONICA O2'],
  vodafone_uk: ['VODAFONE', 'VODAFONE LTD', 'VODAFONE UK'],
  talktalk_uk: ['TALKTALK', 'TALK TALK', 'TALKTALK TELECOM', 'TALKTALK TELECOMT'],
  lebara_uk: ['LEBARA', 'LEBARA MOBILE'],
  curve_uk: ['CURVE', 'CURVE SUBSCRIPTION', 'CURVE CARD'],
  lloyds_silver_account_uk: ['SILVER ACCOUNT', 'SILVER ACCOUNT FEE', 'LLOYDS SILVER ACCOUNT'],
  lloyds_account_fee_uk: [
    'ACCOUNT FEE',
    'MONTHLY ACCOUNT FEE',
    'PLATINUM ACCOUNT FEE',
    'CLUB LLOYDS FEE',
    'ULTIMATE REWARD ACCOUNT',
    'ULTIMATE REWARD FEE',
    'HALIFAX ULTIMATE REWARD',
    'REWARD ACCOUNT FEE',
  ],
  chase_monthly_service_fee_uk: ['MONTHLY SERVICE FEE'],
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

// Bank statements regularly contain UK providers that are not part of the
// commercial catalogue. These scanner-only records allow deterministic
// classification without inventing a catalogue price; the amount always
// comes from the statement.
const BANK_PROVIDER_PRESETS: StatementPreset[] = [
  { id: 'apple_music_uk', name: 'Apple Music', category: 'Music & Audio', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'apple_one_uk', name: 'Apple One', category: 'Streaming', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'three_uk', name: 'Three UK', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'o2_uk', name: 'O2 UK', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'vodafone_uk', name: 'Vodafone UK', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'talktalk_uk', name: 'TalkTalk UK', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'lebara_uk', name: 'Lebara UK', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'tesco_mobile_uk', name: 'Tesco Mobile', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'curve_uk', name: 'Curve', category: 'Productivity', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'lloyds_silver_account_uk', name: 'Lloyds Silver Account', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'lloyds_account_fee_uk', name: 'Account Fee', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
  { id: 'chase_monthly_service_fee_uk', name: 'Monthly Service Fee', category: 'Utilities', monthly_price_gbp: 0, notes: '', cancel_url: '' },
];

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

const GAMBLING_MERCHANT_PATTERN =
  /\b(?:BET365|BETFRED|LADBROKES|WILLIAM\s+HILL|CORAL|PADDY\s+POWER|SKY\s*BET|SKILL\s+ON\s+NET|GALA\s+BINGO|PROGRESSPLAY|888\b|LC\s+INTERNATIONAL|GAMBLING|CASINO)\b/i;

// Merchant names that are common one-off UK purchases or transfers. These must never become
// subscriptions merely because a broad preset alias contains the same brand.
const NON_SUBSCRIPTION_MERCHANT_PATTERN =
  /\b(?:TESCO\s+(?:STORES?|SUPERMARKET|SUPERMARKETS)|SAINSBUR(?:Y|YS|IES)|ASDA(?:\s+SUPERSTORE)?|LIDL(?:\s+GB)?|ALDI(?:\s+STORES?)?|GREGGS|STAPLES(?:\s+UK)?|IKEA(?:\s+LIMITED|\s+LTD)?|SCREWFIX(?:\s+DIRECT)?|B&Q|ARGOS|CURRYS|EBAY(?:\s+UK)?|VINTED|ETSY|DEPOP|TFL(?:\.GOV\.UK)?|TRANSPORT\s+FOR\s+LONDON|STAGECOACH(?:\s+SERVICES?)?|ARRIVA|FIRST\s+BUS|NATIONAL\s+EXPRESS|FLIX\b|UBER\s*\*?\s*TRIP|DELIVEROO(?!\s+PLUS)|JUST\s*EAT(?!\s*\+|\s+PLUS)|COSTA\s+COFFEE|JD\s+WETHERSPOON|POST\s+OFFICE\s+COUNTER|FASTER\s+PAYMENTS?|BACS\s+(?:PAYMENT|CREDIT)|PAYROLL|SALARY|TRANSFER|POT\s+TRANSFER|MONZO\s+POT|SAVINGS\s+POT|SPACE\s+TRANSFER|SAVING\s+SPACE|TRANSFER\s+TO\s+SPACE|ROUND[- ]?UP|COIN\s+JAR|CASHBACK(?:\s+REWARD|\s+EARNED)?|GROSS\s+INTEREST|NET\s+INTEREST|INTEREST\s+PAID|INSTANT\s+SAVINGS|M\s+PLUS\s+SAVER|VIRGIN\s+MONEY\s+(?:SAVER|SAVINGS|TRANSFER|ISA)|SAVINGS\s+ACCOUNT|COMMSAVE\s+CU|CREDIT\s+UNION|VAULT\s+TRANSFER|PERSONAL\s+VAULT|SAVINGS\s+VAULT|POCKET\s+TRANSFER|EXCHANGED\s+TO|CURRENCY\s+EXCHANGE|GENERAL\s+CURRENCY\s+CONVERSION|GENERAL\s+(?:CREDIT\s+)?CARD\s+DEPOSIT|GENERAL\s+WITHDRAWAL|USER\s+INITIATED\s+WITHDRAWAL|BANK\s+DEPOSIT\s+TO\s+PP|WITHDRAWAL\s+TO\s+BANK|EXPRESS\s+CHECKOUT\s+PAYMENT|PAYPAL\s+PAYMENT|NATWEST\s+BNPL|\bBNPL\b|POSTOFFICE\s+MONEY|FIRSTCENTRAL\w*|DVLA[-\sA-Z0-9]*|NHSBSA\b|NDCS\b|ANGLIAN\s+WATER|THAMES\s+WATER|SEVERN\s+TRENT|UNITED\s+UTILITIES|YORKSHIRE\s+WATER|SOUTHERN\s+WATER|OCTOPUS\s+ENERGY|BRITISH\s+GAS|EDF\s+ENERGY|OVO\s+ENERGY|SCOTTISH\s+POWER|HMRC\b|ATM\s+WITHDRAWAL|CASH\s+WITHDRAWAL|METRO\s+CASH\s+WITHDRAWAL|CASHWITHDRAW\w*|NOTEMACHINE|ATM\s+OWNER\s+FEE|CASHLINE|CARD\s+DELIVERY(?:\s+FEE)?|SPARE\s+CARD\s+FEE|DE\s+LA|PLAT(?:A|Ă)\s+DE\s+LA|SAVETHECHANGE|TAPTAP\s+SEND|WORLDREMIT|WESTERN\s+UNION|ZELLE\s+PAYMENT|SENT\s+FROM\s+REVOLUT|TO:\s+[^,]+,\s*\d{8}\s*\(GB\))\b/i;

// Priority override 3: MOB, CPT, FEE, FPI, FPO, TFR, BGC, C/L and BACS must only match as whole leading tokens.
const LEADING_TRANSFER_TOKEN_PATTERN = /^(?:MOB|FPI|FPO|TFR|BGC|CPT|C\/L|BACS?)\b/i;

function isTransferOrOneOffRow(tx: ScannedTransaction): boolean {
  const value = `${tx.cleanedMerchant} ${tx.rawLine}`;
  if (NON_SUBSCRIPTION_MERCHANT_PATTERN.test(value) || GAMBLING_MERCHANT_PATTERN.test(value)) {
    return true;
  }
  const stripped = tx.rawLine
    .replace(/^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\.?(?:\s+\d{2,4})?)\s*(?:\|\s*)?/i, '')
    .trim();
  if (LEADING_TRANSFER_TOKEN_PATTERN.test(stripped)) {
    // Allow CPT only when paired with an explicit known streaming/subscription preset in legacy Barclays format
    if (/^CPT\b/i.test(stripped) && /\b(?:DISNEY|NETFLIX|SPOTIFY|AMAZON\s+PRIME)\b/i.test(stripped)) {
      return false;
    }
    return true;
  }
  // Plain TESCO without MOBILE or CLUBCARD is a grocery store purchase
  if (/\bTESCO\b/i.test(value) && !/\b(?:MOBILE|CLUBCARD)\b/i.test(value)) {
    return true;
  }
  return false;
}

function isOneOffMerchant(tx: ScannedTransaction): boolean {
  return isTransferOrOneOffRow(tx);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholePhraseBoundary(haystack: string, phrase: string): boolean {
  const escaped = escapeRegex(phrase.trim()).replace(/\s+/g, '[\\s*._/-]+');
  const pattern = new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i');
  return pattern.test(haystack);
}

function inferUnknownCategory(merchant: string): SubscriptionCategory {
  const value = merchant.toUpperCase();
  if (/NETFLIX|DISNEY|YOUTUBE|STREAM|TV|VIDEO|DAZN|PARAMOUNT/.test(value)) return 'Streaming';
  if (/SPOTIFY|AUDIBLE|MUSIC|AUDIO/.test(value)) return 'Music & Audio';
  if (/GYM|FITNESS|STRAVA|HEALTH/.test(value)) return 'Fitness & Gym';
  if (/MICROSOFT|GOOGLE|ADOBE|CANVA|SOFTWARE|CLOUD|AI/.test(value)) return 'Productivity';
  return 'Other';
}

function unknownMerchantKey(merchant: string, rawLine = '', amountGbp?: number): string {
  if (/GOOGLE\s*PLAY[\s\S]{0,80}PASS|PLAY\s*PASS/i.test(`${merchant} ${rawLine}`)) {
    return 'unknown-GOOGLEPLAYPASS';
  }
  if (/^APPLE\s+BILLING$/i.test(merchant) && Number.isFinite(amountGbp)) {
    const pence = Math.round((amountGbp ?? 0) * 100);
    return `unknown-APPLEBILLING-${pence}`;
  }
  const canon = extractCanonicalMerchantKey(merchant);
  if (canon.length >= 3) {
    return `unknown-${alphanum(canon).slice(0, 48)}`;
  }
  return `unknown-${alphanum(merchant).slice(0, 48)}`;
}

function unknownMerchantDisplay(merchant: string, rawLine: string): string {
  if (/GOOGLE\s*PLAY[\s\S]{0,80}PASS|PLAY\s*PASS/i.test(`${merchant} ${rawLine}`)) {
    return 'Google Play Pass';
  }
  if (/^APPLE\s+BILLING$/i.test(merchant)) {
    return 'Apple Services';
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
  if (monthlyPrice <= 0) return 'Monthly';
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
  learned?: boolean;
  identityScore: 0 | 1 | 2 | 3;
  reasonCode: ScannerReasonCode;
}

function matchTransaction(tx: ScannedTransaction, presets: StatementPreset[]): Candidate | null {
  if (isOneOffMerchant(tx)) return null;
  const canonical = tx.canonicalMerchant || extractCanonicalMerchantKey(tx.cleanedMerchant || tx.rawLine);
  const haystack = tx.cleanedMerchant.toUpperCase();
  const rawUpper = tx.rawLine.toUpperCase();
  const hayAlnum = alphanum(tx.cleanedMerchant);
  const rawAlnum = alphanum(tx.rawLine);
  if (hayAlnum.length < 2 && rawAlnum.length < 2 && canonical.length < 2) return null;

  let best: Candidate | null = null;

  for (const preset of presets) {
    // Apple.com/bill is shared by Apple services. Explicit iCloud or Apple TV
    // tokens must override catalogue iteration order.
    if (preset.id === 'apple_tv_plus_uk' && /ICLOUD|APPLE\s*(?:MUSIC|ONE)/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'apple_icloud_200gb_uk' && /APPLE\s*(?:TV|TV\+|MUSIC|ONE)|TV\.APPLE/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'apple_music_uk' && !/APPLE\s*MUSIC/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'apple_one_uk' && !/APPLE\s*ONE/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'google_one_ai_uk' && /PLAY\s*PASS/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'lloyds_account_fee_uk' && /\bSILVER\s+ACCOUNT\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'amazon_prime_uk' && !/\b(?:PRIME|VIDEO|MEMBERSHIP)\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'club_pret_uk' && !/\bCLUB\s+PRET\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'asos_premier_uk' && !/\bPREMIER\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'deliveroo_plus_uk' && !/\bPLUS\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'just_eat_plus_uk' && !/\b(?:PLUS|JUST\s*EAT\s*\+)\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'monzo_perks_uk' && !/\bMONZO\s+(?:PERKS|PLUS|MAX|PREMIUM)\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'virgin_active_uk' && !/\bVIRGIN\s+ACTIVE\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (preset.id === 'claude_pro_uk' && !/\b(?:CLAUDE|ANTHROPIC)\b/i.test(`${haystack} ${rawUpper}`)) continue;
    if (
      preset.id === 'revolut_premium_uk' &&
      !/\b(?:PREMIUM\s+PLAN(?:\s+FEE)?|METAL\s+PLAN(?:\s+FEE)?|TAX[AĂ]?\s+PLAN\s+METAL|REVOLUT\s*\*?\s*(?:PREMIUM|METAL)|ULTRA\s+PLAN(?:\s+FEE)?|PLUS\s+PLAN\s+FEE)\b/i.test(
        `${haystack} ${rawUpper}`,
      )
    ) {
      continue;
    }
    const aliases = readAliases(preset);
    for (const alias of aliases) {
      const aliasUpper = alias.toUpperCase();
      const aliasAlnum = alphanum(alias);

      const isShortBoundaryMatch =
        aliasUpper.length >= 2 &&
        aliasUpper.length < 3 &&
        (hasWholePhraseBoundary(haystack, aliasUpper) || hasWholePhraseBoundary(rawUpper, aliasUpper));

      const isStandardAliasMatch =
        isShortBoundaryMatch ||
        (aliasUpper.length >= 3 &&
          (hasWholePhraseBoundary(haystack, aliasUpper) ||
            hasWholePhraseBoundary(rawUpper, aliasUpper) ||
            (aliasAlnum.length >= 4 && (hayAlnum === aliasAlnum || hayAlnum.includes(aliasAlnum)))));

      const isOcrConsonant = !isStandardAliasMatch && isConsonantMatch(alias, tx.cleanedMerchant);

      if (isStandardAliasMatch || isOcrConsonant) {
        const candidate: Candidate = {
          preset,
          confidence: 0.99,
          tier: 1,
          identityScore: 3,
          reasonCode: isOcrConsonant ? 'OCR_ALIAS' : 'ALIAS_MATCH',
        };
        if (!best || candidate.confidence > best.confidence) best = candidate;
      }
    }

    const nameAlnum = alphanum(preset.name);
    const token = brandToken(preset.name);
    if (
      hayAlnum === nameAlnum ||
      rawAlnum.includes(nameAlnum) ||
      (token.length >= 5 && (hayAlnum === token || hasWholePhraseBoundary(haystack, preset.name)))
    ) {
      const candidate: Candidate = {
        preset,
        confidence: 0.9,
        tier: 2,
        identityScore: 2,
        reasonCode: 'ALIAS_MATCH',
      };
      if (!best || candidate.confidence > best.confidence) best = candidate;
    }

    if (hayAlnum.length >= 4) {
      let fuzzy = 0;
      if (token.length >= 4 && Math.abs(hayAlnum.length - token.length) <= FUZZY_MAX_EDITS) {
        fuzzy = Math.max(fuzzy, similarity(hayAlnum, token));
      }
      for (const alias of aliases) {
        const aliasAlnum = alphanum(alias);
        if (aliasAlnum.length < 4 || Math.abs(hayAlnum.length - aliasAlnum.length) > FUZZY_MAX_EDITS) continue;
        fuzzy = Math.max(fuzzy, similarity(hayAlnum, aliasAlnum));
      }
      const edits = token.length >= 4 ? levenshtein(hayAlnum, token) : FUZZY_MAX_EDITS + 1;
      if (fuzzy >= FUZZY_MIN_SIMILARITY && fuzzy < 0.9 && edits <= FUZZY_MAX_EDITS) {
        const confidence = Math.min(0.89, Math.max(0.75, fuzzy));
        const candidate: Candidate = {
          preset,
          confidence,
          tier: 3,
          identityScore: 2,
          reasonCode: 'OCR_ALIAS',
        };
        if (!best || candidate.confidence > best.confidence) best = candidate;
      }
    }
  }

  return best;
}

const EXPLICIT_UNKNOWN_SUBSCRIPTION_SIGNAL =
  /\b(?:CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|PREAPPROVED\s+PAYMENT|BILL\s+USER\s+PAYMENT|AUTOMATIC\s+PAYMENT|RECURRING\s+PAYMENT|SUBSCRIPTION\s+PAYMENT|DIRECT\s+DEBIT|D\/D|DDR|DD)\b/i;

function computeIntervalRecurrence(dates: string[]): { confirmed: boolean; cycle: BillingCycle | null } {
  const uniqueTimestamps = Array.from(
    new Set(
      dates
        .filter(Boolean)
        .map((iso) => Date.parse(`${iso}T00:00:00Z`))
        .filter((ts) => Number.isFinite(ts)),
    ),
  ).sort((a, b) => a - b);

  if (uniqueTimestamps.length < 2) return { confirmed: false, cycle: null };
  const intervals: number[] = [];
  for (let i = 1; i < uniqueTimestamps.length; i += 1) {
    intervals.push(Math.round((uniqueTimestamps[i] - uniqueTimestamps[i - 1]) / 86_400_000));
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  // Monthly: 26–35 days (explicitly accounts for UK BACS / DD weekend shifts & Feb), Weekly: 6–8 days, Fortnightly: 13–15 days, Yearly: 350–380 days
  if (median >= 350 && median <= 380) return { confirmed: true, cycle: 'Annual' };
  if ((median >= 26 && median <= 35) || (median >= 6 && median <= 8) || (median >= 13 && median <= 15)) {
    return { confirmed: true, cycle: 'Monthly' };
  }
  return { confirmed: false, cycle: null };
}

/**
 * Stage 5: UK Recurrence Engine, Price Hikes & Clear Evidence Generation
 * Evaluates consecutive payment intervals with UK BACS weekend shift tolerance (26-34 days monthly, 6-8/13-15 weekly, 360-370 yearly),
 * checks amount fixedness vs FX variance (±8%) vs price hikes (>8% jump from fixed past months) vs trial-to-paid conversion,
 * computes 0-100 confidence score rubric, and builds an auditable evidence object.
 */
export function evaluateSubscriptionRecurrenceAndEvidence(
  txs: ScannedTransaction[],
  preset: StatementPreset | null,
  _serviceDisplayName = '',
  _category: SubscriptionCategory = 'Other',
  now = new Date(),
): {
  isVerifiedRecurring: boolean;
  billingCycle: BillingCycle;
  lastPaymentDate: string | null;
  nextBillingDate: string | null;
  daysUntilNextPayment: number | null;
  amountGbp: number;
  confidenceScore: number;
  subscriptionType: 'Direct Debit' | 'Recurring Card (CPA)' | 'Standing Order';
  whyDetected: string[];
  confirmingTransactions: ConfirmingTransaction[];
  priceAlert?: PriceAlert | null;
  auditFlag?: string | null;
  evidence: SubscriptionEvidence;
} {
  // Sort ascending by date
  const sorted = [...txs].sort((a, b) => (a.dateIso || '').localeCompare(b.dateIso || ''));
  const latestTx = sorted[sorted.length - 1];

  // Determine UK payment rail
  let subscriptionType: 'Direct Debit' | 'Recurring Card (CPA)' | 'Standing Order' = 'Recurring Card (CPA)';
  if (
    sorted.some(
      (t) =>
        t.paymentType === 'DIRECT_DEBIT' ||
        t.hasStrongRecurringMarker ||
        /\b(?:DIRECT\s+DEBIT|D\/D|DDR|DD)\b/i.test(t.rawLine),
    )
  ) {
    subscriptionType = 'Direct Debit';
  } else if (
    sorted.some(
      (t) =>
        t.paymentType === 'STANDING_ORDER' ||
        /\b(?:STANDING\s+ORDER|SO|STO)\b/i.test(t.rawLine),
    )
  ) {
    subscriptionType = 'Standing Order';
  }

  // Extract dates and consecutive intervals
  const datedTxs = sorted.filter((t) => Boolean(t.dateIso));
  const timestamps = Array.from(
    new Set(
      datedTxs
        .map((t) => Date.parse(`${t.dateIso}T00:00:00Z`))
        .filter((ts) => Number.isFinite(ts)),
    ),
  ).sort((a, b) => a - b);

  const deltaDaysList: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    deltaDaysList.push(Math.round((timestamps[i] - timestamps[i - 1]) / 86_400_000));
  }

  // UK BACS Weekend Shift Intervals:
  // Monthly: 26 to 34 days
  // Weekly: 6 to 8 days, Fortnightly: 13 to 15 days
  // Yearly: 360 to 370 days (or 350 to 380)
  const hasMonthlyInterval =
    deltaDaysList.length > 0 && deltaDaysList.every((d) => d >= 26 && d <= 34);
  const hasWeeklyInterval =
    deltaDaysList.length > 0 &&
    deltaDaysList.every((d) => (d >= 6 && d <= 8) || (d >= 13 && d <= 15));
  const hasYearlyInterval =
    deltaDaysList.length > 0 && deltaDaysList.every((d) => (d >= 360 && d <= 370) || (d >= 350 && d <= 380));

  const intervalConfirmed = hasMonthlyInterval || hasWeeklyInterval || hasYearlyInterval;
  const billingCycle: BillingCycle = hasYearlyInterval ? 'Annual' : 'Monthly';

  // Amount analysis
  const amounts = sorted.map((t) => t.amountGbp);
  const isFixedAmount = amounts.length === 1 || amounts.every((a) => Math.abs(a - amounts[0]) < 0.01);

  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const variance = maxAmount > 0 ? (maxAmount - minAmount) / maxAmount : 0;
  const hasFxTolerance = !isFixedAmount && variance <= 0.08;

  // Monthly Key Day consistency check (within 3 calendar days)
  const billingDays = sorted
    .map((t) => t.billingDay)
    .filter((d): d is number => d !== null && Number.isFinite(d));
  const isKeyDayConsistent =
    billingDays.length < 2 || Math.max(...billingDays) - Math.min(...billingDays) <= 3;

  // Trial-to-Paid Detection (FLAG_TRIAL_CONVERTED)
  // If initial transaction is £0.00 or <= £1.99 followed 7, 14, or 30 days later by standard recurring amount
  let hasTrialConverted = false;
  if (
    amounts.length >= 2 &&
    (amounts[0] === 0 || amounts[0] <= 1.99) &&
    amounts[amounts.length - 1] >= 3.00
  ) {
    const firstDelta = deltaDaysList.length > 0 ? deltaDaysList[0] : 0;
    if (
      (firstDelta >= 6 && firstDelta <= 9) ||
      (firstDelta >= 13 && firstDelta <= 16) ||
      (firstDelta >= 26 && firstDelta <= 34)
    ) {
      hasTrialConverted = true;
    }
  }

  // Silent Price Hike Detection (FLAG_PRICE_HIKE)
  // If interval is strictly monthly (~30 days, 26-34 days), but latest payment increased by > 8% compared to previous fixed months
  let priceAlert: PriceAlert | null = null;
  let hasPriceHike = false;
  if (!hasTrialConverted && hasMonthlyInterval && amounts.length >= 2) {
    const latestAmount = amounts[amounts.length - 1];
    const prevAmounts = amounts.slice(0, -1);
    const earlierAmount = prevAmounts[prevAmounts.length - 1];
    const prevFixed = prevAmounts.every((a) => Math.abs(a - earlierAmount) < 0.01);
    const increase = earlierAmount > 0 ? (latestAmount - earlierAmount) / earlierAmount : 0;
    if (earlierAmount > 1.99 && prevFixed && increase > 0.08) {
      hasPriceHike = true;
      const diff = Number((latestAmount - earlierAmount).toFixed(2));
      const percentage = Number((increase * 100).toFixed(2));
      priceAlert = {
        previousAmount: earlierAmount,
        newAmount: latestAmount,
        difference: diff,
        percentage,
        formattedDifference: `+£${diff.toFixed(2)}`,
      };
    }
  }

  // Confidence Score (0-100) & WhyDetected strings
  let confidenceScore = 0;
  const whyDetected: string[] = [];

  // +40 for consistent interval (matching monthly/weekly/yearly)
  if (intervalConfirmed) {
    confidenceScore += 40;
    if (hasMonthlyInterval) {
      whyDetected.push('Consistent monthly payment (~30 days with UK weekend shift tolerance)');
    } else if (hasWeeklyInterval) {
      whyDetected.push('Consistent weekly / fortnightly payment interval confirmed');
    } else if (hasYearlyInterval) {
      whyDetected.push('Consistent annual payment (~365 days) confirmed');
    }
  }

  // +30 for fixed amount (or +20 for FX tolerance / Price Hike match)
  if (isFixedAmount) {
    confidenceScore += 30;
    whyDetected.push(`Fixed amount: £${amounts[0].toFixed(2)}`);
  } else if (hasPriceHike) {
    confidenceScore += 20;
    whyDetected.push(`Price increased by £${priceAlert!.difference.toFixed(2)} on latest billing`);
  } else if (hasFxTolerance && isKeyDayConsistent) {
    confidenceScore += 20;
    whyDetected.push('FX billed subscription within ±8% variance on consistent monthly key day');
  } else if (hasTrialConverted) {
    confidenceScore += 20;
    whyDetected.push(
      `Trial converted to paid subscription (initial nominal £${amounts[0].toFixed(2)} followed by £${amounts[amounts.length - 1].toFixed(2)})`,
    );
  }

  // +20 if transaction carries explicit UK DIRECT_DEBIT (DD/DDR) marker or known subscription merchant pattern
  const hasDdMarker = subscriptionType === 'Direct Debit';
  const hasPresetMatch = Boolean(preset && preset.monthly_price_gbp > 0);
  if (hasDdMarker) {
    confidenceScore += 20;
    whyDetected.push('Direct Debit (DDR) marker confirmed');
  } else if (hasPresetMatch) {
    confidenceScore += 20;
    whyDetected.push(`Known subscription merchant pattern: ${preset!.name}`);
  } else if (subscriptionType === 'Recurring Card (CPA)') {
    whyDetected.push('Recurring Card (CPA) payment rail confirmed');
  } else if (subscriptionType === 'Standing Order') {
    whyDetected.push('Standing Order payment rail confirmed');
  }

  // +10 if decimal endings match classic subscription pricing (.99, .95, .49, .00) vs round transfer numbers
  const latestAmount = amounts[amounts.length - 1];
  const decimalEnding = Math.round((latestAmount % 1) * 100);
  if ([99, 95, 49, 0].includes(decimalEnding)) {
    confidenceScore += 10;
    whyDetected.push('Classic subscription pricing decimal ending (.99, .95, .49, .00)');
  }

  // Single transaction baseline for known catalogue presets
  if (amounts.length === 1 && preset) {
    confidenceScore = Math.max(confidenceScore, 60);
  }

  confidenceScore = Math.min(100, Math.max(0, confidenceScore));

  let auditFlag: string | null = null;
  if (hasPriceHike) {
    auditFlag = FLAG_PRICE_HIKE;
  } else if (hasTrialConverted) {
    auditFlag = FLAG_TRIAL_CONVERTED;
  } else if (sorted.some((t) => t.auditFlag === FLAG_VALID_BANK_SUB)) {
    auditFlag = FLAG_VALID_BANK_SUB;
  }

  const confirmingTransactions: ConfirmingTransaction[] = sorted.map((t) => ({
    date: t.dateIso,
    amount: t.amountGbp,
    rawDescription: t.rawDescription || t.rawLine,
  }));

  const lastPaymentDate = latestTx?.dateIso ?? null;
  const nextBillingDate = calculateNextBillingDate(lastPaymentDate, billingCycle, now);
  const daysUntilNextPayment = calculateDaysUntilNextPayment(nextBillingDate, now);
  const isVerifiedRecurring =
    intervalConfirmed || hasPriceHike || hasTrialConverted || sorted.length > 1;

  return {
    isVerifiedRecurring,
    billingCycle,
    lastPaymentDate,
    nextBillingDate,
    daysUntilNextPayment,
    amountGbp: latestAmount,
    confidenceScore,
    subscriptionType,
    whyDetected,
    confirmingTransactions,
    priceAlert: priceAlert || null,
    auditFlag,
    evidence: {
      confidenceScore,
      subscriptionType,
      whyDetected,
      confirmingTransactions,
      priceAlert: priceAlert || null,
      auditFlag: auditFlag || null,
    },
  };
}

function isPotentialUnknownSubscription(
  tx: ScannedTransaction,
  occurrenceCount = 1,
  intervalConfirmed = false,
): boolean {
  if ((tx.validityScore ?? 3) < 3 || tx.tableState === 'OUT_OF_TABLE') return false;
  const merchant = tx.cleanedMerchant.trim();
  if (merchant.length < 3) return false;
  if (isOneOffMerchant(tx)) return false;

  // Generic Apple billing or Google Play Pass requires an explicit recurring signal
  // or multiple recurring occurrences with a confirmed billing interval.
  if (/^APPLE\s+BILLING$/i.test(merchant)) {
    return Boolean(tx.hasStrongRecurringMarker) || (occurrenceCount > 1 && intervalConfirmed);
  }
  if (/GOOGLE\s*PLAY[\s\S]{0,80}PASS|PLAY\s*PASS/i.test(`${merchant} ${tx.rawLine}`)) {
    return true;
  }

  // Unknown merchants cannot automatically become subscriptions from words such as
  // PREMIUM, MONTHLY, PLAN or SUBSCRIPTION alone without either a bank-level
  // recurring payment marker (Direct Debit / Card Subscription / Recurring Card Purchase)
  // or validated recurring payment intervals across multiple transactions (Gate 2 & Gate 3).
  if (!tx.dateIso) return false;
  if (occurrenceCount > 1 && intervalConfirmed) {
    return true;
  }
  return EXPLICIT_UNKNOWN_SUBSCRIPTION_SIGNAL.test(tx.rawLine);
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
  const presets = [...getPresets().map(toStatementPreset), ...BANK_PROVIDER_PRESETS];
  const grouped = new Map<
    string,
    { match: MatchedSubscription; occurrences: number; latestIso: string | null }
  >();
  const occurrenceCounts = new Map<string, number>();
  const datesByMerchantKey = new Map<string, string[]>();
  const txsByGroupKey = new Map<string, ScannedTransaction[]>();

  for (const tx of transactions) {
    if (tx.status === 'QUARANTINED') continue;
    const merchantKey =
      /^APPLE\s+BILLING$/i.test(tx.cleanedMerchant)
        ? `APPLEBILLING-${Math.round(tx.amountGbp * 100)}`
        : tx.canonicalMerchant
          ? alphanum(tx.canonicalMerchant)
          : alphanum(tx.cleanedMerchant);
    occurrenceCounts.set(merchantKey, (occurrenceCounts.get(merchantKey) ?? 0) + 1);
    if (tx.dateIso) {
      const list = datesByMerchantKey.get(merchantKey) ?? [];
      list.push(tx.dateIso);
      datesByMerchantKey.set(merchantKey, list);
    }
  }

  for (const tx of transactions) {
    // Gate 1 enforcement: never allow any transaction with validityScore < 3, OUT_OF_TABLE, or QUARANTINED to enter matching.
    const validityScore: 0 | 1 | 2 | 3 = tx.validityScore ?? (tx.amountGbp > 0 && !tx.isCredit ? 3 : 0);
    if (validityScore < 3 || tx.tableState === 'OUT_OF_TABLE' || tx.status === 'QUARANTINED') continue;

    const learning = getScannerLearning(tx.cleanedMerchant);
    if (learning?.decision === 'dismissed') continue;

    let candidate = matchTransaction(tx, presets);
    // A confirmed local decision may teach an exact merchant that is not in
    // the catalogue. It is deliberately exact-key only and is never allowed
    // to bypass Gate 1 or one-off/transfer protection or replace a stronger catalogue match.
    if (!candidate && learning?.decision === 'confirmed' && !isOneOffMerchant(tx)) {
      candidate = {
        learned: true,
        confidence: 0.93,
        tier: 1,
        identityScore: 3,
        reasonCode: 'ALIAS_MATCH',
        preset: {
          id: learning.presetId || `learned-${learning.merchantKey}`,
          name: learning.serviceName,
          category: learning.category,
          monthly_price_gbp: learning.amountGbp || tx.amountGbp,
          notes: 'Confirmed locally by the user.',
          cancel_url: learning.cancelUrl || '',
        },
      };
    }
    if (!candidate) {
      const merchantKey =
        /^APPLE\s+BILLING$/i.test(tx.cleanedMerchant)
          ? `APPLEBILLING-${Math.round(tx.amountGbp * 100)}`
          : tx.canonicalMerchant
            ? alphanum(tx.canonicalMerchant)
            : alphanum(tx.cleanedMerchant);
      const occurrenceCount = occurrenceCounts.get(merchantKey) ?? 0;
      const intervalCheck = computeIntervalRecurrence(datesByMerchantKey.get(merchantKey) ?? []);
      if (!isPotentialUnknownSubscription(tx, occurrenceCount, intervalCheck.confirmed)) continue;

      const recurrenceScore: 0 | 1 | 2 | 3 =
        intervalCheck.confirmed || tx.hasStrongRecurringMarker ? 3 : 2;
      const gateScores: ScannerGateScores = {
        validity: validityScore,
        identity: 2,
        recurrence: recurrenceScore,
      };
      if (gateScores.validity < 3 || gateScores.identity < 2 || gateScores.recurrence < 2) continue;

      const reasonCodes: ScannerReasonCode[] = [...(tx.reasonCodes ?? ['VALID_DEBIT'])];
      if (intervalCheck.confirmed && !reasonCodes.includes('INTERVAL_CONFIRMED')) {
        reasonCodes.push('INTERVAL_CONFIRMED');
      }

      const datedCount = (datesByMerchantKey.get(merchantKey) ?? []).length;
      const verifiedUnknown = datedCount >= 2 ? intervalCheck.confirmed : occurrenceCount > 1;
      let unknownId = unknownMerchantKey(tx.cleanedMerchant, tx.rawLine, tx.amountGbp);
      for (const existingKey of grouped.keys()) {
        if (!existingKey.startsWith('unknown-')) continue;
        if (existingKey.startsWith('unknown-APPLEBILLING-') || existingKey.startsWith('unknown-GOOGLEPLAYPASS')) continue;
        const existingToken = existingKey.replace(/^unknown-/, '');
        const currentToken = unknownId.replace(/^unknown-/, '');
        if (
          existingToken.length >= 4 &&
          currentToken.length >= 4 &&
          areMerchantsFuzzyMatch(existingToken, currentToken)
        ) {
          unknownId = existingKey;
          break;
        }
      }
      const existingUnknown = grouped.get(unknownId);
      const cycle: BillingCycle = intervalCheck.cycle ?? 'Monthly';
      const unknownPayload: MatchedSubscription = {
        id: `scan-${unknownId}`,
        presetId: unknownId,
        serviceName: unknownMerchantDisplay(tx.cleanedMerchant, tx.rawLine),
        category: inferUnknownCategory(tx.cleanedMerchant),
        amountGbp: tx.amountGbp,
        billingCycle: cycle,
        billingDay: tx.billingDay,
        lastPaymentDate: tx.dateIso,
        nextBillingDate: calculateNextBillingDate(tx.dateIso, cycle, now),
        daysUntilNextPayment: calculateDaysUntilNextPayment(
          calculateNextBillingDate(tx.dateIso, cycle, now),
          now,
        ),
        confidence: verifiedUnknown ? 0.78 : 0.62,
        matchTier: 3,
        isVerifiedRecurring: verifiedUnknown,
        hasCancellationTrap: false,
        trapLabel: null,
        color: '#D4AF37',
        cancelUrl: '',
        selected: true,
        requiresReview: true,
        gateScores,
        reasonCodes,
      };

      const groupTxs = txsByGroupKey.get(unknownId) ?? [];
      groupTxs.push(tx);
      txsByGroupKey.set(unknownId, groupTxs);

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
        existingUnknown.match.isVerifiedRecurring = verifiedUnknown;
        existingUnknown.match.confidence = verifiedUnknown ? 0.78 : 0.62;
      }
      continue;
    }

    const isAppleTvPreset = candidate.preset.id === 'apple_tv_plus_uk';
    const groupKey = isAppleTvPreset
      ? `${candidate.preset.id}-${Math.round(tx.amountGbp * 100)}`
      : candidate.preset.id;
    const merchantKey = tx.canonicalMerchant ? alphanum(tx.canonicalMerchant) : alphanum(tx.cleanedMerchant);
    const intervalCheck = computeIntervalRecurrence(datesByMerchantKey.get(merchantKey) ?? []);
    const recurrenceScore: 0 | 1 | 2 | 3 =
      intervalCheck.confirmed || tx.hasStrongRecurringMarker ? 3 : 2;
    const gateScores: ScannerGateScores = {
      validity: validityScore,
      identity: candidate.identityScore,
      recurrence: recurrenceScore,
    };
    if (gateScores.validity < 3 || gateScores.identity < 2 || gateScores.recurrence < 2) continue;

    const reasonCodes: ScannerReasonCode[] = [
      ...(tx.reasonCodes ?? ['VALID_DEBIT']),
      candidate.reasonCode,
    ];
    if (intervalCheck.confirmed && !reasonCodes.includes('INTERVAL_CONFIRMED')) {
      reasonCodes.push('INTERVAL_CONFIRMED');
    }

    const groupTxs = txsByGroupKey.get(groupKey) ?? [];
    groupTxs.push(tx);
    txsByGroupKey.set(groupKey, groupTxs);

    const existing = grouped.get(groupKey);
    const billingCycle = candidate.learned && candidate.preset.monthly_price_gbp > 0
      ? (learning?.frequency === 'yearly' ? 'Annual' : 'Monthly')
      : (intervalCheck.cycle ?? inferBillingCycle(tx.amountGbp, candidate.preset.monthly_price_gbp));
    const nextDate = calculateNextBillingDate(tx.dateIso, billingCycle, now);
    const payload: MatchedSubscription = {
      id: `scan-${groupKey}`,
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
      isVerifiedRecurring: intervalCheck.confirmed,
      hasCancellationTrap: isTrap(candidate.preset),
      trapLabel: trapLabel(candidate.preset),
      color: PRESET_COLORS[candidate.preset.id] ?? '#D4AF37',
      cancelUrl: candidate.preset.cancel_url,
      selected: true,
      gateScores,
      reasonCodes,
    };

    if (!existing) {
      grouped.set(groupKey, {
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
    existing.match.isVerifiedRecurring = existing.occurrences > 1 || intervalCheck.confirmed;
  }

  // Attach Stage 5 Evidence, Confidence Score, Subscription Type, Price Alert & Audit Flag to each matched subscription
  for (const [groupKey, entry] of grouped.entries()) {
    const confirmingTxs = txsByGroupKey.get(groupKey) ?? [];
    const candidatePreset = presets.find((p) => p.id === entry.match.presetId) ?? null;
    const evidenceResult = evaluateSubscriptionRecurrenceAndEvidence(
      confirmingTxs.length > 0
        ? confirmingTxs
        : [
            {
              rawLine: entry.match.serviceName,
              cleanedMerchant: entry.match.serviceName,
              amountGbp: entry.match.amountGbp,
              dateIso: entry.match.lastPaymentDate,
              billingDay: entry.match.billingDay,
              isCredit: false,
              isHighValueTransfer: false,
              status: 'ACCEPTED',
            },
          ],
      candidatePreset,
      entry.match.serviceName,
      entry.match.category,
      now,
    );

    entry.match.evidence = {
      confidenceScore: evidenceResult.confidenceScore,
      subscriptionType: evidenceResult.subscriptionType,
      whyDetected: evidenceResult.whyDetected,
      confirmingTransactions: evidenceResult.confirmingTransactions,
      priceAlert: evidenceResult.priceAlert,
      auditFlag: evidenceResult.auditFlag,
    };
    entry.match.confidenceScore = evidenceResult.confidenceScore;
    entry.match.subscriptionType = evidenceResult.subscriptionType;
    if (evidenceResult.priceAlert) {
      entry.match.priceAlert = evidenceResult.priceAlert;
      entry.match.amountGbp = evidenceResult.amountGbp;
    }
    if (evidenceResult.auditFlag) {
      entry.match.auditFlag = evidenceResult.auditFlag;
    }
    if (evidenceResult.isVerifiedRecurring) {
      entry.match.isVerifiedRecurring = true;
      entry.match.billingCycle = evidenceResult.billingCycle;
      entry.match.nextBillingDate = evidenceResult.nextBillingDate;
      entry.match.daysUntilNextPayment = evidenceResult.daysUntilNextPayment;
    }
  }

  const allEntries = Array.from(grouped.values());
  const catalogueMatches = allEntries
    .filter((entry) => !entry.match.presetId.startsWith('unknown-'))
    .map((entry) => ({ ...entry.match, requiresReview: false }));

  // Catalogue-First Policy: keep explicit Apple/plan-labelled recurring descriptors,
  // and cap general unlabelled unknown Direct Debit candidates at maximum 2 per scan.
  const EXPLICIT_PLAN_LABEL_PATTERN = /\b(?:MONTHLY|ANNUAL|YEARLY|PLAN|SUBSCRIPTION|MEMBERSHIP|PASS)\b/i;
  const isExplicitPlanOrAppleUnknown = (entry: { match: MatchedSubscription }) =>
    entry.match.presetId.startsWith('unknown-APPLEBILLING') ||
    entry.match.presetId === 'unknown-GOOGLEPLAYPASS' ||
    EXPLICIT_PLAN_LABEL_PATTERN.test(entry.match.serviceName);

  const explicitPlanUnknowns = allEntries
    .filter((entry) => entry.match.presetId.startsWith('unknown-') && isExplicitPlanOrAppleUnknown(entry))
    .map((entry) => ({ ...entry.match, requiresReview: true }));

  const MAX_UNKNOWN_CANDIDATES_PER_SCAN = 2;
  const generalUnknowns = allEntries
    .filter((entry) => entry.match.presetId.startsWith('unknown-') && !isExplicitPlanOrAppleUnknown(entry))
    .sort((a, b) => {
      if (a.match.isVerifiedRecurring !== b.match.isVerifiedRecurring) {
        return a.match.isVerifiedRecurring ? -1 : 1;
      }
      if (b.match.confidence !== a.match.confidence) {
        return b.match.confidence - a.match.confidence;
      }
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      return b.match.amountGbp - a.match.amountGbp;
    })
    .slice(0, MAX_UNKNOWN_CANDIDATES_PER_SCAN)
    .map((entry) => ({ ...entry.match, requiresReview: true }));

  const rawCandidates = [...catalogueMatches, ...explicitPlanUnknowns, ...generalUnknowns];

  // Final 3-Level Subscription Safety Filter:
  // Level 1: White-list (High Confidence) - matches monetry_database.json / known digital/telecom/bank services
  // Level 2: Explicit Bank Signals (Direct Debit, DD, DDR, CARD SUBSCRIPTION, CPA, or explicit subscription plan markers)
  // Level 3: Everything else -> REJECT (Local shops, supermarkets, restaurants, one-off purchases)
  const KNOWN_DIGITAL_OR_PRESET_PATTERN =
    /\b(?:NETFLIX|SPOTIFY|DISNEY|PRIME|AMAZON\s*PRIME|APPLE|GOOGLE|MICROSOFT|ADOBE|CANVA|CHATGPT|OPENAI|CLAUDE|ANTHROPIC|YOUTUBE|AUDIBLE|BBC\s*TV|TV\s*LICENC|DAZN|PARAMOUNT|DISCOVERY|TNT\s*SPORTS|GUARDIAN|PUREGYM|GYM\s*GROUP|DAVID\s*LLOYD|JD\s*GYMS|VIRGIN\s*ACTIVE|STRAVA|MYFITNESSPAL|WHOOP|HEADSPACE|CALM|PLAYSTATION|PSN|XBOX|NINTENDO|NORDVPN|EXPRESSVPN|SURFSHARK|DELIVEROO|UBER\s*ONE|JUST\s*EAT|HELLOFRESH|GOUSTO|PRET|TESCO\s*CLUBCARD|ASOS\s*PREMIER|EXPERIAN|CLEARSCORE|EQUIFAX|MONZO|REVOLUT|STARLING|CURVE|THREE|H3G|GIFFGAFF|LYCAMOBILE|LYCA|LEBARA|O2|VODAFONE|EE|VIRGIN\s*MEDIA|TALKTALK|PLUSNET|BT|SKY|NOW\s*TV|READLY|KOBO|SUBSTACK|GEFORCE|PATREON|GITHUB|LINKEDIN|ZOOM|SLACK|NOTION|FIGMA|MIDJOURNEY|DUOLINGO|GRAMMARLY|PROTON|1PASSWORD|BITWARDEN|DROPBOX|DEEZER|TIDAL|SOUNDCLOUD|MEDIUM|LLOYDS|BARCLAYS|HALIFAX|NATWEST|SANTANDER|HSBC)\b/i;

  const EXPLICIT_BANK_OR_SUB_SIGNAL_PATTERN =
    /\b(?:DIRECT\s+DEBIT|D\/D|DDR|DD|OUTWARD\s+DIRECT\s+DEBIT|DIRECT\s+DEBIT\s+PAYMENT|CARD\s+SUBSCRIPTION|CONTINUOUS\s+PAYMENT\s+AUTHORITY|CONTINUOUS\s+PAYMENT|\bCPA\b|RECURRING\s+CARD\s+PURCHASE|RECURRING\s+CARD\s+PAYMENT|RECURRING\s+PAYMENT|AUTOMATIC\s+PAYMENT|PREAPPROVED\s+PAYMENT|SUBSCRIPTION\s+PAYMENT|MONTHLY\s+SERVICE\s+FEE|ACCOUNT\s+FEE|ULTIMATE\s+REWARD|SILVER\s+ACCOUNT|PREMIUM\s+PLAN\s+FEE|METAL\s+PLAN\s+FEE|PLAN\s+FEE|MEMBERSHIP|SUBSCRIPTION|PASS)\b/i;

  const RECURRING_DIGITAL_DESCRIPTOR_PATTERN =
    /\b(?:PLUS|PRO|CLOUD|NEWSLETTER|MAGAZINE|STREAM|FITNESS|GYM)\b/i;

  const filteredCandidates = rawCandidates.filter((candidate) => {
    // 1. White-list (High Confidence)
    const isCatalogueMatch = !candidate.presetId.startsWith('unknown-');
    const isAppleOrGoogle =
      candidate.presetId.startsWith('unknown-APPLEBILLING') ||
      candidate.presetId === 'unknown-GOOGLEPLAYPASS' ||
      /\b(?:APPLE|GOOGLE)\b/i.test(candidate.serviceName);
    const isLearnedConfirmed = getScannerLearning(candidate.serviceName)?.decision === 'confirmed';
    const isKnownWhitelistMerchant =
      KNOWN_DIGITAL_OR_PRESET_PATTERN.test(candidate.serviceName) ||
      KNOWN_DIGITAL_OR_PRESET_PATTERN.test(candidate.presetId) ||
      presets.some(
        (p) =>
          p.name.toLowerCase() === candidate.serviceName.toLowerCase() ||
          (candidate.serviceName.length >= 4 && p.name.toLowerCase().includes(candidate.serviceName.toLowerCase())),
      );

    if (isCatalogueMatch || isAppleOrGoogle || isLearnedConfirmed || isKnownWhitelistMerchant) {
      return true;
    }

    // 2. Explicit Bank Signals
    const groupTxs =
      txsByGroupKey.get(candidate.presetId) ??
      txsByGroupKey.get(candidate.id.replace(/^scan-/, '')) ??
      [];
    const rawLines = [
      ...groupTxs.map((t) => t.rawLine || t.rawDescription || ''),
      ...(candidate.evidence?.confirmingTransactions?.map((t) => t.rawDescription) ?? []),
      candidate.serviceName,
    ];

    const hasBankSignal =
      candidate.subscriptionType === 'Direct Debit' ||
      candidate.evidence?.subscriptionType === 'Direct Debit' ||
      EXPLICIT_PLAN_LABEL_PATTERN.test(candidate.serviceName) ||
      groupTxs.some((t) => t.paymentType === 'DIRECT_DEBIT' || t.hasStrongRecurringMarker) ||
      rawLines.some((line) => EXPLICIT_BANK_OR_SUB_SIGNAL_PATTERN.test(line)) ||
      (candidate.isVerifiedRecurring && rawLines.some((line) => RECURRING_DIGITAL_DESCRIPTOR_PATTERN.test(line)));

    if (hasBankSignal) {
      return true;
    }

    // 3. Everything else -> REJECT (local shops, cafes, supermarkets, one-off purchases)
    return false;
  });

  return filteredCandidates.sort((a, b) => b.amountGbp - a.amountGbp);
}
