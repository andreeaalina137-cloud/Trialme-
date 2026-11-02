/**
 * Shared, loss-minimising normalization for PDF, OCR and CSV statement rows.
 * The original row is kept by the transaction parser for auditing; this
 * function only makes layout artifacts deterministic for matching.
 */
export function normalizeStatementLine(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/(?<=\b\d{1,2})[04]an(?=\d{2}\b)/gi, ' Jan ')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

/** Repairs only high-signal OCR spacing patterns; meaningful unknown text is untouched. */
export function repairCommonMerchantSpacing(value: string): string {
  return value
    .replace(/N\s*E\s*T\s*F\s*L\s*I\s*X(?:\s*\.\s*C\s*O\s*M)?\b/gi, 'NETFLIX.COM')
    .replace(/S\s*P\s*O\s*T\s*I\s*F\s*Y\b/gi, 'SPOTIFY')
    .replace(/G\s*O\s*O\s*G\s*L\s*E\s+O\s*N\s*E\b/gi, 'GOOGLE ONE')
    .replace(/M\s*I\s*C\s*R\s*O\s*S\s*O\s*F\s*T\s+365\b/gi, 'MICROSOFT 365');
}

/** Repairs common bank/OCR abbreviations without guessing at arbitrary words. */
export function repairBankMerchantAbbreviations(value: string): string {
  return value
    .replace(/\bH\s*3\s*G(?:\s+\d{3,12})?\b/gi, 'THREE')
    .replace(/\bVODAFON[E3]\b/gi, 'VODAFONE')
    .replace(/\bTALK\s*[- ]?TALK(?:\s+TELECOM\s*T?)?\b/gi, 'TALKTALK')
    .replace(/\bLEBARA(?:\s+MOBILE)?(?:\s+(?:LIMITED|LTD|UK))?\b/gi, 'LEBARA')
    .replace(/\b(?:DIRECT\s+DEBIT\s+|D\/D\s+|DD\s+)02\b/gi, 'DIRECT DEBIT O2')
    .replace(/\bAPPL?[IE1][E1]?\.COM\/BI[L1]{1,2}\b/gi, 'APPLE.COM/BILL');
}

export function normalizeStatementLines(lines: string[]): string[] {
  return lines
    .map((line) => repairBankMerchantAbbreviations(repairCommonMerchantSpacing(normalizeStatementLine(line))))
    .filter(Boolean);
}

/**
 * Stage 3: Canonical Merchant Cleaning (UK Statements)
 * Strips dynamic monthly reference numbers, transaction codes, store numbers,
 * URLs, location tokens and dates appended by UK banks into a single canonical merchant key.
 * E.g. "[NETFLIX.COM](http://netflix.com/) 849201 LONDON", "NETFLIX *11294", and "[NETFLIX.COM](http://netflix.com/) GBR" -> "NETFLIX".
 */
export function extractCanonicalMerchantKey(rawOrClean: string): string {
  if (!rawOrClean) return '';
  const normalized = stripMerchantNoise(rawOrClean, true);

  // Normalize specific aliases to canonical names
  if (/^NETFLIX\b/.test(normalized)) return 'NETFLIX';
  if (/^SPOTIFY\b/.test(normalized)) return 'SPOTIFY';
  if (/^AMAZON\s*(?:PRIME|VIDEO)?\b|^AMZN\s*(?:PRIME|MKTP)?\b/.test(normalized)) return 'AMAZON PRIME';
  if (/^DISNEY\s*(?:PLUS|\+)?\b/.test(normalized)) return 'DISNEY PLUS';
  if (/^YOUTUBE\s*(?:PREMIUM)?\b/.test(normalized)) return 'YOUTUBE PREMIUM';
  if (/^MICROSOFT\s*(?:365|OFFICE)?\b|^MSFT\b/.test(normalized)) return 'MICROSOFT 365';
  if (/^GOOGLE\s*(?:ONE)?\b/.test(normalized)) return 'GOOGLE ONE';
  if (/^PURE\s*GYM\b|^PUREGYM\b/.test(normalized)) return 'PUREGYM';

  return normalized;
}

/**
 * Alias-free noise stripping shared by the canonical key and the merchant fingerprint.
 * Removes bank rails, references, card markers, dates, amounts, locations and company
 * suffixes, but never maps a merchant onto another brand. When `applyBankAbbreviations`
 * is false the context-dependent abbreviation repairs (e.g. H3G) are skipped so the
 * caller can apply them only when bank context supports it.
 */
