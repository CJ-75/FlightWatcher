"""
Lot D1 — static carrier baggage policies (no price estimates).

Policies seeded from airline public cabin rules (short FR copy).
updated_at = 2026-10-24 — re-check airline sites before changing wording.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("deals.baggage")

# Sources checked (public fare pages) — keep texts short, no € amounts.
BAGGAGE_SEED: List[Dict[str, Any]] = [
    {
        "carrier_code": "FR",
        "carrier_name": "Ryanair",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Valise cabine et soute en supplément",
        "source_url": "https://www.ryanair.com/fr/fr/planifier-un-voyage/bagages",
    },
    {
        "carrier_code": "RYANAIR",
        "carrier_name": "Ryanair",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Valise cabine et soute en supplément",
        "source_url": "https://www.ryanair.com/fr/fr/planifier-un-voyage/bagages",
    },
    {
        "carrier_code": "U2",
        "carrier_name": "easyJet",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Grand bagage cabine selon le tarif",
        "source_url": "https://www.easyjet.com/fr/aide/bagages/bagages-cabine",
    },
    {
        "carrier_code": "EASYJET",
        "carrier_name": "easyJet",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Grand bagage cabine selon le tarif",
        "source_url": "https://www.easyjet.com/fr/aide/bagages/bagages-cabine",
    },
    {
        "carrier_code": "TO",
        "carrier_name": "Transavia",
        "included_text": "Petit sac à main inclus",
        "cabin_bag_text": "Bagage cabine et soute selon l’option",
        "source_url": "https://www.transavia.com/fr-FR/service/bagages/",
    },
    {
        "carrier_code": "TRANSAVIA",
        "carrier_name": "Transavia",
        "included_text": "Petit sac à main inclus",
        "cabin_bag_text": "Bagage cabine et soute selon l’option",
        "source_url": "https://www.transavia.com/fr-FR/service/bagages/",
    },
    {
        "carrier_code": "VY",
        "carrier_name": "Vueling",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Bagage cabine selon le tarif",
        "source_url": "https://www.vueling.com/fr/voler-avec-vueling/bagages",
    },
    {
        "carrier_code": "VUELING",
        "carrier_name": "Vueling",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Bagage cabine selon le tarif",
        "source_url": "https://www.vueling.com/fr/voler-avec-vueling/bagages",
    },
    {
        "carrier_code": "V7",
        "carrier_name": "Volotea",
        "included_text": "Petit sac à main inclus",
        "cabin_bag_text": "Bagage cabine et soute en option",
        "source_url": "https://www.volotea.com/fr/services-a-bord/bagages/",
    },
    {
        "carrier_code": "VOLOTEA",
        "carrier_name": "Volotea",
        "included_text": "Petit sac à main inclus",
        "cabin_bag_text": "Bagage cabine et soute en option",
        "source_url": "https://www.volotea.com/fr/services-a-bord/bagages/",
    },
    {
        "carrier_code": "W6",
        "carrier_name": "Wizz Air",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Bagage cabine selon le tarif",
        "source_url": "https://www.wizzair.com/fr-fr/information-et-services/bagages",
    },
    {
        "carrier_code": "WIZZ",
        "carrier_name": "Wizz Air",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Bagage cabine selon le tarif",
        "source_url": "https://www.wizzair.com/fr-fr/information-et-services/bagages",
    },
    {
        "carrier_code": "WZZ",
        "carrier_name": "Wizz Air",
        "included_text": "Petit sac sous le siège inclus",
        "cabin_bag_text": "Bagage cabine selon le tarif",
        "source_url": "https://www.wizzair.com/fr-fr/information-et-services/bagages",
    },
]

DEFAULT_BAGGAGE = {
    "included_text": "Bagages selon la compagnie",
    "cabin_bag_text": "",
    "carrier_name": "",
    "line": "Bagages selon la compagnie",
}


def _normalize_carrier(raw: Optional[str]) -> str:
    s = (raw or "").strip().upper()
    if not s:
        return ""
    # "Ryanair", "FR 1234", "FR"
    if "RYANAIR" in s:
        return "FR"
    if "EASYJET" in s or s.startswith("U2"):
        return "U2"
    if "TRANSAVIA" in s:
        return "TO"
    if "VUELING" in s:
        return "VY"
    if "VOLOTEA" in s:
        return "V7"
    if "WIZZ" in s:
        return "W6"
    # IATA 2-letter at start of flight number
    parts = s.replace("-", " ").split()
    code = parts[0] if parts else s
    if len(code) >= 2 and code[:2].isalpha():
        return code[:2]
    return code


def format_baggage_line(policy: Dict[str, Any]) -> str:
    a = (policy.get("included_text") or "").strip()
    b = (policy.get("cabin_bag_text") or "").strip()
    if a and b:
        return f"{a} · {b}"
    return a or b or DEFAULT_BAGGAGE["line"]


def upsert_baggage_policies(supabase) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    n = 0
    for row in BAGGAGE_SEED:
        payload = {**row, "updated_at": now}
        try:
            existing = (
                supabase.table("carrier_baggage_policy")
                .select("carrier_code")
                .eq("carrier_code", row["carrier_code"])
                .limit(1)
                .execute()
            )
            if existing.data:
                supabase.table("carrier_baggage_policy").update(payload).eq(
                    "carrier_code", row["carrier_code"]
                ).execute()
            else:
                supabase.table("carrier_baggage_policy").insert(payload).execute()
            n += 1
        except Exception as e:
            logger.warning("baggage upsert %s: %s", row["carrier_code"], e)
    return {"ok": True, "upserted": n, "updated_at": now}


def lookup_baggage(
    supabase,
    carrier: Optional[str],
) -> Dict[str, Any]:
    code = _normalize_carrier(carrier)
    if not code:
        return {**DEFAULT_BAGGAGE}
    try:
        res = (
            supabase.table("carrier_baggage_policy")
            .select("*")
            .eq("carrier_code", code)
            .limit(1)
            .execute()
        )
        if not res.data:
            # try full name key
            res = (
                supabase.table("carrier_baggage_policy")
                .select("*")
                .eq("carrier_code", (carrier or "").strip().upper())
                .limit(1)
                .execute()
            )
        if res.data:
            row = res.data[0]
            return {
                "carrier_code": row.get("carrier_code"),
                "carrier_name": row.get("carrier_name") or "",
                "included_text": row.get("included_text") or "",
                "cabin_bag_text": row.get("cabin_bag_text") or "",
                "line": format_baggage_line(row),
                "updated_at": row.get("updated_at"),
            }
    except Exception as e:
        logger.debug("lookup_baggage: %s", e)
    # In-memory fallback from seed (DB not seeded yet)
    for row in BAGGAGE_SEED:
        if row["carrier_code"] == code:
            return {
                **row,
                "line": format_baggage_line(row),
            }
    return {**DEFAULT_BAGGAGE}
