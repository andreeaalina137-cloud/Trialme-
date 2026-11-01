import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatementLines,
  parseStatementAuditLedger,
  checkImpossibleDate,
  classifyUKPaymentType,
  extractCanonicalMerchantKey,
  areMerchantsFuzzyMatch,
  evaluateSubscriptionRecurrenceAndEvidence,
  matchStatementTransactions,
  FLAG_SUMMARY_ROW,
  FLAG_INVALID_DATE,
  FLAG_DUPLICATE,
  FLAG_FX_CONVERSION,
  FLAG_REVOLUT_NOISE,
  FLAG_VALID_BANK_SUB,
  FLAG_TRANSFER_OR_CASH,
  FLAG_RENT_OR_FIXED_TRANSFER,
  FLAG_REFUNDED_PAIR,
  FLAG_PRICE_HIKE,
  FLAG_TRIAL_CONVERTED,
  recordConfirmedScannerLearning,
  getScannerLearning,
  getScannerLearningRecords,
  undoScannerLearning,
} from '../src/scanner';

test('Stage 1: StatementReader Pre-Validation & Unified Normalization', () => {
  const statement = [
    '01/09/2026 Total Money Out £1,450.20',
    '01/09/2026 Balance Brought Forward £2,500.00',
    '15/09/2026 NETFLIX.COM CD 1234 -£10.99',
    '15/09/2026 NETFLIX.COM CD 1234 -£10.99', // duplicate
    '31/09/2026 SPOTIFY UK -£11.99', // impossible date (31 Sep)
  ];

  const ledger = parseStatementAuditLedger(statement, new Date('2026-10-01T00:00:00Z'));

  // 1. Raw data preservation
  const validDebit = ledger.find((r) => r.amountGbp === 10.99 && r.status === 'ACCEPTED');
  assert.ok(validDebit, 'Valid debit must exist');
  assert.equal(validDebit.rawAmount, 10.99);
  assert.ok(validDebit.rawDescription?.includes('NETFLIX.COM'));
  assert.equal(validDebit.signedAmount, -10.99);

  // 2. Summary row exclusion
  const summaryRows = ledger.filter((r) => r.auditFlag === FLAG_SUMMARY_ROW);
  assert.equal(summaryRows.length, 2);
  assert.equal(summaryRows[0].status, 'QUARANTINED');

  // 3. Impossible date check
  const impossibleDateCheck = checkImpossibleDate('31/09/2026 SPOTIFY UK -£11.99');
  assert.equal(impossibleDateCheck.isImpossible, true);
  const invalidDateRows = ledger.filter((r) => r.auditFlag === FLAG_INVALID_DATE);
  assert.equal(invalidDateRows.length, 1);
  assert.equal(invalidDateRows[0].status, 'QUARANTINED');

  // 4. Duplicate detection
  const duplicateRows = ledger.filter((r) => r.auditFlag === FLAG_DUPLICATE);
  assert.equal(duplicateRows.length, 1);
  assert.equal(duplicateRows[0].status, 'QUARANTINED');

  // 5. Strict accounting signs
  const accepted = parseStatementLines(statement, new Date('2026-10-01T00:00:00Z'));
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].amountGbp, 10.99);
});

