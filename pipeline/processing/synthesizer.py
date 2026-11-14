import os
import json
import re
import time
import random
from typing import List, Optional
from pipeline.models import (
    CapsuleStory, DailyBuzzItem, BcsProItem, StatPoint,
    ConstitutionalCitation, WrittenExamPrompt, PyqReference,
    SyllabusMapping, QuestionBreakdown
)
from pipeline.processing.deduplicator import ClusteredEvent
from pipeline.constitution_kb import find_relevant_articles
from pipeline.config import INTEREST_CATEGORIES
from pipeline.processing.llm import generate_json, gemini_api_keys
from pipeline.processing.prompts import build_story_prompt
from pipeline.processing.fact_check import build_source_text

# Load seed PYQs
PYQS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "pyqs.json")

SPORTS_KEYWORDS = {
    "cricket", "football", "fifa", "bpl", "ipl", "bcb", "tamim", "shakib", "mashrafe", "mushfiqur", "sport", "sports",
    "ক্রিকেট", "ফুটবল", "বিসিবি", "তামিম", "সাকিব", "মাশরাফি", "মুশফিক", "খেলাধুলা"
}

ENTERTAINMENT_KEYWORDS = {
    "cinema", "movie", "ott", "bollywood", "hollywood", "dhallywood", "actor", "actress", "natok", "film",
    "সিনেমা", "চলচ্চিত্র", "নাটক", "অভিনেতা", "অভিনেত্রী", "বিনোদন"
}

def strip_relative_time_leakage(text: str) -> str:
    """
    Strips raw newspaper relative weekdays and temporal expressions
    (e.g., 'গত সোমবার', 'সোমবার সকালে', 'গতকাল', 'গত পরশু', 'yesterday', 'on Monday')
    so that summarized dispatches remain timeless and grounded.
    """
    if not text:
        return ""
    pats = [
        r"(?:গতকাল\s+)?(?:গত\s+)?(?:সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার)(?:\s+(?:সকালে|দুপুরে|বিকেলে|সন্ধ্যায়|রাতে))?\s*[,।]?\s*",
        # Whole words only: without the boundaries "আজ" also ate the start of names like আজাদ.
        r"(?<![ঀ-৿])(?:গতকাল|গত পরশু|আজকে|আজকের দিনে|আজ সকালে|আজ)(?![ঀ-৿])\s*[,।]?\s*",
        r"\b(?:on\s+)?(?:last\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(?:morning|afternoon|evening|night))?\s*,\s*",
        r"\b(?:yesterday|earlier today)\s*,\s*",
    ]
    cleaned = text
    for p in pats:
        cleaned = re.sub(p, "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[,।\-\–\s]+", "", cleaned)
    return cleaned.strip()

def clean_editorial_text(text: Optional[str]) -> str:
    """
    Sanitizes editorial text by stripping relative temporal markers,
    raw Markdown formatting asterisks/underscores (**bold**, *italic*),
    and leading bullet/list symbols so UI cards remain clean and professional.
    """
    if not text:
        return ""
    s = strip_relative_time_leakage(str(text)).strip()
    # Strip paired markdown bold markers first, then any stray ones at the ends
    s = re.sub(r'[\*\_]{2,3}(.+?)[\*\_]{2,3}', r'\1', s)
    s = re.sub(r'^\s*[\*\_]{1,3}\s*', '', s)
    s = re.sub(r'\s*[\*\_]{1,3}\s*$', '', s)
    # Strip a leading list badge: a bullet symbol, or "1." / "১)".
    # A bare leading number ("১৬ ডিসেম্বর", "25 crore") is content and must survive.
    s = re.sub(r'^\s*(?:[•\-\*]+\s*|[\d০-৯]{1,2}[\.\)]\s+)', '', s)
    return s.strip()

