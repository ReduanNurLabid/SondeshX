import re
import math
from datetime import datetime, timezone
from typing import List, Set, Optional

# Keywords that indicate explicit Bangladesh context
BD_SIGNALS = {
    "bangladesh", "dhaka", "chattogram", "chittagong", "sylhet", "rajshahi", "khulna", "barishal",
    "rangpur", "mymensingh", "cumilla", "cox's bazar", "padma", "jamuna", "meghna", "teesta",
    "bnp", "awami", "jamaat", "chhatra dal", "jubo dal", "interim government", "yunus",
    "tarique", "khaleda", "hasina", "bangladesh bank", "bpsc", "bsec", "nbr", "bbs", "biman",
    "বাংলাদেশ", "ঢাকা", "চট্টগ্রাম", "সিলেট", "রাজশাহী", "খুলনা", "বরিশাল", "রংপুর", "ময়মনসিংহ",
    "কুমিল্লা", "কক্সবাজার", "পদ্মা", "যমুনা", "মেঘনা", "তিস্তা", "বিএনপি", "আওয়ামী", "জামায়াত",
    "ছাত্রদল", "যুবদল", "প্রধান উপদেষ্টা", "ইউনূস", "তারেক", "খালেদা", "হাসিনা", "বাংলাদেশ ব্যাংক",
    "বিপিএসসি", "বিএসইসি", "এনবিআর", "উপদেষ্টা", "জাতীয় রাজস্ব বোর্ড", "গেজেট", "অধ্যাদেশ"
}

# Major global affairs that legitimately matter to Bangladesh
GLOBAL_IMPACT_SIGNALS = {
    # Financial, Trade & Macroeconomy
    "imf", "world bank", "federal reserve", "central bank", "opec", "oil price", "crude oil",
    "energy security", "lng", "inflation", "interest rate", "tariff", "trade war", "recession",
    "dollar", "remittance", "migrant worker", "foreign direct investment", "sovereign debt",
    
    # Geopolitics, Diplomacy, War & Treaties
    "united nations", "un security council", "middle east", "israel", "palestine", "gaza",
    "iran", "saudi", "uae", "qatar", "malaysia", "rohingya", "myanmar", "india", "delhi",
    "china", "beijing", "us election", "white house", "pentagon", "kremlin", "russia", "ukraine",
    "kyiv", "moscow", "taiwan", "nato", "ceasefire", "sanctions", "nuclear", "diplomacy",
    "summit", "bilateral", "brics", "g7", "g20", "european union", "red sea", "houthi",
    "icc", "icj", "treaty", "foreign policy", "foreign minister",

    # Climate, Energy Transition & Disasters
    "climate change", "cop29", "cop30", "renewable energy", "carbon emission", "clean energy",
    "global warming", "solar energy", "biodiversity",

    # Bengali Equivalents
    "বিশ্বব্যাংক", "জাতিসংঘ", "মধ্যপ্রাচ্য", "ইসরায়েল", "ফিলিস্তিন", "গাজা", "ইরান", "সৌদি",
    "রেমিট্যান্স", "প্রবাসী", "রোহিঙ্গা", "মিয়ানমার", "ভারত", "চীন", "যুক্তরাষ্ট্র", "ইউক্রেন",
    "রাশিয়া", "ন্যাটো", "যুদ্ধবিরতি", "নিষেধাজ্ঞা", "জ্বালানি", "তেলের দাম", "মুদ্রাস্ফীতি"
}

# High-tier tech breakthroughs
TECH_BREAKTHROUGH_SIGNALS = {
    "artificial intelligence", "generative ai", "openai", "chatgpt", "deep learning", "semiconductor",
    "cybersecurity", "cyberattack", "satellite", "spacex", "quantum computing",
    "এআই", "কৃত্রিম বুদ্ধিমত্তা", "সাইবার নিরাপত্তা", "সেমিকন্ডাক্টর"
}

BD_OUTLETS = {
    "প্রথম আলো", "প্রথম আলো রাজনীতি", "the daily star", "the daily star politics",
    "the daily star bangladesh", "the daily star law & crime", "the business standard",
    "the business standard politics", "bangla tribune", "dhaka tribune", "jago news 24",
    "channel i", "the financial express", "bss news", "বাসস",
    "ইত্তেফাক", "dhaka post", "sarabangla"
}

def is_article_relevant_to_bd(title: str, text: str, source_name: str) -> bool:
    """
    Filters out noise and irrelevant foreign fluff (e.g. US mouse sales, local county court trials).
    News is relevant if:
    1. Published by a verified Bangladesh media house, OR
    2. Explicitly mentions Bangladesh entities, OR
    3. Covers high-impact global geopolitics, world economy, or major tech breakthroughs.
    """
    clean_src = source_name.strip().lower()
    for bd_src in BD_OUTLETS:
        if bd_src in clean_src:
            return True

    combined = f"{title} {text}".lower()

    if any(s in combined for s in BD_SIGNALS):
        return True

    if any(s in combined for s in GLOBAL_IMPACT_SIGNALS):
        return True

    if any(s in combined for s in TECH_BREAKTHROUGH_SIGNALS):
        return True

    # Otherwise it's unanchored foreign news (e.g. Logitech mouse discount in US)
    return False

