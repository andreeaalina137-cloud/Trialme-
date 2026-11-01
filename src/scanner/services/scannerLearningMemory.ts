import type { SubscriptionCategory, SubscriptionFrequency } from '../../types/subscription';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';

export const SCANNER_LEARNING_STORAGE_KEY = 'monetry_scanner_learning_v1';
const LEARNING_VERSION = 1;
const MAX_RECORDS = 500;

export type ScannerLearningDecision = 'confirmed' | 'dismissed';

export interface ScannerLearningRecord {
  id: string;
  merchantKey: string;
  merchantLabel: string;
  decision: ScannerLearningDecision;
  serviceName: string;
  presetId?: string;
  category: SubscriptionCategory;
  frequency: SubscriptionFrequency;
  amountGbp?: number;
  cancelUrl?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

interface ScannerLearningState {
  version: number;
  records: ScannerLearningRecord[];
  history?: ScannerLearningRecord[][];
}

const VALID_CATEGORIES = new Set<SubscriptionCategory>([
  'Streaming',
  'AI & Tech',
  'Music & Audio',
  'Fitness & Gym',
  'Productivity',
  'Gaming',
  'News & Magazines',
  'Food & Delivery',
  'Utilities',
  'Other',
]);
const VALID_FREQUENCIES = new Set<SubscriptionFrequency>([
  'monthly',
  'yearly',
  'weekly',
  'fortnightly',
  'quarterly',
  'half-yearly',
]);

export function normalizeLearningMerchant(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .slice(0, 120);
}

function emptyState(): ScannerLearningState {
  return { version: LEARNING_VERSION, records: [], history: [] };
}

function isRecord(value: unknown): value is ScannerLearningRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.merchantKey === 'string' &&
    typeof item.merchantLabel === 'string' &&
    (item.decision === 'confirmed' || item.decision === 'dismissed') &&
    typeof item.serviceName === 'string' &&
    VALID_CATEGORIES.has(item.category as SubscriptionCategory) &&
    VALID_FREQUENCIES.has(item.frequency as SubscriptionFrequency) &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  );
}

function readState(): ScannerLearningState {
  const raw = safeStorageGet(SCANNER_LEARNING_STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown; history?: unknown };
    if (parsed.version !== LEARNING_VERSION || !Array.isArray(parsed.records)) return emptyState();
    const history = Array.isArray(parsed.history)
      ? parsed.history
          .filter((snap): snap is unknown[] => Array.isArray(snap))
          .map((snap) => snap.filter(isRecord))
          .slice(-50)
      : [];
    return {
      version: LEARNING_VERSION,
      records: parsed.records.filter(isRecord).slice(-MAX_RECORDS),
      history,
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: ScannerLearningState): boolean {
  return safeStorageSet(
    SCANNER_LEARNING_STORAGE_KEY,
    JSON.stringify({
      version: LEARNING_VERSION,
      records: state.records.slice(-MAX_RECORDS),
      history: (state.history ?? []).slice(-50),
    }),
  );
}

function upsertRecord(record: Omit<ScannerLearningRecord, 'id' | 'merchantKey' | 'createdAt' | 'updatedAt'>): ScannerLearningRecord | null {
  const merchantKey = normalizeLearningMerchant(record.merchantLabel);
  if (!merchantKey || !record.serviceName.trim()) return null;
  const state = readState();
  const snapshot = state.records.map((item) => ({ ...item }));
  const existing = state.records.find((item) => item.merchantKey === merchantKey);
  const now = new Date().toISOString();
  const next: ScannerLearningRecord = {
    ...record,
    merchantKey,
    id: existing?.id ?? `learning-${merchantKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  state.history = [...(state.history ?? []), snapshot].slice(-50);
  state.records = existing
    ? state.records.map((item) => (item.merchantKey === merchantKey ? next : item))
    : [...state.records, next];
  return writeState(state) ? next : null;
}

export interface RecordScannerLearningInput {
  merchantLabel: string;
  serviceName: string;
  presetId?: string;
  category: SubscriptionCategory;
  frequency: SubscriptionFrequency;
  amountGbp?: number;
  cancelUrl?: string;
  color?: string;
}

export function recordConfirmedScannerLearning(input: RecordScannerLearningInput): ScannerLearningRecord | null {
  return upsertRecord({ ...input, decision: 'confirmed' });
}

export function recordDismissedScannerLearning(input: RecordScannerLearningInput): ScannerLearningRecord | null {
  return upsertRecord({ ...input, decision: 'dismissed' });
}

export function getScannerLearning(merchantLabel: string): ScannerLearningRecord | null {
  const key = normalizeLearningMerchant(merchantLabel);
  if (!key) return null;
  return readState().records.find((item) => item.merchantKey === key) ?? null;
}

/** Restores the previous snapshot from the history stack so an incorrect confirmation or dismissal can be undone. */
export function undoScannerLearning(merchantLabel: string): boolean {
  const key = normalizeLearningMerchant(merchantLabel);
  if (!key) return false;
  const state = readState();
  const currentHasKey = state.records.some((item) => item.merchantKey === key);
  const history = [...(state.history ?? [])];

  if (history.length > 0) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const snap = history[i];
      const currentRecord = state.records.find((item) => item.merchantKey === key);
      const snapRecord = snap.find((item) => item.merchantKey === key);
      const changed =
        Boolean(currentRecord) !== Boolean(snapRecord) ||
        currentRecord?.decision !== snapRecord?.decision ||
        currentRecord?.amountGbp !== snapRecord?.amountGbp ||
        currentRecord?.serviceName !== snapRecord?.serviceName;
      if (changed) {
        const nextRecords = snapRecord
          ? state.records.map((item) => (item.merchantKey === key ? snapRecord : item))
          : state.records.filter((item) => item.merchantKey !== key);
        const nextHistory = history.slice(0, i);
        return writeState({ ...state, records: nextRecords, history: nextHistory });
      }
    }
  }

  if (!currentHasKey) return false;
  const nextRecords = state.records.filter((item) => item.merchantKey !== key);
  return writeState({ ...state, records: nextRecords, history });
}

export function getScannerLearningRecords(): ScannerLearningRecord[] {
  return readState().records;
}

