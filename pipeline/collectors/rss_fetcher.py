import sys
import feedparser
import uuid
import re
import requests
import calendar
import datetime
import email.utils
from bs4 import BeautifulSoup
from typing import Dict, List, Set, Optional

if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

from pipeline.config import FEEDS, SECTION_TARGETS, DEFAULT_HEADERS, EXCLUSION_KEYWORDS
from pipeline.models import RawArticle

FETCH_TIMEOUT_SECONDS = 8
MAX_PER_FEED = 12
MAX_PER_SECTION = 10

# Per-source result of the most recent fetch_rss_candidates() call.
# {source name: {"status": str, "entries": int, "fresh_24h": int}}
LAST_FETCH_HEALTH: Dict[str, dict] = {}

def parse_entry_datetime(entry) -> Optional[datetime.datetime]:
    """Parses publication datetime into a UTC-aware datetime object."""
    # RDF feeds (e.g. Deutsche Welle) carry dc:date, which feedparser exposes as updated_parsed.
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            try:
                epoch = calendar.timegm(parsed)
                return datetime.datetime.fromtimestamp(epoch, tz=datetime.timezone.utc)
            except Exception:
                pass
    raw = getattr(entry, "published", "") or getattr(entry, "pubDate", "")
    if raw:
        try:
            dt = email.utils.parsedate_to_datetime(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            return dt.astimezone(datetime.timezone.utc)
        except Exception:
            pass
    return None

def is_excluded(title: str, summary: str = "") -> bool:
    """Checks whether an article falls into excluded categories (sports, showbiz, gossip)."""
    text = (title + " " + summary).lower()
    for kw in EXCLUSION_KEYWORDS:
        kw_clean = kw.strip().lower()
        if not kw_clean:
            continue
        if re.match(r'^[a-zA-Z0-9\s]+$', kw_clean):
            pattern = r'\b' + re.escape(kw_clean) + r'\b'
        else:
            pattern = r'(?:^|[^\wঀ-৿])' + re.escape(kw_clean) + r'(?:$|[^\wঀ-৿])'
        if re.search(pattern, text):
            return True
    return False

def clean_html_tags(raw_html: str) -> str:
    """Strips HTML tags and extra whitespaces."""
    if not raw_html:
        return ""
    clean = re.sub(r"<[^>]+>", " ", raw_html)
    return " ".join(clean.split())

def fetch_section_candidates() -> List[RawArticle]:
    """Fetches candidate articles from outlet front pages (for sources without working RSS)."""
    candidates: List[RawArticle] = []

    for sec in SECTION_TARGETS:
        health = {"status": "error", "entries": 0, "fresh_24h": 0}
        LAST_FETCH_HEALTH[sec["name"]] = health
        try:
            print(f"🌐 Crawling front page for {sec['name']} ({sec['url']})...")
            resp = requests.get(sec["url"], headers=DEFAULT_HEADERS, timeout=FETCH_TIMEOUT_SECONDS)
            if resp.status_code != 200:
                health["status"] = f"http_{resp.status_code}"
                print(f"   ⚠️ {sec['name']} returned HTTP {resp.status_code}")
                continue

            soup = BeautifulSoup(resp.content, "html.parser")
            link_re = re.compile(sec["link_pattern"])
            seen_links: Set[str] = set()
            # Front pages list the newest stories and expose no timestamps,
            # so the crawl time stands in for the publication time.
            crawled_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                title = " ".join(a.get_text().split())
                full_url = href if href.startswith("http") else f"{sec['base_url']}{href}"
                if len(title) <= 25 or full_url in seen_links or not link_re.search(full_url):
                    continue
                seen_links.add(full_url)
                if is_excluded(title):
                    continue
                candidates.append(RawArticle(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, full_url)),
                    source=sec["name"],
                    url=full_url,
                    title=title,
                    summary_raw=title,
                    published_at=crawled_at,
                    language=sec["language"],
                    category_hint=sec["category_hint"]
                ))
                if len(seen_links) >= MAX_PER_SECTION:
                    break

            health["entries"] = len(seen_links)
            health["fresh_24h"] = len(seen_links)
            health["status"] = "ok" if seen_links else "empty"
            print(f"   Found {len(seen_links)} article links on {sec['name']}")

        except Exception as e:
            health["status"] = f"error_{type(e).__name__}"
            print(f"⚠️ Error crawling front page {sec['name']}: {e}")

    return candidates

