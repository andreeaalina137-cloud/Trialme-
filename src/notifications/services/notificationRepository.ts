import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import type { ScheduledNotificationRecord } from '../types/notification.types';

export const NOTIFICATION_STORAGE_KEY = 'monetry_scheduled_notifications_v1';

export class NotificationRepository {
  private inMemoryCache: ScheduledNotificationRecord[] | null = null;

  /**
   * Retrieves all persisted scheduled notifications.
   */
  public getAll(): ScheduledNotificationRecord[] {
    if (this.inMemoryCache) {
      return [...this.inMemoryCache];
    }

    const raw = safeStorageGet(NOTIFICATION_STORAGE_KEY);
    if (!raw) {
      this.inMemoryCache = [];
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.inMemoryCache = parsed.filter(this.isValidRecord);
        return [...this.inMemoryCache];
      }
    } catch {
      // Corrupt payload; initialize empty
    }

    this.inMemoryCache = [];
    return [];
  }

  /**
   * Finds record by notification ID.
   */
  public getById(id: number): ScheduledNotificationRecord | undefined {
    return this.getAll().find((r) => r.id === id);
  }

  /**
   * Retrieves all scheduled notifications associated with a subscription or trial ID.
   */
  public getByItemId(itemId: string): ScheduledNotificationRecord[] {
    if (!itemId) return [];
    return this.getAll().filter((r) => r.itemId === itemId);
  }

  /**
   * Persists or updates a scheduled notification record.
   */
  public save(record: ScheduledNotificationRecord): void {
    const list = this.getAll();
    const index = list.findIndex((r) => r.id === record.id);
    if (index >= 0) {
      list[index] = { ...record, updatedAt: new Date().toISOString() };
    } else {
      list.push(record);
    }
    this.persist(list);
  }

  /**
   * Persists a batch of records.
   */
  public saveBatch(records: ScheduledNotificationRecord[]): void {
    if (records.length === 0) return;
    const list = this.getAll();
    for (const record of records) {
      const index = list.findIndex((r) => r.id === record.id);
      if (index >= 0) {
        list[index] = { ...record, updatedAt: new Date().toISOString() };
      } else {
        list.push(record);
      }
    }
    this.persist(list);
  }

  /**
   * Removes a notification record by ID.
   */
  public remove(id: number): void {
    const list = this.getAll().filter((r) => r.id !== id);
    this.persist(list);
  }

  /**
   * Removes all notification records associated with a subscription/trial item.
   */
  public removeByItemId(itemId: string): number[] {
    const current = this.getAll();
    const removedIds: number[] = [];
    const remaining: ScheduledNotificationRecord[] = [];

    for (const record of current) {
      if (record.itemId === itemId) {
        removedIds.push(record.id);
      } else {
        remaining.push(record);
      }
    }

    if (removedIds.length > 0) {
      this.persist(remaining);
    }
    return removedIds;
  }

  /**
   * Clears all notification metadata.
   */
  public clear(): void {
    this.persist([]);
  }

  private persist(records: ScheduledNotificationRecord[]): void {
    this.inMemoryCache = records;
    safeStorageSet(NOTIFICATION_STORAGE_KEY, JSON.stringify(records));
  }

  private isValidRecord(candidate: any): candidate is ScheduledNotificationRecord {
    return (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.id === 'number' &&
      typeof candidate.itemId === 'string' &&
      typeof candidate.scheduledFor === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.body === 'string'
    );
  }
}

export const notificationRepository = new NotificationRepository();
