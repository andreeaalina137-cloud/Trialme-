import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupGlyphsIntoRows,
  attachContinuationLines,
  reconcileBalances,
  reconstructPageTransactionRows,
  glyphsFromPdfJsItems,
  parseMoneyCell,
  type SpatialGlyph,
  type BalanceRowInput,
} from '../src/scanner/services/spatialPdfExtractor';
import {
  buildMerchantFingerprint,
  fnv1a32,
} from '../src/scanner/services/merchantFingerprint';
import {
  analyzeRecurrence,
  calculateExpectedNextDate,
} from '../src/scanner/services/recurrenceMathEngine';
import {
  parseStatementLines,
  parseStatementAuditLedger,
  detectDocumentDateFormat,
  extractUkDate,
  extractStatementPeriod,
  resolveYearForMonth,
} from '../src/scanner/services/ukBankCleaner';
import {
  matchStatementTransactions,
  detectStatementDateRange,
  classifyScannerItemType,
  DEFAULT_STATEMENT_FRESHNESS_DAYS,
} from '../src/scanner/services/statementMatcher';
import { buildScannerSubscriptionDraft } from '../src/scanner/services/scannerSubscriptionDraft';

// ============================================================================
// 1. SPATIAL PDF EXTRACTION & BALANCE RECONCILIATION TESTS
// ============================================================================

test('Spatial extraction: groups glyphs on the same visual row', () => {
  const glyphs: SpatialGlyph[] = [
    { str: '01/05/2026', x: 50, y: 700, width: 45, page: 1 },
    { str: 'NETFLIX', x: 120, y: 700.5, width: 40, page: 1 },
    { str: '15.99', x: 300, y: 699.8, width: 25, page: 1 },
  ];
  const rows = groupGlyphsIntoRows(glyphs);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].page, 1);
  assert.equal(rows[0].cells.length, 3);
  assert.equal(rows[0].text, '01/05/2026 NETFLIX 15.99');
});

test('Spatial extraction: separates glyphs in different columns and distinct Y coordinates', () => {
  const glyphs: SpatialGlyph[] = [
    // Row 1
    { str: '01/05/2026', x: 50, y: 700, width: 45, page: 1 },
    { str: 'SPOTIFY', x: 150, y: 700, width: 40, page: 1 },
    { str: '10.99', x: 300, y: 700, width: 25, page: 1 },
    // Row 2 (lower Y)
    { str: '02/05/2026', x: 50, y: 680, width: 45, page: 1 },
    { str: 'APPLE.COM/BILL', x: 150, y: 680, width: 60, page: 1 },
    { str: '2.99', x: 300, y: 680, width: 20, page: 1 },
  ];
  const rows = groupGlyphsIntoRows(glyphs);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, '01/05/2026 SPOTIFY 10.99');
  assert.equal(rows[1].text, '02/05/2026 APPLE.COM/BILL 2.99');
});

test('Spatial extraction: multi-line descriptions attached only when aligned in column', () => {
  const glyphs: SpatialGlyph[] = [
    // Main transaction row
    { str: '15/04/2026', x: 50, y: 500, width: 50, page: 1 },
    { str: 'DIRECT DEBIT PAYMENT', x: 120, y: 500, width: 90, page: 1 },
    { str: '14.99', x: 350, y: 500, width: 30, page: 1 },
    // Continuation line (same column x=120, no date, no amount, y gap = 10)
    { str: 'TO DISNEY PLUS SUBSCRIPTION', x: 120, y: 490, width: 110, page: 1 },
  ];
  const rawRows = groupGlyphsIntoRows(glyphs);
  assert.equal(rawRows.length, 2);

  const attached = attachContinuationLines(rawRows);
  assert.equal(attached.length, 1, 'Continuation row should be merged into parent transaction');
  assert.equal(attached[0].continuations.length, 1);
  assert.equal(attached[0].continuations[0], 'TO DISNEY PLUS SUBSCRIPTION');
  assert.ok(attached[0].text.includes('TO DISNEY PLUS SUBSCRIPTION'));
});

test('Spatial extraction: page boundaries are never crossed by continuation lines', () => {
  const glyphs: SpatialGlyph[] = [
    // Bottom of Page 1
    { str: '15/04/2026', x: 50, y: 50, width: 50, page: 1 },
    { str: 'PARAMOUNT PLUS', x: 120, y: 50, width: 80, page: 1 },
    { str: '7.99', x: 350, y: 50, width: 25, page: 1 },
    // Top of Page 2 (similar column x=120, but different page)
    { str: 'STREAMING SERVICE', x: 120, y: 800, width: 80, page: 2 },
  ];
  const rows = attachContinuationLines(groupGlyphsIntoRows(glyphs));
  assert.equal(rows.length, 2, 'Continuation must never cross page boundaries');
  assert.equal(rows[0].page, 1);
  assert.equal(rows[1].page, 2);
});

test('Spatial extraction: handles missing or invalid coordinates gracefully', () => {
  const rawItems = [
    { str: 'Valid Item', transform: [1, 0, 0, 1, 50, 400], width: 40 },
    { str: 'No Transform', width: 40 },
    { str: 'NaN Y', transform: [1, 0, 0, 1, 50, NaN], width: 40 },
    { str: 'Negative Width', transform: [1, 0, 0, 1, 50, 400], width: -5 },
  ];
  const extraction = glyphsFromPdfJsItems(rawItems, 1);
  assert.equal(extraction.glyphs.length, 1);
  assert.equal(extraction.invalid, 3);
  assert.equal(extraction.total, 4);

  // When invalid ratio > maxInvalidRatio (3/4 = 75% > 5%), reconstructPageTransactionRows reports unreliable
  const result = reconstructPageTransactionRows(rawItems, 1);
  assert.equal(result.reliable, false);
  assert.equal(result.reason, 'INVALID_COORDINATES');
  assert.equal(result.rows.length, 0);
});

