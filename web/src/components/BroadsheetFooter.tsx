import React from 'react';
import { useApp } from '../context/AppContext';

export const BroadsheetFooter: React.FC = () => {
  const { language, setActiveTab, setIsSettingsOpen } = useApp();
  const isBn = language === 'bn';

  const scrollToTop = (e: React.MouseEvent) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      className="w-full border-t-2 border-primary bg-surface-container mt-12 mb-20 md:mb-12"
      aria-label={isBn ? 'সাইট ফুটার' : 'Site footer'}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col">
        {/* Upper Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-primary/20">
          {/* Brand & Description */}
          <div className="md:col-span-5">
            <span className="font-display-masthead text-2xl sm:text-3xl tracking-tight text-primary uppercase font-bold">
              {isBn ? 'সন্দেশ এক্সপ্রেস' : 'SONDESH EXPRESS'}
            </span>
            <div className="mt-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
              {isBn ? 'বাংলাদেশ নিউজ নেটওয়ার্ক • স্বাধীন সংবাদ সংকলন' : 'BANGLADESH NEWS WIRE • INDEPENDENT DIGITAL GAZETTE'}
            </div>
            <p className="font-serif text-sm text-on-surface-variant mt-2 max-w-md leading-relaxed">
              {isBn
                ? 'প্রতিষ্ঠিত ১ নভেম্বর ২০২৬। আপনার সময়ের মর্যাদা দিয়ে শীর্ষ সংবাদমাধ্যম থেকে যাচাইকৃত ও কিউরেট করা প্রয়োজনীয় সংবাদের সারসংক্ষেপ।'
                : "Established 1 November 2026. Sondesh Express reads Bangladesh's leading news outlets every hour and writes short summaries with AI. Each summary is checked against the original reports and links to them."}
            </p>
            <div className="mt-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 font-semibold text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block animate-pulse"></span>
                {isBn ? 'এআই চালিত সার্বক্ষণিক সংবাদ নিরীক্ষণ' : 'AI-Powered Continuous News Synthesis'}
              </span>
              <span>•</span>
              <span>{isBn ? 'স্বয়ংক্রিয় ফ্যাক্ট-চেক ও সোর্স যাচাই' : 'Automated Verification & Analysis'}</span>
              <span>•</span>
              <span className="font-semibold text-primary">{isBn ? 'কারেন্ট অ্যাফেয়ার্স: মানবীয় সম্পাদকীয় তত্ত্বাবধান' : 'Current Affairs: Human Editorial Management'}</span>
            </div>
          </div>

          {/* Links Column 1: Editorial Directory */}
          <div className="md:col-span-4">
            <h4 className="font-serif text-base font-bold text-primary mb-3 uppercase tracking-wide">
              {isBn ? 'খবর ও বিভাগসমূহ' : 'News & Sections'}
            </h4>
            <div className="grid grid-cols-2 gap-2 font-label-sm text-label-sm uppercase">
              <button 
                onClick={() => { setActiveTab('top_stories'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'শীর্ষ সংবাদ' : 'Top Stories'}
              </button>
              <button 
                onClick={() => { setActiveTab('discover'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'সর্বশেষ খবর' : 'Latest News'}
              </button>
              <button 
                onClick={() => { setActiveTab('current_affairs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'কারেন্ট অ্যাফেয়ার্স' : 'Current Affairs'}
              </button>
              <button 
                onClick={() => { setActiveTab('discover'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'যাচাইকৃত সূত্র' : 'Verified Sources'}
              </button>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'সম্পাদকীয় প্যানেল' : 'Masthead Directory'}
              </button>
            </div>
          </div>

          {/* Links Column 2: Legal & Protocol */}
          <div className="md:col-span-3">
            <h4 className="font-serif text-base font-bold text-primary mb-3 uppercase tracking-wide">
              {isBn ? 'প্রেস ও আইনি প্রটোকল' : 'Press & Legal Protocols'}
            </h4>
            <div className="flex flex-col space-y-2 font-label-sm text-label-sm uppercase">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'ব্যবহারের শর্তাবলী' : 'Terms of Service'}
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'গোপনীয়তা নীতি' : 'Privacy Policy'}
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'সম্পাদকীয় নীতিমালা ও উৎস যাচাই' : 'Editorial Ethics & Source Standards'}
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-left text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                {isBn ? 'সংশোধন ও ফ্যাক্ট-চেক প্রটোকল' : 'Corrections & Fact-Checking'}
              </button>
            </div>
          </div>
        </div>

        {/* Lower Footer Copyright & Disclaimer */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-on-surface-variant font-serif text-xs sm:text-sm">
          <p>
            &copy; 2026 Sondesh Express (Bangladesh News Wire). Established 1 November 2026. All editorial summary rights reserved.
          </p>
          <div className="mt-3 sm:mt-0 flex items-center space-x-4 font-label-sm text-label-sm uppercase">
            <span className="text-outline-variant hidden sm:inline">
              {isBn ? 'বাংলাদেশের কিউরেটেড ডিজিটাল সংবাদপত্র' : 'Bangladesh Curated Digital Broadsheet'}
            </span>
            <button
              onClick={scrollToTop}
              className="text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>{isBn ? 'শীর্ষে ফিরে যান' : 'Back to Top'}</span>
              <span>&uarr;</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
