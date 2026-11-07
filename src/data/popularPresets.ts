import type { SubscriptionCategory, SubscriptionFrequency, Subscription } from '../types/subscription';
import type { PresetService, TrialType } from '../types/database';
import { getDatabase, subscribeToDatabaseUpdates } from '../services/databaseService';

export type PresetFilterGroup = 'All' | 'Streaming' | 'Gyms' | 'Tech & AI' | 'Food & Delivery' | 'Finance';

export interface PopularPreset {
  id: string;
  name: string;
  price: number;
  currency: string;
  frequency: SubscriptionFrequency;
  category: SubscriptionCategory;
  filterGroup: Exclude<PresetFilterGroup, 'All'>;
  color: string;
  cancelUrl: string;
  cancelEmail: string;
  cancelSteps: string[];
  description: string;
  defaultTrialDays: 7 | 14 | 30;
  trialUrl?: string;
  keywords?: string[];
  // Extended fields from SSOT database
  hasFreeTrial: boolean;
  trialType: TrialType;
  notes: string;
  monthlyPriceGbp: number;
  trialDurationDays: number;
}

const PRESET_METADATA: Record<
  string,
  {
    color: string;
    cancelEmail?: string;
    trialUrl?: string;
    keywords: string[];
    cancelSteps: string[];
    filterGroup?: Exclude<PresetFilterGroup, 'All'>;
    frequency?: SubscriptionFrequency;
  }
