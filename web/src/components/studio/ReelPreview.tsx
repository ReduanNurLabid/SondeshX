import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { CapsuleStory } from '../../types';
import { drawAutoReelFrame, AutoReelInput, ReelSegment } from '../../services/reelAutoEngine';
import { loadSafeCanvasImage } from '../../services/imageLoader';
import { getLocalizedCategory, toBanglaDigits } from '../../utils/bilingual';

// Mirrors pipeline/social/post_reel.py so the preview matches the posted Reel: the hook,
// one key point, a short end card; one music bed that dips under the voice, a whoosh on
// each cut and a page turn under the key point. The voice is not generated here (it costs
// Gemini quota); its timing is estimated from the text length and shown on screen.
const VOICE_START = 0.25;
const BEAT_GAP = 0.45;
const OUTRO_LEN = 1.5;
const SECONDS_PER_CHAR = 1 / 15; // brisk Bangla news-anchor pace
const MUSIC_TRACKS = ['/reel_music.mp3', '/reel_music_2.mp3'];
const MUSIC_START: Record<string, number> = { '/reel_music.mp3': 4, '/reel_music_2.mp3': 0 }; // the second track is 15 s and loops

/** Same choices as pipeline/social/post_reel.py: open with the hook, then all three key points. */
const reelHeadline = (s: CapsuleStory) => (s.daily_buzz as any).hook_bn || s.daily_buzz.title_bn || s.daily_buzz.title_en || '';
const reelPoints = (s: CapsuleStory) =>
  (s.daily_buzz.bullets_bn?.length ? s.daily_buzz.bullets_bn : s.daily_buzz.bullets_en || []).slice(0, 3);
/** Same track choice as post_reel.music_track. */
const musicFor = (s: CapsuleStory) =>
  MUSIC_TRACKS[Array.from(String(s.story_id)).reduce((n, ch) => n + (ch.codePointAt(0) || 0), 0) % MUSIC_TRACKS.length];
/** Prothom Alo share images carry a banner added through URL parameters; drop them. */
const cleanImage = (url: string) => (url.includes('media.prothomalo.com') ? `${url.split('?')[0]}?w=1200&auto=format%2Ccompress` : url);

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const bnDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return `${toBanglaDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBanglaDigits(d.getFullYear())}`;
};

interface Timeline {
  segments: ReelSegment[];
  duration: number;
  voice: { at: number; len: number }[];
  whooshes: number[];
  pageTurns: number[];
}

function buildTimeline(story: CapsuleStory): Timeline {
  const parts: { kind: ReelSegment['kind']; index?: number; text: string }[] = [
    { kind: 'headline', text: reelHeadline(story) },
    ...reelPoints(story).map((p, i) => ({ kind: 'point' as const, index: i, text: p })),
  ];
  const segments: ReelSegment[] = [];
  const voice: Timeline['voice'] = [];
  const whooshes: number[] = [];
  const pageTurns: number[] = [];
  let clock = 0;
  parts.forEach((p, n) => {
    const start = clock;
    if (n >= 1) {
      whooshes.push(Math.max(0, clock - 0.15));
      if (p.kind === 'point' && p.index === 0) pageTurns.push(clock + 0.05);
      clock += BEAT_GAP;
    } else {
      clock += VOICE_START;
    }
    const len = Math.max(1.5, p.text.length * SECONDS_PER_CHAR);
    voice.push({ at: clock, len });
    clock += len;
    segments.push({ kind: p.kind, start, end: clock, ...(p.index != null ? { index: p.index } : {}) });
  });
  whooshes.push(Math.max(0, clock - 0.15));
  segments.push({ kind: 'outro', start: clock, end: clock + OUTRO_LEN });
  clock += OUTRO_LEN;
  return { segments, duration: clock, voice, whooshes, pageTurns };
}

interface Props {
  stories: CapsuleStory[];
  /** Story to load first, e.g. when opened from a story's Video Reel button. */
  initialStoryId?: string | null;
}

