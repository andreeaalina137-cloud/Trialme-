import type { BalanceEvidence, SpatialTransactionRow } from '../types/scanner.types';

/**
 * Spatial PDF row reconstruction + balance reconciliation.
 *
 * Supporting service only: the existing line extraction in pdfTextExtractor.ts and the
 * central validation gates stay authoritative. Everything here is pure and deterministic
 * (no PDF.js import, no timers, no locale-dependent behaviour).
 */

export interface SpatialGlyph {
  str: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

export interface SpatialCell {
  text: string;
  x0: number;
  x1: number;
}

export interface SpatialRow {
  page: number;
  y: number;
  cells: SpatialCell[];
  text: string;
  /** Continuation lines attached to this transaction row (already included in `text`). */
  continuations: string[];
}

export interface SpatialConfig {
  /** Max |Δy| between a glyph and the row anchor to share a visual row. */
  yTolerance: number;
  /** Horizontal gap above which glyphs start a new cell/column. */
  cellGap: number;
  /** Horizontal gap above which glyphs inside a cell are separated by a space. */
  wordGap: number;
  /** Max vertical distance between a transaction row and a continuation line. */
  maxContinuationGap: number;
  maxContinuationLines: number;
  /** Max |Δx0| between continuation text and the transaction description column. */
  columnAlignTolerance: number;
  /** Max |Δx1| between a numeric cell and a detected column header anchor. */
  columnSnap: number;
  /** Max share of glyphs with missing/invalid coordinates before the page is unreliable. */
  maxInvalidRatio: number;
}

export const DEFAULT_SPATIAL_CONFIG: Readonly<SpatialConfig> = Object.freeze({
  yTolerance: 3.5,
  cellGap: 9,
  wordGap: 1.5,
  maxContinuationGap: 16,
  maxContinuationLines: 3,
  columnAlignTolerance: 6,
  columnSnap: 40,
  maxInvalidRatio: 0.05,
});

const DATE_START_PATTERN =
  /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?)\b/i;
const MONEY_CELL_PATTERN = /^([-+])?\s*[£$€]?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\s*(CR|DR|D|C)?$/i;
const BOUNDARY_TEXT_PATTERN =
  /\b(?:BALANCE\s+(?:BROUGHT|CARRIED)|OPENING\s+BALANCE|CLOSING\s+BALANCE|TOTAL\s+(?:MONEY|PAYMENTS|DEBITS|CREDITS)|PAGE\s+\d+\s+OF\s+\d+)\b/i;

export interface GlyphExtraction {
  glyphs: SpatialGlyph[];
  total: number;
  invalid: number;
}

/** Adapts raw PDF.js text items. Items with missing/invalid coordinates are counted, never guessed. */
export function glyphsFromPdfJsItems(rawItems: readonly unknown[], page: number): GlyphExtraction {
  const glyphs: SpatialGlyph[] = [];
  let total = 0;
  let invalid = 0;
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
    const item = raw as { str?: unknown; transform?: unknown; width?: unknown };
    const str = typeof item.str === 'string' ? item.str.replace(/[Â\xa0]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!str) continue;
    total += 1;
    const t = item.transform;
    const x = Array.isArray(t) ? t[4] : undefined;
    const y = Array.isArray(t) ? t[5] : undefined;
    const width = item.width;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      width < 0
    ) {
      invalid += 1;
      continue;
    }
    glyphs.push({ str, x, y, width, page });
  }
  return { glyphs, total, invalid };
}

export function parseMoneyCell(text: string): number | null {
  const m = MONEY_CELL_PATTERN.exec(text.trim());
  if (!m) return null;
  const whole = m[2].replace(/,/g, '');
  const value = Number(`${whole}.${m[3]}`);
  if (!Number.isFinite(value)) return null;
  const suffix = (m[4] ?? '').toUpperCase();
  const negative = m[1] === '-' || suffix === 'DR' || suffix === 'D';
  return negative ? -value : value;
}

