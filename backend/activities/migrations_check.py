"""schema_migrations boot check — Lot A."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.migrations_check")

# Required after Lot A (extend as lots land)
REQUIRED_MIGRATIONS: List[str] = [
    "apply_activities_lot_a_migration.sql",
]

_last_status: Dict[str, Any] = {
    "ok": True,
    "missing": [],
    "checked": False,
    "error": None,
}


def get_migrations_status() -> Dict[str, Any]:
    return dict(_last_status)


def check_schema_migrations(supabase) -> Dict[str, Any]:
    """Compare REQUIRED_MIGRATIONS vs schema_migrations table."""
    global _last_status
    if not supabase:
        _last_status = {
            "ok": False,
            "missing": list(REQUIRED_MIGRATIONS),
            "checked": True,
            "error": "no_supabase",
        }
        return _last_status
    try:
        res = (
            supabase.table("schema_migrations")
            .select("id")
            .in_("id", REQUIRED_MIGRATIONS)
            .execute()
        )
        found = {str(r.get("id")) for r in (res.data or [])}
        missing = [m for m in REQUIRED_MIGRATIONS if m not in found]
        ok = len(missing) == 0
        _last_status = {
            "ok": ok,
            "missing": missing,
            "checked": True,
            "error": None,
        }
        if not ok:
            logger.error(
                "schema_migrations missing: %s — apply manually in Supabase SQL editor",
                ", ".join(missing),
            )
        return _last_status
    except Exception as e:
        # Table may not exist yet
        _last_status = {
            "ok": False,
            "missing": list(REQUIRED_MIGRATIONS),
            "checked": True,
            "error": str(e),
        }
        logger.error(
            "schema_migrations check failed: %s — apply apply_activities_lot_a_migration.sql",
            e,
        )
        return _last_status


def warn_on_boot(supabase) -> None:
    st = check_schema_migrations(supabase)
    if not st.get("ok"):
        print(
            "❌ Activities migrations manquantes: "
            + ", ".join(st.get("missing") or [])
            + " — applique le SQL dans Supabase (never db push)"
        )
    else:
        print("✅ Activities schema_migrations OK")
