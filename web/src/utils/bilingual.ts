import { Language } from '../types';

export function toBanglaDigits(input: any): string {
  if (input === null || input === undefined) return '';
  const english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const bangla = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let text = input.toString();
  for (let i = 0; i < english.length; i++) {
    text = text.replaceAll(english[i], bangla[i]);
  }
  return text;
}

export function stripDayLeakage(text: string): string {
  if (!text) return '';
  const p1 = /(?:গতকাল\s+)?(?:গত\s+)?(?:সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার)(?:\s+(?:সকালে|দুপুরে|বিকেলে|সন্ধ্যায়|রাতে))?\s*[,।]?\s*/g;
  const p2 = /(?<![ঀ-৿])(?:গতকাল|গত পরশু|আজকে|আজ)(?![ঀ-৿])\s*[,।]?\s*/g;
  const p3 = /\b(?:on\s+)?(?:last\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(?:morning|afternoon|evening|night))?\s*,\s*/gi;
  const p4 = /\b(?:yesterday|earlier today)\s*,\s*/gi;
  return text
    .replace(p1, '')
    .replace(p2, '')
    .replace(p3, '')
    .replace(p4, '')
    .replace(/^[,।\-\–\s]+/, '')
    .trim();
}

export function getLocalizedCategory(cat: string, isBangla: boolean): string {
  const clean = (cat || '').toLowerCase().replace(/ /g, '_');
  if (isBangla) {
    switch (clean) {
      case 'governance_law':
      case 'governance':
      case 'law':
      case 'politics':
        return 'শাসনব্যবস্থা ও রাজনীতি';
      case 'macroeconomy_banking':
      case 'economy_business':
      case 'economy':
      case 'macroeconomy':
      case 'trade_forex':
        return 'অর্থনীতি ও বাণিজ্য';
      case 'international_diplomacy':
      case 'world_diplomacy':
      case 'diplomacy':
      case 'geopolitics':
      case 'world':
        return 'আন্তর্জাতিক ও কূটনীতি';
      case 'tech_infrastructure':
      case 'tech_innovation':
      case 'technology':
      case 'ai':
        return 'প্রযুক্তি ও এআই';
      case 'climate_delta':
      case 'environment':
      case 'climate_environment':
      case 'climate':
        return 'পরিবেশ ও জলবায়ু';
      case 'society_education':
      case 'education':
      case 'society':
      case 'health':
        return 'সমাজ ও শিক্ষা';
      case 'sports_fitness':
      case 'sports':
        return 'খেলাধুলা';
      case 'pop_culture':
      case 'culture':
        return 'সংস্কৃতি ও বিনোদন';
      default:
        return 'চলতি ঘটনাবলী';
    }
  } else {
    switch (clean) {
      case 'governance_law':
      case 'governance':
      case 'law':
      case 'politics':
        return 'Governance & Politics';
      case 'macroeconomy_banking':
      case 'economy_business':
      case 'economy':
      case 'macroeconomy':
      case 'trade_forex':
        return 'Economy & Business';
      case 'international_diplomacy':
      case 'world_diplomacy':
      case 'diplomacy':
      case 'geopolitics':
      case 'world':
        return 'World & Geopolitics';
      case 'tech_infrastructure':
      case 'tech_innovation':
      case 'technology':
      case 'ai':
        return 'Technology & AI';
      case 'climate_delta':
      case 'environment':
      case 'climate_environment':
      case 'climate':
        return 'Climate & Environment';
      case 'society_education':
      case 'education':
      case 'society':
      case 'health':
        return 'Society & Education';
      case 'sports_fitness':
      case 'sports':
        return 'Sports';
      case 'pop_culture':
      case 'culture':
        return 'Culture & Entertainment';
      default:
        return 'Current Affairs';
    }
  }
}

