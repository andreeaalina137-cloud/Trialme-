import type { ScannedTransaction } from '../types/scanner.types';
import { normalizeStatementLine, repairCommonMerchantSpacing } from './statementNormalizer';

const PREFIX_PATTERN =
  /\b(?:CARD\s+PAYMENT\s+TO|DIRECT\s+DEBIT\s+TO|DIRECT\s+DEBIT|FASTER\s+PAYMENT(?:\s+TO)?|CONTACTLESS|APPLE\s+PAY|GOOGLE\s+PAY|STANDING\s+ORDER|BILL\s+PAYMENT|POS|BACS|VIS|DD|CĂTRE|CATRE|CARD|REFERINȚĂ|REFERINTA|CURSUL)\b/gi;

const COUNTRY_PATTERN = /\b(?:GBR|LUX|IRL|USA|ESP|FRA|DEU|NLD|ITA|GBP|GB)\b/gi;
const CITY_PATTERN = /\bLONDON\b/gi;
const POSTCODE_PATTERN = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi;
const CARD_ENDING_PATTERN = /(?:\*{2,4}|X{2,4}|ENDING)\s*\d{4}\b/gi;
const REF_PATTERN = /\bREF[:\s-]*[A-Z0-9-]{3,}\b/gi;
const FX_PATTERN =
  /\b(?:FX|RATE|EXCHANGE)[:\s-]*\d+(?:\.\d+)?|\b\d+\.\d{2,6}\s*(?:USD|EUR|RON)\b/gi;
const LTD_PATTERN = /\b(?:LIMITED|LTD\.?|PLC|INC\.?)\b/gi;

const GBP_PRICE_PATTERN = /(?:£|GBP\s?)(\d{1,4}(?:,\d{3})*(?:\.\d{2}))/i;
const SIGNED_GBP_PRICE_PATTERN = /[-+]?\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2}))\s*GBP/i;
const GBP_SUFFIX_PRICE_PATTERN = /[-+]?\s*(\d{1,4}(?:[,.]\d{3})*[,.]\d{2})\s*(?:£|GBP)/i;
const FOREIGN_CURRENCY_AMOUNT_PATTERN = /(?:€|EUR|USD|\$|CHF|CAD|AUD)\s*-?\d{1,4}(?:,\d{3})*(?:\.\d{2})|[-+]?\s*\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\s*(?:€|EUR|USD|\$|CHF|CAD|AUD)/i;
const TRAILING_DEBIT_PATTERN = /(\d{1,3}(?:,\d{3})?(?:\.\d{2}))\s*(?:-|DR|CR)$/i;

// Only match credit indicators (+ before digits, CR suffix/prefix, CREDIT), NOT a '+' inside service names like Disney+
const CREDIT_HINT_PATTERN = /(?:(?:^|\s)\+\s*(?:£|GBP)?\s*\d|^\s*CR\b|\bCR\s*$|\bCREDIT(?:\s+IN)?\b)/i;

const ISO_DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
const UK_DASH_DATE = /(\d{1,2})[-.](\d{1,2})[-.](\d{4})/;
const ISO_DATE_DASHED = /(\d{4})-(\d{2})-(\d{2})/;
const LONG_UK_DATE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i;
const SHORT_UK_DATE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s|$)/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const HIGH_VALUE_TRANSFER_GBP = 500;

const STATEMENT_NOISE_PATTERN =
  /^(?:date\s*,|statement\s+notes?|expected\s+scanner\s+result|testing\s+checklist|scanner\s+result|test\s+checklist)\b/i;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseLocalizedAmount(value: string): number {
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value.replace(/,/g, '');
  return Number(normalized);
}