def fetch_rss_candidates(max_age_hours: Optional[float] = None) -> List[RawArticle]:
    """
    Fetches candidate articles from all RSS feeds and front-page targets.
    If max_age_hours is set (e.g. 3.0 for live hourly wires), strictly filters out older news.
    Records per-source results in LAST_FETCH_HEALTH.
    """
    candidates: List[RawArticle] = []
    seen_urls: Set[str] = set()
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    LAST_FETCH_HEALTH.clear()

    # 1. Fetch from live RSS feeds
    for feed_key, feed_meta in FEEDS.items():
        health = {"status": "error", "entries": 0, "fresh_24h": 0}
        LAST_FETCH_HEALTH[feed_meta["name"]] = health
        try:
            print(f"📡 Fetching RSS from {feed_meta['name']} ({feed_meta['url']})...")
            resp = requests.get(feed_meta["url"], headers=DEFAULT_HEADERS, timeout=FETCH_TIMEOUT_SECONDS)
            if resp.status_code != 200:
                health["status"] = f"http_{resp.status_code}"
                print(f"   ⚠️ {feed_meta['name']} returned HTTP {resp.status_code}")
                continue
            parsed = feedparser.parse(resp.content)
            entries = parsed.entries or []
            print(f"   Found {len(entries)} entries in {feed_meta['name']}")

            # Health is measured on the whole feed, independent of this run's freshness window.
            health["entries"] = len(entries)
            health["fresh_24h"] = sum(
                1 for d in (parse_entry_datetime(e) for e in entries)
                if d and -0.5 <= (now_utc - d).total_seconds() / 3600.0 <= 24.0
            )
            health["status"] = "ok" if entries else "empty"

            feed_added = 0

            for entry in entries:
                if feed_added >= MAX_PER_FEED:
                    break

                title = clean_html_tags(getattr(entry, "title", "")).strip()
                link = getattr(entry, "link", "").strip()
                summary = clean_html_tags(getattr(entry, "summary", "") or getattr(entry, "description", ""))
                published = getattr(entry, "published", "") or getattr(entry, "pubDate", "")

                if not title or not link or link in seen_urls:
                    continue

                pub_dt = parse_entry_datetime(entry)

                # Strict Freshness Filter for Live Hourly Wires.
                # An entry with no readable date cannot be shown to be fresh, so it is dropped.
                if max_age_hours is not None:
                    if not pub_dt:
                        continue
                    age_hours = (now_utc - pub_dt).total_seconds() / 3600.0
                    if age_hours > max_age_hours or age_hours < -0.5:
                        continue

                # Filter out sports, entertainment, horoscope, petty crime
                if is_excluded(title, summary):
                    continue

                # Check for photo galleries and videos
                if any(x in link for x in ["/photo/", "/videos/", "/video/", "/gallery/"]):
                    continue

                seen_urls.add(link)
                article_id = str(uuid.uuid5(uuid.NAMESPACE_URL, link))

                # Standardize publication timestamp to ISO 8601 UTC
                clean_published_at = (
                    pub_dt.isoformat()
                    if pub_dt
                    else (published or now_utc.isoformat())
                )

                article = RawArticle(
                    id=article_id,
                    source=feed_meta["name"],
                    url=link,
                    title=title,
                    summary_raw=summary,
                    published_at=clean_published_at,
                    language=feed_meta["language"],
                    category_hint=getattr(entry, "category", None) or feed_meta.get("category_hint"),
                    region=feed_meta.get("region", "national")
                )
                candidates.append(article)
                feed_added += 1

        except Exception as e:
            health["status"] = f"error_{type(e).__name__}"
            print(f"⚠️ Error fetching feed {feed_key}: {e}")

    # 2. Fetch from outlet front pages (Financial Express, BSS).
    # Front-page links are the outlet's current lead stories; repeats across runs
    # are absorbed by the cross-run memory in run_pipeline.
    for sc in fetch_section_candidates():
        if sc.url not in seen_urls:
            seen_urls.add(sc.url)
            candidates.append(sc)

    print(f"✅ Total clean candidate articles fetched across all sources: {len(candidates)}")
    return candidates