> = {
  netflix_standard_uk: {
    color: '#E50914',
    cancelEmail: 'support@netflix.com',
    trialUrl: 'https://www.netflix.com/signup',
    filterGroup: 'Streaming',
    keywords: ['streaming', 'tv', 'movies', 'films', 'series', 'video', 'entertainment', 'netflix'],
    cancelSteps: [
      'Log into netflix.com/youraccount',
      'In the Membership & Billing section, click Cancel Membership',
      'Click Finish Cancellation to confirm (access remains until period end)',
    ],
  },
  spotify_premium_uk: {
    color: '#1DB954',
    cancelEmail: 'support@spotify.com',
    trialUrl: 'https://www.spotify.com/uk/premium/',
    filterGroup: 'Streaming',
    keywords: ['music', 'audio', 'podcasts', 'songs', 'streaming', 'spotify'],
    cancelSteps: [
      'Open spotify.com/uk/account in your web browser',
      'Under Your Plan, click Change Plan',
      'Scroll to Cancel Spotify and click Cancel Premium',
      'Retain Spotify Free without losing your saved playlists',
    ],
  },
  disney_plus_uk: {
    color: '#113CCF',
    cancelEmail: 'help@disneyplus.com',
    trialUrl: 'https://www.disneyplus.com/en-gb',
    filterGroup: 'Streaming',
    keywords: ['streaming', 'tv', 'movies', 'marvel', 'pixar', 'disney', 'family'],
    cancelSteps: [
      'Log into disneyplus.com/account',
      'Select your active subscription under the Subscription heading',
      'Click Cancel Subscription and confirm your reason',
    ],
  },
  amazon_prime_uk: {
    color: '#FF9900',
    cancelEmail: 'customer-support@amazon.co.uk',
    trialUrl: 'https://www.amazon.co.uk/amazonprime',
    filterGroup: 'Streaming',
    keywords: ['prime', 'amazon', 'delivery', 'tv', 'video', 'shopping', 'streaming'],
    cancelSteps: [
      'Visit amazon.co.uk -> Your Account -> Prime Membership',
      'Click Manage Membership -> Update, cancel and more',
      'Select End Membership and continue through confirmation screens',
    ],
  },
  apple_tv_plus_uk: {
    color: '#A5A5A5',
    trialUrl: 'https://tv.apple.com/gb',
    filterGroup: 'Streaming',
    keywords: ['apple', 'tv', 'streaming', 'movies', 'series', 'originals'],
    cancelSteps: [
      'Open Settings and select your Apple Account',
      'Choose Subscriptions, then Apple TV+',
      'Select Cancel Subscription and confirm',
    ],
  },
  now_tv_uk: {
    color: '#00877C',
    cancelEmail: 'customerservices@nowtv.com',
    trialUrl: 'https://www.nowtv.com/',
    filterGroup: 'Streaming',
    keywords: ['now', 'tv', 'cinema', 'sports', 'sky', 'hbo', 'streaming'],
    cancelSteps: [
      'Sign into nowtv.com/gb/account/passes',
      'Find your active Entertainment, Cinema or Sports Membership',
      'Click Cancel Membership and decline retention offers until confirmation appears',
    ],
  },
  sky_stream_uk: {
    color: '#0072C9',
    cancelEmail: 'mysky@sky.uk',
    trialUrl: 'https://www.sky.com/tv/stream',
    filterGroup: 'Streaming',
    keywords: ['sky', 'tv', 'stream', 'sports', 'cinema', 'broadband'],
    cancelSteps: [
      'Sign in at sky.com/myaccount',
      'Go to Manage My TV Package -> Cancelling Sky',
      'Sky requires 31 days statutory notice for TV packages',
      'Speak to web chat or phone 0333 7591 018 to confirm termination',
    ],
  },
  youtube_premium_uk: {
    color: '#FF0000',
    cancelEmail: 'support@youtube.com',
    trialUrl: 'https://www.youtube.com/premium',
    filterGroup: 'Streaming',
    keywords: ['youtube', 'video', 'music', 'tv', 'streaming', 'google'],
    cancelSteps: [
      'Visit youtube.com/paid_memberships in your browser',
      'Click Manage Membership next to YouTube Premium',
      'Click Deactivate -> Continue to cancel',
    ],
  },
  audible_uk: {
    color: '#F8991D',
    trialUrl: 'https://www.audible.co.uk/ep/memberbenefits',
    filterGroup: 'Streaming',
    keywords: ['audible', 'audiobooks', 'books', 'audio', 'music', 'amazon', 'podcasts'],
    cancelSteps: [
      'Sign in at audible.co.uk on desktop site and open Account Details',
      'Select Cancel membership and follow the confirmation steps',
      'Spend any remaining credits before confirming cancellation',
    ],
  },
  bbc_tv_licence: {
    color: '#E01919',
    cancelEmail: 'enquiries@tvlicensing.co.uk',
    trialUrl: 'https://www.tvlicensing.co.uk/',
    filterGroup: 'Streaming',
    keywords: ['bbc', 'tv', 'licence', 'iplayer', 'sounds', 'broadcast'],
    cancelSteps: [
      'Visit tvlicensing.co.uk/cancel',
      'Declare that you no longer watch live broadcast TV or BBC iPlayer',
      'Cancel your ongoing Direct Debit with your UK bank (Monzo/Barclays/Lloyds/Revolut)',
    ],
  },
  dazn_uk: {
    color: '#FAB400',
    cancelEmail: 'help@dazn.com',
    trialUrl: 'https://www.dazn.com/en-GB',
    filterGroup: 'Streaming',
    keywords: ['dazn', 'sports', 'boxing', 'football', 'tv', 'streaming', 'nfl'],
    cancelSteps: [
      'Sign in to dazn.com/en-GB/myaccount',
      'Select Subscription -> Cancel Subscription',
      'Note: Flexible pass requires 30 days notice; confirm cancellation date',
    ],
  },
  paramount_plus_uk: {
    color: '#0064FF',
    cancelEmail: 'support@paramountplus.com',
    trialUrl: 'https://www.paramountplus.com/gb/',
    filterGroup: 'Streaming',
    keywords: ['paramount', 'tv', 'movies', 'streaming', 'films', 'series'],
    cancelSteps: [
      'Log into paramountplus.com/gb/account',
      'Click Cancel Subscription at the bottom of your account page',
      'Confirm cancellation to stop auto-renewal after your 7-day trial',
    ],
  },
  discovery_plus_tnt_uk: {
    color: '#0056FF',
    cancelEmail: 'support@discoveryplus.co.uk',
    trialUrl: 'https://www.discoveryplus.com/gb',
    filterGroup: 'Streaming',
    keywords: ['discovery', 'tnt', 'sports', 'tv', 'streaming', 'documentaries'],
    cancelSteps: [
      'Go to discoveryplus.com/gb and open Account',
      'Under Subscription, select Manage -> Cancel',
      'Confirm cancellation prior to your next billing date',
    ],
  },
  the_guardian_digital: {
    color: '#052962',
    cancelEmail: 'customer.help@theguardian.com',
    trialUrl: 'https://support.theguardian.com/subscribe/digital',
    filterGroup: 'Streaming',
    keywords: ['guardian', 'news', 'newspaper', 'magazines', 'reading'],
    cancelSteps: [
      'Log into manage.theguardian.com',
      'Go to Billing and Subscription settings',
      'Click Cancel Subscription and confirm before the next billing cycle',
    ],
  },
  puregym_core_uk: {
    color: '#00A499',
    cancelEmail: 'member.services@puregym.com',
    trialUrl: 'https://www.puregym.com/join/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'puregym', 'fitness', 'workout', 'health', 'weights'],
    cancelSteps: [
      'Log into your account at puregym.com/member/',
      'Navigate to My Profile -> Manage Membership',
      'Select Freeze (pause) or Cancel Membership at least 4 business days before your next Direct Debit date',
      'Confirm the cancellation and keep the confirmation reference email',
    ],
  },
  the_gym_group_uk: {
    color: '#FF5A00',
    cancelEmail: 'membership@thegymgroup.com',
    trialUrl: 'https://www.thegymgroup.com/join-now/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'the gym group', 'fitness', 'workout', 'health'],
    cancelSteps: [
      'Cancel your Direct Debit directly via your UK banking app (Monzo, Barclays, Revolut)',
      'Give at least 4 working days notice before your monthly billing date',
      'Verify cancellation in your Member Area at thegymgroup.com',
    ],
  },
  david_lloyd_uk: {
    color: '#003B5C',
    cancelEmail: 'membership@davidlloyd.co.uk',
    trialUrl: 'https://www.davidlloyd.co.uk/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'david lloyd', 'fitness', 'tennis', 'spa', 'swim', 'health'],
    cancelSteps: [
      'Open the David Lloyd Clubs app -> Manage My Membership -> Request Cancellation',
      'Note: Standard memberships require 3 full calendar months notice after initial term',
      'Save your written cancellation acknowledgment from club support',
    ],
  },
  jd_gyms_uk: {
    color: '#D4AF37',
    cancelEmail: 'help@jdgyms.co.uk',
    trialUrl: 'https://www.jdgyms.co.uk/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'jd gyms', 'fitness', 'workout', 'sauna'],
    cancelSteps: [
      'Complete the online cancellation form at jdgyms.co.uk/cancel-membership/',
      'Wait for the confirmation email before cancelling your Direct Debit at the bank',
    ],
  },
  virgin_active_uk: {
    color: '#E10A0A',
    cancelEmail: 'customerservices@virginactive.co.uk',
    trialUrl: 'https://www.virginactive.co.uk/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'virgin active', 'fitness', 'pilates', 'swim', 'health'],
    cancelSteps: [
      'Log into the Virgin Active app or my.virginactive.co.uk',
      'Go to Membership Details -> Cancel or Freeze Membership',
      'Submit notice by the 17th of the month for termination at the end of the following month',
    ],
  },
  strava_uk: {
    color: '#FC4C02',
    cancelEmail: 'support@strava.com',
    trialUrl: 'https://www.strava.com/subscribe',
    filterGroup: 'Gyms',
    keywords: ['gym', 'fitness', 'running', 'cycling', 'strava', 'health', 'sport'],
    cancelSteps: [
      'Log into strava.com/account (or Apple/Google subscriptions if billed via phone)',
      'Click Cancel Your Subscription and complete the confirmation page',
    ],
  },
  myfitnesspal_premium_uk: {
    color: '#0066EE',
    cancelEmail: 'support@myfitnesspal.com',
    trialUrl: 'https://www.myfitnesspal.com/premium',
    filterGroup: 'Gyms',
    keywords: ['gym', 'fitness', 'calories', 'diet', 'nutrition', 'health'],
    cancelSteps: [
      'Go to myfitnesspal.com/account/my-subscription',
      'Click Cancel Subscription (or cancel via iOS Settings -> Subscriptions)',
    ],
  },
  whoop_uk: {
    color: '#10B981',
    cancelEmail: 'support@whoop.com',
    trialUrl: 'https://join.whoop.com/gb/en/trial/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'fitness', 'whoop', 'wearable', 'sleep', 'health'],
    cancelSteps: [
      'Log in at app.whoop.com/membership on web browser',
      'Select Cancel Membership (during 30-day trial, request return label to avoid annual charge)',
    ],
  },
  headspace_uk: {
    color: '#F47D31',
    cancelEmail: 'help@headspace.com',
    trialUrl: 'https://www.headspace.com/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'health', 'mindfulness', 'meditation', 'sleep', 'headspace', 'mental'],
    cancelSteps: [
      'Visit headspace.com/subscription/manage',
      'Click Turn Off Auto-Renewal and confirm cancellation',
    ],
  },
  calm_premium_uk: {
    color: '#38BDF8',
    cancelEmail: 'support@calm.com',
    trialUrl: 'https://www.calm.com/',
    filterGroup: 'Gyms',
    keywords: ['gym', 'health', 'calm', 'sleep', 'meditation', 'mindfulness'],
    cancelSteps: [
      'Log in to calm.com/profile/subscription (or iOS App Store Subscriptions)',
      'Click Cancel Subscription at least 24 hours before your 7-day trial ends',
    ],
  },
  playstation_plus_uk: {
    color: '#00439C',
    cancelEmail: 'help@uk.playstation.com',
    trialUrl: 'https://store.playstation.com/',
    filterGroup: 'Tech & AI',
    keywords: ['gaming', 'ps5', 'playstation', 'sony', 'games', 'tech'],
    cancelSteps: [
      'Go to PlayStation Settings -> Users and Accounts -> Account -> Payment and Subscriptions',
      'Select Subscriptions -> PlayStation Plus -> Turn Off Auto-Renew',
    ],
  },
  xbox_game_pass_ultimate_uk: {
    color: '#107C10',
    trialUrl: 'https://www.xbox.com/en-GB/xbox-game-pass',
    filterGroup: 'Tech & AI',
    keywords: ['gaming', 'xbox', 'microsoft', 'pc', 'games', 'tech'],
    cancelSteps: [
      'Sign in at account.microsoft.com/services',
      'Click Manage next to Xbox Game Pass Ultimate',
      'Select Cancel subscription or Turn off recurring billing',
    ],
  },
  nintendo_switch_online_uk: {
    color: '#E60012',
    cancelEmail: 'customer-support@nintendo.co.uk',
    trialUrl: 'https://www.nintendo.co.uk/Nintendo-Switch-Online/',
    filterGroup: 'Tech & AI',
    keywords: ['gaming', 'nintendo', 'switch', 'games', 'tech'],
    cancelSteps: [
      'Visit ec.nintendo.com/my/membership and sign in',
      'Click Terminate Automatic Renewal for Nintendo Switch Online',
    ],
  },
  chatgpt_plus_uk: {
    color: '#10A37F',
    cancelEmail: 'support@openai.com',
    trialUrl: 'https://chatgpt.com/',
    filterGroup: 'Tech & AI',
    keywords: ['ai', 'chatgpt', 'openai', 'tech', 'software', 'productivity'],
    cancelSteps: [
      'Open ChatGPT and click your profile in the bottom left',
      'Select Settings -> My Plan',
      'Click Manage My Subscription (Stripe portal) -> Cancel Plan',
    ],
  },
  claude_pro_uk: {
    color: '#D97757',
    cancelEmail: 'support@anthropic.com',
    trialUrl: 'https://claude.ai/',
    filterGroup: 'Tech & AI',
    keywords: ['ai', 'claude', 'anthropic', 'tech', 'coding', 'productivity'],
    cancelSteps: [
      'Log into claude.ai and go to Settings -> Billing',
      'Click Cancel Subscription and confirm in the Stripe portal',
    ],
  },
  apple_icloud_200gb_uk: {
    color: '#3B82F6',
    trialUrl: 'https://www.apple.com/uk/icloud/',
    filterGroup: 'Tech & AI',
    keywords: ['apple', 'icloud', 'cloud', 'storage', 'tech', 'iphone'],
    cancelSteps: [
      'On iPhone, open Settings -> [Your Name] -> iCloud -> Manage Account Storage',
      'Tap Change Storage Plan -> Downgrade Options -> Free (5GB)',
    ],
  },
  google_one_ai_uk: {
    color: '#4285F4',
    trialUrl: 'https://one.google.com/',
    filterGroup: 'Tech & AI',
    keywords: ['google', 'cloud', 'drive', 'storage', 'gemini', 'ai', 'tech'],
    cancelSteps: [
      'Go to one.google.com/settings in your browser',
      'Click Cancel Membership -> Cancel to confirm',
    ],
  },
  microsoft_365_personal_uk: {
    color: '#0078D4',
    trialUrl: 'https://www.microsoft.com/en-gb/microsoft-365/try',
    filterGroup: 'Tech & AI',
    keywords: ['microsoft', 'office', 'word', 'excel', 'onedrive', 'tech', 'productivity'],
    cancelSteps: [
      'Sign in at account.microsoft.com/services',
      'Select Manage next to Microsoft 365 -> Cancel subscription',
    ],
  },
  nordvpn_uk: {
    color: '#4687FF',
    cancelEmail: 'support@nordvpn.com',
    trialUrl: 'https://nordvpn.com/',
    filterGroup: 'Tech & AI',
    keywords: ['vpn', 'nordvpn', 'security', 'privacy', 'tech'],
    cancelSteps: [
      'Sign in to your Nord Account and open Billing',
      'Manage the active NordVPN subscription',
      'Turn off auto-renewal and confirm the change (30-day money-back guarantee available)',
    ],
  },
  expressvpn_uk: {
    color: '#DA3940',
    cancelEmail: 'support@expressvpn.com',
    trialUrl: 'https://www.expressvpn.com/',
    filterGroup: 'Tech & AI',
    keywords: ['vpn', 'expressvpn', 'security', 'privacy', 'tech'],
    cancelSteps: [
      'Sign in at expressvpn.com/subscriptions',
      'Click Edit subscription settings -> Turn Off Automatic Renewal',
    ],
  },
  adobe_creative_cloud_uk: {
    color: '#FA0F00',
    trialUrl: 'https://www.adobe.com/uk/creativecloud.html',
    filterGroup: 'Tech & AI',
    keywords: ['adobe', 'photoshop', 'design', 'video', 'pdf', 'tech', 'creative'],
    cancelSteps: [
      'Sign in at account.adobe.com/plans and click Manage Plan',
      'Tip: Cancel within 14 days of starting for a full refund with £0 early termination fee',
    ],
  },
  canva_pro_uk: {
    color: '#7D2AE8',
    trialUrl: 'https://www.canva.com/en_gb/pro/',
    filterGroup: 'Tech & AI',
    keywords: ['canva', 'design', 'graphics', 'ai', 'tech', 'productivity'],
    cancelSteps: [
      'Open Canva Settings -> Billing & Plans',
      'Click the three dots next to Canva Pro -> Cancel Plan',
    ],
  },
  deliveroo_plus_uk: {
    color: '#00CDBC',
    cancelEmail: 'support@deliveroo.co.uk',
    trialUrl: 'https://deliveroo.co.uk/plus',
    filterGroup: 'Food & Delivery',
    keywords: ['food', 'delivery', 'deliveroo', 'takeaway', 'groceries', 'restaurant'],
    cancelSteps: [
      'Open the Deliveroo app or deliveroo.co.uk/account',
      'Navigate to Deliveroo Plus under Profile settings',
      'Tap Cancel Membership and verify cancellation',
    ],
  },
  uber_one_uk: {
    color: '#F59E0B',
    trialUrl: 'https://www.uber.com/gb/en/u/uber-one/',
    filterGroup: 'Food & Delivery',
    keywords: ['uber', 'ubereats', 'food', 'delivery', 'taxi', 'rides'],
    cancelSteps: [
      'Open the Uber or Uber Eats app -> Account -> Uber One',
      'Tap Manage Membership -> End Membership at least 48h before renewal',
    ],
  },
  just_eat_plus_uk: {
    color: '#FF8000',
    trialUrl: 'https://www.just-eat.co.uk/',
    filterGroup: 'Food & Delivery',
    keywords: ['just eat', 'food', 'delivery', 'takeaway'],
    cancelSteps: [
      'Open the Just Eat app -> Profile -> Just Eat+',
      'Select Manage Membership -> Cancel Just Eat+',
    ],
  },
  hellofresh_uk: {
    color: '#70C98A',
    trialUrl: 'https://www.hellofresh.co.uk/',
    filterGroup: 'Food & Delivery',
    keywords: ['hellofresh', 'food', 'delivery', 'meals', 'cooking', 'recipes', 'box'],
    cancelSteps: [
      'Sign in and open your HelloFresh account settings',
      'Choose Plan Settings and select Cancel Plan',
      'Complete the confirmation steps before Wednesday 11:59 PM cut-off',
    ],
  },
  gousto_uk: {
    color: '#E42313',
    cancelEmail: 'info@gousto.co.uk',
    trialUrl: 'https://www.gousto.co.uk/',
    filterGroup: 'Food & Delivery',
    keywords: ['gousto', 'food', 'delivery', 'meals', 'recipes', 'box'],
    cancelSteps: [
      'Log in at gousto.co.uk -> Account -> Subscription Settings',
      'Click Cancel Account at least 3 days before your next scheduled delivery at 12:00 PM',
    ],
  },
  club_pret_uk: {
    color: '#8B1D41',
    trialUrl: 'https://www.pret.co.uk/en-GB/club-pret',
    filterGroup: 'Food & Delivery',
    keywords: ['pret', 'coffee', 'drinks', 'food', 'cafe', 'club pret'],
    cancelSteps: [
      'Sign into the Pret app or pret.co.uk/en-GB/account',
      'Go to Manage Subscription -> Cancel Club Pret',
    ],
  },
  tesco_clubcard_plus_uk: {
    color: '#00539F',
    trialUrl: 'https://www.tesco.com/clubcard/clubcard-plus',
    filterGroup: 'Food & Delivery',
    keywords: ['tesco', 'clubcard', 'groceries', 'food', 'supermarket', 'shopping'],
    cancelSteps: [
      'Sign in at secure.tesco.com/clubcard/myaccount',
      'Go to Clubcard Plus -> Cancel subscription',
    ],
  },
  asos_premier_uk: {
    color: '#A0A0A0',
    trialUrl: 'https://www.asos.com/premier-delivery/',
    filterGroup: 'Food & Delivery',
    frequency: 'yearly',
    keywords: ['asos', 'delivery', 'shopping', 'clothes', 'fashion'],
    cancelSteps: [
      'Log in at my.asos.com -> ASOS Premier',
      'Turn off Auto-Renew so you are not billed again next year',
    ],
  },
  experian_creditexpert_uk: {
    color: '#1D4ED8',
    cancelEmail: 'customerservices@uk.experian.com',
    trialUrl: 'https://www.experian.co.uk/consumer/credit-expert.html',
    filterGroup: 'Finance',
    keywords: ['finance', 'credit', 'score', 'experian', 'mortgage', 'bank'],
    cancelSteps: [
      'Log into experian.co.uk -> My Account -> Subscription details',
      'Click Downgrade to Free Experian Account before your 30-day trial expires',
    ],
  },
  clearscore_protect_uk: {
    color: '#06B6D4',
    cancelEmail: 'help@clearscore.com',
    trialUrl: 'https://www.clearscore.com/protect',
    filterGroup: 'Finance',
    keywords: ['finance', 'credit', 'score', 'clearscore', 'identity'],
    cancelSteps: [
      'Log into my.clearscore.com/account -> ClearScore Protect',
      'Click Cancel Subscription (your core ClearScore report remains 100% free)',
    ],
  },
  equifax_uk: {
    color: '#B91C1C',
    trialUrl: 'https://www.equifax.co.uk/',
    filterGroup: 'Finance',
    keywords: ['finance', 'credit', 'score', 'equifax', 'report'],
    cancelSteps: [
      'Log into equifax.co.uk/myequifax -> My Account',
      'Select Cancel Subscription before your 30-day free trial ends',
    ],
  },
  monzo_perks_uk: {
    color: '#FF365D',
    cancelEmail: 'help@monzo.com',
    trialUrl: 'https://monzo.com/features/monzo-perks/',
    filterGroup: 'Finance',
    keywords: ['finance', 'credit', 'score', 'monzo', 'bank', 'banking', 'perks', 'plus', 'max'],
    cancelSteps: [
      'Open the Monzo app on your smartphone',
      'Tap your profile icon -> Your Monzo Plan',
      'Scroll to the bottom and select Cancel Plan',
    ],
  },
  revolut_premium_uk: {
    color: '#38BDF8',
    trialUrl: 'https://www.revolut.com/revolut-premium/',
    filterGroup: 'Finance',
    keywords: ['finance', 'revolut', 'bank', 'banking', 'metal', 'premium', 'travel'],
    cancelSteps: [
      'Open the Revolut app -> tap your Profile icon -> Your Plan',
      'Scroll down to Manage -> Change Plan -> Downgrade to Standard (Free)',
    ],
  },
};

