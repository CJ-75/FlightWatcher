"""Activities listing / nearby / snapshots — Lot B/D."""
from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from activities.cache import cache_get, cache_set
from activities.config import ActivitiesConfig, load_activities_config
from activities.ranking import haversine_km, rank_activities
from activities.viator_client import ViatorClient, ViatorError

logger = logging.getLogger("activities.service")

# Sandbox/RC shop hosts often resolve poorly in browsers (city landing instead of PDP).
_VIATOR_SANDBOX_HOST_RE = re.compile(
    r"(^|\.)((live\.)?rc\.viator\.com|sandbox\.viator\.com)$",
    re.I,
)
_VIATOR_AFFILIATE_QUERY_KEYS = frozenset(
    {
        "pid",
        "mcid",
        "medium",
        "api_version",
        "campaign",
        "campaign-value",
        "cjevent",
    }
)

# Viator taxonomy — Food & Drink + Dining Experiences (kept for Restaurants).
_GASTRONOMY_TAG_IDS = frozenset({21911, 11890})

_GASTRONOMY_TEXT_RE = re.compile(
    r"("
    r"food\s*&?\s*drink|food\s*tour|street\s*food|culinary|cooking\s*class|"
    r"wine\s*tast|foodie|gastronom|dining\s*experience|dinner\s*cruise|"
    r"brunch|tastings?|"
    r"gastronomie|culinaire|d[eé]gustation|atelier\s*cuisine|"
    r"cours\s*de\s*cuisine|visite\s*gourmande|food\s*tour|"
    r"d[iî]ner\s*croisi[eè]re|oenolog|œnolog|wine\s*tour|"
    r"cheese\s*tast|fromage|chocolat(e)?\s*(workshop|atelier|tast)|"
    r"beer\s*tast|bi[eè]re\s*d[eé]gust"
    r")",
    re.IGNORECASE,
)


def _extract_tag_ids(raw: Any) -> List[int]:
    out: List[int] = []
    if not isinstance(raw, list):
        return out
    for t in raw:
        if isinstance(t, int):
            out.append(t)
        elif isinstance(t, str) and t.isdigit():
            out.append(int(t))
        elif isinstance(t, dict):
            tid = t.get("tagId") or t.get("id") or t.get("tag_id")
            try:
                if tid is not None:
                    out.append(int(tid))
            except (TypeError, ValueError):
                continue
    return out


def is_gastronomy_activity(item: Dict[str, Any]) -> bool:
    """True for food/drink experiences — reserved for Restaurants, not Activités."""
    tags = item.get("tags")
    if tags is None:
        tags = []
    tag_ids = (
        tags
        if tags and isinstance(tags[0], int)
        else _extract_tag_ids(tags)
    )
    if any(tid in _GASTRONOMY_TAG_IDS for tid in tag_ids):
        return True
    blob = " ".join(
        str(x or "")
        for x in (
            item.get("title"),
            item.get("category"),
            item.get("tag"),
            item.get("description"),
        )
    )
    return bool(_GASTRONOMY_TEXT_RE.search(blob))


