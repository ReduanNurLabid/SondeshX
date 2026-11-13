import os
import glob
from typing import List, Optional, Dict, Any
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore
from pipeline.models import CapsuleStory, DailyCapsule

_db: Optional[firestore.Client] = None

def get_firestore_client() -> firestore.Client:
    """Initializes and caches the Firestore client using the service account certificate."""
    global _db
    if _db is not None:
        return _db

    import json
    json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if json_str:
        try:
            cert_dict = json.loads(json_str)
            if not firebase_admin._apps:
                cred = credentials.Certificate(cert_dict)
                firebase_admin.initialize_app(cred)
            _db = firestore.client()
            return _db
        except Exception as err:
            print(f"[Firebase] Warning: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: {err}")

    # Look for certificate in project root or environment variable
    cert_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not cert_path or not os.path.exists(cert_path):
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        # Match standard or downloaded key files
        candidates = glob.glob(os.path.join(root_dir, "*firebase-adminsdk*.json"))
        if not candidates:
            candidates = glob.glob(os.path.join(root_dir, "serviceAccountKey.json"))
        if candidates:
            cert_path = candidates[0]

    if not cert_path or not os.path.exists(cert_path):
        raise FileNotFoundError(
            "Firebase service account key JSON not found. Please place serviceAccountKey.json in the project root."
        )

    if not firebase_admin._apps:
        cred = credentials.Certificate(cert_path)
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db


def push_hourly_buzz_to_firestore(stories: List[Dict[str, Any]]) -> int:
    """
    Pushes hourly 60-second news cards into Firestore 'daily_buzz' collection.
    Uses story_id as document ID for clean deduplication / idempotency.
    """
    db = get_firestore_client()
    batch = db.batch()
    count = 0

    for story in stories:
        story_id = story.get("story_id")
        if not story_id:
            continue

        doc_ref = db.collection("daily_buzz").document(story_id)
        hourly_ref = db.collection("hourly_buzz").document(story_id)
        pub_at = story.get("published_at") or (story.get("daily_buzz", {}) or {}).get("published_at") or datetime.now().astimezone().isoformat()
        buzz_dict = dict(story.get("daily_buzz", {}))
        buzz_dict["published_at"] = pub_at
        buzz_dict["publishedAt"] = pub_at

        payload = {
            "story_id": story_id,
            "storyId": story_id,
            "primary_category": story.get("primary_category", "governance_law"),
            "primaryCategory": story.get("primary_category", "governance_law"),
            "interest_categories": story.get("interest_categories", []),
            "interestCategories": story.get("interest_categories", []),
            "tags": story.get("tags", []),
            "image_url": story.get("image_url"),
            "imageUrl": story.get("image_url"),
            "sources": story.get("sources", []),
            "published_at": pub_at,
            "publishedAt": pub_at,
            "daily_buzz": buzz_dict,
            "dailyBuzz": buzz_dict,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "is_active": True
        }
        batch.set(doc_ref, payload, merge=True)
        batch.set(hourly_ref, payload, merge=True)
        count += 1

    batch.commit()
    return count


