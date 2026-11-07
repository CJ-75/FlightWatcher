"""
Lot C — live (Ryanair) vs cached (Travelpayouts) deal levels.

Note: Travelpayouts `prices_for_dates` response fields mapped today do NOT include
`found_at` / discovery age — age filter DEALS_CACHED_MAX_AGE_H is a no-op until
the API exposes it (documented, not invented).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


LEVEL_LIVE = "live"
LEVEL_CACHED = "cached"

CACHED_BADGE = {
    # Short tag for cards; full honesty stays in tooltip / Mon voyage copy
    "label": "À confirmer",
    "discount_pct": None,
    "scope": "flight",
    "tooltip": (
        "Prix repéré récemment via un agrégateur (pas une vérif. en direct). "
        "Confirme le tarif chez le partenaire avant de réserver."
    ),
    "verification_level": LEVEL_CACHED,
}


def verification_level_for_provider(provider: Optional[str]) -> str:
    p = (provider or "").strip().lower()
    if p in ("travelpayouts", "aviasales", "tp"):
        return LEVEL_CACHED
    return LEVEL_LIVE


def _obs_price(obs: Dict[str, Any]) -> float:
    try:
        return float(obs.get("price_pp_eur") or 9999)
    except (TypeError, ValueError):
        return 9999.0


def _is_organic(obs: Dict[str, Any]) -> bool:
    src = str(obs.get("source") or "").strip().lower()
    return src in ("organic_search", "user_search", "organic", "search")


def _is_seed(obs: Dict[str, Any]) -> bool:
    src = str(obs.get("source") or "").strip().lower()
    return src in ("seed_batch", "seed", "seed_scan")


def organic_beats_seed(
    organic: Dict[str, Any],
    seed: Dict[str, Any],
    *,
    min_save_eur: float = 8.0,
    min_save_pct: float = 0.05,
) -> bool:
    """
    User search beats catalog when clearly cheaper (avoid ±2 € yo-yo).
    Threshold: −min_save_eur OR −min_save_pct vs seed price.
    """
    import os

    try:
        min_eur = float(os.getenv("DEALS_ORGANIC_BEAT_EUR", str(min_save_eur)) or min_save_eur)
    except (TypeError, ValueError):
        min_eur = min_save_eur
    try:
        min_pct = float(os.getenv("DEALS_ORGANIC_BEAT_PCT", str(min_save_pct)) or min_save_pct)
    except (TypeError, ValueError):
        min_pct = min_save_pct
    po = _obs_price(organic)
    ps = _obs_price(seed)
    if po <= 0 or ps <= 0 or po >= ps:
        return False
    save = ps - po
    return save >= min_eur or (save / ps) >= min_pct


def prefer_observation(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prefer organic over seed when clearly cheaper; else live over cached; else cheaper.
    Never demote a verified/booked flag if present on either side.
    """
    for locked in (a, b):
        st = str(locked.get("status") or locked.get("_deal_status") or "").lower()
        if st in ("booked", "verified", "locked"):
            return locked

    a_org, b_org = _is_organic(a), _is_organic(b)
    a_seed, b_seed = _is_seed(a), _is_seed(b)
    if a_org and b_seed and organic_beats_seed(a, b):
        return {**a, "_beat_catalog": True}
    if b_org and a_seed and organic_beats_seed(b, a):
        return {**b, "_beat_catalog": True}
    # Organic without clear win: keep seed (stable wall) unless organic is live+cheaper tiny? no.

    la = verification_level_for_provider(a.get("provider"))
    lb = verification_level_for_provider(b.get("provider"))
    if la != lb:
        return a if la == LEVEL_LIVE else b
    pa, pb = _obs_price(a), _obs_price(b)
    return a if pa <= pb else b


def apply_cached_share_cap(
    deals: List[Dict[str, Any]],
    *,
    max_share: float = 0.30,
    cached_enabled: bool = True,
) -> List[Dict[str, Any]]:
    """
    Sort live first (then score), drop cached if disabled, cap cached share per list.
    Expects deal dicts with verification_level + deal_score.
    """
    live = [d for d in deals if (d.get("verification_level") or LEVEL_LIVE) == LEVEL_LIVE]
    cached = [
        d for d in deals if (d.get("verification_level") or "") == LEVEL_CACHED
    ]
    live.sort(key=lambda d: -float(d.get("deal_score") or 0))
    cached.sort(key=lambda d: -float(d.get("deal_score") or 0))

    if not cached_enabled:
        return live

    share = max(0.0, min(1.0, float(max_share)))
    if not deals:
        return []
    # Cap: cached <= share * total displayed
    # Fill live first, then add cached up to cap
    out = list(live)
    max_cached = int(len(out) * share / max(1e-9, 1.0 - share)) if share < 1 else len(cached)
    # If no live, allow some cached up to share of a synthetic total
    if not out and cached:
        max_cached = max(1, int(len(cached) * share)) if share < 1 else len(cached)
    out.extend(cached[:max_cached])
    return out


def badge_for_deal_level(
    baseline_badge: Dict[str, Any],
    *,
    verification_level: str,
) -> Dict[str, Any]:
    if verification_level == LEVEL_CACHED:
        return dict(CACHED_BADGE)
    out = dict(baseline_badge)
    out["verification_level"] = LEVEL_LIVE
    # Never keep a % on cached path (belt)
    return out
