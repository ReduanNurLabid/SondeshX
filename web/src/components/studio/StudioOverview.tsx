import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, ExternalLink, Film, Globe2, Newspaper,
  RefreshCw, ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { db } from '../../services/firebase';
import { calculateDynamicRank } from '../../services/api';
import { getLocalizedCategory } from '../../utils/bilingual';

export type StudioSection = 'overview' | 'stories' | 'frontpage' | 'affairs' | 'social' | 'settings';

interface StoryDoc {
  story_id: string;
  primary_category?: string;
  region?: string;
  image_url?: string | null;
  published_at?: string;
  importance_score?: number;
  social_appeal?: number;
  outlet_count?: number;
  trending?: boolean;
  fact_check?: { status?: string };
  daily_buzz?: { title_bn?: string; title_en?: string; bullets_bn?: string[] };
}

interface ReelDoc {
  story_id: string;
  headline?: string;
  posted_at?: string;
  video_id?: string;
  comment_id?: string | null;
  insights?: { plays?: number };
}

interface Props {
  onNavigate: (section: StudioSection) => void;
  onOpenStory: (storyId: string) => void;
}

const HOUR = 3600 * 1000;
const ageMs = (iso?: string) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
const ago = (iso?: string) => {
  const m = Math.round(ageMs(iso) / 60000);
  if (!isFinite(m)) return '—';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min ago`;
  return `${Math.floor(m / 1440)} d ago`;
};
const title = (s: StoryDoc) => s.daily_buzz?.title_bn || s.daily_buzz?.title_en || s.story_id;
const hasPublisherPhoto = (s: StoryDoc) => !!s.image_url && !s.image_url.includes('unsplash.com');

// Same rule as pipeline/social/post_reel.py, so the preview matches what will be posted.
const reelScore = (s: StoryDoc) => {
  const imp = s.importance_score ?? 0;
  const appeal = s.social_appeal ?? imp;
  return 0.5 * imp + 0.5 * appeal + (hasPublisherPhoto(s) ? 0.5 : 0);
};

const LINKS = [
  { label: 'News pipeline runs', href: 'https://github.com/ReduanNurLabid/SondeshX/actions/workflows/pipeline_cron.yml' },
  { label: 'Facebook Reels runs', href: 'https://github.com/ReduanNurLabid/SondeshX/actions/workflows/facebook_reels.yml' },
  { label: 'Google Analytics', href: 'https://analytics.google.com/' },
  { label: 'Meta app (SondeshX)', href: 'https://developers.facebook.com/apps/1702860708116098/' },
  { label: 'Live site', href: 'https://sondesh.web.app/' },
];

export const StudioOverview: React.FC<Props> = ({ onNavigate, onOpenStory }) => {
  const [stories, setStories] = useState<StoryDoc[] | null>(null);
  const [reels, setReels] = useState<ReelDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      getDocs(query(collection(db, 'daily_buzz'), orderBy('published_at', 'desc'), limit(250))),
      getDocs(query(collection(db, 'social_posts'), orderBy('posted_at', 'desc'), limit(40))).catch(() => null),
    ])
      .then(([s, r]) => {
        setStories(s.docs.map((d) => ({ story_id: d.id, ...(d.data() as any) })));
        setReels(r ? r.docs.map((d) => ({ story_id: d.id, ...(d.data() as any) })) : []);
        setLoadedAt(new Date());
      })
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);

  const m = useMemo(() => {
    if (!stories) return null;
    const day = stories.filter((s) => ageMs(s.published_at) < 24 * HOUR);
    const newest = stories[0];
    const fc = { passed: 0, unchecked: 0, none: 0 };
    day.forEach((s) => {
      const st = s.fact_check?.status;
      if (st === 'passed') fc.passed++;
      else if (st === 'unchecked') fc.unchecked++;
      else fc.none++;
    });
    const national = day.filter((s) => (s.region || 'national') === 'national').length;
    const byCategory: Record<string, number> = {};
    day.forEach((s) => {
      const c = s.primary_category || 'other';
      byCategory[c] = (byCategory[c] || 0) + 1;
    });
    const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    const topNow = [...stories]
      .filter((s) => ageMs(s.published_at) < 30 * HOUR)
      .map((s) => ({ s, rank: calculateDynamicRank(s.importance_score ?? 2, s.published_at, 30) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 6);

    const posted = new Set(reels.map((r) => r.story_id));
    const nextReel = stories
      .filter((s) => ageMs(s.published_at) < 6 * HOUR && !posted.has(s.story_id))
      .filter((s) => s.fact_check?.status === 'passed' && (s.daily_buzz?.bullets_bn?.length ?? 0) >= 2)
      .filter((s) => (s.importance_score ?? 0) >= 6.5 && (s.social_appeal == null || s.social_appeal >= 6))
      .sort((a, b) => reelScore(b) - reelScore(a))[0];

    const reels24 = reels.filter((r) => ageMs(r.posted_at) < 24 * HOUR);
    const plays24 = reels24.reduce((sum, r) => sum + (r.insights?.plays || 0), 0);

    const attention: { kind: string; text: string; storyId?: string; href?: string }[] = [];
    if (ageMs(newest?.published_at) > 90 * 60 * 1000) {
      attention.push({ kind: 'Pipeline', text: `No new story for ${ago(newest?.published_at).replace(' ago', '')}. Check the pipeline runs.`, href: LINKS[0].href });
    }
    day.filter((s) => s.fact_check?.status === 'unchecked').slice(0, 5)
      .forEach((s) => attention.push({ kind: 'Unchecked', text: title(s), storyId: s.story_id }));
    reels.filter((r) => r.comment_id === null).slice(0, 3)
      .forEach((r) => attention.push({ kind: 'Reel link', text: `No link comment on “${r.headline || r.story_id}”`, href: r.video_id ? `https://www.facebook.com/reel/${r.video_id}` : undefined }));
    day.filter((s) => !hasPublisherPhoto(s) && (s.importance_score ?? 0) >= 8).slice(0, 3)
      .forEach((s) => attention.push({ kind: 'No photo', text: title(s), storyId: s.story_id }));

    return { day, newest, fc, national, categories, topNow, nextReel, reels24, plays24, attention };
  }, [stories, reels]);

  if (error) return <p className="font-sans text-sm text-red-600 p-6">Could not load the dashboard: {error}</p>;
  if (!m) {
    return (
      <div className="flex items-center gap-2 p-6 font-sans text-sm text-on-surface-variant">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading dashboard
      </div>
    );
  }

  const stale = ageMs(m.newest?.published_at) > 90 * 60 * 1000;
  const maxCat = Math.max(1, ...m.categories.map(([, n]) => n));

  const Tile: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'ok' | 'warn'; onClick?: () => void }> =
    ({ icon, label, value, note, tone, onClick }) => (
      <button
        type="button"
        onClick={onClick}
        className={`text-left border bg-surface-container p-4 transition-colors ${onClick ? 'hover:border-primary cursor-pointer' : 'cursor-default'} ${tone === 'warn' ? 'border-red-500/60' : 'border-primary/20'}`}
      >
        <div className="flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          {icon}
          {label}
        </div>
        <div className={`mt-2 font-sans text-3xl font-bold ${tone === 'warn' ? 'text-red-600' : 'text-primary'}`}>{value}</div>
        {note && <div className="mt-1 font-sans text-xs text-on-surface-variant">{note}</div>}
      </button>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display-headline text-2xl font-bold text-primary">Today at a glance</h1>
          <p className="font-sans text-xs text-on-surface-variant">
            Last 24 hours • updated {loadedAt?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 border border-primary/30 px-3 py-1.5 font-sans text-xs font-semibold text-primary hover:border-primary cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={<Newspaper className="w-3.5 h-3.5" />} label="Stories published" value={m.day.length}
          note={`${m.national} national • ${m.day.length - m.national} international`} onClick={() => onNavigate('stories')} />
        <Tile icon={<Clock className="w-3.5 h-3.5" />} label="Latest story" value={ago(m.newest?.published_at).replace(' ago', '')}
          note={stale ? 'Pipeline may have stalled' : 'ago • pipeline running'} tone={stale ? 'warn' : 'ok'} />
        <Tile icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Fact-check passed"
          value={m.day.length ? `${Math.round((100 * m.fc.passed) / m.day.length)}%` : '—'}
          note={`${m.fc.passed} passed • ${m.fc.unchecked} unchecked • ${m.fc.none} before checks`} tone={m.fc.unchecked > 3 ? 'warn' : 'ok'} />
        <Tile icon={<Film className="w-3.5 h-3.5" />} label="Reels today" value={m.reels24.length}
          note={`${m.plays24.toLocaleString()} plays so far`} onClick={() => onNavigate('social')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Front page now */}
        <section className="lg:col-span-2 border border-primary/20 bg-surface-container">
          <header className="flex items-center justify-between border-b border-primary/20 px-4 py-2.5">
            <h2 className="flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider text-primary">
              <TrendingUp className="w-4 h-4" /> Leading the front page now
            </h2>
            <button onClick={() => onNavigate('frontpage')} className="font-sans text-xs font-semibold text-secondary hover:underline cursor-pointer">Front page →</button>
          </header>
          <ol className="divide-y divide-primary/10">
            {m.topNow.map(({ s, rank }, i) => (
              <li key={s.story_id}>
                <button onClick={() => onOpenStory(s.story_id)} className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-surface-container-high cursor-pointer">
                  <span className="font-mono text-xs font-bold text-secondary w-5 shrink-0">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-serif text-sm text-primary leading-snug">{title(s)}</span>
                    <span className="block font-sans text-[11px] text-on-surface-variant mt-0.5">
                      {getLocalizedCategory(s.primary_category || '', true)} • score {(s.importance_score ?? 0).toFixed(1)}
                      {s.outlet_count ? ` • ${s.outlet_count} outlet${s.outlet_count === 1 ? '' : 's'}` : ''}{s.trending ? ' • trending' : ''} • {ago(s.published_at)}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-on-surface-variant shrink-0">{rank.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* Needs attention */}
        <section className="border border-primary/20 bg-surface-container">
          <header className="flex items-center gap-2 border-b border-primary/20 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-primary">
            <AlertTriangle className="w-4 h-4" /> Needs attention
          </header>
          {m.attention.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 font-sans text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" /> All clear
            </p>
          ) : (
            <ul className="divide-y divide-primary/10">
              {m.attention.map((a, i) => (
                <li key={i} className="px-4 py-2.5">
                  <span className="inline-block mb-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-red-600">{a.kind}</span>
                  {a.storyId ? (
                    <button onClick={() => onOpenStory(a.storyId!)} className="block text-left font-serif text-sm text-primary hover:underline cursor-pointer">{a.text}</button>
                  ) : a.href ? (
                    <a href={a.href} target="_blank" rel="noopener" className="block font-serif text-sm text-primary hover:underline">{a.text}</a>
                  ) : (
                    <span className="block font-serif text-sm text-primary">{a.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sections mix */}
        <section className="border border-primary/20 bg-surface-container">
          <header className="flex items-center gap-2 border-b border-primary/20 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-primary">
            <Activity className="w-4 h-4" /> Sections, last 24 hours
          </header>
          <ul className="px-4 py-3 space-y-2">
            {m.categories.map(([cat, n]) => (
              <li key={cat} className="font-sans text-xs">
                <div className="flex justify-between text-on-surface-variant mb-0.5">
                  <span>{getLocalizedCategory(cat, true)}</span>
                  <span className="font-mono">{n}</span>
                </div>
                <div className="h-2 bg-surface-container-high">
                  <div className="h-2 bg-secondary" style={{ width: `${(100 * n) / maxCat}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Next Reel */}
        <section className="border border-primary/20 bg-surface-container">
          <header className="flex items-center justify-between border-b border-primary/20 px-4 py-2.5">
            <h2 className="flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="w-4 h-4" /> Next Reel candidate
            </h2>
            <button onClick={() => onNavigate('social')} className="font-sans text-xs font-semibold text-secondary hover:underline cursor-pointer">Social →</button>
          </header>
          <div className="px-4 py-3">
            {m.nextReel ? (
              <>
                <button onClick={() => onOpenStory(m.nextReel!.story_id)} className="text-left font-serif text-sm text-primary hover:underline cursor-pointer">
                  {title(m.nextReel)}
                </button>
                <p className="mt-1 font-sans text-[11px] text-on-surface-variant">
                  Reel score {reelScore(m.nextReel).toFixed(1)} • importance {(m.nextReel.importance_score ?? 0).toFixed(1)}
                  {m.nextReel.social_appeal != null ? ` • appeal ${m.nextReel.social_appeal}` : ''}
                  {hasPublisherPhoto(m.nextReel) ? ' • has photo' : ' • no photo'}
                </p>
                <p className="mt-2 font-sans text-[11px] text-on-surface-variant">
                  The scheduled job also avoids repeating the last Reel's section, so it may pick the next best story.
                </p>
              </>
            ) : (
              <p className="font-sans text-sm text-on-surface-variant">No story qualifies right now. The next slot will be skipped unless a strong story arrives.</p>
            )}
          </div>
        </section>

        {/* Quick links */}
        <section className="border border-primary/20 bg-surface-container">
          <header className="flex items-center gap-2 border-b border-primary/20 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider text-primary">
            <Globe2 className="w-4 h-4" /> Quick links
          </header>
          <ul className="divide-y divide-primary/10">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener" className="flex items-center justify-between px-4 py-2.5 font-sans text-sm text-primary hover:bg-surface-container-high">
                  {l.label} <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
