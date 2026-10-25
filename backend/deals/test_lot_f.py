"""Lot F — partner wording helpers + draft payload merge (unit)."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from deals.my_trips import mark_flight_booked, mark_hotel_booked, send_draft_email


class TestLotF(unittest.TestCase):
    def test_consent_required(self):
        sb = MagicMock()
        out = send_draft_email(sb, "tok", email="a@b.com", consent=False)
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"], "consent_required")

    def test_invalid_email(self):
        sb = MagicMock()
        out = send_draft_email(sb, "tok", email="nope", consent=True)
        self.assertEqual(out["error"], "invalid_email")

    def test_mark_flight_booked(self):
        sb = MagicMock()
        row = {
            "id": "1",
            "draft_token": "tok",
            "status": "draft",
            "payload": {"city": "Rome"},
        }
        # get_draft path
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[row]
        )
        sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{**row, "flight_booked_at": "2026-10-24T12:00:00+00:00"}]
        )
        with patch("deals.my_trips.get_draft", return_value=row):
            out = mark_flight_booked(sb, "tok")
        self.assertIsNotNone(out)
        # update called with flight_booked in payload
        self.assertTrue(sb.table.return_value.update.called)

    def test_mark_hotel_booked(self):
        sb = MagicMock()
        row = {
            "id": "1",
            "draft_token": "tok",
            "status": "draft",
            "payload": {"city": "Rome"},
        }
        sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{**row, "hotel_booked_at": "2026-10-25T12:00:00+00:00"}]
        )
        with patch("deals.my_trips.get_draft", return_value=row):
            out = mark_hotel_booked(
                sb,
                "tok",
                booking_id="hb1",
                confirmation_code="ABC123",
                holder_email="a@b.com",
            )
        self.assertIsNotNone(out)
        self.assertTrue(sb.table.return_value.update.called)


if __name__ == "__main__":
    unittest.main()
