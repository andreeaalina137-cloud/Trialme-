import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserInviteCode,
  getBonusSlots,
  addBonusSlot,
  claimInviteCode,
  hasClaimedInviteCode,
  getInviteShareDetails,
} from './inviteSystem';
import { clearMemoryStorage } from './storage';

describe('Invite & Gift Slot System', () => {
  beforeEach(() => {
    clearMemoryStorage();
  });

  it('generates a persistent valid TM-XXXX invite code', () => {
    const code1 = getUserInviteCode();
    assert.match(code1, /^TM-[A-Z0-9]{4}$/);
    const code2 = getUserInviteCode();
    assert.equal(code1, code2);
  });

  it('initializes bonus slots to 0 and increments correctly', () => {
    assert.equal(getBonusSlots(), 0);
    const after1 = addBonusSlot(1);
    assert.equal(after1, 1);
    assert.equal(getBonusSlots(), 1);
    const after2 = addBonusSlot(2);
    assert.equal(after2, 3);
    assert.equal(getBonusSlots(), 3);
  });

  it('rejects claiming own invite code', () => {
    const myCode = getUserInviteCode();
    const result = claimInviteCode(myCode);
    assert.equal(result.success, false);
    assert.match(result.message, /own invite code/i);
    assert.equal(getBonusSlots(), 0);
  });

  it('rejects invalid invite code formats', () => {
    const res1 = claimInviteCode('');
    assert.equal(res1.success, false);
    const res2 = claimInviteCode('INVALID-CODE-TOO-LONG');
    assert.equal(res2.success, false);
    const res3 = claimInviteCode('123');
    assert.equal(res3.success, false);
  });

  it('claims a friend invite code successfully and grants +1 bonus slot', () => {
    const friendCode = 'TM-9ABC';
    assert.equal(hasClaimedInviteCode(friendCode), false);

    const result = claimInviteCode(friendCode);
    assert.equal(result.success, true);
    assert.equal(result.bonusSlots, 1);
    assert.equal(getBonusSlots(), 1);
    assert.equal(hasClaimedInviteCode(friendCode), true);

    // Duplicate claim rejected
    const dupResult = claimInviteCode(friendCode);
    assert.equal(dupResult.success, false);
    assert.match(dupResult.message, /already been claimed/i);
    assert.equal(getBonusSlots(), 1);
  });

  it('generates share details with the correct code and URL', () => {
    const details = getInviteShareDetails('TM-TEST');
    assert.ok(details.url.includes('invite=TM-TEST'));
    assert.ok(details.text.includes('TM-TEST'));
  });
});
