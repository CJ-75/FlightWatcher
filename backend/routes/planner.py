"""Planner API — collaborative trip planning with price scan proposals."""
from __future__ import annotations

import asyncio
import os
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
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
# Same pattern as /api/inspire — never block the asyncio loop on live Ryanair/TP.
_PLANNER_SCAN_POOL = ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="fw-planner-scan"
)


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

    # Always search the whole calendar day of the trip dates; drop past outbounds
    today = date.today().isoformat()
    dates_depart = [
        DateAvecHoraire(date=d.date, heure_min="00:00", heure_max="23:59")
        for d in dates_depart
        if (d.date or "")[:10] >= today
    ]
    dates_retour = [
        DateAvecHoraire(date=d.date, heure_min="00:00", heure_max="23:59")
        for d in dates_retour
        if (d.date or "")[:10] >= today
    ]
    if not dates_depart or not dates_retour:
        raise HTTPException(
            status_code=400,
            detail="Toutes les dates de ce voyage sont passées — mets à jour les dates",
        )

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

    # Same live path as Search /inspire: full limite + search priority (not a short cache pass).
    from search_priority import search_active

    with search_active():
        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=trip["departure_airport"],
            dates_depart=dates_depart,
            dates_retour=dates_retour,
            budget_max=int(trip.get("budget_max") or 200),
            limite_allers=0,
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


def _date10(value: Any) -> Optional[str]:
    raw = str(value or "").strip()
    return raw[:10] if len(raw) >= 10 else None


def _planner_draft_payload(trip_data: dict, passengers: int) -> dict:
    """Trusted Planner proposal snapshot -> MyTrip create payload."""
    aller = dict(trip_data.get("aller") or {})
    retour = dict(trip_data.get("retour") or {})
    destination = (
        trip_data.get("destination_code")
        or aller.get("destination")
        or ""
    )
    outbound = _date10(aller.get("departureTime"))
    inbound = _date10(retour.get("departureTime"))
    if not destination or not outbound or not inbound:
        raise HTTPException(
            status_code=400,
            detail="La proposition acceptée n'a pas de destination ou de dates valides",
        )
    pax = _clamp_passengers(passengers)
    price_pp = float(trip_data.get("prix_total") or 0)
    booking_url = trip_data.get("booking_url")
    city = (
        str(aller.get("destinationFull") or "").split(",")[0].strip()
        or destination
    )
    return {
        "origin_iata": aller.get("origin"),
        "departure_airport": aller.get("origin"),
        "destination": destination,
        "city": city,
        "dates": {"outbound": outbound, "inbound": inbound},
        "adults": pax,
        "compose_hotel": True,
        "flight": {
            "price_pp": price_pp,
            "provider": trip_data.get("provider"),
            "airline": trip_data.get("airline"),
            "booking_url": booking_url,
            "direct": int(trip_data.get("transfers") or 0) == 0,
            "origin_iata": aller.get("origin"),
            "destination_iata": destination,
            "outbound_local": aller.get("departureTime") or outbound,
            "inbound_local": retour.get("departureTime") or inbound,
            "out_dep_local": aller.get("departureTime") or outbound,
            "ret_dep_local": retour.get("departureTime") or inbound,
        },
        "price_per_person": round(price_pp),
        "booking_url": booking_url,
    }


_BOOKING_RANK = {
    "confirmed": 7,
    "booking_pending": 6,
    "payment_succeeded": 5,
    "payment_pending": 4,
    "prebooked": 3,
    "draft": 2,
    "failed": 1,
    "cancelled": 0,
}


def _best_booking(rows: List[dict]) -> Optional[dict]:
    if not rows:
        return None
    return max(
        rows,
        key=lambda row: (
            _BOOKING_RANK.get(str(row.get("status") or ""), -1),
            str(row.get("updated_at") or row.get("created_at") or ""),
        ),
    )


_FLIGHT_BOOKED_STATUSES = {"user_confirmed", "partner_confirmed"}


def _flight_pipeline_state(
    *,
    accepted: Optional[dict],
    draft: Optional[dict],
) -> str:
    if not draft and not accepted:
        return "none"
    payload = (draft or {}).get("payload") or {}
    if payload.get("flight_external") or payload.get("external_flight"):
        return "booked"
    status = str(
        (draft or {}).get("flight_booking_status")
        or payload.get("flight_booking_status")
        or ""
    )
    if (
        (draft or {}).get("flight_booked_at")
        or payload.get("flight_booked")
        or payload.get("flight_booked_at")
        or status in _FLIGHT_BOOKED_STATUSES
    ):
        return "booked"
    if accepted or draft:
        return "selected"
    return "none"


def _external_flight_payload(trip: dict) -> dict:
    """Build a hotel-compose draft when the user already has flights elsewhere."""
    dep_codes = [
        c.strip().upper()
        for c in str(trip.get("departure_airport") or "").split(",")
        if c.strip()
    ]
    arr_codes = [
        c.strip().upper()
        for c in str(trip.get("arrival_airport") or "").split(",")
        if c.strip()
    ]
    if not dep_codes:
        raise HTTPException(status_code=400, detail="Aéroport de départ requis")
    if not arr_codes:
        raise HTTPException(
            status_code=400,
            detail="Choisis une destination avant de passer à l’hôtel",
        )
    out_date = _date10((trip.get("dates_depart") or [{}])[0].get("date"))
    ret_date = _date10((trip.get("dates_retour") or [{}])[-1].get("date"))
    if not out_date or not ret_date:
        raise HTTPException(status_code=400, detail="Dates aller/retour requises")
    origin = dep_codes[0]
    destination = arr_codes[0]
    pax = _clamp_passengers(trip.get("passengers") or 1)
    city = str(trip.get("name") or "").replace("Weekend ", "").strip() or destination
    return {
        "origin_iata": origin,
        "departure_airport": origin,
        "destination": destination,
        "city": city,
        "dates": {"outbound": out_date, "inbound": ret_date},
        "adults": pax,
        "compose_hotel": True,
        "flight_external": True,
        "external_flight": True,
        "flight": {
            "price_pp": 0,
            "external": True,
            "origin_iata": origin,
            "destination_iata": destination,
            "outbound_local": out_date,
            "inbound_local": ret_date,
            "out_dep_local": out_date,
            "ret_dep_local": ret_date,
        },
        "price_per_person": 0,
    }


