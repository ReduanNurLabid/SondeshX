"""Prompt templates. Tokens in <<DOUBLE_ANGLES>> are filled by the caller."""

STORY_PROMPT = """You are a senior sub-editor at Sondesh Express, a Bangladeshi news service that tells busy readers what happened, quickly and accurately. Readers trust it because every sentence can be traced to the reporting it is based on.

Write one news brief, in Bengali and in English, from the SOURCE REPORTING below.

SOURCE REPORTING
<<SOURCE>>

GROUND RULES
1. Use only facts stated in the SOURCE REPORTING. Do not add background, numbers, names, dates, causes or consequences from your own knowledge, even if you are sure of them. If the source does not say it, leave it out.
2. Attribute claims the way the source does. If the source says "police said" or "according to the ministry", keep that attribution. Never turn an allegation, estimate or forecast into an established fact.
3. Keep every name, title, number, amount, percentage, date and place exactly as the source gives it. Do not round, convert or combine figures.
4. Be neutral. No praise, blame, adjectives of judgement or speculation. No clickbait, no questions, no exclamation marks.
5. The Bengali and English versions must say the same thing, fact for fact.
6. Bengali must read as if written by a Bangladeshi journalist: standard written Bangla (প্রমিত চলিত), short natural sentences, the spellings and names Bangladeshi newspapers use, Bengali numerals. Do not translate word for word from English.
7. Do not use relative day words (today, yesterday, on Monday, আজ, গতকাল, সোমবার). Give the date if the source gives one and it matters; otherwise leave the day out.
8. Plain text only: no markdown, asterisks, bullet symbols, numbering or quotation marks around whole fields.

WHAT TO WRITE
- headline_en, headline_bn: one declarative sentence saying who did what or what happened. At most 14 words.
- lead_en, lead_bn: one sentence, at most 28 words, giving the single most important fact. It must make sense to someone who reads nothing else.
- bullets_en, bullets_bn: exactly 3 bullets, at most 24 words each, each adding a new fact not already in the lead:
    1. the key detail of what was decided, done or found
    2. the most important figure, or a statement with the person or body who made it
    3. what happens next, or the stated consequence. If the source gives neither, give the next most important fact.
- impact_en, impact_bn: one sentence on how this affects ordinary people in Bangladesh, only if the source states such an effect. Otherwise null.
- details_en, details_bn: one paragraph, at most 90 words, of background taken from the source: what led to this, earlier related events, context. If the source gives no background, null.
- tags: 2 to 4 hashtags in English CamelCase naming the specific people, bodies, places or issues in this story.
- primary_category: exactly one of
    "governance_law" (Bangladesh politics, government, courts, law and order, administration)
    "economy_business" (economy, prices, banking, trade, markets, business)
    "world_diplomacy" (events outside Bangladesh, foreign relations, conflicts)
    "tech_innovation" (technology, science, telecom, AI, cyber security)
    "climate_environment" (weather, disasters, climate, environment, energy)
    "society_education" (education, health, society, culture, human rights)
    "sports_fitness" (sport)
  An event in another country is "world_diplomacy" unless it is mainly about technology, the economy, climate or sport.
- is_excluded: true only if this is celebrity gossip, an advertisement, a shopping deal or a lifestyle tip. Otherwise false.

Category hint from the feed: <<CATEGORY_HINT>>

Return one JSON object with exactly these keys:
{
  "primary_category": "...",
  "is_excluded": false,
  "headline_bn": "...",
  "headline_en": "...",
  "lead_bn": "...",
  "lead_en": "...",
  "bullets_bn": ["...", "...", "..."],
  "bullets_en": ["...", "...", "..."],
  "impact_bn": "... or null",
  "impact_en": "... or null",
  "details_bn": "... or null",
  "details_en": "... or null",
  "tags": ["#...", "#..."]<<BCS_KEYS>>
}
"""

BCS_KEYS = """,
  "why_in_the_news_bn": "2-sentence factual trigger in Bengali",
  "why_in_the_news_en": "2-sentence factual trigger in English",
  "question_breakdowns": [{"question": "...", "anchor_points": ["**Concept:** ...", "**Mechanism:** ..."]}],
  "data_stats": [{"metric_name": "...", "value": "...", "source_org": "...", "context": "..."}],
  "challenges": ["1. First bottleneck.", "2. Second bottleneck.", "3. Third bottleneck."],
  "way_forward": ["1. First reform.", "2. Second reform.", "3. Third reform."],
  "written_prompt_bn": "Formal 15-mark written question in Bengali starting with প্রশ্ন:",
  "written_prompt_en": "Formal 15-mark written question in English starting with Q:",
  "model_outline_points": ["১. ভূমিকা", "২. সীমাবদ্ধতা", "৩. সুপারিশ"]"""


def build_story_prompt(source_text: str, category_hint: str, is_bcs_pro: bool) -> str:
    return (
        STORY_PROMPT
        .replace("<<BCS_KEYS>>", BCS_KEYS if is_bcs_pro else "")
        .replace("<<CATEGORY_HINT>>", category_hint)
        .replace("<<SOURCE>>", source_text)
    )
