"""
CLI: canonical windows + deal_flight_cache refresh.

  cd backend
  python -m deals.refresh_flights
  python -m deals.refresh_flights --slug lisbonne --origin BVA
  python -m deals.refresh_flights --windows-only
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
    parser = argparse.ArgumentParser(description="Refresh deal flight cache")
    parser.add_argument("--slug", help="Only one destination slug")
    parser.add_argument("--origin", help="Only one origin IATA")
    parser.add_argument(
        "--windows-only",
        action="store_true",
        help="Upsert deal_windows only (no scanner)",
    )
    args = parser.parse_args(argv)

    from deals.liteapi_config import load_deals_config
    from deals.windows import canonical_windows, upsert_windows
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        print("ERROR: Supabase non configuré", file=sys.stderr)
        return 1
    supabase = get_supabase_service_client()
    if not supabase:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY manquante", file=sys.stderr)
        return 1

    cfg = load_deals_config()
    windows = canonical_windows(cfg.weekends_ahead, kinds=cfg.window_kinds)
    upserted = upsert_windows(supabase, windows)

    if args.windows_only:
        print(
            json.dumps(
                {"windows": [w["id"] for w in upserted or windows]},
                indent=2,
            )
        )
        return 0

    from deals.flight_cache import refresh_deal_flights

    slugs = [args.slug] if args.slug else None
    origins = [args.origin.strip().upper()] if args.origin else None
    summary = refresh_deal_flights(
        supabase, cfg=cfg, origins=origins, slugs=slugs
    )
    print(json.dumps(summary, indent=2, default=str))
    return 0 if summary.get("errors", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
