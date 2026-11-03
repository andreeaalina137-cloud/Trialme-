import type {
  OcrDocument,
  OcrStructuredLine,
  OcrToken,
  OcrRowEvidence,
  OcrBbox,
  ScannedTransaction,
} from '../types/scanner.types';

export type {
  OcrDocument,
  OcrStructuredLine,
  OcrToken,
  OcrRowEvidence,
  OcrBbox,
};
import {
  normalizeStatementLine,
  repairCommonMerchantSpacing,
  repairBankMerchantAbbreviations,
} from './statementNormalizer';
import { parseStatementInternal } from './ukBankCleaner';
import {
  type ColumnAnchors,
  type SpatialRow,
  type SpatialCell,
  type SpatialGlyph,
  detectColumnAnchors,
} from './spatialPdfExtractor';

/**
 * Deduplicates overlapping OCR tokens that share identical or near-identical text and bounding boxes.
 */
export function deduplicateOcrTokens(tokens: readonly OcrToken[]): OcrToken[] {
  const result: OcrToken[] = [];
  for (const token of tokens) {
    const isDup = result.some((existing) => {
      if (existing.text !== token.text) return false;
      const dx0 = Math.abs(existing.bbox.x0 - token.bbox.x0);
      const dy0 = Math.abs(existing.bbox.y0 - token.bbox.y0);
      const dx1 = Math.abs(existing.bbox.x1 - token.bbox.x1);
      const dy1 = Math.abs(existing.bbox.y1 - token.bbox.y1);
      return dx0 <= 4 && dy0 <= 4 && dx1 <= 4 && dy1 <= 4;
    });
    if (!isDup) {
      result.push(token);
    }
  }
  return result;
}

/**
 * Sanitizes raw bounding box coordinates to ensure validity without throwing.
 */
export function sanitizeBbox(raw: unknown): OcrBbox {
  if (!raw || typeof raw !== 'object') {
    return { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0 };
  }
  const r = raw as Record<string, unknown>;
  const x0 = typeof r.x0 === 'number' && Number.isFinite(r.x0) ? Math.max(0, r.x0) : 0;
  const y0 = typeof r.y0 === 'number' && Number.isFinite(r.y0) ? Math.max(0, r.y0) : 0;
  const x1 = typeof r.x1 === 'number' && Number.isFinite(r.x1) ? Math.max(x0, r.x1) : x0;
  const y1 = typeof r.y1 === 'number' && Number.isFinite(r.y1) ? Math.max(y0, r.y1) : y0;
  return {
    x0,
    y0,
    x1,
    y1,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0),
  };
}

/**
 * Adapts raw Tesseract data into a structured OcrDocument.
 * Preserves both original raw tokens and normalized values, coordinates, and confidences.
 */
