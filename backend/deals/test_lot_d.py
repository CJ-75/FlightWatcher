"""Lot D — baggage lines, secondary airports, pax revalidate guards."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from deals.airport_display import (
    airport_differs_from_city,
    distance_label,
    enrich_route_labels,
)
from deals.baggage import (
    BAGGAGE_SEED,
    _normalize_carrier,
    format_baggage_line,
    lookup_baggage,
)
from deals.revalidate_flight import revalidate_flight_for_passengers
from deals.verification import LEVEL_CACHED, LEVEL_LIVE


class TestBaggage(unittest.TestCase):
    def test_normalize_carriers(self):
        self.assertEqual(_normalize_carrier("Ryanair"), "FR")
        self.assertEqual(_normalize_carrier("FR"), "FR")
        self.assertEqual(_normalize_carrier("easyJet"), "U2")
        self.assertEqual(_normalize_carrier("Wizz Air"), "W6")

    def test_format_line(self):
        line = format_baggage_line(
            {
                "included_text": "Petit sac inclus",
                "cabin_bag_text": "Cabine en option",
            }
        )
        self.assertIn("Petit sac", line)
        self.assertIn("Cabine", line)

    def test_lookup_fallback_seed(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        got = lookup_baggage(sb, "FR")
        self.assertIn("inclus", got["line"].lower())
        self.assertTrue(any(r["carrier_code"] == "FR" for r in BAGGAGE_SEED))


class TestAirportDisplay(unittest.TestCase):
    def test_beauvais_differs_paris(self):
        self.assertTrue(airport_differs_from_city("Paris-Beauvais", "Paris"))
        self.assertFalse(airport_differs_from_city("Lisbonne", "Lisbonne"))

    def test_distance_threshold(self):
        self.assertIsNone(distance_label(18))
        self.assertIsNone(distance_label(25))
        self.assertEqual(distance_label(48), "à 48 km du centre")

    def test_route_hint_bva_bgy(self):
        labels = enrich_route_labels(
            origin_iata="BVA",
            dest_iata="BGY",
            city_name="Milan",
            origin_city="Paris",
            distance_km=48,
        )
        # Full names always (not raw IATA)
        self.assertEqual(labels["origin_airport_label"], "Paris-Beauvais")
        self.assertEqual(labels["arrival_airport_label"], "Milan-Bergame")
        self.assertIn("48 km", labels["distance_label"] or "")
        self.assertTrue(labels["route_hint"])
        self.assertIn("depuis", labels["route_hint"] or "")

    def test_same_city_airport_still_named(self):
        labels = enrich_route_labels(
            origin_iata="LIS",
            dest_iata="BCN",
            city_name="Barcelone",
            origin_city="Lisbonne",
            distance_km=10,
        )
        self.assertEqual(labels["origin_airport_label"], "Lisbonne")
        self.assertEqual(labels["arrival_airport_label"], "Barcelone El Prat")


class TestRevalidatePax(unittest.TestCase):
    def test_cached_skips_live_scan(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "deal_key": "X",
                    "verification_level": LEVEL_CACHED,
                    "flight_snapshot": {"price_pp_eur": 80},
                    "origin_iata": "BVA",
                    "dest_iata": "BGY",
                    "out_date": "2026-11-06",
                    "ret_date": "2026-11-08",
                }
            ]
        )
        out = revalidate_flight_for_passengers(sb, "X", adults=4)
        self.assertTrue(out["ok"])
        self.assertFalse(out["revalidated"])
        self.assertEqual(out["reason"], "cached_skip")
        self.assertIn("1–2", out.get("price_note") or "")

    def test_adults_le_2_no_scan(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "deal_key": "Y",
                    "verification_level": LEVEL_LIVE,
                    "flight_snapshot": {"price_pp_eur": 70},
                    "origin_iata": "ORY",
                    "dest_iata": "BCN",
                    "out_date": "2026-11-06",
                    "ret_date": "2026-11-08",
                }
            ]
        )
        out = revalidate_flight_for_passengers(sb, "Y", adults=2)
        self.assertTrue(out["ok"])
        self.assertFalse(out["revalidated"])
        self.assertEqual(out["reason"], "adults_le_2")


if __name__ == "__main__":
    unittest.main()
