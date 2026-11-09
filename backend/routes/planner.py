"""Planner API — collaborative trip planning with price scan proposals."""
from __future__ import annotations

import asyncio
import os
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Header, HTTPException, Request

from api_models import (
    AddTripMemberRequest,
    CreatePlannedTripFromFlightRequest,
    CreatePlannedTripFromMyTripRequest,
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


def _single_iata(value: Any) -> str:
    """One airport code for a flown leg — never CDG,ORY,BVA search criteria."""
    raw = str(value or "").strip().upper()
    for part in re.split(r"[,;|/\s]+", raw):
        code = part.strip()
        if len(code) == 3 and code.isalpha():
            return code
    return raw[:3] if len(raw) >= 3 and raw[:3].isalpha() else raw


def _trip_data_json(trip) -> dict:
    if hasattr(trip, "model_dump"):
        data = trip.model_dump(mode="json")
    else:
        data = dict(trip)
    # Boarding pass / accept must store a single origin & destination IATA.
    aller = dict(data.get("aller") or {})
    retour = dict(data.get("retour") or {})
    if aller:
        if aller.get("origin"):
            aller["origin"] = _single_iata(aller.get("origin"))
        if aller.get("destination"):
            aller["destination"] = _single_iata(aller.get("destination"))
        data["aller"] = aller
    if retour:
        if retour.get("origin"):
            retour["origin"] = _single_iata(retour.get("origin"))
        if retour.get("destination"):
            retour["destination"] = _single_iata(retour.get("destination"))
        data["retour"] = retour
    if data.get("destination_code"):
        data["destination_code"] = _single_iata(data.get("destination_code"))
    return data


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


# Flight / hotel wall times are local FR (naive ISO without offset).
_STAY_TZ = timezone(timedelta(hours=1))  # fallback if zoneinfo missing
try:
    from zoneinfo import ZoneInfo

    _STAY_TZ = ZoneInfo("Europe/Paris")
except Exception:
    pass


def _as_stay_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=_STAY_TZ)
    return dt


def _parse_wall_dt(raw: Any) -> Optional[datetime]:
    """Parse flight/hotel local datetime; naive values → Europe/Paris."""
    if not raw:
        return None
    try:
        s = str(raw).strip().replace("Z", "+00:00")
        if len(s) == 10:
            s = f"{s}T23:59:00"
        dt = datetime.fromisoformat(s)
        return _as_stay_aware(dt)
    except Exception:
        return None


def _ends_from_date_and_time(
    date_str: Optional[str], time_str: Optional[str] = None
) -> Optional[datetime]:
    day = _date10(date_str)
    if not day:
        return None
    hhmm = str(time_str or "23:59").strip()[:5] or "23:59"
    if len(hhmm) < 5:
        hhmm = "23:59"
    return _parse_wall_dt(f"{day}T{hhmm}:00")


def _stay_starts_at(
    *,
    trip: Optional[dict] = None,
    accepted: Optional[dict] = None,
    draft: Optional[dict] = None,
    booking: Optional[dict] = None,
) -> Optional[datetime]:
    """Start of séjour = vol aller local, else dates_depart, else hotel check-in."""
    trip_data = (accepted or {}).get("trip_data") or {}
    if isinstance(trip_data, dict):
        aller = trip_data.get("aller") or {}
        if isinstance(aller, dict):
            dt = _parse_wall_dt(
                aller.get("departureTime") or aller.get("departure_time")
            )
            if dt:
                return dt

    if draft:
        payload = (draft.get("payload") or {}) if isinstance(draft, dict) else {}
        if not isinstance(payload, dict):
            payload = {}
        flight = payload.get("flight") or {}
        if isinstance(flight, dict):
            for key in (
                "outbound_local",
                "out_dep_local",
                "outbound_dep_local",
                "departure_local",
            ):
                dt = _parse_wall_dt(flight.get(key))
                if dt:
                    return dt
        dates = payload.get("dates") or {}
        if not isinstance(dates, dict):
            dates = {}
        dt = _ends_from_date_and_time(
            _date10(draft.get("out_date") or dates.get("outbound")),
            "00:00",
        )
        if dt:
            return dt

    if trip:
        dates_depart = trip.get("dates_depart") or []
        if isinstance(dates_depart, list) and dates_depart:
            first = dates_depart[0]
            if isinstance(first, dict):
                dt = _ends_from_date_and_time(
                    first.get("date"),
                    first.get("heure_min") or first.get("heure_max") or "00:00",
                )
                if dt:
                    return dt

    if booking:
        snapshot = booking.get("deal_snapshot") or {}
        if not isinstance(snapshot, dict):
            snapshot = {}
        dates = snapshot.get("dates") or {}
        if not isinstance(dates, dict):
            dates = {}
        hotel = snapshot.get("hotel") if isinstance(snapshot.get("hotel"), dict) else {}
        checkin = (
            hotel.get("checkin_time")
            or hotel.get("check_in_time")
            or hotel.get("checkin")
            or "00:00"
        )
        dt = _ends_from_date_and_time(
            _date10(dates.get("outbound") or dates.get("check_in")),
            str(checkin)[:5] if checkin else "00:00",
        )
        if dt:
            return dt

    return None