function toIso(year: number, monthIndex: number, day: number): string | null {
  if (day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function extractUkDate(line: string, now = new Date()): { iso: string; billingDay: number } | null {
  const isoDashedMatch = line.match(ISO_DATE_DASHED);
  if (isoDashedMatch) {
    const year = Number(isoDashedMatch[1]);
    const month = Number(isoDashedMatch[2]) - 1;
    const day = Number(isoDashedMatch[3]);
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  const isoMatch = line.match(ISO_DATE);
  if (isoMatch) {
    const day = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const year = Number(isoMatch[3]);
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  const ukDashedMatch = line.match(UK_DASH_DATE);
  if (ukDashedMatch) {
    const day = Number(ukDashedMatch[1]);
    const month = Number(ukDashedMatch[2]) - 1;
    const year = Number(ukDashedMatch[3]);
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  const longMatch = line.match(LONG_UK_DATE);
  if (longMatch) {
    const day = Number(longMatch[1]);
    const month = MONTHS[longMatch[2].slice(0, 3).toLowerCase()];
    const year = Number(longMatch[3]);
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  const shortMatch = line.match(SHORT_UK_DATE);
  if (shortMatch) {
    const day = Number(shortMatch[1]);
    const month = MONTHS[shortMatch[2].slice(0, 3).toLowerCase()];
    const iso = toIso(now.getFullYear(), month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  return null;
}

export function extractGbpAmount(line: string): number | null {
  // 1. Explicit £ or GBP symbol
  const gbpMatch = line.match(GBP_PRICE_PATTERN);
  if (gbpMatch) {
    return parseLocalizedAmount(gbpMatch[1]);
  }

  const signedGbpMatch = line.match(SIGNED_GBP_PRICE_PATTERN);
  if (signedGbpMatch) {
    return parseLocalizedAmount(signedGbpMatch[1]);
  }

  const gbpSuffixMatch = line.match(GBP_SUFFIX_PRICE_PATTERN);
  if (gbpSuffixMatch) {
    return parseLocalizedAmount(gbpSuffixMatch[1]);
  }

  // Do not interpret a foreign-currency amount as GBP on Revolut/multi-currency statements.
  if (FOREIGN_CURRENCY_AMOUNT_PATTERN.test(line)) return null;

  // 2. Strip date patterns and country codes before extracting decimal amounts
  const stripped = line
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ')
    .replace(COUNTRY_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Find all standalone decimal amounts (handles amounts with optional trailing '-' or DR/CR)
  const decimals = Array.from(
    stripped.matchAll(/(?:^|\s)(\d{1,4}(?:,\d{3})*\.\d{2})\s*(?:-|DR|CR)?(?:\s|$)/gi),
  )
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (decimals.length === 1) {
    return decimals[0];
  } else if (decimals.length > 1) {
    // In UK bank statements with multiple columns (Date | Merchant | Debit | Balance),
    // debit amount comes first, followed by running balance.
    // Consumer subscriptions are typically <= 250 GBP.
    const subAmount = decimals.find((n) => n <= 250);
    if (subAmount !== undefined) return subAmount;
    return decimals[0];
  }

  // 3. Fallback: trailing debit pattern if no dot decimals found (e.g. whole numbers or atypical format)
  // Do not treat product/plan numbers such as 365, 100 or 24 as money.
  // Whole-number amounts are accepted only with an explicit debit marker.
  const trailing = stripped.match(/(?:^|\s)(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)\s*(?:-|DR|CR)$/i);
  if (trailing) {
    const val = Number(trailing[1].replace(/,/g, ''));
    if (Number.isFinite(val) && val > 0) return val;
  }

  return null;
}

export function cleanMerchantName(line: string): string {
  let cleaned = line;
  cleaned = cleaned.replace(ISO_DATE, ' ');
  cleaned = cleaned.replace(UK_DASH_DATE, ' ');
  cleaned = cleaned.replace(ISO_DATE_DASHED, ' ');
  cleaned = cleaned.replace(LONG_UK_DATE, ' ');
  cleaned = cleaned.replace(SHORT_UK_DATE, ' ');
  cleaned = cleaned.replace(GBP_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(SIGNED_GBP_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(GBP_SUFFIX_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(TRAILING_DEBIT_PATTERN, ' ');
  cleaned = cleaned.replace(PREFIX_PATTERN, ' ');
  cleaned = cleaned.replace(COUNTRY_PATTERN, ' ');
  cleaned = cleaned.replace(CITY_PATTERN, ' ');
  cleaned = cleaned.replace(POSTCODE_PATTERN, ' ');
  cleaned = cleaned.replace(CARD_ENDING_PATTERN, ' ');
  cleaned = cleaned.replace(REF_PATTERN, ' ');
  cleaned = cleaned.replace(FX_PATTERN, ' ');
  cleaned = cleaned.replace(LTD_PATTERN, ' ');
  cleaned = cleaned.replace(/[£$€]/g, ' ');
  cleaned = cleaned.replace(/\b\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\b/g, ' ');
  // Retain letters, digits, spaces, plus sign (for Disney+), and common punctuation
  cleaned = cleaned.replace(/[^\w\s.&/'+\-]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function isStatementNoise(line: string): boolean {
  return STATEMENT_NOISE_PATTERN.test(line.trim());
}

function parseDelimitedFields(line: string): string[] {
  const delimiter = line.split(';').length > line.split(',').length ? ';' : ',';
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeCsvStatementLine(line: string): string {
  const fields = parseDelimitedFields(line);
  if (
    fields.length < 3 ||
    !/^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})$/.test(fields[0])
  ) {
    return line;
  }

  const amountIndex = fields.findIndex((field, index) => {
    if (index < 2) return false;
    const normalized = field.replace(/\s/g, '');
    return /^[£€$]?[-+]?\d{1,4}(?:[,.]\d{3})*[,.]\d{2}(?:£|GBP)?$/i.test(normalized)
      || /^GBP[-+]?\d{1,4}(?:[,.]\d{3})*[,.]\d{2}$/i.test(normalized);
  });
  if (amountIndex < 2) return line;

  const isMonzoExport = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(fields[1] ?? '') && fields.length >= 8;
  const description = isMonzoExport ? fields[3] : fields.slice(1, amountIndex).join(' ');
  const rawAmount = fields[amountIndex]
    .replace(/^GBP\s*/i, '')
    .replace(/\s*GBP$/i, '')
    .replace(/\s*£$/, '');
  const amount = rawAmount.replace(/^[+-]/, '');
  const trailingFields = fields.slice(amountIndex + 1).join(' ');
  const currencyField = fields[amountIndex + 1] ?? '';
  if (currencyField && !/^(?:GBP|£)$/i.test(currencyField)) {
    return `${fields[0]} ${description} ${currencyField} ${amount}`;
  }
  const isCredit = /^[+]/.test(rawAmount) || /\b(?:CREDIT|REFUND|MONEY\s+IN|INFLOW)\b/i.test(trailingFields);
  return `${fields[0]} ${description} ${isCredit ? '+ ' : ''}£${amount}`;
}

/**
 * PDF text extraction often puts the date/description and the merchant/amount
 * on separate visual rows. Keep every row up to the first amount together so
 * the parser sees one transaction block and can recover the real amount.
 */
function groupStatementLines(lines: string[]): string[] {
  const logicalLines: string[] = [];
  let pending: string[] = [];

  const isContinuation = (line: string): boolean =>
    /^(?:Către|Catre|To|From|De la|Card|Referință|Referinta|Cursul)\s*:?/i.test(line);

  const flushPending = () => {
    const joined = pending.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) logicalLines.push(joined);
    pending = [];
  };

  for (const rawLine of lines) {
    const line = normalizeCsvStatementLine(repairCommonMerchantSpacing(normalizeStatementLine(rawLine)));
    if (!line) continue;
    if (isStatementNoise(line)) {
      flushPending();
      continue;
    }

    // Revolut places merchant details on the row immediately after the
    // amount. Attach them to the transaction so aliases such as Google One
    // are not lost behind a generic display label such as "Google".
    if (isContinuation(line) && pending.length === 0 && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] = `${logicalLines[logicalLines.length - 1]} ${line}`;
      continue;
    }

    pending.push(line);
    if (extractGbpAmount(line) !== null) {
      flushPending();
    }
  }

  flushPending();
  return logicalLines;
}

export function parseStatementLines(lines: string[], now = new Date()): ScannedTransaction[] {
  const transactions: ScannedTransaction[] = [];
  const cleanedLines = groupStatementLines(lines);

  const matchedIndices = new Set<number>();

  // Pass 1: standard lines containing both merchant and amount
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    const amountGbp = extractGbpAmount(line);
    if (amountGbp === null || !Number.isFinite(amountGbp) || amountGbp <= 0) continue;

    const isCredit = CREDIT_HINT_PATTERN.test(line);
    const isHighValueTransfer = amountGbp > HIGH_VALUE_TRANSFER_GBP;
    if (isCredit || isHighValueTransfer) continue;

    const merchant = cleanMerchantName(line);
    if (merchant.length < 2) continue;

    const date = extractUkDate(line, now);
    transactions.push({
      rawLine: line,
      cleanedMerchant: merchant,
      amountGbp,
      dateIso: date?.iso ?? null,
      billingDay: date?.billingDay ?? null,
      isCredit: false,
      isHighValueTransfer: false,
    });
    matchedIndices.add(i);
  }

  // Pass 2: adjacent lines (e.g. merchant on line i, amount on line i+1 or i-1)
  for (let i = 0; i < cleanedLines.length; i++) {
    if (matchedIndices.has(i)) continue;
    const line = cleanedLines[i];
    const amount = extractGbpAmount(line);
    const merchant = cleanMerchantName(line);

    // If line i has an amount but short/empty merchant, combine with line i-1
    if (amount !== null && amount > 0 && merchant.length < 3 && i > 0 && !matchedIndices.has(i - 1)) {
      const prevLine = cleanedLines[i - 1];
      const prevMerchant = cleanMerchantName(prevLine);
      if (prevMerchant.length >= 3 && extractGbpAmount(prevLine) === null) {
        const combined = `${prevLine} ${line}`;
        const isCredit = CREDIT_HINT_PATTERN.test(combined);
        if (!isCredit && amount <= HIGH_VALUE_TRANSFER_GBP) {
          const date = extractUkDate(combined, now);
          transactions.push({
            rawLine: combined,
            cleanedMerchant: prevMerchant,
            amountGbp: amount,
            dateIso: date?.iso ?? null,
            billingDay: date?.billingDay ?? null,
            isCredit: false,
            isHighValueTransfer: false,
          });
          matchedIndices.add(i);
          matchedIndices.add(i - 1);
        }
      }
    }
    // If line i has merchant but no amount, combine with line i+1
    else if (amount === null && merchant.length >= 3 && i + 1 < cleanedLines.length && !matchedIndices.has(i + 1)) {
      const nextLine = cleanedLines[i + 1];
      const nextAmount = extractGbpAmount(nextLine);
      if (nextAmount !== null && nextAmount > 0 && cleanMerchantName(nextLine).length < 3) {
        const combined = `${line} ${nextLine}`;
        const isCredit = CREDIT_HINT_PATTERN.test(combined);
        if (!isCredit && nextAmount <= HIGH_VALUE_TRANSFER_GBP) {
          const date = extractUkDate(combined, now);
          transactions.push({
            rawLine: combined,
            cleanedMerchant: merchant,
            amountGbp: nextAmount,
            dateIso: date?.iso ?? null,
            billingDay: date?.billingDay ?? null,
            isCredit: false,
            isHighValueTransfer: false,
          });
          matchedIndices.add(i);
          matchedIndices.add(i + 1);
        }
      }
    }
  }

  return transactions;
}
