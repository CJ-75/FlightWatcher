"""Canonical deal windows: FRI_SUN (default) and optional SAT_MON."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

WindowKind = str  # FRI_SUN | SAT_MON


def _iso_week_id(d: date, kind: WindowKind) -> str:
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}-{kind}"


def friday_on_or_after(d: date) -> date:
    # weekday: Mon=0 … Fri=4
    delta = (4 - d.weekday()) % 7
    return d + timedelta(days=delta)


def saturday_on_or_after(d: date) -> date:
    delta = (5 - d.weekday()) % 7
    return d + timedelta(days=delta)


def build_window(kind: WindowKind, checkin: date) -> Dict[str, Any]:
    if kind == "FRI_SUN":
        checkout = checkin + timedelta(days=2)
    elif kind == "SAT_MON":
        checkout = checkin + timedelta(days=2)
    else:
        raise ValueError(f"Unknown window kind: {kind}")
    nights = (checkout - checkin).days
    return {
        "id": _iso_week_id(checkin, kind),
        "kind": kind,
        "checkin": checkin.isoformat(),
        "checkout": checkout.isoformat(),
        "nights": nights,
    }


def canonical_windows(
    n: int = 3,
    *,
    kinds: Sequence[WindowKind] = ("FRI_SUN",),
    today: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Next N week-ends per kind, with checkin >= today.
    FRI_SUN: Fri→Sun (2 nights). SAT_MON: Sat→Mon (2 nights).
    """
    today = today or date.today()
    n = max(1, int(n))
    out: List[Dict[str, Any]] = []
    seen: set = set()

    for kind in kinds:
        if kind == "FRI_SUN":
            start = friday_on_or_after(today)
        elif kind == "SAT_MON":
            start = saturday_on_or_after(today)
        else:
            continue

        count = 0
        cursor = start
        # safety bound
        for _ in range(20):
            if cursor < today:
                cursor += timedelta(days=7)
                continue
            w = build_window(kind, cursor)
            if w["id"] not in seen:
                seen.add(w["id"])
                out.append(w)
                count += 1
            if count >= n:
                break
            cursor += timedelta(days=7)

    # Stable order: by checkin then kind
    out.sort(key=lambda w: (w["checkin"], 0 if w["kind"] == "FRI_SUN" else 1))
    return out


def upsert_windows(supabase: Any, windows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = []
    for w in windows:
        rows.append(
            {
                "id": w["id"],
                "kind": w["kind"],
                "checkin": w["checkin"],
                "checkout": w["checkout"],
                "nights": w.get("nights") or 2,
            }
        )
    if not rows:
        return []
    result = supabase.table("deal_windows").upsert(rows, on_conflict="id").execute()
    data = list(result.data or [])
    if not data:
        ids = [r["id"] for r in rows]
        sel = supabase.table("deal_windows").select("*").in_("id", ids).execute()
        data = list(sel.data or [])
    return data
