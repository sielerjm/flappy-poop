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


def villi_band(d, x0, x1, y_base, height, up, rng, min_frac=0.55, wave=None, tile_w=720):
    """Draw a fringe of finger-like villi between x0..x1. up=True grows upward from y_base.
    Each finger is height × uniform(min_frac, 1) long; pick height / min_frac so the far,
    rounded ends land past the image edge or behind a strip (villi, not teeth). The near
    (lumen-side) ends sit 20 px past y_base plus `wave` = (amp, periods, phase): a sine along
    x with a whole number of periods per tile_w (so the horizontal tile seam matches), plus a
    little per-finger jitter, so the tips undulate instead of lining up on a ruler."""
    amp, periods, phase = wave or (0, 1, 0)
    x = x0
    while x < x1:
        w = rng.randint(28, 48)
        h = int(height * rng.uniform(min_frac, 1.0))
        xc = x + w / 2
        o = amp * math.sin(2 * math.pi * periods * xc / tile_w + phase) + (rng.uniform(-amp, amp) * 0.15 if amp else 0)
        if up:
            box = (x, y_base - h, x + w, y_base + 20 + o)
        else:
            box = (x, y_base - 20 - o, x + w, y_base + h)
        d.rounded_rectangle(box, radius=w // 2, fill=VILLI, outline=VILLI_DARK, width=3)
        x += w + rng.randint(3, 8)


FRONT_WAVE = (8, 5, math.pi / 2)  # shallow undulation of the strips' finger tips (±8 px, 5 waves per tile)
BACK_WAVE = (24, 3, 0.0)  # deeper undulation of the fringes' tips (±24 px, 3 waves per tile)
TIP_ZONE = 16  # px of the strips' lumen-side edge left for the undulating tips (2 × the front amplitude)
BAR_FRAC = 0.85  # the cream bars end at this share of the shortest tip's reach from the screen edge, so every tip extends past them
BACKDROP_FADE = 0.95  # share of the cream backdrop's depth (from its lumen edge inward) over which it fades to transparent; the rest, at the screen edge, is solid


def backdrop(d, w, y0, y1, toward_lumen):
    """The cream mucosa backdrop between rows y0..y1, fading linearly to transparent over
    BACKDROP_FADE of its depth so its lumen-side edge is not a hard cut. toward_lumen is +1
    when the lumen is below (the top backdrop), −1 when it is above (the bottom one). Drawn
    first onto the transparent canvas, so the rows' alphas are written as is."""
    depth = y1 - y0
    fade = depth * BACKDROP_FADE
    for y in range(y0, y1):
        d_lumen = (y1 - y) if toward_lumen > 0 else (y - y0 + 1)  # rows from the lumen edge, 1-based
        a = 255 if d_lumen > fade else int(round(255 * d_lumen / fade))
        d.line((0, y, w, y), fill=CREAM[:3] + (a,))


def ceiling_strip(d, w, strip_h=128, cream_h=16):
    """The ground strip's vertical mirror, baked into the overlay's top edge: a dark band, a
    cream line along its lower edge ending at BAR_FRAC of the shortest tip (so every tip
    extends past it), and fingers growing up from the TIP_ZONE whose tips undulate shallowly
    (same seed as the ground so the two rows read as one gut wall). Background only: pipes
    and the poop draw over it, so the ceiling kill line and the gap margin stay as they are."""
    tips = strip_h - TIP_ZONE  # the shortest front tip's reach from the top edge
    bar = round(BAR_FRAC * tips)
    d.rectangle((0, 0, w, bar - cream_h), fill=VILLI_DARK)
    d.rectangle((0, bar - cream_h, w, bar), fill=CREAM)
    # Tips in [tips, strip_h]; far ends run past the top edge (≥ 144 px from the base): no rounded tops on screen.
    villi_band(d, -40, w + 40, tips - 20 + TIP_ZONE / 2, 240, up=True, rng=random.Random(11), min_frac=0.6, wave=FRONT_WAVE, tile_w=w)


def villi(path, w=720, h=1280):
    """Transparent overlay: a cream mucosa backdrop from each screen edge to BAR_FRAC of the
    shortest fringe tip, fading to transparent toward the lumen (BACKDROP_FADE; behind
    everything: the strips and the fringes draw over it), the
    villi fringes, and the ceiling strip (the ground's mirror) along the top edge. The level
    colour shows through from the backdrop's edge to the lumen (the game draws a solid
    rectangle under the overlay)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Fringes ~175 px (~14 % each end; a third shorter than the first cut) so the open lumen stays clear.
    # Every finger is ≥ 0.75 × fringe = 131 px, which still reaches behind the strips' dark bands.
    fringe = 175
    cream_h = 28
    top_base = fringe + cream_h // 2
    bot_base = h - fringe - cream_h // 2
    # The backdrop ends short of the shortest tip (base + 20 − amplitude), so no tip lines up with its edge.
    amp = BACK_WAVE[0]
    top_bar = round(BAR_FRAC * (top_base + 20 - amp))
    bot_bar = h - round(BAR_FRAC * (h - (bot_base - 20 + amp)))
    backdrop(d, w, 0, top_bar, +1)
    backdrop(d, w, bot_bar, h, -1)
    # villi fringes (drawn wider than the image so the horizontal tile edge matches); every finger
    # is ≥ 131 px so its rounded far end sits behind the ceiling strip / the ground strip, and the
    # tips undulate ±24 px around the backdrop's edge (BACK_WAVE).
    villi_band(d, -40, w + 40, top_base, fringe, up=True, rng=random.Random(7), min_frac=0.75, wave=BACK_WAVE, tile_w=w)
    villi_band(d, -40, w + 40, bot_base, fringe, up=False, rng=random.Random(7), min_frac=0.75, wave=BACK_WAVE, tile_w=w)
    # Front row at the top, in front of the fringe, as ground.png is in front of the bottom one.
    ceiling_strip(d, w)
    img.save(path)


def ground(path, w=720, h=128):
    """The floor strip, the ceiling strip's mirror: transparent at the top (the overlay's cream
    backdrop shows through) down to the cream line, which ends BAR_FRAC of the shortest tip
    from the bottom edge so every tip extends past it; then the dark band. The fingers' tips
    undulate in the top TIP_ZONE; their far ends run past the bottom edge."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bar = round(BAR_FRAC * (h - TIP_ZONE))  # from the bottom edge
    d.rectangle((0, h - bar, w, h - bar + 16), fill=CREAM)
    d.rectangle((0, h - bar + 16, w, h), fill=VILLI_DARK)
    villi_band(d, -40, w + 40, TIP_ZONE + 20 - TIP_ZONE / 2, 240, up=False, rng=random.Random(11), min_frac=0.6, wave=FRONT_WAVE, tile_w=w)
    img.save(path)


if __name__ == "__main__":
    # poop.png and the icons are Michael's drawings (tools/process_art.py). Do not overwrite them.
    pipe(OUT / "pipe.png")
    villi(OUT / "villi.png")
    ground(OUT / "ground.png")
    for f in ["pipe.png", "villi.png", "ground.png"]:
        im = Image.open(OUT / f)
        print(f"{f}: {im.width}x{im.height}")
