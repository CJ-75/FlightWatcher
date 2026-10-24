"""Unit tests for deal calendar / min-rates helpers (no network)."""
from __future__ import annotations

import unittest

from deals.calendar import (
    build_calendar_cells,
    cheapest_min_rate,
    parse_min_rate_entry,
    parse_min_rates_response,
)


class TestParseMinRates(unittest.TestCase):
    def test_object_shape(self):
        row = parse_min_rate_entry(
            {
                "hotelId": "H1",
                "price": 100,
                "suggestedSellingPrice": 110,
                "offerId": "O1",
            }
        )
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["hotel_id"], "H1")
        self.assertEqual(row["public_hotel_price"], 110.0)
        self.assertEqual(row["offer_id"], "O1")

    def test_array_money(self):
        row = parse_min_rate_entry(
            {
                "hotelId": "H2",
                "price": [{"amount": 90}],
                "suggestedSellingPrice": [{"amount": 95, "source": "booking.com"}],
            }
        )
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["public_hotel_price"], 95.0)

    def test_response_wrapper(self):
        raw = {
            "data": [
                {"hotelId": "A", "price": 80, "suggestedSellingPrice": 80},
                {"hotelId": "B", "price": 70, "suggestedSellingPrice": 75},
            ]
        }
        entries = parse_min_rates_response(raw)
        self.assertEqual(len(entries), 2)
        best = cheapest_min_rate(entries)
        assert best is not None
        # public: A=80, B=75 → B cheapest
        self.assertEqual(best["hotel_id"], "B")


class TestBuildCells(unittest.TestCase):
    def test_price_pp(self):
        windows = [
            {
                "id": "2026-W44-FRI_SUN",
                "kind": "FRI_SUN",
                "checkin": "2026-10-30",
                "checkout": "2026-11-01",
                "nights": 2,
            }
        ]
        cells = build_calendar_cells(
            windows=windows,
            min_by_window={
                "2026-W44-FRI_SUN": {
                    "hotel_id": "H1",
                    "public_hotel_price": 200.0,
                }
            },
            flight_pp_by_window={"2026-W44-FRI_SUN": 50.0},
            adults=2,
        )
        self.assertEqual(len(cells), 1)
        self.assertEqual(cells[0]["status"], "ok")
        # 50 + 200/2 = 150
        self.assertEqual(cells[0]["price_pp"], 150.0)

    def test_solo_adults(self):
        windows = [
            {
                "id": "w1",
                "kind": "FRI_SUN",
                "checkin": "2026-10-30",
                "checkout": "2026-11-01",
                "nights": 2,
            }
        ]
        cells = build_calendar_cells(
            windows=windows,
            min_by_window={"w1": {"hotel_id": "H", "public_hotel_price": 100.0}},
            flight_pp_by_window={"w1": 40.0},
            adults=1,
        )
        self.assertEqual(cells[0]["price_pp"], 140.0)

    def test_no_flight(self):
        windows = [
            {
                "id": "w1",
                "kind": "SAT_MON",
                "checkin": "2026-10-31",
                "checkout": "2026-11-02",
                "nights": 2,
            }
        ]
        cells = build_calendar_cells(
            windows=windows,
            min_by_window={"w1": {"hotel_id": "H", "public_hotel_price": 100.0}},
            flight_pp_by_window={"w1": None},
            adults=2,
        )
        self.assertEqual(cells[0]["status"], "no_flight")
        self.assertIsNone(cells[0]["price_pp"])


if __name__ == "__main__":
    unittest.main()