function resolveDefaultTrialDays(trialDurationDays: number): 7 | 14 | 30 {
  if (trialDurationDays === 30 || trialDurationDays === 14 || trialDurationDays === 7) {
    return trialDurationDays;
  }
  return 7;
}

/**
 * Validates whether a preset service genuinely provides an active, verified UK Free Trial.
 * Returns false for non-trial services (e.g. Netflix UK, Disney+ UK) and cooling-off / refund periods.
 */
export function hasActiveUkFreeTrial(preset?: {
  hasFreeTrial?: boolean;
  trialType?: string;
  trialDurationDays?: number;
  defaultTrialDays?: number;
  trialUrl?: string;
} | null): boolean {
  if (!preset) return false;
  if (preset.hasFreeTrial !== true || preset.trialType === 'none') {
    return false;
  }
  if (preset.trialType === 'cooling_off' || preset.trialType === 'money_back') {
    return false;
  }
  const days =
    typeof preset.trialDurationDays === 'number' && preset.trialDurationDays > 0
      ? preset.trialDurationDays
      : preset.defaultTrialDays || 0;
  if (days <= 0) return false;
  const url = preset.trialUrl?.trim();
  if (!url) return false;
  return true;
}

export const CONCISE_CANCELLATION_TIPS: Record<string, string> = {
  netflix_standard_uk: 'Cancel online anytime in your Netflix account with access continuing until the billing period ends.',
  spotify_premium_uk: 'Cancel in your Spotify account overview to revert to Spotify Free while keeping your playlists.',
  disney_plus_uk: 'Cancel online in your Disney+ subscription settings before your next billing date.',
  amazon_prime_uk: 'Manage or end membership in Amazon Prime Central before renewal to avoid automatic annual billing.',
  apple_tv_plus_uk: 'Cancel at least 24 hours before renewal in Apple Subscriptions; trial access ends immediately upon cancellation.',
  now_tv_uk: 'Cancel each active Cinema, Entertainment, or Boost pass individually in your NOW account settings.',
  sky_stream_uk: 'Rolling Sky plans require 31 days advance notice via your MySky account or support chat.',
  youtube_premium_uk: 'Cancel anytime via YouTube Paid Memberships in your web browser or mobile settings.',
  audible_uk: 'Spend any remaining audiobook credits before cancelling in Audible account details, as unused credits expire.',
  bbc_tv_licence: 'Cancel online via TV Licensing if you no longer watch live TV or use BBC iPlayer.',
  dazn_uk: 'Monthly Flex plans require 30 days advance notice in your DAZN account settings.',
  paramount_plus_uk: 'Cancel in your Paramount+ account settings at least 24 hours prior to your renewal date.',
  discovery_plus_tnt_uk: 'Cancel online anytime in your Discovery+ account settings before the next monthly billing cycle.',
  the_guardian_digital: 'Manage or cancel your digital subscription online via your Guardian account portal.',
  puregym_core_uk: 'Cancel online via the PureGym member dashboard at least 4 working days before your Direct Debit date.',
  the_gym_group_uk: 'Cancel in the member portal at least 4 working days before your next Direct Debit payment.',
  david_lloyd_uk: 'Requires 3 full calendar months written notice after your initial commitment period.',
  jd_gyms_uk: 'Submit the online cancellation form at least 14 days before your billing date before stopping your Direct Debit.',
  virgin_active_uk: 'Requires 30 days formal notice via your home club or the Virgin Active member portal.',
  strava_uk: 'Cancel in Strava account settings at least 24 hours before trial or annual renewal.',
  myfitnesspal_premium_uk: 'Cancel via your web account or app store subscriptions at least 24 hours before renewal.',
  whoop_uk: 'Cancel online and return any trial hardware within the return window to avoid commitment fees.',
  headspace_uk: 'Turn off auto-renewal in your Headspace subscription settings at least 24 hours before renewal.',
  calm_premium_uk: 'Cancel at least 24 hours before trial or annual renewal in your Calm account settings.',
  playstation_plus_uk: 'Turn off auto-renewal in PlayStation account Subscription Management before your next billing date.',
  xbox_game_pass_ultimate_uk: 'Turn off recurring billing online in your Microsoft Services & Subscriptions dashboard.',
  nintendo_switch_online_uk: 'Turn off automatic renewal in Nintendo eShop or account membership settings.',
  chatgpt_plus_uk: 'Cancel anytime under My Plan in ChatGPT settings at least 24 hours before renewal.',
  claude_pro_uk: 'Cancel anytime via Billing settings in your Claude account before your monthly renewal.',
  apple_icloud_200gb_uk: 'Downgrade or cancel anytime in iPhone Settings under your Apple Account and iCloud storage.',
  google_one_ai_uk: 'Cancel or downgrade your storage plan anytime in Google One membership settings.',
  microsoft_365_personal_uk: 'Turn off recurring billing in your Microsoft account Services & Subscriptions portal.',
  nordvpn_uk: 'Cancel auto-renewal in your Nord Account billing tab; 30-day refunds require live support chat.',
  expressvpn_uk: 'Turn off automatic renewal in your ExpressVPN dashboard under My Subscription.',
  adobe_creative_cloud_uk: 'Manage plan in your Adobe account; cancelling an annual contract after 14 days may incur an early exit fee.',
  canva_pro_uk: 'Cancel anytime under Billing & Teams in Canva settings while keeping access to free designs.',
  deliveroo_plus_uk: 'Cancel anytime in the Deliveroo app under Account and Deliveroo Plus membership.',
  uber_one_uk: 'Cancel in the Uber app at least 48 hours before your next billing date to avoid renewal.',
  just_eat_plus_uk: 'Cancel anytime in your Just Eat account settings prior to your monthly renewal date.',
  hellofresh_uk: 'Pause or cancel in Plan Settings by 11:59 PM on the Wednesday before your next scheduled delivery.',
  gousto_uk: 'Skip or cancel in Subscription Settings before 12:00 PM noon, 3 days prior to delivery.',
  club_pret_uk: 'Cancel anytime via your Pret account settings in the app or online.',
  tesco_clubcard_plus_uk: 'Cancel anytime in your Tesco Clubcard account settings before your next monthly billing date.',
  asos_premier_uk: 'Turn off auto-renew in your ASOS Premier account settings before your annual renewal date.',
  experian_creditexpert_uk: 'Downgrade to the free Experian account in Subscription Details before your billing cycle renews.',
  clearscore_protect_uk: 'Cancel the Protect add-on in your ClearScore account settings; your core credit report stays free.',
  equifax_uk: 'Cancel your subscription online in MyEquifax account settings before the next billing date.',
  monzo_perks_uk: 'Cancel directly in the Monzo app under Perks settings.',
  revolut_premium_uk: 'Cancel in the Revolut app under Your Plan; early termination within 12 months may incur a break fee.',
};

