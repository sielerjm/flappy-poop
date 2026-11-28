#!/usr/bin/env python3
"""advent_puzzle.py: cut Michael's Advent picture into a puzzle sheet and its check sheets (plan 17, step 2.13; jigsaw
pieces: plan 56, steps 1.1 and 1.2).

The picture is fitted to cols x cell by rows x cell, split into cols x rows square frames in reading order
(cell c is column c % cols, row c // cols) and written out with the release order: piece k (released on
k December) fills the cell order[k - 1]. Nothing here touches src/ or assets/; the sheets are for Michael's
review and for the later step that copies the frames into the game.

Run:    uv run --with pillow python3 tools/advent_puzzle.py --src PICTURE.png --out DIR \
            --cols 4 --rows 6 --cell 332 --order 7,14,4,18,17,22,12,10,20,3,23,19,8,13,1,0,11,16,21,9,15,2,5,6 \
            [--pad] [--colours 256] [--selftest]
        jigsaw: the same, plus --shape jigsaw [--pad-px N] [--seed 20261201] [--widen 1] [--tab 0.33]
            [--max-kb 600] [--star-r 48]; see "Jigsaw mode" below
        --src       the picture (any size; RGB or RGBA)
        --out       output folder (created if missing)
        --cols, --rows, --cell   the grid and the frame side in px
        --order     comma list, cols x rows entries, a permutation of 0..cols*rows-1: entry k-1 is the cell
                    that piece k fills
        --pad       a picture smaller than the grid is padded with its edge colour (default: only crops;
                    a smaller picture then fails)
        --colours   write advent-puzzle.png with this many colours (octree with k-means, Floyd-Steinberg; 256
                    takes the shipped sheet from 1.9 MB to about 0.43 MB with no visible change; plan 17, 2.15)
        --selftest  run the real arguments and three broken inputs (a repeated --order number, a sheet one
                    pixel too narrow, an output pixel with alpha 0); exit 0 only if the real run passes and
                    every broken input is caught

Fit: a larger picture is centre-cropped (an odd surplus puts the extra pixel on the right or bottom); under
--pad a smaller one is padded with the edge colour (the mean colour of the outermost 1 px border). Any alpha
is flattened onto that edge colour, so every output has alpha 255 everywhere.

Output (all in --out):
  advent-puzzle.png     the fitted picture as frames in cell order, cols*cell x rows*cell, no gaps
  contact-numbered.png  the same grid with each cell's number (0..cols*rows-1) and thin cell borders
  release-map.png       the same grid with each cell labelled by the day its piece releases ("k Dec")
  compare.png           the picture re-assembled cell by cell from advent-puzzle.png beside the plain fitted
                        picture with the cell grid over it, a small gap and a caption on each
Requires Pillow only. Exit 0 if every check passed, otherwise 1 with the reason.

Checks (the real run and the self-test call the same functions):
  - --order has cols*rows entries and is a permutation of 0..cols*rows-1;
  - advent-puzzle.png is exactly cols*cell x rows*cell;
  - no output pixel has alpha below 255;
  - the frames rebuilt from advent-puzzle.png equal the fitted picture, pixel for pixel.

Jigsaw mode (--shape jigsaw; plan 56). Each frame is the cell plus pad_px on every side (frame = cell + 2 x pad_px),
in the same reading order, cut from the same fitted picture, so the picture under every tab is the true picture.
Outside its piece a frame is alpha 0. Every internal edge gets one tab (its side, its place in the middle third of the
edge, its size and lean drawn from --seed; the same seed gives the same bytes); the grid's outer edges are flat.
Each piece's mask is widened by --widen px so two antialiased cut edges never leave a hairline seam. The alpha rules
invert: alpha 0 outside the piece, 255 in its core. With --colours the sheet is quantized with its alpha kept, the
picture first, so no core pixel lands at 254 and the picture bands no more than the rect sheet: colours - 33 entries
for the picture (the shipped octree call on the picture alone, each opaque pixel taking the picture's own index), 32
for the antialiased edge pixels (the octree on them alone), 1 clear (see quantize_alpha).
        --shape     rect (default: the square cells above, unchanged) or jigsaw
        --pad-px    texture px of see-through margin around each cell, even (default: the smallest even number that
                    holds the tallest tab, its antialiased pixel, the widen and 2 px of margin; the run reports it).
                    Not --pad, which pads a too-small picture (above)
        --seed      the tabs' seed (default 20261201, the release order's seed)
        --widen     px each piece's mask grows by against seams (default 1)
        --tab       the tallest tab as a share of the cell (default 0.33, the 25 Nov trial's 110 px on 333)
        --max-kb    budget for the written advent-puzzle.png in KB (default 600)
        --star-r    radius in texture px of the star's disc that must be solid, centred STAR_INSET px in from the
                    cell's top and right edges (default 48)
Jigsaw outputs: the four above (the labels and compare drawn with the piece outlines), plus
  assembled-dark.png    the frames put back together at 1:1 on the book's panel colour
  assembled-light.png   the same on a light background
  exploded.png          the frames apart, on the panel colour
  silhouettes.png       each piece's alpha as a flat locked shape, in a two-shade checkerboard, put back together
Jigsaw checks (the self-test runs each on the real cut and catches each broken input):
  (1) the sheet is cols x frame by rows x frame, each side at most 4096;
  (2) the same seed twice gives identical masks, another seed different ones;
  (3) the frames put back at their cell origin minus pad_px cover every picture pixel at alpha 255 in at least one
      frame, with the picture's RGB under any alpha above 0 (before quantizing); alpha 255 again on the written sheet;
  (4) alpha 0 more than the tabs' reach outside the cell, and alpha 0 outside the picture (flat outer edges);
  (5) the four corner squares (cell // 3 a side) and the star's disc clipped to the cell at alpha 255 in every frame,
      before quantizing and on the written sheet;
  (6) two neighbours overlap only within the widen band;
  (7) the written sheet is at most --max-kb;
  (8) with --colours, the written sheet's opaque pixels stay within RMSE 3.0 of the picture (no worse banding than
      the rect sheet's 2.46).
"""
import argparse
import hashlib
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat

FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
DARK = (25, 20, 15)
LIGHT = (255, 250, 235)
BORDER = (255, 255, 255)
GAP, CAPTION_H = 40, 72
OUTPUTS = ["advent-puzzle.png", "contact-numbered.png", "release-map.png", "compare.png"]
# Jigsaw mode (plan 56).
JIGSAW_OUTPUTS = OUTPUTS + ["assembled-dark.png", "assembled-light.png", "exploded.png", "silhouettes.png"]
PANEL = (0x1a, 0x0b, 0x14)  # the book's panel (src/scenes/Advent.js)
LOCK_A = (0x2a, 0x14, 0x20)  # TUNING.advent.book.lockFill
LOCK_B = (0x37, 0x1d, 0x2a)  # the second, lighter lock shade (D6 a): 40 % of the way from lockFill to lockLine
MAX_SIDE = 4096  # the largest texture side the game allows (tests/assets.test.js)
STAR_INSET = 36  # texture px: TUNING.advent.book.starInset (18 logical px) at 2x
SUPERSAMPLE = 4  # the masks are drawn at this many times the frame size, then boxed down (antialiased edges)
MAX_RMSE = 3.0  # the quantized picture's largest RMSE from the picture (the 256-colour rect sheet: 2.46)


