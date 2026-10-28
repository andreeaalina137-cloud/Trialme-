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
      className="fixed bottom-0 inset-x-0 max-w-lg mx-auto h-20 pb-safe backdrop-blur-2xl bg-[#0A0A0A]/95 border-t border-white/[0.06] z-40 select-none flex items-center justify-around"
    >
      <div className="w-full px-2 h-full grid grid-cols-5 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-2xl active:scale-[0.92] transition-all duration-180 ease-out cursor-pointer relative group ${
                active
                  ? 'text-[#D4AF7C]'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5]'
              }`}
            >
              <div className={`relative flex items-center justify-center px-3 py-1 rounded-full transition-all duration-200 ${
                active ? 'bg-[#D4AF7C]/12 border border-[#D4AF7C]/20 shadow-sm' : 'bg-transparent border border-transparent'
              }`}>
                <Icon
                  className={`w-5 h-5 transition-all duration-200 ${
                    active ? 'text-[#D4AF7C] scale-105 stroke-[2.4]' : 'text-[#A0A0A0] stroke-[1.9] group-hover:text-[#F5F5F5]'
                  }`}
                />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-black text-[9px] flex items-center justify-center shadow">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] leading-tight tracking-tight transition-all duration-200 ${
                  active ? 'font-extrabold text-[#D4AF7C]' : 'font-medium text-[#A0A0A0] group-hover:text-[#F5F5F5]'
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
