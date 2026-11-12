"""Agentic AI ops agents — on/off, editable prompts, propose/approve."""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {
        "id": "wall-health",
        "name": "Wall Health Agent",
        "description": "Diagnose séjour wall freshness and propose refresh/materialize.",
        "default_prompt": (
            "You are FlightWatcher ops. Inspect wall health / inventory. "
            "Propose only safe ops: warm-wall-cache, materialize-wall, refresh-deal-rates. "
            "Never invent jobs outside the whitelist."
        ),
        "enabled": True,
    },
    {
        "id": "parcours-quality",
        "name": "Parcours Quality Agent",
        "description": "Flag incomplete parcours (cover, city, title) for editorial review.",
        "default_prompt": (
            "Review parcours quality scores. List items missing cover/city/title. "
            "Propose editorial actions only; do not auto-publish."
        ),
        "enabled": True,
    },
    {
        "id": "growth-digest",
        "name": "Growth Digest Agent",
        "description": "Summarize WAU/activation and digest health; suggest follow-ups.",
        "default_prompt": (
            "Summarize growth KPIs and digests. Highlight drops. "
            "Propose human follow-ups, not destructive ops."
        ),
        "enabled": False,
    },
    {
        "id": "booking-watch",
        "name": "Booking Watch Agent",
        "description": "Surface booking failures and partner health issues.",
        "default_prompt": (
            "Inspect booking fails and partners. Propose investigation notes. "
            "Do not retry payments automatically."
        ),
        "enabled": True,
    },
]

_lock = threading.Lock()
_memory_agents: Dict[str, Dict[str, Any]] = {
    a["id"]: {
        **a,
        "prompt": a["default_prompt"],
        "updated_at": None,
        "updated_by": None,
    }
    for a in _DEFAULT_AGENTS
}
_memory_runs: List[Dict[str, Any]] = []
_memory_proposals: List[Dict[str, Any]] = []


def _svc():
    try:
        from supabase_client import get_supabase_service_client

        return get_supabase_service_client()
    except Exception:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_agents_seeded() -> None:
    sb = _svc()
    if sb is None:
        return
    for a in _DEFAULT_AGENTS:
        try:
            existing = (
                sb.table("admin_agents").select("id").eq("id", a["id"]).limit(1).execute()
            )
            if existing.data:
                continue
            sb.table("admin_agents").insert(
                {
                    "id": a["id"],
                    "enabled": a["enabled"],
                    "prompt": a["default_prompt"],
                    "default_prompt": a["default_prompt"],
                    "updated_at": _now(),
                }
            ).execute()
        except Exception:
            return


def list_agents() -> Dict[str, Any]:
    ensure_agents_seeded()
    sb = _svc()
    if sb is not None:
        try:
            res = sb.table("admin_agents").select("*").execute()
            rows = res.data or []
            by_id = {r["id"]: r for r in rows}
            merged = []
            for a in _DEFAULT_AGENTS:
                row = by_id.get(a["id"]) or {}
                merged.append(
                    {
                        **a,
                        "enabled": bool(row.get("enabled", a["enabled"])),
                        "prompt": row.get("prompt") or a["default_prompt"],
                        "updated_at": row.get("updated_at"),
                        "updated_by": row.get("updated_by"),
                    }
                )
            return {"ok": True, "agents": merged, "source": "db"}
        except Exception:
            pass
    with _lock:
        agents = list(_memory_agents.values())
    # enrich names from defaults
    for a in agents:
        meta = next((d for d in _DEFAULT_AGENTS if d["id"] == a["id"]), {})
        a.setdefault("name", meta.get("name"))
        a.setdefault("description", meta.get("description"))
    return {"ok": True, "agents": agents, "source": "memory"}


