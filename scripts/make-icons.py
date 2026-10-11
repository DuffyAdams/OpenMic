"""Render OpenMic brand assets (launcher icons, Fire TV banner, web touch icon).

Usage: uv run --with pillow python scripts/make-icons.py .
(The banner text uses macOS Avenir Next; elsewhere Pillow falls back to its default font.)
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(sys.argv[1])
RES = ROOT / "apps/fire-tv/app/src/main/res"
WEB = ROOT / "apps/web/static"
BG = (11, 13, 18)
SURFACE = (27, 30, 40)
GOLD = (212, 180, 122)
VIOLET = (182, 160, 239)
TEXT = (244, 241, 236)

def mark(draw, ox, oy, s):
    """Brand mark in a 64-unit box at (ox, oy), scale s px/unit."""
    w = round(4 * s)
    cx, cy, r = ox + 32 * s, oy + 22 * s, 10 * s
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GOLD, width=w)
    pts = [(27, 31), (20, 52), (26, 52), (32, 39), (38, 52), (44, 52), (37, 31)]
    pts = [(ox + x * s, oy + y * s) for x, y in pts]
    draw.line(pts, fill=VIOLET, width=w, joint="curve")
    for p in (pts[0], pts[-1]):
        draw.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=VIOLET)

def icon(size, rounded=True):
    k = 4
    S = size * k
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=SURFACE)
    else:
        d.rectangle([0, 0, S, S], fill=SURFACE)
    pad = S * 0.14
    mark(d, pad, pad, (S - 2 * pad) / 64)
    return img.resize((size, size), Image.LANCZOS)

def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()

def banner():
    k = 4
    W, H = 320 * k, 180 * k
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    g = ImageDraw.Draw(glow)
    g.ellipse([-W * 0.3, -H * 0.8, W * 0.6, H * 0.9], fill=(44, 36, 72))
    g.ellipse([W * 0.55, H * 0.35, W * 1.4, H * 1.8], fill=(52, 42, 24))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(120)), 0.9)
    d = ImageDraw.Draw(img)
    s = 1.55 * k
    mark(d, 14 * k, (H - 64 * s) / 2 + 2 * k, s)
    title = font("/System/Library/Fonts/Avenir Next.ttc", 25 * k, index=2)  # Demi Bold
    sub = font("/System/Library/Fonts/Avenir Next.ttc", 13 * k, index=0)
    x = 110 * k
    d.text((x, 64 * k), "Open", font=title, fill=TEXT)
    ow = d.textlength("Open", font=title)
    d.text((x + ow, 64 * k), "Mic", font=title, fill=GOLD)
    d.text((x + 2 * k, 100 * k), "Scan · Queue · Sing", font=sub, fill=(170, 166, 160))
    return img.resize((320, 180), Image.LANCZOS)

densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for name, px in densities.items():
    icon(px).save(RES / f"mipmap-{name}/ic_launcher.png")
banner().save(RES / "drawable-xhdpi/banner.png")
icon(180, rounded=False).convert("RGB").save(WEB / "apple-touch-icon.png")
icon(512).save(WEB / "icon-512.png")
print("icons written")
