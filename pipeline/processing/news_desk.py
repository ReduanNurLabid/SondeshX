"""
AI news desk.

One Gemini call reads every fresh headline and does the work the keyword rules
could not: it groups reports of the same real-world event across outlets and
languages, judges how much each event matters to a mainstream reader in
Bangladesh, and recognises events the site has already published.

The final rank combines that judgement with two measurable signals: how many
independent outlets carry the event, and whether it appears in Google News
Bangladesh top stories.
"""
from typing import Dict, List, Optional
from urllib.parse import urlparse

import feedparser
import requests

from pipeline.config import (
    DEFAULT_HEADERS,
    DESK_MAX_ARTICLES,
    DESK_MIN_IMPORTANCE,
    INTEREST_CATEGORIES,
    TRENDING_SIGNAL_FEEDS,
)
from pipeline.models import RawArticle
from pipeline.processing.deduplicator import (
    ClusteredEvent,
    calculate_bcs_relevance,
    categorize_article,
    extract_canonical_entities,
)
from pipeline.processing.llm import generate_json
from pipeline.config import source_trust
from pipeline.processing.scoring import compute_time_decayed_score

# Editorial score (1-10) = the desk's importance judgement plus measurable signals.
BD_OUTLET_BONUS_PER_EXTRA = 0.25  # each additional Bangladeshi outlet carrying the event
BD_OUTLET_BONUS_CAP = 3           # ...counted up to three extra outlets (max +0.75)
TRENDING_BONUS = 0.5              # in Google News Bangladesh top stories
MAX_SIGNAL_BONUS = 1.0            # signals can lift the desk's judgement by at most one point


def outlet_key(article: RawArticle) -> str:
    """Publisher identity by domain, so two sections of one paper count once."""
    host = urlparse(article.url).netloc.lower()
    for prefix in ("www.", "en.", "bangla.", "feeds."):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host or article.source


def fetch_trending_titles(per_feed: int = 20) -> List[str]:
    """Headlines currently leading Google News Bangladesh. Empty list on failure."""
    titles: List[str] = []
    for url in TRENDING_SIGNAL_FEEDS:
        try:
            resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
            if resp.status_code != 200:
                continue
            for entry in feedparser.parse(resp.content).entries[:per_feed]:
                title = (getattr(entry, "title", "") or "").strip()
                if title:
                    titles.append(title)
        except Exception as err:
            print(f"⚠️ Trending signal fetch failed ({url[:40]}...): {err}")
    return titles


