"""Canonical deal windows: FRI_SUN (default) and optional SAT_MON."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

WindowKind = str  # FRI_SUN | SAT_MON | LONG_STAY


def _iso_week_id(d: date, kind: WindowKind, *, nights: Optional[int] = None) -> str:
    iso = d.isocalendar()
    if kind == "LONG_STAY" and nights:
        return f"{iso.year}-W{iso.week:02d}-LH{int(nights)}"
    return f"{iso.year}-W{iso.week:02d}-{kind}"


def friday_on_or_after(d: date) -> date:
    # weekday: Mon=0 … Fri=4
    delta = (4 - d.weekday()) % 7
    return d + timedelta(days=delta)


def saturday_on_or_after(d: date) -> date:
    delta = (5 - d.weekday()) % 7
    return d + timedelta(days=delta)


def build_window(
    kind: WindowKind, checkin: date, *, nights: Optional[int] = None
) -> Dict[str, Any]:
    if kind == "FRI_SUN":
        checkout = checkin + timedelta(days=2)
    elif kind == "SAT_MON":
        checkout = checkin + timedelta(days=2)
    elif kind == "LONG_STAY":
        n = max(7, min(15, int(nights or 10)))
        checkout = checkin + timedelta(days=n)
    else:
        raise ValueError(f"Unknown window kind: {kind}")
    n_nights = (checkout - checkin).days
    return {
        "id": _iso_week_id(checkin, kind, nights=n_nights if kind == "LONG_STAY" else None),
        "kind": kind,
        "checkin": checkin.isoformat(),
        "checkout": checkout.isoformat(),
        "nights": n_nights,
    }


def longhaul_windows(
    n: int = 3,
    *,
    today: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """7–15 night Sat→… stays for long-haul hotel rates."""
    today = today or date.today()
    n = max(1, int(n))
    configs = [(3, 10), (5, 14), (7, 10), (4, 7), (6, 12)][:n]
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for weeks, nights in configs:
        start = today + timedelta(weeks=weeks)
        delta = (5 - start.weekday()) % 7  # Saturday
        sat = start + timedelta(days=delta)
        if sat < today:
            sat += timedelta(days=7)
        w = build_window("LONG_STAY", sat, nights=nights)
        if w["id"] not in seen:
            seen.add(w["id"])
            out.append(w)
    out.sort(key=lambda w: w["checkin"])
    return out


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
