import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGbpAmount,
  extractUkDate,
  parseStatementLines,
} from '../src/scanner/services/ukBankCleaner';
import { detectBankFormat } from '../src/scanner/services/bankFormatDetector';
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

  it('enforces NatWest Stage 3 hardening: bank detection, O2/02, Vodafone, TalkTalk, TV Licence QBP1, D/D & POS, C/L ATM exclusions, and £19.40/£18.80 prose rejection (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['NatWest', 'Sort code 60-00-01', '01 OCT 2026 D/D DELIVEROO PLUS £3.49']).format,
      'natwest',
    );
    assert.equal(detectBankFormat(['POS CARD', 'D/D PAYMENT', 'C/L ATM']).format, 'generic');

    const matches = scan([
      '01 OCT 2026 Direct Debit 02 £19.40 5,000.00',
      '02 OCT 2026 Direct Debit VODAFON3 LTD £11.00 4,989.00',
      '03 OCT 2026 Direct Debit TALKTALK TELECOMT £26.00 4,963.00',
      '04 OCT 2026 Direct Debit TV LICENCE QBP1 £41.00 4,922.00',
      '05 OCT 2026 D/D DELIVEROO PLUS £3.49 4,918.51',
      '06 OCT 2026 POS DELIVEROO £18.40 4,900.11',
      '07 OCT 2026 C/L NATWEST CASHLINE £40.00 4,860.11',
      'For monthly charging periods the maximum overdraft charge is £19.40 per period.',
      'Monthly charging information: the example charge is £18.80 for this period.',
      '31 OCT 2026 Closing balance £19.40',
    ]);

    assert.equal(matches.find((item) => item.serviceName === 'O2')?.amountGbp, 19.4);
    assert.equal(matches.find((item) => item.serviceName === 'Vodafone')?.amountGbp, 11);
    assert.equal(matches.find((item) => item.serviceName === 'TalkTalk')?.amountGbp, 26);
    assert.equal(matches.find((item) => item.serviceName === 'BBC TV Licence')?.amountGbp, 41);
    assert.equal(matches.find((item) => /Deliveroo Plus/i.test(item.serviceName))?.amountGbp, 3.49);
    assert.equal(matches.length, 5);
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

  it('enforces Starling Stage 3 hardening: bank detection, Curve, Apple App Store CARD SUBSCRIPTION, gambling & Space transfer exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Starling Bank', 'Sort code 60-83-71', '04/12/2026 CARD SUBSCRIPTION Curve £5.99']).format,
      'starling',
    );
    assert.equal(detectBankFormat(['MASTERCARD', 'FASTER PAYMENT', 'GBP 20.00']).format, 'generic');

    const matches = scan([
      '04/12/2026 CARD SUBSCRIPTION Curve £5.99',
      '05/12/2026 Apple App Store CARD SUBSCRIPTION £4.99',
      '06/12/2026 DIRECT DEBIT BT GROUP MONTHLY £38.00',
      '07/12/2026 CARD PAYMENT BET365 £20.00',
      '08/12/2026 CARD PAYMENT LADBROKES £15.00',
      '09/12/2026 CARD PAYMENT SKY BET £10.00',
      '10/12/2026 Space transfer to Holiday Saving Space £50.00',
      '11/12/2026 FASTER PAYMENT TO A FRIEND £35.00',
      '12/12/2026 MASTERCARD TESCO STORES 2841 £22.10',
    ]);

    assert.equal(matches.find((item) => item.serviceName === 'Curve')?.amountGbp, 5.99);
    assert.equal(matches.find((item) => item.presetId === 'unknown-APPLEBILLING-499')?.amountGbp, 4.99);
    assert.equal(matches.find((item) => /BT GROUP/i.test(item.serviceName))?.amountGbp, 38);
    assert.equal(matches.length, 3);
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

  it('enforces Revolut Stage 3 hardening: bank detection, FX GBP selection, interval recurrence, refunds, balances, prose and one-off exclusions (SYNTHETIC)', () => {
    // A. Bank identification: genuine Revolut markers vs generic words
    assert.equal(detectBankFormat(['Revolut Ltd', 'REVOGB21', '06 Apr 2026 Premium plan fee £7.99']).format, 'revolut');
    assert.equal(detectBankFormat(['CARD PAYMENT', 'DIRECT DEBIT', 'TRANSFER GBP 10.99']).format, 'generic');

    // B & C. Foreign-currency transaction with separate GBP equivalent, FX rate & balance isolation, and ambiguous GBP rejection
    assert.equal(
      extractGbpAmount(
        '10 Apr 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 (Exchange rate: £1.00 = $1.2618) -£15.85 Balance £420.10',
      ),
      15.85,
    );
    assert.equal(extractGbpAmount('10 Apr 2026 Card Payment OPENAI *CHATGPT PLUS $20.00'), null);
    assert.equal(extractGbpAmount('10 Apr 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 15.85'), null);
    assert.equal(extractGbpAmount('10 Apr 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 Balance £420.10'), null);
    assert.equal(extractGbpAmount('10 Apr 2026 Card Payment NETFLIX 15,99 EUR (Account currency GBP)'), null);
    assert.equal(extractGbpAmount('30 Apr 2026 Account balance £420.10'), null);
    assert.equal(extractGbpAmount('30 Apr 2026 Vault balance £150.00'), null);

    // D, E & F. Full Revolut statement scan with positive and negative cases
    const matches = scan([
      // 1. Genuine outgoing GBP subscription
      '01 Oct 2026 Card Payment',
      'APPLE TV+ -£9.99',
      // 2 & 3. Foreign-currency transaction with separate GBP debit, FX rate and running balance
      '03 Oct 2026 Card Payment OPENAI *CHATGPT PLUS $20.00 (Exchange rate: £1.00 = $1.2618) -£15.85 £420.10',
      // 9. Genuine Revolut Premium fee
      '06 Oct 2026 Premium plan fee £7.99 -£7.55',
      // 10. Recurring unknown merchant with validated 30-day interval
      '15 Sep 2026 Card Payment KOBO PLUS READING -£9.99',
      '15 Oct 2026 Card Payment KOBO PLUS READING -£9.99',
      // 4. Incoming transfer rejection
      '16 Oct 2026 Top-up by *4821 +£100.00',
      '16 Oct 2026 Transfer from Revolut user £25.00',
      '16 Oct 2026 Money added £50.00',
      // 5. Refund and unlinked reversal rejection (must not become a subscription or cancel unrelated card *4821)
      '17 Oct 2026 Card Refund APPLE TV+ £9.99',
      '18 Oct 2026 Reversal APPLE TV+ *9912 £9.99',
      // 6. Account balance rejection
      '19 Oct 2026 Account balance £420.10',
      '19 Oct 2026 Vault balance £150.00',
      // 7. Informational prose rejection
      'Important information: Revolut Premium plan fee is £8.99 per month after your trial period.',
      'Exchange rate information: conversions over £1,000.00 may incur a fair usage fee of £5.00.',
      // 8. One-off card purchases & non-recurring 2-day apart purchases rejected
      '20 Oct 2026 Card Payment UBER *TRIP -£14.30',
      '21 Oct 2026 Card Payment PRET A MANGER -£4.50',
      '22 Oct 2026 Card Payment AMZN MKTP UK -£14.99',
      '23 Oct 2026 Card Payment LOCAL BAKERY PREMIUM -£6.50',
      '25 Oct 2026 Card Payment LOCAL BAKERY PREMIUM -£6.50',
      // Ordinary Revolut account movements must not match Revolut Premium
      '26 Oct 2026 Revolut Transfer to Vault £20.00',
      '27 Oct 2026 Revolut Card Delivery Fee £4.99',
      // 11. Ambiguous GBP amount rejection
      '28 Oct 2026 Card Payment SPOTIFY $11.99 Balance £380.00',
    ]);

    assert.equal(matches.length, 4);
    assert.equal(matches.find((item) => item.serviceName === 'Apple TV+')?.amountGbp, 9.99);
    assert.equal(matches.find((item) => item.serviceName === 'ChatGPT Plus')?.amountGbp, 15.85);
    assert.equal(matches.find((item) => item.serviceName === 'Revolut Premium / Metal')?.amountGbp, 7.99);
    const kobo = matches.find((item) => /KOBO PLUS READING/i.test(item.serviceName));
    assert.ok(kobo, 'Validated 30-day interval recurring payment must be detected');
    assert.equal(kobo?.amountGbp, 9.99);
    assert.equal(kobo?.isVerifiedRecurring, true);
    assert.ok(kobo?.reasonCodes?.includes('INTERVAL_CONFIRMED'));
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

  it('enforces Monzo Stage 3 hardening: bank detection, Lebara Mobile Limited, APPLE.COM/BILL & Appie.com/bil, CARD SUBSCRIPTION, distinct Apple services, and false-positive exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Monzo Bank', 'Sort code 04-00-04', '28/03/2026 Lebara Mobile Limited London GBR -15.00 428.19']).format,
      'monzo',
    );
    assert.equal(detectBankFormat(['Pot transfer', 'Emoji, Category', 'GBP 10.00']).format, 'generic');

    const matches = scan([
      // 1. Lebara Mobile Limited negative GBP debit with running balance
      '28/03/2026 Lebara Mobile Limited London GBR -15.00 428.19',
      // 2. Controlled OCR correction Appie.com/bil with CARD SUBSCRIPTION prefix
      '29/03/2026 CARD SUBSCRIPTION Appie.com/bil -2.99 425.20',
      // 3. Generic APPLE.COM/BILL at a distinct price tier (£9.99) with CARD SUBSCRIPTION
      '30/03/2026 CARD SUBSCRIPTION APPLE.COM/BILL -9.99 415.21',
      // 4. Distinct explicit Apple services on Monzo
      '01/04/2026 Apple.com/bill iCloud+ -0.99 414.22',
      '02/04/2026 Apple.com/bill Apple TV+ -9.99 404.23',
      '03/04/2026 Apple.com/bill Apple Music -10.99 393.24',
      // 5. Monzo Perks subscription
      '04/04/2026 Direct Debit Monzo Perks -7.00 386.24',
      // 6. Validated 30-day interval recurring unknown merchant on Monzo
      '05/03/2026 READLY MAGAZINE PASS -9.99 490.00',
      '05/04/2026 READLY MAGAZINE PASS -9.99 376.25',
      // 7. Reversed Direct Debit within 14 days cancelled
      '06/04/2026 Direct Debit SPOTIFY UK -11.99 364.26',
      '08/04/2026 RETURNED DD SPOTIFY UK -11.99 376.25',
      // 8. Refunds, incoming credits, Pot transfers, Faster Payments, grocery & balances excluded
      '09/04/2026 Refund from Lebara Mobile Limited +£15.00 391.25',
      '10/04/2026 Pot transfer to Holiday Pot -50.00 341.25',
      '11/04/2026 Round up Coin Jar -0.75 340.50',
      '12/04/2026 FASTER PAYMENT TO J SMITH -250.00 90.50',
      '13/04/2026 TESCO STORES 2841 -42.17 48.33',
      '14/04/2026 Closing balance £48.33',
      'Important notice: Monzo Perks is £7.00 per month and includes fee-free withdrawals.',
    ]);

    assert.equal(matches.find((item) => item.serviceName === 'Lebara')?.amountGbp, 15);
    assert.equal(matches.find((item) => item.presetId === 'unknown-APPLEBILLING-299')?.amountGbp, 2.99);
    assert.equal(matches.find((item) => item.presetId === 'unknown-APPLEBILLING-999')?.amountGbp, 9.99);
    assert.equal(matches.find((item) => item.presetId === 'apple_icloud_200gb_uk')?.amountGbp, 0.99);
    assert.equal(matches.find((item) => item.presetId === 'apple_tv_plus_uk')?.amountGbp, 9.99);
    assert.equal(matches.find((item) => item.presetId === 'apple_music_uk')?.amountGbp, 10.99);
    assert.equal(matches.find((item) => item.presetId === 'monzo_perks_uk')?.amountGbp, 7);
    assert.equal(matches.find((item) => /READLY/i.test(item.serviceName))?.isVerifiedRecurring, true);
    assert.equal(matches.some((item) => /Spotify/i.test(item.serviceName)), false);
    assert.equal(matches.length, 8);
  });

  it('detects Halifax Sky TV with the real statement amount', () => {
    const matches = scan(['15/01/2024 DEB SKY TV CD 4821 £95.00']);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].serviceName, 'Sky Stream & TV');
    assert.equal(matches[0].amountGbp, 95);
  });

  it('enforces Halifax Stage 3 hardening: bank detection, SKY TV DD/DEB, Ultimate Reward fee, multi-line & undated same-day inheritance, RETURNED DD and exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Halifax', 'Sort code 11-11-11', '15/01/2026 DEB SKY TV CD 4821 £95.00']).format,
      'halifax',
    );
    assert.equal(detectBankFormat(['DEB CARD', 'FPO TRANSFER', 'Ultimate Reward £17.00']).format, 'generic');

    const halifaxMatches = scan([
      '01 Oct 2026 | DEB THE GYM GROUP CD 4821 | £21.99 1,420.00',
      // Undated same-day row with trailing DD marker before amount inherits 01 Oct 2026
      'SKY TV DD £42.00 1,378.00',
      '03 Oct 2026 | DD DAVID LLOYD CLUBS REF 22001',
      '£145.00 1,233.00',
      '05 Oct 2026 | ULTIMATE REWARD ACCOUNT | £17.00 1,216.00',
      // Reversed Direct Debit cancelled within 14 days
      '06 Oct 2026 | DD PUREGYM LTD | £23.99 1,192.01',
      '08 Oct 2026 | RETURNED DD PUREGYM LTD | £23.99 1,216.00',
      // Exclusions: retail, FPO transfer, cashback credit, balance & prose
      '16 Oct 2026 | DEB ASDA SUPERSTORE CD 4821 | £31.40 1,184.60',
      '17 Oct 2026 | FPO J SMITH | £50.00 1,134.60',
      '18 Oct 2026 | Cashback earned | £5.00 1,139.60',
      '31 Oct 2026 | Closing balance | £1,139.60',
      'Important notice: Halifax Ultimate Reward account fee is £17.00 per month.',
    ]);
    assert.equal(halifaxMatches.length, 4);
    assert.equal(halifaxMatches.find((item) => item.serviceName === 'The Gym Group')?.amountGbp, 21.99);
    assert.equal(halifaxMatches.find((item) => item.serviceName === 'Sky Stream & TV')?.amountGbp, 42);
    assert.equal(halifaxMatches.find((item) => item.serviceName === 'Sky Stream & TV')?.lastPaymentDate, '2026-10-01');
    assert.equal(halifaxMatches.find((item) => item.serviceName === 'David Lloyd Clubs')?.amountGbp, 145);
    assert.equal(halifaxMatches.find((item) => item.serviceName === 'Account Fee')?.amountGbp, 17);
    assert.equal(halifaxMatches.some((item) => /PureGym/i.test(item.serviceName)), false);
  });

  it('enforces HSBC Stage 3 hardening: bank detection, debit/credit/overdraft-DR balance separation, multi-line & same-date inheritance, BACS/BP exclusions and interval recurrence (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['HSBC UK', 'Sort code 40-05-30', '01 OCT 2026 VIS HEADSPACE MEDITATION £9.99']).format,
      'hsbc',
    );
    assert.equal(detectBankFormat(['VIS CARD', 'BP TRANSFER', 'BACS CREDIT']).format, 'generic');

    const hsbcMatches = scan([
      'Date Payment type and details Paid out Paid in Balance',
      '01 OCT 2026 BALANCE BROUGHT FORWARD 150.00 DR',
      // Dated row + undated same-day continuation row with overdraft DR balance column
      '02 OCT 2026 VIS HEADSPACE MEDITATION 9.99 159.99 DR',
      'DD CALM.COM 11.99 171.98 DR',
      // Multi-line HSBC row
      '03 OCT 2026 DD TALKTALK TELECOMT',
      '26.00 197.98 DR',
      // Validated 30-day interval recurring unknown merchant
      '04 SEP 2026 VIS PATREON CREATOR PASS 6.50 140.00',
      '04 OCT 2026 VIS PATREON CREATOR PASS 6.50 191.48 DR',
      // Returned DD within 14 days
      '05 OCT 2026 DD SPOTIFY UK 11.99 203.47 DR',
      '07 OCT 2026 RETURNED DD SPOTIFY UK 11.99 191.48 DR',
      // Exclusions: BACS (< £500 and > £500), CR credits, BP transfer, retail & balance carried forward
      '08 OCT 2026 BACS HMRC TAX CREDIT 120.00 71.48 DR',
      '09 OCT 2026 BACS ACME PAYROLL £2,100.00 2,028.52',
      '10 OCT 2026 CR FASTER PAYMENT IN 50.00 2,078.52',
      '11 OCT 2026 VIS NETFLIX.COM 10.99 CR 2,089.51',
      '12 OCT 2026 BP J SMITH £200.00 1,889.51',
      '13 OCT 2026 VIS COSTA COFFEE £4.20 1,885.31',
      '14 OCT 2026 VIS LIDL GB CORBY £12.30 1,873.01',
      '31 OCT 2026 BALANCE CARRIED FORWARD 1,873.01',
      'For monthly charging periods the maximum overdraft charge is £19.40 per period.',
    ]);
    assert.equal(hsbcMatches.length, 4);
    assert.equal(hsbcMatches.find((item) => /Headspace/i.test(item.serviceName))?.amountGbp, 9.99);
    assert.equal(hsbcMatches.find((item) => /Calm/i.test(item.serviceName))?.amountGbp, 11.99);
    assert.equal(hsbcMatches.find((item) => /Calm/i.test(item.serviceName))?.lastPaymentDate, '2026-10-02');
    assert.equal(hsbcMatches.find((item) => item.serviceName === 'TalkTalk')?.amountGbp, 26);
    assert.equal(hsbcMatches.find((item) => /PATREON/i.test(item.serviceName))?.isVerifiedRecurring, true);
    assert.equal(hsbcMatches.some((item) => /Spotify|Netflix/i.test(item.serviceName)), false);
  });

  it('enforces Chase UK Stage 3 hardening: bank detection, Recurring Card Purchase, Monthly Service Fee, interval recurrence, refunds and Round-up/interest exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Chase UK', 'chase.co.uk', '10 Oct 2026 Recurring Card Purchase NETFLIX.COM £10.99']).format,
      'chase-uk',
    );
    assert.equal(detectBankFormat(['Card payment', 'Round-up', 'Transfer to savings']).format, 'generic');

    const chaseMatches = scan([
      '10 Oct 2026 Recurring Card Purchase NETFLIX.COM £10.99 Balance £840.00',
      '15 Oct 2026 Monthly Service Fee £5.00 Balance £835.00',
      '16 Sep 2026 Card Payment GEFORCE NOW CLOUD £9.99',
      '16 Oct 2026 Card Payment GEFORCE NOW CLOUD £9.99',
      // Reversed payment
      '17 Oct 2026 Direct Debit DISNEY PLUS £7.99',
      '19 Oct 2026 RETURNED DD DISNEY PLUS £7.99',
      // Exclusions: one-off Google *Fitbit, Round-up, savings transfer, interest, cashback & prose
      '20 Oct 2026 Google *Fitbit LLC Mountain View CA Card £25.00',
      '21 Oct 2026 Round-up transfer £1.20',
      '22 Oct 2026 Transfer to savings £200.00',
      '23 Oct 2026 Gross interest £3.45',
      '24 Oct 2026 Cashback reward £4.10',
      '31 Oct 2026 Closing balance £600.00',
      'Important notice: Monthly Service Fee is £5.00 per month.',
    ]);
    assert.equal(chaseMatches.length, 3);
    assert.equal(chaseMatches.find((item) => item.serviceName === 'Netflix')?.amountGbp, 10.99);
    assert.equal(chaseMatches.find((item) => item.serviceName === 'Monthly Service Fee')?.amountGbp, 5);
    assert.equal(chaseMatches.find((item) => /GEFORCE NOW/i.test(item.serviceName))?.isVerifiedRecurring, true);
  });

  it('enforces Metro Bank Stage 3 hardening: bank detection, Outward Direct Debit, Point of Sale, O2/02 OCR repair, Staples/IKEA/Screwfix & cash withdrawal exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Metro Bank', 'Sort code 23-05-80', '06/04/2026 Outward Direct Debit PUREGYM LTD £23.99']).format,
      'metro-bank',
    );
    assert.equal(detectBankFormat(['06/04/2026 PAYPAL *EBAY UK £14.99', '07/04/2026 CARD PAYMENT £20.00']).format, 'generic');

    const metroMatches = scan([
      '01/04/2026 Outward Direct Debit PUREGYM LTD £23.99 834.99',
      '02/04/2026 Direct Debit 02 £19.40 815.59',
      '03/04/2026 Point of Sale SPOTIFY UK £11.99 803.60',
      '04/04/2026 Outward Direct Debit AUDIBLE UK £7.99 795.61',
      '05/04/2026 RETURNED DD AUDIBLE UK £7.99 803.60',
      // Exclusions: Staples, IKEA, Screwfix, PayPal *eBay, Metro Cash Withdrawal, Inward Faster Payment
      '06/04/2026 CARD PAYMENT STAPLES UK £24.99 778.61',
      '07/04/2026 CARD PAYMENT IKEA LIMITED £115.00 663.61',
      '08/04/2026 CARD PAYMENT SCREWFIX DIRECT £32.50 631.11',
      '09/04/2026 PAYPAL *EBAY UK £14.99 616.12',
      '10/04/2026 METRO CASH WITHDRAWAL £40.00 576.12',
      '11/04/2026 Inward Faster Payment J SMITH £100.00 676.12',
      '30/04/2026 Closing Balance £676.12',
    ]);
    assert.equal(metroMatches.length, 3);
    assert.equal(metroMatches.find((item) => item.serviceName === 'PureGym Membership')?.amountGbp, 23.99);
    assert.equal(metroMatches.find((item) => item.serviceName === 'O2')?.amountGbp, 19.4);
    assert.equal(metroMatches.find((item) => item.serviceName === 'Spotify Premium')?.amountGbp, 11.99);
    assert.equal(metroMatches.some((item) => /Audible/i.test(item.serviceName)), false);
  });

  it('enforces Virgin Money Stage 3 hardening: bank detection, Direct Debit Payment & Recurring Card Purchase, inline balance stripping, Virgin Active vs Virgin Money Saver/Instant Savings exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['Virgin Money', 'Sort code 82-00-00', '08/04/2026 INSTANT SAVINGS TRANSFER £100.00']).format,
      'virgin-money',
    );
    assert.equal(detectBankFormat(['Direct Debit', 'Card Payment', 'Savings £50.00']).format, 'generic');

    const virginMatches = scan([
      '01/04/2026 Direct Debit Payment VIRGIN ACTIVE £109.00 Balance £1,750.00',
      '02/04/2026 Recurring Card Purchase DISNEY PLUS £7.99 Balance £1,742.01',
      '03/04/2026 Direct Debit Payment VIRGIN MEDIA MONTHLY £42.00 Balance £1,700.01',
      '04/04/2026 Direct Debit Payment NOW TV £9.99 Balance £1,690.02',
      '06/04/2026 RETURNED DD NOW TV £9.99 Balance £1,700.01',
      // Exclusions: Instant Savings, M Plus Saver, Virgin Money Saver, Tesco grocery, Uber Trip, Credit interest
      '08/04/2026 TRANSFER TO INSTANT SAVINGS £250.00 1,450.01',
      '09/04/2026 INSTANT SAVINGS TRANSFER £100.00 1,350.01',
      '10/04/2026 M PLUS SAVER DEPOSIT £50.00 1,300.01',
      '11/04/2026 VIRGIN MONEY SAVER £75.00 1,225.01',
      '12/04/2026 TESCO STORES 2841 £42.17 1,182.84',
      '13/04/2026 CARD PAYMENT UBER *TRIP £18.00 1,164.84',
      '14/04/2026 Credit interest £2.50 1,167.34',
      '30/04/2026 Closing Balance £1,167.34',
    ]);
    assert.equal(virginMatches.length, 3);
    assert.equal(virginMatches.find((item) => item.serviceName === 'Virgin Active')?.amountGbp, 109);
    assert.equal(virginMatches.find((item) => item.serviceName === 'Disney+')?.amountGbp, 7.99);
    assert.equal(virginMatches.find((item) => /VIRGIN MEDIA/i.test(item.serviceName))?.amountGbp, 42);
    assert.equal(virginMatches.some((item) => /Now TV/i.test(item.serviceName)), false);
  });

  it('enforces PayPal Stage 3 hardening: bank detection without PAYPAL * collision, Preapproved/Automatic/Subscription payments, FX conversion isolation, refunds, marketplace & zero-balance exclusions (SYNTHETIC)', () => {
    assert.equal(
      detectBankFormat(['PayPal', 'PayPal Balance', '15/10/2026 Preapproved Payment Bill User Payment NETFLIX.COM -£10.99']).format,
      'paypal',
    );
    assert.equal(detectBankFormat(['15/10/2026 PAYPAL *EBAY UK £14.99', '16/10/2026 CARD PAYMENT £10.00']).format, 'generic');

    const paypalMatches = scan([
      '15/10/2026 Preapproved Payment Bill User Payment NETFLIX.COM -£10.99 GBP',
      '16/10/2026 Automatic Payment SPOTIFY UK -£11.99 GBP',
      '17/10/2026 Subscription Payment ACME CLOUD PRO -£6.99 GBP',
      '18/10/2026 Preapproved Payment Bill User Payment OPENAI *CHATGPT PLUS $20.00 USD (Exchange rate: £1.00 = $1.2618) -£15.85 GBP',
      // Reversed/refunded payment
      '19/10/2026 Automatic Payment DAZN UK -£25.99 GBP',
      '20/10/2026 Reversal DAZN UK £25.99 GBP',
      // Exclusions: Express Checkout (eBay, Vinted, Etsy), Currency Conversion, Card Deposit, Withdrawal, Zero balances
      '21/10/2026 Express Checkout Payment EBAY UK -£14.99 GBP',
      '22/10/2026 Express Checkout Payment VINTED -£12.00 GBP',
      '23/10/2026 Express Checkout Payment ETSY UK -£18.50 GBP',
      '24/10/2026 General Currency Conversion -£15.85 GBP',
      '25/10/2026 General Card Deposit £15.85 GBP',
      '26/10/2026 Bank Deposit to PP Account £50.00 GBP',
      '27/10/2026 Withdrawal to Bank Account -£100.00 GBP',
      '28/10/2026 User Initiated Withdrawal -£40.00 GBP',
      '31/10/2026 Opening Balance £0.00',
      '31/10/2026 PayPal Savings balance $0.00',
      '31/10/2026 PayPal Balance £0.00',
      '31/10/2026 Closing Balance £0.00',
    ]);
    assert.equal(paypalMatches.length, 4);
    assert.equal(paypalMatches.find((item) => item.serviceName === 'Netflix')?.amountGbp, 10.99);
    assert.equal(paypalMatches.find((item) => item.serviceName === 'Spotify Premium')?.amountGbp, 11.99);
    assert.equal(paypalMatches.find((item) => /ACME CLOUD PRO/i.test(item.serviceName))?.amountGbp, 6.99);
    assert.equal(paypalMatches.find((item) => item.serviceName === 'ChatGPT Plus')?.amountGbp, 15.85);
    assert.equal(paypalMatches.some((item) => /DAZN/i.test(item.serviceName)), false);
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

  it('enforces Stage 5A Batch 1 real-PDF structural hardening across Lloyds, Revolut, Monzo, NatWest and Halifax (SANITIZED)', () => {
    // 1. Lloyds: anonymous RETURNED DD pairs with the matching DD on 11 Mar 25 while keeping 18 Feb 25 DD H3G, plus FEE ACCOUNT FEE ... OD
    const lloydsSubs = scan([
      'Date Description Type Money In (£) Money Out (£) Balance (£)',
      '18 Feb 25 H3G DD 17.26 120.40',
      '03 Mar 25 ACCOUNT FEE FEE 11.50 4.85 OD',
      '03 Mar 25 NETFLIX.COM CD 3711 02MAR25 DEB 4.99 11.25',
      '11 Mar 25 H3G DD 17.26 9.57 OD',
      '11 Mar 25 RETURNED DD 17.26 7.83',
    ]);
    assert.equal(lloydsSubs.length, 3);
    const threeSub = lloydsSubs.find((item) => item.serviceName === 'Three');
    assert.equal(threeSub?.amountGbp, 17.26);
    assert.equal(threeSub?.lastPaymentDate, '2025-02-18');
    assert.equal(lloydsSubs.find((item) => item.serviceName === 'Account Fee')?.amountGbp, 11.5);
    assert.equal(lloydsSubs.find((item) => item.serviceName === 'Netflix')?.amountGbp, 4.99);

    // 2. Revolut: Premium plan fee kept; non-recurring single Apple purchases and To: sort/account P2P transfers excluded
    const revolutSubs = scan([
      'Account transactions from 1 April 2024 to 30 April 2024',
      'Date Description Money out Money in Balance',
      '6 Apr 2024 Premium plan fee £7.99 -£7.55',
      '14 Apr 2024 Apple £25.99 £140.00',
      '15 Apr 2024 Apple £2.99 £137.01',
      '18 Apr 2024 J Doe To: J Doe, 04007538, 12345678 (GB) £45.00 £92.01',
    ]);
    assert.equal(revolutSubs.length, 1);
    assert.equal(revolutSubs[0]?.serviceName, 'Revolut Premium / Metal');
    assert.equal(revolutSubs[0]?.amountGbp, 7.99);

    // 3. Monzo: thousands-separated cover balance, plural (Faster Payments), one-off APPLE.COM/BILL vs monthly recurring tiers
    const monzoSubs = scan([
      'Account Holder £5,385.20',
      '01/02/2024 - 31/03/2024',
      'Date Description (GBP) Amount (GBP) Balance',
      '12/02/2024 J Doe (Faster Payments) -45.00 410.00',
      '24/02/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -4.99 405.01',
      '27/02/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -11.99 393.02',
      '28/02/2024 Lebara Mobile Limited -15.00 378.02',
      '05/03/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -1.99 376.03',
      '05/03/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -7.99 368.04',
      '24/03/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -4.99 363.05',
      '27/03/2024 APPLE.COM/BILL ONE INFINITE LOOP GBR -11.99 351.06',
      '28/03/2024 Lebara Mobile Limited -15.00 336.06',
    ]);
    assert.equal(monzoSubs.length, 3);
    assert.equal(monzoSubs.find((item) => item.serviceName === 'Lebara')?.amountGbp, 15);
    assert.equal(
      monzoSubs.some((item) => item.serviceName === 'Apple Services' && item.amountGbp === 11.99 && item.isVerifiedRecurring),
      true,
    );
    assert.equal(
      monzoSubs.some((item) => item.serviceName === 'Apple Services' && item.amountGbp === 4.99 && item.isVerifiedRecurring),
      true,
    );
    assert.equal(monzoSubs.some((item) => item.amountGbp === 1.99 || item.amountGbp === 7.99), false);

    // 4. NatWest: short-date year inference across Dec -> Jan and BROUGHT FORWARD page-break date inheritance
    const natwestSubs = scan([
      'Statement period 14 Dec 2023 to 14 Jan 2024',
      'Date Type Description Paid In Withdrawn Balance',
      '22 DEC Direct Debit FIRSTCENTRALSERV 65.79 810.00',
      'Page 2 of 4',
      'Date Type Description Paid In Withdrawn Balance',
      'BROUGHT FORWARD 810.00',
      'Direct Debit TV LICENCE MBP 41.00 769.00',
      '27 DEC Direct Debit 02 13.10 755.90',
      '09 JAN Direct Debit TALKTALK LIMITED 26.00 729.90',
    ]);
    assert.equal(natwestSubs.find((item) => item.serviceName === 'BBC TV Licence')?.lastPaymentDate, '2023-12-22');
    assert.equal(natwestSubs.find((item) => item.serviceName === 'O2')?.lastPaymentDate, '2023-12-27');
    assert.equal(natwestSubs.find((item) => item.serviceName === 'TalkTalk')?.lastPaymentDate, '2024-01-09');
  });

  it('enforces Stage 5B Batch 2 real-PDF structural hardening & Catalogue-First policy across Starling, HSBC, Metro Bank, Virgin Money and PayPal (SANITIZED)', () => {
    // 1. Starling: CARD SUBSCRIPTION Curve & Apple App Store £0.99 vs ONLINE PAYMENT Apple App Store £1.99, gambling & incoming Revolut exclusions
    const starlingSubs = scan([
      'DATE TYPE TRANSACTION IN OUT ACCOUNT BALANCE',
      '01/11/2023 FASTER PAYMENT Skill On Net Ltd (BG9969JU05XMX2NPP2) £20.00',
      '01/11/2023 FASTER PAYMENT J Doe (Sent from Revolut) £20.00',
      '01/12/2023 DEPOSIT INTEREST Starling Bank (November Interest Earned) £0.06',
      '01/12/2023 ONLINE PAYMENT Gala Bingo £5.00',
      '04/12/2023 CARD SUBSCRIPTION Curve £5.99',
      '08/01/2024 ONLINE PAYMENT 888 £20.00',
      '17/01/2024 ONLINE PAYMENT ProgressPlay £197.01',
      '18/01/2024 ONLINE PAYMENT Apple App Store £1.99',
      '18/01/2024 CARD SUBSCRIPTION Apple App Store £0.99 £0.40',
    ]);
    assert.equal(starlingSubs.length, 2);
    const curveSub = starlingSubs.find((item) => item.serviceName === 'Curve');
    assert.equal(curveSub?.amountGbp, 5.99);
    assert.equal(curveSub?.requiresReview, false);
    const appleSub = starlingSubs.find((item) => item.serviceName === 'Apple Services');
    assert.equal(appleSub?.amountGbp, 0.99);
    assert.equal(appleSub?.requiresReview, true);

    // 2. HSBC: high-value dated DR row still updates activeTableDate for subsequent undated DR row; BIB BACS & CR excluded
    const hsbcTxs = parseStatementLines([
      'Date Payment type and details Paid out Paid in Balance',
      '31 Jul 24 BALANCE BROUGHT FORWARD 23,235.15',
      '02 Aug 24 DR PLAYDALE RBD02084IVJPTAV4 PLAYDALE 11,852.74',
      'DR PLAYDALE RBD02084IVJPTAV4 PAYMENT CHARGE 17.00 11,365.41',
      '06 Aug 24 BP Calver PC 1 HMRC PAYE/NIC CUMB BIB BACS PAYMENT 76.40 11,289.01',
      '30 Aug 24 CR CONE M & T 1st sept hut hire 20.00 11,562.53',
      '30 Aug 24 BALANCE CARRIED FORWARD 11,562.53',
    ]);
    assert.equal(hsbcTxs[0]?.dateIso, '2024-08-02');
    assert.equal(hsbcTxs[0]?.amountGbp, 17);
    assert.deepEqual(matchStatementTransactions(hsbcTxs), []);

    // 3. Metro Bank: Inward Payments rejected as credit; wrapped STAPLES & Outward Fast Payments Screwfix excluded
    const metroTxs = parseStatementLines([
      'DATE TRANSACTION MONEY OUT MONEY IN BALANCE',
      '01 JUN 2019 Inward Payments J Doe 380.15 38,136.26',
      '02 JUN 2019 Card Purchase 02/06/19 09:15:48 STAPLES 312.48 37,823.78',
      '06 JUN 2019 Outward Fast Payments Screwfix Enfield 55.20 37,212.12',
    ]);
    assert.equal(metroTxs.some((tx) => /Inward Payments/i.test(tx.rawLine)), false);
    assert.deepEqual(matchStatementTransactions(metroTxs), []);

    // 4. Virgin Money: real-PDF sort code 82-xx-xx + INSTANT SAVINGS + MOB, M Current Transfer detection & zero subscriptions
    const virginLines = [
      'INSTANT SAVINGS',
      'Account number Sort code Statement date',
      '12345678 82-62-23 01 Sep 22 - 15 Sep 22',
      'Date Description Type Debits Credits Balance',
      '01 Sep 22 Opening Balance £5102.97',
      '05 Sep 22 MOB, M Current Transfer £70.00 £5032.97',
      '14 Sep 22 MOB, J Doe Transfer £90.00 £3510.00',
      'Total debits £1592.97',
      'Total credits',
      'Closing balance £3510.00',
    ];
    assert.equal(detectBankFormat(virginLines).format, 'virgin-money');
    assert.equal(detectBankFormat(virginLines).confidence, 0.95);
    assert.deepEqual(scan(virginLines), []);

    // 5. Catalogue-First policy: excludes household/utility/BNPL/PayPal-mandate Direct Debits and caps unknown candidates at max 2
    const catalogueFirstSubs = scan([
      'Date Type Description Paid In Withdrawn Balance',
      '22 DEC 2023 Direct Debit TV LICENCE MBP 41.00 769.00',
      '27 DEC 2023 Direct Debit 02 13.10 755.90',
      '28 DEC 2023 Direct Debit NATWEST BNPL VIRTU 105.00 650.90',
      '02 JAN 2024 Direct Debit DVLA-AB12CDE 13.12 637.78',
      '03 JAN 2024 Direct Debit OCTOPUS ENERGY 276.85 360.93',
      '04 JAN 2024 Direct Debit PAYPAL PAYMENT 2.99 357.94',
      '05 JAN 2024 Direct Debit ANGLIAN WATER 77.91 280.03',
      '06 JAN 2024 Direct Debit ALPHA CLOUD PRO 19.99 260.04',
      '07 JAN 2024 Direct Debit BETA FITNESS CLUB 29.99 230.05',
      '08 JAN 2024 Direct Debit GAMMA STREAMING 9.99 220.06',
    ]);
    const confirmedCatalogue = catalogueFirstSubs.filter((item) => !item.requiresReview);
    const unknownReview = catalogueFirstSubs.filter((item) => item.requiresReview);
    assert.equal(confirmedCatalogue.length, 2);
    assert.equal(unknownReview.length, 2);
  });
});



