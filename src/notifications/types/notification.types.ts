import type { Subscription } from '../../types/subscription';

export type NotificationItemType = 'trial' | 'subscription';

export type NotificationLeadDays = 3 | 1;

export type NotificationDeliveryStatus =
  | 'scheduled'
  | 'delivered'
  | 'cancelled'
  | 'dismissed'
  | 'failed';

export interface ScheduledNotificationRecord {
  /** Deterministic signed 32-bit integer ID */
  id: number;
  /** ID of the associated subscription or trial */
  itemId: string;
  itemType: NotificationItemType;
  itemName: string;
  /** YYYY-MM-DD target date (trialEndDate or nextPaymentDate) */
  targetDate: string;
  leadDays: NotificationLeadDays;
  /** ISO 8601 string representing local 09:30 delivery time */
  scheduledFor: string;
  title: string;
  body: string;
  status: NotificationDeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationSyncResult {
  scheduledCount: number;
  cancelledCount: number;
  preservedCount: number;
  orphanedCount: number;
  activeIds: number[];
  errors: string[];
}

export type PlatformType = 'android' | 'ios' | 'web';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unavailable';

export interface NotificationPermissionState {
  granted: boolean;
  status: NotificationPermissionStatus;
  platform: PlatformType;
}

export interface NotificationActionPayload {
  actionId: 'manage' | 'dismiss' | 'tap';
  notificationId: number;
  itemId?: string;
}

export type NotificationActionListener = (payload: NotificationActionPayload) => void;

export interface NotificationActionCallbacks {
  onOpenSubscriptionDetail: (subscription: Subscription) => void;
  onNotificationDismissed?: (notificationId: number) => void;
  getSubscriptions: () => Subscription[];
}

/**
 * Pluggable Native / Web platform delivery driver interface
 */
export interface INotificationDriver {
  getPlatform(): PlatformType;
  checkPermission(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  schedule(notifications: ScheduledNotificationRecord[]): Promise<{ scheduledIds: number[]; failedIds: number[] }>;
  cancel(notificationIds: number[]): Promise<number[]>;
  cancelAll(): Promise<void>;
  onAction(listener: NotificationActionListener): () => void;
  scheduleTestNotification(delayMs: number): Promise<{ id: number; scheduledFor: string }>;
}