def _hotel_pipeline_state(
    *,
    draft: Optional[dict],
    booking: Optional[dict],
    phase: str,
) -> str:
    if phase == "booked":
        return "booked"
    payload = (draft or {}).get("payload") or {}
    if payload.get("hotel_external") or payload.get("external_hotel"):
        return "booked"
    if (
        (draft or {}).get("hotel_booked_at")
        or payload.get("hotel_booked")
        or payload.get("hotel_booked_at")
        or (
            booking
            and str(booking.get("status"))
            in {"confirmed", "booking_pending", "payment_succeeded"}
        )
    ):
        return "booked"
    if draft and (payload.get("hotel") or (draft or {}).get("hotel")):
        return "selected"
    return "none"


def _workspace_phase(
    *,
    ret_date: Optional[str],
    accepted: Optional[dict],
    draft: Optional[dict],
    booking: Optional[dict],
) -> str:
    if ret_date and ret_date < date.today().isoformat():
        return "past"
    if booking and str(booking.get("status")) in {
        "confirmed",
        "booking_pending",
        "payment_succeeded",
    }:
        return "booked"
    payload = (draft or {}).get("payload") or {} if draft else {}
    hotel_external = bool(
        payload.get("hotel_external") or payload.get("external_hotel")
    )
    if draft and (
        draft.get("hotel_booked_at")
        or payload.get("hotel_booked")
        or hotel_external
    ):
        return "booked"
    if draft:
        return "composing"
    if accepted:
        return "flight_selected"
    return "planning"


_ACCENT_MAP = str.maketrans(
    {
        "à": "a",
        "â": "a",
        "ä": "a",
        "á": "a",
        "ç": "c",
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "í": "i",
        "î": "i",
        "ï": "i",
        "ó": "o",
        "ô": "o",
        "ö": "o",
        "ù": "u",
        "û": "u",
        "ü": "u",
        "ñ": "n",
    }
)


def _norm_label(value: Optional[str]) -> str:
    text = str(value or "").lower().translate(_ACCENT_MAP)
    return re.sub(r"[^a-z0-9]", "", text)


def _iata_tokens(*values: Any) -> set:
    out: set = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            for item in value:
                out |= _iata_tokens(item)
            continue
        for part in re.split(r"[,;/|\s]+", str(value)):
            code = part.strip().upper()
            if len(code) == 3 and code.isalpha():
                out.add(code)
    return out


def _date_close(a: Optional[str], b: Optional[str], days: int = 2) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    try:
        da = date.fromisoformat(a[:10])
        db = date.fromisoformat(b[:10])
        return abs((da - db).days) <= days
    except Exception:
        return False


def _draft_booking(
    draft: Optional[dict],
    bookings_by_draft_id: Dict[str, List[dict]],
    bookings_by_token: Dict[str, List[dict]],
) -> Optional[dict]:
    if not draft:
        return None
    draft_id = str(draft.get("id") or "")
    token = str(draft.get("draft_token") or "")
    return _best_booking(
        bookings_by_draft_id.get(draft_id, []) + bookings_by_token.get(token, [])
    )


def _draft_link_rank(
    draft: dict,
    bookings_by_draft_id: Dict[str, List[dict]],
    bookings_by_token: Dict[str, List[dict]],
) -> Tuple[int, int, str]:
    booking = _draft_booking(draft, bookings_by_draft_id, bookings_by_token)
    rank = _BOOKING_RANK.get(str((booking or {}).get("status") or ""), -1)
    payload = draft.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}
    hotel_done = 1 if (
        draft.get("hotel_booked_at")
        or payload.get("hotel_booked")
        or payload.get("hotel_booked_at")
        or payload.get("hotel_external")
        or payload.get("external_hotel")
    ) else 0
    return (rank, hotel_done, str(draft.get("updated_at") or ""))


def _trip_dest_iatas(trip: dict, accepted: Optional[dict]) -> set:
    trip_data = (accepted or {}).get("trip_data") or {}
    return _iata_tokens(
        trip_data.get("destination_code"),
        (trip_data.get("aller") or {}).get("destination"),
        trip.get("arrival_airport"),
    )


def _trip_city_label(trip: dict, accepted: Optional[dict]) -> str:
    trip_data = (accepted or {}).get("trip_data") or {}
    dest_full = str((trip_data.get("aller") or {}).get("destinationFull") or "")
    city = dest_full.split(",")[0].strip() if dest_full else ""
    name = str(trip.get("name") or "")
    for prefix in ("Weekend ", "Voyage ", "Séjour "):
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break
    return city or name.strip()


def _trip_dates(
    trip: dict, accepted: Optional[dict]
) -> Tuple[Optional[str], Optional[str]]:
    trip_data = (accepted or {}).get("trip_data") or {}
    out_date = _date10((trip_data.get("aller") or {}).get("departureTime")) or _date10(
        (trip.get("dates_depart") or [{}])[0].get("date")
    )
    ret_date = _date10((trip_data.get("retour") or {}).get("departureTime")) or _date10(
        (trip.get("dates_retour") or [{}])[-1].get("date")
    )
    return out_date, ret_date


def _draft_dest_iatas(draft: dict) -> set:
    payload = draft.get("payload") or {}
    flight = payload.get("flight") or {}
    return _iata_tokens(
        draft.get("dest_iata"),
        flight.get("destination_iata"),
        payload.get("destination"),
        payload.get("dest_iata"),
    )


def _draft_city_label(draft: dict) -> str:
    payload = draft.get("payload") or {}
    return str(draft.get("city_name") or payload.get("city") or "")


def _draft_dates(draft: dict) -> Tuple[Optional[str], Optional[str]]:
    payload = draft.get("payload") or {}
    dates = payload.get("dates") or {}
    return (
        _date10(draft.get("out_date") or dates.get("outbound")),
        _date10(draft.get("ret_date") or dates.get("inbound")),
    )


def _dest_compatible(trip: dict, accepted: Optional[dict], draft: dict) -> bool:
    trip_codes = _trip_dest_iatas(trip, accepted)
    draft_codes = _draft_dest_iatas(draft)
    if trip_codes and draft_codes and trip_codes & draft_codes:
        return True
    trip_city = _norm_label(_trip_city_label(trip, accepted))
    draft_city = _norm_label(_draft_city_label(draft))
    if trip_city and draft_city and (
        trip_city == draft_city
        or trip_city in draft_city
        or draft_city in trip_city
    ):
        return True
    return False


def _dates_compatible(
    trip_out: Optional[str],
    trip_ret: Optional[str],
    draft_out: Optional[str],
    draft_ret: Optional[str],
) -> bool:
    # Dest-only match is allowed when one side has no dates.
    if trip_out and draft_out and not _date_close(trip_out, draft_out):
        return False
    if trip_ret and draft_ret and not _date_close(trip_ret, draft_ret):
        return False
    return True


