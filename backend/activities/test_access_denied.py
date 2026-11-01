"""Access denial semantics without live Supabase."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from fastapi import HTTPException

from activities.access import assert_can_mutate_item, resolve_owner_for_write


class TestDraftTokenRequired(unittest.TestCase):
    def test_patch_without_token_on_draft_item(self):
        sb = MagicMock()
        req = MagicMock()
        item = {"id": "1", "draft_id": "draft-uuid", "planned_trip_id": None}
        with self.assertRaises(HTTPException) as ctx:
            assert_can_mutate_item(sb, req, item, draft_token=None)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_resolve_requires_exactly_one(self):
        sb = MagicMock()
        req = MagicMock()
        with self.assertRaises(HTTPException) as ctx:
            resolve_owner_for_write(sb, req, draft_token=None, planned_trip_id=None)
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException) as ctx2:
            resolve_owner_for_write(
                sb, req, draft_token="tok", planned_trip_id="trip"
            )
        self.assertEqual(ctx2.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
