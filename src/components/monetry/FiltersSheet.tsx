import type { FC } from 'react';
import { Bell, Moon, SlidersHorizontal, Volume2, X } from 'lucide-react';

export interface FiltersSheetProps {
  open: boolean;
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  soundEffectsEnabled: boolean;
  onToggleDarkMode: () => void;
  onToggleNotifications: () => void;
  onToggleSoundEffects: () => void;
  onOpenSubscriptions: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export const FiltersSheet: FC<FiltersSheetProps> = ({
  open,
  isDarkMode,
  notificationsEnabled,
  soundEffectsEnabled,
  onToggleDarkMode,
  onToggleNotifications,
  onToggleSoundEffects,
  onOpenSubscriptions,
  onOpenSettings,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="modal-sheet-enter relative w-full max-w-[430px] rounded-t-3xl border-t border-white/10 bg-[#131315] p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="chip-gold flex h-8 w-8 items-center justify-center rounded-xl">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-heading text-[15px] font-bold text-white">
                Quick Controls &amp; Filters
              </h3>
              <p className="text-[11px] text-white/45">
                Instant vault preferences and navigation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close controls"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onToggleNotifications}
            className="specular flex w-full items-center justify-between px-3.5 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 text-[#D4AF7C]" />
              <div>
                <p className="text-[13px] font-semibold text-white">
                  09:30 AM Payment &amp; Trial Alerts
                </p>
                <p className="text-[11px] text-white/45">
                  3-day and 1-day advance notifications
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                notificationsEnabled
                  ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border border-white/10 bg-white/[0.04] text-white/45'
              }`}
            >
              {notificationsEnabled ? 'Active' : 'Muted'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleSoundEffects}
            className="specular flex w-full items-center justify-between px-3.5 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <Volume2 className="h-4 w-4 text-[#D4AF7C]" />
              <div>
                <p className="text-[13px] font-semibold text-white">
                  Tactile Sound Effects
                </p>
                <p className="text-[11px] text-white/45">
                  Subtle audio cues on actions and savings
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                soundEffectsEnabled
                  ? 'border border-[#D4AF7C]/30 bg-[#211C14] text-[#D4AF7C]'
                  : 'border border-white/10 bg-white/[0.04] text-white/45'
              }`}
            >
              {soundEffectsEnabled ? 'On' : 'Off'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="specular flex w-full items-center justify-between px-3.5 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <Moon className="h-4 w-4 text-[#D4AF7C]" />
              <div>
                <p className="text-[13px] font-semibold text-white">
                  Midnight Black Theme
                </p>
                <p className="text-[11px] text-white/45">
                  Signature obsidian &amp; champagne finish
                </p>
              </div>
            </div>
            <span className="chip-gold rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold">
              {isDarkMode ? 'Midnight' : 'High Contrast'}
            </span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSubscriptions();
            }}
            className="rounded-full border border-white/10 bg-white/[0.04] py-2.5 text-[12px] font-semibold text-white transition hover:border-white/25"
          >
            Filter Subscriptions
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="btn-gold rounded-full py-2.5 text-[12px] font-semibold"
          >
            Vault Settings
          </button>
        </div>
      </div>
    </div>
  );
};
