"""Verbose scan / inspire logs — file + console (Windows-safe)."""
from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

_LOG_DIR = Path(__file__).resolve().parent / "logs"
_LOG_FILE = _LOG_DIR / "scan.log"

# Uvicorn / Cursor often miss child-process prints under reload on Windows.
# Always mirror to this file — open it or: Get-Content -Wait backend/logs/scan.log
_logger = logging.getLogger("flightwatcher.scan")
_logger.setLevel(logging.INFO)
_logger.propagate = True  # let uvicorn root handlers show it when possible
if not any(isinstance(h, logging.FileHandler) for h in _logger.handlers):
    try:
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(_LOG_FILE, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))
        _logger.addHandler(fh)
    except Exception:
        pass
if not any(isinstance(h, logging.StreamHandler) for h in _logger.handlers):
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(sh)


def log_path() -> str:
    return str(_LOG_FILE)


def slog(msg: str = "", *args: Any) -> None:
    """One line to scan.log + stderr + stdout (best-effort)."""
    if args:
        text = msg % args if "%" in msg else " ".join([msg, *[str(a) for a in args]])
    else:
        text = str(msg)

    try:
        _logger.info(text)
    except Exception:
        pass

    def _safe_write(stream) -> None:
        try:
            print(text, flush=True, file=stream)
        except UnicodeEncodeError:
            enc = getattr(stream, "encoding", None) or "utf-8"
            safe = text.encode(enc, errors="replace").decode(enc, errors="replace")
            print(safe, flush=True, file=stream)
        except Exception:
            pass

    _safe_write(sys.stderr)
    _safe_write(sys.stdout)
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass

    # Direct append — survives missing logger handlers / reload quirks
    try:
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{ts} {text}\n")
            f.flush()
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
    """Ryanair vs Travelpayouts summary (ASCII — Windows CP1252 safe)."""
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
    slog(f"  (log file: {log_path()})")
    slog("")