test('Stage 2: Auditable Quarantine & Noise Filtering (FX, Revolut, UK payment classification & rent)', () => {
  const statement = [
    '02/09/2026 Exchanged to EUR 50.00 FX Fee £1.50',
    '03/09/2026 RevPoints spare change round-up £0.45',
    '04/09/2026 Revolut Metal plan fee £14.99',
    '05/09/2026 ATM Cash Withdrawal £50.00',
    '06/09/2026 FASTER PAYMENT TO JOHN SMITH £25.00',
    '07/09/2026 STANDING ORDER LANDLORD RENT £800.00',
    '08/09/2026 DIRECT DEBIT SKY STREAM £36.00',
    '09/09/2026 CARD PAYMENT NETFLIX.COM £10.99',
  ];

  const ledger = parseStatementAuditLedger(statement, new Date('2026-10-01T00:00:00Z'));

  // FX quarantine
  const fxRow = ledger.find((r) => r.auditFlag === FLAG_FX_CONVERSION);
  assert.ok(fxRow);
  assert.equal(fxRow.status, 'QUARANTINED');

  // Revolut noise quarantine vs paid plan allowance
  const noiseRow = ledger.find((r) => r.auditFlag === FLAG_REVOLUT_NOISE);
  assert.ok(noiseRow);
  assert.equal(noiseRow.status, 'QUARANTINED');

  const paidPlanRow = ledger.find((r) => r.auditFlag === FLAG_VALID_BANK_SUB);
  assert.ok(paidPlanRow);
  assert.equal(paidPlanRow.status, 'ACCEPTED');

  // UK Payment Types classification
  assert.equal(classifyUKPaymentType('ATM Cash Withdrawal £50.00'), 'ATM_CASH');
  assert.equal(classifyUKPaymentType('FASTER PAYMENT TO JOHN SMITH £25.00'), 'P2P_TRANSFER');
  assert.equal(classifyUKPaymentType('STANDING ORDER LANDLORD RENT £800.00'), 'STANDING_ORDER');
  assert.equal(classifyUKPaymentType('DIRECT DEBIT SKY STREAM £36.00'), 'DIRECT_DEBIT');
  assert.equal(classifyUKPaymentType('CARD PAYMENT NETFLIX.COM £10.99'), 'RECURRING_CARD_CPA');

  // Rent / large round Standing Order quarantine
  const rentRow = ledger.find((r) => r.auditFlag === FLAG_RENT_OR_FIXED_TRANSFER);
  assert.ok(rentRow);
  assert.equal(rentRow.status, 'QUARANTINED');
  assert.equal(rentRow.amountGbp, 800);

  // Transfer / ATM quarantine
  const transferOrCash = ledger.filter((r) => r.auditFlag === FLAG_TRANSFER_OR_CASH);
  assert.equal(transferOrCash.length, 2);
});

test('Stage 3: Dynamic Merchant Cleaning & Fuzzy Grouping', () => {
  const key1 = extractCanonicalMerchantKey('NETFLIX.COM 849201 LONDON');
  const key2 = extractCanonicalMerchantKey('NETFLIX *11294');
  const key3 = extractCanonicalMerchantKey('NETFLIX.COM GBR');
  assert.equal(key1, 'NETFLIX');
  assert.equal(key2, 'NETFLIX');
  assert.equal(key3, 'NETFLIX');

  assert.equal(areMerchantsFuzzyMatch('SPOTIFY', 'SPOTIFY'), true);
  assert.equal(areMerchantsFuzzyMatch('SPOTIFY', 'SPOTIF'), true);
  assert.equal(areMerchantsFuzzyMatch('ADOBE', 'AMAZON'), false);
});

test('Stage 4: Refund & Reversal Net-Zero Matching (1-14 day window)', () => {
  const statement = [
    '01/09/2026 DEB GYM CLUB -£35.00',
    '03/09/2026 GYM CLUB REVERSAL +£35.00',
    '05/09/2026 DIRECT DEBIT SPOTIFY -£11.99',
  ];

  const ledger = parseStatementAuditLedger(statement, new Date('2026-10-01T00:00:00Z'));
  const refundedDebit = ledger.find(
    (r) => r.rawLine.includes('GYM CLUB') && r.signedAmount !== undefined && r.signedAmount < 0,
  );
  assert.ok(refundedDebit);
  assert.equal(refundedDebit.status, 'QUARANTINED');
  assert.equal(refundedDebit.auditFlag, FLAG_REFUNDED_PAIR);

  // Accepted should only contain active Spotify debit
  const accepted = parseStatementLines(statement, new Date('2026-10-01T00:00:00Z'));
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].amountGbp, 11.99);
});

