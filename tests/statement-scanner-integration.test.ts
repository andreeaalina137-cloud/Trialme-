import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'zlib';
import { parseStatementLines, extractGbpAmount, extractUkDate } from '../src/scanner/services/ukBankCleaner';
import {
  calculateDaysUntilNextPayment,
  calculateNextBillingDate,
  matchStatementTransactions,
} from '../src/scanner/services/statementMatcher';
import { extractPdfText } from '../src/scanner/services/pdfTextExtractor';
import { detectBankFormat } from '../src/scanner/services/bankFormatDetector';
import { normalizeStatementLines } from '../src/scanner/services/statementNormalizer';
import { buildScannerSubscriptionDraft } from '../src/scanner/services/scannerSubscriptionDraft';
import {
  BARCLAYS_SAMPLE_LINES,
  REVOLUT_SAMPLE_LINES,
  DEMO_UK_STATEMENT_LINES,
} from '../src/scanner/types/scanner.types';

test('Offline Statement Scanner: Detects all 7 core UK subscriptions with 100% precision', () => {
  const cleanUkStatementLines = [
    '01/10/2026 CARD PAYMENT TO NETFLIX.COM £10.99',
    '02/10/2026 DIRECT DEBIT TO SPOTIFY UK £11.99',
    '03/10/2026 AMAZON PRIME £8.99',
    '04/10/2026 DISNEY PLUS £7.99',
    '05/10/2026 YOUTUBE PREMIUM £12.99',
    '06/10/2026 MICROSOFT 365 £5.99',
    '07/10/2026 GOOGLE ONE £1.99',
  ];

  const parsed = parseStatementLines(cleanUkStatementLines);
  assert.equal(parsed.length, 7, 'All 7 transactions should be parsed');

  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 7, 'All 7 subscriptions should be matched');

  const nameMap = new Map(matched.map((m) => [m.presetId, m]));

  // 1. Netflix
  const netflix = nameMap.get('netflix_standard_uk');
  assert.ok(netflix, 'Netflix must be detected');
  assert.equal(netflix.amountGbp, 10.99);

  // 2. Spotify
  const spotify = nameMap.get('spotify_premium_uk');
  assert.ok(spotify, 'Spotify must be detected');
  assert.equal(spotify.amountGbp, 11.99);

  // 3. Amazon Prime
  const amazon = nameMap.get('amazon_prime_uk');
  assert.ok(amazon, 'Amazon Prime must be detected');
  assert.equal(amazon.amountGbp, 8.99);

  // 4. Disney Plus
  const disney = nameMap.get('disney_plus_uk');
  assert.ok(disney, 'Disney Plus must be detected');
  assert.equal(disney.amountGbp, 7.99);

  // 5. YouTube Premium
  const youtube = nameMap.get('youtube_premium_uk');
  assert.ok(youtube, 'YouTube Premium must be detected');
  assert.equal(youtube.amountGbp, 12.99);

  // 6. Microsoft 365
  const msft = nameMap.get('microsoft_365_personal_uk');
  assert.ok(msft, 'Microsoft 365 must be detected');
  assert.equal(msft.amountGbp, 5.99);

  // 7. Google One
  const google = nameMap.get('google_one_ai_uk');
  assert.ok(google, 'Google One must be detected');
  assert.equal(google.amountGbp, 1.99);
});

test('Offline Statement Scanner: Preserves extracted prices across multi-line PDF transactions', () => {
  const pdfRows = [
    '03 Oct | Monthly subscription',
    'NETFLIX.COM',
    '£10.99',
    '05 Oct | SPOTIFY UK - Premium plan | £11.99',
    '08 Oct | AMAZON PRIME Membership | £8.99',
    '12 Oct | DISNEY PLUS - Monthly plan | £7.99',
    '16 Oct | YOUTUBE PREMIUM - Individual | £12.99',
    '20 Oct | MICROSOFT 365 - Personal',
    '£5.99',
    '24 Oct | GOOGLE ONE 100 GB plan',
    '£1.99',
  ];

  const parsed = parseStatementLines(pdfRows, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);
  const amounts = new Map(matched.map((item) => [item.presetId, item.amountGbp]));

  assert.equal(matched.length, 7, 'All 7 PDF transactions should be matched');
  assert.equal(amounts.get('netflix_standard_uk'), 10.99);
  assert.equal(amounts.get('spotify_premium_uk'), 11.99);
  assert.equal(amounts.get('amazon_prime_uk'), 8.99);
  assert.equal(amounts.get('disney_plus_uk'), 7.99);
  assert.equal(amounts.get('youtube_premium_uk'), 12.99);
  assert.equal(amounts.get('microsoft_365_personal_uk'), 5.99);
  assert.equal(amounts.get('google_one_ai_uk'), 1.99);
});

