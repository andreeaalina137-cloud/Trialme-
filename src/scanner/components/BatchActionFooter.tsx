import type { MatchedSubscription } from '../types/scanner.types';

interface BatchActionFooterProps {
  selected: MatchedSubscription[];
  monthlyTotal: number;
  onAddSelected: () => void;
}

export function BatchActionFooter({ selected, monthlyTotal, onAddSelected }: BatchActionFooterProps) {
  if (selected.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-[rgba(212,175,55,0.22)] bg-[#0A0A0A]/85 px-4 pb-safe pt-3 backdrop-blur-xl">
      <button
        type="button"
        onClick={onAddSelected}
        className="flex w-full items-center justify-between rounded-2xl bg-[#D4AF37] px-4 py-3.5 text-left text-[#0A0A0A]"
      >
        <span className="text-sm font-semibold">
          Add All Selected ({selected.length})
        </span>
        <span className="text-sm font-bold tabular-nums">£{monthlyTotal.toFixed(2)}/mo</span>
      </button>
    </div>
  );
}
