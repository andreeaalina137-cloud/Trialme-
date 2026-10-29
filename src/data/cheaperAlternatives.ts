import type { Subscription } from '../types/subscription';
import { convertFrequencyToMonthly } from '../utils/subscriptionCalculations';
import { POPULAR_PRESETS } from './popularPresets';
import { getDatabase, subscribeToDatabaseUpdates } from '../services/databaseService';
import type { MonetryDatabase } from '../types/database';

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

const AFFILIATE_METADATA: Record<
  string,
  {
    aliases: string[];
    trialUrl: string;
    annualUrl?: string;
  }
> = {
  amazon_prime_uk: {
    aliases: ['amazon prime', 'prime video', 'amazon'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_AMAZON_PRIME_TRIAL_URL) || 'https://www.amazon.co.uk/amazonprime',
    annualUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_AMAZON_PRIME_ANNUAL_URL) || 'https://www.amazon.co.uk/amazonprime',
  },
  audible_uk: {
    aliases: ['audible', 'audible uk'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_AUDIBLE_TRIAL_URL) || 'https://www.audible.co.uk/ep/memberbenefits',
  },
  apple_tv_plus_uk: {
    aliases: ['apple tv', 'apple tv+', 'apple tv plus'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_APPLE_TV_TRIAL_URL) || 'https://tv.apple.com/gb',
  },
  nordvpn_uk: {
    aliases: ['nordvpn', 'nord vpn'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_NORDVPN_TRIAL_URL) || 'https://nordvpn.com/',
    annualUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_NORDVPN_ANNUAL_URL) || 'https://nordvpn.com/pricing/',
  },
  disney_plus_uk: {
    aliases: ['disney+ uk', 'disney plus', 'disney+'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_DISNEY_PLUS_TRIAL_URL) || 'https://www.disneyplus.com/en-gb',
    annualUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_DISNEY_PLUS_ANNUAL_URL) || 'https://www.disneyplus.com/en-gb',
  },
  hellofresh_uk: {
    aliases: ['hellofresh', 'hello fresh'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_HELLOFRESH_TRIAL_URL) || 'https://www.hellofresh.co.uk/',
    annualUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_HELLOFRESH_ANNUAL_URL) || 'https://www.hellofresh.co.uk/',
  },
  spotify_premium_uk: {
    aliases: ['spotify', 'spotify premium'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_SPOTIFY_TRIAL_URL) || 'https://www.spotify.com/uk/premium/',
  },
  puregym_core_uk: {
    aliases: ['puregym', 'puregym membership', 'pure gym'],
    trialUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_PUREGYM_TRIAL_URL) || 'https://www.puregym.com/join/',
    annualUrl: (typeof process !== 'undefined' && process.env?.VITE_AFFILIATE_PUREGYM_ANNUAL_URL) || 'https://www.puregym.com/join/',
  },
};

