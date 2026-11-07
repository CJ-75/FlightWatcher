"""Audit CITY_FR_BY_IATA / preferred cities vs CITY_IMAGES coverage."""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
from city_names_fr import CITY_FR_BY_IATA  # noqa: E402

cities_ts = (ROOT / "packages/shared/src/cities.ts").read_text(encoding="utf-8")
images_ts = (ROOT / "packages/shared/src/cityImages.ts").read_text(encoding="utf-8")

# Prefer shared TS CITY_FR if present
m = re.search(r"const CITY_FR_BY_IATA: Record<string, string> = \{(.*?)\n\}", cities_ts, re.S)
iata_to_city: dict[str, str] = {}
if m:
    for line in m.group(1).splitlines():
        mm = re.match(r'\s*"?([A-Z]{3})"?\s*:\s*"([^"]+)"', line)
        if mm:
            iata_to_city[mm.group(1)] = mm.group(2)
else:
    iata_to_city = dict(CITY_FR_BY_IATA)

# PREFERRED from cities.ts
pref_m = re.search(r"export const PREFERRED_CITY_NAMES = \[(.*?)\]", cities_ts, re.S)
preferred: list[str] = []
if pref_m:
    preferred = re.findall(r"'([^']+)'", pref_m.group(1))

img_keys = set(re.findall(r'\n  "([^"]+)":\s*"https://', images_ts))


def city_key(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"[\s_/]+", "-", s)
    s = re.sub(r"[^a-z0-9-]+", "", s)
    return s.strip("-")


# Unique cities from IATA map
cities = sorted({(city_key(v), v) for v in iata_to_city.values()}, key=lambda x: x[0])
missing = [(k, label) for k, label in cities if k not in img_keys]
covered = len(cities) - len(missing)

print(f"IATA cities unique: {len(cities)}")
print(f"CITY_IMAGES keys: {len(img_keys)}")
print(f"covered: {covered}  missing: {len(missing)}")
print("--- missing (sample first 80) ---")
for k, label in missing[:80]:
    print(f"  {k:30} ({label})")

print("--- preferred missing ---")
for label in preferred:
    k = city_key(label)
    if k not in img_keys:
        # also try first token
        head = k.split("-")[0]
        hit = k in img_keys or head in img_keys
        if not hit:
            print(f"  {k:30} ({label})")
