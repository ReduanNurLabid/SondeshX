import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Headphones, 
  RotateCcw,
  RotateCw,
  ListOrdered,
  Loader2,
  Sparkles
} from 'lucide-react';
import { toBanglaDigits, getLocalizedCategory } from '../utils/bilingual';
import { HeartbeatVisualizer } from './HeartbeatVisualizer';

export const AudioPlayerSheet: React.FC = () => {
  const {
    isAudioSheetOpen,
    setIsAudioSheetOpen,
    currentAudioStory,
    isPlayingAudio,
    isAudioLoading,
    toggleAudio,
    playNextAudio,
    playPrevAudio,
    skipAudio,
    seekAudio,
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
    buzzStories,
    playStoryAudio,
    language,
    t,
  } = useApp();

  const progressRef = useRef<HTMLDivElement | null>(null);

  if (!isAudioSheetOpen || !currentAudioStory) return null;

  const isBn = language === 'bn';
  const buzz = currentAudioStory.daily_buzz;
  const title = isBn
    ? (buzz.title_bn || buzz.title_en)
    : (buzz.title_en || buzz.title_bn);

  const categoryLabel = getLocalizedCategory(currentAudioStory.primary_category, isBn);
  const speeds = [1, 1.25, 1.5, 2];

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    seekAudio(pct);
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const formatted = `${m}:${s.toString().padStart(2, '0')}`;
    return isBn ? toBanglaDigits(formatted) : formatted;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 backdrop-blur-2xl bg-black/85 animate-fadeIn"
      onClick={() => setIsAudioSheetOpen(false)}
    >
      {/* Modal Dialog (stops click from bubbling to backdrop) */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-obsidian-lowest rounded-t-card sm:rounded-card border border-white/[0.1] shadow-2xl overflow-hidden z-10 p-6 sm:p-8 animate-slideUp"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
          <div className="flex items-center space-x-2 text-mint text-xs font-bold uppercase tracking-wider">
            <Headphones className="w-4 h-4" />
            <span>{t('audio_briefing_title')}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAudioSheetOpen(false);
            }}
            className="p-2 rounded-full bg-white/[0.06] border border-white/[0.1] text-text-secondary hover:text-white hover:bg-white/[0.1] transition-all"
            title="Close Sheet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Waveform & Respiratory Heartbeat Visualizer Box */}
        <div 
          className="flex items-center justify-center space-x-1.5 h-24 mb-6 bg-white/[0.02] rounded-tile border border-white/[0.06] p-4 overflow-hidden relative transition-all duration-100"
          style={{
            transform: isPlayingAudio ? `scale(${1 + (audioHeartbeatScale - 1) * 0.045})` : 'scale(1)',
            borderColor: isPlayingAudio ? 'rgba(52, 211, 153, 0.45)' : 'rgba(255, 255, 255, 0.06)',
            boxShadow: isPlayingAudio ? '0 0 28px rgba(52, 211, 153, 0.22), inset 0 0 16px rgba(52, 211, 153, 0.08)' : 'none',
          }}
        >
          <HeartbeatVisualizer analyser={audioAnalyser} isPlaying={isPlayingAudio} scale={audioHeartbeatScale} />
        </div>

        {/* Current Story Metadata */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-mint/15 text-mint border border-mint/30 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{categoryLabel}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white line-clamp-2 leading-tight">
            {title}
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            {isBn ? 'সন্দেশ এক্সপ্রেস • অডিও খবর' : 'Sondesh Express • Audio news'}
          </p>
        </div>

        {/* Live Word Teleprompter (Synchronized with Neural Voice) */}
        {audioWords && audioWords.length > 0 && (
          <div className="mb-6 max-h-24 overflow-y-auto rounded-tile bg-white/[0.02] border border-white/[0.06] p-3 text-center scrollbar-none">
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs sm:text-sm leading-relaxed">
              {audioWords.map((w, idx) => {
                const isCurrent = idx === currentWordIndex;
                const isPast = currentWordIndex !== -1 && idx < currentWordIndex;
                return (
                  <span
                    key={idx}
                    className={`transition-all duration-150 px-1 py-0.5 rounded ${
                      isCurrent
                        ? 'bg-mint text-obsidian-bg font-extrabold shadow-[0_0_12px_rgba(52,211,153,0.8)] scale-105 inline-block'
                        : isPast
                        ? 'text-white/40'
                        : 'text-white/80'
                    }`}
                  >
                    {w.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Clickable & Draggable Scrubber Bar with Standard Audio Times */}
        <div className="mb-6">
          <div 
            ref={progressRef}
            onClick={handleScrub}
            className="h-2 w-full bg-white/10 rounded-full cursor-pointer relative group flex items-center mb-2"
            title="Click to seek"
          >
            <div
              className="h-full bg-gradient-to-r from-mint to-mint-bright shadow-[0_0_12px_rgba(52,211,153,0.8)] rounded-full transition-all duration-100"
              style={{ width: `${Number.isFinite(audioProgress) ? Math.max(0, Math.min(100, audioProgress)) : 0}%` }}
            />
            {/* Scrubber Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-mint shadow-[0_0_8px_rgba(52,211,153,0.9)] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${Number.isFinite(audioProgress) ? Math.max(0, Math.min(100, audioProgress)) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-text-secondary font-mono">
            <span>{formatSeconds(audioCurrentTime)}</span>
            <span>{formatSeconds(audioDuration)}</span>
          </div>
        </div>

        {/* Playback Controls with 10s Skip */}
        <div className="flex items-center justify-center space-x-3 sm:space-x-5 mb-8">
          {/* Skip -10s */}
          <button
            type="button"
            onClick={() => skipAudio(-10)}
            className="p-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-text-secondary hover:text-white transition-all active:scale-95"
            title="Rewind 10s"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Previous Story */}
          <button
            type="button"
            onClick={playPrevAudio}
            className="p-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] transition-all active:scale-95"
            title="Previous Story"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Big Play/Pause */}
          <button
            type="button"
            onClick={toggleAudio}
            className="p-5 rounded-full bg-mint text-obsidian-bg hover:bg-mint-bright shadow-[0_0_30px_rgba(52,211,153,0.5)] transition-all active:scale-95"
            title={isPlayingAudio ? 'Pause' : 'Play'}
          >
            {isAudioLoading ? (
              <Loader2 className="w-7 h-7 animate-spin text-obsidian-bg" />
            ) : isPlayingAudio ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          {/* Next Story */}
          <button
            type="button"
            onClick={playNextAudio}
            className="p-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] transition-all active:scale-95"
            title="Next Story"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Skip +10s */}
          <button
            type="button"
            onClick={() => skipAudio(10)}
            className="p-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-text-secondary hover:text-white transition-all active:scale-95"
            title="Forward 10s"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center justify-center space-x-2 pb-6 border-b border-white/[0.08] mb-6">
          <span className="text-xs text-text-secondary mr-2">{t('speed')}:</span>
          {speeds.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => setAudioPlaybackRate(rate)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                audioPlaybackRate === rate
                  ? 'bg-mint text-obsidian-bg border-mint shadow-sm'
                  : 'bg-white/[0.03] border-white/[0.08] text-text-secondary hover:text-white'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Chapter / Stories Queue List */}
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
            <ListOrdered className="w-4 h-4 text-mint" />
            <span>{isBn ? 'পরের খবর' : 'Up next'}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
            {buzzStories.slice(0, 6).map((story, idx) => {
              const isSelected = story.story_id === currentAudioStory.story_id;
              const storyTitle = isBn
                ? (story.daily_buzz.title_bn || story.daily_buzz.title_en)
                : (story.daily_buzz.title_en || story.daily_buzz.title_bn);

              return (
                <button
                  key={story.story_id}
                  type="button"
                  onClick={() => playStoryAudio(story)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-tile text-left text-xs transition-all border ${
                    isSelected
                      ? 'bg-mint/15 border-mint/30 text-white font-semibold'
                      : 'bg-white/[0.02] border-white/[0.05] text-text-secondary hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <span className="font-mono text-mint font-bold">
                      {isBn ? toBanglaDigits(idx + 1) : idx + 1}.
                    </span>
                    <span className="truncate">{storyTitle}</span>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-mint flex-shrink-0 animate-pulse ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