def _persist_draft_trip_link(
    supabase,
    draft: dict,
    trip_id: str,
    *,
    proposal_id: Optional[str] = None,
) -> None:
    patch: Dict[str, Any] = {
        "source_planned_trip_id": trip_id,
        "source_kind": "planner",
    }
    if proposal_id and not draft.get("source_proposal_id"):
        patch["source_proposal_id"] = proposal_id
    try:
        supabase.table("my_trip_drafts").update(patch).eq(
            "id", draft["id"]
        ).execute()
    except Exception as exc:
        print(f"⚠️ Heal draft→trip link: {exc}")
    draft["source_planned_trip_id"] = trip_id
    draft["source_kind"] = "planner"
    if proposal_id and not draft.get("source_proposal_id"):
        draft["source_proposal_id"] = proposal_id


def _heal_orphan_drafts_to_trips(
    supabase,
    *,
    trips_by_id: Dict[str, dict],
    accepted_by_trip: Dict[str, dict],
    drafts: List[dict],
    drafts_by_trip: Dict[str, dict],
    bookings_by_draft_id: Dict[str, List[dict]],
    bookings_by_token: Dict[str, List[dict]],
) -> None:
    """Attach personal drafts/bookings to planner trips by dest + dates."""
    linked_ids = {
        str(row["id"]) for row in drafts_by_trip.values() if row.get("id")
    }
    orphans = [
        draft
        for draft in drafts
        if draft.get("id")
        and str(draft["id"]) not in linked_ids
        and not draft.get("source_planned_trip_id")
    ]
    for draft in orphans:
        draft_id = str(draft["id"])
        draft_out, draft_ret = _draft_dates(draft)
        orphan_rank = _draft_link_rank(
            draft, bookings_by_draft_id, bookings_by_token
        )
        best_trip: Optional[str] = None
        best_score: Optional[Tuple] = None
        for trip_id, trip in trips_by_id.items():
            accepted = accepted_by_trip.get(trip_id)
            if not _dest_compatible(trip, accepted, draft):
                continue
            trip_out, trip_ret = _trip_dates(trip, accepted)
            if not _dates_compatible(trip_out, trip_ret, draft_out, draft_ret):
                continue
            existing = drafts_by_trip.get(trip_id)
            if existing:
                existing_rank = _draft_link_rank(
                    existing, bookings_by_draft_id, bookings_by_token
                )
                # Keep an already-linked draft unless the orphan clearly wins
                # (e.g. Lisbon booking sitting on an unlinked personal draft).
                if orphan_rank <= existing_rank:
                    continue
            score = (
                orphan_rank[0],
                1 if not existing else 0,
                orphan_rank[1],
            )
            if best_score is None or score > best_score:
                best_score = score
                best_trip = trip_id
        if not best_trip:
            continue
        proposal_id = (accepted_by_trip.get(best_trip) or {}).get("id")
        _persist_draft_trip_link(
            supabase, draft, best_trip, proposal_id=proposal_id
        )
        drafts_by_trip[best_trip] = draft
        linked_ids.add(draft_id)


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


