import type { FC } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import type { PaymentRecord } from '../../types/subscription';

export interface DetailHistoryProps {
  records: PaymentRecord[];
  currencySymbol: string;
  formatPrice: (amount: number, symbol?: string) => string;
}

export const DetailHistory: FC<DetailHistoryProps> = ({
  records,
  currencySymbol,
  formatPrice,
}) => {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">Payment History</p>
        <span className="font-mono text-[10.5px] text-white/40 tabular-nums">
          {records.length} {records.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {records.length === 0 ? (
        <div className="specular px-4 py-3 text-[11.5px] text-white/45">
          No historical charges recorded yet.
        </div>
      ) : (
        <div className="specular divide-y divide-white/[0.05] px-4 py-1">
          {records.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between py-2.5 text-[12px]"
            >
              <div className="flex items-center gap-2">
                {r.status === 'paid' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-[#D4AF7C]" />
                )}
                <span className="font-mono text-white/75 tabular-nums">{r.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-white tabular-nums">
                  {formatPrice(r.amount, r.currency || currencySymbol)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-white/55">
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
