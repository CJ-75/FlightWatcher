"""Push V1 — presence, prefs, cron jobs (docs/PUSH.md)."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from deals.cron_auth import require_cron
from supabase_deps import (
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter(tags=["push"])


def _svc():
    return get_supabase_service_client() or get_supabase_client()


def _require_user(request: Request) -> str:
    uid = get_user_id_from_token(request)
    if not uid:
        raise HTTPException(status_code=401, detail="auth_required")
    return str(uid)


class PresenceBody(BaseModel):
    entity_type: str
    entity_id: str


class PrefsBody(BaseModel):
    notif_group: Optional[bool] = None
    notif_pops: Optional[bool] = None


@router.post("/api/push/presence")
@optional_auth
async def push_presence(body: PresenceBody, request: Request):
    user_id = _require_user(request)
    et = (body.entity_type or "").strip()
    if et not in ("trip", "pop"):
        raise HTTPException(status_code=400, detail="entity_type_invalid")
    from push.v1_send import record_presence

    record_presence(
        _svc(),
        user_id=user_id,
        entity_type=et,
        entity_id=body.entity_id.strip(),
    )
    return {"ok": True}


@router.get("/api/push/prefs")
@optional_auth
async def get_push_prefs(request: Request):
    user_id = _require_user(request)
    sb = _svc()
    if not sb:
        raise HTTPException(status_code=503, detail="no_supabase")
    try:
        res = (
            sb.table("push_tokens")
            .select("notif_group,notif_pops,active")
            .eq("user_id", user_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if res.data:
            row = res.data[0]
            return {
                "ok": True,
                "notif_group": row.get("notif_group", True) is not False,
                "notif_pops": row.get("notif_pops", True) is not False,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"ok": True, "notif_group": True, "notif_pops": True}


@router.patch("/api/push/prefs")
@optional_auth
async def patch_push_prefs(body: PrefsBody, request: Request):
    user_id = _require_user(request)
    sb = _svc()
    if not sb:
        raise HTTPException(status_code=503, detail="no_supabase")
    patch: Dict[str, Any] = {}
    if body.notif_group is not None:
        patch["notif_group"] = bool(body.notif_group)
    if body.notif_pops is not None:
        patch["notif_pops"] = bool(body.notif_pops)
    if not patch:
        return {"ok": True}
    try:
        sb.table("push_tokens").update(patch).eq("user_id", user_id).eq(
            "active", True
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"ok": True, **{k: patch.get(k) for k in ("notif_group", "notif_pops") if k in patch}}


@router.post("/api/push/jobs/flush-join-batches")
async def job_flush_join(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from push.v1_send import run_flush_join_batches

    return run_flush_join_batches(_svc())


@router.post("/api/push/jobs/invite-nudges")
async def job_invite_nudges(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from push.v1_send import run_invite_nudges_48h

    return run_invite_nudges_48h(_svc())


@router.post("/api/push/jobs/pop-plan-nudges")
async def job_pop_plan(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from push.v1_send import run_pop_plan_nudges

    return run_pop_plan_nudges(_svc())


@router.post("/api/push/jobs/pop-eve")
async def job_pop_eve(authorization: Optional[str] = Header(None)):
    require_cron(authorization)
    from push.v1_send import run_pop_eve

    return run_pop_eve(_svc())