const ALTERNATIVE_URLS: Record<string, { url: string; preferredFor?: string[] }> = {
  'NOW TV Entertainment': { url: 'https://www.nowtv.com/', preferredFor: ['sky', 'netflix', 'stubby'] },
  'Disney+ UK (With Ads)': { url: 'https://www.disneyplus.com/en-gb', preferredFor: ['netflix', 'disney', 'hotstar'] },
  'Amazon Prime Video (Standalone)': { url: 'https://www.amazon.co.uk/prime', preferredFor: ['prime', 'amazon'] },
  'Apple TV+ UK': { url: 'https://tv.apple.com/gb', preferredFor: ['apple', 'tv'] },
  'Paramount+ UK (Basic)': { url: 'https://www.paramountplus.com/uk', preferredFor: ['paramount', 'comsise'] },
  'Crunchyroll (Fan Tier)': { url: 'https://www.crunchyroll.com/', preferredFor: ['anime', 'crunchyroll'] },
  'The Gym Group (Off-Peak)': { url: 'https://www.thegymgroup.com/memberships/', preferredFor: ['puregym', 'fitness', 'gym'] },
  'energie Fitness UK': { url: 'https://www.energiefitness.com/', preferredFor: ['gym', 'fitness'] },
  'Better UK (Pay & Play)': { url: 'https://www.better.org.uk/', preferredFor: ['gym', 'swim', 'leisure'] },
  'Anytime Fitness UK': { url: 'https://www.anytimefitness.co.uk/', preferredFor: ['anytime', 'fitness'] },
  'Nike Training Club': { url: 'https://www.nike.com/ntc-app', preferredFor: ['fitness', 'workout'] },
  'SWEAT App': { url: 'https://www.sweat.com/', preferredFor: ['sweat', 'fitness', 'home'] },
  'YouTube Music Premium': { url: 'https://music.youtube.com/', preferredFor: ['youtube', 'music'] },
  'Tidal Individual UK': { url: 'https://tidal.com/', preferredFor: ['tidal', 'music', 'hifi'] },
  'SoundCloud Go': { url: 'https://soundcloud.com/', preferredFor: ['soundcloud', 'music'] },
  'Amazon Music Prime': { url: 'https://music.amazon.co.uk/', preferredFor: ['amazon', 'music'] },
  'Apple Music Individual': { url: 'https://music.apple.com/uk', preferredFor: ['apple', 'music'] },
  'Deliveroo Plus (Silver)': { url: 'https://www.deliveroo.co.uk/', preferredFor: ['deliveroo'] },
  'Uber One UK': { url: 'https://www.ubereats.com/uk/', preferredFor: ['ubereats', 'delivery', 'uber'] },
  'Tesco Delivery Saver (Off-Peak)': { url: 'https://www.tesco.com/groceries/en-GB/delivery-saver', preferredFor: ['tesco', 'delivery', 'groceries'] },
  'Ocado Smart Pass (Midweek)': { url: 'https://www.ocado.com/', preferredFor: ['ocado', 'groceries'] },
  'The Guardian (Web / Standard)': { url: 'https://www.theguardian.com/uk', preferredFor: ['guardian', 'the-guardian'] },
  'Monzo (Standard Account)': { url: 'https://www.monzo.com/', preferredFor: ['monzo', 'banking'] },
  'Starling Bank (Current Account)': { url: 'https://www.starlingbank.com/', preferredFor: ['starling', 'banking'] },
  'Revolut (Standard Plan)': { url: 'https://www.revolut.com/', preferredFor: ['revolut', 'standard'] },
  'Chase UK (Current Account)': { url: 'https://www.chase.co.uk/', preferredFor: ['chase', 'banking'] },
  'Google One Basic (100GB)': { url: 'https://one.google.com/', preferredFor: ['google', 'cloud', 'storage'] },
  'Notion (Free Plan)': { url: 'https://www.notion.com/', preferredFor: ['notion', 'productivity'] },
  'Asana (Personal Plan)': { url: 'https://asana.com/', preferredFor: ['asana', 'productivity'] },
  'Proton VPN (Free Tier)': { url: 'https://protonvpn.com/', preferredFor: ['vpn', 'privacy'] },
  'Surfshark VPN (24m Plan)': { url: 'https://surfshark.com/deal', preferredFor: ['nordvpn', 'vpn', 'security'] },
  'PlayStation Plus (Essential)': { url: 'https://www.playstation.com/uk/en/products/PlayStation-Plus/', preferredFor: ['psn', 'playstation', 'sony'] },
  'Epic Games Store': { url: 'https://www.epicgames.com/', preferredFor: ['epic', 'games'] },
  'Xbox Game Pass Core': { url: 'https://www.xbox.com/en-GB/xbox-game-pass', preferredFor: ['xbox', 'game-pass', 'microsoft'] },
};

export function buildAffiliateOffers(db: MonetryDatabase = getDatabase()): AffiliateOffer[] {
  return db.affiliate_offers.map((raw) => {
    const meta = AFFILIATE_METADATA[raw.preset_id] || {
      aliases: [raw.preset_id.replace(/_/g, ' ')],
      trialUrl: 'https://google.co.uk',
    };
    return {
      aliases: meta.aliases,
      trialUrl: meta.trialUrl,
      trialDays: raw.trial_days,
      annualUrl: meta.annualUrl,
      annualDiscountRate: raw.annual_discount_pct > 0 ? raw.annual_discount_pct / 100 : undefined,
    };
  });
}

export function buildAlternatives(db: MonetryDatabase = getDatabase()): CheaperAlternative[] {
  return db.alternatives.map((alt) => {
    const meta = ALTERNATIVE_URLS[alt.name] || {
      url: 'https://www.google.co.uk/',
    };
    return {
      id: alt.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: alt.name,
      category: alt.category,
      monthlyPrice: alt.monthly_price_gbp,
      currency: '£',
      url: meta.url,
      preferredFor: meta.preferredFor,
      tags: [alt.tag.toLowerCase(), alt.category.toLowerCase()],
    };
  });
}

export let AFFILIATE_OFFERS: AffiliateOffer[] = buildAffiliateOffers();
export let ALTERNATIVES: CheaperAlternative[] = buildAlternatives();

subscribeToDatabaseUpdates((updatedDb) => {
  AFFILIATE_OFFERS = buildAffiliateOffers(updatedDb);
  ALTERNATIVES = buildAlternatives(updatedDb);
});

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

  const candidates = ALTERNATIVES.filter(
    (item) =>
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
