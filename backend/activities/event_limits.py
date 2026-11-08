"""Validate + IP rate-limit public activity events."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Set

ALLOWED_DOMAINS: Set[str] = {
    "activity",
    "hotel",
    "flight",
    "itinerary",
    "trip",
    "planner",
}
ALLOWED_PLATFORMS: Set[str] = {"web", "ios", "android"}
ALLOWED_SURFACES: Set[str] = {
    "tab",
    "my_trip",
    "planner",
    "deal",
    "transfer",
    "occasions",
    "saved_ideas",
    "scheduler",
    "admin",
    "trip_detail",
    "parcours",
}
ALLOWED_EVENTS: Set[str] = {
    "view",
    "add",
    "add_intent",
    "book_click",
    "booked_yes",
    "booked_no",
    "skip",
    "validate",
    "reorder",
    "surface_cta",
    "j7_reminder",
    "transfer",
    "apply_itinerary",
    "create_itinerary",
    # Path trip detail (CADRE §4 / trip-detail-v2-metrics.sql)
    "trip_detail_viewed",
    "trip_tab_viewed",
    "trip_primary_action_clicked",
    "trip_partner_booking_clicked",
    "trip_invite_opened",
    "trip_invite_joined",
    "trip_item_placed",
    "trip_shared",
    # Catalogue Parcours (Lot 3)
    "itinerary_list_viewed",
    "itinerary_card_clicked",
    "itinerary_occasion_filtered",
}

_lock = threading.Lock()
_by_ip: Dict[str, Deque[float]] = defaultdict(deque)

# 60 events / IP / minute
_MAX_PER_WINDOW = 60
_WINDOW_S = 60.0


def validate_event_fields(
    *,
    domain: str,
    event: str,
    surface: Optional[str],
    platform: Optional[str],
) -> Optional[str]:
    """Return error code or None if ok."""
    if domain not in ALLOWED_DOMAINS:
        return "invalid_domain"
    if event not in ALLOWED_EVENTS:
        return "invalid_event"
    if surface is not None and surface not in ALLOWED_SURFACES:
        return "invalid_surface"
    if platform is not None and platform not in ALLOWED_PLATFORMS:
        return "invalid_platform"
    return None


def check_ip_rate_limit(ip: str) -> bool:
    """True if allowed, False if limited."""
    key = (ip or "unknown").strip() or "unknown"
    with _lock:
        now = time.monotonic()
        q = _by_ip[key]
        while q and q[0] < now - _WINDOW_S:
            q.popleft()
        if len(q) >= _MAX_PER_WINDOW:
            return False
        q.append(now)
        return True


def reset_for_tests() -> None:
    with _lock:
        _by_ip.clear()
