import os
import sys
import re
import json
import argparse
from datetime import datetime

# Ensure utf-8 output encoding for Bengali and emoji on Windows
if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

from pipeline.collectors import rss_fetcher
from pipeline.collectors.rss_fetcher import fetch_rss_candidates
from pipeline.source_health import record_fetch_health
from pipeline.collectors.article_scraper import scrape_article_body, scrape_article_details
from pipeline.collectors.unsplash_service import fetch_story_image
from pipeline.processing.deduplicator import cluster_and_tag_articles, extract_canonical_entities
from pipeline.processing.selector import select_stories_for_audiences
from pipeline.processing.news_desk import build_desk_events
from pipeline.processing.fact_check import fact_check_stories
from pipeline.processing.synthesizer import synthesize_story_with_ai, build_clean_sources
from pipeline.models import DailyCapsule, CapsuleStory
from pipeline.storage.firebase_service import (
    push_hourly_buzz_to_firestore,
    stage_bcs_pro_draft_to_firestore,
    publish_bcs_pro_edition,
    get_recent_published_stories,
    enrich_story_in_firestore
)

def run_hourly_buzz(limit: int = 8):
    """
    Track A: Fast Hourly Path (Automated).
    Ingests latest breaking news across BD and Tech, generates 60-second bilingual summaries,
    and updates the hourly feed for general users.
    """
    now = datetime.now()
    timestamp_str = now.strftime("%Y-%m-%d %H:%M")
    print(f"\n========================================================")
    print(f"⚡ DORPON DAILY HOURLY INGESTION: {timestamp_str}")
    print(f"========================================================")
    
    # 1. Fetch fresh candidate articles (progressively widening window if needed)
    candidates = fetch_rss_candidates(max_age_hours=3.0)
    if not candidates or len(candidates) < limit:
        print("⚠️ Candidates pool small in 3h window, expanding to 6 hours...")
        candidates = fetch_rss_candidates(max_age_hours=6.0)
    if not candidates or len(candidates) < limit:
        print("⚠️ Candidates pool small in 6h window, expanding to 12 hours...")
        candidates = fetch_rss_candidates(max_age_hours=12.0)
    silent = record_fetch_health(rss_fetcher.LAST_FETCH_HEALTH)
    if silent:
        print(f"⚠️ Silent sources (no fresh article in 24h+): {', '.join(silent)}")

    if not candidates:
        print("❌ No fresh articles fetched. Exiting.")
        return None

    # 2. Cross-Run Memory (loaded first: the news desk needs it to spot repeats)
    print(f"\n🧠 Loading historical event memory from past 30 hours...")
    historical_stories = get_recent_published_stories(limit=100, max_age_hours=30.0)
    print(f"   Loaded {len(historical_stories)} recent published stories for cross-run deduplication.")

    # AI news desk groups, ranks and de-duplicates events; keyword clustering is the fallback
    print("\nAI news desk: grouping and ranking events...")
    clusters = build_desk_events(candidates, historical_stories)
    if clusters is not None:
        multi = sum(1 for c in clusters if c.desk["outlets"] > 1)
        print(f"   Desk selected {len(clusters)} events ({multi} carried by more than one outlet).")
        for c in clusters[:12]:
            d = c.desk
            print(f"   {c.rank_score:5.2f} | imp {d['importance']:.0f} | {d['outlets']} outlets"
                  f"{' | trending' if d['trending'] else ''} | {c.region} | {c.primary_title[:60]}")
    else:
        print("   Falling back to keyword clustering...")
        clusters = cluster_and_tag_articles(candidates)
        print(f"   Generated {len(clusters)} unique event clusters.")

    def extract_clean_tokens(text: str) -> set:
        words = re.findall(r"[\w\u0980-\u09FF]{3,}", text.lower())
        stopwords = {
            "the", "and", "for", "with", "from", "that", "this", "news", "daily", "dorpon",
            "bangladesh", "latest", "update", "এবং", "থেকে", "করে", "হয়েছে", "হবে", "হয়", "জন্য",
            "হিসেবে", "নিয়ে", "পর", "বলা", "বলে", "সব", "এক", "দুই", "করা", "হতে", "তার", "তাদের",
            "dhaka", "today", "report", "breaking", "update"
        }
        return {w for w in words if w not in stopwords}

    def find_matching_historical_story(cluster, history_list):
        cluster_text = f"{cluster.primary_title} {' '.join(a.title for a in cluster.articles)}"
        c_tokens = extract_clean_tokens(cluster_text)
        c_ents = cluster.canonical_entities

        for hist in history_list:
            h_daily = hist.get("daily_buzz") or {}
            # Match specifically against historical headlines, NOT the entire 50-token payload with tags
            h_text = f"{h_daily.get('title_en', '')} {h_daily.get('title_bn', '')}"
            h_tokens = extract_clean_tokens(h_text)
            h_ents = extract_canonical_entities(h_text)

            # 1. High-signal entity signatures
            # Tarique + Japan
            tarique_terms = {"tarique", "তারেক", "রহমান"}
            japan_terms = {"japan", "জাপান", "টোকিও"}
            if (c_tokens & tarique_terms) and (c_tokens & japan_terms) and (h_tokens & tarique_terms) and (h_tokens & japan_terms):
                return hist

            # Ishraque + Resignation
            ishraque_terms = {"ishraque", "ইশরাক"}
            resignation_terms = {"resignation", "পদত্যাগ", "পদ", "bnp", "বিএনপি"}
            if (c_tokens & ishraque_terms) and (c_tokens & resignation_terms) and (h_tokens & ishraque_terms) and (h_tokens & resignation_terms):
                return hist

            # Pete Hegseth + Israel
            hegseth_terms = {"hegseth", "হেগসেথ"}
            israel_terms = {"israel", "ইসরায়েল", "ইসরাইল"}
            if (c_tokens & hegseth_terms) and (c_tokens & israel_terms) and (h_tokens & hegseth_terms) and (h_tokens & israel_terms):
                return hist

            # 2. Canonical entity overlap with specific content match
            specific_overlap = (c_ents & h_ents) - GENERIC_THEMATIC_ENTITIES
            if specific_overlap:
                overlap_tokens = c_tokens & h_tokens
                if len(overlap_tokens) >= 3 and len(c_tokens) > 0 and (len(overlap_tokens) / len(c_tokens) >= 0.45):
                    return hist

            # 3. High Jaccard token overlap on titles
            if c_tokens and h_tokens:
                intersection = c_tokens & h_tokens
                union = c_tokens | h_tokens
                if union and (len(intersection) / len(union) >= 0.50):
                    return hist
                if len(c_tokens) >= 4 and (len(intersection) / len(c_tokens) >= 0.60):
                    return hist

        return None

    # 5. Synthesize 60-second Daily Buzz summaries with Multi-Category Section Filling
    # AND National vs International Slot Reservation to protect Bangladesh domestic coverage:
    # - Min ~65% reserved strictly for Bangladesh governance, politics, and national economy.
    # - Max ~35% allocated for categorized international affairs (world, tech, global economy, climate).
    print(f"\n🤖 Generating 60-second Daily Buzz summaries (diverse sections with regional balance)...")
    buzz_stories = []
    pending_checks = []  # (story, source articles) awaiting the batched fact-check
    seen_entities = set()
    seen_story_tokens = []
    category_counts = {}
    MAX_PER_CATEGORY = 2  # Cap per category so no single topic monopolizes the hourly feed
    GENERIC_THEMATIC_ENTITIES = {"interim_cabinet", "bnp_politics", "election_commission", "anti_corruption"}

    def get_category_cap(cat: str) -> int:
        # Strictly limit sports and pop-culture to at most 1 slot so serious news dominates
        if cat in {"sports_fitness", "pop_culture"}:
            return 1
        return MAX_PER_CATEGORY

    max_intl_slots = max(1, int(limit * 0.35))
    min_national_slots = max(1, limit - max_intl_slots)
    national_count = 0
    intl_count = 0

    print(f"   📊 Slot Reservation: Min {min_national_slots} National (~{int(min_national_slots/limit*100)}%), Max {max_intl_slots} International (~{int(max_intl_slots/limit*100)}%)")

    def process_and_add_cluster(cluster) -> bool:
        nonlocal national_count, intl_count
        primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "world_diplomacy"

        # Check against historical coverage across previous hourly runs
        # Desk events carry the editor's own match; keyword clusters use token matching.
        from_desk = hasattr(cluster, "desk")
        if from_desk:
            matched_hist = cluster.published_match
        else:
            matched_hist = find_matching_historical_story(cluster, historical_stories)
        if matched_hist:
            hist_id = matched_hist.get("story_id")
            new_sources = build_clean_sources(cluster.articles)
            print(f"   🔄 Story already covered: '{cluster.primary_title[:50]}'")
            print(f"      Enriching existing story [{hist_id}] with new sources: {[s.get('name') for s in new_sources]}")
            enrich_story_in_firestore(hist_id, new_sources)
            return False

        # Check topic repetition against stories already selected in THIS current run
        specific_entities = cluster.canonical_entities - GENERIC_THEMATIC_ENTITIES
        # The desk already merged same-event reports, so the two in-batch checks
        # below apply to keyword clusters only.
        if not from_desk and specific_entities and specific_entities.intersection(seen_entities):
            print(f"   ⏩ Skipping duplicate topic in current batch: {cluster.primary_title[:50]} (entity: {specific_entities})")
            return False
            
        # Title token similarity check within current batch (normalized Jaccard)
        art_tokens = extract_clean_tokens(cluster.primary_title)
        is_duplicate = False
        for prev_tokens in seen_story_tokens:
            inter = art_tokens & prev_tokens
            uni = art_tokens | prev_tokens
            jaccard = len(inter) / max(len(uni), 1)
            if jaccard >= 0.50 or (len(art_tokens) >= 4 and len(inter) / len(art_tokens) >= 0.65):
                is_duplicate = True
                break
        if is_duplicate and not from_desk:
            print(f"   ⏩ Skipping title-duplicate cluster in current batch: {cluster.primary_title[:50]}")
            return False

        # Scrape full body and lead image only for selected stories
        primary_art = cluster.articles[0]
        if not primary_art.body_text or not primary_art.image_url:
            print(f"   📖 Scraping article details for selected story: {primary_art.title[:45]}...")
            details = scrape_article_details(primary_art.url)
            if details.get("body_text"):
                primary_art.body_text = details["body_text"]
            if details.get("image_url") and not primary_art.image_url:
                primary_art.image_url = details["image_url"]

        # Written by Gemini or not at all: no heuristic text reaches the site.
        story = synthesize_story_with_ai(cluster, is_bcs_pro=False, allow_heuristic_fallback=False)
        if not story:
            print(f"   🚫 Story rejected or excluded: {primary_art.title[:50]}")
            return False

        # ── Unsplash image enrichment ──────────────────────────────────────
        if not story.image_url:
            headline_en = (story.daily_buzz.title_en or primary_art.title) if story.daily_buzz else primary_art.title
            headline_bn = (story.daily_buzz.title_bn or "") if story.daily_buzz else ""
            story_cat = story.primary_category or primary_cat
            unsplash_url = fetch_story_image(
                headline_en=headline_en,
                headline_bn=headline_bn,
                category=story_cat,
                existing_image_url=None,
            )
            if unsplash_url:
                story.image_url = unsplash_url
        # ───────────────────────────────────────────────────────────────────

        item = story.model_dump()
        item.pop("bcs_pro", None)  # Lightweight payload for free buzz
        if from_desk:
            item["importance_score"] = cluster.importance_score
            item["rank_score"] = cluster.rank_score
            item["region"] = cluster.region
            item["outlet_count"] = cluster.desk["outlets"]
            item["trending"] = cluster.desk["trending"]
        buzz_stories.append(item)
        pending_checks.append((story, cluster.articles))
        historical_stories.append(item)  # Add to memory for remaining clusters
        category_counts[story.primary_category] = category_counts.get(story.primary_category, 0) + 1

        reg = getattr(cluster, "region", "national")
        if reg == "international":
            intl_count += 1
        else:
            national_count += 1

        if specific_entities:
            seen_entities.update(specific_entities)
        seen_story_tokens.append(art_tokens)
        return True

    # Pass 1: National Priority (fill reserved national quota with diverse sections)
    for cluster in clusters:
        if len(buzz_stories) >= limit or national_count >= min_national_slots:
            break
        if getattr(cluster, "region", "national") != "national":
            continue
        primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "governance_law"
        if category_counts.get(primary_cat, 0) >= get_category_cap(primary_cat):
            continue
        if any(s.get("story_id") == cluster.cluster_id for s in buzz_stories):
            continue
        process_and_add_cluster(cluster)

    # Pass 2: International Categorized (fill up to international slot quota across world/tech/economy/climate)
    for cluster in clusters:
        if len(buzz_stories) >= limit or intl_count >= max_intl_slots:
            break
        if getattr(cluster, "region", "national") != "international":
            continue
        primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "world_diplomacy"
        if category_counts.get(primary_cat, 0) >= get_category_cap(primary_cat):
            continue
        if any(s.get("story_id") == cluster.cluster_id for s in buzz_stories):
            continue
        process_and_add_cluster(cluster)

    # Pass 3: Diverse Fill (fill remaining quota respecting category caps)
    if len(buzz_stories) < limit:
        for cluster in clusters:
            if len(buzz_stories) >= limit:
                break
            if any(s.get("story_id") == cluster.cluster_id for s in buzz_stories):
                continue
            reg = getattr(cluster, "region", "national")
            if reg == "international" and intl_count >= max_intl_slots + 1:
                continue
            primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "world_diplomacy"
            if category_counts.get(primary_cat, 0) >= get_category_cap(primary_cat):
                continue
            process_and_add_cluster(cluster)

    # Pass 4: Final Quota Guarantee (fill any remaining slots without strict category cap)
    if len(buzz_stories) < limit:
        for cluster in clusters:
            if len(buzz_stories) >= limit:
                break
            if any(s.get("story_id") == cluster.cluster_id for s in buzz_stories):
                continue
            primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "world_diplomacy"
            if primary_cat in {"sports_fitness", "pop_culture"} and category_counts.get(primary_cat, 0) >= 1:
                continue
            process_and_add_cluster(cluster)
        
    # Fact-check every written story against its sources in ONE call (quota-friendly).
    # A failed story is not published; being absent from the site's memory, it is
    # reconsidered and rewritten on the next run.
    if buzz_stories:
        print(f"\nFact-checking {len(buzz_stories)} stories against their sources...")
        checks = fact_check_stories(pending_checks)
        verified = []
        for item, (story, _arts), check in zip(buzz_stories, pending_checks, checks):
            headline = (item.get("daily_buzz") or {}).get("title_en", "")[:60]
            if check["status"] == "failed":
                print(f"   FAILED, not published: {headline}")
                for issue in check["issues"][:3]:
                    print(f"      - {issue['field']}: {issue['claim'][:90]} ({issue['why'][:70]})")
                continue
            trimmed = " (unsupported background removed)" if check["issues"] else ""
            print(f"   {check['status']}{trimmed}: {headline}")
            item["daily_buzz"] = story.daily_buzz.model_dump()
            item["fact_check"] = {"status": check["status"], "checked_at": check["checked_at"]}
            verified.append(item)
        buzz_stories = verified

    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "output")
    os.makedirs(output_dir, exist_ok=True)
    hourly_path = os.path.join(output_dir, "hourly_buzz_latest.json")
    
    payload = {
        "updated_at": now.isoformat(),
        "total_stories": len(buzz_stories),
        "stories": buzz_stories
    }
    
    with open(hourly_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    print(f"\n💾 Saved {len(buzz_stories)} hourly buzz stories to: {hourly_path}")

    # Step 5: Sync directly to Cloud Firestore 'daily_buzz' collection
    try:
        pushed = push_hourly_buzz_to_firestore(buzz_stories)
        print(f"🔥 Successfully synced {pushed} stories to Firestore 'daily_buzz' collection!")
    except Exception as e:
        print(f"⚠️ Warning: Could not sync to Firestore ({e})")

    print(f"========================================================")
    print(f"✅ HOURLY BUZZ UPDATE COMPLETE")
    print(f"========================================================\n")
    return payload

def run_daily_pipeline(bcs_count: int = 4, pool_count: int = 8) -> DailyCapsule:
    """
    Track B: BCS Pro Academic Layer (Civilsdaily Standard).
    Produces the curated 7-section Civilsdaily draft awaiting human editor approval.
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n========================================================")
    print(f"🌅 DORPON DAILY ACADEMIC PIPELINE: {today_str}")
    print(f"========================================================")
    
    # Step 1: Fetch candidate articles from RSS + Sections
    candidates = fetch_rss_candidates()
    if not candidates:
        print("❌ No candidate articles fetched. Exiting.")
        return None
        
    # Step 2: Cluster, deduplicate, and compute BCS relevance
    print(f"\n🔍 Clustering events with bilingual entity co-occurrence & scoring BPSC relevance...")
    clusters = cluster_and_tag_articles(candidates)
    print(f"   Generated {len(clusters)} unique event clusters.")
    
    # Step 3: Audience Selection (BCS Pro Preset vs Daily Buzz Interest Pool)
    print(f"\n🎯 Routing stories for audiences:")
    bcs_clusters, pool_clusters = select_stories_for_audiences(
        clusters, bcs_limit=bcs_count, total_pool_limit=pool_count
    )
    bcs_ids = {c.cluster_id for c in bcs_clusters}
    print(f"   ⭐️ Selected {len(bcs_clusters)} stories for BCS Pro Academic Preset")
    print(f"   📰 Selected {len(pool_clusters)} stories for Daily Buzz Interest Pool")
    
    # Step 4: Scrape bodies and lead images ONLY for selected stories
    print(f"\n📖 Scraping full bodies and lead images for selected audience pool...")
    for cluster in pool_clusters:
        primary_art = cluster.articles[0]
        if not primary_art.body_text or not primary_art.image_url:
            details = scrape_article_details(primary_art.url)
            if details.get("body_text"):
                primary_art.body_text = details["body_text"]
            if details.get("image_url") and not primary_art.image_url:
                primary_art.image_url = details["image_url"]

    # Step 5: Synthesize bilingual outputs (Civilsdaily 7-Section Blueprint)
    print(f"\n🤖 Synthesizing Bilingual Civilsdaily Blueprints (Daily Buzz + BCS Pro layers)...")
    stories: list[CapsuleStory] = []
    
    for cluster in pool_clusters:
        is_bcs = cluster.cluster_id in bcs_ids
        story = synthesize_story_with_ai(cluster, is_bcs_pro=is_bcs)

        # ── Unsplash image enrichment ──────────────────────────────────────
        if not story.image_url:
            primary_art = cluster.articles[0]
            headline_en = (story.daily_buzz.title_en or primary_art.title) if story.daily_buzz else primary_art.title
            headline_bn = (story.daily_buzz.title_bn or "") if story.daily_buzz else ""
            primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "governance_law"
            unsplash_url = fetch_story_image(
                headline_en=headline_en,
                headline_bn=headline_bn,
                category=primary_cat,
                existing_image_url=None,
            )
            if unsplash_url:
                story.image_url = unsplash_url
        # ───────────────────────────────────────────────────────────────────

        stories.append(story)
        
    capsule = DailyCapsule(
        edition_date=today_str,
        created_at=datetime.now().isoformat(),
        status="PENDING_REVIEW",
        bcs_pro_preset_story_ids=list(bcs_ids),
        stories=stories,
        total_stories=len(stories),
        review_notes="Automated draft generated. Awaiting human editor approval before broadcast."
    )
    
    # Step 6: Persist Capsule
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "output")
    os.makedirs(output_dir, exist_ok=True)
    
    capsule_dict = capsule.model_dump()
    latest_path = os.path.join(output_dir, "capsule_latest.json")
    dated_path = os.path.join(output_dir, f"capsule_{today_str}.json")
    
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(capsule_dict, f, ensure_ascii=False, indent=2)
        
    with open(dated_path, "w", encoding="utf-8") as f:
        json.dump(capsule_dict, f, ensure_ascii=False, indent=2)
        
    print(f"\n💾 Saved Daily Capsule to: {latest_path}")

    # Step 7: Stage in Firestore 'bcs_pro_drafts'
    try:
        edition_id = stage_bcs_pro_draft_to_firestore(capsule)
        print(f"🔥 Staged BCS Pro Civilsdaily draft in Firestore 'bcs_pro_drafts/{edition_id}' (Status: PENDING_REVIEW)")
    except Exception as e:
        print(f"⚠️ Warning: Could not stage draft to Firestore ({e})")

    print(f"========================================================")
    print(f"🎉 PIPELINE RUN COMPLETE: Status is PENDING_REVIEW")
    print(f"========================================================\n")
    return capsule

def approve_draft():
    """Human-in-the-Loop: Marks the current draft as PUBLISHED."""
    latest_path = os.path.join(os.path.dirname(__file__), "..", "data", "output", "capsule_latest.json")
    if not os.path.exists(latest_path):
        print("❌ No draft found to approve.")
        return
    with open(latest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["status"] = "PUBLISHED"
    data["review_notes"] = f"Approved by editor on {datetime.now().isoformat()}"
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ Approved and published draft: {data.get('edition_date')}")

    # Publish to Firestore 'bcs_pro_published' and update 'latest' pointer
    edition_date = data.get("edition_date")
    if edition_date:
        try:
            publish_bcs_pro_edition(edition_date)
            print(f"🔥 Published edition to Firestore 'bcs_pro_published' (Archived & 'latest' live pointer updated)")
        except Exception as e:
            print(f"⚠️ Warning: Could not publish to Firestore ({e})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dorpon Daily Pipeline Orchestrator")
    parser.add_argument("--mode", choices=["all", "hourly", "bcs-draft", "approve"], default="all",
                        help="Mode to run: 'hourly' for fast Daily Buzz, 'bcs-draft' for morning BCS capsule, 'approve' to publish")
    parser.add_argument("--bcs-count", type=int, default=4, help="Number of BCS Pro stories to select (default: 4)")
    parser.add_argument("--pool-count", type=int, default=8, help="Number of total stories in pool (default: 8)")
    args = parser.parse_args()
    
    if args.mode == "hourly":
        run_hourly_buzz(limit=args.pool_count)
    elif args.mode == "bcs-draft":
        run_daily_pipeline(bcs_count=args.bcs_count, pool_count=args.pool_count)
    elif args.mode == "approve":
        approve_draft()
    else:
        run_daily_pipeline(bcs_count=args.bcs_count, pool_count=args.pool_count)