def validate_and_filter_tags(tags: List[str], text: str, primary_category: str) -> List[str]:
    """
    Deterministic Tag Grounding Validator:
    1. Rejects any sports/entertainment tag if primary_category is not sports/entertainment,
       UNLESS sports words are literally present in the story text.
    2. Strips any tag where none of the tag's meaningful sub-words exist in the source text.
    3. Normalizes all tags to #CamelCase format without spaces.
    4. Capped at 2-4 tags max.
    """
    text_lower = text.lower()
    cleaned = []
    seen = set()

    for raw_tag in tags:
        if not isinstance(raw_tag, str):
            continue
        tag_str = re.sub(r"[^\w\u0980-\u09FF]", "", raw_tag)
        if not tag_str or len(tag_str) < 2:
            continue
            
        tag_lower = tag_str.lower()
        
        # 1. Reject cross-category sports contamination
        if primary_category != "sports_fitness":
            if any(sk in tag_lower for sk in SPORTS_KEYWORDS):
                if not any(sk in text_lower for sk in SPORTS_KEYWORDS):
                    continue
                    
        # 2. Reject cross-category entertainment contamination
        if primary_category != "pop_culture":
            if any(ek in tag_lower for ek in ENTERTAINMENT_KEYWORDS):
                if not any(ek in text_lower for ek in ENTERTAINMENT_KEYWORDS):
                    continue

        # 3. Grounding check: at least one token from the tag should appear in text_lower
        sub_tokens = re.findall(r"[A-Z]?[a-z\u0980-\u09FF]+|[A-Z]+(?=[A-Z][a-z]|\b)", tag_str)
        sub_tokens_lower = [t.lower() for t in sub_tokens if len(t) >= 3]
        if sub_tokens_lower:
            if not any(t in text_lower for t in sub_tokens_lower):
                continue
        else:
            if tag_lower not in text_lower:
                continue

        formatted_tag = f"#{tag_str}"
        if formatted_tag.lower() not in seen:
            seen.add(formatted_tag.lower())
            cleaned.append(formatted_tag)

        if len(cleaned) >= 4:
            break

    # If fewer than 2 tags remain after filtering, generate safe fallback tags from primary_category
    if len(cleaned) < 2:
        cat_tag_map = {
            "governance_law": ["#Bangladesh", "#Governance"],
            "economy_business": ["#Economy", "#Finance"],
            "world_diplomacy": ["#Geopolitics", "#Diplomacy"],
            "tech_innovation": ["#Technology", "#Innovation"],
            "climate_environment": ["#Climate", "#Environment"],
            "sports_fitness": ["#Sports", "#BangladeshCricket"],
            "pop_culture": ["#Entertainment", "#Culture"],
        }
        fallback_tags = cat_tag_map.get(primary_category, ["#Bangladesh", "#National Affairs"])
        for ft in fallback_tags:
            ft_clean = f"#{re.sub(r'[^\w\u0980-\u09FF]', '', ft)}"
            if ft_clean.lower() not in seen:
                seen.add(ft_clean.lower())
                cleaned.append(ft_clean)
                if len(cleaned) >= 3:
                    break

    return cleaned[:4]

