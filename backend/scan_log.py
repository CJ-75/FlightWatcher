"""Verbose scan / inspire terminal logs (always flushed)."""
from __future__ import annotations

import sys
from typing import Any, Optional, Sequence


def slog(msg: str = "", *args: Any) -> None:
    """Print one line to the backend terminal immediately."""
    if args:
        text = msg % args if "%" in msg else " ".join([msg, *[str(a) for a in args]])
    else:
        text = str(msg)
    print(text, flush=True)
    try:
        sys.stdout.flush()
    except Exception:
        pass


def slog_banner(title: str) -> None:
    slog("")
    slog("=" * 56)
    slog(title)
    slog("=" * 56)


def slog_dates(label: str, dates: Optional[Sequence[Any]]) -> None:
    if not dates:
        slog(f"  {label}: (aucune)")
        return
    parts = []
    for d in dates[:8]:
        if hasattr(d, "date"):
            parts.append(str(d.date)[:10])
        elif isinstance(d, dict):
            parts.append(str(d.get("date") or "")[:10])
        else:
            parts.append(str(d)[:10])
    extra = f" … +{len(dates) - 8}" if len(dates) > 8 else ""
    slog(f"  {label}: {len(dates)} → {', '.join(parts)}{extra}")
