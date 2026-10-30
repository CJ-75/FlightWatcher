"""Planner API — collaborative trip planning with price scan proposals."""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException, Request

from api_models import (
    AddTripMemberRequest,
    CreatePlannedTripRequest,
    DateAvecHoraire,
    UpdatePlannedTripRequest,
)
from email_notify import notify_trip_under_budget
from flight_scanner import enrich_trip_results, scanner_vols_api
from ryanair_routes import invalid_arrival_codes
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()

MIN_AUTO_SCAN_INTERVAL = 900
CRON_SECRET = (os.getenv("CRON_SECRET") or "").strip()


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


def _normalize_airport_list(raw: Optional[str], *, kind: str) -> Optional[str]:
    """One IATA or comma-separated city airports (e.g. CDG,ORY,BVA)."""
    if not raw:
        return None
    codes = [
        c.strip().upper()
        for c in str(raw).replace(";", ",").split(",")
        if c.strip()
    ]
    bad = [c for c in codes if len(c) != 3 or not c.isalpha()]
    if bad:
        label = "d'arrivée" if kind == "arrival" else "de départ"
        raise HTTPException(
            status_code=400,
            detail=f"Aéroport(s) {label} invalide(s): {', '.join(bad)}",
        )
    return ",".join(codes) if codes else None


def _normalize_arrival(raw: Optional[str]) -> Optional[str]:
    return _normalize_airport_list(raw, kind="arrival")


def _normalize_departure(raw: Optional[str]) -> str:
    dep = _normalize_airport_list(raw, kind="departure")
    if not dep:
        raise HTTPException(status_code=400, detail="Aéroport de départ invalide")
    return dep


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


def _member_display_name(m: dict, organizer_name: Optional[str] = None) -> str:
    if m.get("role") == "organizer" and organizer_name:
        return organizer_name
    name = (m.get("display_name") or "").strip()
    if name and name.lower() not in ("organisateur", "organizer"):
        return name
    if m.get("role") == "organizer":
        return organizer_name or "Organisateur"
    return name or "Voyageur"


