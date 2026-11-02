import type {
  ScannedTransaction,
  ScannerReasonCode,
  StatementTableState,
  UKPaymentType,
} from '../types/scanner.types';
import {
  FLAG_SUMMARY_ROW,
  FLAG_INVALID_DATE,
  FLAG_DUPLICATE,
  FLAG_FX_CONVERSION,
  FLAG_REVOLUT_NOISE,
  FLAG_VALID_BANK_SUB,
  FLAG_TRANSFER_OR_CASH,
  FLAG_RENT_OR_FIXED_TRANSFER,
  FLAG_REFUNDED_PAIR,
} from '../types/scanner.types';
import {
  normalizeStatementLine,
  repairBankMerchantAbbreviations,
  repairCommonMerchantSpacing,
  extractCanonicalMerchantKey,
  areMerchantsFuzzyMatch,
} from './statementNormalizer';
import { buildMerchantFingerprint } from './merchantFingerprint';
import { reconcileBalances, type BalanceRowInput } from './spatialPdfExtractor';

// Stage 1: Summary lines common on UK statements/PDFs
export const SUMMARY_ROW_PATTERN =
  /\b(?:Total\s+Payments?|Total\s+Money\s+Out|Total\s+Money\s+In|Balance\s+Brought\s+Forward|Balance\s+Carried\s+Forward|Opening\s+Balance|Closing\s+Balance|Opening\/Closing\s+Balance|Account\s+Summary|Total\s+Debits?|Total\s+Credits?|Total\s+Paid\s+In|Total\s+Paid\s+Out|Payments\s+Out|Payments\s+In|Starting\s+Balance|Ending\s+Balance)\b/i;

// Stage 2: Standalone FX conversions
export const STANDALONE_FX_PATTERN =
  /\b(?:Exchanged\s+to|FX\s+Fee|Currency\s+Exchange|Bullion(?:\/Crypto)?\s+exchange|Crypto\s+exchange|General\s+currency\s+conversion)\b/i;

// Stage 2: Revolut micro-transactions and noise
export const REVOLUT_NOISE_PATTERN =
  /\b(?:RevPoints|Spare\s+change|Pocket(?:\s+transfer)?|Vault(?:\s+transfer)?|Weekend\s+fee|Fair\s+usage\s+fee)\b/i;

// Stage 2: Revolut paid plan exception
export const REVOLUT_PAID_PLAN_PATTERN =
  /\b(?:Revolut\s+(?:Plus|Premium|Metal|Ultra)|Premium\s+plan(?:\s+fee)?|Metal\s+plan(?:\s+fee)?|Ultra\s+plan(?:\s+fee)?|Plus\s+plan(?:\s+fee)?|Taxa?\s+plan\s+metal)\b/i;

// UK Payment marker classification
export function classifyUKPaymentType(line: string): UKPaymentType {
  if (/\b(?:DIRECT\s+DEBIT|D\/D|DDR|DD)\b/i.test(line)) {
    return 'DIRECT_DEBIT';
  }
  if (/\b(?:STANDING\s+ORDER|SO|STO)\b/i.test(line)) {
    return 'STANDING_ORDER';
  }
  if (/\b(?:ATM|CASH\s+WITHDRAWAL|CASH\s+MACHINE|CASHLINE|C\/L)\b/i.test(line)) {
    return 'ATM_CASH';
  }
  if (/\b(?:FP|FASTER\s+PAYMENT|BGC|TRANSFER\s+TO|INTERNAL\s+TRANSFER|TFR|FPO|FPI)\b/i.test(line)) {
    return 'P2P_TRANSFER';
  }
  if (
    /\b(?:DEB|POS|CARD\s+PAYMENT|CPA|CONTINUOUS\s+PAYMENT|APPLE\s+PAY|GOOGLE\s+PAY|CARD\s+SUBSCRIPTION|RECURRING\s+CARD\s+PURCHASE|CONTACTLESS|VIS|MASTERCARD)\b/i.test(
      line,
    )
  ) {
    return 'RECURRING_CARD_CPA';
  }
  return 'OTHER';
}

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
const LONG_UK_DATE = /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*(\d{4})/i;
const SHORT_UK_DATE_WITH_YEAR = /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*(\d{2})(?:\s|[|,]|$)/i;
const SHORT_UK_DATE = /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s|[|,]|$)/i;

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

export type StatementDateFormat = 'DMY' | 'MDY';

export interface StatementPeriodInfo {
  startYear: number;
  startMonth: number; // 0-11
  endYear: number;
  endMonth: number;   // 0-11
}

