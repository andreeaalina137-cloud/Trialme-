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
import { parseStatementLines } from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';

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