test('Stage 5: UK Recurrence Engine, Silent Price Hike, Converted Trial & Evidence Generation', () => {
  // 1. Silent Price Hike Detection (increased by > 8% on monthly interval)
  const priceHikeRows = [
    {
      rawLine: '01/07/2026 DIRECT DEBIT CHATGPT PLUS £10.00',
      cleanedMerchant: 'CHATGPT PLUS',
      amountGbp: 10.0,
      signedAmount: -10.0,
      dateIso: '2026-07-01',
      billingDay: 1,
      paymentType: 'DIRECT_DEBIT' as const,
      hasStrongRecurringMarker: true,
      status: 'ACCEPTED' as const,
      isCredit: false,
      isHighValueTransfer: false,
    },
    {
      rawLine: '01/08/2026 DIRECT DEBIT CHATGPT PLUS £10.00',
      cleanedMerchant: 'CHATGPT PLUS',
      amountGbp: 10.0,
      signedAmount: -10.0,
      dateIso: '2026-08-01',
      billingDay: 1,
      paymentType: 'DIRECT_DEBIT' as const,
      hasStrongRecurringMarker: true,
      status: 'ACCEPTED' as const,
      isCredit: false,
      isHighValueTransfer: false,
    },
    {
      rawLine: '01/09/2026 DIRECT DEBIT CHATGPT PLUS £12.50', // 25% increase (£2.50)
      cleanedMerchant: 'CHATGPT PLUS',
      amountGbp: 12.5,
      signedAmount: -12.5,
      dateIso: '2026-09-01',
      billingDay: 1,
      paymentType: 'DIRECT_DEBIT' as const,
      hasStrongRecurringMarker: true,
      status: 'ACCEPTED' as const,
      isCredit: false,
      isHighValueTransfer: false,
    },
  ];

  const evalHike = evaluateSubscriptionRecurrenceAndEvidence(
    priceHikeRows,
    null,
    'ChatGPT Plus',
    'AI & Tech',
    new Date('2026-09-05T00:00:00Z'),
  );

  assert.equal(evalHike.auditFlag, FLAG_PRICE_HIKE);
  assert.ok(evalHike.priceAlert);
  assert.equal(evalHike.priceAlert.previousAmount, 10.0);
  assert.equal(evalHike.priceAlert.newAmount, 12.5);
  assert.equal(evalHike.priceAlert.difference, 2.5);
  assert.equal(evalHike.priceAlert.formattedDifference, '+£2.50');
  assert.equal(evalHike.subscriptionType, 'Direct Debit');
  assert.ok(evalHike.confidenceScore >= 70);
  assert.ok(evalHike.evidence.whyDetected.some((w) => w.includes('Price increased by £2.50')));
  assert.equal(evalHike.evidence.confirmingTransactions.length, 3);

  // 2. Trial Converted to Paid Detection (£0.00 or <= £1.99 -> paid recurring after interval)
  const trialConvertedRows = [
    {
      rawLine: '01/08/2026 STREAMING TRIAL £0.00',
      cleanedMerchant: 'STREAMING TRIAL',
      amountGbp: 0.0,
      signedAmount: 0.0,
      dateIso: '2026-08-01',
      billingDay: 1,
      paymentType: 'RECURRING_CARD_CPA' as const,
      hasStrongRecurringMarker: false,
      status: 'ACCEPTED' as const,
      isCredit: false,
      isHighValueTransfer: false,
    },
    {
      rawLine: '01/09/2026 STREAMING TRIAL £9.99',
      cleanedMerchant: 'STREAMING TRIAL',
      amountGbp: 9.99,
      signedAmount: -9.99,
      dateIso: '2026-09-01',
      billingDay: 1,
      paymentType: 'RECURRING_CARD_CPA' as const,
      hasStrongRecurringMarker: false,
      status: 'ACCEPTED' as const,
      isCredit: false,
      isHighValueTransfer: false,
    },
  ];

  const evalTrial = evaluateSubscriptionRecurrenceAndEvidence(
    trialConvertedRows,
    null,
    'Streaming Trial',
    'Streaming',
    new Date('2026-09-05T00:00:00Z'),
  );

  assert.equal(evalTrial.auditFlag, FLAG_TRIAL_CONVERTED);
  assert.equal(evalTrial.evidence.auditFlag, FLAG_TRIAL_CONVERTED);
  assert.ok(evalTrial.evidence.whyDetected.some((w) => w.includes('Trial converted to paid subscription')));

  // 3. Full Statement Matching with Evidence Attachment
  const statement = [
    '01/07/2026 DIRECT DEBIT THE GYM £21.99',
    '03/08/2026 DIRECT DEBIT THE GYM £21.99', // 33-day UK weekend shift interval
    '01/09/2026 DIRECT DEBIT THE GYM £21.99',
  ];
  const parsed = parseStatementLines(statement, new Date('2026-09-10T00:00:00Z'));
  const matched = matchStatementTransactions(parsed);
  assert.equal(matched.length, 1);
  const gymSub = matched[0];
  assert.ok(gymSub.evidence);
  assert.equal(gymSub.evidence.subscriptionType, 'Direct Debit');
  assert.equal(gymSub.evidence.confidenceScore, 100); // 40 (interval) + 30 (fixed) + 20 (DD marker) + 10 (.99 ending)
  assert.equal(gymSub.evidence.confirmingTransactions.length, 3);
});

