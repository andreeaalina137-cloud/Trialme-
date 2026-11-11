import { useMemo, type FC } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import type { Subscription } from '../../types/subscription';
import { getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';
import { SubRow } from './SubRow';

export interface SubPreviewListProps {
  subscriptions: Subscription[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onSelect: (sub: Subscription) => void;
  onViewAll: () => void;
  onAddFirst: () => void;
}

export const SubPreviewList: FC<SubPreviewListProps> = ({
  subscriptions,
  currencySymbol,
  formatPrice,
  onSelect,
  onViewAll,
  onAddFirst,
}) => {
  const activeSubs = useMemo(() => {
    return subscriptions
      .filter((s) => s.status !== 'cancelled')
      .sort(
        (a, b) =>
          getDaysUntilNextPayment(a.nextPaymentDate) -
          getDaysUntilNextPayment(b.nextPaymentDate)
      );
  }, [subscriptions]);

  const preview = activeSubs.slice(0, 5);

  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between">
        <div>
          <h2 className="font-heading text-[15px] font-semibold tracking-tight text-white">
            All Subscriptions
          </h2>
          <p className="text-[11px] text-white/45">
            {activeSubs.length} active • sorted by next billing date
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#D4AF7C] transition hover:text-[#E5C391]"
        >
          View all ({activeSubs.length})
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {preview.length === 0 ? (
        <div className="specular p-4 text-center">
          <p className="text-[13px] font-semibold text-white">
            No active paid subscriptions yet
          </p>
          <p className="mt-1 text-[11.5px] text-white/50">
            Add your recurring services or scan a UK bank statement to track every renewal.
          </p>
          <button
            type="button"
            onClick={onAddFirst}
            className="btn-gold mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Add subscription
          </button>
        </div>
      ) : (
        <div className="specular divide-y divide-white/[0.05] p-1.5">
          {preview.map((sub) => (
            <SubRow
              key={sub.id}
              sub={sub}
              currencySymbol={currencySymbol}
              formatPrice={formatPrice}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
};
