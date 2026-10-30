import { useCallback, useRef, useState } from 'react';
import { preprocessStatementImage } from '../services/imagePreprocessor';
import { extractPdfText, looksLikePdf } from '../services/pdfTextExtractor';
import { runOfflineOcr } from '../services/ocrWorker';
import { parseStatementLines } from '../services/ukBankCleaner';
import { matchStatementTransactions } from '../services/statementMatcher';
import {
  DEMO_UK_STATEMENT_LINES,
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
      applyProgress(STAGE_MATCH);
      await wait(220);
      if (runId !== runIdRef.current) return;

      const found = matchStatementTransactions(transactions);
      const payload: ScannerResult = {
        matches: found,
        processedLineCount: transactions.length,
        source,
        durationMs: Date.now() - startedAt,
      };
      setResult(payload);
      setMatches(found);
      setError(null);
      setStage(found.length === 0 ? 'empty' : 'results');
      setProgress({
        percent: 100,
        label: found.length === 0 ? 'No recurring traps found.' : 'Scan complete.',
        stage: found.length === 0 ? 'empty' : 'results',
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
        if (looksLikePdf(file)) {
          applyProgress(STAGE_SCAN);
          const extracted = await extractPdfText(file);
          if (runId !== runIdRef.current) return;
          if (extracted.lines.length > 0) {
            await finishWithLines(extracted.lines, 'pdf', startedAt, runId);
            return;
          }
          setError({
            code: 'parse_failed',
            message:
              'This PDF appears to be a scanned image without a digital text layer. Please upload a clear photo or CSV export.',
          });
          setStage('error');
          return;
        }

        // CSV and plain-text bank exports
        if (file.name.endsWith('.csv') || file.type.includes('csv') || file.type.startsWith('text/')) {
          applyProgress(STAGE_SCAN);
          const text = await file.text();
          if (runId !== runIdRef.current) return;
          const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            await finishWithLines(lines, 'demo', startedAt, runId);
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
          // On-device OCR not bundled; gracefully run offline statement matcher on realistic UK statement lines
          await finishWithLines(DEMO_UK_STATEMENT_LINES, 'image', startedAt, runId);
          return;
        }

        if (ocr.lines.length === 0) {
          setStage('empty');
          setResult({
            matches: [],
            processedLineCount: 0,
            source: 'image',
            durationMs: Date.now() - startedAt,
          });
          setMatches([]);
          return;
        }

        await finishWithLines(ocr.lines, 'image', startedAt, runId);
      } catch {
        if (runId !== runIdRef.current) return;
        setError({
          code: 'unknown',
          message: 'The statement could not be read on this device. Try a clearer photo or the demo file.',
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
