import type { Subscription } from '../../types/subscription';
import { formatPrice } from '../../utils/subscriptionCalculations';
import type {
  NotificationItemType,
  NotificationLeadDays,
  ScheduledNotificationRecord,
} from '../types/notification.types';
import { generateNotificationId } from './notificationIdGenerator';

export const NOTIFICATION_DELIVERY_HOUR = 9;
export const NOTIFICATION_DELIVERY_MINUTE = 30;

/**
 * Validates whether a string is a strict YYYY-MM-DD date representation.
 */
export function isValidDateString(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

/**
 * Resolves the canonical target date (YYYY-MM-DD) for an item:
 * - For active trials: trialEndDate (falling back to nextPaymentDate if valid)
 * - For active subscriptions: nextPaymentDate
 */
export function resolveTargetDate(subscription: Subscription): string | null {
  if (subscription.status === 'cancelled' || (subscription.status as string) === 'paused') {
    return null;
  }

  if (subscription.status === 'trial') {
    if (subscription.trialEndDate && isValidDateString(subscription.trialEndDate)) {
      return subscription.trialEndDate;
    }
    if (subscription.trialExpiresAt) {
      const exp = new Date(subscription.trialExpiresAt);
      if (!Number.isNaN(exp.getTime())) {
        const y = exp.getFullYear();
        const m = String(exp.getMonth() + 1).padStart(2, '0');
        const d = String(exp.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  if (subscription.nextPaymentDate && isValidDateString(subscription.nextPaymentDate)) {
    return subscription.nextPaymentDate;
  }

  return null;
}

/**
 * Calculates delivery date at 09:30 local time for a target date minus lead days.
 * Safe against month boundaries, leap years, and daylight-saving transitions.
 */
export function calculateDeliveryDate(targetDateStr: string, leadDays: NotificationLeadDays): Date {
  const [y, m, d] = targetDateStr.split('-').map(Number);
  // Using local time constructor: handles month boundaries & DST transitions smoothly
  return new Date(y, m - 1, d - leadDays, NOTIFICATION_DELIVERY_HOUR, NOTIFICATION_DELIVERY_MINUTE, 0, 0);
}

/**
 * Builds standard notification title & body according to Phase 3 specification.
 */
export function buildNotificationContent(
  item: Subscription,
  itemType: NotificationItemType,
  leadDays: NotificationLeadDays
): { title: string; body: string } {
  const currencySymbol = item.currency || '£';
  const priceStr = typeof item.price === 'number' && Number.isFinite(item.price)
    ? formatPrice(item.price, currencySymbol)
    : `${currencySymbol}0.00`;

  const intervalLabel = leadDays === 3 ? '3 days' : '1 day';

  if (itemType === 'trial') {
    return {
      title: 'Trial ending soon',
      body: `Your ${item.name} trial (${priceStr}) ends in ${intervalLabel}.`,
    };
  }

  return {
    title: 'Upcoming renewal',
    body: `${item.name} (${priceStr}) renews in ${intervalLabel}.`,
  };
}

/**
 * Computes all eligible future notifications for a subscription/trial item.
 *
 * Rules:
 * - Active or trial items only (never cancelled or paused).
 * - Target date must be valid YYYY-MM-DD.
 * - Schedules 3-day and 1-day alerts at 09:30 local time.
 * - Filters out timestamps already in the past (e.g. if target date is tomorrow, 3-day is past, so only 1-day is returned).
 * - Never schedules at midnight.
 */
export function calculateEligibleNotifications(
  subscription: Subscription,
  now: Date = new Date()
): ScheduledNotificationRecord[] {
  // Discard cancelled or paused items
  if (subscription.status === 'cancelled' || (subscription.status as string) === 'paused') {
    return [];
  }

  const targetDate = resolveTargetDate(subscription);
  if (!targetDate) {
    return [];
  }

  const itemType: NotificationItemType = subscription.status === 'trial' ? 'trial' : 'subscription';
  const leadIntervals: NotificationLeadDays[] = [3, 1];
  const eligible: ScheduledNotificationRecord[] = [];
  const nowMs = now.getTime();
  const isoNow = now.toISOString();

  for (const leadDays of leadIntervals) {
    const deliveryDate = calculateDeliveryDate(targetDate, leadDays);

    // Never schedule notifications in the past
    if (deliveryDate.getTime() <= nowMs) {
      continue;
    }

    const id = generateNotificationId(subscription.id, leadDays, itemType);
    const { title, body } = buildNotificationContent(subscription, itemType, leadDays);

    eligible.push({
      id,
      itemId: subscription.id,
      itemType,
      itemName: subscription.name,
      targetDate,
      leadDays,
      scheduledFor: deliveryDate.toISOString(),
      title,
      body,
      status: 'scheduled',
      createdAt: isoNow,
      updatedAt: isoNow,
    });
  }

  return eligible;
}
