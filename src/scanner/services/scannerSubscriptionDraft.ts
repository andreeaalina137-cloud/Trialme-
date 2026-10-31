import type { DetectedSubscription, Subscription } from '../../types/subscription';
import type { PresetService } from '../../types/database';

export type ScannerSubscriptionDraft = Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>;

export function buildScannerSubscriptionDraft(
  item: DetectedSubscription,
  preset: PresetService | undefined,
  currencySymbol: string,
  fallbackDate: string,
): ScannerSubscriptionDraft {
  return {
    name: item.name,
    price: item.price > 0 ? item.price : preset?.monthly_price_gbp || 0,
    currency: item.currency || currencySymbol,
    frequency: item.frequency,
    category: item.category || preset?.category || 'Other',
    nextPaymentDate: item.nextPaymentDate || fallbackDate,
    status: 'active',
    color: item.color || '#D4AF7C',
    cancelUrl: item.cancelUrl || preset?.cancel_url,
    notes: item.notes || preset?.notes,
    reminderDaysBefore: 3,
  };
}
