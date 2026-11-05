import type { OcrExecutionResult } from '../types/scanner.types';
import { buildOcrDocumentFromTesseract } from './ocrScannerBridge';

export type OcrProgressHandler = (percent: number, status: string) => void;

let cachedWorkerUrl: string | null = null;
let activeWorker: TesseractWorkerLike | null = null;
let workerIdleTimer: ReturnType<typeof setTimeout> | null = null;
let isWorkerBusy = false;

export async function terminateOcrWorker(): Promise<void> {
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
    workerIdleTimer = null;
  }
  if (activeWorker) {
    try {
      await activeWorker.terminate();
    } catch {
      // Worker already torn down
    }
    activeWorker = null;
  }
  isWorkerBusy = false;
}

async function getTesseractWorkerUrl(): Promise<string | undefined> {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  if (typeof window === 'undefined') return undefined;

  try {
    const mod = await import('tesseract.js/dist/worker.min.js?url');
    if (mod && typeof mod.default === 'string') {
      cachedWorkerUrl = mod.default;
      return cachedWorkerUrl;
    }
  } catch {}

  return undefined;
}

async function importOptional(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    const dynamicImport = new Function('s', 'return import(s)') as (
      s: string
    ) => Promise<Record<string, unknown>>;
    return await dynamicImport(specifier);
  } catch {
    return null;
  }
}

interface TesseractWorkerLike {
  recognize: (
    image: Blob | HTMLCanvasElement | OffscreenCanvas | Buffer | Uint8Array,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{
    data: any;
  }>;
  terminate: () => Promise<void>;
}

function splitOcrLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4);
}

export async function runOfflineOcr(
  image: Blob | HTMLCanvasElement | OffscreenCanvas | Buffer | Uint8Array,
  onProgress?: OcrProgressHandler
): Promise<OcrExecutionResult> {
  onProgress?.(8, 'Booting on-device OCR worker...');
  const mod = await importOptional('tesseract.js');
  const createWorker = mod?.createWorker as
    | ((
        lang: string,
        oem?: number,
        options?: { logger?: (message: { status?: string; progress?: number }) => void }
      ) => Promise<TesseractWorkerLike>)
    | undefined;

  if (typeof createWorker !== 'function') {
    onProgress?.(100, 'OCR engine not installed; using local fallback.');
    return { text: '', lines: [], engine: 'unavailable' };
  }

  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
    workerIdleTimer = null;
  }

  let worker: TesseractWorkerLike | null = null;
  try {
    if (activeWorker && !isWorkerBusy) {
      worker = activeWorker;
      onProgress?.(25, 'Reusing active on-device OCR worker...');
    } else {
      const workerPath = await getTesseractWorkerUrl();
      worker = await createWorker('eng', 1, {
        ...(workerPath ? { workerPath } : {}),
        logger: (message) => {
          const ratio = typeof message.progress === 'number' ? message.progress : 0;
          onProgress?.(Math.round(ratio * 100), message.status ?? 'recognizing text');
        },
      });
      activeWorker = worker;
    }

    isWorkerBusy = true;
    let input: any = image;
    if (typeof window === 'undefined' && typeof Blob !== 'undefined' && image instanceof Blob) {
      input = Buffer.from(await image.arrayBuffer());
    }
    const result = await worker.recognize(input, {}, { blocks: true });
    const ocrDoc = buildOcrDocumentFromTesseract(result.data, 1, 'tesseract');
    const fallbackLines = splitOcrLines(ocrDoc.rawText);
    const lines = ocrDoc.lines.length > 0 ? ocrDoc.lines : fallbackLines;
    return {
      text: ocrDoc.rawText,
      lines,
      engine: 'tesseract',
      confidence: ocrDoc.confidence,
      tokens: ocrDoc.tokens,
      structuredLines: ocrDoc.structuredLines,
      document: ocrDoc,
    };
  } catch (err) {
    onProgress?.(100, 'OCR engine fallback to realistic UK statement matcher.');
    return { text: '', lines: [], engine: 'unavailable' };
  } finally {
    isWorkerBusy = false;
    // Set 30s idle timer to free memory when scanning is finished
    if (typeof window !== 'undefined') {
      workerIdleTimer = setTimeout(() => {
        void terminateOcrWorker();
      }, 30000);
    } else if (worker && typeof window === 'undefined') {
      // In Node tests, terminate immediately to avoid hanging handles
      void terminateOcrWorker();
    }
  }
}