/** Groups glyphs into visual rows per page. Page boundaries are never crossed. */
export function groupGlyphsIntoRows(
  glyphs: readonly SpatialGlyph[],
  config: SpatialConfig = DEFAULT_SPATIAL_CONFIG,
): SpatialRow[] {
  const byPage = new Map<number, { g: SpatialGlyph; i: number }[]>();
  glyphs.forEach((g, i) => {
    const list = byPage.get(g.page);
    if (list) list.push({ g, i });
    else byPage.set(g.page, [{ g, i }]);
  });

  const rows: SpatialRow[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const sorted = (byPage.get(page) ?? []).sort((a, b) => b.g.y - a.g.y || a.g.x - b.g.x || a.i - b.i);
    const buckets: { anchor: number; items: SpatialGlyph[] }[] = [];
    for (const { g } of sorted) {
      const last = buckets[buckets.length - 1];
      // Anchor-based (not chained) so a long run of slightly drifting glyphs cannot swallow the next row.
      if (last && Math.abs(last.anchor - g.y) <= config.yTolerance) last.items.push(g);
      else buckets.push({ anchor: g.y, items: [g] });
    }
    for (const bucket of buckets) {
      const items = bucket.items.sort((a, b) => a.x - b.x);
      const cells = buildCells(items, config);
      if (cells.length === 0) continue;
      rows.push({
        page,
        y: bucket.anchor,
        cells,
        text: cells.map((c) => c.text).join(' '),
        continuations: [],
      });
    }
  }
  return rows;
}

function buildCells(items: readonly SpatialGlyph[], config: SpatialConfig): SpatialCell[] {
  const cells: SpatialCell[] = [];
  let prev: SpatialGlyph | null = null;
  let current: SpatialCell | null = null;
  for (const g of items) {
    if (prev && g.str === prev.str && Math.abs(g.x - prev.x) < 0.5) continue; // faux-bold duplicate
    const x1 = g.x + g.width;
    const gap: number = prev ? g.x - (prev.x + prev.width) : 0;
    if (!current || gap > config.cellGap) {
      current = { text: g.str, x0: g.x, x1 };
      cells.push(current);
    } else {
      current.text += (gap > config.wordGap ? ' ' : '') + g.str;
      current.x1 = Math.max(current.x1, x1);
    }
    prev = g;
  }
  return cells.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0);
}

function startsWithDate(row: SpatialRow): boolean {
  return row.cells.slice(0, 2).some((c) => DATE_START_PATTERN.test(c.text));
}

function moneyCells(row: SpatialRow): { cell: SpatialCell; value: number }[] {
  const out: { cell: SpatialCell; value: number }[] = [];
  for (const cell of row.cells) {
    const value = parseMoneyCell(cell.text);
    if (value !== null) out.push({ cell, value });
  }
  return out;
}

function descriptionX(row: SpatialRow): number | null {
  for (const cell of row.cells) {
    if (DATE_START_PATTERN.test(cell.text) || parseMoneyCell(cell.text) !== null) continue;
    return cell.x0;
  }
  return null;
}

/**
 * Attaches wrapped description lines to the transaction row above them. A continuation
 * must be on the same page, carry no date and no amount, start in the description column
 * of the transaction row, sit within `maxContinuationGap` and not look like a boundary/total
 * row. Any non-continuation row ends the transaction context, so rows are never chained
 * across unrelated lines and two transactions are never merged.
 */
