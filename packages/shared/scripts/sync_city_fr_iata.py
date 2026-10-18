"""Sync packages/shared CITY_FR_BY_IATA from backend/city_names_fr.py."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from city_names_fr import CITY_FR_BY_IATA  # noqa: E402

CITIES_TS = ROOT / "packages" / "shared" / "src" / "cities.ts"


def main() -> None:
    lines = ["const CITY_FR_BY_IATA: Record<string, string> = {"]
    for k in sorted(CITY_FR_BY_IATA.keys()):
        lines.append(f"  {json.dumps(k)}: {json.dumps(CITY_FR_BY_IATA[k], ensure_ascii=False)},")
    lines.append("}")
    block = "\n".join(lines)

    text = CITIES_TS.read_text(encoding="utf-8")
    new, n = re.subn(
        r"const CITY_FR_BY_IATA: Record<string, string> = \{.*?\n\}",
        block,
        text,
        count=1,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit(f"replace failed n={n}")
    CITIES_TS.write_text(new, encoding="utf-8", newline="\n")
    print(f"synced {len(CITY_FR_BY_IATA)} IATA → city into {CITIES_TS}")


if __name__ == "__main__":
    main()
