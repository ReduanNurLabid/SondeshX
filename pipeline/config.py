import os
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

# =====================================================================
# 1. RSS Feed Endpoints (Verified Live & Fast)
# =====================================================================
FEEDS = {
    # ── BANGLADESH NATIONAL FEEDS (Strict Priority) ─────────────────────
    "prothom_alo_politics": {
        "name": "প্রথম আলো রাজনীতি",
        "url": "https://www.prothomalo.com/api/v1/collections/politics.rss",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "bangla_tribune": {
        "name": "Bangla Tribune",
        "url": "https://www.banglatribune.com/feed/",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "prothom_alo_bn": {
        "name": "প্রথম আলো",
        "url": "https://www.prothomalo.com/stories.rss",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "daily_star_business": {
        "name": "The Daily Star Business",
        "url": "https://www.thedailystar.net/business/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "economy_business"
    },
    "tbs_politics": {
        "name": "The Business Standard Politics",
        "url": "https://www.tbsnews.net/bangladesh/politics/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "daily_star_bd": {
        "name": "The Daily Star",
        "url": "https://www.thedailystar.net/news/bangladesh/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "daily_star_crime": {
        "name": "The Daily Star Law & Crime",
        "url": "https://www.thedailystar.net/news/crime-justice/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "tbs_main": {
        "name": "The Business Standard",
        "url": "https://www.tbsnews.net/top-news/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "economy_business"
    },
    "dhaka_tribune": {
        "name": "Dhaka Tribune",
        "url": "https://www.dhakatribune.com/feed/",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "jagonews24": {
        "name": "Jago News 24",
        "url": "https://www.jagonews24.com/rss/rss.xml",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "channel_i": {
        "name": "Channel i",
        "url": "https://www.channelionline.com/feed/",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },

    "tbs_bangladesh": {
        "name": "The Business Standard Bangladesh",
        "url": "https://www.tbsnews.net/bangladesh/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "tbs_economy": {
        "name": "The Business Standard Economy",
        "url": "https://www.tbsnews.net/economy/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "national",
        "category_hint": "economy_business"
    },
    "ittefaq": {
        "name": "ইত্তেফাক",
        "url": "https://www.ittefaq.com.bd/feed/",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "dhaka_post": {
        "name": "Dhaka Post",
        "url": "https://www.dhakapost.com/rss/rss.xml",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "sarabangla": {
        "name": "Sarabangla",
        "url": "https://sarabangla.net/feed/",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "bbc_bangla": {
        "name": "BBC News বাংলা",
        "url": "https://feeds.bbci.co.uk/bengali/rss.xml",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },
    "dw_bangla": {
        "name": "DW বাংলা",
        "url": "https://rss.dw.com/rdf/rss-ben-all",
        "language": "bn",
        "source_type": "rss",
        "region": "national",
        "category_hint": "governance_law"
    },

    # ── INTERNATIONAL: WORLD & GEOPOLITICS (world_diplomacy) ───────────
    "bbc_world": {
        "name": "BBC World News",
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "al_jazeera": {
        "name": "Al Jazeera English",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "guardian_world": {
        "name": "The Guardian World",
        "url": "https://www.theguardian.com/world/rss",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "politico_europe": {
        "name": "Politico Europe",
        "url": "https://www.politico.eu/feed/",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "the_hindu_world": {
        "name": "The Hindu International",
        "url": "https://www.thehindu.com/news/international/feeder/default.rss",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "dw_world": {
        "name": "Deutsche Welle World",
        "url": "https://rss.dw.com/rdf/rss-en-all",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },
    "balkan_insight": {
        "name": "Balkan Insight",
        "url": "https://balkaninsight.com/feed/",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "world_diplomacy"
    },

    # ── INTERNATIONAL: GLOBAL ECONOMY & TRADE (economy_business) ────────
    "cnbc_world_economy": {
        "name": "CNBC Global Economy",
        "url": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "economy_business"
    },
    "marketwatch_top": {
        "name": "MarketWatch Economy",
        "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "economy_business"
    },

    # ── INTERNATIONAL: TECH, AI & INNOVATION (tech_innovation) ───────────
    "techcrunch": {
        "name": "TechCrunch",
        "url": "https://techcrunch.com/feed/",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "tech_innovation"
    },
    "ars_technica": {
        "name": "Ars Technica",
        "url": "https://feeds.arstechnica.com/arstechnica/index",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "tech_innovation"
    },

    # ── INTERNATIONAL: CLIMATE & ENERGY (climate_environment) ───────────
    "inside_climate": {
        "name": "Inside Climate News",
        "url": "https://insideclimatenews.org/feed/",
        "language": "en",
        "source_type": "rss",
        "region": "international",
        "category_hint": "climate_environment"
    }
}

# Direct HTML front-page targets (outlets with no usable RSS feed).
# link_pattern is matched against each absolute article URL found on the page.
SECTION_TARGETS = [
    {
        "name": "The Financial Express",
        "url": "https://thefinancialexpress.com.bd/",
        "base_url": "https://thefinancialexpress.com.bd",
        "link_pattern": r"thefinancialexpress\.com\.bd/(national|economy|trade|stock)/[a-z0-9-]{15,}$",
        "language": "en",
        "category_hint": "economy_business"
    },
    {
        "name": "BSS News",
        "url": "https://www.bssnews.net/",
        "base_url": "https://www.bssnews.net",
        "link_pattern": r"bssnews\.net/(news|news-flash|law-and-court|national|business)/\d+$",
        "language": "en",
        "category_hint": "governance_law"
    },
    {
        "name": "বাসস",
        "url": "https://www.bssnews.net/bangla",
        "base_url": "https://www.bssnews.net",
        "link_pattern": r"bssnews\.net/bangla/(national|news-flash|news|law-and-courts|business)/\d+$",
        "language": "bn",
        "category_hint": "governance_law"
    }
]

# A source that yields no article newer than this is reported as silent.
SOURCE_SILENCE_ALERT_HOURS = 24

# Standard Polite Browser Headers
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none"
}

# =====================================================================
# 2. Canonical Interest Categories & Keyword Taxonomy
# =====================================================================
INTEREST_CATEGORIES: Dict[str, Dict[str, any]] = {
    "economy_business": {
        "en": "Economy & Business",
        "bn": "অর্থনীতি ও বাণিজ্য",
        "keywords": [
            # English
            "economy", "economic", "inflation", "bank", "banking", "tax", "taxes", "gdp", 
            "export", "import", "budget", "finance", "financial", "dollar", "reserve", 
            "forex", "interest rate", "revenue", "nbr", "trade", "commerce", "stock", 
            "market", "share market", "dse", "investment", "investor", "remittance", 
            "imf", "world bank", "central bank", "loan", "default", "customs", "tariff",
            "price hike", "fiscal", "monetary policy", "bond",
            # Bengali
            "অর্থনীতি", "অর্থনৈতিক", "ব্যাংক", "ব্যাংকিং", "মুদ্রাস্ফীতি", "মূল্যস্ফীতি", 
            "রিজার্ভ", "বৈদেশিক মুদ্রা", "বাজেট", "রাজস্ব", "ডলার", "টাকা", "রপ্তানি", 
            "আমদানি", "বাণিজ্য", "বাণিজ্যিক", "শেয়ারবাজার", "শেয়ার বাজার", "ডিএসই", 
            "পুঁজিবাজার", "রেমিট্যান্স", "প্রবাসী আয়", "বিনিয়োগ", "ঋণ", "খেলাপি ঋণ", 
            "কাস্টমস", "ভ্যাট", "ট্যাক্স", "কর", "জাতীয় রাজস্ব বোর্ড", "এনবিআর", 
            "বাংলাদেশ ব্যাংক", "কেন্দ্রীয় ব্যাংক", "আইএমএফ", "বিশ্বব্যাংক", "মুদ্রানীতি", 
            "সুদের হার", "ট্যারিফ", "শুল্ক", "জিডিপি", "অর্থ মন্ত্রণালয়", "মূল্যবৃদ্ধি", 
            "দ্রব্যমূল্য", "মুদ্রাবাজার", "বন্ড"
        ]
    },
    "governance_law": {
        "en": "Governance, Law & Constitution",
        "bn": "শাসনব্যবস্থা, রাজনীতি ও সংবিধান",
        "keywords": [
            # English
            "court", "constitution", "constitutional", "police", "election", "commission", 
            "ministry", "parliament", "bpsc", "judiciary", "judge", "justice", "high court", 
            "supreme court", "ordinance", "resignation", "cabinet", "politics", "political", 
            "ishraque", "bnp", "awami", "jamaat", "adviser", "interim", "yunus", "governance", 
            "administration", "administrative", "dudok", "acc", "anticorruption", "anti-corruption",
            "protest", "reform", "commissioner", "deputy commissioner", "gazette", "magistrate",
            "arrest", "investigation", "writ", "case", "bail", "law enforcement",
            # Bengali
            "আদালত", "সংবিধান", "সাংবিধানিক", "নির্বাচন", "নির্বাচন কমিশন", "ইসি", 
            "মন্ত্রণালয়", "আইন", "আইনশৃঙ্খলা", "প্রশাসন", "প্রশাসনিক", "দুদক", "দুর্নীতি", 
            "হাইকোর্ট", "সুপ্রিম কোর্ট", "আপিল বিভাগ", "অধ্যাদেশ", "পদত্যাগ", "ইশরাক", 
            "বিএনপি", "আওয়ামী লীগ", "জামায়াত", "মন্ত্রিসভা", "উপদেষ্টা", "প্রধান উপদেষ্টা", 
            "রাজনীতি", "রাজনৈতিক", "স্বরাষ্ট্র", "স্বরাষ্ট্র মন্ত্রণালয়", "আন্দোলন", 
            "বিক্ষোভ", "সংসদ", "জাতীয় সংসদ", "অধিবেশন", "বিচারপতি", "প্রধান বিচারপতি", 
            "বিচারক", "আইনজীবী", "গেজেট", "সংস্কার", "ইউনূস", "পুলিশ", "র‍্যাব", "গ্রেপ্তার", 
            "মামলা", "রিট", "তদন্ত", "জেলা প্রশাসক", "ডিসি", "ইউএনও", "বিপিএসসি", "কমিশন", 
            "স্বচ্ছতা", "জবাবদিহিতা", "জামিন"
        ]
    },
    "tech_innovation": {
        "en": "Technology & AI",
        "bn": "প্রযুক্তি ও এআই",
        "keywords": [
            # English
            "tech", "technology", "ai", "artificial intelligence", "digital", "internet", 
            "telecom", "satellite", "cyber", "cybersecurity", "innovation", "science", 
            "software", "hardware", "startup", "cloud", "data", "algorithm", "php", 
            "vulnerability", "hacker", "hacking", "chip", "semiconductor", "robot", 
            "robotics", "app", "spacex", "nasa", "machine learning", "coding", "server",
            # Bengali
            "প্রযুক্তি", "বিজ্ঞান", "ইন্টারনেট", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "সাইবার", 
            "সাইবার নিরাপত্তা", "সাইবার হামলা", "সফটওয়্যার", "হার্ডওয়্যার", "টেলিকম", 
            "টেলিকমিউনিকেশন", "স্যাটেলাইট", "ডিজিটাল", "রোবট", "রোবোটিক্স", "হ্যাকিং", 
            "হ্যাকার", "স্টার্টআপ", "ক্লাউড", "ক্লাউড কম্পিউটিং", "অ্যালগরিদম", "ডেটা", 
            "তথ্যপ্রযুক্তি", "সেমিকন্ডাক্টর", "চিপ", "মহাকাশ", "নাসা", "স্পেসএক্স", 
            "প্রযুক্তি প্রতিষ্ঠান", "টেলিযোগাযোগ", "বিটিআরসি", "স্মার্টফোন", "মোবাইল অ্যাপ", 
            "কোডিং", "প্রোগ্রামিং", "সার্ভার"
        ]
    },
    "climate_environment": {
        "en": "Climate & Environment",
        "bn": "পরিবেশ ও জলবায়ু",
        "keywords": [
            # English
            "climate", "climate change", "flood", "flooding", "river", "environment", 
            "environmental", "pollution", "air quality", "aqi", "cyclone", "forest", 
            "delta", "renewable", "energy", "solar", "biodiversity", "wildlife", "drought", 
            "carbon", "emission", "heatwave", "rain", "monsoon", "disaster", "ecology",
            # Bengali
            "পরিবেশ", "জলবায়ু", "জলবায়ু পরিবর্তন", "বন্যা", "প্লাবন", "নদী", "নদীভাঙন", 
            "দূষণ", "বায়ুদূষণ", "শব্দদূষণ", "পানিদূষণ", "ঘূর্ণিঝড়", "সাইক্লোন", "ডেল্টা", 
            "ব-দ্বীপ", "নবায়নযোগ্য", "জ্বালানি", "সৌরবিদ্যুৎ", "সৌরশক্তি", "তাপপ্রবাহ", 
            "বৃষ্টি", "বৃষ্টিপাত", "ভারী বর্ষণ", "দুর্যোগ", "দুর্যোগ ব্যবস্থাপনা", "বন", 
            "বনাঞ্চল", "সুন্দরবন", "জীববৈচিত্র্য", "খরা", "কার্বন", "কার্বন নির্গমন", 
            "একিউআই", "আবহাওয়া", "আবহাওয়া অধিদপ্তর", "সমুদ্রপৃষ্ঠ", "তিস্তা"
        ]
    },
    "world_diplomacy": {
        "en": "World & Geopolitics",
        "bn": "আন্তর্জাতিক ও কূটনীতি",
        "keywords": [
            # English
            "world", "international", "global", "geopolitics", "geopolitical", "diplomacy", 
            "diplomatic", "foreign", "foreign policy", "foreign minister", "ambassador", 
            "embassy", "treaty", "summit", "bilateral", "sanctions", "war", "conflict", 
            "ceasefire", "peacekeeping", "military", "nato", "pentagon", "white house", 
            "kremlin", "un", "united nations", "security council", "epstein",
            # Countries and Demonyms (English)
            "india", "indian", "delhi", "modi", "pakistan", "pakistani", "islamabad", 
            "china", "chinese", "beijing", "xi jinping", "usa", "america", "american", 
            "washington", "biden", "trump", "russia", "russian", "moscow", "putin", 
            "ukraine", "kyiv", "zelensky", "israel", "israeli", "netanyahu", "palestine", 
            "palestinian", "gaza", "hamas", "iran", "iranian", "tehran", "middle east", 
            "saudi", "riyadh", "uae", "dubai", "qatar", "myanmar", "burma", "rohingya", 
            "japan", "japanese", "tokyo", "uk", "british", "britain", "london", "europe", 
            "european", "france", "french", "germany", "german", "turkey", "turkish", 
            "north korea", "south korea", "taiwan", "canada", "australia",
            # Countries, Demonyms, Leaders & Terms (Bengali)
            "আন্তর্জাতিক", "বিশ্ব", "কূটনীতি", "কূটনৈতিক", "পররাষ্ট্র", "পররাষ্ট্র মন্ত্রণালয়", 
            "পররাষ্ট্রমন্ত্রী", "যুদ্ধ", "সংঘাত", "যুদ্ধবিরতি", "শান্তি", "শান্তি মিশন", 
            "সামরিক", "ন্যাটো", "যুক্তরাষ্ট্র", "আমেরিকা", "মার্কিন", "হোয়াইট হাউস", "পেন্টাগন", 
            "ভারত", "ভারতীয়", "নয়াদিল্লি", "দিল্লি", "মোদি", "চীন", "চীনা", "বেইজিং", 
            "শি জিনপিং", "পাকিস্তান", "পাকিস্তানি", "ইসলামাবাদ", "রাশিয়া", "রুশ", "মস্কো", 
            "পুতিন", "ইউক্রেন", "কিয়েভ", "জেলেনস্কি", "ইসরায়েল", "ইসরাইল", "নেতানিয়াহু", 
            "ফিলিস্তিন", "গাজা", "হামাস", "ইরান", "ইরানি", "তেহরান", "মধ্যপ্রাচ্য", 
            "সৌদি আরব", "সৌদি", "রিয়াদ", "সংযুক্ত আরব আমিরাত", "দুবাই", "কাতার", "দোহা", 
            "মায়ানমার", "মিয়ানমার", "বর্মা", "জান্তা", "রোহিঙ্গা", "জাতিসংঘ", "নিরাপত্তা পরিষদ", 
            "সাধারণ পরিষদ", "চুক্তি", "দ্বিপক্ষীয়", "বহুপক্ষীয়", "ভূরাজনীতি", "নিষেধাজ্ঞা", 
            "স্যাংশন", "জাপান", "জাপানি", "টোকিও", "যুক্তরাজ্য", "ব্রিটেন", "ব্রিটিশ", 
            "লন্ডন", "ইউরোপ", "ইউরোপীয় ইউনিয়ন", "ইইউ", "ফ্রান্স", "ফরাসি", "জার্মানি", 
            "জার্মান", "তুরস্ক", "তুর্কি", "এরদোয়ান", "উত্তর কোরিয়া", "দক্ষিণ কোরিয়া", 
            "তাইওয়ান", "রাষ্ট্রদূত", "দূতাবাস", "সম্মেলন", "শীর্ষ সম্মেলন", "বাইডেন", "ট্রাম্প"
        ]
    },
    "society_education": {
        "en": "Society & Education",
        "bn": "সমাজ ও শিক্ষা",
        "keywords": [
            # English
            "education", "university", "college", "school", "student", "students", 
            "teacher", "teachers", "health", "hospital", "doctor", "medical", 
            "culture", "cultural", "public health", "campus", "academic", "youth", 
            "citizens", "religion", "religious", "community", "social", "welfare", 
            "human rights", "madrasa",
            # Bengali
            "শিক্ষা", "উচ্চশিক্ষা", "প্রাথমিক শিক্ষা", "মাধ্যমিক", "বিশ্ববিদ্যালয়", 
            "কলেজ", "স্কুল", "মাদ্রাসা", "শিক্ষার্থী", "ছাত্র", "ছাত্রী", "শিক্ষক", 
            "উপাচার্য", "ভিসি", "ক্যাম্পাস", "স্বাস্থ্য", "স্বাস্থ্যসেবা", "হাসপাতাল", 
            "ডাক্তার", "চিকিৎসক", "নার্স", "মেডিকেল", "চিকিৎসা", "ওষুধ", "জনস্বাস্থ্য", 
            "মহামারী", "নাগরিক", "নাগরিক সমাজ", "সংস্কৃতি", "সাংস্কৃতিক", "সমাজ", 
            "সামাজিক", "যুবসমাজ", "তরুণ", "ধর্ম", "ধর্মীয়", "কল্যাণ", "মানবাধিকার"
        ]
    },
    "sports_fitness": {
        "en": "Sports",
        "bn": "খেলাধুলা",
        "keywords": [
            # English
            "cricket", "football", "soccer", "goal", "ipl", "bpl", "world cup", "match", 
            "wicket", "fifa", "uefa", "messi", "ronaldo", "champions league", "premier league", 
            "la liga", "bundesliga", "serie a", "europa league", "derby", "striker", "goalkeeper",
            "coach", "tennis", "badminton", "hockey", "athletics", "olympics", "nba", "basketball",
            "formula 1", "grand slam", "wimbledon", "stadium", "tournament", "semi-final", 
            "quarter-final", "penalty shootout", "clean sheet", "arsenal", "bayern", "munich", 
            "barcelona", "real madrid", "chelsea", "liverpool", "manchester city", "man city", 
            "manchester united", "man utd", "juventus", "psg", "tottenham", "borussia", "atletico",
            "bcb", "tamim", "shakib", "mashrafe", "mushfiqur", "test match", "odi", "t20",
            # Bengali
            "খেলাধুলা", "ক্রিকেট", "ফুটবল", "গোল", "আইপিএল", "বিপিএল", "বিশ্বকাপ", "উইকেট", 
            "ফিফা", "আর্সেনাল", "বায়ার্ন", "বার্সেলোনা", "রিয়াল মাদ্রিদ", "ম্যানচেস্টার", 
            "মেসি", "রোনালদো", "চ্যাম্পিয়নস লিগ", "প্রিমিয়ার লিগ", "সেমিফাইনাল", "কোয়ার্টার ফাইনাল",
            "স্ট্রাইকার", "গোলরক্ষক", "স্টেডিয়াম", "বিসিবি", "সাকিব", "তামিম", "মুশফিক", "মাশরাফি", 
            "টেস্ট", "ওয়ানডে", "টি-টোয়েন্টি", "টেনিস", "ব্যাডমিন্টন", "অলিম্পিক", "অ্যাথলেটিকস"
        ]
    }
}

# =====================================================================
# 3. Canonical Entity Dictionary for Cross-Lingual Deduplication
# =====================================================================
CANONICAL_ENTITIES = {
    # Monetary / Banking
    "bangladesh_bank": ["bangladesh bank", "বাংলাদেশ ব্যাংক", "central bank", "কেন্দ্রীয় ব্যাংক"],
    "repo_rate": ["repo rate", "রেপো রেট", "policy rate", "নীতিগত সুদহার"],
    "inflation": ["inflation", "মুদ্রাস্ফীতি", "মূল্যস্ফীতি", "price hike", "দ্রব্যমূল্য"],
    "forex_reserves": ["forex reserve", "foreign exchange", "রিজার্ভ", "বৈদেশিক মুদ্রা"],
    "nbr_tax": ["nbr", "national board of revenue", "জাতীয় রাজস্ব বোর্ড", "আয়কর", "tax revenue"],
    "world_bank_imf": ["imf", "world bank", "বিশ্বব্যাংক", "আন্তর্জাতিক মুদ্রা তহবিল"],
    
    # Judiciary & Constitution
    "high_court": ["high court", "supreme court", "হাইকোর্ট", "সুপ্রিম কোর্ট", "আপিল বিভাগ"],
    "constitution": ["constitution", "সংবিধান", "constitutional", "সাংবিধানিক"],
    "writ_petition": ["writ", "রিট", "public interest litigation"],
    "bpsc": ["bpsc", "public service commission", "বিপিএসসি", "কর্মকমিশন"],
    "election_commission": ["election commission", "নির্বাচন কমিশন", "ইসি"],
    "anti_corruption": ["dudok", "acc", "দুদক", "anti-corruption commission"],
    
    # Geopolitics
    "india_bd": ["india", "delhi", "ভারত", "নয়া দিল্লি", "তিস্তা", "teesta"],
    "china_bd": ["china", "beijing", "চীন", "বেইজিং"],
    "usa_bd": ["united states", "usa", "যুক্তরাষ্ট্র", "ওয়াশিংটন", "washington"],
    "rohingya": ["rohingya", "myanmar", "রোহিঙ্গা", "মিয়ানমার"],

    # Politics & Governance Developments
    "tarique_visit": ["tarique", "তারেক রহমান", "japan", "জাপান", "tokyo", "টোকিও"],
    "ishraque_issue": ["ishraque", "ইশরাক", "ইশরাক হোসেন", "পদত্যাগ"],
    "bnp_politics": ["bnp", "বিএনপি", "খালেদা জিয়া"],
    "interim_cabinet": ["interim government", "অন্তর্বর্তী সরকার", "প্রধান উপদেষ্টা", "ইউনূস", "yunus", "উপদেষ্টা পরিষদ"],
    
    # Climate & Tech
    "delta_plan": ["delta plan", "ব-দ্বীপ পরিকল্পনা", "bep 2100"],
    "ai_tech": ["artificial intelligence", "generative ai", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "machine learning"]
}

# =====================================================================
# 4. Strict Noise Filter (Exclusion keywords)
# =====================================================================
EXCLUSION_KEYWORDS = [
    # Showbiz, Celebrity & Tabloid Gossip (Noise)
    "bollywood", "hollywood", "dhallywood", "actor", "actress", "wedding", "divorce", 
    "movie", "cinema", "box office", "horoscope", "celebrity", "drama", "hero", "heroine", 
    "ott", "web series", "song", "trailer", "teaser", "pageant", "miss world", "miss universe",
    "viral video", "viral photo", "leaked photo", "intimate photo",
    "অভিনেতা", "অভিনেত্রী", "সিনেমা", "নাটক", "তারকা", "রাশিফল", "নায়ক", "নায়িকা", 
    "বিনোদন", "সঙ্গীত", "গান", "ট্রেলার",
    
    # Commercial shopping, gadget discounts & deals (Noise)
    "discount", "deal", "deals", "refurbished", "sale", "save $", "coupon", "cashback",
    "mouse", "headset", "earbuds", "best buy", "amazon deal", "prime day", "black friday", "cyber monday",
    "ছাড়", "মূল্যছাড়", "ডিসকাউন্ট", "অফার", "সেল",

    # Petty / Local Blotter Crime (Noise)
    "road accident", "killed in road", "motorcycle accident", "সড়ক দুর্ঘটনা", "লাশ উদ্ধার",
    "মরদেহ উদ্ধার", "ঝুলন্ত মরদেহ", "ছিনতাই", "ছিনতাইকারী", "পকেটমার", "চুরি", "চোর", "বখাটে",
    "ইভটিজিং", "অটোরিকশা চুরি", "গরু চুরি", "মোবাইল চুরি", "মোটরসাইকেল চুরি", "মুঠোফোন ছিনতাই",
    "মোবাইল ছিনতাই", "pickpocket", "petty theft", "phone snatching", "bag snatching",

    # TV Broadcast Guides, Daily Fixtures & Daily Routine Noise
    "টিভিতে আজকের খেলা", "টিভিতে খেলা", "আজকের খেলা", "খেলার সূচি", "খেলার সময়সূচি",
    "টিভি সূচি", "টিভির সূচি", "আজকের সূচি", "আজকের ম্যাচ", "টিভিতে দেখুন", "খেলা লাইভ",
    "আজকের নামাজের সময়", "নামাজের সময়সূচি", "আজকের আবহাওয়া",
    "tv schedule", "where to watch", "how to watch", "streaming guide", "match schedule",

    # Lifestyle, Health Fluff, Diet, Recipes & Beauty Blogs (Noise)
    "রক্তে শর্করা", "কোলেস্টেরল নিয়ন্ত্রণ", "ওজন কমানো", "ওজন কমাতে", "ত্বকের যত্ন",
    "চুল পড়া", "চুলের যত্ন", "কফি খেলে কি", "ব্ল্যাক কফি", "ডায়েট", "রেসিপি", "রান্না",
    "রান্নার রেসিপি", "স্বাস্থ্য টিপস", "রূপচর্চা", "জীবনযাপন টিপস", "সৌন্দর্য চর্চা",
    "beauty tips", "health tips", "weight loss", "skincare", "hair care", "diet tips", "recipe"
]
