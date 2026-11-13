"""
Fact-check pass.

An independent Gemini call compares synthesized stories with the source
reporting they were written from and lists every claim the sources do not
support. All of a run's stories are checked in one call to conserve quota.

Outcome per story:
- A headline, lead or bullet with an unsupported claim fails the story.
- An unsupported impact or background paragraph is removed and the story passes.
- If the checker itself is unavailable the story is marked "unchecked".
"""
from datetime import datetime, timezone
from typing import List, Tuple

from pipeline.models import CapsuleStory, RawArticle
from pipeline.processing.llm import generate_json

SOURCE_CHAR_LIMIT = 6000
BATCH_SOURCE_CHAR_LIMIT = 4000
CORE_FIELDS = ("title", "lead", "bullets")
TRIMMABLE_FIELDS = ("impact", "details")

CHECK_INSTRUCTIONS = """List every claim in a STORY that its SOURCE REPORTING does not support. Check in particular:
- names, titles and roles of people and organisations
- numbers, amounts, percentages, dates and places
- quotes and who said them
- what happened, who did it, and stated causes or consequences
- a Bengali field that says something different from its English counterpart

A claim is supported only if the source states it or it follows directly from what the source states. General knowledge added by the writer that the source does not state counts as unsupported. Wording differences and faithful translation are fine. Judge each story only against its own source reporting."""


def build_source_text(articles: List[RawArticle], limit: int = SOURCE_CHAR_LIMIT) -> str:
    """The reporting a story may draw on: the lead article's body plus every member's headline and summary."""
    lead = articles[0]
    others = "".join(
        f"\n\nALSO REPORTED BY {art.source}\nHeadline: {art.title}\n{(art.summary_raw or '')[:400]}"
        for art in articles[1:]
    )
    head = f"PRIMARY REPORT ({lead.source})\nHeadline: {lead.title}\n"
    # The lead body is cut first so the other outlets' reports always fit.
    body_room = max(500, limit - len(head) - len(others))
    return head + (lead.body_text or lead.summary_raw or "")[:body_room] + others


def _story_fields(buzz) -> dict:
    return {
        "title_en": buzz.title_en, "title_bn": buzz.title_bn,
        "lead_en": buzz.lead_en, "lead_bn": buzz.lead_bn,
        "bullets_en": buzz.bullets_en, "bullets_bn": buzz.bullets_bn,
        "impact_en": buzz.impact_en, "impact_bn": buzz.impact_bn,
        "details_en": buzz.details_en, "details_bn": buzz.details_bn,
    }


def _apply_issues(story: CapsuleStory, raw_issues, checked_at: str) -> dict:
    """Turns the checker's raw findings for one story into a verdict, trimming optional fields in place."""
    buzz = story.daily_buzz
    fields = _story_fields(buzz)
    issues = [
        {"field": str(i.get("field", "")), "claim": str(i.get("claim", "")), "why": str(i.get("why", ""))}
        for i in (raw_issues or [])
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


def fact_check_stories(pairs: List[Tuple[CapsuleStory, List[RawArticle]]]) -> List[dict]:
    """
    Checks every (story, source articles) pair in ONE Gemini call.
    Returns one {"status", "issues", "checked_at"} per pair, in order; status is
    "passed", "failed" or "unchecked" (checker unavailable).
    """
    checked_at = datetime.now(timezone.utc).isoformat()
    unchecked = {"status": "unchecked", "issues": [], "checked_at": checked_at}
    if not pairs:
        return []

    blocks = []
    for n, (story, articles) in enumerate(pairs, 1):
        fields = _story_fields(story.daily_buzz)
        field_lines = "\n".join(f"{name}: {value}" for name, value in fields.items() if value)
        blocks.append(
            f"===== STORY {n} =====\nSOURCE REPORTING:\n"
            f"{build_source_text(articles, BATCH_SOURCE_CHAR_LIMIT)}\n\nSTORY FIELDS:\n{field_lines}"
        )

    prompt = (
        "You are a fact-checker at a news service. Each numbered STORY below was written from the "
        "SOURCE REPORTING shown with it.\n\n" + CHECK_INSTRUCTIONS + "\n\n" + "\n\n".join(blocks) +
        "\n\nReturn JSON only, with one entry per story, in order:\n"
        '{"results": [{"story": 1, "unsupported": [{"field": "lead_en", "claim": "the unsupported claim", '
        '"why": "short reason"}]}]}\n'
        'Use "unsupported": [] for a story where everything is supported.'
    )

    try:
        reply = generate_json(prompt, temperature=0.0)
    except Exception as err:
        print(f"   ⚠️ Fact-check unavailable: {err}")
        return [dict(unchecked) for _ in pairs]

    by_story = {}
    for entry in (reply.get("results") if isinstance(reply, dict) else None) or []:
        if isinstance(entry, dict) and isinstance(entry.get("story"), int) and isinstance(entry.get("unsupported"), list):
            by_story[entry["story"]] = entry["unsupported"]

    return [
        _apply_issues(story, by_story[n], checked_at) if n in by_story else dict(unchecked)
        for n, (story, _articles) in enumerate(pairs, 1)
    ]


def fact_check_story(story: CapsuleStory, articles: List[RawArticle]) -> dict:
    """Checks a single story. See fact_check_stories."""
    return fact_check_stories([(story, articles)])[0]
