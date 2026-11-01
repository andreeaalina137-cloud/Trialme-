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

export type StatementTableState = 'IN_TABLE' | 'OUT_OF_TABLE';

export type UKPaymentType =
  | 'DIRECT_DEBIT'
  | 'RECURRING_CARD_CPA'
  | 'STANDING_ORDER'
  | 'P2P_TRANSFER'
  | 'ATM_CASH'
  | 'OTHER';

export type TransactionStatus = 'ACCEPTED' | 'QUARANTINED';

export const FLAG_SUMMARY_ROW = 'FLAG_SUMMARY_ROW';
export const FLAG_INVALID_DATE = 'FLAG_INVALID_DATE';
export const FLAG_DUPLICATE = 'FLAG_DUPLICATE';
export const FLAG_FX_CONVERSION = 'FLAG_FX_CONVERSION';
export const FLAG_REVOLUT_NOISE = 'FLAG_REVOLUT_NOISE';
export const FLAG_VALID_BANK_SUB = 'FLAG_VALID_BANK_SUB';
export const FLAG_TRANSFER_OR_CASH = 'FLAG_TRANSFER_OR_CASH';
export const FLAG_RENT_OR_FIXED_TRANSFER = 'FLAG_RENT_OR_FIXED_TRANSFER';
export const FLAG_REFUNDED_PAIR = 'FLAG_REFUNDED_PAIR';
export const FLAG_PRICE_HIKE = 'FLAG_PRICE_HIKE';
export const FLAG_TRIAL_CONVERTED = 'FLAG_TRIAL_CONVERTED';

export interface PriceAlert {
  previousAmount: number;
  newAmount: number;
  difference: number;
  percentage: number;
  formattedDifference: string;
}

export interface ConfirmingTransaction {
  date: string | null;
  amount: number;
  rawDescription: string;
}

export interface SubscriptionEvidence {
  confidenceScore: number;
  subscriptionType: 'Direct Debit' | 'Recurring Card (CPA)' | 'Standing Order';
  whyDetected: string[];
  confirmingTransactions: ConfirmingTransaction[];
  priceAlert?: PriceAlert | null;
  auditFlag?: string | null;
}

export type ScannerReasonCode =
  | 'VALID_DEBIT'
  | 'BALANCE_REJECTED'
  | 'INFO_BLOCK_REJECTED'
  | 'ALIAS_MATCH'
  | 'OCR_ALIAS'
  | 'DD_MARKER'
  | 'INTERVAL_CONFIRMED'
  | 'RETURNED_PAYMENT_REJECTED'
  | 'BRAND_ONLY_REJECTED'
  | 'INSUFFICIENT_EVIDENCE';

export interface ScannerGateScores {
  validity: 0 | 1 | 2 | 3;
  identity: 0 | 1 | 2 | 3;
  recurrence: 0 | 1 | 2 | 3;
}

export interface ScannedTransaction {
  rawLine: string;
  cleanedMerchant: string;
  amountGbp: number;
  dateIso: string | null;
  billingDay: number | null;
  isCredit: boolean;
  isHighValueTransfer: boolean;
  tableState?: StatementTableState;
  validityScore?: 0 | 1 | 2 | 3;
  hasStrongRecurringMarker?: boolean;
  isReversalOrFailed?: boolean;
  referenceToken?: string | null;
  reasonCodes?: ScannerReasonCode[];
  rawDescription?: string;
  rawAmount?: string | number;
  rawDate?: string;
  signedAmount?: number;
  status?: TransactionStatus;
  auditFlag?: string;
  reason?: string;
  paymentType?: UKPaymentType;
  canonicalMerchant?: string;
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
  requiresReview?: boolean;
  gateScores?: ScannerGateScores;
  reasonCodes?: ScannerReasonCode[];
  evidence?: SubscriptionEvidence;
  confidenceScore?: number;
  auditFlag?: string;
  subscriptionType?: 'Direct Debit' | 'Recurring Card (CPA)' | 'Standing Order';
  priceAlert?: PriceAlert | string;
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
  pageCount?: number;
  error?: string;
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
