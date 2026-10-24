"""CLI: python -m deals.seed_city_mapping"""
from __future__ import annotations

from deals.city_mapping import upsert_city_mapping


def main() -> None:
    from supabase_deps import get_supabase_client, get_supabase_service_client

    sb = get_supabase_service_client() or get_supabase_client()
    if not sb:
        raise SystemExit("Supabase client unavailable")
    print(upsert_city_mapping(sb))


if __name__ == "__main__":
    main()