test('Offline Statement Scanner: Matches Google and Microsoft bank aliases without treating plan numbers as amounts', () => {
  const parsed = parseStatementLines([
    '01/10/2026 GOOGLE*GOOGLE ONE £1.99',
    '02/10/2026 GOOGLE ONE £1.99',
    '03/10/2026 GOOGLE *SERVICES £1.99',
    '04/10/2026 G.CO/HELPAY# £1.99',
    '05/10/2026 MICROSOFT 365 £5.99',
    '06/10/2026 MSFT * £5.99',
    '07/10/2026 MICROSOFT* £5.99',
    '08/10/2026 OFFICE 365 £5.99',
  ]);

  const matched = matchStatementTransactions(parsed);
  assert.ok(matched.some((item) => item.presetId === 'google_one_ai_uk'));
  assert.ok(matched.some((item) => item.presetId === 'microsoft_365_personal_uk'));
  assert.ok(parsed.every((item) => item.amountGbp < 10), 'Plan numbers must not become transaction amounts');
});

test('Offline Statement Scanner: Processes the generated UK CSV statement end-to-end', () => {
  const csvLines = readFileSync('tests/fixtures/uk-bank-statement-sample.csv', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = parseStatementLines(csvLines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);

  assert.equal(parsed.length, 20);
  assert.equal(matched.length, 20);
  assert.equal(matched.find((item) => item.presetId === 'google_one_ai_uk')?.amountGbp, 1.99);
  assert.equal(matched.find((item) => item.presetId === 'microsoft_365_personal_uk')?.amountGbp, 5.99);
  assert.equal(matched.find((item) => item.presetId === 'netflix_standard_uk')?.amountGbp, 13.99);
});

test('Offline Statement Scanner: Recovers abbreviated OCR merchants and exposes new recurring merchants', () => {
  const parsed = parseStatementLines([
    '01/10/2026 NTFLIX 10.99',
    '02/10/2026 SPTFY 11.99',
    '03/10/2026 MCRSFT 365 5.99',
    '04/10/2026 NEWVIDEOCO MEMBERSHIP 4.50',
    '04/11/2026 NEWVIDEOCO MEMBERSHIP 4.50',
  ]);
  const matched = matchStatementTransactions(parsed);

  assert.ok(matched.some((item) => item.presetId === 'netflix_standard_uk'));
  assert.ok(matched.some((item) => item.presetId === 'spotify_premium_uk'));
  assert.ok(matched.some((item) => item.presetId === 'microsoft_365_personal_uk'));
  const unknown = matched.find((item) => item.presetId.startsWith('unknown-'));
  assert.ok(unknown, 'New recurring merchants should be offered as importable matches');
  assert.equal(unknown?.amountGbp, 4.5);
  assert.equal(unknown?.isVerifiedRecurring, true);
});

test('Offline Statement Scanner: Handles ISO CSV dates, credits, and foreign currencies safely', () => {
  const parsed = parseStatementLines([
    'Date,Description,Amount,Currency,Type',
    '2026-10-01,NETFLIX.COM,10.99,GBP,Debit',
    '2026-10-02,REFUND FROM STORE,5.00,GBP,Credit',
    '2026-10-03,REVOLUT EUR CARD PAYMENT,12.50,EUR,Debit',
  ]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].amountGbp, 10.99);
  assert.equal(parsed[0].dateIso, '2026-10-01');
});

test('Offline Statement Scanner: Handles UK dashed/dotted dates and quoted CSV fields', () => {
  assert.deepEqual(extractUkDate('15-10-2026 NETFLIX 10.99'), {
    iso: '2026-10-15',
    billingDay: 15,
  });
  assert.deepEqual(extractUkDate('15.10.2026 SPOTIFY 11.99'), {
    iso: '2026-10-15',
    billingDay: 15,
  });

  const parsed = parseStatementLines([
    'Date,Description,Amount,Currency,Notes',
    '15-10-2026,"NETFLIX.COM, UK",10.99,GBP,"Monthly plan"',
    '16.10.2026;"SPOTIFY UK; PREMIUM";11.99;GBP;Monthly',
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].cleanedMerchant.includes('NETFLIX'), true);
  assert.equal(parsed[0].amountGbp, 10.99);
  assert.equal(parsed[1].amountGbp, 11.99);
});

