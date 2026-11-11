import type { FC } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Subscription, SubscriptionFrequency } from '../../types/subscription';
import { getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';
import { BrandIcon } from '../BrandIcon';
import { StatusBadge } from './StatusBadge';

function formatFrequencyShort(frequency: SubscriptionFrequency): string {
  switch (frequency) {
    case 'weekly':
      return '/wk';
    case 'fortnightly':
      return '/2wk';
    case 'quarterly':
      return '/qtr';
    case 'half-yearly':
      return '/6mo';
    case 'yearly':
      return '/yr';
    case 'monthly':
    default:
      return '/mo';
  }
}

export interface SubRowProps {
  sub: Subscription;
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onSelect: (sub: Subscription) => void;
}

export const SubRow: FC<SubRowProps> = ({
  sub,
  currencySymbol,
  formatPrice,
  onSelect,
}) => {
  const days = getDaysUntilNextPayment(
    sub.status === 'trial' && sub.trialEndDate ? sub.trialEndDate : sub.nextPaymentDate
  );
  const isTrial = sub.status === 'trial';
  const isCancelled = sub.status === 'cancelled';

  let renewalCopy = '';
  let renewalTone = 'text-white/45';
  if (isCancelled) {
    renewalCopy = 'Cancelled';
    renewalTone = 'text-white/35';
  } else if (days < 0) {
    renewalCopy = 'Overdue';
    renewalTone = 'text-rose-300';
  } else if (days === 0) {
    renewalCopy = isTrial ? 'Trial ends today' : 'Due today';
    renewalTone = 'text-amber-300';
  } else if (days === 1) {
    renewalCopy = isTrial ? '1 day left' : 'Tomorrow';
    renewalTone = 'text-amber-300';
  } else if (days <= 3) {
    renewalCopy = isTrial ? `${days} days left` : `In ${days} days`;
    renewalTone = 'text-amber-300';
  } else {
    renewalCopy = isTrial ? `${days} days left` : `In ${days} days`;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(sub)}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.03]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <BrandIcon
          name={sub.name}
          category={sub.category}
          color={sub.color}
          size="md"
          linkContext="active"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={`truncate text-[13.5px] font-semibold ${
                isCancelled ? 'text-white/50 line-through' : 'text-white'
              }`}
            >
              {sub.name}
            </p>
            <StatusBadge status={sub.status} />
          </div>
          <p className="mt-0.5 truncate text-[11px] text-white/45">
            {sub.category} • <span className={renewalTone}>{renewalCopy}</span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          {isCancelled ? (
            <>
              <p className="font-mono text-[13px] font-semibold text-emerald-400 tabular-nums">
                Saved {formatPrice(sub.monthlySavingsAmount || sub.price, sub.currency || currencySymbol)}
              </p>
              <p className="text-[10px] text-white/35">per month</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[13.5px] font-semibold text-white tabular-nums">
                {formatPrice(sub.price, sub.currency || currencySymbol)}
              </p>
              <p className="text-[10px] text-white/40">
                {formatFrequencyShort(sub.frequency)}
              </p>
            </>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
    </button>
  );
};
