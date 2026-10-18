"""Build packages/shared/src/cityImages.ts from Wikipedia thumbnails JSON."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "src" / "_city_thumbs_raw.json"
OUT = ROOT / "src" / "cityImages.ts"
UA = "FlightWatcherCityImages/1.0 (local catalog build)"

FALLBACKS = [
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1523531294919-4ddd7d7296e3?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551632436-cbf8dd35ad1d?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1499853387-4b3839150cba?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop",
]

FALLBACK_CITY_IMAGE = (
    "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80&auto=format&fit=crop"
)


def fetch(title: str, lang: str = "en") -> str | None:
    enc = urllib.parse.quote(title, safe="")
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{enc}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as r:
        data = json.loads(r.read().decode("utf-8"))
    if data.get("type") == "disambiguation":
        return None
    thumb = (data.get("thumbnail") or {}).get("source")
    if not thumb:
        return None
    import re
    from urllib.parse import urlparse, urlunparse

    # Keep Wikimedia's allowed width (REST summary uses 330px).
    thumb = re.sub(r"/\d+px-", "/330px-", thumb)
    return urlunparse(urlparse(thumb)._replace(query=""))


def main() -> None:
    data = json.loads(RAW.read_text(encoding="utf-8"))
    images: dict[str, str] = dict(data.get("images") or {})

    if "split" not in images:
        for title, lang in (
            ("Split, Croatia", "en"),
            ("Split", "hr"),
            ("Palace of Diocletian", "en"),
        ):
            try:
                got = fetch(title, lang)
            except Exception:
                got = None
            if got:
                images["split"] = got
                print("OK split", got[:90])
                break
            time.sleep(0.1)

    # Extra EN/FR aliases → existing keys
    aliases = {
        "copenhagen": "copenhague",
        "brussels": "bruxelles",
        "geneva": "geneve",
        "basel": "bale",
        "hamburg": "hambourg",
        "frankfurt": "francfort",
        "gothenburg": "goteborg",
        "bucharest": "bucarest",
        "thessaloniki": "thessalonique",
        "chania": "la canee",
        "corfu": "corfou",
        "santorini": "santorin",
        "zakynthos": "zante",
        "kefalonia": "cephalonie",
        "menorca": "minorque",
        "gran canaria": "grande canarie",
        "las palmas": "grande canarie",
        "bergamo": "bergame",
        "genoa": "genes",
        "palermo": "palerme",
        "catania": "catane",
        "bologna": "bologne",
        "pisa": "pise",
        "marrakesh": "marrakech",
        "tangier": "tanger",
        "fez": "fes",
        "valletta": "malte",
        "cracow": "cracovie",
        "praha": "prague",
        "wien": "vienne",
        "munchen": "munich",
        "koln": "cologne",
        "firenze": "florence",
        "venezia": "venise",
        "sevilla": "seville",
        "valencia": "valence",
        "lisbon": "lisbonne",
        "london": "londres",
        "barcelona": "barcelone",
        "rome": "rome",
        "roma": "rome",
        "milan": "milan",
        "milano": "milan",
        "naples": "naples",
        "napoli": "naples",
        "venice": "venise",
        "florence": "florence",
        "athens": "athenes",
        "vienna": "vienne",
        "edinburgh": "edimbourg",
        "krakow": "cracovie",
        "warsaw": "varsovie",
        "seville": "seville",
        "malaga": "malaga",
        "dublin": "dublin",
        "porto": "porto",
        "nice": "nice",
        "marseille": "marseille",
        "lyon": "lyon",
        "bordeaux": "bordeaux",
        "toulouse": "toulouse",
        "nantes": "nantes",
        "biarritz": "biarritz",
        "paris": "paris",
        "madrid": "madrid",
        "amsterdam": "amsterdam",
        "berlin": "berlin",
        "munich": "munich",
        "prague": "prague",
        "budapest": "budapest",
        "stockholm": "stockholm",
        "oslo": "oslo",
        "helsinki": "helsinki",
        "zurich": "zurich",
        "dublin": "dublin",
        "reykjavik": "reykjavik",
        "dubrovnik": "dubrovnik",
        "zagreb": "zagreb",
        "belgrade": "belgrade",
        "tirana": "tirana",
        "bratislava": "bratislava",
        "ljubljana": "ljubljana",
        "sofia": "sofia",
        "malte": "malte",
        "malta": "malte",
        "ibiza": "ibiza",
        "tenerife": "tenerife",
        "palma": "palma",
        "alicante": "alicante",
        "agadir": "agadir",
        "casablanca": "casablanca",
        "marrakech": "marrakech",
        "glasgow": "glasgow",
        "manchester": "manchester",
        "birmingham": "birmingham",
        "bristol": "bristol",
        "belfast": "belfast",
        "cork": "cork",
        "charleroi": "charleroi",
        "salzburg": "salzbourg",
        "salzbourg": "salzbourg",
        "dusseldorf": "dusseldorf",
        "hanover": "hanovre",
        "hannover": "hanovre",
        "dresden": "dresde",
        "bremen": "breme",
        "ancona": "ancone",
        "cagliari": "cagliari",
        "bari": "bari",
        "brindisi": "brindisi",
        "alghero": "alghero",
        "rhodes": "rhodes",
        "kos": "kos",
        "mykonos": "mykonos",
        "heraklion": "heraklion",
        "gdansk": "gdansk",
        "wroclaw": "wroclaw",
        "lanzarote": "lanzarote",
        "fuerteventura": "fuerteventura",
        "faro": "faro",
        "turin": "turin",
        "split": "split",
    }
    for alias, src in aliases.items():
        if alias not in images and src in images:
            images[alias] = images[src]

    lines = [
        "/** Auto-curated city hero images (Wikimedia Commons thumbnails). */",
        "/* Generated by scripts/build_city_images.py — re-run to refresh. */",
        "export const CITY_IMAGES: Record<string, string> = {",
    ]
    for key in sorted(images.keys()):
        lines.append(f"  {json.dumps(key)}: {json.dumps(images[key])},")
    lines.append("}")
    lines.append("")
    lines.append(f"export const FALLBACK_CITY_IMAGE = {json.dumps(FALLBACK_CITY_IMAGE)}")
    lines.append("")
    lines.append("/** Varied travel photos when a city has no curated image. */")
    lines.append("export const FALLBACK_CITY_IMAGES: readonly string[] = [")
    for u in FALLBACKS:
        lines.append(f"  {json.dumps(u)},")
    lines.append("]")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    data["images"] = images
    RAW.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(images)} keys)")


if __name__ == "__main__":
    main()