test('Offline Statement Scanner: preserves transaction anchor and rolls next payment by cycle', () => {
  const reference = new Date('2026-10-31T12:00:00');
  assert.equal(calculateNextBillingDate('2026-09-15', 'Monthly', reference), '2026-11-15');
  assert.equal(calculateNextBillingDate('2025-12-15', 'Annual', reference), '2026-12-15');
  assert.equal(calculateNextBillingDate('2026-01-31', 'Monthly', new Date('2026-02-15T12:00:00')), '2026-02-28');
  assert.equal(calculateDaysUntilNextPayment('2026-11-15', reference), 15);

  const matched = matchStatementTransactions(
    ['15 Oct 2026 NETFLIX.COM £10.99'].map((line) => ({
      rawLine: line,
      cleanedMerchant: 'NETFLIX.COM',
      amountGbp: 10.99,
      dateIso: '2026-10-15',
      billingDay: 15,
      isCredit: false,
      isHighValueTransfer: false,
    })),
    reference,
  );
  assert.equal(matched[0].lastPaymentDate, '2026-10-15');
  assert.equal(matched[0].nextBillingDate, '2026-11-15');
  assert.equal(matched[0].daysUntilNextPayment, 15);
});

test('Scanner preview workflow: edited category and date are persisted in the import draft', () => {
  const draft = buildScannerSubscriptionDraft(
    {
      id: 'scan-netflix',
      name: 'Netflix',
      price: 10.99,
      currency: '£',
      frequency: 'monthly',
      category: 'Utilities',
      confidence: 0.99,
      selected: true,
      nextPaymentDate: '2026-11-15',
      lastPaymentDate: '2026-10-15',
      daysUntilNextPayment: 15,
    },
    undefined,
    '£',
    '2026-12-15',
  );
  assert.equal(draft.category, 'Utilities');
  assert.equal(draft.nextPaymentDate, '2026-11-15');
  assert.equal(draft.price, 10.99);
});

test('Scanner preview workflow: preserves annual billing and fallback date', () => {
  const draft = buildScannerSubscriptionDraft(
    {
      id: 'scan-tv',
      name: 'Annual Service',
      price: 99,
      currency: '£',
      frequency: 'yearly',
      category: 'Utilities',
      confidence: 0.8,
      selected: true,
      nextPaymentDate: null,
    },
    undefined,
    '£',
    '2027-01-31',
  );
  assert.equal(draft.frequency, 'yearly');
  assert.equal(draft.nextPaymentDate, '2027-01-31');
});

test('Scanner preview workflow: fallback preset data remains available for unknown price/category fields', () => {
  const draft = buildScannerSubscriptionDraft(
    {
      id: 'scan-unknown-price',
      name: 'Netflix',
      price: 0,
      currency: '',
      frequency: 'monthly',
      category: 'Streaming',
      confidence: 0.7,
      selected: true,
    },
    {
      id: 'netflix_standard_uk',
      name: 'Netflix UK Standard',
      category: 'Streaming',
      monthly_price_gbp: 13.99,
      has_free_trial: false,
      trial_duration_days: 0,
      trial_type: 'none',
      notes: 'Local preset',
      cancel_url: 'https://www.netflix.com',
    },
    '£',
    '2026-11-01',
  );
  assert.equal(draft.price, 13.99);
  assert.equal(draft.cancelUrl, 'https://www.netflix.com');
});

test('Offline Statement Scanner: explicit GBP charge wins over Revolut FX values', () => {
  assert.equal(
    extractGbpAmount('GOOGLE ONE FX rate 1.86 GBP converted charge \u00A31.99'),
    1.99,
  );
  assert.equal(
    extractGbpAmount('GOOGLE ONE 1.86 GBP'),
    1.86,
  );
});

test('Offline Statement Scanner: normalizes OCR spacing and detects bank format conservatively', () => {
  const normalized = normalizeStatementLines([
    '15 Oct 2026  N E T F L I X . C O M  £10.99',
    'S P O T I F Y  £11.99',
  ]);
  assert.equal(normalized[0].includes('NETFLIX.COM'), true);
  assert.equal(normalized[1].includes('SPOTIFY'), true);

  const revolut = detectBankFormat(['Revolut', 'Card Payment', 'GOOGLE *Google One £1.99']);
  assert.equal(revolut.format, 'revolut');
  assert.equal(revolut.requiresReview, false);

  const unknown = detectBankFormat(['Date Description Amount', 'NETFLIX.COM £10.99']);
  assert.equal(unknown.format, 'generic');
  assert.equal(unknown.requiresReview, true);
});

