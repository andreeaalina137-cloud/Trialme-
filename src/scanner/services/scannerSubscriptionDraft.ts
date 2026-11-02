import type { DetectedSubscription, Subscription } from '../../types/subscription';
import type { PresetService } from '../../types/database';

export type ScannerSubscriptionDraft = Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>;

export function buildScannerSubscriptionDraft(
  item: DetectedSubscription,
  preset: PresetService | undefined,
  currencySymbol: string,
  fallbackDate: string,
): ScannerSubscriptionDraft {
  const itemPrice = typeof item.price === 'number' && item.price > 0 ? item.price : ((item as any).amountGbp || 0);
  return {
    name: item.name || (item as any).serviceName || 'Subscription',
    price: itemPrice > 0 ? itemPrice : preset?.monthly_price_gbp || 0,
    currency: item.currency || currencySymbol,
    frequency: item.frequency || ((item as any).billingCycle === 'Annual' ? 'yearly' : 'monthly'),
    category: item.category || preset?.category || 'Other',
    nextPaymentDate: item.nextPaymentDate || (item as any).nextBillingDate || fallbackDate,
    status: item.isHistorical ? 'cancelled' : 'active',
    color: item.color || '#D4AF7C',
    cancelUrl: item.cancelUrl || preset?.cancel_url,
    notes: item.notes || preset?.notes,
    reminderDaysBefore: 3,
  };
}
