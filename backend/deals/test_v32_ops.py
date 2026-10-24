"""v3.2 — job lock + email rate limit."""
from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from deals import email_rate_limit
from deals.email_rate_limit import check_and_record
from deals.job_lock import release_job_lock, try_acquire_job_lock
from deals.my_trips import send_draft_email


class TestEmailRateLimit(unittest.TestCase):
    def setUp(self):
        email_rate_limit.reset_for_tests()
        os.environ["MY_TRIP_EMAIL_PER_EMAIL_PER_HOUR"] = "2"
        os.environ["MY_TRIP_EMAIL_PER_DRAFT_PER_HOUR"] = "10"
        os.environ["MY_TRIP_EMAIL_GLOBAL_PER_HOUR"] = "100"

    def tearDown(self):
        email_rate_limit.reset_for_tests()
        for k in (
            "MY_TRIP_EMAIL_PER_EMAIL_PER_HOUR",
            "MY_TRIP_EMAIL_PER_DRAFT_PER_HOUR",
            "MY_TRIP_EMAIL_GLOBAL_PER_HOUR",
        ):
            os.environ.pop(k, None)

    def test_per_email_limit(self):
        self.assertIsNone(check_and_record("a@b.com", "d1"))
        self.assertIsNone(check_and_record("a@b.com", "d1"))
        self.assertEqual(check_and_record("a@b.com", "d1"), "email_rate_limited")

    def test_send_draft_email_rate_limited(self):
        sb = MagicMock()
        row = {
            "id": "1",
            "draft_token": "tok",
            "city_name": "Rome",
            "payload": {},
            "out_date": "2026-11-01",
            "ret_date": "2026-11-03",
        }
        with patch("deals.my_trips.get_draft", return_value=row):
            with patch("email_notify.send_my_trip_link", return_value=True):
                self.assertTrue(
                    send_draft_email(
                        sb, "tok", email="a@b.com", consent=True
                    )["ok"]
                )
                self.assertTrue(
                    send_draft_email(
                        sb, "tok", email="a@b.com", consent=True
                    )["ok"]
                )
                out = send_draft_email(
                    sb, "tok", email="a@b.com", consent=True
                )
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"], "email_rate_limited")


class TestJobLock(unittest.TestCase):
    def test_second_acquire_denied(self):
        sb = MagicMock()
        # First select (existing running): empty → insert succeeds
        empty = MagicMock(data=[])
        inserted = MagicMock(data=[{"id": "lock-1"}])
        held = MagicMock(data=[{"id": "lock-1", "started_at": "2026-10-24T12:00:00+00:00"}])

        table = sb.table.return_value
        # try_acquire #1: select empty, update stale, insert
        select_chain = table.select.return_value.eq.return_value.eq.return_value.gte.return_value.limit.return_value
        select_chain.execute.side_effect = [empty, held]

        table.update.return_value.eq.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock()
        table.insert.return_value.execute.return_value = inserted

        lid = try_acquire_job_lock(sb, "seed-scan")
        self.assertEqual(lid, "lock-1")

        # Second call: existing running found
        lid2 = try_acquire_job_lock(sb, "seed-scan")
        self.assertIsNone(lid2)

    def test_no_supabase_local_lock(self):
        self.assertEqual(try_acquire_job_lock(None, "x"), "local-x")
        release_job_lock(None, "local-x", status="ok")


if __name__ == "__main__":
    unittest.main()
