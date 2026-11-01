"""Viator Partner API client — Lot B (Retry-After on 429/503)."""
from __future__ import annotations

import logging
import random
import time
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import requests

from activities.config import ActivitiesConfig, load_activities_config

logger = logging.getLogger("activities.viator_client")


class ViatorError(Exception):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


class ViatorClient:
    def __init__(self, cfg: Optional[ActivitiesConfig] = None):
        self.cfg = cfg or load_activities_config()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json;version=2.0",
                "Accept-Language": "fr-FR",
                "Content-Type": "application/json",
                "exp-api-key": self.cfg.viator_api_key or "",
            }
        )

    @property
    def enabled(self) -> bool:
        return bool(self.cfg.viator_api_key)

    def _url(self, path: str) -> str:
        base = self.cfg.viator_base_url.rstrip("/") + "/"
        return urljoin(base, path.lstrip("/"))

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        if not self.enabled:
            raise ViatorError("VIATOR_API_KEY missing")
        url = self._url(path)
        retries = max(0, int(self.cfg.max_retries))
        attempt = 0
        while True:
            try:
                resp = self.session.request(
                    method.upper(),
                    url,
                    json=json_body,
                    params=params,
                    timeout=30,
                )
            except requests.RequestException as e:
                if attempt >= retries:
                    raise ViatorError(str(e)) from e
                delay = min(60.0, (2**attempt) + random.uniform(0, 0.5))
                logger.warning("Viator network error retry in %.1fs: %s", delay, e)
                time.sleep(delay)
                attempt += 1
                continue

            if resp.status_code in (429, 503) and attempt < retries:
                ra = resp.headers.get("Retry-After")
                try:
                    delay = float(ra) if ra else min(60.0, (2**attempt) + random.uniform(0, 1))
                except ValueError:
                    delay = min(60.0, (2**attempt) + random.uniform(0, 1))
                logger.warning(
                    "Viator %s retry-after %.1fs (attempt %s)",
                    resp.status_code,
                    delay,
                    attempt + 1,
                )
                time.sleep(max(0.5, delay))
                attempt += 1
                continue

            if resp.status_code >= 400:
                raise ViatorError(
                    f"Viator HTTP {resp.status_code}: {resp.text[:300]}",
                    status=resp.status_code,
                )
            if not resp.content:
                return None
            return resp.json()

    def get(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, json_body: Any = None, **kwargs: Any) -> Any:
        return self.request("POST", path, json_body=json_body, **kwargs)

    def list_destinations(self) -> Any:
        return self.get("/destinations")

    def search_products(self, body: Dict[str, Any]) -> Any:
        return self.post("/products/search", json_body=body)

    def product_detail(self, product_code: str) -> Any:
        return self.get(f"/products/{product_code}")

    def availability_schedules(self, product_code: str) -> Any:
        return self.get(f"/availability/schedules/{product_code}")


def run_sandbox_check(cfg: Optional[ActivitiesConfig] = None) -> Dict[str, Any]:
    """
    Lot B gate: fr locale headers, EUR pricing signals, destination coords,
    product meeting/start point when available.
    """
    cfg = cfg or load_activities_config()
    out: Dict[str, Any] = {
        "ok": False,
        "env": cfg.viator_env,
        "checks": {},
        "errors": [],
    }
    if not cfg.viator_api_key:
        out["errors"].append("VIATOR_API_KEY missing")
        return out
    client = ViatorClient(cfg)
    try:
        dests = client.list_destinations()
        out["checks"]["destinations_fetch"] = True
        # Response shape varies; collect a few with lat/lng
        items = []
        if isinstance(dests, dict):
            items = dests.get("destinations") or dests.get("data") or []
        elif isinstance(dests, list):
            items = dests
        with_coords = 0
        sample = None
        for d in items[:50] if isinstance(items, list) else []:
            if not isinstance(d, dict):
                continue
            center = d.get("center") or d.get("coordinates") or {}
            lat = d.get("latitude") or (center.get("latitude") if isinstance(center, dict) else None)
            lng = d.get("longitude") or (center.get("longitude") if isinstance(center, dict) else None)
            if lat is not None and lng is not None:
                with_coords += 1
                if sample is None:
                    sample = d
        out["checks"]["destinations_with_coords"] = with_coords
        out["checks"]["accept_language_fr"] = True  # request header
        # Product search smoke (Paris-like if we have destination id)
        dest_id = None
        if isinstance(sample, dict):
            dest_id = sample.get("destinationId") or sample.get("id")
        product_ok = False
        meeting_point = False
        currency_eur = False
        if dest_id is not None:
            try:
                search = client.search_products(
                    {
                        "filtering": {
                            "destination": str(dest_id),
                        },
                        "pagination": {"start": 1, "count": 3},
                        "currency": "EUR",
                    }
                )
                products = []
                if isinstance(search, dict):
                    products = search.get("products") or search.get("data") or []
                product_ok = bool(products)
                for p in products[:3] if isinstance(products, list) else []:
                    if not isinstance(p, dict):
                        continue
                    price = p.get("pricing") or p.get("price") or {}
                    cur = None
                    if isinstance(price, dict):
                        cur = price.get("currency") or (price.get("summary") or {}).get(
                            "fromPrice"
                        )
                    if cur == "EUR" or (
                        isinstance(price, dict)
                        and str(price.get("currency") or "").upper() == "EUR"
                    ):
                        currency_eur = True
                    code = p.get("productCode") or p.get("code")
                    if code:
                        try:
                            detail = client.product_detail(str(code))
                            if isinstance(detail, dict):
                                locs = (
                                    detail.get("logistics")
                                    or detail.get("itinerary")
                                    or {}
                                )
                                text = str(locs).lower()
                                if "meeting" in text or "start" in text or "lat" in text:
                                    meeting_point = True
                                # pricing currency on detail
                                pr = detail.get("pricing") or {}
                                if isinstance(pr, dict) and str(
                                    pr.get("currency") or ""
                                ).upper() == "EUR":
                                    currency_eur = True
                        except ViatorError as e:
                            out["errors"].append(f"product_detail: {e}")
                        break
            except ViatorError as e:
                out["errors"].append(f"products_search: {e}")
        out["checks"]["product_search"] = product_ok
        out["checks"]["currency_eur"] = currency_eur
        out["checks"]["meeting_or_start_signal"] = meeting_point
        out["ok"] = bool(
            out["checks"].get("destinations_fetch")
            and with_coords > 0
            and (product_ok or dest_id is None)
        )
    except ViatorError as e:
        out["errors"].append(str(e))
        out["checks"]["destinations_fetch"] = False
    return out
