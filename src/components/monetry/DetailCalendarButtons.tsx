import type { FC } from 'react';
import { Calendar, Download } from 'lucide-react';

export interface DetailCalendarButtonsProps {
  googleCalendarUrl: string | null;
  onDownloadIcs: () => void;
  disabled?: boolean;
}

export const DetailCalendarButtons: FC<DetailCalendarButtonsProps> = ({
  googleCalendarUrl,
  onDownloadIcs,
  disabled = false,
}) => {
  return (
    <div>
      <p className="eyebrow mb-2">Calendar sync</p>
      <div className="grid grid-cols-2 gap-2">
        {googleCalendarUrl && !disabled ? (
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="specular flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11.5px] font-semibold text-white transition hover:border-[#D4AF7C]/40"
          >
            <Calendar className="h-3.5 w-3.5 text-[#D4AF7C]" />
            1-Tap Google Calendar
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="specular flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11.5px] font-semibold text-white/35 opacity-60"
          >
            <Calendar className="h-3.5 w-3.5 text-white/35" />
            1-Tap Google Calendar
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={onDownloadIcs}
          className="specular flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11.5px] font-semibold text-white transition hover:border-[#D4AF7C]/40 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5 text-[#D4AF7C]" />
          Phone Calendar (.ics)
        </button>
      </div>
    </div>
  );
};