def _build_prompt(articles: List[RawArticle], trending: List[str], published: List[dict]) -> str:
    article_lines = []
    for i, art in enumerate(articles, 1):
        summary = (art.summary_raw or "").strip()
        extra = f" | {summary[:140]}" if summary and summary != art.title else ""
        tier = source_trust(art.source)
        mark = " · unverified outlet" if tier == 3 else ""
        article_lines.append(f"[{i}] ({art.source}{mark}) {art.title}{extra}")

    trending_lines = [f"- {t}" for t in trending] or ["(none available)"]

    published_lines = []
    for i, story in enumerate(published, 1):
        buzz = story.get("daily_buzz") or {}
        score = story.get("desk_importance")
        tag = f" [score {score:g}]" if isinstance(score, (int, float)) else ""
        published_lines.append(f"P{i}{tag}: {buzz.get('title_en', '')} / {buzz.get('title_bn', '')}")
    if not published_lines:
        published_lines = ["(none)"]

    categories = ", ".join(INTEREST_CATEGORIES.keys())

    return f"""You are the news desk editor of a mainstream Bangladeshi news service. Readers come to learn quickly what matters in Bangladesh and the world right now.

ARTICLES (fresh reports from many outlets, in Bengali and English):
{chr(10).join(article_lines)}

TRENDING (headlines leading Google News Bangladesh right now):
{chr(10).join(trending_lines)}

PUBLISHED (stories already on our site in the last day):
{chr(10).join(published_lines)}

TASKS
1. Group ARTICLES into events. Two articles belong to the same event only when they report the same specific occurrence (same actors, same action, same time). The same topic is not the same event. Match across Bengali and English.
2. Leave out articles that are not news a mainstream reader needs: sports fixtures and routine match reports, celebrity and lifestyle items, product deals, horoscopes, opinion columns, minor local incidents with no wider significance, and individual crimes or disputes that matter only to the people involved.
   Reports marked "unverified outlet" are less reliable: do not raise an event's importance because of them, and treat sensational claims that only they report with scepticism.
3. Score each event's importance from 1 to 10 for a general reader in Bangladesh. Use the whole scale; do not cluster everything around 6-8.
   10: a national turning point that will lead every outlet for days (election result, change of government, major disaster with many deaths).
   9: a decision or event that changes daily life for most Bangladeshis now (fuel or electricity price change, nationwide shutdown, budget, major court verdict on national politics).
   8: the day's leading national story: big policy decisions, major economic data, serious unrest, deadly incidents with national impact.
   7: important national news affecting many people: a sector-wide decision, a significant court ruling, a major outbreak update, a large protest.
   6: notable national news, or a world event of the first rank.
   5: ordinary national news worth knowing: a ministry announcement, a project update, a sizeable local incident; significant world, business or tech news.
   4: routine statements, ceremonies, meetings, minor local crime, most foreign news.
   3 or less: trivia, repetition, minor foreign items.
   Limits:
   - At most two events in this batch may score 8 or more, and only if they truly lead the national news today.
   - An event outside Bangladesh scores at most 6 unless it directly affects Bangladesh or Bangladeshis (migrant workers, trade, fuel and food prices, the region's security).
   - Sport and entertainment score at most 5, unless the Bangladesh national team wins or loses a major final.
   - Being new, or appearing in TRENDING, does not by itself make an event more important. Judge the consequence for people, not the noise.
   - Score consistently with the PUBLISHED stories: their current scores are shown in brackets.
4. region: "national" if the event happens in Bangladesh or directly involves Bangladesh, otherwise "international".
5. category: one of {categories}.
6. trending: true if the event matches a TRENDING headline.
7. published: the P-number (integer) of a PUBLISHED story covering the same event with nothing substantially new, otherwise null.
8. appeal: 1 to 10, how likely an ordinary Bangladeshi scrolling Facebook is to stop, watch a short video about this and share it.
   High: prices of food, fuel, electricity or gas; jobs and wages; exams, admissions and results; holidays; transport, roads and flights; weather and disasters; public safety; health risks such as dengue; major national politics.
   Low: ceremonial meetings, routine statements, technical policy, minor foreign news.
   Judge appeal separately from importance: an important but dry story can have low appeal.

Return JSON only:
{{"events": [{{"articles": [1, 7], "importance": 8, "region": "national", "category": "governance_law", "trending": true, "published": null, "appeal": 7}}]}}

Each article number may appear in at most one event."""


def _as_int_list(value) -> List[int]:
    """Article numbers as ints, tolerating replies like ["[3]", "7"] or a bare number."""
    if not isinstance(value, list):
        value = [value]
    numbers = []
    for item in value:
        if isinstance(item, bool):
            continue
        if isinstance(item, int):
            numbers.append(item)
        elif isinstance(item, (str, float)):
            digits = "".join(ch for ch in str(item).split(".")[0] if ch.isdigit())
            if digits:
                numbers.append(int(digits))
    return numbers


def _order_articles(articles: List[RawArticle]) -> List[RawArticle]:
    """Lead with the most trusted outlet, then the report with the fullest text.
    The lead article supplies the body the story is written from and is cited first."""
    def key(art: RawArticle):
        summary = art.summary_raw or ""
        richness = len(summary) if summary != art.title else 0
        return (source_trust(art.source), -richness)
    return sorted(articles, key=key)


