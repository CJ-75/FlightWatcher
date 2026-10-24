"""Verbose scan / inspire terminal logs (always flushed to the backend terminal)."""
from __future__ import annotations

import logging
import sys
from typing import Any, Optional, Sequence

# Uvicorn shows this logger in the same terminal as INFO: lines
_logger = logging.getLogger("flightwatcher.scan")
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)
    _logger.propagate = False


def slog(msg: str = "", *args: Any) -> None:
    """Print one line to the backend terminal immediately (stdout + stderr + logger)."""
    if args:
        text = msg % args if "%" in msg else " ".join([msg, *[str(a) for a in args]])
    else:
        text = str(msg)

    def _safe_write(stream) -> None:
        try:
            print(text, flush=True, file=stream)
        except UnicodeEncodeError:
            enc = getattr(stream, "encoding", None) or "utf-8"
            safe = text.encode(enc, errors="replace").decode(enc, errors="replace")
            print(safe, flush=True, file=stream)
        except Exception:
            pass

    _safe_write(sys.stdout)
    _safe_write(sys.stderr)
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    try:
        _logger.info(text)
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
    extra = f" ... +{len(dates) - 8}" if len(dates) > 8 else ""
    slog(f"  {label}: {len(dates)} -> {', '.join(parts)}{extra}")


def slog_provider_results(
    counts: dict,
    *,
    merged_n: int,
    origin: str = "?",
    elapsed_s: float = 0.0,
    pending_names: Optional[Sequence[str]] = None,
) -> None:
    """ASCII summary — visible even on Windows CP1252 consoles."""
    ry = counts.get("ryanair")
    tp = counts.get("travelpayouts")
    slog("")
    slog("-" * 56)
    slog(f"RESULTS PROVIDERS | {origin} | {elapsed_s:.1f}s")
    if ry is None:
        slog("  Ryanair       : (pending / skip)")
    else:
        slog(f"  Ryanair       : {ry} roundtrips")
    if tp is None:
        slog("  Travelpayouts : (pending / skip)")
    else:
        slog(f"  Travelpayouts : {tp} roundtrips")
    for name, n in sorted((counts or {}).items()):
        if name in ("ryanair", "travelpayouts"):
            continue
        slog(f"  {name:<14}: {n} roundtrips")
    slog(f"  => Merged     : {merged_n} roundtrips")
    if pending_names:
        slog(f"  still running : {', '.join(pending_names)}")
    slog("-" * 56)
    slog("")
