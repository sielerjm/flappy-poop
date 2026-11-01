#!/usr/bin/env python3
"""Generate placeholder art for Flappy Poop.

Each image is sized exactly as listed in assets/README.md. To replace one with
your own drawing, overwrite the file keeping the same name and size, or change
the size in BOTH assets/README.md and the scene code (tests/assets.test.js
checks that the README table matches the PNG headers).

Run:  python3 tools/make_placeholders.py
Requires Pillow. Uses Noto Color Emoji for the poop if present, else draws a blob.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, random

OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)

PINK = (232, 94, 150, 255)
PINK_DARK = (176, 50, 108, 255)
PINK_LIGHT = (248, 160, 200, 255)
PURPLE = (143, 112, 186, 255)
PURPLE_DARK = (108, 80, 150, 255)
VILLI = (236, 140, 160, 255)
VILLI_DARK = (200, 100, 130, 255)
CREAM = (246, 222, 210, 255)


def poop(path, size=48):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    font_path = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
    try:
        # Noto Color Emoji only renders at its bitmap size (109 px); draw big, downscale.
        font = ImageFont.truetype(font_path, 109)
        big = Image.new("RGBA", (136, 136), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        d.text((68, 68), "\U0001F4A9", font=font, embedded_color=True, anchor="mm")
        bbox = big.getbbox()
        big = big.crop(bbox)
        big.thumbnail((size, size), Image.LANCZOS)
        img.paste(big, ((size - big.width) // 2, (size - big.height) // 2), big)
    except Exception:
        d = ImageDraw.Draw(img)
        brown = (120, 72, 40, 255)
        d.ellipse((4, size * 0.45, size - 4, size - 2), fill=brown)
        d.ellipse((size * 0.2, size * 0.2, size * 0.8, size * 0.7), fill=brown)
        d.ellipse((size * 0.38, 2, size * 0.62, size * 0.35), fill=brown)
        d.ellipse((size * 0.3, size * 0.55, size * 0.42, size * 0.68), fill=(255, 255, 255, 255))
        d.ellipse((size * 0.58, size * 0.55, size * 0.7, size * 0.68), fill=(255, 255, 255, 255))
    img.save(path)


def pipe(path, w=64, h=480, cap_h=28):
    """Pink Mario-style column. Cap at the TOP; the scene flips it for the bottom pipe."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # body with simple shading stripes
    d.rectangle((4, cap_h, w - 5, h - 1), fill=PINK)
    d.rectangle((4, cap_h, 10, h - 1), fill=PINK_DARK)
    d.rectangle((12, cap_h, 18, h - 1), fill=PINK_LIGHT)
    d.rectangle((w - 11, cap_h, w - 5, h - 1), fill=PINK_DARK)
    # cap
    d.rounded_rectangle((0, 0, w - 1, cap_h), radius=5, fill=PINK, outline=PINK_DARK, width=2)
    d.rectangle((4, 4, 10, cap_h - 4), fill=PINK_LIGHT)
    img.save(path)


def villi_band(d, x0, x1, y_base, height, up, rng):
    """Draw a fringe of finger-like villi between x0..x1. up=True grows upward from y_base."""
    x = x0
    while x < x1:
        w = rng.randint(8, 14)
        h = int(height * rng.uniform(0.55, 1.0))
        if up:
            box = (x, y_base - h, x + w, y_base + 6)
        else:
            box = (x, y_base - 6, x + w, y_base + h)
        d.rounded_rectangle(box, radius=w // 2, fill=VILLI, outline=VILLI_DARK, width=1)
        x += w + rng.randint(1, 3)


def bg(path, w=360, h=640):
    rng = random.Random(42)
    img = Image.new("RGBA", (w, h), PURPLE)
    d = ImageDraw.Draw(img)
    # mucosa texture: speckles
    for _ in range(600):
        x, y = rng.randrange(w), rng.randrange(h)
        r = rng.randint(1, 4)
        d.ellipse((x, y, x + r, y + r), fill=PURPLE_DARK)
    # cream crypt lines at the band edges
    d.rectangle((0, 110, w, 122), fill=CREAM)
    d.rectangle((0, h - 122, w, h - 110), fill=CREAM)
    # villi fringes (drawn wider than the image so the horizontal tile edge matches)
    villi_band(d, -20, w + 20, 115, 110, up=True, rng=random.Random(7))
    villi_band(d, -20, w + 20, h - 115, 110, up=False, rng=random.Random(7))
    img.save(path)


def ground(path, w=360, h=64):
    img = Image.new("RGBA", (w, h), VILLI_DARK)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, 6), fill=CREAM)
    villi_band(d, -20, w + 20, 8, 56, up=False, rng=random.Random(11))
    img.save(path)


if __name__ == "__main__":
    poop(OUT / "poop.png")
    pipe(OUT / "pipe.png")
    bg(OUT / "bg.png")
    ground(OUT / "ground.png")
    for f in ["poop.png", "pipe.png", "bg.png", "ground.png"]:
        im = Image.open(OUT / f)
        print(f"{f}: {im.width}x{im.height}")
