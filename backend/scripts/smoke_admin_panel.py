"""Smoke import + ops whitelist (no HTTP auth). Run: python -m scripts.smoke_admin_panel"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    from admin_panel.ops import list_ops_jobs, OPS_JOBS
    from admin_panel.agents import list_agents
    from admin_panel.production import status_probe
    from admin_panel.routes import router

    jobs = list_ops_jobs()
    assert jobs["ok"] and len(jobs["jobs"]) == len(OPS_JOBS)
    agents = list_agents()
    assert agents["ok"] and len(agents["agents"]) >= 1
    status = status_probe()
    assert "checks" in status
    paths = {getattr(r, "path", None) for r in router.routes}
    for needed in (
        "/api/admin/overview",
        "/api/admin/ops/deals/{job_id}",
        "/api/admin/agents",
        "/api/admin/status",
        "/api/admin/store/config",
    ):
        assert needed in paths, f"missing route {needed}"
    print("smoke_admin_panel OK", len(router.routes), "routes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
