"""Planner API — collaborative trip planning with price scan proposals."""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request

from api_models import (
    AddTripMemberRequest,
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


def _normalize_arrival(raw: Optional[str]) -> Optional[str]:
    """One IATA or comma-separated city airports (e.g. LIS,OPO)."""
    if not raw:
        return None
    codes = [
        c.strip().upper()
        for c in str(raw).replace(";", ",").split(",")
        if c.strip()
    ]
    bad = [c for c in codes if len(c) != 3 or not c.isalpha()]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Aéroport(s) d'arrivée invalide(s): {', '.join(bad)}",
        )
    return ",".join(codes) if codes else None


def _trip_data_json(trip) -> dict:
    if hasattr(trip, "model_dump"):
        return trip.model_dump(mode="json")
    return dict(trip)


def _parse_date_list(raw) -> list:
    """Normalize JSONB / API date payloads into DateAvecHoraire list."""
    import json

    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    if not isinstance(raw, list):
        return []

    out: list = []
    for item in raw:
        d = item
        if isinstance(d, str):
            try:
                if d.strip().startswith("{"):
                    d = json.loads(d)
                else:
                    d = {
                        "date": d[:10],
                        "heure_min": "00:00",
                        "heure_max": "23:59",
                    }
            except Exception:
                continue
        if not isinstance(d, dict):
            continue
        date_val = d.get("date") or d.get("Date")
        if not date_val:
            continue
        date_str = str(date_val).strip()[:10]
        if len(date_str) < 10:
            continue
        out.append(
            DateAvecHoraire(
                date=date_str,
                heure_min=(d.get("heure_min") or "00:00"),
                heure_max=(d.get("heure_max") or "23:59"),
            )
        )
    return out


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
    arr = _normalize_arrival(body.arrival_airport)
    if len(dep) != 3 or not dep.isalpha():
        raise HTTPException(status_code=400, detail="Aéroport de départ invalide")

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
    props = list(proposals.data or [])

    def _prop_sort_key(p: dict):
        status_rank = {"accepted": 0, "pending": 1, "rejected": 2}.get(
            p.get("status"), 9
        )
        price = (p.get("trip_data") or {}).get("prix_total")
        try:
            price_key = float(price) if price is not None else 1e12
        except (TypeError, ValueError):
            price_key = 1e12
        return (status_rank, price_key, p.get("created_at") or "")

    props.sort(key=_prop_sort_key)
    trip["proposals"] = props
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
        dep = body.departure_airport.strip().upper()
        if len(dep) != 3 or not dep.isalpha():
            raise HTTPException(status_code=400, detail="Aéroport de départ invalide")
        patch["departure_airport"] = dep
    if body.arrival_airport is not None:
        patch["arrival_airport"] = _normalize_arrival(body.arrival_airport)
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


