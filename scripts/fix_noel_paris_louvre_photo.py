#!/usr/bin/env python3
"""Give Musée du Louvre a unique media photo (was same URL as cover → hidden by exclusive pick)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / "backend" / ".env")

from media_storage import upload_bytes  # noqa: E402

# Distinct from cover (Noël lights) — Louvre pyramid exterior.
LOUVRE_SRC = (
    "https://images.unsplash.com/photo-1499856871958-5b9627545d1a"
    "?auto=format&fit=crop&w=1200&q=80"
)


def download(url: str) -> tuple[bytes, str]:
    headers = {"User-Agent": "WayPop/1.0 (editorial-fix; support@waypop.co)"}
    with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
        res = client.get(url)
        res.raise_for_status()
        ct = (res.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if ct not in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"):
            ct = "image/jpeg"
        return res.content, ct


def main() -> int:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL / SERVICE_ROLE_KEY")
        return 1

    sb = create_client(url, key)
    it = (
        sb.table("itineraries")
        .select("id,cover_image")
        .eq("slug", "noel-paris")
        .single()
        .execute()
        .data
    )
    cover = str(it.get("cover_image") or "")
    items = (
        sb.table("itinerary_items")
        .select("id,title,photo,meta,position")
        .eq("itinerary_id", it["id"])
        .order("position")
        .execute()
        .data
        or []
    )
    louvre = next((r for r in items if "Louvre" in str(r.get("title") or "")), None)
    if not louvre:
        print("Louvre step not found")
        return 1

    if louvre.get("photo") and louvre["photo"] != cover:
        print("Louvre already unique:", louvre["photo"])
        return 0

    print("Rehosting Louvre photo…")
    data, ct = download(LOUVRE_SRC)
    out = upload_bytes(
        data=data,
        filename="noel-paris-louvre.jpg",
        content_type=ct,
        kind="parcours-step",
        owner_id="editorial-fix",
    )
    remote = str(out["url"])
    if remote == cover:
        print("ERROR: rehost collided with cover")
        return 1

    meta = dict(louvre.get("meta") or {}) if isinstance(louvre.get("meta"), dict) else {}
    photos = meta.get("photos") if isinstance(meta.get("photos"), list) else []
    meta["photos"] = [remote] + [p for p in photos if p and p != cover and p != louvre.get("photo")]
    sb.table("itinerary_items").update({"photo": remote, "meta": meta}).eq(
        "id", louvre["id"]
    ).execute()
    print("Louvre →", remote)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
