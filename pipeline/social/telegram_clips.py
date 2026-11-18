"""Telegram inbox for editor-supplied video clips and photos.

The editor sends a short news video (under 20 MB), or 1-4 photos as one album, to the
Sondesh bot (several photos: a different one behind each key point), with the story
link from sondesh.web.app in the caption (or picks one of the latest top stories from
buttons). A Reel is rendered from the clip with the story's hook, key points, voice and
music, sent back as a preview, and posted to Facebook and Instagram only after the
editor taps "Post now" or "Post at next slot".

This module is the light part that runs every few minutes (telegram_poll.yml): it
reads new Telegram updates, keeps the queue in Firestore (collection telegram_clips)
and starts the heavy render / post runs of facebook_reels.yml.

Statuses: need_story -> rendering -> preview_sent -> approved_now | approved_slot
          -> posting -> posted; or cancelled / failed.
"""
import os
import re
import sys
from datetime import datetime, timezone
from typing import Optional

import requests

from pipeline.storage.firebase_service import get_firestore_client

API = "https://api.telegram.org"
SITE = "sondesh.web.app"
STORY_RE = re.compile(r"sondesh\.web\.app/(?:story/|\?story=)([0-9a-f-]{36})", re.I)
MAX_BYTES = 20 * 1024 * 1024        # Telegram bots cannot download larger files
COLLECTION = "telegram_clips"


# ---------------------------------------------------------------- Telegram API
def _token() -> str:
    return os.environ["TELEGRAM_BOT_TOKEN"]


def tg(method: str, **params) -> dict:
    files = params.pop("files", None)
    r = requests.post(f"{API}/bot{_token()}/{method}", data=params if files else None,
                      json=None if files else params, files=files, timeout=120)
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} failed: {data.get('description') or r.status_code}")
    return data["result"]


def download_file(file_id: str, path: str) -> str:
    info = tg("getFile", file_id=file_id)
    with requests.get(f"{API}/file/bot{_token()}/{info['file_path']}", stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return path


def send(chat_id, text: str, buttons: Optional[list] = None) -> dict:
    params = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    if buttons:
        params["reply_markup"] = {"inline_keyboard": buttons}
    return tg("sendMessage", **params)


def send_video(chat_id, path: str, caption: str, buttons: Optional[list] = None) -> dict:
    import json
    params = {"chat_id": str(chat_id), "caption": caption[:1000], "supports_streaming": "true"}
    if buttons:
        params["reply_markup"] = json.dumps({"inline_keyboard": buttons})
    with open(path, "rb") as f:
        return tg("sendVideo", files={"video": ("reel.mp4", f, "video/mp4")}, **params)


def notify_editor(text: str):
    """Message the editor (posted / failed alerts). Silent when the bot is not set up."""
    chat = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not chat or not os.getenv("TELEGRAM_BOT_TOKEN"):
        return
    try:
        send(chat, text)
    except Exception as err:  # noqa: BLE001 - an alert must never break posting
        print(f"Telegram alert failed: {err}")


def approval_buttons(clip_id: str) -> list:
    return [[{"text": "✅ Post now", "callback_data": f"a:{clip_id}:now"},
             {"text": "🕒 Next slot", "callback_data": f"a:{clip_id}:slot"}],
            [{"text": "✖ Cancel", "callback_data": f"x:{clip_id}"}]]


# ---------------------------------------------------------------- GitHub
def dispatch(inputs: dict):
    """Starts a facebook_reels.yml run (render a preview or post an approved clip)."""
    repo = os.environ["GITHUB_REPOSITORY"]
    r = requests.post(
        f"https://api.github.com/repos/{repo}/actions/workflows/facebook_reels.yml/dispatches",
        headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                 "Accept": "application/vnd.github+json"},
        json={"ref": "main", "inputs": inputs}, timeout=30)
    if r.status_code >= 300:
        raise RuntimeError(f"could not start the Reel job: {r.status_code} {r.text[:200]}")


# ---------------------------------------------------------------- stories
def latest_top_stories(db, n: int = 5) -> list:
    from firebase_admin import firestore
    docs = (db.collection("daily_buzz").order_by("published_at", direction=firestore.Query.DESCENDING)
            .limit(40).stream())
    stories = []
    for d in docs:
        s = d.to_dict()
        if (s.get("fact_check") or {}).get("status") != "passed" or not (s.get("daily_buzz") or {}).get("title_bn"):
            continue
        s["story_id"] = s.get("story_id") or d.id
        stories.append(s)
    stories.sort(key=lambda s: float(s.get("importance_score") or 0), reverse=True)
    return stories[:n]


def story_title(db, story_id: str) -> Optional[str]:
    snap = db.collection("daily_buzz").document(story_id).get()
    return (snap.to_dict() or {}).get("daily_buzz", {}).get("title_bn") if snap.exists else None


