"""
Stay duration buckets for promote / search-beats-wall matching.

Buckets (±1 night soft match via adjacent edges handled by callers):
  weekend  → 1–3 nights
  short    → 4–6 nights
  week     → 7–9 nights (city-break week)
  longhaul → 7–15 nights (long-haul destinations only)
"""
from __future__ import annotations

from typing import Optional, Set


def duration_bucket(
    nights: int,
    *,
    dest_iata: Optional[str] = None,
    longhaul_iatas: Optional[Set[str]] = None,
) -> Optional[str]:
    try:
        n = int(nights)
    except (TypeError, ValueError):
        return None
    if n < 1:
        return None
    code = (dest_iata or "").strip().upper()
    lh = longhaul_iatas
    if lh is None and code:
        try:
            from deals.destinations_seed import LONGHAUL_IATAS

            lh = LONGHAUL_IATAS
        except Exception:
            lh = set()
    if code and lh and code in lh:
        if 7 <= n <= 15:
            return "longhaul"
        return None
    if 1 <= n <= 3:
        return "weekend"
    if 4 <= n <= 6:
        return "short"
    if 7 <= n <= 9:
        return "week"
    return None


def buckets_compatible(a: Optional[str], b: Optional[str]) -> bool:
    """Same bucket, or week ↔ longhaul (both multi-day)."""
    if not a or not b:
        return False
    if a == b:
        return True
    return {a, b} <= {"week", "longhaul"}
