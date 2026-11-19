"""
Automatic Facebook Reel for the most important recent story.

1. Pick the highest-scored story from the last 12 hours that passed fact-check and
   has not been posted yet.
2. Record a Bangla voiceover (headline, each key point, outro) with Microsoft neural TTS.
3. Render the video with the site's reel engine in headless Chromium (/__reel),
   timed to the voiceover.
4. Mix voiceover + a quiet music bed and encode a Reels-ready MP4 with ffmpeg.
5. Post it to the Page with the full story as the caption, comment the story link,
   and record it in Firestore social_posts so it is never posted twice.

    python -m pipeline.social.post_reel --base-url http://localhost:4173 [--dry-run] [--story-id ID]

Environment: FB_PAGE_ID, FB_PAGE_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON.
Optional music: put a licensed track at pipeline/social/assets/reel_music.mp3;
otherwise a soft synthesized bed is used.
"""
import argparse
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import requests
from firebase_admin import firestore

from pipeline.config import INTEREST_CATEGORIES
from pipeline.storage.firebase_service import get_firestore_client
from pipeline.social.hashtags import build_hashtags

GRAPH = "https://graph.facebook.com/v23.0"
SITE_URL = "https://sondesh.web.app"
LOOKBACK_HOURS = 6
MIN_IMPORTANCE = 6.5          # Reels
MIN_APPEAL = 7.0              # Reels: only stories people stop for
MIN_PHOTO_IMPORTANCE = 7.0    # photo cards: important, text-led stories
VOICE = "bn-BD-NabanitaNeural"
GAP_SECONDS = 0.45
LEAD_IN = 0.4
DEFAULT_QUESTION = "এ বিষয়ে আপনার মতামত কী? কমেন্টে জানান।"
MUSIC_FILE =os.path.join(os.path.dirname(__file__), "assets", "reel_music.mp3")
BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই",
             "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]