def _stay_start_elapsed(starts_at: Optional[datetime]) -> bool:
    """True when current datetime is past the séjour start."""
    if starts_at is None:
        return False
    return _utcnow() >= _as_stay_aware(starts_at)


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
    """None if missing, unauthorized, or non-UUID id (e.g. Expo `dev-trip-*`)."""
    tid = str(trip_id or "").strip()
    if not tid or not user_id or tid.startswith("dev-trip-"):
        return None
    try:
        trip = (
            supabase.table("planned_trips")
            .select("*")
            .eq("id", tid)
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
            .eq("trip_id", tid)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if mem.data:
            return row
        return None
    except Exception:
        # Invalid uuid (22P02) or transient PostgREST errors → treat as missing.
        return None


def _require_organizer(supabase, trip_id: str, user_id: str) -> dict:
    tid = str(trip_id or "").strip()
    try:
        trip = (
            supabase.table("planned_trips")
            .select("*")
            .eq("id", tid)
            .eq("organizer_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
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
    destination = _single_iata(
        trip_data.get("destination_code")
        or aller.get("destination")
        or ""
    )
    origin = _single_iata(aller.get("origin"))
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
        "origin_iata": origin,
        "departure_airport": origin,
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
            "transfers": int(trip_data.get("transfers") or 0),
            "origin_iata": origin,
            "destination_iata": destination,
            "outbound_local": aller.get("departureTime") or outbound,
            "inbound_local": retour.get("departureTime") or inbound,
            "out_dep_local": aller.get("departureTime") or outbound,
            "ret_dep_local": retour.get("departureTime") or inbound,
            "outbound_flight_number": aller.get("flightNumber")
            or aller.get("flight_number"),
            "inbound_flight_number": retour.get("flightNumber")
            or retour.get("flight_number"),
            "flight_number": aller.get("flightNumber")
            or aller.get("flight_number"),
            "return_flight_number": retour.get("flightNumber")
            or retour.get("flight_number"),
            "aller": {
                "flightNumber": aller.get("flightNumber")
                or aller.get("flight_number"),
                "origin": origin,
                "destination": destination,
                "departureTime": aller.get("departureTime") or outbound,
            },
            "retour": {
                "flightNumber": retour.get("flightNumber")
                or retour.get("flight_number"),
                "origin": destination,
                "destination": origin,
                "departureTime": retour.get("departureTime") or inbound,
            },
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


_HOTEL_BOOKED_STATUSES = {
    "confirmed",
    "booking_pending",
    "payment_succeeded",
}
# Selected / checkout started but not finalized — still visible in Planner.
_HOTEL_SELECTED_STATUSES = {
    "draft",
    "prebooked",
    "payment_pending",
}
_HOTEL_DEAD_STATUSES = {"failed", "cancelled"}


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
    booking_status = str((booking or {}).get("status") or "")
    if (
        (draft or {}).get("hotel_booked_at")
        or payload.get("hotel_booked")
        or payload.get("hotel_booked_at")
        or booking_status in _HOTEL_BOOKED_STATUSES
    ):
        return "booked"
    if booking_status in _HOTEL_DEAD_STATUSES:
        booking = None
    if (
        (draft and (payload.get("hotel") or (draft or {}).get("hotel")))
        or booking_status in _HOTEL_SELECTED_STATUSES
        or booking is not None
    ):
        return "selected"
    return "none"


def _workspace_progress_phase(
    *,
    accepted: Optional[dict],
    draft: Optional[dict],
    booking: Optional[dict],
) -> str:
    """Progress through vol → hôtel, ignoring calendar."""
    booking_status = str((booking or {}).get("status") or "")
    if booking_status in _HOTEL_BOOKED_STATUSES:
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
    # Hôtel choisi ou checkout entamé (prebook / payment) → séjour en cours.
    if draft:
        return "composing"
    if booking is not None and booking_status not in _HOTEL_DEAD_STATUSES:
        return "composing"
    if accepted:
        return "flight_selected"
    return "planning"


def _workspace_phase(
    *,
    ret_date: Optional[str],
    accepted: Optional[dict],
    draft: Optional[dict],
    booking: Optional[dict],
    trip_status: Optional[str] = None,
    starts_at: Optional[datetime] = None,
    out_date: Optional[str] = None,
) -> str:
    """
    Past (= retiré des séjours en cours) when:
    - organizer archived (status=completed), or
    - current datetime >= séjour start (aller / check-in date+time).
    """
    # ret_date kept for call-site compat; retirement uses start, not end.
    _ = ret_date
    if str(trip_status or "") == "completed":
        return "past"
    if starts_at is None:
        starts_at = _stay_starts_at(
            accepted=accepted, draft=draft, booking=booking
        )
        if starts_at is None and out_date:
            starts_at = _ends_from_date_and_time(out_date, "00:00")
    if _stay_start_elapsed(starts_at):
        return "past"
    return _workspace_progress_phase(
        accepted=accepted, draft=draft, booking=booking
    )


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


def _strip_city_noise(value: str) -> str:
    city = str(value or "").split(",")[0].strip().split("(")[0].strip()
    for prefix in ("Weekend ", "Voyage ", "Séjour à ", "Séjour "):
        if city.lower().startswith(prefix.lower()):
            city = city[len(prefix) :].strip()
            break
    for noise in (
        " Airport",
        " Aeropuerto",
        " Aéroport",
        " International",
        "-Barajas",
        " Barajas",
    ):
        if noise.lower() in city.lower():
            # Drop airport/tail noise while keeping the city token.
            idx = city.lower().find(noise.lower())
            if idx > 0:
                city = city[:idx].strip(" -–—")
    return city.strip()


def _clean_city_label(*candidates) -> Optional[str]:
    iata_fallback: Optional[str] = None
    for raw in candidates:
        if raw is None:
            continue
        city = _strip_city_noise(str(raw))
        if not city:
            continue
        if len(city) == 3 and city.isupper():
            iata_fallback = iata_fallback or city
            continue
        return city
    return iata_fallback


def _trip_city_label(trip: dict, accepted: Optional[dict]) -> str:
    trip_data = (accepted or {}).get("trip_data") or {}
    dest_full = str((trip_data.get("aller") or {}).get("destinationFull") or "")
    return (
        _clean_city_label(dest_full, trip.get("name"))
        or str(trip.get("name") or "").strip()
    )


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
    """Link draft → planned trip.

    Heal must NOT set source_proposal_id: the execution draft already owns
    (proposal_id, user_id) under uq_my_trip_drafts_proposal_user. Passing
    proposal_id is ignored for the DB patch (kept for call-site compatibility).
    """
    _ = proposal_id  # intentionally unused on write
    patch: Dict[str, Any] = {
        "source_planned_trip_id": trip_id,
        "source_kind": "planner",
    }
    try:
        supabase.table("my_trip_drafts").update(patch).eq(
            "id", draft["id"]
        ).execute()
    except Exception as exc:
        print(f"⚠️ Heal draft→trip link: {exc}")
        return
    draft["source_planned_trip_id"] = trip_id
    draft["source_kind"] = "planner"


def _heal_orphan_drafts_to_trips(
    supabase,
    *,
    trips_by_id: Dict[str, dict],
    accepted_by_trip: Dict[str, dict],
    drafts: List[dict],
    drafts_by_trip: Dict[str, dict],
    bookings_by_draft_id: Dict[str, List[dict]],
    bookings_by_token: Dict[str, List[dict]],
    persist: bool = True,
) -> None:
    """Attach personal drafts/bookings to planner trips by dest + dates.

    On the list GET path pass persist=False: keep in-memory linking for
    pipeline chips without blocking the response on Supabase writes.
    """
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
        # Trip already has a stronger/equal draft → only soft-link orphan to trip,
        # keep drafts_by_trip pointing at the winner.
        existing = drafts_by_trip.get(best_trip)
        if persist:
            _persist_draft_trip_link(supabase, draft, best_trip, proposal_id=None)
        else:
            draft["source_planned_trip_id"] = best_trip
            draft["source_kind"] = "planner"
        if not existing or orphan_rank > _draft_link_rank(
            existing, bookings_by_draft_id, bookings_by_token
        ):
            drafts_by_trip[best_trip] = draft
        linked_ids.add(draft_id)


_TRIPS_LIST_SELECT = (
    "id,organizer_id,name,departure_airport,arrival_airport,passengers,direct,"
    "dates_depart,dates_retour,budget_max,invite_token,status,"
    "auto_scan_enabled,auto_scan_interval_seconds,last_scan_at,"
    "last_notified_at,last_notified_cheapest,created_at,updated_at"
)
# Hub list only needs accepted proposals + a few draft/booking columns.
_WS_PROPOSAL_SELECT = "id,trip_id,status,trip_data,created_at"
_WS_DRAFT_SELECT = (
    "id,draft_token,user_id,status,source_planned_trip_id,source_kind,"
    "city_name,origin_iata,dest_iata,out_date,ret_date,"
    "flight_booking_status,flight_booking_provider,flight_booked_at,"
    "hotel_booked_at,payload,updated_at"
)
# hotel_name/city/photo live in deal_snapshot — not top-level columns.
_WS_BOOKING_SELECT = (
    "id,draft_id,draft_token,user_id,status,deal_snapshot,hotel_id,"
    "updated_at,created_at"
)
_WS_POOL = ThreadPoolExecutor(max_workers=6, thread_name_prefix="fw-ws")


@router.get("/api/planner/trips")
@optional_auth
async def list_trips(request: Request):
    user_id = _require_user(request)
    supabase = _svc()

    owned = (
        supabase.table("planned_trips")
        .select(_TRIPS_LIST_SELECT)
        .eq("organizer_id", user_id)
        .neq("status", "archived")
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
            .neq("status", "archived")
            .order("created_at", desc=True)
            .execute()
        )
        member_trips = mt.data or []

    by_id: Dict[str, dict] = {}
    for row in (owned.data or []) + member_trips:
        if str(row.get("status") or "") == "archived":
            continue
        by_id[row["id"]] = row

    trip_ids = list(by_id.keys())
    members_by_trip: Dict[str, list] = {tid: [] for tid in trip_ids}
    proposal_counts: Dict[str, int] = {tid: 0 for tid in trip_ids}
    if trip_ids:
        mem_res = (
            supabase.table("trip_members")
            .select(
                "trip_id, display_name, role, status, joined_via, joined_at, user_id"
            )
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


def _load_travel_workspaces_sync(supabase, user_id: str) -> list:
    """Build the Planner hub list (sync — run via asyncio.to_thread)."""

    def _q_owned():
        return (
            supabase.table("planned_trips")
            .select(_TRIPS_LIST_SELECT)
            .eq("organizer_id", user_id)
            .neq("status", "archived")
            .execute()
        )

    def _q_memberships():
        return (
            supabase.table("trip_members")
            .select("trip_id")
            .eq("user_id", user_id)
            .execute()
        )

    def _q_drafts_user():
        return (
            supabase.table("my_trip_drafts")
            .select(_WS_DRAFT_SELECT)
            .eq("user_id", user_id)
            .neq("status", "archived")
            .execute()
        )

    def _q_bookings_user():
        return (
            supabase.table("hotel_bookings")
            .select(_WS_BOOKING_SELECT)
            .eq("user_id", user_id)
            .execute()
        )

    fut_owned = _WS_POOL.submit(_q_owned)
    fut_memberships = _WS_POOL.submit(_q_memberships)
    fut_drafts = _WS_POOL.submit(_q_drafts_user)
    fut_bookings = _WS_POOL.submit(_q_bookings_user)
    owned = fut_owned.result()
    memberships = fut_memberships.result()
    drafts: list = list((fut_drafts.result().data or []))
    bookings: list = list((fut_bookings.result().data or []))

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
            .neq("status", "archived")
            .execute()
        ).data or []

    trips_by_id = {
        row["id"]: row
        for row in (owned.data or []) + member_trips
        if str(row.get("status") or "") != "archived"
    }
    trip_ids = list(trips_by_id)

    def _q_accepted():
        if not trip_ids:
            return []
        return (
            supabase.table("trip_proposals")
            .select(_WS_PROPOSAL_SELECT)
            .in_("trip_id", trip_ids)
            .eq("status", "accepted")
            .execute()
        ).data or []

    def _q_linked_drafts():
        if not trip_ids:
            return []
        return (
            supabase.table("my_trip_drafts")
            .select(_WS_DRAFT_SELECT)
            .in_("source_planned_trip_id", trip_ids)
            .neq("status", "archived")
            .execute()
        ).data or []

    def _q_members():
        if not trip_ids:
            return []
        try:
            return (
                supabase.table("trip_members")
                .select(
                "trip_id, display_name, role, status, joined_via, joined_at, user_id"
            )
                .in_("trip_id", trip_ids)
                .execute()
            ).data or []
        except Exception as e:
            print(f"⚠️ Members batch (workspaces): {e}")
            return []

    organizer_ids = list(
        {row["organizer_id"] for row in trips_by_id.values() if row.get("organizer_id")}
    )

    def _q_profiles():
        if not organizer_ids:
            return []
        try:
            return (
                supabase.table("user_profiles")
                .select("id, full_name, avatar_url")
                .in_("id", organizer_ids)
                .execute()
            ).data or []
        except Exception as e:
            print(f"⚠️ Profiles organisateurs (workspaces): {e}")
            return []

    fut_accepted = _WS_POOL.submit(_q_accepted)
    fut_linked = _WS_POOL.submit(_q_linked_drafts)
    fut_members = _WS_POOL.submit(_q_members)
    fut_profiles = _WS_POOL.submit(_q_profiles)

    proposals = fut_accepted.result()
    linked = fut_linked.result()
    mem_rows = fut_members.result()
    prof_rows = fut_profiles.result()

    accepted_by_trip = {
        row["trip_id"]: row
        for row in proposals
        if row.get("trip_id")
    }

    by_id = {str(d["id"]): d for d in drafts if d.get("id")}
    for row in linked:
        rid = str(row.get("id") or "")
        if rid and rid not in by_id:
            by_id[rid] = row
            drafts.append(row)

    draft_tokens = [
        str(d.get("draft_token"))
        for d in drafts
        if d.get("draft_token")
    ]
    draft_row_ids = [str(d["id"]) for d in drafts if d.get("id")]

    def _q_bookings_by_draft():
        if not draft_row_ids:
            return []
        return (
            supabase.table("hotel_bookings")
            .select(_WS_BOOKING_SELECT)
            .in_("draft_id", draft_row_ids)
            .execute()
        ).data or []

    def _q_bookings_by_token():
        if not draft_tokens:
            return []
        return (
            supabase.table("hotel_bookings")
            .select(_WS_BOOKING_SELECT)
            .in_("draft_token", draft_tokens)
            .execute()
        ).data or []

    if draft_tokens or draft_row_ids:
        fut_bd = _WS_POOL.submit(_q_bookings_by_draft)
        fut_bt = _WS_POOL.submit(_q_bookings_by_token)
        extra_bookings = list(fut_bd.result()) + list(fut_bt.result())
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

    # Soft-link orphans in memory only — never block the hub GET on writes.
    _heal_orphan_drafts_to_trips(
        supabase,
        trips_by_id=trips_by_id,
        accepted_by_trip=accepted_by_trip,
        drafts=drafts,
        drafts_by_trip=drafts_by_trip,
        bookings_by_draft_id=bookings_by_draft_id,
        bookings_by_token=bookings_by_token,
        persist=False,
    )

    members_by_trip: Dict[str, list] = {tid: [] for tid in trip_ids}
    for m in mem_rows:
        tid = m.get("trip_id")
        if tid in members_by_trip:
            members_by_trip[tid].append(m)

    profiles_by_id: Dict[str, dict] = {}
    for p in prof_rows:
        if p.get("id"):
            profiles_by_id[p["id"]] = p

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
        # Soft-deleted planners stay out of the hub (draft/booking rows preserved).
        if str(trip.get("status") or "") == "archived":
            continue
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
        starts_at = _stay_starts_at(
            trip=trip, accepted=accepted, draft=draft, booking=booking
        )
        phase = _workspace_phase(
            ret_date=ret_date,
            out_date=out_date,
            accepted=accepted,
            draft=draft,
            booking=booking,
            trip_status=trip.get("status"),
            starts_at=starts_at,
        )
        # Début de séjour dépassé → Terminé (retire des séjours en cours).
        if (
            phase == "past"
            and str(trip.get("status") or "") not in ("completed", "archived")
            and _stay_start_elapsed(starts_at)
        ):
            try:
                now_iso = datetime.utcnow().isoformat()
                supabase.table("planned_trips").update(
                    {
                        "status": "completed",
                        "auto_scan_enabled": False,
                        "updated_at": now_iso,
                    }
                ).eq("id", trip_id).execute()
                trip["status"] = "completed"
            except Exception as e:
                print(f"⚠️ auto-complete past trip {trip_id}: {e}")
        is_organizer = trip.get("organizer_id") == user_id
        my_membership = next(
            (
                m
                for m in members_by_trip.get(trip["id"], [])
                if m.get("user_id") == user_id
            ),
            None,
        )
        joined_via = (my_membership or {}).get("joined_via")
        if not joined_via and my_membership:
            # Legacy rows before joined_via column / backfill.
            joined_via = "created" if is_organizer else "invite"
        is_invitee = (not is_organizer) and (
            joined_via == "invite"
            or (my_membership is not None and not is_organizer)
        )
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
                "city": _clean_city_label(
                    payload.get("city"),
                    (draft or {}).get("city_name") if draft else None,
                    (trip_data.get("aller") or {}).get("destinationFull"),
                    trip_data.get("city"),
                    trip.get("name"),
                ),
                "origin_iata": flight.get("origin_iata")
                or (trip_data.get("aller") or {}).get("origin")
                or trip.get("departure_airport"),
                "dest_iata": flight.get("destination_iata")
                or (trip_data.get("aller") or {}).get("destination")
                or trip_data.get("destination_code")
                or trip.get("arrival_airport"),
                "out_date": out_date,
                "ret_date": ret_date,
                "image_url": trip_data.get("image_url") or payload.get("image_url"),
                "is_organizer": is_organizer,
                "is_invitee": bool(is_invitee),
                "membership_joined_via": joined_via,
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
                "planned_trip": _row_to_trip(
                    trip,
                    members=members_by_trip.get(trip["id"], []),
                    organizer_profile=profiles_by_id.get(trip.get("organizer_id")),
                ),
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
        out_date = _date10(draft.get("out_date"))
        starts_at = _stay_starts_at(draft=draft, booking=booking)
        phase = _workspace_phase(
            ret_date=ret_date,
            out_date=out_date,
            accepted=None,
            draft=draft,
            booking=booking,
            starts_at=starts_at,
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
                "title": (
                    f"Séjour à {_clean_city_label(draft.get('city_name'), payload.get('city')) or 'destination'}"
                ),
                "city": _clean_city_label(
                    draft.get("city_name"),
                    payload.get("city"),
                    (payload.get("flight") or {}).get("destination_city"),
                ),
                "origin_iata": draft.get("origin_iata") or flight.get("origin_iata"),
                "dest_iata": draft.get("dest_iata")
                or flight.get("destination_iata")
                or payload.get("dest_iata")
                or payload.get("destination"),
                "out_date": _date10(draft.get("out_date")),
                "ret_date": ret_date,
                "image_url": payload.get("image_url"),
                "is_organizer": False,
                "is_invitee": False,
                "membership_joined_via": None,
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
        if str(booking.get("status") or "") in _HOTEL_DEAD_STATUSES:
            continue
        snapshot = booking.get("deal_snapshot") or {}
        if not isinstance(snapshot, dict):
            snapshot = {}
        snap_hotel = (
            snapshot.get("hotel")
            if isinstance(snapshot.get("hotel"), dict)
            else {}
        )
        dates = snapshot.get("dates") or {}
        if not isinstance(dates, dict):
            dates = {}
        booking_starts = _stay_starts_at(booking=booking)
        booking_phase = _workspace_phase(
            ret_date=_date10(dates.get("inbound")),
            out_date=_date10(dates.get("outbound") or dates.get("check_in")),
            accepted=None,
            draft=None,
            booking=booking,
            starts_at=booking_starts,
        )
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
                "phase": booking_phase,
                "title": snap_hotel.get("name")
                or snapshot.get("hotel_name")
                or "Réservation hôtel",
                "city": _clean_city_label(
                    snapshot.get("city"),
                    snap_hotel.get("city"),
                    snapshot.get("hotel_city"),
                ),
                "is_invitee": False,
                "membership_joined_via": None,
                "origin_iata": None,
                "dest_iata": snapshot.get("destination")
                or snapshot.get("dest"),
                "out_date": _date10(dates.get("outbound")),
                "ret_date": _date10(dates.get("inbound")),
                "image_url": snapshot.get("image_url")
                or snap_hotel.get("photo"),
                "is_organizer": False,
                "capabilities": {
                    "can_scan": False,
                    "can_choose_flight": False,
                    "can_compose_hotel": booking_phase != "booked",
                    "can_view_confirmation": True,
                },
                "pipeline": {
                    "flight": "none",
                    "hotel": _hotel_pipeline_state(
                        draft=None, booking=booking, phase=booking_phase
                    ),
                },
                "planned_trip": None,
                "updated_at": booking.get("updated_at"),
            }
        )

    workspaces.sort(key=lambda row: str(row.get("updated_at") or ""), reverse=True)
    return workspaces


@router.get("/api/travel-workspaces")
@optional_auth
async def list_travel_workspaces(request: Request):
    """Unified read model; underlying Planner/draft/booking rows stay authoritative."""
    user_id = _require_user(request)
    supabase = _svc()
    return await asyncio.to_thread(_load_travel_workspaces_sync, supabase, user_id)


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

    # Exact same aller/retour slots (date + heures) → refuse duplicate planner.
    if body.dates_depart and body.dates_retour:
        existing = _find_organizer_trip_same_flight_slots(
            supabase,
            user_id,
            d_out=body.dates_depart[0],
            d_ret=body.dates_retour[-1],
            departure_airport=dep,
            arrival_airport=arr,
        )
        if existing:
            raise _duplicate_flight_http(existing)

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
            "joined_via": "created",
            "display_name": "Organisateur",
        }
    ).execute()
    return _row_to_trip(trip, proposals_count=0)