@router.get("/api/travel-workspaces")
@optional_auth
async def list_travel_workspaces(request: Request):
    """Unified read model; underlying Planner/draft/booking rows stay authoritative."""
    user_id = _require_user(request)
    supabase = _svc()

    owned = (
        supabase.table("planned_trips")
        .select(_TRIPS_LIST_SELECT)
        .eq("organizer_id", user_id)
        .execute()
    )
    memberships = (
        supabase.table("trip_members")
        .select("trip_id")
        .eq("user_id", user_id)
        .execute()
    )
    member_ids = [
        row["trip_id"]
        for row in (memberships.data or [])
        if row.get("trip_id")
    ]
    member_trips: list = []
    if member_ids:
        member_trips = (
            supabase.table("planned_trips")
            .select(_TRIPS_LIST_SELECT)
            .in_("id", member_ids)
            .execute()
        ).data or []

    trips_by_id = {
        row["id"]: row for row in (owned.data or []) + member_trips
    }
    trip_ids = list(trips_by_id)
    proposals: list = []
    if trip_ids:
        proposals = (
            supabase.table("trip_proposals")
            .select("*")
            .in_("trip_id", trip_ids)
            .execute()
        ).data or []
    accepted_by_trip = {
        row["trip_id"]: row
        for row in proposals
        if row.get("status") == "accepted"
    }

    drafts = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("user_id", user_id)
        .neq("status", "archived")
        .execute()
    ).data or []
    # Drafts linked to my trips may be guest-owned until claim — still drive pipeline.
    if trip_ids:
        linked = (
            supabase.table("my_trip_drafts")
            .select("*")
            .in_("source_planned_trip_id", trip_ids)
            .neq("status", "archived")
            .execute()
        ).data or []
        by_id = {str(d["id"]): d for d in drafts if d.get("id")}
        for row in linked:
            rid = str(row.get("id") or "")
            if rid and rid not in by_id:
                by_id[rid] = row
                drafts.append(row)
    bookings = (
        supabase.table("hotel_bookings")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    draft_tokens = [
        str(d.get("draft_token"))
        for d in drafts
        if d.get("draft_token")
    ]
    draft_row_ids = [str(d["id"]) for d in drafts if d.get("id")]
    if draft_tokens or draft_row_ids:
        extra_bookings: list = []
        if draft_row_ids:
            extra_bookings.extend(
                (
                    supabase.table("hotel_bookings")
                    .select("*")
                    .in_("draft_id", draft_row_ids)
                    .execute()
                ).data
                or []
            )
        if draft_tokens:
            extra_bookings.extend(
                (
                    supabase.table("hotel_bookings")
                    .select("*")
                    .in_("draft_token", draft_tokens)
                    .execute()
                ).data
                or []
            )
        seen_b = {str(b["id"]) for b in bookings if b.get("id")}
        for b in extra_bookings:
            bid = str(b.get("id") or "")
            if bid and bid not in seen_b:
                seen_b.add(bid)
                bookings.append(b)

    bookings_by_draft_id: Dict[str, List[dict]] = {}
    bookings_by_token: Dict[str, List[dict]] = {}
    for booking in bookings:
        if booking.get("draft_id"):
            bookings_by_draft_id.setdefault(str(booking["draft_id"]), []).append(booking)
        if booking.get("draft_token"):
            bookings_by_token.setdefault(str(booking["draft_token"]), []).append(booking)

    drafts_by_trip: Dict[str, dict] = {}
    for draft in drafts:
        source_trip = draft.get("source_planned_trip_id")
        if not source_trip:
            continue
        current = drafts_by_trip.get(source_trip)
        if not current or _draft_link_rank(
            draft, bookings_by_draft_id, bookings_by_token
        ) > _draft_link_rank(current, bookings_by_draft_id, bookings_by_token):
            drafts_by_trip[source_trip] = draft

    _heal_orphan_drafts_to_trips(
        supabase,
        trips_by_id=trips_by_id,
        accepted_by_trip=accepted_by_trip,
        drafts=drafts,
        drafts_by_trip=drafts_by_trip,
        bookings_by_draft_id=bookings_by_draft_id,
        bookings_by_token=bookings_by_token,
    )

    consumed_drafts = set()
    consumed_bookings = set()
    workspaces: list = []

    for trip in trips_by_id.values():
        trip_id = str(trip["id"])
        accepted = accepted_by_trip.get(trip_id)
        draft = drafts_by_trip.get(trip_id)
        booking = None
        if draft:
            consumed_drafts.add(str(draft["id"]))
            booking = _draft_booking(
                draft, bookings_by_draft_id, bookings_by_token
            )
        if booking:
            consumed_bookings.add(str(booking["id"]))
        trip_data = (accepted or {}).get("trip_data") or {}
        payload = (draft or {}).get("payload") or {}
        flight = payload.get("flight") or {}
        out_date = (
            _date10((trip_data.get("aller") or {}).get("departureTime"))
            or _date10((trip.get("dates_depart") or [{}])[0].get("date"))
        )
        ret_date = (
            _date10((trip_data.get("retour") or {}).get("departureTime"))
            or _date10((trip.get("dates_retour") or [{}])[-1].get("date"))
        )
        phase = _workspace_phase(
            ret_date=ret_date,
            accepted=accepted,
            draft=draft,
            booking=booking,
        )
        is_organizer = trip.get("organizer_id") == user_id
        workspaces.append(
            {
                "workspace_id": f"planner:{trip_id}",
                "planned_trip_id": trip_id,
                "proposal_id": (accepted or {}).get("id"),
                "draft_id": (draft or {}).get("id"),
                "draft_token": (draft or {}).get("draft_token"),
                "flight_booking_status": (draft or {}).get("flight_booking_status")
                or payload.get("flight_booking_status"),
                "flight_booking_provider": (draft or {}).get("flight_booking_provider")
                or payload.get("flight_booking_provider"),
                "hotel_booking_id": (booking or {}).get("id"),
                "hotel_booking_status": (booking or {}).get("status"),
                "scope": "collaborative",
                "phase": phase,
                "title": trip.get("name") or "Voyage",
                "city": payload.get("city")
                or draft and draft.get("city_name")
                or (trip_data.get("aller") or {}).get("destinationFull"),
                "origin_iata": flight.get("origin_iata")
                or (trip_data.get("aller") or {}).get("origin")
                or trip.get("departure_airport"),
                "dest_iata": flight.get("destination_iata")
                or trip_data.get("destination_code")
                or trip.get("arrival_airport"),
                "out_date": out_date,
                "ret_date": ret_date,
                "image_url": trip_data.get("image_url") or payload.get("image_url"),
                "is_organizer": is_organizer,
                "capabilities": {
                    "can_scan": is_organizer and phase == "planning",
                    "can_choose_flight": is_organizer and phase == "planning",
                    "can_compose_hotel": accepted is not None or draft is not None,
                    "can_view_confirmation": booking is not None,
                },
                "pipeline": {
                    "flight": _flight_pipeline_state(accepted=accepted, draft=draft),
                    "hotel": _hotel_pipeline_state(
                        draft=draft, booking=booking, phase=phase
                    ),
                },
                "planned_trip": _row_to_trip(trip),
                "updated_at": (draft or {}).get("updated_at")
                or trip.get("updated_at"),
            }
        )

    for draft in drafts:
        draft_id = str(draft["id"])
        if draft_id in consumed_drafts:
            continue
        token = str(draft.get("draft_token") or "")
        booking = _best_booking(
            bookings_by_draft_id.get(draft_id, [])
            + bookings_by_token.get(token, [])
        )
        if booking:
            consumed_bookings.add(str(booking["id"]))
        payload = draft.get("payload") or {}
        flight = payload.get("flight") or {}
        ret_date = _date10(draft.get("ret_date"))
        phase = _workspace_phase(
            ret_date=ret_date,
            accepted=None,
            draft=draft,
            booking=booking,
        )
        workspaces.append(
            {
                "workspace_id": f"draft:{draft_id}",
                "planned_trip_id": None,
                "proposal_id": None,
                "draft_id": draft_id,
                "draft_token": token,
                "flight_booking_status": draft.get("flight_booking_status")
                or payload.get("flight_booking_status"),
                "flight_booking_provider": draft.get("flight_booking_provider")
                or payload.get("flight_booking_provider"),
                "hotel_booking_id": (booking or {}).get("id"),
                "hotel_booking_status": (booking or {}).get("status"),
                "scope": "personal",
                "phase": phase,
                "title": f"Séjour à {draft.get('city_name') or payload.get('city') or 'destination'}",
                "city": draft.get("city_name") or payload.get("city"),
                "origin_iata": draft.get("origin_iata") or flight.get("origin_iata"),
                "dest_iata": draft.get("dest_iata") or flight.get("destination_iata"),
                "out_date": _date10(draft.get("out_date")),
                "ret_date": ret_date,
                "image_url": payload.get("image_url"),
                "is_organizer": False,
                "capabilities": {
                    "can_scan": False,
                    "can_choose_flight": False,
                    "can_compose_hotel": True,
                    "can_view_confirmation": booking is not None,
                },
                "pipeline": {
                    "flight": _flight_pipeline_state(accepted=None, draft=draft),
                    "hotel": _hotel_pipeline_state(
                        draft=draft, booking=booking, phase=phase
                    ),
                },
                "planned_trip": None,
                "updated_at": draft.get("updated_at"),
            }
        )

    for booking in bookings:
        if str(booking["id"]) in consumed_bookings:
            continue
        snapshot = booking.get("deal_snapshot") or {}
        dates = snapshot.get("dates") or {}
        workspaces.append(
            {
                "workspace_id": f"booking:{booking['id']}",
                "planned_trip_id": None,
                "proposal_id": None,
                "draft_id": booking.get("draft_id"),
                "draft_token": booking.get("draft_token"),
                "flight_booking_status": None,
                "flight_booking_provider": None,
                "hotel_booking_id": booking["id"],
                "hotel_booking_status": booking.get("status"),
                "scope": "personal",
                "phase": _workspace_phase(
                    ret_date=_date10(dates.get("inbound")),
                    accepted=None,
                    draft=None,
                    booking=booking,
                ),
                "title": snapshot.get("hotel_name") or "Réservation hôtel",
                "city": snapshot.get("city"),
                "origin_iata": None,
                "dest_iata": snapshot.get("destination"),
                "out_date": _date10(dates.get("outbound")),
                "ret_date": _date10(dates.get("inbound")),
                "image_url": snapshot.get("image_url"),
                "is_organizer": False,
                "capabilities": {
                    "can_scan": False,
                    "can_choose_flight": False,
                    "can_compose_hotel": False,
                    "can_view_confirmation": True,
                },
                "pipeline": {"flight": "none", "hotel": "booked"},
                "planned_trip": None,
                "updated_at": booking.get("updated_at"),
            }
        )

    workspaces.sort(key=lambda row: str(row.get("updated_at") or ""), reverse=True)
    return workspaces


@router.post("/api/planner/trips")
@optional_auth
async def create_trip(body: CreatePlannedTripRequest, request: Request):
    user_id = _require_user(request)
    supabase = _svc()

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Nom du voyage requis")
    if not body.dates_depart or not body.dates_retour:
        raise HTTPException(status_code=400, detail="Dates aller et retour requises")

    today = date.today().isoformat()
    if not any((d.date or "")[:10] >= today for d in body.dates_depart):
        raise HTTPException(
            status_code=400,
            detail="Choisis au moins une date de départ aujourd’hui ou plus tard",
        )

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
        name = body.name.strip()
        if len(name) < 2 or len(name) > 80:
            raise HTTPException(
                status_code=400,
                detail="Le nom du voyage doit faire entre 2 et 80 caractères",
            )
        patch["name"] = name
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

    modality_keys = {
        "departure_airport",
        "arrival_airport",
        "passengers",
        "direct",
        "dates_depart",
        "dates_retour",
        "budget_max",
    }
    modalities_changed = bool(modality_keys.intersection(patch.keys()))
    if modalities_changed and current.get("status") == "locked":
        blocked = _trip_has_active_reservation(supabase, trip_id)
        if blocked:
            raise HTTPException(status_code=409, detail=blocked)
        _reopen_flight_selection(supabase, trip_id)
        patch["status"] = "planning"
        patch["auto_scan_enabled"] = False

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
    """Delete the collaborative Planner only.

    Personal execution drafts and hotel bookings stay. Provenance FKs are
    nulled first so a missing/wrong ON DELETE rule cannot cascade into
    reservations.
    """
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)

    # Detach reservations before removing the planner graph (proposals CASCADE).
    # Never delete my_trip_drafts / hotel_bookings here.
    try:
        now = datetime.utcnow().isoformat()
        detach = {
            "source_planned_trip_id": None,
            "source_proposal_id": None,
            "updated_at": now,
        }
        supabase.table("my_trip_drafts").update(detach).eq(
            "source_planned_trip_id", trip_id
        ).execute()
        proposal_rows = (
            supabase.table("trip_proposals")
            .select("id")
            .eq("trip_id", trip_id)
            .execute()
        )
        proposal_ids = [
            str(row["id"])
            for row in (proposal_rows.data or [])
            if row.get("id")
        ]
        if proposal_ids:
            supabase.table("my_trip_drafts").update(detach).in_(
                "source_proposal_id", proposal_ids
            ).execute()
    except Exception as e:
        print(f"⚠️ detach drafts before planner delete: {e}")
        raise HTTPException(
            status_code=500,
            detail="Impossible de détacher les réservations — suppression annulée",
        )

    supabase.table("planned_trips").delete().eq("id", trip_id).execute()
    return {"ok": True, "reservations_preserved": True}


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


