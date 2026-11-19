import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ImagePlus, Send, Clock, X, CheckCircle2, AlertTriangle, Loader2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { db } from '../../services/firebase';
import { CapsuleStory } from '../../types';

/**
 * Publish a Reel from the Studio with the editor's own choices:
 *  - text: the hook, the label above it and the three key points (empty = the AI's version)
 *  - photos: 1-4, reorderable, one behind each beat (empty = the publisher photo) + credit
 *  - voice on/off, music mood, caption (automatic or custom), Facebook and/or Instagram
 * Everything except the caption and platforms shows in the preview right away (via
 * onEditsChange / onPhotosChange). Publish writes a request to Firestore (studio_requests,
 * editors only); the Telegram job picks it up, renders the Reel with these choices and posts
 * it. Progress shows here and on Telegram.
 *
 * Photos are shrunk in the browser (longest side 1280 px, JPEG) so four photos stay under
 * Firestore's 1 MB document limit without paid file storage.
 */

export interface StudioEdits {
  hook: string;
  kicker: string;
  points: string[];
  music: string; // 'auto' or a mood
  voice: boolean;
}

const MAX_PHOTOS = 4;
const DOC_BUDGET = 850_000; // bytes of base64 photos per request (rest: text fields)
const MOODS: [string, string][] = [
  ['auto', 'Automatic (by the story)'],
  ['breaking', 'Breaking / urgent'],
  ['serious', 'Serious news'],
  ['business', 'Business'],
  ['climate', 'Weather / climate'],
  ['uplifting', 'Uplifting'],
  ['sports', 'Sports'],
];
const LINK_LINE = 'পুরো খবরের লিংক কমেন্টে 👇';

function shrink(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('This file is not an image.'));
    img.src = URL.createObjectURL(file);
  });
}

async function shrinkAll(files: File[], budget: number): Promise<string[]> {
  // Lower size and quality until the photos fit in what is left of one request.
  for (const [side, q] of [[1280, 0.8], [1100, 0.7], [960, 0.62], [800, 0.55]] as const) {
    const out = await Promise.all(files.map((f) => shrink(f, side, q)));
    if (out.reduce((n, s) => n + s.length, 0) <= budget) return out;
  }
  throw new Error('The photos are too large together. Try fewer photos.');
}

function draftCaption(story: CapsuleStory, edits: StudioEdits): string {
  const b: any = story.daily_buzz;
  const parts = [b.title_bn, `💬 ${b.question_bn || 'এ বিষয়ে আপনার মতামত কী? কমেন্টে জানান।'}`];
  if (b.lead_bn || b.summary_bn) parts.push(b.lead_bn || b.summary_bn);
  const pts = edits.points.map((p) => p.trim()).filter(Boolean);
  if (pts.length) parts.push(pts.map((p) => `▪️ ${p}`).join('\n'));
  const names = Array.from(new Set((story.sources || []).map((s) => s.name).filter(Boolean))).slice(0, 3);
  if (names.length) parts.push(`সূত্র: ${names.join(', ')}`);
  parts.push(LINK_LINE);
  const tags = ['#সন্দেশএক্সপ্রেস', ...(story.tags || []).slice(0, 4).map((t) => (t.startsWith('#') ? t : `#${t}`))];
  parts.push(tags.join(' '));
  return parts.join('\n\n');
}

interface RequestRow {
  id: string;
  story_title?: string;
  mode?: string;
  status?: string;
  photo_count?: number;
  fb_url?: string | null;
  instagram?: boolean;
  platforms?: string[];
  error?: string;
}

const STATUS_TEXT: Record<string, string> = {
  queued: 'Waiting for the pipeline (up to 5 min)',
  rendering: 'Rendering the Reel…',
  rendered: 'Rendered, posting…',
  waiting_slot: 'Ready, will post at the next Reel slot',
  posted: 'Posted',
  failed: 'Failed',
};

interface Props {
  story: CapsuleStory | undefined;
  onPhotosChange: (photos: string[]) => void;
  onEditsChange: (edits: StudioEdits) => void;
}

const label = 'block font-sans text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant';
const field = 'mt-1 block w-full border border-primary/30 bg-background px-2 py-1.5 font-serif text-sm text-primary';

