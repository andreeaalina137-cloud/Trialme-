import * as pdfjsLib from 'pdfjs-dist';
import type { PdfExtractionResult } from '../types/scanner.types';

let pdfWorkerUrl: string | null = null;

export async function initPdfWorker(): Promise<string | null> {
  if (pdfWorkerUrl) return pdfWorkerUrl;
  if (typeof window === 'undefined') return null;

  try {
    // Vite bundles the worker directly from the npm package via ?url
    const mod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (mod && typeof mod.default === 'string') {
      pdfWorkerUrl = mod.default;
      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      }
      return pdfWorkerUrl;
    }
  } catch {
    // Fallback if running outside Vite bundler
  }

  return pdfWorkerUrl;
}

if (typeof window !== 'undefined') {
  void initPdfWorker();
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

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_match, oct: string) =>
      String.fromCharCode(parseInt(oct, 8) & 255)
    );
}

function decodeHexPdfString(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  let result = '';
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substring(i, i + 2), 16);
    if (!isNaN(byte) && byte > 0) {
      result += String.fromCharCode(byte);
    }
  }
  return result;
}

const PDF_GBP_AMOUNT_PATTERN = /(?:£|GBP\s?)\d{1,4}(?:,\d{3})*(?:\.\d{2})|\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\s*(?:£|GBP)/i;

/**
 * PDF text layers can split one visual transaction over several extracted
 * rows. Coalesce rows until the first explicit GBP amount so downstream
 * parsing receives one logical transaction block.
 */
function coalescePdfLines(lines: string[]): string[] {
  const result: string[] = [];
  let pending: string[] = [];

  const isContinuation = (line: string): boolean =>
    /^(?:Către|Catre|To|From|De la|Card|Referință|Referinta|Cursul)\s*:?/i.test(line);

  const flush = () => {
    const joined = pending.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) result.push(joined);
    pending = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/[Â\xa0]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (isContinuation(line) && pending.length === 0 && result.length > 0) {
      result[result.length - 1] = `${result[result.length - 1]} ${line}`;
      continue;
    }
    pending.push(line);
    if (PDF_GBP_AMOUNT_PATTERN.test(line)) flush();
  }

  flush();
  return result;
}

async function decompressFlate(bytes: Uint8Array): Promise<string | null> {
  // Web Standard DecompressionStream
  for (const fmt of ['deflate', 'deflate-raw'] as const) {
    try {
      if (typeof DecompressionStream !== 'undefined') {
        const stream = new Response(bytes as any).body?.pipeThrough(new DecompressionStream(fmt));
        if (stream) {
          const buf = await new Response(stream).arrayBuffer();
          return new TextDecoder('latin1').decode(buf);
        }
      }
    } catch {}
  }
  // Node zlib fallback
  try {
    const zlib = (await importOptional('zlib')) as {
      inflateSync?: (b: Uint8Array) => Uint8Array;
      inflateRawSync?: (b: Uint8Array) => Uint8Array;
    } | null;
    if (zlib?.inflateSync) {
      const buf = zlib.inflateSync(bytes);
      return new TextDecoder('latin1').decode(buf);
    }
    if (zlib?.inflateRawSync) {
      const buf = zlib.inflateRawSync(bytes);
      return new TextDecoder('latin1').decode(buf);
    }
  } catch {}
  return null;
}

function parseStreamTokens(streamText: string): string[] {
  const lines: string[] = [];
  let currentTokens: string[] = [];

  const pushLine = () => {
    const joined = currentTokens
      .join(' ')
      .replace(/[Â\xa0]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (joined.length >= 3) {
      lines.push(joined);
    }
    currentTokens = [];
  };

  const regex =
    /(\((?:\\.|[^\\)])*\)\s*Tj)|(\[(?:[^\]]*)\]\s*TJ)|(<[0-9a-fA-F\s]+>\s*Tj)|(\((?:\\.|[^\\)])*\)\s*['"])|(T\*)|((?:-?\d+(?:\.\d+)?\s+)+T[dD])|(ET)/g;

  let match: RegExpExecArray | null = regex.exec(streamText);
  while (match) {
    const full = match[0];
    if (match[1]) {
      const inner = full.replace(/\s*Tj$/, '').slice(1, -1);
      currentTokens.push(decodePdfString(inner));
    } else if (match[2]) {
      const inner = full.replace(/\s*TJ$/, '').slice(1, -1);
      const parts = inner.match(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>/g) ?? [];
      const text = parts
        .map((p) => {
          if (p.startsWith('<')) return decodeHexPdfString(p.slice(1, -1));
          return decodePdfString(p.slice(1, -1));
        })
        .join('');
      if (text) currentTokens.push(text);
    } else if (match[3]) {
      const hex = full.replace(/\s*Tj$/, '').slice(1, -1);
      currentTokens.push(decodeHexPdfString(hex));
    } else if (match[4]) {
      pushLine();
    } else if (match[5]) {
      pushLine();
      const inner = full.slice(1, full.lastIndexOf(')'));
      currentTokens.push(decodePdfString(inner));
      pushLine();
    } else if (match[6]) {
      const nums = match[6].trim().split(/\s+/).slice(0, 2).map(Number);
      if (nums.length === 2 && Math.abs(nums[1]) > 0.001) {
        pushLine();
      }
    } else if (match[7]) {
      pushLine();
    }
    match = regex.exec(streamText);
  }
  pushLine();
  return lines;
}

