import { useMemo, type FC } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
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
  onLoadSampleTrials?: () => void;
}

export const SubPreviewList: FC<SubPreviewListProps> = ({
  subscriptions,
  currencySymbol,
  formatPrice,
  onSelect,
  onViewAll,
  onAddFirst,
  onLoadSampleTrials,
}) => {
  const activeSubs = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === 'active' || s.status === 'trial')
      .sort(
        (a, b) =>
          getDaysUntilNextPayment(a.nextPaymentDate) -
          getDaysUntilNextPayment(b.nextPaymentDate)
      );
  }, [subscriptions]);

  const preview = activeSubs.slice(0, 4);

  return (
    <section className="mt-7">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-white">
            All Subscriptions
          </h2>
          <p className="mt-0.5 text-[11px] text-white/40">
            {activeSubs.length} active recurring services
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium text-white/50 transition-colors hover:text-white cursor-pointer"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {preview.length === 0 ? (
        <div className="specular p-5 text-center">
          <p className="text-[13px] font-semibold text-white">
            No active paid subscriptions yet
          </p>
          <p className="mt-1 text-[11.5px] text-white/50">
            Add your recurring services or scan a UK bank statement to track every renewal.
          </p>
          <button
            type="button"
            onClick={onAddFirst}
            className="btn-gold mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add subscription
          </button>
        </div>
      ) : (
        <div className="specular divide-y divide-white/[0.05] px-3 py-1">
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

      <div className="mt-2.5 flex gap-2">
        {onLoadSampleTrials && (
          <button
            type="button"
            onClick={onLoadSampleTrials}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2 text-[11px] text-white/50 transition-colors hover:border-[#D5B886]/30 hover:text-[#D5B886] cursor-pointer"
          >
            + Load 5 trials
          </button>
        )}
        <button
          type="button"
          onClick={onAddFirst}
          className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2 text-[11px] text-white/50 transition-colors hover:border-[#D5B886]/30 hover:text-[#D5B886] cursor-pointer"
        >
          + Add subscription
        </button>
      </div>
    </section>
  );
};