def font(size):
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


# ---------------------------------------------------------------- checks (shared with --selftest)
def check_order(order, cols, rows):
    """Problems with the order list (empty list if it is a permutation of 0..cols*rows-1)."""
    n = cols * rows
    problems = []
    if len(order) != n:
        problems.append(f"--order has {len(order)} entries, expected {n}")
    seen = set()
    for i, v in enumerate(order):
        if v < 0 or v >= n:
            problems.append(f"--order entry {i + 1} is {v}, outside 0..{n - 1}")
        elif v in seen:
            problems.append(f"--order repeats {v} (entry {i + 1})")
        seen.add(v)
    return problems


def check_size(img, cols, rows, cell, name="sheet"):
    """Problems with a sheet's size (it must be exactly cols*cell x rows*cell)."""
    want = (cols * cell, rows * cell)
    if img.size != want:
        return [f"{name} is {img.size[0]} x {img.size[1]}, expected {want[0]} x {want[1]}"]
    return []


def check_alpha(img, name="image"):
    """Problems with alpha: every pixel must be 255 (an RGB image has none and passes)."""
    if "A" not in img.getbands():
        return []
    lo = img.getchannel("A").getextrema()[0]
    if lo < 255:
        n = sum(img.getchannel("A").histogram()[:255])
        return [f"{name} has {n} pixel(s) with alpha below 255 (lowest {lo})"]
    return []


# ---------------------------------------------------------------- jigsaw checks (plan 56; shared with --selftest)
def frame_side(cell, pad):
    """A jigsaw frame's side: the cell plus pad on every side."""
    return cell + 2 * pad


