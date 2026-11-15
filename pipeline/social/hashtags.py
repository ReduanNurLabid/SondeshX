"""
Targeted hashtags for a story's Facebook post.

Built from the story itself instead of a fixed set:
  brand tag + section (Bangla) + up to two places it is about + up to two of the
  story's own topic tags + one reach tag for the audience (national or world).
Facebook favours a handful of relevant tags over long lists, so the total is capped at 7.
"""
import re
from typing import List

BRAND = "#সন্দেশএক্সপ্রেস"

SECTION_TAGS = {
    "governance_law": "#রাজনীতি",
    "economy_business": "#অর্থনীতি",
    "world_diplomacy": "#আন্তর্জাতিক",
    "tech_innovation": "#প্রযুক্তি",
    "climate_environment": "#পরিবেশ",
    "society_education": "#সমাজ",
    "sports_fitness": "#খেলা",
}

# Divisions and all 64 districts, as Bangladeshi newspapers spell them.
PLACES = [
    "ঢাকা", "চট্টগ্রাম", "রাজশাহী", "খুলনা", "বরিশাল", "সিলেট", "রংপুর", "ময়মনসিংহ",
    "গাজীপুর", "নারায়ণগঞ্জ", "নরসিংদী", "মুন্সিগঞ্জ", "মানিকগঞ্জ", "টাঙ্গাইল", "কিশোরগঞ্জ",
    "ফরিদপুর", "গোপালগঞ্জ", "মাদারীপুর", "শরীয়তপুর", "রাজবাড়ী", "কুমিল্লা", "ফেনী",
    "নোয়াখালী", "লক্ষ্মীপুর", "চাঁদপুর", "ব্রাহ্মণবাড়িয়া", "কক্সবাজার", "রাঙামাটি",
    "বান্দরবান", "খাগড়াছড়ি", "বগুড়া", "পাবনা", "সিরাজগঞ্জ", "নাটোর", "নওগাঁ",
    "চাঁপাইনবাবগঞ্জ", "জয়পুরহাট", "যশোর", "সাতক্ষীরা", "বাগেরহাট", "কুষ্টিয়া", "মাগুরা",
    "ঝিনাইদহ", "নড়াইল", "চুয়াডাঙ্গা", "মেহেরপুর", "পটুয়াখালী", "ভোলা", "পিরোজপুর",
    "বরগুনা", "ঝালকাঠি", "মৌলভীবাজার", "হবিগঞ্জ", "সুনামগঞ্জ", "দিনাজপুর", "গাইবান্ধা",
    "কুড়িগ্রাম", "লালমনিরহাট", "নীলফামারী", "পঞ্চগড়", "ঠাকুরগাঁও", "জামালপুর", "শেরপুর",
    "নেত্রকোনা",
]

GENERIC = {"#bangladesh", "#news", "#bangladeshnews", "#breakingnews", "#dhaka", "#world", "#worldnews"}


def _clean_topic(tag: str) -> str:
    tag = "#" + re.sub(r"[^\wঀ-৿]", "", str(tag).lstrip("#"))
    return tag if len(tag) > 2 else ""


def build_hashtags(story: dict) -> List[str]:
    buzz = story.get("daily_buzz") or {}
    text = " ".join([buzz.get("title_bn") or "", buzz.get("lead_bn") or "", *(buzz.get("bullets_bn") or [])])

    tags: List[str] = [BRAND]
    section = SECTION_TAGS.get(story.get("primary_category") or "")
    if section:
        tags.append(section)

    # Places, in order of first mention (whole words only).
    found = []
    for place in PLACES:
        m = re.search(rf"(?<![ঀ-৿]){re.escape(place)}", text)
        if m:
            found.append((m.start(), place))
    tags += [f"#{p}" for _, p in sorted(found)[:2]]

    topics = [_clean_topic(t) for t in story.get("tags") or []]
    tags += [t for t in topics if t and t.lower() not in GENERIC][:2]

    tags.append("#বাংলাদেশ" if (story.get("region") or "national") == "national" else "#বিশ্ব")

    seen, out = set(), []
    for t in tags:
        if t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out[:7]
