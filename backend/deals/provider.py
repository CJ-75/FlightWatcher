"""Deal providers — mock today, LiteAPI (cache join) when DEALS_PROVIDER=liteapi."""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import List, Optional

from deals.liteapi_config import load_deals_config


def _next_weekend_pair(weeks_ahead: int = 1) -> tuple[str, str]:
    """Return (Saturday, Sunday) ISO dates for the Nth upcoming weekend (1 = next Sat)."""
    today = date.today()
    days_until_sat = (5 - today.weekday()) % 7
    if days_until_sat == 0:
        days_until_sat = 7  # already Saturday → next week
    sat = today + timedelta(days=days_until_sat + 7 * (max(1, weeks_ahead) - 1))
    sun = sat + timedelta(days=1)
    return sat.isoformat(), sun.isoformat()


class DealProvider(ABC):
    @abstractmethod
    def list_deals(
        self,
        *,
        origin: Optional[str] = None,
        destination: Optional[str] = None,
        adults: Optional[int] = None,
        window: Optional[str] = None,
        max_pp: Optional[float] = None,
        limit: Optional[int] = None,
        occasion: Optional[str] = None,
    ) -> List[dict]:
        raise NotImplementedError

    @abstractmethod
    def get_deal(self, deal_id: str) -> Optional[dict]:
        raise NotImplementedError


