"""Admin — liste légère des planned_trips (pagination max 20)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

_FLIGHT_BOOKED = frozenset(
    {"user_confirmed", "partner_confirmed", "ticketed", "booked"}
)
_HOTEL_BOOKED = frozenset(
    {"confirmed", "paid", "voucher_ready", "completed", "booked"}
)
_HOTEL_SELECTED = frozenset({"draft", "pending", "held", "selected"})

_TRIP_SELECT = (
    "id,organizer_id,name,status,departure_airport,arrival_airport,"
    "dates_depart,dates_retour,updated_at,created_at"
)
_DRAFT_SELECT = (
    "source_planned_trip_id,flight_booked_at,hotel_booked_at,"
    "flight_booking_status,hotel"
)


def _svc():
    from supabase_client import get_supabase_service_client

    return get_supabase_service_client()


def _date10(raw: Any) -> Optional[str]:
    if not raw:
        return None
    if isinstance(raw, dict):
        return _date10(raw.get("date"))
    s = str(raw).strip()
    return s[:10] if s else None


def _out_date(row: dict) -> Optional[str]:
    dates = row.get("dates_depart") or []
    if isinstance(dates, list) and dates:
        return _date10(dates[0])
    return None


def _ret_date(row: dict) -> Optional[str]:
    dates = row.get("dates_retour") or []
    if isinstance(dates, list) and dates:
        return _date10(dates[-1])
    return None


def _dest_label(row: dict) -> str:
    arr = str(row.get("arrival_airport") or "").strip()
    if not arr:
        return "inspire"
    # Keep compact — first IATA / comma list truncated
    codes = [c.strip().upper() for c in arr.split(",") if c.strip()]
    if not codes:
        return "inspire"
    if len(codes) == 1:
        return codes[0]
    return f"{codes[0]}+{len(codes) - 1}"


def _flight_state(*, has_accepted: bool, draft: Optional[dict]) -> str:
    if not draft and not has_accepted:
        return "none"
    status = str((draft or {}).get("flight_booking_status") or "")
    if (draft or {}).get("flight_booked_at") or status in _FLIGHT_BOOKED:
        return "booked"
    if has_accepted or draft:
        return "selected"
    return "none"


def _hotel_state(*, draft: Optional[dict], booking_status: Optional[str]) -> str:
    st = str(booking_status or "")
    if (draft or {}).get("hotel_booked_at") or st in _HOTEL_BOOKED:
        return "booked"
    hotel = (draft or {}).get("hotel")
    if hotel or st in _HOTEL_SELECTED:
        return "selected"
    return "none"


def list_planners(
    *,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 20), 20))
    status_f = (status or "").strip().lower() or None
    if status_f in ("all", ""):
        status_f = None

    sb = _svc()
    offset = (page - 1) * page_size

    try:
        q = (
            sb.table("planned_trips")
            .select(_TRIP_SELECT, count="exact")
            .neq("status", "archived")
        )
        if status_f:
            q = q.eq("status", status_f)
        result = (
            q.order("updated_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows: List[dict] = list(result.data or [])
        total = int(result.count if result.count is not None else len(rows))
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "has_more": False,
        }

    trip_ids = [str(r["id"]) for r in rows if r.get("id")]
    organizer_ids = list(
        {str(r["organizer_id"]) for r in rows if r.get("organizer_id")}
    )

    profiles: Dict[str, dict] = {}
    if organizer_ids:
        try:
            pref = (
                sb.table("user_profiles")
                .select("id,email,full_name,display_name")
                .in_("id", organizer_ids)
                .execute()
            )
            for p in pref.data or []:
                profiles[str(p.get("id"))] = p
        except Exception:
            pass

    drafts_by_trip: Dict[str, dict] = {}
    draft_ids: List[str] = []
    if trip_ids:
        try:
            dres = (
                sb.table("my_trip_drafts")
                .select(_DRAFT_SELECT + ",id")
                .in_("source_planned_trip_id", trip_ids)
                .neq("status", "archived")
                .execute()
            )
            for d in dres.data or []:
                tid = str(d.get("source_planned_trip_id") or "")
                if not tid or tid in drafts_by_trip:
                    continue
                drafts_by_trip[tid] = d
                if d.get("id"):
                    draft_ids.append(str(d["id"]))
        except Exception:
            # hotel column may be missing on older schemas
            try:
                dres = (
                    sb.table("my_trip_drafts")
                    .select(
                        "id,source_planned_trip_id,flight_booked_at,"
                        "hotel_booked_at,flight_booking_status"
                    )
                    .in_("source_planned_trip_id", trip_ids)
                    .neq("status", "archived")
                    .execute()
                )
                for d in dres.data or []:
                    tid = str(d.get("source_planned_trip_id") or "")
                    if tid and tid not in drafts_by_trip:
                        drafts_by_trip[tid] = d
                        if d.get("id"):
                            draft_ids.append(str(d["id"]))
            except Exception:
                pass

    accepted: Set[str] = set()
    if trip_ids:
        try:
            pres = (
                sb.table("trip_proposals")
                .select("trip_id")
                .in_("trip_id", trip_ids)
                .eq("status", "accepted")
                .execute()
            )
            for p in pres.data or []:
                if p.get("trip_id"):
                    accepted.add(str(p["trip_id"]))
        except Exception:
            pass

    booking_by_draft: Dict[str, str] = {}
    if draft_ids:
        try:
            bres = (
                sb.table("hotel_bookings")
                .select("draft_id,status")
                .in_("draft_id", draft_ids)
                .execute()
            )
            for b in bres.data or []:
                did = str(b.get("draft_id") or "")
                if did and did not in booking_by_draft:
                    booking_by_draft[did] = str(b.get("status") or "")
        except Exception:
            pass

    activities_count: Dict[str, int] = {tid: 0 for tid in trip_ids}
    if trip_ids:
        try:
            ires = (
                sb.table("trip_items")
                .select("planned_trip_id")
                .in_("planned_trip_id", trip_ids)
                .eq("item_type", "activity")
                .execute()
            )
            for it in ires.data or []:
                tid = str(it.get("planned_trip_id") or "")
                if tid in activities_count:
                    activities_count[tid] += 1
        except Exception:
            pass

    items = []
    for r in rows:
        tid = str(r.get("id") or "")
        org_id = str(r.get("organizer_id") or "")
        prof = profiles.get(org_id) or {}
        draft = drafts_by_trip.get(tid)
        booking_st = None
        if draft and draft.get("id"):
            booking_st = booking_by_draft.get(str(draft["id"]))
        user_label = (
            (prof.get("email") or "").strip()
            or (prof.get("full_name") or prof.get("display_name") or "").strip()
            or (org_id[:8] + "…" if org_id else "—")
        )
        items.append(
            {
                "id": tid,
                "name": r.get("name") or "",
                "user_id": org_id or None,
                "user": user_label,
                "status": r.get("status") or "planning",
                "destination": _dest_label(r),
                "departure_airport": r.get("departure_airport") or None,
                "out_date": _out_date(r),
                "ret_date": _ret_date(r),
                "flight": _flight_state(
                    has_accepted=tid in accepted, draft=draft
                ),
                "hotel": _hotel_state(draft=draft, booking_status=booking_st),
                "activities": activities_count.get(tid, 0),
                "updated_at": r.get("updated_at"),
                "created_at": r.get("created_at"),
            }
        )

    return {
        "ok": True,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": offset + len(items) < total,
    }
