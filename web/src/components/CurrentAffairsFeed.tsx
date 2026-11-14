import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CapsuleStory } from '../types';
import { 
  Scale, 
  BarChart3, 
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Share2,
  Check
} from 'lucide-react';
import { getLocalizedCategory, formatRelativeTime, toBanglaDigits } from '../utils/bilingual';
import { BroadsheetFooter } from './BroadsheetFooter';

export const CurrentAffairsFeed: React.FC = () => {
  const { 
    currentAffairs, 
    openStory, 
    language, 
    isSerif, 
    t,
    selectedCurrentAffairId,
    setSelectedCurrentAffairId
  } = useApp();

  const [copied, setCopied] = useState(false);
  const isBn = language === 'bn';

  // Selected story or fallback to first available current affair
  const activeDossier = useMemo(() => {
    if (selectedCurrentAffairId) {
      const found = currentAffairs.find(s => s.story_id === selectedCurrentAffairId);
      if (found) return found;
    }
    return currentAffairs.length > 0 ? currentAffairs[0] : null;
  }, [currentAffairs, selectedCurrentAffairId]);

  const handleShareDossier = async () => {
    if (!activeDossier) return;
    const headlineText = isBn
      ? (activeDossier.daily_buzz.title_bn || activeDossier.daily_buzz.title_en)
      : (activeDossier.daily_buzz.title_en || activeDossier.daily_buzz.title_bn);

    const dossierUrl = new URL(window.location.origin + window.location.pathname);
    dossierUrl.searchParams.set('tab', 'current_affairs');
    dossierUrl.searchParams.set('story', activeDossier.story_id);
    const link = dossierUrl.toString();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      }
    } catch {}

    if (navigator.share) {
      try {
        await navigator.share({
          title: headlineText,
          text: headlineText,
          url: link,
        });
      } catch {}
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Related current affairs (excluding active dossier)
  const relatedDossiers = useMemo(() => {
    if (!activeDossier) return [];
    return currentAffairs.filter(s => s.story_id !== activeDossier.story_id);
  }, [currentAffairs, activeDossier]);

  if (!activeDossier) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Scale className="w-12 h-12 mx-auto text-on-surface-variant/40 mb-3" />
        <h3 className="font-headline-md text-headline-md text-primary font-bold">
          {isBn ? 'এখনো কোনো বিশ্লেষণ প্রকাশিত হয়নি' : 'No analysis published yet'}
        </h3>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          {isBn ? 'নতুন বিশ্লেষণ প্রকাশিত হলে এখানে দেখা যাবে।' : 'New analysis will appear here when published.'}
        </p>
      </div>
    );
  }

  const bcs = activeDossier.bcs_pro;
  const buzz = activeDossier.daily_buzz;
  const headline = isBn
    ? (buzz.title_bn || buzz.title_en)
    : (buzz.title_en || buzz.title_bn);

  const summary = isBn
    ? (buzz.details_bn || buzz.summary_bn || bcs?.why_in_the_news_bn)
    : (buzz.details_en || buzz.summary_en || bcs?.why_in_the_news_en);

  const whyInNews = isBn
    ? (bcs?.why_in_the_news_bn || buzz.summary_bn)
    : (bcs?.why_in_the_news_en || buzz.summary_en);

  const categoryLabel = getLocalizedCategory(activeDossier.primary_category, isBn);
  const timeFormatted = formatRelativeTime(activeDossier.published_at, isBn);



  const defaultStats = [
    {
      metric_name: isBn ? 'প্রবাসী আয় প্রবাহ' : 'ANNUAL REMITTANCE CORRIDOR',
      value: '$5.85 Billion',
      source_org: 'Bangladesh Bank',
      context: isBn ? 'জাতীয় বৈদেশিক মুদ্রা রিজার্ভের অন্যতম প্রধান ভিত্তি।' : 'Macroeconomic pillar supporting national sovereign reserves.'
    },
    {
      metric_name: isBn ? 'প্রবাসী শ্রমশক্তি' : 'EXPATRIATE MANPOWER EXPOSURE',
      value: '3.5M – 4.0M',
      source_org: 'BMET Register',
      context: isBn ? 'উপসাগরীয় অঞ্চলে নিয়োজিত বাংলাদেশি শ্রমজীবী মানুষ।' : 'Frontline human capital stationed across regional hubs.'
    },
    {
      metric_name: isBn ? 'জাহাজ চলাচল পথ পরিবর্তন ব্যয়' : 'TRANSIT DETOUR SURCHARGE',
      value: 'Tk 66.63 Cr',
      source_org: 'BSC Maritime Risk',
      context: isBn ? 'উত্তমাশা অন্তরীপ ঘুরে বাড়তি পথ পাড়ি দেওয়ার একক খরচ।' : 'Cape of Good Hope circumnavigation fuel and insurance burden.'
    },
    {
      metric_name: isBn ? 'সরবরাহ চেইন বিলম্ব' : 'SUPPLY CHAIN LATENCY',
      value: '15 to 50 Days',
      source_org: 'Logistics Monitor',
      context: isBn ? '+৩০০% অতিরিক্ত ট্রানজিট সময় ও আমদানি বিলম্ব।' : '+333% transit duration penalty impacting domestic imports.'
    }
  ];

  const statsList = (bcs?.data_stats && bcs.data_stats.length > 0) ? bcs.data_stats : [];

  return (
    <div className="bg-background text-on-surface min-h-screen">
      {/* 1. TOP METADATA BAR & TELEMETRY TICKER */}
      <aside className="w-full bg-surface-container-high border-b border-primary/20 text-on-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between text-label-sm font-label-sm uppercase tracking-wider">
          <div className="flex items-center space-x-2 py-0.5">
            <span className="inline-block w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="font-bold">{isBn ? 'সন্দেশ এক্সপ্রেস • কারেন্ট অ্যাফেয়ার্স' : 'SONDESH EXPRESS • CURRENT AFFAIRS'}</span>
            <span className="text-outline">/</span>
            <span>{isBn ? 'কৌশলগত নীতি ও ভূ-অর্থনৈতিক বিশ্লেষণ' : 'STRATEGIC POLICY & GEOECONOMIC DOSSIER'}</span>
            <span className="hidden md:inline text-outline">/</span>
            <span className="hidden md:inline font-semibold text-secondary">{isBn ? 'কারেন্ট অ্যাফেয়ার্স সম্পাদকীয়' : 'CURRENT AFFAIRS EDITORIAL'}</span>
          </div>
          <div className="flex items-center space-x-4 py-0.5">
            <span className="text-outline">{isBn ? 'সংস্করণ: ডিজিটাল ব্রডশিট' : 'EDITION: DIGITAL BROADSHEET'}</span>
            <span className="text-primary font-bold">{timeFormatted}</span>
          </div>
        </div>
      </aside>

      {/* 2. STRATEGIC TRACK SELECTOR RIBBON */}
      <section className="w-full bg-surface-container-low border-b border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-label-md font-label-md uppercase">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 custom-scroll">
            <span className="text-outline font-bold mr-1">{isBn ? 'বিষয়তালিকা:' : 'DOSSIER TRACKS:'}</span>
            {currentAffairs.map((s, idx) => {
              const isSelected = (selectedCurrentAffairId === s.story_id) || (!selectedCurrentAffairId && idx === 0);
              const trackTitle = isBn 
                ? (s.daily_buzz.title_bn || s.daily_buzz.title_en)
                : (s.daily_buzz.title_en || s.daily_buzz.title_bn);
              const shortTitle = trackTitle.length > 38 ? trackTitle.slice(0, 38) + '...' : trackTitle;

              return (
                <button
                  key={s.story_id}
                  onClick={() => setSelectedCurrentAffairId(s.story_id)}
                  className={`px-3 py-1 font-semibold whitespace-nowrap transition-colors border cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-background border-primary shadow-sm font-bold'
                      : 'bg-surface border-outline-variant hover:border-primary text-primary'
                  }`}
                >
                  {shortTitle}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-label-sm font-label-sm text-outline">
            <span>{isBn ? 'শ্রেণিবিভাগ:' : 'REGISTRY TIER:'}</span>
            <span className="text-primary font-bold uppercase">{categoryLabel}</span>
          </div>
        </div>
      </section>

      {/* 3. MAIN EDITORIAL CANVASS (12-COL BROADSHEET) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <article className="border border-primary/30 bg-surface p-4 sm:p-6 lg:p-8 mb-8 shadow-sm">
          {/* Eyebrow Ribbon */}
          <div className="flex flex-wrap items-center justify-between border-b border-primary/20 pb-3 mb-6 gap-2">
            <div className="flex items-center space-x-2">
              <span className="inline-block px-2 py-0.5 bg-secondary text-on-secondary font-label-sm text-label-sm uppercase tracking-wider font-bold">
                {isBn ? 'সরাসরি বিশ্লেষণ' : 'LIVE INTELLIGENCE'}
              </span>
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline">
                {isBn ? 'বিশেষ নীতি ডসিয়ার' : 'SPECIAL STRATEGIC DOSSIER'} • #{activeDossier.story_id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-label-sm font-label-sm text-on-surface-variant flex-wrap gap-2">
              <span>{isBn ? 'সম্পাদনা ও তত্ত্বাবধান:' : 'EDITORIAL SUPERVISION:'} <strong>{isBn ? 'কারেন্ট অ্যাফেয়ার্স সম্পাদকীয় সেল (হিউম্যান ইন দ্য লুপ)' : 'Current Affairs Editorial Desk (Human-Managed)'}</strong></span>
              <button
                onClick={handleShareDossier}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high hover:bg-primary hover:text-background border border-primary/30 transition-colors font-medium text-xs rounded-sm cursor-pointer ml-1 shadow-sm"
                title={isBn ? 'এই ডসিয়ারের স্থায়ী লিঙ্ক কপি করুন' : 'Copy dossier permalink'}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copied ? (isBn ? 'লিঙ্ক কপি হয়েছে' : 'Copied!') : (isBn ? 'শেয়ার লিঙ্ক' : 'Share Link')}</span>
              </button>
            </div>
          </div>

          {/* Main Headline & Subtitle */}
          <div className="max-w-5xl mb-6">
            <h1 className={`font-headline-xl text-headline-xl-mobile md:text-headline-xl text-primary font-bold tracking-tight leading-tight mb-4 ${isSerif ? 'font-serif' : 'font-sans'}`}>
              {headline}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
              {summary}
            </p>
          </div>

          {/* Broadsheet 12-Column Grid: Imagery & "Why In News" Context */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-8">
            {/* Visual / Documentary Photograph Compartment (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col">
              <div className="border border-primary/20 bg-surface-container-high relative overflow-hidden">
                <img 
                  className="w-full h-80 object-cover grayscale contrast-125 hover:grayscale-0 transition-all duration-500" 
                  alt={headline} 
                  src={activeDossier.image_url || 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=80'} 
                />
                <div className="p-2.5 bg-surface-container border-t border-primary/20 text-label-sm font-label-sm text-on-surface-variant flex items-center justify-between">
                  <span>{activeDossier.image_caption || (isBn ? 'চিত্র: জাতীয় ও বৈশ্বিক প্রেক্ষাপটে কৌশলগত বিশ্লেষণ চিত্র।' : 'FIG 1.0: Documentary archival imagery and strategic context cartography.')}</span>
                  <span className="font-bold">{isBn ? 'সন্দেশ এক্সপ্রেস আর্কাইভ' : 'SONDESH ARCHIVE'}</span>
                </div>
              </div>

              {/* Sub-Metric Cards Under Visual */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-surface-container-low border border-primary/20">
                  <span className="font-label-sm text-label-sm uppercase text-outline font-semibold">
                    {isBn ? 'কৌশলগত গুরুত্ব' : 'STRATEGIC SIGNIFICANCE'}
                  </span>
                  <div className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                    {bcs?.bcs_subject_area || (isBn ? 'জাতীয় নীতি ও সামষ্টিক অর্থনীতি' : 'National Policy & Macroeconomy')}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {isBn ? 'সার্বভৌম নীতিনির্ধারণ ও প্রাতিষ্ঠানিক প্রস্তুতিতে সরাসরি প্রভাব।' : 'Direct structural implications for national governance & planning.'}
                  </p>
                </div>
                <div className="p-3 bg-surface-container-low border border-primary/20">
                  <span className="font-label-sm text-label-sm uppercase text-outline font-semibold">
                    {isBn ? 'বিশ্লেষণ গভীরতা' : 'COMPREHENSIVE COVERAGE'}
                  </span>
                  <div className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                    {isBn ? 'বহুস্তরীয় গবেষণা নথি' : 'Multi-Tier Analytical Dossier'}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {isBn ? 'তথ্য-উপাত্ত, চ্যালেঞ্জ ও ভবিষ্যৎ সমাধান রূপরেখা।' : 'Includes empirical data, structural hurdles, and policy roadmaps.'}
                  </p>
                </div>
              </div>
            </div>

            {/* "Why in the News" Analytical Container (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col h-full bg-surface-container-low p-5 border-2 border-primary">
              <div className="flex items-center space-x-2 border-b-2 border-primary pb-2 mb-3">
                <Scale className="w-4 h-4 text-primary" />
                <span className="font-label-lg text-label-lg uppercase tracking-wider font-bold text-primary">
                  {isBn ? 'কেন এটি গুরুত্বপূর্ণ (প্রেক্ষাপট)' : 'Executive Summary: Why in the News'}
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface leading-relaxed mb-4">
                {whyInNews}
              </p>
              
              <div className="border-t border-primary/20 pt-3 mt-auto">
                <span className="font-label-sm text-label-sm uppercase font-bold text-primary block mb-2">
                  {isBn ? 'মূল কৌশলগত সিদ্ধান্তসমূহ:' : 'Core Strategic Takeaways:'}
                </span>
                <ul className="space-y-3 font-body-sm text-body-sm text-on-surface-variant">
                  {buzz.bullets_en && buzz.bullets_en.length > 0 ? (
                    (isBn ? (buzz.bullets_bn || buzz.bullets_en) : buzz.bullets_en).map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="inline-block mt-1 w-1.5 h-1.5 bg-secondary flex-shrink-0"></span>
                        <span>{pt}</span>
                      </li>
                    ))
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="inline-block mt-1 w-1.5 h-1.5 bg-secondary flex-shrink-0"></span>
                        <span>{isBn ? 'মুদ্রাস্ফীতি ও সরবরাহ শৃঙ্খলের ওপর সরাসরি দীর্ঘমেয়াদী প্রভাব।' : 'Direct structural vulnerability across supply chains and trade stability.'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="inline-block mt-1 w-1.5 h-1.5 bg-secondary flex-shrink-0"></span>
                        <span>{isBn ? 'প্রাতিষ্ঠানিক সক্ষমতা জোরদার ও নীতি সংশোধনের অপরিহার্য প্রয়োজন।' : 'Heightened requirement for institutional resiliency and fiscal buffers.'}</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* 4. EMPIRICAL DATA & TELEMETRY GRID (4 STATS) */}
          <section className="border-t border-b border-primary/20 py-6 mb-8 bg-surface-container-high/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-primary/20">
              {statsList.slice(0, 4).map((stat, idx) => (
                <div key={idx} className="p-4 flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase text-outline tracking-wider font-semibold">
                    {stat.metric_name}
                  </span>
                  <div className="font-display-masthead text-headline-xl text-primary font-bold my-1 tracking-tight">
                    {isBn ? toBanglaDigits(stat.value) : stat.value}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {stat.context}
                  </p>
                  <div className="mt-2 text-label-sm font-label-sm text-secondary font-bold flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>[{stat.source_org}]</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 5. STRATEGIC INQUIRIES & DETAILED DOSSIER */}
          {bcs?.question_breakdowns && bcs.question_breakdowns.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center justify-between border-b border-primary/20 pb-2 mb-6">
                <div className="flex items-center space-x-2">
                  <h2 className="font-display-masthead text-headline-lg text-primary font-bold">
                    {isBn ? 'কৌশলগত বিশ্লেষণ ও গভীর অনুসন্ধান স্তম্ভ' : 'Strategic Inquiries & Analytical Pillars'}
                  </h2>
                  <span className="text-label-sm font-label-sm bg-surface-container px-2 py-0.5 border border-primary/20 font-bold uppercase">
                    {bcs.question_breakdowns.length} {isBn ? 'অংশীয় রূপরেখা' : 'PART COMPENDIUM'}
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-outline hidden sm:inline uppercase">
                  DOSSIER REF: #{activeDossier.story_id.slice(0, 6).toUpperCase()}
                </span>
              </div>

              <div className="space-y-6">
                {bcs.question_breakdowns.map((q, qIdx) => (
                  <div key={qIdx} className="border border-primary/20 p-5 bg-surface-container-low">
                    <div className="flex flex-wrap items-center justify-between border-b border-primary/20 pb-2 mb-3">
                      <h3 className="font-headline-md text-headline-md text-primary font-bold">
                        {isBn ? `অনুচ্ছেদ ${qIdx + 1}: ` : `Section ${String.fromCharCode(65 + qIdx)}: `}
                        {q.question}
                      </h3>
                      <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                        {isBn ? `স্তম্ভ ${qIdx + 1}` : `Pillar ${qIdx + 1}`} • {categoryLabel}
                      </span>
                    </div>

                    <div className="space-y-2.5 font-body-md text-body-md text-on-surface">
                      {q.anchor_points.map((pt, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2.5">
                          <span className="inline-block mt-1.5 w-1.5 h-1.5 bg-primary flex-shrink-0"></span>
                          <p className="leading-relaxed">{pt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5b. CONSTITUTIONAL CITATIONS (IF AVAILABLE) */}
          {bcs?.constitutional_articles && bcs.constitutional_articles.length > 0 && (
            <section className="mb-10 border border-primary/20 bg-surface-container-low p-5">
              <div className="flex items-center space-x-2 border-b border-primary/20 pb-2 mb-4">
                <Scale className="w-4 h-4 text-primary" />
                <h3 className="font-headline-md text-headline-md text-primary font-bold">
                  {isBn ? 'সাংবিধানিক ও আইনি ভিত্তি' : 'Constitutional & Legal Citations'}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bcs.constitutional_articles.map((art, aIdx) => (
                  <div key={aIdx} className="p-3.5 bg-surface border border-primary/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-primary text-background text-label-sm font-label-sm font-bold uppercase">
                          {art.article_number}
                        </span>
                        <span className="font-bold text-primary font-headline-sm text-headline-sm">
                          {isBn ? art.article_title_bn : art.article_title_en}
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">
                        {art.legal_relevance}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6. CRITICAL CHALLENGES VS STRATEGIC ROADMAP */}
          <section className="border border-primary/20 bg-surface-container-low p-6 mb-8">
            <div className="border-b border-primary/20 pb-3 mb-6 text-center">
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">
                {isBn ? 'কৌশলগত নীতি ম্যাট্রিক্স' : 'STRATEGIC POLICY MATRIX'}
              </span>
              <h3 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
                {isBn ? 'চিহ্নিত সংকট বনাম দীর্ঘমেয়াদী সমাধানের রূপরেখা' : 'Identified Critical Challenges vs. Strategic Way Forward'}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                {isBn
                  ? 'অবিলম্বে মোকাবিলা করার মতো ঝুঁকি এবং কার্যকর সরকারি নীতি প্রতিকারের তুলনামূলক রেজিস্টার।'
                  : 'Comparative executive register detailing immediate risks and actionable sovereign remediation policies.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-primary/20">
              {/* Column Left: Challenges */}
              <div className="pr-0 md:pr-4">
                <div className="flex items-center space-x-2 text-error font-label-md text-label-md uppercase font-bold tracking-wider mb-4">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isBn ? 'প্রধান চ্যালেঞ্জ ও ঝুঁকি' : 'Identified Critical Challenges'}</span>
                </div>
                <div className="space-y-4 font-body-sm text-body-sm">
                  {bcs?.challenges && bcs.challenges.length > 0 ? (
                    bcs.challenges.map((c, idx) => (
                      <div key={idx} className="p-3 bg-surface border border-primary/20 border-l-4 border-l-error">
                        <span className="font-bold text-primary block text-body-md">
                          {idx + 1}. {isBn ? 'কাঠামোগত ঝুঁকি' : 'Structural Vulnerability'}
                        </span>
                        <p className="text-on-surface-variant mt-1 leading-relaxed">{c}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-surface border border-primary/20 border-l-4 border-l-error">
                      <span className="font-bold text-primary block text-body-md">
                        1. {isBn ? 'বৈশ্বিক মূল্যস্ফীতি ও বৈদেশিক মুদ্রার চাপ' : 'Macroeconomic Currency & Fiscal Pressure'}
                      </span>
                      <p className="text-on-surface-variant mt-1 leading-relaxed">
                        {isBn ? 'আন্তর্জাতিক বাজারে মূল্যের অস্থিতিশীলতা ও রিজার্ভের সুরক্ষা চ্যালেঞ্জ।' : 'Sovereign reserves face strain from prolonged trade volatility and high import bills.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Column Right: Way Forward */}
              <div className="pt-6 md:pt-0 pl-0 md:pl-6">
                <div className="flex items-center space-x-2 text-secondary font-label-md text-label-md uppercase font-bold tracking-wider mb-4">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isBn ? 'কৌশলগত উত্তরণ ও করণীয়' : 'Strategic Way Forward & Remediation'}</span>
                </div>
                <div className="space-y-4 font-body-sm text-body-sm">
                  {bcs?.way_forward && bcs.way_forward.length > 0 ? (
                    bcs.way_forward.map((w, idx) => (
                      <div key={idx} className="p-3 bg-surface border border-primary/20 border-l-4 border-l-secondary">
                        <span className="font-bold text-primary block text-body-md">
                          {idx + 1}. {isBn ? 'নীতিগত সমাধান' : 'Policy Remediation'}
                        </span>
                        <p className="text-on-surface-variant mt-1 leading-relaxed">{w}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-surface border border-primary/20 border-l-4 border-l-secondary">
                      <span className="font-bold text-primary block text-body-md">
                        1. {isBn ? 'বিকল্প বাজার ও সরবরাহ পথ বহুমুখীকরণ' : 'Market & Transit Diversification'}
                      </span>
                      <p className="text-on-surface-variant mt-1 leading-relaxed">
                        {isBn ? 'একক অঞ্চলের ওপর নির্ভরশীলতা হ্রাস করে কৌশলগত আন্তর্জাতিক বাণিজ্য চুক্তি সম্পাদন।' : 'Broadening bilateral pacts with non-traditional partners to avoid single-corridor disruptions.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 7. VERIFIED SOURCES & PUBLIC REGISTERS */}
          {activeDossier.sources && activeDossier.sources.length > 0 && (
            <div className="border-t border-primary/20 pt-4 mb-8">
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-outline font-bold block mb-2">
                {isBn ? 'যাচাইকৃত সূত্র ও দাপ্তরিক প্রকাশনা রেজিস্টার:' : 'VERIFIED INTELLIGENCE SOURCES & PUBLIC DOSSIER REGISTERS:'}
              </span>
              <div className="flex flex-wrap gap-2 text-label-sm font-label-sm uppercase">
                {activeDossier.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-surface-container border border-primary/20 hover:bg-primary hover:text-background transition-colors flex items-center gap-1"
                  >
                    <span>{src.name}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 8. SECONDARY WIRE: RELATED STRATEGIC DOSSIERS */}
          {relatedDossiers.length > 0 && (
            <div className="border-t border-primary/20 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline-md text-headline-md text-primary font-bold">
                  {isBn ? 'সম্পর্কিত অন্যান্য কৌশলগত নথি' : 'Related Intelligence Dispatches'}
                </h3>
                <span className="font-label-sm text-label-sm uppercase text-outline">
                  {isBn ? 'নিয়মিত হালনাগাদকৃত' : 'UPDATED HOURLY'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedDossiers.slice(0, 3).map((rel, rIdx) => {
                  const relTitle = isBn
                    ? (rel.daily_buzz.title_bn || rel.daily_buzz.title_en)
                    : (rel.daily_buzz.title_en || rel.daily_buzz.title_bn);
                  const relSummary = isBn
                    ? (rel.daily_buzz.summary_bn || rel.bcs_pro?.why_in_the_news_bn)
                    : (rel.daily_buzz.summary_en || rel.bcs_pro?.why_in_the_news_en);
                  const relCategory = getLocalizedCategory(rel.primary_category, isBn);

                  return (
                    <article
                      key={rel.story_id}
                      onClick={() => {
                        setSelectedCurrentAffairId(rel.story_id);
                        window.scrollTo({ top: 120, behavior: 'smooth' });
                      }}
                      className="p-4 bg-surface-container-low border border-primary/20 flex flex-col justify-between hover:border-primary transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between text-label-sm font-label-sm text-outline mb-2">
                          <span>{isBn ? `নথি #${rIdx + 1}` : `WIRE DISPATCH 0${rIdx + 1}`}</span>
                          <span>{formatRelativeTime(rel.published_at, isBn)}</span>
                        </div>
                        <h4 className="font-headline-sm text-headline-sm text-primary font-bold hover:underline line-clamp-2">
                          {relTitle}
                        </h4>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 line-clamp-3 leading-relaxed">
                          {relSummary}
                        </p>
                      </div>
                      <div className="mt-4 pt-2 border-t border-primary/20 text-label-sm font-label-sm text-secondary font-bold flex items-center justify-between uppercase">
                        <span>{relCategory}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      </main>

      {/* 9. BROADSHEET FOOTER */}
      <BroadsheetFooter />
    </div>
  );
};
