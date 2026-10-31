export type SubscriptionFrequency =
  | 'monthly'
  | 'yearly'
  | 'weekly'
  | 'fortnightly'
  | 'quarterly'
  | 'half-yearly';

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled';

export type SubscriptionCategory =
  | 'Streaming'
  | 'AI & Tech'
  | 'Music & Audio'
  | 'Fitness & Gym'
  | 'Productivity'
  | 'Gaming'
  | 'News & Magazines'
  | 'Food & Delivery'
  | 'Utilities'
  | 'Other';

export type AppCurrency = 'GBP' | 'USD' | 'EUR' | 'RON';

export type SupportedLanguage = 'en-GB' | 'en-US' | 'ro' | 'es' | 'fr' | 'de';

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'scheduled';
}

export interface Subscription {
  id: string;
  name: string;
  price: number;
  currency: string; // e.g. "£", "$", "€", "lei"
  frequency: SubscriptionFrequency;
  category: SubscriptionCategory;
  nextPaymentDate: string; // YYYY-MM-DD
  status: SubscriptionStatus;
  trialEndDate?: string;
  trialStartAt?: string; // Exact ISO timestamp when trial started
  trialExpiresAt?: string; // Exact ISO timestamp when trial expires
  trialDurationDays?: number; // e.g. 7, 14, 30, or custom days
  alarmArmedAt?: string; // Exact ISO timestamp of armed safety alarm
  color: string; // Hex color or Tailwind accent
  notes?: string;
  cancelUrl?: string;
  cancelEmail?: string;
  cancelGuideSteps?: string[];
  reminderDaysBefore: number; // 1, 2, 3, 7
  paymentHistory: PaymentRecord[];
  createdAt: string;
  cancelledAt?: string;
  monthlySavingsAmount?: number;
}

export type UserPlan = 'free' | 'standard' | 'pro';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'reminder' | 'savings' | 'trial' | 'system';
  subscriptionId?: string;
}

export interface DetectedSubscription {
  id: string;
  name: string;
  price: number;
  currency: string;
  frequency: SubscriptionFrequency;
  category: SubscriptionCategory;
  confidence: number;
  selected: boolean;
  color?: string;
  cancelUrl?: string;
  notes?: string;
  nextPaymentDate?: string | null;
  lastPaymentDate?: string | null;
  daysUntilNextPayment?: number | null;
  hasCancellationTrap?: boolean;
  trapLabel?: string | null;
}