export function formatRelativeTime(dateStr?: string, isBangla: boolean = false): string {
  if (!dateStr) return isBangla ? 'সম্প্রতি' : 'Recent';
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - dt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    const hour = dt.getHours();
    const minute = dt.getMinutes().toString().padStart(2, '0');
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

    const timeStr = isBangla
      ? `${toBanglaDigits(hour12)}:${toBanglaDigits(minute)} ${period}`
      : `${hour12}:${minute} ${period}`;

    if (diffMins < 2) {
      return isBangla ? `${timeStr} (এইমাত্র)` : `${timeStr} (Just now)`;
    } else if (diffMins < 60) {
      const m = isBangla ? toBanglaDigits(diffMins) : `${diffMins}m`;
      return isBangla ? `${timeStr} (${m} মিনিট আগে)` : `${timeStr} (${m} ago)`;
    } else if (diffHours < 24) {
      const h = isBangla ? toBanglaDigits(diffHours) : `${diffHours}h`;
      return isBangla ? `${timeStr} (${h} ঘণ্টা আগে)` : `${timeStr} (${h} ago)`;
    } else {
      if (isBangla) {
        const monthsBn = ['', 'জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
        const mStr = monthsBn[dt.getMonth() + 1] || toBanglaDigits(dt.getMonth() + 1);
        return `${mStr} ${toBanglaDigits(dt.getDate())} • ${timeStr}`;
      } else {
        const monthsEn = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mStr = monthsEn[dt.getMonth() + 1] || `${dt.getMonth() + 1}`;
        return `${mStr} ${dt.getDate()} • ${timeStr}`;
      }
    }
  } catch {
    return dateStr;
  }
}

