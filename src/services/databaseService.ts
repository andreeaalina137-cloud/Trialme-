import type {
  MonetryDatabase,
  PresetService,
  AffiliateOffer,
  AlternativeService,
  PriceHikeAlert,
} from '../types/database';
import localFallbackDatabase from '../data/monetry_database.json';
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../utils/storage';

export const MONETRY_DB_CACHE_KEY = 'MONETRY_DB_CACHE';

export const REMOTE_DB_URL =
  (typeof process !== 'undefined' && process.env?.VITE_REMOTE_DB_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_REMOTE_DB_URL) ||
  '';

export function isPlaceholderUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  return (
    trimmed === '' ||
    trimmed.includes('username/subcleaner') ||
    trimmed.includes('example.com')
  );
}

type DatabaseListener = (db: MonetryDatabase) => void;
const listeners = new Set<DatabaseListener>();

export function subscribeToDatabaseUpdates(listener: DatabaseListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(db: MonetryDatabase): void {
  listeners.forEach((listener) => {
    try {
      listener(db);
    } catch (err) {
      console.error('[databaseService] Listener error:', err);
    }
  });
}

export function isValidMonetryDatabase(data: unknown): data is MonetryDatabase {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'string' || typeof d.last_updated !== 'string') return false;
  if (!Array.isArray(d.curated_uk_trials)) return false;
  if (!Array.isArray(d.presets) || d.presets.length === 0) return false;
  if (!Array.isArray(d.affiliate_offers)) return false;
  if (!Array.isArray(d.alternatives)) return false;
  if (!Array.isArray(d.uk_price_hike_alerts)) return false;

  const first = d.presets[0];
  if (
    !first ||
    typeof first !== 'object' ||
    typeof (first as any).id !== 'string' ||
    typeof (first as any).name !== 'string' ||
    typeof (first as any).monthly_price_gbp !== 'number'
  ) {
    return false;
  }

  return true;
}

let inMemoryActiveDatabase: MonetryDatabase | null = null;

export function getDatabase(): MonetryDatabase {
  if (inMemoryActiveDatabase) {
    return inMemoryActiveDatabase;
  }

  const rawCached = safeStorageGet(MONETRY_DB_CACHE_KEY);
  if (rawCached) {
    try {
      const parsed = JSON.parse(rawCached);
      if (isValidMonetryDatabase(parsed)) {
        inMemoryActiveDatabase = parsed;
        return parsed;
      }
    } catch {
      // Corrupt cache; fall through to bundled fallback
    }
  }

  inMemoryActiveDatabase = localFallbackDatabase as unknown as MonetryDatabase;
  return inMemoryActiveDatabase;
}

export function isNewerVersion(remote: MonetryDatabase, current: MonetryDatabase): boolean {
  if (remote.version !== current.version) {
    const rParts = remote.version.split('.').map(Number);
    const cParts = current.version.split('.').map(Number);
    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
  }
  return remote.last_updated > current.last_updated;
}

let syncPromise: Promise<MonetryDatabase> | null = null;

/**
 * Initializes and syncs database:
 * 1. Immediately returns cached or fallback data.
 * 2. Silently attempts remote background fetch with a 4s timeout.
 * 3. Updates cache and notifies listeners if newer version found.
 */
export async function syncDatabase(remoteUrl = REMOTE_DB_URL): Promise<MonetryDatabase> {
  const currentDb = getDatabase();

  // If no remote URL is configured or it's a placeholder, rely 100% on the bundled offline JSON database
  if (isPlaceholderUrl(remoteUrl)) {
    return currentDb;
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    try {
      if (typeof fetch === 'function') {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timeoutId: any;
        if (controller) {
          timeoutId = setTimeout(() => controller.abort(), 4000);
        }

        const response = await fetch(remoteUrl, {
          signal: controller?.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-cache',
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
          const remoteData = await response.json();
          if (isValidMonetryDatabase(remoteData) && isNewerVersion(remoteData, currentDb)) {
            safeStorageSet(MONETRY_DB_CACHE_KEY, JSON.stringify(remoteData));
            inMemoryActiveDatabase = remoteData;
            notifyListeners(remoteData);
            return remoteData;
          }
        }
      }
    } catch {
      // Offline / Airplane Mode / 4s timeout / Network unreachable — silent fallback
    } finally {
      syncPromise = null;
    }

    return currentDb;
  })();

  // Return immediately for non-blocking offline-first boot
  return currentDb;
}

export function saveDatabaseCache(db: MonetryDatabase): void {
  if (isValidMonetryDatabase(db)) {
    safeStorageSet(MONETRY_DB_CACHE_KEY, JSON.stringify(db));
    inMemoryActiveDatabase = db;
    notifyListeners(db);
  }
}

export function resetDatabaseCache(): void {
  safeStorageRemove(MONETRY_DB_CACHE_KEY);
  inMemoryActiveDatabase = localFallbackDatabase as unknown as MonetryDatabase;
  notifyListeners(inMemoryActiveDatabase);
}

export function getPresets(): PresetService[] {
  return getDatabase().presets;
}

export function getCuratedTrials(): PresetService[] {
  const db = getDatabase();
  const trialIdSet = new Set(db.curated_uk_trials);
  return db.presets.filter((p) => trialIdSet.has(p.id));
}

export function getAffiliateOffers(): AffiliateOffer[] {
  return getDatabase().affiliate_offers;
}

export function getAlternatives(): AlternativeService[] {
  return getDatabase().alternatives;
}

export function getPriceHikeAlerts(): PriceHikeAlert[] {
  return getDatabase().uk_price_hike_alerts;
}