def build_desk_events(
    candidates: List[RawArticle],
    published: List[dict],
) -> Optional[List[ClusteredEvent]]:
    """
    Returns ranked events, most important first, or None when the desk call
    fails so the caller can fall back to keyword clustering.
    Each event carries `desk` (the editor's judgement) and `published_match`.
    """
    articles = candidates[:DESK_MAX_ARTICLES]
    published = published[:40]
    trending = fetch_trending_titles()

    try:
        reply = generate_json(_build_prompt(articles, trending, published), temperature=0.1)
    except Exception as err:
        print(f"⚠️ AI news desk unavailable: {err}")
        return None

    raw_events = reply.get("events") if isinstance(reply, dict) else None
    if not isinstance(raw_events, list) or not raw_events:
        print("⚠️ AI news desk returned no usable events.")
        return None

    events: List[ClusteredEvent] = []
    used: set = set()
    dropped = {"no valid article numbers": 0, "below importance threshold": 0,
               "only low-trust sources": 0, "single tier-2 source, minor": 0}

    for raw in raw_events:
        if not isinstance(raw, dict):
            continue
        ids = []
        for n in _as_int_list(raw.get("articles") or raw.get("article_ids") or raw.get("ids")):
            if 1 <= n <= len(articles) and n not in used and n not in ids:
                ids.append(n)
        if not ids:
            dropped["no valid article numbers"] += 1
            continue
        used.update(ids)

        try:
            importance = max(1.0, min(10.0, float(raw.get("importance", 1))))
        except (TypeError, ValueError):
            importance = 1.0
        if importance < DESK_MIN_IMPORTANCE:
            dropped["below importance threshold"] += 1
            continue

        members = _order_articles([articles[n - 1] for n in ids])

        # Trust rules: a story needs at least one acceptable outlet behind it, and a
        # story carried by a single tier-2 outlet only must be important enough.
        best_tier = source_trust(members[0].source)
        if best_tier >= 3:
            dropped["only low-trust sources"] += 1
            continue
        trusted_outlets = {outlet_key(a) for a in members if source_trust(a.source) <= 2}
        if best_tier == 2 and len(trusted_outlets) == 1 and importance < 6:
            dropped["single tier-2 source, minor"] += 1
            continue
        event = ClusteredEvent(members[0])
        event.articles = members

        combined = " ".join(f"{a.title} {a.summary_raw or ''}" for a in members)
        categories = categorize_article(combined, members[0].source, members[0].category_hint or "")
        desk_category = raw.get("category")
        if desk_category in INTEREST_CATEGORIES:
            categories = [desk_category] + [c for c in categories if c != desk_category]
        event.matched_categories = categories
        event.canonical_entities = extract_canonical_entities(combined)
        event.seed_entities = event.canonical_entities
        event.bcs_score = calculate_bcs_relevance(combined)
        event.region = "international" if raw.get("region") == "international" else "national"

        outlets = len({outlet_key(a) for a in members})
        # Only Bangladeshi outlets count as corroboration: several foreign feeds
        # repeating a foreign story says nothing about its weight for readers here.
        bd_outlets = len({outlet_key(a) for a in members
                          if (a.region or "national") == "national" and source_trust(a.source) <= 2})
        trending_hit = raw.get("trending") is True
        score = (
            importance
            + BD_OUTLET_BONUS_PER_EXTRA * min(max(bd_outlets - 1, 0), BD_OUTLET_BONUS_CAP)
            + (TRENDING_BONUS if trending_hit else 0.0)
        )
        # importance_score is the editorial score the site ranks and places by.
        event.importance_score = round(min(10.0, importance + MAX_SIGNAL_BONUS, score), 2)
        event.rank_score = compute_time_decayed_score(event.importance_score, members[0].published_at)
        try:
            appeal = max(1.0, min(10.0, float(raw.get("appeal", importance))))
        except (TypeError, ValueError):
            appeal = importance
        event.desk = {"importance": importance, "bd_outlets": bd_outlets, "outlets": outlets,
                      "trending": trending_hit, "appeal": appeal}

        match = raw.get("published")
        event.published_match = (
            published[match - 1] if isinstance(match, int) and 1 <= match <= len(published) else None
        )
        events.append(event)

    print(f"   Desk returned {len(raw_events)} events; kept {len(events)}, dropped {dropped}.")
    if not events:
        print(f"⚠️ AI news desk kept no events. First raw event: {str(raw_events[0])[:300]}")
        return None

    events.sort(key=lambda e: e.rank_score, reverse=True)
    return events
