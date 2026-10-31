import type { SubscriptionCategory } from '../../types/subscription';
import type { BankFormatDetection } from '../services/bankFormatDetector';

export type ScannerStage =
  | 'idle'
  | 'ingesting'
  | 'enhancing'
  | 'scanning'
  | 'cleaning'
  | 'matching'
  | 'results'
  | 'empty'
  | 'error';

export type ScannerSource = 'pdf' | 'csv' | 'image' | 'demo';

export type MatchTier = 1 | 2 | 3;

export type BillingCycle = 'Monthly' | 'Annual';

export type ScannerErrorCode =
  | 'unsupported'
  | 'ocr_unavailable'
  | 'empty_file'
  | 'parse_failed'
  | 'unknown';

export interface ScannedTransaction {
  rawLine: string;
  cleanedMerchant: string;
  amountGbp: number;
  dateIso: string | null;
  billingDay: number | null;
  isCredit: boolean;
  isHighValueTransfer: boolean;
}

export interface MatchedSubscription {
  id: string;
  presetId: string;
  serviceName: string;
  category: SubscriptionCategory;
  amountGbp: number;
  billingCycle: BillingCycle;
  billingDay: number | null;
  lastPaymentDate: string | null;
  nextBillingDate: string | null;
  daysUntilNextPayment: number | null;
  confidence: number;
  matchTier: MatchTier;
  isVerifiedRecurring: boolean;
  hasCancellationTrap: boolean;
  trapLabel: string | null;
  color: string;
  cancelUrl: string;
  selected: boolean;
}

export interface ScannerProgress {
  percent: number;
  label: string;
  stage: ScannerStage;
}

export interface ScannerResult {
  matches: MatchedSubscription[];
  processedLineCount: number;
  source: ScannerSource;
  durationMs: number;
  bankFormat?: BankFormatDetection;
}

export interface ScannerError {
  code: ScannerErrorCode;
  message: string;
}

export interface PdfExtractionResult {
  text: string;
  lines: string[];
  usedOcrFallback: boolean;
  engine: 'pdfjs' | 'native' | 'none';
}

export interface OcrExecutionResult {
  text: string;
  lines: string[];
  engine: 'tesseract' | 'unavailable';
}

export interface StatementPreset {
  id: string;
  name: string;
  category: SubscriptionCategory;
  monthly_price_gbp: number;
  notes: string;
  cancel_url: string;
  ocr_aliases?: string[];
}

export const DEMO_UK_STATEMENT_LINES = [
  'CARD PAYMENT TO NETFLIX.COM 10.99 GBR',
  'DIRECT DEBIT PUREGYM LTD £24.99',
  'POS ADOBE SYSTEMS 19.97',
  'APPLE.COM/BILL 09.99',
];

export const BARCLAYS_SAMPLE_LINES = [
  '01 OCT 2026 CARD PAYMENT TO NETFLIX.COM LONDON 10.99 GBR',
  '03 OCT 2026 DIRECT DEBIT TO SPOTIFYUK LONDON 11.99',
  '05 OCT 2026 DIRECT DEBIT PUREGYM LTD 19.99',
  '12 OCT 2026 SKY DIGITAL SUBSCRIPTION 34.00',
];

export const REVOLUT_SAMPLE_LINES = [
  '02 OCT 2026 THE GUARDIAN DIGITAL 12.00',
  '04 OCT 2026 AMZN MKTP UK PRIME VIDEO 8.99',
  '06 OCT 2026 OPENAI CHATGPT PLUS 19.99',
  '08 OCT 2026 CANVA PRO 12.99',
  '10 OCT 2026 ADOBE SYSTEMS 19.97',
];