test('Spatial extraction: parseMoneyCell parses positive, negative, DR/CR formats accurately', () => {
  assert.equal(parseMoneyCell('£15.99'), 15.99);
  assert.equal(parseMoneyCell('-25.50'), -25.50);
  assert.equal(parseMoneyCell('1,250.00 DR'), -1250.0);
  assert.equal(parseMoneyCell('100.00 CR'), 100.0);
  assert.equal(parseMoneyCell('NOT_MONEY'), null);
});

test('Layout resilience: dynamic font scaling separates tight small fonts without merging', () => {
  // Small 6pt font: line 1 at y=700, line 2 at y=694.8 (delta = 5.2pt)
  // With median height = 6pt, dynamic yTol is ~2.4pt (not hardcoded 3.5), so they remain separate rows
  const glyphs: SpatialGlyph[] = [
    { str: '01/05/2026', x: 50, y: 700, width: 30, height: 6, page: 1 },
    { str: 'MICROSOFT', x: 100, y: 700, width: 40, height: 6, page: 1 },
    { str: '7.99', x: 250, y: 700, width: 20, height: 6, page: 1 },
    { str: '02/05/2026', x: 50, y: 694.8, width: 30, height: 6, page: 1 },
    { str: 'ADOBE', x: 100, y: 694.8, width: 30, height: 6, page: 1 },
    { str: '19.99', x: 250, y: 694.8, width: 20, height: 6, page: 1 },
  ];
  const rows = groupGlyphsIntoRows(glyphs);
  assert.equal(rows.length, 2, 'Small font lines with 5.2pt spacing must not be merged into one line');
  assert.equal(rows[0].text, '01/05/2026 MICROSOFT 7.99');
  assert.equal(rows[1].text, '02/05/2026 ADOBE 19.99');
});

test('Layout resilience: dynamic font scaling clusters large fonts with baseline drift', () => {
  // Large 14pt header or row: glyphs vary by 4.2pt due to typography/superscript
  // With median height = 14pt, dynamic yTol is ~5.6pt, keeping them on the same visual row
  const glyphs: SpatialGlyph[] = [
    { str: '01/05/2026', x: 50, y: 500, width: 60, height: 14, page: 1 },
    { str: 'GYM MEMBERSHIP', x: 150, y: 504.2, width: 100, height: 14, page: 1 },
    { str: '35.00', x: 350, y: 499.5, width: 40, height: 14, page: 1 },
  ];
  const rows = groupGlyphsIntoRows(glyphs);
  assert.equal(rows.length, 1, 'Large font with 4.2pt baseline drift must cluster into one row');
  assert.equal(rows[0].text, '01/05/2026 GYM MEMBERSHIP 35.00');
});

test('Layout resilience: shifted columns and custom widths resolved via header anchors', () => {
  const rawItems = [
    // Header row: Date, Description, Payments, Balance
    { str: 'Date', transform: [1, 0, 0, 1, 30, 800], width: 30 },
    { str: 'Transaction Details', transform: [1, 0, 0, 1, 100, 800], width: 100 },
    { str: 'Payments', transform: [1, 0, 0, 1, 440, 800], width: 40 }, // Shifted right
    { str: 'Balance', transform: [1, 0, 0, 1, 540, 800], width: 40 },
    // Transaction row: shifted columns
    { str: '12/04/2026', transform: [1, 0, 0, 1, 30, 770], width: 45 },
    { str: 'AMAZON PRIME SUBSCRIPTION', transform: [1, 0, 0, 1, 100, 770], width: 150 },
    { str: '8.99', transform: [1, 0, 0, 1, 450, 770], width: 25 }, // Snaps to Payments (x1~475)
    { str: '1,250.00', transform: [1, 0, 0, 1, 545, 770], width: 35 }, // Snaps to Balance (x1~580)
  ];
  const result = reconstructPageTransactionRows(rawItems, 1);
  assert.equal(result.reliable, true);
  assert.equal(result.layoutReliability, 'RELIABLE');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].amounts, [8.99]);
  assert.equal(result.rows[0].balance, 1250.0);
  assert.ok(result.rows[0].text.includes('AMAZON PRIME SUBSCRIPTION'));
});

test('Layout resilience: reordered columns with non-standard sequence resolved via header anchors', () => {
  // Non-standard sequence: Date, Payments, Balance, Narrative!
  const rawItems = [
    { str: 'Date', transform: [1, 0, 0, 1, 40, 800], width: 30 },
    { str: 'Money Out', transform: [1, 0, 0, 1, 120, 800], width: 45 },
    { str: 'Balance', transform: [1, 0, 0, 1, 220, 800], width: 40 },
    { str: 'Narrative', transform: [1, 0, 0, 1, 340, 800], width: 60 },
    // Transaction row following the same reordered layout
    { str: '03/05/2026', transform: [1, 0, 0, 1, 40, 770], width: 45 },
    { str: '14.99', transform: [1, 0, 0, 1, 130, 770], width: 25 },
    { str: '850.00', transform: [1, 0, 0, 1, 230, 770], width: 30 },
    { str: 'ADOBE CREATIVE CLOUD', transform: [1, 0, 0, 1, 340, 770], width: 120 },
  ];
  const result = reconstructPageTransactionRows(rawItems, 1);
  assert.equal(result.reliable, true);
  assert.equal(result.layoutReliability, 'RELIABLE');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].amounts, [14.99]);
  assert.equal(result.rows[0].balance, 850.0);
});