export const translations = {
  en: {
    app_name: 'Sondesh Express',
    app_subtitle: 'Daily Current Affairs That Save Time',
    good_morning: 'Good Morning',
    good_afternoon: 'Good Afternoon',
    good_evening: 'Good Evening',
    welcome_back: 'Welcome Back',
    top_stories: 'Synthetic Brief',
    current_affairs: 'Current Affairs',
    discover: 'All News',
    saved: 'Saved',
    profile: 'Settings',
    settings: 'Settings',
    listen: 'Listen',
    playing: 'Playing',
    pause: 'Pause',
    resume: 'Resume',
    explore_all: 'Explore All News',
    view_all: 'View All',
    read_full: 'Read Full Analysis',
    breaking_wires: 'Latest News',
    why_in_the_news: 'Why in the News',
    the_core_story: 'The Core Story',
    why_it_matters: 'Why It Matters',
    key_questions: 'Strategic Inquiries & Analysis',
    challenges: 'Critical Challenges',
    way_forward: 'Strategic Way Forward',
    government_initiatives: 'Official Policy & Institutional Actions',
    strategic_outlook: 'Strategic Outlook',
    reading_preferences: 'Reading Preferences',
    reading_font: 'Reading Mode Font',
    serif: 'Serif',
    sans: 'Sans',
    language_preference: 'Language',
    english: 'English',
    bangla: 'বাংলা',
    auto_play_audio: 'Auto-Play Audio Briefing',
    focus_mode: 'Distraction-Free Focus Mode',
    notifications: 'Notifications & Alerts',
    daily_briefing: 'Daily Morning Briefing',
    breaking_alerts: 'Breaking News Alerts',
    storage: 'Offline Storage & Cache',
    clear_cache: 'Clear Cache',
    cache_cleared: 'Cache successfully cleared',
    empty_saved_title: 'No Saved Stories Yet',
    empty_saved_desc: 'Bookmark stories from your feed or dossiers to read them anytime offline.',
    search_placeholder: 'Search keywords, policy topics, countries...',
    filter_all: 'All Topics',
    sources: 'Sources',
    copy_link: 'Copy Link',
    copied: 'Copied to clipboard!',
    share: 'Share',
    original_report: 'Original Publisher Wire',
    exam_prompt: 'Analytical Exam Prompt & Model Outline',
    stat_points: 'Official Statistics & Empirical Data',
    constitutional_articles: 'Constitutional Provisions & Statutory Mandates',
    mark_as_read: 'Mark as read',
    reactions_insightful: 'Informative',
    reactions_high_yield: 'Important',
    minute_read: 'min read',
    seconds_read: 'sec read',
    live_badge: 'LIVE UPDATES',
    audio_briefing_title: 'Daily Current Affairs Audio Briefing',
    chapter: 'Chapter',
    speed: 'Speed',
    close: 'Close',
  },
  bn: {
    app_name: 'সন্দেশ এক্সপ্রেস',
    app_subtitle: 'সময় বাঁচানো প্রতিদিনের চলতি ঘটনাবলী',
    good_morning: 'শুভ সকাল',
    good_afternoon: 'শুভ দুপুর',
    good_evening: 'শুভ সন্ধ্যা',
    welcome_back: 'স্বাগতম',
    top_stories: 'সিন্থেটিক ব্রিফ',
    current_affairs: 'কারেন্ট অ্যাফেয়ার্স',
    discover: 'সকল সংবাদ',
    saved: 'সংরক্ষিত',
    profile: 'সেটিংস',
    settings: 'সেটিংস',
    listen: 'শুনুন',
    playing: 'চলছে',
    pause: 'বিরতি',
    resume: 'চালান',
    explore_all: 'সব খবর দেখুন',
    view_all: 'সব দেখুন',
    read_full: 'সম্পূর্ণ বিশ্লেষণ পড়ুন',
    breaking_wires: 'তাজা খবর',
    why_in_the_news: 'সংবাদের পটভূমি',
    the_core_story: 'মূল ঘটনা',
    why_it_matters: 'কেন এটি গুরুত্বপূর্ণ',
    key_questions: 'কৌশলগত বিশ্লেষণ ও অনুসন্ধান',
    challenges: 'প্রধান প্রতিবন্ধকতা ও চ্যালেঞ্জসমূহ',
    way_forward: 'ভবিষ্যৎ করণীয় ও সুপারিশ',
    government_initiatives: 'সরকারি ও প্রাতিষ্ঠানিক নীতি',
    strategic_outlook: 'কৌশলগত দৃষ্টিভঙ্গি',
    reading_preferences: 'পঠন পছন্দসমূহ',
    reading_font: 'পঠন ফন্ট মোড',
    serif: 'সেরিফ',
    sans: 'স্যান্স',
    language_preference: 'ভাষা',
    english: 'English',
    bangla: 'বাংলা',
    auto_play_audio: 'অডিও স্বয়ংক্রিয় প্লে',
    focus_mode: 'মনোযোগ আকর্ষণ মোড',
    notifications: 'বিজ্ঞপ্তি ও অ্যালার্ট',
    daily_briefing: 'দৈনিক সকালের ব্রিফিং',
    breaking_alerts: 'জরুরি খবর বিজ্ঞপ্তি',
    storage: 'অফলাইন স্টোরেজ ও ক্যাশ',
    clear_cache: 'ক্যাশ মুছুন',
    cache_cleared: 'ক্যাশ সফলভাবে মুছে ফেলা হয়েছে',
    empty_saved_title: 'কোনো সংরক্ষিত খবর নেই',
    empty_saved_desc: 'ফিড বা বিশ্লেষণ থেকে খবর সংরক্ষণ করে যেকোনো সময় অফলাইনে পড়ুন।',
    search_placeholder: 'কীওয়ার্ড, নীতি, বিষয় বা দেশ খুঁজুন...',
    filter_all: 'সকল বিষয়',
    sources: 'সূত্র',
    copy_link: 'লিংক কপি করুন',
    copied: 'ক্লিপবোর্ডে কপি হয়েছে!',
    share: 'শেয়ার করুন',
    original_report: 'মূল সংবাদ প্রতিবেদন',
    exam_prompt: 'লিখিত পরীক্ষার প্রশ্ন ও আদর্শ রূপরেখা',
    stat_points: 'প্রাতিষ্ঠানিক পরিসংখ্যান ও তথ্যচিত্র',
    constitutional_articles: 'সাংবিধানিক অনুচ্ছেদ ও আইনি রেফারেন্স',
    mark_as_read: 'পড়া হয়েছে',
    reactions_insightful: 'তথ্যসমৃদ্ধ',
    reactions_high_yield: 'গুরুত্বপূর্ণ',
    minute_read: 'মিনিট পাঠ',
    seconds_read: 'সেকেন্ড পাঠ',
    live_badge: 'তাজা আপডেট',
    audio_briefing_title: 'দৈনিক চলতি ঘটনাবলী অডিও ব্রিফিং',
    chapter: 'অধ্যায়',
    speed: 'গতি',
    close: 'বন্ধ করুন',
  }
};


export function getStoryPermalink(storyId: string, isCurrentAffairs: boolean = false): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('story', storyId);
  if (isCurrentAffairs) {
    url.searchParams.set('tab', 'current_affairs');
  }
  return url.toString();
}
