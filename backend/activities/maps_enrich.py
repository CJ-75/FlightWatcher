"""
Enrichissement rapide d’un lien Google Maps pour le create parcours.
— Parse URL (déjà fait)
— Wikipedia FR/EN (summary) + Geoapify optionnel, en parallèle, timeouts courts
"""
from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx

from activities.restaurants_service import classify_bucket, geoapify_reverse_or_nearby

logger = logging.getLogger("activities.maps_enrich")

UA = "FlightWatcher/1.0 (parcours-maps-enrich; contact@flightwatcher.app)"
TIMEOUT = 2.2


def _first_sentence(text: str, max_len: int = 220) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t:
        return ""
    m = re.match(r"^(.{20,}?[.!?])(\s|$)", t)
    if m:
        t = m.group(1)
    if len(t) > max_len:
        t = t[: max_len - 1].rsplit(" ", 1)[0] + "…"
    return t


def _wiki_summary_by_title(title: str, lang: str = "fr") -> Optional[Dict[str, Any]]:
    if not title or len(title) < 2:
        return None
    try:
        url = (
            f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/"
            f"{quote(title.replace(' ', '_'), safe='')}"
        )
        r = httpx.get(
            url,
            headers={"User-Agent": UA, "Accept": "application/json"},
            timeout=TIMEOUT,
            follow_redirects=True,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("type") == "disambiguation":
            return None
        extract = (data.get("extract") or "").strip()
        if not extract:
            return None
        return {
            "title": data.get("title") or title,
            "description": data.get("description"),
            "extract": extract,
            "lang": lang,
            "source": f"wikipedia_{lang}",
        }
    except Exception as e:
        logger.debug("wiki summary %s: %s", title, e)
        return None


def _wiki_geosearch(
    lat: float, lng: float, lang: str = "fr"
) -> Optional[Dict[str, Any]]:
    try:
        r = httpx.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",
                "gsradius": 800,
                "gslimit": 1,
                "format": "json",
            },
            headers={"User-Agent": UA},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        hits = ((r.json().get("query") or {}).get("geosearch")) or []
        if not hits:
            return None
        title = hits[0].get("title")
        if not title:
            return None
        return _wiki_summary_by_title(title, lang=lang)
    except Exception as e:
        logger.debug("wiki geosearch: %s", e)
        return None


def _wiki_search_title(query: str, lang: str = "fr") -> Optional[str]:
    try:
        r = httpx.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={
                "action": "opensearch",
                "search": query,
                "limit": 1,
                "namespace": 0,
                "format": "json",
            },
            headers={"User-Agent": UA},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if isinstance(data, list) and len(data) > 1 and data[1]:
            return str(data[1][0])
    except Exception as e:
        logger.debug("wiki opensearch: %s", e)
    return None


def _category_label_fr(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    s = raw if isinstance(raw, str) else ",".join(str(x) for x in raw)
    s = s.lower()
    mapping = [
        ("catering.restaurant", "Restaurant"),
        ("catering.cafe", "Café"),
        ("catering.bar", "Bar"),
        ("catering", "Restauration"),
        ("tourism.attraction", "Attraction"),
        ("tourism.museum", "Musée"),
        ("tourism.sights", "Site"),
        ("entertainment", "Loisirs"),
        ("heritage", "Patrimoine"),
        ("religion", "Lieu de culte"),
        ("natural", "Nature"),
        ("beach", "Plage"),
        ("park", "Parc"),
        ("shop", "Boutique"),
    ]
    for key, label in mapping:
        if key in s:
            return label
    bucket = classify_bucket(None, s)
    if bucket == "restaurant":
        return "Restaurant"
    if bucket == "attraction":
        return "Attraction"
    return None


def build_prefilled_note(
    *,
    name: Optional[str],
    description: Optional[str],
    category: Optional[str],
    wiki_desc: Optional[str],
) -> str:
    """Note créateur courte, prête à éditer."""
    parts: list[str] = []
    if category:
        parts.append(category)
    tip = _first_sentence(description or wiki_desc or "", 180)
    if tip:
        parts.append(tip)
    elif name:
        parts.append(f"À ne pas manquer : {name}.")
    note = " · ".join(parts) if len(parts) > 1 else (parts[0] if parts else "")
    return note[:280]


def _scrape_maps_title(url: str) -> Optional[str]:
    """og:title / <title> depuis la page Maps (rapide, best-effort)."""
    if not url or "google." not in url and "maps.app" not in url:
        return None
    try:
        r = httpx.get(
            url,
            headers={"User-Agent": UA, "Accept": "text/html"},
            timeout=TIMEOUT,
            follow_redirects=True,
        )
        if r.status_code != 200:
            return None
        html = r.text[:80_000]
        m = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            re.I,
        )
        if not m:
            m = re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
                html,
                re.I,
            )
        if not m:
            m = re.search(r"<title>([^<]+)</title>", html, re.I)
        if not m:
            return None
        title = re.sub(r"\s+", " ", m.group(1)).strip()
        # "Place Name - Google Maps" / "Place · Google Maps"
        title = re.split(r"\s+[·\-–—]\s+Google", title, maxsplit=1)[0].strip()
        title = re.sub(r"\s*\|\s*Google Maps\s*$", "", title, flags=re.I).strip()
        if len(title) < 2 or title.lower() in ("google maps", "maps"):
            return None
        return title[:200]
    except Exception as e:
        logger.debug("maps scrape title: %s", e)
        return None


