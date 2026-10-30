import type { OcrExecutionResult } from '../types/scanner.types';

export type OcrProgressHandler = (percent: number, status: string) => void;

let cachedWorkerUrl: string | null = null;

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
  recognize: (image: Blob | HTMLCanvasElement | OffscreenCanvas) => Promise<{
    data: { text: string };
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
  image: Blob | HTMLCanvasElement | OffscreenCanvas,
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

  let worker: TesseractWorkerLike | null = null;
  try {
    const workerPath = await getTesseractWorkerUrl();
    worker = await createWorker('eng', 1, {
      ...(workerPath ? { workerPath } : {}),
      logger: (message) => {
        const ratio = typeof message.progress === 'number' ? message.progress : 0;
        onProgress?.(Math.round(ratio * 100), message.status ?? 'recognizing text');
      },
    });
    const result = await worker.recognize(image);
    const text = result.data.text ?? '';
    return { text, lines: splitOcrLines(text), engine: 'tesseract' };
  } catch (err) {
    onProgress?.(100, 'OCR engine fallback to realistic UK statement matcher.');
    return { text: '', lines: [], engine: 'unavailable' };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Worker already torn down.
      }
    }
  }
}
