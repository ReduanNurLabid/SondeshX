import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StoryCard } from './StoryCard';
import { BreakingWiresTicker } from './BreakingWiresTicker';
import { BroadsheetFrontPage } from './BroadsheetFrontPage';
import { BroadsheetFooter } from './BroadsheetFooter';
import { getLocalizedCategory } from '../utils/bilingual';
import { RefreshCw, Layers } from 'lucide-react';

const CATEGORIES = [
  'all',
  'governance_law',
  'economy_business',
  'world_diplomacy',
  'tech_innovation',
  'climate_environment',
  'society_education',
  'sports_fitness',
];

export const TopStoriesFeed: React.FC = () => {
  const { buzzStories, isLoading, refreshFeeds, language, t } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const isBn = language === 'bn';

  const filteredStories = useMemo(() => {
    if (selectedCategory === 'all') return buzzStories;
    return buzzStories.filter((s) => {
      const cat = s.primary_category.toLowerCase();
      const interests = (s.interest_categories || []).map((c) => c.toLowerCase());
      return cat === selectedCategory || interests.includes(selectedCategory);
    });
  }, [buzzStories, selectedCategory]);

  return (
    <div className="pb-24">
      {/* Real-time Breaking Wires Banner */}
      <BreakingWiresTicker />

      {/* Category Horizontal Filter Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2.5">
        <div className="bg-surface-container-low border border-primary/20 shadow-xs">
          <div className="px-3 sm:px-4 py-1.5">
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-0.5 custom-scroll">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              const label = cat === 'all' 
                ? (isBn ? 'সব খবর' : 'All news') 
                : getLocalizedCategory(cat, isBn);
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-3.5 py-1.5 text-xs font-serif uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-background border-primary font-bold shadow-sm'
                      : 'bg-surface text-on-surface-variant border-outline-variant hover:text-primary hover:border-primary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>

      {/* Loading Skeletons */}
      {isLoading && buzzStories.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-pulse">
          <div className="h-80 bg-surface-container-high border border-primary/20" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-surface-container-high border border-primary/20" />
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!isLoading && (
        <>
          {selectedCategory === 'all' ? (
            /* Grand 12-Column Broadsheet Layout from code.html */
            <BroadsheetFrontPage />
          ) : (
            /* Categorized Filtered View */
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {filteredStories.length === 0 ? (
                <div className="text-center py-20 px-4 border border-primary/20 bg-surface-container">
                  <Layers className="w-12 h-12 text-secondary/50 mx-auto mb-3" />
                  <h3 className="font-serif text-lg font-bold text-primary mb-1">
                    {isBn ? 'এই বিভাগে কোনো সংবাদ পাওয়া যায়নি' : 'No stories in this section yet'}
                  </h3>
                  <p className="font-serif text-sm text-on-surface-variant mb-4">
                    {isBn ? 'অন্য বিভাগ বেছে নিন বা পাতাটি আবার লোড করুন' : 'Try selecting another category or refresh the feed.'}
                  </p>
                  <button
                    onClick={() => refreshFeeds()}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-primary text-background font-label-md text-label-md uppercase font-bold hover:bg-surface-container-highest hover:text-primary border border-primary transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isBn ? 'পুনরায় লোড করুন' : 'Refresh'}</span>
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
          )}
        </>
      )}

      {/* Broadsheet Footer */}
      <BroadsheetFooter />
    </div>
  );
};
