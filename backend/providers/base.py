"""Common search contract for flight providers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Protocol, Tuple

from api_models import DateAvecHoraire, TripResponse


@dataclass
class SearchParams:
    aeroport_depart: str
    dates_depart: List[DateAvecHoraire]
    dates_retour: List[DateAvecHoraire]
    budget_max: int = 200
    limite_allers: int = 50
    destinations_exclues: Optional[List[str]] = None
    destinations_incluses: Optional[List[str]] = None
    passengers: int = 1
    direct: bool = False
    record_prices: bool = True


class FlightProvider(Protocol):
    name: str

    def search_roundtrips(self, params: SearchParams) -> Tuple[List[TripResponse], int]:
        """Return (trips, api_query_count)."""
        ...
