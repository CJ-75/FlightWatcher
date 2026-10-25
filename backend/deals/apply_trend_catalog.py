"""
Apply P0–P2 trend destinations into served_cities + seed catalog.

  cd backend
  python -m deals.apply_trend_catalog
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)


def main() -> int:
    from supabase_deps import get_supabase_client, get_supabase_service_client
    from deals.city_mapping import upsert_city_mapping, link_destinations_to_served_cities
    from deals.hotel_pool import upsert_destinations
    from deals.seed_catalog import build_seed_catalog, pin_trend_catalog_cities

    sb = get_supabase_service_client() or get_supabase_client()
    if not sb:
        print(json.dumps({"ok": False, "error": "Supabase unavailable"}))
        return 1

    out = {}
    # 1) Upsert deal_destinations from DESTINATIONS_SEED
    try:
        rows = upsert_destinations(sb)
        out["seed_destinations"] = {"ok": True, "count": len(rows or [])}
    except Exception as e:
        out["seed_destinations"] = {"ok": False, "error": str(e)}

    # 2) City mapping (creates/updates served_cities)
    out["city_mapping"] = upsert_city_mapping(sb)
    try:
        out["link_destinations"] = link_destinations_to_served_cities(sb)
    except Exception as e:
        out["link_destinations"] = {"ok": False, "error": str(e)}

    # 3) Pin curated IATAs
    out["pins"] = pin_trend_catalog_cities(sb)

    # 4) Rebuild ranked catalog (keeps all pins)
    out["catalog"] = build_seed_catalog(sb)

    print(json.dumps(out, indent=2, default=str))
    return 0 if out.get("catalog", {}).get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
