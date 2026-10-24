"""
CLI: compare liked deal prices vs cache and email drops ≥ threshold.

  cd backend
  python -m deals.check_price_alerts
  python -m deals.check_price_alerts --dry-run
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
    parser = argparse.ArgumentParser(description="Check liked-deal price alerts")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute notifications without sending / updating",
    )
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args(argv)

    from deals.price_alerts import run_price_alerts
    from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client

    if not SUPABASE_AVAILABLE:
        print("ERROR: Supabase non configuré", file=sys.stderr)
        return 1
    supabase = get_supabase_service_client()
    if not supabase:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY manquante", file=sys.stderr)
        return 1

    summary = run_price_alerts(
        supabase, dry_run=args.dry_run, limit=args.limit
    )
    print(json.dumps(summary, indent=2, default=str))
    return 0 if summary.get("errors", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