def _leg_date_horaire(leg: Optional[dict]) -> Optional[DateAvecHoraire]:
    if not isinstance(leg, dict):
        return None
    raw = leg.get("departureTime") or leg.get("departure_time") or ""
    date_str = str(raw).strip()[:10]
    if len(date_str) < 10:
        return None
    time_part = "00:00"
    if "T" in str(raw):
        try:
            time_part = str(raw).split("T", 1)[1][:5] or "00:00"
        except Exception:
            time_part = "00:00"
    return DateAvecHoraire(date=date_str, heure_min=time_part, heure_max=time_part)


def _flight_slot_key(raw: Any) -> Optional[Tuple[str, str, str]]:
    """Canonical (date, heure_min, heure_max) for duplicate-flight detection."""
    if raw is None:
        return None
    if isinstance(raw, DateAvecHoraire):
        day = str(raw.date or "")[:10]
        hmin = str(raw.heure_min or "00:00")[:5] or "00:00"
        hmax = str(raw.heure_max or hmin)[:5] or hmin
    elif isinstance(raw, dict):
        day = str(raw.get("date") or "")[:10]
        hmin = str(raw.get("heure_min") or "00:00")[:5] or "00:00"
        hmax = str(raw.get("heure_max") or hmin)[:5] or hmin
    else:
        return None
    if len(day) < 10:
        return None
    return (day, hmin, hmax)


