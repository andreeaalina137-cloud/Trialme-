import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatementFromOcrDocument,
  detectSpatialColumnsFromOcr,
  classifyOcrColumn,
  deduplicateOcrTokens,
  sanitizeBbox,
  ocrTokensToSpatialGlyphs,
  type OcrDocument,
  type OcrToken,
  type OcrStructuredLine,
} from '../src/scanner/services/ocrScannerBridge';
import {
  parseStatementLines,
  extractGbpAmount,
} from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';

// Helper to construct a synthetic OcrDocument for targeted regression tests
function makeMockOcrDocument(lines: Array<{
  text: string;
  confidence?: number;
  tokens?: Array<{ text: string; confidence?: number; x0?: number; y0?: number; x1?: number; y1?: number }>;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}>): OcrDocument {
  const structuredLines: OcrStructuredLine[] = lines.map((l, idx) => {
    const lineConf = l.confidence ?? 95;
    const lineTokens: OcrToken[] = l.tokens
      ? l.tokens.map((t, tIdx) => ({
          text: t.text,
          confidence: t.confidence ?? lineConf,
          bbox: {
            x0: t.x0 ?? (l.x0 ?? 50) + tIdx * 60,
            y0: t.y0 ?? (l.y0 ?? 100 + idx * 25),
            x1: t.x1 ?? (l.x0 ?? 50) + tIdx * 60 + t.text.length * 8,
            y1: t.y1 ?? (l.y0 ?? 100 + idx * 25) + 16,
            width: t.text.length * 8,
            height: 16,
          },
          page: 1,
        }))
      : l.text.split(/\s+/).map((word, wIdx) => ({
          text: word,
          confidence: lineConf,
          bbox: {
            x0: (l.x0 ?? 50) + wIdx * 60,
            y0: (l.y0 ?? 100 + idx * 25),
            x1: (l.x0 ?? 50) + wIdx * 60 + word.length * 8,
            y1: (l.y0 ?? 100 + idx * 25) + 16,
            width: word.length * 8,
            height: 16,
          },
          page: 1,
        }));

    return {
      rawText: l.text,
      normalizedText: l.text,
      page: 1,
      confidence: lineConf,
      bbox: {
        x0: l.x0 ?? 50,
        y0: l.y0 ?? 100 + idx * 25,
        x1: l.x1 ?? 500,
        y1: l.y1 ?? 100 + idx * 25 + 16,
        width: 450,
        height: 16,
      },
      tokens: lineTokens,
      readingOrder: idx,
      isLowConfidence: lineConf < 60,
    };
  });

  const allTokens = structuredLines.flatMap((sl) => sl.tokens);
  const avgConf =
    structuredLines.length > 0
      ? structuredLines.reduce((acc, l) => acc + l.confidence, 0) / structuredLines.length
      : 100;

  return {
    rawText: lines.map((l) => l.text).join('\n'),
    lines: lines.map((l) => l.text),
    structuredLines,
    tokens: allTokens,
    confidence: Math.round(avgConf),
    engine: 'mock',
    pageCount: 1,
  };
}

// ---------------------------------------------------------------------------
// 1. OCR text with coordinates
// ---------------------------------------------------------------------------
test('Bridge Test 1: OCR text with coordinates preserves original tokens, bounding boxes, confidence, and normalized values', () => {
  const ocrDoc = makeMockOcrDocument([
    {
      text: '02 Oct 2026 Direct Debit SPOTIFYUK 11.99',
      confidence: 96,
      tokens: [
        { text: '02', x0: 50, y0: 100, x1: 65, y1: 116, confidence: 98 },
        { text: 'Oct', x0: 70, y0: 100, x1: 95, y1: 116, confidence: 97 },
        { text: '2026', x0: 100, y0: 100, x1: 135, y1: 116, confidence: 99 },
        { text: 'Direct', x0: 145, y0: 100, x1: 185, y1: 116, confidence: 95 },
        { text: 'Debit', x0: 190, y0: 100, x1: 225, y1: 116, confidence: 95 },
        { text: 'SPOTIFYUK', x0: 235, y0: 100, x1: 310, y1: 116, confidence: 94 },
        { text: '11.99', x0: 380, y0: 100, x1: 420, y1: 116, confidence: 98 },
      ],
    },
  ]);

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2026-10-15T12:00:00Z'));
  assert.equal(txs.length, 1);
  const tx = txs[0];
  assert.equal(tx.amountGbp, 11.99);
  assert.equal(tx.dateIso, '2026-10-02');
  assert.ok(tx.ocrEvidence, 'Transaction must contain attached OCR evidence');
  assert.equal(tx.ocrEvidence?.confidence, 96);
  assert.equal(tx.ocrEvidence?.tokens.length, 7);
  assert.equal(tx.ocrEvidence?.tokens[5].text, 'SPOTIFYUK');
  assert.equal(tx.ocrEvidence?.tokens[5].bbox.x0, 235);
  assert.equal(tx.ocrEvidence?.tokens[6].text, '11.99');
  assert.equal(tx.ocrEvidence?.tokens[6].bbox.x0, 380);
});

