import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Lightbulb, TrendingUp, BellRing, ChevronRight } from 'lucide-react';
import type { Subscription } from '../types/subscription';
import { BrandIcon } from './BrandIcon';
import { getDaysUntilNextPayment, formatPrice } from '../utils/subscriptionCalculations';
import { formatTrialCountdownBadge } from '../utils/calendarReminder';
import { getUkPriceHikeAlert } from '../utils/retentionAndTrust';
import { useTranslation } from '../i18n/LanguageContext';
import { getAffiliateOffer } from '../data/cheaperAlternatives';

interface SubscriptionCardProps {
  subscription: Subscription;
  onClick: () => void;
  currencySymbol: string;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  subscription,
  onClick,
  currencySymbol,
}) => {
  const { t } = useTranslation();
  const daysRemaining = getDaysUntilNextPayment(subscription.nextPaymentDate);
  const isCancelled = subscription.status === 'cancelled';
  const isTrial = subscription.status === 'trial';
  const isUrgent = !isCancelled && daysRemaining <= 3 && daysRemaining >= 0;
  const affiliateOffer = getAffiliateOffer(subscription.name);
  const annualSaving = affiliateOffer?.annualDiscountRate
    ? subscription.price * 12 * affiliateOffer.annualDiscountRate
    : 0;
  const showAnnualTip =
    subscription.status === 'active' &&
    subscription.frequency === 'monthly' &&
    !!affiliateOffer?.annualUrl &&
    annualSaving > 0;
  const priceHikeAlert = subscription.status === 'active' ? getUkPriceHikeAlert(subscription.name) : null;
  const trialCountdownText = isTrial && !isCancelled ? formatTrialCountdownBadge(subscription) : null;

  const getFrequencySuffix = (freq: string) => {
    switch (freq) {
      case 'yearly':
        return '/year';
      case 'weekly':
        return '/week';
      case 'fortnightly':
        return '/fortnight';
      case 'quarterly':
        return '/quarter';
      case 'half-yearly':
        return '/half-year';
      case 'monthly':
      default:
        return '/month';
    }
  };

  const getDaysLeftLabel = () => {
    if (daysRemaining === 0) return 'Ends today';
    if (daysRemaining === 1) return '1 day left';
    if (daysRemaining > 1) return `${daysRemaining} days left`;
    return t('home.overdue');
  };

  const displayName = subscription.name
    .replace(' UK Standard', '')
    .replace(' Premium UK', '')
    .replace(' UK', '');

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={`w-full text-left rounded-2xl bg-[#141414] border border-white/[0.06] px-3.5 py-3 cursor-pointer group relative overflow-hidden select-none active:scale-[0.985] transition-all duration-150 ease-out hover:bg-[#19191B] hover:border-white/[0.12] ${
        isCancelled ? 'opacity-65 hover:opacity-95' : ''
      }`}
      aria-label={`Details for subscription ${subscription.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Service Brand Icon & Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <BrandIcon name={subscription.name} category={subscription.category} color={subscription.color} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-[14px] text-[#F5F5F5] tracking-tight leading-snug group-hover:text-[#D4AF7C] transition-colors">
                {displayName}
              </h3>
              <span className="sr-only">{subscription.name}</span>
              {isTrial && !isCancelled && (
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-[#D4AF7C]/12 text-[#D4AF7C] border border-[#D4AF7C]/20">
                  Trial
                </span>
              )}
              {isCancelled && (
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold tracking-wide bg-[#1F1F1F] text-[#A0A0A0] border border-white/[0.07]">
                  {t('home.cancelledBadge')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11.5px] text-[#A0A0A0] mt-0.5 leading-snug">
              <span className="truncate max-w-[120px]">{subscription.category}</span>
              <span aria-hidden="true" className="text-white/20">·</span>
              {!isCancelled ? (
                <span
                  className={`shrink-0 ${
                    isUrgent ? 'text-[#D4AF7C] font-semibold' : 'text-[#A0A0A0]'
                  }`}
                >
                  {getDaysLeftLabel()}
                </span>
              ) : (
                <span className="text-[#D4AF7C] flex items-center gap-1 font-medium text-[11.5px] shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('home.savedBadge')}
                </span>
              )}
            </div>

            {(showAnnualTip || priceHikeAlert || trialCountdownText) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {trialCountdownText && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D4AF7C]/20 bg-[#1B1B1E] px-2 py-0.5 text-[10px] font-medium text-[#D4AF7C]">
                    <BellRing className="h-2.5 w-2.5 shrink-0 text-[#D4AF7C]" />
                    <span className="truncate">{trialCountdownText}</span>
                  </span>
                )}
                {priceHikeAlert && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#D4AF7C]/20 bg-[#D4AF7C]/[0.08] px-2 py-0.5 text-[10px] font-medium text-[#E5C391]">
                    <TrendingUp className="h-2.5 w-2.5 shrink-0 text-[#D4AF7C]" />
                    <span>{priceHikeAlert.headline}</span>
                  </span>
                )}
                {showAnnualTip && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.06] bg-[#1B1B1E] px-2 py-0.5 text-[10px] font-medium text-[#F5F5F5]/80">
                    <Lightbulb className="h-2.5 w-2.5 shrink-0 text-[#D4AF7C]" />
                    <span className="truncate">
                      {t('affiliate.annualBadge', {
                        saving: formatPrice(annualSaving, subscription.currency || currencySymbol),
                      })}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Stacked Price & Interval + Subtle Chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right">
            <div
              className={`font-bold text-[14px] tracking-tight tabular-nums leading-tight transition-colors ${
                isCancelled ? 'line-through text-[#A0A0A0]' : 'text-[#F5F5F5] group-hover:text-[#D4AF7C]'
              }`}
            >
              {formatPrice(subscription.price, subscription.currency || currencySymbol)}
            </div>
            <div className="text-[10.5px] text-[#A0A0A0] font-normal leading-tight mt-0.5">
              {getFrequencySuffix(subscription.frequency)}
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#A0A0A0]/45 group-hover:text-[#D4AF7C] transition-colors shrink-0" />
        </div>
      </div>
    </motion.button>
  );
};
