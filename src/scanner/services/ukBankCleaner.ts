import type {
  ScannedTransaction,
  ScannerReasonCode,
  StatementTableState,
} from '../types/scanner.types';
import {
  normalizeStatementLine,
  repairBankMerchantAbbreviations,
  repairCommonMerchantSpacing,
} from './statementNormalizer';

const PREFIX_PATTERN =
  /\b(?:CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|PREAPPROVED\s+PAYMENT(?:\s+BILL\s+USER\s+PAYMENT)?|BILL\s+USER\s+PAYMENT|AUTOMATIC\s+PAYMENT|RECURRING\s+PAYMENT|SUBSCRIPTION\s+PAYMENT|EXPRESS\s+CHECKOUT\s+PAYMENT|OUTWARD\s+DIRECT\s+DEBIT|DIRECT\s+DEBIT\s+PAYMENT(?:\s+TO)?|DIRECT\s+DEBIT\s+TO|DIRECT\s+DEBIT|POINT\s+OF\s+SALE|CARD\s+PAYMENT\s+TO|D\/D|DDR|C\/L|OUTWARD\s+FASTER\s+PAYMENT|INWARD\s+FASTER\s+PAYMENT|FASTER\s+PAYMENT(?:\s+TO)?|CONTACTLESS|APPLE\s+PAY|GOOGLE\s+PAY|STANDING\s+ORDER|BILL\s+PAYMENT|POS|BACS|VIS|DEB|DD|CĂTRE|CATRE|CARD|REFERINȚĂ|REFERINTA|CURSUL)\b|PAYPAL\s*\*/gi;

const COUNTRY_PATTERN = /\b(?:GBR|LUX|IRL|USA|ESP|FRA|DEU|NLD|ITA|GBP|GB)\b/gi;
const CITY_PATTERN = /\bLONDON\b/gi;
const POSTCODE_PATTERN = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi;
const CARD_ENDING_PATTERN = /(?:\*{2,4}|X{2,4}|ENDING|\bCD)\s*\d{4}\b/gi;
const REF_PATTERN = /\b(?:REF[:\s-]*[A-Z0-9-]{3,}|MANDATE\s+NO\s*\d+)\b/gi;
const FX_PATTERN =
  /\b(?:FX|RATE|EXCHANGE)[:\s-]*\d+(?:\.\d+)?|\b\d+\.\d{2,6}\s*(?:USD|EUR|RON)\b/gi;
const LTD_PATTERN = /\b(?:LIMITED|LTD\.?|PLC|INC\.?)\b/gi;

// Balance-only rows must never be extracted as outgoing debits (Gate 1).
const BALANCE_ROW_PATTERN =
  /(?:^\s*(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\.?(?:\s+\d{2,4})?)?\s*BALANCE\b|\bBALANCE\s+ON\s+\d|\b(?:OPENING\s+BALANCE|CLOSING\s+BALANCE|ENDING\s+BALANCE|BEGINNING\s+BALANCE|STARTING\s+BALANCE|AVAILABLE\s+BALANCE|ACCOUNT\s+BALANCE|TOTAL\s+BALANCE|CURRENT\s+BALANCE|VAULT\s+BALANCE|POCKET\s+BALANCE|STATEMENT\s+BALANCE|CURRENCY\s+BALANCE|BALANCE\s+SUMMARY|BALANCE\s+BROUGHT\s+FORWARD|BALANCE\s+CARRIED\s+FORWARD|BROUGHT\s+FORWARD|CARRIED\s+FORWARD|PAYPAL\s+(?:SAVINGS\s+)?BALANCE|CREDIT\s+LIMIT|TOTAL\s+DEBITS|TOTAL\s+CREDITS)\b|^\s*(?:Money\s+in|Money\s+out|Paid\s+In|Withdrawn|Total\s+fees|Monthly\s+maintaining\s+the\s+account\s+fee|(?:ATM\s+)?OWNER\s+FEE)\s+(?:\d+\s+)?£?\d)/i;

const INLINE_BALANCE_CLAUSE_PATTERN =
  /\b(?:RUNNING\s+BALANCE|AVAILABLE\s+BALANCE|NEW\s+BALANCE|ACCOUNT\s+BALANCE|TOTAL\s+BALANCE|BALANCE|BAL)\s*[:=]?\s*[-+]?\s*(?:(?:Â£|\u00A3|GBP)\s*\d{1,4}(?:[,.]\d{3})*[,.]\d{2}|\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\s*(?:Â£|\u00A3|GBP)?)/gi;

const EXCHANGE_RATE_CLAUSE_PATTERN =
  /\b(?:EXCHANGE\s+RATE|FX\s+RATE|CONVERSION\s+RATE|CURSUL(?:\s+DE\s+SCHIMB)?|RATE)\s*[:=]?\s*(?:(?:Â£|\u00A3|GBP\s*)?\d+(?:[.,]\d+)?\s*(?:Â£|\u00A3|GBP)?\s*=\s*[^\s,;)]+(?:\s*[A-Z]{3})?|(?:Â£|\u00A3|GBP\s*)?\d+(?:[.,]\d+)?\s*(?:Â£|\u00A3|GBP|USD|EUR|RON|PLN|CHF|CAD|AUD)?)/gi;

