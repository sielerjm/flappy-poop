#!/usr/bin/env python3
"""process_art.py — crop, knock out white, and resize Michael's drawings
into the gameplay art-contract PNGs.

Created by Michael Sieler. Last updated: 2026-11-01.

Input:  assets/src/{Poop_Emoji_Alive,Poop_Emoji_Dead,Fiber,Good_Bacteria,Bad_Bacteria}.png
Output: assets/{poop,poop-dead,fiber,probiotic,bacteria}.png at 48x48 RGBA.

Alive and dead poop share one trimmed canvas (union of both bounding boxes)
so the sprite does not jump on death. Items are trimmed independently.
"""
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "src"
OUT = ROOT / "assets"
SIZE = 48
WHITE_CUTOFF = 245  # RGB at or above this (and not already transparent) becomes alpha 0
PAD = 4  # px of source padding kept around the ink after trim


def knock_white(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()

    def cut(ch):
        return ch.point(lambda v: 255 if v >= WHITE_CUTOFF else 0)

    white = ImageChops.multiply(ImageChops.multiply(cut(r), cut(g)), cut(b))
    return Image.merge("RGBA", (r, g, b, ImageChops.subtract(a, white)))


def content_bbox(im: Image.Image):
    extra = im.split()[-1].point(lambda v: 255 if v > 8 else 0)
    return extra.getbbox()


def crop_to_bbox(im: Image.Image, bbox, pad=PAD) -> Image.Image:
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_on_square(im: Image.Image, canvas: int) -> Image.Image:
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(im, ((canvas - im.width) // 2, (canvas - im.height) // 2), im)
    return out


def scale_to(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def process_pair(alive_path: Path, dead_path: Path):
    alive = knock_white(Image.open(alive_path))
    dead = knock_white(Image.open(dead_path))
    ba = content_bbox(alive)
    bd = content_bbox(dead)
    if not ba or not bd:
        raise SystemExit("poop source has no visible ink")
    union = (
        min(ba[0], bd[0]),
        min(ba[1], bd[1]),
        max(ba[2], bd[2]),
        max(ba[3], bd[3]),
    )
    a = crop_to_bbox(alive, union)
    d = crop_to_bbox(dead, union)
    side = max(a.width, a.height, d.width, d.height)
    a = scale_to(fit_on_square(a, side), SIZE)
    d = scale_to(fit_on_square(d, side), SIZE)
    a.save(OUT / "poop.png")
    d.save(OUT / "poop-dead.png")
    print(f"poop.png: {a.size}  poop-dead.png: {d.size}")


def process_item(src: Path, dest_name: str):
    im = knock_white(Image.open(src))
    bbox = content_bbox(im)
    if not bbox:
        raise SystemExit(f"{src.name} has no visible ink")
    im = crop_to_bbox(im, bbox)
    side = max(im.width, im.height)
    im = scale_to(fit_on_square(im, side), SIZE)
    dest = OUT / dest_name
    im.save(dest)
    print(f"{dest_name}: {im.size}")


if __name__ == "__main__":
    process_pair(SRC / "Poop_Emoji_Alive.png", SRC / "Poop_Emoji_Dead.png")
    process_item(SRC / "Fiber.png", "fiber.png")
    process_item(SRC / "Good_Bacteria.png", "probiotic.png")
    process_item(SRC / "Bad_Bacteria.png", "bacteria.png")
