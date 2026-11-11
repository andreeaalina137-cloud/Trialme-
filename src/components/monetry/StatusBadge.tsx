import type { FC } from 'react';
import type { SubscriptionStatus } from '../../types/subscription';

export type StatusBadgeVariant = SubscriptionStatus | 'urgent';

const MAP: Record<StatusBadgeVariant, { label: string; cls: string }> = {
  active: {
    label: 'Active',
    cls: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
  },
  trial: {
    label: 'Free Trial',
    cls: 'border-[#D4AF7C]/30 bg-[#211C14] text-[#D4AF7C]',
  },
  cancelled: {
    label: 'Cancelled',
    cls: 'border-white/10 bg-white/[0.04] text-white/45',
  },
  urgent: {
    label: 'Urgent',
    cls: 'border-rose-400/30 bg-rose-400/[0.08] text-rose-300',
  },
};

export interface StatusBadgeProps {
  status: StatusBadgeVariant;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status }) => {
  const m = MAP[status] || MAP.active;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${m.cls}`}
    >
      {m.label}
    </span>
  );
};
