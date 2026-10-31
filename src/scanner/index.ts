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
export { parseStatementLines, cleanMerchantName, extractGbpAmount, extractUkDate } from './services/ukBankCleaner';
export { matchStatementTransactions } from './services/statementMatcher';
export { normalizeStatementLine, normalizeStatementLines, repairCommonMerchantSpacing } from './services/statementNormalizer';
export { detectBankFormat } from './services/bankFormatDetector';
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
  ScannerProgress,
  ScannerResult,
  ScannerSource,
  ScannerStage,
  StatementPreset,
} from './types/scanner.types';