def enrich_maps_place(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrichit le dict parse_maps_url avec description + note (best-effort, rapide).
    """
    out = dict(parsed or {})
    name = (out.get("name") or "").strip() or None
    lat = out.get("lat")
    lng = out.get("lng")
    maps_url = (out.get("url_clean") or "").strip()

    wiki: Optional[Dict[str, Any]] = None
    geo: Optional[Dict[str, Any]] = None
    scraped: Optional[str] = None

    jobs = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        if not name and maps_url:
            jobs.append(("scrape", pool.submit(_scrape_maps_title, maps_url)))
        if lat is not None and lng is not None:
            jobs.append(
                ("wiki_geo_fr", pool.submit(_wiki_geosearch, float(lat), float(lng), "fr"))
            )
            jobs.append(
                (
                    "geoapify",
                    pool.submit(
                        geoapify_reverse_or_nearby, float(lat), float(lng), name
                    ),
                )
            )
        if name:
            jobs.append(
                ("wiki_title_fr", pool.submit(_wiki_summary_by_title, name, "fr"))
            )

        results: Dict[str, Any] = {}
        for key, fut in jobs:
            try:
                results[key] = fut.result(timeout=TIMEOUT + 0.5)
            except Exception:
                results[key] = None

    scraped = results.get("scrape")
    if scraped and not name:
        name = scraped
        out["name"] = name

    wiki = results.get("wiki_geo_fr") or results.get("wiki_title_fr")
    if not wiki and name:
        # Fallback EN ultra court si FR rate
        en_title = _wiki_search_title(name, "en")
        if en_title:
            wiki = _wiki_summary_by_title(en_title, "en")
        if not wiki:
            wiki = _wiki_summary_by_title(name, "en")
        # Second pass wiki by name if we only got name from scrape after pool
        if not wiki and scraped:
            wiki = _wiki_summary_by_title(scraped, "fr") or _wiki_summary_by_title(
                scraped, "en"
            )

    geo = results.get("geoapify")

    if geo and geo.get("name") and (
        not name or name.lower() in str(geo["name"]).lower() or len(name) < 3
    ):
        name = str(geo["name"]).strip()
        out["name"] = name
    elif wiki and wiki.get("title") and not name:
        name = str(wiki["title"]).strip()
        out["name"] = name
    elif name:
        out["name"] = name

    if geo:
        if out.get("lat") is None and geo.get("lat") is not None:
            out["lat"] = geo["lat"]
            out["lng"] = geo["lng"]
        cat = _category_label_fr(geo.get("category"))
        if cat:
            out["category"] = cat

    description = None
    wiki_desc = None
    if wiki:
        wiki_desc = (wiki.get("description") or "").strip() or None
        description = _first_sentence(wiki.get("extract") or "", 280)
        out["enrich_source"] = wiki.get("source") or "wikipedia"
        if wiki.get("title") and not out.get("name"):
            out["name"] = wiki["title"]

    if not description and wiki_desc:
        description = wiki_desc

    # Ne pas coller le sous-titre wiki phonétique comme « category »
    if not out.get("category"):
        bucket = classify_bucket(out.get("name"), None)
        if bucket == "restaurant":
            out["category"] = "Restaurant"
        elif bucket == "attraction":
            out["category"] = "Attraction"

    out["description"] = description
    out["note"] = build_prefilled_note(
        name=out.get("name"),
        description=description,
        category=out.get("category"),
        wiki_desc=wiki_desc,
    )
    # Garantir au moins une note si on a un nom
    if not out["note"] and out.get("name"):
        out["note"] = f"À voir : {out['name']}."
    return out