def credit_from(text: str) -> str:
    """Any text the editor writes next to the link is used as the on-screen credit."""
    text = re.sub(r"(?:https?://)?\S*sondesh\.web\.app\S*", "", text or "")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"^(?:source|credit|photo|উৎস|ভিডিও|ছবি)\s*[:：-]\s*", "", text.strip(), flags=re.I)
    line = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    return line[:40] or "সংগৃহীত"


# ---------------------------------------------------------------- inbox
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


HELP_TEXT = ("ভিডিও (২০ এমবির কম) অথবা ১-৩টি ছবি একসঙ্গে পাঠান, ক্যাপশনে sondesh.web.app এর খবরের লিংক দিন। "
             "লিংক না দিলে সাম্প্রতিক খবর থেকে বেছে নিতে বলব। লিংকের পাশে লেখা থাকলে সেটা সূত্র হিসেবে দেখাবে। "
             "একাধিক ছবি দিলে প্রতিটি মূল তথ্যের সঙ্গে আলাদা ছবি দেখাবে। "
             "/reels পাঠালে এখনই রিলের সম্ভাবনাময় খবরের তালিকা পাঠাব।")
MAX_PHOTOS = 4   # hook + three key points


def _media(msg: dict):
    """(kind, file_id, size) for a video or photo message, else None."""
    doc = msg.get("document") or {}
    mime = doc.get("mime_type", "")
    if msg.get("video"):
        v = msg["video"]
        return "video", v["file_id"], v.get("file_size") or 0
    if mime.startswith("video/"):
        return "video", doc["file_id"], doc.get("file_size") or 0
    if msg.get("photo"):
        p = msg["photo"][-1]                       # largest size Telegram made
        return "photo", p["file_id"], p.get("file_size") or 0
    if mime.startswith("image/"):
        return "photo", doc["file_id"], doc.get("file_size") or 0
    return None


def handle_message(db, msg: dict, allowed: str, groups: Optional[dict] = None):
    chat_id = msg["chat"]["id"]
    if str(chat_id) != allowed:
        return  # only the editor's own chat is served
    text = msg.get("caption") or msg.get("text") or ""
    media = _media(msg)
    if not media:
        if text.strip().startswith(("/reels", "/candidates")):
            if not send_digest(db, chat_id):
                send(chat_id, "এখন রিলের মতো নতুন কোনো খবর নেই।")
        elif text.strip().startswith(("/start", "/help")):
            send(chat_id, HELP_TEXT)
        return
    kind, file_id, size = media
    if size > MAX_BYTES:
        send(chat_id, "ফাইলটি ২০ এমবির বেশি। ছোট করে আবার পাঠান।")
        return

    # An album arrives as one message per photo/video: gather them, start once per album.
    gid = msg.get("media_group_id")
    if gid and groups is not None:
        g = groups.setdefault(gid, {"chat_id": chat_id, "clip_id": str(msg["message_id"]),
                                    "items": [], "text": ""})
        g["items"].append((kind, file_id))
        if text and not g["text"]:
            g["text"] = text
        return
    start_clip(db, chat_id, str(msg["message_id"]), [(kind, file_id)], text)


def start_clip(db, chat_id, clip_id: str, items: list, text: str, group_id: Optional[str] = None):
    videos = [f for k, f in items if k == "video"]
    kind = "video" if videos else "photo"
    file_ids = videos[:1] if videos else [f for _, f in items][:MAX_PHOTOS]
    noun = "ভিডিও" if kind == "video" else ("ছবিগুলো" if len(file_ids) > 1 else "ছবি")
    clip = {"clip_id": clip_id, "chat_id": chat_id, "media_type": kind, "file_ids": file_ids,
            "file_id": file_ids[0], "credit": credit_from(text), "created_at": _now()}
    if group_id:
        clip["media_group_id"] = group_id
    m = STORY_RE.search(text or "")
    story_id = m.group(1) if m else None
    if not story_id:
        state_ref = db.collection("admin_config").document("telegram")
        pending = (state_ref.get().to_dict() or {}).get("pending_story") or {}
        if pending.get("id") and (pending.get("at") or "") > _hours_ago(3):
            story_id = pending["id"]
            state_ref.set({"pending_story": {}}, merge=True)
    if story_id and story_title(db, story_id):
        clip.update(story_id=story_id, status="rendering")
        db.collection(COLLECTION).document(clip_id).set(clip)
        dispatch({"telegram_clip": clip_id, "dry_run": "true"})
        send(chat_id, f"পেয়েছি ({noun})। খবর: {story_title(db, story_id)}\nরিল তৈরি হচ্ছে, কয়েক মিনিটের মধ্যে প্রিভিউ পাঠাব।")
        return

    choices = latest_top_stories(db)
    if not choices:
        send(chat_id, "কোনো খবর পাওয়া যায়নি। ক্যাপশনে sondesh.web.app এর খবরের লিংক দিয়ে আবার পাঠান।")
        return
    clip.update(status="need_story", choices=[s["story_id"] for s in choices])
    db.collection(COLLECTION).document(clip_id).set(clip)
    buttons = [[{"text": s["daily_buzz"]["title_bn"][:60], "callback_data": f"s:{clip_id}:{i}"}]
               for i, s in enumerate(choices)]
    buttons.append([{"text": "✖ Cancel", "callback_data": f"x:{clip_id}"}])
    send(chat_id, f"এই {noun} কোন খবরের? বেছে নিন:", buttons)


