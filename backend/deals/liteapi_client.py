"""Single LiteAPI HTTP client (search + booking). No secrets in logs."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from deals.liteapi_config import DealsConfig, load_deals_config

logger = logging.getLogger("deals.liteapi")


class LiteApiError(Exception):
    def __init__(self, message: str, *, status_code: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class LiteApiClient:
    def __init__(self, cfg: Optional[DealsConfig] = None, client: Optional[httpx.Client] = None):
        self.cfg = cfg or load_deals_config()
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=self.cfg.timeout_s)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> "LiteApiClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.cfg.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        base: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        retry: bool = True,
    ) -> Any:
        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        t0 = time.monotonic()
        last_exc: Optional[Exception] = None
        attempts = 2 if retry else 1

        for attempt in range(attempts):
            try:
                resp = self._client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                    timeout=timeout or self.cfg.timeout_s,
                )
                elapsed_ms = int((time.monotonic() - t0) * 1000)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt + 1 < attempts:
                    backoff = 0.5 * (attempt + 1)
                    logger.warning(
                        "liteapi_retry endpoint=%s status=%s attempt=%s backoff=%.1fs",
                        path,
                        resp.status_code,
                        attempt + 1,
                        backoff,
                    )
                    time.sleep(backoff)
                    continue

                if resp.status_code >= 400:
                    body_preview = None
                    try:
                        body_preview = resp.json()
                    except Exception:
                        body_preview = (resp.text or "")[:300]
                    logger.warning(
                        "liteapi_error endpoint=%s status=%s duration_ms=%s",
                        path,
                        resp.status_code,
                        elapsed_ms,
                    )
                    raise LiteApiError(
                        f"LiteAPI {path} HTTP {resp.status_code}",
                        status_code=resp.status_code,
                        body=body_preview,
                    )

                data = resp.json() if resp.content else None
                n_hotels = None
                if isinstance(data, dict):
                    for key in ("data", "hotels"):
                        if isinstance(data.get(key), list):
                            n_hotels = len(data[key])
                            break
                logger.info(
                    "liteapi_ok endpoint=%s status=%s duration_ms=%s returned=%s",
                    path,
                    resp.status_code,
                    elapsed_ms,
                    n_hotels,
                )
                try:
                    from deals.metrics import record_liteapi_call

                    record_liteapi_call(path, elapsed_ms, ok=True)
                except Exception:
                    pass
                return data
            except httpx.TimeoutException as e:
                last_exc = e
                if attempt + 1 < attempts:
                    logger.warning("liteapi_timeout endpoint=%s attempt=%s", path, attempt + 1)
                    continue
                try:
                    from deals.metrics import record_liteapi_call

                    record_liteapi_call(path, int((time.monotonic() - t0) * 1000), ok=False)
                except Exception:
                    pass
                raise LiteApiError(f"LiteAPI {path} timeout", status_code=None) from e
            except LiteApiError:
                try:
                    from deals.metrics import record_liteapi_call

                    record_liteapi_call(path, int((time.monotonic() - t0) * 1000), ok=False)
                except Exception:
                    pass
                raise
            except Exception as e:
                last_exc = e
                raise LiteApiError(f"LiteAPI {path} error: {e}") from e

        raise LiteApiError(f"LiteAPI {path} failed", body=str(last_exc) if last_exc else None)

    # --- Data / static ---

    def list_hotels(
        self,
        *,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        radius: Optional[int] = None,
        country_code: Optional[str] = None,
        city_name: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
        min_rating: Optional[float] = None,
        min_reviews_count: Optional[int] = None,
        star_rating: Optional[str] = None,
    ) -> Any:
        params: Dict[str, Any] = {"offset": offset, "limit": limit}
        if latitude is not None and longitude is not None:
            params["latitude"] = latitude
            params["longitude"] = longitude
            if radius is not None:
                params["radius"] = max(1000, int(radius))
        if country_code:
            params["countryCode"] = country_code
        if city_name:
            params["cityName"] = city_name
        if min_rating is not None:
            params["minRating"] = min_rating
        if min_reviews_count is not None:
            params["minReviewsCount"] = min_reviews_count
        if star_rating:
            params["starRating"] = star_rating
        return self._request("GET", self.cfg.search_base, "/data/hotels", params=params)

    def list_hotel_types(self) -> Any:
        return self._request("GET", self.cfg.search_base, "/data/hotelTypes")

    def list_facilities(self) -> Any:
        return self._request("GET", self.cfg.search_base, "/data/facilities")

    # --- Rates ---

    def hotels_rates(self, body: Dict[str, Any], *, timeout: Optional[float] = None) -> Any:
        payload = {
            "currency": self.cfg.currency,
            "guestNationality": self.cfg.guest_nationality,
            "timeout": int(timeout or self.cfg.timeout_s),
            **body,
        }
        hotel_ids = payload.get("hotelIds") or []
        logger.info(
            "liteapi_rates_request hotels=%s checkin=%s checkout=%s",
            len(hotel_ids) if isinstance(hotel_ids, list) else "?",
            payload.get("checkin"),
            payload.get("checkout"),
        )
        return self._request(
            "POST",
            self.cfg.search_base,
            "/hotels/rates",
            json_body=payload,
            timeout=float(payload.get("timeout") or self.cfg.timeout_s) + 2.0,
        )

    def hotels_min_rates(self, body: Dict[str, Any], *, timeout: Optional[float] = None) -> Any:
        payload = {
            "currency": self.cfg.currency,
            "guestNationality": self.cfg.guest_nationality,
            "timeout": int(timeout or self.cfg.timeout_s),
            **body,
        }
        return self._request(
            "POST",
            self.cfg.search_base,
            "/hotels/min-rates",
            json_body=payload,
            timeout=float(payload.get("timeout") or self.cfg.timeout_s) + 2.0,
        )

    # --- Booking ---

    def prebook(self, offer_id: str, *, use_payment_sdk: bool = True) -> Any:
        return self._request(
            "POST",
            self.cfg.book_base,
            "/rates/prebook",
            json_body={"offerId": offer_id, "usePaymentSdk": use_payment_sdk},
            retry=False,
        )

    def book(self, body: Dict[str, Any]) -> Any:
        return self._request(
            "POST",
            self.cfg.book_base,
            "/rates/book",
            json_body=body,
            retry=False,
        )


def get_liteapi_client(cfg: Optional[DealsConfig] = None) -> LiteApiClient:
    return LiteApiClient(cfg=cfg)
