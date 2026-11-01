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
const PDF_LEADING_DATE_PATTERN =
  /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?)\b/i;
const PDF_BOUNDARY_OR_BALANCE_PATTERN =
  /\b(?:OPENING\s+BALANCE|CLOSING\s+BALANCE|ENDING\s+BALANCE|BALANCE\s+BROUGHT\s+FORWARD|BALANCE\s+CARRIED\s+FORWARD|BROUGHT\s+FORWARD|BALANCE\s+ON\s+\d|PAYPAL\s+(?:SAVINGS\s+)?BALANCE|TOTAL\s+DEBITS|TOTAL\s+CREDITS|TERMS\s+AND\s+CONDITIONS|IMPORTANT\s+(?:INFORMATION|NOTICE)|FOR\s+MONTHLY\s+CHARGING\s+PERIODS|MONTHLY\s+CHARGING\s+INFORMATION|STARLING\s+BANK\s+(?:LIMITED\s+)?IS\s+(?:REGISTERED|A\s+MEMBER)|METRO\s+BANK\s+PLC\s+IS\s+REGISTERED|FINANCIAL\s+SERVICES\s+COMPENSATION\s+SCHEME|24HR\s+CUSTOMER\s+SERVICE|INTEREST\s+WILL\s+BE\s+PAYABLE\s+TO\s+YOU|PAGE\s+\d+\s+OF\s+\d+|DATE\s+DESCRIPTION\s+MONEY\s+OUT|DATE\s+DESCRIPTION\s+TYPE)\b/i;

interface PositionedPdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  order: number;
}

const HALIFAX_SCREEN_READER_NOISE = /^(?:Column|\.|blank\.)$/i;
const HALIFAX_ROW_LABEL_LINE =
  /^Date\s+Description\s+Type\s+(?:Money\s+In\s*\(£\)\s+)?(?:Money\s+Out\s*\(£\)\s+)?Balance\s*\(£\)$/i;
const NATWEST_UNDATED_TX_START_PATTERN =
  /^(?:Card\s+Transaction|OnLine\s+Transaction|Automated\s+Credit|Standing\s+Order|Direct\s+Debit|Charges|(?:DR|BP|DD|SO|VIS)\s+[A-Z])\b/i;
const DECIMAL_AMOUNT_ANYWHERE_PATTERN =
  /(?:£|GBP\s*)?-?\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\b/i;
const REVOLUT_SUBLINE_CONTINUATION_PATTERN =
  /^(?:Către|Catre|To|From|De la|Card|Referință|Referinta|Cursul|Exchange\s+rate|01\s+Card)\s*:?|\bCard:\s*\d{4,6}\*{3,}\d{0,4}|^\d{4,6}\*{3,}\d{4}\b/i;