export function buildOcrDocumentFromTesseract(
  data: any,
  pageNumber = 1,
  engine: 'tesseract' | 'unavailable' | 'mock' = 'tesseract',
): OcrDocument {
  const fullText = typeof data?.text === 'string' ? data.text : '';
  const overallConfidence =
    typeof data?.confidence === 'number' && Number.isFinite(data.confidence)
      ? Math.max(0, Math.min(100, data.confidence))
      : 80;

  const rawTokens: OcrToken[] = [];
  const structuredLines: OcrStructuredLine[] = [];

  // Extract from Tesseract blocks/paragraphs/lines if present
  if (Array.isArray(data?.blocks) && data.blocks.length > 0) {
    let readingOrder = 0;
    for (const block of data.blocks) {
      if (!Array.isArray(block?.paragraphs)) continue;
      for (const paragraph of block.paragraphs) {
        if (!Array.isArray(paragraph?.lines)) continue;
        for (const line of paragraph.lines) {
          const rawLineText = typeof line?.text === 'string' ? line.text.replace(/[\r\n]+/g, ' ').trim() : '';
          if (!rawLineText) continue;

          const lineTokens: OcrToken[] = [];
          if (Array.isArray(line?.words)) {
            for (const word of line.words) {
              const wordText = typeof word?.text === 'string' ? word.text.trim() : '';
              if (!wordText) continue;
              const tokenConfidence =
                typeof word?.confidence === 'number' && Number.isFinite(word.confidence)
                  ? Math.max(0, Math.min(100, word.confidence))
                  : 80;
              const bbox = sanitizeBbox(word.bbox);
              const token: OcrToken = {
                text: wordText,
                confidence: tokenConfidence,
                bbox,
                page: pageNumber,
              };
              lineTokens.push(token);
              rawTokens.push(token);
            }
          }

          const lineConfidence =
            typeof line?.confidence === 'number' && Number.isFinite(line.confidence)
              ? Math.max(0, Math.min(100, line.confidence))
              : lineTokens.length > 0
              ? lineTokens.reduce((sum, t) => sum + t.confidence, 0) / lineTokens.length
              : overallConfidence;

          const normalizedText = repairBankMerchantAbbreviations(
            repairCommonMerchantSpacing(normalizeStatementLine(rawLineText)),
          );

          structuredLines.push({
            rawText: rawLineText,
            normalizedText,
            page: pageNumber,
            confidence: Math.round(lineConfidence),
            bbox: sanitizeBbox(line.bbox),
            tokens: lineTokens,
            readingOrder: readingOrder++,
            isLowConfidence: lineConfidence < 60,
          });
        }
      }
    }
  }

  // Fallback: If no structured blocks were populated, synthesize lines from text
  if (structuredLines.length === 0 && fullText) {
    const rawLines = fullText
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    let readingOrder = 0;
    for (let i = 0; i < rawLines.length; i++) {
      const rawLineText = rawLines[i];
      const normalizedText = repairBankMerchantAbbreviations(
        repairCommonMerchantSpacing(normalizeStatementLine(rawLineText)),
      );
      const words = rawLineText.split(/\s+/).filter(Boolean);
      const lineTokens: OcrToken[] = words.map((w: string, wIdx: number) => ({
        text: w,
        confidence: overallConfidence,
        bbox: {
          x0: 50 + wIdx * 60,
          y0: 100 + i * 25,
          x1: 50 + wIdx * 60 + w.length * 8,
          y1: 100 + i * 25 + 16,
          width: w.length * 8,
          height: 16,
        },
        page: pageNumber,
      }));

      rawTokens.push(...lineTokens);
      structuredLines.push({
        rawText: rawLineText,
        normalizedText,
        page: pageNumber,
        confidence: overallConfidence,
        bbox: {
          x0: 50,
          y0: 100 + i * 25,
          x1: 50 + rawLineText.length * 8,
          y1: 100 + i * 25 + 16,
          width: rawLineText.length * 8,
          height: 16,
        },
        tokens: lineTokens,
        readingOrder: readingOrder++,
        isLowConfidence: overallConfidence < 60,
      });
    }
  }

  const dedupedTokens = deduplicateOcrTokens(rawTokens);
  const plainLines = structuredLines.map((sl) => sl.normalizedText || sl.rawText);

  return {
    rawText: fullText,
    lines: plainLines,
    structuredLines,
    tokens: dedupedTokens,
    confidence: overallConfidence,
    engine,
    pageCount: 1,
  };
}

/**
 * Converts OCR tokens to SpatialGlyphs for full spatial table alignment.
 */
export function ocrTokensToSpatialGlyphs(tokens: readonly OcrToken[], page = 1): SpatialGlyph[] {
  return tokens.map((token) => ({
    str: token.text,
    x: token.bbox.x0,
    y: token.bbox.y0,
    width: Math.max(1, (token.bbox.x1 ?? token.bbox.x0) - token.bbox.x0),
    height: Math.max(1, (token.bbox.y1 ?? token.bbox.y0) - token.bbox.y0),
    page: token.page ?? page,
  }));
}

/**
 * Builds SpatialRows from OCR structured lines to detect table headers and column anchors.
 */
export function detectSpatialColumnsFromOcr(ocrDoc: OcrDocument): ColumnAnchors | null {
  for (const line of ocrDoc.structuredLines) {
    if (line.tokens.length === 0) continue;
    const cells: SpatialCell[] = line.tokens.map((t) => ({
      text: t.text,
      x0: t.bbox.x0,
      x1: t.bbox.x1,
    }));
    const spatialRow: SpatialRow = {
      page: line.page,
      y: line.bbox.y0,
      cells,
      text: line.rawText,
      continuations: [],
    };
    const anchors = detectColumnAnchors(spatialRow);
    if (anchors) return anchors;
  }
  return null;
}

/**
 * Classifies whether a numeric token coordinate corresponds to Money Out, Money In, or Balance.
 */
