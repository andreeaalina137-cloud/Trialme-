import type { Subscription } from '../types/subscription';
import { convertFrequencyToMonthly } from '../utils/subscriptionCalculations.ts';
import { POPULAR_PRESETS } from './popularPresets';

export interface CheaperAlternative {
  id: string;
  name: string;
  category: Subscription['category'];
  monthlyPrice: number;
  currency: string;
  url: string;
  preferredFor?: string[];
  tags?: string[];
}

export interface AffiliateOffer {
  aliases: string[];
  trialUrl: string;
  trialDays: number;
  annualUrl?: string;
  annualDiscountRate?: number;
}

export const AFFILIATE_OFFERS: AffiliateOffer[] = [
  {
    aliases: ['amazon prime', 'prime video'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_AMAZON_PRIME_TRIAL_URL || 'https://www.amazon.co.uk/amazonprime',
    trialDays: 30,
    annualUrl: import.meta.env?.VITE_AFFILIATE_AMAZON_PRIME_ANNUAL_URL || 'https://www.amazon.co.uk/amazonprime',
    annualDiscountRate: 0.11,
  },
  {
    aliases: ['audible'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_AUDIBLE_TRIAL_URL || 'https://www.audible.co.uk/ep/memberbenefits',
    trialDays: 30,
  },
  {
    aliases: ['apple tv'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_APPLE_TV_TRIAL_URL || 'https://tv.apple.com/gb',
    trialDays: 7,
  },
  {
    aliases: ['nordvpn'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_NORDVPN_TRIAL_URL || 'https://nordvpn.com/',
    trialDays: 30,
    annualUrl: import.meta.env?.VITE_AFFILIATE_NORDVPN_ANNUAL_URL || 'https://nordvpn.com/pricing/',
    annualDiscountRate: 0.2,
  },
  {
    aliases: ['disney+ uk', 'disney plus'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_DISNEY_PLUS_TRIAL_URL || 'https://www.disneyplus.com/en-gb',
    trialDays: 7,
    annualUrl: import.meta.env?.VITE_AFFILIATE_DISNEY_PLUS_ANNUAL_URL || 'https://www.disneyplus.com/en-gb',
    annualDiscountRate: 0.167,
  },
  {
    aliases: ['hellofresh'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_HELLOFRESH_TRIAL_URL || 'https://www.hellofresh.co.uk/',
    trialDays: 7,
    annualUrl: import.meta.env?.VITE_AFFILIATE_HELLOFRESH_ANNUAL_URL || 'https://www.hellofresh.co.uk/',
    annualDiscountRate: 0.2,
  },
  {
    aliases: ['spotify'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_SPOTIFY_TRIAL_URL || 'https://www.spotify.com/uk/premium/',
    trialDays: 30,
  },
  {
    aliases: ['puregym', 'puregym membership'],
    trialUrl: import.meta.env?.VITE_AFFILIATE_PUREGYM_TRIAL_URL || 'https://www.puregym.com/join/',
    trialDays: 7,
    annualUrl: import.meta.env?.VITE_AFFILIATE_PUREGYM_ANNUAL_URL || 'https://www.puregym.com/join/',
    annualDiscountRate: 0.15,
  },
];

function normaliseName(name: string): string {
  return name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getAffiliateOffer(name: string): AffiliateOffer | undefined {
  const normalisedName = normaliseName(name);
  if (!normalisedName) return undefined;

  const directMatch = AFFILIATE_OFFERS.find((offer) =>
    offer.aliases.some((alias) => normalisedName.includes(normaliseName(alias)))
  );
  if (directMatch) return directMatch;

  // Fallback to any preset in POPULAR_PRESETS that has a trialUrl & defaultTrialDays
  const presetMatch = POPULAR_PRESETS.find((preset) => {
    if (!preset.trialUrl || !preset.defaultTrialDays) return false;
    const normPreset = normaliseName(preset.name);
    return normalisedName.includes(normPreset) || normPreset.includes(normalisedName);
  });

  if (presetMatch && presetMatch.trialUrl && presetMatch.defaultTrialDays) {
    return {
      aliases: [presetMatch.name],
      trialUrl: presetMatch.trialUrl,
      trialDays: presetMatch.defaultTrialDays,
    };
  }

  return undefined;
}

const ALTERNATIVES: CheaperAlternative[] = [
  // ===== Streaming =====
  {
    id: 'buynowtv',
    name: 'NOW TV Entertainment',
    category: 'Streaming',
    monthlyPrice: 9.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_NOW_TV_URL || 'https://www.nowtv.com/',
    preferredFor: ['sky', 'netflix', 'stubby'],
    tags: ['streaming', 'tv', 'no-contract'],
  },
  {
    id: 'disney-uk',
    name: 'Disney+ UK',
    category: 'Streaming',
    monthlyPrice: 7.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_DISNEY_PLUS_URL || 'https://www.disneyplus.com/en-gb',
    preferredFor: ['netflix', 'disney', 'hotstar'],
    tags: ['streaming', 'family', 'movies'],
  },
  {
    id: 'amazon-prime',
    name: 'Amazon Prime Video',
    category: 'Streaming',
    monthlyPrice: 5.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_AMAZON_PRIME_URL || 'https://www.amazon.co.uk/prime',
    preferredFor: ['prime', 'amazon'],
    tags: ['streaming', 'video', 'music'],
  },
  {
    id: 'max-uk',
    name: 'Max (HBO Max UK)',
    category: 'Streaming',
    monthlyPrice: 8.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_MAX_URL || 'https://www.max.com/uk',
    preferredFor: ['hbo', 'max', 'discovery'],
    tags: ['streaming', 'premium', 'movies'],
  },
  {
    id: 'paramount',
    name: 'Paramount+ UK',
    category: 'Streaming',
    monthlyPrice: 6.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_PARAMOUNT_URL || 'https://www.paramountplus.com/uk',
    preferredFor: ['paramount', 'comsise'],
    tags: ['streaming', 'tv', 'comedy'],
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll (Anime)',
    category: 'Streaming',
    monthlyPrice: 4.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_CRUNCHYROLL_URL || 'https://www.crunchyroll.com/',
    preferredFor: ['anime', 'crunchyroll'],
    tags: ['streaming', 'anime', 'subtitles'],
  },
  {
    id: 'athletic-health',
    name: 'Athletic Health Unlimited',
    category: 'Fitness & Gym',
    monthlyPrice: 11.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_ATHLETIC_HEALTH_URL || 'https://www.athletichealth.com/',
    preferredFor: ['fitbit', 'health'],
    tags: ['gym', 'fitness', 'wearable'],
  },
  {
    id: '24-7-gym',
    name: '24 Hour Fitness',
    category: 'Fitness & Gym',
    monthlyPrice: 14.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_24HR_FITNESS_URL || 'https://www.24hourfitness.com/',
    preferredFor: ['24h', 'hour', 'fitness'],
    tags: ['gym', '24-hour', 'club'],
  },
  {
    id: 'the-gym-group',
    name: 'The Gym Group',
    category: 'Fitness & Gym',
    monthlyPrice: 13.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_GYM_GROUP_URL || 'https://www.thegymgroup.com/memberships/',
    preferredFor: ['puregym', 'fitness', 'gym'],
    tags: ['gym', 'fitness', 'budget'],
  },
  {
    id: 'surfshark-vpn',
    name: 'Surfshark VPN',
    category: 'AI & Tech',
    monthlyPrice: 2.49,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_SURFSHARK_URL || 'https://surfshark.com/deal',
    preferredFor: ['nordvpn', 'vpn', 'security'],
    tags: ['software', 'vpn', 'security'],
  },
  {
    id: 'gold-gymnasium',
    name: "Gold's Gym (UK)",
    category: 'Fitness & Gym',
    monthlyPrice: 12.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_GOODS_GYM_URL || 'https://www.goldsgym.com/uk/',
    preferredFor: ['golds', 'gym', 'fitness'],
    tags: ['gym', 'global', 'fitness'],
  },
  {
    id: 'anytime',
    name: 'Anytime Fitness',
    category: 'Fitness & Gym',
    monthlyPrice: 13.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_ANYTIME_FITNESS_URL || 'https://www.anytimefitness.co.uk/',
    preferredFor: ['anytime', 'fitness'],
    tags: ['gym', '24/7', 'franchise'],
  },
  {
    id: 'sweat',
    name: 'SWEAT by Kelsey Wells',
    category: 'Fitness & Gym',
    monthlyPrice: 10.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_SWEAT_URL || 'https://www.sweat.com/',
    preferredFor: ['sweat', 'fitness', 'home'],
    tags: ['fitness', 'home', 'online'],
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music Premium',
    category: 'Music & Audio',
    monthlyPrice: 9.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_YOUTUBE_MUSIC_URL || 'https://music.youtube.com/',
    preferredFor: ['youtube', 'music'],
    tags: ['music', 'audio', 'ads-free'],
  },
  {
    id: 'tidal',
    name: 'Tidal HiFi',
    category: 'Music & Audio',
    monthlyPrice: 9.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_TIDAL_URL || 'https://tidal.com/',
    preferredFor: ['tidal', 'music', 'hifi'],
    tags: ['music', 'audio', 'hi-fi'],
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud Go+',
    category: 'Music & Audio',
    monthlyPrice: 7.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_SOUNDCLOUD_URL || 'https://soundcloud.com/',
    preferredFor: ['soundcloud', 'music'],
    tags: ['music', 'audio'],
  },
  {
    id: 'pandora',
    name: 'Pandora (UK Podcast/Music)',
    category: 'Music & Audio',
    monthlyPrice: 4.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_PANDORA_URL || 'https://www.pandora.com/',
    preferredFor: ['pandora', 'music'],
    tags: ['music', 'podcast'],
  },
  {
    id: 'apple-music',
    name: 'Apple Music Individual',
    category: 'Music & Audio',
    monthlyPrice: 10.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_APPLE_MUSIC_URL || 'https://music.apple.com/uk',
    preferredFor: ['apple', 'music'],
    tags: ['music', 'audio', 'ios'],
  },

  // ===== Food & Delivery =====
  {
    id: 'deliveroo-standalone',
    name: 'Deliveroo (Standalone)',
    category: 'Food & Delivery',
    monthlyPrice: 2.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_DELIVEROO_STANDALONE_URL || 'https://www.deliveroo.co.uk/',
    preferredFor: ['deliveroo'],
    tags: ['food', 'delivery', 'groceries'],
  },
  {
    id: 'uber-fresh',
    name: 'Uber Eats (Standalone)',
    category: 'Food & Delivery',
    monthlyPrice: 3.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_UBER_EATS_STANDALONE_URL || 'https://www.ubereats.com/uk/',
    preferredFor: ['ubereats', 'delivery'],
    tags: ['food', 'delivery', 'restaurant'],
  },
  {
    id: 'just-eat',
    name: 'Just Eat (Standalone)',
    category: 'Food & Delivery',
    monthlyPrice: 1.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_JUST_EAT_URL || 'https://www.just-eat.co.uk/',
    preferredFor: ['just-eat', 'food', 'delivery'],
    tags: ['food', 'delivery', 'uk'],
  },
  {
    id: 'ocado',
    name: 'Ocado (The Good Meal Club)',
    category: 'Food & Delivery',
    monthlyPrice: 8.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_OCADO_URL || 'https://www.ocado.com/',
    preferredFor: ['ocado', 'groceries'],
    tags: ['food', 'groceries', 'home'],
  },

  // ===== News & Magazines =====
  {
    id: 'the-guardian',
    name: 'The Guardian (Free+Ad)',
    category: 'News & Magazines',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_GUARDIAN_URL || 'https://www.theguardian.com/uk',
    preferredFor: ['guardian', 'the-guardian'],
    tags: ['news', 'free', 'ad-supported'],
  },
  {
    id: 'monzo-basic',
    name: 'Monzo (Basic Free Account)',
    category: 'Utilities',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_MONZO_BASIC_URL || 'https://www.monzo.com/',
    preferredFor: ['monzo', 'banking'],
    tags: ['banking', 'free', 'uk'],
  },
  {
    id: 'starling',
    name: 'Starling Bank (Free Account)',
    category: 'Utilities',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_STARLING_URL || 'https://www.starlingbank.com/',
    preferredFor: ['starling', 'banking'],
    tags: ['banking', 'free', 'uk'],
  },
  {
    id: 'revolut-standard',
    name: 'Revolut (Standard Plan)',
    category: 'Utilities',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_REVOLUT_STANDARD_URL || 'https://www.revolut.com/',
    preferredFor: ['revolut', 'standard'],
    tags: ['banking', 'free', 'multi-currency'],
  },
  {
    id: 'barclays',
    name: 'Barclays (Basic Current Account)',
    category: 'Utilities',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_BARCLAYS_URL || 'https://www.barclays.co.uk/',
    preferredFor: ['barclays', 'banking'],
    tags: ['banking', 'free', 'uk'],
  },

  // ===== Productivity =====
  {
    id: 'google-workspace',
    name: 'Google Workspace Individual',
    category: 'Productivity',
    monthlyPrice: 7.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_GOOGLE_WORKSPACE_URL || 'https://workspace.google.com/',
    preferredFor: ['google', 'workspace', 'productivity'],
    tags: ['productivity', 'email', 'storage'],
  },
  {
    id: 'notion',
    name: 'Notion (Free Plan)',
    category: 'Productivity',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_NOTION_URL || 'https://www.notion.com/',
    preferredFor: ['notion', 'productivity'],
    tags: ['productivity', 'notes', 'free'],
  },
  {
    id: 'asana',
    name: 'Asana (Free Plan)',
    category: 'Productivity',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_ASANA_URL || 'https://asana.com/',
    preferredFor: ['asana', 'productivity'],
    tags: ['productivity', 'project', 'free'],
  },
  {
    id: 'evernote',
    name: 'Evernote (Free Plan)',
    category: 'Productivity',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_EVERNOTE_URL || 'https://evernote.com/',
    preferredFor: ['evernote', 'productivity'],
    tags: ['productivity', 'notes', 'free'],
  },

  // ===== Gaming =====
  {
    id: 'ps-plus',
    name: 'PlayStation Plus (Essential)',
    category: 'Gaming',
    monthlyPrice: 6.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_PS_PLUS_URL || 'https://www.playstation.com/uk/en/products/PlayStation-Plus/',
    preferredFor: ['psn', 'playstation', 'sony'],
    tags: ['gaming', 'console', 'multiplayer'],
  },
  {
    id: 'epic-games',
    name: 'Epic Games Store (Monthly Free)',
    category: 'Gaming',
    monthlyPrice: 0,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_EPIC_URL || 'https://www.epicgames.com/',
    preferredFor: ['epic', 'udemy'],
    tags: ['gaming', 'free', 'pc'],
  },
  {
    id: 'xbox-game-pass-core',
    name: 'Xbox Game Pass Core',
    category: 'Gaming',
    monthlyPrice: 7.99,
    currency: '£',
    url: import.meta.env?.VITE_AFFILIATE_XBOX_GAME_PASS_URL || 'https://www.xbox.com/en-GB/xbox-game-pass',
    preferredFor: ['xbox', 'game-pass', 'microsoft'],
    tags: ['gaming', 'console', 'pc'],
  },
];

export function getCheaperAlternative(
  subscription: Subscription,
  subscriptions: Subscription[]
): (CheaperAlternative & { monthlySaving: number }) | null {
  const monthlyCost = convertFrequencyToMonthly(subscription.price, subscription.frequency);
  if (monthlyCost <= 0) return null;

  const trackedNames = new Set(
    subscriptions
      .filter((item) => item.status === 'active' || item.status === 'trial')
      .map((item) => normaliseName(item.name))
  );

  const candidates = ALTERNATIVES.filter((item) =>
      item.category === subscription.category &&
      item.currency === subscription.currency &&
      item.monthlyPrice < monthlyCost &&
      !trackedNames.has(normaliseName(item.name))
    );
  const sourceName = normaliseName(subscription.name);
  const preferredAlternative = candidates.find((item) =>
    item.preferredFor?.some((provider) => sourceName.includes(provider))
  );
  const alternative = preferredAlternative ?? candidates.sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0];

  return alternative ? { ...alternative, monthlySaving: monthlyCost - alternative.monthlyPrice } : null;
}
