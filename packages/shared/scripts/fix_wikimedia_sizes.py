"""Rewrite Wikimedia thumb URLs to an allowed size (see https://w.wiki/GHai)."""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "src" / "cityImages.ts"
UA = "FlightWatcher/1.0 (https://github.com/local; city image fix)"

# Wikimedia now only serves a fixed set of widths; 640 is a common allowed size.
TARGET = 640


def check(url: str) -> bool:
    req = urllib.request.Request(
        url, method="GET", headers={"User-Agent": UA, "Accept": "image/*"}
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status == 200 and bool(r.read(32))
    except Exception:
        return False


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    text2 = re.sub(r"/\d+px-", f"/{TARGET}px-", text)
    PATH.write_text(text2, encoding="utf-8", newline="\n")

    urls = list(dict.fromkeys(re.findall(r"https://thumb\.wikimedia\.org[^\"\s]+", text2)))
    # probe a few candidates if 640 fails
    sample = urls[:5]
    ok = sum(1 for u in sample if check(u))
    print(f"rewrote to {TARGET}px; sample {ok}/{len(sample)} ok")
    if ok < len(sample):
        for size in (320, 330, 440, 500, 960, 1280):
            trial = [re.sub(r"/\d+px-", f"/{size}px-", u) for u in sample]
            tok = sum(1 for u in trial if check(u))
            print(f"  try {size}px → {tok}/{len(trial)}")
            if tok == len(trial):
                fixed = re.sub(r"/\d+px-", f"/{size}px-", text2)
                PATH.write_text(fixed, encoding="utf-8", newline="\n")
                print(f"fixed all to {size}px")
                return
    print("done", PATH)


if __name__ == "__main__":
    main()
