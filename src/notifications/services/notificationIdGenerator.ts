import type { NotificationItemType, NotificationLeadDays } from '../types/notification.types';

// Constants for 32-bit signed integer boundaries
export const MIN_INT32 = -2147483648;
export const MAX_INT32 = 2147483647;
export const MAX_POSITIVE_INT31 = 2147483640; // Safe upper bound for Android/iOS notification IDs

// Reserved ID for test preview notification to never collide with real user subscriptions
export const TEST_NOTIFICATION_ID = 2147483641;

/**
 * 32-bit FNV-1a hash algorithm.
 * Deterministic across all JavaScript/Node runtimes and browsers.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5; // 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply: hash * 16777619
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0; // Enforce signed 32-bit integer
}

/**
 * Generates a stable, deterministic signed 32-bit integer notification ID.
 *
 * Inputs:
 * - itemId: subscription or trial UUID / ID
 * - leadDays: 3 or 1
 * - itemType: 'trial' | 'subscription'
 *
 * Strategy:
 * 1. Computes FNV-1a 32-bit hash from canonical token `monetry:${itemType}:${itemId}:d${leadDays}`.
 * 2. Maps to positive 31-bit integer range [1000, 2147483640] via Math.abs and modulo,
 *    avoiding system-reserved low integers (0-999) and the reserved test ID.
 * 3. Enforces signed 32-bit bounds check.
 */
export function generateNotificationId(
  itemId: string,
  leadDays: NotificationLeadDays,
  itemType: NotificationItemType = 'subscription'
): number {
  if (!itemId || typeof itemId !== 'string') {
    throw new Error('generateNotificationId: itemId must be a non-empty string');
  }

  const token = `monetry:${itemType}:${itemId.trim()}:d${leadDays}`;
  const rawHash = fnv1a32(token);

  // Map to positive 31-bit integer range [1000, 2147483640]
  const positive = Math.abs(rawHash);
  const id = 1000 + (positive % (MAX_POSITIVE_INT31 - 1000));

  // Verify signed 32-bit boundary
  if (!isValidSignedInt32(id)) {
    throw new Error(`generateNotificationId: Generated ID ${id} is outside signed 32-bit integer range`);
  }

  return id;
}

/**
 * Validates whether a value is a valid signed 32-bit integer.
 */
export function isValidSignedInt32(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  return value >= MIN_INT32 && value <= MAX_INT32;
}