const UNIT_CURRENCY_PARITY_PATTERN =
  /(?:Â£|\u00A3|GBP\s*)1(?:[.,]00)?\s*(?:Â£|\u00A3|GBP)?\s*=\s*(?:[€$]|USD|EUR|RON|PLN|CHF|CAD|AUD)?\s*\d+(?:[.,]\d+)?\s*(?:USD|EUR|RON|PLN|CHF|CAD|AUD)?/gi;

// Section boundaries and informational prose force OUT_OF_TABLE state and prevent date inheritance (Gate 1).
const OUT_OF_TABLE_BOUNDARY_PATTERN =
  /\b(?:TERMS\s+AND\s+CONDITIONS|IMPORTANT\s+(?:INFORMATION|NOTICE)|REGULATORY\s+NOTICE|OVERDRAFT\s+(?:CHARGE|INFORMATION|LIMIT|NOTICE)|PRE[- ]?NOTIFIED\s+CHARGES?|INTEREST\s+AND\s+CHARGES\s+SUMMARY|FOR\s+MONTHLY\s+CHARGING\s+PERIODS|MONTHLY\s+CHARGING\s+INFORMATION|MONTHLY\s+PAYMENT\s+INFORMATION|EXAMPLE\s+CHARGE|MAXIMUM\s+OVERDRAFT\s+CHARGE|INTEREST\s+RATE\s+INFORMATION|FSCS\s+PROTECTION|PAGE\s+\d+\s+OF\s+\d+|STATEMENT\s+SUMMARY|FEES?\s+EXPLAINED|TYPE\s+OF\s+FEE|THINGS\s+YOU\s+NEED\s+TO\s+KNOW|TRANSACTION\s+TYPES|PAYMENT\s+TYPES|YOUR\s+ACCOUNT\s+AT\s+A\s+GLANCE|REVERTED\s+FROM\s+\d|TOTAL\s+OUTGOINGS|TOTAL\s+DEPOSITS|TOTAL\s+DEBITS|TOTAL\s+CREDITS|REGULAR\s+POTS\s+WITH\s+MONZO|POTS\s+WITH\s+EXTERNAL\s+PROVIDERS|MAINTAINING\s+THE\s+ACCOUNT\s+FEE\s+WAIVED|ADDED\s+VALUE\s+ACCOUNT|FOREIGN\s+(?:CURRENCY\s+)?(?:CASH|PURCHASE)\s+FEE|OVERDRAFTS\s*-\s*CHOOSING\s+THE\s+RIGHT\s+WAY|STARLING\s+BANK\s+(?:LIMITED\s+)?IS\s+(?:REGISTERED|A\s+MEMBER)|METRO\s+BANK\s+PLC\s+IS\s+REGISTERED|24HR\s+CUSTOMER\s+SERVICE|INTEREST\s+WILL\s+BE\s+PAYABLE\s+TO\s+YOU|DATE\s+RANGE\s+APPLICABLE|\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s+to\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i;

// Table header transitions state to IN_TABLE.
const TABLE_HEADER_PATTERN =
  /\b(?:DATE\s+DESCRIPTION|PAYMENT\s+TYPE\s+AND\s+DETAILS|PAID\s+OUT\s+PAID\s+IN|MONEY\s+OUT\s+MONEY\s+IN|MONEY\s+IN\s*\(£\)\s+MONEY\s+OUT\s*\(£\)|TRANSACTIONS?\s+DETAILS?|YOUR\s+TRANSACTIONS)\b/i;

// Bank-specific structural evidence: payment type markers must appear at the start of an undated row
// (or immediately after a leading date/pipe) or as a trailing payment rail marker immediately before
// the GBP amount, and never as arbitrary words inside informational prose.
const LEADING_BANK_PAYMENT_MARKER_PATTERN =
  /^(?:OUTWARD\s+DIRECT\s+DEBIT|DIRECT\s+DEBIT(?:\s+(?:PAYMENT(?:\s+TO)?|TO))?|D\/D|DDR|DD|DR|DEB|C\/L|CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|CARD\s+TRANSACTION|ONLINE\s+TRANSACTION|AUTOMATED\s+CREDIT|CHARGES|PREAPPROVED\s+PAYMENT(?:\s+BILL\s+USER\s+PAYMENT)?|BILL\s+USER\s+PAYMENT|AUTOMATIC\s+PAYMENT|RECURRING\s+PAYMENT|SUBSCRIPTION\s+PAYMENT|EXPRESS\s+CHECKOUT\s+PAYMENT|PAYPAL\s*\*|POINT\s+OF\s+SALE|CARD\s+PAYMENT(?:\s+TO)?|CONTACTLESS|STANDING\s+ORDER|SO|POS|VIS|MASTERCARD|BACS|BP|FPO|FPI|TFR|BGC|CPT|MOB)\b/i;

const TRAILING_BANK_PAYMENT_MARKER_BEFORE_AMOUNT_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9\s.&*+'/-]{1,40}?\s+(?:\|\s*)?\b(?:DD|DEB|D\/D|DDR|CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE)\s+(?:\|\s*)?(?:[-+]?\s*(?:Â£|\u00A3|GBP\s*)?\d{1,4}(?:,\d{3})*\.\d{2})\b/i;

function hasStructuralBankTransactionMarker(line: string): boolean {
  const stripped = line
    .trim()
    .replace(
      /^(?:[A-Za-z][A-Za-z ]+\s*\|\s*Sort\s+code\s+\d{2}-\d{2}-\d{2}\s*\|\s*(?:Account\s+\d+\s*\|\s*)?)?(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?)\s*(?:\|\s*)?/i,
      '',
    )
    .trim();
  return (
    LEADING_BANK_PAYMENT_MARKER_PATTERN.test(stripped) ||
    TRAILING_BANK_PAYMENT_MARKER_BEFORE_AMOUNT_PATTERN.test(stripped)
  );
}

const DIRECT_DEBIT_PAYMENT_TYPE_PATTERN = /\b(?:DIRECT\s+DEBIT|D\/D|DDR|DD)\b/i;
const CARD_OR_DEB_PAYMENT_TYPE_PATTERN =
  /\b(?:DEB|CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|POINT\s+OF\s+SALE|CARD\s+PAYMENT|CONTACTLESS|POS|VIS|MASTERCARD)\b/i;

function inferPaymentRail(line: string): 'dd' | 'card' | 'other' {
  if (DIRECT_DEBIT_PAYMENT_TYPE_PATTERN.test(line)) return 'dd';
  if (CARD_OR_DEB_PAYMENT_TYPE_PATTERN.test(line)) return 'card';
  return 'other';
}

const STRONG_RECURRING_MARKER_PATTERN =
  /\b(?:DIRECT\s+DEBIT|D\/D|DDR|DD|CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|PREAPPROVED\s+PAYMENT|BILL\s+USER\s+PAYMENT|AUTOMATIC\s+PAYMENT|RECURRING\s+PAYMENT|SUBSCRIPTION\s+PAYMENT|MONTHLY\s+SERVICE\s+FEE|ULTIMATE\s+REWARD(?:\s+(?:ACCOUNT|FEE))?|REWARD\s+ACCOUNT\s+FEE|SILVER\s+ACCOUNT(?:\s+FEE)?|ACCOUNT\s+FEE|PREMIUM\s+PLAN\s+FEE|METAL\s+PLAN\s+FEE|TAXA?\s+PLAN\s+METAL|TV\s+LICEN[CS](?:E|ING))\b/i;

const REVERSAL_OR_FAILED_PATTERN =
  /\b(?:RETURNED\s+(?:DD|DIRECT\s+DEBIT)|UNPAID\s+(?:DD|DIRECT\s+DEBIT)|FAILED(?:\s+(?:DIRECT\s+DEBIT|PAYMENT|DD))?|REVERSAL|REVERSED(?:\s+PAYMENT)?|REFUND(?:\s+FROM)?)\b/i;

// An explicit pound symbol is authoritative over bare GBP conversion values.
const EXPLICIT_GBP_PRICE_PATTERN = /(?:Â£|\u00A3)\s*(\d{1,4}(?:,\d{3})*(?:[.,]\d{2}))/gi;
const GBP_PRICE_PATTERN = /(?:£|GBP\s?)(\d{1,4}(?:,\d{3})*(?:\.\d{2}))/i;
const SIGNED_GBP_PRICE_PATTERN = /[-+]?\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2}))\s*GBP\b/i;
const GBP_SUFFIX_PRICE_PATTERN = /[-+]?\s*(\d{1,4}(?:[,.]\d{3})*[,.]\d{2})\s*(?:£|GBP\b)/i;
const FOREIGN_CURRENCY_AMOUNT_PATTERN =
  /(?:[€$]|\b(?:EUR|USD|US\$|CHF|CAD|CA\$|AUD|A\$|PLN|RON|SEK|NOK|DKK|CZK|HUF|JPY|SGD|HKD|NZD|TRY|AED))\s*[-+]?\d{1,4}(?:[,.]\d{3})*(?:[.,]\d{2})|[-+]?\s*\d{1,4}(?:[,.]\d{3})*(?:[.,]\d{2})\s*(?:[€$]|\b(?:EUR|USD|CHF|CAD|AUD|PLN|RON|SEK|NOK|DKK|CZK|HUF|JPY|SGD|HKD|NZD|TRY|AED)\b)/i;