def _trip_flight_slots(
    trip: dict,
) -> Optional[Tuple[Tuple[str, str, str], Tuple[str, str, str]]]:
    deps = trip.get("dates_depart") or []
    rets = trip.get("dates_retour") or []
    if not isinstance(deps, list) or not isinstance(rets, list):
        return None
    if not deps or not rets:
        return None
    out_key = _flight_slot_key(deps[0] if isinstance(deps[0], dict) else None)
    ret_key = _flight_slot_key(rets[-1] if isinstance(rets[-1], dict) else None)
    if not out_key or not ret_key:
        return None
    return (out_key, ret_key)


def _iata_set(raw: Any) -> Set[str]:
    return {
        p.strip().upper()
        for p in re.split(r"[,;|/\s]+", str(raw or ""))
        if len(p.strip()) == 3 and p.strip().isalpha()
    }


def _find_organizer_trip_same_flight_slots(
    supabase,
    user_id: str,
    *,
    d_out: Any,
    d_ret: Any,
    departure_airport: Optional[str] = None,
    arrival_airport: Optional[str] = None,
) -> Optional[dict]:
    """Existing non-archived trip with same aller/retour date+times (same orga)."""
    want_out = _flight_slot_key(d_out)
    want_ret = _flight_slot_key(d_ret)
    if not want_out or not want_ret:
        return None
    want_dep = _iata_set(departure_airport)
    want_arr = _iata_set(arrival_airport)
    try:
        rows = (
            supabase.table("planned_trips")
            .select(
                "id,organizer_id,name,status,departure_airport,arrival_airport,"
                "dates_depart,dates_retour,invite_token,passengers,direct,"
                "budget_max,created_at,updated_at"
            )
            .eq("organizer_id", user_id)
            .neq("status", "archived")
            .order("updated_at", desc=True)
            .limit(50)
            .execute()
        ).data or []
    except Exception as e:
        print(f"⚠️ duplicate flight-slot lookup: {e}")
        return None
    for row in rows:
        slots = _trip_flight_slots(row)
        if not slots or slots[0] != want_out or slots[1] != want_ret:
            continue
        if want_dep:
            row_dep = _iata_set(row.get("departure_airport"))
            if row_dep and want_dep.isdisjoint(row_dep):
                continue
        if want_arr:
            row_arr = _iata_set(row.get("arrival_airport"))
            if row_arr and want_arr.isdisjoint(row_arr):
                continue
        return row
    return None