function extractPageLinesFromItems(rawItems: unknown[]): string[] {
  const items: PositionedPdfItem[] = [];
  let order = 0;
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object' || !('str' in rawItem)) continue;
    const item = rawItem as { str: string; transform?: number[]; width?: number };
    const trimmed = (item.str ?? '').replace(/[Â\xa0]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    if (HALIFAX_SCREEN_READER_NOISE.test(trimmed)) continue;
    const x = Array.isArray(item.transform) && typeof item.transform[4] === 'number' ? item.transform[4] : 0;
    const y = Array.isArray(item.transform) && typeof item.transform[5] === 'number' ? item.transform[5] : 0;
    const width = typeof item.width === 'number' && item.width > 0 ? item.width : trimmed.length * 4.5;
    items.push({ str: trimmed, x, y, width, order: order++ });
  }

  const sortedByY = [...items].sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order);
  const yLines: { y: number; items: PositionedPdfItem[] }[] = [];

  for (const item of sortedByY) {
    let targetLine: { y: number; items: PositionedPdfItem[] } | null = null;
    for (const line of yLines) {
      if (Math.abs(line.y - item.y) <= 3.5) {
        targetLine = line;
        break;
      }
    }
    if (!targetLine) {
      targetLine = { y: item.y, items: [] };
      yLines.push(targetLine);
    }
    targetLine.items.push(item);
  }

  if (yLines.length === 1 && items.length > 3) {
    return [];
  }

  const structuredLines: { y: number; text: string; items: PositionedPdfItem[] }[] = [];
  for (const line of yLines) {
    line.items.sort((a, b) => a.x - b.x || a.order - b.order);
    const deduped: PositionedPdfItem[] = [];
    for (const curr of line.items) {
      if (deduped.length > 0) {
        const prev = deduped[deduped.length - 1];
        const prevEnd = prev.x + prev.width;
        const overlap = Math.min(prevEnd, curr.x + curr.width) - Math.max(prev.x, curr.x);
        const sameColumnStart = Math.abs(curr.x - prev.x) <= 18;
        const sameNumericCol =
          sameColumnStart &&
          Math.abs(curr.order - prev.order) > 15 &&
          /^[+-]?£?\d/.test(prev.str) &&
          /^[+-]?£?\d/.test(curr.str);
        if ((sameColumnStart && overlap > 2 && Math.abs(curr.order - prev.order) > 15) || sameNumericCol) {
          if (curr.order > prev.order) {
            deduped[deduped.length - 1] = curr;
          }
          continue;
        }
      }
      deduped.push(curr);
    }

    // Split synthetic single-baseline rows where multiple dated transactions share one Y coordinate
    let segment: PositionedPdfItem[] = [];
    const joinSegmentItems = (seg: PositionedPdfItem[]): string => {
      let out = '';
      for (let k = 0; k < seg.length; k++) {
        const curr = seg[k];
        if (k === 0) {
          out = curr.str;
          continue;
        }
        const prev = seg[k - 1];
        const gap = curr.x - (prev.x + prev.width);
        const isSplitNumberOrCurrency =
          gap < 4 &&
          ((/^[+-]?[£€$]?$/.test(prev.str) && /^\d/.test(curr.str)) ||
            (/\d$/.test(prev.str) && /^[,.\d]/.test(curr.str)) ||
            (/[,.]$/.test(prev.str) && /^\d/.test(curr.str)));
        out += isSplitNumberOrCurrency ? curr.str : ` ${curr.str}`;
      }
      return out.replace(/\s+/g, ' ').trim();
    };

    for (const item of deduped) {
      const segText = joinSegmentItems(segment);
      if (
        segment.length >= 2 &&
        PDF_LEADING_DATE_PATTERN.test(item.str) &&
        PDF_LEADING_DATE_PATTERN.test(segText) &&
        DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(segText)
      ) {
        structuredLines.push({
          y: line.y,
          text: segText,
          items: segment,
        });
        segment = [];
      }
      segment.push(item);
    }
    if (segment.length > 0) {
      const text = joinSegmentItems(segment);
      if (text) {
        structuredLines.push({ y: line.y, text, items: segment });
      }
    }
  }

  // Monzo vertically-centered 2-line / 3-line description reassembly
  const isMonzoDateAnchor = (l: { y: number; text: string; items: PositionedPdfItem[] }) =>
    /^\d{2}\/\d{2}\/\d{4}\b/.test(l.text) &&
    /\b-?\d{1,3}(?:[,.]\d{3})*[,.]\d{2}\s+-?\d{1,3}(?:[,.]\d{3})*[,.]\d{2}$/.test(l.text);

  const isMonzoDescOnly = (l: { y: number; text: string; items: PositionedPdfItem[] }) =>
    l.items.length > 0 &&
    l.items.every((it) => it.x >= 135 && it.x <= 370) &&
    !/^\d{2}\/\d{2}\/\d{4}\b/.test(l.text) &&
    !/\b(?:Date|Description|Personal Account|Sort code|Account number|Important information|Monzo Bank Limited)\b/i.test(l.text);

  const consumed = new Set<number>();
  for (let i = 0; i < structuredLines.length; i++) {
    const anchor = structuredLines[i];
    if (!isMonzoDateAnchor(anchor)) continue;

    const descParts: { y: number; text: string }[] = [];
    if (i - 1 >= 0 && !consumed.has(i - 1) && isMonzoDescOnly(structuredLines[i - 1])) {
      const dyAbove = structuredLines[i - 1].y - anchor.y;
      const prevAnchorDy =
        i - 2 >= 0 && isMonzoDateAnchor(structuredLines[i - 2])
          ? structuredLines[i - 2].y - structuredLines[i - 1].y
          : 999;
      if (dyAbove > 3.5 && dyAbove <= 16.5 && dyAbove < prevAnchorDy) {
        descParts.push({ y: structuredLines[i - 1].y, text: structuredLines[i - 1].text });
        consumed.add(i - 1);
      }
    }
    const midDesc = anchor.items
      .filter((it) => it.x >= 135 && it.x <= 370)
      .map((it) => it.str)
      .join(' ')
      .trim();
    if (midDesc) {
      descParts.push({ y: anchor.y, text: midDesc });
    }
    if (i + 1 < structuredLines.length && !consumed.has(i + 1) && isMonzoDescOnly(structuredLines[i + 1])) {
      const dyBelow = anchor.y - structuredLines[i + 1].y;
      const nextAnchorDy =
        i + 2 < structuredLines.length && isMonzoDateAnchor(structuredLines[i + 2])
          ? structuredLines[i + 1].y - structuredLines[i + 2].y
          : 999;
      if (dyBelow > 3.5 && dyBelow <= 16.5 && dyBelow < nextAnchorDy) {
        descParts.push({ y: structuredLines[i + 1].y, text: structuredLines[i + 1].text });
        consumed.add(i + 1);
      }
    }

    if (descParts.length > 0 && (consumed.has(i - 1) || consumed.has(i + 1))) {
      const datePart = anchor.items
        .filter((it) => it.x < 135)
        .map((it) => it.str)
        .join(' ')
        .trim();
      const tailPart = anchor.items
        .filter((it) => it.x > 370)
        .map((it) => it.str)
        .join(' ')
        .trim();
      const fullDesc = descParts.map((d) => d.text).join(' ').replace(/\s+/g, ' ').trim();
      anchor.text = `${datePart} ${fullDesc} ${tailPart}`.replace(/\s+/g, ' ').trim();
    }
  }

  // NatWest & Metro Bank 2-line transaction reassembly (where Line 1 has Date/Type/Details/Amounts and Line 2 has wrapped Details at x in [115..365])
  for (let i = 0; i < structuredLines.length - 1; i++) {
    if (consumed.has(i)) continue;
    const curr = structuredLines[i];
    const next = structuredLines[i + 1];
    if (consumed.has(i + 1)) continue;
    const dy = curr.y - next.y;
    if (dy <= 3.5 || dy > 15.5) continue;
    const currIsTxWithAmount =
      (PDF_LEADING_DATE_PATTERN.test(curr.text) || NATWEST_UNDATED_TX_START_PATTERN.test(curr.text)) &&
      DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(curr.text) &&
      curr.items.some((it) => it.x > 330);
    const nextIsDescContinuation =
      next.items.length > 0 &&
      next.items.every((it) => it.x >= 115 && it.x <= 365) &&
      !PDF_LEADING_DATE_PATTERN.test(next.text) &&
      !NATWEST_UNDATED_TX_START_PATTERN.test(next.text) &&
      !DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(next.text) &&
      !PDF_BOUNDARY_OR_BALANCE_PATTERN.test(next.text);
    if (currIsTxWithAmount && nextIsDescContinuation) {
      const leftAndDesc = curr.items
        .filter((it) => it.x <= 330)
        .map((it) => it.str)
        .join(' ')
        .trim();
      const rightAmounts = curr.items
        .filter((it) => it.x > 330)
        .map((it) => it.str)
        .join(' ')
        .trim();
      curr.text = `${leftAndDesc} ${next.text} ${rightAmounts}`.replace(/\s+/g, ' ').trim();
      consumed.add(i + 1);
    }
  }

  let seenHalifaxHeader = false;
  const pageRawLines: string[] = [];
  for (let i = 0; i < structuredLines.length; i++) {
    if (consumed.has(i)) continue;
    const text = structuredLines[i].text;
    if (HALIFAX_ROW_LABEL_LINE.test(text)) {
      if (!seenHalifaxHeader) {
        seenHalifaxHeader = true;
        pageRawLines.push(text);
      }
      continue;
    }
    if (/^(?:Money\s+In\s*\(£\)|Money\s+Out\s*\(£\)|Balance\s*\(£\))(?:\s+(?:Money\s+In\s*\(£\)|Money\s+Out\s*\(£\)|Balance\s*\(£\)))*$/i.test(text)) {
      continue;
    }
    pageRawLines.push(text);
  }

  const coalesced: string[] = [];
  let pendingTx: string[] = [];

  const flushPending = () => {
    if (pendingTx.length > 0) {
      coalesced.push(pendingTx.join(' ').replace(/\s+/g, ' ').trim());
      pendingTx = [];
    }
  };

  const isTxStart = (line: string): boolean => {
    if (/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s+to\s+\d{1,2}\s+/i.test(line)) {
      return false;
    }
    if (/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(line)) {
      return false;
    }
    if (/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s+(?:Account\s+Number|Page\s+\d)/i.test(line)) {
      return false;
    }
    return PDF_LEADING_DATE_PATTERN.test(line) || NATWEST_UNDATED_TX_START_PATTERN.test(line);
  };

  for (const line of pageRawLines) {
    if (PDF_BOUNDARY_OR_BALANCE_PATTERN.test(line)) {
      flushPending();
      coalesced.push(line);
      continue;
    }

    if (isTxStart(line)) {
      flushPending();
      if (DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(line)) {
        coalesced.push(line);
      } else {
        pendingTx.push(line);
      }
      continue;
    }

    if (pendingTx.length > 0) {
      pendingTx.push(line);
      if (DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(line)) {
        flushPending();
      }
      continue;
    }

    if (
      coalesced.length > 0 &&
      isTxStart(coalesced[coalesced.length - 1]) &&
      REVOLUT_SUBLINE_CONTINUATION_PATTERN.test(line) &&
      !DECIMAL_AMOUNT_ANYWHERE_PATTERN.test(line)
    ) {
      coalesced[coalesced.length - 1] = `${coalesced[coalesced.length - 1]} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    coalesced.push(line);
  }
  flushPending();

  return coalesced;
}

/**
 * PDF text layers can split one visual transaction over several extracted
 * rows. Coalesce rows until the first explicit GBP amount so downstream
 * parsing receives one logical transaction block, while flushing on new
 * dated rows or section/balance boundaries.
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
    if (PDF_BOUNDARY_OR_BALANCE_PATTERN.test(line)) {
      flush();
      result.push(line);
      continue;
    }
    if (isContinuation(line) && pending.length === 0 && result.length > 0) {
      result[result.length - 1] = `${result[result.length - 1]} ${line}`;
      continue;
    }
    if (
      pending.length > 0 &&
      PDF_LEADING_DATE_PATTERN.test(line) &&
      pending.some((item) => PDF_LEADING_DATE_PATTERN.test(item))
    ) {
      flush();
    }
    pending.push(line);
    if (
      PDF_GBP_AMOUNT_PATTERN.test(line) ||
      (PDF_LEADING_DATE_PATTERN.test(line) && /\b\d{1,4}(?:,\d{3})*\.\d{2}(?:\s+\d{1,4}(?:,\d{3})*\.\d{2})?\s*(?:DR|CR|-)?$/i.test(line))
    ) {
      flush();
    }
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

const MAX_ALLOWED_PDF_PAGES = 100;

interface PdfJsExtractInternalResult {
  lines: string[];
  pageCount: number;
  error?: string;
}

async function extractWithPdfJs(buffer: ArrayBuffer): Promise<PdfJsExtractInternalResult | null> {
  if (typeof window !== 'undefined') {
    await initPdfWorker();
  }

  try {
    let activePdfJs: typeof pdfjsLib = pdfjsLib;
    if (typeof window === 'undefined') {
      const legacyMod = await importOptional('pdfjs-dist/legacy/build/pdf.mjs');
      if (legacyMod && typeof legacyMod.getDocument === 'function') {
        activePdfJs = legacyMod as unknown as typeof pdfjsLib;
      }
    }

    const loadingTask = activePdfJs.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      useWorkerFetch: false,
      useSystemFonts: true,
      disableFontFace: typeof window === 'undefined',
      verbosity: 0,
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    if (pageCount > MAX_ALLOWED_PDF_PAGES) {
      try {
        const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
        if (typeof destroy === 'function') await destroy.call(pdf);
      } catch {
        // Ignore cleanup failures
      }
      return {
        lines: [],
        pageCount,
        error: `This statement has ${pageCount} pages (over ${MAX_ALLOWED_PDF_PAGES}). Please upload a shorter period (1–3 months) for faster and more reliable scanning.`,
      };
    }

    const allLines: string[] = [];

    try {
      // Stream page-by-page and release each page's internal buffers immediately
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        try {
          const content = await page.getTextContent();
          const pageLines = extractPageLinesFromItems(content.items);
          allLines.push(...pageLines);
          // Free raw text item references immediately to allow garbage collection
          content.items.length = 0;
        } finally {
          // Clean up internal operator list & font caches for this page
          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
        }
      }

      return { lines: allLines, pageCount };
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
  const pdfJsRes = await extractWithPdfJs(buffer);
  if (pdfJsRes?.error) {
    return {
      text: '',
      lines: [],
      usedOcrFallback: false,
      engine: 'pdfjs',
      pageCount: pdfJsRes.pageCount,
      error: pdfJsRes.error,
    };
  }
  if (pdfJsRes && pdfJsRes.lines.length > 0) {
    const text = pdfJsRes.lines.join('\n');
    return {
      text,
      lines: pdfJsRes.lines,
      usedOcrFallback: false,
      engine: 'pdfjs',
      pageCount: pdfJsRes.pageCount,
    };
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

/** Render image-only PDF pages locally with low memory footprint and optional per-page streaming. */
export async function renderPdfPagesForOcr(
  file: File | Blob,
  onPageRendered?: (pageBlob: Blob, pageNumber: number, totalPages: number) => Promise<void>,
): Promise<Blob[]> {
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

    if (pdf.numPages > MAX_ALLOWED_PDF_PAGES) {
      try {
        const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
        if (typeof destroy === 'function') await destroy.call(pdf);
      } catch {
        // Ignore
      }
      throw new Error(
        `This statement has ${pdf.numPages} pages (over ${MAX_ALLOWED_PDF_PAGES}). Please upload a shorter period (1–3 months) for faster scanning.`,
      );
    }

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

          // Release canvas buffers immediately
          canvas.width = 0;
          canvas.height = 0;

          if (blob) {
            if (onPageRendered) {
              await onPageRendered(blob, pageNumber, pdf.numPages);
            } else {
              pages.push(blob);
            }
          }
        } finally {
          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
        }
      }
    } finally {
      const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
      if (typeof destroy === 'function') await destroy.call(pdf);
    }
    return pages;
  } catch (err) {
    console.warn('[pdfTextExtractor] renderPdfPagesForOcr error:', err);
    return [];
  }
}

export function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
