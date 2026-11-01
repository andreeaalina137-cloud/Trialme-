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
    .replace(/[\t ]+/g, ' ')
    .trim();
}

/** Repairs only high-signal OCR spacing patterns; meaningful unknown text is untouched. */
export function repairCommonMerchantSpacing(value: string): string {
  return value
    .replace(/N\s*E\s*T\s*F\s*L\s*I\s*X\s*(?:\.\s*C\s*O\s*M)?/gi, 'NETFLIX.COM')
    .replace(/S\s*P\s*O\s*T\s*I\s*F\s*Y/gi, 'SPOTIFY')
    .replace(/G\s*O\s*O\s*G\s*L\s*E\s+O\s*N\s*E/gi, 'GOOGLE ONE')
    .replace(/M\s*I\s*C\s*R\s*O\s*S\s*O\s*F\s*T\s+365/gi, 'MICROSOFT 365');
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
