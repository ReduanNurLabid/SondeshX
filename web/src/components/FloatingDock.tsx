import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { Compass, Flame, BookOpen } from 'lucide-react';

/**
 * Mobile section bar: a full-width strip pinned to the bottom of the screen, in the same
 * paper-and-ink look as the masthead. Every tab keeps its icon and a short label, the
 * active one is marked with an ink bar on top, and it sits above the phone's gesture bar.
 * Hidden from md up, where the masthead navigation is used.
 */
export const FloatingDock: React.FC = () => {
  const { activeTab, setActiveTab, language } = useApp();
  const isBn = language === 'bn';

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'top_stories', label: isBn ? 'শীর্ষ খবর' : 'Top', icon: <Flame className="w-5 h-5" strokeWidth={2} /> },
    { id: 'current_affairs', label: isBn ? 'কারেন্ট অ্যাফেয়ার্স' : 'Affairs', icon: <BookOpen className="w-5 h-5" strokeWidth={2} /> },
    { id: 'discover', label: isBn ? 'সব খবর' : 'All news', icon: <Compass className="w-5 h-5" strokeWidth={2} /> },
  ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur-md border-t-2 border-primary shadow-[0_-6px_18px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={isBn ? 'বিভাগ' : 'Sections'}
    >
      <div className="grid grid-cols-3">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[58px] px-1 pt-1.5 pb-1 transition-colors cursor-pointer ${
                isActive ? 'text-primary' : 'text-on-surface-variant active:text-primary'
              }`}
            >
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b bg-primary transition-all ${
                  isActive ? 'w-10 opacity-100' : 'w-0 opacity-0'
                }`}
              />
              {item.icon}
              <span className={`text-[11px] leading-tight whitespace-nowrap ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