def load_pyqs() -> list:
    if os.path.exists(PYQS_FILE):
        with open(PYQS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def match_pyqs_for_story(categories: List[str], text: str) -> List[PyqReference]:
    """Matches 30-year past BPSC exam questions based on topic tags and keywords."""
    pyqs = load_pyqs()
    matched = []
    
    for q in pyqs:
        overlap = set(categories).intersection(set(q.get("topics", [])))
        if overlap:
            matched.append(PyqReference(
                pyq_id=q["id"],
                bcs_batch=q["bcs_batch"],
                subject=q["subject"],
                question_snippet=q["question_text_bn"],
                relevance_score=0.9
            ))
            if len(matched) >= 2:
                break
                
    return matched

def map_syllabus_for_categories(categories: List[str], title: str) -> SyllabusMapping:
    """Deterministically maps an event to the official BPSC Syllabus paper & microtheme."""
    cat = categories[0] if categories else "governance_law"
    title_lower = title.lower()
    
    if cat == "economy_business" or "bank" in title_lower or "inflation" in title_lower or "মুদ্রাস্ফীতি" in title_lower:
        return SyllabusMapping(
            paper_code="Paper V",
            subject="Bangladesh Affairs",
            microtheme="Macroeconomy, Banking, Trade & Foreign Reserves",
            full_breadcrumb="Bangladesh Affairs (Paper V) › Macroeconomy, Trade & Foreign Reserves"
        )
    elif cat == "governance_law" or "court" in title_lower or "সংবিধান" in title_lower or "রিট" in title_lower:
        return SyllabusMapping(
            paper_code="Paper V",
            subject="Bangladesh Affairs",
            microtheme="The Constitution, Organs of State & Writ Jurisdiction",
            full_breadcrumb="Bangladesh Affairs (Paper V) › The Constitution & Rule of Law"
        )
    elif cat == "world_diplomacy" or "treaty" in title_lower or "কূটনীতি" in title_lower:
        return SyllabusMapping(
            paper_code="Paper VI",
            subject="International Affairs",
            microtheme="Bilateral Diplomacy, Treaties & Regional Geopolitics",
            full_breadcrumb="International Affairs (Paper VI) › Regional & Global Geopolitics"
        )
    elif cat == "climate_environment" or "delta" in title_lower or "ব-দ্বীপ" in title_lower:
        return SyllabusMapping(
            paper_code="Paper VII",
            subject="Geography, Environment & Disaster Management",
            microtheme="Delta Plan 2100 & Climate Vulnerability Governance",
            full_breadcrumb="Geography & Environment (Paper VII) › Delta Plan 2100"
        )
    elif cat == "tech_innovation" or "ai" in title_lower or "সাইবার" in title_lower:
        return SyllabusMapping(
            paper_code="Paper IV",
            subject="General Science & ICT",
            microtheme="Cybersecurity, Digital Public Infrastructure & AI",
            full_breadcrumb="General Science & ICT (Paper IV) › Public Sector Digitalization"
        )
    else:
        return SyllabusMapping(
            paper_code="Paper V",
            subject="Bangladesh Affairs",
            microtheme="Public Administration, Reforms & Citizen Welfare",
            full_breadcrumb="Bangladesh Affairs (Paper V) › Public Administration & Governance"
        )

def build_clean_sources(articles: list) -> list:
    """
    Deduplicates and standardizes verified news source citations.
    Ensures:
    1. Each publisher is cited at most once (no repeating 'The Daily Star' 22 times).
    2. Publisher names are clean (strips internal feed sections like 'Politics' / 'Law & Crime').
    3. Supplies actual article headline as 'title' and 'snippet' rather than generic fallback.
    4. Capped at top 4 distinct media houses.
    """
    sources = []
    seen_urls = set()
    seen_publishers = set()
    
    for a in articles:
        url = getattr(a, "url", "")
        source_name = getattr(a, "source", "News Wire")
        title = getattr(a, "title", "Editorial Report")
        
        if not url or url in seen_urls:
            continue
            
        clean_pub = re.sub(r"\s+(Politics|Law & Crime|Bangladesh|Main|National)$", "", source_name).strip()
        if clean_pub in seen_publishers:
            continue
            
        seen_urls.add(url)
        seen_publishers.add(clean_pub)
        sources.append({
            "name": clean_pub,
            "url": url,
            "title": title,
            "snippet": title[:110]
        })
        if len(sources) >= 4:
            break
            
    return sources or [{"name": "National Press & Official Sources", "url": "", "title": "Verified News Wire", "snippet": "Ground reporting & editorial analysis"}]

def synthesize_story_with_ai(
    cluster: ClusteredEvent,
    is_bcs_pro: bool,
    api_key: Optional[str] = None,
    allow_heuristic_fallback: bool = True
) -> CapsuleStory:
    """
    Synthesizes a clustered news event into a bilingual CapsuleStory.
    Uses Gemini when GEMINI_API_KEY is available; otherwise provides high-quality heuristic synthesis.
    Conforms to the 7-section Civilsdaily specification for BCS Pro.
    """
    primary_art = cluster.articles[0]
    title = primary_art.title
    body = primary_art.body_text or primary_art.summary_raw or title
    is_bangla_source = primary_art.language == "bn"
    effective_published_at = primary_art.published_at or datetime.now().astimezone().isoformat()
    
    # 1. Deterministic Constitutional KB Matching
    const_matches = find_relevant_articles(f"{title} {body}")
    const_citations = [
        ConstitutionalCitation(
            article_number=m["article_number"],
            article_title_bn=m["article_title_bn"],
            article_title_en=m["article_title_en"],
            legal_relevance=m["legal_relevance"]
        ) for m in const_matches
    ]
    
    primary_cat = cluster.matched_categories[0] if cluster.matched_categories else "governance_law"
    syllabus = map_syllabus_for_categories(cluster.matched_categories, title)
    
    # 2. Gemini keys (environment plus admin-managed backups)
    keys_list = gemini_api_keys(api_key)

    if keys_list:
        try:
            prompt = build_story_prompt(
                build_source_text(cluster.articles), primary_cat, is_bcs_pro
            )
            data = generate_json(prompt, api_key=api_key, temperature=0.2)
            if isinstance(data, list) and len(data) > 0:
                data = data[0]
            if not isinstance(data, dict):
                data = {}

            # Reject sports and entertainment noise identified by Gemini
            if data.get("is_excluded") is True:
                print(f"   🚫 Gemini flagged story as sports/showbiz noise: {title[:55]}. Skipping.")
                return None

            # Verify and set primary category from Gemini's analysis
            VALID_CATEGORIES = {
                "economy_business", "governance_law", "tech_innovation",
                "climate_environment", "world_diplomacy", "society_education", "sports_fitness"
            }
            ai_cat = data.get("primary_category")
            if ai_cat in VALID_CATEGORIES:
                primary_cat = ai_cat
                if primary_cat not in cluster.matched_categories:
                    cluster.matched_categories.insert(0, primary_cat)
                else:
                    cluster.matched_categories.remove(primary_cat)
                    cluster.matched_categories.insert(0, primary_cat)

            # Map headline & leads with relative-day and markdown asterisk stripping
            h_bn = clean_editorial_text(data.get("headline_bn") or data.get("title_bn") or (title if is_bangla_source else title))
            h_en = clean_editorial_text(data.get("headline_en") or data.get("title_en") or (title if not is_bangla_source else title))
            lead_bn = clean_editorial_text(data.get("lead_bn") or data.get("summary_bn") or (primary_art.summary_raw or title))
            lead_en = clean_editorial_text(data.get("lead_en") or data.get("summary_en") or (primary_art.summary_raw or title))

            bullets_bn = [clean_editorial_text(b) for b in data.get("bullets_bn", []) if b]
            bullets_bn = [b for b in bullets_bn if len(b) > 5][:3]
            bullets_en = [clean_editorial_text(b) for b in data.get("bullets_en", []) if b]
            bullets_en = [b for b in bullets_en if len(b) > 5][:3]
            impact_bn = clean_editorial_text(data.get("impact_bn")) or None
            impact_en = clean_editorial_text(data.get("impact_en")) or None
            details_bn = clean_editorial_text(data.get("details_bn")) or None
            details_en = clean_editorial_text(data.get("details_en")) or None
            
            buzz = DailyBuzzItem(
                title_bn=h_bn,
                title_en=h_en,
                summary_bn=lead_bn,
                summary_en=lead_en,
                interest_categories=cluster.matched_categories,
                published_at=effective_published_at,
                lead_bn=lead_bn,
                lead_en=lead_en,
                bullets_bn=bullets_bn,
                bullets_en=bullets_en,
                impact_bn=impact_bn,
                impact_en=impact_en,
                details_bn=details_bn,
                details_en=details_en
            )
            
            bcs_pro = None
            if is_bcs_pro:
                bcs_pro = BcsProItem(
                    syllabus_mapping=syllabus,
                    bcs_subject_area=syllabus.full_breadcrumb,
                    why_in_the_news_en=data.get("why_in_the_news_en", f"Today's development anchors new administrative and regulatory action regarding {title}."),
                    why_in_the_news_bn=data.get("why_in_the_news_bn", f"উক্ত নীতিগত সিদ্ধান্তের ফলে সার্বিক প্রশাসনিক ও প্রাতিষ্ঠানিক ক্ষেত্রে নতুন নির্দেশনা জারি করা হয়েছে।"),
                    question_breakdowns=[
                        QuestionBreakdown(
                            question=q.get("question", "What is the core policy development?"),
                            anchor_points=[str(pt) for pt in q.get("anchor_points", [])] or ["**Policy Mechanism:** Outlines executive regulatory measures."]
                        ) for q in data.get("question_breakdowns", []) if isinstance(q, dict)
                    ],
                    data_stats=[
                        StatPoint(
                            metric_name=s.get("metric_name", "Macroeconomic Indicator"),
                            value=str(s.get("value", "Official Release")),
                            source_org=s.get("source_org", "BBS / Bangladesh Bank"),
                            context=s.get("context", "Key data point referenced in gazette")
                        ) for s in data.get("data_stats", []) if isinstance(s, dict)
                    ],
                    constitutional_articles=const_citations,
                    challenges=data.get("challenges", [
                        "1. প্রাতিষ্ঠানিক সমন্বয়হীনতা ও বাস্তবায়ন জটিলতা।",
                        "2. রাজস্ব বা আর্থিক বরাদ্দের কাঠামোগত সীমাবদ্ধতা।",
                        "3. মনিটরিং ও স্বচ্ছতা নিশ্চিতকরণে আইনি দুর্বলতা।"
                    ]),
                    way_forward=data.get("way_forward", [
                        "1. সংশ্লিষ্ট অংশীজন ও আন্তঃমন্ত্রণালয় সমন্বয় জোরদার করা।",
                        "2. ডিজিটাল ডাটা ট্র্যাকিং ও দ্রুত নিরীক্ষা ব্যবস্থা চালু।",
                        "3. টেকসই নীতি কাঠামোর আইনি সুরক্ষা নিশ্চিত করা।"
                    ]),
                    analytical_breakdown_bn=data.get("analytical_breakdown_bn", "বিপিএসসি লিখিত পরীক্ষায় নীতি পর্যালোচনা ও সংস্কারমূলক সুপারিশে এই তথ্যগুলো উচ্চ মানসম্পন্ন পয়েন্ট হিসেবে উপস্থাপনযোগ্য।"),
                    analytical_breakdown_en=data.get("analytical_breakdown_en", "Crucial structural policy development relevant for public administration and BPSC written examination papers."),
                    written_exam_prompt=WrittenExamPrompt(
                        marks=15,
                        prompt_text_bn=data.get("written_prompt_bn", f"প্রশ্ন: '{title}'—উক্ত ঘটনার আলোকে বাংলাদেশের প্রশাসনিক স্বচ্ছতা ও দীর্ঘমেয়াদী নীতিগত চ্যালেঞ্জসমূহ পর্যালোচনা করুন। [নম্বর: ১৫]"),
                        prompt_text_en=data.get("written_prompt_en", f"Q: In light of '{title}', analyze the policy bottlenecks and propose strategic governance solutions. [Marks: 15]"),
                        model_outline_points=data.get("model_outline_points", [
                            "১. প্রাথমিক পটভূমি ও বর্তমান চালচিত্র (Introduction & Context)",
                            "২. আইনগত ও প্রাতিষ্ঠানিক সীমাবদ্ধতা (Regulatory Gaps & Institutional Issues)",
                            "৩. সরকারি নীতি সংস্কার ও ভবিষ্যৎ করণীয় (Strategic Policy Recommendations)"
                        ])
                    ),
                    linked_pyqs=match_pyqs_for_story(cluster.matched_categories, title)
                )
                
            parsed_tags = validate_and_filter_tags(
                data.get("tags", []),
                f"{title} {body}",
                primary_cat
            )

            return CapsuleStory(
                story_id=cluster.cluster_id,
                primary_category=primary_cat,
                interest_categories=cluster.matched_categories,
                region=getattr(cluster, "region", "national"),
                tags=parsed_tags,
                is_bcs_pro_selected=is_bcs_pro,
                importance_score=getattr(cluster, "importance_score", 2.0),
                rank_score=getattr(cluster, "rank_score", 1.0),
                image_url=primary_art.image_url,
                published_at=effective_published_at,
                sources=build_clean_sources(cluster.articles),
                daily_buzz=buzz,
                bcs_pro=bcs_pro
            )
        except Exception as e:
            if not allow_heuristic_fallback:
                print(f"⚠️ Gemini synthesis error ({e}); story skipped (no heuristic fallback).")
                return None
            print(f"⚠️ Gemini synthesis error ({e}), falling back to heuristic engine...")

    # =========================================================================
    # Fallback High-Quality Heuristic Engine (100% Free, Zero-API Dependency)
    # Generates Gen-Z 10-Second Gist (Lead + 3 Bullets + Grounded Tags)
    # =========================================================================
    paragraphs = [p.strip() for p in body.split("\n\n") if len(p.strip()) > 25]
    if not paragraphs and body:
        paragraphs = [p.strip() for p in re.split(r'\n+', body) if len(p.strip()) > 25]
    first_p = paragraphs[0] if paragraphs else title
    
    # Collect meaningful sentences across all available scraped paragraphs
    all_clean_sentences = []
    for p in (paragraphs if paragraphs else [title]):
        for s in re.split(r"(?<=[.!?।])\s+", p):
            cleaned = strip_relative_time_leakage(s.strip())
            cleaned = re.sub(r'^[•\-\*\d\.\)\:\s]+', '', cleaned)
            cleaned = re.sub(r'^[•\-\*০-৯\.\)\:\s]+', '', cleaned).strip()
            if len(cleaned) > 15:
                all_clean_sentences.append(cleaned)
    
    lead_summary = all_clean_sentences[0] if all_clean_sentences else strip_relative_time_leakage(title[:120])
    
    b1 = all_clean_sentences[0] if len(all_clean_sentences) > 0 else strip_relative_time_leakage(title)
    b2 = all_clean_sentences[1] if len(all_clean_sentences) > 1 else (paragraphs[1][:140] if len(paragraphs) > 1 else ("সংশ্লিষ্ট কর্তৃপক্ষ বিষয়টি পর্যবেক্ষণ ও বাস্তবায়ন করছে।" if is_bangla_source else "Official bodies and stakeholders are coordinating on procedures."))
    b3 = all_clean_sentences[2] if len(all_clean_sentences) > 2 else ("নীতিমালা ও আইনি প্রক্রিয়া অনুযায়ী পরবর্তী ব্যবস্থা গ্রহণ করা হবে।" if is_bangla_source else "Follow-up regulatory directives are scheduled to take effect.")

    def clean_h_bullet(b_raw: str) -> str:
        s = strip_relative_time_leakage(str(b_raw))
        s = re.sub(r'^[•\-\*\d\.\)\:\s]+', '', s)
        s = re.sub(r'^[•\-\*০-৯\.\)\:\s]+', '', s)
        return s.strip()

    bullets_bn = [clean_h_bullet(b) for b in [b1, b2, b3]] if is_bangla_source else [
        f"{title} বিষয়ে প্রয়োজনীয় পদক্ষেপ গ্রহণ করা হয়েছে।",
        clean_h_bullet(b2),
        clean_h_bullet(b3)
    ]
    bullets_en = [clean_h_bullet(b) for b in [b1, b2, b3]] if not is_bangla_source else [
        f"Event Update: {title[:100]}",
        clean_h_bullet(b2),
        clean_h_bullet(b3)
    ]
    
    details_text = paragraphs[1] if len(paragraphs) > 1 else first_p
    if len(details_text) > 350:
        details_text = details_text[:340] + "..."

    cat_label = primary_cat.replace('_', ' ').title()
    buzz = DailyBuzzItem(
        title_bn=title if is_bangla_source else f"{title} (সংক্ষিপ্ত বিবরণ)",
        title_en=title if not is_bangla_source else f"[{cat_label}] {title}",
        summary_bn=lead_summary if is_bangla_source else f"{title} সম্পর্কিত সামগ্রিক পরিস্থিতি পর্যালোচনা করা হচ্ছে।",
        summary_en=lead_summary if not is_bangla_source else f"Significant policy and governance development regarding {title[:90]}.",
        interest_categories=cluster.matched_categories,
        published_at=effective_published_at,
        lead_bn=lead_summary if is_bangla_source else f"{title} সম্পর্কিত গুরুত্বপূর্ণ পদক্ষেপ গ্রহণ করা হয়েছে।",
        lead_en=lead_summary if not is_bangla_source else f"Key executive and policy developments underway regarding {title[:90]}.",
        bullets_bn=bullets_bn,
        bullets_en=bullets_en,
        impact_bn="সাধারণ নাগরিক ও সংশ্লিষ্ট অংশীজনদের জন্য এই সিদ্ধান্ত কার্যকর প্রভাব ফেলবে।",
        impact_en="Directly affects stakeholders and institutional administration across Bangladesh.",
        details_bn=details_text if is_bangla_source else None,
        details_en=details_text if not is_bangla_source else None
    )
    
    bcs_pro = None
    if is_bcs_pro:
        bcs_pro = BcsProItem(
            syllabus_mapping=syllabus,
            bcs_subject_area=syllabus.full_breadcrumb,
            why_in_the_news_en=f"Triggered by recent administrative announcements regarding {title}. Directly impacts regulatory compliance.",
            why_in_the_news_bn=f"উক্ত ঘটনার পরিপ্রেক্ষিতে নিয়ন্ত্রক সংস্থা ও নির্বাহী বিভাগের পক্ষ থেকে নতুন দিকনির্দেশনা ও পর্যবেক্ষণ জারি করা হয়েছে।",
            question_breakdowns=[
                QuestionBreakdown(
                    question="What is the policy or administrative dispute?",
                    anchor_points=[
                        "**1. Core Mechanism:** The administrative agency enforces statutory authority under existing national guidelines.",
                        "**2. Institutional Friction:** Implementation requires inter-agency coordination across finance and administrative divisions.",
                        "**3. Regulatory Conflict:** Balancing consumer welfare against macroeconomic stability targets."
                    ]
                )
            ],
            data_stats=[
                StatPoint(
                    metric_name="Headline Indicator / Gazette",
                    value="Latest Official Release",
                    source_org="BBS / Bangladesh Bank",
                    context="Key data point referenced in the morning gazette."
                )
            ],
            constitutional_articles=const_citations,
            challenges=[
                "1. Structural Shortfalls: Implementation delays and inter-departmental coordination gaps.",
                "2. Institutional Capacity: Enforcement challenges under existing statutory regulatory frameworks.",
                "3. Fiscal & Monetary Synergy: Ensuring alignment between ministry budgets and executive targets."
            ],
            way_forward=[
                "1. Strengthening Institutional Frameworks: Enhancing domestic regulatory compliance mechanisms.",
                "2. Real-Time Inter-Agency Coordination: Creating unified taskforces between Bangladesh Bank and ministries.",
                "3. Pragmatic Policy Reform: Introducing clear statutory safeguards tailored for long-term national planning."
            ],
            analytical_breakdown_bn="প্রশাসনিক ও অর্থনৈতিক কাঠামোর ওপর এই ঘটনার প্রভাব বহুমাত্রিক। বিপিএসসি লিখিত পরীক্ষায় নীতি পর্যালোচনা ও সংস্কারমূলক সুপারিশে এই তথ্যগুলো উচ্চ মানসম্পন্ন পয়েন্ট হিসেবে উপস্থাপনযোগ্য।",
            analytical_breakdown_en="Significant structural implication for civil servants. Demonstrates real-world application of executive regulatory mechanisms and fiscal-monetary governance.",
            written_exam_prompt=WrittenExamPrompt(
                marks=15,
                prompt_text_bn=f"প্রশ্ন: '{title}'—উক্ত ঘটনার আলোকে বাংলাদেশের প্রশাসনিক স্বচ্ছতা ও দীর্ঘমেয়াদী নীতিগত চ্যালেঞ্জসমূহ পর্যালোচনা করুন। [নম্বর: ১৫]",
                prompt_text_en=f"Q: In light of '{title}', analyze the policy bottlenecks and propose strategic governance solutions for Bangladesh. [Marks: 15]",
                model_outline_points=[
                    "১. প্রাথমিক পটভূমি ও বর্তমান চালচিত্র (Introduction & Context)",
                    "২. আইনগত ও প্রাতিষ্ঠানিক সীমাবদ্ধতা (Regulatory Gaps & Institutional Issues)",
                    "৩. সরকারি নীতি সংস্কার ও ভবিষ্যৎ করণীয় (Strategic Policy Recommendations)"
                ]
            ),
            linked_pyqs=match_pyqs_for_story(cluster.matched_categories, title)
        )
        
    fallback_tags = validate_and_filter_tags([], f"{title} {body}", primary_cat)

    return CapsuleStory(
        story_id=cluster.cluster_id,
        primary_category=primary_cat,
        interest_categories=cluster.matched_categories,
        region=getattr(cluster, "region", "national"),
        tags=fallback_tags,
        is_bcs_pro_selected=is_bcs_pro,
        importance_score=getattr(cluster, "importance_score", 2.0),
        rank_score=getattr(cluster, "rank_score", 1.0),
        image_url=primary_art.image_url,
        published_at=effective_published_at,
        sources=build_clean_sources(cluster.articles),
        daily_buzz=buzz,
        bcs_pro=bcs_pro
    )
