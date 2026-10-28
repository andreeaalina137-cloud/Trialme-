import React, { useMemo, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, CalendarDays, Download, ExternalLink } from 'lucide-react';
import type { Subscription } from '../types/subscription';
import { BrandIcon } from './BrandIcon';
import { formatPrice, getChargeDatesInRange } from '../utils/subscriptionCalculations';
import {
  createGoogleCalendarReminderUrl,
  downloadSubscriptionReminderIcs,
  getSubscriptionReminderDate,
} from '../utils/calendarReminder';
import { useTranslation } from '../i18n/LanguageContext';

interface CalendarViewProps {
  subscriptions: Subscription[];
  currencySymbol: string;
  onSelectSubscription?: (sub: Subscription) => void;
  compact?: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const CalendarView: React.FC<CalendarViewProps> = ({
  subscriptions,
  currencySymbol,
  onSelectSubscription,
  compact = false,
}) => {
  const { t } = useTranslation();

  const activeSubs = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active' || s.status === 'trial')
        .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate)),
    [subscriptions]
  );

  // Default to the month of the nearest upcoming subscription, or current month
  const initialDate = useMemo(() => {
    const first = activeSubs[0]?.nextPaymentDate;
    if (first) {
      const parsed = new Date(`${first}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [activeSubs]);

  const [viewMonth, setViewMonth] = useState<Date>(initialDate);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(activeSubs[0]?.id ?? null);

  const selectedSub = useMemo(
    () => activeSubs.find((s) => s.id === selectedSubId) ?? activeSubs[0] ?? null,
    [activeSubs, selectedSubId]
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Build calendar grid (Monday-first)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{ day: number | null; dateStr: string | null; subs: Subscription[] }> = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ day: null, dateStr: null, subs: [] });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDate = new Date(year, month, day);
      const matching = activeSubs.filter((s) => {
        if (s.status === 'trial') {
          const trialEnd = s.trialEndDate || s.nextPaymentDate;
          return trialEnd === dateStr;
        }
        const charges = getChargeDatesInRange(s, cellDate, cellDate);
        return charges.length > 0;
      });
      cells.push({ day, dateStr, subs: matching });
    }
    return cells;
  }, [year, month, activeSubs]);

  const formatDisplayDate = (dateStr: string) => {
    const parsed = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="rounded-3xl bg-[#161616] p-5 border border-white/[0.08] text-[#F5F5F5] space-y-4 shadow-xl">
      {/* Month Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-[#F5F5F5] tracking-tight">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="h-8 w-8 rounded-full border border-white/10 bg-[#1F1F1F] flex items-center justify-center text-[#A0A0A0] hover:text-[#F5F5F5] hover:border-[#D4AF7C]/50 active:scale-[0.92] transition-all cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="h-8 w-8 rounded-full border border-white/10 bg-[#1F1F1F] flex items-center justify-center text-[#A0A0A0] hover:text-[#F5F5F5] hover:border-[#D4AF7C]/50 active:scale-[0.92] transition-all cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#A0A0A0] pb-1 border-b border-white/[0.06]">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {calendarCells.map((cell, idx) => {
          if (!cell.day) {
            return <div key={`empty-${idx}`} className="h-9" />;
          }

          const hasSubs = cell.subs.length > 0;
          const primarySub = cell.subs[0];
          const isSelected = primarySub && selectedSub?.id === primarySub.id;
          const isGoldHighlight =
            hasSubs &&
            (primarySub.status === 'trial' ||
              primarySub.id === activeSubs[0]?.id ||
              isSelected);

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => {
                if (primarySub) {
                  setSelectedSubId(primarySub.id);
                }
              }}
              className={`h-9 rounded-full text-xs font-bold flex flex-col items-center justify-center transition-all relative active:scale-[0.95] ${
                hasSubs
                  ? isGoldHighlight
                    ? 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-black shadow-md shadow-[#D4AF7C]/25 cursor-pointer scale-105'
                    : 'bg-[#1F1F1F] border border-[#D4AF7C]/45 text-[#D4AF7C] font-extrabold shadow-sm cursor-pointer hover:scale-105'
                  : 'text-[#A0A0A0] hover:bg-[#1F1F1F] hover:text-[#F5F5F5]'
              }`}
            >
              <span>{cell.day}</span>
              {cell.subs.length > 1 && (
                <span className="w-1 h-1 rounded-full bg-current absolute bottom-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Trial / Subscription Footer */}
      {selectedSub ? (
        <div className="pt-3 border-t border-white/[0.08] space-y-3">
          <div
            onClick={() => onSelectSubscription?.(selectedSub)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSubscription?.(selectedSub);
              }
            }}
            className="flex items-center justify-between gap-3 rounded-2xl bg-[#1F1F1F] border border-white/[0.06] p-3 hover:border-[#D4AF7C]/50 active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon
                name={selectedSub.name}
                category={selectedSub.category}
                color={selectedSub.color}
                size="preset"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F5F5F5] truncate">
                  {selectedSub.name.replace(' UK Standard', '').replace(' UK', '')}
                </div>
                <div className="text-[11px] text-[#A0A0A0]">
                  {selectedSub.status === 'trial' ? 'Free trial ends' : 'Subscription renews'} ·{' '}
                  {formatPrice(selectedSub.price, selectedSub.currency || currencySymbol)}/mo
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-[#F5F5F5]">
                {formatDisplayDate(selectedSub.nextPaymentDate)}
              </span>
              <Bell className="w-4 h-4 text-[#D4AF7C] fill-[#D4AF7C]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-[#A0A0A0] px-1">
            <span className="inline-flex items-center gap-2 font-medium text-[#F5F5F5]/90">
              <Bell className="w-3.5 h-3.5 text-[#D4AF7C] fill-[#D4AF7C]" />
              Reminder set {selectedSub.reminderDaysBefore || 3} days before (10:00 AM)
            </span>

            {!compact && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const reminderDate = getSubscriptionReminderDate(selectedSub);
                    if (!reminderDate) return;
                    downloadSubscriptionReminderIcs(
                      selectedSub,
                      reminderDate,
                      selectedSub.reminderDaysBefore || 3,
                      t('calendar.summary', { name: selectedSub.name }),
                      t('calendar.description', { name: selectedSub.name }),
                      t('calendar.alarm', {
                        name: selectedSub.name,
                        days: selectedSub.reminderDaysBefore || 3,
                      }),
                      t('calendar.fileName', { name: selectedSub.name })
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#1F1F1F] px-3 py-1.5 text-[11px] font-bold text-[#D4AF7C] hover:border-[#D4AF7C] transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>.ics</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reminderDate = getSubscriptionReminderDate(selectedSub);
                    if (!reminderDate) return;
                    const url = createGoogleCalendarReminderUrl(
                      selectedSub,
                      reminderDate,
                      selectedSub.reminderDaysBefore || 3,
                      t('calendar.summary', { name: selectedSub.name }),
                      t('calendar.alarm', {
                        name: selectedSub.name,
                        days: selectedSub.reminderDaysBefore || 3,
                      })
                    );
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#1F1F1F] px-3 py-1.5 text-[11px] font-bold text-[#F5F5F5] hover:border-[#D4AF7C] transition-colors cursor-pointer"
                >
                  <CalendarDays className="w-3 h-3 text-[#D4AF7C]" />
                  <span>Google Cal</span>
                  <ExternalLink className="w-2.5 h-2.5 text-[#A0A0A0]" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-2 text-center text-xs text-[#A0A0A0]">
          No active trials or subscriptions scheduled this month.
        </div>
      )}
    </div>
  );
};
