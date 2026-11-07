import type { Subscription } from '../../types/subscription';
import type {
  INotificationDriver,
  NotificationSyncResult,
  ScheduledNotificationRecord,
} from '../types/notification.types';
import type { NotificationRepository } from './notificationRepository';
import { calculateEligibleNotifications } from './notificationRules';

export class NotificationReconciliation {
  private repository: NotificationRepository;
  private driver: INotificationDriver;

  constructor(repository: NotificationRepository, driver: INotificationDriver) {
    this.repository = repository;
    this.driver = driver;
  }

  /**
   * Reconciles all current subscriptions/trials with persisted and platform-scheduled notifications.
   *
   * 1. Calculates expected eligible reminders for all active/trial subscriptions.
   * 2. Compares against stored scheduled notifications.
   * 3. Cancels obsolete, cancelled, paused, or orphaned notifications.
   * 4. Schedules missing valid future notifications.
   * 5. Preserves valid existing notifications without rescheduling duplicates.
   */
  public async reconcile(
    subscriptions: Subscription[],
    now = new Date()
  ): Promise<NotificationSyncResult> {
    const errors: string[] = [];
    const activeSubMap = new Map<string, Subscription>();

    for (const sub of subscriptions) {
      if (sub.status === 'cancelled' || (sub.status as string) === 'paused') {
        continue;
      }
      if (sub.status === 'active' || sub.status === 'trial') {
        activeSubMap.set(sub.id, sub);
      }
    }

    // 1. Calculate all currently expected eligible future notifications
    const expectedList: ScheduledNotificationRecord[] = [];
    for (const sub of activeSubMap.values()) {
      try {
        const eligible = calculateEligibleNotifications(sub, now);
        expectedList.push(...eligible);
      } catch (err) {
        errors.push(`Failed to calculate eligible notifications for ${sub.id}: ${String(err)}`);
      }
    }

    const expectedMap = new Map<number, ScheduledNotificationRecord>();
    for (const item of expectedList) {
      expectedMap.set(item.id, item);
    }

    // 2. Read existing persisted records
    const existingRecords = this.repository.getAll();
    const existingMap = new Map<number, ScheduledNotificationRecord>();
    for (const record of existingRecords) {
      existingMap.set(record.id, record);
    }

    const toCancelIds: number[] = [];
    const toScheduleRecords: ScheduledNotificationRecord[] = [];
    let preservedCount = 0;
    let orphanedCount = 0;

    // Check existing records against expected
    for (const existing of existingRecords) {
      const parentSub = activeSubMap.get(existing.itemId);
      const matchingExpected = expectedMap.get(existing.id);

      // Obsolete if parent is deleted, cancelled, paused, or dates/content changed
      if (!parentSub || !matchingExpected) {
        toCancelIds.push(existing.id);
        orphanedCount++;
      } else if (
        matchingExpected.targetDate !== existing.targetDate ||
        matchingExpected.body !== existing.body ||
        matchingExpected.scheduledFor !== existing.scheduledFor
      ) {
        // Updated details -> cancel old, schedule new
        toCancelIds.push(existing.id);
        toScheduleRecords.push(matchingExpected);
      } else {
        // Exact match -> preserve
        preservedCount++;
      }
    }

    // Check for new expected records not yet in existing
    for (const expected of expectedList) {
      if (!existingMap.has(expected.id)) {
        toScheduleRecords.push(expected);
      }
    }

    // 3. Execute cancellation on driver and repository
    if (toCancelIds.length > 0) {
      try {
        await this.driver.cancel(toCancelIds);
        for (const id of toCancelIds) {
          this.repository.remove(id);
        }
      } catch (err) {
        errors.push(`Driver cancel failed: ${String(err)}`);
      }
    }

    // 4. Execute scheduling on driver and repository
    let scheduledCount = 0;
    if (toScheduleRecords.length > 0) {
      try {
        const res = await this.driver.schedule(toScheduleRecords);
        const scheduledSet = new Set(res.scheduledIds);
        const successful = toScheduleRecords.filter((r) => scheduledSet.has(r.id));
        this.repository.saveBatch(successful);
        scheduledCount = successful.length;
      } catch (err) {
        errors.push(`Driver schedule failed: ${String(err)}`);
      }
    }

    const activeIds = this.repository.getAll().map((r) => r.id);

    return {
      scheduledCount,
      cancelledCount: toCancelIds.length,
      preservedCount,
      orphanedCount,
      activeIds,
      errors,
    };
  }
}
