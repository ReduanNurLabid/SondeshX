import { CapsuleStory, Language } from '../types';

// Public address of the site. Change here (and in index.html / scripts/generate-seo.mjs)
// when a custom domain is connected.
export const SITE_URL = 'https://sondesh.web.app';

const SITE_NAME_BN = 'সন্দেশ এক্সপ্রেস';
const SITE_NAME_EN = 'Sondesh Express';
const HOME_TITLE_BN = 'সন্দেশ এক্সপ্রেস — এক মিনিটে বাংলাদেশ ও বিশ্বের খবর';
const HOME_TITLE_EN = 'Sondesh Express — Bangladesh and world news in a minute';
const HOME_DESC_BN =
  'বাংলাদেশ ও বিশ্বের দিনের গুরুত্বপূর্ণ খবর, এক মিনিটের সারাংশে। দেশের শীর্ষ সংবাদমাধ্যমের প্রতিবেদন থেকে এআইয়ের লেখা, মূল প্রতিবেদনের সঙ্গে মিলিয়ে যাচাই করা, প্রতি ঘণ্টায় হালনাগাদ।';
const HOME_DESC_EN =
  "The day's news from Bangladesh and the world in one-minute summaries, written by AI from leading outlets, checked against the original reports and updated every hour.";

/** Clean, shareable address of one story. */
export function storyPath(storyId: string): string {
  return `/story/${encodeURIComponent(storyId)}/`;
}

export function storyUrl(storyId: string): string {
  return `${SITE_URL}${storyPath(storyId)}`;
}

/** Story id from a /story/<id>/ address, or null. */
export function storyIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/story\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function trimTo(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Keeps the document title, description, canonical and share tags in step with
 * what the reader sees: the open story, or the front page.
 */
export function applyPageMeta(story: CapsuleStory | null, language: Language) {
  if (typeof document === 'undefined') return;
  const isBn = language === 'bn';
  document.documentElement.lang = isBn ? 'bn' : 'en';

  if (!story) {
    const title = isBn ? HOME_TITLE_BN : HOME_TITLE_EN;
    const desc = isBn ? HOME_DESC_BN : HOME_DESC_EN;
    document.title = title;
    setMeta('name', 'description', desc);
    setCanonical(`${SITE_URL}/`);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', `${SITE_URL}/`);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:image', `${SITE_URL}/og-image.png`);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', `${SITE_URL}/og-image.png`);
    return;
  }

  const buzz = story.daily_buzz;
  const headline = (isBn ? buzz.title_bn || buzz.title_en : buzz.title_en || buzz.title_bn) || '';
  const lead =
    (isBn ? buzz.lead_bn || buzz.summary_bn || buzz.lead_en : buzz.lead_en || buzz.summary_en || buzz.lead_bn) || '';
  const title = `${trimTo(headline, 90)} | ${isBn ? SITE_NAME_BN : SITE_NAME_EN}`;
  const desc = trimTo(lead, 160);
  const url = storyUrl(story.story_id);
  const image = story.image_url || `${SITE_URL}/og-image.png`;

  document.title = title;
  setMeta('name', 'description', desc);
  setCanonical(url);
  setMeta('property', 'og:type', 'article');
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:title', headline);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:title', headline);
  setMeta('name', 'twitter:description', desc);
  setMeta('name', 'twitter:image', image);
}
