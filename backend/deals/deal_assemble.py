"""
Assemble TravelDeal from caches only (no LiteAPI / no scanner).
Join: deal_destinations × deal_windows × hotel_rates_cache × deal_flight_cache
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from deals.liteapi_config import load_deals_config
from deals.pricing import price_per_person

logger = logging.getLogger("deals.assemble")

COUNTRY_FR: Dict[str, str] = {
    "PT": "Portugal",
    "ES": "Espagne",
    "IT": "Italie",
    "IE": "Irlande",
    "HU": "Hongrie",
    "CZ": "Tchéquie",
    "PL": "Pologne",
    "FR": "France",
    "DE": "Allemagne",
    "GB": "Royaume-Uni",
    "MA": "Maroc",
}

BOARD_LABEL: Dict[str, str] = {
    "RO": "Chambre seule",
    "BI": "Petit-déjeuner",
    "BB": "Petit-déjeuner",
    "HB": "Demi-pension",
    "FB": "Pension complète",
    "AI": "All inclusive",
    "BDI": "Petit-déjeuner",
    "BLI": "Petit-déjeuner",
}


def make_deal_key(origin: str, dest_iata: str, window_id: str, adults: int) -> str:
    return f"{origin.upper()}-{dest_iata.upper()}-{window_id}-{int(adults)}"


def parse_deal_key(deal_key: str) -> Optional[Dict[str, Any]]:
    """
    Format: ORIGIN-DEST-WINDOW_ID-ADULTS
    window_id itself contains dashes (e.g. 2026-W42-FRI_SUN).
    """
    parts = (deal_key or "").strip().split("-")
    if len(parts) < 4:
        return None
    try:
        adults = int(parts[-1])
    except ValueError:
        return None
    origin = parts[0].upper()
    dest = parts[1].upper()
    window_id = "-".join(parts[2:-1])
    if len(origin) != 3 or len(dest) != 3 or not window_id:
        return None
    return {
        "origin": origin,
        "dest_iata": dest,
        "window_id": window_id,
        "adults": adults,
    }


def _not_expired(expires_at: Any, *, now: Optional[datetime] = None) -> bool:
    if not expires_at:
        return False
    now = now or datetime.now(timezone.utc)
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp > now
    except ValueError:
        return False


def _hotel_card(h: Dict[str, Any]) -> Dict[str, Any]:
    board = (h.get("board") or "").upper()
    card: Dict[str, Any] = {
        "id": str(h.get("hotel_id") or h.get("id") or ""),
        "name": h.get("name"),
        "stars": h.get("stars"),
        "rating": h.get("rating"),
        "review_count": h.get("review_count"),
        "distance_m": h.get("distance_m"),
        "photo": h.get("photo") or h.get("thumbnail") or h.get("main_photo"),
        "board": board or None,
        "refundable": bool(h.get("refundable")),
        "cancel_deadline": h.get("cancel_deadline"),
    }
    # Needed by UI « changer d'hôtel » to recompute price_pp from cache
    if h.get("public_hotel_price") is not None:
        card["public_hotel_price"] = h.get("public_hotel_price")
    if h.get("excluded_fees") is not None:
        card["excluded_fees"] = h.get("excluded_fees")
    return card


def _flight_card(flight_row: Dict[str, Any], flight_json: Dict[str, Any]) -> Dict[str, Any]:
    aller = flight_json.get("aller") or {}
    retour = flight_json.get("retour") or {}
    return {
        "price_pp": float(flight_row.get("price_pp") or flight_json.get("prix_total") or 0),
        "outbound_local": aller.get("departureTime") or flight_json.get("arrival_local"),
        "inbound_local": retour.get("departureTime") or flight_json.get("return_departure_local"),
        "direct": bool(flight_row.get("direct") if flight_row.get("direct") is not None else True),
        "airline": flight_json.get("airline") or (flight_json.get("provider") or "").title(),
        "booking_url": flight_json.get("booking_url") or "",
        "origin_iata": (aller.get("origin") or flight_row.get("origin_iata") or "").upper(),
        "destination_iata": (
            aller.get("destination")
            or flight_row.get("iata_arrival")
            or flight_json.get("destination_code")
            or ""
        ).upper(),
    }


def _highlights(
    *,
    hotel: Dict[str, Any],
    flight: Dict[str, Any],
    flags: Dict[str, bool],
) -> List[str]:
    out: List[str] = []
    if flight.get("direct"):
        out.append("Vol direct")
    board = (hotel.get("board") or "").upper()
    if board in BOARD_LABEL and board != "RO":
        out.append(BOARD_LABEL[board])
    if hotel.get("refundable"):
        out.append("Annulation gratuite hôtel")
    if flags.get("late_arrival"):
        out.append("Arrivée tardive")
    if flags.get("late_departure"):
        out.append("Bagagerie conseillée")
    out.append("Deux réservations distinctes")
    return out[:5]


def assemble_deal(
    *,
    dest: Dict[str, Any],
    window: Dict[str, Any],
    hotel_top: Sequence[Dict[str, Any]],
    flight_row: Dict[str, Any],
    adults: int,
    currency: str = "EUR",
) -> Optional[Dict[str, Any]]:
    """Build one TravelDeal dict from joined cache rows."""
    if not hotel_top:
        return None
    flight_json = flight_row.get("flight") or {}
    if isinstance(flight_json, str):
        return None
    if not flight_json and flight_row.get("price_pp") is None:
        return None

    primary = hotel_top[0]
    alts = list(hotel_top[1:3])
    origin = (flight_row.get("origin_iata") or "").upper()
    dest_iata = (dest.get("iata_arrival") or flight_row.get("iata_arrival") or "").upper()
    window_id = window.get("id") or flight_row.get("window_id")
    adults = max(1, int(adults or 2))

    flight_pp = float(flight_row.get("price_pp") or flight_json.get("prix_total") or 0)
    hotel_public = float(primary.get("public_hotel_price") or 0)
    excluded = float(primary.get("excluded_fees") or 0)
    price_pp = round(price_per_person(flight_pp, hotel_public, adults), 2)

    flags = {
        "late_arrival": bool(
            flight_row.get("late_arrival") or flight_json.get("late_arrival")
        ),
        "late_departure": bool(
            flight_row.get("late_departure") or flight_json.get("late_departure")
        ),
        "breakfast": (primary.get("board") or "").upper() in BOARD_LABEL
        and (primary.get("board") or "").upper() in ("BI", "HB", "FB", "AI", "BDI", "BLI", "BB"),
    }

    board_code = (primary.get("board") or "").upper()
    board_label = BOARD_LABEL.get(board_code) or primary.get("board_name") or board_code or None
    city = dest.get("city_name") or dest_iata
    country = COUNTRY_FR.get((dest.get("country_code") or "").upper(), dest.get("country_code") or "")
    nights = int(window.get("nights") or 2)
    deal_key = make_deal_key(origin, dest_iata, str(window_id), adults)
    hotel_card = _hotel_card(primary)
    flight_card = _flight_card(flight_row, flight_json if isinstance(flight_json, dict) else {})

    image = (
        primary.get("photo")
        or primary.get("thumbnail")
        or primary.get("main_photo")
        or ""
    )
    fetched = (
        flight_row.get("fetched_at")
        or primary.get("fetched_at")
        or None
    )

    title = f"Week-end à {city}"
    description = (
        f"{nights} nuit{'s' if nights > 1 else ''} à {city} : vol A/R depuis {origin} "
        f"+ hôtel ({board_label or 'chambre'}). "
        "Deux réservations distinctes — vol via la compagnie / partenaire, "
        "hôtel via FlightWatcher."
    )

    return {
        "id": deal_key,
        "deal_key": deal_key,
        "title": title,
        "city": city,
        "country": country,
        "image_url": image,
        "price_per_person": price_pp,
        "currency": currency,
        "nights": nights,
        "departure_airport": origin,
        "origin_iata": origin,
        "destination": dest_iata,
        "window_kind": window.get("kind"),
        "window_id": window_id,
        "adults": adults,
        "dates": {
            "outbound": window.get("checkin") or flight_row.get("checkin"),
            "inbound": window.get("checkout") or flight_row.get("checkout"),
        },
        "hotel_name": primary.get("name"),
        "hotel_stars": primary.get("stars"),
        "board": board_label,
        "highlights": _highlights(hotel=primary, flight=flight_card, flags=flags),
        "description": description,
        "provider": "liteapi",
        "booking_url": "",  # in-app booking wired in L7
        "badge": "Vol + hôtel",
        "flight": flight_card,
        "hotel": hotel_card,
        "alt_hotels": [_hotel_card(h) for h in alts],
        "price_breakdown": {
            "flight_pp": flight_pp,
            "hotel_public_total": hotel_public,
            "excluded_fees": excluded,
        },
        "ssp_source": primary.get("ssp_source"),
        "flags": flags,
        "fetched_at": fetched,
    }


def pick_flight_for_origin(
    flights: Sequence[Dict[str, Any]],
    *,
    origin: Optional[str],
) -> Optional[Dict[str, Any]]:
    """If origin set, that row; else cheapest ok flight."""
    ok = [
        f
        for f in flights
        if f.get("status") == "ok"
        and f.get("price_pp") is not None
        and f.get("flight")
    ]
    if not ok:
        return None
    if origin:
        o = origin.strip().upper()
        matched = [f for f in ok if (f.get("origin_iata") or "").upper() == o]
        if not matched:
            return None
        return min(matched, key=lambda f: float(f["price_pp"]))
    return min(ok, key=lambda f: float(f["price_pp"]))


def assemble_deals_from_caches(
    *,
    destinations: Sequence[Dict[str, Any]],
    windows: Sequence[Dict[str, Any]],
    rates_rows: Sequence[Dict[str, Any]],
    flight_rows: Sequence[Dict[str, Any]],
    origin: Optional[str] = None,
    adults: int = 2,
    window_kind: Optional[str] = None,
    max_pp: Optional[float] = None,
    currency: str = "EUR",
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Pure join (testable). Filters expired rows. Sorts by price_pp ascending.
    """
    now = now or datetime.now(timezone.utc)
    adults = max(1, int(adults or 2))

    dest_by_id = {d["id"]: d for d in destinations if d.get("id")}
    win_by_id = {w["id"]: w for w in windows if w.get("id")}

    # rates: dest_id × window_id × adults
    rates_index: Dict[Tuple[str, str, int], Dict[str, Any]] = {}
    for r in rates_rows:
        if r.get("status") != "ok":
            continue
        if not _not_expired(r.get("expires_at"), now=now):
            continue
        if int(r.get("adults") or 0) != adults:
            continue
        top = r.get("top") or []
        if not top:
            continue
        key = (str(r["destination_id"]), str(r["window_id"]), adults)
        rates_index[key] = r

    # flights grouped by dest × window
    flights_by_dw: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for f in flight_rows:
        if f.get("status") != "ok":
            continue
        if not _not_expired(f.get("expires_at"), now=now):
            continue
        dw = (str(f["destination_id"]), str(f["window_id"]))
        flights_by_dw.setdefault(dw, []).append(f)

    deals: List[Dict[str, Any]] = []
    for (dest_id, window_id, ad), rates in rates_index.items():
        dest = dest_by_id.get(dest_id)
        window = win_by_id.get(window_id)
        if not dest or not window:
            continue
        if window_kind and (window.get("kind") or "").upper() != window_kind.upper():
            continue
        flight = pick_flight_for_origin(
            flights_by_dw.get((dest_id, window_id), []),
            origin=origin,
        )
        if not flight:
            continue
        deal = assemble_deal(
            dest=dest,
            window=window,
            hotel_top=rates.get("top") or [],
            flight_row=flight,
            adults=ad,
            currency=currency,
        )
        if not deal:
            continue
        if max_pp is not None and deal["price_per_person"] > float(max_pp):
            continue
        deals.append(deal)

    deals.sort(key=lambda d: (d["price_per_person"], d.get("city") or ""))
    return deals


