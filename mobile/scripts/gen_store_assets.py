"""Generate placeholder WayPop store icons / splash (navy #0B1F33)."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "assets"
NAVY = (11, 31, 51, 255)
INNER = (20, 48, 74, 255)
WHITE = (255, 255, 255, 255)
ACCENT = (232, 120, 72, 255)


def make_icon(size: int, path: Path) -> None:
    img = Image.new("RGBA", (size, size), NAVY)
    d = ImageDraw.Draw(img)
    m = int(size * 0.18)
    d.ellipse([m, m, size - m, size - m], fill=INNER)
    cx, cy = size // 2, size // 2
    s = int(size * 0.22)
    pts = [
        (cx - s, cy + int(s * 0.55)),
        (cx + s, cy),
        (cx - s, cy - int(s * 0.55)),
    ]
    d.polygon(pts, fill=WHITE)
    r = max(4, size // 48)
    d.ellipse(
        [cx + int(s * 0.55), cy - r, cx + int(s * 0.55) + 2 * r, cy + r],
        fill=ACCENT,
    )
    img.save(path, "PNG")
    print("wrote", path, img.size)


def make_splash(w: int, h: int, path: Path) -> None:
    img = Image.new("RGBA", (w, h), NAVY)
    mark_size = 512
    mark = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(mark)
    d.ellipse([40, 40, 472, 472], fill=INNER)
    cx, cy, s = 256, 256, 110
    pts = [
        (cx - s, cy + int(s * 0.55)),
        (cx + s, cy),
        (cx - s, cy - int(s * 0.55)),
    ]
    d.polygon(pts, fill=WHITE)
    d.ellipse([cx + 70, cy - 10, cx + 90, cy + 10], fill=ACCENT)
    img.paste(mark, ((w - mark_size) // 2, (h - mark_size) // 2), mark)
    img.save(path, "PNG")
    print("wrote", path, img.size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_icon(1024, OUT / "icon.png")
    make_icon(1024, OUT / "adaptive-icon.png")
    make_splash(1284, 2778, OUT / "splash.png")


if __name__ == "__main__":
    main()