test('Layout resilience: wrapped descriptions with varying indentation reassembled cleanly', () => {
  const glyphs: SpatialGlyph[] = [
    // Main transaction line: Description starts at x=120
    { str: '10/05/2026', x: 50, y: 600, width: 50, page: 1 },
    { str: 'GITHUB INC', x: 120, y: 600, width: 60, page: 1 },
    { str: '21.00', x: 350, y: 600, width: 30, page: 1 },
    { str: '450.00', x: 450, y: 600, width: 35, page: 1 },
    // Continuation line: indented by 15pt at x=135 (no date, no amount, y gap = 12)
    { str: 'ENTERPRISE CLOUD SEATTLE', x: 135, y: 588, width: 120, page: 1 },
  ];
  const rows = attachContinuationLines(groupGlyphsIntoRows(glyphs));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].continuations.length, 1);
  assert.equal(rows[0].continuations[0], 'ENTERPRISE CLOUD SEATTLE');
  assert.ok(rows[0].text.includes('GITHUB INC'));
  assert.ok(rows[0].text.includes('ENTERPRISE CLOUD SEATTLE'));
});

test('Layout resilience: missing column headers gracefully degrades to DEGRADED without crashing', () => {
  const rawItems = [
    // No header row at all! Raw transaction rows across multiple lines
    { str: '01/05/2026', transform: [1, 0, 0, 1, 50, 700], width: 45 },
    { str: 'SPOTIFY PREMIUM', transform: [1, 0, 0, 1, 130, 700], width: 80 },
    { str: '10.99', transform: [1, 0, 0, 1, 320, 700], width: 25 },
    { str: '520.00', transform: [1, 0, 0, 1, 440, 700], width: 30 },
    // Row 2
    { str: '02/05/2026', transform: [1, 0, 0, 1, 50, 675], width: 45 },
    { str: 'NETFLIX', transform: [1, 0, 0, 1, 130, 675], width: 60 },
    { str: '15.99', transform: [1, 0, 0, 1, 320, 675], width: 25 },
    { str: '504.01', transform: [1, 0, 0, 1, 440, 675], width: 30 },
  ];
  const result = reconstructPageTransactionRows(rawItems, 1);
  assert.equal(result.reliable, true);
  assert.equal(result.layoutReliability, 'DEGRADED');
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0].amounts, [10.99]);
  assert.equal(result.rows[0].balance, 520.0);
  assert.deepEqual(result.rows[1].amounts, [15.99]);
  assert.equal(result.rows[1].balance, 504.01);
});

test('Layout resilience: malformed or incomplete transaction row without description is rejected', () => {
  const rawItems = [
    // Malformed line: Date and orphan amount with NO description/payee
    { str: '01/05/2026', transform: [1, 0, 0, 1, 50, 700], width: 45 },
    { str: '15.99', transform: [1, 0, 0, 1, 300, 700], width: 25 },
    // Valid line with description
    { str: '02/05/2026', transform: [1, 0, 0, 1, 50, 680], width: 45 },
    { str: 'NETFLIX', transform: [1, 0, 0, 1, 130, 680], width: 50 },
    { str: '15.99', transform: [1, 0, 0, 1, 300, 680], width: 25 },
  ];
  const result = reconstructPageTransactionRows(rawItems, 1);
  assert.equal(result.rows.length, 1, 'Orphan malformed row must be rejected');
  assert.ok(result.rows[0].text.includes('NETFLIX'));
});

test('Balance reconciliation: balance decrease matching candidate amount confirms debit', () => {
  const rows: BalanceRowInput[] = [
    { amounts: [1000.0], balance: 1000.0, date: '2026-01-01' },
    { amounts: [15.99], balance: 984.01, date: '2026-01-02' }, // delta = 15.99 out
  ];
  const results = reconcileBalances(rows);
  assert.equal(results.length, 2);
  assert.equal(results[0].classification, 'UNVERIFIED'); // first row has no previous
  assert.equal(results[1].classification, 'DEBIT_SUPPORTED');
  assert.equal(results[1].reconciled, true);
  assert.equal(results[1].supportsDebit, true);
  assert.equal(results[1].matchedAmount, 15.99);
});

test('Balance reconciliation: balance increase represents money in and never supports debit', () => {
  const rows: BalanceRowInput[] = [
    { amounts: [500.0], balance: 500.0, date: '2026-01-01' },
    { amounts: [200.0], balance: 700.0, date: '2026-01-02' }, // balance increased
  ];
  const results = reconcileBalances(rows);
  assert.equal(results[1].classification, 'CREDIT_SUPPORTED');
  assert.equal(results[1].supportsDebit, false);
  assert.equal(results[1].reconciled, true);
});

test('Balance reconciliation: zero balance delta is never proof of outgoing payment', () => {
  const rows: BalanceRowInput[] = [
    { amounts: [500.0], balance: 500.0, date: '2026-01-01' },
    { amounts: [10.0], balance: 500.0, date: '2026-01-02' }, // balance did not move
  ];
  const results = reconcileBalances(rows);
  assert.equal(results[1].classification, 'NO_MOVEMENT');
  assert.equal(results[1].reconciled, false);
  assert.equal(results[1].supportsDebit, false);
});

test('Balance reconciliation: missing balance produces UNVERIFIED result without crashing', () => {
  const rows: BalanceRowInput[] = [
    { amounts: [500.0], balance: 500.0, date: '2026-01-01' },
    { amounts: [15.0], balance: null, date: '2026-01-02' },
  ];
  const results = reconcileBalances(rows);
  assert.equal(results[1].classification, 'UNVERIFIED');
  assert.equal(results[1].reconciled, false);
});