_FLIGHT_RESERVED_STATUSES = {"user_confirmed", "partner_confirmed"}
_HOTEL_RESERVED_STATUSES = {
    "confirmed",
    "booking_pending",
    "payment_succeeded",
}


def _trip_has_active_reservation(supabase, trip_id: str) -> Optional[str]:
    """Return a human reason if flight/hotel is already reserved for this planner."""
    drafts = (
        supabase.table("my_trip_drafts")
        .select(
            "id,draft_token,flight_booked_at,flight_booking_status,"
            "hotel_booked_at,payload"
        )
        .eq("source_planned_trip_id", trip_id)
        .neq("status", "archived")
        .execute()
    ).data or []
    draft_ids = [str(row["id"]) for row in drafts if row.get("id")]
    tokens = [
        str(row["draft_token"])
        for row in drafts
        if row.get("draft_token")
    ]
    for draft in drafts:
        payload = draft.get("payload") or {}
        status = str(
            draft.get("flight_booking_status")
            or payload.get("flight_booking_status")
            or ""
        )
        if (
            draft.get("flight_booked_at")
            or payload.get("flight_booked")
            or payload.get("flight_booked_at")
            or status in _FLIGHT_RESERVED_STATUSES
        ):
            return "Vol déjà réservé — modalités figées"
        if (
            draft.get("hotel_booked_at")
            or payload.get("hotel_booked")
            or payload.get("hotel_booked_at")
        ):
            return "Hôtel déjà réservé — modalités figées"

    bookings: list = []
    if draft_ids:
        bookings.extend(
            (
                supabase.table("hotel_bookings")
                .select("id,status")
                .in_("draft_id", draft_ids)
                .execute()
            ).data
            or []
        )
    if tokens:
        bookings.extend(
            (
                supabase.table("hotel_bookings")
                .select("id,status")
                .in_("draft_token", tokens)
                .execute()
            ).data
            or []
        )
    for booking in bookings:
        if str(booking.get("status") or "") in _HOTEL_RESERVED_STATUSES:
            return "Hôtel déjà réservé — modalités figées"
    return None


def _draft_flight_locked(draft: Optional[dict]) -> bool:
    if not draft:
        return False
    payload = draft.get("payload") or {}
    status = str(
        draft.get("flight_booking_status")
        or payload.get("flight_booking_status")
        or ""
    )
    return bool(
        draft.get("flight_booked_at")
        or payload.get("flight_booked")
        or payload.get("flight_booked_at")
        or status in _FLIGHT_BOOKED_STATUSES
        or payload.get("flight_external")
        or payload.get("external_flight")
    )


