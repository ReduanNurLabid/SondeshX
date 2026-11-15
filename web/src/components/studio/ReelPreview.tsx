import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { CapsuleStory } from '../../types';
import { drawAutoReelFrame, AutoReelInput, ReelSegment } from '../../services/reelAutoEngine';
import { loadSafeCanvasImage } from '../../services/imageLoader';
import { getLocalizedCategory, toBanglaDigits } from '../../utils/bilingual';

// Mirrors the sound design in pipeline/social/post_reel.py so the preview matches the
// posted Reel. The voice is not generated here (it costs Gemini quota); its timing is
// estimated from the text length and shown on screen.
const INTRO_FROM = 0.6, INTRO_LEN = 2.4;
const VOICE_START = 0.25;
const STING_LEN = 1.3, OUTRO_STING_LEN = 0.9;
const STING_FROM = [20, 32, 44, 56, 68];
const TAIL_FROM = 80, TAIL_LEN = 2.2;
const OUTRO_TEXT = 'পুরো খবর কমেন্টের লিংকে।';
const SECONDS_PER_CHAR = 1 / 13; // Bangla newsreader pace

/** Same choices as pipeline/social/post_reel.py: open with the hook, 1 point (2 for big stories). */
const reelHeadline = (s: CapsuleStory) => (s.daily_buzz as any).hook_bn || s.daily_buzz.title_bn || s.daily_buzz.title_en || '';
const reelPoints = (s: CapsuleStory) => {
  const pts = (s.daily_buzz.bullets_bn?.length ? s.daily_buzz.bullets_bn : s.daily_buzz.bullets_en || []);
  return pts.slice(0, (s.importance_score ?? 0) >= 8 ? 2 : 1);
};

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const bnDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return `${toBanglaDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBanglaDigits(d.getFullYear())}`;
};

interface Timeline {
  segments: ReelSegment[];
  duration: number;
  music: { at: number; from: number; len: number; fadeIn: number; fadeOut: number; gain: number }[];
  voice: { at: number; len: number }[];
}

function buildTimeline(story: CapsuleStory): Timeline {
  const parts: { kind: ReelSegment['kind']; index?: number; text: string }[] = [
    { kind: 'headline', text: reelHeadline(story) },
    ...reelPoints(story).map((p, i) => ({ kind: 'point' as const, index: i, text: p })),
    { kind: 'outro', text: OUTRO_TEXT },
  ];
  const segments: ReelSegment[] = [];
  const music: Timeline['music'] = [{ at: 0, from: INTRO_FROM, len: INTRO_LEN, fadeIn: 0.05, fadeOut: 1.0, gain: 0.5 }];
  const voice: Timeline['voice'] = [];
  let clock = 0;
  parts.forEach((p, n) => {
    const start = clock;
    if (n >= 1) {
      const len = p.kind === 'outro' ? OUTRO_STING_LEN : STING_LEN;
      music.push({ at: clock, from: STING_FROM[(n - 1) % STING_FROM.length], len, fadeIn: 0.3, fadeOut: 0.6, gain: 0.85 });
      clock += len;
    } else {
      clock += VOICE_START;
    }
    const len = Math.max(1.5, p.text.length * SECONDS_PER_CHAR);
    voice.push({ at: clock, len });
    clock += len;
    segments.push({ kind: p.kind, start, end: clock, ...(p.index != null ? { index: p.index } : {}) });
  });
  music.push({ at: clock, from: TAIL_FROM, len: TAIL_LEN, fadeIn: 0.3, fadeOut: 1.2, gain: 0.9 });
  clock += TAIL_LEN;
  segments[segments.length - 1].end = clock;
  return { segments, duration: clock, music, voice };
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
  const audioRef = useRef<{ ctx: AudioContext; buffer: AudioBuffer } | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const timeline = useMemo(() => (story ? buildTimeline(story) : null), [story]);

  // Prepare the drawing input (fonts, logo, publisher photo) whenever the story changes.
  useEffect(() => {
    if (!story || !timeline) return;
    let cancelled = false;
    stopRef.current();
    (async () => {
      await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 48px "Hind Siliguri"`, 'বাংলা'))).catch(() => undefined);
      const logo = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/icon-512.png';
      });
      const url = story.image_url && !story.image_url.includes('unsplash.com') ? story.image_url : null;
      const image = url ? await loadSafeCanvasImage(url).then((r) => (r.status === 'preview_only' ? null : r.image)).catch(() => null) : null;
      const b = story.daily_buzz;
      const names = Array.from(new Set((story.sources || []).map((s) => s.name).filter(Boolean))).slice(0, 3);
      inputRef.current = {
        headline: reelHeadline(story),
        points: reelPoints(story),
        sourceLine: names.length ? `সূত্র: ${names.join(', ')}` : '',
        category: getLocalizedCategory(story.primary_category || '', true),
        dateLine: bnDate(story.published_at),
        image,
        logo,
        segments: timeline.segments,
        duration: timeline.duration,
      };
      if (!cancelled) draw(2.5);
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
    if (!timeline || !inputRef.current) return;
    if (!audioRef.current) {
      const ctx = new AudioContext();
      const data = await fetch('/reel_music.mp3').then((r) => r.arrayBuffer());
      audioRef.current = { ctx, buffer: await ctx.decodeAudioData(data) };
    }
    const { ctx, buffer } = audioRef.current;
    await ctx.resume();
    const t0 = ctx.currentTime + 0.1;
    const sources: AudioBufferSourceNode[] = [];
    for (const m of timeline.music) {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      src.connect(gain).connect(ctx.destination);
      const start = t0 + m.at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(m.gain, start + m.fadeIn);
      gain.gain.setValueAtTime(m.gain, start + m.len - m.fadeOut);
      gain.gain.linearRampToValueAtTime(0.0001, start + m.len);
      src.start(start, m.from, m.len);
      sources.push(src);
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
          Plays the Reel with the real music: it opens on the news, with a short sting before each point and the logo at the end.
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
                <button onClick={play} className="flex items-center gap-1.5 bg-primary text-background px-4 py-2 font-sans text-xs font-bold uppercase cursor-pointer">
                  <Play className="w-4 h-4" /> Play preview
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
                  {s.kind === 'intro' ? 'Intro' : s.kind === 'headline' ? 'Opening line on screen + voice, music under it' : s.kind === 'point' ? `Sting, then point ${(s.index ?? 0) + 1} (voice)` : 'Sting, outro (voice), music tail'}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
};