def load_caches_and_assemble(
    supabase: Any,
    *,
    origin: Optional[str] = None,
    adults: Optional[int] = None,
    window: Optional[str] = None,
    max_pp: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Supabase reads only — no external APIs."""
    cfg = load_deals_config()
    adults_n = int(adults if adults is not None else (cfg.occupancies[0] if cfg.occupancies else 2))

    dests = (
        supabase.table("deal_destinations")
        .select("*")
        .eq("active", True)
        .execute()
    )
    wins = supabase.table("deal_windows").select("*").execute()
    rates = (
        supabase.table("hotel_rates_cache")
        .select("*")
        .eq("status", "ok")
        .eq("adults", adults_n)
        .execute()
    )
    flights = (
        supabase.table("deal_flight_cache")
        .select("*")
        .eq("status", "ok")
        .execute()
    )

    return assemble_deals_from_caches(
        destinations=list(dests.data or []),
        windows=list(wins.data or []),
        rates_rows=list(rates.data or []),
        flight_rows=list(flights.data or []),
        origin=origin,
        adults=adults_n,
        window_kind=window,
        max_pp=max_pp,
        currency=cfg.currency,
    )


def get_deal_from_caches(
    supabase: Any,
    deal_key: str,
) -> Optional[Dict[str, Any]]:
    parsed = parse_deal_key(deal_key)
    if not parsed:
        return None
    deals = load_caches_and_assemble(
        supabase,
        origin=parsed["origin"],
        adults=parsed["adults"],
    )
    for d in deals:
        if d.get("deal_key") == deal_key or d.get("id") == deal_key:
            return d
    # Broader: same dest/window/adults any origin then filter
    all_deals = load_caches_and_assemble(
        supabase,
        origin=None,
        adults=parsed["adults"],
    )
    for d in all_deals:
        if d.get("deal_key") == deal_key or d.get("id") == deal_key:
            return d
    return None
