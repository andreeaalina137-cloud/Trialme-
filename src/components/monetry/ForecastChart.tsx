import { useMemo, useState, type FC } from 'react';
import type { RenewalForecastMonth } from '../../utils/subscriptionCalculations';

export interface ForecastChartProps {
  months: RenewalForecastMonth[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
}

export const ForecastChart: FC<ForecastChartProps> = ({
  months,
  currencySymbol,
  formatPrice,
}) => {
  const maxVal = useMemo(
    () => Math.max(...months.map((m) => m.total), 1),
    [months]
  );

  const peakIndex = useMemo(() => {
    let idx = 0;
    months.forEach((m, i) => {
      if (m.total > (months[idx]?.total ?? 0)) idx = i;
    });
    return idx;
  }, [months]);

  const [selectedIdx, setSelectedIdx] = useState<number>(peakIndex);

  const safeSelectedIdx =
    selectedIdx >= 0 && selectedIdx < months.length ? selectedIdx : peakIndex;
  const activeMonth = months[safeSelectedIdx];

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-[11px]">
        <span className="eyebrow">6-Month Renewal Forecast</span>
        {activeMonth && (
          <span className="font-mono text-white/55 tabular-nums">
            {safeSelectedIdx === peakIndex ? 'Peak' : 'Selected'}:{' '}
            <span className="text-white/90">{activeMonth.label}</span> (
            {formatPrice(activeMonth.total, currencySymbol)})
          </span>
        )}
      </div>

      <div className="grid grid-cols-6 items-end gap-2 pt-1" style={{ height: 92 }}>
        {months.map((m, i) => {
          const h = Math.max(8, Math.round((m.total / maxVal) * 60));
          const isPeak = i === peakIndex && m.total > 0;
          const isSelected = i === safeSelectedIdx;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className="group flex h-full flex-col items-center justify-end gap-1.5 focus:outline-none"
            >
              <span
                className={`font-mono text-[10px] tabular-nums transition ${
                  isPeak || isSelected
                    ? 'font-semibold text-[#D4AF7C]'
                    : 'text-white/45 group-hover:text-white/75'
                }`}
              >
                {currencySymbol}
                {Math.round(m.total)}
              </span>
              <div className="flex h-[60px] w-full items-end">
                <div
                  style={{ height: `${h}px` }}
                  className={`w-full rounded-t-md transition-all duration-300 ${
                    isPeak || isSelected
                      ? 'bg-gradient-to-t from-[#B79B6B] to-[#E5C391] shadow-[0_0_18px_rgba(212,175,124,0.35)]'
                      : m.isCurrent
                        ? 'bg-[#D4AF7C]/45 group-hover:bg-[#D4AF7C]/65'
                        : 'bg-white/[0.12] group-hover:bg-white/[0.22]'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  isPeak || isSelected
                    ? 'font-semibold text-white'
                    : 'text-white/40'
                }`}
              >
                {m.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