def _duplicate_flight_http(existing: dict) -> HTTPException:
    trip_id = str(existing.get("id") or "")
    name = str(existing.get("name") or "ce voyage")
    return HTTPException(
        status_code=409,
        detail=(
            f"Tu as déjà un planner aux mêmes dates et heures de vol "
            f"(« {name} »). Ouvre-le plutôt que d’en créer un autre."
            + (f" [trip_id={trip_id}]" if trip_id else "")
        ),
    )


def _city_label_from_trip(trip_data: dict) -> str:
    aller = trip_data.get("aller") or {}
    dest_full = (
        aller.get("destinationFull")
        or aller.get("destination_full")
        or trip_data.get("city")
        or ""
    )
    dest_full = str(dest_full).strip()
    if dest_full:
        # "Barcelona (BCN)" / "Barcelona" → Barcelona
        return dest_full.split("(")[0].strip() or dest_full
    code = _single_iata(
        trip_data.get("destination_code") or aller.get("destination") or ""
    )
    return code or "Voyage"


def _insert_locked_trip_with_proposal(
    supabase,
    *,
    user_id: str,
    trip_data: dict,
    passengers: int,
    name: str,
    direct: bool,
) -> Tuple[dict, dict]:
    """Create locked planned_trip + accepted proposal. Returns (trip, proposal)."""
    aller = trip_data.get("aller") or {}
    retour = trip_data.get("retour") or {}
    d_out = _leg_date_horaire(aller)
    d_ret = _leg_date_horaire(retour)
    if not d_out or not d_ret:
        raise HTTPException(status_code=400, detail="Dates de vol invalides")

    today = date.today().isoformat()
    if d_out.date[:10] < today:
        raise HTTPException(
            status_code=400,
            detail="Ce vol est déjà passé — choisis une date aujourd’hui ou plus tard",
        )

    dep = _normalize_departure(_single_iata(aller.get("origin") or ""))
    arr = _normalize_arrival(
        _single_iata(
            trip_data.get("destination_code") or aller.get("destination") or ""
        )
    )
    if not dep:
        raise HTTPException(status_code=400, detail="Aéroport de départ manquant")

    existing = _find_organizer_trip_same_flight_slots(
        supabase,
        user_id,
        d_out=d_out,
        d_ret=d_ret,
        departure_airport=dep,
        arrival_airport=arr,
    )
    if existing:
        raise _duplicate_flight_http(existing)

    try:
        price = float(trip_data.get("prix_total") or 0)
    except (TypeError, ValueError):
        price = 0.0
    budget_max = max(1, int(round(price)) if price > 0 else 200)
    pax = _clamp_passengers(passengers)

    token = secrets.token_hex(16)
    now = datetime.utcnow().isoformat()
    trip_row = {
        "organizer_id": user_id,
        "name": (name or "").strip() or _city_label_from_trip(trip_data),
        "departure_airport": dep,
        "arrival_airport": arr,
        "passengers": pax,
        "direct": bool(direct),
        "dates_depart": [d_out.model_dump()],
        "dates_retour": [d_ret.model_dump()],
        "budget_max": budget_max,
        "invite_token": token,
        "status": "locked",
        "updated_at": now,
    }
    created = supabase.table("planned_trips").insert(trip_row).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Création échouée")
    trip = created.data[0]
    trip_id = trip["id"]

    supabase.table("trip_members").insert(
        {
            "trip_id": trip_id,
            "user_id": user_id,
            "role": "organizer",
            "status": "joined",
            "joined_via": "created",
            "display_name": "Organisateur",
        }
    ).execute()

    proposal_ins = (
        supabase.table("trip_proposals")
        .insert(
            {
                "trip_id": trip_id,
                "trip_data": trip_data,
                "status": "accepted",
            }
        )
        .execute()
    )
    if not proposal_ins.data:
        raise HTTPException(status_code=500, detail="Proposition non créée")
    return trip, proposal_ins.data[0]