const BOILERPLATE_NOTE_PATTERNS = [
  /^local preset$/i,
  /^cancellation trap detected\.?$/i,
  /^no (uk )?free trial\.?$/i,
  /^auto[- ]?detected( recurring)? subscription\.?$/i,
  /^recurring subscription\.?$/i,
  /^subscription\.?$/i,
  /^monthly subscription\.?$/i,
  /^annual subscription\.?$/i,
];

export function isRedundantSubscriptionNote(
  note: string | undefined | null,
  serviceName?: string | null,
  presetName?: string | null
): boolean {
  if (!note || typeof note !== 'string') return true;
  const trimmed = note.trim();
  if (!trimmed) return true;

  if (BOILERPLATE_NOTE_PATTERNS.some((re) => re.test(trimmed))) {
    return true;
  }

  const normNote = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normNote) return true;

  const names = [serviceName, presetName]
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean);

  for (const normName of names) {
    if (normNote === normName) return true;
    if (normName.includes(normNote) && normNote.split(/\s+/).length <= 4) return true;
    if (normNote.includes(normName)) {
      const remainder = normNote.replace(normName, '').trim();
      const extraWords = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
      if (extraWords.length <= 2) return true;
    }
  }

  return false;
}

export function resolveConciseCancellationTip(
  serviceName: string,
  rawNote?: string | null,
  presetId?: string | null,
  presetName?: string | null
): string | null {
  if (rawNote !== undefined && rawNote !== null && rawNote.trim() !== '') {
    if (isRedundantSubscriptionNote(rawNote, serviceName, presetName)) {
      return null;
    }
  }

  if (presetId && CONCISE_CANCELLATION_TIPS[presetId]) {
    if (!rawNote || !rawNote.trim()) {
      return CONCISE_CANCELLATION_TIPS[presetId];
    }
  }

  if (rawNote && rawNote.trim()) {
    const clean = rawNote.trim();
    if (isRedundantSubscriptionNote(clean, serviceName, presetName)) {
      return null;
    }
    if (presetId && CONCISE_CANCELLATION_TIPS[presetId]) {
      const dbPreset = getDatabase().presets.find((p) => p.id === presetId);
      if (dbPreset && dbPreset.notes && clean === dbPreset.notes.trim()) {
        return CONCISE_CANCELLATION_TIPS[presetId];
      }
    }
    return clean;
  }

  if (presetId && CONCISE_CANCELLATION_TIPS[presetId]) {
    return CONCISE_CANCELLATION_TIPS[presetId];
  }

  return null;
}

