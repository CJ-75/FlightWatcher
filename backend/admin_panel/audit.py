"""Admin audit log — Supabase when available, in-memory fallback."""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

_lock = threading.Lock()
_memory: Deque[Dict[str, Any]] = deque(maxlen=2000)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client():
    try:
        from supabase_client import get_supabase_service_client

        return get_supabase_service_client()
    except Exception:
        return None


def redact_pii(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not payload:
        return {}
    out: Dict[str, Any] = {}
    sensitive = {"password", "token", "secret", "authorization", "cookie", "email", "phone"}
    for k, v in payload.items():
        lk = str(k).lower()
        if any(s in lk for s in sensitive):
            out[k] = "[redacted]"
        elif isinstance(v, dict):
            out[k] = redact_pii(v)
        else:
            out[k] = v
    return out


def write_audit(
    *,
    actor_user_id: Optional[str],
    actor_email: Optional[str],
    action: str,
    target: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    result: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    row = {
        "actor_user_id": actor_user_id,
        "actor_email": actor_email,
        "action": action,
        "target": target,
        "payload": redact_pii(payload),
        "result": result,
        "ip": ip,
        "user_agent": (user_agent or "")[:240] or None,
        "created_at": _now_iso(),
    }
    sb = _client()
    if sb is not None:
        try:
            res = sb.table("admin_audit_log").insert(row).execute()
            data = (res.data or [row])[0]
            with _lock:
                _memory.appendleft(data)
            return data
        except Exception:
            pass
    row = {**row, "id": f"mem-{len(_memory)+1}"}
    with _lock:
        _memory.appendleft(row)
    return row


def list_audit(limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))
    sb = _client()
    if sb is not None:
        try:
            res = (
                sb.table("admin_audit_log")
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return {"ok": True, "items": res.data or [], "source": "db"}
        except Exception:
            pass
    with _lock:
        items = list(_memory)[offset : offset + limit]
    return {"ok": True, "items": items, "source": "memory"}
