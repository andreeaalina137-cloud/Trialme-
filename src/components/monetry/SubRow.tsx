import type { FC, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
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
  showStatus?: boolean;
  action?: ReactNode;
}

export const SubRow: FC<SubRowProps> = ({
  sub,
  currencySymbol,
  formatPrice,
  onSelect,
  showStatus = false,
  action,
}) => {
  const days = getDaysUntilNextPayment(
    sub.status === 'trial' && sub.trialEndDate ? sub.trialEndDate : sub.nextPaymentDate
  );
  const isTrial = sub.status === 'trial';
  const isCancelled = sub.status === 'cancelled';
  const urgent = days !== null && days <= 3 && !isCancelled;

  let renewalCopy = '';
  if (isCancelled) {
    renewalCopy = `Saved ${formatPrice(sub.monthlySavingsAmount || sub.price, sub.currency || currencySymbol)}`;
  } else if (days < 0) {
    renewalCopy = 'Overdue';
  } else if (days === 0) {
    renewalCopy = isTrial ? 'Trial ends today' : 'Due today';
  } else if (days === 1) {
    renewalCopy = isTrial ? '1 day left' : 'Due tomorrow';
  } else {
    renewalCopy = isTrial ? `${days} days left` : `Due in ${days}d`;
  }

  return (
    <div className="group flex items-center gap-3 px-1 py-2.5">
      <button
        type="button"
        onClick={() => onSelect(sub)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
      >
        <BrandIcon
          name={sub.name}
          category={sub.category}
          color={sub.color}
          size="md"
          linkContext="active"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={`truncate text-[13px] font-medium ${
                isCancelled ? 'text-white/50 line-through' : 'text-white'
              }`}
            >
              {sub.name}
            </span>
            {(showStatus || isCancelled || isTrial) && <StatusBadge status={sub.status} />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
            <span className="truncate">{sub.category}</span>
            <span className="shrink-0 text-white/20">·</span>
            <span
              className={`shrink-0 whitespace-nowrap tabular-nums ${
                urgent ? 'text-rose-300/80 font-medium' : 'text-white/40'
              }`}
            >
              {renewalCopy}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-semibold tabular-nums text-white">
            {formatPrice(sub.price, sub.currency || currencySymbol)}
          </span>
          <span className="block text-[10px] text-white/35">
            {formatFrequencyShort(sub.frequency)}
          </span>
        </span>
      </button>

      {action || (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/15 transition-colors group-hover:text-white/40" />
      )}
    </div>
  );
};