class MockDealProvider(DealProvider):
    """Curated weekend vol+hôtel offers for UI development."""

    def __init__(self) -> None:
        self._deals = self._build_seed()

    def list_deals(
        self,
        *,
        origin: Optional[str] = None,
        destination: Optional[str] = None,
        adults: Optional[int] = None,
        window: Optional[str] = None,
        max_pp: Optional[float] = None,
        limit: Optional[int] = None,
        occasion: Optional[str] = None,
    ) -> List[dict]:
        deals = list(self._deals)
        if origin:
            origin_u = origin.strip().upper()
            deals = [d for d in deals if (d.get("departure_airport") or "").upper() == origin_u]
        if destination:
            dest_u = {
                p.strip().upper()
                for p in destination.replace(";", ",").split(",")
                if len(p.strip()) == 3
            }
            if dest_u:
                deals = [
                    d
                    for d in deals
                    if (d.get("destination") or "").upper() in dest_u
                ]
        if max_pp is not None:
            deals = [d for d in deals if float(d.get("price_per_person") or 0) <= float(max_pp)]
        if occasion:
            slug = occasion.strip().lower()
            deals = [
                d
                for d in deals
                if slug in [str(t).lower() for t in (d.get("occasion_tags") or [])]
            ]
        cap = max(1, min(int(limit or 36), 48))
        deals = deals[:cap]
        return deals

    def get_deal(self, deal_id: str) -> Optional[dict]:
        for deal in self._deals:
            if deal["id"] == deal_id or deal.get("deal_key") == deal_id:
                return deal
        return None

    def _build_seed(self) -> List[dict]:
        w1_out, w1_in = _next_weekend_pair(1)
        w2_out, w2_in = _next_weekend_pair(2)
        w3_out, w3_in = _next_weekend_pair(3)

        return [
            {
                "id": "mock-lisbonne-w1",
                "deal_key": "BVA-LIS-mock-w1-2",
                "title": "Week-end à Lisbonne",
                "city": "Lisbonne",
                "country": "Portugal",
                "image_url": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 189,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w1_out, "inbound": w1_in},
                "hotel_name": "Hotel Lisboa Central",
                "hotel_stars": 3,
                "board": "Petit-déjeuner",
                "highlights": ["Vol A/R", "Hôtel centre-ville", "Tram 28 à 5 min"],
                "description": (
                    "Deux nuits à Lisbonne avec vol depuis Beauvais. "
                    "Idéal pour flâner dans l’Alfama et goûter les pastéis de nata. "
                    "Deux réservations distinctes : vol via la compagnie, hôtel via FlightWatcher."
                ),
                "provider": "mock",
                "booking_url": "https://www.expedia.fr/Lisbon.d178307.Destination-Travel-Guides",
                "badge": "Week-end",
                "adults": 2,
            },
            {
                "id": "mock-barcelone-w1",
                "deal_key": "BVA-BCN-mock-w1-2",
                "title": "Escapade Barcelone",
                "city": "Barcelone",
                "country": "Espagne",
                "image_url": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 219,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w1_out, "inbound": w1_in},
                "hotel_name": "Hostal Barcelona Gothic",
                "hotel_stars": 3,
                "board": "Chambre seule",
                "highlights": ["Vol A/R", "Quartier gothique", "Plage à 20 min"],
                "description": (
                    "Week-end tapas et architecture moderniste. "
                    "Hôtel cosy près de la Rambla, vol aller-retour inclus. "
                    "Deux réservations distinctes."
                ),
                "provider": "mock",
                "booking_url": "https://www.expedia.fr/Barcelona.d178238.Destination-Travel-Guides",
                "badge": "Week-end",
                "adults": 2,
            },
            {
                "id": "mock-rome-w2",
                "deal_key": "BVA-CIA-mock-w2-2",
                "title": "Rome express",
                "city": "Rome",
                "country": "Italie",
                "image_url": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 249,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w2_out, "inbound": w2_in},
                "hotel_name": "Hotel Trastevere View",
                "hotel_stars": 4,
                "board": "Petit-déjeuner",
                "highlights": ["Vol A/R", "Vue sur le Tibre", "Colisée à 25 min"],
                "description": (
                    "Deux jours pour voir la Ville éternelle sans se presser. "
                    "Vol + hôtel 4★ avec petit-déjeuner. Deux réservations distinctes."
                ),
                "provider": "mock",
                "booking_url": "https://www.expedia.fr/Rome.d179899.Destination-Travel-Guides",
                "badge": "Week-end",
                "adults": 2,
            },
            {
                "id": "mock-porto-w2",
                "deal_key": "MRS-OPO-mock-w2-2",
                "title": "Porto & porto",
                "city": "Porto",
                "country": "Portugal",
                "image_url": "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 175,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "MRS",
                "origin_iata": "MRS",
                "dates": {"outbound": w2_out, "inbound": w2_in},
                "hotel_name": "Casa Ribeira",
                "hotel_stars": 3,
                "board": "Petit-déjeuner",
                "highlights": ["Départ Marseille", "Ribeira UNESCO", "Dégustation incluse"],
                "description": (
                    "Week-end gourmand au bord du Douro. "
                    "Vol depuis Marseille et hôtel dans le centre historique."
                ),
                "provider": "mock",
                "booking_url": "https://www.lastminute.com/vacances/portugal/porto",
                "badge": "Week-end",
                "adults": 2,
            },
            {
                "id": "mock-budapest-w2",
                "deal_key": "BVA-BUD-mock-w2-2",
                "title": "Budapest thermal",
                "city": "Budapest",
                "country": "Hongrie",
                "image_url": "https://images.unsplash.com/photo-1541343672885-9be56236302a?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 199,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w2_out, "inbound": w2_in},
                "hotel_name": "Danube Spa Hotel",
                "hotel_stars": 4,
                "board": "Petit-déjeuner",
                "highlights": ["Vol A/R", "Accès spa", "Vue Danube"],
                "description": (
                    "Bains thermaux et ruin bars : le combo parfait pour un week-end "
                    "détente à petit prix."
                ),
                "provider": "mock",
                "booking_url": "https://www.expedia.fr/Budapest.d178279.Destination-Travel-Guides",
                "badge": "Bon plan",
                "adults": 2,
            },
            {
                "id": "mock-marrakech-w3",
                "deal_key": "ORY-RAK-mock-w3-2",
                "title": "Marrakech soleil",
                "city": "Marrakech",
                "country": "Maroc",
                "image_url": "https://images.unsplash.com/photo-1517824806704-9040b037703b?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 279,
                "currency": "EUR",
                "nights": 3,
                "departure_airport": "ORY",
                "origin_iata": "ORY",
                "dates": {
                    "outbound": w3_out,
                    "inbound": (date.fromisoformat(w3_out) + timedelta(days=3)).isoformat(),
                },
                "hotel_name": "Riad Atlas Medina",
                "hotel_stars": 4,
                "board": "Petit-déjeuner",
                "highlights": ["3 nuits", "Riad médina", "Vol A/R"],
                "description": (
                    "Trois nuits dans un riad au cœur de la médina. "
                    "Souks, place Jemaa el-Fna et rooftop au coucher du soleil."
                ),
                "provider": "mock",
                "booking_url": "https://www.lastminute.com/vacances/maroc/marrakech",
                "badge": "Week-end+",
                "adults": 2,
            },
            {
                "id": "mock-dublin-w3",
                "deal_key": "BVA-DUB-mock-w3-2",
                "title": "Dublin pub crawl",
                "city": "Dublin",
                "country": "Irlande",
                "image_url": "https://images.unsplash.com/photo-1549918864-48ac979795d9?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 229,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w3_out, "inbound": w3_in},
                "hotel_name": "Temple Bar Inn",
                "hotel_stars": 3,
                "board": "Chambre seule",
                "highlights": ["Vol A/R", "Temple Bar", "Guinness Storehouse proche"],
                "description": (
                    "Week-end irlandais classique : pubs, musique live et Guinness. "
                    "Hôtel dans le quartier animé de Temple Bar."
                ),
                "provider": "mock",
                "booking_url": "https://www.expedia.fr/Dublin.d178286.Destination-Travel-Guides",
                "badge": "Week-end",
                "adults": 2,
            },
            {
                "id": "mock-cracovie-w3",
                "deal_key": "BVA-KRK-mock-w3-2",
                "title": "Cracovie old town",
                "city": "Cracovie",
                "country": "Pologne",
                "image_url": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=900&q=80&auto=format&fit=crop",
                "price_per_person": 159,
                "currency": "EUR",
                "nights": 2,
                "departure_airport": "BVA",
                "origin_iata": "BVA",
                "dates": {"outbound": w3_out, "inbound": w3_in},
                "hotel_name": "Hotel Stare Miasto",
                "hotel_stars": 3,
                "board": "Petit-déjeuner",
                "highlights": ["Prix doux", "Vieille ville", "Vol A/R"],
                "description": (
                    "L’un des week-ends les plus abordables d’Europe centrale. "
                    "Place du Marché, châteaux et pierogi à volonté."
                ),
                "provider": "mock",
                "booking_url": "https://www.lastminute.com/vacances/pologne/cracovie",
                "badge": "Bon plan",
                "adults": 2,
            },
        ]


