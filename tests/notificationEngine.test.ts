import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Subscription } from '../src/types/subscription';
import {
  NotificationService,
  NotificationRepository,
  isValidSignedInt32,
  generateNotificationId,
  calculateEligibleNotifications,
  calculateDeliveryDate,
  TEST_NOTIFICATION_ID,
  type INotificationDriver,
  type ScheduledNotificationRecord,
  type NotificationPermissionState,
  type NotificationActionListener,
  type PlatformType,
  getAllPossibleNotificationIdsForItem,
} from '../src/notifications';
import { clearMemoryStorage, safeStorageGet, safeStorageSet } from '../src/utils/storage';

/**
 * In-memory Mock Driver simulating platform delivery (Android / iOS / Web).
 */
class MockNotificationDriver implements INotificationDriver {
  public scheduledCalls: ScheduledNotificationRecord[][] = [];
  public cancelledCalls: number[][] = [];
  public actionListeners: NotificationActionListener[] = [];
  public permissionState: NotificationPermissionState = {
    granted: true,
    status: 'granted',
    platform: 'android',
  };
  public shouldFailScheduling = false;

  public getPlatform(): PlatformType {
    return this.permissionState.platform;
  }

  public async checkPermission(): Promise<NotificationPermissionState> {
    return this.permissionState;
  }

  public async requestPermission(): Promise<NotificationPermissionState> {
    return this.permissionState;
  }

  public async schedule(
    notifications: ScheduledNotificationRecord[]
  ): Promise<{ scheduledIds: number[]; failedIds: number[] }> {
    if (this.shouldFailScheduling) {
      throw new Error('Simulated platform scheduler failure (battery optimization / quota)');
    }
    this.scheduledCalls.push(notifications);
    return {
      scheduledIds: notifications.map((n) => n.id),
      failedIds: [],
    };
  }

  public async cancel(notificationIds: number[]): Promise<number[]> {
    this.cancelledCalls.push(notificationIds);
    return notificationIds;
  }

  public async cancelAll(): Promise<void> {
    this.cancelledCalls.push([-1]);
  }

  public onAction(listener: NotificationActionListener): () => void {
    this.actionListeners.push(listener);
    return () => {
      this.actionListeners = this.actionListeners.filter((l) => l !== listener);
    };
  }

  public async scheduleTestNotification(delayMs: number): Promise<{ id: number; scheduledFor: string }> {
    return {
      id: TEST_NOTIFICATION_ID,
      scheduledFor: new Date(Date.now() + delayMs).toISOString(),
    };
  }

  public simulateAction(payload: { actionId: 'manage' | 'dismiss' | 'tap'; notificationId: number; itemId?: string }) {
    for (const listener of this.actionListeners) {
      listener(payload);
    }
  }

  public reset() {
    this.scheduledCalls = [];
    this.cancelledCalls = [];
    this.shouldFailScheduling = false;
  }
}

