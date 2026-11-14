import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Settings as SettingsIcon, 
  Languages, 
  Type,
  Check, 
  Sparkles,
  Sliders,
  ShieldCheck
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    language,
    setLanguage,
    isSerif,
    setIsSerif,
    fontSize,
    setFontSize,
    t,
  } = useApp();

  if (!isSettingsOpen) return null;

  const isBn = language === 'bn';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#141414]/70 backdrop-blur-sm animate-fadeIn"
      onClick={() => setIsSettingsOpen(false)}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-surface border-2 border-primary shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col font-serif"
      >
        {/* Top Registration Mark / Header Bar */}
        <div className="flex items-center justify-between border-b border-primary/20 px-4 py-1.5 font-sans text-[10px] tracking-wider uppercase text-on-surface-variant bg-surface-container-high">
          <span>{isBn ? 'সন্দেশ এক্সপ্রেস • কনফিগারেশন রেজিস্ট্রি' : 'SONDESH EXPRESS • PROTOCOL REGISTRY'}</span>
          <span>{isBn ? 'সংস্করণ ২.৪' : 'REV. 2.4-WEB'}</span>
        </div>

        {/* Modal Masthead Header */}
        <header className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-primary bg-surface-container">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-primary tracking-tight">
                {isBn ? 'রিডিং সেটিংস ও প্রটোকল' : 'Reading Preferences & Protocols'}
              </h3>
              <p className="font-sans text-xs text-on-surface-variant">
                {isBn ? 'ব্যক্তিগত পাঠ্যাভ্যাস এবং ইন্টারফেস নিয়ন্ত্রণ' : 'Interface preferences and typography controls'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(false);
            }}
            className="w-8 h-8 rounded-full border-2 border-primary hover:bg-primary hover:text-background flex items-center justify-center text-primary transition-colors cursor-pointer"
            title={isBn ? 'বন্ধ করুন' : 'Close Settings'}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6 bg-surface">
          {/* Section: Language Preference */}
          <div>
            <div className="flex items-center space-x-2 border-b border-primary/20 pb-1.5 mb-3">
              <Languages className="w-4 h-4 text-secondary" />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-primary">
                {isBn ? 'ভাষা নির্বাচন' : 'Language Selection'}
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 font-sans">
              <button
                onClick={() => setLanguage('en')}
                className={`p-3 border text-xs sm:text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-primary text-background border-primary shadow-sm'
                    : 'bg-surface-container-low border-outline-variant hover:border-primary text-primary'
                }`}
              >
                <div>
                  <span className="block font-bold">English (UK/US)</span>
                  <span className={`text-[11px] block mt-0.5 ${language === 'en' ? 'text-inverse-primary' : 'text-on-surface-variant'}`}>
                    English Edition
                  </span>
                </div>
                {language === 'en' && <Check className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setLanguage('bn')}
                className={`p-3 border text-xs sm:text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  language === 'bn'
                    ? 'bg-primary text-background border-primary shadow-sm'
                    : 'bg-surface-container-low border-outline-variant hover:border-primary text-primary'
                }`}
              >
                <div>
                  <span className="block font-bold font-bangla">বাংলা (Bengali)</span>
                  <span className={`text-[11px] block mt-0.5 ${language === 'bn' ? 'text-inverse-primary' : 'text-on-surface-variant'}`}>
                    জাতীয় ও আন্তর্জাতিক সংবাদ
                  </span>
                </div>
                {language === 'bn' && <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Section: Typography Font Size */}
          <div>
            <div className="flex items-center space-x-2 border-b border-primary/20 pb-1.5 mb-3">
              <Type className="w-4 h-4 text-secondary" />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-primary">
                {isBn ? 'ফন্ট সাইজ ও টাইপোগ্রাফি' : 'Typography Scale & Font Size'}
              </h4>
            </div>

            <div className="p-3.5 bg-surface-container-low border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-sans text-xs font-bold text-primary block">
                  {isBn ? 'নিবন্ধ পাঠের টেক্সট সাইজ' : 'Reading Text Scale'}
                </span>
                <span className="font-sans text-[11px] text-on-surface-variant">
                  {isBn ? 'ব্রডশিট কলাম ও ডসিয়ারের লেখার আকার সমন্বয় করুন' : 'Scale body font size for long-form comfort'}
                </span>
              </div>

              <div className="flex items-center space-x-1.5 font-sans">
                {[
                  { sz: 'sm' as const, label: 'A-', desc: isBn ? 'ছোট' : 'Compact' },
                  { sz: 'base' as const, label: 'A', desc: isBn ? 'আদর্শ' : 'Regular' },
                  { sz: 'lg' as const, label: 'A+', desc: isBn ? 'বড়' : 'Large' },
                ].map((item) => (
                  <button
                    key={item.sz}
                    onClick={() => setFontSize(item.sz)}
                    className={`px-3 py-1.5 border text-xs font-bold transition-colors cursor-pointer ${
                      fontSize === item.sz
                        ? 'bg-primary text-background border-primary'
                        : 'bg-surface border-outline-variant hover:border-primary text-primary'
                    }`}
                    title={item.desc}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>


          {/* Masthead Colophon */}
          <div className="p-4 bg-surface-container border border-primary/20 text-xs space-y-1.5">
            <div className="flex items-center space-x-2 text-primary font-bold font-sans text-[11px] uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              <span>Sondesh Express Autonomous Intelligence</span>
            </div>
            <p className="font-serif text-xs text-on-surface-variant leading-relaxed">
              Summaries are written by AI from reports by Bangladesh's leading news outlets, then automatically checked against those reports. Every story links to its sources.
            </p>
            <div className="flex items-center space-x-2 font-sans text-[10px] uppercase text-outline pt-1">
              <span>Established 1 November 2026</span>
              <span>•</span>
              <span>Broadsheet Ink Edition</span>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <footer className="px-5 sm:px-6 py-3 border-t-2 border-primary bg-surface-container flex items-center justify-between font-sans text-xs">
          <span className="text-on-surface-variant">
            {isBn ? 'পরিবর্তনগুলো তাৎক্ষণিকভাবে সংরক্ষিত হয়' : 'Preferences persist in your local browser'}
          </span>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="px-4 py-1.5 bg-primary text-background font-sans text-xs font-bold uppercase tracking-wider hover:bg-surface-container-highest hover:text-primary transition-colors border border-primary cursor-pointer"
          >
            {isBn ? 'সম্পন্ন' : 'Done'}
          </button>
        </footer>
      </div>
    </div>
  );
};
