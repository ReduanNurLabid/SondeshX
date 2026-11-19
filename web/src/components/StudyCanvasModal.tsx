import React, { useState, useEffect } from 'react';
import { storyPath } from '../utils/seo';
import { useApp } from '../context/AppContext';
import { StoryLink } from './StoryLink';
import { 
  getLocalizedCategory, 
  formatRelativeTime, 
  toBanglaDigits 
} from '../utils/bilingual';
import confetti from 'canvas-confetti';
import { Lightbulb, CheckCircle2, Share2 } from 'lucide-react';

export const StudyCanvasModal: React.FC = () => {
  const {
    activeStory,
    closeStory,
    language,
    isSerif,
    setIsSerif,
    fontSize,
    setFontSize,
    getVoteCount,
    hasVoted,
    toggleVote,
    allStories,
  } = useApp();

  const [copied, setCopied] = useState(false);

  // Five other recent stories: same section first, then the latest overall.
  const moreStories = React.useMemo(() => {
    if (!activeStory) return [];
    const others = allStories
      .filter((s) => s.story_id !== activeStory.story_id && s.daily_buzz?.title_bn)
      .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
    const same = others.filter((s) => s.primary_category === activeStory.primary_category);
    const rest = others.filter((s) => s.primary_category !== activeStory.primary_category);
    return [...same.slice(0, 3), ...rest].slice(0, 5);
  }, [activeStory, allStories]);

  // Opening another story from "More news" starts it from the top.
  useEffect(() => {
    document.getElementById('article-intelligence-dossier')?.scrollTo(0, 0);
  }, [activeStory?.story_id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStory();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeStory]);

  if (!activeStory) return null;

  const isBn = language === 'bn';
  const buzz = activeStory.daily_buzz;
  const bcs = activeStory.bcs_pro;


  const headline = isBn
    ? (buzz.title_bn || buzz.title_en)
    : (buzz.title_en || buzz.title_bn);

  const lead = isBn
    ? (buzz.lead_bn || buzz.summary_bn || buzz.lead_en)
    : (buzz.lead_en || buzz.summary_en || buzz.lead_bn);

  const rawBullets = isBn
    ? (buzz.bullets_bn && buzz.bullets_bn.length > 0 ? buzz.bullets_bn : [buzz.summary_bn])
    : (buzz.bullets_en && buzz.bullets_en.length > 0 ? buzz.bullets_en : [buzz.summary_en]);

  const cleanText = (str?: string) => {
    if (!str) return '';
    return str
      .replace(/^\s*[*_\-•\d.)]+\s*/, '')
      .replace(/\s*[*_]+\s*$/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim();
  };

  const bullets = rawBullets.map(b => cleanText(b)).filter(Boolean);

  const whyItMatters = cleanText(
    isBn
      ? (buzz.why_it_matters_bn || buzz.impact_bn || '')
      : (buzz.why_it_matters_en || buzz.impact_en || '')
  );

  const coreStory = cleanText(
    isBn
      ? (buzz.details_bn || buzz.summary_bn)
      : (buzz.details_en || buzz.summary_en)
  );

  const categoryLabel = getLocalizedCategory(activeStory.primary_category, isBn);
  const timeFormatted = formatRelativeTime(activeStory.published_at, isBn);


  const handleShare = async () => {
    if (!activeStory) return;
    const permalink = window.location.origin + storyPath(activeStory.story_id);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(permalink);
      }
    } catch {}

    if (navigator.share) {
      try {
        await navigator.share({
          title: headline,
          text: whyItMatters || headline,
          url: permalink,
        });
      } catch {}
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVoteInformative = () => {
    if (!activeStory) return;
    if (!hasVoted(activeStory.story_id, 'informative')) {
      try {
        confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
      } catch {}
    }
    toggleVote(activeStory.story_id, 'informative');
  };

  const handleVoteImportant = () => {
    if (!activeStory) return;
    if (!hasVoted(activeStory.story_id, 'important')) {
      try {
        confetti({ particleCount: 40, spread: 70, origin: { y: 0.8 } });
      } catch {}
    }
    toggleVote(activeStory.story_id, 'important');
  };

  const cycleFontSize = () => {
    if (fontSize === 'sm') setFontSize('base');
    else if (fontSize === 'base') setFontSize('lg');
    else setFontSize('sm');
  };

  const textBodySize =
    fontSize === 'sm' ? 'text-sm sm:text-base leading-relaxed' :
    fontSize === 'lg' ? 'text-lg sm:text-xl leading-loose' :
    'text-base sm:text-lg leading-relaxed';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-8 overflow-y-auto backdrop-blur-md bg-[#21201D]/75 animate-fadeIn paper-texture"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeStory();
        }
      }}
    >
      {/* BEGIN: ArticleReadingSheetModal */}
      <main 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-paper border-2 border-ink shadow-2xl relative my-auto p-4 sm:p-7 md:p-10 transition-all duration-200 text-ink font-serif max-h-[92vh] overflow-y-auto custom-scroll" 
        data-purpose="broadsheet-modal-container" 
        id="article-intelligence-dossier"
      >

        {/* BEGIN: ModalControlBar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-4 mb-6" data-purpose="top-navigation-strip">
          {/* Back to Broadsheet Trigger */}
          <button 
            onClick={closeStory}
            className="inline-flex items-center gap-2 font-serif text-sm font-semibold tracking-wide text-ink hover:text-accent-emerald hover:underline transition-colors px-2 py-1 rounded focus:outline-none cursor-pointer" 
            data-purpose="back-navigation-button" 
            type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
            <span>{isBn ? 'প্রথম পাতায় ফিরুন' : 'Back to front page'}</span>
          </button>

          {/* Center Classified Department Capsule */}
          <div className="border border-ink px-3 py-1 font-sans text-[10px] md:text-xs font-bold tracking-[0.18em] uppercase bg-paper-box text-ink shadow-[1px_1px_0px_#141414]" data-purpose="department-capsule-badge">
            {categoryLabel}
          </div>

          {/* Right Action Utilities (Audio, Text Resizer, Bookmark, Close) */}
          <div className="flex items-center space-x-1 sm:space-x-2" data-purpose="reader-actions">
            {/* Typography Font Size Toggle */}
            <button 
              onClick={cycleFontSize}
              aria-label="Adjust font size" 
              className="w-8 h-8 rounded-full border border-ink/50 hover:border-ink hover:bg-paper-dim flex items-center justify-center font-serif text-sm font-bold text-ink transition-colors cursor-pointer" 
              title={isBn ? `ফন্ট সাইজ (${fontSize})` : `Adjust Font Size (${fontSize})`}
            >
              Aa
            </button>

            {/* Dismiss Modal Button */}
            <button 
              onClick={closeStory}
              aria-label="Close modal dialog" 
              className="w-8 h-8 rounded-full border-2 border-ink hover:bg-ink hover:text-paper flex items-center justify-center text-ink transition-colors ml-1 cursor-pointer" 
              title={isBn ? 'বন্ধ করুন' : 'Close'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </button>
          </div>
        </header>
        {/* END: ModalControlBar */}

        {/* BEGIN: ArticleHeadlineAndMeta */}
        <article className="space-y-6" data-purpose="editorial-article-body">
          <div className="border-b border-ink/20 pb-4">
            {/* Source and Timestamp */}
            <div className="font-sans text-xs uppercase tracking-wider text-ink-faint font-semibold mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{timeFormatted}</span>
              <span className="text-ink/30">•</span>
              <span className="text-ink font-bold">
                {activeStory.sources.length > 0 ? activeStory.sources[0].name : (isBn ? 'সন্দেশ এক্সপ্রেস' : 'Sondesh Express')}
              </span>
              <span className="text-ink/30">•</span>
              <span>{isBn ? 'এআই সারাংশ • সূত্রের সঙ্গে মিলিয়ে দেখা' : 'AI summary • checked against sources'}</span>
            </div>

            {/* Big Broadsheet Display Headline */}
            <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-extrabold text-ink leading-tight tracking-tight mt-1 mb-2">
              {headline}
            </h1>

            {/* Sub-lead sentence */}
            {lead && (
              <p className="font-serif text-lg md:text-xl italic text-ink-muted leading-snug text-left sm:text-justify">
                {lead}
              </p>
            )}
          </div>
          {/* END: ArticleHeadlineAndMeta */}

          {/* BEGIN: KeyTakeway */}
          {bullets.length > 0 && (
            <section className="bg-paper-tint border-2 border-accent-emerald/80 p-4 sm:p-5 rounded-none relative" data-purpose="tier-1-core-takeaway">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-accent-emerald text-base font-bold">✦</span>
                <h2 className="font-sans text-xs sm:text-sm font-bold uppercase tracking-wider text-accent-emerald">
                  {isBn ? 'মূল বিষয়' : 'Key Takeaways'}
                </h2>
              </div>
              <ul className="space-y-2.5 font-serif text-[15px] sm:text-base text-ink leading-relaxed">
                {bullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald mt-2 shrink-0"></span>
                    <div className="text-left sm:text-justify">{bullet}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* END: CoreTakeawayIntelligence */}

          {/* BEGIN: CoreContextAndNewsWireImage */}
          <section className="space-y-4" data-purpose="tier-3-core-narrative">
            {coreStory && (
              <div>
                <h3 className="font-sans text-[11px] font-bold uppercase tracking-widest text-ink-faint mb-1.5">
                  {isBn ? 'বিস্তারিত' : 'Details'}
                </h3>
                <p className={`font-serif ${textBodySize} text-ink leading-relaxed text-left sm:text-justify`}>
                  {coreStory}
                </p>
              </div>
            )}

            {/* Wire Archive Photo Box with Halftone Editorial Treatment */}
            {activeStory.image_url && (
              <figure className="border border-ink p-1 bg-paper-box">
                <div className="overflow-hidden bg-ink/10 max-h-60 sm:max-h-72">
                  <img 
                    alt={activeStory.image_caption || headline} 
                    className="w-full h-48 sm:h-60 object-cover newsprint-filter" 
                    src={activeStory.image_url} 
                  />
                </div>
                {activeStory.image_caption && (
                  <figcaption className="px-2 pt-2 pb-1 font-sans text-[11px] text-ink-muted border-t border-ink/10 mt-1">
                    <span>{activeStory.image_caption}</span>
                  </figcaption>
                )}
              </figure>
            )}
          </section>
          {/* END: CoreContextAndNewsWireImage */}

          {/* BEGIN: VerifiedSourceCitations */}
          <section className="pt-2 border-t border-ink/20" data-purpose="verified-sources-dossiers">
            <h4 className="font-sans text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2.5">
              {isBn ? 'সূত্র' : 'Sources'}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              {activeStory.sources.map((src, idx) => (
                <a 
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper-dim border border-ink text-xs font-sans font-semibold text-ink hover:bg-ink hover:text-paper transition-colors" 
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{src.name}</span>
                  <span className="text-[10px]">↗</span>
                </a>
              ))}

            </div>
          </section>
          {/* END: VerifiedSourceCitations */}

          {/* BEGIN: AnalyticalTelemetryDossier */}
          {bcs?.data_stats && bcs.data_stats.length > 0 && (
            <aside className="border border-ink bg-paper-box p-3.5 sm:p-4 text-xs font-sans text-ink space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold tracking-wider uppercase text-[10px] bg-ink text-paper px-2 py-0.5">
                  {isBn ? 'গুরুত্বপূর্ণ পরিসংখ্যান' : 'Key figures'}
                </span>
                <span className="font-mono text-[10px] text-accent-emerald font-semibold uppercase">
                  Verified Data
                </span>
              </div>
              <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bcs.data_stats.map((stat, sIdx) => (
                  <div key={sIdx} className="p-2.5 border border-ink/30 bg-paper">
                    <span className="font-bold text-accent-emerald block text-sm">{stat.value}</span>
                    <span className="font-semibold text-ink text-xs">{stat.metric_name}</span>
                    {stat.context && <span className="text-[11px] text-ink-muted block mt-0.5">{stat.context}</span>}
                  </div>
                ))}
              </div>
            </aside>
          )}
          {/* END: AnalyticalTelemetryDossier */}
        </article>

        {/* BEGIN: EngagementFooterControls */}
        <footer className="mt-8 pt-4 border-t-2 border-ink flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-xs" data-purpose="article-footer-toolbar">
          {/* Reader Evaluation Badges & Share (Matching Broadsheet Center Story Design) */}
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleVoteInformative}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-sans text-xs font-bold transition-colors cursor-pointer ${
                hasVoted(activeStory.story_id, 'informative')
                  ? 'border-secondary bg-secondary text-on-secondary shadow-sm'
                  : 'border-secondary/50 bg-secondary-container/30 text-secondary hover:bg-secondary-container'
              }`} 
              type="button"
              title={isBn ? 'তথ্যসমৃদ্ধ হিসেবে ভোট দিন' : 'Vote as Informative'}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>{isBn ? 'তথ্যসমৃদ্ধ' : 'Informative'}</span>
              {getVoteCount(activeStory.story_id, 'informative') > 0 && (
                <span className="font-mono">({isBn ? toBanglaDigits(getVoteCount(activeStory.story_id, 'informative')) : getVoteCount(activeStory.story_id, 'informative')})</span>
              )}
            </button>

            <button 
              onClick={handleVoteImportant}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-sans text-xs font-bold transition-colors cursor-pointer ${
                hasVoted(activeStory.story_id, 'important')
                  ? 'border-primary bg-primary text-on-primary shadow-sm'
                  : 'border-outline-variant bg-surface-container font-medium text-primary hover:bg-surface-container-high'
              }`} 
              type="button"
              title={isBn ? 'গুরুত্বপূর্ণ হিসেবে ভোট দিন' : 'Vote as Important'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isBn ? 'গুরুত্বপূর্ণ' : 'Important'}</span>
              {getVoteCount(activeStory.story_id, 'important') > 0 && (
                <span className="font-mono">({isBn ? toBanglaDigits(getVoteCount(activeStory.story_id, 'important')) : getVoteCount(activeStory.story_id, 'important')})</span>
              )}
            </button>

            <button 
              onClick={handleShare}
              className="p-1 px-2.5 border border-outline hover:bg-surface-container text-primary flex items-center gap-1 cursor-pointer transition-colors font-sans text-xs uppercase" 
              type="button"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copied ? (isBn ? 'কপি হয়েছে' : 'Copied') : (isBn ? 'শেয়ার' : 'Share')}</span>
            </button>
          </div>

          {/* Prominent Return Button */}
          <button 
            onClick={closeStory}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 bg-ink text-paper hover:bg-accent-emerald font-serif text-sm font-semibold tracking-wide transition-colors cursor-pointer" 
            data-purpose="bottom-close-button" 
            type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
            <span>{isBn ? 'প্রথম পাতায় ফিরুন' : 'Back to Front Page'}</span>
          </button>
        </footer>
        {/* END: EngagementFooterControls */}

        {/* More news: readers arriving from Facebook land here, so give them a next story. */}
        {moreStories.length > 0 && (
          <section className="mt-8 pt-4 border-t border-ink/20" data-purpose="more-stories">
            <h2 className="font-serif text-lg font-bold text-ink mb-3">{isBn ? 'আরও খবর' : 'More news'}</h2>
            <ul className="divide-y divide-ink/10">
              {moreStories.map((s) => (
                <li key={s.story_id} className="py-2.5">
                  <StoryLink story={s} className="font-serif text-base font-semibold text-ink hover:text-accent-emerald leading-snug">
                    {isBn ? s.daily_buzz.title_bn : (s.daily_buzz.title_en || s.daily_buzz.title_bn)}
                  </StoryLink>
                  <span className="block text-[11px] text-ink-muted mt-0.5">
                    {getLocalizedCategory(s.primary_category, isBn)} • {formatRelativeTime(s.published_at, isBn)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      {/* END: ArticleReadingSheetModal */}
    </div>
  );
};
