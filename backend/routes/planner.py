"""Planner API — collaborative trip planning with price scan proposals."""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request

from api_models import (
    CreatePlannedTripRequest,
    DateAvecHoraire,
    UpdatePlannedTripRequest,
)
from flight_scanner import enrich_trip_results, scanner_vols_api
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


def _require_user(request: Request) -> str:
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    return user_id


def _svc():
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    client = get_supabase_service_client() or get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Client Supabase indisponible")
    return client


def _clamp_passengers(n: Optional[int]) -> int:
    try:
        v = int(n or 1)
    except (TypeError, ValueError):
        v = 1
    return max(1, min(6, v))


def _row_to_trip(row: dict, proposals_count: Optional[int] = None) -> dict:
    return {
        "id": row["id"],
        "organizer_id": row["organizer_id"],
        "name": row["name"],
        "departure_airport": row["departure_airport"],
        "arrival_airport": row.get("arrival_airport"),
        "passengers": row.get("passengers") or 1,
        "dates_depart": row.get("dates_depart") or [],
        "dates_retour": row.get("dates_retour") or [],
        "budget_max": row.get("budget_max") or 200,
        "invite_token": row["invite_token"],
        "status": row.get("status") or "draft",
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "proposals_count": proposals_count,
    }


def _user_can_access(supabase, trip_id: str, user_id: str) -> Optional[dict]:
    trip = (
        supabase.table("planned_trips")
        .select("*")
        .eq("id", trip_id)
        .limit(1)
        .execute()
    )
    if not trip.data:
        return None
    row = trip.data[0]
    if row["organizer_id"] == user_id:
        return row
    mem = (
        supabase.table("trip_members")
        .select("id")
        .eq("trip_id", trip_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if mem.data:
        return row
    return None


def _require_organizer(supabase, trip_id: str, user_id: str) -> dict:
    trip = (
        supabase.table("planned_trips")
        .select("*")
        .eq("id", trip_id)
        .eq("organizer_id", user_id)
        .limit(1)
        .execute()
    )
    if not trip.data:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
    return trip.data[0]


@router.get("/api/planner/trips")
@optional_auth
async def list_trips(request: Request):
    user_id = _require_user(request)
    supabase = _svc()

    owned = (
        supabase.table("planned_trips")
        .select("*")
        .eq("organizer_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    member_rows = (
        supabase.table("trip_members")
        .select("trip_id")
        .eq("user_id", user_id)
        .execute()
    )
    member_ids = [m["trip_id"] for m in (member_rows.data or []) if m.get("trip_id")]
    member_trips = []
    if member_ids:
        mt = (
            supabase.table("planned_trips")
            .select("*")
            .in_("id", member_ids)
            .order("created_at", desc=True)
            .execute()
        )
        member_trips = mt.data or []

    by_id: Dict[str, dict] = {}
    for row in (owned.data or []) + member_trips:
        by_id[row["id"]] = row

    out = []
    for row in by_id.values():
        count_res = (
            supabase.table("trip_proposals")
            .select("id", count="exact")
            .eq("trip_id", row["id"])
            .execute()
        )
        out.append(_row_to_trip(row, proposals_count=count_res.count or 0))
    out.sort(key=lambda t: t.get("created_at") or "", reverse=True)
    return out


@router.post("/api/planner/trips")
@optional_auth
async def create_trip(body: CreatePlannedTripRequest, request: Request):
    user_id = _require_user(request)
    supabase = _svc()

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Nom du voyage requis")
    if not body.dates_depart or not body.dates_retour:
        raise HTTPException(status_code=400, detail="Dates aller et retour requises")

    dep = (body.departure_airport or "").strip().upper()
    arr = (body.arrival_airport or "").strip().upper() or None
    if len(dep) != 3:
        raise HTTPException(status_code=400, detail="Aéroport de départ invalide")
    if arr and len(arr) != 3:
        raise HTTPException(status_code=400, detail="Aéroport d'arrivée invalide")

    token = secrets.token_hex(16)
    data = {
        "organizer_id": user_id,
        "name": body.name.strip(),
        "departure_airport": dep,
        "arrival_airport": arr,
        "passengers": _clamp_passengers(body.passengers),
        "dates_depart": [d.model_dump() for d in body.dates_depart],
        "dates_retour": [d.model_dump() for d in body.dates_retour],
        "budget_max": int(body.budget_max or 200),
        "invite_token": token,
        "status": "draft",
        "updated_at": datetime.utcnow().isoformat(),
    }
    result = supabase.table("planned_trips").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Création échouée")
    trip = result.data[0]
    supabase.table("trip_members").insert(
        {
            "trip_id": trip["id"],
            "user_id": user_id,
            "role": "organizer",
            "status": "joined",
            "display_name": "Organisateur",
        }
    ).execute()
    return _row_to_trip(trip, proposals_count=0)


@router.get("/api/planner/trips/{trip_id}")
@optional_auth
async def get_trip(trip_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    row = _user_can_access(supabase, trip_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Voyage introuvable")

    proposals = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("trip_id", trip_id)
        .order("created_at", desc=True)
        .execute()
    )
    members = (
        supabase.table("trip_members")
        .select("*")
        .eq("trip_id", trip_id)
        .execute()
    )
    trip = _row_to_trip(row, proposals_count=len(proposals.data or []))
    accepted = next(
        (p for p in (proposals.data or []) if p.get("status") == "accepted"),
        None,
    )
    trip["accepted_proposal"] = accepted
    trip["proposals"] = proposals.data or []
    trip["members"] = members.data or []
    return trip


@router.patch("/api/planner/trips/{trip_id}")
@optional_auth
async def update_trip(trip_id: str, body: UpdatePlannedTripRequest, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)

    patch: Dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
    if body.name is not None:
        patch["name"] = body.name.strip()
    if body.departure_airport is not None:
        patch["departure_airport"] = body.departure_airport.strip().upper()
    if body.arrival_airport is not None:
        patch["arrival_airport"] = body.arrival_airport.strip().upper() or None
    if body.passengers is not None:
        patch["passengers"] = _clamp_passengers(body.passengers)
    if body.dates_depart is not None:
        patch["dates_depart"] = [d.model_dump() for d in body.dates_depart]
    if body.dates_retour is not None:
        patch["dates_retour"] = [d.model_dump() for d in body.dates_retour]
    if body.budget_max is not None:
        patch["budget_max"] = int(body.budget_max)

    result = (
        supabase.table("planned_trips").update(patch).eq("id", trip_id).execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Mise à jour échouée")
    return _row_to_trip(result.data[0])


@router.delete("/api/planner/trips/{trip_id}")
@optional_auth
async def delete_trip(trip_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)
    supabase.table("planned_trips").delete().eq("id", trip_id).execute()
    return {"ok": True}


@router.post("/api/planner/trips/{trip_id}/scan")
@optional_auth
async def scan_trip(trip_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    trip = _require_organizer(supabase, trip_id, user_id)

    supabase.table("planned_trips").update(
        {"status": "scanning", "updated_at": datetime.utcnow().isoformat()}
    ).eq("id", trip_id).execute()

    try:
        dates_depart = [
            DateAvecHoraire(**d) if isinstance(d, dict) else d
            for d in (trip.get("dates_depart") or [])
        ]
        dates_retour = [
            DateAvecHoraire(**d) if isinstance(d, dict) else d
            for d in (trip.get("dates_retour") or [])
        ]
        arrival = (trip.get("arrival_airport") or "").strip().upper() or None
        incluses = [arrival] if arrival else None

        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=trip["departure_airport"],
            dates_depart=dates_depart,
            dates_retour=dates_retour,
            budget_max=int(trip.get("budget_max") or 200),
            limite_allers=30,
            destinations_exclues=[],
            destinations_incluses=incluses,
            record_prices=True,
            passengers=int(trip.get("passengers") or 1),
        )
        enriched = enrich_trip_results(resultats, trip["departure_airport"])
        enriched.sort(key=lambda t: t.prix_total)
        top = enriched[:10]

        # Clear previous pending proposals before inserting new batch
        supabase.table("trip_proposals").delete().eq("trip_id", trip_id).eq(
            "status", "pending"
        ).execute()

        inserted = []
        for t in top:
            row = {
                "trip_id": trip_id,
                "trip_data": t.model_dump(),
                "status": "pending",
            }
            res = supabase.table("trip_proposals").insert(row).execute()
            if res.data:
                inserted.append(res.data[0])

        supabase.table("planned_trips").update(
            {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()

        return {"proposals": inserted, "nombre_requetes": num_requetes}
    except Exception as e:
        supabase.table("planned_trips").update(
            {"status": "draft", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/planner/proposals/{proposal_id}/accept")
@optional_auth
async def accept_proposal(proposal_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    prop = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("id", proposal_id)
        .limit(1)
        .execute()
    )
    if not prop.data:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    proposal = prop.data[0]
    _require_organizer(supabase, proposal["trip_id"], user_id)

    # Reject other pending
    supabase.table("trip_proposals").update({"status": "rejected"}).eq(
        "trip_id", proposal["trip_id"]
    ).eq("status", "pending").neq("id", proposal_id).execute()

    res = (
        supabase.table("trip_proposals")
        .update({"status": "accepted"})
        .eq("id", proposal_id)
        .execute()
    )
    supabase.table("planned_trips").update(
        {"status": "locked", "updated_at": datetime.utcnow().isoformat()}
    ).eq("id", proposal["trip_id"]).execute()
    return res.data[0] if res.data else proposal


@router.post("/api/planner/proposals/{proposal_id}/reject")
@optional_auth
async def reject_proposal(proposal_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    prop = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("id", proposal_id)
        .limit(1)
        .execute()
    )
    if not prop.data:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    proposal = prop.data[0]
    _require_organizer(supabase, proposal["trip_id"], user_id)
    res = (
        supabase.table("trip_proposals")
        .update({"status": "rejected"})
        .eq("id", proposal_id)
        .execute()
    )
    return res.data[0] if res.data else {**proposal, "status": "rejected"}


@router.get("/api/planner/invite/{token}")
async def invite_preview(token: str):
    supabase = _svc()
    trip = (
        supabase.table("planned_trips")
        .select("*")
        .eq("invite_token", token)
        .limit(1)
        .execute()
    )
    if not trip.data:
        raise HTTPException(status_code=404, detail="Invitation introuvable")
    row = trip.data[0]
    accepted = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("trip_id", row["id"])
        .eq("status", "accepted")
        .limit(1)
        .execute()
    )
    members = (
        supabase.table("trip_members")
        .select("id", count="exact")
        .eq("trip_id", row["id"])
        .execute()
    )
    accepted_trip = None
    if accepted.data:
        accepted_trip = accepted.data[0].get("trip_data")
    return {
        "name": row["name"],
        "departure_airport": row["departure_airport"],
        "arrival_airport": row.get("arrival_airport"),
        "passengers": row.get("passengers") or 1,
        "dates_depart": row.get("dates_depart") or [],
        "dates_retour": row.get("dates_retour") or [],
        "budget_max": row.get("budget_max") or 200,
        "organizer_name": None,
        "accepted_trip": accepted_trip,
        "members_count": members.count or 0,
        "invite_token": row["invite_token"],
    }


@router.post("/api/planner/invite/{token}/join")
@optional_auth
async def join_invite(token: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    trip = (
        supabase.table("planned_trips")
        .select("*")
        .eq("invite_token", token)
        .limit(1)
        .execute()
    )
    if not trip.data:
        raise HTTPException(status_code=404, detail="Invitation introuvable")
    row = trip.data[0]
    existing = (
        supabase.table("trip_members")
        .select("id")
        .eq("trip_id", row["id"])
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        supabase.table("trip_members").insert(
            {
                "trip_id": row["id"],
                "user_id": user_id,
                "role": "traveler" if row["organizer_id"] != user_id else "organizer",
                "status": "joined",
            }
        ).execute()
    return {"ok": True, "trip_id": row["id"]}
