from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

class RawArticle(BaseModel):
    id: str
    source: str
    url: str
    title: str
    summary_raw: Optional[str] = None
    body_text: Optional[str] = None
    image_url: Optional[str] = None
    published_at: Optional[str] = None
    language: str  # "en" | "bn"
    category_hint: Optional[str] = None
    region: Optional[str] = "national"  # "national" | "international"

class StatPoint(BaseModel):
    metric_name: str
    value: str
    source_org: str  # "BBS" | "Bangladesh Bank" | "World Bank" | "IMF" | "Ministry of Finance" | etc.
    context: str

class ConstitutionalCitation(BaseModel):
    article_number: str  # e.g., "Article 15(a)" or "অনুচ্ছেদ ১৫ (ক)"
    article_title_bn: str
    article_title_en: str
    legal_relevance: str

class WrittenExamPrompt(BaseModel):
    marks: int = 15  # 10 or 15
    prompt_text_bn: str
    prompt_text_en: str
    model_outline_points: List[str]

class PyqReference(BaseModel):
    pyq_id: str
    bcs_batch: str  # e.g., "44th BCS Written"
    subject: str    # "Bangladesh Affairs"
    question_snippet: str
    relevance_score: float = 0.9

class SyllabusMapping(BaseModel):
    paper_code: str = "Paper V"  # e.g. "Paper V", "Paper VI", "Paper IV"
    subject: str = "Bangladesh Affairs"
    microtheme: str = "Macroeconomy, Trade & Foreign Reserves"
    full_breadcrumb: str = "Bangladesh Affairs (Paper V) › Macroeconomy, Trade & Foreign Reserves"

class QuestionBreakdown(BaseModel):
    question: str
    anchor_points: List[str]  # e.g. ["**Core Policy:** Definition", "**Administrative Mechanism:** How BB enforces it"]

class DailyBuzzItem(BaseModel):
    title_bn: str
    title_en: str
    summary_bn: str  # 2-3 sentences in clear universal Bengali
    summary_en: str  # 2-3 sentences in clear universal English
    why_it_matters_bn: Optional[str] = None   # Deprecated — kept for Firestore backwards-compatibility
    why_it_matters_en: Optional[str] = None   # Deprecated — kept for Firestore backwards-compatibility
    interest_categories: List[str]  # e.g. ["economy_business", "governance_law"]
    read_time_seconds: int = 60
    published_at: Optional[str] = None

    # Gen-Z 10-Second Gist Fields (v3.0)
    lead_bn: Optional[str] = None
    lead_en: Optional[str] = None
    bullets_bn: List[str] = []
    bullets_en: List[str] = []
    impact_bn: Optional[str] = None
    impact_en: Optional[str] = None
    details_bn: Optional[str] = None
    details_en: Optional[str] = None
    # Social: spoken opening line for Reels and an optional question for readers
    hook_bn: Optional[str] = None
    kicker_bn: Optional[str] = None     # 1-3 word label above the Reel hook
    share_value: bool = False           # useful enough to forward (dates, prices, closures)
    question_bn: Optional[str] = None

class BcsProItem(BaseModel):
    syllabus_mapping: Optional[SyllabusMapping] = None
    bcs_subject_area: str = "Trending Affairs"  # Kept for Flutter backwards-compatibility
    why_in_the_news_en: Optional[str] = None
    why_in_the_news_bn: Optional[str] = None
    question_breakdowns: List[QuestionBreakdown] = []
    data_stats: List[StatPoint] = []
    constitutional_articles: List[ConstitutionalCitation] = []
    challenges: List[str] = []   # Structural bottlenecks / challenges
    way_forward: List[str] = []  # Actionable policy / analysis recommendations
    government_initiatives: List[str] = []
    conclusion: Optional[str] = None
    analytical_breakdown_bn: Optional[str] = ""
    analytical_breakdown_en: Optional[str] = ""
    written_exam_prompt: Optional[WrittenExamPrompt] = None
    linked_pyqs: List[PyqReference] = []

class AudioChapterCue(BaseModel):
    timestamp_seconds: int
    display_time: str  # e.g. "01:24"
    title: str
    transcript_snippet: str

class CapsuleStory(BaseModel):
    story_id: str
    primary_category: str
    interest_categories: List[str]
    region: Optional[str] = "national"
    tags: List[str] = []
    image_url: Optional[str] = None
    image_caption: Optional[str] = None
    published_at: Optional[str] = None
    is_bcs_pro_selected: bool = False  # True if featured in trending capsule
    importance_score: float = 2.0
    rank_score: float = 1.0
    sources: List[Dict[str, str]]
    daily_buzz: DailyBuzzItem
    bcs_pro: Optional[BcsProItem] = None

class DailyCapsule(BaseModel):
    edition_date: str  # YYYY-MM-DD
    created_at: str
    status: str = "PENDING_REVIEW"  # "PENDING_REVIEW" | "APPROVED" | "PUBLISHED"
    
    # 1. Fixed Academic Preset for BCS Aspirants (Top 3-5 stories)
    bcs_pro_preset_story_ids: List[str]
    
    # 2. Complete Story Pool (8-12 stories) that feeds both BCS preset and personalized Daily Buzz
    stories: List[CapsuleStory]
    
    # Metadata
    total_stories: int
    review_notes: Optional[str] = None