/**
 * Extracts statement period start and end years/months from document header lines.
 * Supports:
 * - "January 01, 2025 through March 31, 2025" (US Chase)
 * - "16 Jan 2024 to 15 Feb 2024" or "01 JUN 2019 - 30 JUN 2019" (UK long)
 * - "16 Jan 24 to 15 Feb 24" (UK short year)
 * - "01/01/2024 - 31/03/2024" (Numeric period)
 * - "Oct 1, 2023 - Oct 31, 2023" (Same-year month period)
 * - Single date header fallback (e.g. "Statement date: 15/01/2025" or "Issue date 15 February 2024")
 */
export function extractStatementPeriod(lines: readonly string[]): StatementPeriodInfo | null {
  for (const l of lines) {
    // 1. Month Day, Year through/to/- Month Day, Year (e.g. "January 01, 2025 through March 31, 2025")
    const mdyPeriod = l.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\s*(?:through|to|-)\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i,
    );
    if (mdyPeriod) {
      return {
        startMonth: MONTHS[mdyPeriod[1].slice(0, 3).toLowerCase()],
        startYear: Number(mdyPeriod[3]),
        endMonth: MONTHS[mdyPeriod[4].slice(0, 3).toLowerCase()],
        endYear: Number(mdyPeriod[6]),
      };
    }

    // 2. Day Month Year to/- Day Month Year (e.g. "16 Jan 2024 to 15 Feb 2024" or "01 JUN 2019 - 30 JUN 2019")
    const dmyPeriod = l.match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\s*(?:to|-|through)\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/i,
    );
    if (dmyPeriod) {
      return {
        startMonth: MONTHS[dmyPeriod[2].slice(0, 3).toLowerCase()],
        startYear: Number(dmyPeriod[3]),
        endMonth: MONTHS[dmyPeriod[5].slice(0, 3).toLowerCase()],
        endYear: Number(dmyPeriod[6]),
      };
    }

    // 3. Short 2-digit year (e.g. "16 Jan 24 to 15 Feb 24")
    const shortYearPeriod = l.match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2})\s*(?:to|-|through)\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{2})\b/i,
    );
    if (shortYearPeriod) {
      const y1 = Number(shortYearPeriod[3]);
      const y2 = Number(shortYearPeriod[6]);
      return {
        startMonth: MONTHS[shortYearPeriod[2].slice(0, 3).toLowerCase()],
        startYear: y1 >= 70 ? 1900 + y1 : 2000 + y1,
        endMonth: MONTHS[shortYearPeriod[5].slice(0, 3).toLowerCase()],
        endYear: y2 >= 70 ? 1900 + y2 : 2000 + y2,
      };
    }

    // 4. Numeric period (e.g. "01/01/2024 - 31/03/2024" or "01-01-2024 to 31-03-2024")
    const numPeriod = l.match(
      /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\s*(?:-|to|through)\s*(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/,
    );
    if (numPeriod) {
      const p1 = Number(numPeriod[1]);
      const p2 = Number(numPeriod[2]);
      const p4 = Number(numPeriod[4]);
      const p5 = Number(numPeriod[5]);
      const isMdy = p2 > 12 || p5 > 12;
      return {
        startMonth: isMdy ? p1 - 1 : p2 - 1,
        startYear: Number(numPeriod[3]),
        endMonth: isMdy ? p4 - 1 : p5 - 1,
        endYear: Number(numPeriod[6]),
      };
    }

    // 5. Month Day - Month Day, Year (e.g. "Oct 1, 2023 - Oct 31, 2023")
    const sameYearMonthPeriod = l.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\s*(?:-|to|through)\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i,
    );
    if (sameYearMonthPeriod) {
      const yEnd = Number(sameYearMonthPeriod[5]);
      const yStart = sameYearMonthPeriod[3] ? Number(sameYearMonthPeriod[3]) : yEnd;
      return {
        startMonth: MONTHS[sameYearMonthPeriod[1].slice(0, 3).toLowerCase()],
        startYear: yStart,
        endMonth: MONTHS[sameYearMonthPeriod[4].slice(0, 3).toLowerCase()],
        endYear: yEnd,
      };
    }
  }

  // Fallback: single date header (e.g. "Statement date: 15/01/2025" or "Issue date 15 February 2024")
  for (const l of lines) {
    const singleLong = l.match(LONG_UK_DATE);
    if (singleLong) {
      const y = Number(singleLong[3]);
      const m = MONTHS[singleLong[2].slice(0, 3).toLowerCase()];
      return { startMonth: m, startYear: y, endMonth: m, endYear: y };
    }
    const singleIso = l.match(ISO_DATE) || l.match(UK_DASH_DATE);
    if (singleIso) {
      const y = Number(singleIso[3]);
      const m = Number(singleIso[2]) - 1;
      return { startMonth: m, startYear: y, endMonth: m, endYear: y };
    }
  }

  return null;
}

