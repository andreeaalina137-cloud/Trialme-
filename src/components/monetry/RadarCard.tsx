import type { FC } from 'react';
import { ArrowUpRight, Compass } from 'lucide-react';
import type { CuratedUkTrial } from '../../utils/retentionAndTrust';
import { BrandIcon } from '../BrandIcon';

export interface RadarCardProps {
  trials: CuratedUkTrial[];
  onExplore: () => void;
  onSelectTrial: (trial: CuratedUkTrial) => void;
}

export const RadarCard: FC<RadarCardProps> = ({
  trials,
  onExplore,
  onSelectTrial,
}) => {
  return (
    <section className="specular p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="chip-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
            <Compass className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-heading text-[13.5px] font-semibold text-white">
              UK Free Trial Radar
            </h3>
            <p className="text-[11px] text-white/45">
              Start any UK free trial safely — 3-day &amp; 1-day cancellation alarms armed automatically
            </p>
          </div>
        </div>
        <span className="chip-gold shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold">
          AUTO-ALARM • 09:30 AM
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {trials.slice(0, 4).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTrial(t)}
              title={`${t.name} (${t.badge})`}
              className="transition hover:scale-105"
            >
              <BrandIcon
                name={t.name}
                category={t.category}
                color={t.color}
                size="sm"
                enableLinkPill={false}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onExplore}
          className="btn-gold inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold"
        >
          Explore ({trials.length})
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
};
