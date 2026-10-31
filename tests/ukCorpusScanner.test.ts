import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseStatementLines } from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';

const corpusDir = 'tests/fixtures/uk_corpus';
const expected = JSON.parse(
  readFileSync(`${corpusDir}/expected-amounts.json`, 'utf8'),
) as Record<string, number>;

const textFixtures = readdirSync(corpusDir)
  .filter((name) => name.endsWith('.txt') && !name.startsWith('extended-'))
  .sort();

test('All-UK corpus: every bank text fixture detects every catalogue preset at the extracted price', () => {
  assert.equal(textFixtures.length, 12, 'Every named UK provider must have a fixture');

  const lines = textFixtures.flatMap((name) =>
    readFileSync(`${corpusDir}/${name}`, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const parsed = parseStatementLines(lines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);
  const byPreset = new Map(matched.map((item) => [item.presetId, item]));

  assert.equal(Object.keys(expected).length, 49);
  assert.equal(matched.length, 49, 'No false positives or duplicate catalogue matches are allowed');
  for (const [presetId, amount] of Object.entries(expected)) {
    assert.equal(byPreset.get(presetId)?.amountGbp, amount, `${presetId} must keep the statement price`);
  }
});

test('All-UK corpus: Monzo-style CSV export detects all 49 presets with real GBP amounts', () => {
  const lines = readFileSync(`${corpusDir}/all-banks.csv`, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = parseStatementLines(lines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);
  const byPreset = new Map(matched.map((item) => [item.presetId, item]));

  assert.equal(parsed.length, 49);
  assert.equal(matched.length, 49);
  for (const [presetId, amount] of Object.entries(expected)) {
    assert.equal(byPreset.get(presetId)?.amountGbp, amount, `${presetId} CSV amount must be exact`);
  }
});

test('All-UK corpus: daily UK purchases and transfers are ignored with zero false positives', () => {
  const traps = [
    '01/10/2026 TESCO STORES 2841 £42.17',
    '02/10/2026 SAINSBURYS S/MKTS £31.00',
    '03/10/2026 ASDA SUPERSTORE £31.40',
    '04/10/2026 LIDL GB CORBY £12.30',
    '05/10/2026 ALDI STORES £18.00',
    '06/10/2026 GREGGS PLC £4.20',
    '07/10/2026 TFL.GOV.UK/CP £2.90',
    '08/10/2026 UBER *TRIP £14.30',
    '09/10/2026 DELIVEROO £18.40',
    '10/10/2026 JUST EAT £22.00',
    '11/10/2026 COSTA COFFEE £3.80',
    '12/10/2026 JD WETHERSPOON £9.20',
    '13/10/2026 POST OFFICE COUNTER £7.50',
    '14/10/2026 FASTER PAYMENT TO J SMITH £35.00',
  ];
  const parsed = parseStatementLines(traps);
  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 0);
});

test('All-UK corpus: Romanian Revolut locale, suffix GBP amounts and continuation rows', () => {
  const pound = '\u00a3';
  const lines = [
    `1 sept. 2026 Google One 0,62${pound} 176,44${pound}`,
    'Către: Google *google One, 8888888888',
    `3 sept. 2026 Xbox 10,99${pound} 66,76${pound}`,
    'Către: Microsoft*xbox Game Pass, Reading',
    `10 sept. 2026 Google Play 4,99${pound} 116,86${pound}`,
    'Către: Google *play Pass, G.co/helppay#',
    `18 oct. 2026 Taxă plan Metal 14,99${pound}`,
    `16 oct. 2026 OpenAI 0,76${pound}`,
  ];
  const parsed = parseStatementLines(lines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);

  assert.equal(parsed.length, 5);
  assert.equal(matched.find((item) => item.presetId === 'google_one_ai_uk')?.amountGbp, 0.62);
  assert.equal(matched.find((item) => item.presetId === 'xbox_game_pass_ultimate_uk')?.amountGbp, 10.99);
  assert.equal(matched.find((item) => item.presetId === 'revolut_premium_uk')?.amountGbp, 14.99);
  assert.ok(matched.some((item) => item.serviceName.includes('Google Play')));
  assert.ok(!matched.some((item) => item.presetId === 'chatgpt_plus_uk'));
});

test('All-UK corpus: extended UK providers and real statement prices', () => {
  const lines = readFileSync(`${corpusDir}/extended-uk-services.txt`, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = parseStatementLines(lines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);
  const byPreset = new Map(matched.map((item) => [item.presetId, item]));
  const unknownNames = matched.filter((item) => item.presetId.startsWith('unknown-')).map((item) => item.serviceName);

  assert.equal(byPreset.get('google_one_ai_uk')?.amountGbp, 7.99);
  assert.equal(byPreset.get('microsoft_365_personal_uk')?.amountGbp, 7.99);
  assert.equal(byPreset.get('netflix_standard_uk')?.amountGbp, 17.99);
  assert.equal(byPreset.get('disney_plus_uk')?.amountGbp, 10.99);
  assert.equal(byPreset.get('sky_stream_uk')?.amountGbp, 34);
  assert.equal(byPreset.get('bbc_tv_licence')?.amountGbp, 15);
  assert.ok(unknownNames.some((name) => /VIRGIN MEDIA/i.test(name)));
  assert.ok(unknownNames.some((name) => /BT GROUP/i.test(name)));
  assert.ok(unknownNames.some((name) => /EE MONTHLY/i.test(name)));
  assert.ok(unknownNames.some((name) => /COUNCIL TAX/i.test(name)));
  assert.ok(!matched.some((item) => /TESCO/i.test(item.serviceName)));
});

test('All-UK corpus: extended CSV preserves amounts and ignores Tesco trap', () => {
  const lines = readFileSync(`${corpusDir}/extended-uk-services.csv`, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = parseStatementLines(lines, new Date('2026-10-30T12:00:00Z'));
  const matched = matchStatementTransactions(parsed);

  assert.equal(parsed.length, 19);
  assert.equal(matched.length, 18);
  assert.equal(matched.find((item) => item.presetId === 'netflix_standard_uk')?.amountGbp, 17.99);
  assert.equal(matched.find((item) => item.presetId === 'google_one_ai_uk')?.amountGbp, 7.99);
  assert.ok(!matched.some((item) => /TESCO/i.test(item.serviceName)));
});

