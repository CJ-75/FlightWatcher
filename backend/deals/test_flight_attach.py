"""Unit tests: windows + §7 flight attachment (no network)."""
from __future__ import annotations

import unittest
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from deals.flight_attach import (
    attach_trip_to_window,
    estimate_arrival_local,
    pick_best_trip,
)
from deals.ttl import ttl_for_weekend
from deals.windows import build_window, canonical_windows, friday_on_or_after


def _trip(
    *,
    origin: str,
    dest: str,
    aller_dep: str,
    retour_dep: str,
    price: float,
    transfers: int = 0,
):
    return SimpleNamespace(
        aller=SimpleNamespace(
            origin=origin,
            destination=dest,
            departureTime=aller_dep,
            arrivalTime=None,
            price=price / 2,
        ),
        retour=SimpleNamespace(
            origin=dest,
            destination=origin,
            departureTime=retour_dep,
            price=price / 2,
        ),
        prix_total=price,
        destination_code=dest,
        transfers=transfers,
        provider="ryanair",
    )


class TestWindows(unittest.TestCase):
    def test_fri_sun(self):
        # Friday 2026-10-30
        w = build_window("FRI_SUN", date(2026, 10, 30))
        self.assertEqual(w["checkin"], "2026-10-30")
        self.assertEqual(w["checkout"], "2026-11-01")
        self.assertEqual(w["nights"], 2)
        self.assertIn("FRI_SUN", w["id"])

    def test_canonical_count(self):
        wins = canonical_windows(3, kinds=("FRI_SUN",), today=date(2026, 10, 24))
        self.assertEqual(len(wins), 3)
        for w in wins:
            self.assertEqual(w["kind"], "FRI_SUN")
            cin = date.fromisoformat(w["checkin"])
            self.assertEqual(cin.weekday(), 4)  # Friday

    def test_sat_mon_flag(self):
        wins = canonical_windows(
            2, kinds=("FRI_SUN", "SAT_MON"), today=date(2026, 10, 24)
        )
        kinds = {w["kind"] for w in wins}
        self.assertEqual(kinds, {"FRI_SUN", "SAT_MON"})
        self.assertEqual(len(wins), 4)

    def test_friday_on_or_after(self):
        self.assertEqual(friday_on_or_after(date(2026, 10, 24)), date(2026, 10, 30))


class TestArrivalEstimate(unittest.TestCase):
    def test_bva_lis_afternoon(self):
        # Depart BVA Friday 14:00 Paris → arrive Lisbon same afternoon
        arr = estimate_arrival_local(
            "2026-10-30T14:00:00",
            origin_iata="BVA",
            dest_iata="LIS",
            dest_timezone="Europe/Lisbon",
        )
        self.assertIsNotNone(arr)
        self.assertEqual(arr.tzinfo, ZoneInfo("Europe/Lisbon"))
        self.assertEqual(arr.date(), date(2026, 10, 30))
        self.assertGreaterEqual(arr.hour, 14)


class TestAttachRules(unittest.TestCase):
    def setUp(self):
        self.checkin = date(2026, 10, 30)  # Fri
        self.checkout = date(2026, 11, 1)  # Sun
        self.tz = "Europe/Lisbon"

    def test_ok_midday(self):
        # Explicit arrival via estimated path — midday dep should land afternoon
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T10:00:00",
            retour_dep="2026-11-01T16:00:00",
            price=80,
        )
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertTrue(att.ok, att.reason)
        self.assertFalse(att.late_arrival)
        self.assertFalse(att.late_departure)

    def test_exclude_early_morning_arrival(self):
        # Force arrival via arrivalTime field at 03:00 dest local
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T01:00:00",
            retour_dep="2026-11-01T12:00:00",
            price=60,
        )
        trip.aller.arrivalTime = "2026-10-30T03:00:00"
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertFalse(att.ok)
        self.assertEqual(att.reason, "arrival_too_early")

    def test_late_arrival_flag(self):
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T20:00:00",
            retour_dep="2026-11-01T12:00:00",
            price=70,
        )
        trip.aller.arrivalTime = "2026-10-30T22:30:00"
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertTrue(att.ok, att.reason)
        self.assertTrue(att.late_arrival)

    def test_late_departure_flag(self):
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T10:00:00",
            retour_dep="2026-11-01T19:30:00",
            price=70,
        )
        trip.aller.arrivalTime = "2026-10-30T12:00:00"
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertTrue(att.ok, att.reason)
        self.assertTrue(att.late_departure)

    def test_wrong_checkin_date(self):
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-31T10:00:00",
            retour_dep="2026-11-01T12:00:00",
            price=70,
        )
        trip.aller.arrivalTime = "2026-10-31T12:00:00"
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertFalse(att.ok)
        self.assertIn("arrival_date_mismatch", att.reason)

    def test_wrong_return_date(self):
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T10:00:00",
            retour_dep="2026-11-02T12:00:00",
            price=70,
        )
        trip.aller.arrivalTime = "2026-10-30T12:00:00"
        att = attach_trip_to_window(
            trip, checkin=self.checkin, checkout=self.checkout, dest_timezone=self.tz
        )
        self.assertFalse(att.ok)
        self.assertIn("return_date_mismatch", att.reason)


class TestPickBest(unittest.TestCase):
    def test_prefer_direct_within_10pct(self):
        checkin = date(2026, 10, 30)
        checkout = date(2026, 11, 1)
        cheap_indirect = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T09:00:00",
            retour_dep="2026-11-01T14:00:00",
            price=100,
            transfers=1,
        )
        cheap_indirect.aller.arrivalTime = "2026-10-30T11:00:00"
        direct = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T10:00:00",
            retour_dep="2026-11-01T15:00:00",
            price=108,  # within 10% of 100
            transfers=0,
        )
        direct.aller.arrivalTime = "2026-10-30T12:00:00"
        best = pick_best_trip(
            [cheap_indirect, direct],
            checkin=checkin,
            checkout=checkout,
            dest_timezone="Europe/Lisbon",
            budget_pp=150,
        )
        self.assertIsNotNone(best)
        self.assertEqual(best[0].transfers, 0)

    def test_over_budget_excluded(self):
        trip = _trip(
            origin="BVA",
            dest="LIS",
            aller_dep="2026-10-30T10:00:00",
            retour_dep="2026-11-01T14:00:00",
            price=200,
        )
        trip.aller.arrivalTime = "2026-10-30T12:00:00"
        best = pick_best_trip(
            [trip],
            checkin=date(2026, 10, 30),
            checkout=date(2026, 11, 1),
            dest_timezone="Europe/Lisbon",
            budget_pp=150,
        )
        self.assertIsNone(best)


class TestTtl(unittest.TestCase):
    def test_near(self):
        today = date(2026, 10, 24)
        near = today  # J-0
        self.assertEqual(ttl_for_weekend(near, now=datetime(2026, 10, 24)).total_seconds(), 2.5 * 3600)

    def test_far(self):
        far = date(2026, 12, 1)
        self.assertEqual(
            ttl_for_weekend(far, now=datetime(2026, 10, 24)).total_seconds(), 12 * 3600
        )


if __name__ == "__main__":
    unittest.main()
