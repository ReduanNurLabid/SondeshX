import React, { useState, useEffect, useMemo } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  User 
} from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit,
  where
} from 'firebase/firestore';
import { getLocalDeletedIds, addLocalDeletedId } from '../services/api';
import { auth, db } from '../services/firebase';
import { useApp } from '../context/AppContext';
import { CapsuleStory } from '../types';
import { calculateDynamicRank, sortByEditorialRank } from '../services/api';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  KeyRound, 
  LogOut, 
  Save, 
  RefreshCw, 
  Search, 
  FileEdit, 
  Trash2, 
  PlusCircle, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  BarChart2,
  Sliders,
  Layers,
  ArrowLeft,
  Clock,
  TrendingUp,
  Zap,
  Share2,
  Palette,
  Film,
  Image as ImageIcon
} from 'lucide-react';
import { SocialCardStudio, StudioTab } from './SocialCardStudio';
import { GeminiKeysPanel } from './GeminiKeysPanel';

const AUTHORIZED_EMAILS = ['nurreduan.pp@gmail.com', 'reduannurlabid@gmail.com'];

export const WEBSITE_CATEGORY_DESKS = [
  { value: 'governance_law', label: 'Governance & Law (শাসনব্যবস্থা ও রাজনীতি)' },
  { value: 'economy_business', label: 'Economy & Business (অর্থনীতি ও বাণিজ্য)' },
  { value: 'world_diplomacy', label: 'World & Geopolitics (আন্তর্জাতিক ও কূটনীতি)' },
  { value: 'tech_infrastructure', label: 'Technology & AI (প্রযুক্তি ও উদ্ভাবন)' },
  { value: 'climate_delta', label: 'Climate & Environment (পরিবেশ ও জলবায়ু)' },
  { value: 'society_education', label: 'Society & Education (সমাজ ও শিক্ষা)' },
  { value: 'sports_fitness', label: 'Sports & Fitness (খেলাধুলা)' },
  { value: 'infrastructure_energy', label: 'Infrastructure & Energy (অবকাঠামো ও জ্বালানি)' },
  { value: 'national', label: 'National Affairs (জাতীয় বিষয়াবলী)' },
  { value: 'pop_culture', label: 'Culture & Entertainment (সংস্কৃতি ও বিনোদন)' },
];

// Helper to recursively remove undefined values before writing to Firestore
function cleanForFirestore(val: any): any {
  if (val === undefined) return null;
  if (val === null) return null;
  if (Array.isArray(val)) {
    return val.map((item) => cleanForFirestore(item));
  }
  if (typeof val === 'object' && !(val instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      const v = val[key];
      if (v !== undefined) {
        cleaned[key] = cleanForFirestore(v);
      }
    }
    return cleaned;
  }
  return val;
}

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Draft';
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return 'Unknown';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

export type BroadsheetSlot = {
  slotKey: 'hero' | 'col1_top' | 'col1_bottom' | 'col3_wire' | 'grid';
  label: string;
  badgeLabel: string;
  badgeClass: string;
  position: number;
  description: string;
};

export function getStorySlotPlacement(
  index: number,
  collectionName: 'daily_buzz' | 'current_affairs_published' | 'hourly_buzz'
): BroadsheetSlot {
  const position = index + 1;
  if (collectionName === 'daily_buzz') {
    if (index === 0) {
      return {
        slotKey: 'hero',
        label: 'Hero (Center Fold)',
        badgeLabel: '🌟 Center Hero (Fold)',
        badgeClass: 'bg-amber-500/20 text-amber-500 border-amber-500/40',
        position,
        description: 'Position #1 • Main Center Fold of the Front Page'
      };
    }
    if (index === 1) {
      return {
        slotKey: 'col1_top',
        label: 'Column 1 (Left Top Lead)',
        badgeLabel: '📰 Col 1 (Left Top)',
        badgeClass: 'bg-blue-500/20 text-blue-500 border-blue-500/40',
        position,
        description: 'Position #2 • Left Column Top Lead Article'
      };
    }
    if (index === 2) {
      return {
        slotKey: 'col1_bottom',
        label: 'Column 1 (Left Bottom Lead)',
        badgeLabel: '📰 Col 1 (Left Bottom)',
        badgeClass: 'bg-blue-500/20 text-blue-500 border-blue-500/40',
        position,
        description: 'Position #3 • Left Column Secondary Lead Article'
      };
    }
    if (index >= 3 && index <= 6) {
      return {
        slotKey: 'col3_wire',
        label: `Column 3 (Wire Desk Brief #${index - 2})`,
        badgeLabel: `⚡ Wire Desk #${index - 2}`,
        badgeClass: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40',
        position,
        description: `Position #${position} • Right Column Live Wire Desk Brief`
      };
    }
    return {
      slotKey: 'grid',
      label: 'Inside Broadsheet Grid',
      badgeLabel: `📑 Inside Grid (#${position})`,
      badgeClass: 'bg-primary/10 text-primary border-primary/20',
      position,
      description: `Position #${position} • Lower Broadsheet Feed & Archives`
    };
  }

  if (collectionName === 'hourly_buzz') {
    if (index < 4) {
      return {
        slotKey: 'col3_wire',
        label: `Column 3 Wire Lead #${position}`,
        badgeLabel: `⚡ Col 3 Wire #${position}`,
        badgeClass: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40',
        position,
        description: `Position #${position} • Top Wire Brief`
      };
    }
    return {
      slotKey: 'grid',
      label: 'Hourly Wire Archive',
      badgeLabel: `⚡ Wire Archive (#${position})`,
      badgeClass: 'bg-primary/10 text-primary border-primary/20',
      position,
      description: `Position #${position} • Wire Archive`
    };
  }

  // current_affairs_published
  if (index === 0) {
    return {
      slotKey: 'hero',
      label: 'Lead Current Affairs Dossier',
      badgeLabel: '⭐ Lead Dossier',
      badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
      position,
      description: 'Position #1 • Lead Analytical Dossier'
    };
  }
  return {
    slotKey: 'grid',
    label: `Dossier #${position}`,
    badgeLabel: `📘 Dossier #${position}`,
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    position,
    description: `Position #${position} • Analytical Dossier`
  };
}

// Backwards-compatible telemetry helper
export function computeWebStoryScore(story: CapsuleStory): {
  baseScore: number;
  finalRankScore: number;
  breakdown: string[];
  suggestedSlot: 'Hero (Center Fold)' | 'Column 1 (Left)' | 'Column 3 (Wire Desk)' | 'Inside Broadsheet Grid';
} {
  const base = story.importance_score ?? 2.0;
  const rank = calculateDynamicRank(base, story.published_at, 30);
  const breakdown: string[] = [`Base: ${base.toFixed(1)}`];

  if (story.is_bcs_pro_selected || story.bcs_pro) {
    breakdown.push('Current Affairs (+2.0)');
  }

  const srcCount = story.sources?.length || 1;
  if (srcCount > 1) {
    breakdown.push(`Sources: ${srcCount}`);
  }

  let suggestedSlot: 'Hero (Center Fold)' | 'Column 1 (Left)' | 'Column 3 (Wire Desk)' | 'Inside Broadsheet Grid' = 'Inside Broadsheet Grid';
  if (rank >= 1.2 || base >= 7.0) {
    suggestedSlot = 'Hero (Center Fold)';
  } else if (rank >= 0.7 || base >= 5.0) {
    suggestedSlot = 'Column 1 (Left)';
  } else if (rank >= 0.3 || base >= 3.0) {
    suggestedSlot = 'Column 3 (Wire Desk)';
  }

  return {
    baseScore: Number(base.toFixed(2)),
    finalRankScore: Number(rank.toFixed(3)),
    breakdown,
    suggestedSlot
  };
}