def _sync_execution_draft_to_proposal(
    supabase,
    draft: dict,
    *,
    trip: dict,
    proposal: dict,
) -> dict:
    """Point a personal draft at the accepted proposal and refresh flight snapshot."""
    proposal_id = proposal["id"]
    trip_id = trip["id"]
    if _draft_flight_locked(draft):
        _persist_draft_trip_link(
            supabase, draft, trip_id, proposal_id=proposal_id
        )
        return draft

    flight_payload = _planner_draft_payload(
        proposal.get("trip_data") or {},
        int(trip.get("passengers") or 1),
    )
    merged = dict(draft.get("payload") or {})
    hotel = merged.get("hotel")
    merged.update(flight_payload)
    if hotel and not flight_payload.get("hotel"):
        merged["hotel"] = hotel

    dates = flight_payload.get("dates") or {}
    now = datetime.utcnow().isoformat()
    # Planner execution drafts must outlive the default 7-day deal expiry.
    expires_at = (datetime.utcnow() + timedelta(days=365)).isoformat()
    patch = {
        "payload": merged,
        "source_planned_trip_id": trip_id,
        "source_proposal_id": proposal_id,
        "source_kind": "planner",
        "origin_iata": flight_payload.get("origin_iata")
        or flight_payload.get("departure_airport"),
        "dest_iata": flight_payload.get("destination"),
        "city_name": flight_payload.get("city"),
        "out_date": dates.get("outbound"),
        "ret_date": dates.get("inbound"),
        "adults": int(flight_payload.get("adults") or trip.get("passengers") or 1),
        "expires_at": expires_at,
        "status": "draft" if draft.get("status") == "archived" else draft.get("status") or "draft",
        "updated_at": now,
    }
    try:
        res = (
            supabase.table("my_trip_drafts")
            .update(patch)
            .eq("id", draft["id"])
            .execute()
        )
        if res.data:
            return res.data[0]
    except Exception as exc:
        print(f"⚠️ Sync draft→accepted proposal: {exc}")
    draft.update(patch)
    return draft


def _ensure_execution_draft_for_accepted(
    supabase,
    *,
    trip: dict,
    proposal: dict,
    user_id: str,
) -> Optional[dict]:
    """Persist the chosen flight into my_trip_drafts (boarding / booking source)."""
    proposal_id = proposal["id"]
    trip_id = trip["id"]

    existing = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("source_proposal_id", proposal_id)
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if existing:
        # Always refresh flight snapshot + trip link (reload survival).
        return _sync_execution_draft_to_proposal(
            supabase, existing[0], trip=trip, proposal=proposal
        )

    by_trip = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("source_planned_trip_id", trip_id)
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    ).data or []
    if by_trip:
        return _sync_execution_draft_to_proposal(
            supabase, by_trip[0], trip=trip, proposal=proposal
        )

    payload = _planner_draft_payload(
        proposal.get("trip_data") or {},
        int(trip.get("passengers") or 1),
    )
    from deals.my_trips import create_draft

    created = create_draft(
        supabase,
        payload=payload,
        user_id=user_id,
        source_planned_trip_id=trip_id,
        source_proposal_id=proposal_id,
        source_kind="planner",
    )
    # create_draft returns a slim DTO — re-read so callers get draft_token + links.
    if created and created.get("draft_token"):
        full = (
            supabase.table("my_trip_drafts")
            .select("*")
            .eq("draft_token", created["draft_token"])
            .limit(1)
            .execute()
        ).data or []
        if full:
            return full[0]
    return created


def _reopen_flight_selection(supabase, trip_id: str) -> None:
    """Drop accepted flight choice and unlock planner for a new scan."""
    now = datetime.utcnow().isoformat()
    supabase.table("trip_proposals").update({"status": "rejected"}).eq(
        "trip_id", trip_id
    ).eq("status", "accepted").execute()
    supabase.table("trip_proposals").delete().eq("trip_id", trip_id).eq(
        "status", "pending"
    ).execute()
    supabase.table("planned_trips").update(
        {
            "status": "planning",
            "auto_scan_enabled": False,
            "updated_at": now,
        }
    ).eq("id", trip_id).execute()


@router.post("/api/planner/trips/{trip_id}/reopen-flight")
@optional_auth
async def reopen_flight(trip_id: str, request: Request):
    """Unlock flight modalities when nothing is reserved yet."""
    user_id = _require_user(request)
    supabase = _svc()
    trip = _require_organizer(supabase, trip_id, user_id)
    blocked = _trip_has_active_reservation(supabase, trip_id)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)
    has_accepted = bool(
        (
            supabase.table("trip_proposals")
            .select("id")
            .eq("trip_id", trip_id)
            .eq("status", "accepted")
            .limit(1)
            .execute()
        ).data
    )
    if trip.get("status") == "locked" or has_accepted:
        _reopen_flight_selection(supabase, trip_id)
    refreshed = (
        supabase.table("planned_trips")
        .select(_TRIPS_LIST_SELECT)
        .eq("id", trip_id)
        .limit(1)
        .execute()
    )
    if not refreshed.data:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
    return {
        "ok": True,
        "trip": _row_to_trip(refreshed.data[0]),
    }


def _user_trip_draft(supabase, trip_id: str, user_id: str) -> Optional[dict]:
    existing = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("source_planned_trip_id", trip_id)
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    return (existing.data or [None])[0]


def _draft_response(data: dict, *, reused: bool, **extra: Any) -> dict:
    return {
        "id": data["id"],
        "draft_token": data["draft_token"],
        "status": data.get("status") or "draft",
        "payload": data.get("payload") or {},
        "expires_at": data.get("expires_at"),
        "reused": reused,
        "source_planned_trip_id": data.get("source_planned_trip_id"),
        "source_proposal_id": data.get("source_proposal_id"),
        **extra,
    }


