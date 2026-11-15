import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Film, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { db } from '../services/firebase';
import { getLocalizedCategory } from '../utils/bilingual';

interface ReelPost {
  story_id: string;
  headline?: string;
  video_id?: string;
  posted_at?: string;
  category?: string;
  importance_score?: number;
  social_appeal?: number;
  comment_id?: string | null;
  platform?: string;
  post_id?: string;
  insights?: {
    plays?: number;
    total_plays?: number;
    reach?: number;
    clicks?: number;
    interactions?: number;
    avg_watch_ms?: number;
    reactions?: number;
    comments?: number;
    checked_at?: string;
  };
}

const fmt = (n?: number | null) => (n == null ? '—' : n.toLocaleString());

/** Reels posted by the automatic job, with the numbers Facebook reports a day later. */
export const ReelsPerformancePanel: React.FC<{ defaultOpen?: boolean }> = ({ defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [posts, setPosts] = useState<ReelPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || posts) return;
    getDocs(query(collection(db, 'social_posts'), orderBy('posted_at', 'desc'), limit(40)))
      .then((snap) => setPosts(snap.docs.map((d) => ({ story_id: d.id, ...(d.data() as any) }))))
      .catch((err) => setError(err.message));
  }, [open, posts]);

  const today = posts?.filter((p) => p.posted_at && Date.now() - new Date(p.posted_at).getTime() < 86400000).length ?? 0;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-3">
      <div className="border border-primary/30 bg-surface-container-high">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-primary cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Facebook posts performance (Reels and photo cards)
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {open && (
          <div className="border-t border-primary/20 px-4 py-4 space-y-3">
            <p className="font-serif text-xs text-on-surface-variant leading-relaxed">
              A Reel is posted every 2 hours from 7:40 AM to 11:40 PM when a strong enough story is available.
              Plays, watch time, reactions and comments are read from Facebook once a day. Visits to the site from these Reels
              appear in Google Analytics under source "facebook", medium "reel".
            </p>
            {error && <p className="font-sans text-xs text-red-600">Could not load: {error}</p>}
            {!posts && !error && (
              <div className="flex items-center gap-2 font-sans text-xs text-on-surface-variant">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading
              </div>
            )}
            {posts && (
              <>
                <p className="font-sans text-xs text-primary font-bold">
                  {posts.length} Reels recorded • {today} in the last 24 hours
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full font-sans text-xs border-collapse">
                    <thead>
                      <tr className="text-left text-on-surface-variant border-b border-primary/20">
                        <th className="py-1.5 pr-3">Posted</th>
                        <th className="py-1.5 pr-3">Type</th>
                        <th className="py-1.5 pr-3">Story</th>
                        <th className="py-1.5 pr-3">Section</th>
                        <th className="py-1.5 pr-3 text-right">Imp.</th>
                        <th className="py-1.5 pr-3 text-right">Appeal</th>
                        <th className="py-1.5 pr-3 text-right">Plays</th>
                        <th className="py-1.5 pr-3 text-right">Total plays / reach</th>
                        <th className="py-1.5 pr-3 text-right">Avg watch</th>
                        <th className="py-1.5 pr-3 text-right">Reactions</th>
                        <th className="py-1.5 text-right">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((p) => (
                        <tr key={p.story_id} className="border-b border-primary/10 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap text-on-surface-variant">
                            {p.posted_at ? new Date(p.posted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">{p.platform === 'facebook_photo' ? 'Photo' : 'Reel'}</td>
                          <td className="py-1.5 pr-3 min-w-[16rem]">
                            {p.video_id || p.post_id ? (
                              <a href={p.video_id ? `https://www.facebook.com/reel/${p.video_id}` : `https://www.facebook.com/${p.post_id}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                                {p.headline || p.story_id}
                              </a>
                            ) : (p.headline || p.story_id)}
                            {p.comment_id === null && <span className="ml-1 text-red-600">(no link comment)</span>}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">{p.category ? getLocalizedCategory(p.category, true) : '—'}</td>
                          <td className="py-1.5 pr-3 text-right">{p.importance_score?.toFixed(1) ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right">{p.social_appeal?.toFixed(0) ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-bold">{fmt(p.insights?.plays)}</td>
                          <td className="py-1.5 pr-3 text-right">{fmt(p.insights?.total_plays ?? p.insights?.reach)}</td>
                          <td className="py-1.5 pr-3 text-right">
                            {p.insights?.avg_watch_ms != null ? `${(p.insights.avg_watch_ms / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-right">{fmt(p.insights?.reactions)}</td>
                          <td className="py-1.5 text-right">{fmt(p.insights?.comments)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