export const EditorialDashboard: React.FC = () => {
  const { setActiveTab, language } = useApp();
  const isBn = language === 'bn';

  // Auth States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [emailInput, setEmailInput] = useState('nurreduan.pp@gmail.com');
  const [passwordInput, setPasswordInput] = useState('');
  const [isNewUserMode, setIsNewUserMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Stories Management
  const [activeCollection, setActiveCollection] = useState<'daily_buzz' | 'current_affairs_published' | 'hourly_buzz'>('daily_buzz');
  const [stories, setStories] = useState<CapsuleStory[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortMode, setSortMode] = useState<'broadsheet' | 'date'>('broadsheet');
  const [selectedStory, setSelectedStory] = useState<CapsuleStory | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview'>('editor');
  const [isSocialStudioOpen, setIsSocialStudioOpen] = useState(false);
  const [socialStudioInitialTab, setSocialStudioInitialTab] = useState<StudioTab>('photo');

  // Monitor Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  const isAuthorized = currentUser && AUTHORIZED_EMAILS.includes(currentUser.email?.toLowerCase() || '');

  // Fetch stories when collection changes
  const loadStories = async () => {
    if (!isAuthorized) return;
    setIsLoadingStories(true);
    setStatusMessage(null);
    const deletedIds = getLocalDeletedIds();

    try {
      if (activeCollection === 'current_affairs_published') {
        // Load the active canonical edition 'latest'
        const latestDocRef = doc(db, 'current_affairs_published', 'latest');
        const latestSnap = await getDoc(latestDocRef);
        let rawStories: any[] = [];

        if (latestSnap.exists() && latestSnap.data().stories && Array.isArray(latestSnap.data().stories)) {
          rawStories = latestSnap.data().stories;
        } else {
          // Fallback if 'latest' is not yet initialized
          const docSnap = await getDocs(collection(db, 'current_affairs_published'));
          docSnap.forEach((d) => {
            const data = d.data();
            if (data.stories && Array.isArray(data.stories)) {
              rawStories.push(...data.stories);
            }
          });
        }

        // Strict deduplication by story_id and filter deleted
        const storyMap = new Map<string, CapsuleStory & { _docId?: string }>();
        rawStories.forEach((s: any, idx: number) => {
          const id = s.story_id || s.storyId || `ca-story-${idx}`;
          if (!deletedIds.has(id) && !storyMap.has(id)) {
            const importance = s.importance_score ?? 2.0;
            const rank = calculateDynamicRank(importance, s.published_at, 30);
            storyMap.set(id, {
              ...s,
              story_id: id,
              importance_score: importance,
              rank_score: rank,
              is_bcs_pro_selected: Boolean(s.is_bcs_pro_selected || s.bcs_pro || s.bcsPro),
              _docId: 'latest',
            });
          }
        });

        const list = Array.from(storyMap.values());
        const sortedList = sortByEditorialRank(list);
        setStories(sortedList);
        if (sortedList.length > 0) setSelectedStory(sortedList[0]);
        else setSelectedStory(null);
      } else {
        const q = query(collection(db, activeCollection), orderBy('published_at', 'desc'), limit(150));
        const snap = await getDocs(q);
        const storyMap = new Map<string, CapsuleStory & { _docId?: string }>();
        snap.forEach((d) => {
          const data = d.data();
          const docId = d.id;
          const story_id = data.story_id || data.storyId || docId;
          if (!deletedIds.has(story_id) && !deletedIds.has(docId) && !storyMap.has(story_id)) {
            const importance = data.importance_score ?? 2.0;
            const rank = calculateDynamicRank(importance, data.published_at, 30);
            storyMap.set(story_id, {
              ...data,
              story_id,
              importance_score: importance,
              rank_score: rank,
              is_bcs_pro_selected: Boolean(data.is_bcs_pro_selected || data.bcs_pro || data.bcsPro),
              _docId: docId,
            } as CapsuleStory & { _docId?: string });
          }
        });
        const list = Array.from(storyMap.values());
        const sortedList = sortByEditorialRank(list);
        setStories(sortedList);
        if (sortedList.length > 0) setSelectedStory(sortedList[0]);
        else setSelectedStory(null);
      }
    } catch (err: any) {
      console.warn('Error fetching collection from Firestore, trying fallback bundle:', err);
      // Resilient fallback when Firestore quota is exceeded or network fails
      try {
        const fallbackUrl = activeCollection === 'current_affairs_published'
          ? '/data/current_affairs_latest.json'
          : activeCollection === 'hourly_buzz'
          ? '/data/hourly_buzz_latest.json'
          : '/data/top_stories_latest.json';

        const res = await fetch(fallbackUrl);
        if (res.ok) {
          const json = await res.json();
          const rawStories: any[] = json.stories || [];
          const storyMap = new Map<string, CapsuleStory & { _docId?: string }>();
          rawStories.forEach((s: any, idx: number) => {
            const id = s.story_id || s.storyId || `fallback-${idx}`;
            if (!deletedIds.has(id) && !storyMap.has(id)) {
              const importance = s.importance_score ?? 2.0;
              const rank = calculateDynamicRank(importance, s.published_at, 30);
              storyMap.set(id, {
                ...s,
                story_id: id,
                importance_score: importance,
                rank_score: rank,
                is_bcs_pro_selected: Boolean(s.is_bcs_pro_selected || s.bcs_pro || s.bcsPro),
                _docId: id,
              });
            }
          });
          const list = Array.from(storyMap.values());
          const sortedList = sortByEditorialRank(list);
          setStories(sortedList);
          if (sortedList.length > 0) setSelectedStory(sortedList[0]);
          else setSelectedStory(null);
          setStatusMessage({
            text: 'Live Firestore quota reached; loaded local bundle. Edits & deletes stay saved.',
            type: 'success'
          });
          return;
        }
      } catch (fbErr) {
        console.error('Fallback read error:', fbErr);
      }
      setStatusMessage({ text: err.message || 'Failed to load stories from Firestore', type: 'error' });
    } finally {
      setIsLoadingStories(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadStories();
    }
  }, [isAuthorized, activeCollection]);

  // Auth handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthenticating(true);

    const emailTrimmed = emailInput.trim().toLowerCase();
    if (!AUTHORIZED_EMAILS.includes(emailTrimmed)) {
      setAuthError(`Email "${emailTrimmed}" is not authorized to access the Dorpon Editorial Studio.`);
      setIsAuthenticating(false);
      return;
    }

    try {
      if (isNewUserMode) {
        await createUserWithEmailAndPassword(auth, emailTrimmed, passwordInput);
        setAuthSuccess('Account created and logged in successfully!');
      } else {
        await signInWithEmailAndPassword(auth, emailTrimmed, passwordInput);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found') {
        setAuthError('User does not exist yet. Please check "First login: Set initial password".');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('Incorrect password. If you forgot your password, use reset password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists. Try signing in directly.');
      } else {
        setAuthError(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!emailInput.trim()) {
      setAuthError('Please enter your email to receive a password reset link.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, emailInput.trim());
      setAuthSuccess('Password reset link sent to your email. Check your inbox.');
    } catch (err: any) {
      setAuthError(err.message || 'Could not send reset email.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setSelectedStory(null);
    setStories([]);
  };

  // Story editing handlers
  const handleSaveStory = async () => {
    if (!selectedStory) {
      alert('Please select an article first.');
      return;
    }
    if (!isAuthorized) {
      alert('Your email is not authorized to edit live Firestore.');
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const docId = (selectedStory as any)._docId || selectedStory.story_id;
      if (!docId) {
        throw new Error('No document ID available for this story.');
      }

      if (activeCollection === 'current_affairs_published') {
        // Update the current_affairs doc
        const updatedList = stories.map((s) => (s.story_id === selectedStory.story_id ? selectedStory : s));
        const payload = cleanForFirestore({
          stories: updatedList,
          edition_date: new Date().toISOString().split('T')[0],
          published_at: new Date().toISOString(),
          total_stories: updatedList.length,
          status: 'published'
        });
        await setDoc(doc(db, 'current_affairs_published', 'latest'), payload, { merge: true });
        setStories(updatedList);
      } else {
        const payload = cleanForFirestore({
          ...selectedStory,
          story_id: docId,
        });
        delete payload._docId;
        await setDoc(doc(db, activeCollection, docId), payload, { merge: true });
        setStories((prev) =>
          prev.map((s) =>
            s.story_id === selectedStory.story_id || (s as any)._docId === docId ? selectedStory : s
          )
        );
      }
      setStatusMessage({ text: `✓ Saved successfully to live Firestore [${docId.slice(0, 8)}...]`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving story:', err);
      const errMsg = err?.message || 'Failed to save updates to Firestore';
      setStatusMessage({ text: `Save error: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!selectedStory || !isAuthorized) return;
    const storyTitle = selectedStory.daily_buzz?.title_en || selectedStory.daily_buzz?.title_bn || selectedStory.story_id;
    if (!window.confirm(`Are you sure you want to permanently delete "${storyTitle}" from live database?`)) {
      return;
    }
    setIsSaving(true);
    setStatusMessage({ text: 'Deleting story from database...', type: 'success' });

    const targetDocId = (selectedStory as any)._docId || selectedStory.story_id;
    const targetStoryId = selectedStory.story_id;

    // 1. Immediately register in local tombstone so it can NEVER reappear even if reloaded immediately
    addLocalDeletedId(targetStoryId, targetDocId);

    try {
      if (activeCollection === 'current_affairs_published') {
        const remaining = stories.filter((s) => s.story_id !== targetStoryId && (s as any)._docId !== targetDocId);
        const payload = cleanForFirestore({
          stories: remaining,
          edition_date: new Date().toISOString().split('T')[0],
          published_at: new Date().toISOString(),
          total_stories: remaining.length,
          status: 'published'
        });
        await setDoc(doc(db, 'current_affairs_published', 'latest'), payload, { merge: true });

        // Clean up from all date editions in current_affairs_published and bcs_pro_published
        try {
          const collectionsToCheck = ['current_affairs_published', 'bcs_pro_published'];
          for (const coll of collectionsToCheck) {
            const snap = await getDocs(collection(db, coll));
            for (const d of snap.docs) {
              const data = d.data();
              if (data.stories && Array.isArray(data.stories)) {
                const filtered = data.stories.filter((s: any) => (s.story_id || s.storyId) !== targetStoryId);
                if (filtered.length !== data.stories.length) {
                  const cleaned = cleanForFirestore({
                    ...data,
                    stories: filtered,
                    total_stories: filtered.length
                  });
                  await setDoc(d.ref, cleaned, { merge: true });
                }
              }
            }
          }
        } catch (secErr) {
          console.warn('Secondary current affairs cleanup warning:', secErr);
        }

        setStories(remaining);
        setSelectedStory(remaining.length > 0 ? remaining[0] : null);
      } else {
        // 1. Delete by actual document ID (_docId)
        if (targetDocId) {
          await deleteDoc(doc(db, activeCollection, targetDocId));
        }

        // 2. If story_id differs from _docId, delete by story_id
        if (targetStoryId && targetStoryId !== targetDocId) {
          try {
            await deleteDoc(doc(db, activeCollection, targetStoryId));
          } catch {}
        }

        // 3. Query and delete any duplicate documents with matching story_id / storyId
        if (targetStoryId) {
          try {
            const q1 = query(collection(db, activeCollection), where('story_id', '==', targetStoryId));
            const snap1 = await getDocs(q1);
            for (const d of snap1.docs) {
              await deleteDoc(d.ref);
            }
          } catch {}
          try {
            const q2 = query(collection(db, activeCollection), where('storyId', '==', targetStoryId));
            const snap2 = await getDocs(q2);
            for (const d of snap2.docs) {
              await deleteDoc(d.ref);
            }
          } catch {}
        }

        // 4. Also clean from sibling collection (daily_buzz <-> hourly_buzz)
        const sibling = activeCollection === 'daily_buzz' ? 'hourly_buzz' : activeCollection === 'hourly_buzz' ? 'daily_buzz' : null;
        if (sibling) {
          try {
            if (targetDocId) await deleteDoc(doc(db, sibling, targetDocId));
            if (targetStoryId && targetStoryId !== targetDocId) await deleteDoc(doc(db, sibling, targetStoryId));
            if (targetStoryId) {
              const q1 = query(collection(db, sibling), where('story_id', '==', targetStoryId));
              const s1 = await getDocs(q1);
              for (const d of s1.docs) await deleteDoc(d.ref);
              const q2 = query(collection(db, sibling), where('storyId', '==', targetStoryId));
              const s2 = await getDocs(q2);
              for (const d of s2.docs) await deleteDoc(d.ref);
            }
          } catch {}
        }

        const remaining = stories.filter((s) => s.story_id !== targetStoryId && (s as any)._docId !== targetDocId);
        setStories(remaining);
        setSelectedStory(remaining.length > 0 ? remaining[0] : null);
      }

      setStatusMessage({ text: '✓ Story permanently deleted from live database.', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error('Delete story error:', err);
      // Even if live network call hits quota or fails, still remove from UI and keep in local tombstone
      const remaining = stories.filter((s) => s.story_id !== targetStoryId && (s as any)._docId !== targetDocId);
      setStories(remaining);
      setSelectedStory(remaining.length > 0 ? remaining[0] : null);
      setStatusMessage({
        text: `✓ Story removed from dashboard (${err?.message?.includes('Quota') ? 'Firestore quota exceeded: tombstoned locally' : 'Tombstoned locally'}).`,
        type: 'success'
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewStory = () => {
    const newId = `editorial-${Date.now()}`;
    const newStory: CapsuleStory = {
      story_id: newId,
      primary_category: 'governance_law',
      interest_categories: ['governance_law', 'economy_business'],
      tags: ['#National', '#Policy'],
      importance_score: 3.5,
      is_bcs_pro_selected: false,
      sources: [
        { name: 'Official Gazette', url: 'https://bgp.gov.bd', snippet: 'Executive declaration and policy order' }
      ],
      daily_buzz: {
        title_en: 'New Editorial Dispatch: Headline Summary',
        title_bn: 'নতুন সম্পাদকীয় প্রতিবেদন: শিরোনাম',
        summary_en: 'Concise, high-impact analytical briefing on primary strategic developments.',
        summary_bn: 'কৌশলগত নীতি ও গুরুত্বপূর্ণ ঘটনার সুনির্দিষ্ট সারসংক্ষেপ।',
        details_en: 'Extended context and verified impact assessment across national sectors.',
        details_bn: 'জাতীয় খাত ও নীতিমালার বিস্তারিত প্রেক্ষাপট ও প্রভাব বিশ্লেষণ।',
        published_at: new Date().toISOString()
      }
    };
    setStories([newStory, ...stories]);
    setSelectedStory(newStory);
  };

  // Dynamically compute ranked feed incorporating any live in-progress edits on selectedStory
  const rankedStories = useMemo(() => {
    const list = stories.map((s) => {
      const isSelected = selectedStory && s.story_id === selectedStory.story_id;
      const importance = isSelected ? (selectedStory.importance_score ?? 2.0) : (s.importance_score ?? 2.0);
      const pubAt = isSelected ? selectedStory.published_at : s.published_at;
      const dynamicRank = calculateDynamicRank(importance, pubAt, 30);
      return {
        ...s,
        importance_score: importance,
        published_at: pubAt,
        rank_score: dynamicRank,
      };
    });
    return sortByEditorialRank(list);
  }, [stories, selectedStory?.story_id, selectedStory?.importance_score, selectedStory?.published_at]);

  // Map each story_id to its live placement and slot on the broadsheet
  const storyPlacementMap = useMemo(() => {
    const map = new Map<string, BroadsheetSlot>();
    rankedStories.forEach((s, idx) => {
      map.set(s.story_id, getStorySlotPlacement(idx, activeCollection));
    });
    return map;
  }, [rankedStories, activeCollection]);

  // Filtered stories respecting sortMode and search query
  const filteredStories = useMemo(() => {
    let baseList = [...rankedStories];
    if (sortMode === 'date') {
      baseList = [...stories].sort((a, b) => {
        const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
        return timeB - timeA;
      });
    }

    if (!searchFilter.trim()) return baseList;
    const q = searchFilter.toLowerCase();
    return baseList.filter((s) => {
      const titleEn = s.daily_buzz?.title_en?.toLowerCase() || '';
      const titleBn = s.daily_buzz?.title_bn || '';
      const id = s.story_id?.toLowerCase() || '';
      return titleEn.includes(q) || titleBn.includes(q) || id.includes(q);
    });
  }, [rankedStories, stories, sortMode, searchFilter]);

  // Real-time update for importance score
  const handleImportanceChange = (newScore: number) => {
    if (!selectedStory) return;
    const updated = { 
      ...selectedStory, 
      importance_score: newScore,
      rank_score: calculateDynamicRank(newScore, selectedStory.published_at, 30)
    };
    setSelectedStory(updated);
    setStories((prev) => prev.map((s) => (s.story_id === updated.story_id ? updated : s)));
  };

  // 1-Click Slot Placement Engine
  const handleAssignSlot = (target: 'hero' | 'col1' | 'col3' | 'grid') => {
    if (!selectedStory) return;

    // Time decay of this story: decay = importance / rank
    const testRank = calculateDynamicRank(10.0, selectedStory.published_at, 30);
    const decay = 10.0 / Math.max(testRank, 0.01);

    const otherStories = rankedStories.filter((s) => s.story_id !== selectedStory.story_id);
    let targetImportance = 2.0;

    if (target === 'hero') {
      // Must beat the current #1 story
      const topRank = otherStories.length > 0 ? (otherStories[0].rank_score ?? 1.2) : 1.2;
      const neededRank = topRank + 0.25;
      targetImportance = Math.min(10.0, Math.max(8.5, Number((neededRank * decay).toFixed(1))));
    } else if (target === 'col1') {
      // Must sit in position #2 or #3
      const topRank = otherStories.length > 0 ? (otherStories[0].rank_score ?? 1.5) : 1.5;
      const thirdRank = otherStories.length > 2 ? (otherStories[2].rank_score ?? 0.8) : 0.8;
      const targetRank = Math.max(0.7, (topRank + thirdRank) / 2);
      targetImportance = Math.min(8.0, Math.max(4.5, Number((targetRank * decay).toFixed(1))));
    } else if (target === 'col3') {
      // Must sit in Wire Desk positions #4 to #7
      const wireRank = otherStories.length > 4 ? (otherStories[4].rank_score ?? 0.5) : 0.5;
      const targetRank = Math.max(0.35, wireRank);
      targetImportance = Math.min(5.0, Math.max(2.5, Number((targetRank * decay).toFixed(1))));
    } else if (target === 'grid') {
      targetImportance = 1.0;
    }

    handleImportanceChange(targetImportance);
  };

  // Set publication timestamp to NOW (removes old age decay penalty)
  const handleTouchTimestamp = () => {
    if (!selectedStory) return;
    const nowIso = new Date().toISOString();
    const updated = {
      ...selectedStory,
      published_at: nowIso,
      rank_score: calculateDynamicRank(selectedStory.importance_score ?? 2.0, nowIso, 30),
      daily_buzz: {
        ...selectedStory.daily_buzz,
        published_at: nowIso,
      }
    };
    setSelectedStory(updated);
    setStories((prev) => prev.map((s) => (s.story_id === updated.story_id ? updated : s)));
    setStatusMessage({ text: '✓ Story timestamp updated to NOW (Decay penalty cleared)', type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center space-x-3 text-primary">
          <RefreshCw className="w-5 h-5 animate-spin text-secondary" />
          <span className="font-serif text-sm">Verifying Dorpon Editorial Authentication...</span>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!currentUser || !isAuthorized) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center mb-3">
            <button
              onClick={() => setActiveTab('top_stories')}
              className="inline-flex items-center gap-1.5 text-xs font-serif text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Digital Broadsheet</span>
            </button>
          </div>
          <div className="w-12 h-12 bg-primary text-background font-display-masthead font-black text-2xl flex items-center justify-center mx-auto shadow-md">
            D
          </div>
          <h2 className="mt-4 text-center font-display-masthead text-2xl sm:text-3xl text-primary font-bold uppercase tracking-tight">
            SondeshX Editorial Studio
          </h2>
          <p className="mt-1 text-center font-serif text-xs text-on-surface-variant max-w-sm mx-auto">
            Authorized central command for web broadsheet article scoring, placement, and direct broadcast.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-surface-container border border-primary/30 p-6 sm:p-8 shadow-md">
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block font-sans text-xs font-bold uppercase tracking-wider text-primary mb-1">
                  Editor Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="nurreduan.pp@gmail.com"
                    className="w-full bg-background border border-primary/20 text-primary text-xs pl-9 pr-3 py-2.5 focus:border-primary focus:outline-none font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block font-sans text-xs font-bold uppercase tracking-wider text-primary mb-1">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-background border border-primary/20 text-primary text-xs pl-9 pr-3 py-2.5 focus:border-primary focus:outline-none font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-serif pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isNewUserMode}
                    onChange={(e) => setIsNewUserMode(e.target.checked)}
                    className="rounded border-primary/30 accent-primary"
                  />
                  <span className="text-on-surface-variant font-medium">First login (Set password)</span>
                </label>

                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-secondary hover:underline cursor-pointer font-semibold"
                >
                  Forgot password?
                </button>
              </div>

              {authError && (
                <div className="p-3 bg-red-950/20 border border-red-500/40 text-red-500 text-xs font-serif flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="p-3 bg-green-950/20 border border-green-500/40 text-green-500 text-xs font-serif flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full bg-primary text-background font-sans text-xs font-bold uppercase tracking-wider py-2.5 hover:bg-surface-container-highest hover:text-primary transition-colors border border-primary flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>{isNewUserMode ? 'Register & Access Dashboard' : 'Authenticate & Open Studio'}</span>
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-primary/10 text-center font-serif text-[11px] text-on-surface-variant">
              <span>Restricted to Authorized Chief Editor: <strong>nurreduan.pp@gmail.com</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AUTHENTICATED DASHBOARD
  return (
    <div className="min-h-screen bg-background text-on-surface pb-16">
      {/* 1. TOP STUDIO NAVIGATION BAR */}
      <header className="border-b-2 border-primary bg-surface-container-high sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('top_stories')}
              className="p-1 border border-primary/30 hover:bg-primary hover:text-background transition-colors cursor-pointer"
              title="Return to Public Broadsheet"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display-masthead text-base sm:text-lg font-bold text-primary uppercase">
                  SondeshX Editorial Studio
                </span>
                <span className="inline-flex items-center gap-1 bg-secondary/15 text-secondary border border-secondary/30 px-2 py-0.5 text-[10px] font-mono font-bold rounded">
                  <ShieldCheck className="w-3 h-3" />
                  <span>WEB BROADSHEET COMMAND</span>
                </span>
              </div>
              <p className="font-serif text-[11px] text-on-surface-variant">
                Live placement scoring & direct publishing • Editor: <strong>{currentUser.email}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-surface border border-primary/30 p-0.5">
              <button
                onClick={() => setPreviewMode('editor')}
                className={`px-3 py-1 font-sans text-xs font-bold uppercase transition-colors cursor-pointer ${
                  previewMode === 'editor'
                    ? 'bg-primary text-background'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Editor
              </button>
              <button
                onClick={() => setPreviewMode('preview')}
                className={`px-3 py-1 font-sans text-xs font-bold uppercase transition-colors cursor-pointer ${
                  previewMode === 'preview'
                    ? 'bg-primary text-background'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Web Preview
              </button>
            </div>

            <button
              onClick={handleCreateNewStory}
              className="bg-secondary text-on-secondary font-sans text-xs font-bold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5 border border-secondary hover:opacity-90 cursor-pointer shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Dispatch</span>
            </button>

            <button
              onClick={loadStories}
              disabled={isLoadingStories}
              className="bg-surface-container border border-primary/30 text-primary font-sans text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 hover:border-primary cursor-pointer"
              title="Refresh stories"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStories ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleSignOut}
              className="text-on-surface-variant hover:text-red-500 font-sans text-xs font-semibold px-2 py-1 flex items-center gap-1 cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Admin: backup Gemini API keys used by the news pipeline */}
      <GeminiKeysPanel />

      {/* 2. SUB-COLLECTION TABS & SEARCH */}
      <div className="border-b border-primary/20 bg-surface-container-low px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1 sm:space-x-2 font-sans text-xs font-bold uppercase">
            {[
              { id: 'daily_buzz' as const, label: 'Front Page & Buzz (daily_buzz)', count: activeCollection === 'daily_buzz' ? stories.length : undefined },
              { id: 'current_affairs_published' as const, label: 'Current Affairs Dossiers', count: activeCollection === 'current_affairs_published' ? stories.length : undefined },
              { id: 'hourly_buzz' as const, label: 'Live Hourly Wires', count: activeCollection === 'hourly_buzz' ? stories.length : undefined },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCollection(tab.id)}
                className={`px-3 py-1.5 border transition-colors cursor-pointer ${
                  activeCollection === tab.id
                    ? 'bg-primary text-background border-primary shadow-sm'
                    : 'bg-surface border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count !== 'undefined' && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-secondary text-on-secondary rounded text-[10px] font-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center border border-primary/30 px-2.5 py-1 bg-surface-container w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-on-surface-variant mr-2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by headline or ID..."
              className="bg-transparent border-none text-xs text-primary placeholder:text-on-surface-variant focus:outline-none w-full font-serif"
            />
          </div>
        </div>
      </div>

      {/* STATUS NOTIFICATION BAR */}
      {statusMessage && (
        <div className={`px-4 py-2 text-center text-xs font-serif font-bold ${
          statusMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* 3. MAIN WORKSPACE: MASTER / DETAIL SPLIT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: STORY LIST REGISTER */}
        <div className="lg:col-span-5 flex flex-col h-[750px] border border-primary/20 bg-surface-container">
          <div className="p-2.5 border-b border-primary/20 bg-surface-container-high flex flex-wrap items-center justify-between gap-2">
            <span className="font-sans text-xs font-bold uppercase tracking-wider text-primary">
              Stories ({filteredStories.length})
            </span>
            <div className="flex items-center gap-1 bg-surface border border-primary/20 p-0.5 text-[10px] font-sans font-bold">
              <button
                type="button"
                onClick={() => setSortMode('broadsheet')}
                className={`px-2 py-0.5 transition-colors cursor-pointer ${
                  sortMode === 'broadsheet' ? 'bg-primary text-background' : 'text-on-surface-variant hover:text-primary'
                }`}
                title="Sort by live website placement order"
              >
                🏆 Broadsheet Rank
              </button>
              <button
                type="button"
                onClick={() => setSortMode('date')}
                className={`px-2 py-0.5 transition-colors cursor-pointer ${
                  sortMode === 'date' ? 'bg-primary text-background' : 'text-on-surface-variant hover:text-primary'
                }`}
                title="Sort chronologically by publish date"
              >
                ⏱️ Date
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-primary/10">
            {isLoadingStories ? (
              <div className="p-8 text-center text-on-surface-variant font-serif text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                Loading collection from Firestore...
              </div>
            ) : filteredStories.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant font-serif text-xs">
                No stories found matching "{searchFilter}".
              </div>
            ) : (
              filteredStories.map((story, idx) => {
                const isSelected = selectedStory?.story_id === story.story_id;
                const title = story.daily_buzz?.title_en || story.daily_buzz?.title_bn || story.story_id;
                const placement = storyPlacementMap.get(story.story_id) || getStorySlotPlacement(idx, activeCollection);

                return (
                  <button
                    key={`${story.story_id}-${idx}`}
                    onClick={() => setSelectedStory(story)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-primary/10 border-l-4 border-l-primary'
                        : 'hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono gap-1">
                      <span className="text-secondary font-bold truncate max-w-[170px]">
                        #{story.story_id.slice(0, 14)}...
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-surface-container px-1.5 py-0.5 border border-primary/20 font-bold text-primary" title={`Position: #${placement.position} | Importance: ${story.importance_score ?? 2.0} | Dynamic Rank: ${(story.rank_score ?? 0).toFixed(3)}`}>
                          Pos #{placement.position} • Rank: {(story.rank_score ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <h4 className="font-serif text-xs font-bold text-primary line-clamp-2 leading-snug">
                      {title}
                    </h4>

                    <div className="flex items-center justify-between gap-1 text-[10px] pt-1">
                      <span className={`px-2 py-0.5 border text-[10px] font-mono font-bold rounded ${placement.badgeClass}`}>
                        {placement.badgeLabel}
                      </span>
                      <span className="text-on-surface-variant font-sans uppercase">
                        {formatRelativeTime(story.published_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DIRECT ARTICLE & SCORING EDITOR */}
        <div className="lg:col-span-7 flex flex-col h-[750px] border border-primary/20 bg-surface">
          {selectedStory ? (
            <div className="flex flex-col h-full">
              {/* Header Actions */}
              <div className="p-3 border-b border-primary/20 bg-surface-container-high flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-secondary" />
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-primary">
                    Document Editor • ID: <span className="font-mono">{selectedStory.story_id}</span>
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {statusMessage && (
                    <span className={`text-[11px] font-sans font-bold px-2.5 py-1 flex items-center gap-1.5 border shadow-xs ${
                      statusMessage.type === 'success'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40'
                    }`}>
                      {statusMessage.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{statusMessage.text}</span>
                    </span>
                  )}

                  {/* 1. Social Photo Card Studio Launcher */}
                  <button
                    type="button"
                    onClick={() => {
                      setSocialStudioInitialTab('photo');
                      setIsSocialStudioOpen(true);
                    }}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white font-sans text-xs font-bold uppercase px-3 py-1.5 flex items-center gap-1.5 transition-colors border border-emerald-500 cursor-pointer shadow-sm active:scale-98"
                    title="Open Sondesh Express Social Photo Card Studio (4:5)"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Photo Card (4:5)</span>
                  </button>

                  {/* 2. 13-Second Motion News Reel Video (60 FPS) Launcher */}
                  <button
                    type="button"
                    onClick={() => {
                      setSocialStudioInitialTab('video');
                      setIsSocialStudioOpen(true);
                    }}
                    className="bg-teal-700 hover:bg-teal-600 text-white font-sans text-xs font-bold uppercase px-3 py-1.5 flex items-center gap-1.5 transition-colors border border-teal-500 cursor-pointer shadow-sm active:scale-98"
                    title="Open Sondesh Express 13-Second 60 FPS Motion News Reel Studio"
                  >
                    <Film className="w-3.5 h-3.5 text-teal-200" />
                    <span>13s Video Reel</span>
                  </button>

                  <button
                    onClick={handleDeleteStory}
                    disabled={isSaving}
                    className="p-1.5 text-red-500 hover:bg-red-950/20 border border-red-500/30 transition-colors cursor-pointer text-xs flex items-center gap-1"
                    title="Delete story from Firestore"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  <button
                    onClick={handleSaveStory}
                    disabled={isSaving}
                    className="bg-primary text-background font-sans text-xs font-bold uppercase px-4 py-1.5 flex items-center gap-1.5 hover:bg-surface-container-highest hover:text-primary transition-colors border border-primary cursor-pointer disabled:opacity-50 shadow-sm active:scale-98"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isSaving ? 'Saving to Firestore...' : 'Save to Live Firestore'}</span>
                  </button>
                </div>
              </div>

              {/* Form Body vs Live Broadsheet Preview */}
              {previewMode === 'preview' ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
                  <div className="max-w-2xl mx-auto border border-primary/30 p-6 bg-surface shadow-sm">
                    {/* Eyebrow & Slot placement badge */}
                    <div className="flex items-center justify-between border-b border-primary/20 pb-3 mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-secondary text-on-secondary font-label-sm text-label-sm uppercase font-bold">
                          {selectedStory.primary_category?.replace('_', ' ')}
                        </span>
                        {selectedStory.is_bcs_pro_selected && (
                          <span className="px-2 py-0.5 bg-primary text-background font-label-sm text-label-sm uppercase font-bold">
                            Current Affairs Dossier
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-secondary font-bold">
                        Target Slot: {(storyPlacementMap.get(selectedStory.story_id) || getStorySlotPlacement(0, activeCollection)).badgeLabel}
                      </span>
                    </div>

                    {/* Headline EN / BN */}
                    <h2 className="font-display-headline text-xl sm:text-2xl text-primary font-bold leading-tight mb-2">
                      {isBn
                        ? (selectedStory.daily_buzz?.title_bn || selectedStory.daily_buzz?.title_en)
                        : (selectedStory.daily_buzz?.title_en || selectedStory.daily_buzz?.title_bn)}
                    </h2>

                    {/* Alternative Language Sub-headline */}
                    <h3 className="font-serif text-sm font-semibold text-secondary mb-4 italic">
                      {isBn
                        ? selectedStory.daily_buzz?.title_en
                        : selectedStory.daily_buzz?.title_bn}
                    </h3>

                    {/* Lead Paragraph */}
                    <div className="p-3 bg-surface-container-low border-l-4 border-l-secondary font-serif text-xs sm:text-sm text-primary leading-relaxed mb-4 text-justify">
                      {isBn
                        ? (selectedStory.daily_buzz?.summary_bn || selectedStory.daily_buzz?.summary_en)
                        : (selectedStory.daily_buzz?.summary_en || selectedStory.daily_buzz?.summary_bn)}
                    </div>

                    {/* Key Bullets */}
                    {((selectedStory.daily_buzz?.bullets_bn && selectedStory.daily_buzz.bullets_bn.length > 0) ||
                      (selectedStory.daily_buzz?.bullets_en && selectedStory.daily_buzz.bullets_en.length > 0)) && (
                      <div className="mb-4 p-3 bg-surface-container border border-primary/20">
                        <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary block mb-2">
                          Key Analytical Dispatches
                        </span>
                        <ul className="space-y-1.5 list-disc list-inside text-xs font-serif text-primary">
                          {(isBn
                            ? (selectedStory.daily_buzz?.bullets_bn || selectedStory.daily_buzz?.bullets_en)
                            : (selectedStory.daily_buzz?.bullets_en || selectedStory.daily_buzz?.bullets_bn)
                          )?.map((bullet, bIdx) => (
                            <li key={bIdx} className="leading-relaxed">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Extended Details */}
                    {selectedStory.daily_buzz?.details_en && (
                      <p className="font-serif text-xs text-on-surface-variant leading-relaxed text-justify mb-4">
                        {isBn
                          ? (selectedStory.daily_buzz?.details_bn || selectedStory.daily_buzz?.details_en)
                          : (selectedStory.daily_buzz?.details_en || selectedStory.daily_buzz?.details_bn)}
                      </p>
                    )}

                    {/* Sources footer */}
                    {selectedStory.sources && selectedStory.sources.length > 0 && (
                      <div className="pt-3 border-t border-primary/20 flex flex-wrap items-center gap-2">
                        <span className="font-sans text-[10px] font-bold uppercase text-outline">Verified Sources:</span>
                        {selectedStory.sources.map((src, sIdx) => (
                          <span key={sIdx} className="px-2 py-0.5 bg-surface-container-high border border-outline-variant text-[10px] font-mono font-bold text-primary">
                            {src.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                  {/* 1. SCORING & EDITORIAL PLACEMENT COMMAND */}
                  {(() => {
                    const currentPlacement = storyPlacementMap.get(selectedStory.story_id) || getStorySlotPlacement(0, activeCollection);
                    const dynamicRank = calculateDynamicRank(selectedStory.importance_score ?? 2.0, selectedStory.published_at, 30);
                    const ageText = formatRelativeTime(selectedStory.published_at);

                    return (
                      <div className="border border-secondary/30 bg-secondary/5 p-4 space-y-4">
                        {/* Placement Command Header */}
                        <div className="flex flex-wrap items-center justify-between border-b border-secondary/20 pb-2.5 gap-2">
                          <div className="flex items-center space-x-2 font-sans text-xs font-bold uppercase text-secondary">
                            <Sliders className="w-4 h-4" />
                            <span>Broadsheet Placement & Scoring Command</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 text-xs font-mono font-bold border rounded ${currentPlacement.badgeClass}`}>
                              {currentPlacement.badgeLabel} • Pos #{currentPlacement.position}
                            </span>
                          </div>
                        </div>

                        {/* Real dynamic score telemetry */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                          <div className="p-2.5 bg-surface-container border border-primary/20">
                            <span className="text-[10px] text-on-surface-variant uppercase block font-sans">Live Broadsheet Slot</span>
                            <span className="text-xs font-bold text-primary block truncate">{currentPlacement.label}</span>
                          </div>
                          <div className="p-2.5 bg-surface-container border border-primary/20">
                            <span className="text-[10px] text-on-surface-variant uppercase block font-sans">Feed Position</span>
                            <span className="text-sm font-bold text-secondary">#{currentPlacement.position} of {stories.length}</span>
                          </div>
                          <div className="p-2.5 bg-surface-container border border-primary/20">
                            <span className="text-[10px] text-on-surface-variant uppercase block font-sans">Decayed Rank</span>
                            <span className="text-sm font-bold text-primary">{dynamicRank.toFixed(3)}</span>
                          </div>
                          <div className="p-2.5 bg-surface-container border border-primary/20">
                            <span className="text-[10px] text-on-surface-variant uppercase block font-sans">Base Importance</span>
                            <span className="text-sm font-bold text-primary">{(selectedStory.importance_score ?? 2.0).toFixed(1)} / 10.0</span>
                          </div>
                        </div>

                        {/* 1-Click Slot Assignment Buttons */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] font-sans font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              <span>Quick Slot Promotion (1-Click Broadsheet Assignment)</span>
                            </label>
                            <span className="text-[10px] text-on-surface-variant font-serif">
                              Auto-calculates importance based on age decay
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              type="button"
                              onClick={() => handleAssignSlot('hero')}
                              className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                currentPlacement.slotKey === 'hero'
                                  ? 'bg-amber-500/20 border-amber-500 ring-1 ring-amber-500 text-amber-400 shadow-sm'
                                  : 'bg-surface border-primary/20 hover:border-amber-500 text-on-surface'
                              }`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1">🌟 Center Hero</span>
                              <span className="text-[10px] text-on-surface-variant font-serif mt-1">
                                #1 Top Centerfold
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAssignSlot('col1')}
                              className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                currentPlacement.slotKey === 'col1_top' || currentPlacement.slotKey === 'col1_bottom'
                                  ? 'bg-blue-500/20 border-blue-500 ring-1 ring-blue-500 text-blue-400 shadow-sm'
                                  : 'bg-surface border-primary/20 hover:border-blue-500 text-on-surface'
                              }`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1">📰 Column 1 (Left)</span>
                              <span className="text-[10px] text-on-surface-variant font-serif mt-1">
                                Lead Dispatches (Pos #2–#3)
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAssignSlot('col3')}
                              className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                currentPlacement.slotKey === 'col3_wire'
                                  ? 'bg-emerald-500/20 border-emerald-500 ring-1 ring-emerald-500 text-emerald-400 shadow-sm'
                                  : 'bg-surface border-primary/20 hover:border-emerald-500 text-on-surface'
                              }`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1">⚡ Wire Desk (Col 3)</span>
                              <span className="text-[10px] text-on-surface-variant font-serif mt-1">
                                Fast Briefs (Pos #4–#7)
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAssignSlot('grid')}
                              className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                currentPlacement.slotKey === 'grid'
                                  ? 'bg-primary/20 border-primary ring-1 ring-primary text-primary shadow-sm'
                                  : 'bg-surface border-primary/20 hover:border-primary text-on-surface'
                              }`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1">📑 Inside Grid</span>
                              <span className="text-[10px] text-on-surface-variant font-serif mt-1">
                                Lower Archive (Pos #8+)
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Fine Tuning Slider & Metadata Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-serif text-on-surface-variant font-semibold">
                                Editorial Base Override (1.0 to 10.0)
                              </label>
                              <span className="text-xs font-mono font-bold text-primary">
                                {(selectedStory.importance_score ?? 2.0).toFixed(1)}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1.0"
                              max="10.0"
                              step="0.5"
                              value={selectedStory.importance_score ?? 2.0}
                              onChange={(e) => handleImportanceChange(parseFloat(e.target.value))}
                              className="w-full accent-secondary cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[11px] font-serif text-on-surface-variant">
                              <span>Published: <strong>{ageText}</strong></span>
                              <button
                                type="button"
                                onClick={handleTouchTimestamp}
                                className="inline-flex items-center gap-1 text-[10px] font-sans font-bold text-secondary hover:underline cursor-pointer"
                                title="Sets publication timestamp to NOW to clear old age decay penalty"
                              >
                                <Clock className="w-3 h-3" />
                                <span>Reset Time to Now (Fresh)</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-serif text-on-surface-variant font-semibold">
                              Website Category Desk
                            </label>
                            {(() => {
                              const currentCatLower = (selectedStory.primary_category || '').toLowerCase();
                              const isUnmatched = !WEBSITE_CATEGORY_DESKS.some(
                                (d) => d.value.toLowerCase() === currentCatLower
                              );

                              return (
                                <select
                                  value={selectedStory.primary_category}
                                  onChange={(e) => {
                                    const newCat = e.target.value;
                                    setSelectedStory({
                                      ...selectedStory,
                                      primary_category: newCat,
                                      interest_categories: Array.from(new Set([newCat, ...(selectedStory.interest_categories || [])]))
                                    });
                                  }}
                                  className="w-full bg-surface border border-primary/30 text-xs text-primary p-2 focus:outline-none font-sans font-medium"
                                >
                                  {isUnmatched && selectedStory.primary_category && (
                                    <option value={selectedStory.primary_category}>
                                      {selectedStory.primary_category} (Current Desk)
                                    </option>
                                  )}
                                  {WEBSITE_CATEGORY_DESKS.map((desk) => {
                                    const isCurrent = currentCatLower === desk.value.toLowerCase();
                                    const optionValue = isCurrent ? selectedStory.primary_category : desk.value;
                                    return (
                                      <option key={desk.value} value={optionValue}>
                                        {desk.label}
                                      </option>
                                    );
                                  })}
                                </select>
                              );
                            })()}

                            <label className="flex items-center gap-2 cursor-pointer pt-1 select-none text-xs font-serif">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedStory.is_bcs_pro_selected)}
                                onChange={(e) =>
                                  setSelectedStory({
                                    ...selectedStory,
                                    is_bcs_pro_selected: e.target.checked
                                  })
                                }
                                className="accent-secondary"
                              />
                              <span className="font-semibold text-primary">Current Affairs / BCS Pro Analytical Badge</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {/* 2. ENGLISH COPYWRITING */}
                <div className="space-y-3">
                  <h5 className="font-sans text-xs font-bold uppercase tracking-wider text-primary border-b border-primary/20 pb-1">
                    English Editorial Text
                  </h5>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                      Headline (Title EN)
                    </label>
                    <input
                      type="text"
                      value={selectedStory.daily_buzz?.title_en || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, title_en: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif font-bold text-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                      Lead Paragraph / Executive Summary (EN)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedStory.daily_buzz?.summary_en || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, summary_en: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                      Deep Analytical Details (EN)
                    </label>
                    <textarea
                      rows={4}
                      value={selectedStory.daily_buzz?.details_en || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, details_en: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                      Key Takeaway Bullets (EN) — One bullet point per line
                    </label>
                    <textarea
                      rows={3}
                      value={(selectedStory.daily_buzz?.bullets_en || []).join('\n')}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: {
                            ...selectedStory.daily_buzz,
                            bullets_en: e.target.value.split('\n').filter((l) => l.trim().length > 0)
                          }
                        })
                      }
                      placeholder="• First analytical point&#10;• Policy decision or statistic&#10;• Strategic consequence"
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* 3. BANGLA COPYWRITING */}
                <div className="space-y-3 pt-3 border-t border-primary/20">
                  <h5 className="font-sans text-xs font-bold uppercase tracking-wider text-primary border-b border-primary/20 pb-1">
                    বাংলা সম্পাদকীয় টেক্সট
                  </h5>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1 font-bangla">
                      শিরোনাম (Title BN)
                    </label>
                    <input
                      type="text"
                      value={selectedStory.daily_buzz?.title_bn || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, title_bn: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif font-bold text-primary focus:outline-none font-bangla"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1 font-bangla">
                      নির্বাহী সারসংক্ষেপ (Summary BN)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedStory.daily_buzz?.summary_bn || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, summary_bn: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed font-bangla"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1 font-bangla">
                      বিশ্লেষণাত্মক প্রেক্ষাপট (Details BN)
                    </label>
                    <textarea
                      rows={4}
                      value={selectedStory.daily_buzz?.details_bn || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: { ...selectedStory.daily_buzz, details_bn: e.target.value }
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed font-bangla"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1 font-bangla">
                      প্রধান বিশ্লেষণাত্মক বুলেট পয়েন্ট (BN) — প্রতি লাইনে একটি পয়েন্ট
                    </label>
                    <textarea
                      rows={3}
                      value={(selectedStory.daily_buzz?.bullets_bn || []).join('\n')}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          daily_buzz: {
                            ...selectedStory.daily_buzz,
                            bullets_bn: e.target.value.split('\n').filter((l) => l.trim().length > 0)
                          }
                        })
                      }
                      placeholder="• প্রথম গুরুত্বপূর্ণ তথ্য&#10;• নীতিগত প্রেক্ষাপট বা পরিসংখ্যান&#10;• ভবিষ্যৎ প্রভাব"
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-serif text-primary focus:outline-none leading-relaxed font-bangla"
                    />
                  </div>
                </div>

                {/* 4. SOURCES & METADATA */}
                <div className="space-y-3 pt-3 border-t border-primary/20">
                  <h5 className="font-sans text-xs font-bold uppercase tracking-wider text-primary border-b border-primary/20 pb-1">
                    Sources, Image & Timestamp
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                        Hero Photo URL
                      </label>
                      <input
                        type="text"
                        value={selectedStory.image_url || ''}
                        onChange={(e) =>
                          setSelectedStory({
                            ...selectedStory,
                            image_url: e.target.value || null
                          })
                        }
                        placeholder="https://..."
                        className="w-full bg-surface border border-primary/30 p-2 text-xs font-mono text-primary focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                        Publication Timestamp
                      </label>
                      <input
                        type="text"
                        value={selectedStory.published_at || ''}
                        onChange={(e) =>
                          setSelectedStory({
                            ...selectedStory,
                            published_at: e.target.value
                          })
                        }
                        className="w-full bg-surface border border-primary/30 p-2 text-xs font-mono text-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-bold text-on-surface-variant mb-1">
                      Editorial Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      value={selectedStory.tags?.join(', ') || ''}
                      onChange={(e) =>
                        setSelectedStory({
                          ...selectedStory,
                          tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                        })
                      }
                      className="w-full bg-surface border border-primary/30 p-2 text-xs font-mono text-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
              <Layers className="w-10 h-10 mb-3 text-secondary/40" />
              <h4 className="font-serif text-base font-bold text-primary mb-1">
                No Article Selected
              </h4>
              <p className="font-serif text-xs max-w-sm">
                Select an archived story from the left register to adjust scoring, edit bilingual copies, or create a new dispatch.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SOCIAL MEDIA STUDIO (PHOTO CARD & 10s VIDEO REEL) */}
      {isSocialStudioOpen && selectedStory && (
        <SocialCardStudio
          story={selectedStory}
          initialTab={socialStudioInitialTab}
          onClose={() => setIsSocialStudioOpen(false)}
        />
      )}
    </div>
  );
};
