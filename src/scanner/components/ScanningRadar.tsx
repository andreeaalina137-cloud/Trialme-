import type { ScannerProgress } from '../types/scanner.types';

interface ScanningRadarProps {
  progress: ScannerProgress;
}

export function ScanningRadar({ progress }: ScanningRadarProps) {
  return (
    <div className="rounded-3xl border border-[rgba(212,175,55,0.22)] bg-[#121212] p-5">
      <style>{`
        @keyframes monetry-laser-sweep {
          0% { transform: translateY(-8%); opacity: 0.15; }
          45% { opacity: 1; }
          100% { transform: translateY(108%); opacity: 0.2; }
        }
        @keyframes monetry-pulse-gold {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.8; }
        }
      `}</style>

      <div className="relative overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.16)] bg-[#0A0A0A] px-5 py-8">
        <div className="mx-auto h-36 w-[78%] rounded-md border border-white/10 bg-gradient-to-b from-[#161616] to-[#0E0E0E] p-3">
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="h-2 rounded-full bg-white/10"
                style={{
                  width: `${72 - (index % 3) * 14}%`,
                  animation: 'monetry-pulse-gold 1.8s ease-in-out infinite',
                  animationDelay: `${index * 120}ms`,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-4 h-10"
          style={{
            background:
              'linear-gradient(to bottom, rgba(212,175,55,0), rgba(212,175,55,0.55), rgba(212,175,55,0))',
            animation: 'monetry-laser-sweep 1.6s ease-in-out infinite',
          }}
        />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#D4AF37]">
            Offline scan
          </p>
          <p className="mt-1 text-sm text-[#F5F5F5]">{progress.label}</p>
        </div>
        <p className="font-semibold tabular-nums text-2xl text-[#D4AF37]">{progress.percent}%</p>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#0A0A0A]">
        <div
          className="h-full rounded-full bg-[#D4AF37] transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <p className="mt-4 rounded-full border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] px-3 py-2 text-center text-[11px] text-[#D4AF37]">
        🔒 Processing on-device. Your bank data never leaves your phone.
      </p>
    </div>
  );
}