// ---------------------------------------------------------------------------
// 2. Low-confidence amount recognition
// ---------------------------------------------------------------------------
test('Bridge Test 2: Low-confidence amount recognition flags OCR_UNCERTAIN and quarantines ambiguous amounts', () => {
  const ocrDoc = makeMockOcrDocument([
    {
      text: '05 Oct 2026 CARD PAYMENT TO NETFLIX.COM 10.99',
      confidence: 45, // Low overall line confidence
      tokens: [
        { text: '05', confidence: 90 },
        { text: 'Oct', confidence: 90 },
        { text: '2026', confidence: 90 },
        { text: 'CARD', confidence: 85 },
        { text: 'PAYMENT', confidence: 85 },
        { text: 'TO', confidence: 85 },
        { text: 'NETFLIX.COM', confidence: 85 },
        { text: '10.99', confidence: 38 }, // Amount token confidence is < 60%
      ],
    },
  ]);

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2026-10-15T12:00:00Z'));
  // Because confidence was low and no running balance proved it, the transaction must NOT be accepted blindly
  assert.equal(txs.length, 0, 'Uncertain OCR amount without balance delta confirmation must not be accepted into active subscriptions');
});

// ---------------------------------------------------------------------------
// 3. £5.00 versus £500
// ---------------------------------------------------------------------------
test('Bridge Test 3: £5.00 versus £500 unpunctuated integer is never extracted as £500, but reconciles to £5.00 if balance delta confirms it', () => {
  // Scenario A: Without balance delta confirmation, unpunctuated 500 is rejected / not accepted as £500
  const unpunctuatedLine = '18 Jan 2024 | NATIONAL LOTTERY | DEB 500 020';
  const rawGbp = extractGbpAmount(unpunctuatedLine);
  assert.equal(rawGbp, null, 'Unpunctuated 500 must never be extracted as £500');

  // Scenario B: With explicit running balance movement (Balance 5.29 -> Balance 0.29, delta = 5.00)
  const ocrDocWithBalanceProof = makeMockOcrDocument([
    { text: '17 Jan 2024 VODAFONE LTD 38.55 5.29' },
    { text: '18 Jan 2024 NATIONAL LOTTERY 5.00 0.29' },
  ]);
  const txs = parseStatementFromOcrDocument(ocrDocWithBalanceProof, new Date('2024-02-01T12:00:00Z'));
  const lotteryTx = txs.find((t) => t.cleanedMerchant.includes('NATIONAL LOTTERY'));
  assert.ok(lotteryTx, 'National Lottery must be parsed');
  assert.equal(lotteryTx?.amountGbp, 5.00, 'Reconciled lottery transaction must be £5.00, never £500');
});

// ---------------------------------------------------------------------------
// 4. Date recognition with card reference prefixes
// ---------------------------------------------------------------------------
test('Bridge Test 4: Date recognition with card reference prefixes correctly isolates authorization date and merchant', () => {
  const ocrDoc = makeMockOcrDocument([
    { text: 'Card Transaction 7248 23SEP25 CD LIDL GB NOTTINGHAM CAR LIDL GB NOTTI GB 10.36 79.38' },
    { text: 'Card Transaction 9911 26SEP25 D CLEARPAY CLEARPAY.CO.U GB 3.72 80.66' },
  ]);

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2025-10-01T12:00:00Z'));
  assert.equal(txs.length, 2);
  assert.equal(txs[0].dateIso, '2025-09-23');
  assert.equal(txs[0].amountGbp, 10.36);
  assert.equal(txs[0].referenceToken, '7248');
  assert.equal(txs[0].cleanedMerchant, 'LIDL NOTTINGHAM CAR LIDL NOTTI');

  assert.equal(txs[1].dateIso, '2025-09-26');
  assert.equal(txs[1].amountGbp, 3.72);
  assert.equal(txs[1].referenceToken, '9911');
  assert.equal(txs[1].cleanedMerchant, 'CLEARPAY CLEARPAY.CO.U');
});

