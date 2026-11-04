import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import type {
  INotificationDriver,
  NotificationPermissionState,
} from '../types/notification.types';

export const NOTIFICATIONS_ENABLED_KEY = 'monetry_notifications_enabled';
export const NOTIFICATIONS_PERM_PROMPTED_KEY = 'monetry_notifications_has_prompted';
export const NOTIFICATIONS_LAST_DIAGNOSTIC_KEY = 'monetry_notifications_diagnostic';

export class NotificationPermissionManager {
  private driver: INotificationDriver;

  constructor(driver: INotificationDriver) {
    this.driver = driver;
  }

  /**
   * Returns user preference for notifications (default: true).
   */
  public isEnabled(): boolean {
    const val = safeStorageGet(NOTIFICATIONS_ENABLED_KEY);
    return val === null ? true : val === 'true';
  }

  /**
   * Sets user preference for notifications.
   */
  public setEnabled(enabled: boolean): void {
    safeStorageSet(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
  }

  /**
   * Checks current permission state without triggering a prompt.
   */
  public async getPermissionState(): Promise<NotificationPermissionState> {
    try {
      return await this.driver.checkPermission();
    } catch (err) {
      this.recordDiagnostic('checkPermission failed', err);
      return {
        granted: false,
        status: 'unavailable',
        platform: this.driver.getPlatform(),
      };
    }
  }

  /**
   * Requests permission explicitly from the user.
   * Only called on explicit user action (e.g. toggle in settings or first armed item).
   */
  public async requestPermission(): Promise<boolean> {
    try {
      safeStorageSet(NOTIFICATIONS_PERM_PROMPTED_KEY, 'true');
      const res = await this.driver.requestPermission();
      if (res.granted) {
        this.setEnabled(true);
        return true;
      }
      return false;
    } catch (err) {
      this.recordDiagnostic('requestPermission failed', err);
      return false;
    }
  }

  /**
   * Records a safe local diagnostic without leaking private user data.
   */
  public recordDiagnostic(message: string, error?: unknown): void {
    const errText = error instanceof Error ? error.message : String(error || '');
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      error: errText.slice(0, 150),
    };
    try {
      safeStorageSet(NOTIFICATIONS_LAST_DIAGNOSTIC_KEY, JSON.stringify(entry));
    } catch {
      // safe fallback
    }
  }
}
