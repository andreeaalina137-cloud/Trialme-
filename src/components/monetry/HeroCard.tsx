import type { FC } from 'react';
import { ArrowUpRight, Sparkles, ShieldCheck } from 'lucide-react';
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
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(213,184,134,0.16), transparent 68%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Total potential charges</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-heading text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-white">
              {formatPrice(monthlyTotal, currencySymbol)}
            </span>
            <span className="pb-1 text-xs text-white/40">/mo</span>
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-white/45">
            {formatPrice(annualTotal, currencySymbol)} projected over 12 months
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D5B886]/25 bg-[#D5B886]/10 px-2.5 py-1 text-[10px] font-medium text-[#D5B886]">
          <Sparkles className="h-3 w-3" />
          {trialCount} active {trialCount === 1 ? 'trial' : 'trials'}
        </span>
      </div>

      <ForecastChart
        months={forecastMonths}
        currencySymbol={currencySymbol}
        formatPrice={formatPrice}
      />

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          {isPro ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#D5B886]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Lifetime Pro • Unlimited slots
            </span>
          ) : (
            <>
              <span className="tabular-nums">
                Free slots: {freeSlotsUsed}/{freeSlotsLimit}
              </span>
              <span className="h-2.5 w-px bg-white/15" />
              <button
                type="button"
                onClick={onOpenGiftSlot}
                className="transition-colors hover:text-white/70 cursor-pointer"
              >
                Invite for +1 slot
              </button>
            </>
          )}
        </div>
        {!isPro && (
          <button
            type="button"
            onClick={onOpenPaywall}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium text-[#D5B886] transition-opacity hover:opacity-80 cursor-pointer"
          >
            Unlock Lifetime
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </section>
  );
};