def handle_callback(db, cb: dict, allowed: str):
    chat_id = cb["message"]["chat"]["id"]
    try:  # stops the button's spinner; Telegram refuses this for taps older than a few minutes
        tg("answerCallbackQuery", callback_query_id=cb["id"])
    except RuntimeError:
        pass
    if str(chat_id) != allowed:
        return
    parts = (cb.get("data") or "").split(":")
    if parts[0] in ("m", "w") and len(parts) > 1:
        return handle_candidate(db, chat_id, parts[0], parts[1])
    ref = db.collection(COLLECTION).document(parts[1]) if len(parts) > 1 else None
    clip = ref.get().to_dict() if ref and ref.get().exists else None
    if not clip:
        send(chat_id, "এই ভিডিওটি আর তালিকায় নেই।")
        return
    try:  # remove the buttons that were just used
        tg("editMessageReplyMarkup", chat_id=chat_id, message_id=cb["message"]["message_id"],
           reply_markup={"inline_keyboard": []})
    except RuntimeError:
        pass

    kind = parts[0]
    if kind == "x":
        ref.set({"status": "cancelled", "updated_at": _now()}, merge=True)
        send(chat_id, "বাতিল করা হয়েছে।")
    elif kind == "s" and clip.get("status") == "need_story":
        story_id = clip["choices"][int(parts[2])]
        ref.set({"story_id": story_id, "status": "rendering", "updated_at": _now()}, merge=True)
        dispatch({"telegram_clip": clip["clip_id"], "dry_run": "true"})
        send(chat_id, f"খবর: {story_title(db, story_id)}\nরিল তৈরি হচ্ছে, কয়েক মিনিটের মধ্যে প্রিভিউ পাঠাব।")
    elif kind == "a" and clip.get("status") == "preview_sent":
        if parts[2] == "now":
            ref.set({"status": "approved_now", "updated_at": _now()}, merge=True)
            dispatch({"telegram_post": clip["clip_id"], "dry_run": "false"})
            send(chat_id, "পোস্ট করা হচ্ছে (ফেসবুক, তারপর ইনস্টাগ্রাম)।")
        else:
            ref.set({"status": "approved_slot", "updated_at": _now()}, merge=True)
            send(chat_id, "পরের রিল স্লটে পোস্ট হবে।")
    else:
        send(chat_id, f"এই ভিডিওর অবস্থা এখন: {clip.get('status')}")


def next_slot_clip(db) -> Optional[dict]:
    """Oldest clip the editor approved for the next Reel slot."""
    docs = db.collection(COLLECTION).where("status", "==", "approved_slot").stream()
    clips = sorted((d.to_dict() for d in docs), key=lambda c: c.get("updated_at") or "")
    return clips[0] if clips else None


# ---------------------------------------------------------------- Reel candidates
DIGEST_HOURS = (8, 13, 18)        # Bangladesh time; sent at :30
DIGEST_SIZE = 5
BN_NUM = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def _hours_ago(h: float) -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()


def reel_candidates(db, n: int = DIGEST_SIZE) -> list:
    """Unposted, fact-checked stories from the last 12 hours, best Reel prospects first
    (the same score the automatic Reels use, including what past Reels taught us)."""
    from firebase_admin import firestore
    from pipeline.social.post_reel import learned_section_bonus, reel_score
    posted = set()
    for d in db.collection("social_posts").select(["story_id"]).stream():
        posted.add(d.id)
        posted.add((d.to_dict() or {}).get("story_id"))
    since = _hours_ago(12)
    stories = []
    for d in (db.collection("daily_buzz").order_by("published_at", direction=firestore.Query.DESCENDING)
              .limit(80).stream()):
        st = d.to_dict()
        sid = st.get("story_id") or d.id
        buzz = st.get("daily_buzz") or {}
        if sid in posted or str(st.get("published_at") or "") < since:
            continue
        if (st.get("fact_check") or {}).get("status") != "passed" or not buzz.get("title_bn"):
            continue
        if len(buzz.get("bullets_bn") or []) < 2 or float(st.get("importance_score") or 0) < 6:
            continue
        st["story_id"] = sid
        stories.append(st)
    learned = learned_section_bonus(db)
    stories.sort(key=lambda st: reel_score(st, learned), reverse=True)
    return stories[:n]


