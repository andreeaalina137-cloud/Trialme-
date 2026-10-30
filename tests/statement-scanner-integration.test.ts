import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import { parseStatementLines, extractGbpAmount } from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';
import { extractPdfText } from '../src/scanner/services/pdfTextExtractor';
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