def compute_base_importance(
    title: str,
    text: str,
    source_name: str,
    cluster_size: int = 1,
    matched_categories: Optional[List[str]] = None
) -> float:
    """
    Computes a base importance score from 1.0 to 10.0.
    Considers institutional authority, national impact, multi-source corroboration, and proximity.
    """
    combined = f"{title} {text}".lower()
    score = 2.0  # Base line news score

    # 1. Constitutional, Supreme Court, Cabinet, National Governance (+3.5)
    high_gov = [
        "constitution", "সংবিধান", "supreme court", "সুপ্রিম কোর্ট", "high court", "হাইকোর্ট",
        "chief adviser", "প্রধান উপদেষ্টা", "prime minister", "প্রধানমন্ত্রী", "cabinet", "মন্ত্রিসভা",
        "election commission", "নির্বাচন কমিশন", "ordinance", "অধ্যাদেশ", "advisory council"
    ]
    if any(w in combined for w in high_gov):
        score += 3.5

    # 2. Macroeconomics, Central Bank, Inflation, Reserves (+3.0)
    macro = [
        "bangladesh bank", "বাংলাদেশ ব্যাংক", "repo rate", "রেপো রেট", "inflation", "মুদ্রাস্ফীতি",
        "মূল্যস্ফীতি", "forex reserve", "রিজার্ভ", "national budget", "বাজেট", "nbr", "রাজস্ব", "imf", "world bank"
    ]
    if any(w in combined for w in macro):
        score += 3.0

    # 3. High-impact national politics, rule of law, anti-corruption (+2.5)
    national_impact = [
        "tarique", "তারেক", "ishraque", "ইশরাক", "resignation", "পদত্যাগ", "remittance", "প্রবাসী",
        "rohingya", "রোহিঙ্গা", "murder", "arrest", "আটক", "গ্রেপ্তার", "হামলা"
    ]
    if any(w in combined for w in national_impact):
        score += 2.0

    # 4. Bilateral diplomacy & Geopolitics (+2.0)
    diplomacy = ["treaty", "চুক্তি", "bilateral", "দ্বিপক্ষীয়", "summit", "বৈঠক", "foreign minister", "পররাষ্ট্রমন্ত্রী"]
    if any(w in combined for w in diplomacy):
        score += 2.0

    # 5. Multi-source Corroboration Multiplier (Breaking news covered by 2+ outlets is huge)
    corroboration_factor = 1.0 + min(0.5, (cluster_size - 1) * 0.25)
    score *= corroboration_factor

    # 6. Proximity multiplier: domestic BD gets +20% boost
    is_bd = any(s in source_name.lower() for s in BD_OUTLETS) or any(s in combined for s in BD_SIGNALS)
    if is_bd:
        score *= 1.2
    else:
        # Non-BD story must be strictly significant to be high
        score *= 0.85

    return round(min(10.0, max(1.0, score)), 2)

RANK_HALF_LIFE_HOURS = 10.0
RANK_ACTIVE_WINDOW_HOURS = 30.0


def compute_time_decayed_score(
    base_importance: float,
    published_at_iso: Optional[str],
    now_dt: Optional[datetime] = None,
    half_life_hours: float = RANK_HALF_LIFE_HOURS,
    max_active_window_hours: float = RANK_ACTIVE_WINDOW_HOURS
) -> float:
    """
    Front-page rank: the editorial score loses half its weight every 10 hours.

        rank = score * 0.5 ** (age_hours / 10)

    So a 9-point story stays above a brand-new 5-point story for about 8 hours,
    while a fresher story of equal weight always leads. Past the 30-hour window
    the rank collapses so yesterday's news leaves the front page.

    web/src/services/api.ts (calculateDynamicRank) implements the same formula.
    """
    if not now_dt:
        now_dt = datetime.now(timezone.utc)

    age_hours = 0.0
    if published_at_iso:
        try:
            pub_dt = datetime.fromisoformat(published_at_iso.replace("Z", "+00:00"))
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            age_hours = max(0.0, (now_dt - pub_dt).total_seconds() / 3600.0)
        except Exception:
            age_hours = 0.5

    rank = base_importance * math.pow(0.5, age_hours / half_life_hours)
    if age_hours > max_active_window_hours:
        rank /= math.pow(1.0 + (age_hours - max_active_window_hours), 2.0)
    return round(rank, 4)
