#!/usr/bin/env python3
"""advent_puzzle.py: cut Michael's Advent picture into a puzzle sheet and its check sheets (plan 17, step 2.13).

The picture is fitted to cols x cell by rows x cell, split into cols x rows square frames in reading order
(cell c is column c % cols, row c // cols) and written out with the release order: piece k (released on
k December) fills the cell order[k - 1]. Nothing here touches src/ or assets/; the sheets are for Michael's
review and for the later step that copies the frames into the game.

Run:    uv run --with pillow python3 tools/advent_puzzle.py --src PICTURE.png --out DIR \
            --cols 4 --rows 6 --cell 332 --order 7,14,4,18,17,22,12,10,20,3,23,19,8,13,1,0,11,16,21,9,15,2,5,6 \
            [--pad] [--colours 256] [--selftest]
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
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

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


def draw_labels(fitted, labels, cols, rows, cell):
    """The grid with one big label per cell (dark text, light halo), thin white cell borders."""
    img = fitted.copy()
    draw_borders(img, cols, rows, cell)
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
    args = ap.parse_args()
    order = parse_order(args.order)
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
