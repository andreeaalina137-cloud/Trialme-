import type { FC } from 'react';
import { Award, Sparkles, TrendingDown } from 'lucide-react';
import { ACHIEVEMENTS } from '../../utils/achievements';

export interface SavingsCardProps {
  monthlySavings: number;
  thisMonthSavings: number;
  cancelledCount: number;
  unlockedAchievementIds: string[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onExploreAlternatives: () => void;
  t: (key: string) => string;
}

export const SavingsCard: FC<SavingsCardProps> = ({
  monthlySavings,
  thisMonthSavings,
  cancelledCount,
  unlockedAchievementIds,
  currencySymbol,
  formatPrice,
  onExploreAlternatives,
  t,
}) => {
  const unlockedSet = new Set(unlockedAchievementIds);

  return (
    <section className="specular p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="chip-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
            <Award className="h-4 w-4" />
          </span>
          <div>
            <p className="eyebrow">You&apos;ve saved so far</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[22px] font-bold text-[#D4AF7C] tabular-nums">
                {formatPrice(monthlySavings, currencySymbol)}
              </span>
              <span className="text-[11px] text-white/45">/month stopped</span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/45 tabular-nums">
              {formatPrice(thisMonthSavings, currencySymbol)} saved this month • {cancelledCount}{' '}
              {cancelledCount === 1 ? 'subscription' : 'subscriptions'} cancelled
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onExploreAlternatives}
          className="chip-gold inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:border-[#D4AF7C]/55"
        >
          <TrendingDown className="h-3 w-3" />
          Alternatives
        </button>
      </div>

      <div className="hairline my-3" />

      <div className="flex items-center justify-between text-[10.5px]">
        <span className="eyebrow">Achievements</span>
        <span className="font-mono text-white/50 tabular-nums">
          {unlockedAchievementIds.length}/{ACHIEVEMENTS.length} unlocked
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ACHIEVEMENTS.map((ach) => {
          const isUnlocked = unlockedSet.has(ach.id);
          return (
            <span
              key={ach.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition ${
                isUnlocked
                  ? 'border-[#D4AF7C]/35 bg-[#211C14] text-[#D4AF7C]'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/35'
              }`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t(ach.titleKey)}
            </span>
          );
        })}
      </div>
    </section>
  );
};