// ---------------------------------------------------------------------------
// 5. Multi-line transaction descriptions
// ---------------------------------------------------------------------------
test('Bridge Test 5: Multi-line transaction descriptions attach aligned continuation lines without merging separate transactions', () => {
  const ocrDoc = makeMockOcrDocument([
    { text: '04 Oct 2026 Spotify AB 11.99' },
    { text: 'To: Spotify Premium Family Subscription' },
    { text: '06 Oct 2026 Netflix.com 17.99' },
  ]);

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2026-10-15T12:00:00Z'));
  assert.equal(txs.length, 2);
  assert.equal(txs[0].amountGbp, 11.99);
  assert.ok(/Spotify Premium Family Subscription/i.test(txs[0].rawLine), 'Continuation line must be attached to parent Spotify transaction');
  assert.equal(txs[1].amountGbp, 17.99);
  assert.equal(txs[1].dateIso, '2026-10-06');
});

// ---------------------------------------------------------------------------
// 6. Money In versus Money Out
// ---------------------------------------------------------------------------
test('Bridge Test 6: Money In versus Money Out classifies credits and debits using spatial column anchors', () => {
  // Table header establishing distinct column X-coordinates:
  // Date (x1=100) | Description (x1=250) | Money In (x1=380) | Money Out (x1=480) | Balance (x1=580)
  const ocrDoc = makeMockOcrDocument([
    {
      text: 'Date Description Money In Money Out Balance',
      tokens: [
        { text: 'Date', x0: 50, x1: 100 },
        { text: 'Description', x0: 110, x1: 250 },
        { text: 'Money In', x0: 300, x1: 380 },
        { text: 'Money Out', x0: 400, x1: 480 },
        { text: 'Balance', x0: 500, x1: 580 },
      ],
    },
    {
      text: '05 May 2026 HMRC CHILD BENEFIT 108.20 718.72',
      tokens: [
        { text: '05 May 2026', x0: 50, x1: 100 },
        { text: 'HMRC CHILD BENEFIT', x0: 110, x1: 250 },
        { text: '108.20', x0: 310, x1: 380 }, // In the Money In column (Credit)
        { text: '718.72', x0: 510, x1: 580 }, // In the Balance column
      ],
    },
    {
      text: '05 May 2026 EE LIMITED 62.69 656.03',
      tokens: [
        { text: '05 May 2026', x0: 50, x1: 100 },
        { text: 'EE LIMITED', x0: 110, x1: 250 },
        { text: '62.69', x0: 410, x1: 480 }, // In the Money Out column (Debit)
        { text: '656.03', x0: 510, x1: 580 }, // In the Balance column
      ],
    },
  ]);

  const anchors = detectSpatialColumnsFromOcr(ocrDoc);
  assert.ok(anchors, 'Column anchors must be detected from table header');
  assert.equal(classifyOcrColumn(375, anchors), 'MONEY_IN');
  assert.equal(classifyOcrColumn(475, anchors), 'MONEY_OUT');
  assert.equal(classifyOcrColumn(575, anchors), 'BALANCE');

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2026-05-15T12:00:00Z'));
  // Child benefit is Money In (Credit) so it must not be accepted as a recurring subscription debit
  const benefitTx = txs.find((t) => t.cleanedMerchant.includes('CHILD BENEFIT'));
  assert.equal(benefitTx, undefined, 'Money In credit must not be extracted as an outgoing subscription debit');

  // EE Limited is Money Out (Debit) so it must be accepted (cleanMerchantName normalizes LIMITED)
  const eeTx = txs.find((t) => t.cleanedMerchant.includes('EE'));
  assert.ok(eeTx, 'Money Out debit must be extracted');
  assert.equal(eeTx?.amountGbp, 62.69);
  assert.equal(eeTx?.isCredit, false);
});