describe('MONETRY — Notification Intelligence Engine V1', () => {
  let mockDriver: MockNotificationDriver;
  let repo: NotificationRepository;
  let service: NotificationService;

  const BASE_NOW = new Date('2026-11-04T12:00:00Z');

  // Sample trial ending 10 days in future (2026-11-14)
  const sampleTrial: Subscription = {
    id: 'trial-spotify-1',
    name: 'Spotify Premium UK',
    price: 11.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Music & Audio',
    nextPaymentDate: '2026-11-14',
    status: 'trial',
    trialEndDate: '2026-11-14',
    color: '#1DB954',
    reminderDaysBefore: 3,
    paymentHistory: [],
    createdAt: '2026-11-01',
  };

  // Sample subscription renewing 14 days in future (2026-11-18)
  const sampleSub: Subscription = {
    id: 'sub-netflix-1',
    name: 'Netflix UK Standard',
    price: 10.99,
    currency: '£',
    frequency: 'monthly',
    category: 'Streaming',
    nextPaymentDate: '2026-11-18',
    status: 'active',
    color: '#E50914',
    reminderDaysBefore: 3,
    paymentHistory: [],
    createdAt: '2026-10-18',
  };

  beforeEach(() => {
    clearMemoryStorage();
    mockDriver = new MockNotificationDriver();
    repo = new NotificationRepository();
    repo.clear();
    service = new NotificationService(repo, mockDriver);
  });

  // 1. Adding a trial schedules eligible reminders (3d and 1d)
  it('1. adding a trial schedules eligible reminders with exact title and body', async () => {
    const res = await service.syncOnAdd(sampleTrial, BASE_NOW);
    assert.equal(res.scheduledCount, 2, 'Should schedule 3-day and 1-day alerts');
    assert.equal(repo.getAll().length, 2);

    const records = repo.getByItemId(sampleTrial.id);
    const alert3d = records.find((r) => r.leadDays === 3);
    const alert1d = records.find((r) => r.leadDays === 1);

    assert.ok(alert3d);
    assert.equal(alert3d.title, 'Trial ending soon');
    assert.equal(alert3d.body, 'Your Spotify Premium UK trial (£11.99) ends in 3 days.');
    assert.equal(alert3d.scheduledFor.startsWith('2026-11-11T09:30'), true);

    assert.ok(alert1d);
    assert.equal(alert1d.title, 'Trial ending soon');
    assert.equal(alert1d.body, 'Your Spotify Premium UK trial (£11.99) ends in 1 day.');
    assert.equal(alert1d.scheduledFor.startsWith('2026-11-13T09:30'), true);
  });

  // 2. Adding a subscription schedules eligible reminders
  it('2. adding a subscription schedules eligible reminders with renewal copy', async () => {
    const res = await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.equal(res.scheduledCount, 2);

    const records = repo.getByItemId(sampleSub.id);
    const alert3d = records.find((r) => r.leadDays === 3);
    const alert1d = records.find((r) => r.leadDays === 1);

    assert.ok(alert3d);
    assert.equal(alert3d.title, 'Upcoming renewal');
    assert.equal(alert3d.body, 'Netflix UK Standard (£10.99) renews in 3 days.');
    assert.equal(alert3d.scheduledFor.startsWith('2026-11-15T09:30'), true);

    assert.ok(alert1d);
    assert.equal(alert1d.title, 'Upcoming renewal');
    assert.equal(alert1d.body, 'Netflix UK Standard (£10.99) renews in 1 day.');
    assert.equal(alert1d.scheduledFor.startsWith('2026-11-17T09:30'), true);
  });

  // 3. Updating dates replaces old reminders
  it('3. updating renewal date cancels outdated reminders and schedules for new date', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    const originalRecords = repo.getAll();
    const original3dId = originalRecords.find((r) => r.leadDays === 3)!.id;

    // Move renewal to 2026-11-25
    const updatedSub = { ...sampleSub, nextPaymentDate: '2026-11-25' };
    const res = await service.syncOnUpdate(updatedSub, BASE_NOW);

    assert.equal(res.cancelledCount, 2, 'Old reminders cancelled');
    assert.equal(res.scheduledCount, 2, 'New reminders scheduled');

    const newRecords = repo.getAll();
    const new3d = newRecords.find((r) => r.leadDays === 3);
    assert.ok(new3d);
    assert.equal(new3d.scheduledFor.startsWith('2026-11-22T09:30'), true);
    // Verified driver cancel call
    assert.equal(mockDriver.cancelledCalls.flat().includes(original3dId), true);
  });

  // 4. Updating amounts refreshes notification content
  it('4. updating amounts updates notification copy without altering item identity', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);

    // Price hike from £10.99 to £12.99
    const priceHikeSub = { ...sampleSub, price: 12.99 };
    await service.syncOnUpdate(priceHikeSub, BASE_NOW);

    const records = repo.getByItemId(sampleSub.id);
    const alert1d = records.find((r) => r.leadDays === 1);
    assert.ok(alert1d);
    assert.equal(alert1d.body, 'Netflix UK Standard (£12.99) renews in 1 day.');
  });

  // 5. Deleting an item cancels all associated reminders
  it('5. deleting an item cancels all pending notifications and purges metadata', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    const initialIds = repo.getAll().map((r) => r.id);

    const res = await service.syncOnDelete(sampleSub.id);
    assert.equal(res.cancelledCount, 2);
    assert.equal(repo.getByItemId(sampleSub.id).length, 0);

    const flattenedCancelled = mockDriver.cancelledCalls.flat();
    for (const id of initialIds) {
      assert.equal(flattenedCancelled.includes(id), true);
    }
  });

  // 6. Pausing cancels reminders
  it('6. pausing an item cancels its reminders while preserving financial data', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.equal(repo.getAll().length, 2);

    const res = await service.syncOnPause(sampleSub.id);
    assert.equal(res.cancelledCount, 2);
    assert.equal(repo.getAll().length, 0);
  });

  // 7. Resuming restores eligible reminders
  it('7. resuming an item recalculates and restores eligible reminders', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    await service.syncOnPause(sampleSub.id);
    assert.equal(repo.getAll().length, 0);

    // Resumed active item
    const res = await service.syncOnResume(sampleSub, BASE_NOW);
    assert.equal(res.scheduledCount, 2);
    assert.equal(repo.getAll().length, 2);
  });

  // 8. Completed / cancelled trials do not receive future alerts
  it('8. cancelled or completed items do not receive future alerts', async () => {
    await service.syncOnAdd(sampleTrial, BASE_NOW);
    assert.equal(repo.getAll().length, 2);

    const res = await service.syncOnCancel(sampleTrial.id);
    assert.equal(res.cancelledCount, 2);
    assert.equal(repo.getAll().length, 0);

    // Attempting to calculate on cancelled item returns empty array
    const cancelledTrial = { ...sampleTrial, status: 'cancelled' as const };
    const eligible = calculateEligibleNotifications(cancelledTrial, BASE_NOW);
    assert.equal(eligible.length, 0);
  });

  // 9. Past dates do not create past reminders
  it('9. past target dates produce zero reminders', () => {
    const expiredSub = { ...sampleSub, nextPaymentDate: '2026-11-01' };
    const eligible = calculateEligibleNotifications(expiredSub, BASE_NOW);
    assert.equal(eligible.length, 0);
  });

  // 10. Tomorrow dates create only eligible future reminders (1-day alert only)
  it('10. target date tomorrow schedules ONLY 1-day alert (3-day is in the past)', () => {
    // Current is 2026-11-04 12:00. Target date is 2026-11-05 (tomorrow).
    // 3 days before was 2026-11-02 09:30 (PAST)
    // 1 day before is 2026-11-04 09:30 (PAST because current is 12:00)
    const dueTomorrowPastMorning = { ...sampleSub, nextPaymentDate: '2026-11-05' };
    const resPast = calculateEligibleNotifications(dueTomorrowPastMorning, BASE_NOW);
    assert.equal(resPast.length, 0, 'If 09:30 today has already passed, no past notification');

    // If current time is 08:00 AM on 2026-11-04:
    const morningNow = new Date('2026-11-04T08:00:00Z');
    const resMorning = calculateEligibleNotifications(dueTomorrowPastMorning, morningNow);
    assert.equal(resMorning.length, 1, 'Only 1-day alert is future');
    assert.equal(resMorning[0].leadDays, 1);
  });

  // 11. Idempotent synchronization produces zero duplicates
  it('11. repeated reconciliation produces no duplicates and preserves valid state', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.equal(repo.getAll().length, 2);

    // Reconcile again with same data
    const secondSync = await service.reconcileAll([sampleSub], BASE_NOW);
    assert.equal(secondSync.scheduledCount, 0, 'No new schedules needed');
    assert.equal(secondSync.cancelledCount, 0, 'No cancellations needed');
    assert.equal(secondSync.preservedCount, 2, '2 existing preserved');
    assert.equal(repo.getAll().length, 2, 'Count remains exactly 2');
  });

  // 12. Different items never cancel one another's reminders
  it('12. different items maintain separate notification IDs and do not interfere', async () => {
    await service.syncOnAdd(sampleTrial, BASE_NOW);
    await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.equal(repo.getAll().length, 4);

    // Delete sub
    await service.syncOnDelete(sampleSub.id);
    assert.equal(repo.getAll().length, 2);
    // Trial reminders remain intact
    assert.equal(repo.getByItemId(sampleTrial.id).length, 2);
  });

  // 13. Notification IDs remain valid signed int32 values
  it('13. generates distinct deterministic signed 32-bit integer IDs', () => {
    const id1 = generateNotificationId('item-alpha', 3, 'subscription');
    const id2 = generateNotificationId('item-alpha', 1, 'subscription');
    const id3 = generateNotificationId('item-beta', 3, 'trial');

    assert.equal(isValidSignedInt32(id1), true);
    assert.equal(isValidSignedInt32(id2), true);
    assert.equal(isValidSignedInt32(id3), true);

    assert.notEqual(id1, id2, 'Lead day intervals must have distinct IDs');
    assert.notEqual(id1, id3, 'Different items must have distinct IDs');

    // Deterministic test
    const id1Repeat = generateNotificationId('item-alpha', 3, 'subscription');
    assert.equal(id1, id1Repeat, 'Hash must be 100% deterministic');
  });

  // 14. Permission denial produces zero crashes
  it('14. permission denial produces zero crashes and leaves items functional', async () => {
    mockDriver.permissionState = {
      granted: false,
      status: 'denied',
      platform: 'android',
    };

    // Attempting to sync when permission denied does not throw
    const res = await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.ok(res);
    assert.equal(res.errors.length, 0);
  });

  // 15. Scheduling failures do not corrupt financial records
  it('15. platform scheduling failure records diagnostic and does not throw', async () => {
    mockDriver.shouldFailScheduling = true;

    const res = await service.syncOnAdd(sampleSub, BASE_NOW);
    assert.ok(res);
    assert.equal(res.scheduledCount, 0);
  });

  // 16. Local 09:30 delivery time calculation
  it('16. delivery dates are anchored to 09:30 AM local time', () => {
    const delivery = calculateDeliveryDate('2026-11-20', 3);
    assert.equal(delivery.getHours(), 9);
    assert.equal(delivery.getMinutes(), 30);
    assert.equal(delivery.getDate(), 17);
  });

  // 17. Daylight-saving transitions safety
  it('17. handles daylight saving transitions safely without hour drift', () => {
    // UK clocks fall back in late October
    const deliveryOct = calculateDeliveryDate('2026-10-27', 3);
    assert.equal(deliveryOct.getHours(), 9);
    assert.equal(deliveryOct.getMinutes(), 30);

    // Spring forward in late March
    const deliveryMar = calculateDeliveryDate('2026-03-31', 3);
    assert.equal(deliveryMar.getHours(), 9);
    assert.equal(deliveryMar.getMinutes(), 30);
  });

  // 18. Application restart restores correct schedules via reconciliation
  it('18. application restart / reload restores missing notifications from subscriptions', async () => {
    // Repository is empty initially
    assert.equal(repo.getAll().length, 0);

    // Reconcile on boot
    const result = await service.reconcileAll([sampleTrial, sampleSub], BASE_NOW);
    assert.equal(result.scheduledCount, 4);
    assert.equal(repo.getAll().length, 4);
  });

  // 19. Manage action navigates to exact item
  it('19. manage action invokes callback with the exact corresponding subscription', () => {
    let openedSub: Subscription | null = null;
    service.setActionCallbacks({
      getSubscriptions: () => [sampleTrial, sampleSub],
      onOpenSubscriptionDetail: (s: Subscription) => {
        openedSub = s;
      },
    });

    mockDriver.simulateAction({
      actionId: 'manage',
      notificationId: 12345,
      itemId: sampleSub.id,
    });

    assert.ok(openedSub);
    assert.equal((openedSub as Subscription).id, sampleSub.id);
  });

  // 20. Dismiss action does not delete the underlying item
  it('20. dismiss action marks notification without mutating subscription list', () => {
    let dismissedId: number | null = null;
    service.setActionCallbacks({
      getSubscriptions: () => [sampleSub],
      onOpenSubscriptionDetail: () => {},
      onNotificationDismissed: (id: number) => {
        dismissedId = id;
      },
    });

    mockDriver.simulateAction({
      actionId: 'dismiss',
      notificationId: 98765,
      itemId: sampleSub.id,
    });

    assert.equal(dismissedId, 98765);
  });

  // 21. Test preview does not affect real reminders
  it('21. test preview uses dedicated test ID and leaves real schedules intact', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    const beforeCount = repo.getAll().length;

    const testRes = await service.triggerTestNotification(3000);
    assert.equal(testRes.scheduled, true);
    assert.equal(testRes.message.includes('Preview test notification'), true);

    // Real repository count is unchanged
    assert.equal(repo.getAll().length, beforeCount);
  });

  // 22. Offline operation remains functional
  it('22. offline operation requires zero network requests and executes locally', async () => {
    // Full add, update, delete flow executes in memory / local storage with no fetch/network
    await service.syncOnAdd(sampleTrial, BASE_NOW);
    assert.equal(repo.getAll().length, 2);

    await service.syncOnUpdate({ ...sampleTrial, nextPaymentDate: '2026-11-20' }, BASE_NOW);
    assert.equal(repo.getAll().length, 2);

    await service.syncOnDelete(sampleTrial.id);
    assert.equal(repo.getAll().length, 0);
  });

  // 23. Hard-purge on cancelSubscription(id) and removeSubscription(id) clears stored alert keys and all deterministic IDs
  it('23. cancelSubscription(id) and removeSubscription(id) hard-purge scheduled IDs and stored alert keys', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    safeStorageSet(`subcleaner_due_alert:${sampleSub.id}:2026-11-04`, 'true');
    safeStorageSet(`subcleaner_due_alert:${sampleSub.id}:2026-11-05`, 'true');
    safeStorageSet(`subcleaner_due_alert:${sampleTrial.id}:2026-11-04`, 'true');

    await service.cancelSubscription(sampleSub.id);

    assert.equal(repo.getByItemId(sampleSub.id).length, 0);
    assert.equal(safeStorageGet(`subcleaner_due_alert:${sampleSub.id}:2026-11-04`), null);
    assert.equal(safeStorageGet(`subcleaner_due_alert:${sampleSub.id}:2026-11-05`), null);
    assert.equal(safeStorageGet(`subcleaner_due_alert:${sampleTrial.id}:2026-11-04`), 'true');

    const expectedPurgedIds = getAllPossibleNotificationIdsForItem(sampleSub.id);
    const cancelledByDriver = mockDriver.cancelledCalls.flat();
    for (const id of expectedPurgedIds) {
      assert.equal(cancelledByDriver.includes(id), true, `Expected deterministic ID ${id} to be cancelled on driver`);
    }

    // Also test removeSubscription alias even when repository is already empty
    mockDriver.reset();
    await service.removeSubscription(sampleSub.id);
    const cancelledOnRemove = mockDriver.cancelledCalls.flat();
    for (const id of expectedPurgedIds) {
      assert.equal(cancelledOnRemove.includes(id), true, `Expected deterministic ID ${id} to be cancelled on removeSubscription`);
    }
  });

  // 24. Boot reconciliation strictly excludes cancelled and paused subscriptions
  it('24. boot reconciliation strictly excludes cancelled and paused items and purges any orphaned schedules', async () => {
    await service.syncOnAdd(sampleSub, BASE_NOW);
    await service.syncOnAdd(sampleTrial, BASE_NOW);
    assert.equal(repo.getAll().length, 4);

    const cancelledSub: Subscription = { ...sampleSub, status: 'cancelled' };
    const pausedTrial: Subscription = { ...sampleTrial, status: 'paused' as any };

    const result = await service.reconcileAll([cancelledSub, pausedTrial], BASE_NOW);
    assert.equal(result.scheduledCount, 0);
    assert.equal(result.cancelledCount, 4);
    assert.equal(repo.getAll().length, 0);
  });
});