def _parse_time(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def bn_date(dt: datetime) -> str:
    local = dt.astimezone(timezone(timedelta(hours=6)))
    return f"{str(local.day).translate(BN_DIGITS)} {BN_MONTHS[local.month - 1]} {str(local.year).translate(BN_DIGITS)}"


# ---------------------------------------------------------------- story choice
def reel_score(story: dict, learned: Optional[dict] = None) -> float:
    """How good a Reel this story would make: half editorial importance, half Facebook
    appeal (judged by the news desk), plus a bonus for a real publisher photo, which
    keeps people watching, plus what past Reels in the same section taught us (see
    learned_section_bonus). Stories from before the appeal score existed count importance twice."""
    importance = float(story.get("importance_score") or 0)
    appeal = float(story.get("social_appeal") or importance)
    bonus = (learned or {}).get(story.get("primary_category") or "", 0.0)
    useful = 0.5 if (story.get("daily_buzz") or {}).get("share_value") else 0.0   # shares widen reach
    return 0.5 * importance + 0.5 * appeal + (0.5 if reel_image(story) else 0.0) + bonus + useful


LEARN_DAYS = 21
LEARN_MIN_PLAYS = 50      # fewer plays means a broken or not-yet-shown Reel
LEARN_MAX_SECONDS = 40    # ignore the over-long Reels from before the voice-length check
LEARN_MIN_REELS = 2
LEARN_MAX_BONUS = 1.0


def learned_section_bonus(db) -> dict:
    """Per section, how much longer people watched its Reels than the average Reel,
    as a score bonus between -1 and +1. Average watch time is what decides whether
    Facebook shows a Reel beyond its first small test audience."""
    since = (datetime.now(timezone.utc) - timedelta(days=LEARN_DAYS)).isoformat()
    docs = (db.collection("social_posts")
            .where(filter=firestore.FieldFilter("posted_at", ">=", since)).stream())
    by_section: dict = {}
    for d in docs:
        p = d.to_dict()
        ins = p.get("insights") or {}
        if p.get("platform", "facebook_reel") != "facebook_reel" or not p.get("category"):
            continue
        if (ins.get("plays") or 0) < LEARN_MIN_PLAYS or not ins.get("avg_watch_ms"):
            continue
        if float(p.get("duration_s") or 0) > LEARN_MAX_SECONDS:
            continue
        by_section.setdefault(p["category"], []).append(ins["avg_watch_ms"] / 1000)
    every = [w for ws in by_section.values() for w in ws]
    if len(every) < 4:
        return {}
    overall = sum(every) / len(every)
    bonus = {}
    for section, ws in by_section.items():
        if len(ws) >= LEARN_MIN_REELS:
            rel = (sum(ws) / len(ws) - overall) / overall      # e.g. +0.4 = watched 40% longer
            bonus[section] = round(max(-LEARN_MAX_BONUS, min(LEARN_MAX_BONUS, 2 * rel)), 2)
    if bonus:
        print(f"Learned section bonus from {len(every)} Reels (average watch {overall:.1f}s): {bonus}")
    return bonus


def recent_posts(db, n: int = 3, platform: Optional[str] = None) -> List[dict]:
    docs = (db.collection("social_posts")
            .order_by("posted_at", direction=firestore.Query.DESCENDING).limit(n if not platform else 20).stream())
    posts = [d.to_dict() for d in docs]
    if platform:
        posts = [p for p in posts if p.get("platform", "facebook_reel") == platform]
    return posts[:n]


def photo_score(story: dict) -> float:
    """Photo cards suit important, text-led stories; a real photo still helps."""
    return float(story.get("importance_score") or 0) + (0.5 if reel_image(story) else 0.0)


FOCUS_COOLDOWN_HOURS = 6


def focus_tags(tags: List[str]) -> set:
    """The tags that say what a post is about (places, people, topics), without the
    brand, section and audience tags every post shares."""
    from pipeline.social.hashtags import BRAND, SECTION_TAGS
    shared = {BRAND.lower(), "#বাংলাদেশ", "#বিশ্ব", *(t.lower() for t in SECTION_TAGS.values())}
    return {t.lower() for t in tags if t.lower() not in shared}


def pick_story(db, story_id: Optional[str] = None, fmt: str = "reel") -> Optional[dict]:
    if story_id:
        snap = db.collection("daily_buzz").document(story_id).get()
        if not snap.exists:
            return None
        s = snap.to_dict()
        s["story_id"] = s.get("story_id") or story_id
        return s

    posted = set()
    for d in db.collection("social_posts").select(["story_id"]).stream():
        posted.add(d.id)
        posted.add((d.to_dict() or {}).get("story_id"))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    docs = (
        db.collection("daily_buzz")
        .order_by("published_at", direction=firestore.Query.DESCENDING)
        .limit(120)
        .stream()
    )
    candidates = []
    for doc in docs:
        s = doc.to_dict()
        sid = s.get("story_id") or doc.id
        when = _parse_time(s.get("published_at"))
        buzz = s.get("daily_buzz") or {}
        if sid in posted or not when or when < cutoff:
            continue
        if (s.get("fact_check") or {}).get("status") != "passed":
            continue
        if not buzz.get("title_bn") or len(buzz.get("bullets_bn") or []) < 2:
            continue
        if float(s.get("importance_score") or 0) < (MIN_IMPORTANCE if fmt == "reel" else MIN_PHOTO_IMPORTANCE):
            continue
        if fmt == "reel" and s.get("social_appeal") is not None and float(s["social_appeal"]) < MIN_APPEAL:
            continue
        s["story_id"] = sid
        candidates.append(s)
    if not candidates:
        return None

    # Variety: not the same section as the last Reel, and at most one foreign story
    # in any three Reels in a row. Relaxed if nothing else is available.
    recent = recent_posts(db)
    last_category = recent[0].get("category") if recent else None
    foreign_recently = any(p.get("region") == "international" for p in recent[:2])

    def allowed(s: dict) -> bool:
        if last_category and s.get("primary_category") == last_category:
            return False
        if foreign_recently and s.get("region") == "international":
            return False
        return True

    # Cooldown: a place or person/topic featured in a post in the last few hours is not
    # featured again, so the Page never runs two posts about the same thing back to back.
    # This rule is strict: if every candidate overlaps, the slot is skipped.
    window = (datetime.now(timezone.utc) - timedelta(hours=FOCUS_COOLDOWN_HOURS)).isoformat()
    recent_focus = set()
    for p in recent_posts(db, 12):
        if (p.get("posted_at") or "") >= window:
            tags = p.get("hashtags") or build_hashtags({"daily_buzz": {"title_bn": p.get("headline", "")}})
            recent_focus |= focus_tags(tags)
    fresh = [s for s in candidates if not (focus_tags(build_hashtags(s)) & recent_focus)]
    if not fresh:
        print(f"Every candidate repeats a place or topic posted in the last {FOCUS_COOLDOWN_HOURS} hours: {sorted(recent_focus)}")
        return None

    pool = [s for s in fresh if allowed(s)] or fresh
    if fmt == "reel":
        learned = learned_section_bonus(db)
        pool.sort(key=lambda s: reel_score(s, learned), reverse=True)
    else:
        pool.sort(key=photo_score, reverse=True)
    return pool[0]


def source_names(story: dict) -> List[str]:
    names = []
    for src in story.get("sources") or []:
        name = (src or {}).get("name")
        if name and name not in names:
            names.append(name)
    return names


def reel_image(story: dict) -> Optional[str]:
    """The publisher's own photo only. Stock photos can show unrelated people next to
    named individuals, which misleads; without a publisher photo the reel uses the
    branded background."""
    url = story.get("image_url") or ""
    if not url or "unsplash.com" in url:
        return None
    if "media.prothomalo.com" in url:
        # Their share images carry a branded banner added through URL parameters
        # (overlay=...); the plain photo is the same address without them.
        url = url.split("?")[0] + "?w=1200&auto=format%2Ccompress"
    return url


# ---------------------------------------------------------------- voiceover
# Gemini neural voice, one request per Reel (the free tier allows 10 voice requests a
# day per key). When every key is out of quota the Reel is made with music only.
TTS_MODEL = "gemini-2.5-flash-preview-tts"
TTS_VOICE = os.getenv("REEL_TTS_VOICE", "Kore")   # "Kore" (female) or "Charon" (male)
TTS_RATE = 24000


def media_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def reel_headline(story: dict) -> str:
    """What the Reel opens with: the fact-checked spoken hook, or the headline."""
    buzz = story["daily_buzz"]
    return buzz.get("hook_bn") or buzz["title_bn"]


def reel_points(story: dict) -> list:
    """All three key points, each its own beat (new camera move, whoosh, voice), read at
    a brisk pace so the Reel stays around 20-25 s."""
    return (story["daily_buzz"].get("bullets_bn") or [])[:3]


def _script_parts(story: dict) -> list:
    """The spoken parts. The end card is not voiced: it is a short music-only card."""
    parts = [("headline", None, reel_headline(story))]
    parts += [("point", i, p) for i, p in enumerate(reel_points(story))]
    return parts


def _gemini_speech(texts: list, out_wav: str) -> bool:
    """Reads all parts in one request, with a clear pause between parts. Tries each
    configured key; returns False when none can produce audio."""
    import wave
    from google import genai
    from google.genai import types
    from pipeline.processing.llm import gemini_api_keys

    script = "\n\n".join(texts)
    # Brisk, confident delivery (about 170 words a minute): short news videos lose
    # viewers in a slow read. The first line is the hook, so it is read with energy.
    prompt = ("Read this Bangla news script aloud as a confident, clear Bangladeshi TV news anchor, "
              "at a brisk news pace, about 170 words a minute, with energy on the first line. "
              "After each paragraph, stop and stay silent for two full seconds before the next one. "
              "Read only the script.\n\n" + script)
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=TTS_VOICE))),
    )
    # Bangla newsreader pace is about 13 characters a second; a reading far shorter than
    # that means the model stopped early, so try again (on the next key) or give up.
    expected = sum(len(t) for t in texts) / 13.0
    for key in gemini_api_keys():
        try:
            client = genai.Client(api_key=key)  # keep a reference: a discarded client closes its connection
            resp = client.models.generate_content(model=TTS_MODEL, contents=prompt, config=config)
            pcm = resp.candidates[0].content.parts[0].inline_data.data
            if not pcm:
                continue
            seconds = len(pcm) / (2 * TTS_RATE)
            pauses = 2.0 * (len(texts) - 1)
            if seconds < 0.6 * expected:
                print(f"Gemini voice stopped early ({seconds:.1f}s of about {expected:.0f}s); retrying")
                continue
            if seconds > 1.6 * expected + pauses + 2:
                print(f"Gemini voice ran far too long ({seconds:.1f}s for about {expected:.0f}s of script); rejected")
                continue
            with wave.open(out_wav, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(TTS_RATE)
                w.writeframes(pcm)
            print(f"Gemini voice: {seconds:.1f}s (expected about {expected:.0f}s)")
            return True
        except Exception as err:
            print(f"Gemini voice unavailable on one key: {str(err)[:120]}")
    return False


def _silences(path: str) -> list:
    """(start, end) of pauses in the speech, via ffmpeg silencedetect."""
    log = subprocess.run(
        ["ffmpeg", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.6", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x.split("silence_start: ")[1].split()[0]) for x in log.splitlines() if "silence_start: " in x]
    ends = [float(x.split("silence_end: ")[1].split()[0]) for x in log.splitlines() if "silence_end: " in x]
    return list(zip(starts, ends))


def _boundaries(texts: list, speech_len: float, pauses: list) -> list:
    """Times where each part after the first begins. Uses the longest pauses, but only
    if the resulting parts are in proportion to their text (a mid-sentence pause would
    otherwise switch the on-screen card at the wrong moment); else splits by length."""
    need = len(texts) - 1
    total_chars = sum(len(t) for t in texts)

    def by_length():
        cuts, acc = [], 0
        for t in texts[:-1]:
            acc += len(t)
            cuts.append(round(speech_len * acc / total_chars, 3))
        return cuts

    inner = [p for p in pauses if 0.3 < p[0] < speech_len - 0.3]
    if len(inner) < need:
        print("Voice timing: not enough clear pauses; splitting by text length")
        return by_length()
    chosen = sorted(sorted(inner, key=lambda p: p[1] - p[0], reverse=True)[:need])
    cuts = [round((p0 + p1) / 2, 3) for p0, p1 in chosen]
    edges = [0.0] + cuts + [speech_len]
    for i, t in enumerate(texts):
        share_time = (edges[i + 1] - edges[i]) / speech_len
        share_text = len(t) / total_chars
        if not 0.4 <= share_time / max(share_text, 1e-6) <= 2.5:
            print("Voice timing: pauses do not match the parts; splitting by text length")
            return by_length()
    return cuts


# Reel sound design (short-form news practice):
#   - one music bed under the whole Reel, turned down automatically while the voice speaks
#   - a whoosh on every cut (the moment the picture moves on), a page turn under the key point
#   - the voice starts at 0.25 s; a short breath before the key point
#   - the finished mix levelled to -14 LUFS with peaks under -1 dBTP: the usual Reels target,
#     and platforms turn loud uploads down but do not turn quiet ones up
ASSETS = os.path.join(os.path.dirname(__file__), "assets")
MUSIC_DIR = os.path.join(ASSETS, "music")
# Music by news mood. Each track: (file, caption credit or None, start second).
# Pixabay tracks need no credit; Chosic tracks (CC BY / CC BY-SA) must be credited in
# the caption, which build_caption does. All tracks are levelled to -16 LUFS.
CC_BY = "CC BY 4.0"
CC_BY_SA = "CC BY-SA 3.0"
MUSIC_MOODS = {
    # urgent: clashes, attacks, fires, arrests, protests, disasters as they happen
    "breaking": [("breaking_1.mp3", None, 0.0), ("breaking_2.mp3", None, 0.0), ("breaking_3.mp3", None, 0.0),
                 ("breaking_4.mp3", None, 0.0), ("breaking_5.mp3", None, 0.0)],
    # measured news bed: politics, government, courts, world news, and every tragedy
    "serious": [("serious_1.mp3", None, 0.0), ("../reel_music.mp3", None, 4.0),
                ("../reel_music_2.mp3", "Music: Audionautix.com (CC BY 4.0)", 0.0)],
    "business": [("business_1.mp3", f"Music: Main Street by AudioCoffee, audiocoffee.net ({CC_BY_SA})", 0.0)],
    "climate": [("climate_1.mp3", f"Music: Weather Report by MaxKoMusic, maxkomusic.com ({CC_BY_SA})", 0.0)],
    "uplifting": [("uplifting_1.mp3", f"Music: Spark Of Inspiration by Shane Ivers, silvermansound.com ({CC_BY})", 0.0),
                  ("uplifting_2.mp3", f"Music: Fresh Lift by Shane Ivers, silvermansound.com ({CC_BY})", 0.0)],
    "sports": [("sports_1.mp3", f"Music: The Success by Keys of Moon, soundcloud.com/keysofmoon ({CC_BY})", 0.0)],
}
SECTION_MOOD = {
    "governance_law": "serious", "world_diplomacy": "serious", "economy_business": "business",
    "tech_innovation": "uplifting", "climate_environment": "climate", "society_education": "uplifting",
    "sports_fitness": "sports",
}
# Deaths and suffering never get upbeat music; clashes and disasters get the urgent bed.
TRAGEDY_WORDS = ("নিহত", "মৃত্যু", "মারা", "হত্যা", "লাশ", "ধর্ষণ", "শিশুর মৃত্যু", "প্রাণহানি", "আত্মহত্যা")
URGENT_WORDS = ("হামলা", "সংঘর্ষ", "বিস্ফোরণ", "ককটেল", "আগুন", "অগ্নি", "গুলি", "গ্রেপ্তার", "বিক্ষোভ",
                "অবরোধ", "হরতাল", "মারধর", "ঘূর্ণিঝড়", "ভূমিকম্প", "বন্যা", "আহত", "ভাঙচুর", "যুদ্ধ")


def music_mood(story: dict) -> str:
    if story.get("_music_mood") in MUSIC_MOODS:      # chosen in the Studio
        return story["_music_mood"]
    buzz = story.get("daily_buzz") or {}
    text = " ".join([buzz.get("title_bn") or "", buzz.get("hook_bn") or "", *(buzz.get("bullets_bn") or [])[:1]])
    if any(w in text for w in TRAGEDY_WORDS):
        return "serious"
    if any(w in text for w in URGENT_WORDS):
        return "breaking"
    return SECTION_MOOD.get(story.get("primary_category") or "", "serious")


PAGE_SFX = os.path.join(ASSETS, "sfx_page.mp3")
VOICE_START = 0.25
BEAT_GAP = 0.45          # whoosh and a breath before each new part
OUTRO_LEN = 1.5          # short end card, so the Reel loops instead of dragging


def _ff(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def music_track(story: dict):
    """(file, caption credit, start second) matching the story's mood; the same story always
    gets the same track, and different stories rotate through the mood's tracks."""
    sid = str(story.get("story_id") or story.get("daily_buzz", {}).get("title_bn", ""))
    for mood in (music_mood(story), "serious"):
        tracks = [(os.path.normpath(os.path.join(MUSIC_DIR, f)), c, st) for f, c, st in MUSIC_MOODS[mood]]
        tracks = [t for t in tracks if os.path.exists(t[0])]
        if tracks:
            return tracks[sum(map(ord, sid)) % len(tracks)]
    return (MUSIC_FILE, None, 4.0)


def _music_bed(path: str, track: str, length: float, volume: float, start: float = 0.0):
    _ff("-ss", f"{start}", "-stream_loop", "-1", "-i", track, "-t", f"{length}", "-af",
        f"volume={volume},afade=t=in:d=0.3,afade=t=out:st={max(0.0, length - 1.0)}:d=1.0,"
        "aresample=48000,aformat=channel_layouts=stereo", path)


def _whoosh(path: str):
    """A soft air whoosh made from filtered noise (no licence needed)."""
    _ff("-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.6", "-af",
        "bandpass=f=1400:width_type=o:w=2.5,afade=t=in:d=0.28,afade=t=out:st=0.3:d=0.2,"
        "volume=0.55,aresample=48000,aformat=channel_layouts=stereo", path)


def _page_turn(path: str) -> bool:
    if not os.path.exists(PAGE_SFX):
        return False
    # The recording is quiet and opens with near-silence; the clearest flip is at 3.0 s.
    _ff("-ss", "3.0", "-t", "0.8", "-i", PAGE_SFX, "-af",
        "volume=2.5,afade=t=out:st=0.5:d=0.3,aresample=48000,aformat=channel_layouts=stereo", path)
    return True


def _voice_piece(path: str, src: str, start: float, end: float):
    trim = ("silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.08,areverse,"
            "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.15,areverse")
    _ff("-ss", f"{start}", "-to", f"{end}", "-i", src, "-af",
        f"{trim},volume=1.5,aresample=48000,aformat=channel_layouts=stereo", path)


def _mix(voices: list, sfx: list, bed: str, total: float, out: str):
    """Voice clips and sound effects at their (path, start) times over the music bed.
    The bed ducks under the voice (sidechain), then the mix is levelled to -14 LUFS."""
    inputs, chains, n = ["-i", bed], [], 1
    v_labels, s_labels = [], []
    for path, at in voices:
        inputs += ["-i", path]
        chains.append(f"[{n}:a]adelay={int(at * 1000)}:all=1[v{n}]")
        v_labels.append(f"[v{n}]")
        n += 1
    for path, at in sfx:
        inputs += ["-i", path]
        chains.append(f"[{n}:a]adelay={int(at * 1000)}:all=1[s{n}]")
        s_labels.append(f"[s{n}]")
        n += 1
    parts = []
    if v_labels:
        chains.append("".join(v_labels) + f"amix=inputs={len(v_labels)}:normalize=0:duration=longest,apad,atrim=0:{total},asplit=2[voice][key]")
        chains.append("[0:a][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400:makeup=1[bed]")
        parts += ["[voice]", "[bed]"]
    else:
        chains.append("[0:a]anull[bed]")
        parts.append("[bed]")
    parts += s_labels
    chains.append("".join(parts) + f"amix=inputs={len(parts)}:normalize=0:duration=first,atrim=0:{total},"
                  "loudnorm=I=-14:TP=-1:LRA=11,aresample=48000[m]")
    _ff(*inputs, "-filter_complex", ";".join(chains), "-map", "[m]", "-ac", "2", "-ar", "48000", out)


def build_voiceover(story: dict, workdir: str, use_voice: bool = True):
    """Builds the whole soundtrack. Returns (audio_wav, segments, total_duration)."""
    parts = _script_parts(story)              # hook, key point
    texts = [t for _, _, t in parts]
    raw = os.path.join(workdir, "voice_raw.wav")
    voiced = use_voice and _gemini_speech(texts, raw)
    if voiced:
        speech_len = media_duration(raw)
        cuts = _boundaries(texts, speech_len, _silences(raw))
        edges = [0.0] + cuts + [speech_len]
        print(f"Voice: Gemini {TTS_VOICE}")
    else:
        print("Voice: none (Gemini voice quota used up); on-screen text with music only")

    whoosh = os.path.join(workdir, "whoosh.wav")
    _whoosh(whoosh)
    page = os.path.join(workdir, "page.wav")
    has_page = _page_turn(page)

    voices, sfx, segments = [], [], []
    clock = 0.0
    for n, (kind, index, text) in enumerate(parts):
        seg_start = clock
        if n >= 1:
            sfx.append((whoosh, max(0.0, clock - 0.15)))
            if kind == "point" and index == 0 and has_page:
                sfx.append((page, clock + 0.05))
            clock += BEAT_GAP
        else:
            clock += VOICE_START
        if voiced:
            piece = os.path.join(workdir, f"voice{n}.wav")
            _voice_piece(piece, raw, edges[n], edges[n + 1])
            voices.append((piece, clock))
            clock += media_duration(piece)
        else:
            clock += max(3.5, min(7.0, len(text) / 14))
        seg = {"kind": kind, "start": round(seg_start, 3), "end": round(clock, 3)}
        if index is not None:
            seg["index"] = index
        segments.append(seg)

    sfx.append((whoosh, max(0.0, clock - 0.15)))
    segments.append({"kind": "outro", "start": round(clock, 3), "end": round(clock + OUTRO_LEN, 3)})
    total = round(clock + OUTRO_LEN, 3)

    track, _credit, start = music_track(story)
    bed = os.path.join(workdir, "bed.wav")
    _music_bed(bed, track, total, 0.35 if voiced else 0.7, start)
    audio = os.path.join(workdir, "soundtrack.wav")
    _mix(voices, sfx, bed, total, audio)
    return audio, segments, total


# ---------------------------------------------------------------- video
def render_video(story: dict, segments: list, duration: float, base_url: str, workdir: str,
                 image_urls: Optional[list] = None, source_line: Optional[str] = None) -> str:
    """image_urls: editor photos (a different one behind each beat) instead of the publisher photo."""
    from playwright.sync_api import sync_playwright

    buzz = story["daily_buzz"]
    names = source_names(story)
    request = {
        "headline": reel_headline(story),
        "points": reel_points(story),
        "sourceLine": source_line or (f"সূত্র: {', '.join(names[:3])}" if names else ""),
        "category": INTEREST_CATEGORIES.get(story.get("primary_category") or "", {}).get("bn", "খবর"),
        "dateLine": bn_date(_parse_time(story.get("published_at")) or datetime.now(timezone.utc)),
        "kicker": (story.get("daily_buzz") or {}).get("kicker_bn") or "",
        "imageUrl": None if image_urls else reel_image(story),
        "imageUrls": image_urls or [],
        "segments": segments,
        "duration": duration,
    }
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1920})
        page.goto(f"{base_url}/__reel", wait_until="networkidle")
        page.wait_for_function("window.reelHostReady === true", timeout=30000)
        result = page.evaluate("req => window.renderReel(req)", request)
        browser.close()

    ext = "mp4" if "mp4" in result["mimeType"] else "webm"
    path = os.path.join(workdir, f"video.{ext}")
    with open(path, "wb") as f:
        f.write(base64.b64decode(result["base64"]))
    return path


def mux(video: str, audio: str, duration: float, out_path: str):
    """Pairs the rendered video with the finished soundtrack; H.264/AAC 1080x1920 30 fps."""
    _ff("-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-t", f"{duration}",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out_path)


# ---------------------------------------------------------------- facebook
def build_caption(story: dict) -> str:
    """The story itself, as readers would see it on the site. The link goes in a comment."""
    buzz = story["daily_buzz"]
    # The question goes right under the headline: Facebook shows only the first lines
    # of a Reel caption, and comments are what widen a Reel's reach.
    parts = [buzz["title_bn"], f"💬 {buzz.get('question_bn') or DEFAULT_QUESTION}"]
    lead = buzz.get("lead_bn") or buzz.get("summary_bn")
    if lead:
        parts.append(lead)
    bullets = (buzz.get("bullets_bn") or [])[:3]
    if bullets:
        parts.append("\n".join(f"▪️ {b}" for b in bullets))
    if buzz.get("details_bn"):
        parts.append(buzz["details_bn"])
    names = source_names(story)
    if names:
        parts.append(f"সূত্র: {', '.join(names[:3])}")
    parts.append("পুরো খবরের লিংক কমেন্টে 👇")
    credit = music_track(story)[1]
    if credit:
        parts.append(credit)
    parts.append(" ".join(build_hashtags(story)))
    return "\n\n".join(parts)


def story_link(story: dict, tagged: bool = False, medium: str = "reel") -> str:
    url = f"{SITE_URL}/story/{story['story_id']}/"
    # Tagged so Google Analytics can count visits that came from each post format.
    return url + f"?utm_source=facebook&utm_medium={medium}&utm_campaign=auto_{medium}" if tagged else url


def upload_reel(video_path: str, caption: str) -> str:
    page_id = os.environ["FB_PAGE_ID"]
    token = os.environ["FB_PAGE_TOKEN"]
    start = requests.post(f"{GRAPH}/{page_id}/video_reels",
                          data={"upload_phase": "start", "access_token": token}, timeout=60)
    start.raise_for_status()
    video_id, upload_url = start.json()["video_id"], start.json()["upload_url"]

    with open(video_path, "rb") as f:
        requests.post(upload_url, data=f, timeout=300, headers={
            "Authorization": f"OAuth {token}", "offset": "0",
            "file_size": str(os.path.getsize(video_path)),
        }).raise_for_status()

    requests.post(f"{GRAPH}/{page_id}/video_reels", timeout=60, data={
        "upload_phase": "finish", "video_id": video_id, "video_state": "PUBLISHED",
        "description": caption, "access_token": token,
    }).raise_for_status()
    return video_id


def comment_link(video_id: str, story: dict, medium: str = "reel") -> Optional[str]:
    """First comment with the story link. Needs pages_manage_engagement. The video may
    still be processing right after upload, so this retries for about two minutes."""
    token = os.environ["FB_PAGE_TOKEN"]
    message = f"📰 পুরো খবর পড়ুন সন্দেশ এক্সপ্রেসে:\n{story_link(story, tagged=True, medium=medium)}"
    last = ""
    for _ in range(8):
        r = requests.post(f"{GRAPH}/{video_id}/comments",
                          data={"message": message, "access_token": token}, timeout=30)
        if r.ok:
            return r.json().get("id")
        last = _graph_error_text(r)
        time.sleep(15)
    print(f"Could not add the link comment: {last}")
    return None


def _graph_error_text(resp: requests.Response) -> str:
    try:
        return str(resp.json().get("error", {}))[:400]
    except Exception:
        return resp.text[:400]


# ---------------------------------------------------------------- main
def _card_request(story: dict) -> dict:
    buzz = story["daily_buzz"]
    names = source_names(story)
    return {
        "headline": buzz["title_bn"],
        "points": (buzz.get("bullets_bn") or [])[:3],
        "sourceLine": f"সূত্র: {', '.join(names[:3])}" if names else "",
        "category": INTEREST_CATEGORIES.get(story.get("primary_category") or "", {}).get("bn", "খবর"),
        "dateLine": bn_date(_parse_time(story.get("published_at")) or datetime.now(timezone.utc)),
        "kicker": (story.get("daily_buzz") or {}).get("kicker_bn") or "",
        "imageUrl": reel_image(story),
        # Stories with a real photo get the big-photo layout; others the key-points layout.
        "layout": "headline" if reel_image(story) and len(buzz.get("bullets_bn") or []) < 3 else "story",
        "segments": [], "duration": 0,
    }


def render_photo(story: dict, base_url: str, out_path: str):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"{base_url}/__reel", wait_until="networkidle")
        page.wait_for_function("window.reelHostReady === true", timeout=30000)
        b64 = page.evaluate("req => window.renderPhotoCard(req)", _card_request(story))
        browser.close()
    with open(out_path, "wb") as fh:
        fh.write(base64.b64decode(b64))


def upload_photo(png_path: str, caption: str) -> dict:
    page_id = os.environ["FB_PAGE_ID"]
    token = os.environ["FB_PAGE_TOKEN"]
    with open(png_path, "rb") as fh:
        r = requests.post(f"{GRAPH}/{page_id}/photos", timeout=120,
                          data={"message": caption, "published": "true", "access_token": token},
                          files={"source": ("card.png", fh, "image/png")})
    r.raise_for_status()
    return r.json()   # {"id": photo_id, "post_id": page-post id}


def main():
    if sys.stdout:
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:4173")
    parser.add_argument("--story-id")
    parser.add_argument("--dry-run", action="store_true", help="render the video but do not post it")
    parser.add_argument("--out", default="reel.mp4", help="where to keep the rendered video")
    parser.add_argument("--min-gap-minutes", type=int, default=0,
                        help="skip if the last post of this format went out less than this many minutes ago")
    parser.add_argument("--no-voice", action="store_true",
                        help="music-only Reel: on-screen text, no voiceover (saves the Gemini voice limit)")
    parser.add_argument("--format", choices=["reel", "photo"], default="reel",
                        help="reel: voiced video; photo: 4:5 photo card")
    parser.add_argument("--telegram-clip", help="render a Reel from this Telegram clip and send the preview")
    parser.add_argument("--telegram-post", help="post this approved Telegram clip's Reel now")
    parser.add_argument("--retry-instagram", help="send this posted Telegram clip (or 'latest') to Instagram")
    parser.add_argument("--check-instagram", action="store_true",
                        help="only check that the token can publish to Instagram; posts nothing")
    args = parser.parse_args()
    platform = "facebook_reel" if args.format == "reel" else "facebook_photo"

    if args.check_instagram:
        sys.exit(0 if check_instagram() else 1)

    db = get_firestore_client()
    if args.telegram_clip:
        return telegram_preview(db, args.telegram_clip, args.base_url, args.out)
    if args.telegram_post:
        return telegram_post(db, args.telegram_post)
    if args.retry_instagram:
        return retry_instagram(db, args.retry_instagram)
    if args.min_gap_minutes and not args.story_id:
        last = recent_posts(db, 1, platform)
        last_at = _parse_time(last[0].get("posted_at")) if last else None
        if last_at and datetime.now(timezone.utc) - last_at < timedelta(minutes=args.min_gap_minutes):
            print(f"Last {args.format} posted at {last_at.isoformat()}; skipping this slot (minimum gap {args.min_gap_minutes} min).")
            return
    if args.min_gap_minutes and not args.story_id and not args.dry_run and args.format == "reel":
        from pipeline.social.telegram_clips import next_slot_clip
        clip = next_slot_clip(db)
        if clip:
            print(f"Posting the editor's approved video clip {clip['clip_id']} in this slot.")
            return telegram_post(db, clip["clip_id"])
    story = pick_story(db, args.story_id, args.format)
    if not story:
        print(f"No eligible story this slot (fact-checked, importance >= {MIN_IMPORTANCE}, appeal >= {MIN_APPEAL}, last {LOOKBACK_HOURS} hours, not yet posted).")
        return
    print(f"Story: {story['daily_buzz']['title_bn']} (importance {story.get('importance_score')}, appeal {story.get('social_appeal')}, reel score {reel_score(story):.2f})")

    if args.format == "photo":
        out = os.path.splitext(args.out)[0] + ".png"
        render_photo(story, args.base_url, out)
        caption = build_caption(story)
        print(f"Rendered photo card {out} ({os.path.getsize(out) // 1024} KB)")
        if args.dry_run:
            print("Dry run: not posted.\n--- caption ---\n" + caption)
            return
        try:
            res = upload_photo(out, caption)
        except requests.HTTPError as err:
            print(f"Facebook photo upload failed: {_graph_error_text(err.response)}")
            sys.exit(1)
        post_id = res.get("post_id") or res.get("id")
        print(f"Posted photo card: post_id {post_id}")
        comment_id = comment_link(post_id, story, medium="photo_card")
        db.collection("social_posts").document(story["story_id"]).set({
            "story_id": story["story_id"],
            "platform": "facebook_photo",
            "post_id": post_id,
            "photo_id": res.get("id"),
            "comment_id": comment_id,
            "posted_at": datetime.now(timezone.utc).isoformat(),
            "headline": story["daily_buzz"]["title_bn"],
            "category": story.get("primary_category"),
            "region": story.get("region"),
            "importance_score": story.get("importance_score"),
            "social_appeal": story.get("social_appeal"),
            "hashtags": build_hashtags(story),
            "story_published_at": story.get("published_at"),
        })
        return

    with tempfile.TemporaryDirectory() as workdir:
        voice, segments, duration = build_voiceover(story, workdir, use_voice=not args.no_voice)
        print(f"Soundtrack: {duration:.1f}s, {len(segments)} segments")
        video = render_video(story, segments, duration, args.base_url, workdir)
        mux(video, voice, duration, args.out)
    print(f"Rendered {args.out} ({os.path.getsize(args.out) // 1024} KB)")

    caption = build_caption(story)
    if args.dry_run:
        print("Dry run: not posted.\n--- caption ---\n" + caption + f"\n--- comment ---\n{story_link(story)}"
              + "\n--- instagram caption ---\n" + instagram_caption(story))
        return

    try:
        video_id = upload_reel(args.out, caption)
    except requests.HTTPError as err:
        print(f"Facebook upload failed: {_graph_error_text(err.response)}")
        from pipeline.social.telegram_clips import notify_editor
        notify_editor(f"⚠️ রিল পোস্ট হয়নি: {story['daily_buzz']['title_bn']}\n{_graph_error_text(err.response)[:300]}")
        sys.exit(1)
    print(f"Posted Reel: video_id {video_id}")
    comment_id = comment_link(video_id, story)

    db.collection("social_posts").document(story["story_id"]).set({
        "story_id": story["story_id"],
        "platform": "facebook_reel",
        "video_id": video_id,
        "comment_id": comment_id,
        "posted_at": datetime.now(timezone.utc).isoformat(),
        "headline": story["daily_buzz"]["title_bn"],
        "category": story.get("primary_category"),
        "region": story.get("region"),
        "importance_score": story.get("importance_score"),
        "social_appeal": story.get("social_appeal"),
        "reel_score": round(reel_score(story), 2),
        "duration_s": duration,
        "voiced": not args.no_voice,
        "hashtags": build_hashtags(story),
        "story_published_at": story.get("published_at"),
    })
    if comment_id:
        print(f"Link comment added: {comment_id}")

    # The same Reel on Instagram. Never fails the job: Facebook is already posted.
    if os.getenv("IG_POSTING", "on").lower() != "off":
        ig = {}
        try:
            ig["instagram_media_id"] = post_instagram_reel(video_id, instagram_caption(story), args.out)
            ig["instagram_posted_at"] = datetime.now(timezone.utc).isoformat()
            print(f"Posted on Instagram: media_id {ig['instagram_media_id']}")
        except Exception as err:  # noqa: BLE001 - reported, then ignored
            ig["instagram_error"] = str(err)[:400]
            print(f"Instagram posting failed: {ig['instagram_error']}")
        db.collection("social_posts").document(story["story_id"]).set(ig, merge=True)
    else:
        ig = {"instagram_error": "off"}
    from pipeline.social.telegram_clips import notify_editor
    ig_note = "ইনস্টাগ্রামেও পোস্ট হয়েছে।" if ig.get("instagram_media_id") else f"ইনস্টাগ্রামে যায়নি: {ig.get('instagram_error', '')[:150]}"
    notify_editor(f"✅ রিল পোস্ট হয়েছে ({'ভয়েস' if not args.no_voice else 'শুধু মিউজিক'}): {story['daily_buzz']['title_bn']}\n"
                  f"https://www.facebook.com/reel/{video_id}\n{ig_note}")


# ---------------------------------------------------------------- instagram
# Instagram Reels through the Instagram Graph API (Facebook login). Instagram fetches
# the video from a public address instead of taking an upload, so it is given the copy
# Facebook already hosts for the Reel just posted: no extra storage needed.
# Needs the Page token to include instagram_basic and instagram_content_publish.
IG_LINK_LINE = "পুরো খবর পড়ুন sondesh.web.app এ (লিংক প্রোফাইলে) 👆"


def instagram_caption(story: dict) -> str:
    """Same caption as Facebook; Instagram links are not clickable, so it points to the bio."""
    text = build_caption(story).replace("পুরো খবরের লিংক কমেন্টে 👇", IG_LINK_LINE)
    return text[:2200]


def instagram_user_id() -> str:
    if os.getenv("IG_USER_ID"):
        return os.environ["IG_USER_ID"]
    r = requests.get(f"{GRAPH}/{os.environ['FB_PAGE_ID']}", timeout=30, params={
        "fields": "instagram_business_account", "access_token": os.environ["FB_PAGE_TOKEN"]})
    r.raise_for_status()
    ig = (r.json().get("instagram_business_account") or {}).get("id")
    if not ig:
        raise RuntimeError("no Instagram account is connected to the Facebook Page")
    return ig


def facebook_video_source(video_id: str, wait_s: int = 420) -> str:
    """Public address of the posted Facebook Reel, once Facebook has processed it."""
    token = os.environ["FB_PAGE_TOKEN"]
    deadline = time.time() + wait_s
    last = ""
    while time.time() < deadline:
        r = requests.get(f"{GRAPH}/{video_id}", timeout=30,
                         params={"fields": "source,status", "access_token": token})
        if r.ok:
            data = r.json()
            last = str((data.get("status") or {}).get("video_status") or "")
            if data.get("source") and last in ("ready", ""):
                return data["source"]
        else:
            last = _graph_error_text(r)
        time.sleep(15)
    raise RuntimeError(f"Facebook video not ready for Instagram after {wait_s}s ({last})")


def check_instagram() -> bool:
    """Read-only check that the Page token reaches the Instagram account and may publish."""
    token = os.environ["FB_PAGE_TOKEN"]
    try:
        ig_user = instagram_user_id()
    except Exception as err:  # noqa: BLE001
        print(f"Instagram account: NOT FOUND ({err})")
        return False
    r = requests.get(f"{GRAPH}/{ig_user}", timeout=30,
                     params={"fields": "username,followers_count,media_count", "access_token": token})
    print(f"Instagram account: {r.json() if r.ok else _graph_error_text(r)}")
    q = requests.get(f"{GRAPH}/{ig_user}/content_publishing_limit", timeout=30,
                     params={"fields": "quota_usage,config", "access_token": token})
    if q.ok:
        print(f"Publishing allowed. Usage in the last 24 hours: {q.json().get('data')}")
        return r.ok
    print(f"Publishing NOT allowed yet (the token needs instagram_content_publish): {_graph_error_text(q)}")
    return False


def _ig_container(ig_user: str, token: str, caption: str, video_path: Optional[str], fb_video_id: str) -> str:
    """Creates the Instagram Reel container. With the local file, the video is uploaded
    straight to Instagram (resumable upload); otherwise Instagram fetches Facebook's copy."""
    base = {"media_type": "REELS", "caption": caption, "share_to_feed": "true", "access_token": token}
    if video_path and os.path.exists(video_path):
        r = requests.post(f"{GRAPH}/{ig_user}/media", timeout=60, data={**base, "upload_type": "resumable"})
        if not r.ok:
            raise RuntimeError(f"Instagram container failed: {_graph_error_text(r)}")
        container, uri = r.json()["id"], r.json()["uri"]
        # Instagram's upload host sometimes answers 400/5xx marked "retriable": try again.
        for attempt in range(4):
            with open(video_path, "rb") as f:
                u = requests.post(uri, data=f, timeout=300, headers={
                    "Authorization": f"OAuth {token}", "offset": "0",
                    "file_size": str(os.path.getsize(video_path))})
            if u.ok:
                return container
            text = u.text.replace(" ", "").lower()
            retriable = u.status_code >= 500 or '"retriable":true' in text or "processingfailederror" in text
            if not retriable or attempt == 3:
                if fb_video_id:  # last resort: let Instagram fetch Facebook's copy of the Reel
                    print(f"Instagram upload failed ({u.status_code}); trying Facebook's copy instead")
                    break
                raise RuntimeError(f"Instagram upload failed: {u.status_code} {u.text[:300]}")
            print(f"Instagram upload hiccup ({u.status_code}); retrying")
            time.sleep(10 * (attempt + 1))
    r = requests.post(f"{GRAPH}/{ig_user}/media", timeout=60,
                      data={**base, "video_url": facebook_video_source(fb_video_id)})
    if not r.ok:
        raise RuntimeError(f"Instagram container failed: {_graph_error_text(r)}")
    return r.json()["id"]


def post_instagram_reel(fb_video_id: str, caption: str, video_path: Optional[str] = None) -> str:
    token = os.environ["FB_PAGE_TOKEN"]
    ig_user = instagram_user_id()
    container = _ig_container(ig_user, token, caption, video_path, fb_video_id)

    # Instagram downloads and processes the video; publish once it reports FINISHED.
    deadline = time.time() + 600
    status = ""
    while time.time() < deadline:
        s = requests.get(f"{GRAPH}/{container}", timeout=30,
                         params={"fields": "status_code,status", "access_token": token})
        if s.ok:
            status = s.json().get("status_code") or ""
            if status == "FINISHED":
                break
            if status in ("ERROR", "EXPIRED"):
                raise RuntimeError(f"Instagram could not process the video: {s.json().get('status')}")
        time.sleep(15)
    else:
        raise RuntimeError(f"Instagram processing timed out (last status {status or 'unknown'})")

    p = requests.post(f"{GRAPH}/{ig_user}/media_publish", timeout=60,
                      data={"creation_id": container, "access_token": token})
    if not p.ok:
        raise RuntimeError(f"Instagram publish failed: {_graph_error_text(p)}")
    return p.json()["id"]



# ---------------------------------------------------------------- editor video clips
# Reels from a real video clip the editor sent on Telegram (see telegram_clips.py):
# the footage fills the frame (black bars from the source are cropped off), the same
# hook / key-point / end-card text layers are laid over it, and the voice and music
# soundtrack is mixed over the clip's own sound, kept quiet underneath.
CLIP_SOUND = 0.18


def _probe(path: str) -> str:
    return subprocess.run(["ffmpeg", "-hide_banner", "-i", path], capture_output=True, text=True).stderr


def _black_bar_crop(path: str) -> Optional[str]:
    """crop=w:h:x:y that removes black bars burned into the source video, if any."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-t", "4", "-i", path, "-vf", "cropdetect=24:16:0",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    crops = [ln.split("crop=")[-1].strip() for ln in log.splitlines() if "crop=" in ln]
    return crops[-1] if crops else None


def render_overlays(story: dict, segments: list, duration: float, base_url: str, workdir: str, credit: str) -> list:
    """One transparent PNG text layer per segment: [(path, start, end)]."""
    from playwright.sync_api import sync_playwright
    request = {
        "headline": reel_headline(story),
        "points": reel_points(story),
        "sourceLine": f"ভিডিও: {credit}",
        "category": "",
        "dateLine": bn_date(_parse_time(story.get("published_at")) or datetime.now(timezone.utc)),
        "kicker": (story.get("daily_buzz") or {}).get("kicker_bn") or "",
        "imageUrl": None,
        "segments": segments,
        "duration": duration,
    }
    times = [min(s["end"] - 0.05, s["start"] + (0.9 if s["kind"] != "outro" else 0.5)) for s in segments]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1920})
        page.goto(f"{base_url}/__reel", wait_until="networkidle")
        page.wait_for_function("window.reelHostReady === true", timeout=30000)
        pngs = page.evaluate("([req, ts]) => window.renderOverlayFrames(req, ts)", [request, times])
        browser.close()
    layers = []
    for n, (seg, b64) in enumerate(zip(segments, pngs)):
        path = os.path.join(workdir, f"layer{n}.png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
        layers.append((path, seg["start"], seg["end"]))
    return layers


def compose_footage(clip_path: str, audio: str, layers: list, total: float, out_path: str):
    """Footage (looped to the soundtrack's length) + text layers + mixed sound -> mp4."""
    crop = _black_bar_crop(clip_path)
    has_sound = "Audio:" in _probe(clip_path)
    inputs = ["-stream_loop", "-1", "-t", f"{total}", "-i", clip_path, "-i", audio]
    for path, _, _ in layers:
        inputs += ["-loop", "1", "-t", f"{total}", "-i", path]
    chain = [f"[0:v]{'crop=' + crop + ',' if crop else ''}scale=1080:1920:force_original_aspect_ratio=increase,"
             "crop=1080:1920,setsar=1,fps=30,format=yuv420p[v0]"]
    last = "v0"
    for n, (_, start, end) in enumerate(layers):
        chain.append(f"[{last}][{n + 2}:v]overlay=0:0:enable='between(t,{start},{end})'[v{n + 1}]")
        last = f"v{n + 1}"
    if has_sound:
        chain.append(f"[0:a]volume={CLIP_SOUND},aresample=48000,aformat=channel_layouts=stereo[clip];"
                     "[1:a][clip]amix=inputs=2:normalize=0:duration=first,"
                     "loudnorm=I=-14:TP=-1:LRA=11,aresample=48000[a]")
    else:
        chain.append("[1:a]anull[a]")
    _ff(*inputs, "-filter_complex", ";".join(chain), "-map", f"[{last}]", "-map", "[a]", "-t", f"{total}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "21",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out_path)


def render_footage_reel(story: dict, clip_path: str, credit: str, base_url: str, workdir: str, out_path: str,
                        use_voice: bool = True) -> float:
    audio, segments, total = build_voiceover(story, workdir, use_voice=use_voice)
    layers = render_overlays(story, segments, total, base_url, workdir, credit)
    compose_footage(clip_path, audio, layers, total, out_path)
    return total


def render_photo_reel(story: dict, file_ids: list, credit: str, base_url: str, workdir: str, out_path: str) -> float:
    """Reel from the editor's photos: the usual design, one photo behind each beat."""
    from pipeline.social import telegram_clips as tgc
    urls = []
    for n, fid in enumerate(file_ids):
        path = tgc.download_file(fid, os.path.join(workdir, f"photo{n}.jpg"))
        with open(path, "rb") as f:
            urls.append("data:image/jpeg;base64," + base64.b64encode(f.read()).decode())
    audio, segments, total = build_voiceover(story, workdir)
    video = render_video(story, segments, total, base_url, workdir, image_urls=urls, source_line=f"ছবি: {credit}")
    mux(video, audio, total, out_path)
    return total


def _studio_status(db, clip: dict, status: str, **extra):
    """Mirrors progress onto the Studio's publish request, so the Studio can show it."""
    if not clip.get("request_id"):
        return
    db.collection("studio_requests").document(clip["request_id"]).set(
        {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), **extra}, merge=True)


def apply_studio_edits(story: dict, clip: dict) -> dict:
    """The editor's Studio choices (clip['edits']) on a copy of the story: hook, label above
    it, the key points and the music mood. Empty fields keep the AI's version."""
    edits = clip.get("edits") or {}
    if not edits:
        return story
    import copy
    st = copy.deepcopy(story)
    buzz = st.setdefault("daily_buzz", {})
    if (edits.get("hook") or "").strip():
        buzz["hook_bn"] = edits["hook"].strip()
    if "kicker" in edits:
        buzz["kicker_bn"] = (edits.get("kicker") or "").strip() or None
    points = [p.strip() for p in (edits.get("points") or []) if (p or "").strip()]
    if points:
        buzz["bullets_bn"] = points[:3]
    if edits.get("music") in MUSIC_MOODS:
        st["_music_mood"] = edits["music"]
    return st


def _clip_and_story(db, clip_id: str):
    from pipeline.social.telegram_clips import COLLECTION
    ref = db.collection(COLLECTION).document(clip_id)
    clip = ref.get().to_dict()
    if not clip:
        raise RuntimeError(f"Telegram clip {clip_id} not found")
    story = pick_story(db, clip["story_id"])
    if not story:
        raise RuntimeError(f"story {clip['story_id']} not found")
    return ref, clip, apply_studio_edits(story, clip)


def telegram_preview(db, clip_id: str, base_url: str, out_path: str):
    from pipeline.social import telegram_clips as tgc
    ref, clip, story = _clip_and_story(db, clip_id)
    try:
        with tempfile.TemporaryDirectory() as workdir:
            credit = clip.get("credit") or "সংগৃহীত"
            if clip.get("media_type") == "studio_photo":
                req = db.collection("studio_requests").document(clip["request_id"]).get().to_dict() or {}
                audio, segments, total = build_voiceover(story, workdir, use_voice=clip.get("voice", True))
                video = render_video(story, segments, total, base_url, workdir, image_urls=req.get("photos") or [],
                                     source_line=f"ছবি: {credit}" if clip.get("credit") else None)
                mux(video, audio, total, out_path)
            elif clip.get("media_type") == "auto":
                audio, segments, total = build_voiceover(story, workdir, use_voice=clip.get("voice", True))
                mux(render_video(story, segments, total, base_url, workdir), audio, total, out_path)
            elif clip.get("media_type") == "photo":
                total = render_photo_reel(story, clip.get("file_ids") or [clip["file_id"]], credit,
                                          base_url, workdir, out_path)
            else:
                src = tgc.download_file(clip["file_id"], os.path.join(workdir, "clip_src"))
                total = render_footage_reel(story, src, credit, base_url, workdir, out_path)
        print(f"Rendered clip Reel {out_path} ({total:.1f}s, {os.path.getsize(out_path) // 1024} KB)")
        sent = tgc.send_video(clip["chat_id"], out_path,
                              f"প্রিভিউ ({total:.0f} সেকেন্ড): {story['daily_buzz']['title_bn']}"
                              + (f"\nসূত্র দেখাবে: {clip.get('credit')}" if clip.get("credit") else ""),
                              tgc.approval_buttons(clip_id))
        ref.set({"status": "preview_sent", "preview_file_id": sent["video"]["file_id"],
                 "duration_s": total, "updated_at": datetime.now(timezone.utc).isoformat()}, merge=True)
        _studio_status(db, clip, "rendered")
        # Studio "Publish" requests were already previewed in the Studio: post without a tap.
        if clip.get("auto_approve") == "now":
            ref.set({"status": "approved_now"}, merge=True)
            telegram_post(db, clip_id)
        elif clip.get("auto_approve") == "slot":
            ref.set({"status": "approved_slot"}, merge=True)
            _studio_status(db, clip, "waiting_slot")
    except Exception as err:
        ref.set({"status": "failed", "error": str(err)[:400]}, merge=True)
        _studio_status(db, clip, "failed", error=str(err)[:300])
        tgc.send(clip["chat_id"], f"রিল তৈরি করা যায়নি: {str(err)[:300]}")
        raise


def telegram_post(db, clip_id: str):
    from pipeline.social import telegram_clips as tgc
    ref, clip, story = _clip_and_story(db, clip_id)
    if clip.get("status") not in ("approved_now", "approved_slot"):
        print(f"Clip {clip_id} is {clip.get('status')}; not posting.")
        return
    ref.set({"status": "posting"}, merge=True)
    workdir = tempfile.mkdtemp()
    video = os.path.join(workdir, "reel.mp4")
    try:
        tgc.download_file(clip["preview_file_id"], video)
        label = "ছবি" if clip.get("media_type") in ("photo", "studio_photo") else "ভিডিও"
        credit_line = f"\n\n{label}: {clip.get('credit')}" if clip.get("credit") else ""
        custom = (clip.get("caption") or "").strip()
        caption = (custom + _music_credit_line(story, custom) if custom else build_caption(story)) + credit_line
        platforms = clip.get("platforms") or ["facebook", "instagram"]
        video_id = upload_reel(video, caption) if "facebook" in platforms else None
    except Exception as err:
        ref.set({"status": "failed", "error": str(err)[:400]}, merge=True)
        tgc.send(clip["chat_id"], f"ফেসবুকে পোস্ট করা যায়নি: {str(err)[:300]}")
        raise
    print(f"Posted clip Reel: video_id {video_id}" if video_id else "Facebook skipped (not chosen in the Studio)")
    comment_id = comment_link(video_id, story) if video_id else None
    record = {
        "story_id": story["story_id"], "platform": "facebook_reel", "source": "telegram_clip",
        "clip_id": clip_id, "media_type": clip.get("media_type"), "video_id": video_id, "comment_id": comment_id,
        "posted_at": datetime.now(timezone.utc).isoformat(), "headline": story["daily_buzz"]["title_bn"],
        "category": story.get("primary_category"), "region": story.get("region"),
        "importance_score": story.get("importance_score"), "social_appeal": story.get("social_appeal"),
        "duration_s": clip.get("duration_s"), "voiced": clip.get("voice", True), "hashtags": build_hashtags(story),
        "story_published_at": story.get("published_at"),
    }
    note = f"ফেসবুকে পোস্ট হয়েছে: https://www.facebook.com/reel/{video_id}" if video_id else "ফেসবুকে দেওয়া হয়নি (স্টুডিওতে বাছাই করা হয়নি)।"
    if os.getenv("IG_POSTING", "on").lower() != "off" and "instagram" in platforms:
        try:
            ig_base = (custom.replace("পুরো খবরের লিংক কমেন্টে 👇", IG_LINK_LINE) + _music_credit_line(story, custom)
                       if custom else instagram_caption(story))
            ig_caption = ig_base + credit_line
            record["instagram_media_id"] = post_instagram_reel(video_id or "", ig_caption[:2200], video)
            note += "\nইনস্টাগ্রামেও পোস্ট হয়েছে।"
            print(f"Posted on Instagram: media_id {record['instagram_media_id']}")
        except Exception as err:  # noqa: BLE001
            record["instagram_error"] = str(err)[:400]
            print(f"Instagram posting failed: {record['instagram_error']}")
            note += f"\nইনস্টাগ্রামে যায়নি: {str(err)[:200]}"
    db.collection("social_posts").document(f"tg_{clip_id}").set(record)
    ref.set({"status": "posted", "fb_video_id": video_id, "posted_at": record["posted_at"]}, merge=True)
    _studio_status(db, clip, "posted", fb_url=f"https://www.facebook.com/reel/{video_id}" if video_id else None,
                   instagram=bool(record.get("instagram_media_id")))
    tgc.send(clip["chat_id"], note)


def _music_credit_line(story: dict, caption: str) -> str:
    """The music licence credit, added to a custom caption that does not already carry it."""
    credit = music_track(story)[1]
    return f"\n\n{credit}" if credit and credit not in caption else ""


def retry_instagram(db, clip_id: str):
    """Posts an editor clip that is already on Facebook to Instagram ('latest': the most
    recent one that has not reached Instagram)."""
    from pipeline.social import telegram_clips as tgc
    if clip_id == "latest":
        docs = [d.to_dict() for d in db.collection("social_posts").where("source", "==", "telegram_clip").stream()]
        docs = sorted((d for d in docs if not d.get("instagram_media_id")), key=lambda d: d.get("posted_at") or "")
        if not docs:
            print("Every editor clip is already on Instagram.")
            return
        clip_id = docs[-1]["clip_id"]
    ref, clip, story = _clip_and_story(db, clip_id)
    video = os.path.join(tempfile.mkdtemp(), "reel.mp4")
    tgc.download_file(clip["preview_file_id"], video)
    label = "ছবি" if clip.get("media_type") in ("photo", "studio_photo") else "ভিডিও"
    caption = (instagram_caption(story) + f"\n\n{label}: {clip.get('credit')}")[:2200]
    media_id = post_instagram_reel(clip.get("fb_video_id") or "", caption, video)
    print(f"Posted on Instagram: media_id {media_id}")
    db.collection("social_posts").document(f"tg_{clip_id}").set(
        {"instagram_media_id": media_id, "instagram_error": None}, merge=True)
    tgc.send(clip["chat_id"], "ইনস্টাগ্রামেও পোস্ট হয়েছে।")


if __name__ == "__main__":
    main()