const TRAILING_DEBIT_PATTERN = /(\d{1,3}(?:,\d{3})?(?:\.\d{2}))\s*(?:-|DR|CR)$/i;

// Only match credit indicators (+ before digits, CR suffix/prefix/after-date/after-amount, CREDIT, incoming transfer/top-up/interest/cashback), NOT a '+' inside service names like Disney+
const CREDIT_HINT_PATTERN =
  /(?:(?:^|\s)\+\s*(?:£|GBP)?\s*\d|^\s*CR\b|\bCR\s*$|\d+\.\d{2}\s*CR\b|(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?)\s*(?:\|\s*)?CR\b|\bCREDIT(?:\s+IN|\s+INTEREST)?\b|\b(?:PAID\s+IN|MONEY\s+IN|INWARD\s+(?:(?:FAST|FASTER)\s+)?PAYMENTS?|TOP[- ]?UP\s+BY|AUTO[- ]?TOP[- ]?UP|MONEY\s+ADDED|RECEIVED\s+FROM|TRANSFER\s+FROM|PAYMENT\s+FROM|GROSS\s+INTEREST|NET\s+INTEREST|INTEREST\s+PAID|DEPOSIT\s+INTEREST|INTEREST\s+EARNED|CASHBACK(?:\s+EARNED|\s+REWARD)?|AUTOMATED\s+CREDIT|DIRECT\s+CREDIT|CSH\s+LOYD\s+POST\s+OFFICE|ONLINE\s+TRANSACTION\s+FROM\s+A\/C|THIS\s+RELATES\s+TO\s+A\s+PREVIOUS\s+TRANSACTION|SENT\s+FROM\s+REVOLUT|ODOSLANE\s+Z\s+REVOLUT|FROM:\s+[A-Z])\b|(?:^|\b)(?:FPI|BGC|MPI|DEP)\b|^(?:\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}\s+)?FROM\s+[A-Z][a-z]+\s+[A-Z])/i;