/**
 * Resolves the calendar year for a given month within a statement period.
 * Accurately handles December/January year boundaries (e.g. Dec 2024 -> 2024, Jan 2025 -> 2025).
 * Never guesses if period is null.
 */
export function resolveYearForMonth(
  monthIndex: number,
  period: StatementPeriodInfo | null,
): number | null {
  if (!period) return null;
  const { startYear, startMonth, endYear, endMonth } = period;
  if (startYear === endYear) {
    return startYear;
  }
  // Period spans across year boundary (e.g. Dec 2024 to Jan 2025)
  if (monthIndex >= startMonth) {
    return startYear;
  }
  if (monthIndex <= endMonth) {
    return endYear;
  }
  return monthIndex >= 6 ? startYear : endYear;
}

/**
 * Resolves document-wide date format consensus (DMY vs MDY) across statement lines.
 * If any line carries day > 12 in part 1, locks to UK DMY.
 * If any line carries day > 12 in part 2 without DMY contradiction, uses MDY.
 * Defaults to standard UK DMY.
 */
export function detectDocumentDateFormat(lines: readonly string[]): StatementDateFormat {
  let hasDmyEvidence = false;
  let hasMdyEvidence = false;

  for (const rawLine of lines) {
    const sanitized = rawLine
      .replace(/\b(?:Sort\s+code\s+)?\d{2}-\d{2}-\d{2}\b/gi, ' ')
      .replace(/\bAccount\s+\d+\b/gi, ' ');

    // 1. Check 3-part dates
    const matches3 = Array.from(sanitized.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g));
    for (const match of matches3) {
      const p1 = Number(match[1]);
      const p2 = Number(match[2]);
      if (p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
        hasDmyEvidence = true;
      } else if (p2 > 12 && p2 <= 31 && p1 >= 1 && p1 <= 12) {
        hasMdyEvidence = true;
      }
    }

    // 2. Check 2-part slash dates (e.g. 01/16, 03/31) not part of 3-part dates
    const matches2 = Array.from(
      sanitized.matchAll(/(?<!\d\/)\b(\d{1,2})\/(\d{1,2})\b(?!\/\d)/g),
    );
    for (const match of matches2) {
      const p1 = Number(match[1]);
      const p2 = Number(match[2]);
      if (p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
        hasDmyEvidence = true;
      } else if (p2 > 12 && p2 <= 31 && p1 >= 1 && p1 <= 12) {
        hasMdyEvidence = true;
      }
    }
  }

  if (hasMdyEvidence && !hasDmyEvidence) {
    return 'MDY';
  }

  return 'DMY';
}

/**
 * Defensive date check: identifies impossible calendar dates (e.g. 31 Sep, 2026-13-01, 29 Feb on non-leap years)
 * caused by OCR or extraction errors without crashing.
 */
export function checkImpossibleDate(
  line: string,
  dateFormat: StatementDateFormat = 'DMY',
): { isImpossible: boolean; rawDate?: string } {
  // Strip UK banking sort codes (e.g. Sort code 20-00-00, 11-11-11) and account numbers first
  // so sort codes are never mistaken for dates
  const sanitized = line
    .replace(/\b(?:Sort\s+code\s+)?\d{2}-\d{2}-\d{2}\b/gi, ' ')
    .replace(/\bAccount\s+\d+\b/gi, ' ');

  // Check ISO dashed e.g. 2026-13-01 or 2026-09-31
  const isoDashed = sanitized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDashed) {
    const y = Number(isoDashed[1]);
    const m = Number(isoDashed[2]);
    const d = Number(isoDashed[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || !toIso(y, m - 1, d)) {
      return { isImpossible: true, rawDate: isoDashed[0] };
    }
  }

  // Check UK slash e.g. 31/09/2026 or 31/13/2026
  const ukSlash = sanitized.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (ukSlash) {
    const d = dateFormat === 'MDY' ? Number(ukSlash[2]) : Number(ukSlash[1]);
    const m = dateFormat === 'MDY' ? Number(ukSlash[1]) : Number(ukSlash[2]);
    const y = Number(ukSlash[3].length === 2 ? `20${ukSlash[3]}` : ukSlash[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || !toIso(y, m - 1, d)) {
      return { isImpossible: true, rawDate: ukSlash[0] };
    }
  }

  // Check UK dashed e.g. 31-09-2026 or 31.09.2026 (requires 4-digit year so 2-digit sort codes never match)
  const ukDash = sanitized.match(/\b(\d{1,2})[-.](\d{1,2})[-.](\d{4})\b/);
  if (ukDash) {
    const d = dateFormat === 'MDY' ? Number(ukDash[2]) : Number(ukDash[1]);
    const m = dateFormat === 'MDY' ? Number(ukDash[1]) : Number(ukDash[2]);
    const y = Number(ukDash[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || !toIso(y, m - 1, d)) {
      return { isImpossible: true, rawDate: ukDash[0] };
    }
  }

  // Check 2-part numeric date without year e.g. 31/02 or 02/31 (slashes only, never period decimal)
  const twoPart = sanitized.match(/(?<!\d\/)\b(\d{1,2})\/(\d{1,2})\b(?!\/\d)/);
  if (twoPart) {
    const d = dateFormat === 'MDY' ? Number(twoPart[2]) : Number(twoPart[1]);
    const m = dateFormat === 'MDY' ? Number(twoPart[1]) : Number(twoPart[2]);
    if (m < 1 || m > 12 || d < 1 || d > 31 || (m === 2 && d > 29) || ([4, 6, 9, 11].includes(m) && d > 30)) {
      return { isImpossible: true, rawDate: twoPart[0] };
    }
  }

  // Check Text month e.g. 31 Sep 2026 or 31 Sep
  const textMonth = sanitized.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+(\d{2,4}))?\b/i,
  );
  if (textMonth) {
    const d = Number(textMonth[1]);
    const m = MONTHS[textMonth[2].slice(0, 3).toLowerCase()];
    const y = textMonth[3] ? Number(textMonth[3].length === 2 ? `20${textMonth[3]}` : textMonth[3]) : 2026;
    if (m === undefined || d < 1 || d > 31 || !toIso(y, m, d)) {
      return { isImpossible: true, rawDate: textMonth[0] };
    }
  }

  return { isImpossible: false };
}