async function extractNativePdfLines(buffer: ArrayBuffer): Promise<string[]> {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder('latin1').decode(bytes);
  const allLines: string[] = [];

  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null = streamRegex.exec(raw);

  while (match) {
    const streamStart = match.index + match[0].length;
    const endstreamPos = raw.indexOf('endstream', streamStart);
    if (endstreamPos === -1) break;

    const headerSlice = raw.slice(Math.max(0, match.index - 350), match.index);
    const isFlate = /\/Filter\s*(?:\[[^\]]*\/FlateDecode|\/FlateDecode)/i.test(headerSlice);

    let streamBytes = bytes.subarray(streamStart, endstreamPos);
    while (
      streamBytes.length > 0 &&
      (streamBytes[streamBytes.length - 1] === 10 || streamBytes[streamBytes.length - 1] === 13)
    ) {
      streamBytes = streamBytes.subarray(0, streamBytes.length - 1);
    }

    let streamContent = '';
    if (isFlate) {
      const decompressed = await decompressFlate(streamBytes);
      if (decompressed) streamContent = decompressed;
    } else {
      streamContent = new TextDecoder('latin1').decode(streamBytes);
    }

    if (streamContent) {
      const parsed = parseStreamTokens(streamContent);
      allLines.push(...parsed);
    }

    streamRegex.lastIndex = endstreamPos + 9;
    match = streamRegex.exec(raw);
  }

  // Fallback if no stream tokens found: parse raw text directly
  if (allLines.length === 0) {
    const directLines = parseStreamTokens(raw);
    allLines.push(...directLines);
  }

  return allLines;
}

async function extractWithPdfJs(buffer: ArrayBuffer): Promise<string[] | null> {
  // In Node.js / test environments where Worker or DOM is unavailable, allow native extractor to run
  if (typeof window === 'undefined') {
    return null;
  }

  await initPdfWorker();

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const allLines: string[] = [];

    try {
      for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Group text items by vertical position (Y coordinate) so statement columns stay on the same line
      let lastY: number | null = null;
      let currentLine: string[] = [];

      for (const rawItem of content.items) {
        if (!rawItem || typeof rawItem !== 'object' || !('str' in rawItem)) continue;
        const item = rawItem as { str: string; transform?: number[]; hasEOL?: boolean };
        const str = item.str;
        const transform = item.transform;
        const y = Array.isArray(transform) && typeof transform[5] === 'number' ? Math.round(transform[5]) : null;

        // A shift in vertical baseline signals a new line
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
          const joined = currentLine.join(' ').replace(/\s+/g, ' ').trim();
          if (joined.length >= 3) allLines.push(joined);
          currentLine = [];
        }

        if (str && str.trim().length > 0) {
          currentLine.push(str.trim());
        }

        if (item.hasEOL) {
          const joined = currentLine.join(' ').replace(/\s+/g, ' ').trim();
          if (joined.length >= 3) allLines.push(joined);
          currentLine = [];
          lastY = null;
        } else if (y !== null) {
          lastY = y;
        }
      }

      if (currentLine.length > 0) {
        const joined = currentLine.join(' ').replace(/\s+/g, ' ').trim();
        if (joined.length >= 3) allLines.push(joined);
      }
      }

      const logicalLines = coalescePdfLines(allLines);
      return logicalLines.length > 0 ? logicalLines : null;
    } finally {
      try {
        const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
        if (typeof destroy === 'function') await destroy.call(pdf);
      } catch {
        // Ignore cleanup failures; extraction result is still usable.
      }
    }
  } catch (err) {
    console.warn('[pdfTextExtractor] pdfjs-dist extraction fallback to native:', err);
    return null;
  }
}

export async function extractPdfText(file: File | Blob): Promise<PdfExtractionResult> {
  const buffer = await file.arrayBuffer();

  // 1. Try pdfjs-dist with npm-bundled worker (100% offline, zero-404)
  const pdfJsLines = await extractWithPdfJs(buffer);
  if (pdfJsLines && pdfJsLines.length > 0) {
    const text = pdfJsLines.join('\n');
    return { text, lines: pdfJsLines, usedOcrFallback: false, engine: 'pdfjs' };
  }

  // 2. Comprehensive native PDF stream extractor (decompresses Flate streams)
  const nativeLines = await extractNativePdfLines(buffer);
  if (nativeLines.length > 0) {
    const logicalLines = coalescePdfLines(nativeLines);
    const text = logicalLines.join('\n');
    return { text, lines: logicalLines, usedOcrFallback: false, engine: 'native' };
  }

  return { text: '', lines: [], usedOcrFallback: true, engine: 'none' };
}

/** Render image-only PDF pages locally so the scanner can reuse its OCR path. */
export async function renderPdfPagesForOcr(file: File | Blob): Promise<Blob[]> {
  if (typeof window === 'undefined') return [];
  await initPdfWorker();

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWorkerFetch: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pages: Blob[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) pages.push(blob);
      }
    } finally {
      const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
      if (typeof destroy === 'function') await destroy.call(pdf);
    }
    return pages;
  } catch {
    return [];
  }
}

export function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
