"""Admin panel v2 API routes under /api/admin/*."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from admin_auth import get_user_email_from_token, require_admin
from admin_panel import agents as agents_mod
from admin_panel import growth as growth_mod
from admin_panel import inscrits as inscrits_mod
from admin_panel import ops as ops_mod
from admin_panel import overview as overview_mod
from admin_panel import production as production_mod
from admin_panel import travel_ops as travel_mod
from admin_panel.audit import list_audit, write_audit
from admin_panel.security import (
    check_rate_limit,
    client_ip,
    get_impersonation,
    mark_step_up,
    require_step_up,
    start_impersonation,
    stop_impersonation,
)

router = APIRouter(prefix="/api/admin", tags=["admin-v2"])


def _actor(request: Request) -> Dict[str, Optional[str]]:
    user_id = getattr(getattr(request, "state", None), "user_id", None)
    email = None
    try:
        from auth_middleware import get_user_id_from_token

        if not user_id:
            user_id = get_user_id_from_token(request)
    except Exception:
        pass
    try:
        email = get_user_email_from_token(request)
    except Exception:
        email = None
    return {"user_id": user_id, "email": email}


def _audit(request: Request, action: str, target: str = None, payload=None, result: str = None):
    actor = _actor(request)
    write_audit(
        actor_user_id=actor.get("user_id"),
        actor_email=actor.get("email"),
        action=action,
        target=target,
        payload=payload,
        result=result,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


# ----- Overview / funnel / quality / timeline -----


@router.get("/overview")
@require_admin
async def admin_overview(
    request: Request,
    force: bool = Query(False),
    light: bool = Query(True, description="Ignored — Accueil = KPIs inscrits only"),
):
    """Accueil admin simplifié : KPIs inscrits / onboarding uniquement."""
    return inscrits_mod.stats_inscrits(force=force)


@router.get("/inscrits")
@require_admin
async def admin_inscrits(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    q: Optional[str] = Query(None),
    onboarding: str = Query("all", description="all|done|pending"),
):
    return inscrits_mod.list_inscrits(
        page=page, page_size=page_size, q=q, onboarding=onboarding
    )


@router.get("/inscrits/stats")
@require_admin
async def admin_inscrits_stats(request: Request, force: bool = Query(False)):
    return inscrits_mod.stats_inscrits(force=force)


@router.get("/product-funnel")
@require_admin
async def admin_product_funnel(request: Request, days: int = Query(14, ge=1, le=90)):
    return overview_mod.product_funnel(days=days)


@router.get("/parcours-quality")
@require_admin
async def admin_parcours_quality(request: Request):
    return overview_mod.parcours_quality()


@router.get("/users/{user_id}/timeline")
@require_admin
async def admin_user_timeline(
    request: Request, user_id: str, limit: int = Query(50, ge=1, le=200)
):
    return overview_mod.user_timeline(user_id, limit=limit)


class NoteBody(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


@router.post("/users/{user_id}/notes")
@require_admin
async def admin_add_note(request: Request, user_id: str, body: NoteBody):
    actor = _actor(request)
    out = overview_mod.add_user_note(
        user_id,
        body.note,
        author_user_id=actor.get("user_id"),
        author_email=actor.get("email"),
    )
    _audit(request, "user_note", target=user_id, payload={"note_len": len(body.note)})
    return out


# ----- Ops whitelist -----


@router.get("/ops/jobs")
@require_admin
async def admin_ops_jobs(request: Request):
    return ops_mod.list_ops_jobs()


class OpsRunBody(BaseModel):
    params: Optional[Dict[str, Any]] = None
    confirm: bool = False


@router.post("/ops/deals/{job_id}")
@require_admin
async def admin_ops_run(request: Request, job_id: str, body: OpsRunBody = OpsRunBody()):
    meta = ops_mod.OPS_JOBS.get(job_id)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Unknown ops job: {job_id}")

    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    check_rate_limit(f"ops:{actor_id}")

    if meta.get("step_up") or meta.get("risk") == "high":
        if not body.confirm:
            raise HTTPException(
                status_code=400,
                detail="confirm=true required for this job",
            )
        require_step_up(actor_id, needed=True)

    out = ops_mod.run_ops_job(job_id, body.params or {})
    _audit(
        request,
        "ops_run",
        target=job_id,
        payload={"params": body.params or {}},
        result="ok" if out.get("ok") else "error",
    )
    return out


class StepUpBody(BaseModel):
    password: str


@router.post("/security/step-up")
@require_admin
async def admin_step_up(request: Request, body: StepUpBody):
    """Re-verify admin password for high-risk ops (TTL)."""
    from admin_auth import verify_admin_password

    if not verify_admin_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    out = mark_step_up(actor_id)
    _audit(request, "step_up", result="ok")
    return out


class ImpersonateBody(BaseModel):
    target_user_id: str


@router.post("/security/impersonate")
@require_admin
async def admin_impersonate(request: Request, body: ImpersonateBody):
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    require_step_up(actor_id, needed=True)
    out = start_impersonation(actor_id, body.target_user_id)
    _audit(request, "impersonate_start", target=body.target_user_id)
    return out


@router.post("/security/impersonate/stop")
@require_admin
async def admin_impersonate_stop(request: Request):
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    out = stop_impersonation(actor_id)
    _audit(request, "impersonate_stop")
    return out


@router.get("/security/impersonate")
@require_admin
async def admin_impersonate_get(request: Request):
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    return {"ok": True, "session": get_impersonation(actor_id)}


@router.get("/audit")
@require_admin
async def admin_audit_list(
    request: Request, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)
):
    return list_audit(limit=limit, offset=offset)


# ----- Growth -----


@router.get("/growth/kpis")
@require_admin
async def admin_growth_kpis(request: Request):
    return growth_mod.growth_kpis()


@router.get("/growth/cohorts")
@require_admin
async def admin_growth_cohorts(request: Request, days: int = Query(28, ge=7, le=90)):
    return growth_mod.conversion_cohorts(days=days)


@router.get("/growth/digests")
@require_admin
async def admin_growth_digests(request: Request):
    return growth_mod.digests_health()


@router.get("/growth/calendar")
@require_admin
async def admin_content_calendar(request: Request):
    return growth_mod.content_calendar()


# ----- Travel ops -----


@router.get("/sejours/inventory")
@require_admin
async def admin_sejours_inventory(request: Request):
    return travel_mod.sejours_inventory()


@router.get("/partners/health")
@require_admin
async def admin_partners_health(request: Request):
    return travel_mod.partners_health()


@router.get("/bookings/fails")
@require_admin
async def admin_booking_fails(request: Request, limit: int = Query(50, ge=1, le=200)):
    return travel_mod.booking_fails(limit=limit)


# ----- Production / store -----


@router.get("/status")
@require_admin
async def admin_status(request: Request):
    return production_mod.status_probe()


@router.get("/store/config")
@require_admin
async def admin_store_get(request: Request):
    return production_mod.get_store_config()


class StoreConfigBody(BaseModel):
    min_ios_version: Optional[str] = None
    min_android_version: Optional[str] = None
    force_update: bool = False
    feature_kills: Optional[Dict[str, bool]] = None


@router.put("/store/config")
@require_admin
async def admin_store_put(request: Request, body: StoreConfigBody):
    actor = _actor(request)
    out = production_mod.update_store_config(
        body.model_dump(),
        updated_by=actor.get("email") or actor.get("user_id"),
    )
    _audit(request, "store_config_update", payload=body.model_dump())
    return out


@router.get("/store/readiness")
@require_admin
async def admin_store_readiness(request: Request):
    return production_mod.store_readiness()


# ----- Agents -----


class AgentUpdateBody(BaseModel):
    enabled: Optional[bool] = None
    prompt: Optional[str] = None


class ProposalDecideBody(BaseModel):
    approve: bool


@router.get("/agents")
@require_admin
async def admin_agents_list(request: Request):
    return agents_mod.list_agents()


@router.get("/agents/runs")
@require_admin
async def admin_agents_runs(request: Request, limit: int = Query(30, ge=1, le=100)):
    return agents_mod.list_runs(limit=limit)


@router.get("/agents/proposals")
@require_admin
async def admin_agents_proposals(
    request: Request, status: Optional[str] = Query("pending")
):
    return agents_mod.list_proposals(status=status)


@router.post("/agents/proposals/{proposal_id}/decide")
@require_admin
async def admin_agents_decide(request: Request, proposal_id: str, body: ProposalDecideBody):
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    if body.approve:
        require_step_up(actor_id, needed=True)
    out = agents_mod.decide_proposal(
        proposal_id,
        approve=body.approve,
        decided_by=actor.get("email") or actor.get("user_id"),
    )
    _audit(
        request,
        "agent_proposal_decide",
        target=proposal_id,
        payload={"approve": body.approve},
        result="ok" if out.get("ok") else "error",
    )
    return out


@router.patch("/agents/{agent_id}")
@require_admin
async def admin_agents_update(request: Request, agent_id: str, body: AgentUpdateBody):
    actor = _actor(request)
    out = agents_mod.update_agent(
        agent_id,
        enabled=body.enabled,
        prompt=body.prompt,
        updated_by=actor.get("email") or actor.get("user_id"),
    )
    _audit(request, "agent_update", target=agent_id, payload=body.model_dump(exclude_none=True))
    return out


@router.post("/agents/{agent_id}/run")
@require_admin
async def admin_agents_run(request: Request, agent_id: str):
    actor = _actor(request)
    actor_id = actor.get("user_id") or actor.get("email") or "admin"
    check_rate_limit(f"agent:{actor_id}", limit=30)
    out = agents_mod.run_agent(agent_id, actor_user_id=actor.get("user_id"))
    _audit(request, "agent_run", target=agent_id, result="ok" if out.get("ok") else "error")
    return out