test('Offline Statement Scanner: Detects subscriptions from FlateDecode compressed PDF', async () => {
  const streamContent = `BT
/F1 12 Tf
72 700 Td
(01/10/2026) Tj
120 0 Td (Netflix) Tj
200 0 Td (£10.99) Tj
T*
(02/10/2026) Tj
120 0 Td (Spotify UK) Tj
200 0 Td (£11.99) Tj
T*
(03/10/2026) Tj
120 0 Td (Amazon Prime) Tj
200 0 Td (£8.99) Tj
T*
(04/10/2026) Tj
120 0 Td (Disney+) Tj
200 0 Td (£7.99) Tj
T*
(05/10/2026) Tj
120 0 Td (YouTube Premium) Tj
200 0 Td (£12.99) Tj
T*
(06/10/2026) Tj
120 0 Td (Microsoft 365) Tj
200 0 Td (£5.99) Tj
T*
(07/10/2026) Tj
120 0 Td (Google One) Tj
200 0 Td (£1.99) Tj
ET`;

  const compressed = zlib.deflateSync(Buffer.from(streamContent));
  const header = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Filter /FlateDecode /Length ${compressed.length} >>
stream
`;
  const footer = `
endstream
endobj
xref
0 6
trailer << /Size 6 /Root 1 0 R >>
startxref
500
%%EOF`;

  const fullPdf = Buffer.concat([
    Buffer.from(header, 'binary'),
    compressed,
    Buffer.from(footer, 'binary'),
  ]);

  const file = new File([fullPdf], 'statement.pdf', { type: 'application/pdf' });
  const extracted = await extractPdfText(file);
  assert.equal(extracted.lines.length, 7, 'Native PDF extractor must decompress and extract all 7 lines');

  const parsed = parseStatementLines(extracted.lines);
  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 7, 'All 7 subscriptions must be matched from compressed PDF');
});

test('Offline Statement Scanner: Disney+ with plus sign is never dropped as credit', () => {
  const line = '04/10/2026 DISNEY+ 7.99';
  const parsed = parseStatementLines([line]);
  assert.equal(parsed.length, 1, 'Disney+ should not be dropped by credit check');
  assert.equal(parsed[0].amountGbp, 7.99);

  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].presetId, 'disney_plus_uk');
});

test('Offline Statement Scanner: Extract amount with balance column', () => {
  assert.equal(extractGbpAmount('01/10/2026 NETFLIX.COM 10.99 1450.20'), 10.99);
  assert.equal(extractGbpAmount('02/10/2026 SPOTIFY UK 11.99 DEBIT'), 11.99);
  assert.equal(extractGbpAmount('03/10/2026 AMAZON PRIME £8.99'), 8.99);
});

test('Offline Statement Scanner: Barclays sample lines detection', () => {
  const parsed = parseStatementLines(BARCLAYS_SAMPLE_LINES);
  assert.equal(parsed.length, 4);

  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 4);

  const names = matched.map((m) => m.serviceName);
  assert.ok(names.includes('Sky Stream & TV'));
  assert.ok(names.includes('PureGym Membership'));
  assert.ok(names.includes('Spotify Premium'));
  assert.ok(names.includes('Netflix'));
});

test('Offline Statement Scanner: Revolut sample lines detection', () => {
  const parsed = parseStatementLines(REVOLUT_SAMPLE_LINES);
  assert.equal(parsed.length, 5);

  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 5);

  const names = matched.map((m) => m.serviceName);
  assert.ok(names.includes('ChatGPT Plus'));
  assert.ok(names.includes('Adobe Creative Cloud'));
  assert.ok(names.includes('Canva Pro'));
  assert.ok(names.includes('The Guardian Digital'));
  assert.ok(names.includes('Amazon Prime'));
});

test('Offline Statement Scanner: Demo UK statement lines detection', () => {
  const parsed = parseStatementLines(DEMO_UK_STATEMENT_LINES);
  assert.ok(parsed.length >= 3);

  const matched = matchStatementTransactions(parsed);
  assert.ok(matched.length >= 3);
});
