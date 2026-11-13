"""
Fact-check pass.

A second, independent Gemini call compares a synthesized story with the source
reporting it was written from and lists every claim the sources do not support.

Outcome:
- A headline, lead or bullet with an unsupported claim fails the story.
- An unsupported impact or background paragraph is removed and the story passes.
- If the checker itself is unavailable the story is marked "unchecked".
"""
from datetime import datetime, timezone
from typing import List

from pipeline.models import CapsuleStory, RawArticle
from pipeline.processing.llm import generate_json

SOURCE_CHAR_LIMIT = 6000
CORE_FIELDS = ("title", "lead", "bullets")
TRIMMABLE_FIELDS = ("impact", "details")


def build_source_text(articles: List[RawArticle]) -> str:
    """The reporting the story may draw on: the lead article's body plus every member's headline and summary."""
    lead = articles[0]
    parts = [f"PRIMARY REPORT ({lead.source})\nHeadline: {lead.title}\n{lead.body_text or lead.summary_raw or ''}"]
    for art in articles[1:]:
        parts.append(f"ALSO REPORTED BY {art.source}\nHeadline: {art.title}\n{art.summary_raw or ''}")
    return "\n\n".join(parts)[:SOURCE_CHAR_LIMIT]


def _story_fields(buzz) -> dict:
    return {
        "title_en": buzz.title_en, "title_bn": buzz.title_bn,
        "lead_en": buzz.lead_en, "lead_bn": buzz.lead_bn,
        "bullets_en": buzz.bullets_en, "bullets_bn": buzz.bullets_bn,
        "impact_en": buzz.impact_en, "impact_bn": buzz.impact_bn,
        "details_en": buzz.details_en, "details_bn": buzz.details_bn,
    }


def fact_check_story(story: CapsuleStory, articles: List[RawArticle]) -> dict:
    """
    Checks story.daily_buzz against its sources, trims unsupported optional
    fields in place, and returns {"status", "issues", "checked_at"} where
    status is "passed", "failed" or "unchecked".
    """
    checked_at = datetime.now(timezone.utc).isoformat()
    buzz = story.daily_buzz
    if buzz is None:
        return {"status": "unchecked", "issues": [], "checked_at": checked_at}

    fields = _story_fields(buzz)
    field_lines = "\n".join(f"{name}: {value}" for name, value in fields.items() if value)

    prompt = f"""You are a fact-checker at a news service. Compare the STORY with the SOURCE REPORTING it was written from.

SOURCE REPORTING:
{build_source_text(articles)}

STORY FIELDS:
{field_lines}

List every claim in the STORY that the SOURCE REPORTING does not support. Check in particular:
- names, titles and roles of people and organisations
- numbers, amounts, percentages, dates and places
- quotes and who said them
- what happened, who did it, and stated causes or consequences
- a Bengali field that says something different from its English counterpart

A claim is supported only if the source states it or it follows directly from what the source states. General knowledge added by the writer that the source does not state counts as unsupported. Wording differences and faithful translation are fine.

Return JSON only:
{{"unsupported": [{{"field": "lead_en", "claim": "the unsupported claim", "why": "short reason"}}]}}
Return {{"unsupported": []}} when everything is supported."""

    try:
        reply = generate_json(prompt, temperature=0.0)
    except Exception as err:
        print(f"   ⚠️ Fact-check unavailable: {err}")
        return {"status": "unchecked", "issues": [], "checked_at": checked_at}

    raw_issues = reply.get("unsupported") if isinstance(reply, dict) else None
    if not isinstance(raw_issues, list):
        return {"status": "unchecked", "issues": [], "checked_at": checked_at}

    issues = [
        {"field": str(i.get("field", "")), "claim": str(i.get("claim", "")), "why": str(i.get("why", ""))}
        for i in raw_issues
        # An issue that names no claim cannot be acted on or audited, so it is ignored.
        if isinstance(i, dict) and i.get("field") in fields and str(i.get("claim") or "").strip()
    ]

    core_issues = [i for i in issues if i["field"].startswith(CORE_FIELDS)]
    if core_issues:
        return {"status": "failed", "issues": core_issues, "checked_at": checked_at}

    # Only optional fields are affected: drop them in both languages and keep the story.
    for prefix in TRIMMABLE_FIELDS:
        if any(i["field"].startswith(prefix) for i in issues):
            setattr(buzz, f"{prefix}_en", None)
            setattr(buzz, f"{prefix}_bn", None)

    return {"status": "passed", "issues": issues, "checked_at": checked_at}
