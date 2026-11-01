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
  {
    format: 'revolut',
    markers: [
      /\brevolut\b/i,
      /\b(?:revolut\s+(?:ltd|uk|bank|payments)|revogb21|revolut\.com|(?:premium|metal|ultra|plus)\s+plan\s+fee|tax[ăa]\s+plan\s+metal)\b/i,
      /(?=[\s\S]*\brevolut\b)[\s\S]*\b(?:card\s+payment|direct\s+debit|account\s+statement|gbp\s+statement|c[ăa]tre:|cursul)\b/i,
    ],
  },
  {
    format: 'monzo',
    markers: [
      /\bmonzo\b/i,
      /\b(?:monzo\s+(?:bank|uk|perks|plus|max)|monzgb2l|monzo\.com|sort\s+code\s+04-00-04)\b/i,
      /(?=[\s\S]*\bmonzo\b)[\s\S]*\b(?:emoji\s*,?\s*category|pot\s+transfer|card\s+subscription|faster\s+payment)\b/i,
    ],
  },
  {
    format: 'starling',
    markers: [
      /\bstarling(?:\s+bank)?\b/i,
      /\b(?:starling\s+bank|srlggb2l|starlingbank\.com|sort\s+code\s+60-83-71)\b/i,
      /(?=[\s\S]*\bstarling\b)[\s\S]*\b(?:mastercard|faster\s+payment|card\s+subscription|direct\s+debit|saving\s+space)\b/i,
    ],
  },
  {
    format: 'barclays',
    markers: [
      /\bbarclays\b/i,
      /\b(?:barclays\s+bank|barcgb22|barclays\.co\.uk)\b/i,
      /(?=[\s\S]*\bbarclays\b)[\s\S]*\b(?:DDR|CPT|BGC|STO)\b/i,
    ],
  },
  {
    format: 'hsbc',
    markers: [
      /\bhsbc(?:\s+uk)?\b/i,
      /\b(?:hsbc\s+uk(?:\s+bank)?|midlgb22|hsbc\.co\.uk|sort\s+code\s+40-)\b/i,
      /(?=[\s\S]*\bhsbc\b)[\s\S]*\b(?:VIS|BP|DD|BACS|CR|DR)\b/i,
    ],
  },
  {
    format: 'lloyds',
    markers: [
      /\blloyds(?:\s+bank)?\b/i,
      /\b(?:lloyds\s+bank(?:\s+plc)?|lloydsbank\.com|lloyds\.com|loydgb2l|sort\s+code\s+30-|club\s+lloyds|lloyds\s+silver\s+account)\b/i,
      /(?=[\s\S]*\blloyds\b)[\s\S]*\b(?:DEB|FPO|FPI|BGC|SO|DD|CD\s*\d{4})\b/i,
    ],
  },
  {
    format: 'natwest',
    markers: [
      /\b(?:natwest|national\s+westminster\s+bank)\b/i,
      /\b(?:national\s+westminster|nwbkgb2l|natwest\.com|sort\s+code\s+(?:60|50|56)-)\b/i,
      /(?=[\s\S]*\b(?:natwest|national\s+westminster)\b)[\s\S]*\b(?:POS|D\/D|C\/L|direct\s+debit)\b/i,
    ],
  },
  {
    format: 'santander',
    markers: [
      /\bsantander\b/i,
      /\b(?:santander\s+uk|abbygb2l|santander\.co\.uk|sort\s+code\s+09-)\b/i,
      /(?=[\s\S]*\bsantander\b)[\s\S]*direct\s+debit\s+payment\s+to/i,
    ],
  },
  { format: 'nationwide', markers: [/\bnationwide\b/i, /\b(?:nationwide\s+building\s+society|naiagb21|sort\s+code\s+07-)\b/i] },
  {
    format: 'halifax',
    markers: [
      /\bhalifax\b/i,
      /\b(?:halifax\.co\.uk|bank\s+of\s+scotland|bofsgb2s|sort\s+code\s+11-|halifax\s+(?:reward|ultimate\s+reward))\b/i,
      /(?=[\s\S]*\bhalifax\b)[\s\S]*\b(?:DEB|DD|CD\s*\d{4}|FPO|SO|ultimate\s+reward)\b/i,
    ],
  },
  { format: 'tsb', markers: [/\btsb\b/i, /\btsb\s+bank\b/i] },
  {
    format: 'chase-uk',
    markers: [
      /\b(?:chase\s+(?:uk|bank|current\s+account)|jpmorgan\s+chase|chase\.co\.uk|chase\.com|chasgb2l)\b/i,
      /\b(?:chase\.co\.uk|chase\.com|chasgb2l|jpmorgan\s+chase|sort\s+code\s+60-84-61)\b/i,
      /(?=[\s\S]*\bchase\b)[\s\S]*\b(?:recurring\s+card\s+purchase|monthly\s+service\s+fee|card\s+payment|round[- ]?up|direct\s+debit)\b/i,
    ],
  },
  {
    format: 'metro-bank',
    markers: [
      /\bmetro\s+bank\b/i,
      /\b(?:metro\s+bank\s+plc|metrobankonline\.co\.uk|mymbgb2l|sort\s+code\s+23-05-80)\b/i,
      /(?=[\s\S]*\bmetro\s+bank\b)[\s\S]*\b(?:card\s+payment|outward\s+direct\s+debit|direct\s+debit|point\s+of\s+sale|metro\s+cash\s+withdrawal|faster\s+payment)\b/i,
    ],
  },
  { format: 'first-direct', markers: [/\bfirst\s+direct\b/i, /\bsort\s+code\s+40-47-84\b/i] },
  { format: 'co-operative', markers: [/co[- ]operative|co-op\s+bank/i] },
  {
    format: 'virgin-money',
    markers: [
      /\b(?:virgin\s+money|82-\d{2}-\d{2}\s+\d{2}\s+[A-Za-z]{3}\s+\d{2})\b/i,
      /\b(?:virgin\s+money\s+uk|virginmoney\.com|clydesdale\s+bank|clydgb2s|sort\s+code\s+(?:82|05)-|\b82-\d{2}-\d{2}\b)\b/i,
      /(?=[\s\S]*\b(?:virgin\s+money|82-\d{2}-\d{2})\b)[\s\S]*\b(?:instant\s+savings|m\s+plus\s+saver|m\s+current|recurring\s+card\s+purchase|direct\s+debit(?:\s+payment)?|card\s+payment|faster\s+payment|club\s+m)\b/i,
    ],
  },
  { format: 'wise', markers: [/\bwise\b/i, /wise payments/i] },
  {
    format: 'paypal',
    markers: [
      /\bpaypal(?!\s*\*)\b/i,
      /\b(?:paypal\s+(?:balance|savings|transfer|europe|uk|inc|ltd)|paypal\.com)\b/i,
      /(?=[\s\S]*\bpaypal(?!\s*\*)\b)[\s\S]*\b(?:preapproved\s+payment|bill\s+user\s+payment|automatic\s+payment|recurring\s+payment|subscription\s+payment|express\s+checkout|opening\s+balance|ending\s+balance|closing\s+balance)\b/i,
    ],
  },
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