export function classifyOcrColumn(
  tokenX: number,
  anchors: ColumnAnchors | null,
  tolerance = 45,
): 'MONEY_OUT' | 'MONEY_IN' | 'BALANCE' | 'UNKNOWN' {
  if (!anchors) return 'UNKNOWN';

  const candidates: [ 'MONEY_OUT' | 'MONEY_IN' | 'BALANCE', number | null ][] = [
    ['MONEY_OUT', anchors.out],
    ['MONEY_IN', anchors.in],
    ['BALANCE', anchors.balance],
  ];

  let bestRole: 'MONEY_OUT' | 'MONEY_IN' | 'BALANCE' | 'UNKNOWN' = 'UNKNOWN';
  let bestDist = tolerance;

  for (const [role, anchorX] of candidates) {
    if (anchorX === null) continue;
    const dist = Math.abs(tokenX - anchorX);
    if (dist <= bestDist) {
      bestDist = dist;
      bestRole = role;
    }
  }

  return bestRole;
}

/**
 * Main OCR–Scanner Intelligence Bridge:
 * Prepares OCR lines with spatial evidence, runs scanner validation Gates 1, 2 and 3,
 * attaches OCR evidence to transactions, and communicates confidence and uncertainty.
 */
export function parseStatementFromOcrDocument(
  ocrDoc: OcrDocument,
  now = new Date(),
): ScannedTransaction[] {
  const anchors = detectSpatialColumnsFromOcr(ocrDoc);

  // Prepare input lines with spatial column indicators if available
  const preparedLines: string[] = [];

  for (let i = 0; i < ocrDoc.structuredLines.length; i++) {
    const sLine = ocrDoc.structuredLines[i];
    let lineText = sLine.normalizedText || sLine.rawText;

    if (anchors && (anchors.in !== null || anchors.out !== null)) {
      // Find numeric tokens in the line
      const numericTokens = sLine.tokens.filter((t) =>
        /^(?:[-+]?[£$€]?\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?)\s*(?:DR|CR)?$/i.test(t.text),
      );
      if (numericTokens.length > 0) {
        for (const numTok of numericTokens) {
          const col = classifyOcrColumn(numTok.bbox.x1, anchors);
          if (col === 'MONEY_IN' && !/(?:^|\s)\+\s*\d|\bCR\b/i.test(lineText)) {
            // Explicitly mark credit so scanner Gate 1 recognizes Money In accurately
            lineText = `${lineText} + CR`;
            break;
          }
        }
      }
    }

    preparedLines.push(lineText);
  }

  // Pass to existing production UK statement cleaner & audit ledger
  const internalRes = parseStatementInternal(preparedLines, now);
  const accepted = internalRes.accepted;
  const ledger = internalRes.ledger;

  // Correlate transactions with OCR structured line evidence
  const attachEvidence = (tx: ScannedTransaction) => {
    // Match line by normalized or raw text
    const matchedLine = ocrDoc.structuredLines.find((sl) => {
      const normMatch = sl.normalizedText && tx.rawLine.includes(sl.normalizedText);
      const rawMatch = sl.rawText && tx.rawLine.includes(sl.rawText);
      return normMatch || rawMatch;
    });

    if (matchedLine) {
      const amountTokens = matchedLine.tokens.filter((t) =>
        new RegExp(`\\b${tx.amountGbp.toFixed(2)}\\b|\\b${Math.round(tx.amountGbp)}\\b`).test(t.text),
      );
      const minTokenConf =
        amountTokens.length > 0 ? Math.min(...amountTokens.map((t) => t.confidence)) : matchedLine.confidence;

      const isLowConf = matchedLine.isLowConfidence || minTokenConf < 60;

      const evidence: OcrRowEvidence = {
        rawText: matchedLine.rawText,
        normalizedText: matchedLine.normalizedText,
        page: matchedLine.page,
        bbox: matchedLine.bbox,
        confidence: matchedLine.confidence,
        tokens: matchedLine.tokens,
        readingOrder: matchedLine.readingOrder,
        isLowConfidence: isLowConf,
      };

      tx.ocrEvidence = evidence;

      if (isLowConf) {
        if (!tx.reasonCodes) {
          tx.reasonCodes = ['OCR_UNCERTAIN'];
        } else if (!tx.reasonCodes.includes('OCR_UNCERTAIN')) {
          tx.reasonCodes.push('OCR_UNCERTAIN');
        }

        // Financial Safety check:
        // If the amount token has low OCR confidence and is NOT confirmed by running-balance delta:
        if (!tx.balanceEvidence?.reconciled || !tx.balanceEvidence.supportsDebit) {
          tx.status = 'QUARANTINED';
          tx.validityScore = 0;
          tx.reason = 'Low OCR confidence on transaction amount without balance reconciliation proof';
        }
      }
    }
  };

  for (const tx of accepted) {
    attachEvidence(tx);
  }
  for (const tx of ledger) {
    attachEvidence(tx);
  }

  return accepted.filter((tx) => tx.status !== 'QUARANTINED');
}
