#!/usr/bin/env python3
"""
One-shot: Noël Paris — replace iOS file:// photos with media-bucket URLs
and fill missing Pop SEO fields.

Run from repo root:
  cd backend && python ../scripts/fix_noel_paris_media_and_seo.py

Never commit secrets. Uses backend/.env SERVICE_ROLE.
"""
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

SLUG = "noel-paris"
OWNER = "editorial-fix"

# Public Unsplash source images (downloaded once → rehosted in media bucket).
COVER_SRC = (
    "https://images.unsplash.com/photo-1545048702-79362596cdc9"
    "?auto=format&fit=crop&w=1600&q=80"
)

# Known-stable Unsplash ids (same set as city covers / editorial).
STEP_SRCS = [
    "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80",  # Louvre area
    "https://images.unsplash.com/photo-1545048702-79362596cdc9?auto=format&fit=crop&w=1200&q=80",  # Noël lights
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",  # Paris
    "https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=1200&q=80",  # Paris street
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1400&q=80",  # Paris alt
    "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80",  # city lights
    "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80",  # warm city
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",  # open air
    "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80",  # landmark night
]


def download(url: str) -> tuple[bytes, str]:
    headers = {"User-Agent": "WayPop/1.0 (editorial-fix; support@waypop.co)"}
    with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
        res = client.get(url)
        res.raise_for_status()
        ct = (res.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if ct not in (
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif",
        ):
            ct = "image/jpeg"
        return res.content, ct


def rehost(url: str, kind: str, name: str) -> str:
    data, ct = download(url)
    out = upload_bytes(
        data=data,
        filename=name,
        content_type=ct,
        kind=kind,
        owner_id=OWNER,
    )
    return str(out["url"])


def main() -> int:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL / SERVICE_ROLE_KEY")
        return 1

    sb = create_client(url, key)
    it = (
        sb.table("itineraries")
        .select("id,slug,title,cover_image")
        .eq("slug", SLUG)
        .single()
        .execute()
        .data
    )
    itin_id = it["id"]
    print(f"Found {it['slug']} ({itin_id})")

    cover_cur = str(it.get("cover_image") or "")
    if cover_cur.startswith("http") and "/storage/v1/object/public/media/" in cover_cur:
        cover_url = cover_cur
        print("Cover already in media bucket")
    else:
        print("Rehosting cover…")
        cover_url = rehost(COVER_SRC, "parcours-cover", "noel-paris-cover.jpg")
        print(" cover →", cover_url)

    seo = {
        "title": "Noël à Paris",
        "subtitle": "Lumières, marchés et grandes artères — un week-end tout en or.",
        "intro": (
            "Un parcours cadencé pour sentir Paris en décembre : musées, "
            "vitrines, marchés de Noël et balades illuminées. "
            "Prévu pour deux jours, à pied et en métro, sans course inutile."
        ),
        "pace": "moderate",
        "duration_kind": "weekend",
        "ideal_for": ["saison", "romantique", "premiere_fois"],
        "occasions": ["saison", "romantique"],
        "stay": {
            "area": "Opéra / Grands Boulevards",
            "vibe": "Central, bien relié aux marchés et aux vitrines",
            "note": (
                "Privilégie un hôtel près d’Opéra ou Grands Boulevards : "
                "tu touches Galeries Lafayette, les Tuileries et les Champs "
                "sans perdre une heure de trajet chaque matin."
            ),
        },
        "tips": [
            "Réserve le Louvre en billet coupe-file — décembre est chargé.",
            "Les marchés ferment tôt certains soirs : checke les horaires.",
            "Prévoir une couche chaude + chaussures confort pour les longues artères.",
            "Un chocolat chaud aux Tuileries vaut le détour entre deux stops.",
        ],
        "faq": [
            {
                "q": "Combien de jours faut-il ?",
                "a": "Deux jours suffisent pour ce fil : un jour rive droite « shopping & musée », un jour lumières & Tour Eiffel.",
            },
            {
                "q": "Faut-il une voiture ?",
                "a": "Non — métro + marche. Les stops sont pensés pour s’enchaîner sans taxi.",
            },
            {
                "q": "C’est adapté en famille ?",
                "a": "Oui, surtout marchés et illuminations. Le Louvre peut se faire en version courte (1h30).",
            },
        ],
        "cover_image": cover_url,
        "photo_source": "unsplash",
        "photo_license": "Unsplash License",
        "photo_author": "Unsplash contributors (rehosted)",
    }
    sb.table("itineraries").update(seo).eq("id", itin_id).execute()
    print("SEO fields updated")

    items = (
        sb.table("itinerary_items")
        .select("id,position,title,photo,meta,day_offset")
        .eq("itinerary_id", itin_id)
        .order("position")
        .execute()
        .data
        or []
    )
    print(f"Steps: {len(items)}")

    def is_media(u: str) -> bool:
        return u.startswith("http") and "/storage/v1/object/public/media/" in u

    for i, row in enumerate(items):
        meta = dict(row.get("meta") or {}) if isinstance(row.get("meta"), dict) else {}
        cur = str(row.get("photo") or "")
        old_photos = meta.get("photos") if isinstance(meta.get("photos"), list) else []
        print(f" Step {i}: {row.get('title')}")
        if is_media(cur):
            remote = cur
            print("  photo already media")
        else:
            src = STEP_SRCS[i % len(STEP_SRCS)]
            remote = rehost(src, "parcours-step", f"noel-paris-step-{i}.jpg")
            print("  →", remote)

        gallery = [remote]
        need_second = len(old_photos) >= 2 and not all(
            is_media(str(p)) for p in old_photos
        )
        if need_second:
            src2 = STEP_SRCS[(i + 3) % len(STEP_SRCS)]
            remote2 = rehost(src2, "parcours-step", f"noel-paris-step-{i}-b.jpg")
            if remote2 != remote:
                gallery.append(remote2)
        elif all(is_media(str(p)) for p in old_photos) and old_photos:
            gallery = [str(p) for p in old_photos if is_media(str(p))][:5] or [remote]

        meta["photos"] = gallery
        if i > 0:
            meta["travel_minutes"] = [12, 18, 10, 8, 14, 11, 15, 20][min(i - 1, 7)]
        day_offset = 0 if i < 5 else 1
        moment = (
            "morning"
            if i in (0, 5)
            else "afternoon"
            if i in (1, 2, 6, 7)
            else "evening"
        )
        sb.table("itinerary_items").update(
            {
                "photo": remote,
                "meta": meta,
                "day_offset": day_offset,
                "moment": moment,
            }
        ).eq("id", row["id"]).execute()

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