def exclude_gastronomy(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [it for it in items if not is_gastronomy_activity(it)]


# Card/detail heroes are ~360–720 CSS px; prefer ~720–1200 wide Viator variants
# (variants[0] is typically a 50×50 thumb → severe upscale pixelation).
_PHOTO_TARGET_WIDTH = 720
_PHOTO_MIN_ACCEPTABLE_WIDTH = 400


def _variant_width(v: Dict[str, Any]) -> int:
    for key in ("width", "Width", "w"):
        raw = v.get(key)
        try:
            w = int(raw)
            if w > 0:
                return w
        except (TypeError, ValueError):
            pass
    # Fallback: parse …-720x480 / …_720x480 from CDN path
    url = str(v.get("url") or "")
    m = re.search(r"[_\-](\d{2,4})x(\d{2,4})", url)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return 0
    return 0


def _pick_variant_url(variants: Any) -> Optional[str]:
    if not isinstance(variants, list) or not variants:
        return None
    scored: List[Tuple[int, int, str]] = []
    for i, v in enumerate(variants):
        if not isinstance(v, dict):
            continue
        url = v.get("url") or v.get("href")
        if not url:
            continue
        w = _variant_width(v)
        scored.append((w, i, str(url)))
    if not scored:
        return None
    # Prefer width closest to target among those >= min; else largest available.
    good = [s for s in scored if s[0] >= _PHOTO_MIN_ACCEPTABLE_WIDTH]
    pool = good or scored
    pool.sort(
        key=lambda s: (
            abs(s[0] - _PHOTO_TARGET_WIDTH) if s[0] else 10_000,
            -s[0],
            s[1],
        )
    )
    return pool[0][2]


def _pick_product_photo_url(images: Any) -> Optional[str]:
    if not isinstance(images, list) or not images:
        return None
    dicts = [im for im in images if isinstance(im, dict)]
    if not dicts:
        return None
    cover = next(
        (
            im
            for im in dicts
            if im.get("isCover") is True or im.get("cover") is True
        ),
        None,
    )
    ordered = [cover] + [im for im in dicts if im is not cover] if cover else dicts
    for im in ordered:
        url = _pick_variant_url(im.get("variants"))
        if url:
            return url
        for key in ("url", "imageSource", "imageUrl", "src"):
            raw = im.get(key)
            if raw:
                return str(raw)
    return None


def _duration_hours_from(raw: Any) -> Optional[float]:
    if not isinstance(raw, dict):
        return None
    fixed = raw.get("fixedDurationInMinutes")
    if fixed is not None:
        try:
            return round(float(fixed) / 60.0, 2)
        except (TypeError, ValueError):
            pass
    unre = raw.get("unstructuredDuration")
    if isinstance(unre, str) and unre.strip():
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*h", unre, re.I)
        if m:
            try:
                return float(m.group(1).replace(",", "."))
            except ValueError:
                pass
    return None


def _plain_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, dict):
        for key in (
            "description",
            "text",
            "plainText",
            "otherDescription",
            "name",
            "translated",
        ):
            if value.get(key):
                return _plain_text(value.get(key))
        return None
    s = str(value).strip()
    if not s:
        return None
    s = re.sub(r"</?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    s = re.sub(r"[ \t\f\v]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    lines = [ln.strip() for ln in s.split("\n") if ln.strip()]
    out = "\n".join(lines).strip()
    return out or None


def _string_list(raw: Any, *, limit: int = 12) -> List[str]:
    out: List[str] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        text = _plain_text(item)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _collect_product_photos(images: Any, *, limit: int = 12) -> List[Dict[str, str]]:
    if not isinstance(images, list) or not images:
        return []
    dicts = [im for im in images if isinstance(im, dict)]
    cover = next(
        (im for im in dicts if im.get("isCover") is True or im.get("cover") is True),
        None,
    )
    ordered = ([cover] + [im for im in dicts if im is not cover]) if cover else dicts
    photos: List[Dict[str, str]] = []
    seen: set[str] = set()
    for im in ordered:
        url = _pick_variant_url(im.get("variants"))
        if not url:
            for key in ("url", "imageSource", "imageUrl", "src"):
                raw = im.get(key)
                if raw:
                    url = str(raw)
                    break
        if not url or url in seen:
            continue
        seen.add(url)
        thumb = None
        variants = im.get("variants") if isinstance(im.get("variants"), list) else []
        thumbs: List[Tuple[int, str]] = []
        for v in variants:
            if not isinstance(v, dict) or not v.get("url"):
                continue
            w = _variant_width(v)
            if 0 < w <= 320:
                thumbs.append((w, str(v["url"])))
        if thumbs:
            thumbs.sort(key=lambda t: abs(t[0] - 200))
            thumb = thumbs[0][1]
        photos.append({"url": url, "thumb": thumb or url})
        if len(photos) >= limit:
            break
    return photos


def _meeting_point_from(p: Dict[str, Any]) -> Optional[str]:
    logistics = p.get("logistics") if isinstance(p.get("logistics"), dict) else {}
    for key in ("start", "travelerPickup", "redemption"):
        block = logistics.get(key)
        items = block if isinstance(block, list) else [block] if isinstance(block, dict) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            loc = item.get("location")
            for sub in (
                item.get("description"),
                loc.get("name") if isinstance(loc, dict) else None,
                loc,
            ):
                text = _plain_text(sub)
                if text:
                    return text
    itinerary = p.get("itinerary") if isinstance(p.get("itinerary"), dict) else {}
    points = itinerary.get("pointsOfInterest") or itinerary.get("itineraryItems")
    if isinstance(points, list) and points:
        first = points[0]
        if isinstance(first, dict):
            text = _plain_text(
                first.get("description")
                or first.get("pointOfInterestLocation")
                or first.get("name")
            )
            if text:
                return text
    return None


def _languages_from(p: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    guides = p.get("languageGuides") or p.get("languages")
    if not isinstance(guides, list):
        return out
    for g in guides:
        if isinstance(g, str) and g.strip():
            out.append(g.strip())
        elif isinstance(g, dict):
            lang = g.get("language") or g.get("code") or g.get("name")
            if lang and str(lang).strip() not in out:
                out.append(str(lang).strip())
        if len(out) >= 8:
            break
    return out


def _primary_destination_id(p: Dict[str, Any]) -> Optional[str]:
    dests = p.get("destinations")
    if not isinstance(dests, list):
        return None
    first: Optional[str] = None
    for d in dests:
        if not isinstance(d, dict):
            continue
        ref = d.get("ref") or d.get("destinationId") or d.get("id")
        if ref is None:
            continue
        sid = str(ref).strip()
        if not sid:
            continue
        if d.get("primary"):
            return sid
        if first is None:
            first = sid
    return first


def _canonical_viator_product_url(
    raw_url: Optional[str],
    *,
    product_code: Optional[str] = None,
    destination_id: Optional[str] = None,
) -> Optional[str]:
    """
    Ensure click-out lands on the product PDP, not the city destination page.

    Sandbox/RC shop hosts (shop.live.rc.viator.com) often fail open in browsers
    and fall back to a destination landing. Rewrite those to www.viator.com while
    keeping the /tours/.../d{dest}-{code} path + affiliate query params.
    """
    code = str(product_code or "").strip()
    dest = str(destination_id or "").strip()
    url = str(raw_url or "").strip()

    path_dest: Optional[str] = None
    path_code: Optional[str] = None
    affiliate_qs: Dict[str, str] = {}
    path = ""
    host = ""
    is_sandbox = False
    is_dest_only = False

    if url:
        try:
            parsed = urlparse(url)
        except Exception:
            parsed = None
        if parsed and parsed.scheme in ("http", "https") and parsed.hostname:
            host = parsed.hostname.lower()
            path = parsed.path or ""
            is_sandbox = bool(
                _VIATOR_SANDBOX_HOST_RE.search(host)
                or host.startswith("shop.")
            )
            for k, v in parse_qsl(parsed.query, keep_blank_values=True):
                if k.lower() in _VIATOR_AFFILIATE_QUERY_KEYS:
                    affiliate_qs[k] = v
            m = re.search(r"/d(\d+)-([A-Za-z0-9]+)/?$", path)
            if m:
                path_dest, path_code = m.group(1), m.group(2)
                if path_code.lower() == "ttd":
                    is_dest_only = True
                    path_code = None
                else:
                    if not code:
                        code = path_code
                    if not dest:
                        dest = path_dest
            if re.search(r"/d\d+-ttd/?$", path, re.I):
                is_dest_only = True

    if not code and not url:
        return None

    if not dest and path_dest:
        dest = path_dest

    needs_rewrite = is_sandbox or is_dest_only or (
        bool(url) and "viator.com" in host and "/tours/" not in path and bool(code)
    )

    if url and not needs_rewrite:
        # Production product URL — keep verbatim for attribution.
        return url

    if is_dest_only or "/tours/" not in path:
        if not code:
            return url or None
        new_path = f"/tours/d{dest}-{code}" if dest else f"/tours/{code}"
    else:
        new_path = path

    query = urlencode(affiliate_qs) if affiliate_qs else ""
    return urlunparse(("https", "www.viator.com", new_path, "", query, ""))


def _normalize_product(p: Dict[str, Any], *, dest_label: Optional[str] = None) -> Dict[str, Any]:
    reviews = p.get("reviews") if isinstance(p.get("reviews"), dict) else {}
    pricing = p.get("pricing") if isinstance(p.get("pricing"), dict) else {}
    from_price = None
    currency = "EUR"
    summary = pricing.get("summary") if isinstance(pricing.get("summary"), dict) else {}
    if summary.get("fromPrice") is not None:
        from_price = summary.get("fromPrice")
    elif pricing.get("fromPrice") is not None:
        from_price = pricing.get("fromPrice")
    currency = str(pricing.get("currency") or summary.get("currency") or "EUR")
    photo = _pick_product_photo_url(p.get("images"))
    flags = p.get("flags") if isinstance(p.get("flags"), dict) else {}
    dur = _duration_hours_from(p.get("duration"))
    if dur is None:
        itin = p.get("itinerary") if isinstance(p.get("itinerary"), dict) else {}
        dur = _duration_hours_from(itin.get("duration"))
    tags = _extract_tag_ids(p.get("tags"))
    product_code = p.get("productCode") or p.get("code")
    dest_id = _primary_destination_id(p)
    product_url = _canonical_viator_product_url(
        p.get("productUrl") or p.get("url"),
        product_code=str(product_code) if product_code else None,
        destination_id=dest_id,
    )
    return {
        "product_code": product_code,
        "title": p.get("title") or p.get("name"),
        "rating": reviews.get("combinedAverageRating") or p.get("rating"),
        "review_count": reviews.get("totalReviews") or p.get("review_count"),
        "duration_hours": dur,
        "price_from": from_price,
        "currency": currency,
        "photo_url": photo,
        "product_url": product_url,
        "free_cancellation": bool(
            flags.get("freeCancellation") or p.get("freeCancellation")
        ),
        "instant_confirmation": bool(
            flags.get("instantConfirmation") or p.get("instantConfirmation")
        ),
        "category": (p.get("categories") or [None])[0]
        if isinstance(p.get("categories"), list)
        else p.get("category"),
        "tags": tags,
        "destination_label": dest_label,
    }


def _normalize_product_detail(
    p: Dict[str, Any], *, dest_label: Optional[str] = None
) -> Dict[str, Any]:
    """Richer product payload for lightbox / fiche activité."""
    base = _normalize_product(p, dest_label=dest_label)
    photos = _collect_product_photos(p.get("images"))
    if not photos and base.get("photo_url"):
        photos = [{"url": str(base["photo_url"]), "thumb": str(base["photo_url"])}]
    if photos and not base.get("photo_url"):
        base["photo_url"] = photos[0]["url"]

    description = (
        _plain_text(p.get("description"))
        or _plain_text(p.get("descriptionTranslated"))
        or _plain_text(p.get("shortDescription"))
        or _plain_text(p.get("overview"))
    )
    inclusions = _string_list(p.get("inclusions"))
    exclusions = _string_list(p.get("exclusions"))
    additional = _string_list(p.get("additionalInfo"), limit=8)

    return {
        **base,
        "photos": photos,
        "description": description,
        "inclusions": inclusions,
        "exclusions": exclusions,
        "additional_info": additional,
        "meeting_point": _meeting_point_from(p),
        "languages": _languages_from(p),
    }


def geo_cell_key(lat: float, lng: float, cell_km: float) -> str:
    # Integer cell indices — stable for nearby points inside the same cell
    dlat = cell_km / 111.0
    cos = max(0.2, math.cos(math.radians(lat)))
    dlng = cell_km / (111.0 * cos)
    ilat = int(math.floor(lat / dlat))
    ilng = int(math.floor(lng / dlng))
    return f"{ilat}:{ilng}:{cell_km}"


def _city_slugify(name: str) -> str:
    s = (
        str(name or "")
        .strip()
        .lower()
        .replace("'", "")
        .replace("’", "")
    )
    for a, b in (
        ("é", "e"),
        ("è", "e"),
        ("ê", "e"),
        ("à", "a"),
        ("á", "a"),
        ("ã", "a"),
        ("í", "i"),
        ("ó", "o"),
        ("ô", "o"),
        ("ú", "u"),
        ("ü", "u"),
        ("ñ", "n"),
        ("ç", "c"),
    ):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# FR ↔ EN slug aliases (Viator /destinations often returns localized names).
CITY_SLUG_ALIASES: Dict[str, Tuple[str, ...]] = {
    "lisbonne": ("lisbon", "lisboa"),
    "lisbon": ("lisbonne", "lisboa"),
    "lisboa": ("lisbonne", "lisbon"),
    "londres": ("london",),
    "london": ("londres",),
    "barcelone": ("barcelona",),
    "barcelona": ("barcelone",),
    "rome": ("roma",),
    "roma": ("rome",),
    "milan": ("milano",),
    "milano": ("milan",),
    "venise": ("venice",),
    "venice": ("venise",),
    "vienne": ("vienna", "wien"),
    "vienna": ("vienne", "wien"),
    "wien": ("vienne", "vienna"),
    "prague": ("praha",),
    "praha": ("prague",),
    "edimbourg": ("edinburgh",),
    "edinburgh": ("edimbourg",),
    "seville": ("sevilla",),
    "sevilla": ("seville",),
    "valence": ("valencia",),
    "valencia": ("valence",),
    "naples": ("napoli",),
    "napoli": ("naples",),
    "palerme": ("palermo",),
    "palermo": ("palerme",),
    "malte": ("malta", "la-valette", "valletta"),
    "malta": ("malte", "la-valette", "valletta"),
    "la-valette": ("malte", "malta", "valletta"),
    "valletta": ("malte", "malta", "la-valette"),
    "bruxelles": ("brussels",),
    "brussels": ("bruxelles",),
    "athenes": ("athens",),
    "athens": ("athenes",),
    "copenhague": ("copenhagen",),
    "copenhagen": ("copenhague",),
    "cracovie": ("krakow", "cracow"),
    "krakow": ("cracovie", "cracow"),
    "glasgow": ("glasgow",),
    "oslo": ("oslo",),
    "helsinki": ("helsinki",),
    "amsterdam": ("amsterdam",),
    "crete-heraklion": ("heraklion", "iraklio", "crete"),
    "heraklion": ("crete-heraklion", "iraklio"),
    "ibiza": ("eivissa",),
    "madere": ("funchal", "madeira"),
    "funchal": ("madere", "madeira"),
    "madeira": ("madere", "funchal"),
    "agadir": ("agadir",),
    "casablanca": ("casablanca",),
    "alger": ("algiers",),
    "algiers": ("alger",),
    "le-caire": ("cairo",),
    "cairo": ("le-caire",),
    "dubai": ("dubay",),
    "abu-dhabi": ("abou-dabi",),
    "abou-dabi": ("abu-dhabi",),
    "praia": ("cape-verde",),
    "bangkok": ("krung-thep",),
    "new-york": ("nyc", "new-york-city"),
    "tokyo": ("tokio",),
}


# Fallback when viator_destination_map is empty / incomplete.
# IDs = Viator Partner destinationId (CITY), verified via /destinations (fr-FR).
# WARNING: do not confuse with US homonyms (e.g. 645 = Los Angeles, not Lisbon).
FALLBACK_CITY_DESTINATIONS: Dict[str, str] = {
    "paris": "479",
    "rome": "511",
    "roma": "511",
    "barcelone": "562",
    "barcelona": "562",
    "lisbonne": "538",
    "lisbon": "538",
    "lisboa": "538",
    "porto": "26879",
    "milan": "512",
    "milano": "512",
    "amsterdam": "525",
    "londres": "737",
    "london": "737",
    "madrid": "566",
    "berlin": "488",
    "venise": "522",
    "venice": "522",
    "florence": "519",
    "nice": "478",
    "lyon": "829",
    "dublin": "503",
    "budapest": "499",
    "prague": "462",
    "praha": "462",
    "vienne": "454",
    "vienna": "454",
    "wien": "454",
    "malte": "4142",  # La Valette (CITY) — better than country 4141
    "malta": "4142",
    "la-valette": "4142",
    "valletta": "4142",
    "palerme": "4815",
    "palermo": "4815",
    "seville": "556",
    "sevilla": "556",
    "valence": "811",
    "valencia": "811",
    "naples": "508",  # Italy (22381 = Naples FL)
    "napoli": "508",
    "edimbourg": "739",
    "edinburgh": "739",
    "manchester": "4056",  # UK (23341 = Manchester NH)
    "birmingham": "22776",  # UK (34184 = Birmingham AL)
    "bruxelles": "458",
    "brussels": "458",
    "athenes": "496",
    "athens": "496",
    "copenhague": "463",
    "copenhagen": "463",
    "stockholm": "907",
    "cracovie": "529",
    "krakow": "529",
    # Wave destinations (verified via /destinations CITY)
    "glasgow": "740",
    "oslo": "902",
    "helsinki": "803",
    "ibiza": "4217",
    "eivissa": "4217",
    "heraklion": "961",
    "crete-heraklion": "961",
    "iraklio": "961",
    "funchal": "22388",
    "madere": "22388",
    "madeira": "22388",
    "agadir": "4383",
    "casablanca": "4396",
    "alger": "25745",
    "algiers": "25745",
    "le-caire": "557",
    "cairo": "557",
    "dubai": "828",
    "abu-dhabi": "4474",
    "abou-dabi": "4474",
    "praia": "50225",
    "bangkok": "366",
    "new-york": "687",
    "montreal": "632",
    "tokyo": "373",
}


def _slug_candidates(slug: str) -> List[str]:
    key = _city_slugify(slug)
    if not key:
        return []
    out: List[str] = [key]
    for alt in CITY_SLUG_ALIASES.get(key, ()):
        a = _city_slugify(alt)
        if a and a not in out:
            out.append(a)
    return out


def _resolve_destination_id(supabase, slug: str) -> Optional[str]:
    """Resolve Viator destinationId — FALLBACK (+ FR/EN aliases), then map row."""
    candidates = _slug_candidates(slug)
    if not candidates:
        return None

    # 1) Trusted hardcoded catalogue first (avoids wrong DB / soft matches
    #    e.g. historical bug lisbonne→645 Los Angeles).
    for key in candidates:
        hit = FALLBACK_CITY_DESTINATIONS.get(key)
        if hit:
            return hit

    # 2) Exact city_slug in synced map (try all language aliases)
    if supabase:
        for key in candidates:
            try:
                m = (
                    supabase.table("viator_destination_map")
                    .select("viator_destination_id,name,city_slug,meta")
                    .eq("city_slug", key)
                    .limit(3)
                    .execute()
                )
                rows = [r for r in (m.data or []) if isinstance(r, dict)]
                if not rows:
                    continue
                # Prefer CITY over COUNTRY/REGION when meta is present
                for r in rows:
                    meta = r.get("meta") if isinstance(r.get("meta"), dict) else {}
                    dtype = str(meta.get("type") or "").upper()
                    if dtype == "CITY":
                        did = str(r.get("viator_destination_id") or "")
                        if did:
                            return did
                did = str(rows[0].get("viator_destination_id") or "")
                if did:
                    return did
            except Exception:
                pass

        # 3) Exact slugified name match (no broad %ilike% — too easy to hit
        #    the wrong city, e.g. substring collisions).
        try:
            needle = candidates[0].replace("-", " ")
            m = (
                supabase.table("viator_destination_map")
                .select("viator_destination_id,city_slug,name,meta")
                .ilike("name", f"%{needle}%")
                .limit(20)
                .execute()
            )
            cand_set = set(candidates)
            for r in m.data or []:
                if not isinstance(r, dict):
                    continue
                name_slug = _city_slugify(str(r.get("name") or ""))
                row_slug = _city_slugify(str(r.get("city_slug") or ""))
                if name_slug in cand_set or row_slug in cand_set:
                    did = str(r.get("viator_destination_id") or "")
                    if did:
                        return did
        except Exception:
            pass
    return None


def search_city_activities(
    supabase,
    *,
    city_slug: str,
    destination_id: Optional[str] = None,
    adults: int = 2,
    cfg: Optional[ActivitiesConfig] = None,
) -> Dict[str, Any]:
    cfg = cfg or load_activities_config()
    adults = max(1, min(6, int(adults or 2)))
    slug = (city_slug or "").strip().lower()
    # destv5: lean list payload + smaller Viator page size
    dest = destination_id or _resolve_destination_id(supabase, slug)
    cache_key = f"city:{slug}:{dest or ''}:destv5"
    cached = cache_get(
        supabase, provider="viator", resource="city_search", cache_key=cache_key
    )
    if isinstance(cached, dict) and cached.get("items"):
        cached_dest = str(cached.get("destination_id") or "")
        # Serve cache only when destinationId matches (guards lisbonne→LA style bugs).
        if dest and cached_dest and cached_dest == str(dest):
            items = exclude_gastronomy(
                [it for it in (cached.get("items") or []) if isinstance(it, dict)]
            )
            return {**cached, "items": items, "cached": True}

    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled", "items": []}

    if not dest:
        return {
            "ok": False,
            "error": "unknown_city",
            "items": [],
            "city_slug": slug,
            "hint": "Ville pas encore couverte — choisis une suggestion ou une grande ville EU",
        }

    # Ask Viator for slightly more than we show (gastronomy filter), not 2×.
    page_count = min(40, max(cfg.max_results + 6, cfg.min_results + 6))
    try:
        raw = client.search_products(
            {
                "filtering": {"destination": str(dest)},
                "pagination": {"start": 1, "count": page_count},
                "currency": "EUR",
            }
        )
    except ViatorError as e:
        return {"ok": False, "error": str(e), "items": []}

    products = []
    if isinstance(raw, dict):
        products = raw.get("products") or raw.get("data") or []
    items = [
        _normalize_product(p)
        for p in products
        if isinstance(p, dict)
    ]
    items = exclude_gastronomy(items)
    items = rank_activities(items)
    # Cap to multiple of 3 between min and max
    n = max(cfg.min_results, min(cfg.max_results, len(items)))
    n = n - (n % 3) if n >= 3 else n
    items = items[:n] if n else items[: cfg.max_results]
    payload = {
        "ok": True,
        "city_slug": city_slug,
        "destination_id": str(dest),
        "adults": adults,
        "items": items,
        "indicative": False,
        "cached": False,
    }
    cache_set(
        supabase,
        provider="viator",
        resource="city_search",
        cache_key=cache_key,
        payload=payload,
        ttl_h=cfg.cache_ttl_h,
        license_class="basic_ephemeral",
    )
    return payload


def nearby_activities(
    supabase,
    *,
    lat: float,
    lng: float,
    adults: int = 2,
    cfg: Optional[ActivitiesConfig] = None,
) -> Dict[str, Any]:
    """Expand radius steps; max queries; quality relaxation — Lot D."""
    cfg = cfg or load_activities_config()
    # Round position — never store exact
    rlat = round(float(lat), 2)
    rlng = round(float(lng), 2)
    cell = geo_cell_key(rlat, rlng, cfg.geo_cache_cell_km)
    cache_key = f"geo:{cell}:{adults}:destv4"
    cached = cache_get(
        supabase, provider="viator", resource="geo_search", cache_key=cache_key
    )
    if isinstance(cached, dict) and cached.get("items"):
        items = exclude_gastronomy(
            [it for it in (cached.get("items") or []) if isinstance(it, dict)]
        )
        return {**cached, "items": items, "cached": True}

    # Destinations from map sorted by distance
    dests: List[Tuple[float, Dict[str, Any]]] = []
    if supabase:
        try:
            res = (
                supabase.table("viator_destination_map")
                .select("*")
                .limit(200)
                .execute()
            )
            for row in res.data or []:
                try:
                    dlat = float(row.get("lat"))
                    dlng = float(row.get("lng"))
                except (TypeError, ValueError):
                    continue
                km = haversine_km(rlat, rlng, dlat, dlng)
                dests.append((km, row))
        except Exception as e:
            logger.warning("nearby dest map: %s", e)
    dests.sort(key=lambda x: x[0])

    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled", "items": []}

    collected: Dict[str, Dict[str, Any]] = {}
    queries = 0
    used_radius = None
    quality_idx = 0

    def quality_ok(item: Dict[str, Any], step: Tuple[float, int]) -> bool:
        min_r, min_n = step
        try:
            r = float(item.get("rating") or 0)
            n = int(item.get("review_count") or 0)
        except (TypeError, ValueError):
            return False
        return r >= min_r and n >= min_n

    for radius in cfg.radius_steps_km:
        used_radius = radius
        for km, row in dests:
            if km > radius:
                break
            if queries >= cfg.max_queries_per_geo:
                break
            dest_id = row.get("viator_destination_id")
            if not dest_id:
                continue
            queries += 1
            try:
                raw = client.search_products(
                    {
                        "filtering": {"destination": str(dest_id)},
                        "pagination": {"start": 1, "count": 20},
                        "currency": "EUR",
                    }
                )
            except ViatorError:
                continue
            products = []
            if isinstance(raw, dict):
                products = raw.get("products") or raw.get("data") or []
            for p in products:
                if not isinstance(p, dict):
                    continue
                norm = _normalize_product(
                    p, dest_label=row.get("name") or row.get("city_slug")
                )
                if is_gastronomy_activity(norm):
                    continue
                code = str(norm.get("product_code") or "")
                if not code or code in collected:
                    continue
                norm["_dest_km"] = km
                collected[code] = norm
        # Enough results at this radius?
        qstep = cfg.quality_steps[min(quality_idx, len(cfg.quality_steps) - 1)]
        filtered = [
            it for it in collected.values() if quality_ok(it, qstep)
        ]
        if len(filtered) >= cfg.min_results:
            break
        if queries >= cfg.max_queries_per_geo:
            break

    # Relax quality without expanding further
    items = list(collected.values())
    for qi, qstep in enumerate(cfg.quality_steps):
        quality_idx = qi
        filtered = [it for it in items if quality_ok(it, qstep)]
        if len(filtered) >= cfg.min_results:
            items = filtered
            break
    else:
        items = [it for it in items if quality_ok(it, cfg.quality_steps[-1])] or items

    items = exclude_gastronomy(items)
    dist_map = {
        str(it.get("product_code")): float(it.get("_dest_km") or 0) for it in items
    }
    items = rank_activities(items, distance_km=dist_map)
    n = max(cfg.min_results, min(cfg.max_results, len(items)))
    n = n - (n % 3) if n >= 3 else len(items)
    items = items[:n]

    payload = {
        "ok": True,
        "items": items,
        "radius_km": used_radius,
        "queries": queries,
        "quality_step": list(cfg.quality_steps[quality_idx]),
        "count": len(items),
        "cached": False,
        "header": (
            f"{len(items)} activités autour de toi, dans un rayon de {used_radius} km"
            if used_radius
            else f"{len(items)} activités autour de toi"
        ),
    }
    if len(items) < cfg.min_results:
        payload["fallback_hint"] = "Explorer une grande ville proche"
    cache_set(
        supabase,
        provider="viator",
        resource="geo_search",
        cache_key=cache_key,
        payload=payload,
        ttl_h=cfg.cache_ttl_h,
        license_class="basic_ephemeral",
    )
    return payload


def sync_destinations_map(supabase, cfg: Optional[ActivitiesConfig] = None) -> Dict[str, Any]:
    cfg = cfg or load_activities_config()
    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled"}
    try:
        dests = client.list_destinations()
    except ViatorError as e:
        return {"ok": False, "error": str(e)}
    items = []
    if isinstance(dests, dict):
        items = dests.get("destinations") or dests.get("data") or []
    elif isinstance(dests, list):
        items = dests
    upserted = 0
    for d in items if isinstance(items, list) else []:
        if not isinstance(d, dict):
            continue
        dest_id = d.get("destinationId") or d.get("id")
        if dest_id is None:
            continue
        center = d.get("center") or {}
        lat = d.get("latitude") or (center.get("latitude") if isinstance(center, dict) else None)
        lng = d.get("longitude") or (center.get("longitude") if isinstance(center, dict) else None)
        name = d.get("name") or d.get("destinationName") or str(dest_id)
        slug = _city_slugify(str(name))[:80]
        row = {
            "viator_destination_id": str(dest_id),
            "name": name,
            "city_slug": slug,
            "lat": lat,
            "lng": lng,
            "meta": {"type": d.get("type") or d.get("destinationType")},
        }
        try:
            supabase.table("viator_destination_map").upsert(
                row, on_conflict="viator_destination_id"
            ).execute()
            upserted += 1
        except Exception as e:
            logger.debug("dest upsert: %s", e)
    cache_set(
        supabase,
        provider="viator",
        resource="destinations",
        cache_key="all",
        payload={"count": upserted},
        ttl_h=24 * 7,
        license_class="reference",
    )
    return {"ok": True, "upserted": upserted}