def sheet_box(c, cols, side):
    """Frame c's box on a sheet of side x side frames in reading order."""
    x, y = (c % cols) * side, (c // cols) * side
    return x, y, x + side, y + side


def frames_of(sheet, cols, rows, side):
    """The sheet's frames in reading order, as RGBA images (a P sheet is decoded through its palette)."""
    s = sheet.convert("RGBA")
    return [s.crop(sheet_box(c, cols, side)) for c in range(cols * rows)]


def count_nonzero(img):
    """Pixels above 0 in an L image."""
    return sum(img.histogram()[1:])


def above_zero(img):
    """An L image's pixels above 0 as 255, the rest 0."""
    return img.point(lambda v: 255 if v else 0)


def masks_digest(masks):
    """One sha256 over every frame mask (size and bytes), in order."""
    h = hashlib.sha256()
    for m in masks:
        h.update(f"{m.size[0]}x{m.size[1]}".encode())
        h.update(m.tobytes())
    return h.hexdigest()


def check_jigsaw_size(img, cols, rows, cell, pad, name="sheet"):
    """(1) The sheet is cols x frame by rows x frame (frame = cell + 2 x pad), each side at most MAX_SIDE."""
    side = frame_side(cell, pad)
    want = (cols * side, rows * side)
    problems = []
    if img.size != want:
        problems.append(f"{name} is {img.size[0]} x {img.size[1]}, expected {want[0]} x {want[1]} "
                        f"(frames of {side} px: cell {cell} + 2 x pad {pad})")
    for label, v in zip(("width", "height"), img.size):
        if v > MAX_SIDE:
            problems.append(f"{name} {label} {v} is over {MAX_SIDE}")
    return problems


def check_seeded(mask_hash, seed):
    """(2) mask_hash(seed) is the digest of a cut's masks: the same seed twice must agree, seed + 1 must differ."""
    a, b, other = mask_hash(seed), mask_hash(seed), mask_hash(seed + 1)
    problems = []
    if a != b:
        problems.append(f"seed {seed} cut twice gives different masks ({a[:12]} vs {b[:12]})")
    if a == other:
        problems.append(f"seeds {seed} and {seed + 1} give the same masks ({a[:12]})")
    return problems


def check_coverage(frames, cols, rows, cell, pad, picture=None, name="frames"):
    """(3) Put back at their cell origin minus pad, the frames cover every picture pixel at alpha 255 in at least one
    frame (two partial edges never add up to a solid pixel on screen: they leave a seam). With `picture`, every frame
    pixel above alpha 0 also carries the picture's RGB there."""
    side = frame_side(cell, pad)
    W, H = cols * cell, rows * cell
    cover = Image.new("L", (W + 2 * pad, H + 2 * pad), 0)
    padded = None
    if picture is not None:
        padded = Image.new("RGB", cover.size, (0, 0, 0))
        padded.paste(picture.convert("RGB"), (pad, pad))
    problems = []
    for c, fr in enumerate(frames):
        x, y = (c % cols) * cell, (c // cols) * cell  # the frame's origin on the padded canvas
        box = (x, y, x + side, y + side)
        a = fr.getchannel("A")
        cover.paste(ImageChops.lighter(cover.crop(box), a), box[:2])
        if padded is not None:
            seen = above_zero(a)
            diff = ImageChops.difference(fr.convert("RGB"), padded.crop(box))
            n = sum(count_nonzero(ImageChops.multiply(band, seen)) for band in diff.split())
            if n:
                problems.append(f"{name}: frame {c} has {n} channel value(s) under alpha above 0 that differ from the picture")
    core = cover.crop((pad, pad, pad + W, pad + H))
    lo = core.getextrema()[0]
    if lo < 255:
        n = sum(core.histogram()[:255])
        problems.append(f"{name}: {n} picture pixel(s) at alpha 255 in no frame (lowest {lo}): a seam")
    return problems


def check_outside(frames, cols, rows, cell, pad, reach, name="frames"):
    """(4) Alpha 0 more than `reach` px outside the cell in every frame, at least 2 px of margin left beyond the reach,
    and alpha 0 outside the picture (the grid's outer edges are flat: no tab points out of the picture)."""
    side = frame_side(cell, pad)
    W, H = cols * cell, rows * cell
    problems = []
    if pad - reach < 2:
        problems.append(f"pad {pad} leaves {pad - reach} px beyond the tabs' reach of {reach}; it needs at least 2")
    lo, hi = max(pad - reach, 0), min(pad + cell + reach, side)
    for c, fr in enumerate(frames):
        a = fr.getchannel("A")
        ring = a.copy()
        ring.paste(0, (lo, lo, hi, hi))
        n = count_nonzero(ring)
        if n:
            problems.append(f"{name}: frame {c} has {n} pixel(s) above alpha 0 beyond the reach ({reach} px outside the cell)")
        ox, oy = (c % cols) * cell - pad, (c // cols) * cell - pad  # the frame's origin in picture px
        out = a.copy()
        out.paste(0, (max(0, -ox), max(0, -oy), min(side, W - ox), min(side, H - oy)))
        n = count_nonzero(out)
        if n:
            problems.append(f"{name}: frame {c} has {n} pixel(s) above alpha 0 outside the picture (a tab on an outer edge)")
    return problems


def core_mask(cell, star_r):
    """A cell-sized L mask of what must be solid in every piece: the four corner squares (cell // 3 a side: the tabs
    and blanks sit in the middle third of each edge) and the star's disc (radius star_r, centred STAR_INSET px in from
    the cell's top and right edges) clipped to the cell."""
    m = Image.new("L", (cell, cell), 0)
    d = ImageDraw.Draw(m)
    k = cell // 3
    for x0, y0 in ((0, 0), (cell - k, 0), (0, cell - k), (cell - k, cell - k)):
        d.rectangle((x0, y0, x0 + k - 1, y0 + k - 1), fill=255)
    cx, cy = cell - STAR_INSET, STAR_INSET
    d.ellipse((cx - star_r, cy - star_r, cx + star_r, cy + star_r), fill=255)
    return m


def check_core(frames, cell, pad, star_r, name="frames"):
    """(5) The corner squares and the star's disc clipped to the cell are at alpha 255 in every frame."""
    m = core_mask(cell, star_r)
    problems = []
    for c, fr in enumerate(frames):
        a = fr.getchannel("A").crop((pad, pad, pad + cell, pad + cell))
        short = ImageChops.multiply(a.point(lambda v: 255 if v < 255 else 0), m)
        n = count_nonzero(short)
        if n:
            lo = ImageChops.lighter(a, ImageChops.invert(m)).getextrema()[0]
            problems.append(f"{name}: frame {c} has {n} corner or star pixel(s) below alpha 255 (lowest {lo})")
    return problems


def check_overlap(frames, cols, rows, cell, pad, widen, name="frames"):
    """(6) Two neighbours overlap only within the widen band: each frame's alpha-above-0 shape, eroded by
    2 x widen + 2 px, never meets its right or lower neighbour's alpha above 0, nor the other way round."""
    side = frame_side(cell, pad)
    k = 2 * widen + 2
    solid = [above_zero(fr.getchannel("A")) for fr in frames]
    inner = [s.filter(ImageFilter.MinFilter(2 * k + 1)) for s in solid]
    problems = []
    for c in range(cols * rows):
        cx, cy = c % cols, c // cols
        for dx, dy in ((1, 0), (0, 1)):
            if cx + dx >= cols or cy + dy >= rows:
                continue
            n = c + dx + dy * cols
            for a, b, sx, sy in ((c, n, dx * cell, dy * cell), (n, c, -dx * cell, -dy * cell)):
                there = Image.new("L", (side, side), 0)
                there.paste(solid[b], (sx, sy))  # b's frame in a's frame coordinates
                hit = count_nonzero(ImageChops.multiply(inner[a], there))
                if hit:
                    problems.append(f"{name}: frame {b} reaches {hit} px into frame {a}, deeper than the widen band ({k} px)")
    return problems


def picture_rmse(frames, cols, rows, cell, pad, picture):
    """RMSE over R, G, B between the picture and each frame's alpha-255 pixels inside its own cell."""
    canvas = Image.new("RGB", picture.size)
    cover = Image.new("L", picture.size, 0)
    for c, fr in enumerate(frames):
        own = fr.crop((pad, pad, pad + cell, pad + cell))
        solid = own.getchannel("A").point(lambda v: 255 if v == 255 else 0)
        at = ((c % cols) * cell, (c // cols) * cell)
        canvas.paste(own.convert("RGB"), at, solid)
        cover.paste(solid, at)
    st = ImageStat.Stat(ImageChops.difference(canvas, picture.convert("RGB")), cover)
    return math.sqrt(sum(st.sum2) / (3 * st.count[0])) if st.count[0] else float("inf")


def check_fidelity(frames, cols, rows, cell, pad, picture, max_rmse=MAX_RMSE, name="advent-puzzle.png"):
    """(8) The written sheet's opaque pixels stay within max_rmse of the picture (the 256-colour rect sheet: 2.46)."""
    rmse = picture_rmse(frames, cols, rows, cell, pad, picture)
    if rmse > max_rmse:
        return [f"{name}: its opaque pixels are {rmse:.2f} RMSE from the picture, over {max_rmse} (banding)"]
    return []


def check_kb(path, max_kb, name="advent-puzzle.png"):
    """(7) The written sheet is at most max_kb KB."""
    size = Path(path).stat().st_size
    if size > max_kb * 1024:
        return [f"{name} is {size / 1024:.0f} KB, over the {max_kb} KB budget"]
    return []


# ---------------------------------------------------------------- fitting
def edge_colour(img):
    """Mean RGB colour of the outermost 1 px border."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    pts = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
    pts += [px[0, y] for y in range(1, h - 1)] + [px[w - 1, y] for y in range(1, h - 1)]
    return tuple(round(sum(p[i] for p in pts) / len(pts)) for i in range(3))


def split(diff):
    """Split a surplus or shortfall into (low side, high side); the odd pixel goes to the high side."""
    return diff // 2, diff - diff // 2


def fit(img, want_w, want_h, pad):
    """Fit to want_w x want_h. Returns (RGB image, (left, right, top, bottom), 'crop'|'pad'|'none', flattened)."""
    img = img.convert("RGBA")
    w, h = img.size
    if (w < want_w or h < want_h) and not pad:
        raise SystemExit(f"FAIL: picture is {w} x {h}, smaller than {want_w} x {want_h}; use --pad to pad it")
    edge = edge_colour(img)
    # crop the larger axes
    cl, cr = split(max(w - want_w, 0))
    ct, cb = split(max(h - want_h, 0))
    img = img.crop((cl, ct, w - cr, h - cb))
    # pad the smaller axes
    pl, pr = split(max(want_w - w, 0))
    pt, pb = split(max(want_h - h, 0))
    if pl or pr or pt or pb:
        canvas = Image.new("RGBA", (want_w, want_h), edge + (255,))
        canvas.paste(img, (pl, pt))
        img = canvas
    flattened = sum(img.getchannel("A").histogram()[:255])
    flat = Image.new("RGBA", img.size, edge_colour(img) + (255,))
    flat = Image.alpha_composite(flat, img).convert("RGB")
    if pl or pr or pt or pb:
        how, sides = "pad", (pl, pr, pt, pb)
    elif cl or cr or ct or cb:
        how, sides = "crop", (cl, cr, ct, cb)
    else:
        how, sides = "none", (0, 0, 0, 0)
    return flat, sides, how, flattened


# ---------------------------------------------------------------- drawing
def cell_box(c, cols, cell):
    x, y = (c % cols) * cell, (c // cols) * cell
    return x, y, x + cell, y + cell


def draw_borders(img, cols, rows, cell, width=2):
    d = ImageDraw.Draw(img)
    for c in range(cols * rows):
        x0, y0, x1, y1 = cell_box(c, cols, cell)
        d.rectangle((x0, y0, x1 - 1, y1 - 1), outline=BORDER, width=width)
    return img


def draw_labels(fitted, labels, cols, rows, cell, outlines=None):
    """The grid with one big label per cell (dark text, light halo), thin white cell borders (or, with `outlines`,
    each jigsaw piece's outline)."""
    img = fitted.copy()
    if outlines is None:
        draw_borders(img, cols, rows, cell)
    else:
        draw_outlines(img, outlines)
    d = ImageDraw.Draw(img)
    # The largest size at which the widest label (stroke included) fits 80 % of a cell.
    widest = max(labels, key=len)
    size = int(cell * 0.42)
    while size > 8:
        f = font(size)
        stroke = max(4, size // 9)
        l, t, r, b = d.textbbox((0, 0), widest, font=f, stroke_width=stroke)
        if r - l <= 0.8 * cell:
            break
        size -= 2
    for c, text in enumerate(labels):
        x0, y0, x1, y1 = cell_box(c, cols, cell)
        d.text(((x0 + x1) / 2, (y0 + y1) / 2), text, font=f, fill=DARK, anchor="mm",
               stroke_width=stroke, stroke_fill=LIGHT)
    return img


def rebuild(sheet, cols, rows, cell):
    """Re-assemble the picture cell by cell from the sheet's frames."""
    out = Image.new("RGB", sheet.size)
    for c in range(cols * rows):
        box = cell_box(c, cols, cell)
        out.paste(sheet.crop(box), box[:2])
    return out


def compare_sheet(sheet, fitted, cols, rows, cell):
    built = rebuild(sheet, cols, rows, cell)
    plain = draw_borders(fitted.copy(), cols, rows, cell)
    w, h = fitted.size
    out = Image.new("RGB", (2 * w + GAP, h + CAPTION_H), LIGHT)
    out.paste(built, (0, CAPTION_H))
    out.paste(plain, (w + GAP, CAPTION_H))
    d = ImageDraw.Draw(out)
    f = font(36)
    d.text((w / 2, CAPTION_H / 2), "assembled from the frames", font=f, fill=DARK, anchor="mm")
    d.text((w + GAP + w / 2, CAPTION_H / 2), "fitted picture with the cell grid", font=f, fill=DARK, anchor="mm")
    return out, built


# ---------------------------------------------------------------- the run
def parse_order(text):
    try:
        return [int(t) for t in text.split(",")]
    except ValueError:
        raise SystemExit(f"FAIL: --order must be a comma list of integers, got {text!r}")


def run(src, out_dir, cols, rows, cell, order, pad, colours=0):
    """The real run. Returns a list of problems (empty if every check passed)."""
    problems = check_order(order, cols, rows)
    if problems:
        return problems
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    img = Image.open(src)
    w, h = img.size
    print(f"input:    {src} ({img.mode}, {w} x {h})")
    fitted, (l, r, t, b), how, flattened = fit(img, cols * cell, rows * cell, pad)
    verb = {"crop": "cropped", "pad": "padded", "none": "no crop or pad"}[how]
    print(f"fit:      {verb} left {l}, right {r}, top {t}, bottom {b} px -> {fitted.size[0]} x {fitted.size[1]}")
    print(f"flattened: {flattened} pixel(s) with alpha below 255")

    sheet = fitted.copy()  # frames in cell order: cell c holds the picture's region at cell c
    release = [""] * (cols * rows)
    for k, c in enumerate(order, start=1):
        release[c] = f"{k} Dec"
    compare, built = compare_sheet(sheet, fitted, cols, rows, cell)
    outputs = {
        "advent-puzzle.png": sheet,
        "contact-numbered.png": draw_labels(fitted, [str(c) for c in range(cols * rows)], cols, rows, cell),
        "release-map.png": draw_labels(fitted, release, cols, rows, cell),
        "compare.png": compare,
    }
    problems += check_size(sheet, cols, rows, cell, "advent-puzzle.png")
    for name, im in outputs.items():
        problems += check_alpha(im, name)
    if ImageChops.difference(built, fitted).getbbox() is not None:
        problems.append("the frames rebuilt from advent-puzzle.png differ from the fitted picture")
    if colours:
        q = sheet.quantize(colours, method=Image.Quantize.FASTOCTREE, kmeans=2, dither=Image.Dither.FLOYDSTEINBERG)
        outputs["advent-puzzle.png"] = q
        print(f"colours:  advent-puzzle.png at {colours} colours")
    for name, im in outputs.items():
        path = out_dir / name
        im.save(path, optimize=True)
        print(f"wrote:    {path} ({im.size[0]} x {im.size[1]}, {im.mode})")
    print("order:    piece k (released k Dec) -> cell -> column,row")
    for k, c in enumerate(order, start=1):
        print(f"          piece {k:2d} -> cell {c:2d} -> {c % cols},{c // cols}")
    return problems


def selftest(args, order):
    """The real arguments pass; each broken input must be caught by the same check functions."""
    results = []

    def expect(label, ok, detail=""):
        results.append(ok)
        print(f"selftest: {'ok  ' if ok else 'FAIL'} {label}{(': ' + detail) if detail else ''}")

    real = run(args.src, args.out, args.cols, args.rows, args.cell, order, args.pad, args.colours)
    expect("real arguments pass", not real, "; ".join(real))
    for name in OUTPUTS:
        p = Path(args.out) / name
        expect(f"{name} written", p.is_file())
    sheet_p = Path(args.out) / "advent-puzzle.png"
    if sheet_p.is_file():
        sheet = Image.open(sheet_p)
        expect("advent-puzzle.png is exactly cols*cell x rows*cell",
               sheet.size == (args.cols * args.cell, args.rows * args.cell))
        for name in OUTPUTS:
            p = Path(args.out) / name
            if p.is_file():
                expect(f"{name} has alpha 255 everywhere", not check_alpha(Image.open(p), name))
    else:
        expect("advent-puzzle.png readable", False)
        sheet = Image.new("RGB", (args.cols * args.cell, args.rows * args.cell))

    dup = [order[0], order[0]] + order[2:]
    found = check_order(dup, args.cols, args.rows)
    expect("a repeated --order number is rejected", bool(found), "; ".join(found))

    narrow = sheet.crop((0, 0, sheet.size[0] - 1, sheet.size[1]))
    found = check_size(narrow, args.cols, args.rows, args.cell, "narrow fixture")
    expect("a sheet 1 px too narrow is caught", bool(found), "; ".join(found))

    clear = Image.new("RGBA", (8, 8), (10, 20, 30, 255))
    clear.putpixel((3, 3), (10, 20, 30, 0))
    found = check_alpha(clear, "alpha fixture")
    expect("a pixel at alpha 0 is caught", bool(found), "; ".join(found))
    return all(results)


# ---------------------------------------------------------------- jigsaw cutter (plan 56)
class Cut:
    """One jigsaw cut. masks: the L masks (side x side) in reading order; frames: the same as RGBA (the picture under
    the mask, RGB 0 where alpha is 0); sheet: the frames on one RGBA sheet; pad: the frame margin; side: the frame's
    side; tallest: the tallest tab in px; reach: px the widened masks reach outside their cell; pad_needed: the
    smallest even pad for this cut; outlines: each piece's outline in picture px (for the check sheets)."""

    def __init__(self, **kw):
        self.__dict__.update(kw)


KAPPA = 0.5523  # a quarter circle as one cubic Bezier
BEZIER_STEPS = 24  # points per Bezier segment of a tab's outline
EDGE_MARGIN = 0.012  # of the edge: the gap kept between a tab and the middle third's ends


def bezier(p0, p1, p2, p3, steps=BEZIER_STEPS):
    """Points along a cubic Bezier from p0 (left out) to p3 (included)."""
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        mt = 1 - t
        a, b, c, d = mt * mt * mt, 3 * mt * mt * t, 3 * mt * t * t, t * t * t
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def tab_shape(rng, tab):
    """One internal edge's tab, drawn from rng: (side, height, outline). The outline runs along the edge in edge units
    (u from 0 to 1 along it, v out of it, the edge 1 long): straight, a shoulder into the neck, out to the head's widest
    point, round over the head, and back, then straight to the end. side (+1 or -1) says which neighbour the tab
    belongs to. Every call draws the same seven values in the same order, so one seed gives one puzzle."""
    r = rng.random  # only random(): its sequence for an int seed is the same on every Python 3
    side = 1 if r() < 0.5 else -1
    h = tab * (0.93 + 0.07 * r())  # the tab's height: the tallest is `tab`
    rh = 0.37 * h * (0.95 + 0.10 * r())  # the head's radius (the trial's head: 0.74 of its height across)
    wn = 0.22 * h * (0.92 + 0.16 * r())  # the neck's half-width at its narrowest (the trial's: 0.45 of the height across)
    hn = 0.30 * h * (0.90 + 0.20 * r())  # how far out the neck is narrowest
    lean = 0.04 * h * (2 * r() - 1)  # the head a little off the neck's centre line
    u0 = 0.5 + 0.04 * (2 * r() - 1)  # the tab's place along the edge
    wb = wn + 0.12 * h  # where the shoulder leaves the edge
    half = max(wb, rh + abs(lean))  # the tab's half-width along the edge
    u0 = min(max(u0, 1 / 3 + EDGE_MARGIN + half), 2 / 3 - EDGE_MARGIN - half)  # inside the middle third: corners solid
    hc = h - rh  # the head's centre
    k1, k2, k3, kr = 0.6 * (wb - wn), 0.6 * hn, 0.55 * (hc - hn), KAPPA * rh
    A, B = (u0 - wb, 0.0), (u0 - wn, hn)
    C, T, D = (u0 + lean - rh, hc), (u0 + lean, h), (u0 + lean + rh, hc)
    E, F = (u0 + wn, hn), (u0 + wb, 0.0)
    pts = [(0.0, 0.0), A]
    pts += bezier(A, (A[0] + k1, 0.0), (B[0], B[1] - k2), B)
    pts += bezier(B, (B[0], B[1] + k3), (C[0], C[1] - k3), C)
    pts += bezier(C, (C[0], C[1] + kr), (T[0] - kr, T[1]), T)
    pts += bezier(T, (T[0] + kr, T[1]), (D[0], D[1] + kr), D)
    pts += bezier(D, (D[0], D[1] - k3), (E[0], E[1] + k3), E)
    pts += bezier(E, (E[0], E[1] - k2), (F[0] - k1, 0.0), F)
    pts.append((1.0, 0.0))
    return side, h, pts


def jigsaw_edges(cols, rows, cell, rng, tab):
    """Every internal edge's curve in picture px, drawn from rng in a fixed order (the horizontal edges row by row,
    then the vertical ones column by column). h[(i, j)]: between rows j and j + 1 in column i, left to right;
    v[(i, j)]: between columns i and i + 1 in row j, top to bottom. Returns (h, v, the tallest tab in px)."""
    h, v, tallest = {}, {}, 0.0
    for j in range(rows - 1):
        for i in range(cols):
            side, th, pts = tab_shape(rng, tab)
            h[(i, j)] = [((i + u) * cell, (j + 1 + side * w) * cell) for u, w in pts]
            tallest = max(tallest, th * cell)
    for i in range(cols - 1):
        for j in range(rows):
            side, th, pts = tab_shape(rng, tab)
            v[(i, j)] = [((i + 1 + side * w) * cell, (j + u) * cell) for u, w in pts]
            tallest = max(tallest, th * cell)
    return h, v, tallest


def piece_outline(i, j, cols, rows, cell, h, v):
    """Cell (i, j)'s outline in picture px, clockwise: top, right, bottom, left (outer edges straight)."""
    x0, y0, x1, y1 = i * cell, j * cell, (i + 1) * cell, (j + 1) * cell
    top = [(x0, y0), (x1, y0)] if j == 0 else h[(i, j - 1)]
    right = [(x1, y0), (x1, y1)] if i == cols - 1 else v[(i, j)]
    bottom = [(x1, y1), (x0, y1)] if j == rows - 1 else h[(i, j)][::-1]
    left = [(x0, y1), (x0, y0)] if i == 0 else v[(i - 1, j)][::-1]
    return top + right[1:] + bottom[1:] + left[1:-1]


def jigsaw_cut(fitted, cols, rows, cell, pad, seed, widen, tab, rng_factory=random.Random):
    """Cut the fitted picture into jigsaw frames (see Cut). pad None takes the smallest even pad the cut needs."""
    rng = rng_factory(seed)
    h, v, tallest = jigsaw_edges(cols, rows, cell, rng, tab)
    reach = int(-(-tallest // 1)) + 1 + widen  # the tallest tab rounded up, its antialiased pixel, the widen
    pad_needed = reach + 2 + (reach % 2)  # 2 px of clear margin, made even
    if pad is None:
        pad = pad_needed
    if pad < pad_needed:
        raise ValueError(f"--pad-px {pad} is under the {pad_needed} px this cut needs (reach {reach} + 2)")
    side = frame_side(cell, pad)
    W, H = cols * cell, rows * cell
    padded = Image.new("RGBA", (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    padded.paste(fitted.convert("RGBA"), (pad, pad))
    clear = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sheet = Image.new("RGBA", (cols * side, rows * side), (0, 0, 0, 0))
    masks, frames, outlines = [], [], []
    S = SUPERSAMPLE
    for c in range(cols * rows):
        i, j = c % cols, c // cols
        ox, oy = i * cell - pad, j * cell - pad  # the frame's origin in picture px
        outline = piece_outline(i, j, cols, rows, cell, h, v)
        outlines.append(outline)
        big = Image.new("L", (side * S, side * S), 0)
        ImageDraw.Draw(big).polygon([((x - ox) * S, (y - oy) * S) for x, y in outline], fill=255)
        mask = big.resize((side, side), Image.Resampling.BOX)
        if widen:
            mask = mask.filter(ImageFilter.MaxFilter(2 * widen + 1))
        inside = Image.new("L", (side, side), 0)  # the picture's part of the frame: flat outer edges
        inside.paste(255, (max(0, -ox), max(0, -oy), min(side, W - ox), min(side, H - oy)))
        mask = ImageChops.multiply(mask, inside)
        frame = padded.crop((i * cell, j * cell, i * cell + side, j * cell + side))
        frame.putalpha(mask)
        frame = Image.composite(frame, clear, above_zero(mask))  # RGB 0 wherever alpha is 0
        masks.append(mask)
        frames.append(frame)
        sheet.paste(frame, sheet_box(c, cols, side)[:2])
    return Cut(masks=masks, frames=frames, sheet=sheet, pad=pad, side=side, tallest=tallest, reach=reach,
               pad_needed=pad_needed, outlines=outlines)


EDGE_COLOURS = 32  # palette entries kept for the antialiased edge pixels (the rest go to the picture, one to clear)


def quantize_alpha(cut, picture, cols, rows, cell, colours):
    """The cut's sheet at `colours` colours with its alpha kept, the picture first. Quantizing the RGBA sheet in one
    go gave the thin antialiased edge ring (about 2 % of the pixels) 113 of 256 entries and the picture only 142, so the
    picture banded more than today's sheet (RMSE 3.7 against 2.5) and no pixel stayed at 255. Instead: the picture
    alone through the shipped call (octree, k-means 2) at colours - EDGE_COLOURS - 1 entries, every alpha-255 pixel
    taking the picture's own index at that spot (each frame pixel is the picture's pixel there); the edge pixels
    (alpha 1 to 254) through the octree on their own at EDGE_COLOURS entries; alpha 0 on one clear entry. So the core
    stays at 255 and the outside at 0 by construction. Returns (P image, a note)."""
    sheet, pad, side = cut.sheet, cut.pad, cut.side
    alpha = sheet.getchannel("A")
    edge_flags = alpha.point(lambda v: 255 if 0 < v < 255 else 0).tobytes()
    edge_at = []
    at = edge_flags.find(b"\xff")
    while at != -1:
        edge_at.append(at)
        at = edge_flags.find(b"\xff", at + 1)
    n_edge = EDGE_COLOURS if edge_at else 0
    pic = picture.quantize(colours - n_edge - 1, method=Image.Quantize.FASTOCTREE, kmeans=2)
    pic_pal = pic.getpalette("RGB")
    n_pic = len(pic_pal) // 3
    W, H = picture.size
    padded = Image.new("L", (W + 2 * pad, H + 2 * pad), 0)
    padded.paste(Image.frombytes("L", pic.size, pic.tobytes()), (pad, pad))
    index = Image.new("L", sheet.size, 0)
    for c in range(cols * rows):
        i, j = c % cols, c // cols
        index.paste(padded.crop((i * cell, j * cell, i * cell + side, j * cell + side)), sheet_box(c, cols, side)[:2])
    edge_entries, edge_index = [], b""
    if edge_at:
        rgba = sheet.tobytes()
        strip = Image.frombytes("RGBA", (len(edge_at), 1), b"".join(rgba[4 * p:4 * p + 4] for p in edge_at))
        eq = strip.quantize(n_edge, method=Image.Quantize.FASTOCTREE, kmeans=2)
        ep = eq.getpalette("RGBA")
        edge_entries = [tuple(ep[k:k + 4]) for k in range(0, len(ep), 4)][:n_edge]
        edge_index = eq.tobytes()
    clear = n_pic + len(edge_entries)
    data = bytearray(Image.composite(index, Image.new("L", sheet.size, clear), above_zero(alpha)).tobytes())
    for k, p in enumerate(edge_at):
        data[p] = n_pic + edge_index[k]
    out = Image.frombytes("P", sheet.size, bytes(data))
    entries = [tuple(pic_pal[k:k + 3]) + (255,) for k in range(0, 3 * n_pic, 3)] + edge_entries + [(0, 0, 0, 0)]
    out.putpalette([x for e in entries for x in e], rawmode="RGBA")
    note = f"{n_pic} picture entries, {len(edge_entries)} for {len(edge_at)} edge pixels, 1 clear"
    return out, note


def draw_outlines(img, outlines, width=2):
    """Each piece's outline as a thin white line."""
    d = ImageDraw.Draw(img)
    for o in outlines:
        d.line(o + [o[0]], fill=BORDER, width=width, joint="curve")
    return img


def assemble(cut, cols, rows, cell, background, margin=24, fill=None):
    """The frames put back at their cell origin minus pad on `background`, `margin` px around the picture. fill (a
    function of the cell) paints each piece in one colour from its alpha instead of the picture."""
    W, H, p = cols * cell, rows * cell, cut.pad
    canvas = Image.new("RGBA", (W + 2 * p, H + 2 * p), background + (255,))
    for c, fr in enumerate(cut.frames):
        if fill is not None:
            fr = Image.new("RGBA", fr.size, fill(c) + (255,))
            fr.putalpha(cut.masks[c])
        canvas.alpha_composite(fr, ((c % cols) * cell, (c // cols) * cell))
    m = min(margin, p)
    return canvas.crop((p - m, p - m, p + W + m, p + H + m)).convert("RGB")


def exploded_sheet(cut, cols, rows, gap=24):
    """The frames apart (each frame's full side, `gap` px between) on the panel colour."""
    s = cut.side
    canvas = Image.new("RGBA", (cols * s + (cols + 1) * gap, rows * s + (rows + 1) * gap), PANEL + (255,))
    for c, fr in enumerate(cut.frames):
        canvas.alpha_composite(fr, (gap + (c % cols) * (s + gap), gap + (c // cols) * (s + gap)))
    return canvas.convert("RGB")


def jigsaw_previews(cut, fitted, cols, rows, cell, order):
    """The jigsaw check sheets (every output but advent-puzzle.png)."""
    release = [""] * (cols * rows)
    for k, c in enumerate(order, start=1):
        release[c] = f"{k} Dec"
    dark = assemble(cut, cols, rows, cell, PANEL)
    built = assemble(cut, cols, rows, cell, PANEL, margin=0)
    plain = draw_outlines(fitted.copy(), cut.outlines)
    w, h = fitted.size
    compare = Image.new("RGB", (2 * w + GAP, h + CAPTION_H), LIGHT)
    compare.paste(built, (0, CAPTION_H))
    compare.paste(plain, (w + GAP, CAPTION_H))
    d = ImageDraw.Draw(compare)
    f = font(36)
    d.text((w / 2, CAPTION_H / 2), "assembled from the frames", font=f, fill=DARK, anchor="mm")
    d.text((w + GAP + w / 2, CAPTION_H / 2), "fitted picture with the piece outlines", font=f, fill=DARK, anchor="mm")
    return {
        "contact-numbered.png": draw_labels(fitted, [str(c) for c in range(cols * rows)], cols, rows, cell, cut.outlines),
        "release-map.png": draw_labels(fitted, release, cols, rows, cell, cut.outlines),
        "compare.png": compare,
        "assembled-dark.png": dark,
        "assembled-light.png": assemble(cut, cols, rows, cell, LIGHT),
        "exploded.png": exploded_sheet(cut, cols, rows),
        "silhouettes.png": assemble(cut, cols, rows, cell, PANEL,
                                    fill=lambda c: LOCK_A if (c % cols + c // cols) % 2 == 0 else LOCK_B),
    }


def run_jigsaw(args, order):
    """The real jigsaw run. Returns (problems, info); info holds the cut, the fitted picture, the written sheet's path
    and its decoded frames."""
    cols, rows, cell = args.cols, args.rows, args.cell
    problems = check_order(order, cols, rows)
    if problems:
        return problems, {}
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    img = Image.open(args.src)
    w, h = img.size
    print(f"input:    {args.src} ({img.mode}, {w} x {h})")
    fitted, (l, r, t, b), how, flattened = fit(img, cols * cell, rows * cell, args.pad)
    verb = {"crop": "cropped", "pad": "padded", "none": "no crop or pad"}[how]
    print(f"fit:      {verb} left {l}, right {r}, top {t}, bottom {b} px -> {fitted.size[0]} x {fitted.size[1]}")
    print(f"flattened: {flattened} pixel(s) with alpha below 255")
    cut = jigsaw_cut(fitted, cols, rows, cell, args.pad_px, args.seed, args.widen, args.tab)
    sw, sh = cut.sheet.size
    print(f"jigsaw:   seed {args.seed}; tallest tab {cut.tallest:.1f} px (--tab {args.tab}); widen {args.widen} px; "
          f"reach {cut.reach} px")
    print(f"pad:      {cut.pad} px (the smallest that fits: {cut.pad_needed}); frames {cut.side} px; sheet {sw} x {sh}")
    problems += check_jigsaw_size(cut.sheet, cols, rows, cell, cut.pad, "the cut sheet")
    problems += check_coverage(cut.frames, cols, rows, cell, cut.pad, fitted, "the cut")
    problems += check_outside(cut.frames, cols, rows, cell, cut.pad, cut.reach, "the cut")
    problems += check_core(cut.frames, cell, cut.pad, args.star_r, "the cut")
    problems += check_overlap(cut.frames, cols, rows, cell, cut.pad, args.widen, "the cut")
    outputs = {"advent-puzzle.png": cut.sheet}
    if args.colours:
        outputs["advent-puzzle.png"], note = quantize_alpha(cut, fitted, cols, rows, cell, args.colours)
        print(f"colours:  advent-puzzle.png at {args.colours} colours; {note}")
    outputs.update(jigsaw_previews(cut, fitted, cols, rows, cell, order))
    for name, im in outputs.items():
        path = out_dir / name
        im.save(path, optimize=True)
        print(f"wrote:    {path} ({im.size[0]} x {im.size[1]}, {im.mode})")
    sheet_path = out_dir / "advent-puzzle.png"
    written = Image.open(sheet_path)
    wf = frames_of(written, cols, rows, cut.side)
    problems += check_jigsaw_size(written, cols, rows, cell, cut.pad, "advent-puzzle.png")
    problems += check_coverage(wf, cols, rows, cell, cut.pad, None, "advent-puzzle.png")
    problems += check_outside(wf, cols, rows, cell, cut.pad, cut.reach, "advent-puzzle.png")
    problems += check_core(wf, cell, cut.pad, args.star_r, "advent-puzzle.png")
    problems += check_kb(sheet_path, args.max_kb)
    if args.colours:
        problems += check_fidelity(wf, cols, rows, cell, cut.pad, fitted)
    kb = sheet_path.stat().st_size / 1024
    print(f"size:     advent-puzzle.png {kb:.0f} KB (before oxipng); texture {sw * sh * 4 / 1e6:.1f} MB as RGBA; "
          f"picture RMSE {picture_rmse(wf, cols, rows, cell, cut.pad, fitted):.2f}")
    return problems, {"cut": cut, "fitted": fitted, "sheet": sheet_path, "frames": wf}


def selftest_jigsaw(args, order):
    """The real jigsaw arguments pass every check; each broken input must be caught by the same check functions."""
    cols, rows, cell = args.cols, args.rows, args.cell
    results = []

    def report(label, ok, detail):
        results.append(ok)
        print(f"selftest: {'ok  ' if ok else 'FAIL'} {label}{(': ' + detail) if detail else ''}")

    def case(label, fn):
        """A check on the real cut: ok when it finds no problem."""
        try:
            found = fn()
            report(label, not found, "; ".join(found[:3]))
        except Exception as e:  # the cutter's stub raises until step 1.2
            report(label, False, f"{type(e).__name__}: {e}")

    def caught(label, fn):
        """A broken input: ok when the check finds a problem."""
        try:
            found = fn()
            report(label, bool(found), "; ".join(found[:2]) if found else "not caught")
        except Exception as e:
            report(label, False, f"{type(e).__name__}: {e}")

    state = {}

    def real():
        if "error" in state:
            raise state["error"]
        if "info" not in state:
            try:
                state["problems"], state["info"] = run_jigsaw(args, order)
            except Exception as e:
                state["error"] = e
                raise
        return state["info"]

    def fitted():
        if "fitted" not in state:
            state["fitted"] = fit(Image.open(args.src), cols * cell, rows * cell, args.pad)[0]
        return state["fitted"]

    def recut(**kw):
        """The real cut again with some arguments changed (same pad as the real cut)."""
        base = dict(pad=real()["cut"].pad, seed=args.seed, widen=args.widen, tab=args.tab)
        base.update(kw)
        rng = base.pop("rng_factory", random.Random)
        return jigsaw_cut(fitted(), cols, rows, cell, base["pad"], base["seed"], base["widen"], base["tab"], rng)

    def cut():
        return real()["cut"]

    def written():
        return real()["frames"]

    # The real arguments.
    case("real arguments pass", lambda: real() and state["problems"])
    for name in JIGSAW_OUTPUTS:
        case(f"{name} written", lambda name=name: [] if (Path(args.out) / name).is_file() else [f"{name} missing"])
    case("(1) advent-puzzle.png is cols x frame by rows x frame, each side at most 4096",
         lambda: check_jigsaw_size(Image.open(real()["sheet"]), cols, rows, cell, cut().pad, "advent-puzzle.png"))
    case(f"(2) seed {args.seed} cut twice gives the same masks, seed {args.seed + 1} different ones",
         lambda: check_seeded(lambda s: masks_digest(recut(seed=s).masks), args.seed))
    case("(3) the cut covers every picture pixel at alpha 255 with the picture's RGB",
         lambda: check_coverage(cut().frames, cols, rows, cell, cut().pad, fitted(), "the cut"))
    case("(3) the written sheet covers every picture pixel at alpha 255",
         lambda: check_coverage(written(), cols, rows, cell, cut().pad, None, "advent-puzzle.png"))
    case("(4) alpha 0 beyond the reach and outside the picture, in the cut",
         lambda: check_outside(cut().frames, cols, rows, cell, cut().pad, cut().reach, "the cut"))
    case("(4) alpha 0 beyond the reach and outside the picture, on the written sheet",
         lambda: check_outside(written(), cols, rows, cell, cut().pad, cut().reach, "advent-puzzle.png"))
    case(f"(5) corners and the star's disc (r {args.star_r}) at alpha 255, in the cut",
         lambda: check_core(cut().frames, cell, cut().pad, args.star_r, "the cut"))
    case(f"(5) corners and the star's disc (r {args.star_r}) at alpha 255, on the written sheet",
         lambda: check_core(written(), cell, cut().pad, args.star_r, "advent-puzzle.png"))
    case("(6) neighbours overlap only within the widen band",
         lambda: check_overlap(cut().frames, cols, rows, cell, cut().pad, args.widen, "the cut"))
    case(f"(7) advent-puzzle.png within {args.max_kb} KB", lambda: check_kb(real()["sheet"], args.max_kb))
    case(f"(8) the written sheet's opaque pixels within RMSE {MAX_RMSE} of the picture",
         lambda: check_fidelity(written(), cols, rows, cell, cut().pad, fitted()))

    # Broken inputs, each caught by the check named.
    caught("(3) a mask not widened (--widen 0) leaves a seam",
           lambda: check_coverage(recut(widen=0).frames, cols, rows, cell, cut().pad, fitted(), "widen 0"))

    def beyond():
        frames = [f.copy() for f in written()]
        frames[5].putpixel((1, cut().side // 2), (200, 120, 60, 255))
        return check_outside(frames, cols, rows, cell, cut().pad, cut().reach, "beyond fixture")
    caught("(4) an opaque pixel beyond the reach", beyond)

    def narrow():
        s = Image.open(real()["sheet"])
        return check_jigsaw_size(s.crop((0, 0, s.size[0] - 1, s.size[1])), cols, rows, cell, cut().pad, "narrow fixture")
    caught("(1) a sheet 1 px too narrow", narrow)

    def outer_tab():
        frames = [f.copy() for f in written()]
        a = frames[0].getchannel("A")  # cell 0: its top and left edges are the picture's
        p = cut().pad
        ImageDraw.Draw(a).ellipse((p - 30, p + cell // 2 - 20, p - 4, p + cell // 2 + 20), fill=255)
        frames[0].putalpha(a)
        return check_outside(frames, cols, rows, cell, p, cut().reach, "outer-tab fixture")
    caught("(4) a tab on an outer edge (inside the reach, outside the picture)", outer_tab)

    caught("(2) a seed that does not reproduce (an unseeded random)",
           lambda: check_seeded(lambda s: masks_digest(recut(seed=s, rng_factory=lambda _s: random.Random()).masks),
                                args.seed))

    def core_254():
        frames = [f.copy() for f in written()]
        p = cut().pad
        r, g, b, _ = frames[9].getpixel((p + 5, p + 5))
        frames[9].putpixel((p + 5, p + 5), (r, g, b, 254))
        return check_core(frames, cell, p, args.star_r, "254 fixture")
    caught("(5) a quantized core pixel at 254", core_254)

    def too_wide():
        wide = recut(widen=6, pad=None)  # its own pad: 5 px more reach than the real cut's
        return check_overlap(wide.frames, cols, rows, cell, wide.pad, 1, "widen 6")
    caught("(6) a mask widened too far (6 px against --widen 1)", too_wide)
    caught("(7) a sheet over its budget (1 KB)", lambda: check_kb(real()["sheet"], 1))

    def one_pass():
        q = cut().sheet.quantize(args.colours or 256, method=Image.Quantize.FASTOCTREE, kmeans=2)
        return check_fidelity(frames_of(q, cols, rows, cut().side), cols, rows, cell, cut().pad, fitted(), name="one-pass fixture")
    caught("(8) the sheet quantized in one pass (the edges take the picture's colours)", one_pass)
    return all(results)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--cell", type=int, required=True)
    ap.add_argument("--order", required=True)
    ap.add_argument("--pad", action="store_true")
    ap.add_argument("--colours", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    # Jigsaw mode (plan 56); ignored under --shape rect.
    ap.add_argument("--shape", choices=["rect", "jigsaw"], default="rect")
    ap.add_argument("--pad-px", type=int, default=None)
    ap.add_argument("--seed", type=int, default=20261201)
    ap.add_argument("--widen", type=int, default=1)
    ap.add_argument("--tab", type=float, default=0.33)
    ap.add_argument("--max-kb", type=int, default=600)
    ap.add_argument("--star-r", type=int, default=48)
    args = ap.parse_args()
    order = parse_order(args.order)
    if args.shape == "jigsaw":
        if args.pad_px is not None and (args.pad_px < 0 or args.pad_px % 2):
            raise SystemExit(f"FAIL: --pad-px must be even and at least 0, got {args.pad_px}")
        if args.widen < 0:
            raise SystemExit(f"FAIL: --widen must be at least 0, got {args.widen}")
        if args.selftest:
            ok = selftest_jigsaw(args, order)
            print("selftest: PASS" if ok else "selftest: FAIL")
            return 0 if ok else 1
        problems, _ = run_jigsaw(args, order)
        for p in problems:
            print(f"FAIL: {p}")
        if not problems:
            print("PASS")
        return 1 if problems else 0
    if args.selftest:
        ok = selftest(args, order)
        print("selftest: PASS" if ok else "selftest: FAIL")
        return 0 if ok else 1
    problems = run(args.src, args.out, args.cols, args.rows, args.cell, order, args.pad, args.colours)
    for p in problems:
        print(f"FAIL: {p}")
    if not problems:
        print("PASS")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
