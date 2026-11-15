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

GRAPH = "https://graph.facebook.com/v23.0"
SITE_URL = "https://sondesh.web.app"
LOOKBACK_HOURS = 6
MIN_IMPORTANCE = 6.0
MIN_APPEAL = 6.0
VOICE = "bn-BD-NabanitaNeural"
GAP_SECONDS = 0.45
LEAD_IN = 0.4
OUTRO_TEXT = "পুরো খবর পড়তে কমেন্টের লিংকে যান। প্রতিদিনের খবর পেতে সন্দেশ এক্সপ্রেস ফলো করুন।"
MUSIC_FILE = os.path.join(os.path.dirname(__file__), "assets", "reel_music.mp3")
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
def reel_score(story: dict) -> float:
    """How good a Reel this story would make: half editorial importance, half Facebook
    appeal (judged by the news desk), plus a bonus for a real publisher photo, which
    keeps people watching. Stories from before the appeal score existed count importance twice."""
    importance = float(story.get("importance_score") or 0)
    appeal = float(story.get("social_appeal") or importance)
    return 0.5 * importance + 0.5 * appeal + (0.5 if reel_image(story) else 0.0)


def recent_posts(db, n: int = 3) -> List[dict]:
    docs = (db.collection("social_posts")
            .order_by("posted_at", direction=firestore.Query.DESCENDING).limit(n).stream())
    return [d.to_dict() for d in docs]


def pick_story(db, story_id: Optional[str] = None) -> Optional[dict]:
    if story_id:
        snap = db.collection("daily_buzz").document(story_id).get()
        if not snap.exists:
            return None
        s = snap.to_dict()
        s["story_id"] = s.get("story_id") or story_id
        return s

    posted = {d.id for d in db.collection("social_posts").select([]).stream()}
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
        if float(s.get("importance_score") or 0) < MIN_IMPORTANCE:
            continue
        if s.get("social_appeal") is not None and float(s["social_appeal"]) < MIN_APPEAL:
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

    pool = [s for s in candidates if allowed(s)] or candidates
    pool.sort(key=reel_score, reverse=True)
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
    return None if (not url or "unsplash.com" in url) else url


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


def _script_parts(story: dict) -> list:
    buzz = story["daily_buzz"]
    parts = [("headline", None, buzz["title_bn"])]
    parts += [("point", i, p) for i, p in enumerate((buzz.get("bullets_bn") or [])[:3])]
    parts.append(("outro", None, OUTRO_TEXT))
    return parts


def _gemini_speech(texts: list, out_wav: str) -> bool:
    """Reads all parts in one request, with a clear pause between parts. Tries each
    configured key; returns False when none can produce audio."""
    import wave
    from google import genai
    from google.genai import types
    from pipeline.processing.llm import gemini_api_keys

    script = "\n\n".join(texts)
    prompt = ("Read this Bangla news script aloud as a calm, clear, warm Bangladeshi newsreader, "
              "at a natural pace. Pause for about one second between paragraphs. "
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
            if seconds < 0.6 * expected:
                print(f"Gemini voice stopped early ({seconds:.1f}s of about {expected:.0f}s); retrying")
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
        ["ffmpeg", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x.split("silence_start: ")[1].split()[0]) for x in log.splitlines() if "silence_start: " in x]
    ends = [float(x.split("silence_end: ")[1].split()[0]) for x in log.splitlines() if "silence_end: " in x]
    return list(zip(starts, ends))


def _boundaries(texts: list, speech_len: float, pauses: list) -> list:
    """Times where each part after the first begins. Uses the longest pauses when the
    voice paused between every part; otherwise splits by text length."""
    need = len(texts) - 1
    inner = [p for p in pauses if 0.3 < p[0] < speech_len - 0.3]
    if len(inner) >= need:
        chosen = sorted(sorted(inner, key=lambda p: p[1] - p[0], reverse=True)[:need])
        return [round((p0 + p1) / 2, 3) for p0, p1 in chosen]
    total = sum(len(t) for t in texts)
    cuts, acc = [], 0
    for t in texts[:-1]:
        acc += len(t)
        cuts.append(round(speech_len * acc / total, 3))
    return cuts


