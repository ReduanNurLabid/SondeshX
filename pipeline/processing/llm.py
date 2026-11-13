"""Shared Gemini JSON call with API-key rotation and model fallback."""
import json
import os
import random
import time
from typing import Any, List, Optional

MODEL_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
]


_ADMIN_KEYS: Optional[List[str]] = None


def _admin_keys() -> List[str]:
    """Backup keys an editor saved in the dashboard, fetched once per process."""
    global _ADMIN_KEYS
    if _ADMIN_KEYS is None:
        try:
            from pipeline.storage.firebase_service import get_admin_gemini_keys
            _ADMIN_KEYS = get_admin_gemini_keys()
        except Exception:
            _ADMIN_KEYS = []
    return _ADMIN_KEYS


def gemini_api_keys(api_key: Optional[str] = None) -> List[str]:
    """All configured Gemini keys, explicit key first, without duplicates."""
    keys = [k.strip() for k in (os.getenv("GEMINI_API_KEYS") or "").split(",") if k.strip()]
    if api_key and api_key not in keys:
        keys.insert(0, api_key)
    for env_name in ("GEMINI_API_KEY", "GEMINI_API_KEY_BACKUP", "GEMINI_BACKUP_KEY"):
        value = (os.getenv(env_name) or "").strip()
        if value and value not in keys:
            keys.append(value)
    for value in _admin_keys():
        if value not in keys:
            keys.append(value)
    return keys


def generate_json(prompt: str, api_key: Optional[str] = None, temperature: Optional[float] = None) -> Any:
    """
    Sends the prompt to Gemini and returns the parsed JSON reply.
    Raises RuntimeError when no key is configured or every key and model fails.
    """
    keys = gemini_api_keys(api_key)
    if not keys:
        raise RuntimeError("No Gemini API key configured")

    from google import genai
    from google.genai import types

    config_kwargs = {"response_mime_type": "application/json"}
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    last_err: Optional[Exception] = None
    for key in keys:
        try:
            client = genai.Client(api_key=key)
        except Exception as err:
            last_err = err
            continue

        for model_name in MODEL_CASCADE:
            for attempt in range(2):
                try:
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(**config_kwargs),
                    )
                    if resp and resp.text:
                        return json.loads(resp.text)
                    break
                except Exception as err:
                    last_err = err
                    msg = str(err)
                    if "404" in msg or "NOT_FOUND" in msg or "no longer available" in msg:
                        break  # retired model: try the next one
                    transient = any(s in msg for s in ("503", "UNAVAILABLE", "high demand", "429", "RESOURCE_EXHAUSTED"))
                    if attempt == 0 and transient:
                        time.sleep(1.5 + random.uniform(0.5, 1.5))
                        continue
                    print(f"⚠️ Gemini {model_name} failed: {msg[:90]}")
                    break

    raise RuntimeError(f"All Gemini models and keys exhausted (last error: {last_err})")
