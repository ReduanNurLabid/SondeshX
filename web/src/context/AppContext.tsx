import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CapsuleStory, Language, TabType } from '../types';
import { applyPageMeta, storyIdFromPath, storyPath } from '../utils/seo';
import { fetchDailyBuzzFeed, fetchCurrentAffairsFeed, fetchHourlyWiresFeed, fetchStoryById } from '../services/api';
import { translations } from '../utils/bilingual';
import { synthesizeAudioStory, prepareSpeechText } from '../services/ttsService';

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  isSerif: boolean;
  setIsSerif: (val: boolean) => void;
  fontSize: 'sm' | 'base' | 'lg';
  setFontSize: (size: 'sm' | 'base' | 'lg') => void;
  focusMode: boolean;
  setFocusMode: (val: boolean) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedCurrentAffairId: string | null;
  setSelectedCurrentAffairId: (id: string | null) => void;
  savedStoryIds: string[];
  toggleSave: (storyId: string) => void;
  isSaved: (storyId: string) => boolean;
  clearSaved: () => void;
  getVoteCount: (storyId: string, type: 'informative' | 'important') => number;
  hasVoted: (storyId: string, type: 'informative' | 'important') => boolean;
  toggleVote: (storyId: string, type: 'informative' | 'important') => void;
  activeStory: CapsuleStory | null;
  openStory: (story: CapsuleStory) => void;
  closeStory: () => void;
  isAudioSheetOpen: boolean;
  setIsAudioSheetOpen: (val: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (val: boolean) => void;
  buzzStories: CapsuleStory[];
  currentAffairs: CapsuleStory[];
  hourlyWires: CapsuleStory[];
  allStories: CapsuleStory[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  refreshFeeds: () => Promise<void>;
  t: (key: keyof typeof translations['en']) => string;
  // Neural Audio Engine
  currentAudioStory: CapsuleStory | null;
  isPlayingAudio: boolean;
  isAudioLoading: boolean;
  audioProgress: number; // 0-100 percentage
  audioCurrentTime: number; // current elapsed seconds
  audioTimeRemaining: number; // seconds
  audioDuration: number; // total duration in seconds
  audioPlaybackRate: number;
  audioHeartbeatScale: number; // 1.0 to 1.8 dynamic scale for heartbeat animation
  audioAnalyser: AnalyserNode | null;
  audioWords: Array<{ text: string; start: number; end: number }>;
  currentWordIndex: number;
  setAudioPlaybackRate: (rate: number) => void;
  playStoryAudio: (story: CapsuleStory) => void;
  pauseAudio: () => void;
  resumeAudio: () => void;
  toggleAudio: () => void;
  stopAudio: () => void;
  dismissAudioPlayer: () => void;
  playNextAudio: () => void;
  playPrevAudio: () => void;
  skipAudio: (seconds: number) => void;
  seekAudio: (percent: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('dorpon_lang') as Language) || 'bn';
  });
  const [isSerif, setIsSerifState] = useState<boolean>(() => {
    return localStorage.getItem('dorpon_serif') === 'true';
  });
  const [fontSize, setFontSizeState] = useState<'sm' | 'base' | 'lg'>('base');
  const [focusMode, setFocusModeState] = useState<boolean>(false);
  const [activeTab, setActiveTabState] = useState<TabType>('top_stories');
  const [selectedCurrentAffairId, setSelectedCurrentAffairIdState] = useState<string | null>(null);

  const setSelectedCurrentAffairId = (id: string | null) => {
    setSelectedCurrentAffairIdState(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('story', id);
        url.searchParams.set('tab', 'current_affairs');
      } else {
        url.searchParams.delete('story');
      }
      window.history.replaceState({ storyId: id, tab: 'current_affairs' }, '', url.toString());
    }
  };

  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'current_affairs') {
        url.searchParams.set('tab', 'current_affairs');
        if (selectedCurrentAffairId) {
          url.searchParams.set('story', selectedCurrentAffairId);
        } else if (currentAffairs.length > 0) {
          url.searchParams.set('story', currentAffairs[0].story_id);
        }
      } else if (tab === 'editorial_dashboard') {
        url.searchParams.set('tab', 'editorial_dashboard');
        url.searchParams.delete('story');
      } else {
        // Leaving current_affairs / dashboard: remove the tab param
        url.searchParams.delete('tab');
        // If the current ?story is a current affairs story or there is no open modal story, remove ?story
        if (!activeStory || activeStory.story_id !== url.searchParams.get('story')) {
          url.searchParams.delete('story');
        }
      }
      window.history.replaceState({ tab }, '', url.toString());
    }
  };

  const [savedStoryIds, setSavedStoryIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dorpon_saved_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeStory, setActiveStory] = useState<CapsuleStory | null>(null);
  const [isAudioSheetOpen, setIsAudioSheetOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [buzzStories, setBuzzStories] = useState<CapsuleStory[]>([]);
  const [currentAffairs, setCurrentAffairs] = useState<CapsuleStory[]>([]);
  const [hourlyWires, setHourlyWires] = useState<CapsuleStory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Audio Engine State
  const [currentAudioStory, setCurrentAudioStory] = useState<CapsuleStory | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(45);
  const [audioTimeRemaining, setAudioTimeRemaining] = useState<number>(45);
  const [audioPlaybackRate, setAudioPlaybackRateState] = useState<number>(1.0);
  const [audioHeartbeatScale, setAudioHeartbeatScale] = useState<number>(1.0);
  const [audioAnalyser, setAudioAnalyserState] = useState<AnalyserNode | null>(null);
  const [audioWords, setAudioWords] = useState<Array<{ text: string; start: number; end: number }>>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);

  // Audio Elements & Context References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const chimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioDurationRef = useRef<number>(45);
  const speechStartTimeRef = useRef<number>(0);
  const audioWordsRef = useRef<Array<{ text: string; start: number; end: number }>>([]);

  useEffect(() => {
    // Initialize HTML5 Audio Element
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    chimeAudioRef.current = new Audio('/data/transition_chime.wav');
    chimeAudioRef.current.volume = 0.3;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    // Exact progress and time listeners matching Voice Studio
    audio.ontimeupdate = () => {
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const dur = (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) 
        ? audio.duration 
        : (audioDurationRef.current || 20);

      if (dur > 0) {
        const rawPct = (cur / dur) * 100;
        const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
        setAudioProgress(pct);
        setAudioCurrentTime(Math.round(cur));
        setAudioTimeRemaining(Math.max(0, Math.round(dur - cur)));

        // Word boundary highlighting in real time
        const words = audioWordsRef.current;
        if (words && words.length > 0) {
          const wIdx = words.findIndex(w => cur >= w.start && cur <= w.end);
          if (wIdx !== -1) setCurrentWordIndex(wIdx);
        }
      }
    };

    audio.onloadedmetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(Math.round(audio.duration));
        audioDurationRef.current = Math.round(audio.duration);
        setAudioTimeRemaining(Math.round(audio.duration));
      }
    };

    audio.onended = () => {
      setIsPlayingAudio(false);
      setAudioProgress(100);
      setCurrentWordIndex(-1);
      try {
        chimeAudioRef.current?.play().catch(() => {});
      } catch {}
      playNextAudio();
    };

    audio.onerror = () => {
      setIsPlayingAudio(false);
      setIsAudioLoading(false);
    };

    return () => {
      audio.pause();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Web Audio Visualizer Setup (Mirrors Voice Studio initWebAudioSource)
  const initAudioAnalyser = () => {
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        setAudioAnalyserState(analyser);
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (audioRef.current && !(audioRef.current as any)._hasSource && analyserRef.current) {
        const source = audioContextRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        (audioRef.current as any)._hasSource = true;
        sourceNodeRef.current = source;
      }
    } catch (err) {
      console.log('AudioContext initialization note:', err);
    }
  };

  // Heartbeat & Continuous Audio Progress Loop
  useEffect(() => {
    let phase = 0;
    const updatePlaybackLoop = () => {
      if (isPlayingAudio) {
        // Continuous smooth progress calculation
        if (audioRef.current && audioRef.current.src && !audioRef.current.paused) {
          const cur = Number.isFinite(audioRef.current.currentTime) ? audioRef.current.currentTime : 0;
          const dur = (audioRef.current.duration && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0)
            ? audioRef.current.duration
            : (audioDurationRef.current || 25);
          if (dur > 0) {
            const rawPct = (cur / dur) * 100;
            const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
            setAudioProgress(pct);
            setAudioCurrentTime(Math.round(cur));
            setAudioTimeRemaining(Math.max(0, Math.round(dur - cur)));

            // Word tracking
            const words = audioWordsRef.current;
            if (words && words.length > 0) {
              const wIdx = words.findIndex(w => cur >= w.start && cur <= w.end);
              if (wIdx !== -1) setCurrentWordIndex(wIdx);
            }
          }
        } else if (speechStartTimeRef.current > 0) {
          // Synthetic / Speech fallback progress ticker
          const elapsed = (Date.now() - speechStartTimeRef.current) / 1000;
          const total = audioDurationRef.current || 25;
          const rawPct = (elapsed / total) * 100;
          const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
          setAudioProgress(pct);
          setAudioCurrentTime(Math.round(elapsed));
          setAudioTimeRemaining(Math.max(0, Math.round(total - elapsed)));

          // Word tracking for synthetic fallback
          const words = audioWordsRef.current;
          if (words && words.length > 0) {
            const wIdx = Math.min(words.length - 1, Math.floor((pct / 100) * words.length));
            setCurrentWordIndex(wIdx);
          }
        }

        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / (dataArray.length * 255);
          const scale = 1.0 + Math.min(0.4, avg * 1.5);
          setAudioHeartbeatScale(scale);
        } else {
          phase += 0.08;
          const scale = 1.0 + Math.sin(phase) * 0.12;
          setAudioHeartbeatScale(scale);
        }
      } else {
        setAudioHeartbeatScale(1.0);
      }
      animFrameRef.current = requestAnimationFrame(updatePlaybackLoop);
    };

    animFrameRef.current = requestAnimationFrame(updatePlaybackLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlayingAudio]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('dorpon_lang', lang);
  };

  const toggleLanguage = () => {
    const next = language === 'en' ? 'bn' : 'en';
    setLanguage(next);
  };

  const setIsSerif = (val: boolean) => {
    setIsSerifState(val);
    localStorage.setItem('dorpon_serif', String(val));
  };

  const setFontSize = (size: 'sm' | 'base' | 'lg') => {
    setFontSizeState(size);
  };

  const setFocusMode = (val: boolean) => {
    setFocusModeState(val);
  };

  const toggleSave = (storyId: string) => {
    setSavedStoryIds(prev => {
      const exists = prev.includes(storyId);
      const updated = exists ? prev.filter(id => id !== storyId) : [storyId, ...prev];
      localStorage.setItem('dorpon_saved_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const isSaved = (storyId: string) => savedStoryIds.includes(storyId);

  const clearSaved = () => {
    setSavedStoryIds([]);
    localStorage.removeItem('dorpon_saved_ids');
  };

  // Real Public Voting Engine with Persistent Submissions
  const [votes, setVotes] = useState<Record<string, { informative: number; important: number }>>(() => {
    try {
      const stored = localStorage.getItem('dorpon_public_votes');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [userVoted, setUserVoted] = useState<Record<string, { informative?: boolean; important?: boolean }>>(() => {
    try {
      const stored = localStorage.getItem('dorpon_user_voted');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const getVoteCount = (storyId: string, type: 'informative' | 'important') => {
    return votes[storyId]?.[type] || 0;
  };

  const hasVoted = (storyId: string, type: 'informative' | 'important') => {
    return !!userVoted[storyId]?.[type];
  };

  const toggleVote = (storyId: string, type: 'informative' | 'important') => {
    setUserVoted(prevUser => {
      const isAlreadyVoted = !!prevUser[storyId]?.[type];
      const nextUser = {
        ...prevUser,
        [storyId]: {
          ...prevUser[storyId],
          [type]: !isAlreadyVoted
        }
      };
      try {
        localStorage.setItem('dorpon_user_voted', JSON.stringify(nextUser));
      } catch {}

      setVotes(prevVotes => {
        const currentCount = prevVotes[storyId]?.[type] || 0;
        const newCount = isAlreadyVoted ? Math.max(0, currentCount - 1) : currentCount + 1;
        const nextVotes = {
          ...prevVotes,
          [storyId]: {
            informative: prevVotes[storyId]?.informative || 0,
            important: prevVotes[storyId]?.important || 0,
            [type]: newCount
          }
        };
        try {
          localStorage.setItem('dorpon_public_votes', JSON.stringify(nextVotes));
        } catch {}
        return nextVotes;
      });

      return nextUser;
    });
  };

  // Each story has its own address, /story/<id>/, so it can be shared and indexed.
  const openStory = (story: CapsuleStory) => {
    setActiveStory(story);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('story');
      url.pathname = storyPath(story.story_id);
      window.history.pushState({ storyId: story.story_id }, '', url.toString());
    }
  };

  const closeStory = () => {
    setActiveStory(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('story');
      if (storyIdFromPath(url.pathname)) url.pathname = '/';
      window.history.pushState({}, '', url.toString());
    }
  };

  // Title, description and share tags follow the open story (or the front page).
  useEffect(() => {
    applyPageMeta(activeStory, language);
  }, [activeStory, language]);

  const t = (key: keyof typeof translations['en']): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  const refreshFeeds = async () => {
    setIsLoading(true);
    try {
      const [buzz, affairs, wires] = await Promise.all([
        fetchDailyBuzzFeed(),
        fetchCurrentAffairsFeed(),
        fetchHourlyWiresFeed(),
      ]);
      setBuzzStories(buzz);
      setCurrentAffairs(affairs);
      setHourlyWires(wires);
    } catch (err) {
      console.error('Error fetching feeds:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshFeeds();
  }, []);

  const allStories = React.useMemo(() => {
    const map = new Map<string, CapsuleStory>();
    for (const s of buzzStories) map.set(s.story_id, s);
    for (const s of currentAffairs) map.set(s.story_id, s);
    for (const s of hourlyWires) map.set(s.story_id, s);
    return Array.from(map.values());
  }, [buzzStories, currentAffairs, hourlyWires]);

  // Deep linking and permalink synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || allStories.length === 0) return;

    const syncFromUrl = () => {
      const urlParams = new URLSearchParams(window.location.search);
      // /story/<id>/ is the canonical story address; ?story=<id> links from before still work.
      const storyParam = storyIdFromPath(window.location.pathname) || urlParams.get('story');
      const searchParam = urlParams.get('q');
      if (searchParam) {
        setSearchQuery(searchParam);
        setActiveTabState('discover');
      }
      const tabParam = urlParams.get('tab') as TabType | null;
      const pathname = window.location.pathname.toLowerCase();
      const isEditorPath = pathname === '/dashboard' || pathname === '/editor' || urlParams.get('tab') === 'editorial_dashboard' || urlParams.has('editor');

      if (isEditorPath) {
        setActiveTabState('editorial_dashboard');
        return;
      }

      if (tabParam && ['top_stories', 'current_affairs', 'discover'].includes(tabParam)) {
        setActiveTabState(tabParam);
      }

      if (storyParam) {
        if (tabParam === 'current_affairs') {
          setActiveTabState('current_affairs');
          setSelectedCurrentAffairIdState(storyParam);
        } else {
          // If tabParam is not current_affairs, look in allStories for modal reading
          const storyMatch = allStories.find(s => s.story_id === storyParam);
          if (storyMatch) {
            setActiveStory(storyMatch);
          } else {
            const affairMatch = currentAffairs.find(s => s.story_id === storyParam);
            if (affairMatch && !tabParam) {
              setActiveTabState('current_affairs');
              setSelectedCurrentAffairIdState(storyParam);
            } else if (!affairMatch) {
              // Older than the hourly snapshot (e.g. a link from an earlier Facebook post):
              // fetch just this story, a single database read.
              fetchStoryById(storyParam).then((older) => {
                if (older && storyIdFromPath(window.location.pathname) === storyParam) setActiveStory(older);
              });
            }
          }
        }
      } else if (!urlParams.has('story') && !storyIdFromPath(window.location.pathname)) {
        setActiveStory(null);
      }
    };

    syncFromUrl();

    const handlePopState = () => {
      syncFromUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [allStories, currentAffairs]);

  // Audio Player Engine
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    speechStartTimeRef.current = 0;
    audioWordsRef.current = [];
    setAudioWords([]);
    setCurrentWordIndex(-1);
    setIsPlayingAudio(false);
    setIsAudioLoading(false);
    setAudioProgress(0);
    setAudioCurrentTime(0);
  };

  // Completely dismisses the floating player and sheet overlay
  const dismissAudioPlayer = () => {
    stopAudio();
    setCurrentAudioStory(null);
    setIsAudioSheetOpen(false);
  };

  const playStoryAudio = async (story: CapsuleStory) => {
    stopAudio();
    setCurrentAudioStory(story);
    setIsAudioLoading(true);

    const isBn = language === 'bn';
    const buzz = story.daily_buzz;
    const title = isBn ? (buzz.title_bn || buzz.title_en) : (buzz.title_en || buzz.title_bn);
    const bullets = isBn ? (buzz.bullets_bn || []) : (buzz.bullets_en || []);
    const whyItMatters = isBn ? (buzz.why_it_matters_bn || buzz.summary_bn) : (buzz.why_it_matters_en || buzz.summary_en);

    const speechScript = `${title}. ` +
      (bullets.length > 0 ? (isBn ? `মূল বার্তা: ${bullets.join('। ')}। ` : `Key takeaways: ${bullets.join('. ')}. `) : '') +
      (whyItMatters ? (isBn ? `কেন এটি গুরুত্বপূর্ণ: ${whyItMatters}` : `Why it matters: ${whyItMatters}`) : '');

    const voice = isBn ? 'bn-BD-NabanitaNeural' : 'en-US-EmmaNeural';
    const ratePercent = Math.round((audioPlaybackRate - 1.0) * 100);
    const rateStr = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;

    try {
      const result = await synthesizeAudioStory(speechScript, voice, rateStr);
      const words = result.words || [];
      audioWordsRef.current = words;
      setAudioWords(words);
      setCurrentWordIndex(-1);
      setAudioDuration(result.duration);
      audioDurationRef.current = result.duration;
      setAudioTimeRemaining(result.duration);
      setAudioCurrentTime(0);
      setAudioProgress(0);

      if (audioRef.current && result.audioUrl) {
        initAudioAnalyser();
        speechStartTimeRef.current = 0;
        audioRef.current.src = result.audioUrl;
        audioRef.current.playbackRate = audioPlaybackRate;
        await audioRef.current.play();
        setIsPlayingAudio(true);
        setIsAudioLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Neural audio synthesis failed, falling back to Web Speech:', err);
    }

    // Web Speech API Fallback (native on Android/iOS)
    if (synthRef.current) {
      // Split into words for fallback teleprompter
      const fallbackWords = speechScript.split(/\s+/).map((w, idx) => ({
        text: w,
        start: idx * 0.4,
        end: (idx + 1) * 0.4
      }));
      audioWordsRef.current = fallbackWords;
      setAudioWords(fallbackWords);

      const utterance = new SpeechSynthesisUtterance(speechScript);
      utterance.rate = audioPlaybackRate;
      const voices = synthRef.current.getVoices();
      if (isBn) {
        const bnVoice = voices.find(v => v.lang.startsWith('bn'));
        if (bnVoice) utterance.voice = bnVoice;
      } else {
        const enVoice = voices.find(v => v.lang.startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
      }
      utterance.onend = () => {
        speechStartTimeRef.current = 0;
        setCurrentWordIndex(-1);
        setIsPlayingAudio(false);
        playNextAudio();
      };
      speechStartTimeRef.current = Date.now();
      synthRef.current.speak(utterance);
      setIsPlayingAudio(true);
    }
    setIsAudioLoading(false);
  };

  const pauseAudio = () => {
    if (audioRef.current && isPlayingAudio) {
      audioRef.current.pause();
    }
    if (synthRef.current) {
      synthRef.current.pause();
    }
    setIsPlayingAudio(false);
  };

  const resumeAudio = () => {
    if (audioRef.current && audioRef.current.src) {
      initAudioAnalyser();
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    } else if (synthRef.current) {
      synthRef.current.resume();
      if (speechStartTimeRef.current === 0) {
        speechStartTimeRef.current = Date.now() - (audioProgress / 100) * (audioDurationRef.current || 25) * 1000;
      }
      setIsPlayingAudio(true);
    }
  };

  const toggleAudio = () => {
    if (isPlayingAudio) {
      pauseAudio();
    } else {
      if (currentAudioStory) {
        resumeAudio();
      } else if (buzzStories.length > 0) {
        playStoryAudio(buzzStories[0]);
      }
    }
  };

  const playNextAudio = () => {
    if (!currentAudioStory || buzzStories.length === 0) return;
    const currentIndex = buzzStories.findIndex(s => s.story_id === currentAudioStory.story_id);
    const nextIndex = (currentIndex + 1) % buzzStories.length;
    playStoryAudio(buzzStories[nextIndex]);
  };

  const playPrevAudio = () => {
    if (!currentAudioStory || buzzStories.length === 0) return;
    const currentIndex = buzzStories.findIndex(s => s.story_id === currentAudioStory.story_id);
    const prevIndex = (currentIndex - 1 + buzzStories.length) % buzzStories.length;
    playStoryAudio(buzzStories[prevIndex]);
  };

  const skipAudio = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration;
    const totalDur = (dur && isFinite(dur) && dur > 0) ? dur : (audioDurationRef.current || 20);
    audio.currentTime = Math.max(0, Math.min(totalDur, audio.currentTime + seconds));
  };

  const seekAudio = (percent: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration;
    const totalDur = (dur && isFinite(dur) && dur > 0) ? dur : (audioDurationRef.current || 20);
    const clampedPct = Math.max(0, Math.min(100, percent));
    audio.currentTime = (clampedPct / 100) * totalDur;
    setAudioProgress(clampedPct);
  };

  const setAudioPlaybackRate = (rate: number) => {
    setAudioPlaybackRateState(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        isSerif,
        setIsSerif,
        fontSize,
        setFontSize,
        focusMode,
        setFocusMode,
        activeTab,
        setActiveTab,
        selectedCurrentAffairId,
        setSelectedCurrentAffairId,
        savedStoryIds,
        toggleSave,
        isSaved,
        clearSaved,
        getVoteCount,
        hasVoted,
        toggleVote,
        activeStory,
        openStory,
        closeStory,
        isAudioSheetOpen,
        setIsAudioSheetOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        buzzStories,
        currentAffairs,
        hourlyWires,
        allStories,
        isLoading,
        searchQuery,
        setSearchQuery,
        refreshFeeds,
        t,
        currentAudioStory,
        isPlayingAudio,
        isAudioLoading,
        audioProgress,
        audioCurrentTime,
        audioTimeRemaining,
        audioDuration,
        audioPlaybackRate,
        audioHeartbeatScale,
        audioAnalyser,
        audioWords,
        currentWordIndex,
        setAudioPlaybackRate,
        playStoryAudio,
        pauseAudio,
        resumeAudio,
        toggleAudio,
        stopAudio,
        dismissAudioPlayer,
        playNextAudio,
        playPrevAudio,
        skipAudio,
        seekAudio,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
