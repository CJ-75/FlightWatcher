"""Check which cityImages.ts URLs fail to load."""
from __future__ import annotations

import re
import urllib.error
import urllib.request
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "src" / "cityImages.ts"
UA = "FlightWatcher/1.0 (https://github.com/local; city image healthcheck)"


def check(url: str) -> tuple[bool, str]:
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": UA, "Accept": "image/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            data = r.read(64)
            ctype = r.headers.get("Content-Type", "")
            if r.status == 200 and data:
                return True, ctype
            return False, f"status={r.status}"
    except Exception as e:
        return False, str(e)[:120]


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    pairs = re.findall(r'"([^"]+)":\s*"(https://[^"]+)"', text)
    # unique by url
    by_url: dict[str, list[str]] = {}
    for key, url in pairs:
        by_url.setdefault(url, []).append(key)

    ok = fail = 0
    fails: list[tuple[str, str, str]] = []
    for i, (url, keys) in enumerate(by_url.items()):
        good, info = check(url)
        if good:
            ok += 1
        else:
            fail += 1
            fails.append((keys[0], info, url))
        if (i + 1) % 20 == 0:
            print(f"... {i+1}/{len(by_url)}")

    print(f"unique_urls={len(by_url)} ok={ok} fail={fail}")
    for key, info, url in fails[:25]:
        print(f"FAIL {key}: {info}")
        print(f"  {url[:140]}")


if __name__ == "__main__":
    main()
