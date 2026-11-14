import React from 'react';
import { CapsuleStory } from '../../types';
import { getLocalizedCategory } from '../../utils/bilingual';

interface Props {
  rankedStories: CapsuleStory[];
  onOpenStory: (storyId: string) => void;
}

const ago = (iso?: string) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

/** The live front page drawn as its slots, in the same order the site places stories. */
export const FrontPageBoard: React.FC<Props> = ({ rankedStories, onOpenStory }) => {
  const card = (s: CapsuleStory | undefined, size: 'lg' | 'md' | 'sm', pos: number) => {
    if (!s) return <div className="border border-dashed border-primary/20 p-3 font-sans text-xs text-on-surface-variant">Empty</div>;
    const t = s.daily_buzz?.title_bn || s.daily_buzz?.title_en || s.story_id;
    return (
      <button
        onClick={() => onOpenStory(s.story_id)}
        className="w-full text-left border border-primary/20 bg-surface hover:border-primary transition-colors cursor-pointer overflow-hidden"
      >
        {size === 'lg' && s.image_url && <img src={s.image_url} alt="" className="w-full h-40 object-cover" />}
        <div className="p-3">
          <div className="flex items-center justify-between font-sans text-[10px] font-bold uppercase tracking-wider text-secondary">
            <span>#{pos} • {getLocalizedCategory(s.primary_category || '', true)}</span>
            <span className="font-mono text-on-surface-variant">{(s.importance_score ?? 0).toFixed(1)} • {ago(s.published_at)}</span>
          </div>
          <div className={`mt-1 font-serif text-primary leading-snug ${size === 'lg' ? 'text-xl font-bold' : size === 'md' ? 'text-base font-semibold' : 'text-sm'}`}>{t}</div>
        </div>
      </button>
    );
  };
  const s = rankedStories;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display-headline text-2xl font-bold text-primary">Front page</h1>
        <p className="font-sans text-xs text-on-surface-variant">
          Stories are placed automatically by score and age. Click a story to edit it or change its score in the editor's Placement controls.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-3">
          <h2 className="font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Left column</h2>
          {card(s[1], 'md', 2)}
          {card(s[2], 'md', 3)}
        </div>
        <div className="lg:col-span-6 space-y-3">
          <h2 className="font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Lead story</h2>
          {card(s[0], 'lg', 1)}
        </div>
        <div className="lg:col-span-3 space-y-3">
          <h2 className="font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Latest news (wire)</h2>
          {[3, 4, 5, 6].map((i) => <div key={i}>{card(s[i], 'sm', i + 1)}</div>)}
        </div>
      </div>
      <div>
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Lower grid</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {s.slice(7, 13).map((st, i) => <div key={st.story_id}>{card(st, 'sm', i + 8)}</div>)}
        </div>
      </div>
    </div>
  );
};
