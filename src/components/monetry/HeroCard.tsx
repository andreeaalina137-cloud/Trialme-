import type { FC } from 'react';
import { Sparkles, Users, ShieldCheck } from 'lucide-react';
import type { UserPlan } from '../../types/subscription';
import type { RenewalForecastMonth } from '../../utils/subscriptionCalculations';
import { ForecastChart } from './ForecastChart';

export interface HeroCardProps {
  monthlyTotal: number;
  annualTotal: number;
  trialCount: number;
  forecastMonths: RenewalForecastMonth[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  userPlan: UserPlan;
  freeSlotsUsed: number;
  freeSlotsLimit: number;
  onOpenGiftSlot: () => void;
  onOpenPaywall: () => void;
}

export const HeroCard: FC<HeroCardProps> = ({
  monthlyTotal,
  annualTotal,
  trialCount,
  forecastMonths,
  currencySymbol,
  formatPrice,
  userPlan,
  freeSlotsUsed,
  freeSlotsLimit,
  onOpenGiftSlot,
  onOpenPaywall,
}) => {
  const isPro = userPlan === 'pro' || userPlan === 'standard';

  return (
    <section className="specular relative overflow-hidden p-5">
      {/* Soft top-right radial gold sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(212,175,124,0.16), transparent 65%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Total potential charges</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-[32px] font-bold leading-none tracking-[-0.03em] text-white tabular-nums">
              {formatPrice(monthlyTotal, currencySymbol)}
            </span>
            <span className="text-[13px] font-medium text-white/45">/mo</span>
          </div>
          <p className="mt-1.5 text-[12px] text-white/55 tabular-nums">
            <span className="font-mono font-medium text-white/80">
              {formatPrice(annualTotal, currencySymbol)}
            </span>{' '}
            projected over 12 months
          </p>
        </div>

        <span className="chip-gold inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF7C]" />
          {trialCount} active {trialCount === 1 ? 'trial' : 'trials'}
        </span>
      </div>

      <div className="hairline my-4" />

      <ForecastChart
        months={forecastMonths}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          {isPro ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#D4AF7C]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Lifetime Pro • Unlimited slots
            </span>
          ) : (
            <span className="font-mono text-white/85 tabular-nums">
              Free slots: {freeSlotsUsed}/{freeSlotsLimit}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isPro && (
            <button
              type="button"
              onClick={onOpenGiftSlot}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/75 transition hover:border-white/20 hover:text-white"
            >
              <Users className="h-3 w-3 text-[#D4AF7C]" />
              Invite for +1 slot
            </button>
          )}
          {!isPro && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="btn-gold inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            >
              <Sparkles className="h-3 w-3" />
              Unlock Lifetime
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
