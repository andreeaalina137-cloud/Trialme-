import { useCallback, useRef, useState } from 'react';
import { preprocessStatementImage } from '../services/imagePreprocessor';
import { extractPdfText, looksLikePdf, renderPdfPagesForOcr } from '../services/pdfTextExtractor';
import { runOfflineOcr } from '../services/ocrWorker';
import { parseStatementLines } from '../services/ukBankCleaner';
import { matchStatementTransactions } from '../services/statementMatcher';
import { detectBankFormat } from '../services/bankFormatDetector';
import {
  type MatchedSubscription,
  type ScannerError,
  type ScannerProgress,
  type ScannerResult,
  type ScannerSource,
  type ScannerStage,
} from '../types/scanner.types';

const STAGE_ENHANCE: ScannerProgress = {
  percent: 15,
  label: 'Enhancing image clarity...',
  stage: 'enhancing',
};
const STAGE_SCAN: ScannerProgress = {
  percent: 45,
  label: 'Scanning UK statement locally (100% Offline)...',
  stage: 'scanning',
};
const STAGE_CLEAN: ScannerProgress = {
  percent: 75,
  label: 'Cleaning bank codes & Direct Debits...',
  stage: 'cleaning',
};
const STAGE_MATCH: ScannerProgress = {
  percent: 95,
  label: 'Matching against UK subscription database...',
  stage: 'matching',
};

const IDLE_PROGRESS: ScannerProgress = {
  percent: 0,
  label: 'Ready to scan on-device.',
  stage: 'idle',
};

const MAX_STATEMENT_FILE_BYTES = 25 * 1024 * 1024;

const NO_READABLE_TEXT_MESSAGE =
  'The statement did not contain readable transaction text. Try a clearer image or a digital PDF export.';
const NO_MATCHES_MESSAGE =
  'The statement was read, but no recognizable recurring UK subscriptions were found.';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name);
}