# Reel sound design (News Room News - Spence):
#   hook: the track's opening seconds play over the intro animation, then fade
#   voice: headline, then each point; a short music sting fades in and out between parts
#   tail: music returns under the end card
HOOK_FROM, HOOK_LEN, HOOK_FADE = 0.6, 6.0, 1.5
STING_LEN = 2.2
STING_FROM = [20.0, 32.0, 44.0, 56.0, 68.0]   # different bars of the track for each sting
TAIL_FROM, TAIL_LEN = 80.0, 3.0
HEADLINE_GAP = 0.35


def _ff(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def _music_piece(path: str, start: float, length: float, fade_in: float, fade_out: float, volume: float = 1.0):
    _ff("-ss", f"{start}", "-t", f"{length}", "-i", MUSIC_FILE, "-af",
        f"volume={volume},afade=t=in:d={fade_in},afade=t=out:st={max(0.0, length - fade_out)}:d={fade_out},"
        "aresample=48000,aformat=channel_layouts=stereo", path)


def _voice_piece(path: str, src: str, start: float, end: float):
    _ff("-ss", f"{start}", "-to", f"{end}", "-i", src, "-af",
        "volume=1.5,aresample=48000,aformat=channel_layouts=stereo", path)


def _silence(path: str, length: float):
    _ff("-f", "lavfi", "-t", f"{length}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", path)


def build_voiceover(story: dict, workdir: str):
    """Builds the whole soundtrack. Returns (audio_wav, segments, total_duration)."""
    parts = _script_parts(story)              # headline, points..., outro
    texts = [t for _, _, t in parts]
    raw = os.path.join(workdir, "voice_raw.wav")
    pieces, segments = [], []
    clock = 0.0

    def add(path: str, length: float):
        nonlocal clock
        pieces.append(path)
        clock += length

    hook = os.path.join(workdir, "hook.wav")
    _music_piece(hook, HOOK_FROM, HOOK_LEN, 0.15, HOOK_FADE)
    segments.append({"kind": "intro", "start": 0.0, "end": HOOK_LEN})
    add(hook, HOOK_LEN)

    voiced = _gemini_speech(texts, raw)
    if voiced:
        speech_len = media_duration(raw)
        cuts = _boundaries(texts, speech_len, _silences(raw))
        edges = [0.0] + cuts + [speech_len]
        print(f"Voice: Gemini {TTS_VOICE}")
    else:
        print("Voice: none (Gemini voice quota used up); on-screen text with music only")

    sting_n = 0
    for n, (kind, index, text) in enumerate(parts):
        seg_start = clock
        # A sting leads into every part after the headline; the new card animates in with it.
        if n >= 1:
            sting = os.path.join(workdir, f"sting{n}.wav")
            _music_piece(sting, STING_FROM[sting_n % len(STING_FROM)], STING_LEN, 0.5, 0.9, 0.85)
            sting_n += 1
            add(sting, STING_LEN)
        if voiced:
            piece = os.path.join(workdir, f"voice{n}.wav")
            _voice_piece(piece, raw, edges[n], edges[n + 1])
            add(piece, media_duration(piece))
        else:
            bed = os.path.join(workdir, f"bed{n}.wav")
            read = 3.0 if kind == "outro" else max(4.5, min(9.0, len(text) / 14))
            _music_piece(bed, 8.0 + 9 * n, read, 0.6, 0.6, 0.45)
            add(bed, read)
        if kind == "headline":
            gap = os.path.join(workdir, "gap.wav")
            _silence(gap, HEADLINE_GAP)
            add(gap, HEADLINE_GAP)
        seg = {"kind": kind, "start": round(seg_start, 3), "end": round(clock, 3)}
        if index is not None:
            seg["index"] = index
        segments.append(seg)

    tail = os.path.join(workdir, "tail.wav")
    _music_piece(tail, TAIL_FROM, TAIL_LEN, 0.4, 1.6, 0.9)
    add(tail, TAIL_LEN)
    segments[-1]["end"] = round(clock, 3)

    listing = os.path.join(workdir, "pieces.txt")
    with open(listing, "w", encoding="utf-8") as fh:
        fh.writelines(f"file '{p.replace(chr(92), '/')}'\n" for p in pieces)
    audio = os.path.join(workdir, "soundtrack.wav")
    _ff("-f", "concat", "-safe", "0", "-i", listing, "-c:a", "pcm_s16le", audio)
    return audio, segments, round(clock, 3)


# ---------------------------------------------------------------- video
def render_video(story: dict, segments: list, duration: float, base_url: str, workdir: str) -> str:
    from playwright.sync_api import sync_playwright

    buzz = story["daily_buzz"]
    names = source_names(story)
    request = {
        "headline": buzz["title_bn"],
        "points": (buzz.get("bullets_bn") or [])[:3],
        "sourceLine": f"সূত্র: {', '.join(names[:3])}" if names else "",
        "category": INTEREST_CATEGORIES.get(story.get("primary_category") or "", {}).get("bn", "খবর"),
        "dateLine": bn_date(_parse_time(story.get("published_at")) or datetime.now(timezone.utc)),
        "imageUrl": reel_image(story),
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
    parts = [buzz["title_bn"]]
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
    parts.append("#সন্দেশএক্সপ্রেস #বাংলাদেশ #খবর")
    return "\n\n".join(parts)


def story_link(story: dict, tagged: bool = False) -> str:
    url = f"{SITE_URL}/story/{story['story_id']}/"
    # Tagged so Google Analytics can count visits that came from each Reel.
    return url + "?utm_source=facebook&utm_medium=reel&utm_campaign=auto_reel" if tagged else url


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


def comment_link(video_id: str, story: dict) -> Optional[str]:
    """First comment with the story link. Needs pages_manage_engagement. The video may
    still be processing right after upload, so this retries for about two minutes."""
    token = os.environ["FB_PAGE_TOKEN"]
    message = f"📰 পুরো খবর পড়ুন সন্দেশ এক্সপ্রেসে:\n{story_link(story, tagged=True)}"
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
def main():
    if sys.stdout:
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:4173")
    parser.add_argument("--story-id")
    parser.add_argument("--dry-run", action="store_true", help="render the video but do not post it")
    parser.add_argument("--out", default="reel.mp4", help="where to keep the rendered video")
    parser.add_argument("--min-gap-minutes", type=int, default=0,
                        help="skip if the last Reel was posted less than this many minutes ago")
    args = parser.parse_args()

    db = get_firestore_client()
    if args.min_gap_minutes and not args.story_id:
        last = recent_posts(db, 1)
        last_at = _parse_time(last[0].get("posted_at")) if last else None
        if last_at and datetime.now(timezone.utc) - last_at < timedelta(minutes=args.min_gap_minutes):
            print(f"Last Reel posted at {last_at.isoformat()}; skipping this slot (minimum gap {args.min_gap_minutes} min).")
            return
    story = pick_story(db, args.story_id)
    if not story:
        print(f"No eligible story this slot (fact-checked, importance >= {MIN_IMPORTANCE}, appeal >= {MIN_APPEAL}, last {LOOKBACK_HOURS} hours, not yet posted).")
        return
    print(f"Story: {story['daily_buzz']['title_bn']} (importance {story.get('importance_score')}, appeal {story.get('social_appeal')}, reel score {reel_score(story):.2f})")

    with tempfile.TemporaryDirectory() as workdir:
        voice, segments, duration = build_voiceover(story, workdir)
        print(f"Soundtrack: {duration:.1f}s, {len(segments)} segments")
        video = render_video(story, segments, duration, args.base_url, workdir)
        mux(video, voice, duration, args.out)
    print(f"Rendered {args.out} ({os.path.getsize(args.out) // 1024} KB)")

    caption = build_caption(story)
    if args.dry_run:
        print("Dry run: not posted.\n--- caption ---\n" + caption + f"\n--- comment ---\n{story_link(story)}")
        return

    try:
        video_id = upload_reel(args.out, caption)
    except requests.HTTPError as err:
        print(f"Facebook upload failed: {_graph_error_text(err.response)}")
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
        "story_published_at": story.get("published_at"),
    })
    if comment_id:
        print(f"Link comment added: {comment_id}")


if __name__ == "__main__":
    main()