def update_agent(
    agent_id: str,
    *,
    enabled: Optional[bool] = None,
    prompt: Optional[str] = None,
    updated_by: Optional[str] = None,
) -> Dict[str, Any]:
    ensure_agents_seeded()
    if agent_id not in {a["id"] for a in _DEFAULT_AGENTS}:
        return {"ok": False, "error": "unknown agent"}

    patch: Dict[str, Any] = {"updated_at": _now(), "updated_by": updated_by}
    if enabled is not None:
        patch["enabled"] = bool(enabled)
    if prompt is not None:
        patch["prompt"] = prompt

    sb = _svc()
    if sb is not None:
        try:
            res = sb.table("admin_agents").update(patch).eq("id", agent_id).execute()
            if res.data:
                return {"ok": True, "agent": res.data[0]}
        except Exception:
            pass

    with _lock:
        cur = _memory_agents.get(agent_id) or {
            **next(a for a in _DEFAULT_AGENTS if a["id"] == agent_id),
            "prompt": next(a for a in _DEFAULT_AGENTS if a["id"] == agent_id)["default_prompt"],
        }
        cur.update(patch)
        _memory_agents[agent_id] = cur
        return {"ok": True, "agent": cur}


def _build_proposals(agent_id: str) -> List[Dict[str, Any]]:
    proposals: List[Dict[str, Any]] = []
    if agent_id == "wall-health":
        try:
            from admin_panel.travel_ops import sejours_inventory

            inv = sejours_inventory()
            if inv.get("stale", 0) > 0 or inv.get("freshness_pct", 100) < 70:
                proposals.append(
                    {
                        "action": "run_ops",
                        "payload": {"job": "materialize-wall", "params": {"force": True}},
                        "reason": f"Freshness {inv.get('freshness_pct')}%, stale={inv.get('stale')}",
                    }
                )
                proposals.append(
                    {
                        "action": "run_ops",
                        "payload": {"job": "warm-wall-cache"},
                        "reason": "Warm wall after materialize",
                    }
                )
            else:
                proposals.append(
                    {
                        "action": "note",
                        "payload": {"message": "Wall freshness OK"},
                        "reason": "No action needed",
                    }
                )
        except Exception as e:
            proposals.append(
                {"action": "note", "payload": {"message": str(e)}, "reason": "inventory error"}
            )
    elif agent_id == "parcours-quality":
        try:
            from admin_panel.overview import parcours_quality

            q = parcours_quality()
            for issue in (q.get("issues") or [])[:8]:
                proposals.append(
                    {
                        "action": "editorial_review",
                        "payload": issue,
                        "reason": f"Missing {', '.join(issue.get('missing') or [])}",
                    }
                )
            if not proposals:
                proposals.append(
                    {
                        "action": "note",
                        "payload": {"message": "All parcours look complete"},
                        "reason": "quality ok",
                    }
                )
        except Exception as e:
            proposals.append(
                {"action": "note", "payload": {"message": str(e)}, "reason": "quality error"}
            )
    elif agent_id == "growth-digest":
        try:
            from admin_panel.growth import digests_health, growth_kpis

            k = growth_kpis()
            d = digests_health()
            proposals.append(
                {
                    "action": "note",
                    "payload": {"kpis": k, "digests": d},
                    "reason": "Weekly growth snapshot",
                }
            )
        except Exception as e:
            proposals.append(
                {"action": "note", "payload": {"message": str(e)}, "reason": "growth error"}
            )
    elif agent_id == "booking-watch":
        try:
            from admin_panel.travel_ops import booking_fails, partners_health

            p = partners_health()
            f = booking_fails(limit=10)
            bad = [x for x in (p.get("partners") or []) if not x.get("ok")]
            if bad or (f.get("items") or []):
                proposals.append(
                    {
                        "action": "investigate",
                        "payload": {"partners": bad, "fails": f.get("items") or []},
                        "reason": "Partner or booking issues detected",
                    }
                )
            else:
                proposals.append(
                    {
                        "action": "note",
                        "payload": {"message": "Partners healthy"},
                        "reason": "ok",
                    }
                )
        except Exception as e:
            proposals.append(
                {"action": "note", "payload": {"message": str(e)}, "reason": "booking error"}
            )
    return proposals