export function extractUkDate(
  line: string,
  now?: Date | null,
  dateFormat: StatementDateFormat = 'DMY',
  periodInfo?: StatementPeriodInfo | null,
): { iso: string; billingDay: number } | null {
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
    const day = dateFormat === 'MDY' ? Number(isoMatch[2]) : Number(isoMatch[1]);
    const month = (dateFormat === 'MDY' ? Number(isoMatch[1]) : Number(isoMatch[2])) - 1;
    const year = Number(isoMatch[3]);
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  const ukDashedMatch = line.match(UK_DASH_DATE);
  if (ukDashedMatch) {
    const day = dateFormat === 'MDY' ? Number(ukDashedMatch[2]) : Number(ukDashedMatch[1]);
    const month = (dateFormat === 'MDY' ? Number(ukDashedMatch[1]) : Number(ukDashedMatch[2])) - 1;
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
    const year = periodInfo ? resolveYearForMonth(month, periodInfo) : (now ? now.getFullYear() : null);
    if (!year) return null;
    const iso = toIso(year, month, day);
    return iso ? { iso, billingDay: day } : null;
  }

  // Two-part numeric date without year (e.g. "01/09", "03/16", slashes only)
  const twoPartMatch = line.match(/(?<!\d\/)\b(\d{1,2})\/(\d{1,2})\b(?!\/\d)/);
  if (twoPartMatch) {
    const p1 = Number(twoPartMatch[1]);
    const p2 = Number(twoPartMatch[2]);
    const day = dateFormat === 'MDY' ? p2 : p1;
    const month = (dateFormat === 'MDY' ? p1 : p2) - 1;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const year = periodInfo ? resolveYearForMonth(month, periodInfo) : (now ? now.getFullYear() : null);
      if (!year) return null;
      const iso = toIso(year, month, day);
      return iso ? { iso, billingDay: day } : null;
    }
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
    canonicalMerchant?: string;
    amountGbp: number;
    dateIso: string | null;
    ref: string | null;
    rail: 'dd' | 'card' | 'other';
    isExplicitRefund?: boolean;
    rawLine?: string;
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

      // Unlinked credit (without refund/return/reversal/chargeback keyword and not returned DD)
      // does not cancel a Direct Debit mandate (preserves unlinked credit preservation).
      if (txRail === 'dd' && !rev.isExplicitRefund && rev.rail !== 'dd') continue;

      const txKey = tx.cleanedMerchant.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const txCanon = tx.canonicalMerchant || extractCanonicalMerchantKey(tx.cleanedMerchant || tx.rawLine);
      const revCanon = rev.canonicalMerchant || (rev.rawLine ? extractCanonicalMerchantKey(rev.rawLine) : '');

      let sameMerchant = false;
      if (txCanon && revCanon && (txCanon === revCanon || areMerchantsFuzzyMatch(txCanon, revCanon))) {
        sameMerchant = true;
      } else if (rev.merchantKey) {
        if (!txKey) continue;
        sameMerchant =
          txKey === rev.merchantKey ||
          txKey.includes(rev.merchantKey) ||
          rev.merchantKey.includes(txKey);
      } else {
        // Anonymous RETURNED DD row (e.g. Lloyds "11 Mar 25 RETURNED DD 17.26 7.83"):
        // must only cancel a Direct Debit ('dd') row of the exact same GBP amount.
        if (rev.rail === 'dd' && txRail === 'dd') {
          sameMerchant = true;
        }
      }

      if (!sameMerchant) continue;

      // If either row carries an explicit reference/card token and the other does not
      // match it, do not cancel an unrelated outgoing debit.
      if ((rev.ref || tx.referenceToken) && rev.ref !== tx.referenceToken) {
        if (rev.ref && tx.referenceToken) continue;
        if (txRail === 'card') continue;
      }

      if (tx.dateIso && rev.dateIso) {
        const txTime = Date.parse(`${tx.dateIso}T00:00:00Z`);
        const revTime = Date.parse(`${rev.dateIso}T00:00:00Z`);
        const diffDays = Math.abs(revTime - txTime) / 86_400_000;
        const maxDays = rev.merchantKey || revCanon ? 14 : 5;
        if (diffDays < 0 || diffDays > maxDays) continue;
        if (diffDays <= bestDiffDays) {
          bestDiffDays = diffDays;
          bestIndex = idx;
        }
      } else if ((rev.merchantKey || revCanon) && bestIndex === -1) {
        bestIndex = idx;
      }
    }

    if (bestIndex >= 0) {
      cancelledIndices.add(bestIndex);
      debits[bestIndex].status = 'QUARANTINED';
      debits[bestIndex].auditFlag = FLAG_REFUNDED_PAIR;
      debits[bestIndex].reason = 'Refunded pair: net-zero matched debit and credit within 1-14 days';
    }
  }

  return debits.filter((_, idx) => !cancelledIndices.has(idx));
}

