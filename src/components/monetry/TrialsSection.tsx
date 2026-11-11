import type { FC } from 'react';
import { Clock, Plus, Sparkles } from 'lucide-react';
import type { Subscription } from '../../types/subscription';
import { getDaysUntilNextPayment } from '../../utils/subscriptionCalculations';
import { BrandIcon } from '../BrandIcon';

export interface TrialsSectionProps {
  trials: Subscription[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onSelect: (sub: Subscription) => void;
  onAddTrial: () => void;
  onBrowseTrials: () => void;
  onLoadSampleTrials?: () => void;
}

export const TrialsSection: FC<TrialsSectionProps> = ({
  trials,
  currencySymbol,
  formatPrice,
  onSelect,
  onAddTrial,
  onBrowseTrials,
  onLoadSampleTrials,
}) => {
  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between">
        <div>
          <h2 className="font-heading text-[15px] font-semibold tracking-tight text-white">
            My Trials
          </h2>
          <p className="text-[11px] text-white/45">
            Free trials, kept separate from paid plans
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTrial}
          className="chip-gold inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:border-[#D4AF7C]/55"
        >
          <Plus className="h-3 w-3" />
          Add trial
        </button>
      </div>

      {trials.length === 0 ? (
        <div className="specular p-4">
          <p className="text-[13px] font-semibold text-white">
            Your first free trial, safely tracked
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">
            Get 72h &amp; 24h alerts at 09:30 AM before any free trial converts to a paid charge.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddTrial}
              className="btn-gold inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Track a free trial
            </button>
            <button
              type="button"
              onClick={onBrowseTrials}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11.5px] font-medium text-white/80 transition hover:border-[#D4AF7C]/35 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#D4AF7C]" />
              Browse free trials
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {trials.map((t) => {
              const days = getDaysUntilNextPayment(t.trialEndDate || t.nextPaymentDate);
              const urgent = days <= 3;
              const pillCls = urgent
                ? 'border-rose-400/30 bg-rose-400/[0.09] text-rose-300'
                : 'border-[#D4AF7C]/30 bg-[#211C14] text-[#D4AF7C]';
              const copy =
                days < 0
                  ? 'Expired'
                  : days === 0
                    ? 'Ends today'
                    : days === 1
                      ? '1 day left'
                      : `${days} days left`;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className="specular group flex flex-col justify-between p-3.5 text-left transition hover:border-[#D4AF7C]/35"
                >
                  <div className="flex items-start justify-between gap-2">
                    <BrandIcon
                      name={t.name}
                      category={t.category}
                      color={t.color}
                      size="sm"
                      linkContext="active"
                    />
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-white/60">
                      Trial
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="truncate text-[13px] font-semibold text-white">
                      {t.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-white/50 tabular-nums">
                      {formatPrice(t.price, t.currency || currencySymbol)} after trial
                    </p>
                  </div>
                  <div className="mt-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${pillCls}`}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {copy}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {onLoadSampleTrials && trials.length < 5 && (
            <button
              type="button"
              onClick={onLoadSampleTrials}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 bg-white/[0.02] py-2 text-[11px] font-medium text-white/55 transition hover:border-[#D4AF7C]/35 hover:text-[#D4AF7C]"
            >
              <Sparkles className="h-3 w-3 text-[#D4AF7C]" />+ Load 5 trials
            </button>
          )}
        </>
      )}
    </section>
  );
};
