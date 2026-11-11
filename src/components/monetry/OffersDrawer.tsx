import type { FC } from 'react';
import { ArrowUpRight, Compass, Sparkles, TrendingDown, X } from 'lucide-react';
import type { CuratedUkTrial } from '../../utils/retentionAndTrust';
import { ALTERNATIVES } from '../../data/cheaperAlternatives';
import { BrandIcon } from '../BrandIcon';

export interface OffersDrawerProps {
  open: boolean;
  mode: 'radar' | 'alternatives';
  trials: CuratedUkTrial[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onStartTrial: (trial: CuratedUkTrial) => void;
  onClose: () => void;
}

export const OffersDrawer: FC<OffersDrawerProps> = ({
  open,
  mode,
  trials,
  currencySymbol,
  formatPrice,
  onStartTrial,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="modal-sheet-enter relative max-h-[82dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#131315] p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="chip-gold flex h-9 w-9 items-center justify-center rounded-xl">
              {mode === 'radar' ? (
                <Compass className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
            </span>
            <div>
              <h3 className="font-heading text-[16px] font-bold text-white">
                {mode === 'radar'
                  ? 'UK Free Trial Radar'
                  : 'Verified Cheaper UK Alternatives'}
              </h3>
              <p className="text-[11.5px] text-white/50">
                {mode === 'radar'
                  ? 'Try top UK services with automatic 3-day & 1-day 09:30 AM cancellation guards'
                  : 'Switch from full-price plans to verified lower-cost UK tiers'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {mode === 'radar'
            ? trials.map((trial) => (
                <div
                  key={trial.id}
                  className="specular flex flex-col justify-between gap-3 p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <BrandIcon
                        name={trial.name}
                        category={trial.category}
                        color={trial.color}
                        size="md"
                        linkContext="discovery"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-semibold text-white">
                            {trial.name}
                          </p>
                          <span className="chip-gold rounded-full px-2 py-0.5 text-[10px] font-semibold">
                            {trial.badge}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-white/55">
                          {trial.highlight}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                    <span className="font-mono text-[11px] text-white/55 tabular-nums">
                      Then {formatPrice(trial.postTrialPrice, trial.currency || currencySymbol)}/mo
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onStartTrial(trial);
                        onClose();
                      }}
                      className="btn-gold inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                    >
                      <Sparkles className="h-3 w-3" />
                      Start Trial &amp; Arm Alarm
                    </button>
                  </div>
                </div>
              ))
            : ALTERNATIVES.slice(0, 12).map((alt) => (
                <div
                  key={alt.id}
                  className="specular flex items-center justify-between gap-3 p-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <BrandIcon
                      name={alt.name}
                      category={alt.category}
                      size="sm"
                      enableLinkPill={false}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">
                        {alt.name}
                      </p>
                      <p className="text-[11px] text-white/45">
                        {alt.category} •{' '}
                        <span className="font-mono text-[#D4AF7C] tabular-nums">
                          {formatPrice(alt.monthlyPrice, alt.currency || currencySymbol)}/mo
                        </span>
                      </p>
                    </div>
                  </div>
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip-gold inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition hover:border-[#D4AF7C]/55"
                  >
                    View deal
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
};
