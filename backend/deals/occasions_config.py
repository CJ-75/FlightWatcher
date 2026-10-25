"""
v4 Occasions — versioned config (evergreen + seasonal + event).
Tags are computed at materialize; chips come from GET /api/deals/occasions.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Price chip threshold (decision: 200 €, not 150)
MOINS_EUR = 200

# Whitelists — IATA dest or city keys used by rules (served later by dest_iata / city)
HIVER_SOLEIL_IATA = frozenset(
    {
        "AGP",
        "SVQ",
        "RAK",
        "MLA",
        "TFS",
        "LPA",
        "ACE",
        "FUE",
        "LCA",
        "PFO",
        "LIS",  # option
        "FAO",
        "ALC",
        "IBZ",
        "PMI",
    }
)
NUITS_POLAIRES_IATA = frozenset({"TOS", "KKN", "KRN", "OSD", "LLA", "RVN", "HEL", "TMP"})
AMBIANCE_NOEL_IATA = frozenset(
    {
        "VIE",
        "PRG",
        "BUD",
        "STR",
        "NUE",
        "MUC",
        "BRU",
        "CGN",
        "AMS",
        "CRL",
        "HHN",
        "FMM",
    }
)
SAINT_PATRICK_IATA = frozenset({"DUB", "ORK", "SNN", "KIR"})
CARNAVAL_IATA = frozenset({"VCE", "NCE", "BIO", "SVQ", "AGP"})  # event, verified=false
SEMAINE_SAINTE_IATA = frozenset({"SVQ", "AGP", "GRX"})
PRINTEMPS_FLEURS_IATA = frozenset({"AMS", "EIN"})
FUIR_CANICULE_IATA = frozenset({"DUB", "EDI", "CPH", "OSL", "GOT", "BGO", "SVG"})
SEPTEMBRE_MER_IATA = frozenset(
    {"AGP", "SVQ", "ALC", "PMI", "IBZ", "MLA", "PMO", "CTA", "OLB", "BRI", "NAP", "PSA"}
)
HALLOWEEN_IATA = frozenset({"DUB", "EDI", "MAN", "LGW", "STN"})
FETE_MUSIQUE_IATA = frozenset({"PAR", "BVA", "ORY", "CDG", "BRU", "AMS", "BER", "VIE", "PRG"})
MIDSOMMAR_IATA = frozenset({"ARN", "NYO", "GOT", "MMX", "VBY"})

# Badge priority (lower = wins). Reduction badge still beats all of these in UI.
BADGE_PRIORITY: Dict[str, int] = {
    # seasonal / event first
    "ambiance-noel": 10,
    "pont-noel": 11,
    "nouvel-an": 12,
    "hiver-soleil": 13,
    "nuits-polaires": 14,
    "saint-valentin": 15,
    "carnaval": 16,
    "saint-patrick": 17,
    "paques": 18,
    "semaine-sainte": 19,
    "printemps-fleurs": 20,
    "pont-ascension": 21,
    "pentecote": 22,
    "premiers-25": 23,
    "fete-musique": 24,
    "jours-sans-fin": 25,
    "midsommar": 26,
    "pont-14-juillet": 27,
    "fuir-canicule": 28,
    "septembre-mer": 29,
    "fete-biere": 30,
    "toussaint": 31,
    "pont-11-novembre": 32,
    "halloween": 33,
    "derniers-rayons": 34,
    # evergreen after seasonal
    "sans-conge": 50,
    "un-jour-conge": 51,
    "hotel-plebiscite": 52,
    "extras-offerts": 53,
    "il-fera-beau": 54,
    "pepites": 55,
    "max-sur-place": 56,
    "hors-vacances": 57,
    "moins-200": 58,
}

OCCASIONS: List[Dict[str, Any]] = [
    # —— Evergreen ——
    {
        "slug": "sans-conge",
        "label": "Sans poser de congé",
        "icon": "briefcase-off",
        "kind": "evergreen",
        "rule": "sans_conge",
        "params": {},
        "explain": "Vendredi soir → dimanche : tu pars sans toucher à tes RTT.",
        "verified": True,
        "priority": 10,
        "push": True,
    },
    {
        "slug": "un-jour-conge",
        "label": "1 jour de congé",
        "icon": "calendar",
        "kind": "evergreen",
        "rule": "un_jour_conge",
        "params": {},
        "explain": "Un seul jour ouvré à poser pour un long week-end bien rempli.",
        "verified": True,
        "priority": 20,
        "push": False,
    },
    {
        "slug": "max-sur-place",
        "label": "Max de temps sur place",
        "icon": "clock",
        "kind": "evergreen",
        "rule": "max_sur_place",
        "params": {"min_hours": 40},
        "explain": "Horaires malins : le plus d’heures possibles à destination.",
        "verified": True,
        "priority": 90,
        "push": False,
        "chip": False,  # hidden from Inspire-toi rail
    },
    {
        "slug": "hotel-plebiscite",
        "label": "Coup de cœur hôtel",
        "icon": "heart",
        "kind": "evergreen",
        "rule": "hotel_plebiscite",
        "params": {"min_rating": 9.0, "min_reviews": 1000},
        "explain": "Note très haute + plein d’avis : l’hôtel cartonne vraiment.",
        "verified": True,
        "priority": 40,
        "push": False,
    },
    {
        "slug": "extras-offerts",
        "label": "Petit-déj inclus",
        "icon": "gift",
        "kind": "evergreen",
        "rule": "extras_offerts",
        "params": {},
        "explain": "Petit-déj ou extras déjà dans le prix hôtel — moins de surprises.",
        "verified": True,
        "priority": 45,
        "push": False,
    },
    {
        "slug": "moins-200",
        "label": f"Moins de {MOINS_EUR} €",
        "icon": "euro",
        "kind": "evergreen",
        "rule": "moins_eur",
        "params": {"max_pp": MOINS_EUR},
        "explain": f"Vol + hôtel à moins de {MOINS_EUR} € / pers. — les bons plans budget.",
        "verified": True,
        "priority": 15,
        "push": True,
    },
    {
        "slug": "pepites",
        "label": "Pépites méconnues",
        "icon": "compass",
        "kind": "evergreen",
        "rule": "pepites",
        "params": {"min_rating": 8.5},
        "explain": "Bon hôtel, bon prix, routes un peu moins battues cette semaine.",
        "verified": True,
        "priority": 70,
        "push": False,
    },
    {
        "slug": "il-fera-beau",
        "label": "Il fera beau",
        "icon": "thermometer",
        "kind": "evergreen",
        "rule": "il_fera_beau",
        "params": {"winter_min_c": 18, "summer_min_c": 24},
        "explain": "Températures agréables prévues sur les dates du séjour.",
        # Lot D: flip live with DEALS_WEATHER_ENABLED=true (horizon ~7j, LiteAPI only)
        "verified": False,
        "priority": 60,
        "push": True,
    },
    {
        "slug": "hors-vacances",
        "label": "Hors vacances scolaires",
        "icon": "luggage",
        "kind": "evergreen",
        "rule": "hors_vacances",
        "params": {},
        "explain": "Dates hors vacances A/B/C — souvent plus calme, parfois moins cher.",
        "verified": True,
        "priority": 65,
        "push": False,
        "chip": False,  # hidden from Inspire-toi rail
    },
    # —— Seasonal (launch set late Oct 2026) ——
    {
        "slug": "ambiance-noel",
        "label": "Marchés de Noël",
        "icon": "tree",
        "kind": "seasonal",
        "promote_from": "10-15",  # MM-DD each year
        "stay_month_range": [11, 12],
        "stay_day_from": (11, 20),
        "stay_day_to": (12, 23),
        "rule": "whitelist_iata",
        "params": {"iatas": sorted(AMBIANCE_NOEL_IATA)},
        "explain": "City-trips d’hiver : lumières, vin chaud et ambiance de fêtes.",
        "verified": True,
        "priority": 12,
        "push": True,
    },
    {
        "slug": "pont-noel",
        "label": "Week-end de Noël",
        "icon": "bridge",
        "kind": "seasonal",
        "promote_from_weeks_before": 10,
        "rule": "pont_noel",
        "params": {},
        "explain": "Autour du 25 décembre quand le calendrier fait le pont pour toi.",
        "verified": True,
        "priority": 11,
        "push": True,
    },
    {
        "slug": "nouvel-an",
        "label": "Nouvel An ailleurs",
        "icon": "champagne",
        "kind": "seasonal",
        "promote_from": "10-15",
        "rule": "covers_nye",
        "params": {},
        "explain": "Sur place pour la nuit du 31 — change de décor pour le compte à rebours.",
        "verified": True,
        "priority": 12,
        "push": True,
    },
    {
        "slug": "hiver-soleil",
        "label": "Fuyez l’hiver",
        "icon": "sun",
        "kind": "seasonal",
        "promote_months": [11, 12, 1, 2, 3],
        "rule": "whitelist_iata",
        "params": {"iatas": sorted(HIVER_SOLEIL_IATA)},
        "explain": "Cap au sud : soleil d’hiver sur des destinations qu’on dessert vraiment.",
        "verified": True,
        "priority": 14,
        "push": True,
    },
    {
        "slug": "nuits-polaires",
        "label": "Nuits polaires",
        "icon": "moon",
        "kind": "seasonal",
        "promote_months": [11, 12, 1, 2, 3],
        "rule": "whitelist_iata",
        "params": {"iatas": sorted(NUITS_POLAIRES_IATA)},
        "explain": "Nord de l’Europe : nuits longues, ambiance hivernale, vols depuis la France.",
        "verified": True,
        "priority": 80,
        "push": False,
    },
]


def occasion_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    for o in OCCASIONS:
        if o.get("slug") == slug:
            return o
    return None


def launch_chip_slugs() -> List[str]:
    """Default main-row order for late Oct (max 6)."""
    return [
        "sans-conge",
        "ambiance-noel",
        "pont-noel",
        "nouvel-an",
        "hiver-soleil",
        "moins-200",
    ]


def pick_badge(tags: List[str], *, has_discount_badge: bool = False) -> Optional[str]:
    """
    One occasion badge. Reduction badge (UI) still wins over all occasions.
    """
    if has_discount_badge or not tags:
        return None
    ranked = sorted(
        tags,
        key=lambda s: BADGE_PRIORITY.get(s, 999),
    )
    return ranked[0] if ranked else None