export function attachContinuationLines(
  rows: readonly SpatialRow[],
  config: SpatialConfig = DEFAULT_SPATIAL_CONFIG,
): SpatialRow[] {
  const result: SpatialRow[] = [];
  let tx: SpatialRow | null = null;
  let txDescX: number | null = null;
  let lastY = 0;
  for (const row of rows) {
    const isTx = startsWithDate(row) && moneyCells(row).length > 0;
    if (isTx) {
      tx = { ...row, continuations: [] };
      txDescX = descriptionX(row);
      lastY = row.y;
      result.push(tx);
      continue;
    }
    const canAttach =
      tx !== null &&
      tx.page === row.page &&
      !startsWithDate(row) &&
      moneyCells(row).length === 0 &&
      !BOUNDARY_TEXT_PATTERN.test(row.text) &&
      tx.continuations.length < config.maxContinuationLines &&
      txDescX !== null &&
      Math.abs(row.cells[0].x0 - txDescX) <= config.columnAlignTolerance &&
      lastY - row.y > 0 &&
      lastY - row.y <= config.maxContinuationGap;
    if (canAttach && tx) {
      tx.continuations.push(row.text);
      tx.text = `${tx.text} ${row.text}`;
      lastY = row.y;
      continue;
    }
    tx = null;
    txDescX = null;
    result.push(row);
  }
  return result;
}

interface ColumnAnchors {
  out: number | null;
  in: number | null;
  balance: number | null;
}

const OUT_HEADER = /^(?:money\s*out|paid\s*out|debits?|withdrawals?|out)(?:\s*\(£\))?$/i;
const IN_HEADER = /^(?:money\s*in|paid\s*in|credits?|deposits?|in)(?:\s*\(£\))?$/i;
const BALANCE_HEADER = /^balance(?:\s*\(£\))?$/i;

export function detectColumnAnchors(row: SpatialRow): ColumnAnchors | null {
  let out: number | null = null;
  let inn: number | null = null;
  let balance: number | null = null;
  for (const cell of row.cells) {
    if (OUT_HEADER.test(cell.text)) out = cell.x1;
    else if (IN_HEADER.test(cell.text)) inn = cell.x1;
    else if (BALANCE_HEADER.test(cell.text)) balance = cell.x1;
  }
  return balance !== null && (out !== null || inn !== null) ? { out, in: inn, balance } : null;
}

function classifyNumericCells(
  row: SpatialRow,
  anchors: ColumnAnchors | null,
  config: SpatialConfig,
): { amounts: number[]; balance: number | null } {
  const money = moneyCells(row);
  if (money.length === 0) return { amounts: [], balance: null };
  if (anchors) {
    const amounts: number[] = [];
    let balance: number | null = null;
    for (const { cell, value } of money) {
      const targets: [string, number | null][] = [
        ['out', anchors.out],
        ['in', anchors.in],
        ['balance', anchors.balance],
      ];
      let best: string | null = null;
      let bestDist = config.columnSnap;
      for (const [role, x] of targets) {
        if (x === null) continue;
        const d = Math.abs(cell.x1 - x);
        if (d <= bestDist) {
          best = role;
          bestDist = d;
        }
      }
      if (best === 'balance') balance = value;
      else amounts.push(Math.abs(value)); // unsnapped cells stay candidates; never assume the first is the amount
    }
    return { amounts, balance };
  }
  if (money.length === 1) return { amounts: [Math.abs(money[0].value)], balance: null };
  const last = money[money.length - 1];
  return { amounts: money.slice(0, -1).map((m) => Math.abs(m.value)), balance: last.value };
}

export interface SpatialPageResult {
  reliable: boolean;
  reason: string | null;
  rows: SpatialTransactionRow[];
}

/**
 * One-call API used by the PDF pipeline: raw PDF.js items of one page → compact numeric rows.
 * If coordinates are missing/invalid/unreliable the result is `reliable: false` with no rows,
 * and the caller keeps using the existing flattened-text pipeline.
 */