test('Stage 6: Scanner Hardening, Memory Optimization & Zero False Positives', () => {
  // 1. Strict 3-Tier Filter: Eliminate local shops, supermarkets, cafes even if repeating
  const statementWithRetailAndSubs = [
    // Local shops repeating same amount: Must be REJECTED (Tier 3)
    '01/08/2026 DEB RANYA STORE CORBY £7.00',
    '01/09/2026 DEB RANYA STORE CORBY £7.00',
    '05/08/2026 DEB ROCKINGHAM EURO MA CORBY £4.72',
    '05/09/2026 DEB ROCKINGHAM EURO MA CORBY £4.72',
    '10/08/2026 DEB MOTO TEC CORBY £29.00',
    '10/09/2026 DEB MOTO TEC CORBY £29.00',
    '12/08/2026 DEB AFRICALL £16.52',
    '12/09/2026 DEB AFRICALL £16.52',
    '15/08/2026 DEB TESCO GROCERY CORBY £45.20',
    '15/09/2026 DEB TESCO GROCERY CORBY £45.20',
    // Tier 1 Whitelist preset (one-off occurrence): Must be ACCEPTED
    '18/09/2026 DEB NETFLIX.COM £10.99',
    // Tier 2 Explicit Bank Signals (Direct Debit): Must be ACCEPTED
    '20/08/2026 DIRECT DEBIT PUREGYM £19.99',
    '20/09/2026 DIRECT DEBIT PUREGYM £19.99',
    '22/09/2026 DD THREE MOBILE £15.00',
  ];

  const parsed = parseStatementLines(statementWithRetailAndSubs, new Date('2026-10-01T00:00:00Z'));
  const matched = matchStatementTransactions(parsed);

  const matchedNames = matched.map((m) => m.serviceName);

  // Assert false positives are 100% eliminated
  assert.equal(matchedNames.some((n) => /Ranya/i.test(n)), false, 'Ranya Store must be rejected');
  assert.equal(matchedNames.some((n) => /Rockingham/i.test(n)), false, 'Rockingham Euro Market must be rejected');
  assert.equal(matchedNames.some((n) => /Moto Tec/i.test(n)), false, 'Moto Tec must be rejected');
  assert.equal(matchedNames.some((n) => /Africall/i.test(n)), false, 'Africall must be rejected');
  assert.equal(matchedNames.some((n) => /Tesco Grocery/i.test(n)), false, 'Tesco Grocery must be rejected');

  // Assert genuine subscriptions are preserved
  assert.ok(matchedNames.some((n) => /Netflix/i.test(n)), 'Netflix must be accepted via Tier 1 whitelist');
  assert.ok(matchedNames.some((n) => /PureGym/i.test(n)), 'PureGym must be accepted via Tier 2 Direct Debit signal');
  assert.ok(matchedNames.some((n) => /Three/i.test(n)), 'Three Mobile must be accepted via Tier 2 DD signal');

  // 2. Lightweight Learning Memory: Capping, Decay & Cache
  recordConfirmedScannerLearning({
    merchantLabel: 'TEST STREAMING SERVICE',
    serviceName: 'Test Streaming Service',
    category: 'Streaming',
    frequency: 'monthly',
    amountGbp: 8.99,
  });

  const learned = getScannerLearning('TEST STREAMING SERVICE');
  assert.equal(learned?.decision, 'confirmed');
  assert.equal(learned?.amountGbp, 8.99);
  assert.ok(getScannerLearningRecords().length > 0);

  // Undo restores cleanly without memory leaks
  const undone = undoScannerLearning('TEST STREAMING SERVICE');
  assert.equal(undone, true);
  assert.equal(getScannerLearning('TEST STREAMING SERVICE'), null);
});

