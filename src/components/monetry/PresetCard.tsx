import type { FC } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import { hasActiveUkFreeTrial, type PopularPreset } from '../../data/popularPresets';
import { BrandIcon } from '../BrandIcon';

export interface PresetCardProps {
  preset: PopularPreset;
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  isTracked: boolean;
  onQuickAdd: (preset: PopularPreset) => void;
  onStartTrial: (preset: PopularPreset) => void;
}

export const PresetCard: FC<PresetCardProps> = ({
  preset,
  currencySymbol,
  formatPrice,
  isTracked,
  onQuickAdd,
  onStartTrial,
}) => {
  const showFreeTrial = hasActiveUkFreeTrial(preset);
  const cadenceLabel = preset.frequency === 'yearly' ? '/yr' : '/mo';

  return (
    <div className="specular flex flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-2">
        <BrandIcon
          name={preset.name}
          category={preset.category}
          color={preset.color}
          size="preset"
          linkContext="discovery"
        />
        <span className="font-mono text-[12px] font-semibold text-white tabular-nums">
          {formatPrice(preset.price, currencySymbol)}
          <span className="text-[10px] font-normal text-white/40">{cadenceLabel}</span>
        </span>
      </div>

      <div className="mt-2.5">
        <p className="truncate text-[12.5px] font-semibold text-white">
          {preset.name}
        </p>
        <p className="truncate text-[10.5px] text-white/45">{preset.category}</p>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {showFreeTrial && !isTracked && (
          <button
            type="button"
            onClick={() => onStartTrial(preset)}
            className="chip-gold inline-flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[10.5px] font-semibold transition hover:border-[#D4AF7C]/55"
          >
            <Sparkles className="h-2.5 w-2.5" />
            Free Trial
          </button>
        )}
        <button
          type="button"
          disabled={isTracked}
          onClick={() => onQuickAdd(preset)}
          className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[10.5px] font-semibold transition ${
            isTracked
              ? 'border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300 cursor-default'
              : showFreeTrial
                ? 'border border-white/12 bg-white/[0.05] text-white hover:bg-white/[0.1]'
                : 'btn-gold'
          }`}
        >
          {isTracked ? (
            <>
              <Check className="h-3 w-3" />
              Added
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              Add
            </>
          )}
        </button>
      </div>
    </div>
  );
};
