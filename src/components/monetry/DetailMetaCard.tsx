import type { FC } from 'react';
import type { Subscription } from '../../types/subscription';
import { getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';
import { StatusBadge } from './StatusBadge';

export interface DetailMetaCardProps {
  subscription: Subscription;
  conciseCancellationTip: string | null;
}

export const DetailMetaCard: FC<DetailMetaCardProps> = ({
  subscription,
  conciseCancellationTip,
}) => {
  const targetDate =
    subscription.status === 'trial' && subscription.trialEndDate
      ? subscription.trialEndDate
      : subscription.nextPaymentDate;
  const days = getDaysUntilNextPayment(targetDate);

  const timeRemainingCopy =
    subscription.status === 'cancelled'
      ? 'Stopped'
      : days < 0
        ? 'Overdue'
        : days === 0
          ? 'Due today'
          : days === 1
            ? '1 day remaining'
            : `${days} days remaining`;

  return (
    <div className="specular divide-y divide-white/[0.05] px-4 py-1">
      <div className="flex items-center justify-between py-2.5 text-[12px]">
        <span className="text-white/50">Status</span>
        <StatusBadge status={subscription.status} />
      </div>

      <div className="flex items-center justify-between py-2.5 text-[12px]">
        <span className="text-white/50">
          {subscription.status === 'trial' ? 'Trial ends on' : 'Next billing date'}
        </span>
        <span className="font-mono font-medium text-white tabular-nums">
          {targetDate}
        </span>
      </div>

      <div className="flex items-center justify-between py-2.5 text-[12px]">
        <span className="text-white/50">Time remaining</span>
        <span className="font-medium text-white/85">{timeRemainingCopy}</span>
      </div>

      <div className="flex items-center justify-between py-2.5 text-[12px]">
        <span className="text-white/50">Reminder alerts</span>
        <span className="font-mono text-[11px] font-medium text-[#D4AF7C]">
          3 days &amp; 1 day before at 09:30
        </span>
      </div>

      {subscription.cancelUrl && (
        <div className="py-2.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/50">Cancellation Portal</span>
            <a
              href={subscription.cancelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#D4AF7C] transition hover:text-[#E5C391]"
            >
              Open Link ↗
            </a>
          </div>
          {conciseCancellationTip && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#A0A0A0]">
              {conciseCancellationTip}
            </p>
          )}
        </div>
      )}

      {!subscription.cancelUrl && conciseCancellationTip && (
        <div className="py-2.5">
          <p className="text-[11.5px] leading-relaxed text-[#A0A0A0]">
            {conciseCancellationTip}
          </p>
        </div>
      )}
    </div>
  );
};