test('Balance reconciliation: multiple matching candidate amounts classified as AMBIGUOUS', () => {
  // With default tolerance 0.01, both 10.00 and 10.01 fit a 10.00 delta -> AMBIGUOUS
  const ambiguousRows: BalanceRowInput[] = [
    { amounts: [500.0], balance: 500.0, date: '2026-01-01' },
    { amounts: [10.0, 10.01], balance: 490.0, date: '2026-01-02' },
  ];
  const results = reconcileBalances(ambiguousRows);
  assert.equal(results[1].classification, 'AMBIGUOUS');
  assert.equal(results[1].reconciled, false);
});

test('Balance reconciliation: conflict when existing classification disagrees with balance delta', () => {
  const rows: BalanceRowInput[] = [
    { amounts: [500.0], balance: 500.0, date: '2026-01-01' },
    // Balance rose by 50 (money in), but row was marked as money out
    { amounts: [50.0], balance: 550.0, date: '2026-01-02', existingIsCredit: false },
  ];
  const results = reconcileBalances(rows);
  assert.equal(results[1].classification, 'CONFLICT');
  assert.equal(results[1].reconciled, false);
});

// ============================================================================
// 2. MERCHANT FINGERPRINTING TESTS
// ============================================================================

test('Merchant fingerprint: strips bank rail noise while preserving canonical merchant identity', () => {
  const fp1 = buildMerchantFingerprint('DIRECT DEBIT PAYMENT TO NETFLIX REF 99281');
  const fp2 = buildMerchantFingerprint('NETFLIX.COM CD 1234');
  const fp3 = buildMerchantFingerprint('NETFLIX');

  assert.equal(fp1.normalized, 'NETFLIX');
  assert.equal(fp2.normalized, 'NETFLIX');
  assert.equal(fp3.normalized, 'NETFLIX');
  assert.equal(fp1.fingerprint, fp2.fingerprint);
  assert.equal(fp2.fingerprint, fp3.fingerprint);
});

test('Merchant fingerprint: repairs narrow OCR errors deterministically', () => {
  const appleOcr = buildMerchantFingerprint('APPIE.COM/BIL', { amountGbp: 2.99 });
  assert.equal(appleOcr.normalized, 'APPLE.COM/BILL');
  assert.equal(appleOcr.ambiguity, 'APPLE_BILL');

  const vodafoneOcr = buildMerchantFingerprint('VODAFON3 UK LIMITED');
  assert.equal(vodafoneOcr.normalized, 'VODAFONE');

  const talktalkOcr = buildMerchantFingerprint('TALK-TALK BROADBAND');
  assert.equal(talktalkOcr.normalized, 'TALKTALK');
});

test('Merchant fingerprint: resolves H3G to THREE UK only with bank context', () => {
  // With bank context (e.g. lloyds or Direct Debit marker)
  const withBank = buildMerchantFingerprint('H3G 9928374', { bankFormat: 'lloyds' });
  assert.equal(withBank.normalized, 'THREE UK');

  const withDd = buildMerchantFingerprint('DIRECT DEBIT H3G');
  assert.equal(withDd.normalized, 'THREE UK');

  // Without bank context: does NOT apply broad replacement
  const withoutBank = buildMerchantFingerprint('H3G STORE', { bankFormat: 'generic' });
  assert.ok(!withoutBank.normalized.includes('THREE UK'));
});

test('Merchant fingerprint: preserves Revolut plan fee identity across tiers', () => {
  const ultra = buildMerchantFingerprint('REVOLUT ULTRA PLAN FEE');
  const metal = buildMerchantFingerprint('REVOLUT METAL PLAN');
  const premium = buildMerchantFingerprint('REVOLUT PREMIUM PLAN');

  assert.equal(ultra.normalized, 'REVOLUT ULTRA PLAN');
  assert.equal(metal.normalized, 'REVOLUT METAL PLAN');
  assert.equal(premium.normalized, 'REVOLUT PREMIUM PLAN');

  assert.notEqual(ultra.fingerprint, metal.fingerprint);
  assert.notEqual(metal.fingerprint, premium.fingerprint);
});

test('Merchant fingerprint: preserves Apple price tiers without auto-merging different services', () => {
  const icloud = buildMerchantFingerprint('APPLE.COM/BILL', { amountGbp: 0.99 });
  const appleTv = buildMerchantFingerprint('APPLE.COM/BILL', { amountGbp: 8.99 });
  const appleOne = buildMerchantFingerprint('APPLE.COM/BILL', { amountGbp: 18.95 });

  assert.equal(icloud.ambiguity, 'APPLE_BILL');
  assert.equal(appleTv.ambiguity, 'APPLE_BILL');
  assert.equal(appleOne.ambiguity, 'APPLE_BILL');

  assert.ok(icloud.identityKey.includes('tier:99'));
  assert.ok(appleTv.identityKey.includes('tier:899'));
  assert.ok(appleOne.identityKey.includes('tier:1895'));

  assert.notEqual(icloud.fingerprint, appleTv.fingerprint);
  assert.notEqual(appleTv.fingerprint, appleOne.fingerprint);
});

test('Merchant fingerprint: Amazon retail does not automatically become Amazon Prime', () => {
  const retail = buildMerchantFingerprint('AMAZON EU SARL UK');
  const prime = buildMerchantFingerprint('AMAZON PRIME');

  assert.equal(retail.ambiguity, 'AMAZON_RETAIL');
  assert.equal(retail.normalized, 'AMAZON RETAIL');

  assert.equal(prime.ambiguity, null);
  assert.equal(prime.normalized, 'AMAZON PRIME');

  assert.notEqual(retail.fingerprint, prime.fingerprint);
});

