import { stripMerchantNoise } from './statementNormalizer';

/**
 * Deterministic merchant fingerprinting for cross-statement matching.
 *
 * A fingerprint is a *matching key*, not proof of identity: the raw description and the
 * normalized name are always kept alongside it, and the hash is never the only stored
 * identity. Parent-company services are deliberately NOT merged (Apple bill, Amazon retail,
 * Google Play stay ambiguous; price tiers and Revolut plans stay distinct).
 */

export type MerchantAmbiguity = 'APPLE_BILL' | 'AMAZON_RETAIL' | 'GOOGLE_PLAY' | null;

export interface MerchantFingerprint {
  /** Original description, untouched. */
  raw: string;
  /** Human-readable normalized merchant, kept separate from the hash. */
  normalized: string;
  /** Normalized name plus any identity qualifier (price tier, plan). Input of the hash. */
  identityKey: string;
  /** FNV-1a 32-bit hash of `identityKey`, 8 lowercase hex chars. Compact matching key only. */
  fingerprint: string;
  /** Set when the merchant text alone cannot identify a specific service. */
  ambiguity: MerchantAmbiguity;
  qualifiers: string[];
}

export interface FingerprintOptions {
  /** Amount in GBP; only used as a price-tier qualifier for ambiguous bill-through merchants. */
  amountGbp?: number | null;
  /** Detected bank format (e.g. 'lloyds'); gates context-dependent OCR/abbreviation repairs. */
  bankFormat?: string | null;
}

/** FNV-1a, 32-bit. Pure integer arithmetic, deterministic across runtimes. */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const APPLE_BILL_OCR = /\bAPPL?[IE1][E1]?\.COM\/BI[L1]{1,2}\b/gi;
const BANK_CONTEXT_MARKER = /\b(?:DIRECT\s+DEBIT|DDR|DD|DEB|D\/D|CARD\s+SUBSCRIPTION|CPA)\b/i;

/** Narrow, verified OCR repairs only. Context-dependent ones (H3G) are applied separately. */
function repairNarrowOcr(value: string): string {
  return value
    .replace(APPLE_BILL_OCR, 'APPLE.COM/BILL')
    .replace(/\bVODAFON[E3]\b/gi, 'VODAFONE')
    .replace(/\bTALK\s*[- ]?TALK\b/gi, 'TALKTALK');
}

function resolveThree(text: string, options: FingerprintOptions): string {
  const bank = (options.bankFormat ?? '').toLowerCase();
  const hasBankContext = (bank !== '' && bank !== 'generic') || BANK_CONTEXT_MARKER.test(text);
  // H3G is Three's legal entity name on UK statements, but only trusted with bank context.
  return hasBankContext ? text.replace(/\bH\s*3\s*G\b(?:\s+\d{3,12})?/gi, 'THREE UK') : text;
}

const REVOLUT_PLAN = /\b(ULTRA|METAL|PREMIUM|PLUS|STANDARD)\b/i;

function pricePence(amount: number | null | undefined): string {
  return typeof amount === 'number' && Number.isFinite(amount) ? String(Math.round(Math.abs(amount) * 100)) : '?';
}

export function buildMerchantFingerprint(raw: string, options: FingerprintOptions = {}): MerchantFingerprint {
  const original = raw ?? '';
  let text = original.normalize('NFKC').replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '').trim();
  text = repairNarrowOcr(text);
  text = resolveThree(text, options);

  const qualifiers: string[] = [];
  let ambiguity: MerchantAmbiguity = null;
  let normalized: string;

  if (/\bAPPLE\.COM\/BILL\b|\bAPPLE\s+BILL(?:ING)?\b|\bITUNES\b/i.test(text)) {
    // The billing descriptor never names the app/subscription: keep it ambiguous, split by price tier.
    normalized = 'APPLE.COM/BILL';
    ambiguity = 'APPLE_BILL';
    qualifiers.push(`tier:${pricePence(options.amountGbp)}`);
  } else if (/\bAMAZON\b|\bAMZN\b/i.test(text)) {
    if (/\bPRIME\b/i.test(text)) normalized = 'AMAZON PRIME';
    else if (/\bAUDIBLE\b/i.test(text)) normalized = 'AUDIBLE';
    else {
      normalized = 'AMAZON RETAIL';
      ambiguity = 'AMAZON_RETAIL';
    }
  } else if (/\bGOOGLE\b/i.test(text) && /\bGOOGLE\s*\*|\bGOOGLE\s+PLAY\b|\bGOOGLE\s+PAY\b|\bGOOGLE\s+ONE\b/i.test(text)) {
    if (/\bGOOGLE\s+ONE\b/i.test(text)) {
      normalized = 'GOOGLE ONE';
    } else if (/\bGOOGLE\s+PLAY\b|\bGOOGLE\s*\*/i.test(text)) {
      normalized = 'GOOGLE PLAY';
      ambiguity = 'GOOGLE_PLAY';
      qualifiers.push(`tier:${pricePence(options.amountGbp)}`);
    } else {
      const rest = stripMerchantNoise(text.replace(/\bGOOGLE\s+(?:PLAY|PAY)\b/gi, ' ').replace(/\bGOOGLE\b/gi, ' '), false);
      if (rest && !/^(?:PLAY|PAY|APPS?)$/.test(rest)) normalized = `GOOGLE ${rest}`;
      else {
        normalized = 'GOOGLE PLAY';
        ambiguity = 'GOOGLE_PLAY';
        qualifiers.push(`tier:${pricePence(options.amountGbp)}`);
      }
    }
  } else if (/\bREVOLUT\b|\b(?:ULTRA|METAL|PREMIUM|PLUS|STANDARD)\s+(?:PLAN|FEE)\b/i.test(text) && REVOLUT_PLAN.test(text)) {
    const plan = (REVOLUT_PLAN.exec(text)?.[1] ?? '').toUpperCase();
    normalized = `REVOLUT ${plan} PLAN`;
    qualifiers.push(`plan:${plan}`);
  } else {
    normalized = stripMerchantNoise(text, false);
    if (/^THREE(?:\s+UK|\s+MOBILE)?$/.test(normalized)) normalized = 'THREE UK';
    if (/^TALKTALK(?:\s+BROADBAND|\s+TELECOM)?$/i.test(normalized)) normalized = 'TALKTALK';
  }

  if (!normalized) {
    // Never let noise removal erase the merchant entirely.
    normalized = text.toUpperCase().replace(/[^A-Z0-9+]+/g, ' ').trim();
    qualifiers.push('fallback:raw');
  }

  const identityKey = qualifiers.length > 0 ? `${normalized}|${qualifiers.join('|')}` : normalized;
  return { raw: original, normalized, identityKey, fingerprint: fnv1a32(identityKey), ambiguity, qualifiers };
}
