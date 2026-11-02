"""Rewrite cityImages.ts Wikimedia thumbs to 1280px (hero-ready)."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "cityImages.ts"
HERO_WIDTH = 1280


def upgrade(url: str) -> str:
    # Wikimedia allows specific widths; 1280px is sharp enough for full-bleed heroes.
    if "wikimedia.org" in url:
        # Handles `/330px-` and `/langfr-330px-` variants.
        url = re.sub(r"\d+px-", f"{HERO_WIDTH}px-", url)
    elif "images.unsplash.com" in url:
        parsed = urlparse(url)
        # Force a larger Unsplash render for fallbacks.
        q = [
            part
            for part in parsed.query.split("&")
            if part and not part.startswith("w=")
        ]
        q.append(f"w={HERO_WIDTH}")
        if not any(p.startswith("q=") for p in q):
            q.append("q=80")
        if not any(p.startswith("auto=") for p in q):
            q.append("auto=format")
        if not any(p.startswith("fit=") for p in q):
            q.append("fit=crop")
        url = urlunparse(parsed._replace(query="&".join(q)))
    parsed = urlparse(url)
    return urlunparse(parsed._replace(query=parsed.query))


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    def repl(m: re.Match[str]) -> str:
        return m.group(1) + upgrade(m.group(2)) + m.group(3)

    new = re.sub(r'(":\s*")(https://[^"]+)(")', repl, text)
    # Also rewrite FALLBACK_* string literals that are not keyed.
    new = re.sub(
        r'(=\s*")(https://[^"]+)(")',
        lambda m: m.group(1) + upgrade(m.group(2)) + m.group(3),
        new,
    )
    PATH.write_text(new, encoding="utf-8", newline="\n")
    print(f"upgraded to {HERO_WIDTH}px →", PATH)


if __name__ == "__main__":
    main()
