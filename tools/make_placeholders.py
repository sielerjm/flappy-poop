#!/usr/bin/env python3
"""Generate placeholder art for Flappy Poop.

Each image is sized exactly as listed in assets/README.md. To replace one with
your own drawing, overwrite the file keeping the same name and size, or change
the size in BOTH assets/README.md and the scene code (tests/assets.test.js
checks that the README table matches the PNG headers).

Run:  python3 tools/make_placeholders.py
Requires Pillow. Uses Noto Color Emoji for the poop if present, else draws a blob.
Only pipe / villi / ground: the player, items and the app icons come from
tools/process_art.py (Michael's drawings in assets/src/), never from here.
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


def pipe(path, w=128, h=1280, cap_h=56):
    """Pink Mario-style column. Cap at the TOP; the scene flips it for the bottom pipe.

    Height must be >= the playfield (720x1280) so a flipped top pipe always
    reaches the ceiling when the gap sits low.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # body with simple shading stripes
    d.rectangle((8, cap_h, w - 9, h - 1), fill=PINK)
    d.rectangle((8, cap_h, 20, h - 1), fill=PINK_DARK)
    d.rectangle((24, cap_h, 36, h - 1), fill=PINK_LIGHT)
    d.rectangle((w - 21, cap_h, w - 9, h - 1), fill=PINK_DARK)
    # cap
    d.rounded_rectangle((0, 0, w - 1, cap_h), radius=10, fill=PINK, outline=PINK_DARK, width=4)
    d.rectangle((8, 8, 20, cap_h - 8), fill=PINK_LIGHT)
    img.save(path)


def villi_band(d, x0, x1, y_base, height, up, rng):
    """Draw a fringe of finger-like villi between x0..x1. up=True grows upward from y_base."""
    x = x0
    while x < x1:
        w = rng.randint(28, 48)
        h = int(height * rng.uniform(0.55, 1.0))
        if up:
            box = (x, y_base - h, x + w, y_base + 20)
        else:
            box = (x, y_base - 20, x + w, y_base + h)
        d.rounded_rectangle(box, radius=w // 2, fill=VILLI, outline=VILLI_DARK, width=3)
        x += w + rng.randint(3, 8)


def ceiling_strip(d, w, strip_h=128, cream_h=16):
    """The ground strip's vertical mirror, baked into the overlay's top edge: a dark band,
    a cream line along its lower edge, and fingers growing up from it (same seed as the
    ground so the two rows read as one gut wall). Background only: pipes and the poop draw
    over it, so the ceiling kill line and the gap margin stay as they are."""
    d.rectangle((0, 0, w, strip_h), fill=VILLI_DARK)
    d.rectangle((0, strip_h - cream_h, w, strip_h), fill=CREAM)
    villi_band(d, -40, w + 40, strip_h - 20, 108, up=True, rng=random.Random(11))


def villi(path, w=720, h=1280):
    """Transparent overlay: cream bands + villi fringes, plus the ceiling strip (the
    ground's mirror) along the top edge. The level colour shows through everywhere
    else (the game draws a solid rectangle under it)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Fringes ~260px (~20% each end) so the open lumen stays majority clear
    fringe = 260
    cream_h = 28
    top_base = fringe + cream_h // 2
    bot_base = h - fringe - cream_h // 2
    d.rectangle((0, top_base - cream_h // 2, w, top_base + cream_h // 2), fill=CREAM)
    d.rectangle((0, bot_base - cream_h // 2, w, bot_base + cream_h // 2), fill=CREAM)
    # villi fringes (drawn wider than the image so the horizontal tile edge matches)
    villi_band(d, -40, w + 40, top_base, fringe, up=True, rng=random.Random(7))
    villi_band(d, -40, w + 40, bot_base, fringe, up=False, rng=random.Random(7))
    # Front row at the top, in front of the fringe, as ground.png is in front of the bottom one.
    ceiling_strip(d, w)
    img.save(path)


def ground(path, w=720, h=128):
    img = Image.new("RGBA", (w, h), VILLI_DARK)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, 16), fill=CREAM)
    # Fill most of the strip with larger villi fingers
    villi_band(d, -40, w + 40, 20, 108, up=False, rng=random.Random(11))
    img.save(path)


if __name__ == "__main__":
    # poop.png and the icons are Michael's drawings (tools/process_art.py). Do not overwrite them.
    pipe(OUT / "pipe.png")
    villi(OUT / "villi.png")
    ground(OUT / "ground.png")
    for f in ["pipe.png", "villi.png", "ground.png"]:
        im = Image.open(OUT / f)
        print(f"{f}: {im.width}x{im.height}")