@router.post("/api/planner/trips/{trip_id}/skip-flight")
@optional_auth
async def skip_flight(trip_id: str, request: Request):
    """Skip FlightWatcher booking — user already has flights elsewhere."""
    user_id = _require_user(request)
    supabase = _svc()
    trip = _user_can_access(supabase, trip_id, user_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
    blocked = _trip_has_active_reservation(supabase, trip_id)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)

    payload = _external_flight_payload(trip)
    existing = _user_trip_draft(supabase, trip_id, user_id)
    if existing:
        row = existing
        merged = dict(row.get("payload") or {})
        merged.update(payload)
        now = datetime.utcnow().isoformat()
        updated = (
            supabase.table("my_trip_drafts")
            .update(
                {
                    "payload": merged,
                    "origin_iata": payload.get("origin_iata"),
                    "dest_iata": payload.get("destination"),
                    "city_name": payload.get("city"),
                    "out_date": payload["dates"]["outbound"],
                    "ret_date": payload["dates"]["inbound"],
                    "adults": payload.get("adults") or 1,
                    "source_kind": "planner",
                    "updated_at": now,
                }
            )
            .eq("id", row["id"])
            .execute()
        )
        data = (updated.data or [row])[0]
        return _draft_response(
            data,
            reused=True,
            source_planned_trip_id=trip_id,
            flight_external=True,
        )

    try:
        from deals.my_trips import create_draft

        draft = create_draft(
            supabase,
            payload=payload,
            user_id=user_id,
            source_planned_trip_id=trip_id,
            source_kind="planner",
        )
        return {
            **draft,
            "reused": False,
            "source_planned_trip_id": trip_id,
            "source_proposal_id": None,
            "flight_external": True,
        }
    except Exception as exc:
        print(f"❌ skip-flight {trip_id}: {exc}")
        raise HTTPException(status_code=500, detail="Impossible de passer à l’hôtel")