export function mapPresetToPopularPreset(preset: PresetService): PopularPreset {
  const meta = PRESET_METADATA[preset.id] || {
    color: '#D4AF7C',
    keywords: [preset.name.toLowerCase()],
    cancelSteps: [
      `Sign into your account at ${preset.name}`,
      `Navigate to Account Settings -> Subscriptions`,
      `Select Cancel Subscription and confirm termination`,
    ],
  };

  const defaultTrialDays = resolveDefaultTrialDays(preset.trial_duration_days);
  const conciseTip = CONCISE_CANCELLATION_TIPS[preset.id] || (meta as any).description || '';

  return {
    id: preset.id,
    name: preset.name,
    price: preset.monthly_price_gbp,
    currency: '£',
    frequency: meta.frequency || 'monthly',
    category: preset.category,
    filterGroup: meta.filterGroup || 'Streaming',
    color: meta.color,
    cancelUrl: preset.cancel_url,
    cancelEmail: meta.cancelEmail || '',
    cancelSteps: meta.cancelSteps,
    description: conciseTip,
    defaultTrialDays,
    trialUrl: meta.trialUrl || preset.cancel_url,
    keywords: meta.keywords,
    hasFreeTrial: preset.has_free_trial,
    trialType: preset.trial_type,
    notes: CONCISE_CANCELLATION_TIPS[preset.id] || preset.notes,
    monthlyPriceGbp: preset.monthly_price_gbp,
    trialDurationDays: preset.trial_duration_days,
  };
}

