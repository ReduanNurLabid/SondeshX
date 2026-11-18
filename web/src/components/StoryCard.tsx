import React, { useState } from 'react';
import { storyPath } from '../utils/seo';
import { CapsuleStory } from '../types';
import { useApp } from '../context/AppContext';
import { StoryLink } from './StoryLink';
import { 
  getLocalizedCategory, 
  formatRelativeTime, 
  toBanglaDigits 
} from '../utils/bilingual';
import { 
  Bookmark, 
  BookmarkCheck, 
  Share2, 
  ArrowRight, 
  Sparkles, 
  ExternalLink,
  Check,
  Lightbulb
} from 'lucide-react';

interface StoryCardProps {
  story: CapsuleStory;
  featured?: boolean;
}

export const StoryCard: React.FC<StoryCardProps> = ({ story, featured = false }) => {
  const {
    language,
    isSerif,
    openStory,
    toggleSave,
    isSaved,
    t,
  } = useApp();

  const [copied, setCopied] = useState(false);
  const isBn = language === 'bn';
  const buzz = story.daily_buzz;
  const isBookmarked = isSaved(story.story_id);

  const title = isBn
    ? (buzz.title_bn || buzz.title_en)
    : (buzz.title_en || buzz.title_bn);

  const bullets = isBn
    ? (buzz.bullets_bn && buzz.bullets_bn.length > 0 ? buzz.bullets_bn : [buzz.summary_bn])
    : (buzz.bullets_en && buzz.bullets_en.length > 0 ? buzz.bullets_en : [buzz.summary_en]);

  const whyItMatters = isBn
    ? (buzz.why_it_matters_bn || '')
    : (buzz.why_it_matters_en || '');

  const categoryLabel = getLocalizedCategory(story.primary_category, isBn);
  const timeFormatted = formatRelativeTime(story.published_at, isBn);
  const readTime = isBn
    ? `${toBanglaDigits(Math.ceil((buzz.read_time_seconds || 60) / 60))} ${t('minute_read')}`
    : `${Math.ceil((buzz.read_time_seconds || 60) / 60)} ${t('minute_read')}`;

  const primarySource = story.sources && story.sources.length > 0 ? story.sources[0] : null;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const permalink = window.location.origin + storyPath(story.story_id);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(permalink);
      }
    } catch {}

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: whyItMatters || title,
          url: permalink,
        });
      } catch {}
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSave(story.story_id);
  };

  return (
    <article
      onClick={() => openStory(story)}
      className="group cursor-pointer border border-primary/20 hover:border-primary bg-surface-container-low hover:bg-surface-container transition-all duration-200 p-5 flex flex-col justify-between shadow-sm"
    >
      <div>
        {/* Header tags & timing */}
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-outline-variant">
          <div className="flex items-center space-x-2">
            <span className="font-label-sm text-label-sm uppercase font-bold text-secondary tracking-wider">
              {categoryLabel}
            </span>
            {story.is_bcs_pro_selected && (
              <span className="bg-primary text-background px-1.5 py-0.2 text-[9px] font-bold uppercase rounded">
                Dossier
              </span>
            )}
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {timeFormatted}
          </span>
        </div>

        {/* Thumbnail Image if available */}
        {story.image_url && (
          <div className="my-2 border border-primary/20 overflow-hidden">
            <img
              src={story.image_url}
              alt={title}
              className="w-full h-36 sm:h-40 object-cover filter contrast-125 grayscale group-hover:filter-none transition-all duration-300"
              loading="lazy"
            />
          </div>
        )}

        {/* Headline */}
        <h3 className="font-serif text-lg font-bold text-primary group-hover:text-secondary transition-colors leading-snug mb-2.5">
          <StoryLink story={story}>{title}</StoryLink>
        </h3>

        {/* Tier 1: Key Takeway */}
        {bullets && bullets.length > 0 && (
          <div className="rounded border border-secondary/40 bg-secondary-container/15 p-2.5 mb-2.5">
            <div className="font-label-sm text-label-sm font-bold uppercase text-secondary mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{isBn ? 'মূল বিষয়' : 'Key Takeaways'}</span>
            </div>
            <ul className="space-y-1 font-serif text-xs text-on-surface">
              {bullets.slice(0, 3).map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-secondary font-bold text-xs mt-0.5">❖</span>
                  <p className="line-clamp-2 leading-relaxed text-justify">
                    {bullet.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^[•\-\*\d\.]+\s*/, '')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between pt-3 border-t border-outline-variant mt-2 font-label-sm text-label-sm">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSaveClick}
            className="p-1.5 rounded border border-outline-variant hover:border-primary text-primary bg-surface transition-colors cursor-pointer"
            title={isBookmarked ? 'Remove' : 'Save'}
          >
            {isBookmarked ? (
              <BookmarkCheck className="w-3.5 h-3.5 text-secondary fill-current" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={handleShare}
            className="p-1.5 rounded border border-outline-variant hover:border-primary text-primary bg-surface transition-colors cursor-pointer"
            title="Share"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Share2 className="w-3.5 h-3.5" />}
          </button>

          {primarySource && (
            <span className="text-on-surface-variant uppercase hidden sm:inline ml-1 font-semibold truncate max-w-[120px]">
              {primarySource.name}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 font-bold text-primary hover:text-secondary group-hover:translate-x-0.5 transition-all">
          <span>{readTime}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </article>
  );
};