def _trip_data_from_my_trip_draft(draft: dict) -> dict:
    """Build planner proposal trip_data from a Mon voyage draft (flight snapshot)."""
    payload = draft.get("payload") or {}
    flight = payload.get("flight") or {}
    origin = _single_iata(
        flight.get("origin_iata")
        or draft.get("origin_iata")
        or payload.get("origin_iata")
        or payload.get("departure_airport")
        or ""
    )
    dest = _single_iata(
        flight.get("destination_iata")
        or draft.get("dest_iata")
        or payload.get("destination")
        or ""
    )
    out_raw = (
        flight.get("outbound_local")
        or flight.get("out_dep_local")
        or draft.get("out_date")
        or (payload.get("dates") or {}).get("outbound")
        or ""
    )
    ret_raw = (
        flight.get("inbound_local")
        or flight.get("ret_dep_local")
        or draft.get("ret_date")
        or (payload.get("dates") or {}).get("inbound")
        or ""
    )
    out = str(out_raw).strip()
    ret = str(ret_raw).strip()
    if len(out) == 10:
        out = f"{out}T12:00:00"
    if len(ret) == 10:
        ret = f"{ret}T12:00:00"
    try:
        price = float(
            flight.get("price_pp")
            or payload.get("price_per_person")
            or 0
        )
    except (TypeError, ValueError):
        price = 0.0
    city = (
        str(draft.get("city_name") or payload.get("city") or "").strip()
        or dest
    )
    direct = flight.get("direct")
    if direct is None:
        transfers = 0
    else:
        transfers = 0 if direct else 1
    return {
        "aller": {
            "flightNumber": str(flight.get("flight_number") or ""),
            "origin": origin,
            "originFull": origin,
            "destination": dest,
            "destinationFull": city,
            "departureTime": out,
            "price": price,
            "currency": "EUR",
        },
        "retour": {
            "flightNumber": str(flight.get("return_flight_number") or ""),
            "origin": dest,
            "originFull": city,
            "destination": origin,
            "destinationFull": origin,
            "departureTime": ret,
            "price": 0,
            "currency": "EUR",
        },
        "prix_total": price,
        "destination_code": dest,
        "provider": flight.get("provider"),
        "airline": flight.get("airline") or flight.get("carrier"),
        "transfers": transfers,
        "booking_url": flight.get("booking_url") or payload.get("booking_url"),
    }


@router.post("/api/planner/trips/from-flight")
@optional_auth
async def create_trip_from_flight(
    body: CreatePlannedTripFromFlightRequest, request: Request
):
    """Search → Planner: create locked trip with this flight already accepted."""
    user_id = _require_user(request)
    supabase = _svc()

    raw = body.trip if isinstance(body.trip, dict) else {}
    if not raw:
        raise HTTPException(status_code=400, detail="Vol requis")

    trip_data = _trip_data_json(raw)
    aller = trip_data.get("aller") or {}
    retour = trip_data.get("retour") or {}
    if not aller or not retour:
        raise HTTPException(status_code=400, detail="Vol aller/retour incomplets")

    passengers = _clamp_passengers(
        body.passengers
        if body.passengers is not None
        else (raw.get("passengers") or raw.get("adults") or 1)
    )
    city = _city_label_from_trip(trip_data)
    name = (body.name or "").strip() or city

    direct_flag = body.direct
    if direct_flag is None:
        transfers = trip_data.get("transfers")
        try:
            direct_flag = int(transfers or 0) == 0
        except (TypeError, ValueError):
            direct_flag = True

    trip, proposal = _insert_locked_trip_with_proposal(
        supabase,
        user_id=user_id,
        trip_data=trip_data,
        passengers=passengers,
        name=name,
        direct=bool(direct_flag),
    )

    try:
        _ensure_execution_draft_for_accepted(
            supabase, trip=trip, proposal=proposal, user_id=user_id
        )
    except Exception as exc:
        print(f"⚠️ from-flight draft: {exc}")

    out = _row_to_trip(trip, proposals_count=1)
    out["accepted_proposal"] = proposal
    out["proposals"] = [proposal]
    return out