def _row_to_trip(
    row: dict,
    proposals_count: Optional[int] = None,
    members: Optional[list] = None,
    organizer_profile: Optional[dict] = None,
) -> dict:
    dep = row.get("departure_airport")
    arr = row.get("arrival_airport")
    bad = invalid_arrival_codes(dep, arr) if dep and arr else []
    org = organizer_profile or {}
    org_name = (org.get("full_name") or "").strip() or None
    org_avatar = (org.get("avatar_url") or "").strip() or None
    mems = list(members or [])
    mems.sort(
        key=lambda m: (
            0 if m.get("role") == "organizer" else 1,
            (m.get("joined_at") or ""),
        )
    )
    member_names = [_member_display_name(m, org_name) for m in mems]
    return {
        "id": row["id"],
        "organizer_id": row["organizer_id"],
        "name": row["name"],
        "departure_airport": dep,
        "arrival_airport": arr,
        "passengers": row.get("passengers") or 1,
        "direct": bool(row.get("direct")),
        "dates_depart": row.get("dates_depart") or [],
        "dates_retour": row.get("dates_retour") or [],
        "budget_max": row.get("budget_max") or 200,
        "invite_token": row["invite_token"],
        "status": row.get("status") or "planning",
        "auto_scan_enabled": bool(row.get("auto_scan_enabled")),
        "auto_scan_interval_seconds": int(
            row.get("auto_scan_interval_seconds") or 3600
        ),
        "last_scan_at": row.get("last_scan_at"),
        "last_notified_at": row.get("last_notified_at"),
        "last_notified_cheapest": row.get("last_notified_cheapest"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "proposals_count": proposals_count,
        "route_ok": len(bad) == 0,
        "invalid_arrival_codes": bad,
        "member_names": member_names,
        "members_count": len(member_names),
        "organizer": {
            "id": row["organizer_id"],
            "full_name": org_name,
            "avatar_url": org_avatar,
        },
    }


def _clamp_auto_scan_interval(n: Optional[int]) -> int:
    try:
        v = int(n if n is not None else 3600)
    except (TypeError, ValueError):
        v = 3600
    return max(MIN_AUTO_SCAN_INTERVAL, min(86400 * 7, v))


def _parse_iso_dt(raw) -> Optional[datetime]:
    if not raw:
        return None
    try:
        s = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _proposal_prix_total(prop: dict) -> Optional[float]:
    data = prop.get("trip_data") or {}
    if isinstance(data, str):
        import json

        try:
            data = json.loads(data)
        except Exception:
            return None
    if not isinstance(data, dict):
        return None
    try:
        return float(data.get("prix_total"))
    except (TypeError, ValueError):
        return None


def _cheapest_under_budget(
    proposals: List[dict], budget_max: float
) -> Optional[float]:
    prices = []
    for p in proposals:
        price = _proposal_prix_total(p)
        if price is not None and price <= budget_max:
            prices.append(price)
    return min(prices) if prices else None


def _collect_trip_notify_emails(supabase, trip: dict) -> List[str]:
    emails: List[str] = []
    org_id = trip.get("organizer_id")
    if org_id:
        try:
            prof = (
                supabase.table("user_profiles")
                .select("email")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                emails.append(prof.data[0].get("email"))
        except Exception as e:
            print(f"⚠️ organizer email lookup: {e}")
    try:
        mems = (
            supabase.table("trip_members")
            .select("email")
            .eq("trip_id", trip["id"])
            .execute()
        )
        for m in mems.data or []:
            emails.append(m.get("email"))
    except Exception as e:
        print(f"⚠️ members email lookup: {e}")
    return emails


def _maybe_notify_under_budget(
    supabase, trip: dict, proposals: List[dict]
) -> Tuple[bool, Optional[float]]:
    """Email travelers if under-budget and cheaper than last notified price."""
    budget_max = float(trip.get("budget_max") or 200)
    cheapest = _cheapest_under_budget(proposals, budget_max)
    if cheapest is None:
        return False, None

    last = trip.get("last_notified_cheapest")
    try:
        last_f = float(last) if last is not None else None
    except (TypeError, ValueError):
        last_f = None

    if last_f is not None and cheapest >= last_f:
        return False, cheapest

    recipients = _collect_trip_notify_emails(supabase, trip)
    if not recipients:
        print(f"📧 no recipients for trip {trip.get('id')} — skip notify mark")
        return False, cheapest

    notify_trip_under_budget(
        trip_id=str(trip["id"]),
        trip_name=str(trip.get("name") or "Voyage"),
        budget_max=budget_max,
        cheapest=cheapest,
        recipients=recipients,
    )
    now = _utcnow().isoformat()
    # Record even if Resend skipped (no API key) to avoid spam once configured
    supabase.table("planned_trips").update(
        {
            "last_notified_cheapest": cheapest,
            "last_notified_at": now,
            "updated_at": now,
        }
    ).eq("id", trip["id"]).execute()
    return True, cheapest


def _run_trip_scan(supabase, trip: dict) -> dict:
    """Core scan logic (service role). Raises HTTPException on validation errors."""
    trip_id = trip["id"]
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
        bad = invalid_arrival_codes(trip["departure_airport"], arrival)
        if bad:
            codes = [c for c in codes if c not in bad]
            print(
                f"⚠️ Scan {trip_id}: routes mortes ignorées {bad} "
                f"(reste {codes or 'inspire'})"
            )
            if not codes:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Plus de vols {trip['departure_airport']} → "
                        f"{', '.join(bad)}. Change la destination du voyage "
                        "ou passe en mode inspire (sans arrivée)."
                    ),
                )
            supabase.table("planned_trips").update(
                {
                    "arrival_airport": ",".join(codes),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).eq("id", trip_id).execute()
        incluses = codes if codes else None
    else:
        incluses = None

    # limite_allers=18 : premier passage rapide (Search-like), top 10 suffit au mur
    resultats, num_requetes = scanner_vols_api(
        aeroport_depart=trip["departure_airport"],
        dates_depart=dates_depart,
        dates_retour=dates_retour,
        budget_max=int(trip.get("budget_max") or 200),
        limite_allers=18,
        destinations_exclues=[],
        destinations_incluses=incluses,
        record_prices=True,
        passengers=int(trip.get("passengers") or 1),
        direct=bool(trip.get("direct") or False),
    )
    enriched = enrich_trip_results(resultats, trip["departure_airport"])
    enriched.sort(key=lambda t: t.prix_total)
    top = enriched[:10]

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
            print(
                f"⚠️ Batch insert proposals: {len(inserted)}/{len(rows)} — retry unitaire"
            )
            inserted = []
            for row in rows:
                one = supabase.table("trip_proposals").insert(row).execute()
                if one.data:
                    inserted.append(one.data[0])
                else:
                    print(
                        f"❌ Échec insert proposition: "
                        f"{row.get('trip_data', {}).get('destination_code')}"
                    )

        if top and not inserted:
            raise HTTPException(
                status_code=500,
                detail="Scan OK mais enregistrement des propositions échoué",
            )

    print(
        f"✅ Planner scan {trip_id}: {len(inserted)} proposition(s) enregistrée(s) "
        f"({num_requetes} req Ryanair)"
    )

    budget_max = int(trip.get("budget_max") or 200)
    empty_reason = None
    cheapest_found = None
    if not inserted:
        try:
            # Diagnostic léger (budget trop bas ?) — ne pas doubler le coût d’un inspire
            diag, n_diag = scanner_vols_api(
                aeroport_depart=trip["departure_airport"],
                dates_depart=dates_depart,
                dates_retour=dates_retour,
                budget_max=max(budget_max * 4, 800),
                limite_allers=5,
                destinations_exclues=[],
                destinations_incluses=incluses,
                record_prices=False,
                passengers=int(trip.get("passengers") or 1),
                direct=bool(trip.get("direct") or False),
            )
            num_requetes += n_diag
            if diag:
                diag_sorted = sorted(diag, key=lambda t: t.prix_total)
                cheapest_found = float(diag_sorted[0].prix_total)
                empty_reason = "budget"
            else:
                empty_reason = "no_flights"
        except Exception as diag_err:
            print(f"⚠️ Diagnostic scan vide {trip_id}: {diag_err}")
            empty_reason = "no_flights"

    now = _utcnow().isoformat()
    supabase.table("planned_trips").update(
        {
            "status": "planning",
            "last_scan_at": now,
            "updated_at": now,
        }
    ).eq("id", trip_id).execute()

    return {
        "proposals": inserted,
        "nombre_requetes": num_requetes,
        "saved": len(inserted),
        "budget_max": budget_max,
        "empty_reason": empty_reason,
        "cheapest_found": cheapest_found,
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


_TRIPS_LIST_SELECT = (
    "id,organizer_id,name,departure_airport,arrival_airport,passengers,direct,"
    "dates_depart,dates_retour,budget_max,invite_token,status,"
    "auto_scan_enabled,auto_scan_interval_seconds,last_scan_at,"
    "last_notified_at,last_notified_cheapest,created_at,updated_at"
)


@router.get("/api/planner/trips")
@optional_auth
async def list_trips(request: Request):
    user_id = _require_user(request)
    supabase = _svc()

    owned = (
        supabase.table("planned_trips")
        .select(_TRIPS_LIST_SELECT)
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
            .select(_TRIPS_LIST_SELECT)
            .in_("id", member_ids)
            .order("created_at", desc=True)
            .execute()
        )
        member_trips = mt.data or []

    by_id: Dict[str, dict] = {}
    for row in (owned.data or []) + member_trips:
        by_id[row["id"]] = row

    trip_ids = list(by_id.keys())
    members_by_trip: Dict[str, list] = {tid: [] for tid in trip_ids}
    proposal_counts: Dict[str, int] = {tid: 0 for tid in trip_ids}
    if trip_ids:
        mem_res = (
            supabase.table("trip_members")
            .select("trip_id, display_name, role, status, joined_at, user_id")
            .in_("trip_id", trip_ids)
            .execute()
        )
        for m in mem_res.data or []:
            tid = m.get("trip_id")
            if tid in members_by_trip:
                members_by_trip[tid].append(m)
        # One query for all proposal counts (was N+1 per trip)
        try:
            prop_res = (
                supabase.table("trip_proposals")
                .select("trip_id")
                .in_("trip_id", trip_ids)
                .execute()
            )
            for p in prop_res.data or []:
                tid = p.get("trip_id")
                if tid in proposal_counts:
                    proposal_counts[tid] += 1
        except Exception as e:
            print(f"⚠️ Proposal counts batch: {e}")

    organizer_ids = list({row["organizer_id"] for row in by_id.values() if row.get("organizer_id")})
    profiles_by_id: Dict[str, dict] = {}
    if organizer_ids:
        try:
            prof_res = (
                supabase.table("user_profiles")
                .select("id, full_name, avatar_url")
                .in_("id", organizer_ids)
                .execute()
            )
            for p in prof_res.data or []:
                if p.get("id"):
                    profiles_by_id[p["id"]] = p
        except Exception as e:
            print(f"⚠️ Profiles organisateurs: {e}")

    out = []
    for row in by_id.values():
        out.append(
            _row_to_trip(
                row,
                proposals_count=proposal_counts.get(row["id"], 0),
                members=members_by_trip.get(row["id"], []),
                organizer_profile=profiles_by_id.get(row["organizer_id"]),
            )
        )
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

    dep = _normalize_departure(body.departure_airport)
    arr = _normalize_arrival(body.arrival_airport)

    bad = invalid_arrival_codes(dep, arr)
    if bad:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Route indisponible depuis {dep} : {', '.join(bad)}. "
                "Choisis une destination encore desservie, ou retire l’arrivée."
            ),
        )

    token = secrets.token_hex(16)
    data = {
        "organizer_id": user_id,
        "name": body.name.strip(),
        "departure_airport": dep,
        "arrival_airport": arr,
        "passengers": _clamp_passengers(body.passengers),
        "direct": bool(body.direct),
        "dates_depart": [d.model_dump() for d in body.dates_depart],
        "dates_retour": [d.model_dump() for d in body.dates_retour],
        "budget_max": int(body.budget_max or 200),
        "invite_token": token,
        "status": "planning",
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
    current = _require_organizer(supabase, trip_id, user_id)

    patch: Dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
    if body.name is not None:
        patch["name"] = body.name.strip()
    if body.departure_airport is not None:
        patch["departure_airport"] = _normalize_departure(body.departure_airport)
    # Allow explicit null to clear arrival (inspire mode)
    fields_set = getattr(body, "model_fields_set", None) or getattr(
        body, "__fields_set__", set()
    )
    if "arrival_airport" in fields_set:
        patch["arrival_airport"] = _normalize_arrival(body.arrival_airport)
    if body.passengers is not None:
        patch["passengers"] = _clamp_passengers(body.passengers)
    if body.direct is not None:
        patch["direct"] = bool(body.direct)
    if body.dates_depart is not None:
        patch["dates_depart"] = [d.model_dump() for d in body.dates_depart]
    if body.dates_retour is not None:
        patch["dates_retour"] = [d.model_dump() for d in body.dates_retour]
    if body.budget_max is not None:
        patch["budget_max"] = int(body.budget_max)
    if body.auto_scan_enabled is not None:
        patch["auto_scan_enabled"] = bool(body.auto_scan_enabled)
        if body.auto_scan_enabled and current.get("status") == "locked":
            raise HTTPException(
                status_code=400,
                detail="Surveillance désactivée sur un voyage confirmé",
            )
    if body.auto_scan_interval_seconds is not None:
        patch["auto_scan_interval_seconds"] = _clamp_auto_scan_interval(
            body.auto_scan_interval_seconds
        )

    dep = patch.get("departure_airport") or current.get("departure_airport")
    arr = (
        patch["arrival_airport"]
        if "arrival_airport" in patch
        else current.get("arrival_airport")
    )
    bad = invalid_arrival_codes(dep, arr)
    if bad:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Route indisponible depuis {dep} : {', '.join(bad)}. "
                "Choisis une destination encore desservie, ou retire l’arrivée."
            ),
        )

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

    first = (body.first_name or "").strip()
    last = (body.last_name or "").strip()
    if first or last:
        name = f"{first} {last}".strip()
    else:
        name = (body.display_name or "").strip()
    if len(first) < 1 and not name:
        raise HTTPException(status_code=400, detail="Prénom requis")
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nom trop court")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Nom trop long")

    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email requis")
    if len(email) > 120 or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email invalide")

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
                "email": email,
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

    # TODO: send invite email via Resend (name + email + invite_token)
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

    if trip.get("status") == "locked":
        raise HTTPException(
            status_code=400, detail="Voyage confirmé — scan indisponible"
        )

    supabase.table("planned_trips").update(
        {"status": "scanning", "updated_at": datetime.utcnow().isoformat()}
    ).eq("id", trip_id).execute()

    try:
        return _run_trip_scan(supabase, trip)
    except HTTPException:
        supabase.table("planned_trips").update(
            {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()
        raise
    except Exception as e:
        supabase.table("planned_trips").update(
            {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", trip_id).execute()
        print(f"❌ Planner scan échoué {trip_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _require_cron(authorization: Optional[str]) -> None:
    if not CRON_SECRET:
        raise HTTPException(
            status_code=503, detail="CRON_SECRET non configuré sur le serveur"
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer requis")
    token = authorization.replace("Bearer ", "", 1).strip()
    if token != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Secret cron invalide")


@router.post("/api/planner/auto-scan")
async def auto_scan_trips(authorization: Optional[str] = Header(None)):
    """Cron job: scan planning trips with auto_scan_enabled when interval elapsed."""
    _require_cron(authorization)
    supabase = _svc()

    result = (
        supabase.table("planned_trips")
        .select("*")
        .eq("auto_scan_enabled", True)
        .eq("status", "planning")
        .execute()
    )
    trips = list(result.data or [])
    now = _utcnow()
    scanned = 0
    notified = 0
    skipped = 0
    errors: List[dict] = []

    for trip in trips:
        trip_id = trip.get("id")
        interval = _clamp_auto_scan_interval(trip.get("auto_scan_interval_seconds"))
        last = _parse_iso_dt(trip.get("last_scan_at"))
        if last is not None:
            elapsed = (now - last).total_seconds()
            if elapsed < interval:
                skipped += 1
                continue

        try:
            supabase.table("planned_trips").update(
                {
                    "status": "scanning",
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).eq("id", trip_id).execute()
            scan_res = _run_trip_scan(supabase, trip)
            scanned += 1
            # Refresh notify baseline from DB row + scan result
            did_notify, _ = _maybe_notify_under_budget(
                supabase, trip, scan_res.get("proposals") or []
            )
            if did_notify:
                notified += 1
        except HTTPException as he:
            supabase.table("planned_trips").update(
                {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
            ).eq("id", trip_id).execute()
            errors.append({"trip_id": trip_id, "detail": he.detail})
            print(f"⚠️ auto-scan HTTP {trip_id}: {he.detail}")
        except Exception as e:
            supabase.table("planned_trips").update(
                {"status": "planning", "updated_at": datetime.utcnow().isoformat()}
            ).eq("id", trip_id).execute()
            errors.append({"trip_id": trip_id, "detail": str(e)})
            print(f"❌ auto-scan {trip_id}: {e}")

    return {
        "ok": True,
        "eligible": len(trips),
        "scanned": scanned,
        "notified": notified,
        "skipped": skipped,
        "errors": errors,
    }


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
        {
            "status": "locked",
            "auto_scan_enabled": False,
            "updated_at": datetime.utcnow().isoformat(),
        }
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
