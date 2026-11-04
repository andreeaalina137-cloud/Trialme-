import type { Subscription } from '../../types/subscription';
import type {
  INotificationDriver,
  NotificationActionCallbacks,
  NotificationPermissionState,
  NotificationSyncResult,
} from '../types/notification.types';
import { notificationDriver } from './notificationDriver';
import {
  NotificationPermissionManager,
} from './notificationPermissionManager';
import {
  NotificationRepository,
  notificationRepository,
} from './notificationRepository';
import { NotificationReconciliation } from './notificationReconciliation';
import {
  NotificationActionHandler,
  notificationActionHandler,
} from './notificationActionHandler';
import { calculateEligibleNotifications } from './notificationRules';

export class NotificationService {
  private repository: NotificationRepository;
  private driver: INotificationDriver;
  private permissionManager: NotificationPermissionManager;
  private reconciliation: NotificationReconciliation;
  private actionHandler: NotificationActionHandler;

  constructor(
    repository: NotificationRepository = notificationRepository,
    driver: INotificationDriver = notificationDriver,
    actionHandler: NotificationActionHandler = notificationActionHandler
  ) {
    this.repository = repository;
    this.driver = driver;
    this.actionHandler = actionHandler;
    this.permissionManager = new NotificationPermissionManager(driver);
    this.reconciliation = new NotificationReconciliation(repository, driver);

    // Register driver action listener
    this.driver.onAction((payload) => {
      this.actionHandler.handleAction(payload);
    });
  }

  /**
   * Replaces driver (used in automated testing for full deterministic verification).
   */
  public setDriver(driver: INotificationDriver): void {
    this.driver = driver;
    this.permissionManager = new NotificationPermissionManager(driver);
    this.reconciliation = new NotificationReconciliation(this.repository, driver);
    this.driver.onAction((payload) => {
      this.actionHandler.handleAction(payload);
    });
  }

  /**
   * Sets callbacks for UI navigation on notification actions.
   */
  public setActionCallbacks(callbacks: NotificationActionCallbacks): void {
    this.actionHandler.setCallbacks(callbacks);
  }

  public isNotificationsEnabled(): boolean {
    return this.permissionManager.isEnabled();
  }

  public async setNotificationsEnabled(enabled: boolean): Promise<void> {
    this.permissionManager.setEnabled(enabled);
    if (!enabled) {
      // User disabled notifications: cancel active notifications from platform
      const allScheduled = this.repository.getAll();
      const ids = allScheduled.map((s) => s.id);
      if (ids.length > 0) {
        await this.driver.cancel(ids);
      }
    }
  }

  public async getPermissionState(): Promise<NotificationPermissionState> {
    return this.permissionManager.getPermissionState();
  }

  public async requestPermission(): Promise<boolean> {
    return this.permissionManager.requestPermission();
  }

  /**
   * Synchronizes notifications when a new subscription or trial is added.
   * Never throws or rolls back the added subscription.
   */
  public async syncOnAdd(
    subscription: Subscription,
    now = new Date()
  ): Promise<NotificationSyncResult> {
    const emptyResult: NotificationSyncResult = {
      scheduledCount: 0,
      cancelledCount: 0,
      preservedCount: 0,
      orphanedCount: 0,
      activeIds: this.repository.getAll().map((r) => r.id),
      errors: [],
    };

    if (!this.isNotificationsEnabled()) {
      return emptyResult;
    }

    try {
      const eligible = calculateEligibleNotifications(subscription, now);
      if (eligible.length === 0) {
        return emptyResult;
      }

      // Schedule eligible notifications
      const res = await this.driver.schedule(eligible);
      const scheduledSet = new Set(res.scheduledIds);
      const successful = eligible.filter((r) => scheduledSet.has(r.id));
      this.repository.saveBatch(successful);

      return {
        scheduledCount: successful.length,
        cancelledCount: 0,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [],
      };
    } catch (err) {
      this.permissionManager.recordDiagnostic('syncOnAdd failed', err);
      emptyResult.errors.push(String(err));
      return emptyResult;
    }
  }

