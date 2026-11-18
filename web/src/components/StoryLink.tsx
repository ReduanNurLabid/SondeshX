import React from 'react';
import { useApp } from '../context/AppContext';
import { CapsuleStory } from '../types';
import { storyPath } from '../utils/seo';

/**
 * A real link to a story's own page (/story/<id>/), so search engines can follow it
 * and readers can open it in a new tab or copy it. A plain click still opens the
 * story in place, without a page load.
 */
export const StoryLink: React.FC<{ story: CapsuleStory; className?: string; children: React.ReactNode }> = ({
  story,
  className,
  children,
}) => {
  const { openStory } = useApp();
  return (
    <a
      href={storyPath(story.story_id)}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation(); // cards that open the story on click would open it twice
        openStory(story);      }}
    >
      {children}
    </a>
  );
};
