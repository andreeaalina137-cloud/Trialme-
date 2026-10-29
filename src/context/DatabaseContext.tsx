import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type {
  MonetryDatabase,
  PresetService,
  AffiliateOffer,
  AlternativeService,
  PriceHikeAlert,
} from '../types/database';
import {
  getDatabase,
  syncDatabase,
  subscribeToDatabaseUpdates,
} from '../services/databaseService';

export interface DatabaseContextValue {
  database: MonetryDatabase;
  presets: PresetService[];
  curatedTrials: PresetService[];
  affiliateOffers: AffiliateOffer[];
  alternatives: AlternativeService[];
  priceHikeAlerts: PriceHikeAlert[];
  version: string;
  lastUpdated: string;
  isSyncing: boolean;
  refreshDatabase: () => Promise<void>;
  findPresetByNameOrAlias: (name: string) => PresetService | undefined;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [database, setDatabase] = useState<MonetryDatabase>(() => getDatabase());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Subscribe to background updates from the sync service
    const unsubscribe = subscribeToDatabaseUpdates((updatedDb) => {
      setDatabase(updatedDb);
    });

    // Trigger initial silent background sync on mount (non-blocking)
    setIsSyncing(true);
    void syncDatabase().finally(() => {
      setIsSyncing(false);
    });

    return unsubscribe;
  }, []);

  const refreshDatabase = async () => {
    setIsSyncing(true);
    try {
      const updated = await syncDatabase();
      setDatabase(updated);
    } finally {
      setIsSyncing(false);
    }
  };

  const curatedTrials = useMemo(() => {
    const trialIdSet = new Set(database.curated_uk_trials);
    return database.presets.filter((p) => trialIdSet.has(p.id));
  }, [database]);

  const findPresetByNameOrAlias = useMemo(() => {
    return (name: string): PresetService | undefined => {
      if (!name) return undefined;
      const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return database.presets.find((p) => {
        const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        return norm.includes(pNorm) || pNorm.includes(norm);
      });
    };
  }, [database]);

  const value: DatabaseContextValue = {
    database,
    presets: database.presets,
    curatedTrials,
    affiliateOffers: database.affiliate_offers,
    alternatives: database.alternatives,
    priceHikeAlerts: database.uk_price_hike_alerts,
    version: database.version,
    lastUpdated: database.last_updated,
    isSyncing,
    refreshDatabase,
    findPresetByNameOrAlias,
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};

/**
 * Universal hook to access Monetry Database (presets, curated trials, alternatives, alerts).
 * Falls back to local synchronous database if used outside provider.
 */
export function useMonetryData(): DatabaseContextValue {
  const context = useContext(DatabaseContext);
  if (!context) {
    const db = getDatabase();
    const trialIdSet = new Set(db.curated_uk_trials);
    return {
      database: db,
      presets: db.presets,
      curatedTrials: db.presets.filter((p) => trialIdSet.has(p.id)),
      affiliateOffers: db.affiliate_offers,
      alternatives: db.alternatives,
      priceHikeAlerts: db.uk_price_hike_alerts,
      version: db.version,
      lastUpdated: db.last_updated,
      isSyncing: false,
      refreshDatabase: async () => {},
      findPresetByNameOrAlias: (name: string) => {
        const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        return db.presets.find((p) => {
          const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          return norm.includes(pNorm) || pNorm.includes(norm);
        });
      },
    };
  }
  return context;
}

export const useDatabase = useMonetryData;
