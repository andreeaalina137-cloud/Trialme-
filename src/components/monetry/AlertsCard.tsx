import { useMemo, type FC } from 'react';
import { Bell, Eye, ShieldAlert } from 'lucide-react';
import type { Subscription } from '../../types/subscription';
import { getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';

export interface AlertsCardProps {
  subscriptions: Subscription[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onSelect: (sub: Subscription) => void;
  onCancelSub: (sub: Subscription) => void;
}

export const AlertsCard: FC<AlertsCardProps> = ({
  subscriptions,
  currencySymbol,
  formatPrice,
  onSelect,
  onCancelSub,
}) => {
  const nearest = useMemo(() => {
    const candidates = subscriptions
      .filter((s) => s.status !== 'cancelled')
      .map((s) => ({
        sub: s,
        days: getDaysUntilNextPayment(
          s.status === 'trial' && s.trialEndDate ? s.trialEndDate : s.nextPaymentDate
        ),
      }))
      .sort((a, b) => a.days - b.days);
    return candidates[0] || null;
  }, [subscriptions]);

  return (
    <section className="specular p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="chip-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-heading text-[13.5px] font-semibold text-white">
              Smart trial &amp; renewal alerts
            </h3>
            <p className="text-[11px] text-white/45">
              Automatic reminders 3 days &amp; 1 day before any charge
            </p>
          </div>
        </div>
        <span className="chip-gold shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold">
          09:30 AM GUARD
        </span>
      </div>

      {nearest && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-white">
              {nearest.sub.name}
            </p>
            <p className="mt-0.5 text-[11px] text-white/50 tabular-nums">
              {nearest.sub.status === 'trial' ? 'Trial converts' : 'Renews'}{' '}
              {nearest.days <= 0
                ? 'today'
                : nearest.days === 1
                  ? 'tomorrow'
                  : `in ${nearest.days} days`}{' '}
              for {formatPrice(nearest.sub.price, nearest.sub.currency || currencySymbol)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(nearest.sub)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/80 transition hover:border-white/25 hover:text-white"
            >
              <Eye className="h-3 w-3" />
              View
            </button>
            <button
              type="button"
              onClick={() => onCancelSub(nearest.sub)}
              className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-400/[0.15]"
            >
              <ShieldAlert className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
