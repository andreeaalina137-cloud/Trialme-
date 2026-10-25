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
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96, transition: { duration: 0.2, ease: 'easeOut' } }}
            transition={{ duration: 0.28, ease: [0.2, 0.75, 0.25, 1] }}
            className="pointer-events-auto w-full max-w-[398px] rounded-3xl border border-[#D4AF7C]/30 bg-[#161616]/95 p-4 text-[#F5F5F5] shadow-2xl shadow-black/85 backdrop-blur-xl"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#1F1F1F]">
                <GoldBellIcon size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#F5F5F5]">TrialMe</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#A0A0A0]">{t('notifications.now')}</span>
                    <button
                      type="button"
                      onClick={onDismiss}
                      className="rounded-full p-0.5 text-[#A0A0A0] transition-colors hover:bg-white/10 hover:text-[#F5F5F5]"
                      aria-label={t('notifications.dismiss')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#D4AF7C]">{notification.title}</div>
                <p className="mt-0.5 text-xs leading-snug text-[#F5F5F5]/90">{notification.message}</p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onAction) onAction(notification);
                      else onDismiss();
                    }}
                    className="rounded-full border border-white/10 bg-[#1F1F1F] py-1.5 px-3 text-xs font-bold text-[#F5F5F5] hover:border-[#D4AF7C] transition-colors cursor-pointer"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onCancelTrial) onCancelTrial(notification);
                      else if (onAction) onAction(notification);
                      else onDismiss();
                    }}
                    className="rounded-full border border-rose-500/35 bg-rose-950/60 py-1.5 px-3 text-xs font-bold text-rose-200 hover:bg-rose-900/70 transition-colors cursor-pointer"
                  >
                    Cancel Trial
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
