import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { CapsuleStory } from '../../types';
import { CARD_H, CARD_W, drawPhotoCard, PhotoCardInput, PhotoCardLayout } from '../../services/photoCardEngine';
import { loadSafeCanvasImage } from '../../services/imageLoader';
import { getLocalizedCategory, toBanglaDigits } from '../../utils/bilingual';
import { storyUrl } from '../../utils/seo';

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const bnDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return `${toBanglaDigits(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBanglaDigits(d.getFullYear())}`;
};

/** Same caption style as the automatic Reels: the story itself, then the link. */
function buildCaption(story: CapsuleStory): string {
  const b = story.daily_buzz;
  const parts = [b.title_bn || b.title_en || ''];
  const lead = b.lead_bn || b.summary_bn;
  if (lead) parts.push(lead);
  const points = (b.bullets_bn || []).slice(0, 3);
  if (points.length) parts.push(points.map((p) => `▪️ ${p}`).join('\n'));
  const names = Array.from(new Set((story.sources || []).map((s) => s.name).filter(Boolean))).slice(0, 3);
  if (names.length) parts.push(`সূত্র: ${names.join(', ')}`);
  parts.push(`📰 পুরো খবর: ${storyUrl(story.story_id)}?utm_source=facebook&utm_medium=photo_card`);
  parts.push('#সন্দেশএক্সপ্রেস #বাংলাদেশ #খবর');
  return parts.join('\n\n');
}

interface Props {
  stories: CapsuleStory[];
  initialStoryId?: string | null;
}

export const PhotoCardPanel: React.FC<Props> = ({ stories, initialStoryId }) => {
  const candidates = useMemo(() => {
    const usable = stories.filter((s) => s.daily_buzz?.title_bn);
    const top = usable.slice(0, 20);
    const chosen = initialStoryId ? usable.find((s) => s.story_id === initialStoryId) : undefined;
    return chosen && !top.includes(chosen) ? [chosen, ...top] : top;
  }, [stories, initialStoryId]);
  const [storyId, setStoryId] = useState<string>(initialStoryId || '');
  useEffect(() => { if (initialStoryId) setStoryId(initialStoryId); }, [initialStoryId]);
  const story = candidates.find((s) => s.story_id === storyId) || candidates[0];
  const [layout, setLayout] = useState<PhotoCardLayout>('story');
  const [photoNote, setPhotoNote] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!story) return;
    let cancelled = false;
    (async () => {
      await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 48px "Hind Siliguri"`, 'বাংলা'))).catch(() => undefined);
      const logo = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/icon-512.png';
      });
      // Publisher photos only: stock photos can put unrelated people next to named individuals.
      const url = story.image_url && !story.image_url.includes('unsplash.com') ? story.image_url : null;
      let image: HTMLImageElement | null = null;
      if (url) {
        const r = await loadSafeCanvasImage(url).catch(() => null);
        image = r && r.status !== 'preview_only' ? r.image : null;
        setPhotoNote(image ? '' : 'The publisher blocks using this photo in a downloadable image, so the card uses the branded background.');
      } else {
        setPhotoNote('No publisher photo for this story, so the card uses the branded background.');
      }
      const b = story.daily_buzz;
      const names = Array.from(new Set((story.sources || []).map((s) => s.name).filter(Boolean))).slice(0, 3);
      const input: PhotoCardInput = {
        layout,
        headline: b.title_bn || b.title_en || '',
        points: (b.bullets_bn?.length ? b.bullets_bn : b.bullets_en || []).slice(0, 3),
        category: getLocalizedCategory(story.primary_category || '', true),
        dateLine: bnDate(story.published_at),
        sourceLine: names.length ? `সূত্র: ${names.join(', ')}` : '',
        image,
        logo,
      };
      if (!cancelled && canvasRef.current) drawPhotoCard(canvasRef.current.getContext('2d')!, input);
    })();
    return () => { cancelled = true; };
  }, [story?.story_id, layout]);

  const download = () => {
    const c = canvasRef.current;
    if (!c || !story) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sondesh-${layout}-${story.story_id.slice(0, 8)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };

  const copyCaption = async () => {
    if (!story) return;
    await navigator.clipboard.writeText(buildCaption(story));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!candidates.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="border border-primary/30 bg-surface-container-high p-4">
        <h2 className="font-sans text-xs font-bold uppercase tracking-wider text-primary mb-1">Photo card</h2>
        <p className="font-sans text-xs text-on-surface-variant mb-3">
          A 4:5 image for Facebook and Instagram in the same look as the Reels. Download it and copy the caption,
          which already includes the story link.
        </p>
        <div className="flex flex-col md:flex-row gap-4">
          <canvas ref={canvasRef} width={CARD_W} height={CARD_H} style={{ width: 288, height: 360 }} className="bg-black shrink-0" />
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
            <div className="flex gap-1">
              {([['story', 'Headline + key points'], ['headline', 'Big headline']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setLayout(id)}
                  className={`px-3 py-1.5 font-sans text-xs font-bold uppercase border cursor-pointer ${layout === id ? 'bg-primary text-background border-primary' : 'border-primary/30 text-on-surface-variant hover:text-primary'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={download} className="flex items-center gap-1.5 bg-primary text-background px-4 py-2 font-sans text-xs font-bold uppercase cursor-pointer">
                <Download className="w-4 h-4" /> Download PNG
              </button>
              <button onClick={copyCaption} className="flex items-center gap-1.5 border border-primary px-4 py-2 font-sans text-xs font-bold uppercase text-primary cursor-pointer">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Caption copied' : 'Copy caption'}
              </button>
            </div>
            {photoNote && <p className="font-sans text-[11px] text-on-surface-variant">{photoNote}</p>}
          </div>
        </div>
      </div>
    </section>
  );
};
