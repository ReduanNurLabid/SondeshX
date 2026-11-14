import { collection, getDocs, doc, getDoc, limit, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { CapsuleStory, DailyCapsule } from '../types';

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1/projects/dorpon-a99a6/databases/(default)/documents';

function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const list = val.arrayValue.values || [];
    return list.map((item: any) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue.fields || {};
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = decodeFirestoreValue(v);
    }
    return res;
  }
  if ('nullValue' in val) return null;
  return val;
}

function decodeFirestoreDoc(doc: any): any {
  const fields = doc.fields || {};
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    res[k] = decodeFirestoreValue(v);
  }
  return res;
}

async function fetchFirestoreRest(collectionName: string, pageSize: number = 40, orderByField: string = "published_at"): Promise<any[]> {
  try {
    const orderParam = orderByField ? `&orderBy=${encodeURIComponent(orderByField + " desc")}` : "";
    const res = await fetch(`${FIRESTORE_REST_BASE}/${collectionName}?pageSize=${pageSize}${orderParam}`);
    if (res.ok) {
      const data = await res.json();
      const docs = data.documents || [];
      return docs.map((d: any) => decodeFirestoreDoc(d));
    }
  } catch (err) {
    console.warn(`Firestore REST fallback failed for ${collectionName}:`, err);
  }
  return [];
}

