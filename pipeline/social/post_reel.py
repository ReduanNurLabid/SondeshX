"""
Automatic Facebook Reel for the most important recent story.

1. Pick the highest-scored story from the last 12 hours that passed fact-check and
   has not been posted yet.
2. Render it with the site's own reel engine (headless Chromium on /__reel).
3. Convert to an H.264/AAC MP4 that meets Facebook Reels requirements.
4. Upload it to the Page as a Reel (Reels Publishing API) and record it in
   Firestore social_posts so it is never posted twice.

    python -m pipeline.social.post_reel --base-url http://localhost:4173 [--dry-run] [--story-id ID]

Environment: FB_PAGE_ID, FB_PAGE_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON.
"""
import argparse
import base64
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from firebase_admin import firestore

from pipeline.config import INTEREST_CATEGORIES
from pipeline.storage.firebase_service import get_firestore_client

GRAPH = "https://graph.facebook.com/v23.0"
SITE_URL = "https://sondesh.web.app"
LOOKBACK_HOURS = 12
MIN_SCORE = 7.0


def _parse_time(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def pick_story(db, story_id: Optional[str] = None) -> Optional[dict]:
    if story_id:
        snap = db.collection("daily_buzz").document(story_id).get()
        return snap.to_dict() if snap.exists else None

    posted = {d.id for d in db.collection("social_posts").select([]).stream()}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    docs = (
        db.collection("daily_buzz")
        .order_by("published_at", direction=firestore.Query.DESCENDING)
        .limit(80)
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
        if float(s.get("importance_score") or 0) < MIN_SCORE:
            continue
        s["story_id"] = sid
        candidates.append(s)
    candidates.sort(key=lambda s: float(s.get("importance_score") or 0), reverse=True)
    return candidates[0] if candidates else None


def source_names(story: dict) -> list:
    names = []
    for src in story.get("sources") or []:
        name = (src or {}).get("name")
        if name and name not in names:
            names.append(name)
    return names


def render_reel(story: dict, base_url: str, workdir: str) -> str:
    """Renders the story in headless Chromium and returns the path of a Reels-ready MP4."""
    from playwright.sync_api import sync_playwright

    buzz = story["daily_buzz"]
    category = INTEREST_CATEGORIES.get(story.get("primary_category") or "", {}).get("bn", "খবর")
    request = {
        "headline": buzz["title_bn"],
        "keyPoints": (buzz.get("bullets_bn") or [])[:3],
        "sourceName": (source_names(story) or ["সন্দেশ এক্সপ্রেস"])[0],
        "categoryName": category,
        "imageUrl": story.get("image_url"),
        "lang": "bn",
        "durationSeconds": 13,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1080, "height": 1920})
        page.goto(f"{base_url}/__reel", wait_until="networkidle")
        page.wait_for_function("window.reelHostReady === true", timeout=30000)
        result = page.evaluate("req => window.renderReel(req)", request)
        browser.close()

    raw_ext = "mp4" if "mp4" in result["mimeType"] else "webm"
    raw_path = os.path.join(workdir, f"raw.{raw_ext}")
    with open(raw_path, "wb") as f:
        f.write(base64.b64decode(result["base64"]))

    # Normalise for Facebook Reels: H.264 + AAC, 9:16 1080x1920, 30 fps, fast start.
    out_path = os.path.join(workdir, "reel.mp4")
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", raw_path,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "0:v:0", "-map", "0:a:0?", "-map", "1:a:0",
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out_path,
        ],
        check=True,
    )
    return out_path


def build_caption(story: dict) -> str:
    buzz = story["daily_buzz"]
    bullets = "\n".join(f"• {b}" for b in (buzz.get("bullets_bn") or [])[:3])
    sources = ", ".join(source_names(story)[:3])
    url = f"{SITE_URL}/story/{story['story_id']}/"
    lines = [buzz["title_bn"], "", bullets, "", f"বিস্তারিত: {url}"]
    if sources:
        lines.append(f"সূত্র: {sources}")
    lines += ["", "#সন্দেশএক্সপ্রেস #বাংলাদেশ #খবর"]
    return "\n".join(lines)


def upload_reel(video_path: str, caption: str) -> dict:
    page_id = os.environ["FB_PAGE_ID"]
    token = os.environ["FB_PAGE_TOKEN"]

    start = requests.post(
        f"{GRAPH}/{page_id}/video_reels",
        data={"upload_phase": "start", "access_token": token},
        timeout=60,
    )
    start.raise_for_status()
    video_id = start.json()["video_id"]
    upload_url = start.json()["upload_url"]

    size = os.path.getsize(video_path)
    with open(video_path, "rb") as f:
        up = requests.post(
            upload_url,
            headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)},
            data=f,
            timeout=300,
        )
    up.raise_for_status()

    finish = requests.post(
        f"{GRAPH}/{page_id}/video_reels",
        data={
            "upload_phase": "finish",
            "video_id": video_id,
            "video_state": "PUBLISHED",
            "description": caption,
            "access_token": token,
        },
        timeout=60,
    )
    finish.raise_for_status()
    return {"video_id": video_id, "finish": finish.json()}


def _graph_error(err: requests.HTTPError) -> str:
    try:
        return str(err.response.json().get("error", {}))[:400]
    except Exception:
        return str(err)[:400]


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
        print("No eligible story (needs fact-check passed, score >= 7, last 12 hours, not yet posted).")
        return

    print(f"Story: {story['daily_buzz']['title_bn']} (score {story.get('importance_score')})")
    with tempfile.TemporaryDirectory() as workdir:
        video = render_reel(story, args.base_url, workdir)
        os.replace(video, args.out)
    print(f"Rendered {args.out} ({os.path.getsize(args.out) // 1024} KB)")

    caption = build_caption(story)
    if args.dry_run:
        print("Dry run: not posted. Caption would be:\n" + caption)
        return

    try:
        result = upload_reel(args.out, caption)
    except requests.HTTPError as err:
        print(f"Facebook upload failed: {_graph_error(err)}")
        sys.exit(1)

    db.collection("social_posts").document(story["story_id"]).set({
        "story_id": story["story_id"],
        "platform": "facebook_reel",
        "video_id": result["video_id"],
        "posted_at": datetime.now(timezone.utc).isoformat(),
        "headline": story["daily_buzz"]["title_bn"],
    })
    print(f"Posted Reel to the Page: video_id {result['video_id']}")


if __name__ == "__main__":
    main()
