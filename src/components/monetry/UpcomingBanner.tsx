import { useMemo, type FC } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import type { Subscription } from '../../types/subscription';
import { formatPrice, getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';

export interface UpcomingBannerProps {
  subscriptions: Subscription[];
  currencySymbol: string;
  onSelect: (sub: Subscription) => void;
}

export const UpcomingBanner: FC<UpcomingBannerProps> = ({
  subscriptions,
  currencySymbol,
  onSelect,
}) => {
  const next = useMemo(() => {
    const candidates = subscriptions
      .filter((s) => s.status !== 'cancelled')
      .map((s) => ({
        sub: s,
        days: getDaysUntilNextPayment(s.nextPaymentDate),
      }))
      .sort((a, b) => a.days - b.days);
    return candidates[0] || null;
  }, [subscriptions]);

  if (!next) return null;

  const { sub, days } = next;
  const isTrial = sub.status === 'trial';
  const dayCopy =
    days < 0
      ? 'overdue'
      : days === 0
        ? 'today'
        : days === 1
          ? 'tomorrow'
          : `in ${days} days`;

  return (
    <button
      type="button"
      onClick={() => onSelect(sub)}
      className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[#D4AF7C]/25 bg-gradient-to-r from-[#211C14] via-[#131315] to-[#131315] px-3.5 py-2.5 text-left transition hover:border-[#D4AF7C]/45"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="chip-gold relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl">
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#D4AF7C]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-white">
            <span className="text-[#D4AF7C]">
              {isTrial ? 'Trial ending' : 'Upcoming renewal'}:
            </span>{' '}
            {sub.name}{' '}
            <span className="text-white/55">
              {isTrial ? `converts ${dayCopy}` : `renews ${dayCopy}`}
            </span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="chip-gold rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
          {formatPrice(sub.price, sub.currency || currencySymbol)}
        </span>
        <ChevronRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
      </div>
    </button>
  );
};