// ---------------------------------------------------------------------------
// 7. Running-balance reconciliation
// ---------------------------------------------------------------------------
test('Bridge Test 7: Running-balance reconciliation resolves low-confidence OCR amount when mathematical delta confirms it', () => {
  // Line with amount 14.99 and low confidence, but running balances prove exact delta (100.00 - 85.01 = 14.99)
  const ocrDoc = makeMockOcrDocument([
    { text: '01 Oct 2026 Opening Balance 100.00' },
    {
      text: '02 Oct 2026 Gym Membership 14.99 85.01',
      confidence: 50,
      tokens: [
        { text: '02', confidence: 90 },
        { text: 'Oct', confidence: 90 },
        { text: '2026', confidence: 90 },
        { text: 'Gym', confidence: 80 },
        { text: 'Membership', confidence: 80 },
        { text: '14.99', confidence: 48 }, // Low confidence amount token
        { text: '85.01', confidence: 90 },
      ],
    },
  ]);

  const txs = parseStatementFromOcrDocument(ocrDoc, new Date('2026-10-15T12:00:00Z'));
  assert.equal(txs.length, 1);
  assert.equal(txs[0].amountGbp, 14.99);
  assert.ok(txs[0].ocrEvidence?.isLowConfidence);
  assert.ok(txs[0].balanceEvidence?.reconciled, 'Mathematical delta must verify the transaction');
});

// ---------------------------------------------------------------------------
// 8. Duplicate OCR tokens
// ---------------------------------------------------------------------------
test('Bridge Test 8: Duplicate OCR tokens eliminates overlapping duplicate words generated by OCR over-sampling', () => {
  const noisyTokens: OcrToken[] = [
    { text: 'NETFLIX', confidence: 92, bbox: { x0: 100, y0: 200, x1: 170, y1: 216, width: 70, height: 16 } },
    { text: 'NETFLIX', confidence: 88, bbox: { x0: 101, y0: 201, x1: 171, y1: 217, width: 70, height: 16 } }, // Duplicate overlap
    { text: '10.99', confidence: 95, bbox: { x0: 300, y0: 200, x1: 345, y1: 216, width: 45, height: 16 } },
  ];

  const deduped = deduplicateOcrTokens(noisyTokens);
  assert.equal(deduped.length, 2, 'Duplicate overlapping token must be eliminated');
  assert.equal(deduped[0].text, 'NETFLIX');
  assert.equal(deduped[1].text, '10.99');
});

// ---------------------------------------------------------------------------
// 9. Missing or invalid OCR coordinates
// ---------------------------------------------------------------------------
test('Bridge Test 9: Missing or invalid OCR coordinates sanitizes NaN, negative, or inverted coordinates gracefully without crashing', () => {
  const malformedBbox = {
    x0: NaN,
    y0: -10,
    x1: 50,
    y1: NaN,
  };
  const sanitized = sanitizeBbox(malformedBbox);
  assert.equal(sanitized.x0, 0);
  assert.equal(sanitized.y0, 0);
  assert.equal(sanitized.x1, 50);
  assert.equal(sanitized.y1, 0);
  assert.equal(Number.isFinite(sanitized.width), true);
  assert.equal(Number.isFinite(sanitized.height), true);

  const glyphs = ocrTokensToSpatialGlyphs([
    { text: 'Test', confidence: 90, bbox: sanitized },
  ]);
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].str, 'Test');
  assert.equal(glyphs[0].x, 0);
});

// ---------------------------------------------------------------------------
// 10. Existing native PDF extraction remaining unchanged
// ---------------------------------------------------------------------------
test('Bridge Test 10: Existing native PDF extraction remains completely unchanged and operates identically', () => {
  const nativePdfLines = [
    '01 OCT 2026 CARD PAYMENT TO NETFLIX.COM LONDON 10.99 GBR',
    '03 OCT 2026 DIRECT DEBIT TO SPOTIFYUK LONDON 11.99',
    '05 OCT 2026 DIRECT DEBIT PUREGYM LTD 19.99',
  ];
  // Direct call to existing scanner engine without OCR document
  const parsed = parseStatementLines(nativePdfLines, new Date('2026-10-15T12:00:00Z'));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].amountGbp, 10.99);
  assert.equal(parsed[1].amountGbp, 11.99);
  assert.equal(parsed[2].amountGbp, 19.99);

  const matched = matchStatementTransactions(parsed, new Date('2026-10-15T12:00:00Z'));
  assert.equal(matched.length, 3);
  assert.equal(matched.some((m) => m.presetId === 'netflix_standard_uk'), true);
  assert.equal(matched.some((m) => m.presetId === 'spotify_premium_uk'), true);
  assert.equal(matched.some((m) => m.presetId === 'puregym_core_uk'), true);
});
