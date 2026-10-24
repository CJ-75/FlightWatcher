"""CLI: python -m deals.backfill_pool_photos [--dry-run] [--limit N]"""
from __future__ import annotations

import argparse
import json

from deals.pool_photos import backfill_pool_photos


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill hotel_pool.main_photo from raw")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--destination-id", default=None)
    args = parser.parse_args()

    from supabase_deps import get_supabase_client, get_supabase_service_client

    sb = get_supabase_service_client() or get_supabase_client()
    out = backfill_pool_photos(
        sb,
        destination_id=args.destination_id,
        limit=args.limit,
        dry_run=args.dry_run,
    )
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