test('Merchant fingerprint: Google Play stays ambiguous and separates Google One', () => {
  const play = buildMerchantFingerprint('GOOGLE PLAY APPS', { amountGbp: 4.99 });
  const one = buildMerchantFingerprint('GOOGLE ONE 100GB');

  assert.equal(play.ambiguity, 'GOOGLE_PLAY');
  assert.equal(one.ambiguity, null);
  assert.equal(one.normalized, 'GOOGLE ONE');
  assert.notEqual(play.fingerprint, one.fingerprint);
});

test('Merchant fingerprint: FNV-1a hash is deterministic and keeps raw description untouched', () => {
  const raw = '  15 MAY 2026 DIRECT DEBIT SPOTIFY UK  ';
  const fp1 = buildMerchantFingerprint(raw);
  const fp2 = buildMerchantFingerprint(raw);

  assert.equal(fp1.raw, raw, 'Original raw line must be preserved untouched');
  assert.equal(fp1.fingerprint, fp2.fingerprint);
  assert.equal(fp1.fingerprint.length, 8);
  assert.equal(fnv1a32('SPOTIFY'), fnv1a32('SPOTIFY'));
});

// ============================================================================
// 3. MATHEMATICAL RECURRENCE ENGINE TESTS
// ============================================================================

test('Recurrence math: weekly payments detected with 7-day mean interval', () => {
  const dates = ['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28'];
  const amounts = [5.0, 5.0, 5.0, 5.0];
  const summary = analyzeRecurrence(dates, amounts);

  assert.equal(summary.cycle, 'weekly');
  assert.equal(summary.meanIntervalDays, 7);
  assert.equal(summary.intervalStdDevDays, 0);
  assert.equal(summary.amountVariation, 0);
  assert.equal(summary.occurrences, 4);
});

test('Recurrence math: monthly payments detected with calendar and weekend shift tolerance', () => {
  // UK BACS weekend shift: 28, 31, 33 day intervals
  const dates = ['2026-01-01', '2026-02-01', '2026-03-04', '2026-04-06'];
  const amounts = [12.99, 12.99, 12.99, 12.99];
  const summary = analyzeRecurrence(dates, amounts);

  assert.equal(summary.cycle, 'monthly');
  assert.ok(summary.meanIntervalDays! >= 26 && summary.meanIntervalDays! <= 34);
  assert.equal(summary.amountVariation, 0);
  assert.ok(summary.confidence >= 0.7);
});

test('Recurrence math: annual recurrence detected at ~365 days', () => {
  const dates = ['2025-05-10', '2026-05-10'];
  const amounts = [99.99, 99.99];
  const summary = analyzeRecurrence(dates, amounts, { isKnownMerchant: true });

  assert.equal(summary.cycle, 'annual');
  assert.equal(summary.meanIntervalDays, 365);
  assert.equal(summary.classification, 'CONFIRMED_SUBSCRIPTION');
});

test('Recurrence math: irregular intervals and variable spending classified as ORDINARY_REPEATED_PURCHASE', () => {
  // Frequent irregular purchases at supermarket or cafe
  const dates = ['2026-01-02', '2026-01-05', '2026-01-14', '2026-01-18'];
  const amounts = [4.2, 18.5, 6.1, 42.0];
  const summary = analyzeRecurrence(dates, amounts);

  assert.equal(summary.classification, 'ORDINARY_REPEATED_PURCHASE');
  assert.equal(summary.cycle, null);
  assert.ok(summary.amountVariation! > 0.08);
});

test('Recurrence math: single occurrence is NEVER classified as recurring', () => {
  const summary = analyzeRecurrence(['2026-05-01'], [15.99], { isKnownMerchant: true, hasExplicitBankMarker: true });
  assert.equal(summary.classification, 'INSUFFICIENT_DATA');
  assert.equal(summary.cycle, null);
  assert.equal(summary.confidence, 0);
  assert.equal(summary.occurrences, 1);
});

test('Recurrence math: two occurrences classified as POSSIBLE_RECURRING for unknown merchant', () => {
  const dates = ['2026-01-01', '2026-02-01'];
  const amounts = [20.0, 20.0];
  const summary = analyzeRecurrence(dates, amounts, { isKnownMerchant: false, hasExplicitBankMarker: false });

  assert.equal(summary.classification, 'POSSIBLE_RECURRING');
  assert.equal(summary.cycle, 'monthly');
  assert.equal(summary.occurrences, 2);
});

test('Recurrence math: unknown merchant requires >= 3 consistent occurrences for STRONG candidate', () => {
  // 3 consistent occurrences
  const dates = ['2026-01-01', '2026-02-01', '2026-03-01'];
  const amounts = [29.99, 29.99, 29.99];
  const summary = analyzeRecurrence(dates, amounts, { isKnownMerchant: false, hasExplicitBankMarker: false });

  assert.ok(
    summary.classification === 'STRONG_RECURRING_CANDIDATE' || summary.classification === 'UNKNOWN_REQUIRES_CONFIRMATION',
  );
  assert.equal(summary.cycle, 'monthly');
  assert.equal(summary.occurrences, 3);
  assert.ok(summary.confidence >= 0.75);
});

test('Recurrence math: same-day duplicate transactions do not ruin interval calculation', () => {
  // 2 charges on Feb 1st, 1 on Jan 1st, 1 on Mar 1st
  const dates = ['2026-01-01', '2026-02-01', '2026-02-01', '2026-03-01'];
  const amounts = [10.0, 10.0, 10.0, 10.0];
  const summary = analyzeRecurrence(dates, amounts);

  assert.equal(summary.cycle, 'monthly');
  assert.equal(summary.occurrences, 4);
  assert.ok(summary.reasons.some((r) => r.includes('SAME_DAY_TRANSACTIONS')));
});

