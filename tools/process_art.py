#!/usr/bin/env python3
"""process_art.py — crop, knock out background white, and resize Michael's
drawings into the gameplay art-contract PNGs.

Created by Michael Sieler. Last updated: 2026-11-03 (poop set + bean).

Run:    uv run --with pillow python3 tools/process_art.py   (or any Python with Pillow)
Input:  assets/src/{Poop_Emoji_Alive,Poop_Emoji_Dead,Poop_Stink1,Poop_Stink2,Poop_Fart,
                    Fiber,Good_Bacteria,Bad_Bacteria,Kidney_Bean}.png
Output: assets/{poop,poop-dead,fiber,probiotic,bacteria,bean}.png at 384x384 RGBA and
        assets/{poop-stink1,poop-stink2,poop-fart}.png on larger squares.

Only white connected to the image border is made transparent, so eyes and
mouths stay white. Items are trimmed independently.

The poop set shares ONE body scale: alive + dead define the body box (union of
both bounding boxes, as before). The stink frames are cut on a bigger square
centred on that same body centre, so swapping textures (origin 0.5) never moves
the body. The fart frame's body sits elsewhere on its source canvas (cloud on
the left), so its centre is found with a brown-pixel mask and the square is
centred there; the cloud trails left of the body in the game.
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "src"
OUT = ROOT / "assets"
SIZE = 384
WHITE_CUTOFF = 245  # near-white on the border is treated as background
PAD = 4  # px of source padding kept around the ink after trim


def knock_background(im: Image.Image) -> Image.Image:
    """Make near-white pixels transparent only if they touch the border."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= WHITE_CUTOFF and g >= WHITE_CUTOFF and b >= WHITE_CUTOFF

    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if seen[i] or not is_bg(x, y):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(1, h - 1):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        if x:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)
    return im


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


def brown_bbox(im: Image.Image):
    """Bounding box of the brown body fill (excludes the grey cloud and black lines)."""
    px = im.load()
    w, h = im.size
    l, t, r, b = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            rr, gg, bb, a = px[x, y]
            if a > 0 and rr > gg > bb and rr - bb > 60:
                if x < l:
                    l = x
                if x > r:
                    r = x
                if y < t:
                    t = y
                if y > b:
                    b = y
    return (l, t, r + 1, b + 1) if r >= 0 else None


def crop_centred(im: Image.Image, centre, half: int) -> Image.Image:
    """Square of side 2*half with `centre` (source px) at the canvas centre."""
    cx, cy = centre
    side = 2 * half
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(im, (half - int(round(cx)), half - int(round(cy))), im)
    return out


def frame_half(bbox, centre, pad=PAD) -> int:
    """Smallest half-side of a square centred on `centre` that holds bbox."""
    cx, cy = centre
    l, t, r, b = bbox
    return int(max(cx - l, r - cx, cy - t, b - cy)) + pad


def process_poop_set():
    alive = knock_background(Image.open(SRC / "Poop_Emoji_Alive.png"))
    dead = knock_background(Image.open(SRC / "Poop_Emoji_Dead.png"))
    ba = content_bbox(alive)
    bd = content_bbox(dead)
    if not ba or not bd:
        raise SystemExit("poop source has no visible ink")
    union = (min(ba[0], bd[0]), min(ba[1], bd[1]), max(ba[2], bd[2]), max(ba[3], bd[3]))
    body_centre = ((union[0] + union[2]) / 2, (union[1] + union[3]) / 2)
    body_half = frame_half(union, body_centre)
    k = SIZE / (2 * body_half)  # output px per source px for the whole set

    for src_name, dest in (("Poop_Emoji_Alive.png", "poop.png"), ("Poop_Emoji_Dead.png", "poop-dead.png")):
        im = alive if dest == "poop.png" else dead
        out = scale_to(crop_centred(im, body_centre, body_half), SIZE)
        out.save(OUT / dest)
        print(f"{dest}: {out.size}")

    # Stink frames: same body centre and scale, bigger square for the lines.
    for src_name, dest in (("Poop_Stink1.png", "poop-stink1.png"), ("Poop_Stink2.png", "poop-stink2.png")):
        im = knock_background(Image.open(SRC / src_name))
        bbox = content_bbox(im)
        if not bbox:
            raise SystemExit(f"{src_name} has no visible ink")
        half = frame_half(bbox, body_centre)
        size = int(round(2 * half * k))
        size += size % 2
        out = scale_to(crop_centred(im, body_centre, half), size)
        out.save(OUT / dest)
        print(f"{dest}: {out.size}")

    # Fart frame: body is elsewhere on the canvas; centre on the brown body.
    fart = knock_background(Image.open(SRC / "Poop_Fart.png"))
    body = brown_bbox(fart)
    bbox = content_bbox(fart)
    if not body or not bbox:
        raise SystemExit("Poop_Fart.png has no visible ink")
    fart_centre = ((body[0] + body[2]) / 2, (body[1] + body[3]) / 2)
    half = frame_half(bbox, fart_centre)
    size = int(round(2 * half * k))
    size += size % 2
    out = scale_to(crop_centred(fart, fart_centre, half), size)
    out.save(OUT / "poop-fart.png")
    print(f"poop-fart.png: {out.size}  (body centre {tuple(round(v) for v in fart_centre)} of {fart.size})")


def process_item(src: Path, dest_name: str):
    im = knock_background(Image.open(src))
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
    process_poop_set()
    process_item(SRC / "Fiber.png", "fiber.png")
    process_item(SRC / "Good_Bacteria.png", "probiotic.png")
    process_item(SRC / "Bad_Bacteria.png", "bacteria.png")
    process_item(SRC / "Kidney_Bean.png", "bean.png")