class LiteApiDealProvider(DealProvider):
    """
    Assembles TravelDeal from hotel_rates_cache × deal_flight_cache.
    Sync path: Supabase reads only — never calls LiteAPI.
    """

    def _supabase(self):
        from supabase_deps import (
            SUPABASE_AVAILABLE,
            get_supabase_client,
            get_supabase_service_client,
        )

        if not SUPABASE_AVAILABLE:
            return None
        return get_supabase_service_client() or get_supabase_client()

    def list_deals(
        self,
        *,
        origin: Optional[str] = None,
        destination: Optional[str] = None,
        adults: Optional[int] = None,
        window: Optional[str] = None,
        max_pp: Optional[float] = None,
        limit: Optional[int] = None,
        occasion: Optional[str] = None,
    ) -> List[dict]:
        from deals.deal_assemble import load_caches_and_assemble
        from deals.liteapi_config import load_deals_config

        supabase = self._supabase()
        if not supabase:
            return []
        cfg = load_deals_config()
        try:
            if cfg.is_community:
                from deals.community_list import list_community_deals

                community = list_community_deals(
                    supabase,
                    origin=origin,
                    destination=destination,
                    adults=adults,
                    max_pp=max_pp,
                    occasion=occasion,
                    limit=int(limit or 36),
                )
                if community:
                    return community
                if not cfg.legacy_fallback_enabled:
                    return []
                # Dev-only socle when flag true
            return load_caches_and_assemble(
                supabase,
                origin=origin,
                adults=adults,
                window=window,
                max_pp=max_pp,
            )
        except Exception as e:
            print(f"⚠️ LiteApiDealProvider.list_deals: {e}")
            return []

    def get_deal(self, deal_id: str) -> Optional[dict]:
        from deals.deal_assemble import get_deal_from_caches
        from deals.liteapi_config import load_deals_config

        supabase = self._supabase()
        if not supabase:
            return None
        cfg = load_deals_config()
        try:
            if cfg.is_community:
                from deals.community_list import get_community_deal

                deal = get_community_deal(supabase, deal_id)
                if deal:
                    return deal
            return get_deal_from_caches(supabase, deal_id)
        except Exception as e:
            print(f"⚠️ LiteApiDealProvider.get_deal: {e}")
            return None



class ExpediaDealProvider(DealProvider):
    """Placeholder — wire Rapid API when credentials are available."""

    def list_deals(self, **kwargs) -> List[dict]:
        raise NotImplementedError("Expedia provider not configured")

    def get_deal(self, deal_id: str) -> Optional[dict]:
        raise NotImplementedError("Expedia provider not configured")


class LastminuteDealProvider(DealProvider):
    """Placeholder — wire partner API when credentials are available."""

    def list_deals(self, **kwargs) -> List[dict]:
        raise NotImplementedError("Lastminute provider not configured")

    def get_deal(self, deal_id: str) -> Optional[dict]:
        raise NotImplementedError("Lastminute provider not configured")


_provider: Optional[DealProvider] = None


def reset_deal_provider() -> None:
    """Test helper."""
    global _provider
    _provider = None


def get_deal_provider() -> DealProvider:
    global _provider
    if _provider is not None:
        return _provider

    name = (os.getenv("DEALS_PROVIDER") or load_deals_config().provider or "mock").strip().lower()
    if name == "liteapi":
        _provider = LiteApiDealProvider()
    elif name == "expedia":
        _provider = ExpediaDealProvider()
    elif name == "lastminute":
        _provider = LastminuteDealProvider()
    else:
        _provider = MockDealProvider()
    return _provider