export const ReelPreview: React.FC<Props> = ({ stories, initialStoryId }) => {
  const candidates = useMemo(
    () => {
      const usable = stories.filter((s) => s.daily_buzz?.title_bn && (s.daily_buzz.bullets_bn?.length ?? 0) >= 2);
      const top = usable.slice(0, 20);
      // Keep the story the editor came from in the list even if it is not among the top 20.
      const chosen = initialStoryId ? usable.find((s) => s.story_id === initialStoryId) : undefined;
      return chosen && !top.includes(chosen) ? [chosen, ...top] : top;
    },
    [stories, initialStoryId],
  );
  const [storyId, setStoryId] = useState<string>(initialStoryId || '');
  useEffect(() => { if (initialStoryId) setStoryId(initialStoryId); }, [initialStoryId]);
  const story = candidates.find((s) => s.story_id === storyId) || candidates[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<AutoReelInput | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; buffer: AudioBuffer | null; page: AudioBuffer | null; track: string } | null>(null);
  const [audioNote, setAudioNote] = useState('');
  const [loading, setLoading] = useState(true);
  const stopRef = useRef<() => void>(() => undefined);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const timeline = useMemo(() => (story ? buildTimeline(story) : null), [story]);

  // Prepare the drawing input (fonts, logo, publisher photo) whenever the story changes.
  useEffect(() => {
    if (!story || !timeline) return;
    let cancelled = false;
    stopRef.current();
    // Until the new story's photo has loaded, Play waits rather than showing the old story.
    inputRef.current = null;
    setLoading(true);
    (async () => {
      await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 48px "Hind Siliguri"`, 'বাংলা'))).catch(() => undefined);
      const logo = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/icon-512.png';
      });
      const url = story.image_url && !story.image_url.includes('unsplash.com') ? cleanImage(story.image_url) : null;
      const image = url ? await loadSafeCanvasImage(url).then((r) => (r.status === 'preview_only' ? null : r.image)).catch(() => null) : null;
      // A slower load for a story the editor has already left must not overwrite the new one.
      if (cancelled) return;
      const b = story.daily_buzz;
      const names = Array.from(new Set((story.sources || []).map((s) => s.name).filter(Boolean))).slice(0, 3);
      inputRef.current = {
        headline: reelHeadline(story),
        points: reelPoints(story),
        sourceLine: names.length ? `সূত্র: ${names.join(', ')}` : '',
        category: getLocalizedCategory(story.primary_category || '', true),
        dateLine: bnDate(story.published_at),
        kicker: (b as any).kicker_bn || '',
        image,
        logo,
        segments: timeline.segments,
        duration: timeline.duration,
      };
      setLoading(false);
      draw(2.5);
    })();
    return () => { cancelled = true; };
  }, [story?.story_id, timeline]);

  const draw = (t: number) => {
    const c = canvasRef.current;
    if (!c || !inputRef.current) return;
    drawAutoReelFrame(c.getContext('2d')!, inputRef.current, t);
    setNow(t);
  };

  const play = async () => {
    if (!timeline || !inputRef.current || !story) return;
    const track = musicFor(story);
    if (!audioRef.current || audioRef.current.track !== track) {
      const ctx = audioRef.current?.ctx || new AudioContext();
      const load = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((d) => ctx.decodeAudioData(d));
      // A browser download-manager extension can swallow .mp3 requests (empty 204 reply);
      // the preview then plays without music instead of not playing at all.
      const [buffer, page] = await Promise.all([load(track).catch(() => null), load('/sfx_page.mp3').catch(() => null)]);
      setAudioNote(buffer ? '' : 'Music could not load in this browser (an extension may be blocking .mp3 files); playing without music.');
      audioRef.current = { ctx, buffer, page, track };
    }
    const { ctx, buffer, page } = audioRef.current;
    await ctx.resume();
    const t0 = ctx.currentTime + 0.1;
    const sources: AudioScheduledSourceNode[] = [];

    // Music bed under the whole Reel; it dips while the (estimated) voice speaks.
    if (buffer) {
    const bed = ctx.createBufferSource();
    const bedGain = ctx.createGain();
    bed.buffer = buffer;
    bed.loop = true;
    bed.connect(bedGain).connect(ctx.destination);
    bedGain.gain.setValueAtTime(0.0001, t0);
    bedGain.gain.linearRampToValueAtTime(0.5, t0 + 0.3);
    for (const v of timeline.voice) {
      bedGain.gain.setTargetAtTime(0.14, t0 + v.at, 0.03);
      bedGain.gain.setTargetAtTime(0.5, t0 + v.at + v.len, 0.15);
    }
    bedGain.gain.setTargetAtTime(0.0001, t0 + timeline.duration - 1, 0.3);
    bed.start(t0, MUSIC_START[track] ?? 0);
    bed.stop(t0 + timeline.duration);
    sources.push(bed);
    }

    // Whoosh: a short burst of filtered noise on each cut.
    const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    for (const at of timeline.whooshes) {
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.6;
      src.connect(bp).connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.linearRampToValueAtTime(0.35, t0 + at + 0.28);
      g.gain.linearRampToValueAtTime(0.0001, t0 + at + 0.5);
      src.start(t0 + at);
      sources.push(src);
    }
    if (page) {
      for (const at of timeline.pageTurns) {
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = page;
        g.gain.value = 2.5;
        src.connect(g).connect(ctx.destination);
        src.start(t0 + at, 3.0, 0.8); // the clearest flip in the recording
        sources.push(src);
      }
    }
    let raf = 0;
    const tick = () => {
      const t = ctx.currentTime - t0;
      if (t >= timeline.duration) return stop();
      draw(Math.max(0, t));
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
      setPlaying(false);
    };
    stopRef.current = stop;
    setPlaying(true);
    raf = requestAnimationFrame(tick);
  };

  if (!candidates.length || !timeline) return null;
  const voiceNow = timeline.voice.some((v) => now >= v.at && now < v.at + v.len);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="border border-primary/30 bg-surface-container-high p-4">
        <h2 className="font-sans text-xs font-bold uppercase tracking-wider text-primary mb-1">Reel preview</h2>
        <p className="font-sans text-xs text-on-surface-variant mb-3">
          Plays the Reel as it will be posted: the hook on screen from the first frame, the three key points and a short end card, with the music bed (it dips under the voice), a whoosh on each cut and a page turn under the first key point.
          The voice is not generated in the preview; where it would speak, a "Voice" marker shows and the timing is estimated.
        </p>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative shrink-0" style={{ width: 270 }}>
            <canvas ref={canvasRef} width={1080} height={1920} style={{ width: 270, height: 480 }} className="bg-black block" />
            {playing && voiceNow && (
              <span className="absolute top-14 left-1/2 -translate-x-1/2 bg-secondary text-on-secondary font-sans text-[10px] font-bold px-2 py-0.5 rounded">
                Voice
              </span>
            )}
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <label className="block font-sans text-xs font-semibold text-on-surface-variant">
              Story
              <select
                value={story?.story_id}
                onChange={(e) => setStoryId(e.target.value)}
                className="mt-1 block w-full border border-primary/30 bg-background px-2 py-1.5 font-serif text-sm text-primary"
              >
                {candidates.map((s) => (
                  <option key={s.story_id} value={s.story_id}>{s.daily_buzz.title_bn}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              {!playing ? (
                <button onClick={play} disabled={loading} className="flex items-center gap-1.5 bg-primary text-background px-4 py-2 font-sans text-xs font-bold uppercase cursor-pointer disabled:opacity-50 disabled:cursor-wait">
                  <Play className="w-4 h-4" /> {loading ? 'Loading…' : 'Play preview'}
                </button>
              ) : (
                <button onClick={() => stopRef.current()} className="flex items-center gap-1.5 border border-primary px-4 py-2 font-sans text-xs font-bold uppercase text-primary cursor-pointer">
                  <Square className="w-4 h-4" /> Stop
                </button>
              )}
              <span className="font-mono text-xs text-on-surface-variant">
                {now.toFixed(1)}s / {timeline.duration.toFixed(1)}s
              </span>
            </div>
            {audioNote && <p className="font-sans text-xs text-error">{audioNote}</p>}
            <input
              type="range" min={0} max={timeline.duration} step={0.1} value={now}
              disabled={playing}
              onChange={(e) => draw(parseFloat(e.target.value))}
              className="w-full"
            />
            <ol className="font-sans text-xs text-on-surface-variant space-y-0.5">
              {timeline.segments.map((s, i) => (
                <li key={i}>
                  <span className="font-mono">{s.start.toFixed(1)}–{s.end.toFixed(1)}s</span>{' '}
                  {s.kind === 'intro' ? 'Intro' : s.kind === 'headline' ? 'Hook on screen + voice, music dips under it' : s.kind === 'point' ? `Whoosh${s.index === 0 ? ' + page turn' : ''}, key point ${(s.index ?? 0) + 1} (voice)` : 'Whoosh, end card (logo, link in comments)'}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
};
