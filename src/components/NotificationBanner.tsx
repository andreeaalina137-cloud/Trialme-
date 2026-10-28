import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { AppNotification } from '../types/subscription';
import { useTranslation } from '../i18n/LanguageContext';
import { GoldBellIcon } from './GoldBellIcon';

interface NotificationBannerProps {
  notification: AppNotification | null;
  onDismiss: () => void;
  onAction?: (notification: AppNotification) => void;
  onCancelTrial?: (notification: AppNotification) => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notification,
  onDismiss,
  onAction,
  onCancelTrial,
}) => {
  const { t } = useTranslation();
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => onDismissRef.current(), 8000);
    return () => window.clearTimeout(timer);
  }, [notification?.id]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center px-4 max-w-lg mx-auto">
      <AnimatePresence initial={false}>
        {notification && (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -28, scale: 0.92, transition: { duration: 0.18, ease: 'easeIn' } }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.8, bottom: 0.15 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -25 || info.velocity.y < -150) {
                onDismiss();
              }
            }}
            onClick={() => {
              if (onAction) onAction(notification);
              else onDismiss();
            }}
            className="pointer-events-auto w-full max-w-[400px] rounded-[22px] border border-white/[0.1] bg-[#161616]/95 p-3.5 text-[#F5F5F5] shadow-2xl shadow-black/80 backdrop-blur-2xl cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
            role="alert"
            aria-live="polite"
          >
            {/* Subtle Top Swipe Pill Indicator */}
            <div className="w-8 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-2.5 opacity-60 pointer-events-none" />

            <div className="flex items-start gap-2.5">
              {/* App Glyph Icon */}
              <div className="w-7 h-7 rounded-lg bg-[#D4AF7C]/15 border border-[#D4AF7C]/30 flex items-center justify-center shrink-0 mt-0.5">
                <GoldBellIcon size="xs" />
              </div>

              <div className="min-w-0 flex-1">
                {/* Header Row: App Name + Timestamp + Close */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#A0A0A0] uppercase tracking-wider">TrialMe</span>
                    <span className="text-[10px] text-[#A0A0A0]/50">·</span>
                    <span className="text-[11px] text-[#A0A0A0]">{t('notifications.now')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    className="rounded-full p-1 text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-white/10 active:scale-[0.95] transition-all cursor-pointer"
                    aria-label={t('notifications.dismiss')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Clean, Non-Noisy Notification Copy */}
                <div className="mt-1 text-xs font-bold text-[#F5F5F5] leading-snug">
                  {notification.title}
                </div>
                <p className="mt-0.5 text-xs text-[#A0A0A0] leading-snug line-clamp-2">
                  {notification.message}
                </p>

                {/* Compact Native Action Pills */}
                <div className="mt-2.5 flex items-center justify-end gap-2 pt-1 border-t border-white/[0.06]">
                  {onCancelTrial && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelTrial(notification);
                      }}
                      className="btn-cancel-soft py-1 px-3 text-[11px] font-semibold rounded-full active:scale-[0.97] transition-all cursor-pointer"
                    >
                      Cancel Trial
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAction) onAction(notification);
                      else onDismiss();
                    }}
                    className="btn-secondary-luxury py-1 px-3.5 text-[11px] font-bold text-[#D4AF7C] rounded-full active:scale-[0.97] transition-all cursor-pointer"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
