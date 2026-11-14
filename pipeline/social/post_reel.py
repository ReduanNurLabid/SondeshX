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

import edge_tts
import requests
from firebase_admin import firestore

from pipeline.config import INTEREST_CATEGORIES
from pipeline.storage.firebase_service import get_firestore_client

GRAPH = "https://graph.facebook.com/v23.0"
SITE_URL = "https://sondesh.web.app"
LOOKBACK_HOURS = 6
MIN_IMPORTANCE = 6.5
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
async def _speak(text: str, path: str):
    await edge_tts.Communicate(text, VOICE, rate="+4%").save(path)


def media_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def build_voiceover(story: dict, workdir: str):
    """Returns (voice_wav_path, segments, total_duration)."""
    buzz = story["daily_buzz"]
    points = (buzz.get("bullets_bn") or [])[:3]
    parts = [("headline", None, buzz["title_bn"])]
    parts += [("point", i, p) for i, p in enumerate(points)]
    parts.append(("outro", None, OUTRO_TEXT))

    segments, inputs, filters = [], [], []
    clock = LEAD_IN
    for n, (kind, index, text) in enumerate(parts):
        mp3 = os.path.join(workdir, f"seg{n}.mp3")
        asyncio.run(_speak(text, mp3))
        dur = media_duration(mp3)
        end = clock + dur + GAP_SECONDS
        seg = {"kind": kind, "start": round(clock if n else 0.0, 3), "end": round(end, 3)}
        if index is not None:
            seg["index"] = index
        segments.append(seg)
        inputs += ["-i", mp3]
        filters.append(f"[{n}:a]aresample=48000,apad=pad_dur={GAP_SECONDS}[a{n}]")
        clock = end

    total = round(clock + 0.8, 3)  # let the outro card breathe
    segments[-1]["end"] = total
    concat = "".join(f"[a{n}]" for n in range(len(parts)))
    voice = os.path.join(workdir, "voice.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex",
         ";".join(filters) + f";{concat}concat=n={len(parts)}:v=0:a=1,adelay={int(LEAD_IN * 1000)}:all=1[v]",
         "-map", "[v]", "-ac", "2", voice],
        check=True,
    )
    return voice, segments, total


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


def mux(video: str, voice: str, duration: float, out_path: str):
    """Voiceover over a quiet music bed; H.264/AAC 1080x1920 30 fps for Reels."""
    if os.path.exists(MUSIC_FILE):
        music_in = ["-stream_loop", "-1", "-i", MUSIC_FILE]
    else:
        # Soft synthesized pad: a low major chord with a slow swell.
        expr = ("0.10*sin(2*PI*130.81*t)+0.07*sin(2*PI*164.81*t)+0.06*sin(2*PI*196*t)"
                "+0.03*sin(2*PI*261.63*t)")
        music_in = ["-f", "lavfi", "-i",
                    f"aevalsrc='({expr})*(0.75+0.25*sin(2*PI*0.12*t))':s=48000:c=stereo"]
    fade_at = max(0.0, duration - 1.5)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", voice, *music_in,
         "-filter_complex",
         f"[2:a]volume=0.22,afade=t=in:d=1.2,afade=t=out:st={fade_at}:d=1.5[m];"
         f"[1:a]volume=1.6[vo];[vo][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
         "-map", "0:v:0", "-map", "[a]", "-t", f"{duration}",
         "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "20",
         "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out_path],
        check=True,
    )


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
    args = parser.parse_args()

    db = get_firestore_client()
    story = pick_story(db, args.story_id)
    if not story:
        print(f"No eligible story this slot (fact-checked, importance >= {MIN_IMPORTANCE}, appeal >= {MIN_APPEAL}, last {LOOKBACK_HOURS} hours, not yet posted).")
        return
    print(f"Story: {story['daily_buzz']['title_bn']} (importance {story.get('importance_score')}, appeal {story.get('social_appeal')}, reel score {reel_score(story):.2f})")

    with tempfile.TemporaryDirectory() as workdir:
        voice, segments, duration = build_voiceover(story, workdir)
        print(f"Voiceover: {duration:.1f}s, {len(segments)} segments")
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
