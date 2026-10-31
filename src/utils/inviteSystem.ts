import { safeStorageGet, safeStorageSet } from './storage';

const INVITE_CODE_KEY = 'subcleaner_user_invite_code';
const BONUS_SLOTS_KEY = 'subcleaner_bonus_slots';
const CLAIMED_INVITES_KEY = 'subcleaner_claimed_invites';

/**
 * Returns or generates a persistent, unique 6-char user invite code (e.g. TM-7X9K).
 */
export function getUserInviteCode(): string {
  const existing = safeStorageGet(INVITE_CODE_KEY);
  if (existing && /^TM-[A-Z0-9]{4}$/.test(existing)) {
    return existing;
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `TM-${rand}`;
  safeStorageSet(INVITE_CODE_KEY, code);
  return code;
}

/**
 * Returns the current number of unlocked bonus slots from invites (default 0).
 */
export function getBonusSlots(): number {
  const raw = safeStorageGet(BONUS_SLOTS_KEY);
  if (!raw) return 0;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * Increments and persists the unlocked bonus slots.
 */
export function addBonusSlot(count: number = 1): number {
  const current = getBonusSlots();
  const next = current + Math.max(1, Math.floor(count));
  safeStorageSet(BONUS_SLOTS_KEY, String(next));
  return next;
}

/**
 * Checks if an invite code has already been claimed on this device.
 */
export function hasClaimedInviteCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  const raw = safeStorageGet(CLAIMED_INVITES_KEY);
  if (!raw) return false;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(normalized);
  } catch {
    return false;
  }
}

/**
 * Records a claimed invite code to prevent re-claiming.
 */
function recordClaimedInviteCode(code: string): void {
  const normalized = code.trim().toUpperCase();
  const raw = safeStorageGet(CLAIMED_INVITES_KEY);
  let list: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  if (!list.includes(normalized)) {
    list.push(normalized);
    safeStorageSet(CLAIMED_INVITES_KEY, JSON.stringify(list));
  }
}

export interface ClaimInviteResult {
  success: boolean;
  message: string;
  bonusSlots: number;
}

/**
 * Validates and claims a friend's invite code.
 * Rejects empty codes, invalid formats, own code, or duplicate claims.
 */
export function claimInviteCode(inputCode: string): ClaimInviteResult {
  if (!inputCode || typeof inputCode !== 'string') {
    return {
      success: false,
      message: 'Please enter an invite code.',
      bonusSlots: getBonusSlots(),
    };
  }
  const clean = inputCode.trim().toUpperCase();
  const normalized = clean.startsWith('TM-') ? clean : `TM-${clean}`;

  if (!/^TM-[A-Z0-9]{4}$/.test(normalized)) {
    return {
      success: false,
      message: 'Invalid invite code. Codes look like TM-7X9K.',
      bonusSlots: getBonusSlots(),
    };
  }

  const ownCode = getUserInviteCode();
  if (normalized === ownCode) {
    return {
      success: false,
      message: "That's your own invite code! Share it with a friend instead.",
      bonusSlots: getBonusSlots(),
    };
  }

  if (hasClaimedInviteCode(normalized)) {
    return {
      success: false,
      message: 'This invite code has already been claimed on this device.',
      bonusSlots: getBonusSlots(),
    };
  }

  recordClaimedInviteCode(normalized);
  const updated = addBonusSlot(1);
  return {
    success: true,
    message: 'Invite unlocked! You received +1 free subscription slot.',
    bonusSlots: updated,
  };
}

/**
 * Generates the shareable link and text for gifting a slot to a friend.
 */
export function getInviteShareDetails(code?: string): { url: string; title: string; text: string } {
  const inviteCode = code || getUserInviteCode();
  const baseUrl =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://trialme.app';
  const inviteUrl = `${baseUrl}?invite=${inviteCode}`;

  return {
    url: inviteUrl,
    title: 'Monetry · Free Slot Gift',
    text: `Join me on Monetry to track free trials and cancel before paying! Use my invite link to unlock +1 free subscription slot: ${inviteUrl}`,
  };
}
