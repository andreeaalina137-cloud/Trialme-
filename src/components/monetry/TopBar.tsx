import type { FC } from 'react';
import { Calendar, Plus, SlidersHorizontal } from 'lucide-react';

export interface TopBarProps {
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  onOpenFilters: () => void;
  onOpenAdd: () => void;
}

export const TopBar: FC<TopBarProps> = ({
  calendarOpen,
  onToggleCalendar,
  onOpenFilters,
  onOpenAdd,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0B0B0C]/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-heading text-[22px] font-bold leading-none tracking-tight text-[#D5B886]">
            Monetry
          </span>
          <span className="rounded-full border border-[#493D2B] bg-[#211C14] px-[7px] py-[2px] text-[9px] font-semibold tracking-[0.16em] text-[#D5B886]">
            UK
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleCalendar}
            className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[11px] font-medium transition-colors duration-300 ${
              calendarOpen
                ? 'border-[#493D2B] bg-[#211C14] text-[#D5B886]'
                : 'border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{calendarOpen ? 'Hide Calendar' : 'Calendar'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenFilters}
            aria-label="Quick filters and preferences"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/70 transition-colors hover:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onOpenAdd}
            aria-label="Add subscription"
            className="btn-gold grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-95"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </header>
  );
};
