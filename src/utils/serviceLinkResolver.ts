import { POPULAR_PRESETS, type PopularPreset } from '../data/popularPresets';

export type ServiceLinkContext = 'discovery' | 'active';

export interface ResolvedServiceLink {
  url: string;
  label: 'Official Site ↗' | 'Free Trial ↗';
  serviceName: string;
}

const VERIFIED_OFFICIAL_URLS: Record<string, string> = {
  netflix_standard_uk: 'https://www.netflix.com/gb/',
  spotify_premium_uk: 'https://www.spotify.com/uk/',
  disney_plus_uk: 'https://www.disneyplus.com/en-gb',
  amazon_prime_uk: 'https://www.amazon.co.uk/',
  apple_tv_plus_uk: 'https://tv.apple.com/gb',
  now_tv_uk: 'https://www.nowtv.com/',
  sky_stream_uk: 'https://www.sky.com/',
  youtube_premium_uk: 'https://www.youtube.com/premium',
  audible_uk: 'https://www.audible.co.uk/',
  bbc_tv_licence: 'https://www.tvlicensing.co.uk/',
  dazn_uk: 'https://www.dazn.com/en-GB',
  paramount_plus_uk: 'https://www.paramountplus.com/gb/',
  discovery_plus_tnt_uk: 'https://www.discoveryplus.com/gb',
  the_guardian_digital: 'https://www.theguardian.com/',
  puregym_core_uk: 'https://www.puregym.com/',
  the_gym_group_uk: 'https://www.thegymgroup.com/',
  david_lloyd_uk: 'https://www.davidlloyd.co.uk/',
  jd_gyms_uk: 'https://www.jdgyms.co.uk/',
  virgin_active_uk: 'https://www.virginactive.co.uk/',
  strava_uk: 'https://www.strava.com/',
  myfitnesspal_premium_uk: 'https://www.myfitnesspal.com/',
  whoop_uk: 'https://www.whoop.com/gb/en/',
  headspace_uk: 'https://www.headspace.com/',
  calm_premium_uk: 'https://www.calm.com/',
  playstation_plus_uk: 'https://www.playstation.com/en-gb/',
  xbox_game_pass_ultimate_uk: 'https://www.xbox.com/en-GB/',
  nintendo_switch_online_uk: 'https://www.nintendo.co.uk/',
  chatgpt_plus_uk: 'https://chatgpt.com/',
  claude_pro_uk: 'https://claude.ai/',
  apple_icloud_200gb_uk: 'https://www.apple.com/uk/icloud/',
  google_one_ai_uk: 'https://one.google.com/',
  microsoft_365_personal_uk: 'https://www.microsoft.com/en-gb/microsoft-365',
  nordvpn_uk: 'https://nordvpn.com/',
  expressvpn_uk: 'https://www.expressvpn.com/',
  adobe_creative_cloud_uk: 'https://www.adobe.com/uk/',
  canva_pro_uk: 'https://www.canva.com/en_gb/',
  deliveroo_plus_uk: 'https://deliveroo.co.uk/',
  uber_one_uk: 'https://www.uber.com/gb/en/u/uber-one/',
  just_eat_plus_uk: 'https://www.just-eat.co.uk/',
  hellofresh_uk: 'https://www.hellofresh.co.uk/',
  gousto_uk: 'https://www.gousto.co.uk/',
  club_pret_uk: 'https://www.pret.co.uk/en-GB/',
  tesco_clubcard_plus_uk: 'https://www.tesco.com/groceries/en-GB/zone/clubcard-plus',
  asos_premier_uk: 'https://www.asos.com/',
  experian_creditexpert_uk: 'https://www.experian.co.uk/',
  clearscore_protect_uk: 'https://www.clearscore.com/',
  equifax_uk: 'https://www.equifax.co.uk/',
  monzo_perks_uk: 'https://monzo.com/',
  revolut_premium_uk: 'https://www.revolut.com/',
};

export function isValidVerifiedHttpsUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return false;

  // Reject javascript:, data:, file:, control characters, spaces
  if (/[\s\r\n\0]/.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

export function findMatchingPreset(nameOrId: string): PopularPreset | undefined {
  if (!nameOrId || typeof nameOrId !== 'string') return undefined;
  const clean = nameOrId.trim().toLowerCase();
  if (!clean) return undefined;

  // 1. Direct ID match
  const byId = POPULAR_PRESETS.find((p) => p.id.toLowerCase() === clean);
  if (byId) return byId;

  // 2. Direct exact name match
  const byExactName = POPULAR_PRESETS.find((p) => p.name.toLowerCase() === clean);
  if (byExactName) return byExactName;

  // 3. Normalized alphanumeric matching
  const normSearch = clean.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normSearch || normSearch.length < 3) return undefined;

  // 3a. Exact normalized preset name match
  const byNormName = POPULAR_PRESETS.find((p) => {
    const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return pNorm === normSearch;
  });
  if (byNormName) return byNormName;

  // 3b. Whole-word prefix / brand stem match (e.g. "netflix" for "netflix uk standard")
  const byPrefixOrStem = POPULAR_PRESETS.find((p) => {
    const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (pNorm.startsWith(normSearch + ' ') || normSearch.startsWith(pNorm + ' ')) {
      return true;
    }
    const brandStem = pNorm.split(' ')[0];
    if (brandStem.length >= 4 && (normSearch === brandStem || normSearch.startsWith(brandStem + ' '))) {
      return true;
    }
    return false;
  });
  if (byPrefixOrStem) return byPrefixOrStem;

  // 3c. Exact keyword match (must equal the complete keyword token, never substring)
  const byExactKeyword = POPULAR_PRESETS.find((p) => {
    return p.keywords?.some((k) => {
      const kNorm = k.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return kNorm.length >= 3 && (kNorm === normSearch || k.toLowerCase() === clean);
    });
  });

  return byExactKeyword;
}

export function resolveServiceLink(
  serviceName: string,
  context: ServiceLinkContext = 'active'
): ResolvedServiceLink | null {
  if (!serviceName || typeof serviceName !== 'string') return null;

  const preset = findMatchingPreset(serviceName);
  if (!preset) {
    // Unverified / custom service -> no link pill allowed
    return null;
  }

  const officialUrl = VERIFIED_OFFICIAL_URLS[preset.id];

  // In Free Trial discovery context:
  if (context === 'discovery') {
    if (preset.hasFreeTrial && preset.trialUrl && isValidVerifiedHttpsUrl(preset.trialUrl)) {
      return {
        url: preset.trialUrl,
        label: 'Free Trial ↗',
        serviceName: preset.name,
      };
    }
  }

  // Active / Details / Scanner context (or discovery fallback):
  if (officialUrl && isValidVerifiedHttpsUrl(officialUrl)) {
    return {
      url: officialUrl,
      label: 'Official Site ↗',
      serviceName: preset.name,
    };
  }

  // If no officialUrl mapping exists but trialUrl is verified:
  if (preset.trialUrl && isValidVerifiedHttpsUrl(preset.trialUrl)) {
    return {
      url: preset.trialUrl,
      label: context === 'discovery' ? 'Free Trial ↗' : 'Official Site ↗',
      serviceName: preset.name,
    };
  }

  return null;
}