export function stripMerchantNoise(rawOrClean: string, applyBankAbbreviations = true): string {
  if (!rawOrClean) return '';

  let normalized = rawOrClean
    .normalize('NFKC')
    // Extract markdown link text e.g. [NETFLIX.COM](http://netflix.com/) -> NETFLIX.COM
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bare URLs
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '');

  // Repair known abbreviations & spacing first
  normalized = applyBankAbbreviations
    ? repairBankMerchantAbbreviations(repairCommonMerchantSpacing(normalized))
    : repairCommonMerchantSpacing(normalized);

  // Strip leading bank rails / payment prefixes
  normalized = normalized.replace(
    /\b(?:CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|CARD\s+PAYMENT(?:\s+TO)?|DIRECT\s+DEBIT(?:\s+PAYMENT)?(?:\s+TO)?|D\/D|DDR|DD|STANDING\s+ORDER|SO|STO|POS|DEB|BACS|BILL\s+PAYMENT|AUTOMATIC\s+PAYMENT|PREAPPROVED\s+PAYMENT|CONTACTLESS|APPLE\s+PAY|GOOGLE\s+PAY|OUTWARD\s+FASTER\s+PAYMENT|FASTER\s+PAYMENT(?:\s+TO)?|FP|FPI|FPO|BGC|TFR|MOB|VIS|MASTERCARD)\b/gi,
    ' ',
  );

  // Strip reference patterns, store numbers, card markers, transaction numbers
  normalized = normalized.replace(/\b(?:REF[:\s-]*[A-Z0-9-]{3,}|MANDATE\s+NO\s*\d+)\b/gi, ' ');
  normalized = normalized.replace(/(?:\*{2,4}|X{2,4}|ENDING|\bCD)\s*\d{4}\b/gi, ' ');
  normalized = normalized.replace(/\b(?:STORE|BRANCH)\s*#?\d+\b/gi, ' ');
  normalized = normalized.replace(/\*\d{3,16}\b/g, ' ');
  normalized = normalized.replace(/#\d{3,16}\b/g, ' ');
  // Strip standalone reference/transaction digits (4 to 16 digits)
  normalized = normalized.replace(/(?:^|\s)\d{4,16}(?:\s|$)/g, ' ');

  // Strip amounts and currencies
  normalized = normalized.replace(/(?:Â£|\u00A3|£|GBP|\$|€)\s*\d+(?:[.,]\d+)?/gi, ' ');
  normalized = normalized.replace(/\b\d+(?:[.,]\d{2})\s*(?:GBP|£|\$|€)?\b/gi, ' ');

  // Strip dates
  normalized = normalized.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ');
  normalized = normalized.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  normalized = normalized.replace(
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?\b/gi,
    ' ',
  );

  // Strip UK/international cities and countries
  normalized = normalized.replace(
    /\b(?:LONDON|MANCHESTER|BIRMINGHAM|LEEDS|GLASGOW|EDINBURGH|BRISTOL|LIVERPOOL|SHEFFIELD|NEWCASTLE|BELFAST|CARDIFF|GBR|GBP|GB|UK|IRL|LUX|USA|ESP|FRA|DEU|NLD|ITA)\b/gi,
    ' ',
  );

  // Strip company suffixes
  normalized = normalized.replace(/\b(?:LIMITED|LTD\.?|PLC|INC\.?|CORP\.?|LLC)\b/gi, ' ');

  // Strip domain extensions (.com, .co.uk, .org, .net, etc.)
  normalized = normalized.replace(/\.(?:COM|CO\.UK|CO|IO|ORG|NET|APP|AI|ME)\b/gi, '');

  // Keep letters, digits, spaces, plus sign (for Disney+)
  normalized = normalized.replace(/[^\w\s+]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

  return normalized;
}

/** Computes Levenshtein distance between two strings */
export function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Check if two merchant names or keys are fuzzy equivalents */
export function areMerchantsFuzzyMatch(key1: string, key2: string): boolean {
  if (!key1 || !key2) return false;
  const k1 = key1.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const k2 = key2.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!k1 || !k2) return false;
  if (k1 === k2) return true;

  // Substring inclusion if sufficiently long and ratio >= 0.7
  const minLen = Math.min(k1.length, k2.length);
  const maxLen = Math.max(k1.length, k2.length);
  if (minLen >= 4 && (k1.includes(k2) || k2.includes(k1)) && minLen / maxLen >= 0.7) {
    return true;
  }

  // Levenshtein similarity
  if (minLen >= 4 && Math.abs(k1.length - k2.length) <= 2) {
    const dist = computeLevenshteinDistance(k1, k2);
    if (dist <= 2 && (1 - dist / maxLen) >= 0.75) {
      return true;
    }
  }

  return false;
}
