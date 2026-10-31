import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGbpAmount,
  extractUkDate,
  parseStatementLines,
} from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';
import {
  clearMemoryStorage,
} from '../src/utils/storage';
import {
  getScannerLearning,
  recordConfirmedScannerLearning,
  recordDismissedScannerLearning,
  undoScannerLearning,
} from '../src/scanner/services/scannerLearningMemory';

const NOW = new Date('2026-10-31T12:00:00Z');

function scan(lines: string[]) {
  return matchStatementTransactions(parseStatementLines(lines, NOW), NOW);
}

describe('Multi-bank scanner intelligence', () => {
  beforeEach(() => clearMemoryStorage());

  it('handles Lloyds H3G, two-digit UK years and returned direct debits', () => {
    assert.deepEqual(extractUkDate('17 Feb 25 DEB H3G CD 4821 £23.00', NOW)?.iso, '2025-02-17');
    const matches = scan([
      '17 Feb 25 DEB H3G CD 4821 £23.00',
      '18 Feb 25 RETURNED DD H3G CD 4821 £23.00',
    ]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].serviceName, 'Three');
    assert.equal(matches[0].amountGbp, 23);
  });

  it('detects NatWest recurring providers and ignores running balances', () => {
    const matches = scan([
      '09 JAN Direct Debit TALKTALK TELECOM T 26.00 5,982.39',
      '10 JAN Direct Debit VODAFONE LTD 11.00 5,327.96',
      '11 JAN Direct Debit TV LICENCE QBP1 41.00 5,414.73',
    ]);
    assert.deepEqual(matches.map((item) => item.serviceName).sort(), ['BBC TV Licence', 'TalkTalk', 'Vodafone']);
    assert.deepEqual(matches.map((item) => item.amountGbp).sort((a, b) => a - b), [11, 26, 41]);
  });

  it('detects Curve while excluding gambling merchants from Starling exports', () => {
    const matches = scan([
      '04/12/2023 CARD SUBSCRIPTION Curve £5.99',
      '04/12/2023 CARD PAYMENT BET365 £20.00',
      '05/12/2023 CARD PAYMENT LADBROKES £15.00',
    ]);
    assert.deepEqual(matches.map((item) => item.serviceName), ['Curve']);
    assert.equal(matches[0].amountGbp, 5.99);
  });

  it('recognizes Revolut Premium plan fees and preserves Apple billing as ambiguous', () => {
    const matches = scan([
      '6 Apr 2024 Premium plan fee £7.99 -£7.55',
      '14 Apr 2024 Apple £25.99 £969.07',
      'To: Apple.com/bill, Apple.com/bil',
    ]);
    assert.equal(matches.some((item) => item.serviceName === 'Revolut Premium / Metal'), true);
    assert.equal(matches.find((item) => item.serviceName === 'Revolut Premium / Metal')?.amountGbp, 7.99);
    assert.equal(matches.some((item) => item.serviceName === 'Apple TV+'), false);
  });

  it('recovers Monzo negative GBP exports, Lebara and does not turn generic Apple rows into Apple TV', () => {
    assert.equal(extractGbpAmount('28/03/2024 Lebara Mobile Limited London GBR -15.00 428.19'), 15);
    const matches = scan([
      '28/03/2024 Lebara Mobile Limited London GBR -15.00 428.19',
      '30/03/2024 APPLE.COM/BILL APPLE.COM/BIL IRL -1.99 81.23',
    ]);
    assert.equal(matches.some((item) => item.serviceName === 'Lebara'), true);
    assert.equal(matches.some((item) => item.serviceName === 'Apple TV+'), false);
  });

  it('detects Halifax Sky TV with the real statement amount', () => {
    const matches = scan(['15/01/2024 DEB SKY TV CD 4821 £95.00']);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].serviceName, 'Sky Stream & TV');
    assert.equal(matches[0].amountGbp, 95);
  });

  it('keeps Chase, HSBC, Metro, Virgin Money and PayPal zero-subscription statements clean', () => {
    const zeroSubscriptionStatements: Record<string, string[]> = {
      Chase: ['03/04 Google *Fitbit LLC Mountain View CA Card £25.00', '05/04 Transfer to savings £200.00'],
      HSBC: ['04 Apr CARD PAYMENT COSTA COFFEE £4.20', '05 Apr FASTER PAYMENT TO J SMITH £200.00'],
      Metro: ['06/04 PAYPAL *EBAY UK £14.99', '07/04 METRO CASH WITHDRAWAL £40.00'],
      'Virgin Money': ['08/04 TESCO STORES 2841 £42.17', '09/04 CARD PAYMENT UBER *TRIP £18.00'],
      PayPal: ['10/31/2023 PayPal Savings balance $0.00', '10/31/2023 Ending balance $0.00'],
    };
    for (const [bank, lines] of Object.entries(zeroSubscriptionStatements)) {
      assert.deepEqual(scan(lines), [], `${bank} should not produce subscriptions`);
    }
  });

  it('persists confirmed and dismissed local learning and supports undo', () => {
    recordConfirmedScannerLearning({
      merchantLabel: 'ACME SUBSCRIPTION',
      serviceName: 'Acme Subscription',
      category: 'Productivity',
      frequency: 'monthly',
      amountGbp: 4.99,
    });
    assert.equal(getScannerLearning('acme subscription')?.decision, 'confirmed');
    assert.equal(scan(['01/10/2026 ACME SUBSCRIPTION £4.99']).length, 1);

    recordDismissedScannerLearning({
      merchantLabel: 'NOISE SUBSCRIPTION',
      serviceName: 'Noise Subscription',
      category: 'Other',
      frequency: 'monthly',
      amountGbp: 3.99,
    });
    assert.equal(scan(['01/10/2026 NOISE SUBSCRIPTION £3.99']).length, 0);
    assert.equal(undoScannerLearning('noise subscription'), true);
    assert.equal(getScannerLearning('noise subscription'), null);
  });
});