export function reconstructPageTransactionRows(
  rawItems: readonly unknown[],
  page: number,
  config: SpatialConfig = DEFAULT_SPATIAL_CONFIG,
  carriedAnchors: { current: ColumnAnchors | null } = { current: null },
): SpatialPageResult {
  const { glyphs, total, invalid } = glyphsFromPdfJsItems(rawItems, page);
  if (total === 0) return { reliable: false, reason: 'NO_TEXT_ITEMS', rows: [] };
  if (invalid / total > config.maxInvalidRatio) return { reliable: false, reason: 'INVALID_COORDINATES', rows: [] };
  if (glyphs.length > 3 && glyphs.every((g) => g.y === glyphs[0].y)) {
    return { reliable: false, reason: 'SINGLE_BASELINE', rows: [] };
  }
  if (glyphs.length > 3 && glyphs.every((g) => g.x === 0)) {
    return { reliable: false, reason: 'ZERO_X_COORDINATES', rows: [] };
  }

  const visual = attachContinuationLines(groupGlyphsIntoRows(glyphs, config), config);
  const out: SpatialTransactionRow[] = [];
  for (const row of visual) {
    const header = detectColumnAnchors(row);
    if (header) {
      carriedAnchors.current = header;
      continue;
    }
    if (!startsWithDate(row)) continue;
    const { amounts, balance } = classifyNumericCells(row, carriedAnchors.current, config);
    if (amounts.length === 0 && balance === null) continue;
    out.push({ page, text: row.text, amounts, balance });
  }
  return { reliable: true, reason: null, rows: out };
}

// ---------------------------------------------------------------------------
// Balance reconciliation
// ---------------------------------------------------------------------------

export interface BalanceRowInput {
  /** Candidate transaction amounts (absolute values). Never assumed to be ordered. */
  amounts: readonly number[];
  balance: number | null;
  /** ISO date-only string; used only to infer statement order. */
  date?: string | null;
  isBalanceForward?: boolean;
  pending?: boolean;
  /** Existing scanner classification. It always wins when it disagrees with the balance. */
  existingIsCredit?: boolean | null;
}

export interface BalanceReconcileConfig {
  /** Allowed difference in pounds between balance movement and a candidate amount. */
  tolerance: number;
  order: 'auto' | 'chronological' | 'reverse';
}

export const DEFAULT_BALANCE_CONFIG: Readonly<BalanceReconcileConfig> = Object.freeze({
  tolerance: 0.01,
  order: 'auto' as const,
});

const pence = (value: number): number => Math.round(value * 100);

function unverified(reason: string): BalanceEvidence {
  return {
    reconciled: false,
    supportsDebit: false,
    matchedAmount: null,
    balanceDelta: null,
    classification: 'UNVERIFIED',
    reason,
  };
}

function resolveOrder(rows: readonly BalanceRowInput[], order: BalanceReconcileConfig['order']): 'chronological' | 'reverse' | null {
  if (order !== 'auto') return order;
  const dated = rows.filter((r) => typeof r.date === 'string' && r.date).map((r) => r.date as string);
  if (dated.length < 2) return null;
  const first = dated[0];
  const last = dated[dated.length - 1];
  if (first === last) return null;
  return first < last ? 'chronological' : 'reverse';
}

/**
 * For consecutive rows: deltaOut = previousBalance − currentBalance (chronological sense).
 * - delta > 0 matching exactly one candidate → DEBIT_SUPPORTED
 * - delta < 0 (balance increased) → never a debit; CREDIT_SUPPORTED when an amount matches
 * - delta = 0 → NO_MOVEMENT, never proof of an outgoing payment
 * - missing/unusable balances, pending rows, unknown order → UNVERIFIED (never a false confirmation)
 * - several distinct candidates matching → AMBIGUOUS (conservative)
 * The original amount is never touched; the existing classification wins on conflict.
 */
