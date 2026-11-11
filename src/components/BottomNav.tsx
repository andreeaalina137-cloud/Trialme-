import React from 'react';
import { Home, PlusSquare, ScanLine, LayoutGrid, User } from 'lucide-react';

export type TabType = 'home' | 'add' | 'scan' | 'subscriptions' | 'calendar' | 'reports' | 'settings';

interface BottomNavProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  activeCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onChangeTab,
  activeCount,
}) => {
  const tabs: Array<{
    id: TabType;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'add', label: 'Add Trial', icon: PlusSquare },
    { id: 'scan', label: 'Scan', icon: ScanLine },
    { id: 'subscriptions', label: 'Subscriptions', icon: LayoutGrid, badge: activeCount },
    { id: 'settings', label: 'Profile', icon: User },
  ];

  const isTabActive = (tabId: TabType) => {
    if (tabId === 'home') {
      return currentTab === 'home' || currentTab === 'calendar' || currentTab === 'reports';
    }
    return currentTab === tabId;
  };

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 inset-x-0 z-40 select-none flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-3xl h-16 pb-safe px-2 backdrop-blur-2xl bg-[#0A0A0A]/92 border-t border-white/[0.06] grid grid-cols-5 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl active:scale-[0.95] transition-all duration-150 ease-out cursor-pointer relative group ${
                active
                  ? 'text-[#D4AF7C]'
                  : 'text-white/45 hover:text-white/85'
              }`}
            >
              {active && (
                <span className="absolute -top-1.5 h-0.5 w-6 rounded-full bg-gradient-to-r from-transparent via-[#D4AF7C] to-transparent" />
              )}
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-[18px] h-[18px] transition-all duration-150 ${
                    active ? 'text-[#D4AF7C] stroke-[2.25]' : 'text-white/45 stroke-[1.75] group-hover:text-white/85'
                  }`}
                />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[15px] px-1 rounded-full bg-[#211C14] border border-[#D4AF7C]/35 text-[#D4AF7C] font-mono font-bold text-[9px] flex items-center justify-center shadow-sm tabular-nums">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10.5px] leading-tight tracking-tight transition-all duration-150 ${
                  active ? 'font-semibold text-[#D4AF7C]' : 'font-medium text-white/45 group-hover:text-white/85'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