  /**
   * Synchronizes notifications when a subscription or trial is updated.
   * Cancels outdated reminders and schedules recalculated ones.
   */
  public async syncOnUpdate(
    subscription: Subscription,
    now = new Date()
  ): Promise<NotificationSyncResult> {
    try {
      // Cancel existing notifications for this item
      const removedIds = this.repository.removeByItemId(subscription.id);
      if (removedIds.length > 0) {
        await this.driver.cancel(removedIds);
      }

      if (!this.isNotificationsEnabled() || subscription.status === 'cancelled' || (subscription.status as string) === 'paused') {
        return {
          scheduledCount: 0,
          cancelledCount: removedIds.length,
          preservedCount: 0,
          orphanedCount: 0,
          activeIds: this.repository.getAll().map((r) => r.id),
          errors: [],
        };
      }

      const eligible = calculateEligibleNotifications(subscription, now);
      if (eligible.length > 0) {
        const res = await this.driver.schedule(eligible);
        const scheduledSet = new Set(res.scheduledIds);
        const successful = eligible.filter((r) => scheduledSet.has(r.id));
        this.repository.saveBatch(successful);

        return {
          scheduledCount: successful.length,
          cancelledCount: removedIds.length,
          preservedCount: 0,
          orphanedCount: 0,
          activeIds: this.repository.getAll().map((r) => r.id),
          errors: [],
        };
      }

      return {
        scheduledCount: 0,
        cancelledCount: removedIds.length,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [],
      };
    } catch (err) {
      this.permissionManager.recordDiagnostic('syncOnUpdate failed', err);
      return {
        scheduledCount: 0,
        cancelledCount: 0,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [String(err)],
      };
    }
  }

  /**
   * Cancels all notifications when an item is deleted.
   */
  public async syncOnDelete(subscriptionId: string): Promise<NotificationSyncResult> {
    try {
      const removedIds = this.repository.removeByItemId(subscriptionId);
      if (removedIds.length > 0) {
        await this.driver.cancel(removedIds);
      }
      return {
        scheduledCount: 0,
        cancelledCount: removedIds.length,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [],
      };
    } catch (err) {
      this.permissionManager.recordDiagnostic('syncOnDelete failed', err);
      return {
        scheduledCount: 0,
        cancelledCount: 0,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [String(err)],
      };
    }
  }

  /**
   * Cancels future notifications when an item is cancelled or marked complete.
   */
  public async syncOnCancel(subscriptionId: string): Promise<NotificationSyncResult> {
    return this.syncOnDelete(subscriptionId);
  }

  /**
   * Cancels notifications when an item is paused.
   */
  public async syncOnPause(subscriptionId: string): Promise<NotificationSyncResult> {
    return this.syncOnDelete(subscriptionId);
  }

  /**
   * Resumes notifications using the current target date.
   */
  public async syncOnResume(
    subscription: Subscription,
    now = new Date()
  ): Promise<NotificationSyncResult> {
    return this.syncOnUpdate(subscription, now);
  }

  /**
   * Reconciles all subscriptions across the entire application.
   * Safe to run on boot, resume, and data updates.
   */
  public async reconcileAll(
    subscriptions: Subscription[],
    now = new Date()
  ): Promise<NotificationSyncResult> {
    if (!this.isNotificationsEnabled()) {
      const allScheduled = this.repository.getAll();
      const ids = allScheduled.map((s) => s.id);
      if (ids.length > 0) {
        await this.driver.cancel(ids);
      }
      return {
        scheduledCount: 0,
        cancelledCount: ids.length,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: [],
        errors: [],
      };
    }

    try {
      return await this.reconciliation.reconcile(subscriptions, now);
    } catch (err) {
      this.permissionManager.recordDiagnostic('reconcileAll failed', err);
      return {
        scheduledCount: 0,
        cancelledCount: 0,
        preservedCount: 0,
        orphanedCount: 0,
        activeIds: this.repository.getAll().map((r) => r.id),
        errors: [String(err)],
      };
    }
  }

  /**
   * Triggers a preview test notification scheduled ~3 seconds later.
   * Clearly marked as preview, never touches real subscription schedules.
   */
  public async triggerTestNotification(
    delayMs = 3000
  ): Promise<{ scheduled: boolean; message: string }> {
    if (!this.isNotificationsEnabled()) {
      return {
        scheduled: false,
        message: 'Notifications are currently disabled in settings.',
      };
    }

    const perm = await this.getPermissionState();
    if (perm.status === 'denied') {
      return {
        scheduled: false,
        message: 'Notifications are blocked in your device or browser permissions.',
      };
    }

    try {
      await this.driver.scheduleTestNotification(delayMs);
      return {
        scheduled: true,
        message: `Preview test notification scheduled in ~${Math.round(delayMs / 1000)}s!`,
      };
    } catch (err) {
      return {
        scheduled: false,
        message: `Failed to schedule test alert: ${String(err)}`,
      };
    }
  }
}

export const notificationService = new NotificationService();
