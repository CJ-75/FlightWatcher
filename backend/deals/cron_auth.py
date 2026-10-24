"""Shared Bearer CRON_SECRET check for deals batch jobs."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException

CRON_SECRET = (os.getenv("CRON_SECRET") or "").strip()


def require_cron(authorization: Optional[str]) -> None:
    if not CRON_SECRET:
        raise HTTPException(
            status_code=503, detail="CRON_SECRET non configuré sur le serveur"
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer requis")
    token = authorization.replace("Bearer ", "", 1).strip()
    if token != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Secret cron invalide")
