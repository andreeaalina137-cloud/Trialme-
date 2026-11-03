// Hand-authored adversarial set. NEVER used for training, validation or threshold selection.
// expect:
//   NOT_SUB  - must not be claimed as SUBSCRIPTION_SERVICE (abstaining is acceptable)
//   ABSTAIN  - must be AMBIGUOUS or abstain (a specific service claim would be unsafe)
//   SUB      - is a genuine subscription service; predicting SUB is correct, abstaining is a (safe) miss
export const ADVERSARIAL = [
  // MONETRY known adversarial cases
  { text: 'DEB MOTO TEC CORBY', expect: 'NOT_SUB', note: 'known MONETRY false positive' },
  { text: 'MOTO TEC CORBY GB', expect: 'NOT_SUB', note: 'known MONETRY false positive' },
  { text: 'DEB AFRICALL', expect: 'NOT_SUB', note: 'known MONETRY false positive' },
  { text: 'AFRICALL LTD LONDON GB', expect: 'NOT_SUB', note: 'known MONETRY false positive' },
  { text: 'REVPOINTS SPARE CHANGE', expect: 'NOT_SUB', note: 'Revolut noise' },
  { text: 'REVPOINTS SPARE CHANGE VAULT', expect: 'NOT_SUB', note: 'Revolut noise' },
  { text: 'DEB RANYA STORE CORBY', expect: 'NOT_SUB', note: 'repeated Â£10 corner shop' },
  { text: 'CARD PAYMENT TO ONE STOP 1464', expect: 'NOT_SUB', note: 'repeated Â£10 corner shop' },
  { text: 'CD KWIK SAVE CONVENIENCE STORE', expect: 'NOT_SUB', note: 'corner shop' },
  { text: 'APPLE.COM/BILL', expect: 'ABSTAIN', note: 'Apple price-tier service is not identifiable from text' },
  { text: 'CARD TRANSACTION 7248 APPLE.COM/BILL CORK IE', expect: 'ABSTAIN', note: 'Apple bill' },
  { text: 'GOOGLE *PLAY STORE', expect: 'ABSTAIN', note: 'Google Play is not identifiable' },
  { text: 'GOOGLE *GSUITE_ACME', expect: 'ABSTAIN', note: 'Google billing descriptor' },
  // Similar-looking but unrelated merchants
  { text: 'THREE HORSESHOES PUB LONDON', expect: 'NOT_SUB', note: 'Three vs Three Mobile' },
  { text: 'SQ *THREE COTTAGES', expect: 'NOT_SUB', note: 'Three vs Three Mobile (Square POS)' },
  { text: 'O2 ARENA TICKETS LONDON', expect: 'NOT_SUB', note: 'O2 vs O2 mobile' },
  { text: 'VIRGIN ATLANTIC AIRWAYS', expect: 'NOT_SUB', note: 'Virgin Active vs Virgin Atlantic' },
  { text: 'SKYSCANNER FLIGHTS', expect: 'NOT_SUB', note: 'Sky vs Skyscanner' },
  { text: 'THE APPLE TREE PUB', expect: 'NOT_SUB', note: 'Apple vs apple tree pub' },
  { text: 'AMAZONIA GARDEN CENTRE', expect: 'NOT_SUB', note: 'Amazon vs Amazonia' },
  { text: 'PUREFOODS BAKERY', expect: 'NOT_SUB', note: 'Pure vs PureGym' },
  // Payment-processor identity vs merchant identity
  { text: 'PAYPAL *ZXCVB1234', expect: 'ABSTAIN', note: 'processor, not merchant' },
  { text: 'STRIPE* ACME LTD', expect: 'ABSTAIN', note: 'processor, not merchant' },
  { text: 'PADDLE.NET* APPNAME', expect: 'ABSTAIN', note: 'processor, not merchant' },
  { text: 'LEMON SQUEEZY* ACME', expect: 'ABSTAIN', note: 'processor, not merchant' },
  { text: 'SUMUP *MARKET STALL', expect: 'NOT_SUB', note: 'POS processor' },
  // Generic / ambiguous bank text
  { text: 'DIRECT DEBIT REF 5521', expect: 'ABSTAIN', note: 'Direct Debit alone is not a subscription' },
  { text: 'DD 8890231 REF 44', expect: 'ABSTAIN', note: 'generic DD' },
  { text: 'STANDING ORDER 112233', expect: 'ABSTAIN', note: 'generic SO' },
  { text: 'CARD PAYMENT 4821 GB', expect: 'ABSTAIN', note: 'no merchant content' },
  // Transfers, cash, fees, bills
  { text: 'FASTER PAYMENT TO MISS N HELLIE', expect: 'NOT_SUB', note: 'P2P' },
  { text: 'BILL PAYMENT TO JO ROSSER REF LEND', expect: 'NOT_SUB', note: 'P2P' },
  { text: 'LNK ASDA HAREHILLS CPT', expect: 'NOT_SUB', note: 'cash withdrawal' },
  { text: 'ACCOUNT FEE JUN 2026', expect: 'NOT_SUB', note: 'bank fee, not a commercial subscription' },
  { text: 'OD INTEREST 31/05 DAILY CHARGE', expect: 'NOT_SUB', note: 'overdraft interest' },
  { text: 'HMRC CUMBERNAULD', expect: 'NOT_SUB', note: 'tax' },
  { text: 'DIRECT DEBIT DUDLEY MBC COUNCIL TAX', expect: 'NOT_SUB', note: 'council tax' },
  { text: 'DRIFT COMPETITIONS', expect: 'NOT_SUB', note: 'prize competition' },
  // OCR-corrupted known services (identity robustness; abstaining is acceptable)
  { text: 'NETFL1X.C0M', expect: 'SUB', note: 'OCR corrupted' },
  { text: 'SP0TIFY AB', expect: 'SUB', note: 'OCR corrupted' },
  { text: 'PUREGYM LTD 8OO8', expect: 'SUB', note: 'OCR corrupted' },
  { text: 'TESC0 STORES 29O1', expect: 'NOT_SUB', note: 'OCR corrupted retail' },
  { text: 'SA1NSBURYS S/MKTS', expect: 'NOT_SUB', note: 'OCR corrupted retail' },
  // Genuinely unseen subscription services (realistic bank descriptors, no helper words)
  { text: 'POSTHOG INC', expect: 'SUB', note: 'unseen SaaS' },
  { text: 'RETOOL INC', expect: 'SUB', note: 'unseen SaaS' },
  { text: 'RAYCAST TECHNOLOGIES', expect: 'SUB', note: 'unseen SaaS' },
  { text: 'OBSIDIAN MD SYNC', expect: 'SUB', note: 'unseen SaaS' },
  { text: 'GYMSHARK CENTRAL MEMBERSHIP', expect: 'SUB', note: 'unseen gym membership' },
  { text: 'KINDLE UNLIMITED', expect: 'SUB', note: 'unseen media subscription' },
  { text: 'DISNEY PLUS ANNUAL', expect: 'SUB', note: 'subscription variant' },
];

