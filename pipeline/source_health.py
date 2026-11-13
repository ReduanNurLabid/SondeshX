"""
Source health tracking.

Each pipeline run records, per source, when it last yielded an article from the
past 24 hours. A source that stays silent longer than SOURCE_SILENCE_ALERT_HOURS
is reported so a dead or frozen feed is noticed instead of silently ignored.

Run as a script, it prints a Markdown alert body when any source is silent and
prints nothing when all sources are healthy:

    python -m pipeline.source_health
"""
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List

from pipeline.config import FEEDS, SECTION_TARGETS, SOURCE_SILENCE_ALERT_HOURS

HEALTH_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "output", "source_health.json")


def _configured_source_names() -> set:
    return {f["name"] for f in FEEDS.values()} | {s["name"] for s in SECTION_TARGETS}


def load_health() -> Dict[str, dict]:
    try:
        with open(HEALTH_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("sources", {})
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def silent_sources(sources: Dict[str, dict], now: datetime) -> List[str]:
    """Names of sources with no fresh article for SOURCE_SILENCE_ALERT_HOURS."""
    silent = []
    for name, rec in sources.items():
        reference = rec.get("last_fresh_at") or rec.get("first_seen_at")
        if not reference:
            continue
        hours = (now - datetime.fromisoformat(reference)).total_seconds() / 3600.0
        if hours >= SOURCE_SILENCE_ALERT_HOURS:
            silent.append(name)
    return sorted(silent)


def record_fetch_health(fetch_health: Dict[str, dict]) -> List[str]:
    """Merges one run's per-source results into the health file. Returns silent source names."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    configured = _configured_source_names()

    # Sources removed from config are dropped so they cannot alert forever.
    sources = {name: rec for name, rec in load_health().items() if name in configured}

    for name, result in fetch_health.items():
        rec = sources.setdefault(name, {"first_seen_at": now_iso, "last_fresh_at": None})
        rec["last_checked_at"] = now_iso
        rec["status"] = result["status"]
        rec["entries"] = result["entries"]
        rec["fresh_24h"] = result["fresh_24h"]
        if result["fresh_24h"] > 0:
            rec["last_fresh_at"] = now_iso

    silent = silent_sources(sources, now)
    os.makedirs(os.path.dirname(HEALTH_PATH), exist_ok=True)
    with open(HEALTH_PATH, "w", encoding="utf-8") as f:
        json.dump({"updated_at": now_iso, "silent": silent, "sources": sources},
                  f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    return silent


def build_alert_body() -> str:
    sources = load_health()
    silent = silent_sources(sources, datetime.now(timezone.utc))
    if not silent:
        return ""
    lines = [
        f"These sources have produced no article newer than {SOURCE_SILENCE_ALERT_HOURS} hours:",
        "",
        "| Source | Last status | Entries in feed | Last fresh article seen |",
        "|---|---|---|---|",
    ]
    for name in silent:
        rec = sources[name]
        lines.append(
            f"| {name} | {rec.get('status', '?')} | {rec.get('entries', 0)} | {rec.get('last_fresh_at') or 'never'} |"
        )
    lines += ["", "Check the feed URL in `pipeline/config.py`. Close this issue once the source is fixed or removed."]
    return "\n".join(lines)


if __name__ == "__main__":
    if sys.stdout:
        sys.stdout.reconfigure(encoding="utf-8")
    body = build_alert_body()
    if body:
        print(body)
