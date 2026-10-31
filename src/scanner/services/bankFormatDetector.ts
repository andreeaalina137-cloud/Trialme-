export type SupportedBankFormat =
  | 'revolut'
  | 'monzo'
  | 'starling'
  | 'barclays'
  | 'hsbc'
  | 'lloyds'
  | 'natwest'
  | 'santander'
  | 'nationwide'
  | 'halifax'
  | 'tsb'
  | 'chase-uk'
  | 'metro-bank'
  | 'first-direct'
  | 'co-operative'
  | 'virgin-money'
  | 'wise'
  | 'paypal'
  | 'monese'
  | 'generic';

export interface BankFormatDetection {
  format: SupportedBankFormat;
  confidence: number;
  evidence: string[];
  requiresReview: boolean;
}

const FORMAT_MARKERS: Array<{
  format: Exclude<SupportedBankFormat, 'generic'>;
  markers: RegExp[];
}> = [
  { format: 'revolut', markers: [/revolut/i, /card payment/i, /direct debit/i] },
  { format: 'monzo', markers: [/monzo/i, /emoji\s*,?\s*category/i, /pot transfer/i] },
  { format: 'starling', markers: [/starling/i, /mastercard/i, /faster payment/i] },
  { format: 'barclays', markers: [/barclays/i, /\b(?:DDR|CPT|BGC|STO)\b/i] },
  { format: 'hsbc', markers: [/hsbc/i, /\b(?:VIS|BP)\b/i] },
  { format: 'lloyds', markers: [/lloyds/i, /\b(?:DEB|FPO|SO)\b/i] },
  { format: 'natwest', markers: [/natwest/i, /\b(?:POS|D\/D|C\/L)\b/i] },
  { format: 'santander', markers: [/santander/i, /direct debit payment to/i] },
  { format: 'nationwide', markers: [/nationwide/i] },
  { format: 'halifax', markers: [/halifax/i] },
  { format: 'tsb', markers: [/\btsb\b/i] },
  { format: 'chase-uk', markers: [/chase\s+uk/i, /chase\.com/i] },
  { format: 'metro-bank', markers: [/metro\s+bank/i] },
  { format: 'first-direct', markers: [/first\s+direct/i] },
  { format: 'co-operative', markers: [/co[- ]operative|co-op\s+bank/i] },
  { format: 'virgin-money', markers: [/virgin\s+money/i] },
  { format: 'wise', markers: [/\bwise\b/i, /wise payments/i] },
  { format: 'paypal', markers: [/paypal/i, /paypal\s+transfer/i] },
  { format: 'monese', markers: [/monese/i] },
];

/** Conservative detection: ties and weak single markers deliberately become generic/review. */
export function detectBankFormat(lines: string[]): BankFormatDetection {
  const text = lines.join('\n');
  const scored = FORMAT_MARKERS.map(({ format, markers }) => {
    const evidence = markers.filter((marker) => marker.test(text)).map((marker) => marker.source);
    return { format, evidence, score: evidence.length };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score === 0 || best.score === second?.score) {
    return { format: 'generic', confidence: 0, evidence: [], requiresReview: true };
  }

  const confidence = best.score >= 2 ? 0.95 : 0.7;
  return {
    format: best.format,
    confidence,
    evidence: best.evidence,
    requiresReview: confidence < 0.9,
  };
}