export function parseStatementInternal(
  lines: string[],
  now = new Date(),
): { accepted: ScannedTransaction[]; ledger: ScannedTransaction[] } {
  const transactions: ScannedTransaction[] = [];
  const ledger: ScannedTransaction[] = [];
  const reversals: Array<{
    merchantKey: string;
    canonicalMerchant?: string;
    amountGbp: number;
    dateIso: string | null;
    ref: string | null;
    rail: 'dd' | 'card' | 'other';
    isExplicitRefund?: boolean;
    rawLine?: string;
  }> = [];
  const seenRowFingerprints = new Set<string>();
  const cleanedLines = groupStatementLines(lines);
  const dateFormat = detectDocumentDateFormat(cleanedLines);
  const periodInfo = extractStatementPeriod(cleanedLines);

  const isMonzoStatement = cleanedLines.some((l) => /\bMonzo\s+Bank\b|\b04-00-0[34]\b/i.test(l));

  // Determine active statement year from statement period or passed now (fallback to 4-digit years in lines)
  let activeYear: number | null = periodInfo?.startYear ?? (now ? now.getFullYear() : null);
  let lastSeenMonth: number | null = periodInfo?.startMonth ?? null;

  if (activeYear === null) {
    for (const l of cleanedLines) {
      const longMatch = l.match(LONG_UK_DATE);
      if (longMatch) {
        activeYear = Number(longMatch[3]);
        lastSeenMonth = MONTHS[longMatch[2].slice(0, 3).toLowerCase()];
        break;
      }
      const isoMatch = l.match(ISO_DATE) || l.match(UK_DASH_DATE) || l.match(ISO_DATE_DASHED);
      if (isoMatch) {
        activeYear = Number(isoMatch[1].length === 4 ? isoMatch[1] : isoMatch[3]);
        break;
      }
    }
  }

  const resolveLineDate = (line: string): { iso: string; billingDay: number; rawDate?: string } | null => {
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
        if (activeYear !== null && lastSeenMonth !== null && lastSeenMonth >= 10 && m <= 1) {
          activeYear += 1;
        }
        lastSeenMonth = m;
      }
    }
    const refNow = activeYear !== null ? new Date(Date.UTC(activeYear, 0, 1)) : null;
    const extracted = extractUkDate(line, refNow, dateFormat, periodInfo);
    if (!extracted) return null;
    const rawDateMatch =
      line.match(ISO_DATE_DASHED) ||
      line.match(ISO_DATE) ||
      line.match(UK_DASH_DATE) ||
      line.match(LONG_UK_DATE) ||
      line.match(SHORT_UK_DATE_WITH_YEAR) ||
      line.match(SHORT_UK_DATE) ||
      line.match(/(?<!\d[./-])\b(\d{1,2})([./-])(\d{1,2})\b(?![./-]\d)/);
    return { ...extracted, rawDate: rawDateMatch ? rawDateMatch[0] : undefined };
  };

  const matchedIndices = new Set<number>();
  let tableState: StatementTableState = 'OUT_OF_TABLE';
  let activeTableDate: { iso: string; billingDay: number; rawDate?: string } | null = null;
  let lastValidTableDate: { iso: string; billingDay: number; rawDate?: string } | null = null;

  // Pass 1: standard lines containing both merchant and amount with IN_TABLE / OUT_OF_TABLE state machine
  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];

    // Stage 1: Check impossible dates caused by OCR errors (e.g. 31 Sep, 2026-13-01)
    const impossibleCheck = checkImpossibleDate(line, dateFormat);
    if (impossibleCheck.isImpossible) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: cleanMerchantName(line),
        amountGbp: extractGbpAmount(line) ?? 0,
        signedAmount: -(extractGbpAmount(line) ?? 0),
        rawDescription: line,
        rawAmount: extractGbpAmount(line) ?? 0,
        rawDate: impossibleCheck.rawDate,
        dateIso: null,
        billingDay: null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_INVALID_DATE,
        reason: 'Impossible calendar date caused by OCR error',
        paymentType: classifyUKPaymentType(line),
        canonicalMerchant: extractCanonicalMerchantKey(line),
      });
      matchedIndices.add(i);
      continue;
    }

    // Stage 1: Detect and quarantine statement summary rows
    if (SUMMARY_ROW_PATTERN.test(line)) {
      const summaryAmount = extractGbpAmount(line) ?? 0;
      ledger.push({
        rawLine: line,
        cleanedMerchant: cleanMerchantName(line),
        amountGbp: summaryAmount,
        signedAmount: -summaryAmount,
        rawDescription: line,
        rawAmount: summaryAmount,
        dateIso: null,
        billingDay: null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_SUMMARY_ROW,
        reason: 'Statement summary or header row excluded',
        paymentType: classifyUKPaymentType(line),
        canonicalMerchant: extractCanonicalMerchantKey(line),
      });
      matchedIndices.add(i);
      continue;
    }

    if (TABLE_HEADER_PATTERN.test(line)) {
      tableState = 'IN_TABLE';
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
      activeTableDate = null;
    }

    const effectiveDate =
      explicitDate ?? (tableState === 'IN_TABLE' && hasExplicitTxMarker ? activeTableDate : null);
    const refToken = extractReferenceToken(line);
    const merchant = cleanMerchantName(line);
    const paymentType = classifyUKPaymentType(line);
    const canonMerchant = extractCanonicalMerchantKey(merchant || line);

    // Stage 2: Standalone FX conversions
    if (STANDALONE_FX_PATTERN.test(line)) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_FX_CONVERSION,
        reason: 'Standalone foreign exchange or FX fee row',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }

    // Stage 2: Revolut noise vs paid plan
    const isRevolutPaid = REVOLUT_PAID_PLAN_PATTERN.test(line);
    const isRevolutNoise = REVOLUT_NOISE_PATTERN.test(line);
    if (isRevolutNoise && !isRevolutPaid) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_REVOLUT_NOISE,
        reason: 'Internal Revolut micro-transaction, round-up, or usage fee',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }

    // Stage 2: UK payment classification & quarantine for P2P transfers & ATM cash
    if (paymentType === 'P2P_TRANSFER' || paymentType === 'ATM_CASH') {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_TRANSFER_OR_CASH,
        reason: paymentType === 'ATM_CASH' ? 'ATM cash withdrawal excluded' : 'P2P transfer excluded',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }

    // Stage 2: Large round-amount Standing Orders (rent or fixed transfers, exact multiples of £100 >= £100)
    if (paymentType === 'STANDING_ORDER' && amountGbp >= 100 && amountGbp % 100 === 0) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_RENT_OR_FIXED_TRANSFER,
        reason: 'Large round-amount Standing Order (likely rent or fixed transfer)',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }

    // Stage 1: Duplicate Detection
    const rowFingerprint = `${effectiveDate?.iso || ''}_${amountGbp.toFixed(2)}_${line.trim().toUpperCase()}`;
    if (seenRowFingerprints.has(rowFingerprint)) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: FLAG_DUPLICATE,
        reason: 'Duplicate identical row',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }
    seenRowFingerprints.add(rowFingerprint);

    const isMonzoUnsignedCredit =
      isMonzoStatement &&
      /^\d{2}\/\d{2}\/\d{4}\b/.test(line) &&
      !/[£€$]|\bGBP\s*[-−]|\s[-−]\d{1,4}(?:,\d{3})*\.\d{2}\b/i.test(line) &&
      /\s\d{1,4}(?:,\d{3})*\.\d{2}\s+-?\d{1,4}(?:,\d{3})*\.\d{2}$/.test(line);

    const isCredit = CREDIT_HINT_PATTERN.test(line) || isMonzoUnsignedCredit;
    const isReturnedDd = /\b(?:RETURNED|UNPAID)\s+(?:DD|DIRECT\s+DEBIT)\b/i.test(line);
    const isExplicitReversal =
      /\b(?:RETURNED\s+(?:DD|DIRECT\s+DEBIT)|UNPAID\s+(?:DD|DIRECT\s+DEBIT)|REVERSAL|REVERSED|CHARGEBACK)\b/i.test(
        line,
      ) ||
      (/\b(?:REFUND|RETURN)\b/i.test(line) && !/\bREFUND\s+FROM\b/i.test(line));

    // Stage 4: Gather credit / reversal / refund candidates
    if (isCredit || isReturnedDd || isExplicitReversal || REVERSAL_OR_FAILED_PATTERN.test(line)) {
      if (isExplicitReversal || isReturnedDd) {
        reversals.push({
          merchantKey: merchant.toUpperCase().replace(/[^A-Z0-9]/g, ''),
          canonicalMerchant: canonMerchant,
          amountGbp,
          dateIso: effectiveDate?.iso ?? null,
          ref: refToken,
          rail: isReturnedDd ? 'dd' : inferPaymentRail(line),
          isExplicitRefund: true,
          rawLine: line,
        });
      }

      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: +amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: true,
        isHighValueTransfer: false,
        status: 'QUARANTINED',
        auditFlag: isExplicitReversal ? FLAG_REFUNDED_PAIR : undefined,
        reason: isExplicitReversal
          ? 'Reversal or refund transaction'
          : 'Incoming credit or refund excluded from subscriptions',
        paymentType,
        canonicalMerchant: canonMerchant,
      });

      matchedIndices.add(i);
      continue;
    }

    const isHighValueTransfer = amountGbp > HIGH_VALUE_TRANSFER_GBP;
    if (isHighValueTransfer) {
      ledger.push({
        rawLine: line,
        cleanedMerchant: merchant,
        amountGbp,
        signedAmount: -amountGbp,
        rawDescription: line,
        rawAmount: amountGbp,
        rawDate: effectiveDate?.rawDate,
        dateIso: effectiveDate?.iso ?? null,
        billingDay: effectiveDate?.billingDay ?? null,
        isCredit: false,
        isHighValueTransfer: true,
        status: 'QUARANTINED',
        auditFlag: FLAG_TRANSFER_OR_CASH,
        reason: 'High value transfer excluded',
        paymentType,
        canonicalMerchant: canonMerchant,
      });
      matchedIndices.add(i);
      continue;
    }

    if (merchant.length < 2) continue;

    const reasonCodes: ScannerReasonCode[] = ['VALID_DEBIT'];
    const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(line);
    if (hasStrongRecurringMarker) {
      reasonCodes.push('DD_MARKER');
    }

    const txObj: ScannedTransaction = {
      rawLine: line,
      cleanedMerchant: merchant,
      amountGbp,
      signedAmount: -amountGbp,
      rawDescription: line,
      rawAmount: amountGbp,
      rawDate: effectiveDate?.rawDate,
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
      status: 'ACCEPTED',
      auditFlag: isRevolutPaid ? FLAG_VALID_BANK_SUB : undefined,
      reason: isRevolutPaid ? 'Valid bank subscription plan' : undefined,
      paymentType,
      canonicalMerchant: canonMerchant,
    };

    transactions.push(txObj);
    ledger.push(txObj);
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
          const date = extractUkDate(
            combined,
            activeYear !== null ? new Date(Date.UTC(activeYear, 0, 1)) : null,
            dateFormat,
            periodInfo,
          );
          const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(combined);
          const txObj: ScannedTransaction = {
            rawLine: combined,
            cleanedMerchant: prevMerchant,
            amountGbp: amount,
            signedAmount: -amount,
            rawDescription: combined,
            rawAmount: amount,
            rawDate: date ? date.iso : undefined,
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
            status: 'ACCEPTED',
            paymentType: classifyUKPaymentType(combined),
            canonicalMerchant: extractCanonicalMerchantKey(prevMerchant),
          };
          transactions.push(txObj);
          ledger.push(txObj);
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
          const date = extractUkDate(
            combined,
            activeYear !== null ? new Date(Date.UTC(activeYear, 0, 1)) : null,
            dateFormat,
            periodInfo,
          );
          const hasStrongRecurringMarker = STRONG_RECURRING_MARKER_PATTERN.test(combined);
          const txObj: ScannedTransaction = {
            rawLine: combined,
            cleanedMerchant: merchant,
            amountGbp: nextAmount,
            signedAmount: -nextAmount,
            rawDescription: combined,
            rawAmount: nextAmount,
            rawDate: date ? date.iso : undefined,
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
            status: 'ACCEPTED',
            paymentType: classifyUKPaymentType(combined),
            canonicalMerchant: extractCanonicalMerchantKey(merchant),
          };
          transactions.push(txObj);
          ledger.push(txObj);
          matchedIndices.add(i);
          matchedIndices.add(i + 1);
        }
      }
    }
  }

  const accepted = cancelLinkedReversals(transactions, reversals);

  // Extract candidate amounts and running balances to generate balance reconciliation evidence
  const balanceInputs: BalanceRowInput[] = accepted.map((tx) => {
    const extracted = extractRowAmountsAndBalance(tx.rawLine);
    const hasExplicitDebit =
      /[-−]\s*(?:£|GBP)?\s*\d/i.test(tx.rawLine) ||
      /\b(?:DR|DEB)\b/i.test(tx.rawLine) ||
      TRAILING_DEBIT_PATTERN.test(tx.rawLine);
    return {
      amounts: extracted.amounts.length > 0 ? extracted.amounts : [tx.amountGbp],
      balance: extracted.balance,
      date: tx.dateIso,
      existingIsCredit: tx.isCredit ? true : hasExplicitDebit ? false : null,
    };
  });

  const evidences = reconcileBalances(balanceInputs);

  for (let idx = 0; idx < accepted.length; idx++) {
    const tx = accepted[idx];
    if (!tx.normalizedMerchant || !tx.merchantFingerprint) {
      const fp = buildMerchantFingerprint(tx.rawLine || tx.cleanedMerchant, {
        amountGbp: tx.amountGbp,
      });
      tx.normalizedMerchant = fp.normalized;
      tx.merchantFingerprint = fp.fingerprint;
    }
    if (evidences[idx] && evidences[idx].classification !== 'UNVERIFIED') {
      tx.balanceEvidence = evidences[idx];
      // Close the loop on running-balance delta sign determination:
      // If the running balance mathematically increased by this candidate amount (money in),
      // quarantine it so an incoming credit/refund is never falsely accepted as a subscription debit.
      if (evidences[idx].reconciled && evidences[idx].classification === 'CREDIT_SUPPORTED' && !evidences[idx].supportsDebit) {
        tx.isCredit = true;
        tx.status = 'QUARANTINED';
        tx.validityScore = 0;
        tx.reason = 'Balance reconciliation proved money in (credit), not an outgoing debit';
        if (!tx.reasonCodes) {
          tx.reasonCodes = ['BALANCE_REJECTED'];
        } else if (!tx.reasonCodes.includes('BALANCE_REJECTED')) {
          tx.reasonCodes.push('BALANCE_REJECTED');
        }
      }
    }
  }

  for (const tx of ledger) {
    if (!tx.normalizedMerchant || !tx.merchantFingerprint) {
      const fp = buildMerchantFingerprint(tx.rawLine || tx.cleanedMerchant, {
        amountGbp: tx.amountGbp,
      });
      tx.normalizedMerchant = fp.normalized;
      tx.merchantFingerprint = fp.fingerprint;
    }
  }

  const finalAccepted = accepted.filter((tx) => tx.status !== 'QUARANTINED');
  return { accepted: finalAccepted, ledger };
}

