import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StoryCard } from './StoryCard';
import { BroadsheetFooter } from './BroadsheetFooter';
import { Hash, Globe, Filter, X, Clock, Layers, Search, ArrowUpDown } from 'lucide-react';
import { toBanglaDigits } from '../utils/bilingual';
import { CapsuleStory } from '../types';
import { calculateDynamicRank } from '../services/api';

// Same rank the front page uses: the pipeline's editorial score with time decay.
function computeStoryRelevanceScore(story: CapsuleStory): number {
  return calculateDynamicRank(story.importance_score ?? 2.0, story.published_at, 30);
}

export const DiscoverFeed: React.FC = () => {
  const { allStories, language, searchQuery, setSearchQuery } = useApp();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [sortBy, setSortBy] = useState<'time_desc' | 'relevance'>('time_desc');
  const isBn = language === 'bn';

  // Extract distinct tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    allStories.forEach((s) => {
      (s.tags || []).forEach((t) => tagsSet.add(t));
      (s.interest_categories || []).forEach((c) => tagsSet.add(`#${c.replace(/_/g, '')}`));
    });
    return Array.from(tagsSet).slice(0, 14);
  }, [allStories]);

  // Extract distinct verified sources
  const allSources = useMemo(() => {
    const sourcesSet = new Set<string>();
    allStories.forEach((s) => {
      (s.sources || []).forEach((src) => {
        if (src.name) sourcesSet.add(src.name);
      });
    });
    return Array.from(sourcesSet).slice(0, 8);
  }, [allStories]);

  // Filter stories chronologically, by search query, and by tag/source
  const filteredStories = useMemo(() => {
    let result = allStories;

    // Search query filter (matches headlines, summaries, details, tags, sources in EN and BN)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const buzz = s.daily_buzz;
        const titleEn = buzz.title_en?.toLowerCase() || '';
        const titleBn = buzz.title_bn?.toLowerCase() || '';
        const sumEn = buzz.summary_en?.toLowerCase() || '';
        const sumBn = buzz.summary_bn?.toLowerCase() || '';
        const detEn = buzz.details_en?.toLowerCase() || '';
        const detBn = buzz.details_bn?.toLowerCase() || '';
        const cat = s.primary_category?.toLowerCase() || '';
        const tags = (s.tags || []).join(' ').toLowerCase();
        const sources = (s.sources || []).map((src) => src.name).join(' ').toLowerCase();

        return (
          titleEn.includes(q) ||
          titleBn.includes(q) ||
          sumEn.includes(q) ||
          sumBn.includes(q) ||
          detEn.includes(q) ||
          detBn.includes(q) ||
          cat.includes(q) ||
          tags.includes(q) ||
          sources.includes(q)
        );
      });
    }

    // Time filter
    if (timeFilter !== 'all') {
      const now = Date.now();
      const cutoff = 
        timeFilter === '24h' ? now - 24 * 3600 * 1000 :
        timeFilter === '7d' ? now - 7 * 24 * 3600 * 1000 :
        now - 30 * 24 * 3600 * 1000;

      result = result.filter((s) => {
        if (!s.published_at) return true;
        const time = new Date(s.published_at).getTime();
        return isNaN(time) || time >= cutoff;
      });
    }

    // Tag filter
    if (selectedTag) {
      const cleanTag = selectedTag.toLowerCase().replace('#', '');
      result = result.filter((s) => {
        const hasTag = (s.tags || []).some((t) => t.toLowerCase().includes(cleanTag));
        const hasCat = (s.interest_categories || []).some((c) => c.toLowerCase().includes(cleanTag));
        return hasTag || hasCat;
      });
    }

    // Source filter
    if (selectedSource) {
      result = result.filter((s) => 
        (s.sources || []).some((src) => src.name?.toLowerCase() === selectedSource.toLowerCase())
      );
    }

    // Sort stories
    result = [...result].sort((a, b) => {
      if (sortBy === 'relevance') {
        const scoreA = computeStoryRelevanceScore(a);
        const scoreB = computeStoryRelevanceScore(b);
        if (Math.abs(scoreB - scoreA) > 0.001) {
          return scoreB - scoreA;
        }
        const tA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const tB = b.published_at ? new Date(b.published_at).getTime() : 0;
        return tB - tA;
      }
      // Default: time_desc (Newest First)
      const tA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tB - tA;
    });

    return result;
  }, [allStories, searchQuery, timeFilter, selectedTag, selectedSource, sortBy]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedTag || selectedSource || timeFilter !== 'all' || sortBy !== 'time_desc');

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedTag(null);
    setSelectedSource(null);
    setTimeFilter('all');
    setSortBy('time_desc');
  };

  return (
    <div className="pb-24 bg-background">
      {/* 1. BROADSHEET ARCHIVE HEADER BANNER */}
      <div className="border-b border-primary/20 bg-surface-container-low py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div>
            <div className="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold flex items-center gap-1.5 mb-1.5">
              <span>●</span>
              <span>{isBn ? 'সকল সংবাদ' : 'All News'}</span>
            </div>
            <h1 className="font-display-masthead text-2xl sm:text-4xl text-primary font-bold tracking-tight uppercase">
              {isBn ? 'সকল সংবাদ' : 'All News'}
            </h1>
            <p className="font-serif text-sm sm:text-base text-on-surface-variant max-w-2xl mt-1 leading-relaxed">
              {isBn 
                ? 'প্রকাশিত সব খবরের সংগ্রহ। বিষয়, সূত্র বা সময় ধরে খুঁজুন।' 
                : 'Every story we have published. Search by topic, source or date.'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 2. THEMATIC TOPICS & PUBLISHER FILTER BAR */}
        <div className="border border-primary/20 bg-surface-container p-4 mb-6 space-y-3.5 shadow-sm">
          {/* Topics Chips */}
          <div>
            <div className="flex items-center space-x-1.5 font-label-sm text-label-sm font-bold uppercase text-secondary mb-2">
              <Hash className="w-3.5 h-3.5" />
              <span>{isBn ? 'টপিক ও বিষয়বস্তু ফিল্টার' : 'Strategic Topics & Indices'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className={`px-2.5 py-1 text-xs font-serif transition-colors border cursor-pointer ${
                      isSelected
                        ? 'bg-secondary text-on-secondary border-secondary font-semibold'
                        : 'bg-surface-container-low border-outline-variant text-on-surface hover:border-primary'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Publisher Desks */}
          {allSources.length > 0 && (
            <div className="pt-2 border-t border-primary/10">
              <div className="flex items-center space-x-1.5 font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-2">
                <Globe className="w-3.5 h-3.5" />
                <span>{isBn ? 'সংবাদ উৎস ও ওয়্যার সার্ভিস' : 'News Sources & Wire Services'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allSources.map((src) => {
                  const isSelected = selectedSource === src;
                  return (
                    <button
                      key={src}
                      onClick={() => setSelectedSource(isSelected ? null : src)}
                      className={`px-2.5 py-1 text-xs font-serif transition-colors border cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-background border-primary font-bold'
                          : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:border-primary'
                      }`}
                    >
                      {src}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. ARCHIVE RESULTS HEADER BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 mb-6 border-b-2 border-primary">
          <div className="flex flex-wrap items-center gap-2 font-serif text-sm font-bold text-primary">
            <span className="uppercase tracking-wider font-label-sm text-label-sm">
              {isBn ? 'সকল সংবাদ তালিকা' : 'All News Stories'}
            </span>
            <span className="bg-secondary text-on-secondary px-2 py-0.2 text-xs font-bold rounded font-mono">
              {isBn ? toBanglaDigits(filteredStories.length) : filteredStories.length} {isBn ? 'টি সংবাদ' : 'Stories'}
            </span>

            {/* Active Search Query Badge */}
            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/30 px-2.5 py-0.5 text-xs font-serif rounded">
                <Search className="w-3 h-3 text-secondary" />
                <span>
                  {isBn ? 'অনুসন্ধান:' : 'Query:'} <strong className="font-bold">"{searchQuery}"</strong>
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="hover:text-error ml-1 cursor-pointer"
                  title={isBn ? 'অনুসন্ধান মুছুন' : 'Clear search'}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          {/* Combined Controls: Timeframe & Sorting & Clear Button */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Combined Sort & Timeframe Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Sort by Newest / Relevance */}
              <div className="flex items-center gap-1.5">
                <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-secondary" />
                  <span>{isBn ? 'সাজান:' : 'Sort:'}</span>
                </span>
                <div className="flex items-center bg-surface-container border border-primary/20 p-0.5">
                  <button
                    onClick={() => setSortBy('time_desc')}
                    className={`px-3 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      sortBy === 'time_desc'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? 'সর্বশেষ আগে (সময়)' : 'Newest First (Time)'}
                  >
                    {isBn ? 'সর্বশেষ' : 'Newest'}
                  </button>
                  <button
                    onClick={() => setSortBy('relevance')}
                    className={`px-3 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      sortBy === 'relevance'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? 'সম্পাদকীয় স্কোর ও প্রাসঙ্গিকতা' : 'Editorial Relevance & Score'}
                  >
                    {isBn ? 'প্রাসঙ্গিকতা' : 'Relevance'}
                  </button>
                </div>
              </div>

              {/* Timeframe Filter (All Time, 24 Hours, 7 Days, 30 Days) directly beside Newest / Relevance */}
              <div className="flex items-center gap-1.5">
                <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-secondary" />
                  <span>{isBn ? 'সময়সীমা:' : 'Time:'}</span>
                </span>
                <div className="flex items-center bg-surface-container border border-primary/20 p-0.5">
                  <button
                    onClick={() => setTimeFilter('all')}
                    className={`px-2.5 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      timeFilter === 'all'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? 'সব সময়' : 'All Time'}
                  >
                    {isBn ? 'সব সময়' : 'All Time'}
                  </button>
                  <button
                    onClick={() => setTimeFilter('24h')}
                    className={`px-2.5 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      timeFilter === '24h'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? '২৪ ঘণ্টা' : '24 Hours'}
                  >
                    {isBn ? '২৪ ঘণ্টা' : '24 Hours'}
                  </button>
                  <button
                    onClick={() => setTimeFilter('7d')}
                    className={`px-2.5 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      timeFilter === '7d'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? '৭ দিন' : '7 Days'}
                  >
                    {isBn ? '৭ দিন' : '7 Days'}
                  </button>
                  <button
                    onClick={() => setTimeFilter('30d')}
                    className={`px-2.5 py-1 text-xs font-serif font-semibold transition-colors cursor-pointer ${
                      timeFilter === '30d'
                        ? 'bg-primary text-background font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-primary'
                    }`}
                    title={isBn ? '৩০ দিন' : '30 Days'}
                  >
                    {isBn ? '৩০ দিন' : '30 Days'}
                  </button>
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 font-label-sm text-label-sm uppercase font-bold text-secondary hover:underline cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isBn ? 'ফিল্টার মুছুন' : 'Reset'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4. ARCHIVE STORIES GRID */}
        {filteredStories.length === 0 ? (
          <div className="text-center py-20 px-4 border border-primary/20 bg-surface-container">
            <Layers className="w-10 h-10 text-secondary/40 mx-auto mb-3" />
            <h3 className="font-serif text-lg font-bold text-primary mb-1">
              {isBn ? 'কোনো আর্কাইভ নথি পাওয়া যায়নি' : 'No Archived Records Matching Selection'}
            </h3>
            <p className="font-serif text-xs sm:text-sm text-on-surface-variant mb-4">
              {isBn 
                ? 'অন্য কোনো সময়সীমা বা টপিক ফিল্টার নির্বাচন করুন।' 
                : 'Try clearing your active filters or selecting a broader timeframe.'}
            </p>
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-primary text-background font-label-md text-label-md uppercase font-bold hover:bg-surface-container-highest hover:text-primary transition-colors cursor-pointer border border-primary"
            >
              {isBn ? 'ফিল্টার সাফ করুন' : 'Reset Filters'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStories.map((story) => (
              <StoryCard key={story.story_id} story={story} />
            ))}
          </div>
        )}
      </div>

      {/* Broadsheet Footer */}
      <BroadsheetFooter />
    </div>
  );
};
