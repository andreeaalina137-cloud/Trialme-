import type { Subscription } from '../types/subscription';
import { calculateTotalSavings } from './subscriptionCalculations';

export const ACHIEVEMENTS = [
  {
    id: 'first-cancellation',
    titleKey: 'home.achievementFirstTitle',
    detailKey: 'home.achievementFirstDetail',
  },
  {
    id: 'saved-50',
    titleKey: 'home.achievement50Title',
    detailKey: 'home.achievement50Detail',
  },
  {
    id: 'saved-100',
    titleKey: 'home.achievement100Title',
    detailKey: 'home.achievement100Detail',
  },
  {
    id: 'cancelled-5',
    titleKey: 'home.achievementFiveTitle',
    detailKey: 'home.achievementFiveDetail',
  },
  {
    id: 'subscription-slayer',
    titleKey: 'home.achievementTenTitle',
    detailKey: 'home.achievementTenDetail',
  },
] as const;

export function getUnlockedAchievementIds(subscriptions: Subscription[]): string[] {
  const cancelledCount = subscriptions.filter((subscription) => subscription.status === 'cancelled').length;
  const monthlySavings = calculateTotalSavings(subscriptions);

  return ACHIEVEMENTS.filter((achievement) => {
    switch (achievement.id) {
      case 'first-cancellation':
        return cancelledCount >= 1;
      case 'saved-50':
        return monthlySavings >= 50;
      case 'saved-100':
        return monthlySavings >= 100;
      case 'cancelled-5':
        return cancelledCount >= 5;
      case 'subscription-slayer':
        return cancelledCount >= 10;
      default:
        return false;
    }
  }).map((achievement) => achievement.id);
}