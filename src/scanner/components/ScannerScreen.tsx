import { AiStatementScannerModal } from '../../components/AiStatementScannerModal';
import type { MatchedSubscription } from '../types/scanner.types';
import type { Subscription, UserPlan } from '../../types/subscription';
import {
  DEMO_UK_STATEMENT_LINES,
  BARCLAYS_SAMPLE_LINES,
  REVOLUT_SAMPLE_LINES,
} from '../types/scanner.types';

export { DEMO_UK_STATEMENT_LINES, BARCLAYS_SAMPLE_LINES, REVOLUT_SAMPLE_LINES };

interface ScannerScreenProps {
  onClose?: () => void;
  onAddSubscriptions?: (items: MatchedSubscription[]) => void;
  onImportSubscriptions?: (subscriptions: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>[]) => void;
  userPlan?: UserPlan;
  currencySymbol?: string;
  onOpenPaywall?: () => void;
  existingSubscriptions?: Subscription[];
}

export function ScannerScreen({
  onClose = () => {},
  onAddSubscriptions,
  onImportSubscriptions,
  userPlan = 'pro',
  currencySymbol = '£',
  onOpenPaywall = () => {},
  existingSubscriptions = [],
}: ScannerScreenProps) {
  const handleImport = (imported: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>[]) => {
    if (onImportSubscriptions) {
      onImportSubscriptions(imported);
    } else if (onAddSubscriptions) {
      onAddSubscriptions(
        imported.map((item) => ({
          id: `scan-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          presetId: item.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          serviceName: item.name,
          category: item.category,
          amountGbp: item.price,
          billingCycle: item.frequency === 'yearly' ? 'Annual' : 'Monthly',
          billingDay: null,
          nextBillingDate: item.nextPaymentDate,
          confidence: 0.98,
          matchTier: 1,
          isVerifiedRecurring: true,
          hasCancellationTrap: Boolean(item.notes?.includes('trap')),
          trapLabel: item.notes || null,
          color: item.color,
          cancelUrl: item.cancelUrl || '',
          selected: true,
        }))
      );
    }
  };

  return (
    <AiStatementScannerModal
      isOpen={true}
      mode="screen"
      onClose={onClose}
      onImportSubscriptions={handleImport}
      userPlan={userPlan}
      currencySymbol={currencySymbol}
      onOpenPaywall={onOpenPaywall}
      existingSubscriptions={existingSubscriptions}
    />
  );
}
