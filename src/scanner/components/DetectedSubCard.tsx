import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { BrandIcon } from '../../components/BrandIcon';
import type { MatchedSubscription } from '../types/scanner.types';

interface DetectedSubCardProps {
  item: MatchedSubscription;
  onToggle: (id: string) => void;
  onAmountChange: (id: string, amountGbp: number) => void;
}

function ordinal(day: number): string {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function confidenceLabel(item: MatchedSubscription): string {
  if (item.matchTier === 1) return '99% match';
  if (item.matchTier === 2) return '90% match';
  return `${Math.round(item.confidence * 100)}% match`;
}

export function DetectedSubCard({ item, onToggle, onAmountChange }: DetectedSubCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.amountGbp.toFixed(2));

  const commitAmount = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) {
      onAmountChange(item.id, Math.round(next * 100) / 100);
    } else {
      setDraft(item.amountGbp.toFixed(2));
    }
    setEditing(false);
  };

  return (
    <article className="rounded-2xl border border-[rgba(212,175,55,0.22)] bg-[#121212] p-3.5">
      <div className="flex items-start gap-3">
        <BrandIcon name={item.serviceName} category={item.category} color={item.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold text-[#F5F5F5]">{item.serviceName}</h3>
              <p className="mt-0.5 text-[11px] text-[#A0A0A0]">
                {item.billingDay ? `Renews on the ${ordinal(item.billingDay)}` : `${item.billingCycle} billing`}
                {item.isVerifiedRecurring ? ' · Verified Recurring' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className={`inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${
                item.selected
                  ? 'bg-[#D4AF37] text-[#0A0A0A]'
                  : 'border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] text-[#D4AF37]'
              }`}
            >
              {item.selected ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Selected
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editing ? (
              <input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitAmount}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitAmount();
                }}
                className="w-24 rounded-lg border border-[#D4AF37] bg-[#0A0A0A] px-2 py-1 text-sm font-semibold text-[#D4AF37] outline-none"
                aria-label={`Edit ${item.serviceName} price`}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.amountGbp.toFixed(2));
                  setEditing(true);
                }}
                className="text-sm font-semibold tabular-nums text-[#F5F5F5]"
              >
                £{item.amountGbp.toFixed(2)}
                <span className="ml-1 text-[11px] font-medium text-[#A0A0A0]">
                  /{item.billingCycle === 'Annual' ? 'yr' : 'mo'}
                </span>
              </button>
            )}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A0A0A0]">
              {item.billingCycle}
            </span>
            <span className="rounded-full border border-[rgba(212,175,55,0.22)] px-2 py-0.5 text-[10px] font-semibold text-[#D4AF37]">
              {confidenceLabel(item)}
            </span>
          </div>

          {item.hasCancellationTrap && (
            <p className="mt-2 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-[#E8C872]">
              ⚠️ Cancellation Trap Detected
              {item.trapLabel ? ` · ${item.trapLabel}` : ''}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
