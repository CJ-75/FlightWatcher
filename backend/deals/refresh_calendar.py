"""
CLI: refresh deal_calendar_cache (min-rates × 8 week-ends, TTL 12 h).

  cd backend
  python -m deals.refresh_calendar
  python -m deals.refresh_calendar --slug lisbonne --force
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
    parser = argparse.ArgumentParser(description="Refresh deal weekend calendar cache")
    parser.add_argument("--slug", help="Only one destination slug")
    parser.add_argument("--origin", help="Only one origin IATA")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore 12h TTL",
    )
    args = parser.parse_args(argv)

    from deals.calendar import refresh_deal_calendar
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
    origins = [args.origin] if args.origin else None
    summary = refresh_deal_calendar(
        supabase, cfg=cfg, slugs=slugs, origins=origins, force=args.force
    )
    print(json.dumps(summary, indent=2, default=str))
    return 0 if summary.get("errors", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
