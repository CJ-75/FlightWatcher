"""Unit tests for hotel gallery URL extraction."""
from __future__ import annotations

from deals.hotel_gallery import _extract_urls, photos_from_pool_raw


def test_extract_urls_hotel_images():
    payload = {
        "data": {
            "hotelImages": [
                {
                    "url": "https://cdn/a.jpg",
                    "thumbnailUrl": "https://cdn/a_t.jpg",
                    "caption": "Lobby",
                    "order": 2,
                    "defaultImage": False,
                },
                {
                    "url": "https://cdn/b.jpg",
                    "thumbnailUrl": "https://cdn/b_t.jpg",
                    "order": 1,
                    "defaultImage": True,
                },
                {"url": "https://cdn/a.jpg"},  # dup
            ]
        }
    }
    photos = _extract_urls(payload)
    assert len(photos) == 2
    assert photos[0]["url"] == "https://cdn/b.jpg"
    assert photos[0]["default"] is True
    assert photos[1]["caption"] == "Lobby"


def test_photos_from_pool_raw():
    raw = {
        "hotelImages": [{"url": "https://x/1.jpg"}, {"url": "https://x/2.jpg"}],
        "main_photo": "https://x/1.jpg",
    }
    urls = photos_from_pool_raw(raw)
    assert urls == ["https://x/1.jpg", "https://x/2.jpg"]
