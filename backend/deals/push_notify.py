"""
v4 Occasions Lot F — Expo push (no-op without tokens / network).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("deals.push_notify")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def push_enabled() -> bool:
    raw = (os.getenv("DEALS_PUSH_ENABLED") or "true").strip().lower()
    return raw in ("1", "true", "yes", "on")


def send_expo_push(
    tokens: List[str],
    *,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Send Expo push messages. Returns {ok, sent, skipped, errors}.
    Invalid / empty tokens are skipped; missing network → errors counted.
    """
    summary = {"ok": True, "sent": 0, "skipped": 0, "errors": 0}
    if not push_enabled():
        summary["ok"] = False
        summary["error"] = "push_disabled"
        return summary
    clean = []
    seen = set()
    for t in tokens:
        tok = (t or "").strip()
        if not tok or tok in seen:
            continue
        # Expo tokens start with ExponentPushToken[…] or are UUIDs
        seen.add(tok)
        clean.append(tok)
    if not clean:
        summary["skipped"] = len(tokens)
        return summary

    messages = [
        {
            "to": tok,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for tok in clean
    ]
    try:
        resp = httpx.post(
            EXPO_PUSH_URL,
            json=messages if len(messages) > 1 else messages[0],
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=20.0,
        )
        if resp.status_code >= 400:
            logger.warning("expo push HTTP %s: %s", resp.status_code, resp.text[:200])
            summary["ok"] = False
            summary["errors"] = len(clean)
            return summary
        summary["sent"] = len(clean)
        return summary
    except Exception as e:
        logger.warning("expo push fail: %s", e)
        summary["ok"] = False
        summary["errors"] = len(clean)
        summary["error"] = str(e)
        return summary


def list_active_push_tokens(
    supabase: Any,
    *,
    origin_iata: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        q = (
            supabase.table("push_tokens")
            .select("id,token,user_id,origin_iata,locale")
            .eq("active", True)
            .limit(max(1, min(limit, 500)))
        )
        res = q.execute()
        rows = list(res.data or [])
        if origin_iata:
            origin_u = origin_iata.strip().upper()
            # Prefer tokens matching origin; include null-origin as broadcast
            matched = [
                r
                for r in rows
                if not r.get("origin_iata")
                or str(r.get("origin_iata") or "").upper().startswith(origin_u[:3])
                or origin_u in str(r.get("origin_iata") or "").upper()
            ]
            return matched or rows
        return rows
    except Exception as e:
        logger.debug("push_tokens list: %s", e)
        return []