export const StudioPublish: React.FC<Props> = ({ story, onPhotosChange, onEditsChange }) => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [credit, setCredit] = useState('');
  const [edits, setEdits] = useState<StudioEdits>({ hook: '', kicker: '', points: ['', '', ''], music: 'auto', voice: true });
  const [captionMode, setCaptionMode] = useState<'auto' | 'custom'>('auto');
  const [caption, setCaption] = useState('');
  const [platforms, setPlatforms] = useState({ facebook: true, instagram: true });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<RequestRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromStory = (st: CapsuleStory): StudioEdits => {
    const b: any = st.daily_buzz;
    const pts = (b.bullets_bn || []).slice(0, 3);
    return { hook: b.hook_bn || b.title_bn || '', kicker: b.kicker_bn || '', points: [0, 1, 2].map((i) => pts[i] || ''),
      music: 'auto', voice: true };
  };

  // A new story starts from the AI's text, without photos and with the automatic caption.
  useEffect(() => {
    if (!story) return;
    const e = fromStory(story);
    setEdits(e);
    onEditsChange(e);
    setPhotos([]);
    onPhotosChange([]);
    setCredit('');
    setCaptionMode('auto');
    setCaption('');
    setNote('');
  }, [story?.story_id]);

  useEffect(() => {
    const q = query(collection(db, 'studio_requests'), orderBy('created_at', 'desc'), limit(5));
    return onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => undefined);
  }, []);

  const update = (patch: Partial<StudioEdits>) => {
    const next = { ...edits, ...patch };
    setEdits(next);
    onEditsChange(next);
  };
  const setPhotoList = (next: string[]) => { setPhotos(next); onPhotosChange(next); };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setNote('');
    const files = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, MAX_PHOTOS - photos.length);
    try {
      setBusy(true);
      const used = photos.reduce((n, s) => n + s.length, 0);
      setPhotoList([...photos, ...(await shrinkAll(files, DOC_BUDGET - used))]);
    } catch (err: any) {
      setNote(err?.message || 'Could not read the photos.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotoList(next);
  };

  const chosen = (Object.keys(platforms) as ('facebook' | 'instagram')[]).filter((k) => platforms[k]);

  const publish = async (mode: 'now' | 'slot') => {
    if (!story) return;
    if (!chosen.length) { setNote('Choose Facebook, Instagram or both.'); return; }
    const where = chosen.map((p) => (p === 'facebook' ? 'Facebook' : 'Instagram')).join(' + ');
    const what = photos.length ? `${photos.length} photo(s)` : 'the publisher photo';
    if (!window.confirm(`${mode === 'now' ? 'Post now' : 'Post at the next Reel slot'} to ${where}, with ${what}, ${edits.voice ? 'voiced' : 'music only'}?\n\n${story.daily_buzz.title_bn}`)) return;
    try {
      setBusy(true);
      await addDoc(collection(db, 'studio_requests'), {
        story_id: story.story_id,
        story_title: story.daily_buzz.title_bn,
        mode,
        photos,
        photo_count: photos.length,
        credit: credit.trim(),
        edits: { hook: edits.hook.trim(), kicker: edits.kicker.trim(), points: edits.points.map((p) => p.trim()), music: edits.music },
        voice: edits.voice,
        caption: captionMode === 'custom' ? caption.trim() : '',
        platforms: chosen,
        status: 'queued',
        created_at: new Date().toISOString(),
      });
      setNote(mode === 'now'
        ? 'Sent. It is rendered and posted within a few minutes; progress shows below and on Telegram.'
        : 'Sent. It posts at the next Reel slot; progress shows below and on Telegram.');
      setPhotoList([]);
      setCredit('');
    } catch (err: any) {
      setNote(`Could not send: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  if (!story) return null;
  return (
    <div className="border-t border-primary/20 pt-3 mt-1 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-primary">Customize &amp; publish</h3>
        <button onClick={() => { const e = fromStory(story); setEdits(e); onEditsChange(e); }}
          className="flex items-center gap-1 font-sans text-[11px] text-on-surface-variant hover:text-primary cursor-pointer">
          <RotateCcw className="w-3 h-3" /> Reset text
        </button>
      </div>

      {/* 1. text on screen */}
      <label className={label}>Hook (shown big from the first frame)
        <input value={edits.hook} onChange={(e) => update({ hook: e.target.value })} className={field} maxLength={90} />
      </label>
      <label className={label}>Label above the hook (optional, e.g. নতুন তারিখ)
        <input value={edits.kicker} onChange={(e) => update({ kicker: e.target.value })} className={field} maxLength={24} />
      </label>
      {edits.points.map((p, i) => (
        <label key={i} className={label}>Key point {i + 1}{i > 0 ? ' (leave empty to skip)' : ''}
          <textarea value={p} rows={2} onChange={(e) => { const pts = [...edits.points]; pts[i] = e.target.value; update({ points: pts }); }}
            className={field} maxLength={220} />
        </label>
      ))}

      {/* 2-3. voice and music */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 font-sans text-xs text-primary cursor-pointer">
          <input type="checkbox" checked={edits.voice} onChange={(e) => update({ voice: e.target.checked })} />
          Voiceover (off = music only)
        </label>
        <label className={label}>Music
          <select value={edits.music} onChange={(e) => update({ music: e.target.value })} className={`${field} font-sans text-xs`}>
            {MOODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>

      {/* 4. photos, reorderable */}
      <div>
        <span className={label}>Photos (optional, 1–4: first behind the hook, then one per key point)</span>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {photos.map((ph, i) => (
            <div key={i} className="relative w-16 h-24 border border-primary/30 overflow-hidden">
              <img src={ph} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
              <span className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1">{i + 1}</span>
              <button onClick={() => setPhotoList(photos.filter((_, j) => j !== i))} aria-label="Remove photo"
                className="absolute top-0 right-0 bg-black/70 text-white p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/60">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier"
                  className="text-white p-0.5 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Move later"
                  className="text-white p-0.5 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-16 h-24 border border-dashed border-primary/50 flex flex-col items-center justify-center text-primary text-[10px] gap-1 cursor-pointer disabled:opacity-50">
              <ImagePlus className="w-4 h-4" /> Add
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>
        {photos.length > 0 && (
          <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Photo credit, e.g. প্রথম আলো (shown as ছবি: …)"
            className={`${field} font-sans text-xs mt-2`} />
        )}
      </div>

      {/* 5. caption */}
      <div>
        <span className={label}>Caption</span>
        <div className="flex gap-4 mt-1 font-sans text-xs text-primary">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={captionMode === 'auto'} onChange={() => setCaptionMode('auto')} /> Automatic
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={captionMode === 'custom'}
              onChange={() => { setCaptionMode('custom'); if (!caption) setCaption(draftCaption(story, edits)); }} /> Custom
          </label>
        </div>
        {captionMode === 'custom' && (
          <>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={9} className={`${field} font-sans text-xs`} />
            <p className="font-sans text-[11px] text-on-surface-variant mt-1">
              Keep “{LINK_LINE}” for Facebook (Instagram swaps it for “link in profile”). Music and photo credits are added automatically.
            </p>
          </>
        )}
      </div>

      {/* 6. where to post */}
      <div className="flex items-center gap-4 font-sans text-xs text-primary">
        <span className={label}>Post to</span>
        {(['facebook', 'instagram'] as const).map((p) => (
          <label key={p} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={platforms[p]} onChange={(e) => setPlatforms({ ...platforms, [p]: e.target.checked })} />
            {p === 'facebook' ? 'Facebook' : 'Instagram'}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => publish('now')} disabled={busy || !chosen.length}
          className="flex items-center gap-1.5 bg-secondary text-on-secondary px-4 py-2 font-sans text-xs font-bold uppercase cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publish now
        </button>
        <button onClick={() => publish('slot')} disabled={busy || !chosen.length}
          className="flex items-center gap-1.5 border border-primary px-4 py-2 font-sans text-xs font-bold uppercase text-primary cursor-pointer disabled:opacity-50">
          <Clock className="w-4 h-4" /> Next slot
        </button>
      </div>
      {note && <p className="font-sans text-xs text-on-surface-variant">{note}</p>}

      {rows.length > 0 && (
        <ul className="font-sans text-xs space-y-1 pt-1 border-t border-primary/10">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-1.5 pt-1">
              {r.status === 'posted' ? <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0 mt-0.5" />
                : r.status === 'failed' ? <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                : <Loader2 className="w-3.5 h-3.5 animate-spin text-on-surface-variant shrink-0 mt-0.5" />}
              <span className="min-w-0">
                <span className="text-primary">{(r.story_title || '').slice(0, 60)}</span>
                <span className="text-on-surface-variant"> · {r.photo_count ? `${r.photo_count} photo(s)` : 'publisher photo'} · {STATUS_TEXT[r.status || ''] || r.status}</span>
                {r.status === 'posted' && (
                  <> · {r.fb_url ? <a href={r.fb_url} target="_blank" rel="noreferrer" className="underline text-secondary">Facebook</a> : null}
                    {r.instagram ? `${r.fb_url ? ' + ' : ''}Instagram` : ''}</>
                )}
                {r.status === 'failed' && r.error && <span className="text-error"> · {r.error.slice(0, 120)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
