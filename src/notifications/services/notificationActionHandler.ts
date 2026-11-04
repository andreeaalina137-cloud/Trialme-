import type {
  NotificationActionCallbacks,
  NotificationActionPayload,
} from '../types/notification.types';

export type { NotificationActionCallbacks };

export class NotificationActionHandler {
  private callbacks: NotificationActionCallbacks | null = null;

  public setCallbacks(callbacks: NotificationActionCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Handles user tapping or clicking a notification action (manage, dismiss, or banner tap).
   */
  public handleAction(payload: NotificationActionPayload): boolean {
    if (!this.callbacks) return false;

    const { actionId, notificationId, itemId } = payload;

    if (actionId === 'dismiss') {
      if (this.callbacks.onNotificationDismissed) {
        this.callbacks.onNotificationDismissed(notificationId);
      }
      return true;
    }

    if (actionId === 'manage' || actionId === 'tap') {
      if (!itemId) return false;

      const currentSubs = this.callbacks.getSubscriptions();
      const target = currentSubs.find((s) => s.id === itemId);

      if (target) {
        this.callbacks.onOpenSubscriptionDetail(target);
        return true;
      } else {
        console.warn(`[NotificationActionHandler] Item ${itemId} no longer exists.`);
        return false;
      }
    }

    return false;
  }
}

export const notificationActionHandler = new NotificationActionHandler();