const ISO_DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
const UK_DASH_DATE = /(\d{1,2})[-.](\d{1,2})[-.](\d{4})/;
const ISO_DATE_DASHED = /(\d{4})-(\d{2})-(\d{2})/;
const LONG_UK_DATE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i;
const SHORT_UK_DATE_WITH_YEAR = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2})(?:\s|$)/i;
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
  const usesDecimalComma = value.includes('.')
    ? value.lastIndexOf(',') > value.lastIndexOf('.')
    : /,\d{1,2}$/.test(value);
  const normalized = usesDecimalComma
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

  const shortWithYearMatch = line.match(SHORT_UK_DATE_WITH_YEAR);
  if (shortWithYearMatch) {
    const day = Number(shortWithYearMatch[1]);
    const month = MONTHS[shortWithYearMatch[2].slice(0, 3).toLowerCase()];
    const shortYear = Number(shortWithYearMatch[3]);
    const year = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
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
  if (BALANCE_ROW_PATTERN.test(line)) return null;

  const sanitizedLine = line
    .replace(EXCHANGE_RATE_CLAUSE_PATTERN, ' ')
    .replace(UNIT_CURRENCY_PARITY_PATTERN, ' ')
    .replace(INLINE_BALANCE_CLAUSE_PATTERN, ' ');

  const poundSymbol = String.fromCharCode(0xa3);
  const explicitPounds = Array.from(sanitizedLine.matchAll(EXPLICIT_GBP_PRICE_PATTERN))
    .map((match) => ({ amount: parseLocalizedAmount(match[1]), index: match.index ?? 0 }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);

  const explicitSuffixPounds: Array<{ amount: number; index: number }> = [];
  let cursor = 0;
  for (const segment of sanitizedLine.split(poundSymbol).slice(0, -1)) {
    const match = segment.match(/(?:^|\s)(\d{1,4}(?:[,.]\d{3})*[,.]\d{2})\s*$/);
    if (match) {
      explicitSuffixPounds.push({
        amount: parseLocalizedAmount(match[1]),
        index: cursor + (match.index ?? 0),
      });
    }
    cursor += segment.length + 1;
  }

  const allExplicitPounds = [...explicitPounds, ...explicitSuffixPounds].sort((a, b) => a.index - b.index);
  if (allExplicitPounds.length > 0) return allExplicitPounds[0].amount;

  const localizedGbpAmounts = Array.from(
    sanitizedLine.matchAll(
      /(?:(?:Â£|\u00A3|\bGBP)\s*(\d{1,4},\d{2})\b|(?:^|\s)[-+]?(\d{1,4},\d{2})(?=\s*(?:Â£|\u00A3|\bGBP\b)))/gi,
    ),
  )
    .map((match) => parseLocalizedAmount(match[1] || match[2]))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  if (localizedGbpAmounts.length > 0) {
    return localizedGbpAmounts[0];
  }
  // 1. Explicit £ or GBP symbol
  const gbpMatch = sanitizedLine.match(GBP_PRICE_PATTERN);
  if (gbpMatch) {
    return parseLocalizedAmount(gbpMatch[1]);
  }

  const signedGbpMatch = sanitizedLine.match(SIGNED_GBP_PRICE_PATTERN);
  if (signedGbpMatch) {
    return parseLocalizedAmount(signedGbpMatch[1]);
  }

  const gbpSuffixMatch = sanitizedLine.match(GBP_SUFFIX_PRICE_PATTERN);
  if (gbpSuffixMatch) {
    return parseLocalizedAmount(gbpSuffixMatch[1]);
  }

  // Do not interpret a foreign-currency amount as GBP on Revolut/multi-currency statements.
  if (FOREIGN_CURRENCY_AMOUNT_PATTERN.test(sanitizedLine)) return null;

  // Monzo and some PDF exports omit the GBP symbol and encode debits as
  // `GBR-15.08` or `-15.08`. Running balances normally follow the debit;
  // prefer the explicit signed debit and leave credits to the credit filter.
  const signedDebit = sanitizedLine.match(/(?:^|\s|(?:GBR|GBP))[-−]\s*(\d{1,4}(?:,\d{3})*[,.]\d{2})\b/i);
  if (signedDebit) {
    const amount = parseLocalizedAmount(signedDebit[1]);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }

  // 2. Strip date patterns and country codes before extracting decimal amounts
  const stripped = sanitizedLine
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
    // the debit amount is the first column before the running balance.
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
  cleaned = cleaned.replace(SHORT_UK_DATE_WITH_YEAR, ' ');
  cleaned = cleaned.replace(SHORT_UK_DATE, ' ');
  cleaned = cleaned.replace(GBP_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(SIGNED_GBP_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(GBP_SUFFIX_PRICE_PATTERN, ' ');
  cleaned = cleaned.replace(TRAILING_DEBIT_PATTERN, ' ');
  cleaned = cleaned.replace(REVERSAL_OR_FAILED_PATTERN, ' ');
  cleaned = cleaned.replace(PREFIX_PATTERN, ' ');
  cleaned = cleaned.replace(COUNTRY_PATTERN, ' ');
  cleaned = cleaned.replace(CITY_PATTERN, ' ');
  cleaned = cleaned.replace(POSTCODE_PATTERN, ' ');
  cleaned = cleaned.replace(CARD_ENDING_PATTERN, ' ');
  cleaned = cleaned.replace(REF_PATTERN, ' ');
  cleaned = cleaned.replace(FX_PATTERN, ' ');
  cleaned = cleaned.replace(LTD_PATTERN, ' ');
  cleaned = cleaned.replace(/\bQBP\d*\b/gi, ' ');
  cleaned = cleaned.replace(/[£$€]/g, ' ');
  cleaned = cleaned.replace(/(?:^|\s)[-−]\s*(?=\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\b)/g, ' ');
  cleaned = cleaned.replace(/\b\d{1,4}(?:[,.]\d{3})*[,.]\d{2}\b/g, ' ');
  cleaned = cleaned.replace(/^FEE\s+(?=(?:SILVER\s+ACCOUNT|ACCOUNT\s+FEE)\b)/i, ' ');
  cleaned = cleaned.replace(/\bOD\s*$/i, ' ');
  // Retain letters, digits, spaces, plus sign (for Disney+), and common punctuation
  cleaned = cleaned.replace(/[^\w\s.&/'+\-]/g, ' ');
  const normalized = cleaned.replace(/[-–—]+\s*$/g, ' ').replace(/\s+/g, ' ').trim();
  // Generic Apple billing rows do not identify Apple TV or iCloud. Collapse
  // only those ambiguous rows so they can be learned as one merchant, while
  // preserving explicit Apple TV/iCloud/Music service names.
  if (
    /APPLE(?:\.COM\/BILL| APP STORE| SERVICES?)/i.test(normalized) &&
    !/APPLE\s*(?:TV|MUSIC|ARCADE|ONE)|ICLOUD/i.test(normalized)
  ) {
    return 'APPLE BILLING';
  }
  return normalized;
}

function isStatementNoise(line: string): boolean {
  return STATEMENT_NOISE_PATTERN.test(line.trim());
}

function isInformationalOrSectionBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (OUT_OF_TABLE_BOUNDARY_PATTERN.test(trimmed)) return true;

  // Even if a sentence contains DD, POS, or VIS in the middle, explanatory prose markers
  // or sentence-ending periods without a valid leading transaction date or leading bank code
  // must be rejected as informational text.
  const hasDate = extractUkDate(trimmed) !== null;
  const hasLeadingMarker = hasStructuralBankTransactionMarker(trimmed);

  if (
    /\b(?:PER\s+PERIOD|FOR\s+THIS\s+PERIOD|PER\s+MONTH|MAXIMUM\s+CHARGE|CHARGING\s+PERIODS?|CHARGING\s+INFORMATION|PAYMENT\s+INFORMATION|EXCHANGE\s+RATE\s+INFORMATION|FAIR\s+USAGE\s+FEE|AFTER\s+YOUR\s+TRIAL|IMPORTANT\s+NOTICE|OVERDRAFT|IF\s+YOU\s+USE|WE\s+WILL\s+CHARGE|PLEASE\s+CONTACT)\b/i.test(
      trimmed,
    ) &&
    !hasDate
  ) {
    return true;
  }

  if (!hasDate && !hasLeadingMarker) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 8 && /\.\s*$/.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function extractReferenceToken(line: string): string | null {
  const refMatch = line.match(
    /(?:\b(?:REF[:\s-]*([A-Z0-9-]{3,})|CD\s*(\d{4})|CARD[:\s]+(\d{4})|ENDING\s+(\d{4})|MANDATE\s+NO\s*(\d+))\b|(?:\*{1,4}|X{2,4})\s*(\d{4})\b)/i,
  );
  if (!refMatch) return null;
  return (refMatch[1] || refMatch[2] || refMatch[3] || refMatch[4] || refMatch[5] || refMatch[6] || '').toUpperCase() || null;
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
  const typeField = isMonzoExport ? (fields[2] ?? '') : '';
  const description = isMonzoExport
    ? `${typeField} ${fields[3]}`.trim()
    : fields.slice(1, amountIndex).join(' ');
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
 * Boundary/informational rows flush pending blocks immediately and never merge
 * across table boundaries.
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
    const line = normalizeCsvStatementLine(
      repairBankMerchantAbbreviations(repairCommonMerchantSpacing(normalizeStatementLine(rawLine))),
    );
    if (!line) continue;
    if (isStatementNoise(line)) {
      flushPending();
      continue;
    }

    if (
      TABLE_HEADER_PATTERN.test(line) ||
      BALANCE_ROW_PATTERN.test(line) ||
      isInformationalOrSectionBoundary(line)
    ) {
      flushPending();
      logicalLines.push(line);
      continue;
    }

    // Revolut places merchant details on the row immediately after the
    // amount. Attach them to the transaction so aliases such as Google One
    // are not lost behind a generic display label such as "Google".
    if (isContinuation(line) && pending.length === 0 && logicalLines.length > 0) {
      const prev = logicalLines[logicalLines.length - 1];
      if (!isInformationalOrSectionBoundary(prev) && !BALANCE_ROW_PATTERN.test(prev)) {
        logicalLines[logicalLines.length - 1] = `${prev} ${line}`;
        continue;
      }
    }

    // Never merge two separate dated rows into one logical line, or merge an
    // undated non-transaction orphan line onto a new dated or structural transaction row.
    if (
      pending.length > 0 &&
      ((extractUkDate(line) !== null && pending.some((item) => extractUkDate(item) !== null)) ||
        (!pending.some((item) => extractUkDate(item) !== null || hasStructuralBankTransactionMarker(item)) &&
          (extractUkDate(line) !== null || hasStructuralBankTransactionMarker(line))))
    ) {
      flushPending();
    }

    pending.push(line);
    if (extractGbpAmount(line) !== null) {
      flushPending();
    }
  }

  flushPending();
  return logicalLines;
}

function cancelLinkedReversals(
  debits: ScannedTransaction[],
  reversals: Array<{
    merchantKey: string;
    amountGbp: number;
    dateIso: string | null;
    ref: string | null;
    rail: 'dd' | 'card' | 'other';
  }>,
): ScannedTransaction[] {
  if (reversals.length === 0) return debits;
  const cancelledIndices = new Set<number>();

  for (const rev of reversals) {
    let bestIndex = -1;
    let bestDiffDays = Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < debits.length; idx++) {
      if (cancelledIndices.has(idx)) continue;
      const tx = debits[idx];
      if (Math.abs(tx.amountGbp - rev.amountGbp) > 0.005) continue;
      const txRail = inferPaymentRail(tx.rawLine);
      // A RETURNED DD (rail 'dd') only cancels a Direct Debit, never a card/DEB payment.
      if (rev.rail === 'dd' && txRail === 'card') continue;

      const txKey = tx.cleanedMerchant.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (rev.merchantKey) {
        if (!txKey) continue;
        const sameMerchant =
          txKey === rev.merchantKey ||
          txKey.includes(rev.merchantKey) ||
          rev.merchantKey.includes(txKey);
        if (!sameMerchant) continue;
      } else {
        // Anonymous RETURNED DD row (e.g. Lloyds "11 Mar 25 RETURNED DD 17.26 7.83"):
        // must only cancel a Direct Debit ('dd') row of the exact same GBP amount.
        if (rev.rail !== 'dd' || txRail !== 'dd') continue;
      }

      // If either row carries an explicit reference/card token and the other does not
      // match it, do not cancel an unrelated outgoing debit.
      if ((rev.ref || tx.referenceToken) && rev.ref !== tx.referenceToken) {
        if (rev.ref && tx.referenceToken) continue;
        if (txRail === 'card') continue;
      }

      if (tx.dateIso && rev.dateIso) {
        const txTime = Date.parse(`${tx.dateIso}T00:00:00Z`);
        const revTime = Date.parse(`${rev.dateIso}T00:00:00Z`);
        const diffDays = (revTime - txTime) / 86_400_000;
        const maxDays = rev.merchantKey ? 14 : 5;
        if (diffDays < 0 || diffDays > maxDays) continue;
        if (diffDays <= bestDiffDays) {
          bestDiffDays = diffDays;
          bestIndex = idx;
        }
      } else if (rev.merchantKey && bestIndex === -1) {
        bestIndex = idx;
      }
    }

    if (bestIndex >= 0) {
      cancelledIndices.add(bestIndex);
    }
  }

  return debits.filter((_, idx) => !cancelledIndices.has(idx));
}

export function parseStatementLines(lines: string[], now = new Date()): ScannedTransaction[] {
  const transactions: ScannedTransaction[] = [];
  const reversals: Array<{
    merchantKey: string;
    amountGbp: number;
    dateIso: string | null;
    ref: string | null;
    rail: 'dd' | 'card' | 'other';
  }> = [];
  const cleanedLines = groupStatementLines(lines);

  const isMonzoStatement = cleanedLines.some((l) => /\bMonzo\s+Bank\b|\b04-00-0[34]\b/i.test(l));

  // Track active statement year from explicit 4-digit years in headers or dated rows
  // so short dates without a year (e.g. "14 DEC", "03 JAN") resolve to the statement's year.
  let activeYear = now.getFullYear();
  let lastSeenMonth: number | null = null;
  for (const l of cleanedLines) {
    const periodMatch = l.match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\s+to\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/i,
    );
    if (periodMatch) {
      activeYear = Number(periodMatch[3]);
      lastSeenMonth = MONTHS[periodMatch[2].slice(0, 3).toLowerCase()];
      break;
    }
    const longMatch = l.match(LONG_UK_DATE);
    if (longMatch) {
      activeYear = Number(longMatch[3]);
      lastSeenMonth = MONTHS[longMatch[2].slice(0, 3).toLowerCase()];
      break;
    }
  }

  const resolveLineDate = (line: string): { iso: string; billingDay: number } | null => {
    const longMatch = line.match(LONG_UK_DATE);
    if (longMatch) {
      const m = MONTHS[longMatch[2].slice(0, 3).toLowerCase()];
      activeYear = Number(longMatch[3]);
      lastSeenMonth = m;
    } else {
      const shortNoYear =
        !ISO_DATE_DASHED.test(line) &&
        !ISO_DATE.test(line) &&
        !UK_DASH_DATE.test(line) &&
        !SHORT_UK_DATE_WITH_YEAR.test(line)
          ? line.match(SHORT_UK_DATE)
          : null;
      if (shortNoYear) {
        const m = MONTHS[shortNoYear[2].slice(0, 3).toLowerCase()];
        if (lastSeenMonth !== null && lastSeenMonth >= 10 && m <= 1) {
          activeYear += 1;
        }
        lastSeenMonth = m;
      }
    }
    const refNow = new Date(Date.UTC(activeYear, 0, 1));
    return extractUkDate(line, refNow);
  };

  const matchedIndices = new Set<number>();
  let tableState: StatementTableState = 'OUT_OF_TABLE';
  let activeTableDate: { iso: string; billingDay: number } | null = null;
  let lastValidTableDate: { iso: string; billingDay: number } | null = null;

  // Pass 1: standard lines containing both merchant and amount with IN_TABLE / OUT_OF_TABLE state machine
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];

    if (TABLE_HEADER_PATTERN.test(line)) {
      tableState = 'IN_TABLE';
      // Preserve activeTableDate across page-continuation table headers when immediately followed by BROUGHT FORWARD
      const nextLine = cleanedLines[i + 1] ?? '';
      if (!/\bBROUGHT\s+FORWARD\b/i.test(nextLine)) {
        activeTableDate = null;
      } else if (!activeTableDate && lastValidTableDate) {
        activeTableDate = lastValidTableDate;
      }
      matchedIndices.add(i);
      continue;
    }

    if (isInformationalOrSectionBoundary(line)) {
      tableState = 'OUT_OF_TABLE';
      activeTableDate = null;
      matchedIndices.add(i);
      continue;
    }

    const explicitDate = resolveLineDate(line);
    const hasExplicitTxMarker = hasStructuralBankTransactionMarker(line);

    if (BALANCE_ROW_PATTERN.test(line)) {
      if (explicitDate && /\bBROUGHT\s+FORWARD\b/i.test(line)) {
        tableState = 'IN_TABLE';
        activeTableDate = explicitDate;
        lastValidTableDate = explicitDate;
      } else if (/\bBROUGHT\s+FORWARD\b/i.test(line)) {
        tableState = 'IN_TABLE';
        if (!activeTableDate && lastValidTableDate) {
          activeTableDate = lastValidTableDate;
        }
      }
      matchedIndices.add(i);
      continue;
    }

    if (explicitDate) {
      tableState = 'IN_TABLE';
      activeTableDate = explicitDate;
      lastValidTableDate = explicitDate;
    } else if (hasExplicitTxMarker) {
      tableState = 'IN_TABLE';
    }

    const amountGbp = extractGbpAmount(line);
    if (amountGbp === null || !Number.isFinite(amountGbp) || amountGbp <= 0) continue;

    if (!explicitDate && !hasExplicitTxMarker && tableState === 'IN_TABLE') {
      // Undated row with an amount but without a leading bank transaction marker cannot inherit activeTableDate
      activeTableDate = null;
    }

    const isMonzoUnsignedCredit =
      isMonzoStatement &&
      /^\d{2}\/\d{2}\/\d{4}\b/.test(line) &&
      !/[£€$]|\bGBP\s*[-−]|\s[-−]\d{1,4}(?:,\d{3})*\.\d{2}\b/i.test(line) &&
      /\s\d{1,4}(?:,\d{3})*\.\d{2}\s+-?\d{1,4}(?:,\d{3})*\.\d{2}$/.test(line);

    const isCredit = CREDIT_HINT_PATTERN.test(line) || isMonzoUnsignedCredit;
    const isHighValueTransfer = amountGbp > HIGH_VALUE_TRANSFER_GBP;
    if (isCredit || isHighValueTransfer) {
      matchedIndices.add(i);
      continue;
    }

    const effectiveDate =
      explicitDate ?? (tableState === 'IN_TABLE' && hasExplicitTxMarker ? activeTableDate : null);
    const refToken = extractReferenceToken(line);
    const merchant = cleanMerchantName(line);

    // Handle explicit reversals / returned direct debits / failed payments (including anonymous RETURNED DD rows)
    if (REVERSAL_OR_FAILED_PATTERN.test(line)) {
      if (/\b(?:RETURNED\s+(?:DD|DIRECT\s+DEBIT)|UNPAID\s+(?:DD|DIRECT\s+DEBIT)|REVERSAL|REVERSED)\b/i.test(line)) {
        const isReturnedDd = /\b(?:RETURNED|UNPAID)\s+(?:DD|DIRECT\s+DEBIT)\b/i.test(line);
        reversals.push({
          merchantKey: merchant.toUpperCase().replace(/[^A-Z0-9]/g, ''),
          amountGbp,
          dateIso: effectiveDate?.iso ?? null,
          ref: refToken,
          rail: isReturnedDd ? 'dd' : 'other',
        });
      }
      matchedIndices.add(i);
      continue;
    }

    if (merchant.length < 2) continue;

    const reasonCodes: ScannerReasonCode[] = ['VALID_DEBIT'];
    const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(line);
    if (hasStrongRecurringMarker) {
      reasonCodes.push('DD_MARKER');
    }

    transactions.push({
      rawLine: line,
      cleanedMerchant: merchant,
      amountGbp,
      dateIso: effectiveDate?.iso ?? null,
      billingDay: effectiveDate?.billingDay ?? null,
      isCredit: false,
      isHighValueTransfer: false,
      tableState: effectiveDate ? 'IN_TABLE' : tableState,
      validityScore: 3,
      hasStrongRecurringMarker,
      isReversalOrFailed: false,
      referenceToken: refToken,
      reasonCodes,
    });
    matchedIndices.add(i);
  }

  // Pass 2: adjacent lines (e.g. merchant on line i, amount on line i+1 or i-1)
  for (let i = 0; i < cleanedLines.length; i++) {
    if (matchedIndices.has(i)) continue;
    const line = cleanedLines[i];
    if (isInformationalOrSectionBoundary(line) || BALANCE_ROW_PATTERN.test(line)) continue;

    const amount = extractGbpAmount(line);
    const merchant = cleanMerchantName(line);

    // If line i has an amount but short/empty merchant, combine with line i-1
    if (amount !== null && amount > 0 && merchant.length < 3 && i > 0 && !matchedIndices.has(i - 1)) {
      const prevLine = cleanedLines[i - 1];
      if (isInformationalOrSectionBoundary(prevLine) || BALANCE_ROW_PATTERN.test(prevLine)) continue;
      const prevMerchant = cleanMerchantName(prevLine);
      if (prevMerchant.length >= 3 && extractGbpAmount(prevLine) === null) {
        const combined = `${prevLine} ${line}`;
        const isCredit = CREDIT_HINT_PATTERN.test(combined);
        if (!isCredit && amount <= HIGH_VALUE_TRANSFER_GBP && !REVERSAL_OR_FAILED_PATTERN.test(combined)) {
          const date = extractUkDate(combined, now);
          const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(combined);
          transactions.push({
            rawLine: combined,
            cleanedMerchant: prevMerchant,
            amountGbp: amount,
            dateIso: date?.iso ?? null,
            billingDay: date?.billingDay ?? null,
            isCredit: false,
            isHighValueTransfer: false,
            tableState: date ? 'IN_TABLE' : 'OUT_OF_TABLE',
            validityScore: 3,
            hasStrongRecurringMarker,
            isReversalOrFailed: false,
            referenceToken: extractReferenceToken(combined),
            reasonCodes: hasStrongRecurringMarker ? ['VALID_DEBIT', 'DD_MARKER'] : ['VALID_DEBIT'],
          });
          matchedIndices.add(i);
          matchedIndices.add(i - 1);
        }
      }
    }
    // If line i has merchant but no amount, combine with line i+1
    else if (amount === null && merchant.length >= 3 && i + 1 < cleanedLines.length && !matchedIndices.has(i + 1)) {
      const nextLine = cleanedLines[i + 1];
      if (isInformationalOrSectionBoundary(nextLine) || BALANCE_ROW_PATTERN.test(nextLine)) continue;
      const nextAmount = extractGbpAmount(nextLine);
      if (nextAmount !== null && nextAmount > 0 && cleanMerchantName(nextLine).length < 3) {
        const combined = `${line} ${nextLine}`;
        const isCredit = CREDIT_HINT_PATTERN.test(combined);
        if (!isCredit && nextAmount <= HIGH_VALUE_TRANSFER_GBP && !REVERSAL_OR_FAILED_PATTERN.test(combined)) {
          const date = extractUkDate(combined, now);
          const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(combined);
          transactions.push({
            rawLine: combined,
            cleanedMerchant: merchant,
            amountGbp: nextAmount,
            dateIso: date?.iso ?? null,
            billingDay: date?.billingDay ?? null,
            isCredit: false,
            isHighValueTransfer: false,
            tableState: date ? 'IN_TABLE' : 'OUT_OF_TABLE',
            validityScore: 3,
            hasStrongRecurringMarker,
            isReversalOrFailed: false,
            referenceToken: extractReferenceToken(combined),
            reasonCodes: hasStrongRecurringMarker ? ['VALID_DEBIT', 'DD_MARKER'] : ['VALID_DEBIT'],
          });
          matchedIndices.add(i);
          matchedIndices.add(i + 1);
        }
      }
    }
  }

  return cancelLinkedReversals(transactions, reversals);
}
