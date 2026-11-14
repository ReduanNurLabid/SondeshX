// Runs after `vite build`. Reads the latest published stories from Firestore and writes,
// into dist/:
//   story/<id>/index.html  a page per story with its own title, description, share image,
//                          NewsArticle structured data and the story text in the HTML
//   sitemap.xml            every story page, for search engines
//   news-sitemap.xml       stories from the last 48 hours, for Google News
//   feed.xml               RSS feed of the latest stories
// If Firestore cannot be reached the build still succeeds with a home-only sitemap.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://sondesh.web.app';
const SITE_NAME = 'সন্দেশ এক্সপ্রেস';
const PROJECT = 'dorpon-a99a6';
const MAX_STORIES = 400;
const NEWS_WINDOW_HOURS = 48;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

// ---------- Firestore REST (the collection is publicly readable) ----------
function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

async function fetchStories() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'daily_buzz' }],
      orderBy: [{ field: { fieldPath: 'published_at' }, direction: 'DESCENDING' }],
      limit: MAX_STORIES,
    },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firestore query failed: HTTP ${res.status}`);
  const rows = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split('/').pop(), ...fromFields(r.document.fields || {}) }))
    .filter((s) => s.is_active !== false && s.daily_buzz && (s.daily_buzz.title_bn || s.daily_buzz.title_en));
}

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const trimTo = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
};
const storyUrl = (id) => `${SITE_URL}/story/${encodeURIComponent(id)}/`;
const isoDate = (s) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const toJsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function storyFields(s) {
  const b = s.daily_buzz || {};
  const headline = b.title_bn || b.title_en || '';
  const lead = b.lead_bn || b.summary_bn || b.lead_en || b.summary_en || '';
  const bullets = (b.bullets_bn && b.bullets_bn.length ? b.bullets_bn : b.bullets_en) || [];
  const details = b.details_bn || b.details_en || '';
  const published = isoDate(s.published_at) || new Date().toISOString();
  const image = s.image_url || `${SITE_URL}/og-image.png`;
  const sources = (s.sources || []).filter((x) => x && x.url);
  return { headline, lead, bullets, details, published, image, sources, headlineEn: b.title_en || '' };
}

function buildHead(s) {
  const f = storyFields(s);
  const url = storyUrl(s.id);
  const desc = trimTo(f.lead, 160);
  const title = `${trimTo(f.headline, 90)} | ${SITE_NAME}`;
  const article = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: trimTo(f.headline, 110),
    alternativeHeadline: f.headlineEn || undefined,
    description: desc,
    image: [f.image],
    datePublished: f.published,
    dateModified: f.published,
    inLanguage: 'bn',
    mainEntityOfPage: url,
    url,
    articleSection: s.primary_category || undefined,
    keywords: (s.tags || []).map((t) => String(t).replace(/^#/, '')).join(', ') || undefined,
    author: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
    },
    isBasedOn: f.sources.map((src) => src.url),
  };
  return `<title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(trimTo(f.headline, 110))}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${esc(f.image)}" />
    <meta property="og:image:alt" content="${esc(trimTo(f.headline, 110))}" />
    <meta property="article:published_time" content="${esc(f.published)}" />
    <meta property="article:section" content="${esc(s.primary_category || '')}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(trimTo(f.headline, 110))}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(f.image)}" />
    <script type="application/ld+json">${toJsonLd(article)}</script>`;
}

// Readable story text inside #root: search engines and link previews see it at once,
// and React replaces it with the full app as soon as the script loads.
function buildBody(s) {
  const f = storyFields(s);
  const bullets = f.bullets.map((b) => `<li>${esc(b)}</li>`).join('');
  const sources = f.sources
    .map((src) => `<li><a href="${esc(src.url)}" rel="noopener nofollow">${esc(src.name || src.url)}</a></li>`)
    .join('');
  return `<article style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:'Hind Siliguri',sans-serif;line-height:1.7">
      <p><a href="/">${SITE_NAME}</a></p>
      <h1>${esc(f.headline)}</h1>
      <p><time datetime="${esc(f.published)}">${esc(new Date(f.published).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }))}</time></p>
      <p>${esc(f.lead)}</p>
      ${bullets ? `<ul>${bullets}</ul>` : ''}
      ${f.details ? `<p>${esc(f.details)}</p>` : ''}
      ${sources ? `<h2>সূত্র</h2><ul>${sources}</ul>` : ''}
    </article>`;
}

function sitemap(stories) {
  const urls = [`<url><loc>${SITE_URL}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`]
    .concat(stories.map((s) => `<url><loc>${esc(storyUrl(s.id))}</loc><lastmod>${storyFields(s).published}</lastmod></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function newsSitemap(stories) {
  const cutoff = Date.now() - NEWS_WINDOW_HOURS * 3600 * 1000;
  const recent = stories.filter((s) => new Date(storyFields(s).published).getTime() >= cutoff).slice(0, 1000);
  const items = recent.map((s) => {
    const f = storyFields(s);
    return `<url><loc>${esc(storyUrl(s.id))}</loc><news:news><news:publication><news:name>${SITE_NAME}</news:name><news:language>bn</news:language></news:publication><news:publication_date>${f.published}</news:publication_date><news:title>${esc(trimTo(f.headline, 110))}</news:title></news:news></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${items.join('\n')}\n</urlset>\n`;
}

function rss(stories) {
  const items = stories.slice(0, 50).map((s) => {
    const f = storyFields(s);
    return `<item><title>${esc(f.headline)}</title><link>${esc(storyUrl(s.id))}</link><guid isPermaLink="true">${esc(storyUrl(s.id))}</guid><pubDate>${new Date(f.published).toUTCString()}</pubDate><description>${esc(f.lead)}</description></item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${SITE_NAME}</title><link>${SITE_URL}/</link><description>এক মিনিটে বাংলাদেশ ও বিশ্বের খবর</description><language>bn</language>\n${items.join('\n')}\n</channel></rss>\n`;
}

// ---------- main ----------
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const headRe = /<!-- SEO-HEAD-START[\s\S]*?<!-- SEO-HEAD-END -->/;
if (!headRe.test(template)) throw new Error('dist/index.html is missing the SEO-HEAD markers');

let stories = [];
try {
  stories = await fetchStories();
} catch (err) {
  console.warn(`[seo] ${err.message}. Writing a home-only sitemap.`);
}

for (const s of stories) {
  const html = template
    .replace(headRe, buildHead(s))
    .replace('<html lang="bn">', '<html lang="bn">')
    .replace('<div id="root"></div>', `<div id="root">${buildBody(s)}</div>`);
  const dir = path.join(dist, 'story', s.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}

await writeFile(path.join(dist, 'sitemap.xml'), sitemap(stories));
await writeFile(path.join(dist, 'news-sitemap.xml'), newsSitemap(stories));
await writeFile(path.join(dist, 'feed.xml'), rss(stories));
console.log(`[seo] wrote ${stories.length} story pages, sitemap.xml, news-sitemap.xml, feed.xml`);