@router.post("/api/planner/trips/from-my-trip")
@optional_auth
async def create_trip_from_my_trip(
    body: CreatePlannedTripFromMyTripRequest, request: Request
):
    """Séjour → Planner: promote Mon voyage draft (vol + hôtel sélectionné)."""
    user_id = _require_user(request)
    supabase = _svc()
    token = (body.draft_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Brouillon requis")

    from deals.my_trips import claim_draft, get_draft

    draft = get_draft(supabase, token)
    if not draft:
        raise HTTPException(status_code=404, detail="Séjour introuvable")
    owner = draft.get("user_id")
    if owner and str(owner) != str(user_id):
        raise HTTPException(status_code=403, detail="Séjour non accessible")

    existing_trip_id = draft.get("source_planned_trip_id")
    if existing_trip_id:
        row = _user_can_access(supabase, str(existing_trip_id), user_id)
        if row:
            proposals = (
                supabase.table("trip_proposals")
                .select("*")
                .eq("trip_id", existing_trip_id)
                .order("created_at", desc=True)
                .execute()
            ).data or []
            accepted = next(
                (p for p in proposals if p.get("status") == "accepted"),
                None,
            )
            out = _row_to_trip(row, proposals_count=len(proposals))
            out["accepted_proposal"] = accepted
            out["proposals"] = proposals
            return out

    if not owner:
        claimed = claim_draft(supabase, token, user_id)
        if claimed:
            draft = claimed

    trip_data = _trip_data_json(_trip_data_from_my_trip_draft(draft))
    if not (trip_data.get("aller") and trip_data.get("retour")):
        raise HTTPException(status_code=400, detail="Vol incomplets dans le séjour")

    passengers = _clamp_passengers(
        draft.get("adults")
        or (draft.get("payload") or {}).get("adults")
        or 1
    )
    city = (
        str(draft.get("city_name") or (draft.get("payload") or {}).get("city") or "")
        .strip()
        or _city_label_from_trip(trip_data)
    )
    name = (body.name or "").strip() or city
    flight = (draft.get("payload") or {}).get("flight") or {}
    direct_flag = flight.get("direct")
    if direct_flag is None:
        direct_flag = int(trip_data.get("transfers") or 0) == 0

    trip, proposal = _insert_locked_trip_with_proposal(
        supabase,
        user_id=user_id,
        trip_data=trip_data,
        passengers=passengers,
        name=name,
        direct=bool(direct_flag),
    )

    # Keep the same draft (hotel sélectionné inclus) — do not create a blank one.
    try:
        if not draft.get("user_id"):
            supabase.table("my_trip_drafts").update(
                {"user_id": user_id, "updated_at": datetime.utcnow().isoformat()}
            ).eq("id", draft["id"]).execute()
            draft["user_id"] = user_id
        _sync_execution_draft_to_proposal(
            supabase, draft, trip=trip, proposal=proposal
        )
    except Exception as exc:
        print(f"⚠️ from-my-trip link draft: {exc}")
        try:
            _ensure_execution_draft_for_accepted(
                supabase, trip=trip, proposal=proposal, user_id=user_id
            )
        except Exception as exc2:
            print(f"⚠️ from-my-trip fallback draft: {exc2}")

    out = _row_to_trip(trip, proposals_count=1)
    out["accepted_proposal"] = proposal
    out["proposals"] = [proposal]
    return out


@router.get("/api/planner/trips/{trip_id}")
@optional_auth
async def get_trip(trip_id: str, request: Request):
    user_id = _require_user(request)
    supabase = _svc()
    row = _user_can_access(supabase, trip_id, user_id)
    if not row or row.get("status") == "archived":
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
    # Rename-only: skip route checks — keep PATCH snappy for the rename UI.
    name_only = set(patch.keys()) <= {"name", "updated_at"}
    if modalities_changed and current.get("status") == "locked":
        blocked = _trip_has_active_reservation(supabase, trip_id)
        if blocked:
            raise HTTPException(status_code=409, detail=blocked)
        _reopen_flight_selection(supabase, trip_id)
        patch["status"] = "planning"
        patch["auto_scan_enabled"] = False

    if not name_only:
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
    if name_only:
        # Lightweight response — avoid re-validating routes on a rename.
        row = result.data[0]
        return {
            "id": row["id"],
            "organizer_id": row["organizer_id"],
            "name": row["name"],
            "departure_airport": row.get("departure_airport"),
            "arrival_airport": row.get("arrival_airport"),
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
            "route_ok": True,
            "invalid_arrival_codes": [],
        }
    return _row_to_trip(result.data[0])


@router.post("/api/planner/trips/{trip_id}/complete")
@optional_auth
async def complete_trip(trip_id: str, request: Request):
    """Archiver le voyage → statut Terminé (completed). Phase hub = past."""
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)
    now = datetime.utcnow().isoformat()
    try:
        result = (
            supabase.table("planned_trips")
            .update(
                {
                    "status": "completed",
                    "auto_scan_enabled": False,
                    "updated_at": now,
                }
            )
            .eq("id", trip_id)
            .execute()
        )
    except Exception as e:
        print(f"❌ complete planned_trip failed: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not result.data:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
    return _row_to_trip(result.data[0])


@router.delete("/api/planner/trips/{trip_id}")
@optional_auth
async def delete_trip(trip_id: str, request: Request):
    """Soft-delete: status=archived. Row + réservations restent dans Supabase."""
    user_id = _require_user(request)
    supabase = _svc()
    _require_organizer(supabase, trip_id, user_id)
    now = datetime.utcnow().isoformat()
    try:
        result = (
            supabase.table("planned_trips")
            .update(
                {
                    "status": "archived",
                    "auto_scan_enabled": False,
                    "updated_at": now,
                }
            )
            .eq("id", trip_id)
            .execute()
        )
    except Exception as e:
        print(f"❌ archive planned_trip failed: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not result.data:
        raise HTTPException(status_code=404, detail="Voyage introuvable")
    return {"ok": True, "archived": True, "reservations_preserved": True}


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
        raise HTTPException(status_code=400, detail="Maximum 6 personnes")

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
                "joined_via": "manual",
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


def _auto_complete_elapsed_trips(supabase) -> int:
    """Mark planned trips Terminé when séjour start datetime is past."""
    rows = (
        supabase.table("planned_trips")
        .select("id,status,dates_depart")
        .neq("status", "archived")
        .neq("status", "completed")
        .execute()
    ).data or []
    if not rows:
        return 0
    trip_ids = [str(r["id"]) for r in rows if r.get("id")]
    accepted_by_trip: Dict[str, dict] = {}
    if trip_ids:
        try:
            props = (
                supabase.table("trip_proposals")
                .select("id,trip_id,trip_data,status")
                .in_("trip_id", trip_ids)
                .eq("status", "accepted")
                .execute()
            ).data or []
            for p in props:
                tid = str(p.get("trip_id") or "")
                if tid and tid not in accepted_by_trip:
                    accepted_by_trip[tid] = p
        except Exception as e:
            print(f"⚠️ auto-complete proposals: {e}")

    done = 0
    now_iso = datetime.utcnow().isoformat()
    for trip in rows:
        trip_id = str(trip.get("id") or "")
        if not trip_id:
            continue
        starts_at = _stay_starts_at(
            trip=trip, accepted=accepted_by_trip.get(trip_id)
        )
        if not _stay_start_elapsed(starts_at):
            continue
        try:
            supabase.table("planned_trips").update(
                {
                    "status": "completed",
                    "auto_scan_enabled": False,
                    "updated_at": now_iso,
                }
            ).eq("id", trip_id).execute()
            done += 1
        except Exception as e:
            print(f"⚠️ auto-complete {trip_id}: {e}")
    return done


@router.post("/api/planner/auto-scan")
async def auto_scan_trips(authorization: Optional[str] = Header(None)):
    """Cron job: complete elapsed stays, then scan watched planning trips."""
    _require_cron(authorization)
    supabase = _svc()

    completed_past = 0
    try:
        completed_past = _auto_complete_elapsed_trips(supabase)
    except Exception as e:
        print(f"⚠️ auto-complete past trips: {e}")

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
        "completed_past": completed_past,
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
        payload = row.get("payload") or {}
        return {
            "id": row["id"],
            "draft_token": row["draft_token"],
            "status": row.get("status") or "draft",
            "payload": payload,
            "expires_at": row.get("expires_at"),
            "reused": reused,
            "source_planned_trip_id": row.get("source_planned_trip_id")
            or proposal["trip_id"],
            "source_proposal_id": row.get("source_proposal_id") or proposal_id,
            # Keep booking lifecycle on the client (boarding pass "Vol confirmé").
            "flight_booked_at": row.get("flight_booked_at")
            or payload.get("flight_booked_at"),
            "flight_booking_status": row.get("flight_booking_status")
            or payload.get("flight_booking_status"),
            "flight_booking_provider": row.get("flight_booking_provider")
            or payload.get("flight_booking_provider"),
            "flight_booking_reference": row.get("flight_booking_reference")
            or payload.get("flight_booking_reference"),
            "hotel_booked_at": row.get("hotel_booked_at")
            or payload.get("hotel_booked_at"),
            "hotel": row.get("hotel") or payload.get("hotel"),
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
    """Public invite preview — restricted fields only (brief §6)."""
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
    org_first = None
    org_avatar = None
    org_id = row.get("organizer_id")
    if org_id:
        try:
            prof = (
                supabase.table("user_profiles")
                .select("full_name,first_name,avatar_url")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            if prof.data:
                p = prof.data[0]
                org_name = (p.get("full_name") or "").strip() or None
                org_first = (p.get("first_name") or "").strip() or None
                if not org_first and org_name:
                    org_first = org_name.split()[0]
                org_avatar = (p.get("avatar_url") or "").strip() or None
        except Exception:
            org_name = None

    # City / cover / price / program from accepted trip when present
    city = None
    cover_url = None
    price_estimate = None
    price_status = "unknown"
    program_summary: list = []
    if isinstance(accepted_trip, dict):
        flight = accepted_trip.get("flight") or {}
        hotel = accepted_trip.get("hotel") or {}
        city = (
            flight.get("destination_city")
            or hotel.get("city")
            or accepted_trip.get("city")
            or row.get("arrival_airport")
        )
        cover_url = (
            hotel.get("image_url")
            or hotel.get("photo_url")
            or accepted_trip.get("cover_url")
            or accepted_trip.get("image_url")
        )
        total = accepted_trip.get("total_price") or accepted_trip.get("price_per_person")
        if total is not None:
            try:
                price_estimate = float(total)
                price_status = "estimated"
            except (TypeError, ValueError):
                pass
        steps = accepted_trip.get("program") or accepted_trip.get("activities") or []
        if isinstance(steps, list):
            for s in steps[:3]:
                if isinstance(s, dict):
                    title = (s.get("title") or s.get("name") or "").strip()
                    if title:
                        program_summary.append(title)
                elif isinstance(s, str) and s.strip():
                    program_summary.append(s.strip())

    if not city:
        city = row.get("arrival_airport") or row.get("name")

    status = (row.get("status") or "open").lower()
    state = "open"
    if status in ("cancelled", "expired", "closed"):
        state = "expired"
    elif status == "full":
        state = "full"

    return {
        "name": row["name"],
        "city": city,
        "cover_url": cover_url,
        "departure_airport": row["departure_airport"],
        "arrival_airport": row.get("arrival_airport"),
        "passengers": row.get("passengers") or 1,
        "dates_depart": row.get("dates_depart") or [],
        "dates_retour": row.get("dates_retour") or [],
        "budget_max": row.get("budget_max") or 200,
        "organizer_name": org_name,
        "organizer": {
            "first_name": org_first,
            "avatar_url": org_avatar,
        },
        "accepted_trip": accepted_trip,
        "members_count": members.count or 0,
        "invite_token": row["invite_token"],
        "price_estimate": price_estimate,
        "price_status": price_status,
        "program_summary": program_summary[:3],
        "state": state,
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
                "joined_via": (
                    "created"
                    if row["organizer_id"] == user_id
                    else "invite"
                ),
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
        raise HTTPException(status_code=400, detail="Voyage complet (6 personnes max)")

    supabase.table("trip_members").insert(
        {
            "trip_id": trip_id,
            "user_id": user_id,
            "role": "traveler" if row["organizer_id"] != user_id else "organizer",
            "status": "joined",
            "joined_via": (
                "created" if row["organizer_id"] == user_id else "invite"
            ),
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
