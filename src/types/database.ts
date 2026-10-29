import type { SubscriptionCategory } from './subscription';

export type TrialType = 'free_trial' | 'money_back' | 'cooling_off' | 'promo_discount' | 'none';

export interface PresetService {
  id: string;
  name: string;
  category: SubscriptionCategory;
  monthly_price_gbp: number;
  has_free_trial: boolean;
  trial_duration_days: number;
  trial_type: TrialType;
  cancel_url: string;
  notes: string;
}

export interface AffiliateOffer {
  preset_id: string;
  trial_days: number;
  annual_discount_pct: number;
}

export interface AlternativeService {
  name: string;
  category: SubscriptionCategory;
  monthly_price_gbp: number;
  tag: string;
}

export interface PriceHikeAlert {
  service_id: string;
  service_name: string;
  old_price_gbp: number;
  new_price_gbp: number;
  annual_impact_gbp: number;
}

export interface MonetryDatabase {
  last_updated: string;
  version: string;
  curated_uk_trials: string[];
  presets: PresetService[];
  affiliate_offers: AffiliateOffer[];
  alternatives: AlternativeService[];
  uk_price_hike_alerts: PriceHikeAlert[];
}