function extractRowAmountsAndBalance(line: string): { amounts: number[]; balance: number | null } {
  const stripped = line
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ')
    .replace(COUNTRY_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matches = Array.from(
    stripped.matchAll(/(?:^|\s)([-+]?[£$€]?\s*\d{1,4}(?:,\d{3})*\.\d{2})\s*(DR|CR)?(?=\s|$)/gi),
  );
  if (matches.length < 2) {
    const val = extractGbpAmount(line);
    return { amounts: val !== null ? [val] : [], balance: null };
  }
  const parsedValues = matches
    .map((m) => {
      const clean = m[1].replace(/[£$€\s]/g, '').replace(/,/g, '');
      let val = Number(clean);
      if (m[2]?.toUpperCase() === 'DR' || m[1].includes('-')) val = -Math.abs(val);
      return val;
    })
    .filter((n) => Number.isFinite(n));

  if (parsedValues.length >= 2) {
    const balance = parsedValues[parsedValues.length - 1];
    const candidateAmounts = parsedValues.slice(0, -1).map((v) => Math.abs(v));
    return { amounts: candidateAmounts, balance };
  }
  return { amounts: parsedValues.map((v) => Math.abs(v)), balance: null };
}

export function parseStatementLines(lines: string[], now = new Date()): ScannedTransaction[] {
  return parseStatementInternal(lines, now).accepted;
}

export function parseStatementAuditLedger(lines: string[], now = new Date()): ScannedTransaction[] {
  return parseStatementInternal(lines, now).ledger;
}
