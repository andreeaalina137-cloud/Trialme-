import React from 'react';
import type { TabType } from './BottomNav';
import type { UserPlan } from '../types/subscription';

export type SidebarSection =
  | 'dashboard'
  | 'trials'
  | 'scanner'
  | 'subscriptions'
  | 'calendar'
  | 'reports'
  | 'settings';

interface MobileFrameWrapperProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
  currentTab?: TabType;
  activeSection?: SidebarSection;
  onSelectSection?: (section: SidebarSection) => void;
  activeTrialsCount?: number;
  onPreviewOnboarding?: () => void;
  onOpenAddModal?: () => void;
  onOpenPaywall?: () => void;
  userPlan?: UserPlan;
}

/**
 * 100% Mobile-First Native Android / iOS PWA Shell (Revolut / Cash App Tier)
 * - Full-width on mobile phones (edge-to-edge)
 * - Zero desktop sidebar or website clutter
 * - Deep clean black background (#0A0A0A)
 * - Viewport locked with smooth momentum scrolling
 */
export const MobileFrameWrapper: React.FC<MobileFrameWrapperProps> = ({
  children,
}) => {
  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#0A0A0A] text-[#F5F5F5] select-none flex justify-center">
      <div className="w-full max-w-lg h-[100dvh] bg-[#0A0A0A] relative flex flex-col overflow-hidden">
        <div className="flex-1 h-full overflow-y-auto overscroll-y-contain bg-[#0A0A0A] relative">
          {children}
        </div>
      </div>
    </div>
  );
};
