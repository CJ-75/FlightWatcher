"""Photo backfill for planner activity thumbs."""
from __future__ import annotations

from activities.trip_items import (
    _photo_from_payload,
    enrich_trip_items_photos,
)


def test_photo_from_payload_direct_and_photos_array():
    assert _photo_from_payload({"photo_url": " https://img/a.jpg "}) == "https://img/a.jpg"
    assert (
        _photo_from_payload({"photos": [{"url": "https://img/b.jpg", "thumb": "t"}]})
        == "https://img/b.jpg"
    )
    assert _photo_from_payload({"photos": ["https://img/c.jpg"]}) == "https://img/c.jpg"
    assert _photo_from_payload({}) is None


def test_enrich_copies_place_photo_onto_item_meta():
    items = [
        {
            "id": "ti-1",
            "meta": {"product_code": "P123"},
            "places": {
                "id": "pl-1",
                "meta": {"photo_url": "https://cdn/place.jpg"},
            },
        }
    ]
    updates = []

    class _Table:
        def __init__(self, name):
            self.name = name

        def update(self, payload):
            self.payload = payload
            return self

        def eq(self, *_a, **_k):
            updates.append((self.name, self.payload))
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class _Sb:
        def table(self, name):
            return _Table(name)

    out = enrich_trip_items_photos(_Sb(), items, allow_live=False)
    assert out[0]["meta"]["photo_url"] == "https://cdn/place.jpg"
    assert out[0]["places"]["meta"]["photo_url"] == "https://cdn/place.jpg"
    assert any(name == "trip_items" for name, _ in updates)


def test_enrich_skips_skip_codes_without_live():
    items = [{"id": "ti-2", "meta": {"product_code": "skip-123"}, "places": None}]
    out = enrich_trip_items_photos(None, items, allow_live=True)
    assert "photo_url" not in (out[0].get("meta") or {})