test('Recurrence math: mixed currencies are rejected as ordinary repeated purchase', () => {
  const dates = ['2026-01-01', '2026-02-01'];
  const amounts = [10.0, 10.0];
  const summary = analyzeRecurrence(dates, amounts, { currencies: ['GBP', 'EUR'] });

  assert.equal(summary.classification, 'ORDINARY_REPEATED_PURCHASE');
  assert.ok(summary.reasons.some((r) => r.includes('MIXED_CURRENCIES')));
});

test('Recurrence math: calculateExpectedNextDate projects future date from cycle', () => {
  const nextWeekly = calculateExpectedNextDate('2026-05-01', 'weekly');
  assert.equal(nextWeekly, '2026-05-08');

  const nextMonthly = calculateExpectedNextDate('2026-05-15', 'monthly');
  assert.equal(nextMonthly, '2026-06-15');

  const nextAnnual = calculateExpectedNextDate('2026-05-15', 'annual');
  assert.equal(nextAnnual, '2027-05-15');
});

// ============================================================================
// 4. PIPELINE INTEGRATION TESTS
// ============================================================================

test('Pipeline integration: ScannedTransaction receives normalizedMerchant and merchantFingerprint', () => {
  const lines = [
    '01/05/2026 NETFLIX.COM £15.99',
    '01/05/2026 DIRECT DEBIT THREE UK £12.00',
  ];
  const parsed = parseStatementLines(lines, new Date('2026-05-10T00:00:00Z'));
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].normalizedMerchant, 'NETFLIX');
  assert.ok(parsed[0].merchantFingerprint);
  assert.equal(parsed[0].merchantFingerprint.length, 8);

  assert.equal(parsed[1].normalizedMerchant, 'THREE UK');
  assert.ok(parsed[1].merchantFingerprint);
});

test('Pipeline integration: MatchedSubscription attaches mathematical RecurrenceSummary', () => {
  const lines = [
    '01/01/2026 SPOTIFY UK £10.99',
    '01/02/2026 SPOTIFY UK £10.99',
    '01/03/2026 SPOTIFY UK £10.99',
  ];
  const parsed = parseStatementLines(lines, new Date('2026-03-10T00:00:00Z'));
  const matched = matchStatementTransactions(parsed);

  assert.equal(matched.length, 1);
  const spotify = matched[0];
  assert.equal(spotify.serviceName, 'Spotify Premium');
  assert.ok(spotify.recurrence, 'RecurrenceSummary must be attached to MatchedSubscription');
  assert.equal(spotify.recurrence.cycle, 'monthly');
  assert.equal(spotify.recurrence.classification, 'CONFIRMED_SUBSCRIPTION');
  assert.equal(spotify.recurrence.occurrences, 3);
});

// ============================================================================
// 5. HISTORICAL STATEMENT & BANK FEE CLASSIFICATION TESTS
// ============================================================================

test('Statement date range: detects recent statement within 90 days', () => {
  const refDate = new Date('2026-05-15T12:00:00Z');
  const transactions = [
    { dateIso: '2026-04-01' },
    { dateIso: '2026-05-01' },
  ] as any;

  const range = detectStatementDateRange(transactions, refDate, DEFAULT_STATEMENT_FRESHNESS_DAYS);
  assert.equal(range.isHistorical, false);
  assert.equal(range.earliestIso, '2026-04-01');
  assert.equal(range.latestIso, '2026-05-01');
  assert.ok(range.statementAgeDays !== null && range.statementAgeDays < 90);
});

test('Statement date range: detects historical statement older than 90 days', () => {
  const refDate = new Date('2026-11-02T12:00:00Z');
  const transactions = [
    { dateIso: '2024-01-16' },
    { dateIso: '2024-02-01' },
    { dateIso: '2024-02-15' },
  ] as any;

  const range = detectStatementDateRange(transactions, refDate, DEFAULT_STATEMENT_FRESHNESS_DAYS);
  assert.equal(range.isHistorical, true);
  assert.equal(range.earliestIso, '2024-01-16');
  assert.equal(range.latestIso, '2024-02-15');
  assert.ok(range.statementAgeDays !== null && range.statementAgeDays > 90);
});

test('Item classification: separates bank fees from commercial subscriptions', () => {
  // Bank Account Fees
  assert.equal(classifyScannerItemType('Lloyds Account Fee', 'lloyds_account_fee_uk'), 'BANK_FEE');
  assert.equal(classifyScannerItemType('Account Fee', 'unknown-lloyds-fee', ['01 Feb 24 FEE ACCOUNT FEE 10.00']), 'BANK_FEE');
  assert.equal(classifyScannerItemType('Silver Account Fee', 'lloyds_silver_account_uk'), 'BANK_FEE');
  assert.equal(classifyScannerItemType('Monthly Service Fee', 'chase_service_fee_uk'), 'BANK_FEE');

  // Commercial Subscriptions
  assert.equal(classifyScannerItemType('Netflix UK', 'netflix_uk'), 'SUBSCRIPTION');
  assert.equal(classifyScannerItemType('Spotify Premium', 'spotify_uk'), 'SUBSCRIPTION');
  assert.equal(classifyScannerItemType('Three UK', 'three_uk'), 'SUBSCRIPTION');
  assert.equal(classifyScannerItemType('Apple iCloud', 'apple_icloud_uk'), 'SUBSCRIPTION');
});

