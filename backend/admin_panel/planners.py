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
    "dates_depart,dates_retour,updated_at,created_at,meta"
)
_DRAFT_SELECT = (
    "source_planned_trip_id,flight_booked_at,hotel_booked_at,"
    "flight_booking_status,hotel,payload,draft_token"
)

_ISSUE_LABELS = {
    "pop_sans_source": "Pop sans source",
    "draft_manquant": "Draft manquant",
    "hotel_incoherent": "Hôtel incohérent",
}


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


def _trip_meta(row: dict) -> Dict[str, Any]:
    raw = row.get("meta")
    return dict(raw) if isinstance(raw, dict) else {}


def _draft_payload(draft: Optional[dict]) -> Dict[str, Any]:
    if not draft:
        return {}
    raw = draft.get("payload")
    return dict(raw) if isinstance(raw, dict) else {}


def _detect_issues(
    *,
    row: dict,
    draft: Optional[dict],
    has_accepted: bool,
) -> List[str]:
    """Codes problèmes — logique pure, 0 requête."""
    meta = _trip_meta(row)
    payload = _draft_payload(draft)
    issues: List[str] = []
    from_pop = bool(meta.get("from_pop") or meta.get("source_itinerary_id"))
    source = str(meta.get("source_itinerary_id") or "").strip()
    if from_pop and not source:
        issues.append("pop_sans_source")
    status = str(row.get("status") or "")
    if (status == "locked" or has_accepted) and not draft:
        issues.append("draft_manquant")
    want_hotel = meta.get("want_hotel")
    hotel_ext = bool(
        payload.get("hotel_external")
        or payload.get("external_hotel")
        or (
            draft
            and draft.get("hotel_booked_at")
            and not (draft.get("hotel") or payload.get("hotel"))
        )
    )
    if want_hotel is True and hotel_ext:
        issues.append("hotel_incoherent")
    return issues


