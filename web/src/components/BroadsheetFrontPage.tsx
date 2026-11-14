import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CapsuleStory } from '../types';
import { formatRelativeTime, getLocalizedCategory, toBanglaDigits } from '../utils/bilingual';
import { 
  Share2, 
  Lightbulb, 
  Sparkles, 
  CheckCircle2, 
  ExternalLink, 
  FileText, 
  Mail,
  ArrowRight
} from 'lucide-react';

export const BroadsheetFrontPage: React.FC = () => {
  const { 
    buzzStories, 
    hourlyWires, 
    currentAffairs, 
    openStory, 
    language,
    setIsSettingsOpen,
    getVoteCount,
    hasVoted,
    toggleVote
  } = useApp();

  const isBn = language === 'bn';
  const [subscribedEmail, setSubscribedEmail] = useState('');
  const [subscribedMessage, setSubscribedMessage] = useState(false);

  // Helper getters for bilingual content
  const getTitle = (story?: CapsuleStory | null) => {
    if (!story) return '';
    return isBn 
      ? (story.daily_buzz.title_bn || story.daily_buzz.title_en) 
      : (story.daily_buzz.title_en || story.daily_buzz.title_bn);
  };

  const getLead = (story?: CapsuleStory | null) => {
    if (!story) return '';
    return isBn
      ? (story.daily_buzz.lead_bn || story.daily_buzz.summary_bn || story.daily_buzz.lead_en)
      : (story.daily_buzz.lead_en || story.daily_buzz.summary_en || story.daily_buzz.lead_bn);
  };

  const getBullets = (story?: CapsuleStory | null): string[] => {
    if (!story) return [];
    const bullets = isBn 
      ? (story.daily_buzz.bullets_bn || story.daily_buzz.bullets_en) 
      : (story.daily_buzz.bullets_en || story.daily_buzz.bullets_bn);
    
    if (bullets && bullets.length > 0) return bullets.slice(0, 3);
    
    // Fallback: split summary into clean bullets if explicit bullets array is missing
    const summary = isBn ? story.daily_buzz.summary_bn : story.daily_buzz.summary_en;
    if (summary) {
      return summary
        .split(/(?<=[.!?।])\s+/)
        .filter(s => s.trim().length > 15)
        .slice(0, 3);
    }
    return [];
  };

  const getWhyItMatters = (story?: CapsuleStory | null) => {
    if (!story) return '';
    return isBn
      ? (story.daily_buzz.why_it_matters_bn || story.daily_buzz.impact_bn || story.daily_buzz.summary_bn)
      : (story.daily_buzz.why_it_matters_en || story.daily_buzz.impact_en || story.daily_buzz.summary_en);
  };

  const getCoreStory = (story?: CapsuleStory | null) => {
    if (!story) return '';
    return isBn
      ? (story.daily_buzz.details_bn || story.daily_buzz.summary_bn)
      : (story.daily_buzz.details_en || story.daily_buzz.summary_en);
  };

  const handleShare = async (story: CapsuleStory, e: React.MouseEvent) => {
    e.stopPropagation();
    const title = getTitle(story);
    const storyUrl = new URL(window.location.origin + window.location.pathname);
    storyUrl.searchParams.set('story', story.story_id);
    const permalink = storyUrl.toString();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(permalink);
      }
    } catch {}

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: title,
          url: permalink,
        });
        return;
      } catch {
        // User dismissed
      }
    }
    alert(isBn ? 'সংবাদের সরাসরি লিঙ্ক কপি করা হয়েছে!' : 'Article permalink copied to clipboard!');
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribedEmail) {
      setSubscribedMessage(true);
      setTimeout(() => setSubscribedMessage(false), 5000);
      setSubscribedEmail('');
    }
  };

  // Divide available stories across the broadsheet columns with strict cross-column deduplication
  // Enforce 30-hour active window on the Center Hero slot so yesterday's stories yield to fresh news
  const freshBuzz = buzzStories.filter(s => {
    if (!s.published_at) return true;
    const ageHours = (Date.now() - new Date(s.published_at).getTime()) / (3600 * 1000);
    return ageHours <= 30;
  });

  const heroStory = freshBuzz[0] || buzzStories[0] || hourlyWires[0] || null;
  const leftStories = buzzStories.filter(s => s.story_id !== heroStory?.story_id).slice(0, 2);

  const usedTopIds = new Set<string>();
  if (heroStory) usedTopIds.add(heroStory.story_id);
  leftStories.forEach(s => usedTopIds.add(s.story_id));

  // Wire desk (Column 3: তাজা খবর) - strictly filter out hero and left stories to prevent cross-column duplicate cards
  const candidateWires = hourlyWires.filter(s => !usedTopIds.has(s.story_id));
  const candidateBuzz = buzzStories.slice(3).filter(s => !usedTopIds.has(s.story_id));
  const wireDeskStories = candidateWires.length >= 4 
    ? candidateWires.slice(0, 4) 
    : [...candidateWires, ...candidateBuzz].slice(0, 4);

  // Add wire desk stories to used IDs so lower grid never repeats them
  wireDeskStories.forEach(s => usedTopIds.add(s.story_id));

  // Lower 3-column investigations: 2 full rows (6 stories total), 100% deduplicated across the entire broadsheet
  // Driven dynamically by active buzz stories and latest wire reports (excluding top-placed stories)
  const lowerStories = [
    ...buzzStories.filter(s => !usedTopIds.has(s.story_id)),
    ...hourlyWires.filter(s => !usedTopIds.has(s.story_id))
  ].slice(0, 6);



  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 12-COLUMN BROADSHEET INK GRID */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-0 border-l border-t border-primary/20 bg-background shadow-sm">
        
        {/* ============================================================== */}
        {/* COLUMN 1: Left 25% (Cols 1-3) Secondary Lead Briefings */}
        {/* ============================================================== */}
        <section className="md:col-span-3 border-r border-b border-primary/20 p-4 bg-background flex flex-col">
          <div className="space-y-6">
            {leftStories.map((story, idx) => {
              const title = getTitle(story);
              const bullets = getBullets(story);
              const whyItMatters = getWhyItMatters(story);
              const coreStory = getCoreStory(story);
              const timeStr = formatRelativeTime(story.published_at, isBn);
              const categoryLabel = getLocalizedCategory(story.primary_category, isBn);
              const primarySource = story.sources && story.sources.length > 0 ? story.sources[0] : null;

              return (
                <article key={story.story_id || idx} className="pb-5 border-b border-outline-variant last:border-b-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-label-sm text-label-sm uppercase text-secondary font-bold tracking-wider">
                      {categoryLabel}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {timeStr}
                    </span>
                  </div>

                  <h2 
                    onClick={() => openStory(story)}
                    className="font-serif text-lg sm:text-[19px] leading-[1.3] text-primary font-bold hover:text-secondary transition-colors cursor-pointer mb-2.5"
                  >
                    {title}
                  </h2>

                  {/* Thumbnail if present for second story */}
                  {idx === 1 && story.image_url && (
                    <div className="my-2.5 border border-primary/30 overflow-hidden cursor-pointer" onClick={() => openStory(story)}>
                      <img 
                        src={story.image_url} 
                        alt={title}
                        className="w-full h-28 object-cover filter grayscale contrast-125 hover:filter-none transition-all duration-300" 
                      />
                    </div>
                  )}

                  {/* TIER 1: Key Takeway */}
                  {bullets.length > 0 && (
                    <div className="rounded border border-secondary/40 bg-secondary-container/15 p-2.5 mb-2.5">
                      <div className="flex items-center gap-1.5 text-secondary font-label-sm text-label-sm font-bold uppercase mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-secondary" />
                        <span>{isBn ? 'মূল বিষয়' : 'Key Takeway'}</span>
                      </div>
                      <ul className="space-y-1.5 font-serif text-xs leading-snug text-on-surface">
                        {bullets.map((b, bIdx) => (
                          <li key={bIdx} className="flex items-start gap-1.5">
                            <span className="text-secondary font-bold leading-none mt-0.5">❖</span>
                            <span className="text-justify">{b.replace(/^\*\*(.*?)\*\*/, '$1')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* TIER 3: The Core Story & Sources */}
                  <div className="pt-1">
                    <div className="font-label-sm text-label-sm uppercase font-bold text-outline mb-1">
                      {isBn ? 'মূল প্রতিবেদন' : 'The Core Story'}
                    </div>
                    <p 
                      onClick={() => openStory(story)}
                      className="font-serif text-xs text-on-surface leading-relaxed mb-2.5 line-clamp-3 hover:text-secondary cursor-pointer text-justify"
                    >
                      {coreStory}
                    </p>

                    <div className="flex items-center justify-between text-label-sm font-label-sm pt-1.5 border-t border-dashed border-outline-variant">
                      <span className="text-outline uppercase">{isBn ? 'সূত্র:' : 'Sources:'}</span>
                      {primarySource ? (
                        <a 
                          href={primarySource.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 bg-surface-container-high border border-outline-variant px-2 py-0.5 text-primary hover:border-secondary font-semibold transition-colors"
                        >
                          <span>{primarySource.name}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-on-surface-variant font-semibold">{isBn ? 'সন্দেশ ওয়্যার' : 'Sondesh Wire'}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ============================================================== */}
        {/* COLUMN 2: Center 50% (Cols 4-9) Hero Executive Dossier */}
        {/* ============================================================== */}
        {heroStory ? (
          <article className="md:col-span-6 border-r border-b border-primary/20 p-5 sm:p-6 bg-background flex flex-col">
            <div>
              {/* Story Header Metadata & Actions */}
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant mb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-secondary tracking-wider">
                    {getLocalizedCategory(heroStory.primary_category, isBn)}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    • {formatRelativeTime(heroStory.published_at, isBn)}
                    {heroStory.sources && heroStory.sources.length > 0 && ` • ${heroStory.sources[0].name}`}
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-on-surface-variant">
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-1 hover:text-primary transition-colors cursor-pointer" 
                    title={isBn ? 'সেটিংস' : 'Settings'}
                  >
                    <span className="font-bold text-xs uppercase px-1 border border-outline-variant rounded">T</span>
                  </button>
                </div>
              </div>

              {/* Hero Headline */}
              <h1 
                onClick={() => openStory(heroStory)}
                className="font-serif text-2xl sm:text-3xl lg:text-[34px] leading-[1.15] text-primary font-bold tracking-tight mb-2 hover:text-secondary cursor-pointer transition-colors"
              >
                {getTitle(heroStory)}
              </h1>

              {/* Lead / Subhead */}
              {getLead(heroStory) && (
                <p className="font-serif text-base sm:text-lg italic text-on-surface-variant mb-4 leading-snug text-justify">
                  {getLead(heroStory)}
                </p>
              )}

              {/* Hero Lead Broadsheet Image — or typographic filler when no image */}
              {heroStory.image_url ? (
                <div className="border border-primary/40 mb-4 cursor-pointer" onClick={() => openStory(heroStory)}>
                  <img 
                    src={heroStory.image_url} 
                    alt={getTitle(heroStory)} 
                    className="w-full h-56 sm:h-72 object-cover filter contrast-125 grayscale hover:filter-none transition-all duration-300"
                  />
                  <div className="p-2 bg-surface-container-high border-t border-primary/20 flex items-center justify-between font-label-sm text-label-sm">
                    <span className="italic text-on-surface-variant truncate mr-2">
                      {heroStory.image_caption || (isBn ? 'আর্কাইভাল চিত্র: জাতীয় সংবাদের আলোকচিত্র।' : 'Archival Photo: Sondesh Express documentary report.')}
                    </span>
                    <span className="font-semibold text-primary shrink-0 uppercase">
                      WIRE: SONDESH EXPRESS
                    </span>
                  </div>
                </div>
              ) : (
                /* No-image filler: editorial pull-quote panel */
                <div
                  className="mb-4 border-y border-primary/20 bg-surface-container-low relative overflow-hidden cursor-pointer group py-8 sm:py-10 px-5 sm:px-8 flex flex-col items-center justify-center text-center"
                  onClick={() => openStory(heroStory)}
                >
                  {/* Faint category watermark */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden opacity-[0.035]">
                    <span className="font-serif font-black text-[110px] sm:text-[150px] text-primary leading-none uppercase tracking-tighter whitespace-nowrap">
                      {getLocalizedCategory(heroStory.primary_category, false)}
                    </span>
                  </div>

                  {/* Decorative rule */}
                  <div className="flex items-center gap-3 mb-5 w-full max-w-sm">
                    <span className="flex-1 h-px bg-primary/25" />
                    <span className="font-label-sm text-label-sm text-[10px] uppercase tracking-widest text-secondary font-bold">
                      {isBn ? 'বিশ্লেষণ' : 'Analysis'}
                    </span>
                    <span className="flex-1 h-px bg-primary/25" />
                  </div>

                  {/* Pull quote body */}
                  <p className="relative font-serif text-sm sm:text-base text-on-surface-variant italic leading-relaxed max-w-md z-10 text-justify">
                    <span className="text-primary/25 font-black text-3xl leading-none align-top mr-1 not-italic">"</span>
                    {(getWhyItMatters(heroStory) || getCoreStory(heroStory) || '').slice(0, 240).trim()}
                    {((getWhyItMatters(heroStory) || getCoreStory(heroStory) || '').length > 240) && '…'}
                    <span className="text-primary/25 font-black text-3xl leading-none align-bottom ml-1 not-italic">"</span>
                  </p>

                  {/* Read CTA */}
                  <div className="relative z-10 mt-5 flex items-center gap-2 font-label-sm text-label-sm text-[11px] uppercase tracking-widest text-outline group-hover:text-primary transition-colors">
                    <span className="w-8 h-px bg-current" />
                    <span>{isBn ? 'পূর্ণ বিবরণ পড়ুন' : 'Read Full Brief'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              )}

              {/* TIER 1: Key Takeway (Matching Image 4 Spec) */}
              {getBullets(heroStory).length > 0 && (
                <div className="rounded-lg border-2 border-secondary/50 bg-secondary-container/20 p-4 mb-4">
                  <div className="flex items-center gap-1.5 text-secondary font-label-md text-label-md font-bold uppercase tracking-wider mb-2.5">
                    <Sparkles className="w-4 h-4" />
                    <span>{isBn ? 'মূল বিষয়' : 'Key Takeway'}</span>
                  </div>
                  <ul className="space-y-2 font-serif text-sm sm:text-[15px] leading-relaxed text-on-surface">
                    {getBullets(heroStory).map((bullet, idx) => {
                      const cleanBullet = bullet.replace(/^\*\*(.*?)\*\*/, '$1');
                      return (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="text-secondary font-bold text-base leading-none mt-0.5">❖</span>
                          <span className="text-justify">{cleanBullet}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* TIER 3: The Core Story & Verified Source Chip */}
              <div className="p-3.5 bg-surface-container-low border border-outline-variant mb-4">
                <div className="font-label-sm text-label-sm uppercase font-bold text-outline mb-1.5">
                  {isBn ? 'মূল বিবরণ' : 'The Core Story'}
                </div>
                <p 
                  onClick={() => openStory(heroStory)}
                  className="font-serif text-sm sm:text-base text-on-surface leading-relaxed mb-3 hover:text-secondary cursor-pointer text-justify"
                >
                  {getCoreStory(heroStory)}
                </p>
                <div className="pt-2 border-t border-outline-variant flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm text-label-sm uppercase text-outline">
                      {isBn ? 'সূত্র:' : 'Sources:'}
                    </span>
                    {heroStory.sources && heroStory.sources.map((src, sIdx) => (
                      <a 
                        key={sIdx}
                        href={src.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 bg-surface-container-highest border border-primary/30 rounded px-2.5 py-1 text-label-sm font-label-sm text-primary font-semibold hover:bg-secondary-container transition-colors"
                      >
                        <span>{src.name}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                  {heroStory.daily_buzz.read_time_seconds ? (
                    <span className="text-on-surface-variant font-label-sm text-label-sm">
                      {Math.ceil(heroStory.daily_buzz.read_time_seconds / 60)} {isBn ? 'মিনিট পাঠ' : 'min read'}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Reaction / Utility Pills (Matching Image 4 Bottom Bar) */}
            <div className="mt-4 pt-3 border-t border-dashed border-outline-variant flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => toggleVote(heroStory.story_id, 'informative')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-label-sm text-label-sm font-bold transition-colors cursor-pointer ${
                    hasVoted(heroStory.story_id, 'informative')
                      ? 'border-secondary bg-secondary text-on-secondary shadow-sm'
                      : 'border-secondary/50 bg-secondary-container/30 text-secondary hover:bg-secondary-container'
                  }`}
                  title={isBn ? 'তথ্যসমৃদ্ধ হিসেবে ভোট দিন' : 'Vote as Informative'}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>{isBn ? 'তথ্যসমৃদ্ধ' : 'Informative'}</span>
                  {getVoteCount(heroStory.story_id, 'informative') > 0 && (
                    <span className="font-mono">({isBn ? toBanglaDigits(getVoteCount(heroStory.story_id, 'informative')) : getVoteCount(heroStory.story_id, 'informative')})</span>
                  )}
                </button>
                <button 
                  onClick={() => toggleVote(heroStory.story_id, 'important')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-label-sm text-label-sm font-bold transition-colors cursor-pointer ${
                    hasVoted(heroStory.story_id, 'important')
                      ? 'border-primary bg-primary text-on-primary shadow-sm'
                      : 'border-outline-variant bg-surface-container font-medium text-primary hover:bg-surface-container-high'
                  }`}
                  title={isBn ? 'গুরুত্বপূর্ণ হিসেবে ভোট দিন' : 'Vote as Important'}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isBn ? 'গুরুত্বপূর্ণ' : 'Important'}</span>
                  {getVoteCount(heroStory.story_id, 'important') > 0 && (
                    <span className="font-mono">({isBn ? toBanglaDigits(getVoteCount(heroStory.story_id, 'important')) : getVoteCount(heroStory.story_id, 'important')})</span>
                  )}
                </button>
              </div>
              <div className="flex items-center space-x-2 font-label-sm text-label-sm uppercase">
                <button 
                  onClick={(e) => handleShare(heroStory, e)}
                  className="p-1 px-2.5 border border-outline hover:bg-surface-container text-primary flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isBn ? 'শেয়ার' : 'Share'}</span>
                </button>
              </div>
            </div>
          </article>
        ) : null}

        {/* ============================================================== */}
        {/* COLUMN 3: Right 25% (Cols 10-12) Popular Briefing Wire & BBS Analysis */}
        {/* ============================================================== */}
        <section className="md:col-span-3 border-r border-b border-primary/20 p-4 bg-background flex flex-col">
          <div>
            {/* Header for Popular Articles Wire */}
            <div className="flex items-center justify-between border-b-2 border-primary pb-1.5 mb-3">
              <h3 className="font-serif text-sm uppercase tracking-tight text-primary font-bold">
                {isBn ? 'তাজা খবর' : 'Latest News'}
              </h3>
              <span className="bg-secondary text-on-secondary px-2 py-0.5 font-label-sm text-label-sm font-bold rounded">
                {wireDeskStories.length} {isBn ? 'সংক্ষেপ' : 'Briefs'}
              </span>
            </div>

            {/* STACKED 3-TIER CONDENSED BRIEFS */}
            <div className="space-y-4">
              {wireDeskStories.map((wire, idx) => {
                const title = getTitle(wire);
                const bullets = getBullets(wire);
                const whyItMatters = getWhyItMatters(wire);
                const coreStory = getCoreStory(wire);
                const timeStr = formatRelativeTime(wire.published_at, isBn);
                const categoryLabel = getLocalizedCategory(wire.primary_category, isBn);
                const primarySource = wire.sources && wire.sources.length > 0 ? wire.sources[0] : null;

                return (
                  <article key={wire.story_id || idx} className="pb-3 border-b border-outline-variant last:border-b-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                        0{idx + 1} • {categoryLabel}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {timeStr}
                      </span>
                    </div>

                    <h4 
                      onClick={() => openStory(wire)}
                      className="font-serif text-sm font-bold text-primary hover:text-secondary cursor-pointer leading-snug mb-1.5 transition-colors"
                    >
                      {title}
                    </h4>

                    {/* Condensed Takeaways */}
                    {bullets.length > 0 && (
                      <div className="bg-secondary-container/15 border border-secondary/30 p-2 rounded mb-1.5">
                        <div className="font-label-sm text-label-sm font-bold text-secondary uppercase flex items-center gap-1">
                          <span>❖</span> {isBn ? 'মূল বিষয়:' : 'Key Takeaways:'}
                        </div>
                        <p className="font-serif text-xs text-on-surface leading-tight mt-0.5 text-justify">
                          {bullets[0].replace(/^\*\*(.*?)\*\*/, '$1')}
                        </p>
                      </div>
                    )}

                    <div 
                      onClick={() => openStory(wire)}
                      className="font-serif text-xs text-on-surface leading-snug mb-1 line-clamp-2 hover:text-secondary cursor-pointer text-justify"
                    >
                      {coreStory}
                    </div>

                    <div className="flex items-center justify-between text-label-sm font-label-sm pt-1">
                      <span className="text-outline uppercase">{isBn ? 'উৎস:' : 'Source:'}</span>
                      {primarySource ? (
                        <a 
                          href={primarySource.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-primary font-bold hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>{primarySource.name}</span>
                          <ExternalLink className="w-2 h-2" />
                        </a>
                      ) : (
                        <span className="font-bold text-primary">{isBn ? 'সন্দেশ ওয়্যার' : 'Sondesh Wire'}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ============================================================== */}
      {/* LOWER SECTION: 3 Featured Investigations — Strict 3-Tier Summaries */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-l border-r border-b border-primary/20 bg-background shadow-sm">
        {lowerStories.map((story, idx) => {
          const title = getTitle(story);
          const bullets = getBullets(story);
          const whyItMatters = getWhyItMatters(story);
          const coreStory = getCoreStory(story);
          const categoryLabel = getLocalizedCategory(story.primary_category, isBn);
          const primarySource = story.sources && story.sources.length > 0 ? story.sources[0] : null;

          return (
            <article 
              key={story.story_id || idx}
              className={`border-b border-primary/20 p-5 bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col ${
                (idx % 3 !== 2) ? 'md:border-r' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-on-tertiary-container">
                    {categoryLabel}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {formatRelativeTime(story.published_at, isBn)}
                  </span>
                </div>

                <h3 
                  onClick={() => openStory(story)}
                  className="font-serif text-lg font-bold text-primary hover:text-secondary transition-colors cursor-pointer mb-2.5 leading-snug"
                >
                  {title}
                </h3>

                {story.image_url && (
                  <div className="my-2.5 border border-primary/20 overflow-hidden cursor-pointer" onClick={() => openStory(story)}>
                    <img 
                      src={story.image_url} 
                      alt={title}
                      className="w-full h-32 object-cover filter contrast-125 grayscale hover:filter-none transition-all duration-300"
                    />
                  </div>
                )}

                {/* Tier 1 */}
                {bullets.length > 0 && (
                  <div className="rounded border border-secondary/40 bg-secondary-container/15 p-2.5 mb-2.5">
                    <div className="font-label-sm text-label-sm font-bold uppercase text-secondary mb-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>{isBn ? 'মূল বিষয়' : 'Key Takeway'}</span>
                    </div>
                    <ul className="space-y-1 font-serif text-xs text-on-surface">
                      {bullets.map((b, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-1.5">
                          <span className="text-secondary text-xs font-bold leading-none mt-0.5">❖</span>
                          <span className="text-justify">{b.replace(/^\*\*(.*?)\*\*/, '$1')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tier 3 */}
                <div>
                  <div className="font-label-sm text-label-sm uppercase font-bold text-outline mb-0.5">
                    {isBn ? 'মূল প্রতিবেদন' : 'The Core Story'}
                  </div>
                  <p 
                    onClick={() => openStory(story)}
                    className="font-serif text-xs text-on-surface leading-relaxed line-clamp-3 hover:text-secondary cursor-pointer text-justify"
                  >
                    {coreStory}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-outline-variant flex items-center justify-between font-label-sm text-label-sm">
                <span className="text-on-surface-variant font-semibold">
                  {story.sources && story.sources[0]?.name ? story.sources[0].name : (isBn ? 'এআই সিন্থেসিস' : 'AI Synthesis')}
                </span>
                {primarySource ? (
                  <a 
                    href={primarySource.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="bg-surface-container-highest border border-outline-variant px-2 py-0.5 text-primary hover:border-secondary font-bold inline-flex items-center gap-1"
                  >
                    <span>{primarySource.name}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <button onClick={() => openStory(story)} className="font-bold text-secondary hover:underline">
                    {isBn ? 'বিস্তারিত পড়ুন' : 'Read Full'} &rarr;
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* SUBSCRIBER BANNER (SONDESH EXPRESS DISPATCH) */}
      {/* ============================================================== */}
      <div id="subscribe" className="scroll-mt-6 mt-2">
        {/* Editorial box: thick top rule + double border */}
        <div className="border-2 border-primary/30 border-t-0">
          {/* Section header strip */}
          <div className="border-t-4 border-primary bg-surface-container-high px-6 sm:px-8 py-2.5 flex items-center justify-between border-b border-primary/20">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-primary flex items-center gap-1.5 font-bold">
              <Mail className="w-3.5 h-3.5" />
              <span>{isBn ? 'সকালের সংবাদপত্র' : 'MORNING BRIEFING'}</span>
            </span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant text-[10px] hidden sm:block">
              {isBn ? 'বিনামূল্যে' : 'Free Daily Digest'}
            </span>
          </div>

          {/* Content area */}
          <div className="bg-surface-container px-6 sm:px-8 py-7 sm:py-9 flex flex-col md:flex-row items-start md:items-center justify-between gap-7">
            {/* Copy */}
            <div className="max-w-xl">
              <h2 className="font-serif text-xl sm:text-2xl text-primary font-bold leading-snug">
                {isBn
                  ? 'প্রতিদিনের সংক্ষিপ্ত সংবাদ সরাসরি আপনার ইমেইলে'
                  : 'Daily Curated Briefings Straight to Your Inbox'}
              </h2>
              <p className="font-serif text-xs sm:text-sm text-on-surface-variant mt-2 leading-relaxed max-w-lg">
                {isBn
                  ? 'বিভ্রান্তিহীন নির্ভুল সারসংক্ষেপ, বিশ্লেষণ এবং মূল সূত্রের সংযোগ — প্রতিদিন সকালে।'
                  : 'Zero noise. Essential takeaways, context and direct source citations — fresh every morning.'}
              </p>
              <div className="flex items-center gap-3 mt-3 font-label-sm text-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block"></span>
                  {isBn ? 'বিজ্ঞাপনমুক্ত' : 'No Ads'}
                </span>
                <span>•</span>
                <span>{isBn ? 'যেকোনো সময় বাতিল করুন' : 'Unsubscribe Anytime'}</span>
                <span>•</span>
                <span>{isBn ? 'স্প্যাম নেই' : 'No Spam'}</span>
              </div>
            </div>

            {/* Form */}
            <div className="w-full md:w-auto shrink-0">
              {subscribedMessage ? (
                <div className="border border-secondary/40 bg-background px-5 py-3.5 font-serif text-sm font-semibold text-secondary flex items-center gap-2">
                  <span className="text-base">✓</span>
                  <span>{isBn ? 'ধন্যবাদ! সাবস্ক্রিপশন সম্পন্ন হয়েছে।' : 'Subscribed! Welcome to the daily brief.'}</span>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row items-stretch w-full border border-primary/40 shadow-sm">
                  <input
                    type="email"
                    required
                    value={subscribedEmail}
                    onChange={(e) => setSubscribedEmail(e.target.value)}
                    placeholder={isBn ? 'আপনার ইমেইল লিখুন...' : 'Your email address...'}
                    className="bg-background border-0 border-b sm:border-b-0 sm:border-r border-primary/30 text-on-surface font-serif px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary w-full sm:w-64 placeholder:text-outline"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-background font-label-md text-label-md uppercase font-bold px-6 py-3 hover:bg-secondary transition-colors whitespace-nowrap cursor-pointer tracking-wider"
                  >
                    {isBn ? 'সদস্য হন' : 'Subscribe Free'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