@router.post("/api/planner/trips/{trip_id}/skip-hotel")
@optional_auth
async def skip_hotel(trip_id: str, request: Request):
    """Skip FlightWatcher hotel — user already has lodging elsewhere."""
    user_id = _require_user(request)
    supabase = _svc()
    trip = _user_can_access(supabase, trip_id, user_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage introuvable")

    draft_row = _user_trip_draft(supabase, trip_id, user_id)
    accepted = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("trip_id", trip_id)
        .eq("status", "accepted")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    accepted_row = (accepted.data or [None])[0]

    # Ensure a personal draft exists (from accepted flight, skip-flight, or both).
    if not draft_row and accepted_row:
        payload = _planner_draft_payload(
            accepted_row.get("trip_data") or {},
            int(trip.get("passengers") or 1),
        )
        try:
            from deals.my_trips import create_draft

            created = create_draft(
                supabase,
                payload=payload,
                user_id=user_id,
                source_planned_trip_id=trip_id,
                source_proposal_id=accepted_row.get("id"),
                source_kind="planner",
            )
            draft_row = (
                supabase.table("my_trip_drafts")
                .select("*")
                .eq("id", created["id"])
                .limit(1)
                .execute()
            ).data[0]
        except Exception as exc:
            print(f"⚠️ skip-hotel create from proposal {trip_id}: {exc}")
            # Unique / race — reuse any draft already linked to this trip or proposal.
            draft_row = _user_trip_draft(supabase, trip_id, user_id)
            if not draft_row and accepted_row.get("id"):
                raced = (
                    supabase.table("my_trip_drafts")
                    .select("*")
                    .eq("source_proposal_id", accepted_row["id"])
                    .eq("user_id", user_id)
                    .neq("status", "archived")
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                draft_row = (raced.data or [None])[0]
            if not draft_row:
                raise HTTPException(
                    status_code=500, detail="Impossible de préparer le séjour"
                )
    elif not draft_row:
        # No flight chosen yet — seed an external-flight draft then mark hotel external.
        try:
            from deals.my_trips import create_draft

            created = create_draft(
                supabase,
                payload=_external_flight_payload(trip),
                user_id=user_id,
                source_planned_trip_id=trip_id,
                source_kind="planner",
            )
            draft_row = (
                supabase.table("my_trip_drafts")
                .select("*")
                .eq("id", created["id"])
                .limit(1)
                .execute()
            ).data[0]
        except HTTPException:
            raise
        except Exception as exc:
            print(f"❌ skip-hotel seed draft {trip_id}: {exc}")
            raise HTTPException(
                status_code=500, detail="Impossible de préparer le séjour"
            )

    payload = dict(draft_row.get("payload") or {})
    if (
        draft_row.get("hotel_booked_at")
        or payload.get("hotel_booked")
        or payload.get("hotel_booked_at")
    ):
        raise HTTPException(
            status_code=409,
            detail="Hôtel déjà réservé sur FlightWatcher",
        )

    # Block if a paid/confirmed hotel booking already exists for this draft.
    booking_rows: list = (
        supabase.table("hotel_bookings")
        .select("id,status")
        .eq("draft_id", draft_row["id"])
        .execute()
    ).data or []
    token = str(draft_row.get("draft_token") or "").strip()
    if token:
        booking_rows.extend(
            (
                supabase.table("hotel_bookings")
                .select("id,status")
                .eq("draft_token", token)
                .execute()
            ).data
            or []
        )
    for booking in booking_rows:
        if str(booking.get("status") or "") in _HOTEL_RESERVED_STATUSES:
            raise HTTPException(
                status_code=409,
                detail="Hôtel déjà réservé sur FlightWatcher",
            )

    if not isinstance(payload, dict):
        payload = {}
    payload["hotel_external"] = True
    payload["external_hotel"] = True
    payload["hotel_booked"] = True
    now = datetime.utcnow().isoformat()
    payload["hotel_booked_at"] = now
    payload.pop("hotel", None)
    patch: Dict[str, Any] = {
        "payload": payload,
        "source_kind": "planner",
        "source_planned_trip_id": trip_id,
        "updated_at": now,
    }
    # Best-effort column when migration is applied.
    try:
        patch["hotel_booked_at"] = now
        updated = (
            supabase.table("my_trip_drafts")
            .update(patch)
            .eq("id", draft_row["id"])
            .execute()
        )
    except Exception as exc:
        print(f"⚠️ skip-hotel column patch: {exc}")
        patch.pop("hotel_booked_at", None)
        updated = (
            supabase.table("my_trip_drafts")
            .update(patch)
            .eq("id", draft_row["id"])
            .execute()
        )
    data = (updated.data or [{**draft_row, **patch}])[0]
    # Prefer a fresh read so clients get payload + columns consistently.
    try:
        from deals.my_trips import get_draft

        token = str(data.get("draft_token") or draft_row.get("draft_token") or "")
        refreshed = get_draft(supabase, token) if token else None
        if refreshed:
            data = refreshed
    except Exception:
        pass
    return _draft_response(
        data,
        reused=True,
        source_planned_trip_id=trip_id,
        hotel_external=True,
        hotel_booked_at=data.get("hotel_booked_at") or now,
    )


@router.post("/api/planner/trips/{trip_id}/scan")
@optional_auth
async def scan_trip(trip_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    trip = _require_organizer(supabase, trip_id, user_id)

    if trip.get("status") == "locked":
        blocked = _trip_has_active_reservation(supabase, trip_id)
        if blocked:
            raise HTTPException(status_code=409, detail=blocked)
        _reopen_flight_selection(supabase, trip_id)
        trip = (
            supabase.table("planned_trips")
            .select("*")
            .eq("id", trip_id)
            .limit(1)
            .execute()
        ).data[0]

    supabase.table("planned_trips").update(
        {"status": "scanning", "updated_at": datetime.utcnow().isoformat()}
    ).eq("id", trip_id).execute()

    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            _PLANNER_SCAN_POOL, lambda: _run_trip_scan(supabase, trip)
        )
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
    """Lock the chosen scanned flight in DB — it becomes the boarding pass."""
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
    trip = _require_organizer(supabase, proposal["trip_id"], user_id)

    blocked = _trip_has_active_reservation(supabase, proposal["trip_id"])
    if blocked and proposal.get("status") != "accepted":
        raise HTTPException(status_code=409, detail=blocked)

    # One accepted flight per trip: demote every sibling first.
    supabase.table("trip_proposals").update({"status": "rejected"}).eq(
        "trip_id", proposal["trip_id"]
    ).neq("id", proposal_id).in_("status", ["pending", "accepted"]).execute()

    res = (
        supabase.table("trip_proposals")
        .update({"status": "accepted"})
        .eq("id", proposal_id)
        .execute()
    )
    accepted = res.data[0] if res.data else None
    if not accepted or accepted.get("status") != "accepted":
        raise HTTPException(
            status_code=500,
            detail="Impossible d'enregistrer le vol choisi",
        )

    locked = (
        supabase.table("planned_trips")
        .update(
            {
                "status": "locked",
                "auto_scan_enabled": False,
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", proposal["trip_id"])
        .execute()
    )
    if not locked.data or locked.data[0].get("status") != "locked":
        raise HTTPException(
            status_code=500,
            detail="Vol enregistré mais verrouillage du voyage échoué",
        )

    # Durable snapshot for boarding pass / booking / hotel compose.
    # Must succeed — otherwise the chosen flight vanishes after reload.
    try:
        draft = _ensure_execution_draft_for_accepted(
            supabase,
            trip={**trip, **(locked.data[0] or {})},
            proposal=accepted,
            user_id=user_id,
        )
        if not draft or not draft.get("draft_token"):
            raise RuntimeError("execution draft missing after accept")
    except Exception as exc:
        print(f"❌ accept→execution draft {proposal_id}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Vol choisi mais enregistrement du séjour échoué — réessaie",
        ) from exc

    return accepted


@router.post("/api/planner/proposals/{proposal_id}/execution-draft")
@optional_auth
async def get_or_create_execution_draft(proposal_id: str, request: Request):
    """Create at most one personal MyTrip draft per accepted proposal/user."""
    user_id = _require_user(request)
    supabase = _svc()
    prop_res = (
        supabase.table("trip_proposals")
        .select("*")
        .eq("id", proposal_id)
        .limit(1)
        .execute()
    )
    if not prop_res.data:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    proposal = prop_res.data[0]
    if proposal.get("status") != "accepted":
        raise HTTPException(
            status_code=409,
            detail="Le vol doit être choisi avant de composer le séjour",
        )
    trip = _user_can_access(supabase, proposal["trip_id"], user_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage introuvable")

    def _execution_draft_response(row: dict, *, reused: bool) -> dict:
        return {
            "id": row["id"],
            "draft_token": row["draft_token"],
            "status": row.get("status") or "draft",
            "payload": row.get("payload") or {},
            "expires_at": row.get("expires_at"),
            "reused": reused,
            "source_planned_trip_id": row.get("source_planned_trip_id")
            or proposal["trip_id"],
            "source_proposal_id": row.get("source_proposal_id") or proposal_id,
        }

    existing = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("source_proposal_id", proposal_id)
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = _sync_execution_draft_to_proposal(
            supabase, existing.data[0], trip=trip, proposal=proposal
        )
        return _execution_draft_response(row, reused=True)

    by_trip = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("source_planned_trip_id", proposal["trip_id"])
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    ).data or []
    if by_trip:
        row = _sync_execution_draft_to_proposal(
            supabase, by_trip[0], trip=trip, proposal=proposal
        )
        return _execution_draft_response(row, reused=True)

    # Reuse an unlinked personal draft that already holds the Lisbon (etc.) booking.
    orphans = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("user_id", user_id)
        .is_("source_planned_trip_id", "null")
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    ).data or []
    for row in orphans:
        if not _dest_compatible(trip, proposal, row):
            continue
        trip_out, trip_ret = _trip_dates(trip, proposal)
        draft_out, draft_ret = _draft_dates(row)
        if not _dates_compatible(trip_out, trip_ret, draft_out, draft_ret):
            continue
        row = _sync_execution_draft_to_proposal(
            supabase, row, trip=trip, proposal=proposal
        )
        return _execution_draft_response(row, reused=True)

    try:
        draft_row = _ensure_execution_draft_for_accepted(
            supabase, trip=trip, proposal=proposal, user_id=user_id
        )
        if not draft_row:
            raise RuntimeError("empty draft")
        return _execution_draft_response(draft_row, reused=False)
    except Exception as exc:
        # A concurrent tap may have won the partial unique index race.
        raced = (
            supabase.table("my_trip_drafts")
            .select("*")
            .eq("source_proposal_id", proposal_id)
            .eq("user_id", user_id)
            .neq("status", "archived")
            .limit(1)
            .execute()
        )
        if raced.data:
            return _execution_draft_response(raced.data[0], reused=True)
        print(f"❌ execution draft {proposal_id}: {exc}")
        raise HTTPException(status_code=500, detail="Création du séjour échouée")


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
    org_name = None
    org_id = row.get("organizer_id")
    if org_id:
        try:
            prof = (
                supabase.table("user_profiles")
                .select("full_name")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                org_name = (prof.data[0].get("full_name") or "").strip() or None
        except Exception:
            org_name = None
    return {
        "name": row["name"],
        "departure_airport": row["departure_airport"],
        "arrival_airport": row.get("arrival_airport"),
        "passengers": row.get("passengers") or 1,
        "dates_depart": row.get("dates_depart") or [],
        "dates_retour": row.get("dates_retour") or [],
        "budget_max": row.get("budget_max") or 200,
        "organizer_name": org_name,
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