def _user_label(prof: dict, org_id: str) -> str:
    return (
        (prof.get("email") or "").strip()
        or (prof.get("full_name") or prof.get("display_name") or "").strip()
        or (org_id[:8] + "…" if org_id else "—")
    )


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
        # meta column may be missing before migration — retry without it.
        try:
            lean = _TRIP_SELECT.replace(",meta", "")
            q = (
                sb.table("planned_trips")
                .select(lean, count="exact")
                .neq("status", "archived")
            )
            if status_f:
                q = q.eq("status", status_f)
            result = (
                q.order("updated_at", desc=True)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = list(result.data or [])
            total = int(result.count if result.count is not None else len(rows))
        except Exception:
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
        meta = _trip_meta(r)
        has_acc = tid in accepted
        issues = _detect_issues(row=r, draft=draft, has_accepted=has_acc)
        items.append(
            {
                "id": tid,
                "name": r.get("name") or "",
                "user_id": org_id or None,
                "user": _user_label(prof, org_id),
                "status": r.get("status") or "planning",
                "destination": _dest_label(r),
                "departure_airport": r.get("departure_airport") or None,
                "out_date": _out_date(r),
                "ret_date": _ret_date(r),
                "flight": _flight_state(has_accepted=has_acc, draft=draft),
                "hotel": _hotel_state(draft=draft, booking_status=booking_st),
                "activities": activities_count.get(tid, 0),
                "from_pop": bool(
                    meta.get("from_pop") or meta.get("source_itinerary_id")
                ),
                "want_flight": meta.get("want_flight"),
                "want_hotel": meta.get("want_hotel"),
                "issues": issues,
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


def planners_ops(*, sample: int = 80) -> Dict[str, Any]:
    """
    KPIs + file problèmes — 3 requêtes batch max (trips, drafts, accepted).
    Échantillon des N trips les plus récents (pas un full scan).
    """
    sample = max(20, min(int(sample or 80), 100))
    sb = _svc()
    try:
        trips = (
            sb.table("planned_trips")
            .select(
                "id,organizer_id,name,status,arrival_airport,meta,"
                "updated_at,created_at"
            )
            .neq("status", "archived")
            .order("updated_at", desc=True)
            .limit(sample)
            .execute()
        ).data or []
    except Exception as e:
        return {"ok": False, "error": str(e), "kpis": {}, "issues": []}

    trip_ids = [str(r["id"]) for r in trips if r.get("id")]
    drafts_by_trip: Dict[str, dict] = {}
    if trip_ids:
        try:
            dres = (
                sb.table("my_trip_drafts")
                .select(
                    "id,source_planned_trip_id,flight_booked_at,hotel_booked_at,"
                    "flight_booking_status,hotel,payload"
                )
                .in_("source_planned_trip_id", trip_ids)
                .neq("status", "archived")
                .execute()
            )
            for d in dres.data or []:
                tid = str(d.get("source_planned_trip_id") or "")
                if tid and tid not in drafts_by_trip:
                    drafts_by_trip[tid] = d
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

    from_pop_n = 0
    want_flight_n = 0
    want_hotel_n = 0
    hotel_booked_n = 0
    issues_out: List[dict] = []
    org_ids: Set[str] = set()

    for r in trips:
        tid = str(r.get("id") or "")
        meta = _trip_meta(r)
        draft = drafts_by_trip.get(tid)
        has_acc = tid in accepted
        is_pop = bool(meta.get("from_pop") or meta.get("source_itinerary_id"))
        if is_pop:
            from_pop_n += 1
            if meta.get("want_flight") is True:
                want_flight_n += 1
            if meta.get("want_hotel") is True:
                want_hotel_n += 1
        if draft and (
            draft.get("hotel_booked_at")
            or _hotel_state(draft=draft, booking_status=None) == "booked"
        ):
            # booked via column; hotel_bookings skipped (1 req en moins)
            if draft.get("hotel_booked_at"):
                hotel_booked_n += 1
        codes = _detect_issues(row=r, draft=draft, has_accepted=has_acc)
        if not codes:
            continue
        org_id = str(r.get("organizer_id") or "")
        if org_id:
            org_ids.add(org_id)
        issues_out.append(
            {
                "id": tid,
                "name": r.get("name") or "",
                "status": r.get("status") or "planning",
                "destination": _dest_label(r),
                "user_id": org_id or None,
                "from_pop": is_pop,
                "issues": codes,
                "issue_labels": [_ISSUE_LABELS.get(c, c) for c in codes],
                "updated_at": r.get("updated_at"),
            }
        )

    profiles: Dict[str, dict] = {}
    if org_ids:
        try:
            pref = (
                sb.table("user_profiles")
                .select("id,email,full_name,display_name")
                .in_("id", list(org_ids)[:40])
                .execute()
            )
            for p in pref.data or []:
                profiles[str(p.get("id"))] = p
        except Exception:
            pass

    for it in issues_out:
        oid = str(it.get("user_id") or "")
        it["user"] = _user_label(profiles.get(oid) or {}, oid)

    return {
        "ok": True,
        "sample": len(trips),
        "kpis": {
            "trips_sample": len(trips),
            "from_pop": from_pop_n,
            "want_flight": want_flight_n,
            "want_hotel": want_hotel_n,
            "hotel_booked": hotel_booked_n,
            "issues": len(issues_out),
        },
        "issues": issues_out[:40],
        "issue_labels": _ISSUE_LABELS,
    }


def get_planner(trip_id: str) -> Dict[str, Any]:
    """Fiche séjour — 4 requêtes max."""
    tid = str(trip_id or "").strip()
    if not tid:
        return {"ok": False, "error": "missing_id"}
    sb = _svc()
    try:
        tres = (
            sb.table("planned_trips")
            .select(
                "id,organizer_id,name,status,departure_airport,arrival_airport,"
                "dates_depart,dates_retour,meta,invite_token,passengers,"
                "updated_at,created_at"
            )
            .eq("id", tid)
            .limit(1)
            .execute()
        )
        row = (tres.data or [None])[0]
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not row:
        return {"ok": False, "error": "not_found"}

    org_id = str(row.get("organizer_id") or "")
    meta = _trip_meta(row)

    draft = None
    try:
        dres = (
            sb.table("my_trip_drafts")
            .select(
                "id,draft_token,status,flight_booked_at,hotel_booked_at,"
                "flight_booking_status,hotel,payload,updated_at"
            )
            .eq("source_planned_trip_id", tid)
            .neq("status", "archived")
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        draft = (dres.data or [None])[0]
    except Exception:
        draft = None

    has_accepted = False
    try:
        pres = (
            sb.table("trip_proposals")
            .select("id")
            .eq("trip_id", tid)
            .eq("status", "accepted")
            .limit(1)
            .execute()
        )
        has_accepted = bool(pres.data)
    except Exception:
        pass

    activities = {"total": 0, "active": 0, "skipped": 0, "viator": 0, "pop": 0}
    try:
        ires = (
            sb.table("trip_items")
            .select("id,status,meta,item_type")
            .eq("planned_trip_id", tid)
            .eq("item_type", "activity")
            .limit(80)
            .execute()
        )
        for it in ires.data or []:
            activities["total"] += 1
            st = str(it.get("status") or "")
            if st == "skipped":
                activities["skipped"] += 1
            else:
                activities["active"] += 1
            m = it.get("meta") if isinstance(it.get("meta"), dict) else {}
            code = str(
                m.get("product_code") or m.get("viator_product_code") or ""
            ).strip()
            if code and not code.startswith("skip-"):
                activities["viator"] += 1
            elif str(
                m.get("from_itinerary_item_id")
                or m.get("source_itinerary_id")
                or ""
            ).strip():
                activities["pop"] += 1
    except Exception:
        pass

    prof: dict = {}
    if org_id:
        try:
            pref = (
                sb.table("user_profiles")
                .select("id,email,full_name,display_name")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            prof = (pref.data or [{}])[0] or {}
        except Exception:
            pass

    payload = _draft_payload(draft)
    issues = _detect_issues(row=row, draft=draft, has_accepted=has_accepted)
    return {
        "ok": True,
        "trip": {
            "id": tid,
            "name": row.get("name") or "",
            "user_id": org_id or None,
            "user": _user_label(prof, org_id),
            "status": row.get("status") or "planning",
            "destination": _dest_label(row),
            "departure_airport": row.get("departure_airport"),
            "out_date": _out_date(row),
            "ret_date": _ret_date(row),
            "passengers": row.get("passengers"),
            "invite_token": row.get("invite_token"),
            "from_pop": bool(
                meta.get("from_pop") or meta.get("source_itinerary_id")
            ),
            "want_flight": meta.get("want_flight"),
            "want_hotel": meta.get("want_hotel"),
            "source_itinerary_id": str(
                meta.get("source_itinerary_id") or ""
            ).strip()
            or None,
            "flight": _flight_state(has_accepted=has_accepted, draft=draft),
            "hotel": _hotel_state(draft=draft, booking_status=None),
            "hotel_external": bool(
                payload.get("hotel_external") or payload.get("external_hotel")
            ),
            "flight_external": bool(
                payload.get("flight_external") or payload.get("external_flight")
            ),
            "draft_token": (draft or {}).get("draft_token"),
            "activities": activities,
            "issues": issues,
            "issue_labels": [_ISSUE_LABELS.get(c, c) for c in issues],
            "updated_at": row.get("updated_at"),
            "created_at": row.get("created_at"),
        },
    }
