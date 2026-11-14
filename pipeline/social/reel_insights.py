"""
Reads performance numbers for recent Reels from Facebook and stores them on each
social_posts document, so the dashboard can show which Reels worked.

    python -m pipeline.social.reel_insights

Needs FB_PAGE_TOKEN with read_insights (and pages_read_engagement).
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from firebase_admin import firestore

from pipeline.storage.firebase_service import get_firestore_client

GRAPH = "https://graph.facebook.com/v23.0"
DAYS_TRACKED = 7
METRICS = {
    "blue_reels_play_count": "plays",
    "post_impressions_unique": "reach",
    "post_video_avg_time_watched": "avg_watch_ms",
    "post_video_social_actions": "interactions",
}


def fetch_insights(video_id: str, token: str) -> dict:
    out, errors = {}, []
    for metric, name in METRICS.items():
        r = requests.get(f"{GRAPH}/{video_id}/video_insights",
                         params={"metric": metric, "access_token": token}, timeout=30)
        if not r.ok:
            errors.append(f"{metric}: {r.json().get('error', {}).get('message', r.status_code)}")
            continue
        for row in r.json().get("data", []):
            values = row.get("values") or []
            if values:
                value = values[-1].get("value")
                out[name] = sum(value.values()) if isinstance(value, dict) else value
    # Comments and reactions on the Reel itself.
    r = requests.get(f"{GRAPH}/{video_id}", timeout=30, params={
        "fields": "comments.summary(true).limit(0),reactions.summary(true).limit(0)", "access_token": token})
    if r.ok:
        data = r.json()
        out["comments"] = (data.get("comments") or {}).get("summary", {}).get("total_count")
        out["reactions"] = (data.get("reactions") or {}).get("summary", {}).get("total_count")
    if errors:
        out["errors"] = errors[:4]
    return out


def main():
    if sys.stdout:
        sys.stdout.reconfigure(encoding="utf-8")
    token = os.environ["FB_PAGE_TOKEN"]
    db = get_firestore_client()
    since = (datetime.now(timezone.utc) - timedelta(days=DAYS_TRACKED)).isoformat()
    docs = db.collection("social_posts").where("posted_at", ">=", since).stream()
    updated = 0
    for doc in docs:
        post = doc.to_dict()
        if not post.get("video_id"):
            continue
        stats = fetch_insights(post["video_id"], token)
        stats["checked_at"] = datetime.now(timezone.utc).isoformat()
        doc.reference.set({"insights": stats}, merge=True)
        updated += 1
        summary = {k: stats.get(k) for k in ("plays", "reach", "avg_watch_ms", "reactions", "comments")}
        print(f"{post.get('headline', '')[:50]} -> {summary}")
        if stats.get("errors"):
            print(f"   missing: {stats['errors']}")
    print(f"Updated insights for {updated} Reels.")


if __name__ == "__main__":
    main()