export function useStatementScanner() {
  const [stage, setStage] = useState<ScannerStage>('idle');
  const [progress, setProgress] = useState<ScannerProgress>(IDLE_PROGRESS);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [error, setError] = useState<ScannerError | null>(null);
  const [matches, setMatches] = useState<MatchedSubscription[]>([]);
  const runIdRef = useRef(0);

  const applyProgress = useCallback((next: ScannerProgress) => {
    setProgress(next);
    setStage(next.stage);
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setStage('idle');
    setProgress(IDLE_PROGRESS);
    setResult(null);
    setError(null);
    setMatches([]);
  }, []);

  const finishWithLines = useCallback(
    async (lines: string[], source: ScannerSource, startedAt: number, runId: number) => {
      applyProgress(STAGE_CLEAN);
      await wait(220);
      if (runId !== runIdRef.current) return;

      const transactions = parseStatementLines(lines);
      if (transactions.length === 0) {
        setError({
          code: 'parse_failed',
          message: NO_READABLE_TEXT_MESSAGE,
        });
        setStage('error');
        setProgress({ percent: 100, label: 'Statement text could not be interpreted.', stage: 'error' });
        return;
      }

      applyProgress(STAGE_MATCH);
      await wait(220);
      if (runId !== runIdRef.current) return;

      const found = matchStatementTransactions(transactions);
      const payload: ScannerResult = {
        matches: found,
        processedLineCount: transactions.length,
        source,
        durationMs: Date.now() - startedAt,
        bankFormat: detectBankFormat(lines),
      };
      setResult(payload);
      setMatches(found);
      if (found.length === 0) {
        setError({
          code: 'parse_failed',
          message: NO_MATCHES_MESSAGE,
        });
        setStage('error');
      } else {
        setError(null);
        setStage('results');
      }
      setProgress({
        percent: 100,
        label: found.length === 0 ? 'No recognizable recurring subscriptions found.' : 'Scan complete.',
        stage: found.length === 0 ? 'error' : 'results',
      });
    },
    [applyProgress]
  );

  const scanRawLines = useCallback(
    async (lines: string[], source: ScannerSource = 'demo') => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const startedAt = Date.now();
      setError(null);
      setResult(null);
      setMatches([]);
      setStage('ingesting');
      applyProgress(STAGE_ENHANCE);
      await wait(260);
      if (runId !== runIdRef.current) return;
      applyProgress(STAGE_SCAN);
      await wait(320);
      if (runId !== runIdRef.current) return;
      await finishWithLines(lines, source, startedAt, runId);
    },
    [applyProgress, finishWithLines]
  );

  const scanFile = useCallback(
    async (file: File) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const startedAt = Date.now();
      setError(null);
      setResult(null);
      setMatches([]);
      setStage('ingesting');

      try {
        if (file.size === 0) {
          setError({ code: 'empty_file', message: 'The selected statement file is empty.' });
          setStage('error');
          return;
        }
        if (file.size > MAX_STATEMENT_FILE_BYTES) {
          setError({
            code: 'unsupported',
            message: 'This statement is larger than 25 MB. Please export a smaller statement period.',
          });
          setStage('error');
          return;
        }

        if (looksLikePdf(file)) {
          applyProgress(STAGE_SCAN);
          const extracted = await extractPdfText(file);
          if (runId !== runIdRef.current) return;
          if (extracted.lines.length > 0) {
            await finishWithLines(extracted.lines, 'pdf', startedAt, runId);
            return;
          }
          const renderedPages = await renderPdfPagesForOcr(file);
          const ocrLines: string[] = [];
          for (const page of renderedPages) {
            const preprocessed = await preprocessStatementImage(page);
            const ocr = await runOfflineOcr(preprocessed.blob);
            if (ocr.engine === 'tesseract') ocrLines.push(...ocr.lines);
          }
          if (ocrLines.length > 0) {
            await finishWithLines(ocrLines, 'pdf', startedAt, runId);
            return;
          }
          setError({
            code: 'ocr_unavailable',
            message: 'This PDF has no readable text layer and local OCR could not read it. Please upload a digital PDF export or a clearer image.',
          });
          setStage('error');
          setProgress({ percent: 100, label: 'PDF text layer and local OCR were unavailable.', stage: 'error' });
          return;
        }

        // CSV and plain-text bank exports
        if (file.name.endsWith('.csv') || file.type.includes('csv') || file.type.startsWith('text/')) {
          applyProgress(STAGE_SCAN);
          const text = await file.text();
          if (runId !== runIdRef.current) return;
          const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            await finishWithLines(lines, 'csv', startedAt, runId);
            return;
          }
        }

        if (!looksLikeImage(file)) {
          setError({
            code: 'unsupported',
            message: 'Please upload a UK bank screenshot, photo, or PDF.',
          });
          setStage('error');
          return;
        }

        applyProgress(STAGE_ENHANCE);
        const preprocessed = await preprocessStatementImage(file);
        if (runId !== runIdRef.current) return;

        applyProgress(STAGE_SCAN);
        const ocr = await runOfflineOcr(preprocessed.blob);
        if (runId !== runIdRef.current) return;

        if (ocr.engine === 'unavailable') {
          setError({
            code: 'ocr_unavailable',
            message: 'On-device OCR is unavailable. Please upload a digital PDF, CSV export, or try another image.',
          });
          setStage('error');
          setProgress({ percent: 100, label: 'On-device OCR is unavailable.', stage: 'error' });
          return;
        }

        if (ocr.lines.length === 0) {
          setError({ code: 'parse_failed', message: NO_READABLE_TEXT_MESSAGE });
          setStage('error');
          setProgress({ percent: 100, label: 'Statement text could not be read.', stage: 'error' });
          return;
        }

        await finishWithLines(ocr.lines, 'image', startedAt, runId);
      } catch (cause) {
        if (runId !== runIdRef.current) return;
        const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : '';
        setError({
          code: 'unknown',
          message: `The statement could not be read on this device.${detail} Try a clearer photo or the demo file.`,
        });
        setStage('error');
      }
    },
    [applyProgress, finishWithLines]
  );

  const toggleSelect = useCallback((id: string) => {
    setMatches((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  }, []);

  const updateAmount = useCallback((id: string, amountGbp: number) => {
    if (!Number.isFinite(amountGbp) || amountGbp < 0) return;
    setMatches((current) =>
      current.map((item) => (item.id === id ? { ...item, amountGbp } : item))
    );
  }, []);

  const selectedMatches = matches.filter((item) => item.selected);
  const selectedMonthlyTotal = selectedMatches.reduce((sum, item) => {
    const monthly = item.billingCycle === 'Annual' ? item.amountGbp / 12 : item.amountGbp;
    return sum + monthly;
  }, 0);

  return {
    stage,
    progress,
    result,
    error,
    matches,
    selectedMatches,
    selectedMonthlyTotal,
    scanFile,
    scanRawLines,
    reset,
    toggleSelect,
    updateAmount,
  };
}