def get_recent_published_stories(limit: int = 30, max_age_hours: float = 30.0) -> List[Dict[str, Any]]:
    """
    Fetches recent stories from Firestore 'daily_buzz' and 'hourly_buzz' collections
    within the past 30 hours to maintain cross-run event memory and prevent duplicate story generation.
    Falls back to data/output/hourly_buzz_latest.json if Firestore is unreachable.
    """
    import json
    stories = []
    seen_ids = set()

    try:
        db = get_firestore_client()
        # Fetch from daily_buzz
        docs = db.collection("daily_buzz").order_by(
            "published_at", direction=firestore.Query.DESCENDING
        ).limit(limit).stream()
        for doc in docs:
            data = doc.to_dict()
            s_id = data.get("story_id") or doc.id
            pub_str = data.get("published_at") or data.get("publishedAt")
            is_within_window = True
            if pub_str and max_age_hours:
                try:
                    from datetime import datetime, timezone
                    pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                    if pub_dt.tzinfo is None:
                        pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                    age_h = (datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600.0
                    if age_h > max_age_hours:
                        is_within_window = False
                except Exception:
                    pass
            if s_id and s_id not in seen_ids and is_within_window:
                seen_ids.add(s_id)
                stories.append(data)
                
        # Also check hourly_buzz
        h_docs = db.collection("hourly_buzz").order_by(
            "published_at", direction=firestore.Query.DESCENDING
        ).limit(limit).stream()
        for doc in h_docs:
            data = doc.to_dict()
            s_id = data.get("story_id") or doc.id
            pub_str = data.get("published_at") or data.get("publishedAt")
            is_within_window = True
            if pub_str and max_age_hours:
                try:
                    from datetime import datetime, timezone
                    pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                    if pub_dt.tzinfo is None:
                        pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                    age_h = (datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600.0
                    if age_h > max_age_hours:
                        is_within_window = False
                except Exception:
                    pass
            if s_id and s_id not in seen_ids and is_within_window:
                seen_ids.add(s_id)
                stories.append(data)
    except Exception as e:
        print(f"[Firebase] Warning: Could not fetch recent stories from Firestore: {e}")

    # Fallback / augment with local JSON if available
    local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "output", "hourly_buzz_latest.json"))
    if os.path.exists(local_path):
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
                for s in payload.get("stories", []):
                    s_id = s.get("story_id")
                    if s_id and s_id not in seen_ids:
                        seen_ids.add(s_id)
                        stories.append(s)
        except Exception:
            pass

    return stories


def enrich_story_in_firestore(story_id: str, new_sources: List[Dict[str, Any]]) -> bool:
    """
    Appends new publisher sources to an existing story in 'daily_buzz' and 'hourly_buzz'
    without overwriting the existing synthesis.
    """
    if not new_sources:
        return False
    try:
        db = get_firestore_client()
        for col_name in ["daily_buzz", "hourly_buzz"]:
            doc_ref = db.collection(col_name).document(story_id)
            doc_snap = doc_ref.get()
            if doc_snap.exists:
                doc_data = doc_snap.to_dict()
                existing_sources = doc_data.get("sources", [])
                existing_urls = {
                    (s.get("url") or "").strip().lower() for s in existing_sources if s.get("url")
                }
                existing_names = {
                    (s.get("name") or "").strip().lower() for s in existing_sources if s.get("name")
                }

                added = False
                for src in new_sources:
                    u = (src.get("url") or "").strip().lower()
                    n = (src.get("name") or "").strip().lower()
                    if (not u or u not in existing_urls) and (not n or n not in existing_names):
                        existing_sources.append(src)
                        if u: existing_urls.add(u)
                        if n: existing_names.add(n)
                        added = True

                if added:
                    doc_ref.update({
                        "sources": existing_sources[:4],
                        "updated_at": firestore.SERVER_TIMESTAMP
                    })
        return True
    except Exception as e:
        print(f"[Firebase] Warning: Could not enrich story {story_id}: {e}")
        return False


def stage_bcs_pro_draft_to_firestore(capsule: DailyCapsule) -> str:
    """
    Pushes the morning BCS Pro 7-section Civilsdaily capsule draft to 'bcs_pro_drafts'.
    Document ID is the edition date (YYYY-MM-DD).
    """
    db = get_firestore_client()
    doc_ref = db.collection("bcs_pro_drafts").document(capsule.edition_date)
    
    data = capsule.model_dump()
    data["staged_at"] = firestore.SERVER_TIMESTAMP
    
    doc_ref.set(data, merge=True)
    return capsule.edition_date


def publish_bcs_pro_edition(edition_date: str) -> bool:
    """
    Publishes an approved BCS Pro edition to 'bcs_pro_published' and updates 'latest'.
    """
    db = get_firestore_client()
    draft_ref = db.collection("bcs_pro_drafts").document(edition_date)
    draft_snap = draft_ref.get()

    if not draft_snap.exists:
        return False

    edition_data = draft_snap.to_dict()
    edition_data["status"] = "PUBLISHED"
    edition_data["published_at"] = firestore.SERVER_TIMESTAMP

    # Write to dated archive
    db.collection("bcs_pro_published").document(edition_date).set(edition_data)
    # Write to 'latest' pointer for fast 1-query client access
    db.collection("bcs_pro_published").document("latest").set(edition_data)

    # Update draft status
    draft_ref.update({
        "status": "PUBLISHED",
        "published_at": firestore.SERVER_TIMESTAMP
    })

    return True
