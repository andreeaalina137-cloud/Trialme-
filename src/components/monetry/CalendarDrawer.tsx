import { useMemo, useState, type FC } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Subscription } from '../../types/subscription';
import { formatLocalDateKey, getChargeDatesInRange } from '../../utils/subscriptionCalculations';
import { BrandIcon } from '../BrandIcon';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export interface CalendarDrawerProps {
  open: boolean;
  subscriptions: Subscription[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
  onSelect: (sub: Subscription) => void;
  onClose: () => void;
}

export const CalendarDrawer: FC<CalendarDrawerProps> = ({
  open,
  subscriptions,
  currencySymbol,
  formatPrice,
  onSelect,
  onClose,
}) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const { monthLabel, daysInMonth, startWeekdayIndex, eventsByDay, monthTotal } = useMemo(() => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);
    const totalDays = lastOfMonth.getDate();

    // Monday = 0 .. Sunday = 6
    const jsDay = firstOfMonth.getDay();
    const mondayStart = jsDay === 0 ? 6 : jsDay - 1;

    const map: Record<number, Subscription[]> = {};
    let total = 0;

    subscriptions
      .filter((s) => s.status !== 'cancelled')
      .forEach((sub) => {
        const dates = getChargeDatesInRange(sub, firstOfMonth, lastOfMonth);
        dates.forEach((dateKey) => {
          const dayNum = Number(dateKey.slice(8, 10));
          if (dayNum >= 1 && dayNum <= totalDays) {
            if (!map[dayNum]) map[dayNum] = [];
            map[dayNum].push(sub);
            total += sub.price;
          }
        });
      });

    return {
      monthLabel: firstOfMonth.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      }),
      daysInMonth: totalDays,
      startWeekdayIndex: mondayStart,
      eventsByDay: map,
      monthTotal: total,
    };
  }, [subscriptions, monthOffset]);

  if (!open) return null;

  const todayKey = formatLocalDateKey(new Date());
  const selectedEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  return (
    <div className="drawer-in mx-4 mt-3 overflow-hidden rounded-2xl border border-[#D4AF7C]/25 bg-[#131315] p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Renewal Calendar</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h3 className="font-heading text-[15px] font-semibold text-white">
              {monthLabel}
            </h3>
            <span className="chip-gold rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums">
              {formatPrice(monthTotal, currencySymbol)} due
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMonthOffset((m) => m - 1);
              setSelectedDay(null);
            }}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonthOffset((m) => m + 1);
              setSelectedDay(null);
            }}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calendar"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-[9.5px] font-semibold tracking-wider text-white/35">
            {w}
          </div>
        ))}
        {Array.from({ length: startWeekdayIndex }).map((_, i) => (
          <div key={`pad-${i}`} className="h-8" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const daySubs = eventsByDay[day] || [];
          const hasEvents = daySubs.length > 0;
          const isSelected = selectedDay === day;
          const now = new Date();
          const checkKey = formatLocalDateKey(
            new Date(now.getFullYear(), now.getMonth() + monthOffset, day)
          );
          const isToday = checkKey === todayKey;

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`relative flex h-8 flex-col items-center justify-center rounded-lg text-[11px] font-medium transition ${
                isSelected
                  ? 'border border-[#D4AF7C] bg-[#211C14] text-[#D4AF7C]'
                  : isToday
                    ? 'border border-white/25 bg-white/[0.06] text-white'
                    : hasEvents
                      ? 'bg-white/[0.04] text-white hover:bg-white/[0.08]'
                      : 'text-white/45 hover:bg-white/[0.03]'
              }`}
            >
              <span>{day}</span>
              {hasEvents && (
                <span className="mt-0.5 flex gap-0.5">
                  {daySubs.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      className={`h-1 w-1 rounded-full ${
                        s.status === 'trial' ? 'bg-amber-400' : 'bg-[#D4AF7C]'
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay !== null && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] font-medium text-white/55">
            {selectedEvents.length === 0
              ? `No charges scheduled on day ${selectedDay}`
              : `${selectedEvents.length} ${
                  selectedEvents.length === 1 ? 'charge' : 'charges'
                } on day ${selectedDay}`}
          </p>
          {selectedEvents.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {selectedEvents.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelect(sub)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left transition hover:border-[#D4AF7C]/35"
                >
                  <div className="flex items-center gap-2.5">
                    <BrandIcon
                      name={sub.name}
                      category={sub.category}
                      color={sub.color}
                      size="sm"
                      enableLinkPill={false}
                    />
                    <div>
                      <p className="text-[12.5px] font-semibold text-white">
                        {sub.name}
                      </p>
                      <p className="text-[10.5px] text-white/45">
                        {sub.status === 'trial' ? 'Free trial converts' : 'Recurring charge'}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[12.5px] font-semibold text-[#D4AF7C] tabular-nums">
                    {formatPrice(sub.price, sub.currency || currencySymbol)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