@router.post("/api/planner/trips/{trip_id}/members")
@optional_auth
async def add_trip_member(trip_id: str, body: AddTripMemberRequest, request: Request):
    """Add a named traveler (guest / not yet on the app). Organizer only."""
    user_id = _require_user(request)
    supabase = _svc()
    trip = _require_organizer(supabase, trip_id, user_id)

    name = (body.display_name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nom trop court")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="Nom trop long")

    members = (
        supabase.table("trip_members")
        .select("id")
        .eq("trip_id", trip_id)
        .execute()
    )
    count = len(members.data or [])
    if count >= 6:
        raise HTTPException(status_code=400, detail="Maximum 6 voyageurs")

    result = (
        supabase.table("trip_members")
        .insert(
            {
                "trip_id": trip_id,
                "user_id": None,
                "display_name": name,
                "role": "traveler",
                "status": "guest",
            }
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Ajout échoué")

    # Keep seats >= named travelers for pricing
    new_count = count + 1
    seats = int(trip.get("passengers") or 1)
    if new_count > seats:
        supabase.table("planned_trips").update(
            {
                "passengers": min(6, new_count),
                "updated_at": datetime.utcnow().isoformat(),
            }
        ).eq("id", trip_id).execute()

    return result.data[0]


@router.delete("/api/planner/trips/{trip_id}/members/{member_id}")
@optional_auth
async def remove_trip_member(trip_id: str, member_id: str, request: Request):
    """Remove a traveler. Organizer only; cannot remove the organizer."""
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)

    existing = (
        supabase.table("trip_members")
        .select("*")
        .eq("id", member_id)
        .eq("trip_id", trip_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Voyageur introuvable")
    row = existing.data[0]
    if row.get("role") == "organizer":
        raise HTTPException(status_code=400, detail="Impossible de retirer l'organisateur")

    supabase.table("trip_members").delete().eq("id", member_id).eq(
        "trip_id", trip_id
    ).execute()
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
        dates_depart = _parse_date_list(trip.get("dates_depart"))
        dates_retour = _parse_date_list(trip.get("dates_retour"))
        if not dates_depart or not dates_retour:
            raise HTTPException(
                status_code=400,
                detail="Dates aller/retour manquantes sur le voyage — impossible de scanner",
            )

        # Always search the whole calendar day of the trip dates
        dates_depart = [
            DateAvecHoraire(date=d.date, heure_min="00:00", heure_max="23:59")
            for d in dates_depart
        ]
        dates_retour = [
            DateAvecHoraire(date=d.date, heure_min="00:00", heure_max="23:59")
            for d in dates_retour
        ]

        print(
            f"🔎 Planner scan {trip_id} dates aller="
            f"{[d.date for d in dates_depart]} retour={[d.date for d in dates_retour]} "
            f"dep={trip.get('departure_airport')} arr={trip.get('arrival_airport')}"
        )

        arrival = (trip.get("arrival_airport") or "").strip().upper() or None
        if arrival:
            codes = [c.strip() for c in arrival.replace(";", ",").split(",") if c.strip()]
            incluses = codes if codes else None
        else:
            incluses = None

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

        # Replace previous pending proposals with this scan batch
        supabase.table("trip_proposals").delete().eq("trip_id", trip_id).eq(
            "status", "pending"
        ).execute()

        rows = [
            {
                "trip_id": trip_id,
                "trip_data": _trip_data_json(t),
                "status": "pending",
            }
            for t in top
        ]

        inserted: list = []
        if rows:
            res = supabase.table("trip_proposals").insert(rows).execute()
            inserted = list(res.data or [])
            if len(inserted) != len(rows):
                # Fallback one-by-one if batch partial/empty
                print(
                    f"⚠️ Batch insert proposals: {len(inserted)}/{len(rows)} — retry unitaire"
                )
                inserted = []
                for row in rows:
                    one = supabase.table("trip_proposals").insert(row).execute()
                    if one.data:
                        inserted.append(one.data[0])
                    else:
                        print(f"❌ Échec insert proposition: {row.get('trip_data', {}).get('destination_code')}")

            if top and not inserted:
                raise HTTPException(
                    status_code=500,
                    detail="Scan OK mais enregistrement des propositions échoué",
                )

        print(
            f"✅ Planner scan {trip_id}: {len(inserted)} proposition(s) enregistrée(s) "
            f"({num_requetes} req Ryanair)"
        )

        supabase.table("planned_trips").update(
            {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()

        return {
            "proposals": inserted,
            "nombre_requetes": num_requetes,
            "saved": len(inserted),
        }
    except HTTPException:
        supabase.table("planned_trips").update(
            {"status": "draft", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()
        raise
    except Exception as e:
        supabase.table("planned_trips").update(
            {"status": "draft", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()
        print(f"❌ Planner scan échoué {trip_id}: {e}")
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
    trip_id = row["id"]

    existing = (
        supabase.table("trip_members")
        .select("id")
        .eq("trip_id", trip_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return {"ok": True, "trip_id": trip_id}

    # Prefer claiming a guest placeholder so "hors app" → "sur l'app"
    guests = (
        supabase.table("trip_members")
        .select("*")
        .eq("trip_id", trip_id)
        .eq("status", "guest")
        .is_("user_id", "null")
        .order("joined_at")
        .limit(1)
        .execute()
    )
    if guests.data:
        guest = guests.data[0]
        supabase.table("trip_members").update(
            {
                "user_id": user_id,
                "status": "joined",
                "role": "traveler" if row["organizer_id"] != user_id else "organizer",
            }
        ).eq("id", guest["id"]).execute()
        return {"ok": True, "trip_id": trip_id, "claimed_guest": True}

    members = (
        supabase.table("trip_members")
        .select("id")
        .eq("trip_id", trip_id)
        .execute()
    )
    count = len(members.data or [])
    if count >= 6:
        raise HTTPException(status_code=400, detail="Voyage complet (6 voyageurs max)")

    supabase.table("trip_members").insert(
        {
            "trip_id": trip_id,
            "user_id": user_id,
            "role": "traveler" if row["organizer_id"] != user_id else "organizer",
            "status": "joined",
        }
    ).execute()

    new_count = count + 1
    seats = int(row.get("passengers") or 1)
    if new_count > seats:
        supabase.table("planned_trips").update(
            {
                "passengers": min(6, new_count),
                "updated_at": datetime.utcnow().isoformat(),
            }
        ).eq("id", trip_id).execute()

    return {"ok": True, "trip_id": trip_id}
