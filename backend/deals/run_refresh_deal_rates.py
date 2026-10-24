"""CLI: python -m deals.run_refresh_deal_rates [--force]"""
from __future__ import annotations

import argparse
import json

from deals.refresh_deal_rates import refresh_deal_rates


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh rates for deals_active dates")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--max-calls", type=int, default=None)
    args = parser.parse_args()

    from supabase_deps import get_supabase_client, get_supabase_service_client

    sb = get_supabase_service_client() or get_supabase_client()
    out = refresh_deal_rates(sb, force=args.force, max_calls=args.max_calls)
    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
