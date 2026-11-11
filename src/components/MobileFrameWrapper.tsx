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
    <div className="min-h-[100dvh] h-[100dvh] w-full overflow-hidden bg-[#070708] text-[#F5F5F5] select-none flex justify-center">
      <div className="w-full max-w-2xl h-full bg-[#0B0B0C] relative flex flex-col overflow-hidden sm:border-x sm:border-white/[0.06] sm:shadow-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-[600px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(213,184,134,0.08) 0%, transparent 68%)',
          }}
        />
        <div className="flex-1 h-full overflow-y-auto overscroll-y-contain bg-[#0B0B0C] relative no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
