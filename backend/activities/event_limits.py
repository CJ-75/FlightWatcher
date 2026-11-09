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
    "auth",
    "onboarding",
    "invite",
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
    "auth_sheet",
    "invite_landing",
    "onboarding",
    "permissions",
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
    "itinerary_liked",
    "itinerary_unliked",
    "itinerary_make_trip",
    "itinerary_launch_maps",
    # Onboarding / auth (brief §8)
    "auth_sheet_opened",
    "auth_started",
    "auth_succeeded",
    "auth_failed",
    "invite_landing_viewed",
    "invite_join_clicked",
    "invite_joined",
    "invite_preview_failed",
    "onboarding_started",
    "onboarding_city_set",
    "onboarding_pref_set",
    "onboarding_completed",
    "permission_preprompt_shown",
    "permission_accepted",
    "permission_deferred",
    "app_promo_shown",
    "app_promo_clicked",
    "app_promo_dismissed",
    "first_name_prompt_shown",
    "first_name_saved",
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
