import React, { useState } from 'react';
import { X, Gift, Share2, Copy, Check, Sparkles, Users, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { UserPlan } from '../types/subscription';
import {
  getUserInviteCode,
  getInviteShareDetails,
  claimInviteCode,
} from '../utils/inviteSystem';
import { playSubtlePop, playTaDing } from '../utils/soundEffects';

interface GiftSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bonusSlots: number;
  onBonusSlotsChange: (count: number) => void;
  activeCount: number;
  userPlan: UserPlan;
}

export const GiftSlotModal: React.FC<GiftSlotModalProps> = ({
  isOpen,
  onClose,
  bonusSlots,
  onBonusSlotsChange,
  activeCount,
  userPlan,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [claimInput, setClaimInput] = useState('');
  const [claimStatus, setClaimStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showClaimBox, setShowClaimBox] = useState(false);

  if (!isOpen) return null;

  const myCode = getUserInviteCode();
  const shareDetails = getInviteShareDetails(myCode);
  const maxSlots = userPlan === 'free' ? 2 + bonusSlots : 'Unlimited';

  const handleShare = async () => {
    playSubtlePop();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareDetails.title,
          text: shareDetails.text,
          url: shareDetails.url,
        });
        return;
      } catch {
        // Fallback to copy if user dismisses or API rejects
      }
    }
    handleCopyLink();
  };

  const handleCopyLink = () => {
    playSubtlePop();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareDetails.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyCode = () => {
    playSubtlePop();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(myCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    setClaimStatus(null);
    const result = claimInviteCode(claimInput);
    if (result.success) {
      playTaDing();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D4AF7C', '#B79B6B', '#F5F5F5', '#E2C391'],
      });
      onBonusSlotsChange(result.bonusSlots);
      setClaimStatus({ type: 'success', message: result.message });
      setClaimInput('');
    } else {
      setClaimStatus({ type: 'error', message: result.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <div
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto max-h-[90dvh] w-full bg-[#161616] border-t border-white/15 rounded-t-[32px] flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.8)] overflow-hidden modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-slot-title"
      >
        {/* Native iOS Bottom Sheet Drag Handle */}
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-3 shrink-0 cursor-pointer active:scale-95 transition-all duration-150"
        />

        {/* Top Header */}
        <div className="relative p-5 pb-3 flex items-center justify-between border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-[#D4AF7C]/15 border border-[#D4AF7C]/35 flex items-center justify-center text-[#D4AF7C]">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h2 id="gift-slot-title" className="text-base font-extrabold text-[#F5F5F5] tracking-tight">
                Gift a Slot · Invite a Mate
              </h2>
              <p className="text-[11px] text-[#A0A0A0]">Both of you get +1 free subscription slot</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-white/[0.06] text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[#F5F5F5]">
          {/* Slot Status Summary Card */}
          <div className="rounded-2xl bg-[#1F1F1F] border border-white/[0.08] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#A0A0A0]">
              <span>Your Tracking Allowance</span>
              {userPlan === 'free' ? (
                <span className="font-bold text-[#D4AF7C]">
                  {activeCount} / {maxSlots} Slots Used
                </span>
              ) : (
                <span className="font-bold text-emerald-400">Unlimited (Lifetime {userPlan.toUpperCase()})</span>
              )}
            </div>

            {userPlan === 'free' && (
              <div className="flex items-center gap-2 pt-1 text-[11px]">
                <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[#A0A0A0]">Base: 2 free</span>
                <span className="text-[#A0A0A0]">+</span>
                <span className="px-2 py-0.5 rounded-full bg-[#D4AF7C]/20 text-[#D4AF7C] font-semibold">
                  Invites: +{bonusSlots} bonus
                </span>
                <span className="text-[#A0A0A0]">=</span>
                <span className="font-bold text-[#F5F5F5]">{2 + bonusSlots} total slots</span>
              </div>
            )}
          </div>

          {/* Value Proposition Pills */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#1F1F1F] border border-white/[0.06] p-2.5 space-y-1">
              <Gift className="w-4 h-4 text-[#D4AF7C] mx-auto" />
              <div className="text-[10px] font-bold text-[#F5F5F5]">+1 for Mate</div>
              <div className="text-[9px] text-[#A0A0A0]">Welcome bonus</div>
            </div>
            <div className="rounded-xl bg-[#1F1F1F] border border-white/[0.06] p-2.5 space-y-1">
              <Sparkles className="w-4 h-4 text-[#D4AF7C] mx-auto" />
              <div className="text-[10px] font-bold text-[#F5F5F5]">+1 for You</div>
              <div className="text-[9px] text-[#A0A0A0]">On their join</div>
            </div>
            <div className="rounded-xl bg-[#1F1F1F] border border-white/[0.06] p-2.5 space-y-1">
              <Users className="w-4 h-4 text-[#D4AF7C] mx-auto" />
              <div className="text-[10px] font-bold text-[#F5F5F5]">100% Free</div>
              <div className="text-[9px] text-[#A0A0A0]">No paywall needed</div>
            </div>
          </div>

          {/* Share Box */}
          <div className="rounded-2xl border border-[#D4AF7C]/35 bg-gradient-to-b from-[#D4AF7C]/[0.10] to-transparent p-4 space-y-3">
            <div className="text-center space-y-1">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
                Your Unique Invite Code
              </div>
              <div className="text-2xl font-mono font-black text-[#F5F5F5] tracking-widest">{myCode}</div>
              <p className="text-xs text-[#A0A0A0] max-w-xs mx-auto pt-1">
                Share this link with a friend. When they open it, you both unlock +1 extra subscription slot.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleShare}
                className="btn-champagne w-full min-h-[46px] rounded-full py-3 px-4 font-black text-xs text-[#0A0A0A] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer shadow-lg shadow-[#D4AF7C]/20"
              >
                <Share2 className="w-4 h-4 stroke-[2.5]" />
                <span>Share Invite Link</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn-secondary-luxury flex-1 min-h-[40px] rounded-full py-2 px-3 text-xs font-bold text-[#F5F5F5] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#D4AF7C]" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="btn-secondary-luxury flex-1 min-h-[40px] rounded-full py-2 px-3 text-xs font-bold text-[#F5F5F5] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Code Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#D4AF7C]" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Friend Code Claim Section */}
          <div className="rounded-2xl bg-[#1F1F1F] border border-white/[0.08] p-3.5 space-y-2.5">
            <button
              type="button"
              onClick={() => setShowClaimBox((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-bold text-[#F5F5F5] hover:text-[#D4AF7C] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-[#D4AF7C]" />
                Got an invite code from a friend?
              </span>
              <span className="text-[11px] text-[#D4AF7C] underline">
                {showClaimBox ? 'Hide' : 'Enter Code'}
              </span>
            </button>

            {showClaimBox && (
              <form onSubmit={handleClaim} className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={claimInput}
                    onChange={(e) => {
                      setClaimInput(e.target.value.toUpperCase());
                      setClaimStatus(null);
                    }}
                    placeholder="e.g. TM-9X2P"
                    className="input-luxury min-h-[42px] flex-1 rounded-full px-4 py-2 text-xs font-mono tracking-wider uppercase"
                  />
                  <button
                    type="submit"
                    className="btn-champagne min-h-[42px] px-4 py-2 rounded-full font-bold text-xs text-[#0A0A0A] flex items-center gap-1 cursor-pointer"
                  >
                    <span>Claim</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {claimStatus && (
                  <p
                    className={`text-[11px] px-2 ${
                      claimStatus.type === 'success' ? 'text-emerald-400 font-semibold' : 'text-rose-400'
                    }`}
                  >
                    {claimStatus.message}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#161616]/95 text-center text-[11px] text-[#A0A0A0]">
          Clean and privacy-first · No login or credit card required
        </div>
      </div>
    </div>
  );
};
