export {
  ScannerScreen,
  DEMO_UK_STATEMENT_LINES,
  BARCLAYS_SAMPLE_LINES,
  REVOLUT_SAMPLE_LINES,
} from './components/ScannerScreen';
export { UploadDropzone } from './components/UploadDropzone';
export { ScanningRadar } from './components/ScanningRadar';
export { DetectedSubCard } from './components/DetectedSubCard';
export { BatchActionFooter } from './components/BatchActionFooter';
export { useStatementScanner } from './hooks/useStatementScanner';
export { preprocessStatementImage } from './services/imagePreprocessor';
export { extractPdfText, looksLikePdf, renderPdfPagesForOcr } from './services/pdfTextExtractor';
export { runOfflineOcr } from './services/ocrWorker';
export {
  parseStatementLines,
  parseStatementAuditLedger,
  cleanMerchantName,
  extractGbpAmount,
  extractUkDate,
  checkImpossibleDate,
  classifyUKPaymentType,
} from './services/ukBankCleaner';
export {
  matchStatementTransactions,
  evaluateSubscriptionRecurrenceAndEvidence,
} from './services/statementMatcher';
export {
  normalizeStatementLine,
  normalizeStatementLines,
  repairCommonMerchantSpacing,
  extractCanonicalMerchantKey,
  areMerchantsFuzzyMatch,
  computeLevenshteinDistance,
} from './services/statementNormalizer';
export {
  getScannerLearning,
  getScannerLearningRecords,
  normalizeLearningMerchant,
  recordConfirmedScannerLearning,
  recordDismissedScannerLearning,
  undoScannerLearning,
} from './services/scannerLearningMemory';
export { detectBankFormat } from './services/bankFormatDetector';
export { buildScannerSubscriptionDraft } from './services/scannerSubscriptionDraft';
export {
  FLAG_SUMMARY_ROW,
  FLAG_INVALID_DATE,
  FLAG_DUPLICATE,
  FLAG_FX_CONVERSION,
  FLAG_REVOLUT_NOISE,
  FLAG_VALID_BANK_SUB,
  FLAG_TRANSFER_OR_CASH,
  FLAG_RENT_OR_FIXED_TRANSFER,
  FLAG_REFUNDED_PAIR,
  FLAG_PRICE_HIKE,
  FLAG_TRIAL_CONVERTED,
} from './types/scanner.types';
export type { BankFormatDetection, SupportedBankFormat } from './services/bankFormatDetector';
export type {
  BillingCycle,
  MatchedSubscription,
  MatchTier,
  OcrExecutionResult,
  PdfExtractionResult,
  ScannedTransaction,
  ScannerError,
  ScannerErrorCode,
  ScannerGateScores,
  ScannerProgress,
  ScannerReasonCode,
  ScannerResult,
  ScannerSource,
  ScannerStage,
  StatementPreset,
  StatementTableState,
  SubscriptionEvidence,
  PriceAlert,
  ConfirmingTransaction,
  UKPaymentType,
  TransactionStatus,
} from './types/scanner.types';