export function reconcileBalances(
  rows: readonly BalanceRowInput[],
  config: Partial<BalanceReconcileConfig> = {},
): BalanceEvidence[] {
  const cfg = { ...DEFAULT_BALANCE_CONFIG, ...config };
  const tol = Math.max(0, pence(cfg.tolerance));
  const order = resolveOrder(rows, cfg.order);
  const results: BalanceEvidence[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const cur = rows[i];
    if (cur.isBalanceForward) {
      results.push(unverified('BALANCE_FORWARD_ROW: used as a baseline only'));
      continue;
    }
    if (cur.pending) {
      results.push(unverified('PENDING_ROW: pending balances are not reconciled'));
      continue;
    }
    if (cur.balance === null || !Number.isFinite(cur.balance)) {
      results.push(unverified('MISSING_BALANCE: no running balance on this row'));
      continue;
    }
    if (rows.length > 1 && order === null) {
      results.push(unverified('ORDER_UNKNOWN: statement order cannot be inferred from dates'));
      continue;
    }
    const prevIndex = order === 'reverse' ? i + 1 : i - 1;
    const prev = prevIndex >= 0 && prevIndex < rows.length ? rows[prevIndex] : null;
    if (!prev) {
      results.push(unverified('NO_PREVIOUS_ROW: nothing to compare against'));
      continue;
    }
    if (prev.pending) {
      results.push(unverified('PREVIOUS_ROW_PENDING'));
      continue;
    }
    if (prev.balance === null || !Number.isFinite(prev.balance)) {
      results.push(unverified('PREVIOUS_BALANCE_MISSING: rows are not consecutive balances'));
      continue;
    }

    const deltaPence = pence(prev.balance) - pence(cur.balance);
    const balanceDelta = deltaPence / 100;
    const candidates = [...new Set(cur.amounts.map((a) => pence(Math.abs(a))).filter((p) => p > 0))];

    if (Math.abs(deltaPence) <= tol) {
      results.push({
        reconciled: false,
        supportsDebit: false,
        matchedAmount: null,
        balanceDelta,
        classification: 'NO_MOVEMENT',
        reason: 'ZERO_DELTA: balance did not move, which is not proof of an outgoing payment',
      });
      continue;
    }

    const wanted = Math.abs(deltaPence);
    const matches = candidates.filter((c) => Math.abs(c - wanted) <= tol);
    if (matches.length === 0) {
      results.push({
        reconciled: false,
        supportsDebit: false,
        matchedAmount: null,
        balanceDelta,
        classification: 'NOT_RECONCILED',
        reason: 'NO_MATCH: balance movement matches no candidate amount (fees, pending items or skipped rows?)',
      });
      continue;
    }
    if (matches.length > 1) {
      results.push({
        reconciled: false,
        supportsDebit: false,
        matchedAmount: null,
        balanceDelta,
        classification: 'AMBIGUOUS',
        reason: 'MULTIPLE_CANDIDATES: several distinct amounts fit the balance movement',
      });
      continue;
    }

    const matchedAmount = matches[0] / 100;
    const isDebitMovement = deltaPence > 0;
    if (cur.existingIsCredit === true && isDebitMovement) {
      results.push({
        reconciled: false,
        supportsDebit: false,
        matchedAmount,
        balanceDelta,
        classification: 'CONFLICT',
        reason: 'CONFLICT: balance fell but existing classification says money in; existing classification wins',
      });
      continue;
    }
    if (cur.existingIsCredit === false && !isDebitMovement) {
      results.push({
        reconciled: false,
        supportsDebit: false,
        matchedAmount,
        balanceDelta,
        classification: 'CONFLICT',
        reason: 'CONFLICT: balance rose but existing classification says money out; existing classification wins',
      });
      continue;
    }
    results.push({
      reconciled: true,
      supportsDebit: isDebitMovement,
      matchedAmount,
      balanceDelta,
      classification: isDebitMovement ? 'DEBIT_SUPPORTED' : 'CREDIT_SUPPORTED',
      reason: isDebitMovement
        ? 'Balance decreased by exactly one candidate amount'
        : 'Balance increased by exactly one candidate amount (money in, not a debit)',
    });
  }
  return results;
}
