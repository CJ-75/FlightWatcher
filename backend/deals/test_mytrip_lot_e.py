"""Lot E — party price rules, carrier resolve mirror, trip events, funnel."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from deals.launch_metrics import collect_my_trip_funnel
from deals.my_trips import ALLOWED_TRIP_EVENTS, record_trip_event


def _euro(n: float) -> int:
    """Match JS Math.round for positive euros (half-up, not banker's round)."""
    x = float(n or 0)
    return int(x + 0.5) if x >= 0 else int(x - 0.5)


def party_euros(*, adults: int, flight_pp: float, hotel_total: float):
    """Mirror shared computeTripPartyPrice (€ round components then sum)."""
    adults = max(1, min(6, int(adults or 1)))
    flight_pp_eur = _euro(flight_pp)
    hotel_pp_eur = _euro(float(hotel_total or 0) / adults) if adults else 0
    flight_total = flight_pp_eur * adults
    hotel_eur = hotel_pp_eur * adults
    per_person = flight_pp_eur + hotel_pp_eur
    total = per_person * adults
    return {
        "adults": adults,
        "flight_pp_eur": flight_pp_eur,
        "flight_total_eur": flight_total,
        "hotel_pp_eur": hotel_pp_eur,
        "hotel_total_eur": hotel_eur,
        "total_eur": total,
        "per_person_eur": per_person,
    }


def board_label_fr(board: str | None) -> str | None:
    if not board:
        return None
    raw = str(board).strip()
    b = raw.upper()
    if b == "RO" or "room only" in raw.lower() or "chambre seule" in raw.lower():
        return "Chambre seule"
    if b == "BI" or "breakfast" in raw.lower() or "petit" in raw.lower():
        return "Petit-déjeuner inclus"
    if len(b) == 2 and b.isalpha():
        return None
    return raw


class PartyPriceTests(unittest.TestCase):
    def test_solo_no_half_person_math(self):
        p = party_euros(adults=1, flight_pp=67.6, hotel_total=177.4)
        self.assertEqual(p["flight_pp_eur"], 68)
        self.assertEqual(p["hotel_total_eur"], 177)
        self.assertEqual(p["flight_total_eur"], 68)
        self.assertEqual(p["total_eur"], 245)
        self.assertEqual(p["per_person_eur"], 245)
        self.assertEqual(p["flight_total_eur"] + p["hotel_total_eur"], p["total_eur"])

    def test_duo_components_sum(self):
        p = party_euros(adults=2, flight_pp=68, hotel_total=434)
        self.assertEqual(p["flight_total_eur"], 136)
        self.assertEqual(p["hotel_pp_eur"], 217)
        self.assertEqual(p["total_eur"], 570)
        self.assertEqual(p["per_person_eur"], 285)
        self.assertEqual(p["per_person_eur"] * 2, p["total_eur"])

    def test_duo_odd_hotel_stays_euro_exact(self):
        """Odd hotel totals must not break perPerson × adults === total."""
        p = party_euros(adults=2, flight_pp=50, hotel_total=101)
        self.assertEqual(p["hotel_pp_eur"], 51)
        self.assertEqual(p["hotel_total_eur"], 102)
        self.assertEqual(p["per_person_eur"], 101)
        self.assertEqual(p["total_eur"], 202)
        self.assertEqual(
            p["flight_pp_eur"] + p["hotel_pp_eur"], p["per_person_eur"]
        )
        self.assertEqual(p["per_person_eur"] * 2, p["total_eur"])

    def test_four_pax(self):
        p = party_euros(adults=4, flight_pp=50.4, hotel_total=199.6)
        self.assertEqual(p["flight_pp_eur"], 50)
        self.assertEqual(p["hotel_pp_eur"], 50)
        self.assertEqual(p["hotel_total_eur"], 200)
        self.assertEqual(p["flight_total_eur"], 200)
        self.assertEqual(p["total_eur"], 400)
        self.assertEqual(p["per_person_eur"], 100)
        self.assertEqual(p["per_person_eur"] * 4, p["total_eur"])


class BoardLabelTests(unittest.TestCase):
    def test_never_raw_codes(self):
        self.assertEqual(board_label_fr("RO"), "Chambre seule")
        self.assertEqual(board_label_fr("BI"), "Petit-déjeuner inclus")
        self.assertIsNone(board_label_fr("FR"))
        self.assertIsNone(board_label_fr("XY"))


class TripEventTests(unittest.TestCase):
    def test_allowed_events(self):
        self.assertIn("view", ALLOWED_TRIP_EVENTS)
        self.assertIn("hotel_paid", ALLOWED_TRIP_EVENTS)
        self.assertIn("account_cta", ALLOWED_TRIP_EVENTS)

    def test_record_rejects_bad_event(self):
        sb = MagicMock()
        with patch("deals.my_trips.get_draft", return_value={"id": "1"}):
            out = record_trip_event(sb, "tok", "hack")
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"], "invalid_event")

    def test_record_ok(self):
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"event": "view", "draft_token": "tok"}]
        )
        with patch("deals.my_trips.get_draft", return_value={"id": "1"}):
            out = record_trip_event(sb, "tok", "view")
        self.assertTrue(out["ok"])


class FunnelTests(unittest.TestCase):
    def test_collect_funnel_counts(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.gte.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {"event": "view", "draft_token": "a"},
                {"event": "view", "draft_token": "b"},
                {"event": "company_click", "draft_token": "a"},
                {"event": "hotel_paid", "draft_token": "a"},
            ]
        )
        out = collect_my_trip_funnel(sb, days=7)
        self.assertEqual(out["counts"]["view"], 2)
        self.assertEqual(out["counts"]["company_click"], 1)
        self.assertEqual(out["counts"]["hotel_paid"], 1)
        self.assertEqual(out["unique_drafts"], 2)
        self.assertEqual(out["view_to_paid_pct"], 50.0)


if __name__ == "__main__":
    unittest.main()
