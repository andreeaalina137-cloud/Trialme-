import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initAISemanticModel,
  isAIModelReady,
  isAIEnabled,
  setAIEnabled,
  getAIModelStatus,
  classifyTransactionWithAI,
} from '../src/scanner/services/aiSemanticClassifier';
import { matchStatementTransactions } from '../src/scanner/services/statementMatcher';
import type { ScannedTransaction } from '../src/scanner/types/scanner.types';

describe('MONETRY AI Semantic Intelligence Engine', () => {
  before(async () => {
    const success = await initAISemanticModel();
    assert.strictEqual(success, true, 'Model must load successfully from local binary artifact');
  });

  test('Model Artifact Integrity & Size Budget', () => {
    assert.strictEqual(isAIModelReady(), true, 'AI model must be ready for local offline inference');
    const status = getAIModelStatus();
    assert.strictEqual(status.isLoaded, true);
    assert.strictEqual(status.isEnabled, true);
    assert.strictEqual(status.version, 'v1.0.0');
    assert.strictEqual(status.hiddenDim, 384);
    assert.strictEqual(status.vocabSize, 6282);
    assert.strictEqual(status.galleryCount, 340);

    const modelPath = path.resolve('src/scanner/models/monetry_semantic_v1.bin');
    assert.strictEqual(fs.existsSync(modelPath), true, 'Model binary must exist in repo');
    const stat = fs.statSync(modelPath);
    const sizeMb = stat.size / (1024 * 1024);
    console.log(`Measured Model Binary Size: ${sizeMb.toFixed(3)} MB`);
    assert.ok(sizeMb <= 5.0, `Model size (${sizeMb.toFixed(2)} MB) must not exceed 5.0 MB budget`);
  });

  test('Fast Tokenization & Local CPU Latency', () => {
    const status = getAIModelStatus();
    assert.ok(status.vocabSize > 0);

    const t0 = performance.now();
    const count = 100;
    for (let i = 0; i < count; i++) {
      classifyTransactionWithAI('POSTHOG INC SOFTWARE US');
    }
    const elapsed = performance.now() - t0;
    const avgLatencyMs = elapsed / count;
    console.log(`Average Local CPU Inference Latency: ${avgLatencyMs.toFixed(3)} ms`);
    assert.ok(avgLatencyMs < 5.0, `Inference latency (${avgLatencyMs.toFixed(2)} ms) must be under 5.0 ms`);
  });

  describe('Positive Subscription Examples', () => {
    test('Recognizes known subscription services with high confidence', () => {
      const services = [
        'NETFLIX.COM LONDON',
        'SPOTIFY AB STOCKHOLM',
        'ADOBE CREATIVE CLOUD',
        'OPENAI *CHATGPT SUBSCRIPTION',
      ];
      for (const s of services) {
        const ev = classifyTransactionWithAI(s);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, true, `Expected ${s} to be subscription candidate`);
        assert.ok(ev.confidence >= 0.80, `Expected ${s} confidence >= 0.80, got ${ev.confidence}`);
      }
    });

    test('Generalizes to genuinely unseen SaaS and tech subscriptions', () => {
      const unseen = [
        { text: 'POSTHOG INC', expectedCategory: 'AI & Tech' },
        { text: 'RETOOL INC', expectedCategory: 'Productivity' },
        { text: 'RAYCAST TECHNOLOGIES', expectedCategory: 'Productivity' },
        { text: 'OBSIDIAN MD SYNC', expectedCategory: 'Productivity' },
      ];
      for (const item of unseen) {
        const ev = classifyTransactionWithAI(item.text);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, true, `Expected unseen SaaS '${item.text}' to be sub`);
        assert.strictEqual(ev.predictedLabel, 'SUBSCRIPTION_SERVICE');
      }
    });

    test('Recognizes gyms, memberships and telecom providers', () => {
      const members = [
        'PUREGYM LTD EDINBURGH',
        'GYMSHARK CENTRAL MEMBERSHIP',
        'EE LIMITED MONTHLY PAYMENT',
        'VODAFONE LTD DD',
      ];
      for (const text of members) {
        const ev = classifyTransactionWithAI(text);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, true, `Expected membership '${text}' to be sub`);
      }
    });
  });

  describe('Negative Non-Subscription Examples', () => {
    test('Rejects supermarkets, retail and convenience stores', () => {
      const retail = [
        'TESCO STORES 2901',
        'SAINSBURYS S/MKTS NOTTINGHAM',
        'ASDA STORES 4421',
        'LIDL GB NOTTINGHAM',
        'ALDI STORES LTD',
        'CD KWIK SAVE CONVENIENCE STORE',
        'RANYA STORE CORBY',
      ];
      for (const text of retail) {
        const ev = classifyTransactionWithAI(text);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, false, `Expected retail '${text}' to NOT be sub`);
        assert.strictEqual(ev.predictedLabel, 'ONE_OFF_RETAIL');
      }
    });

    test('Rejects fuel stations, transport, pubs and food outlets', () => {
      const outlets = [
        'TFL TRAVEL CH',
        'COSTA MAPPERLEY NOTTINGHAM',
        'KFC MAPPERLEY GB',
        'THE APPLE TREE PUB',
        'THREE HORSESHOES PUB LONDON',
        'PUREFOODS BAKERY',
      ];
      for (const text of outlets) {
        const ev = classifyTransactionWithAI(text);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, false, `Expected food/pub '${text}' to NOT be sub`);
      }
    });

    test('Rejects P2P transfers, cash withdrawals, and council tax', () => {
      const nonSubs = [
        'FASTER PAYMENT TO MISS N HELLIE',
        'BILL PAYMENT TO JO ROSSER REF LEND',
        'LNK ASDA HAREHILLS CPT',
        'ACCOUNT FEE JUN 2026',
        'OD INTEREST 31/05 DAILY CHARGE',
        'DIRECT DEBIT DUDLEY MBC COUNCIL TAX',
        'HMRC CUMBERNAULD',
      ];
      for (const text of nonSubs) {
        const ev = classifyTransactionWithAI(text);
        assert.ok(ev !== null);
        assert.strictEqual(ev.isSubscriptionCandidate, false, `Expected transfer/fee/tax '${text}' to NOT be sub`);
        assert.notStrictEqual(ev.predictedLabel, 'SUBSCRIPTION_SERVICE');
      }
    });
  });

  describe('Adversarial Test Suite (Strict 0 Unsafe Claims)', () => {
    test('Zero false positives on all 40 non-sub and abstain adversarial benchmarks', () => {
      const adversarialCases = [
        { text: 'DEB MOTO TEC CORBY', expectNotSub: true },
        { text: 'MOTO TEC CORBY GB', expectNotSub: true },
        { text: 'DEB AFRICALL', expectNotSub: true },
        { text: 'AFRICALL LTD LONDON GB', expectNotSub: true },
        { text: 'REVPOINTS SPARE CHANGE', expectNotSub: true },
        { text: 'REVPOINTS SPARE CHANGE VAULT', expectNotSub: true },
        { text: 'DEB RANYA STORE CORBY', expectNotSub: true },
        { text: 'CARD PAYMENT TO ONE STOP 1464', expectNotSub: true },
        { text: 'CD KWIK SAVE CONVENIENCE STORE', expectNotSub: true },
        { text: 'APPLE.COM/BILL', expectNotSub: true },
        { text: 'CARD TRANSACTION 7248 APPLE.COM/BILL CORK IE', expectNotSub: true },
        { text: 'GOOGLE *PLAY STORE', expectNotSub: true },
        { text: 'GOOGLE *GSUITE_ACME', expectNotSub: true },
        { text: 'THREE HORSESHOES PUB LONDON', expectNotSub: true },
        { text: 'SQ *THREE COTTAGES', expectNotSub: true },
        { text: 'O2 ARENA TICKETS LONDON', expectNotSub: true },
        { text: 'VIRGIN ATLANTIC AIRWAYS', expectNotSub: true },
        { text: 'SKYSCANNER FLIGHTS', expectNotSub: true },
        { text: 'THE APPLE TREE PUB', expectNotSub: true },
        { text: 'AMAZONIA GARDEN CENTRE', expectNotSub: true },
        { text: 'PUREFOODS BAKERY', expectNotSub: true },
        { text: 'PAYPAL *ZXCVB1234', expectNotSub: true },
        { text: 'STRIPE* ACME LTD', expectNotSub: true },
        { text: 'PADDLE.NET* APPNAME', expectNotSub: true },
        { text: 'LEMON SQUEEZY* ACME', expectNotSub: true },
        { text: 'SUMUP *MARKET STALL', expectNotSub: true },
        { text: 'DIRECT DEBIT REF 5521', expectNotSub: true },
        { text: 'DD 8890231 REF 44', expectNotSub: true },
        { text: 'STANDING ORDER 112233', expectNotSub: true },
        { text: 'CARD PAYMENT 4821 GB', expectNotSub: true },
        { text: 'FASTER PAYMENT TO MISS N HELLIE', expectNotSub: true },
        { text: 'BILL PAYMENT TO JO ROSSER REF LEND', expectNotSub: true },
        { text: 'LNK ASDA HAREHILLS CPT', expectNotSub: true },
        { text: 'ACCOUNT FEE JUN 2026', expectNotSub: true },
        { text: 'OD INTEREST 31/05 DAILY CHARGE', expectNotSub: true },
        { text: 'HMRC CUMBERNAULD', expectNotSub: true },
        { text: 'DIRECT DEBIT DUDLEY MBC COUNCIL TAX', expectNotSub: true },
        { text: 'DRIFT COMPETITIONS', expectNotSub: true },
        { text: 'TESC0 STORES 29O1', expectNotSub: true },
        { text: 'SA1NSBURYS S/MKTS', expectNotSub: true },
      ];

      for (const item of adversarialCases) {
        const ev = classifyTransactionWithAI(item.text);
        assert.ok(ev !== null, `Expected result for '${item.text}'`);
        assert.strictEqual(
          ev.isSubscriptionCandidate,
          false,
          `ADVERSARIAL BREACH: '${item.text}' was wrongly claimed as subscription candidate!`
        );
      }
    });
  });

  describe('Deterministic Gates & Fallback Safety', () => {
    test('AI cannot bypass Gate 1 or promote quarantined transactions', () => {
      const quarantinedTx: ScannedTransaction = {
        dateIso: '2026-05-10',
        billingDay: 10,
        isHighValueTransfer: false,
        rawLine: 'Direct Debit Netflix.com £10.99',
        cleanedMerchant: 'NETFLIX.COM',
        amountGbp: 10.99,
        isCredit: false,
        validityScore: 0,
        status: 'QUARANTINED',
        tableState: 'OUT_OF_TABLE',
      };

      const results = matchStatementTransactions([quarantinedTx]);
      assert.strictEqual(results.length, 0, 'Gate 1 must prevent quarantined transactions from matching');
    });

    test('Graceful fallback when AI is disabled', () => {
      setAIEnabled(false);
      assert.strictEqual(isAIEnabled(), false);

      const ev = classifyTransactionWithAI('NETFLIX.COM');
      assert.strictEqual(ev, null, 'Must return null when AI is disabled');

      const validTx: ScannedTransaction = {
        dateIso: '2026-05-10',
        billingDay: 10,
        isHighValueTransfer: false,
        rawLine: 'Direct Debit Netflix.com £10.99',
        cleanedMerchant: 'NETFLIX.COM',
        amountGbp: 10.99,
        isCredit: false,
        validityScore: 3,
        status: 'ACCEPTED',
        tableState: 'IN_TABLE',
      };

      const results = matchStatementTransactions([validTx]);
      assert.strictEqual(results.length, 1, 'Scanner must function normally when AI is disabled');
      assert.strictEqual(results[0].serviceName, 'Netflix');

      // Re-enable for subsequent tests
      setAIEnabled(true);
      assert.strictEqual(isAIEnabled(), true);
    });
  });
});