def send_digest(db, chat_id) -> bool:
    stories = reel_candidates(db)
    if not stories:
        return False
    lines, buttons = ["🎯 এখন রিলের জন্য সম্ভাবনাময় খবর:"], []
    for i, st in enumerate(stories, 1):
        n = str(i).translate(BN_NUM)
        buzz = st["daily_buzz"]
        extra = " • কাজের খবর" if buzz.get("share_value") else ""
        lines.append(f"\n{n}. {buzz['title_bn']}{extra}\n{SITE}/story/{st['story_id']}/")
        buttons.append([{"text": f"🎬 {n} রিল বানাও", "callback_data": f"m:{st['story_id']}"},
                        {"text": f"📷 {n} ছবি/ভিডিও দেব", "callback_data": f"w:{st['story_id']}"}])
    lines.append("\n🎬 = সাধারণ রিলের প্রিভিউ পাঠাব। 📷 = এরপর যে ছবি/ভিডিও পাঠাবেন তা এই খবরের হবে।")
    send(chat_id, "\n".join(lines), buttons)
    return True


def handle_candidate(db, chat_id, kind: str, story_id: str):
    title = story_title(db, story_id)
    if not title:
        send(chat_id, "খবরটি পাওয়া যায়নি।")
        return
    if kind == "w":
        db.collection("admin_config").document("telegram").set(
            {"pending_story": {"id": story_id, "at": _now()}}, merge=True)
        send(chat_id, f"ঠিক আছে। এখন ছবি (১-৪টি) বা ভিডিও পাঠান, লিংক লাগবে না।\nখবর: {title}")
        return
    clip_id = "a" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    db.collection(COLLECTION).document(clip_id).set({
        "clip_id": clip_id, "chat_id": chat_id, "media_type": "auto", "story_id": story_id,
        "credit": "", "status": "rendering", "created_at": _now()})
    dispatch({"telegram_clip": clip_id, "dry_run": "true"})
    send(chat_id, f"রিল তৈরি হচ্ছে, কয়েক মিনিটের মধ্যে প্রিভিউ পাঠাব।\nখবর: {title}")


def maybe_send_digest(db, state_ref, allowed: str):
    from datetime import timedelta
    local = datetime.now(timezone.utc) + timedelta(hours=6)
    if local.hour not in DIGEST_HOURS or local.minute < 30:
        return
    key = local.strftime("%Y-%m-%d-%H")
    if (state_ref.get().to_dict() or {}).get("last_digest") == key:
        return
    sent = send_digest(db, allowed)
    state_ref.set({"last_digest": key}, merge=True)
    print(f"Reel candidate digest {'sent' if sent else 'skipped (no candidates)'} for {key}.")


def poll():
    if sys.stdout:
        sys.stdout.reconfigure(encoding="utf-8")
    db = get_firestore_client()
    state_ref = db.collection("admin_config").document("telegram")
    offset = (state_ref.get().to_dict() or {}).get("offset", 0)
    allowed = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    updates = tg("getUpdates", offset=offset, timeout=0, allowed_updates=["message", "callback_query"])
    groups: dict = {}
    for u in updates:
        offset = u["update_id"] + 1
        msg, cb = u.get("message"), u.get("callback_query")
        try:
            if not allowed:
                chat = (msg or (cb or {}).get("message") or {}).get("chat", {})
                if chat.get("id"):
                    send(chat["id"], f"Setup: save {chat['id']} as the GitHub secret TELEGRAM_CHAT_ID, then send the video again.")
                continue
            if msg:
                handle_message(db, msg, allowed, groups)
            elif cb:
                handle_callback(db, cb, allowed)
        except Exception as err:  # noqa: BLE001 - one bad update must not block the rest
            print(f"Update {u['update_id']} failed: {err}")
            try:
                chat_id = (msg or cb["message"])["chat"]["id"]
                if str(chat_id) == allowed:
                    send(chat_id, f"সমস্যা হয়েছে: {str(err)[:300]}")
            except Exception:  # noqa: BLE001
                pass
    for gid, g in groups.items():
        try:
            start_clip(db, g["chat_id"], g["clip_id"], g["items"], g["text"], group_id=gid)
        except Exception as err:  # noqa: BLE001
            print(f"Album {gid} failed: {err}")
            send(g["chat_id"], f"সমস্যা হয়েছে: {str(err)[:300]}")
    state_ref.set({"offset": offset, "checked_at": _now()}, merge=True)
    if allowed:
        try:
            maybe_send_digest(db, state_ref, allowed)
        except Exception as err:  # noqa: BLE001
            print(f"Digest failed: {err}")
    print(f"Handled {len(updates)} Telegram update(s).")


if __name__ == "__main__":
    poll()