async function fetchFirestoreDocRest(collectionName: string, docId: string): Promise<any | null> {
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/${collectionName}/${docId}`);
    if (res.ok) {
      const data = await res.json();
      return decodeFirestoreDoc(data);
    }
  } catch (err) {
    console.warn(`Firestore REST doc fallback failed for ${collectionName}/${docId}:`, err);
  }
  return null;
}

function cleanEditorialMarkdown(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/^\s*(?:[*_\-•]+\s*|\d{1,2}[.)]\s+)/, '')
    .replace(/\s*[*_]+\s*$/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

// Front-page rank: the editorial score loses half its weight every 10 hours, and
// collapses after the 30-hour window. Same formula as compute_time_decayed_score
// in pipeline/processing/scoring.py.
const RANK_HALF_LIFE_HOURS = 10;

export function calculateDynamicRank(importance: number, publishedAt?: string | null, maxHours: number = 30): number {
  if (!publishedAt) return Number((importance / 2.0).toFixed(4));
  const pubTime = new Date(publishedAt).getTime();
  if (isNaN(pubTime)) return Number((importance / 2.0).toFixed(4));

  const ageHours = Math.max(0, (Date.now() - pubTime) / (3600 * 1000));
  let rank = importance * Math.pow(0.5, ageHours / RANK_HALF_LIFE_HOURS);
  if (ageHours > maxHours) {
    rank /= Math.pow(1.0 + (ageHours - maxHours), 2.0);
  }
  return Number(rank.toFixed(4));
}

function normalizeStory(data: any, fallbackDate?: string): CapsuleStory {
  const buzz = data.daily_buzz || data.dailyBuzz || {};
  const bcs = data.bcs_pro || data.bcsPro || null;

  const rawBulletsBn = buzz.bullets_bn || buzz.bulletsBn || buzz.key_takeaways_bn || [];
  const rawBulletsEn = buzz.bullets_en || buzz.bulletsEn || buzz.key_takeaways_en || [];

  return {
    story_id: data.story_id || data.storyId || Math.random().toString(36).substring(7),
    primary_category: data.primary_category || data.primaryCategory || 'general',
    interest_categories: data.interest_categories || data.interestCategories || [],
    tags: data.tags || [],
    image_url: data.image_url || data.imageUrl || null,
    image_caption: data.image_caption || data.imageCaption || null,
    published_at: data.published_at || data.publishedAt || buzz.published_at || data.created_at || fallbackDate || undefined,
    is_bcs_pro_selected: Boolean(data.is_bcs_pro_selected || data.isBcsProSelected || bcs),
    importance_score: data.importance_score ?? 2.0,
    rank_score: calculateDynamicRank(data.importance_score ?? 2.0, data.published_at || data.publishedAt || buzz.published_at || data.created_at || fallbackDate, 30),
    sources: data.sources || [],
    daily_buzz: {
      title_bn: cleanEditorialMarkdown(buzz.title_bn || buzz.titleBn || ''),
      title_en: cleanEditorialMarkdown(buzz.title_en || buzz.titleEn || ''),
      summary_bn: cleanEditorialMarkdown(buzz.summary_bn || buzz.summaryBn || ''),
      summary_en: cleanEditorialMarkdown(buzz.summary_en || buzz.summaryEn || ''),
      lead_bn: cleanEditorialMarkdown(buzz.lead_bn || buzz.leadBn || ''),
      lead_en: cleanEditorialMarkdown(buzz.lead_en || buzz.leadEn || ''),
      bullets_bn: Array.isArray(rawBulletsBn) ? rawBulletsBn.map((b: any) => cleanEditorialMarkdown(String(b))).filter(Boolean) : [],
      bullets_en: Array.isArray(rawBulletsEn) ? rawBulletsEn.map((b: any) => cleanEditorialMarkdown(String(b))).filter(Boolean) : [],
      details_bn: cleanEditorialMarkdown(buzz.details_bn || buzz.detailsBn || ''),
      details_en: cleanEditorialMarkdown(buzz.details_en || buzz.detailsEn || ''),
      impact_bn: cleanEditorialMarkdown(buzz.impact_bn || buzz.impactBn || ''),
      impact_en: cleanEditorialMarkdown(buzz.impact_en || buzz.impactEn || ''),
      why_it_matters_bn: cleanEditorialMarkdown(buzz.why_it_matters_bn || buzz.whyItMattersBn || ''),
      why_it_matters_en: cleanEditorialMarkdown(buzz.why_it_matters_en || buzz.whyItMattersEn || ''),
      interest_categories: buzz.interest_categories || buzz.interestCategories || [],
      read_time_seconds: buzz.read_time_seconds || buzz.readTimeSeconds || 60,
      published_at: buzz.published_at || data.published_at || fallbackDate,
    },
    bcs_pro: bcs ? {
      syllabus_mapping: bcs.syllabus_mapping,
      bcs_subject_area: bcs.bcs_subject_area || 'Global & National Affairs',
      why_in_the_news_bn: bcs.why_in_the_news_bn || '',
      why_in_the_news_en: bcs.why_in_the_news_en || '',
      question_breakdowns: bcs.question_breakdowns || [],
      data_stats: bcs.data_stats || [],
      constitutional_articles: bcs.constitutional_articles || [],
      challenges: bcs.challenges || [],
      way_forward: bcs.way_forward || [],
      government_initiatives: bcs.government_initiatives || [],
      conclusion: bcs.conclusion || '',
      analytical_breakdown_bn: bcs.analytical_breakdown_bn || '',
      analytical_breakdown_en: bcs.analytical_breakdown_en || '',
      written_exam_prompt: bcs.written_exam_prompt,
      linked_pyqs: bcs.linked_pyqs || [],
    } : null,
  };
}

export const DELETED_STORAGE_KEY = 'dorpon_deleted_story_ids';

export function getLocalDeletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function addLocalDeletedId(...ids: (string | undefined | null)[]): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalDeletedIds();
    ids.forEach(id => {
      if (id && typeof id === 'string') current.add(id);
    });
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

export function filterDeletedStories(list: CapsuleStory[]): CapsuleStory[] {
  const deleted = getLocalDeletedIds();
  if (deleted.size === 0) return list;
  return list.filter(s => !deleted.has(s.story_id) && !deleted.has((s as any)._docId));
}

function sortByPublishedDesc(list: CapsuleStory[]): CapsuleStory[] {
  return list.sort((a, b) => {
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
    return timeB - timeA;
  });
}

export function sortByEditorialRank(list: CapsuleStory[]): CapsuleStory[] {
  return list.sort((a, b) => {
    // 1. Primary sort: rank_score (freshness + importance decay)
    const rankA = a.rank_score ?? 1.0;
    const rankB = b.rank_score ?? 1.0;
    if (Math.abs(rankB - rankA) > 0.05) {
      return rankB - rankA;
    }
    // 2. Secondary sort: importance_score
    const impA = a.importance_score ?? 2.0;
    const impB = b.importance_score ?? 2.0;
    if (Math.abs(impB - impA) > 0.4) {
      return impB - impA;
    }
    // 3. Multi-source coverage boost
    const srcA = a.sources?.length ?? 1;
    const srcB = b.sources?.length ?? 1;
    if (srcB !== srcA) {
      return srcB - srcA;
    }
    // 4. Tie-breaker: recency
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
    return timeB - timeA;
  });
}

export async function fetchDailyBuzzFeed(fetchLimit: number = 500): Promise<CapsuleStory[]> {
  // 1. Try Firebase Firestore SDK
  try {
    const q = query(collection(db, 'daily_buzz'), orderBy('published_at', 'desc'), limit(fetchLimit));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const items: CapsuleStory[] = [];
      snapshot.forEach(doc => {
        items.push(normalizeStory(doc.data()));
      });
      if (items.length > 0) {
        return sortByEditorialRank(filterDeletedStories(items));
      }
    }
  } catch (err) {
    console.warn('Firestore SDK buzz feed read error, falling back:', err);
  }

  // 2. Try Firestore REST API
  try {
    const restItems = await fetchFirestoreRest('daily_buzz', fetchLimit, 'published_at');
    if (restItems.length > 0) {
      const items = restItems.map(item => normalizeStory(item));
      return sortByEditorialRank(filterDeletedStories(items));
    }
  } catch (err) {
    console.warn('Firestore REST buzz error:', err);
  }

  // 3. Fallback to bundled static snapshot
  try {
    const res = await fetch('/data/top_stories_latest.json');
    if (res.ok) {
      const json = await res.json();
      const docTime = json.published_at || json.created_at || (json.edition_date ? json.edition_date + "T06:00:00Z" : undefined);
      const stories: any[] = json.stories || [];
      const items = stories.map(s => normalizeStory(s));
      return sortByEditorialRank(filterDeletedStories(items));
    }
  } catch (err) {
    console.error('Static top_stories fallback error:', err);
  }

  return [];
}

export async function fetchCurrentAffairsFeed(): Promise<CapsuleStory[]> {
  const storyMap = new Map<string, CapsuleStory>();

  // 1. Try Firestore SDK on both current_affairs_published and bcs_pro_published
  try {
    const collectionsToCheck = ['current_affairs_published', 'bcs_pro_published'];
    for (const collName of collectionsToCheck) {
      try {
        const snap = await getDocs(collection(db, collName));
        if (!snap.empty) {
          snap.forEach(docSnap => {
            const data = docSnap.data();
            const docTime = data.published_at || data.created_at || (data.edition_date ? data.edition_date + "T06:00:00Z" : undefined);
            const stories: any[] = data.stories || [];
            for (const s of stories) {
              const norm = normalizeStory(s, typeof docTime !== "undefined" ? docTime : undefined);
              if (norm.story_id && !storyMap.has(norm.story_id)) {
                storyMap.set(norm.story_id, norm);
              }
            }
          });
        }
      } catch (colErr) {
        // Individual collection fallback
      }
    }
  } catch (err) {
    console.warn('Firestore SDK current affairs error, falling back:', err);
  }

  // Also check doc 'latest' explicitly if collection queries were restricted
  if (storyMap.size === 0) {
    for (const collName of ['current_affairs_published', 'bcs_pro_published']) {
      try {
        const dRef = doc(db, collName, 'latest');
        const snap = await getDoc(dRef);
        if (snap.exists()) {
          const snapData = snap.data();
          const docTime = snapData.published_at || snapData.created_at || (snapData.edition_date ? snapData.edition_date + "T06:00:00Z" : undefined);
          const stories: any[] = snapData.stories || [];
          for (const s of stories) {
            const norm = normalizeStory(s, typeof docTime !== "undefined" ? docTime : undefined);
            if (norm.story_id && !storyMap.has(norm.story_id)) {
              storyMap.set(norm.story_id, norm);
            }
          }
        }
      } catch {}
    }
  }

  // 2. Try Firestore REST fallback if still empty
  if (storyMap.size === 0) {
    for (const collName of ['current_affairs_published', 'bcs_pro_published']) {
      try {
        const restDocs = await fetchFirestoreRest(collName, 20);
        for (const docData of restDocs) {
          const docTime = docData.published_at || docData.created_at || (docData.edition_date ? docData.edition_date + "T06:00:00Z" : undefined);
          const stories: any[] = docData.stories || [];
          for (const s of stories) {
            const norm = normalizeStory(s, typeof docTime !== "undefined" ? docTime : undefined);
            if (norm.story_id && !storyMap.has(norm.story_id)) {
              storyMap.set(norm.story_id, norm);
            }
          }
        }
      } catch (err) {
        console.warn(`Firestore REST ${collName} error:`, err);
      }
    }
  }

  // 3. Fallback to bundled snapshot
  try {
    const res = await fetch('/data/current_affairs_latest.json');
    if (res.ok) {
      const json = await res.json();
      const docTime = json.published_at || json.created_at || (json.edition_date ? json.edition_date + "T06:00:00Z" : undefined);
      const stories: any[] = json.stories || [];
      for (const s of stories) {
        const norm = normalizeStory(s, typeof docTime !== "undefined" ? docTime : undefined);
        if (norm.story_id && !storyMap.has(norm.story_id)) {
          storyMap.set(norm.story_id, norm);
        }
      }
    }
  } catch (err) {
    console.error('Static current_affairs fallback error:', err);
  }

  // 4. Secondary fallback: check capsule_latest.json
  if (storyMap.size === 0) {
    try {
      const res = await fetch('/data/capsule_latest.json');
      if (res.ok) {
        const json = await res.json();
      const docTime = json.published_at || json.created_at || (json.edition_date ? json.edition_date + "T06:00:00Z" : undefined);
        const stories: any[] = json.stories || [];
        for (const s of stories) {
          if (s.bcs_pro || s.is_bcs_pro_selected) {
            const norm = normalizeStory(s, typeof docTime !== "undefined" ? docTime : undefined);
            if (norm.story_id && !storyMap.has(norm.story_id)) {
              storyMap.set(norm.story_id, norm);
            }
          }
        }
      }
    } catch {}
  }

  const list = Array.from(storyMap.values());
  // The user specifically requested to keep only the Houthi-Saudi conflict dossier in current affairs
  const filteredList = list.filter(s => {
    const id = s.story_id?.toLowerCase() || '';
    const titleEn = s.daily_buzz?.title_en?.toLowerCase() || '';
    const titleBn = s.daily_buzz?.title_bn || '';
    return id.includes('houthi') || titleEn.includes('houthi') || titleBn.includes('হুথি');
  });

  return sortByPublishedDesc(filterDeletedStories(filteredList.length > 0 ? filteredList : list));
}

export async function fetchHourlyWiresFeed(fetchLimit: number = 300): Promise<CapsuleStory[]> {
  // 1. Try Firestore SDK
  try {
    const q = query(collection(db, 'hourly_buzz'), orderBy('published_at', 'desc'), limit(fetchLimit));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const list: CapsuleStory[] = [];
      snap.forEach(doc => {
        list.push(normalizeStory(doc.data()));
      });
      if (list.length > 0) {
        return sortByPublishedDesc(filterDeletedStories(list));
      }
    }
  } catch (err) {
    console.warn('Firestore SDK hourly buzz error, falling back:', err);
  }

  // 2. Try Firestore REST
  try {
    const restItems = await fetchFirestoreRest('hourly_buzz', fetchLimit, 'published_at');
    if (restItems.length > 0) {
      const items = restItems.map(item => normalizeStory(item));
      return sortByEditorialRank(filterDeletedStories(items));
    }
  } catch (err) {
    console.warn('Firestore REST hourly error:', err);
  }

  // 3. Fallback to bundled snapshot
  try {
    const res = await fetch('/data/hourly_buzz_latest.json');
    if (res.ok) {
      const json = await res.json();
      const docTime = json.published_at || json.created_at || (json.edition_date ? json.edition_date + "T06:00:00Z" : undefined);
      const stories: any[] = json.stories || [];
      const items = stories.map(s => normalizeStory(s));
      return sortByEditorialRank(filterDeletedStories(items));
    }
  } catch (err) {
    console.error('Static hourly_buzz fallback error:', err);
  }

  return [];
}