def run_agent(agent_id: str, actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    agents = list_agents().get("agents") or []
    agent = next((a for a in agents if a["id"] == agent_id), None)
    if not agent:
        return {"ok": False, "error": "unknown agent"}
    if not agent.get("enabled", True):
        return {"ok": False, "error": "agent disabled"}

    proposals_raw = _build_proposals(agent_id)
    run_id = str(uuid.uuid4())
    run = {
        "id": run_id,
        "agent_id": agent_id,
        "status": "done",
        "summary": f"{len(proposals_raw)} proposal(s)",
        "proposals": proposals_raw,
        "actor_user_id": actor_user_id,
        "created_at": _now(),
        "prompt_used": agent.get("prompt"),
    }

    stored_proposals: List[Dict[str, Any]] = []
    sb = _svc()
    if sb is not None:
        try:
            sb.table("admin_agent_runs").insert(
                {
                    "id": run_id,
                    "agent_id": agent_id,
                    "status": "done",
                    "summary": run["summary"],
                    "proposals": proposals_raw,
                    "actor_user_id": actor_user_id,
                    "created_at": run["created_at"],
                }
            ).execute()
            for p in proposals_raw:
                pid = str(uuid.uuid4())
                prow = {
                    "id": pid,
                    "run_id": run_id,
                    "agent_id": agent_id,
                    "action": p["action"],
                    "payload": p.get("payload") or {},
                    "status": "pending" if p["action"] != "note" else "info",
                    "created_at": _now(),
                }
                sb.table("admin_agent_proposals").insert(prow).execute()
                stored_proposals.append({**prow, "reason": p.get("reason")})
            run["proposals"] = stored_proposals or proposals_raw
            return {"ok": True, "run": run}
        except Exception:
            pass

    with _lock:
        for p in proposals_raw:
            pid = str(uuid.uuid4())
            prow = {
                "id": pid,
                "run_id": run_id,
                "agent_id": agent_id,
                "action": p["action"],
                "payload": p.get("payload") or {},
                "reason": p.get("reason"),
                "status": "pending" if p["action"] != "note" else "info",
                "created_at": _now(),
            }
            _memory_proposals.append(prow)
            stored_proposals.append(prow)
        run["proposals"] = stored_proposals
        _memory_runs.insert(0, run)
        _memory_runs[:] = _memory_runs[:100]
    return {"ok": True, "run": run}


def list_runs(limit: int = 30) -> Dict[str, Any]:
    sb = _svc()
    if sb is not None:
        try:
            res = (
                sb.table("admin_agent_runs")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return {"ok": True, "runs": res.data or [], "source": "db"}
        except Exception:
            pass
    with _lock:
        return {"ok": True, "runs": _memory_runs[:limit], "source": "memory"}


def list_proposals(status: Optional[str] = "pending") -> Dict[str, Any]:
    sb = _svc()
    if sb is not None:
        try:
            q = sb.table("admin_agent_proposals").select("*").order("created_at", desc=True).limit(100)
            if status:
                q = q.eq("status", status)
            res = q.execute()
            return {"ok": True, "proposals": res.data or [], "source": "db"}
        except Exception:
            pass
    with _lock:
        items = list(_memory_proposals)
    if status:
        items = [p for p in items if p.get("status") == status]
    return {"ok": True, "proposals": items[:100], "source": "memory"}


def decide_proposal(
    proposal_id: str,
    *,
    approve: bool,
    decided_by: Optional[str] = None,
) -> Dict[str, Any]:
    proposal = None
    sb = _svc()
    if sb is not None:
        try:
            res = (
                sb.table("admin_agent_proposals")
                .select("*")
                .eq("id", proposal_id)
                .limit(1)
                .execute()
            )
            proposal = (res.data or [None])[0]
        except Exception:
            proposal = None

    if proposal is None:
        with _lock:
            proposal = next((p for p in _memory_proposals if p["id"] == proposal_id), None)

    if not proposal:
        return {"ok": False, "error": "proposal not found"}
    if proposal.get("status") not in ("pending", None):
        return {"ok": False, "error": f"already {proposal.get('status')}"}

    result: Dict[str, Any] = {"approved": approve}
    new_status = "approved" if approve else "rejected"

    if approve and proposal.get("action") == "run_ops":
        payload = proposal.get("payload") or {}
        job = payload.get("job")
        params = payload.get("params") or {}
        if job:
            from admin_panel.ops import run_ops_job

            result["ops"] = run_ops_job(str(job), params)

    patch = {
        "status": new_status,
        "decided_by": decided_by,
        "decided_at": _now(),
        "result": result,
    }

    if sb is not None and proposal.get("id"):
        try:
            sb.table("admin_agent_proposals").update(patch).eq("id", proposal_id).execute()
        except Exception:
            pass

    with _lock:
        for p in _memory_proposals:
            if p["id"] == proposal_id:
                p.update(patch)
                proposal = p
                break

    return {"ok": True, "proposal": {**proposal, **patch}}
