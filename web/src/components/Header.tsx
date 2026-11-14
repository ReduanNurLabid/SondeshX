import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { fetchDseMarketData, StockMarketData } from '../services/stockService';
import { 
  Settings as SettingsIcon,
  Flame,
  BookOpen,
  Compass,
  Bookmark,
  Search,
  Check,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { toBanglaDigits } from '../utils/bilingual';

export const Header: React.FC = () => {
  const {
    language,
    toggleLanguage,
    activeTab,
    setActiveTab,
    setIsSettingsOpen,
    searchQuery,
    setSearchQuery,
  } = useApp();

  const [stockData, setStockData] = useState<StockMarketData | null>(null);
  const isBn = language === 'bn';

  useEffect(() => {
    fetchDseMarketData().then((data) => {
      if (data) setStockData(data);
    });
  }, []);

  const formatStockNum = (num: number, decimals: number = 2) => {
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return isBn ? toBanglaDigits(formatted) : formatted;
  };

  // Format today's date in broadsheet format
  const today = new Date();
  const dateFormatted = isBn 
    ? toBanglaDigits(today.toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    : today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const navItems: { id: TabType; labelEn: string; labelBn: string; icon: React.ReactNode; isGold?: boolean }[] = [
    {
      id: 'top_stories',
      labelEn: 'Top Stories',
      labelBn: 'শীর্ষ সংবাদ',
      icon: <Flame className="w-3.5 h-3.5" />,
    },
    {
      id: 'current_affairs',
      labelEn: 'Current Affairs',
      labelBn: 'কারেন্ট অ্যাফেয়ার্স',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      isGold: true,
    },
    {
      id: 'discover',
      labelEn: 'All News',
      labelBn: 'সকল সংবাদ',
      icon: <Compass className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header
      className="w-full bg-background border-b border-primary/20 transition-colors"
      aria-label={isBn ? 'সন্দেশ এক্সপ্রেস — মূল নেভিগেশন' : 'Sondesh Express — Main site header'}
    >
      {/* 1. TOP BROADSHEET UTILITY RIBBON */}
      <div className="w-full border-b border-primary/20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <span className="flex items-center gap-1 font-semibold text-primary">
              <span className="text-secondary font-mono">●</span>
              {isBn ? 'বাংলাদেশ' : 'Bangladesh'}
            </span>
            <span className="text-outline-variant">|</span>
            <span className="hidden xs:inline">Vol. XLIV No. 1,482</span>
            <span className="text-outline-variant hidden sm:inline">|</span>
            <span className="hidden sm:inline font-medium text-on-surface">
              {isBn ? `সংবাদ সারসংক্ষেপ • ${dateFormatted} • লাইভ` : `Curated News Briefing • ${dateFormatted} • Live`}
            </span>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            <span className="text-secondary font-semibold hidden md:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary inline-block animate-pulse"></span>
              {isBn ? 'বাংলাদেশ সংবাদ ও নির্বাহী ব্রিফিং' : 'BANGLADESH NEWS & EXECUTIVE BRIEFINGS'}
            </span>
            <span className="text-outline-variant hidden md:inline">|</span>

            {/* Bilingual Switcher */}
            <button
              onClick={toggleLanguage}
              className="flex items-center bg-surface-container border border-outline-variant rounded px-2 py-0.5 hover:border-primary transition-all font-bold text-label-sm cursor-pointer"
              title="Toggle English / বাংলা"
            >
              <span className={!isBn ? 'text-secondary font-bold' : 'text-on-surface-variant'}>EN</span>
              <span className="mx-1 text-outline-variant">/</span>
              <span className={isBn ? 'text-secondary font-bold' : 'text-on-surface-variant'}>বাং</span>
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              title={isBn ? 'সেটিংস' : 'Settings'}
              aria-label={isBn ? 'সেটিংস খুলুন' : 'Open settings'}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. GRAND BROADSHEET MASTHEAD */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center relative border-b border-primary/20 pb-4 sm:pb-5">
          {/* Left Financial Register (Desktop) */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 hidden xl:flex flex-col text-left font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant leading-tight space-y-0.5">
            <span className="font-bold text-primary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              {isBn ? 'ডিএসই স্টক রেজিস্টার' : 'DSE STOCK REGISTER'}
            </span>
            {stockData?.indices?.DSEX && (
              <span className="flex items-center gap-1 font-mono">
                <span>DSEX: {formatStockNum(stockData.indices.DSEX.close)}</span>
                <span className={stockData.indices.DSEX.change >= 0 ? 'text-secondary font-bold' : 'text-red-600 font-bold'}>
                  ({stockData.indices.DSEX.change >= 0 ? '+' : ''}{formatStockNum(stockData.indices.DSEX.change_percent)}%)
                </span>
              </span>
            )}
            {stockData?.indices?.DS30 && (
              <span className="flex items-center gap-1 font-mono">
                <span>DS30: {formatStockNum(stockData.indices.DS30.close)}</span>
                <span className={stockData.indices.DS30.change >= 0 ? 'text-secondary font-bold' : 'text-red-600 font-bold'}>
                  ({stockData.indices.DS30.change >= 0 ? '+' : ''}{formatStockNum(stockData.indices.DS30.change_percent)}%)
                </span>
              </span>
            )}
            {stockData?.breadth && (
              <span className="font-mono">
                {isBn 
                  ? `লেনদেন: ৳${toBanglaDigits(Math.round(stockData.breadth.total_value_mn || 5026))} কোটি`
                  : `TURNOVER: ৳${Math.round(stockData.breadth.total_value_mn || 5026).toLocaleString()}M`}
              </span>
            )}
          </div>

          {/* Central Logo & Grand Logotype */}
          <div 
            onClick={() => setActiveTab('top_stories')}
            className="flex flex-col items-center cursor-pointer group"
          >
            <h1 className="font-display-masthead text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight text-primary uppercase text-center group-hover:text-secondary transition-colors mb-1">
              {isBn ? 'সন্দেশ এক্সপ্রেস' : 'SONDESH EXPRESS'}
            </h1>
            <p className="font-headline-sm text-headline-sm italic text-on-surface-variant text-center max-w-2xl mt-0.5">
              {isBn 
                ? 'সংবাদের অপ্রয়োজনীয় বাহুল্য বর্জন — বাংলাদেশ ও বিশ্বের মূল খবরের কিউরেট করা সারসংক্ষেপ' 
                : 'What happened in Bangladesh and the world, in a minute. Written by AI, checked against the original reports.'}
            </p>
          </div>

          {/* Right Telemetry Badge (Desktop) */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden xl:flex flex-col text-right font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant leading-tight space-y-0.5">
            <span className="font-bold text-secondary flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              {isBn ? 'স্ট্রাকচার্ড ব্রিফিং' : 'STRUCTURED BRIEFINGS'}
            </span>
            <span>{isBn ? 'ফরম্যাট: ৩-স্তরীয় ব্রিফিং' : 'FORMAT: 3-TIER INTELLIGENCE'}</span>
            <span>{isBn ? 'সংস্করণ: ডিজিটাল ব্রডশিট' : 'EDITION: DIGITAL BROADSHEET'}</span>
            <span>{isBn ? 'যাচাই: মূল প্রতিবেদনের সঙ্গে মিলিয়ে' : 'CHECKED AGAINST SOURCE REPORTS'}</span>
          </div>
        </div>

        {/* 3. BROADSHEET NAVIGATION BAR STRIP */}
        <nav
          className="flex items-center justify-between pt-2.5 overflow-x-auto no-scrollbar border-b-2 border-primary"
          aria-label={isBn ? 'প্রধান বিভাগ নেভিগেশন' : 'Main section navigation'}
        >
          <div className="flex items-center space-x-6 sm:space-x-8">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-2 font-label-md text-label-md uppercase tracking-wider font-semibold whitespace-nowrap transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-on-surface-variant hover:text-primary hover:border-primary/40'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{isBn ? item.labelBn : item.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Inline Briefing Search & Actions */}
          <div className="hidden lg:flex items-center space-x-3 pb-1">
            <div className="flex items-center border border-outline-variant px-2.5 py-1 bg-surface-container-lowest">
              <Search className="w-3.5 h-3.5 text-outline mr-2" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveTab('discover');
                  }
                }}
                placeholder={isBn ? 'সংবাদ অনুসন্ধান...' : 'Search briefing keys...'}
                className="bg-transparent border-none text-primary text-xs placeholder:text-outline focus:outline-none w-36 sm:w-44 p-0 font-serif"
              />
            </div>
            <button 
              onClick={() => {
                if (activeTab !== 'top_stories') {
                  setActiveTab('top_stories');
                }
                setTimeout(() => {
                  const el = document.getElementById('subscribe');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="bg-primary text-background font-label-md text-label-md uppercase px-3 py-1.5 hover:bg-surface-container-highest hover:text-primary transition-colors border border-primary font-semibold cursor-pointer"
              aria-label={isBn ? 'নিউজলেটার সদস্যপদ গ্রহণ করুন' : 'Subscribe to our newsletter'}
            >
              {isBn ? 'সদস্যপদ' : 'Subscribe'}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};
