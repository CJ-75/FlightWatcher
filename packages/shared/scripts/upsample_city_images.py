"""Rewrite cityImages.ts URLs to prefer 800px Wikimedia thumbs without tracking params."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "cityImages.ts"


def upgrade(url: str) -> str:
    # Wikimedia only allows specific widths (see https://w.wiki/GHai).
    # 330px is the size returned by the REST summary API and is reliable.
    url = re.sub(r"/\d+px-", "/330px-", url)
    parsed = urlparse(url)
    # Drop utm_* junk from Wikipedia REST API
    return urlunparse(parsed._replace(query=""))


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def repl(m: re.Match[str]) -> str:
        return m.group(1) + upgrade(m.group(2)) + m.group(3)

    new = re.sub(r'(":\s*")(https://[^"]+)(")', repl, text)
    PATH.write_text(new, encoding="utf-8", newline="\n")
    print("upgraded", PATH)


if __name__ == "__main__":
    main()
