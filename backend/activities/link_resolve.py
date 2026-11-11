"""Secure short-link expansion for Google Maps (SSRF-safe)."""
from __future__ import annotations

import ipaddress
import logging
import socket
from typing import Optional, Set
from urllib.parse import urljoin, urlparse

import httpx

from activities.restaurants_config import load_restaurants_config

logger = logging.getLogger("activities.link_resolve")


def _host_allowed(host: str, allowed: Set[str]) -> bool:
    h = (host or "").lower().strip(".")
    if not h:
        return False
    if h in allowed:
        return True
    # Subdomains of allowlisted parents (e.g. www.google.com already listed)
    return False


def _resolves_to_public_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
        ):
            return False
    return True


def _safe_next(current: str, location: str) -> Optional[str]:
    if not location:
        return None
    next_url = urljoin(current, location)
    parsed = urlparse(next_url)
    if parsed.scheme not in ("http", "https"):
        return None
    return next_url


def expand_short_url(url: str, timeout_s: float = 4.0) -> Optional[str]:
    """
    Follow redirects for allowlisted Google short hosts only.
    Prefers GET — Maps short links often ignore HEAD / return 200 without Location.
    Returns final URL or None.
    """
    cfg = load_restaurants_config()
    allowed = set(cfg.resolve_allowed_hosts)
    current = (url or "").strip()
    if not current:
        return None

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; FlightWatcherLinkResolve/1.1; +https://flightwatcher.app)"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }

    for _ in range(cfg.resolve_max_redirects):
        parsed = urlparse(current)
        if parsed.scheme not in ("http", "https"):
            return None
        host = (parsed.hostname or "").lower()
        if not _host_allowed(host, allowed):
            logger.info("resolve blocked host %s", host)
            return None
        if not _resolves_to_public_ip(host):
            logger.info("resolve blocked private ip host %s", host)
            return None
        try:
            with httpx.Client(
                follow_redirects=False,
                timeout=timeout_s,
                headers=headers,
            ) as client:
                # GET first — goo.gl / maps.app often don't redirect on HEAD
                resp = client.get(current)
                if resp.status_code in (301, 302, 303, 307, 308):
                    loc = resp.headers.get("location")
                    nxt = _safe_next(current, loc or "")
                    if not nxt:
                        return current
                    current = nxt
                    continue
                # Meta-refresh / final page
                final = str(resp.url) if resp.url else current
                if final != current:
                    # httpx may have normalized URL
                    current = final
                return current
        except Exception as e:
            logger.debug("resolve failed %s: %s", current, e)
            return None
    return current