test('Historical statement handling: preserves 2024 payment date without rolling forward to 2026', () => {
  const refDate = new Date('2026-11-02T12:00:00Z');
  const lines = [
    '16 Jan 24 to 15 Feb 24 Lloyds Bank Statement',
    '01 Feb 24 FEE ACCOUNT FEE 10.00 78.84',
  ];
  const parsed = parseStatementLines(lines, refDate);
  const matched = matchStatementTransactions(parsed, refDate);

  assert.equal(matched.length, 1);
  const item = matched[0];
  assert.equal(item.itemType, 'BANK_FEE');
  assert.equal(item.isHistorical, true);
  assert.equal(item.selected, false, 'Historical items must not be selected by default');
  assert.equal(item.lastPaymentDate, '2024-02-01');
  // Next payment must be 2024-03-01 (1 cycle ahead), NOT Dec 2026!
  assert.equal(item.nextBillingDate, '2024-03-01');

  // Draft conversion sets status to 'cancelled', not 'active'
  const draft = buildScannerSubscriptionDraft(item as any, undefined, '£', item.nextBillingDate);
  assert.equal(draft.status, 'cancelled');
  assert.equal(draft.price, 10.0);
});

test('Running-balance delta sign determination: quarantines confirmed credits lacking explicit plus or CR', () => {
  const refDate = new Date('2026-05-15T12:00:00Z');
  const lines = [
    '01/05/2026 SPOTIFY UK 10.99 100.00',  // First transaction: establishes balance of 100.00
    '02/05/2026 NETFLIX.COM 10.99 110.99', // Balance rose from 100.00 to 110.99 -> Confirmed Credit of 10.99!
  ];
  const parsed = parseStatementLines(lines, refDate);

  // NETFLIX was a credit (balance went up), so it must be quarantined and excluded from accepted debits!
  // SPOTIFY was a debit, so it must remain accepted!
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].cleanedMerchant, 'SPOTIFY UK');
  assert.equal(parsed[0].isCredit, false);
  assert.equal(parsed[0].amountGbp, 10.99);

  // In the audit ledger, verify Netflix was quarantined due to balance delta
  const auditLedger = parseStatementAuditLedger(lines, refDate);
  const netflixTx = auditLedger.find((tx) => tx.cleanedMerchant === 'NETFLIX.COM');
  assert.ok(netflixTx);
  assert.equal(netflixTx.status, 'QUARANTINED');
  assert.equal(netflixTx.isCredit, true);
  assert.equal(netflixTx.validityScore, 0);
  assert.ok(netflixTx.reasonCodes?.includes('BALANCE_REJECTED'));
});

test('Document date format consensus: detects DMY vs MDY reliably', () => {
  // Case 1: Standard UK statement with day > 12 in part 1
  const ukLines = [
    'Statement date: 15/04/2026',
    '25/04/2026 NETFLIX 10.99',
    '02/05/2026 SPOTIFY 9.99',
  ];
  assert.equal(detectDocumentDateFormat(ukLines), 'DMY');

  // Case 2: Ambiguous dates default to DMY for UK standard
  const ambiguousLines = [
    '01/02/2026 NETFLIX 10.99',
    '03/04/2026 SPOTIFY 9.99',
  ];
  assert.equal(detectDocumentDateFormat(ambiguousLines), 'DMY');

  // Case 3: US/PayPal statement with day > 12 in part 2 (e.g. MM/DD/YYYY)
  const usLines = [
    'Statement date: 04/25/2026',
    '05/18/2026 NETFLIX 10.99',
  ];
  assert.equal(detectDocumentDateFormat(usLines), 'MDY');

  // Case 4: extractUkDate respects format
  const parsedMdy = extractUkDate('04/25/2026', new Date('2026-06-01T12:00:00Z'), 'MDY');
  assert.ok(parsedMdy);
  assert.equal(parsedMdy.iso, '2026-04-25');

  // Case 5: End-to-end parseStatementLines handles MDY statement lines
  const parsedTransactions = parseStatementLines(
    [
      '04/25/2026 NETFLIX 10.99',
      '05/25/2026 NETFLIX 10.99',
    ],
    new Date('2026-06-01T12:00:00Z')
  );
  assert.equal(parsedTransactions.length, 2);
  assert.equal(parsedTransactions[0].dateIso, '2026-04-25');
  assert.equal(parsedTransactions[1].dateIso, '2026-05-25');
});

// ============================================================================
// 6. JPMORGAN CHASE STATEMENT PERIOD YEAR & MONZO APPLE TESTS
// ============================================================================

test('Chase date year: derives year from statement header period for dates without year', () => {
  const lines = [
    'January 01, 2025 through March 31, 2025',
    'Account Number: 000000695012222',
    '01/09 Card Purchase 01/09 Py *Forever Yogurt -26.51 5,433.94',
    '03/31 Monthly Service Fee -4.95 12,274.35',
  ];
  const period = extractStatementPeriod(lines);
  assert.ok(period);
  assert.equal(period.startYear, 2025);
  assert.equal(period.startMonth, 0); // Jan
  assert.equal(period.endYear, 2025);
  assert.equal(period.endMonth, 2);   // Mar

  const parsed = parseStatementLines(lines);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].dateIso, '2025-01-09');
  assert.equal(parsed[1].dateIso, '2025-03-31');

  // Verify matched items
  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].itemType, 'BANK_FEE');
  assert.equal(matched[0].lastPaymentDate, '2025-03-31');
  assert.equal(matched[0].nextBillingDate, '2025-04-30');
});

