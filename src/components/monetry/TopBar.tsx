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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0A0A0A]/85 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div className="brand-frame flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-bold tracking-tight text-[#D4AF7C]">
          M
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-[15px] font-bold tracking-tight text-white">
            Monetry
          </span>
          <span className="chip-gold rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            UK
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleCalendar}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition ${
            calendarOpen
              ? 'border-[#D4AF7C]/45 bg-[#211C14] text-[#D4AF7C]'
              : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/20 hover:text-white'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 text-[#D4AF7C]" />
          {calendarOpen ? 'Hide Calendar' : 'Calendar'}
        </button>

        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="Open filters and quick settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition hover:border-white/20 hover:text-white"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onOpenAdd}
          aria-label="Add subscription or free trial"
          className="btn-gold inline-flex h-8 w-8 items-center justify-center rounded-full font-bold"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </header>
  );
};
