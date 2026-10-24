"""
CLI: seed destinations + bootstrap hotel pools.

  cd backend
  python -m deals.bootstrap_pools
  python -m deals.bootstrap_pools --slug lisbonne
  python -m deals.bootstrap_pools --seed-only
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env when run as module
_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap LiteAPI hotel pools")
    parser.add_argument("--slug", help="Only one destination slug")
    parser.add_argument(
        "--seed-only",
        action="store_true",
        help="Upsert destinations only (no LiteAPI)",
    )
    args = parser.parse_args(argv)

    from deals.hotel_pool import bootstrap_hotel_pools, upsert_destinations
    from deals.liteapi_config import load_deals_config
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        print("ERROR: Supabase non configuré", file=sys.stderr)
        return 1
    supabase = get_supabase_service_client()
    if not supabase:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY manquante", file=sys.stderr)
        return 1

    if args.seed_only:
        rows = upsert_destinations(supabase)
        print(json.dumps({"upserted": len(rows), "slugs": [r.get("slug") for r in rows]}, indent=2))
        return 0

    cfg = load_deals_config()
    if not cfg.api_key:
        print(
            "ERROR: Clé LiteAPI manquante (LITEAPI_API_KEY_SANDBOX / _PROD)",
            file=sys.stderr,
        )
        return 1

    slugs = [args.slug] if args.slug else None
    summary = bootstrap_hotel_pools(supabase, cfg=cfg, slugs=slugs)
    print(json.dumps(summary, indent=2, default=str))
    return 0 if summary.get("errors", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