export function buildPopularPresets(database = getDatabase()): PopularPreset[] {
  return database.presets.map(mapPresetToPopularPreset);
}

export let POPULAR_PRESETS: PopularPreset[] = buildPopularPresets();

subscribeToDatabaseUpdates((updatedDb) => {
  POPULAR_PRESETS = buildPopularPresets(updatedDb);
});

export function filterPopularPresets(
  searchQuery = '',
  filterGroup: PresetFilterGroup = 'All',
  presetsList: PopularPreset[] = POPULAR_PRESETS
): PopularPreset[] {
  const q = searchQuery.trim().toLowerCase();
  return presetsList.filter((preset) => {
    if (filterGroup !== 'All' && preset.filterGroup !== filterGroup) {
      return false;
    }
    if (!q) return true;
    const inName = preset.name.toLowerCase().includes(q);
    const inCategory = preset.category.toLowerCase().includes(q);
    const inGroup = preset.filterGroup.toLowerCase().includes(q);
    const inDesc = (preset.description || '').toLowerCase().includes(q);
    const inKeywords = (preset.keywords || []).some((kw) => kw.toLowerCase().includes(q));
    return inName || inCategory || inGroup || inDesc || inKeywords;
  });
}

export const INITIAL_DEMO_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'sub-demo-1',
    name: 'Netflix UK Standard',
    price: 12.99,
    currency: '£',
    frequency: 'monthly' as SubscriptionFrequency,
    category: 'Streaming' as SubscriptionCategory,
    nextPaymentDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active' as const,
    color: '#E50914',
    notes: 'Standard 1080p plan for 2 simultaneous screens in UK. Instant online cancellation.',
    cancelUrl: 'https://www.netflix.com/CancelPlan',
    cancelEmail: 'support@netflix.com',
    reminderDaysBefore: 3,
    paymentHistory: [
      { id: 'h1', date: '2026-09-18', amount: 12.99, currency: '£', status: 'paid' as const },
      { id: 'h2', date: '2026-08-18', amount: 12.99, currency: '£', status: 'paid' as const },
    ],
    createdAt: '2026-08-18',
  },
  {
    id: 'sub-demo-2',
    name: 'Spotify Premium UK',
    price: 11.99,
    currency: '£',
    frequency: 'monthly' as SubscriptionFrequency,
    category: 'Music & Audio' as SubscriptionCategory,
    nextPaymentDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active' as const,
    color: '#1DB954',
    notes: 'Individual UK ad-free streaming subscription. Retains playlists if cancelled.',
    cancelUrl: 'https://www.spotify.com/uk/account/overview/',
    cancelEmail: 'support@spotify.com',
    reminderDaysBefore: 2,
    paymentHistory: [
      { id: 'h3', date: '2026-09-27', amount: 11.99, currency: '£', status: 'paid' as const },
    ],
    createdAt: '2026-09-27',
  },
];