test('Chase date year: respects December/January cross-year boundary', () => {
  const period = extractStatementPeriod([
    'Statement Period: December 15, 2024 through January 15, 2025',
  ]);
  assert.ok(period);
  assert.equal(period.startYear, 2024);
  assert.equal(period.startMonth, 11);
  assert.equal(period.endYear, 2025);
  assert.equal(period.endMonth, 0);

  // Month 11 (December) must map to 2024
  assert.equal(resolveYearForMonth(11, period), 2024);
  // Month 0 (January) must map to 2025
  assert.equal(resolveYearForMonth(0, period), 2025);

  // extractUkDate with cross-year period
  const decDate = extractUkDate('12/20 Card Purchase', null, 'MDY', period);
  assert.ok(decDate);
  assert.equal(decDate.iso, '2024-12-20');

  const janDate = extractUkDate('01/05 Card Purchase', null, 'MDY', period);
  assert.ok(janDate);
  assert.equal(janDate.iso, '2025-01-05');
});

test('Chase date year: never guesses a year if statement context is missing or insufficient', () => {
  // If periodInfo is null and no date context is provided, short dates without year must return null
  assert.equal(resolveYearForMonth(5, null), null);

  const noContextDate = extractUkDate('01/09 Card Purchase', null, 'MDY', null);
  assert.equal(noContextDate, null);

  // parseStatementLines with no period and no year in lines must not invent dates
  const linesWithoutYear = [
    'Account Statement',
    '01/09 Unknown Purchase 15.00',
    '02/10 Unknown Purchase 15.00',
  ];
  const parsed = parseStatementLines(linesWithoutYear, null as any);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].dateIso, null);
  assert.equal(parsed[1].dateIso, null);
});

test('Chase date year: preserves existing dates that already contain a year', () => {
  // Explicit 3-part date with year must keep its own year, ignoring period
  const period = { startYear: 2024, startMonth: 0, endYear: 2024, endMonth: 11 };

  const explicitDmy = extractUkDate('15/01/2026 SPOTIFY 10.99', null, 'DMY', period);
  assert.ok(explicitDmy);
  assert.equal(explicitDmy.iso, '2026-01-15');

  const explicitMdy = extractUkDate('01/15/2026 SPOTIFY 10.99', null, 'MDY', period);
  assert.ok(explicitMdy);
  assert.equal(explicitMdy.iso, '2026-01-15');

  const explicitIso = extractUkDate('2026-01-15 SPOTIFY 10.99', null, 'DMY', period);
  assert.ok(explicitIso);
  assert.equal(explicitIso.iso, '2026-01-15');
});

test('Monzo Apple handling: isolates burst micro-transactions and separates price tiers', () => {
  // Bursts of in-app coin purchases across consecutive days from authentic Monzo statements
  const microTransactions: string[] = [
    // Burst £1.99 across days (intervals of 0-2 days)
    '30/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 81.23',
    '30/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 83.22',
    '28/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 443.19',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 186.36',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 191.34',
    '23/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 12.27',
    '22/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 85.89',
    '20/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 10.81',
    '19/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 131.71',
    '16/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 168.03',
    // Burst £2.99 across days
    '28/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 445.18',
    '27/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 314.01',
    '27/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 317.00',
    '27/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 319.99',
    '25/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 174.77',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 188.35',
    '23/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 6.29',
    '23/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 9.28',
    '20/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 7.82',
    '19/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 133.70',
    '19/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 136.69',
    '18/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -2.99 156.39',
    // Burst £0.99 across days
    '25/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 184.38',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 185.37',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 204.31',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 5.30',
    '21/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 35.84',
    '19/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -0.99 48.78',
    // And 2 genuine monthly recurrences (£11.99 and £4.99)
    '27/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -11.99 268.05',
    '27/02/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -11.99 500.00',
    '24/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -4.99 199.32',
    '24/02/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -4.99 600.00',
  ];

  const parsed = parseStatementLines(microTransactions);
  assert.equal(parsed.length, 32);

  const matched = matchStatementTransactions(parsed);
  // Only the 2 confirmed recurring tiers (£11.99 and £4.99) should be detected as subscriptions!
  // None of the burst micro-transactions (£1.99, £0.99, £2.99) should become subscriptions!
  assert.equal(matched.length, 2);
  const amounts = matched.map((m) => m.amountGbp).sort((a, b) => a - b);
  assert.deepEqual(amounts, [4.99, 11.99]);
  assert.equal(matched[0].serviceName, 'Apple Services');
  assert.equal(matched[1].serviceName, 'Apple Services');
  // Distinct price tiers must have different IDs
  assert.notEqual(matched[0].presetId, matched[1].presetId);
});

test('OCR statement lines: parses unspaced dates, pipes, and OCR month artifacts accurately', () => {
  const ocrLines = [
    '05May26 | EE LIMITED | DEB | 62.69 | 514.15',
    '11Jan24 | APPLE.COM/BILL | DEB | 2.99 | 96.34',
    '024an24 | PAYPAL SPOTIFY | DEB | 10.99 | 344.93',
    '24SEP | Card Transaction 7248 CD LIDL GB NOTTINGHAM | 10.36 | 79.38',
  ];
  const parsed = parseStatementLines(ocrLines, new Date('2026-06-01T12:00:00Z'));
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].dateIso, '2026-05-05');
  assert.equal(parsed[0].amountGbp, 62.69);
  assert.equal(parsed[1].dateIso, '2024-01-11');
  assert.equal(parsed[1].amountGbp, 2.99);
  assert.equal(parsed[2].dateIso, '2024-01-02');
  assert.equal(parsed[2].amountGbp, 10.99);
  assert.ok(parsed[3].dateIso?.endsWith('-09-24'));
  assert.equal(parsed[3].amountGbp, 10.36);
});
