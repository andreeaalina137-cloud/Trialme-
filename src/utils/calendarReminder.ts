import type { Subscription } from '../types/subscription';

export interface SmartTrialTiming {
  trialStartAt: string;
  trialExpiresAt: string;
  trialEndDate: string;
  alarmArmedAt: string;
  urgentAlarmAt: string;
  leadHours: number;
  reminderDaysBefore: number;
}

/**
 * Calculates exact trial expiry timestamp and smart lead-time alarms:
 * - Trials >= 14 days: Primary safety alarm 72h before expiry (at 10:00 AM local time) + 24h urgent alarm
 * - Trials 7-13 days: Primary safety alarm 48h before expiry (at 10:00 AM local time) + 24h urgent alarm
 * - Short trials (< 7 days): Safety alarm 24h before expiry (at 10:00 AM local time)
 */
export function calculateSmartTrialTiming(
  trialDays: number,
  startDate = new Date()
): SmartTrialTiming {
  const safeStart = Number.isNaN(startDate.getTime()) ? new Date() : startDate;
  const safeDays =
    typeof trialDays === 'number' && Number.isFinite(trialDays) && trialDays > 0
      ? Math.min(365, Math.max(1, Math.round(trialDays)))
      : 7;
  const expiryDate = new Date(safeStart.getTime() + safeDays * 24 * 60 * 60 * 1000);

  const leadHours = safeDays < 5 ? 24 : safeDays < 14 ? 48 : 72;
  const reminderDaysBefore = Math.max(1, Math.round(leadHours / 24));

  // Primary safety alarm set at 10:00 AM local daytime so user never misses it while sleeping
  const primaryAlarm = new Date(expiryDate.getTime() - leadHours * 60 * 60 * 1000);
  primaryAlarm.setHours(10, 0, 0, 0);
  if (primaryAlarm.getTime() <= safeStart.getTime()) {
    const nextMorning = new Date(safeStart.getTime() + 24 * 60 * 60 * 1000);
    nextMorning.setHours(10, 0, 0, 0);
    if (nextMorning.getTime() < expiryDate.getTime()) {
      primaryAlarm.setTime(nextMorning.getTime());
    } else {
      primaryAlarm.setTime(
        safeStart.getTime() + Math.max(1000, Math.floor((expiryDate.getTime() - safeStart.getTime()) * 0.5))
      );
    }
  }

  // Final urgent alarm 24h before expiry at 10:00 AM local daytime
  const urgentAlarm = new Date(expiryDate.getTime() - 24 * 60 * 60 * 1000);
  urgentAlarm.setHours(10, 0, 0, 0);
  if (urgentAlarm.getTime() <= safeStart.getTime()) {
    urgentAlarm.setTime(primaryAlarm.getTime());
  }

  const trialEndDate = [
    expiryDate.getFullYear(),
    String(expiryDate.getMonth() + 1).padStart(2, '0'),
    String(expiryDate.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    trialStartAt: safeStart.toISOString(),
    trialExpiresAt: expiryDate.toISOString(),
    trialEndDate,
    alarmArmedAt: primaryAlarm.toISOString(),
    urgentAlarmAt: urgentAlarm.toISOString(),
    leadHours,
    reminderDaysBefore,
  };
}

/**
 * Formats a human-readable UK date & time for the armed alarm (e.g. "29 Oct, 10:00 AM")
 */
export function formatArmedAlarmDateTime(isoOrDate: string): string {
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Generates the live countdown badge string for a trial subscription:
 * e.g. "Trial ends in 6d 14h — Alarm armed for 29 Oct, 10:00 am"
 */
export function formatTrialCountdownBadge(
  subscription: Subscription,
  now = new Date()
): string | null {
  if (subscription.status !== 'trial') return null;

  let expiryMs: number;
  if (subscription.trialExpiresAt) {
    expiryMs = new Date(subscription.trialExpiresAt).getTime();
  } else {
    const rawDate = subscription.trialEndDate || subscription.nextPaymentDate;
    if (!rawDate) return null;
    expiryMs = new Date(`${rawDate}T23:59:59`).getTime();
  }

  if (Number.isNaN(expiryMs)) return null;

  const diffMs = expiryMs - now.getTime();
  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  let alarmDate: Date;
  if (subscription.alarmArmedAt) {
    alarmDate = new Date(subscription.alarmArmedAt);
  } else {
    const leadDays = subscription.reminderDaysBefore || (days < 5 ? 1 : days < 14 ? 2 : 3);
    alarmDate = new Date(expiryMs - leadDays * 24 * 60 * 60 * 1000);
    alarmDate.setHours(10, 0, 0, 0);
  }

  const alarmFormatted = formatArmedAlarmDateTime(alarmDate.toISOString());
  if (diffMs <= 0) {
    return `Trial expires today — Alarm armed (${alarmFormatted})`;
  }
  return `Trial ends in ${days}d ${hours}h — Alarm armed for ${alarmFormatted}`;
}

export function getSubscriptionReminderDate(subscription: Subscription): string | null {
  const date = subscription.status === 'trial' && subscription.trialEndDate
    ? subscription.trialEndDate
    : subscription.nextPaymentDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsedDate = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date
    ? null
    : date;
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatCalendarUtcDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function createSubscriptionReminderIcs(
  subscription: Subscription,
  date: string,
  reminderDays: number,
  summary: string,
  description: string,
  alarmDescription: string,
  now = new Date()
): string {
  const eventDate = new Date(`${date}T00:00:00Z`);
  const endDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
  const safeReminderDays = Number.isFinite(reminderDays) && reminderDays > 0
    ? Math.floor(reminderDays)
    : 3;
  const uid = `${encodeURIComponent(subscription.id)}-${date}@subcleaner.app`;
  const timestamp = formatCalendarUtcDateTime(now);

  const priceAfterTrial = `${subscription.currency || '£'}${subscription.price.toFixed(2)}/${subscription.frequency}`;
  const cancelLinkNote = subscription.cancelUrl ? `\nOfficial Cancellation Link: ${subscription.cancelUrl}` : '';
  const expiryTimeNote = subscription.trialExpiresAt
    ? `\nExact Trial Expiry: ${formatArmedAlarmDateTime(subscription.trialExpiresAt)}`
    : '';
  const enrichedDescription = `${alarmDescription} (${priceAfterTrial})${expiryTimeNote}${cancelLinkNote}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SubCleaner//Payment Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${formatCalendarDate(eventDate)}`,
    `DTEND;VALUE=DATE:${formatCalendarDate(endDate)}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(enrichedDescription)}`,
  ];

  if (subscription.cancelUrl) {
    lines.push(`URL:${subscription.cancelUrl}`);
  }

  // Primary safety lead-time VALARM (e.g. -P3D or -P2D or -P1D)
  lines.push(
    'BEGIN:VALARM',
    `TRIGGER:-P${safeReminderDays}D`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'END:VALARM'
  );

  // Secondary urgent 24h VALARM + Audio trigger if primary is > 1 day
  if (safeReminderDays > 1) {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeCalendarText(`URGENT 24h Final Alert: Cancel ${subscription.name} (${priceAfterTrial}) before tomorrow!`)}`,
      'END:VALARM'
    );
  }

  lines.push(
    'BEGIN:VALARM',
    `TRIGGER:-P${safeReminderDays}D`,
    'ACTION:AUDIO',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  );

  return lines.join('\r\n');
}

export function downloadSubscriptionReminderIcs(
  subscription: Subscription,
  date: string,
  reminderDays: number,
  summary: string,
  description: string,
  alarmDescription: string,
  fileName: string
): void {
  const contents = createSubscriptionReminderIcs(
    subscription,
    date,
    reminderDays,
    summary,
    description,
    alarmDescription
  );
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'SubCleaner-Reminder'}.ics`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a direct 1-tap Google Calendar template URL set for the armed daytime alarm
 * (10:00 AM local time, 24-72h before expiry) with Service Name, £ Price after trial,
 * and Official Cancellation Link pre-filled.
 */
export function createGoogleCalendarReminderUrl(
  subscription: Subscription,
  date: string,
  reminderDays: number,
  summary?: string,
  description?: string
): string {
  const safeReminderDays = Number.isFinite(reminderDays) && reminderDays > 0
    ? Math.floor(reminderDays)
    : 3;

  let alertStart: Date;
  if (subscription.alarmArmedAt) {
    alertStart = new Date(subscription.alarmArmedAt);
  } else {
    const eventDate = new Date(`${date}T10:00:00`);
    alertStart = new Date(eventDate.getTime() - safeReminderDays * 24 * 60 * 60 * 1000);
    alertStart.setHours(10, 0, 0, 0);
  }
  const alertEnd = new Date(alertStart.getTime() + 30 * 60 * 1000);

  const priceAfter = `${subscription.currency || '£'}${subscription.price.toFixed(2)}/${subscription.frequency}`;
  const title = summary || `🛡️ Cancel ${subscription.name} (${priceAfter}) — SubCleaner Auto-Alarm`;
  const details = [
    description || `SubCleaner Financial Shield Alert for ${subscription.name}.`,
    `Price after trial/renewal: ${priceAfter}`,
    `Expiry / Billing Date: ${date}${subscription.trialExpiresAt ? ` (${formatArmedAlarmDateTime(subscription.trialExpiresAt)})` : ''}`,
    subscription.cancelUrl ? `Direct Cancellation Portal: ${subscription.cancelUrl}` : '',
  ].filter(Boolean).join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatCalendarUtcDateTime(alertStart)}/${formatCalendarUtcDateTime(alertEnd)}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates a recurring 1st-of-the-month "Payday Check-in" .ics calendar event
 * so users review their active subscriptions every month.
 */
export function downloadMonthlyPaydayAuditIcs(
  monthlyTotalFormatted: string,
  activeCount: number,
  now = new Date()
): void {
  const nextMonthFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonthSecond = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
  const timestamp = formatCalendarUtcDateTime(now);
  const summary = `🛡️ SubCleaner Monthly Payday Check-in (${monthlyTotalFormatted}/mo)`;
  const description = `Monthly 60-second subscription audit: Review your ${activeCount} active UK subscriptions (${monthlyTotalFormatted}/mo) and cancel any unused services before billing.`;

  const contents = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SubCleaner//Monthly Payday Shield//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:subcleaner-monthly-audit@subcleaner.app`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${formatCalendarDate(nextMonthFirst)}`,
    `DTEND;VALUE=DATE:${formatCalendarDate(nextMonthSecond)}`,
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'SubCleaner-Monthly-Payday-Shield.ics';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
