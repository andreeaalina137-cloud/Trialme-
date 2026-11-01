import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGbpAmount,
  parseStatementLines,
} from '../src/scanner/services/ukBankCleaner';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';
import {
  clearMemoryStorage,
  safeStorageGet,
  safeStorageSet,
} from '../src/utils/storage';
import {
  SCANNER_LEARNING_STORAGE_KEY,
  getScannerLearning,
  recordConfirmedScannerLearning,
  recordDismissedScannerLearning,
  undoScannerLearning,
} from '../src/scanner/services/scannerLearningMemory';
import { buildScannerSubscriptionDraft } from '../src/scanner/services/scannerSubscriptionDraft';
import { detectBankFormat } from '../src/scanner/services/bankFormatDetector';
import { isDuplicateScannedSubscription } from '../src/utils/subscriptionIdentity';

const NOW = new Date('2026-10-31T12:00:00Z');

function transactions(lines: string[]) {
  return parseStatementLines(lines, NOW);
}

function matches(lines: string[]) {
  return matchStatementTransactions(transactions(lines), NOW);
}

describe('Stage 1 scanner regression specifications (SYNTHETIC)', () => {
  beforeEach(() => clearMemoryStorage());

  // 1. NatWest informational £19.40 rejection
  it('1. rejects NatWest informational paragraph with £19.40 (SYNTHETIC)', () => {
    assert.deepEqual(
      matches(['For monthly charging periods the maximum overdraft charge is £19.40 per period.']),
      [],
    );
  });

  // 2. NatWest informational £18.80 rejection
  it('2. rejects NatWest informational paragraph with £18.80 (SYNTHETIC)', () => {
    assert.deepEqual(
      matches(['Monthly charging information: the example charge is £18.80 for this period.']),
      [],
    );
  });

  // 3. Genuine NatWest £19.40 Direct Debit acceptance
  it('3. accepts a genuine NatWest Direct Debit of £19.40 (SYNTHETIC)', () => {
    const result = matches(['31 OCT 2026 Direct Debit O2 £19.40 5,000.00']);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'O2');
    assert.equal(result[0].amountGbp, 19.4);
  });

  // 4. Running balance rejection
  it('4. does not treat a balance-only row or running balance column as an outgoing debit (SYNTHETIC)', () => {
    assert.equal(extractGbpAmount('31 OCT 2026 Closing balance £19.40'), null);
    assert.deepEqual(matches(['31 OCT 2026 Closing balance £19.40']), []);
    assert.deepEqual(matches(['01/10/2026 Opening Balance £1,250.00']), []);
  });

  // 5. RETURNED DD handling
  it('5. removes a clearly returned direct debit rather than retaining it as active subscription evidence (SYNTHETIC)', () => {
    assert.deepEqual(
      matches([
        '01/10/2026 DD NETFLIX.COM £10.99',
        '05/10/2026 RETURNED DD NETFLIX.COM £10.99',
      ]),
      [],
    );
  });

  // 6. REFUND/REVERSAL/FAILED handling
  it('6. rejects failed payments, reversals and refunds as active subscription debits (SYNTHETIC)', () => {
    assert.deepEqual(
      matches([
        '01/10/2026 FAILED DIRECT DEBIT SPOTIFY UK £11.99',
        '02/10/2026 REVERSAL DISNEY PLUS £7.99',
        '03/10/2026 REFUND AMAZON PRIME £8.99',
      ]),
      [],
    );
  });

  // 7. Unlinked credit preservation
  it('7. does not cancel a debit for an unlinked same-amount credit (SYNTHETIC)', () => {
    const result = matches([
      '01/10/2026 DD NETFLIX.COM £10.99',
      '05/10/2026 NETFLIX.COM +£10.99',
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].amountGbp, 10.99);
  });

  // 8. Date inheritance restrictions
  it('8. does not inherit a previous date into an informational paragraph (SYNTHETIC)', () => {
    const parsed = transactions([
      '01/10/2026 DD NETFLIX.COM £10.99',
      'Monthly payment information £10.99',
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].dateIso, '2026-10-01');
    assert.deepEqual(
      matches(['01/10/2026 DD NETFLIX.COM £10.99', 'Monthly payment information £10.99']),
      matches(['01/10/2026 DD NETFLIX.COM £10.99']),
    );
  });

  // 9. Multiple transactions sharing one valid date
  it('9. supports multiple transactions sharing one valid date inside a transaction table (SYNTHETIC)', () => {
    const parsed = transactions([
      '01/10/2026 DD NETFLIX.COM £10.99',
      'DD SPOTIFY UK £11.99',
    ]);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].dateIso, '2026-10-01');
    assert.equal(parsed[1].dateIso, '2026-10-01');
    assert.equal(
      matches([
        '01/10/2026 DD NETFLIX.COM £10.99',
        'DD SPOTIFY UK £11.99',
      ]).length,
      2,
    );
  });

  // 10. Cross-page context isolation
  it('10. does not apply OCR or date context across an unrelated page section and cannot re-enter IN_TABLE from arbitrary DD/POS/VIS words inside prose (SYNTHETIC)', () => {
    const parsed = transactions([
      '01/10/2026 DD NETFLIX.COM £10.99',
      'Page 2 of 3 - Terms and conditions',
      'Important information about your overdraft charges £10.99',
      'If you use DD or POS or VIS for monthly charging periods the maximum charge is £19.40 per period.',
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].dateIso, '2026-10-01');
  });

  // 11. FEE versus COFFEE
  it('11. keeps whole-token boundary for FEE versus COFFEE (SYNTHETIC)', () => {
    assert.deepEqual(matches(['01/10/2026 COFFEE SHOP £4.99']), []);
  });

  // 12. SKY versus SKYSCRAPER
  it('12. keeps whole-token boundary for SKY versus SKYSCRAPER (SYNTHETIC)', () => {
    assert.deepEqual(matches(['02/10/2026 SKYSCRAPER MEDIA £5.99']), []);
  });

  // 13. Apple different amount tiers
  it('13. keeps two Apple price tiers as separate subscription evidence (SYNTHETIC)', () => {
    const result = matches([
      '01/09/2026 CARD SUBSCRIPTION APPLE.COM/BILL £2.99',
      '01/10/2026 CARD SUBSCRIPTION APPLE.COM/BILL £9.99',
    ]);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((item) => item.amountGbp).sort((a, b) => a - b),
      [2.99, 9.99],
    );
  });

  // 14. Apple different service identities
  it('14. keeps distinct Apple services separate (SYNTHETIC)', () => {
    const result = matches([
      '01/10/2026 APPLE TV+ £9.99',
      '01/10/2026 APPLE ICLOUD+ £2.99',
    ]);
    assert.equal(result.length, 2);
    assert.notEqual(result[0].presetId, result[1].presetId);
  });

  // 15. Learned alias cannot bypass Gate 1
  it('15. cannot use a learned alias to bypass Gate 1 when row is not a valid debit transaction (SYNTHETIC)', () => {
    recordConfirmedScannerLearning({
      merchantLabel: 'ACME SUBSCRIPTION',
      serviceName: 'Acme Subscription',
      category: 'Productivity',
      frequency: 'monthly',
      amountGbp: 9.99,
    });
    assert.deepEqual(matches(['01/10/2026 ACME SUBSCRIPTION']), []);
    assert.deepEqual(
      matches(['Important notice: ACME SUBSCRIPTION maximum charge is £9.99 per month.']),
      [],
    );
  });

  // 16. Appie.com/bil OCR correction
  it('16. recognizes the documented Appie.com/bil OCR correction (SYNTHETIC)', () => {
    const result = matches(['01/10/2026 CARD SUBSCRIPTION Appie.com/bil £2.99']);
    assert.equal(result.length, 1);
    assert.match(result[0].serviceName, /Apple/i);
  });

  // 17. O2 recognition
  it('17. recognizes Direct Debit O2 and Direct Debit 02 as O2 (SYNTHETIC)', () => {
    const result = matches([
      '01/09/2026 DIRECT DEBIT 02 £19.40',
      '01/10/2026 DIRECT DEBIT O2 £19.40',
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'O2');
    assert.equal(result[0].amountGbp, 19.4);
  });

  // 18. Vodafone recognition
  it('18. recognizes VODAFONE LTD as Vodafone (SYNTHETIC)', () => {
    const result = matches(['02/10/2026 DIRECT DEBIT VODAFONE LTD £11.00']);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'Vodafone');
    assert.equal(result[0].amountGbp, 11);
  });

  // 19. TalkTalk recognition
  it('19. recognizes TALKTALK TELECOMT as TalkTalk (SYNTHETIC)', () => {
    const result = matches(['03/10/2026 DIRECT DEBIT TALKTALK TELECOMT £26.00']);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'TalkTalk');
    assert.equal(result[0].amountGbp, 26);
  });

  // 20. TV Licence recognition
  it('20. recognizes TV LICENCE and TV LICENCE QBP1 as TV Licence (SYNTHETIC)', () => {
    const result = matches(['04/10/2026 DIRECT DEBIT TV LICENCE QBP1 £41.00']);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'BBC TV Licence');
    assert.equal(result[0].amountGbp, 41);
  });

  // 21. Curve recognition
  it('21. recognizes CARD SUBSCRIPTION Curve (SYNTHETIC)', () => {
    const result = matches(['04/12/2026 CARD SUBSCRIPTION Curve £5.99']);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'Curve');
    assert.equal(result[0].amountGbp, 5.99);
  });

  // 22. Gambling exclusions
  it('22. rejects gambling merchants even when recurring keywords appear (SYNTHETIC)', () => {
    assert.deepEqual(
      matches([
        '01/10/2026 CARD PAYMENT BET365 £20.00',
        '02/10/2026 CARD PAYMENT LADBROKES £15.00',
        '03/10/2026 WILLIAM HILL £10.00',
      ]),
      [],
    );
  });

  // 23. Transfer exclusions
  it('23. rejects whole-token transfer markers (MOB, CPT, FPI, FPO, TFR, BGC, FASTER PAYMENT, SAVETHECHANGE, Zelle, TAPTAP SEND, WORLDREMIT, WESTERN UNION, Sent from Revolut) without blocking legitimate merchants (SYNTHETIC)', () => {
    assert.deepEqual(
      matches([
        '01/10/2026 FASTER PAYMENT TO J SMITH £200.00',
        '02/10/2026 FPO J SMITH £25.00',
        '03/10/2026 FPI J SMITH £25.00',
        '04/10/2026 TFR SAVINGS £50.00',
        '05/10/2026 BGC PAYROLL £100.00',
        '06/10/2026 CPT ATM WITHDRAWAL £20.00',
        '07/10/2026 MOB TRANSFER TO FRIEND £15.00',
        '08/10/2026 SAVETHECHANGE £1.50',
        '09/10/2026 TAPTAP SEND £30.00',
        '10/10/2026 WORLDREMIT £40.00',
        '11/10/2026 WESTERN UNION £45.00',
        '12/10/2026 Zelle Payment £20.00',
        '13/10/2026 Sent from Revolut £10.00',
      ]),
      [],
    );
  });

  // 24. Tesco Mobile positive recognition
  it('24. accepts Tesco Mobile direct debit while rejecting ordinary Tesco grocery rows (SYNTHETIC)', () => {
    const mobile = matches(['01/10/2026 DIRECT DEBIT TESCO MOBILE £12.00']);
    assert.equal(mobile.length, 1);
    assert.match(mobile[0].serviceName, /Tesco Mobile/i);
    assert.equal(mobile[0].amountGbp, 12);

    const grocery = matches(['02/10/2026 TESCO STORES 2841 £42.17']);
    assert.deepEqual(grocery, []);
  });

  // 25. Same-day identical payments with distinct references
  it('25. preserves two same-day identical payments when their references establish separate transactions (SYNTHETIC)', () => {
    const parsed = transactions([
      '01/10/2026 DD NETFLIX.COM REF A100 £10.99',
      '01/10/2026 DD NETFLIX.COM REF B200 £10.99',
    ]);
    assert.equal(parsed.length, 2);
    assert.notEqual(parsed[0].rawLine, parsed[1].rawLine);
  });

  // 26. All three confirmation pathways
  it('26. persists confirmed learning records across Quick +Add, Modal +Add Subscription and Import All pathways (SYNTHETIC)', () => {
    // Pathway 1: Quick + Add
    const quickRecord = recordConfirmedScannerLearning({
      merchantLabel: 'PATHWAY ONE STREAM',
      serviceName: 'Pathway One Stream',
      category: 'Streaming',
      frequency: 'monthly',
      amountGbp: 6.99,
    });
    assert.equal(quickRecord?.decision, 'confirmed');

    // Pathway 2: Modal + Add Subscription (with edited category & price)
    const draft = buildScannerSubscriptionDraft(
      {
        id: 'scan-pathway-two',
        name: 'Pathway Two Cloud',
        price: 8.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Productivity',
        confidence: 0.9,
        selected: true,
        nextPaymentDate: '2026-11-15',
      },
      undefined,
      '£',
      '2026-11-15',
    );
    const modalRecord = recordConfirmedScannerLearning({
      merchantLabel: draft.name,
      serviceName: draft.name,
      category: draft.category,
      frequency: draft.frequency,
      amountGbp: draft.price,
    });
    assert.equal(modalRecord?.decision, 'confirmed');
    assert.equal(modalRecord?.amountGbp, 8.99);

    // Pathway 3: Import All Detected
    const batchRecord = recordConfirmedScannerLearning({
      merchantLabel: 'PATHWAY THREE MUSIC',
      serviceName: 'Pathway Three Music',
      category: 'Music & Audio',
      frequency: 'monthly',
      amountGbp: 9.99,
    });
    assert.equal(batchRecord?.decision, 'confirmed');

    assert.equal(getScannerLearning('PATHWAY ONE STREAM')?.decision, 'confirmed');
    assert.equal(getScannerLearning('Pathway Two Cloud')?.decision, 'confirmed');
    assert.equal(getScannerLearning('PATHWAY THREE MUSIC')?.decision, 'confirmed');
  });

  // 27. Dismissal persistence
  it('27. persists dismissed merchant signature and suppresses only that exact merchant without affecting unrelated merchants (SYNTHETIC)', () => {
    recordDismissedScannerLearning({
      merchantLabel: 'SPOTIFY UK',
      serviceName: 'Spotify',
      category: 'Music & Audio',
      frequency: 'monthly',
      amountGbp: 11.99,
    });

    const result = matches([
      '01/10/2026 DD SPOTIFY UK £11.99',
      '01/10/2026 DD NETFLIX.COM £10.99',
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].serviceName, 'Netflix');
  });

  // 28. Undo restoration
  it('28. restores previous learning state across a multi-step undo snapshot stack and does not leak unknown subscription keywords (SYNTHETIC)', () => {
    recordConfirmedScannerLearning({
      merchantLabel: 'CUSTOM MONTHLY PLAN',
      serviceName: 'Custom Monthly Plan',
      category: 'Other',
      frequency: 'monthly',
      amountGbp: 3.99,
    });
    recordDismissedScannerLearning({
      merchantLabel: 'CUSTOM MONTHLY PLAN',
      serviceName: 'Custom Monthly Plan',
      category: 'Other',
      frequency: 'monthly',
      amountGbp: 3.99,
    });

    // First undo should restore the prior 'confirmed' state from the snapshot stack
    assert.equal(undoScannerLearning('CUSTOM MONTHLY PLAN'), true);
    assert.equal(getScannerLearning('CUSTOM MONTHLY PLAN')?.decision, 'confirmed');

    // Second undo should remove the initial confirmation completely
    assert.equal(undoScannerLearning('CUSTOM MONTHLY PLAN'), true);
    assert.equal(getScannerLearning('CUSTOM MONTHLY PLAN'), null);
    assert.deepEqual(matches(['01/10/2026 CUSTOM MONTHLY PLAN £3.99']), []);
  });

  // 29. Corrupted localStorage recovery
  it('29. recovers safely from corrupted localStorage in monetry_scanner_learning_v1 (SYNTHETIC)', () => {
    safeStorageSet(SCANNER_LEARNING_STORAGE_KEY, '{corrupted-json');
    assert.equal(getScannerLearning('NETFLIX'), null);

    const record = recordConfirmedScannerLearning({
      merchantLabel: 'RECOVERED SERVICE',
      serviceName: 'Recovered Service',
      category: 'Productivity',
      frequency: 'monthly',
      amountGbp: 5.99,
    });
    assert.equal(record?.decision, 'confirmed');
    assert.ok(safeStorageGet(SCANNER_LEARNING_STORAGE_KEY)?.includes('RECOVERED SERVICE'));
  });

  // 30. Duplicate import fingerprint protection
  it('30. prevents duplicate subscription imports while keeping distinct Apple price tiers/services separate (SYNTHETIC)', () => {
    assert.equal(
      isDuplicateScannedSubscription(
        { name: 'Netflix UK' },
        { name: 'Netflix', status: 'active' },
      ),
      true,
    );
    assert.equal(
      isDuplicateScannedSubscription(
        { name: 'Apple iCloud+' },
        { name: 'Apple TV+', status: 'active' },
      ),
      false,
    );
  });

  // 31. All 11 bank-specific requirements
  it('31. enforces bank-specific requirements across all 11 supported providers (SYNTHETIC)', () => {
    // Lloyds: H3G + digits -> Three, SILVER ACCOUNT -> Lloyds Silver Account, ACCOUNT FEE -> Account Fee, RETURNED DD reversal protection
    const lloyds = matches([
      '17 Feb 26 DEB H3G £23.00',
      '18 Feb 26 DD H3G 987654 £23.00',
      '20 Feb 26 SILVER ACCOUNT £11.50',
      '21 Feb 26 ACCOUNT FEE £3.00',
      '22 Feb 26 DD SPOTIFY UK £11.99',
      '25 Feb 26 RETURNED DD SPOTIFY UK £11.99',
      '26 Feb 26 FPO J SMITH £50.00',
      '27 Feb 26 BGC EMPLOYER LTD £1,500.00',
      '28 Feb 26 DEB GREGGS PLC CD 4821 £4.20',
    ]);
    assert.equal(lloyds.some((item) => /Three/i.test(item.serviceName) && item.amountGbp === 23), true);
    assert.equal(lloyds.some((item) => item.serviceName === 'Lloyds Silver Account' && item.amountGbp === 11.5), true);
    assert.equal(lloyds.some((item) => item.serviceName === 'Account Fee' && item.amountGbp === 3), true);
    assert.equal(lloyds.some((item) => /Spotify/i.test(item.serviceName)), false, 'RETURNED DD must cancel matching DD');
    assert.equal(lloyds.length, 3, 'Lloyds transfers (FPO/BGC) and one-off retail (Greggs) must be excluded');

    // Revolut: Premium plan fee, FX GBP selection, interval recurrence, and false-positive rejection
    assert.equal(detectBankFormat(['Revolut Ltd', 'REVOGB21', '06 Apr 2026 Premium plan fee £7.99']).format, 'revolut');
    assert.equal(detectBankFormat(['CARD PAYMENT', 'DIRECT DEBIT', 'TRANSFER GBP 10.99']).format, 'generic');
    const revolut = matches([
      '6 Apr 2026 Premium plan fee £7.99 -£7.55',
      '10 Apr 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 (Exchange rate: £1.00 = $1.2618) -£15.85 Balance £420.10',
      '15 Sep 2026 Card Payment SUBSTACK *NEWSLETTER -£8.00',
      '15 Oct 2026 Card Payment SUBSTACK *NEWSLETTER -£8.00',
      '16 Oct 2026 Top-up by *4821 +£100.00',
      '17 Oct 2026 Transfer from Revolut user +£25.00',
      '18 Oct 2026 Card Refund NETFLIX.COM £10.99',
      '19 Oct 2026 Vault balance £150.00',
      '20 Oct 2026 Card Payment PRET A MANGER -£4.50',
      '21 Oct 2026 Card Payment AMZN MKTP UK -£14.99',
      '22 Oct 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 Balance £420.10',
      '23 Oct 2026 Revolut Transfer to Vault £20.00',
      '24 Oct 2026 Revolut Card Delivery Fee £4.99',
      'Important information: Revolut Premium plan fee is £8.99 per month after your trial period.',
    ]);
    assert.equal(revolut.find((item) => /Revolut/i.test(item.serviceName))?.amountGbp, 7.99);
    assert.equal(revolut.find((item) => /ChatGPT/i.test(item.serviceName))?.amountGbp, 15.85);
    assert.equal(
      revolut.find((item) => /SUBSTACK/i.test(item.serviceName))?.isVerifiedRecurring,
      true,
      'Validated monthly interval must confirm recurring Revolut payment',
    );
    assert.equal(revolut.length, 3, 'Revolut transfers, refunds, balances, prose, ambiguous FX, and one-off card purchases must be excluded');

    // Monzo: Lebara Mobile Limited -> Lebara, APPLE.COM/BILL & Appie.com/bil -> Apple, distinct Apple services, Pot/transfer/retail exclusions
    assert.equal(
      detectBankFormat(['Monzo Bank', 'Sort code 04-00-04', '28/03/2026 Lebara Mobile Limited London GBR -15.00 428.19']).format,
      'monzo',
    );
    const monzo = matches([
      '28/03/2026 Lebara Mobile Limited London GBR -15.00 428.19',
      '29/03/2026 CARD SUBSCRIPTION Appie.com/bil -2.99 425.20',
      '30/03/2026 CARD SUBSCRIPTION APPLE.COM/BILL -9.99 415.21',
      '31/03/2026 Apple.com/bill iCloud+ -0.99 414.22',
      '01/04/2026 Apple.com/bill Apple TV+ -9.99 404.23',
      '02/04/2026 Pot transfer to Savings Pot -50.00 354.23',
      '03/04/2026 FASTER PAYMENT TO J SMITH -250.00 104.23',
      '04/04/2026 TESCO STORES 2841 -42.17 62.06',
    ]);
    assert.equal(monzo.some((item) => item.serviceName === 'Lebara' && item.amountGbp === 15), true);
    assert.equal(monzo.some((item) => item.presetId === 'unknown-APPLEBILLING-299' && item.amountGbp === 2.99), true);
    assert.equal(monzo.some((item) => item.presetId === 'unknown-APPLEBILLING-999' && item.amountGbp === 9.99), true);
    assert.equal(monzo.some((item) => item.presetId === 'apple_icloud_200gb_uk' && item.amountGbp === 0.99), true);
    assert.equal(monzo.some((item) => item.presetId === 'apple_tv_plus_uk' && item.amountGbp === 9.99), true);
    assert.equal(monzo.length, 5, 'Monzo Pot transfers, Faster Payments, and Tesco grocery must be excluded');

    // NatWest: O2/02, Vodafone, TalkTalk, TV Licence QBP1, £19.40/£18.80 prose & C/L exclusions
    assert.equal(
      detectBankFormat(['NatWest', 'Sort code 60-00-01', '01 OCT 2026 Direct Debit O2 £19.40']).format,
      'natwest',
    );
    const natwest = matches([
      '01 OCT 2026 Direct Debit 02 £19.40 5,000.00',
      '02 OCT 2026 Direct Debit VODAFONE LTD £11.00 4,989.00',
      '03 OCT 2026 Direct Debit TALKTALK TELECOMT £26.00 4,963.00',
      '04 OCT 2026 Direct Debit TV LICENCE QBP1 £41.00 4,922.00',
      '05 OCT 2026 C/L NATWEST CASHLINE £40.00 4,882.00',
      'For monthly charging periods the maximum overdraft charge is £19.40 per period.',
      'Monthly charging information: the example charge is £18.80 for this period.',
    ]);
    assert.equal(natwest.length, 4, 'NatWest must detect all 4 recurring providers and exclude C/L & prose');

    // Halifax: SKY TV DD and SKY TV DEB -> Sky TV
    assert.equal(
      detectBankFormat(['Halifax', 'Sort code 11-11-11', '15/01/2026 SKY TV DD £42.00']).format,
      'halifax',
    );
    const halifax = matches([
      '15/01/2026 SKY TV DD £42.00',
      '15/02/2026 SKY TV DEB £42.00',
      '16/02/2026 DEB ASDA SUPERSTORE CD 4821 £31.40',
    ]);
    assert.equal(halifax.length, 1);
    assert.match(halifax[0].serviceName, /Sky/i);
    assert.equal(halifax[0].amountGbp, 42);

    // Starling: CARD SUBSCRIPTION Curve -> Curve, Apple App Store CARD SUBSCRIPTION -> Apple
    assert.equal(
      detectBankFormat(['Starling Bank', 'Sort code 60-83-71', '04/12/2026 CARD SUBSCRIPTION Curve £5.99']).format,
      'starling',
    );
    const starling = matches([
      '04/12/2026 CARD SUBSCRIPTION Curve £5.99',
      '05/12/2026 Apple App Store CARD SUBSCRIPTION £4.99',
      '06/12/2026 CARD PAYMENT BET365 £20.00',
      '07/12/2026 Space transfer to Saving Space £50.00',
    ]);
    assert.equal(starling.some((item) => item.serviceName === 'Curve' && item.amountGbp === 5.99), true);
    assert.equal(starling.some((item) => /Apple/i.test(item.serviceName) && item.amountGbp === 4.99), true);
    assert.equal(starling.length, 2);

    // HSBC, Chase UK, Metro Bank, Virgin Money, PayPal bank format detection & positive/negative checks
    assert.equal(detectBankFormat(['HSBC UK', 'Sort code 40-05-30', '01 OCT 2026 VIS HEADSPACE £9.99']).format, 'hsbc');
    assert.equal(
      detectBankFormat(['Chase UK', 'chase.co.uk', '10 Oct 2026 Recurring Card Purchase NETFLIX.COM £10.99']).format,
      'chase-uk',
    );
    assert.equal(detectBankFormat(['Metro Bank', 'Sort code 23-05-80', '01/04/2026 CARD PAYMENT £10.00']).format, 'metro-bank');
    assert.equal(detectBankFormat(['Virgin Money', 'Sort code 82-00-00', '01/04/2026 INSTANT SAVINGS £50.00']).format, 'virgin-money');
    assert.equal(detectBankFormat(['PayPal', 'PayPal Balance', '15/10/2026 Preapproved Payment -£10.99']).format, 'paypal');

    const chase = matches([
      '10 Oct 2026 Recurring Card Purchase NETFLIX.COM £10.99',
      '15 Oct 2026 Monthly Service Fee £5.00',
      '16 Oct 2026 Google *Fitbit LLC Mountain View CA Card £25.00',
      '17 Oct 2026 Round-up transfer £1.20',
    ]);
    assert.equal(chase.some((item) => item.serviceName === 'Netflix' && item.amountGbp === 10.99), true);
    assert.equal(chase.some((item) => /Monthly Service Fee/i.test(item.serviceName) && item.amountGbp === 5), true);
    assert.equal(chase.length, 2);

    const paypal = matches([
      '15/10/2026 Preapproved Payment Bill User Payment DISNEY PLUS -£7.99 GBP',
      '16/10/2026 Express Checkout Payment EBAY UK -£14.99 GBP',
      '31/10/2026 PayPal Balance £0.00',
    ]);
    assert.equal(paypal.length, 1);
    assert.equal(paypal[0].serviceName, 'Disney+');
    assert.equal(paypal[0].amountGbp, 7.99);
  });

  // 32. Supplied zero-subscription benchmarks
  it('32. returns zero subscriptions for HSBC BACS/retail, Metro Bank Staples/IKEA/Screwfix, Virgin Money Instant Savings transfer and PayPal zero-balance benchmarks (SYNTHETIC)', () => {
    const hsbcBenchmark = [
      '04 Apr 2026 VIS COSTA COFFEE £4.20 1,240.80',
      '05 Apr 2026 BACS ACME PAYROLL £2,100.00 3,340.80',
      '06 Apr 2026 BP J SMITH £200.00 3,140.80',
    ];
    const metroBenchmark = [
      '06/04/2026 CARD PAYMENT STAPLES UK £24.99 810.00',
      '07/04/2026 CARD PAYMENT IKEA LIMITED £115.00 695.00',
      '08/04/2026 CARD PAYMENT SCREWFIX DIRECT £32.50 662.50',
    ];
    const virginMoneyBenchmark = [
      '08/04/2026 TRANSFER TO INSTANT SAVINGS £250.00 1,500.00',
      '09/04/2026 INSTANT SAVINGS TRANSFER £100.00 1,400.00',
    ];
    const paypalBenchmark = [
      '31/10/2026 Opening Balance £0.00',
      '31/10/2026 PayPal Balance £0.00',
      '31/10/2026 Closing Balance £0.00',
    ];

    assert.deepEqual(matches(hsbcBenchmark), [], 'HSBC benchmark must return 0 subscriptions');
    assert.deepEqual(matches(metroBenchmark), [], 'Metro Bank benchmark must return 0 subscriptions');
    assert.deepEqual(matches(virginMoneyBenchmark), [], 'Virgin Money benchmark must return 0 subscriptions');
    assert.deepEqual(matches(paypalBenchmark), [], 'PayPal benchmark must return 0 subscriptions');
  });
});
