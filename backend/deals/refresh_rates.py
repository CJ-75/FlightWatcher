"""
CLI: refresh hotel_rates_cache.

  cd backend
  python -m deals.refresh_rates
  python -m deals.refresh_rates --slug lisbonne --force
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env, override=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh hotel rates cache")
    parser.add_argument("--slug", help="Only one destination slug")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore TTL / is_due",
    )
    args = parser.parse_args(argv)

    from deals.hotel_rates import refresh_hotel_rates
    from deals.liteapi_config import load_deals_config
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        print("ERROR: Supabase non configuré", file=sys.stderr)
        return 1
    supabase = get_supabase_service_client()
    if not supabase:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY manquante", file=sys.stderr)
        return 1

    cfg = load_deals_config()
    if not cfg.api_key:
        print("ERROR: Clé LiteAPI manquante", file=sys.stderr)
        return 1

    slugs = [args.slug] if args.slug else None
    summary = refresh_hotel_rates(
        supabase, cfg=cfg, slugs=slugs, force=args.force
    )
    try:
        from deals.price_alerts import run_price_alerts

        summary["price_alerts"] = run_price_alerts(supabase)
    except Exception as e:
        summary["price_alerts_error"] = str(e)
    print(json.dumps(summary, indent=2, default=str))
    return 0 if summary.get("errors", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
