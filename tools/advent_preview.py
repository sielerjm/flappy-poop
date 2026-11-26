#!/usr/bin/env python3
"""advent_preview.py: Gate A mock-up sheets for the December art (plan 17, steps 1.4, 1.5, 2.6a and 2.14).

Composites draft art (fitted December files from meta/advent-previews/art-fit/) onto the real game
art (assets/*.png) at in-game size, on the level colours a run can have, so Michael can approve,
change or cut each piece before it enters assets/advent/. Nothing here touches src/ or assets/;
sheets go to the Dropbox checkout's .claude/plans/17-previews/gateA/ (gitignored).

Run:    ~/.local/bin/uv run --with pillow python3 tools/advent_preview.py [--sheets 1,2,3,7]
        --sheets  comma list of: 1, 2, 3, 7 (step 1.4), pipes (step 1.5), 4 and 5a (step 2.6a), 5 (step 2.14), 9 (step 1b.1),
                  10 (step 1b.2d), or all (default; "all" is the Stage 1 set, 1/2/3/7/pipes: sheets 4, 5a, 5, 9 and 10 are built only when named)
        --art DIR       fitted December art (default <main checkout>/meta/advent-previews/art-fit/)
        --guides DIR    pipe-cap guides (default .../meta/advent-previews/art-guides/)
        --backdrop PNG  sheet 7's ready-screen backdrop (default <out>/backdrop-home-720x1280.png)
        --out DIR       default <main checkout>/.claude/plans/17-previews/gateA/
        --selftest      feed the sheet-1 check a twin shifted by 3 px (and a few other broken inputs, a book tile 6 px off)
                        and exit non-zero, as the checks must; writes nothing
The "main checkout" is found through git's common dir, so a worktree reads the same Dropbox folders.
Every game number (radii, scales, colours, layout) is read from src/config.js, src/logic.js and
tools/make_placeholders.py, so a changed constant changes the sheets and a moved line fails loudly.
Requires Pillow only. Exit 0 only if every check below passed (otherwise 1, with the reasons).
Sheet 10 (step 1b.2d, "Choose your 🎅": twelve mock-ups): the 18 picker emoji are PNGs, a one-off CoreText render kept in
meta/advent-previews/emoji/ (Pillow here has no raqm, so it cannot draw skin tones or ZWJ sequences); `emoji_png` reads them.

Checks (any failure exits non-zero):
  - every sheet is 720 x 1280;
  - sheet 1: for each of the 12 hatted twins, the brown-mask right and bottom edges (the mask of
    tools/process_art.py: r > g > b and r - b > 60), measured from the canvas centre, sit within 1 game
    px of the stock frame's, and the hitbox circle's centre is the canvas centre;
  - sheet 4 (storms over the Stage 1 snow, S8): eight stills (4 options x levels 1 and 5, flakes at t = 1.2 s with
    6 faint trails), two banner sheets and four 36-frame GIFs, all from one seeded simulation (module section
    "step 2.6a"; the model there is what step 2.7 reproduces in the game). Checks: sizes, byte-identical re-render
    (seeded RNG), simulated flake counts 36 / 108 / 180 / 288, gusts (the wind changes sign and spans >= G; exactly 0
    for Light), swirls (>= 5 % of flakes starting within R/2 of a vortex head upward; none of the light flakes does
    in Light or A), the Light control against src/ui/snowfall.js, and a coverage table (pipe gaps and the poop's hitbox);
  - sheet 5a (the Advent piece beside December's pickups): the fitted icon is 192 x 192, has transparent corners
    and keeps its opaque near-white "?" (>= 2 % of the pixels);
  - sheet 5 (the Advent book mock-up, 11 sheets: four book states, three add-piece frames, two home sheets with the button,
    the Daily window with its two marks, the board with an Advent tab; module section "sheet 5"): every sheet is 720 x 1280;
    `check_book_tiles`: each owned piece's 166 px slot matches its puzzle frame (mean absolute difference per channel below 3,
    the star's corner box ignored) and each other slot's centre pixel is the locked fill (42, 20, 32); the piece order is read
    from src/config.js and asserted equal to the copy here;
  - sheet 10 (the picker, the Daily marks and the help card, 12 sheets; named only): every sheet is 720 x 1280; every grid cell and the
    glyph zone are at least 88 x 88; no two of the (?), glyph and X zones overlap; the grid lies inside the picker panel; the help card fits
    y 84 to 1196; twelve PNGs. --selftest feeds an 80 px cell, an 80 px glyph zone and a (?) moved 10 px right into the glyph zone;
  - step 1.5: the printed cream distances (pipe 43 / 35 / 31 / 29 at 55 / 60 / 70 / 80 %; villi
    50 / 21 / 21 / 41 at 40 / 55 / 70 / 80 %) are within 1 of the plan's, and formula V changes no
    pixel that is not the villi fill on villi.png, ceiling.png and ground.png.
"""
import argparse
import math
import random
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
W_PX, H_PX = 720, 1280  # every sheet's size: the phone-size field


def main_checkout():
    """The Dropbox checkout: the parent of git's common dir (a worktree shares it); else this root."""
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                             capture_output=True, text=True, check=True).stdout.strip()
        return Path(out).parent
    except Exception:
        return ROOT


# ---------------------------------------------------------------- numbers read from the game's source
_config = (ROOT / "src/config.js").read_text()
_logic = (ROOT / "src/logic.js").read_text()
_placeholders = (ROOT / "tools/make_placeholders.py").read_text()


def cfg(name):
    """A unique `name: number` entry of src/config.js (fails if it moved or doubled)."""
    found = re.findall(r"\b%s:\s*(-?[0-9]*\.?[0-9]+)" % re.escape(name), _config)
    if len(found) != 1:
        raise SystemExit(f"FAIL: expected one `{name}:` number in src/config.js, found {len(found)}")
    return float(found[0])


def py_colour(name):
    m = re.search(r"^%s\s*=\s*\((\d+),\s*(\d+),\s*(\d+),\s*255\)" % name, _placeholders, re.M)
    if not m:
        raise SystemExit(f"FAIL: {name} not found in tools/make_placeholders.py")
    return tuple(int(v) for v in m.groups())


SPRITE_SCALE = cfg("spriteDisplayScale")  # 192 px textures drawn at 96 logical px
POOP_RADIUS = cfg("poopRadius")
READY_SCALE = cfg("readyPoopScale") * SPRITE_SCALE  # the speech poop's display scale on the ready screen
ITEM_RADIUS = cfg("itemRadius")
WHITE_BLEND = cfg("whiteBlend")
MOVE_FRAC = cfg("lightenFrac")
GROUND_H = int(cfg("groundHeight"))
CEIL_H = int(cfg("ceilingHeight"))
PIPE_W = int(cfg("pipeWidth"))
GAP_H = int(cfg("gapHeight"))
PINK, PINK_DARK = py_colour("PINK")[:3], py_colour("PINK_DARK")[:3]
VILLI, VILLI_DARK, CREAM = py_colour("VILLI")[:3], py_colour("VILLI_DARK")[:3], py_colour("CREAM")[:3]
_m = re.search(r"export const LEVEL_COLORS = \[(.*?)\];", _config, re.S)
LEVEL_RAW = [int(h, 16) for h in re.findall(r"0x([0-9a-fA-F]{6})", _m.group(1))] if _m else []
if len(LEVEL_RAW) != 6:
    raise SystemExit(f"FAIL: expected six LEVEL_COLORS in src/config.js, found {len(LEVEL_RAW)}")
_m = re.search(r"const title = \{ id: 'title', x: cx, y: (\d+) \};", _logic)
TITLE_Y = int(_m.group(1)) if _m else None
_m = re.search(r"const poop = \{ id: 'poop', x: cx, y: (\d+), bubble: \{ left: -(\d+) \* s, right: (\d+) \* s, top: -(\d+) \* s, bottom: (\d+) \* s \} \};", _logic)
if not _m or TITLE_Y is None:
    raise SystemExit("FAIL: readyLayout's title / poop lines moved in src/logic.js; update advent_preview.py")
POOP_Y = int(_m.group(1))
BUBBLE = dict(zip(("left", "right", "top", "bottom"), (int(v) for v in _m.groups()[1:])))  # px at readyPoopScale 1 (x s)
BUBBLE_TOP_Y = POOP_Y - BUBBLE["top"] * cfg("readyPoopScale")  # 672 - 127 x 1.5 = 481.5


def level_rgb(n):
    """levelColor(n, LEVEL_COLORS, whiteBlend): the palette entry blended with white, rounded per channel."""
    raw = LEVEL_RAW[(n - 1) % len(LEVEL_RAW)]
    ch = [(raw >> s) & 0xFF for s in (16, 8, 0)]
    return tuple(int(math.floor(c + (255 - c) * WHITE_BLEND + 0.5)) for c in ch)


LEVEL_NAMES = ["tan", "teal", "periwinkle", "lime", "yellow", "light blue"]

# ---------------------------------------------------------------- small drawing helpers
_FONT_CACHE = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in _FONT_CACHE:
        f = None
        for path, idx in (("/System/Library/Fonts/Helvetica.ttc", 1 if bold else 0), ("/System/Library/Fonts/HelveticaNeue.ttc", 1 if bold else 0),
                          ("/Library/Fonts/Arial.ttf", 0)):
            try:
                f = ImageFont.truetype(path, size, index=idx)
                break
            except Exception:
                continue
        _FONT_CACHE[key] = f or ImageFont.load_default(size)
    return _FONT_CACHE[key]


def text(img, xy, s, size=14, fill=(30, 30, 30), bold=False, anchor="la", halo=None):
    d = ImageDraw.Draw(img)
    f = font(size, bold)
    if halo:
        d.text(xy, s, font=f, fill=halo, anchor=anchor, stroke_width=2, stroke_fill=halo)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def new_sheet(bg=(255, 255, 255)):
    return Image.new("RGBA", (W_PX, H_PX), bg + (255,))


def load(path):
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"FAIL: missing input {p}")
    return Image.open(p).convert("RGBA")


def half(im, scale=SPRITE_SCALE):
    """A 2x file at in-game size (drawn at `scale`, 0.5): LANCZOS, premultiplied alpha (Pillow does that for RGBA)."""
    return im.resize((max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))), Image.Resampling.LANCZOS)


def ink_bbox(im, thr=8):
    return im.getchannel("A").point(lambda v: 255 if v > thr else 0).getbbox()


def brown_mask(im):
    """tools/process_art.py's brown_bbox rule as a mask: alpha > 0, r > g > b and r - b > 60."""
    r, g, b, a = im.split()
    on = lambda ch: ch.point(lambda v: 255 if v > 0 else 0)
    m1 = on(ImageChops.subtract(r, g))
    m2 = on(ImageChops.subtract(g, b))
    m3 = ImageChops.subtract(r, b).point(lambda v: 255 if v > 60 else 0)
    return ImageChops.multiply(ImageChops.multiply(m1, m2), ImageChops.multiply(m3, on(a)))


def paste_at(sheet, im, x, y):
    sheet.alpha_composite(im, (int(x), int(y))) if x >= 0 and y >= 0 else sheet.paste(im, (int(x), int(y)), im)


def paste_subpixel(sheet, layer, x, y):
    """Composite `layer` at a fractional position (bilinear, premultiplied), as Phaser draws a half pixel."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    if fx == 0 and fy == 0:
        paste_at(sheet, layer, ix, iy)
        return
    pad = Image.new("RGBA", (layer.width + 2, layer.height + 2), (0, 0, 0, 0))
    pad.paste(layer, (1, 1))
    pre = pad.convert("RGBa").transform(pad.size, Image.AFFINE, (1, 0, -fx, 0, 1, -fy), Image.BILINEAR)
    paste_at(sheet, pre.convert("RGBA"), ix - 1, iy - 1)


def ring(sheet, cx, cy, r, colour=(255, 255, 255), width=1, halo=True):
    """A circle outline at a fractional centre, anti-aliased by drawing at 4x."""
    pad, k = width + 3, 4
    x0, y0 = math.floor(cx - r) - pad, math.floor(cy - r) - pad
    size = int(math.ceil(2 * r)) + 2 * pad + 2
    big = Image.new("RGBA", (size * k, size * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    box = ((cx - r - x0) * k, (cy - r - y0) * k, (cx + r - x0) * k, (cy + r - y0) * k)
    if halo:
        d.ellipse(box, outline=(0, 0, 0, 170), width=(width + 2) * k)
    d.ellipse(box, outline=colour + (255,), width=width * k)
    paste_at(sheet, big.resize((size, size), Image.Resampling.LANCZOS), x0, y0)


def dashed_hline(sheet, y, x0, x1, colour, dash=10, gap=6, width=2):
    d = ImageDraw.Draw(sheet)
    x = x0
    while x < x1:
        d.line((x, y, min(x + dash, x1), y), fill=colour, width=width)
        x += dash + gap


def dashed_vline(sheet, x, y0, y1, colour, dash=10, gap=6, width=2):
    d = ImageDraw.Draw(sheet)
    y = y0
    while y < y1:
        d.line((x, y, x, min(y + dash, y1)), fill=colour, width=width)
        y += dash + gap


def dashed_rect(sheet, box, colour, dash=8, gap=5, width=2):
    x0, y0, x1, y1 = box
    dashed_hline(sheet, y0, x0, x1, colour, dash, gap, width)
    dashed_hline(sheet, y1, x0, x1, colour, dash, gap, width)
    dashed_vline(sheet, x0, y0, y1, colour, dash, gap, width)
    dashed_vline(sheet, x1, y0, y1, colour, dash, gap, width)


def rect(sheet, box, colour, width=2):
    ImageDraw.Draw(sheet).rectangle(box, outline=colour, width=width)


def sheet_save(sheet, out_dir, name, inputs, manifest):
    sheet = sheet.convert("RGB") if sheet.mode != "RGB" else sheet
    path = Path(out_dir) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    manifest.append({"sheet": name, "inputs": inputs, "size": sheet.size, "path": path})


# ---------------------------------------------------------------- formulas W, O and V (plan 17, 1.5)
def whiten(im, f):
    """Formula W: every pixel c becomes c + (255 - c) x f per channel, alpha unchanged (createLightTexture)."""
    lut = [int(math.floor(v + (255 - v) * f + 0.5)) for v in range(256)]
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lut), g.point(lut), b.point(lut), a))


def near_mask(im, colour, tol=24):
    """255 where an opaque pixel's RGB is within `tol` (sum of the three channel differences) of `colour`."""
    r, g, b, a = im.split()
    dr, dg, db = ImageChops.difference(Image.merge("RGB", (r, g, b)), Image.new("RGB", im.size, colour)).split()
    s = ImageChops.add(ImageChops.add(dr, dg), db).point(lambda v: 255 if v <= tol else 0)
    return ImageChops.multiply(s, a.point(lambda v: 255 if v > 0 else 0))


def formula_o(im, f):
    """Formula O: as W, but pixels within 24 of PINK_DARK take f / 2."""
    return Image.composite(whiten(im, f / 2), whiten(im, f), near_mask(im, PINK_DARK))


def formula_v(im, f):
    """Formula V: only pixels within 24 of the villi fill are whitened (W's maths); everything else is left as it is."""
    return Image.composite(whiten(im, f), im, near_mask(im, VILLI))


def v_changes_only_fill(src, out, label):
    """Step 1.5's assertion: V changed no pixel that is not the villi fill, changed every villi-fill pixel, and left alpha alone. Returns (ok, n_fill)."""
    a_same = ImageChops.difference(src.getchannel("A"), out.getchannel("A")).getbbox() is None
    dr, dg, db = ImageChops.difference(src.convert("RGB"), out.convert("RGB")).split()
    changed = ImageChops.add(ImageChops.add(dr, dg), db).point(lambda v: 255 if v > 0 else 0)
    fill = near_mask(src, VILLI)
    outside = ImageChops.subtract(changed, fill)  # changed pixels that are not the fill: must be none
    unchanged_fill = ImageChops.subtract(fill, changed)  # fill pixels V left alone: must be none (a no-op must not pass)
    n_fill = sum(fill.histogram()[255:])
    return (a_same and outside.getbbox() is None and unchanged_fill.getbbox() is None and n_fill > 0), n_fill


def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def mix(c, f):
    return tuple(v + (255 - v) * f for v in c)


# ---------------------------------------------------------------- inputs
class Inputs:
    def __init__(self, art, guides, backdrop):
        self.art, self.guides, self.backdrop = Path(art), Path(guides), Path(backdrop)
        self._cache = {}

    def stock(self, name):
        return self._get(ASSETS / f"{name}.png")

    def twin(self, name):
        return self._get(self.art / f"{name}.png")

    def _get(self, p):
        if p not in self._cache:
            self._cache[p] = load(p)
        return self._cache[p]


# The 12 hatted twins (13 with the dead frame, D13) and the stock frame each is checked against.
TWINS = [
    ("poop-santa", "poop"), ("poop-scared-santa", "poop-scared"),
    ("poop-stink1-santa", "poop-stink1"), ("poop-stink2-santa", "poop-stink2"),
    ("poop-stink-scared1-santa", "poop-stink-scared1"), ("poop-stink-scared2-santa", "poop-stink-scared2"),
    ("poop-falling-santa", "poop-falling"),
    ("poop-stink-falling1-santa", "poop-stink-falling1"), ("poop-stink-falling2-santa", "poop-stink-falling2"),
    ("poop-fart-santa1", "poop-fart"), ("poop-fart-santa2", "poop-fart"),
    ("poop-speech-santa", "poop-speech"),
]
DEAD = ("poop-dead-santa", "poop-dead")  # late art (D13): used if the file exists, else a labelled empty slot


def shifted(im, dx, dy):
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (int(dx), int(dy)), im)
    return out


# ---------------------------------------------------------------- the sheet-1 check
def edge_metrics(im, scale=SPRITE_SCALE):
    """The brown mask's right and bottom edges measured from the canvas centre, in game px."""
    bb = brown_mask(im).getbbox()
    if not bb:
        raise SystemExit("FAIL: a frame has no brown body")
    return (bb[2] - im.width / 2) * scale, (bb[3] - im.height / 2) * scale


def twin_check(twin_im, stock_im, name, circle_centre=None, canvas_centre=None, tol=1.0):
    """(ok, line): right and bottom brown edges within `tol` game px of the stock's, circle centre = canvas centre."""
    tr, tb = edge_metrics(twin_im)
    sr, sb = edge_metrics(stock_im)
    dr, db = tr - sr, tb - sb
    ok = abs(dr) <= tol and abs(db) <= tol
    centred = True
    if circle_centre is not None:
        centred = abs(circle_centre[0] - canvas_centre[0]) < 1e-6 and abs(circle_centre[1] - canvas_centre[1]) < 1e-6
    return ok and centred, f"{name}: right {dr:+.2f}, bottom {db:+.2f} game px vs stock" + ("" if centred else "; circle not at canvas centre")


def run_twin_checks(inp, shift_first=None):
    """Check the 12 twins (and the dead one if it exists). `shift_first` = (dx, dy) in game px shifts the first twin, for --selftest."""
    results = []
    for i, (t, s) in enumerate(TWINS + ([DEAD] if (inp.art / f"{DEAD[0]}.png").exists() else [])):
        tim = inp.twin(t)
        if i == 0 and shift_first:
            tim = shifted(tim, shift_first[0] / SPRITE_SCALE, shift_first[1] / SPRITE_SCALE)
        results.append((t,) + twin_check(tim, inp.stock(s), t))
    return results


# ---------------------------------------------------------------- sheet 1: the hatted twins beside the stock frames
class Cell:
    def __init__(self, name, im, radius, outline_mask=None, scale=SPRITE_SCALE):
        self.name, self.radius, self.outline = name, radius, outline_mask
        self.img = half(im, scale)
        bb = ink_bbox(self.img) or (0, 0, 1, 1)
        self.ink = bb
        self.up = self.img.height / 2 - bb[1]  # canvas centre to ink top
        self.down = bb[3] - self.img.height / 2
        self.ink_w = bb[2] - bb[0]


class EmptyCell(Cell):
    """A labelled empty slot (art not delivered yet): same geometry as a 96 px frame, drawn as a box."""

    def __init__(self, label):
        self.name, self.radius, self.outline, self.empty_label = label, 0, None, label
        self.img = Image.new("RGBA", (112, 100), (0, 0, 0, 0))
        self.ink = (0, 0, 112, 100)
        self.up = self.down = 50
        self.ink_w = 112


def outline_layer(stock_im, scale=SPRITE_SCALE):
    """The stock frame's brown-mask outline, 1 px at game scale, as an RGBA layer the size of the half-size canvas."""
    m = half(Image.merge("RGBA", (brown_mask(stock_im),) * 4), scale).getchannel("A").point(lambda v: 255 if v > 127 else 0)
    edge = ImageChops.subtract(m, m.filter(ImageFilter.MinFilter(3)))
    layer = Image.new("RGBA", m.size, (255, 0, 200, 0))
    layer.putalpha(edge.point(lambda v: 255 if v else 0))
    return layer


OUTLINE_RGB = (255, 0, 200)
CIRCLE_RGB = (255, 255, 255)


def draw_cell(sheet, cell, x_ink_left, y_centre, with_marks):
    """Paste the cell with its ink's left edge at x_ink_left and canvas centre on the row line; return (circle centre, canvas centre)."""
    ox = int(round(x_ink_left - cell.ink[0]))
    oy = int(round(y_centre - cell.img.height / 2))
    if isinstance(cell, EmptyCell):
        rect(sheet, (ox, oy, ox + cell.img.width - 1, oy + cell.img.height - 1), (120, 80, 40), 1)
        text(sheet, (ox + cell.img.width / 2, oy + 36), "not delivered", 12, (40, 30, 20), False, "ma")
        text(sheet, (ox + cell.img.width / 2, oy + 52), "(D13)", 12, (40, 30, 20), False, "ma")
        return None, (ox + cell.img.width / 2, oy + cell.img.height / 2)
    paste_at(sheet, cell.img, ox, oy)
    canvas_c = (ox + cell.img.width / 2, oy + cell.img.height / 2)
    if with_marks:
        if cell.outline is not None:
            # centred on the twin's canvas: both canvases share the body centre (the stock one is smaller where no hat is)
            paste_subpixel(sheet, cell.outline, ox + (cell.img.width - cell.outline.width) / 2, oy + (cell.img.height - cell.outline.height) / 2)
        ring(sheet, canvas_c[0], canvas_c[1], cell.radius)
        return canvas_c, canvas_c
    return None, canvas_c


def layout_rows(sheet, rows, y, bg_label_col, row_pad=10, label_h=15):
    """rows: list of groups-lists; a group is a list of (cell, with_marks, label). Returns (y after, placements)."""
    placements = []
    for groups in rows:
        up = max(c.up for g in groups for c, _, _ in g)
        down = max(c.down for g in groups for c, _, _ in g)
        widths = [sum(c.ink_w for c, _, _ in g) + 14 * (len(g) - 1) for g in groups]
        free = W_PX - sum(widths)
        slot = free / (len(groups) + 1)
        x = slot
        yc = y + up
        for g, w in zip(groups, widths):
            gx = x
            for c, marks, label in g:
                circle_c, canvas_c = draw_cell(sheet, c, gx, yc, marks)
                placements.append((c, circle_c, canvas_c))
                if label:
                    text(sheet, (gx + c.ink_w / 2, yc + down + 2), label, 12, bg_label_col, anchor="ma")
                gx += c.ink_w + 14
            x += w + slot
        y = yc + down + label_h + row_pad
    return y, placements


def sheet1(inp, out, manifest, failures):
    bg = level_rgb(1)
    sheet = new_sheet(bg)
    lab = (40, 30, 20)
    text(sheet, (W_PX // 2, 8), "Sheet 1: hatted poop twins beside the stock frames (96 px body, level-1 colour)", 15, lab, True, "ma")
    text(sheet, (W_PX // 2, 28), "magenta = stock brown-mask outline (1 px), white ring = hitbox circle (r 48), both at the canvas centre", 12, lab, False, "ma")
    results = run_twin_checks(inp)
    for t, ok, line in results:
        if not ok:
            failures.append("sheet 1 twin check: " + line)
    worst = max(max(abs(float(re.search(r"right ([+-][0-9.]+)", ln).group(1))), abs(float(re.search(r"bottom ([+-][0-9.]+)", ln).group(1)))) for _, _, ln in results)
    text(sheet, (W_PX // 2, 44), f"{len(results)} twins: brown-mask right and bottom edges vs stock, worst {worst:.2f} px (limit 1); circle at canvas centre", 12, lab, False, "ma")

    def pair(tname, sname):
        s = inp.stock(sname)
        stock_cell = Cell(sname, s, POOP_RADIUS)
        twin_cell = Cell(tname, inp.twin(tname), POOP_RADIUS, outline_layer(s))
        short = lambda n: n.replace("poop-", "")
        return [(stock_cell, False, short(sname)), (twin_cell, True, short(tname))]

    pairs = {t: pair(t, s) for t, s in TWINS}
    rows = [
        [pairs["poop-santa"], pairs["poop-scared-santa"]],
        [pairs["poop-stink1-santa"], pairs["poop-stink2-santa"]],
        [pairs["poop-stink-scared1-santa"], pairs["poop-stink-scared2-santa"]],
        [pairs["poop-falling-santa"], pairs["poop-stink-falling1-santa"]],
    ]
    # last pair row: stink-falling 2 and the dead frame (a labelled empty slot until D13's art arrives)
    if (inp.art / f"{DEAD[0]}.png").exists():
        dead_group = pair(*DEAD)
    else:
        dead_group = [(Cell("poop-dead", inp.stock("poop-dead"), POOP_RADIUS), False, "dead"), (EmptyCell("dead-santa"), False, "dead-santa")]
    rows.append([pairs["poop-stink-falling2-santa"], dead_group])
    y, placed = layout_rows(sheet, rows, 58, lab)
    # fart strip: stock fart, then the two hatted fart frames
    f_stock = Cell("poop-fart", inp.stock("poop-fart"), POOP_RADIUS)
    fs = inp.stock("poop-fart")
    f1 = Cell("poop-fart-santa1", inp.twin("poop-fart-santa1"), POOP_RADIUS, outline_layer(fs))
    f2 = Cell("poop-fart-santa2", inp.twin("poop-fart-santa2"), POOP_RADIUS, outline_layer(fs))
    text(sheet, (W_PX // 2, y - 6), "fart strip: stock, then the two hatted frames (the hat flies in the wind, they alternate)", 12, lab, True, "ma")
    y2, placed2 = layout_rows(sheet, [[[(f_stock, False, "fart"), (f1, True, "fart-santa1"), (f2, True, "fart-santa2")]]], y + 12, lab)
    # speech twin at readyPoopScale with its bubble, beside the stock speech frame
    sp = inp.stock("poop-speech")
    c_stock = Cell("poop-speech", sp, POOP_RADIUS * READY_SCALE / SPRITE_SCALE, scale=READY_SCALE)
    c_twin = Cell("poop-speech-santa", inp.twin("poop-speech-santa"), POOP_RADIUS * READY_SCALE / SPRITE_SCALE,
                  outline_layer(sp, READY_SCALE), scale=READY_SCALE)
    text(sheet, (W_PX // 2, y2 - 6), f"ready screen (x{READY_SCALE / SPRITE_SCALE:g}): stock bubble poop, then the hatted twin with its bubble", 12, lab, True, "ma")
    y3, placed3 = layout_rows(sheet, [[[(c_stock, False, "speech"), (c_twin, True, "speech-santa")]]], y2 + 12, lab)
    if y3 > H_PX:
        failures.append(f"sheet 1 overflows its 1280 px (content to {y3:.0f})")
    for c, circle_c, canvas_c in placed + placed2 + placed3:
        if circle_c is not None and circle_c != canvas_c:
            failures.append(f"sheet 1: {c.name} circle centre {circle_c} is not its canvas centre {canvas_c}")
    sheet_save(sheet, out, "sheet1-twins.png", ["12 art-fit twins", "12 stock poop frames in assets/ (poop-fart x1)"], manifest)
    return results


# ---------------------------------------------------------------- sheet 2: items
def sheet2(inp, out, manifest, failures):
    sheet = new_sheet((255, 255, 255))
    lab = (40, 30, 20)
    pairs = [("candy-cane", "fiber", "candy cane | fiber"), ("gingerbread", "probiotic", "gingerbread | probiotic"),
             ("bacteria-santa", "bacteria", "bacteria-santa | bacteria")]
    bands = [1, 2]
    band_h = H_PX // len(bands)
    d = ImageDraw.Draw(sheet)
    for bi, lvl in enumerate(bands):
        y0 = bi * band_h
        d.rectangle((0, y0, W_PX, y0 + band_h), fill=level_rgb(lvl) + (255,))
        text(sheet, (W_PX // 2, y0 + 8), f"Sheet 2: items at 96 px on level {lvl} ({LEVEL_NAMES[lvl - 1]}, #{'%02x%02x%02x' % level_rgb(lvl)})", 15, lab, True, "ma")
        text(sheet, (W_PX // 2, y0 + 28), "white ring = hitbox circle (itemRadius 48) at the canvas centre; art on the left, stock on the right", 12, lab, False, "ma")
        for pi, (t, s, label) in enumerate(pairs):
            yc = y0 + 90 + pi * 175 + 60
            for xi, name in enumerate((t, s)):
                src = inp.twin(name) if xi == 0 else inp.stock(name)
                cell = Cell(name, src, ITEM_RADIUS)
                cx = 190 + xi * 300
                ox, oy = int(round(cx - cell.img.width / 2)), int(round(yc - cell.img.height / 2))
                paste_at(sheet, cell.img, ox, oy)
                ring(sheet, ox + cell.img.width / 2, oy + cell.img.height / 2, ITEM_RADIUS)
                text(sheet, (cx, yc + 64), name + (" (art-fit)" if xi == 0 else " (stock)"), 12, lab, False, "ma")
    sheet_save(sheet, out, "sheet2-items.png", ["art-fit/candy-cane, gingerbread, bacteria-santa", "assets/fiber, probiotic, bacteria"], manifest)


# ---------------------------------------------------------------- pipes, villi and the mock run frame (sheet 3)
def pipe_snow_anchor(inp):
    """Where the snow's top-left sits from the bottom pipe's cap top-left, in game px, and how it was mapped.

    process_art printed the crop's offset from the anchor (96, 128) of the 4x guide canvas: (-26, -58) source px =
    (-13, -29) in the 2x file = (-6.5, -14.5) game px. The anchor is the cap's top-left: in the padded guide
    (pipe-cap-4x-padded.png, 704 x 768) the cap's alpha box starts at (96, 128) and is 512 px wide = the pipe's
    128 game px at 4x; here that is checked against assets/pipe.png before the offset is used."""
    pad = load(inp.guides / "pipe-cap-4x-padded.png")
    bb = pad.getchannel("A").getbbox()
    pipe = inp.stock("pipe")
    if bb[0] != 96 or bb[1] != 128 or (bb[2] - bb[0]) != 4 * pipe.width:
        raise SystemExit(f"FAIL: pipe-cap-4x-padded.png alpha box {bb} is not the 4x pipe at (96, 128)")
    # the padded guide's top 160 game rows of pipe, shrunk 4x from the anchor, must equal assets/pipe.png's top rows
    crop = pad.crop((96, 128, 96 + 512, 128 + 4 * 100)).resize((128, 100), Image.Resampling.BOX)
    ref = pipe.crop((0, 0, 128, 100))
    diff = ImageChops.difference(crop.convert("RGB"), ref.convert("RGB")).convert("L").point(lambda v: 255 if v > 40 else 0)
    n_bad = sum(diff.histogram()[255:])
    if n_bad > 0.02 * 128 * 100:
        raise SystemExit(f"FAIL: the guide's cap does not line up with assets/pipe.png at anchor (96, 128): {n_bad} px differ")
    return -26 / 4, -58 / 4, f"anchor (96,128) of pipe-cap-4x-padded = pipe.png (0,0) (alpha box {bb}, {n_bad} of 12800 px differ from pipe.png); offset (-26,-58) src px / 4 = (-6.5, -14.5) game px"


def pipe_with_snow(pipe_im, snow, ox, oy):
    """A bottom pipe (cap at the top) with the snow layer at its offset."""
    layer = Image.new("RGBA", (pipe_im.width + 40, pipe_im.height + 40), (0, 0, 0, 0))
    layer.alpha_composite(pipe_im, (20, 20))
    paste_subpixel(layer, snow, 20 + ox, 20 + oy)
    return layer  # 20 px margin on every side


def run_frame(inp, level, villi_im, ceil_im, ground_im, still_pipe, move_pipe, snow, snow_off, caption, sub, poop_key="poop-santa"):
    sheet = new_sheet(level_rgb(level))
    sheet.alpha_composite(villi_im, (0, 0))
    poop = half(inp.twin(poop_key))
    # pipes: a still pair and a moving pair; the ground and ceiling strips go over them (depth 5)
    pairs = [(230, 560, still_pipe, "still pair"), (520, 760, move_pipe, "moving pair, 25 % white (W)")]
    for xc, gy, pimg, _ in pairs:
        x0 = xc - PIPE_W // 2
        gap_top, gap_bot = gy - GAP_H // 2, gy + GAP_H // 2
        top = pimg.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        paste_at(sheet, top, x0, gap_top - top.height)
        paste_at(sheet, pimg, x0, gap_bot)
        paste_subpixel(sheet, snow, x0 + snow_off[0], gap_bot + snow_off[1])
    paste_at(sheet, poop, 60, 560 - poop.height // 2 + 20)
    sheet.alpha_composite(ground_im, (0, H_PX - GROUND_H))
    sheet.alpha_composite(ceil_im, (0, 0))
    lab = (40, 30, 20)
    if caption is not None:  # sheet 4 passes None: it has its own header and no caption panel
        panel = Image.new("RGBA", (W_PX - 40, 52), (255, 255, 255, 215))
        sheet.alpha_composite(panel, (20, 244))
        text(sheet, (W_PX // 2, 250), caption, 15, lab, True, "ma")
        text(sheet, (W_PX // 2, 272), sub, 12, lab, False, "ma")
    for xc, gy, _, label in pairs:
        text(sheet, (xc, gy + GAP_H // 2 + 70), label, 12, lab, False, "ma", halo=(255, 255, 255, 140))
    return sheet


def sheet3(inp, out, manifest, failures, share=0.40):
    villi_im, ceil_im, ground_im = inp.stock("villi"), inp.stock("ceiling"), inp.stock("ground")
    pipe = inp.stock("pipe")
    snow = half(inp.twin("pipe-snow"))
    ox, oy, how = pipe_snow_anchor(inp)
    print("pipe-snow placement:", how)
    still = pipe
    moving = whiten(pipe, MOVE_FRAC)
    level = 1
    a = run_frame(inp, level, villi_im, ceil_im, ground_im, still, moving, snow, (ox, oy),
                  "Sheet 3, run frame with the STOCK villi", f"level {level} ({LEVEL_NAMES[0]}); snow layer on each bottom cap at ({ox:g}, {oy:g}) from the cap's top-left")
    sheet_save(a, out, "sheet3-run-stock.png", ["assets/villi, ceiling, ground, pipe, poop (via art-fit/poop-santa)", "art-fit/pipe-snow", "guides/pipe-cap-4x-padded.png"], manifest)
    vi, ci, gi = formula_v(villi_im, share), formula_v(ceil_im, share), formula_v(ground_im, share)
    for src, res, nm in ((villi_im, vi, "villi.png"), (ceil_im, ci, "ceiling.png"), (ground_im, gi, "ground.png")):
        ok, n = v_changes_only_fill(src, res, nm)
        if not ok:
            failures.append(f"formula V at {share:.0%} changed a pixel that is not the villi fill on {nm}")
    b = run_frame(inp, level, vi, ci, gi, still, moving, snow, (ox, oy),
                  f"Sheet 3, the same frame with ICY villi (formula V at {share:.0%})", "villi, ceiling and ground fills whitened; the outline, dark band and cream band stay as they are")
    sheet_save(b, out, "sheet3-run-icy40.png", ["as sheet3-run-stock.png", "formula V at 40 % on villi, ceiling, ground"], manifest)


# ---------------------------------------------------------------- sheet 7: the December home screen
def sheet7(inp, out, manifest, failures):
    back = load(inp.backdrop)
    if back.size != (W_PX, H_PX):
        failures.append(f"backdrop is {back.size}, not 720 x 1280")
        return
    bg = back.convert("RGB").getpixel((20, 450))

    def ink_between(box):
        reg = back.convert("RGB").crop(box)
        d = ImageChops.difference(reg, Image.new("RGB", reg.size, bg))
        dr, dg, db = d.split()
        bb = ImageChops.add(ImageChops.add(dr, dg), db).point(lambda v: 255 if v > 8 else 0).getbbox()
        return (bb[0] + box[0], bb[1] + box[1], bb[2] + box[0], bb[3] + box[1]) if bb else None

    # the backdrop must be flat tan where we paint over it
    for p in ((20, 300), (20, 700), (700, 450), (360, 460), (200, 560), (600, 600)):
        if back.convert("RGB").getpixel(p) != bg:
            failures.append(f"sheet 7: the backdrop is not flat at {p}")
    title = ink_between((0, 250, W_PX, 440))
    poop_ink = ink_between((200, 440, 600, 775))
    if not title or not poop_ink:
        failures.append("sheet 7: could not find the title or the stock poop on the backdrop")
        return
    # the stock poop's body centre: the brown mask's box in the backdrop (the bubble is not brown)
    reg = back.crop((200, 440, 600, 775))
    rd = ImageChops.difference(reg.convert("RGB"), Image.new("RGB", reg.size, bg))
    reg.putalpha(ImageChops.add(ImageChops.add(*rd.split()[:2]), rd.split()[2]).point(lambda v: 255 if v > 60 else 0))  # the tan (and the edges blended into it) count as brown otherwise
    bb = brown_mask(reg).getbbox()
    pcx, pcy = (bb[0] + bb[2]) / 2 + 200, (bb[1] + bb[3]) / 2 + 440
    twin = half(inp.twin("poop-speech-santa"), READY_SCALE)
    # sheet-wide facts
    print(f"sheet 7: title ink box {title}, stock poop+bubble ink box {poop_ink}, body centre ({pcx:.1f}, {pcy:.1f}); bubble top {BUBBLE_TOP_Y:g}")

    def base(with_twin=True):
        s = back.copy()
        d = ImageDraw.Draw(s)
        pad = 3
        d.rectangle((poop_ink[0] - pad, poop_ink[1] - pad, poop_ink[2] + pad, poop_ink[3] + pad), fill=bg + (255,))
        if with_twin:
            paste_at(s, twin, int(round(pcx - twin.width / 2)), int(round(pcy - twin.height / 2)))
        return s

    top_y = int(BUBBLE_TOP_Y)  # 481 (the layout says 481.5)
    bob = 24  # Play.js:443: the ready poop tweens y '+=24' and back, so the layout's y 672 is the TOP of the bob

    def guides(s, title_box, note=None):
        rect(s, title_box, (0, 150, 255), 2)
        text(s, (title_box[0] + 2, title_box[1] - 16), f"title box {title_box[2] - title_box[0]} x {title_box[3] - title_box[1]}", 12, (0, 90, 200), True, halo=(255, 255, 255, 200))
        d = ImageDraw.Draw(s)
        d.line((40, top_y, 680, top_y), fill=(255, 0, 120), width=2)
        text(s, (30, top_y - 15), f"bubble top y {BUBBLE_TOP_Y:g} (its highest)", 12, (200, 0, 90), True, "la", halo=(255, 255, 255, 200))
        dashed_hline(s, top_y + bob, 30, 280, (255, 120, 170), 8, 6, 1)
        text(s, (30, top_y + bob + 3), f"y {top_y + bob}: where it bobs down to", 11, (200, 0, 90), False, "la", halo=(255, 255, 255, 200))

    # --- 7: the countdown line in the gap
    s = base()
    guides(s, title)
    gap_top, gap_bot = title[3] + 3, top_y - 3
    rect(s, (130, gap_top, 590, gap_bot), (0, 170, 80), 2)
    text(s, (360, (gap_top + gap_bot) // 2), "12 sleeps till Christmas", 30, (255, 255, 255), True, "mm", halo=(92, 38, 72, 255))
    header(s, ["Sheet 7: December home screen, countdown line (1 to 24 Dec)",
               f"hatted speech twin over the stock poop; green box = the line's room: {top_y - title[3]} px from the title ink to the bubble top",
               "the poop bobs 24 px downward from here, so the room only grows"])
    if abs(pcx - 360) > 2:
        failures.append(f"sheet 7: the stock poop's body centre x is {pcx:.1f}, expected 360")
    sheet_save(s, out, "sheet7-home-countdown.png", [inp.backdrop.name, "art-fit/poop-speech-santa"], manifest)
    # --- bowelidays options
    bow = inp.twin("bowelidays")

    def bow_at(width):
        w = int(round(width))
        return bow.resize((w, int(round(bow.height * w / bow.width))), Image.Resampling.LANCZOS)

    # (a) about 42 % of the width under the title
    a = base()
    guides(a, title)
    img = bow_at(0.42 * W_PX)
    cy = (title[3] + top_y) / 2
    paste_at(a, img, int(round(360 - img.width / 2)), int(round(cy - img.height / 2)))
    rect(a, (360 - img.width // 2, int(cy - img.height / 2), 360 + img.width // 2, int(cy + img.height / 2)), (0, 170, 80), 1)
    header(a, ["Sheet 7a: Happy Bowelidays! option (a), about 42 % of the width under the title",
               f"image {img.width} x {img.height} px (green box), centred in the {top_y - title[3]} px gap; no layout change (D16 recommendation)"])
    sheet_save(a, out, "sheet7a-bowelidays-under-title.png", [inp.backdrop.name, "art-fit/poop-speech-santa", "art-fit/bowelidays"], manifest)
    # (b) above the title, 60 % width (the room above the title is about 100 px)
    b = base()
    guides(b, title)
    img = bow_at(0.60 * W_PX)
    villi_bottom = 234
    cy = (villi_bottom + title[1]) / 2
    paste_at(b, img, int(round(360 - img.width / 2)), int(round(cy - img.height / 2)))
    rect(b, (360 - img.width // 2, int(cy - img.height / 2), 360 + img.width // 2, int(cy + img.height / 2)), (0, 170, 80), 1)
    header(b, ["Sheet 7b: Happy Bowelidays! option (b), above the title (60 % of the width)",
               f"image {img.width} x {img.height} px (green box) between the villi (y 234) and the title ink (y {title[1]})"])
    sheet_save(b, out, "sheet7b-bowelidays-above-title.png", [inp.backdrop.name, "art-fit/poop-speech-santa", "art-fit/bowelidays"], manifest)
    # (c) a December title shift up, image 60 % under the title
    c = base()
    img = bow_at(0.60 * W_PX)
    need = img.height + 12
    gap_now = top_y - title[3]
    shift = max(0, need - gap_now)
    crop = back.crop((title[0] - 6, title[1] - 6, title[2] + 6, title[3] + 6))
    ImageDraw.Draw(c).rectangle((title[0] - 6, title[1] - 6, title[2] + 6, title[3] + 6), fill=bg + (255,))
    paste_at(c, crop, title[0] - 6, title[1] - 6 - shift)
    new_title = (title[0], title[1] - shift, title[2], title[3] - shift)
    guides(c, new_title)
    rect(c, title, (150, 150, 150), 1)
    cy = (new_title[3] + top_y) / 2
    paste_at(c, img, int(round(360 - img.width / 2)), int(round(cy - img.height / 2)))
    rect(c, (360 - img.width // 2, int(cy - img.height / 2), 360 + img.width // 2, int(cy + img.height / 2)), (0, 170, 80), 1)
    header(c, ["Sheet 7c: Happy Bowelidays! option (c), a December title shift up (60 % of the width)",
               f"title moves up {shift} px (a readyLayout change; grey box = its stock place); the {top_y - new_title[3]} px gap holds the {img.height} px image"])
    sheet_save(c, out, "sheet7c-bowelidays-title-up.png", [inp.backdrop.name, "art-fit/poop-speech-santa", "art-fit/bowelidays"], manifest)


# ---------------------------------------------------------------- step 1b.1: sheet 9, the loading screen's hatted poop
# The splash's numbers, read from index.html as tests/html.test.js reads them (a moved line fails loudly).
SPLASH_OPTIONS = [  # (label, left, top, size) as shares of the hero box; None = read from index.html
    ("Today (stock poop.png)", None, None, None),
    ("A: the brief's box, 64 % moved", 0.15, 0.19, 0.64),
    ("B: 64 %, centred for the most room", 0.195, 0.195, 0.64),
    ("Built (Michael, 26 Nov): smaller and centred, .splash-poop-xmas", "xmas", None, None),
]

def splash_numbers():
    html = (ROOT / "index.html").read_text()
    blk = re.search(r"\.splash-poop \{([^}]*)\}", html).group(1)
    pct = lambda prop: float(re.search(rf"(?:^|[\s;]){prop}: (-?[\d.]+)%", blk).group(1)) / 100
    bob = float(re.search(r"@keyframes splash-bob \{ from \{ transform: translateY\(-([\d.]+)%\); \} to \{ transform: translateY\(([\d.]+)%\)", html).group(2)) / 100
    stroke = float(re.search(r"\.splash-ring circle \{[^}]*stroke-width: ([\d.]+);", html).group(1))
    r = float(re.search(r'class="splash-arc" cx="60" cy="60" r="(\d+)"', html).group(1))
    hexc = lambda name: tuple(int(re.search(rf"--{name}: #([0-9a-f]{{6}})", html).group(1)[i:i + 2], 16) for i in (0, 2, 4))
    xb = re.search(r"\.splash-poop-xmas \{([^}]*)\}", html)
    xpct = lambda prop: float(re.search(rf"(?:^|[\s;]){prop}: (-?[\d.]+)%", xb.group(1)).group(1)) / 100
    xmas = (xpct("left"), xpct("top"), xpct("width")) if xb else None
    return {"left": pct("left"), "top": pct("top"), "w": pct("width"), "bob": bob, "stroke": stroke, "r": r, "xmas": xmas,
            "bg": hexc("splash-bg"), "brown": hexc("splash-brown")}


def splash_reach(im, left, top, w, bob):
    """tests/html.test.js's ring check: the farthest pixel with alpha > 32 from the hero centre, at both ends of the bob."""
    px = im.getchannel("A").load()
    worst = 0.0
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y] <= 32:
                continue
            for dy in (-bob, bob):
                worst = max(worst, math.hypot(left + w * ((x + 0.5) / im.width) - 0.5, top + w * ((y + 0.5) / im.height + dy) - 0.5))
    return worst


def splash_hero(sn, im, left, top, w, dy, size):
    """One hero box at `size` px: the track, a part-filled arc, the poop at one end of its bob, the inner edge and the 2 % line."""
    k = 4
    big = Image.new("RGBA", (size * k, size * k), sn["bg"] + (255,))
    d = ImageDraw.Draw(big)
    c, rr, sw = size * k / 2, sn["r"] / 120 * size * k, sn["stroke"] / 120 * size * k
    box = (c - rr - sw / 2, c - rr - sw / 2, c + rr + sw / 2, c + rr + sw / 2)  # PIL strokes inward from the box
    track = tuple(int(b + (s - b) * 0.18) for b, s in zip(sn["bg"], sn["brown"]))
    d.ellipse(box, outline=track + (255,), width=int(round(sw)))
    d.arc(box, -90, -90 + 0.65 * 360, fill=sn["brown"] + (255,), width=int(round(sw)))
    hero = big.resize((size, size), Image.Resampling.LANCZOS)
    poop = im.resize((int(round(w * size)), int(round(w * size))), Image.Resampling.LANCZOS)
    paste_subpixel(hero, poop, left * size, (top + w * dy) * size)
    inner = (sn["r"] - sn["stroke"] / 2) / 120 * size
    ring(hero, size / 2, size / 2, inner, (200, 30, 30), 1, halo=False)
    lim = inner - 0.02 * size
    dd = ImageDraw.Draw(hero)
    for i in range(0, 360, 8):  # the 2 % clearance line, dotted
        a0, a1 = math.radians(i), math.radians(i + 4)
        dd.line((size / 2 + lim * math.cos(a0), size / 2 + lim * math.sin(a0), size / 2 + lim * math.cos(a1), size / 2 + lim * math.sin(a1)),
                fill=(30, 90, 200, 255), width=1)
    return hero


def sheet9(inp, out, manifest, failures):
    sn = splash_numbers()
    stock, santa = load(ASSETS / "poop.png"), load(ASSETS / "advent/poop-santa.png")
    limit = (sn["r"] - sn["stroke"] / 2) / 120 - 0.02
    sheet = new_sheet(sn["bg"])
    header(sheet, ["Sheet 9 (1b.1): the loading screen's hatted poop, December box",
                   f"each pair: top and bottom of the bob (±{sn['bob'] * 100:.0f} % of the box); red = the ring's inner edge, blue dots = 2 % inside it",
                   f"the test passes when the art's farthest pixel (alpha > 32) is at most {limit:.3f} of the box from the centre",
                   "the December splash decoration (1b.2) is not drawn: its art is not in yet"])
    y = 108
    for i, (label, left, top, w) in enumerate(SPLASH_OPTIONS):
        im = stock if left is None else santa
        if left is None:
            left, top, w = sn["left"], sn["top"], sn["w"]
        elif left == "xmas":
            if not sn["xmas"]:
                continue
            left, top, w = sn["xmas"]
        size = 160 if i == 0 else 266
        reach = splash_reach(im, left, top, w, sn["bob"])
        body = 100 * w / sn["w"] * (stock.width / im.width)
        ok = reach <= limit
        if not ok:
            failures.append(f"sheet 9 {label}: the poop reaches {reach:.3f}, over {limit:.3f}")
        x0 = (W_PX - 2 * size - 16) // 2
        for j, dy in enumerate((-sn["bob"], sn["bob"])):
            sheet.alpha_composite(splash_hero(sn, im, left, top, w, dy, size), (x0 + j * (size + 16), y))
            text(sheet, (x0 + j * (size + 16) + 6, y + 4), "top of bob" if j == 0 else "bottom of bob", 11, (90, 60, 30))
        y += size + 6
        text(sheet, (W_PX // 2, y), label, 14, (60, 30, 10), True, "ma")
        text(sheet, (W_PX // 2, y + 18), f"left {left * 100:.1f} %, top {top * 100:.1f} %, size {w * 100:.0f} %;  reach {reach:.3f} of {limit:.3f}"
             f" ({'passes' if ok else 'FAILS'});  body {body:.0f} % of today's", 12, (60, 30, 10) if ok else (190, 20, 20), False, "ma")
        y += 44
    sheet_save(sheet, out, "sheet9-loading-poop.png", ["index.html (.splash-poop, ring, bob)", "assets/poop.png", "assets/advent/poop-santa.png"], manifest)


def header(sheet, lines):
    """Title lines on a light panel across the top (over the ceiling strip, which the screens never use for text)."""
    sheet.alpha_composite(Image.new("RGBA", (W_PX, 16 + 19 * len(lines)), (255, 255, 255, 215)), (0, 8))
    for i, ln in enumerate(lines):
        text(sheet, (W_PX // 2, 14 + i * 19), ln, 15 if i == 0 else 12, (40, 20, 40), i == 0, "ma")


# ---------------------------------------------------------------- step 1.5: the icy-look sheets (pipes and villi) and the tables
# D10's candidates: Michael's idea (moving pair as today, still pairs mostly white) and the cue-keeping pairs.
IDEA_ROW = [("moving", 0.25, True), ("still", 0.55, False), ("still", 0.70, False), ("still", 0.80, False)]  # (kind, share, always W)
CUE_ROW = [("still", 0.40, False), ("moving", 0.55, False), ("still", 0.40, False), ("moving", 0.60, False)]
VILLI_SHARES = [0.40, 0.55, 0.70, 0.80]  # each villi column takes the still share of the pipe column beside it
PIPE_SHARES = [0.25, 0.40, 0.55, 0.60, 0.70, 0.80]
VILLI_TABLE_SHARES = [0.25, 0.40, 0.55, 0.60, 0.70, 0.80]
BRIEF_PIPE_CREAM = {0.55: 43, 0.60: 35, 0.70: 31, 0.80: 29}  # plan 17, 1.5 (asserted within 1)
BRIEF_VILLI_CREAM = {0.40: 50, 0.55: 21, 0.70: 21, 0.80: 41}  # plan 17, 1.5 (asserted within 1)
BRIEF_VILLI_OTHER = {  # plan 17, D10 / 1.5, printed beside the computed numbers (not asserted)
    "white": {0.25: 171, 0.40: 137, 0.55: 104, 0.60: 92, 0.70: 70, 0.80: 46},
    "tan": {0.25: 61, 0.40: 61, 0.55: 60, 0.60: 62, 0.70: 84, 0.80: 108},
}
BRIEF_PIPE_WHITE_80 = 58


def distance_tables(failures, quiet=False):
    """Print and return the two distance tables (the sum metric of tests/levels.test.js:172). Appends to `failures`
    if a cream number is more than 1 from the plan's."""
    cream, white = CREAM, (255, 255, 255)
    levels = [level_rgb(n) for n in range(1, 7)]
    lines = []
    out = lines.append
    out("PIPE table: the pipe fill %s through W (or O: same for the fill) at each share, sum of channel differences" % (PINK,))
    head = "  white %   cream #f6ded2   villi #ec8ca0   white (snow)   " + "   ".join(f"L{n} {LEVEL_NAMES[n - 1][:6]:<6}" for n in range(1, 7))
    out(head)
    for f in [0.0] + PIPE_SHARES:
        c = mix(PINK, f)
        row = f"  {f * 100:5.0f}   {dist(c, cream):13.1f}   {dist(c, VILLI):13.1f}   {dist(c, white):12.1f}   " + "   ".join(f"{dist(c, l):11.1f}" for l in levels)
        out(row)
    for f, want in BRIEF_PIPE_CREAM.items():
        got = round(dist(mix(PINK, f), cream))
        ok = abs(got - want) <= 1
        out(f"  assert pipe vs cream at {f:.0%}: {got} (plan {want}) {'ok' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"pipe distance to the cream at {f:.0%} is {got}, the plan says {want}")
    w80 = round(dist(mix(PINK, 0.80), white))
    out(f"  pipe vs white (snow cap) at 80 %: {w80} (plan {BRIEF_PIPE_WHITE_80}) {'ok' if abs(w80 - BRIEF_PIPE_WHITE_80) <= 1 else 'DIFFERS (not asserted)'}")
    out("  catch (c), the outline against the fill (stock %d): W whitens both (distance x (1 - f)); O whitens the outline by f / 2 only" % dist(PINK, PINK_DARK))
    for f in (0.55, 0.70, 0.80):
        out(f"    at {f:.0%}: W {dist(mix(PINK, f), mix(PINK_DARK, f)):.0f}, O {dist(mix(PINK, f), mix(PINK_DARK, f / 2)):.0f}")
    out("")
    out("VILLI table: the villi fill %s through V at each share (stock row: V off)" % (VILLI,))
    out(f"  white %   cream #f6ded2   white (snow)   nearest level colour (L#)   tan (L1)   kept outline {VILLI_DARK}   [plan: white / tan]")
    for f in [0.0] + VILLI_TABLE_SHARES:
        c = mix(VILLI, f)
        near = min(range(6), key=lambda i: dist(c, levels[i]))
        plan = BRIEF_VILLI_OTHER
        extra = ""
        if f in plan["white"]:
            extra = f"   [{plan['white'][f]} / {plan['tan'][f]}{'' if (abs(round(dist(c, white)) - plan['white'][f]) <= 1 and abs(round(dist(c, levels[0])) - plan['tan'][f]) <= 1) else ' DIFFERS'}]"
        out(f"  {f * 100:5.0f}   {dist(c, cream):13.1f}   {dist(c, white):12.1f}   {dist(c, levels[near]):12.1f} (L{near + 1})            {dist(c, levels[0]):8.1f}   {dist(c, VILLI_DARK):16.1f}{extra}")
    for f, want in BRIEF_VILLI_CREAM.items():
        got = round(dist(mix(VILLI, f), cream))
        ok = abs(got - want) <= 1
        out(f"  assert villi vs cream at {f:.0%}: {got} (plan {want}) {'ok' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"villi distance to the cream at {f:.0%} is {got}, the plan says {want}")
    out("  the levels test's floors (tests/levels.test.js): a level colour >= 40 from the cream, >= 70 from the villi pink (stock constant)")
    if not quiet:
        print("\n".join(lines))
    return lines


def v_assertions(inp, failures):
    """V at every share on villi.png, ceiling.png and ground.png: it may change only the villi fill."""
    rows = []
    for name in ("villi", "ceiling", "ground"):
        src = inp.stock(name)
        for f in PIPE_SHARES:
            ok, n = v_changes_only_fill(src, formula_v(src, f), f"{name}.png")
            rows.append((name, f, ok, n))
            if not ok:
                failures.append(f"formula V at {f:.0%} changed a pixel that is not the villi fill on {name}.png (or missed fill pixels)")
    print("V check (only the villi fill changes, alpha untouched; every fill pixel changes): " +
          "; ".join(f"{name}.png {n} fill px" for name, _, _, n in rows[:: len(PIPE_SHARES)]) + " -> " + ("ok" if all(r[2] for r in rows) else "FAIL"))


def pipes_sheets(inp, out, manifest, failures):
    pipe = inp.stock("pipe")
    villi_im, ceil_im, ground_im = inp.stock("villi"), inp.stock("ceiling"), inp.stock("ground")
    snow = half(inp.twin("pipe-snow"))
    sox, soy, how = pipe_snow_anchor(inp)
    lines = distance_tables(failures)
    v_assertions(inp, failures)
    (Path(out)).mkdir(parents=True, exist_ok=True)
    (Path(out) / "sheet3b-distance-tables.txt").write_text("\n".join(lines) + "\n")
    cache = {}

    def tinted(formula, f):
        if (formula, f) not in cache:
            cache[(formula, f)] = whiten(pipe, f) if formula == "W" else formula_o(pipe, f)
        return cache[(formula, f)]

    lab = (35, 25, 25)
    row_h = 139
    for si, levels in enumerate(((1, 2), (3, 4), (5, 6)), start=1):
        sheet = new_sheet()
        header(sheet, [f"Sheet 3b, pipes {si} of 3: levels {levels[0]} and {levels[1]}, snow cap on every bottom pipe",
                       "W = every pixel whitened, O = outline kept (dark pixels take half the white). Each pair is shown by its bottom pipe.",
                       "Row 1 Michael's idea: the moving pair stays 25 % (W), still pairs 55 / 70 / 80 %. Row 2 cue-keeping: still 40 %, moving 55 / 60 %."])
        y = 90
        d = ImageDraw.Draw(sheet)
        for lvl in levels:
            rgb = level_rgb(lvl)
            block_h = 18 + 4 * row_h
            d.rectangle((0, y, W_PX, y + block_h), fill=rgb + (255,))
            text(sheet, (8, y + 2), f"Level {lvl}: {LEVEL_NAMES[lvl - 1]} #{'%02x%02x%02x' % rgb} (with 20 % white, as drawn)", 13, lab, True)
            ry = y + 18
            for formula in ("W", "O"):
                for ri, spec in enumerate((IDEA_ROW, CUE_ROW)):
                    text(sheet, (8, ry + 1), f"{formula}  " + ("Michael's idea: 25 % moving beside still pairs" if ri == 0 else "cue-keeping: moving whiter than still"), 12, lab, False)
                    top = ry + 16 + 15
                    for ci, (kind, f, always_w) in enumerate(spec):
                        cx = 90 + ci * 180
                        x0 = cx - PIPE_W // 2
                        fm = "W" if always_w else formula
                        paste_at(sheet, tinted(fm, f).crop((0, 0, 128, 80)), x0, top)
                        paste_subpixel(sheet, snow, x0 + sox, top + soy)
                        text(sheet, (cx, top + 94), f"{kind} {f * 100:.0f} %" + (" (as today)" if always_w else ""), 11, lab, False, "ma")
                    d.rectangle((0, top + 80, W_PX, top + 91), fill=CREAM + (255,))
                    if ri == 1:
                        d.line((270 + 90, top - 14, 270 + 90, top + 90), fill=lab + (255,), width=1)
                    text(sheet, (W_PX - 6, top + 80), "cream band", 10, (120, 90, 80), False, "rt")
                    ry += row_h
            y += block_h
        sheet_save(sheet, out, f"sheet3b-pipes-{si}-levels-{levels[0]}-{levels[1]}.png",
                   ["assets/pipe.png via W and O", "art-fit/pipe-snow", "guides/pipe-cap-4x-padded.png", "LEVEL_COLORS"], manifest)
    # villi sheets: the villi layer and both front strips through V at the still share, a pipe body behind them
    for si, levels in enumerate(((1, 2), (3, 4), (5, 6)), start=1):
        sheet = new_sheet()
        header(sheet, [f"Sheet 3b, villi {si} of 3: levels {levels[0]} and {levels[1]}",
                       "villi layer + ceiling strip (top) and ground strip (bottom) through V; the left part of each column is a pipe body (O at the same share)",
                       "columns: stock villi (with the stock pipe), then V at 40 / 55 / 70 / 80 %; the outline, dark band and cream band stay as they are"])
        y = 90
        d = ImageDraw.Draw(sheet)
        cols = [None] + VILLI_SHARES
        cached_v = {f: (formula_v(villi_im, f), formula_v(ceil_im, f), formula_v(ground_im, f), formula_o(pipe, f)) for f in VILLI_SHARES}
        cached_v[None] = (villi_im, ceil_im, ground_im, pipe)
        for lvl in levels:
            rgb = level_rgb(lvl)
            block_h = 16 + 14 + 234 + 4 + 234
            d.rectangle((0, y, W_PX, y + block_h), fill=rgb + (255,))
            text(sheet, (8, y + 1), f"Level {lvl}: {LEVEL_NAMES[lvl - 1]} #{'%02x%02x%02x' % rgb}", 13, lab, True)
            for ci, f in enumerate(cols):
                vi, ci_im, gi, pp = cached_v[f]
                x = ci * 144
                text(sheet, (x + 72, y + 17), "stock" if f is None else f"V {f * 100:.0f} %", 12, lab, True, "ma")
                for part in ("top", "bottom"):
                    sy = y + 16 + 14 + (0 if part == "top" else 238)
                    tile = Image.new("RGBA", (144, 234), rgb + (255,))
                    if part == "top":
                        tile.alpha_composite(vi.crop((288, 0, 432, 234)))
                        tile.alpha_composite(pp.crop((0, 300, 80, 534)), (0, 0))  # the pipe's left 80 px: the rest of the column shows the villi
                        tile.alpha_composite(ci_im.crop((288, 0, 432, 128)))
                    else:
                        tile.alpha_composite(vi.crop((288, 1046, 432, 1280)))
                        tile.alpha_composite(pp.crop((0, 300, 80, 534)), (0, 0))  # the pipe's left 80 px: the rest of the column shows the villi
                        tile.alpha_composite(gi.crop((288, 0, 432, 128)), (0, 234 - 128))
                    sheet.alpha_composite(tile, (x, sy))
                    if ci:
                        d.line((x, sy, x, sy + 233), fill=(255, 255, 255, 255), width=2)
            y += block_h
        sheet_save(sheet, out, f"sheet3b-villi-{si}-levels-{levels[0]}-{levels[1]}.png",
                   ["assets/villi.png, ceiling.png, ground.png via V", "assets/pipe.png via O", "LEVEL_COLORS"], manifest)


# ---------------------------------------------------------------- step 2.6a: storms over the Stage 1 snow (sheet 4) and the Advent piece (sheet 5a)
def _snow_cfg():
    """TUNING.advent.snow's numbers, parsed from its one line of src/config.js (as cfg() reads a number)."""
    found = re.findall(r"\bsnow:\s*\{([^}]*)\}", _config)
    if len(found) != 1:
        raise SystemExit(f"FAIL: expected one `snow: {{ ... }}` line in src/config.js, found {len(found)}")
    d = {k: float(v) for k, v in re.findall(r"(\w+):\s*(-?[0-9]*\.?[0-9]+)", found[0])}
    for k in ("count", "minSpeed", "maxSpeed", "driftPx", "driftMs", "minPx", "maxPx", "alpha", "depth"):
        if k not in d:
            raise SystemExit(f"FAIL: snow.{k} not found in src/config.js")
    return d


def _hud_cfg():
    m = re.search(r"popup:\s*\{\s*rowY:\s*\[(\d+),\s*(\d+)\],.*?fontPx:\s*(\d+)", _config, re.S)
    c = re.search(r"coin:\s*\{\s*displayPx:\s*([0-9.]+)", _config)
    t = re.search(r"barTrackColor:\s*0x([0-9a-fA-F]{6})", _config)
    if not (m and c and t):
        raise SystemExit("FAIL: popup.rowY / popup.fontPx / coin.displayPx / barTrackColor moved in src/config.js; update advent_preview.py")
    track = int(t.group(1), 16)
    return (int(m.group(1)), int(m.group(2))), int(m.group(3)), float(c.group(1)), ((track >> 16) & 255, (track >> 8) & 255, track & 255)


SNOW = _snow_cfg()
POPUP_ROWS, POPUP_FONT, COIN_PX, BAR_TRACK = _hud_cfg()
HUD_SCORE_Y = int(cfg("hudScoreY"))
HUD_STROKE_PX, HUD_STROKE_RGB = 12, (0x5a, 0x2a, 0x44)  # TEXT_STYLE in src/scenes/Play.js: strokeThickness 12, '#5a2a44'
RUN_PAIRS = [(230, 560), (520, 760)]  # run_frame()'s two pairs: (centre x, gap centre y)
STORM_DT = 1.0 / 60  # s per sim step
STORM_STEPS = 144  # 2.4 s
STORM_T = 1.2  # s: the stills' instant
TRAIL_S, TRAIL_N = 0.24, 6
GIF_FRAMES, GIF_EVERY, GIF_SIZE = 36, 4, (360, 640)
LIGHT_SEED, VORTEX_SEED = 1700, 1800
EXPECTED_COUNTS = {"light": 36, "A": 108, "B": 180, "C": 288, "fart": 36}
_PX = (SNOW["minPx"], SNOW["maxPx"])
# The storm options (Michael's S8 call; the numbers are the brief's). idx seeds 1700 + idx (flakes) and 1800 + idx (vortices).
# Michael, 26 Nov, after the first sheets: "drift from left to right diagonally when a snow storm is happening. And right to
# left horizontally while the fart is activated." So a storm's wind G (px/s) now always blows left to right, at the storm
# flakes' mean fall speed (a 45 degree slant), with gusts of +-GUST around it; the fart option F blows right to left at
# about 9x the light flakes' mean fall (near horizontal), ramped on at FART_ON and off at FART_OFF over FART_RAMP s.
GUST = 0.35
_MEAN_VY = (SNOW["minSpeed"] + SNOW["maxSpeed"]) / 2
FART_ON, FART_OFF, FART_RAMP = 0.4, 1.9, 0.25
STORM_OPTIONS = {
    "light": dict(key="light", name="Light", idx=0, extra=0, vy_mult=1.0, px=_PX, G=0.0, K=0, R=0.0, S=0.0),
    "A": dict(key="A", name="A x3", idx=1, extra=72, vy_mult=1.6, px=_PX, G=_MEAN_VY * 1.6, K=0, R=0.0, S=0.0),
    "B": dict(key="B", name="B x5", idx=2, extra=144, vy_mult=2.0, px=(5.0, 14.0), G=_MEAN_VY * 2.0, K=2, R=160.0, S=180.0),
    "C": dict(key="C", name="C x8", idx=3, extra=252, vy_mult=2.5, px=(5.0, 16.0), G=_MEAN_VY * 2.5, K=3, R=180.0, S=240.0),
    "fart": dict(key="fart", name="Fart wind", idx=4, extra=0, vy_mult=1.0, px=_PX, G=0.0, F=420.0, K=0, R=0.0, S=0.0, poop="poop-fart-santa1"),
}


def sheet_name(key, level, ext):
    return f"sheet4c-fart-wind-L{level}.{ext}" if key == "fart" else f"sheet4-storm-{key}-L{level}.{ext}"


def fart_ramp(t):
    """0 before FART_ON, up to 1 over FART_RAMP s, 1 until FART_OFF, back to 0 over FART_RAMP s."""
    if t <= FART_ON or t >= FART_OFF + FART_RAMP:
        return 0.0
    if t < FART_ON + FART_RAMP:
        return (t - FART_ON) / FART_RAMP
    if t > FART_OFF:
        return 1.0 - (t - FART_OFF) / FART_RAMP
    return 1.0


def storm_wind(spec, t):
    """px/s added to every flake's horizontal velocity (times the flake's own factor m); positive = left to right.
    A storm: G x (1 + gust x the two-sine wobble), so it never changes direction; the fart: -F x fart_ramp(t)."""
    if spec.get("F"):
        return -spec["F"] * fart_ramp(t)
    if not spec["G"]:
        return 0.0
    g = spec.get("gust", GUST)
    return spec["G"] * (1 + g * (0.65 * math.sin(2 * math.pi * t / 2.6) + 0.35 * math.sin(2 * math.pi * t / 1.1 + 1.3)))


def _make_flakes(rng, n, px, vy):
    """snowfall.js makeFlakes' draws (x, y, px, vy, phase per flake), then every flake's wind factor m in [0.7, 1.3]."""
    fl = [dict(x=rng.random() * W_PX, y=rng.random() * H_PX, px=px[0] + rng.random() * (px[1] - px[0]),
               vy=vy[0] + rng.random() * (vy[1] - vy[0]), phase=rng.random() * 2 * math.pi) for _ in range(n)]
    for f in fl:
        f["m"] = 0.7 + 0.6 * rng.random()
    return fl


def vortex_centres(spec, make_rng=random.Random):
    """K vortex heads, x in [100, 620], y in [300, 1000], from Random(1800 + idx). A draw closer than 2R to a head
    already placed is drawn again (supervisor rule, 26 Nov: B's first draw put a clockwise and a counter-clockwise
    head 39 px apart, and they cancelled); after 1000 tries the field is too small for K and R, which fails loudly."""
    rng = make_rng(VORTEX_SEED + spec["idx"])
    out, tries = [], 0
    while len(out) < int(spec["K"]):
        c = (100 + 520 * rng.random(), 300 + 700 * rng.random())
        tries += 1
        if all(math.hypot(c[0] - o[0], c[1] - o[1]) >= 2 * spec["R"] for o in out):
            out.append(c)
        elif tries > 1000:
            raise SystemExit(f"FAIL: storm {spec['key']}: cannot place {spec['K']} vortex heads 2R ({2 * spec['R']:g} px) apart")
    return out


class Storm:
    """One option's simulation: every flake's drawn position and velocity at each 1/60 s step, plus the wind."""


def simulate(spec, make_rng=random.Random, extra=None, steps=STORM_STEPS):
    """Light flakes (36, Random(1700), the same in every option) and the option's extra flakes (Random(1700 + idx)),
    stepped at 1/60 s: y += (vy + swirl_y) dt, x += (wind x m + swirl_x) dt, drawn x = x + the snowfall.js drift sine;
    a flake past the bottom re-enters at the top, past a side it wraps. Vortex heads drift at 0.5 x wind and wrap."""
    n_light = int(SNOW["count"])
    light = _make_flakes(make_rng(LIGHT_SEED), n_light, _PX, (SNOW["minSpeed"], SNOW["maxSpeed"]))
    n_extra = spec["extra"] if extra is None else extra
    extra_f = _make_flakes(make_rng(LIGHT_SEED + spec["idx"]), n_extra, spec["px"],
                           (SNOW["minSpeed"] * spec["vy_mult"], SNOW["maxSpeed"] * spec["vy_mult"]))
    flakes = light + extra_f
    cen = [list(c) for c in vortex_centres(spec, make_rng)]
    x0 = [f["x"] for f in flakes]
    x = list(x0)
    y = [f["y"] for f in flakes]
    drift_rate = SNOW["driftPx"] * 2 * math.pi * 1000 / SNOW["driftMs"]
    st = Storm()
    st.spec, st.flakes, st.n_light, st.steps, st.x0 = spec, flakes, n_light, steps, x0
    st.count = len(flakes)
    st.wind, st.xd, st.y, st.vel, st.cen = [], [], [], [], []
    for k in range(steps + 1):
        t = k * STORM_DT
        w = storm_wind(spec, t)
        st.wind.append(w)
        st.cen.append([tuple(c) for c in cen])
        xd_k, y_k, v_k = [], [], []
        for i, f in enumerate(flakes):
            ph = f["phase"] + 2 * math.pi * t * 1000 / SNOW["driftMs"]
            xd_k.append(x[i] + math.sin(ph) * SNOW["driftPx"])
            y_k.append(y[i])
            sx = sy = 0.0
            for j, (cx, cy) in enumerate(cen):
                dx, dy = x[i] - cx, y[i] - cy
                r = math.hypot(dx, dy)
                if 0 < r < spec["R"]:
                    mag = spec["S"] * math.sin(math.pi * r / spec["R"])
                    tx, ty = (dy, -dx) if j % 2 == 0 else (-dy, dx)  # even j counter-clockwise on screen, odd j clockwise
                    sx += mag * tx / r
                    sy += mag * ty / r
            vx, vyy = w * f["m"] + sx, f["vy"] + sy
            v_k.append((vx + math.cos(ph) * drift_rate, vyy))  # the drawn velocity: the drift sine's slope on top
            if k < steps:
                x[i] = (x[i] + vx * STORM_DT) % W_PX
                y[i] += vyy * STORM_DT
                if y[i] - f["px"] > H_PX:
                    y[i] = -f["px"]
        st.xd.append(xd_k)
        st.y.append(y_k)
        st.vel.append(v_k)
        for c in cen:
            c[0] = (c[0] + 0.5 * w * STORM_DT) % W_PX
    return st


def pos_at(st, t):
    """Every flake's drawn (x, y) at time t: linear between the two sim steps around it (a wrap jump takes the nearer one)."""
    u = max(0.0, t / STORM_DT)
    k0 = min(int(math.floor(u + 1e-9)), st.steps)
    k1 = min(k0 + 1, st.steps)
    fr = max(0.0, min(1.0, u - k0))
    out = []
    for i in range(st.count):
        xa, ya, xb, yb = st.xd[k0][i], st.y[k0][i], st.xd[k1][i], st.y[k1][i]
        if abs(xb - xa) > 300 or abs(yb - ya) > 300:
            out.append((xa, ya) if fr < 0.5 else (xb, yb))
        else:
            out.append((xa + (xb - xa) * fr, ya + (yb - ya) * fr))
    return out


# ---- the flake sprite: snowfall.js's 16 px texture (three filled circles), drawn scaled to the flake's px at alpha 0.9
_SPRITES = {}


def _texture16():
    k = 4
    tex = Image.new("RGBA", (16 * k, 16 * k), (0, 0, 0, 0))
    for r, rgb, a in ((8, (143, 166, 189), 0.35), (6.5, (143, 166, 189), 0.6), (5, (255, 255, 255), 1.0)):
        layer = Image.new("RGBA", tex.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse((8 * k - r * k, 8 * k - r * k, 8 * k + r * k - 1, 8 * k + r * k - 1), fill=rgb + (int(round(a * 255)),))
        tex.alpha_composite(layer)
    return tex.resize((16, 16), Image.Resampling.LANCZOS)


def flake_sprite(size, alpha):
    key = (size, round(alpha, 4))
    if key not in _SPRITES:
        if "tex" not in _SPRITES:
            _SPRITES["tex"] = _texture16()
        spr = _SPRITES["tex"].resize((size, size), Image.Resampling.LANCZOS)
        r, g, b, a = spr.split()
        _SPRITES[key] = Image.merge("RGBA", (r, g, b, a.point(lambda v: int(round(v * alpha)))))
    return _SPRITES[key]


def put(layer, spr, x, y):
    x0, y0 = max(0, -x), max(0, -y)
    x1, y1 = min(spr.width, layer.width - x), min(spr.height, layer.height - y)
    if x1 > x0 and y1 > y0:
        layer.alpha_composite(spr, (x + x0, y + y0), (x0, y0, x1, y1))


def flake_layers(st, t, trails):
    """(flakes-only layer, trail layer or None) at time t. Trails: 6 ghosts at t - 0.04 i, alpha 0.12 falling to 0.04."""
    flake = Image.new("RGBA", (W_PX, H_PX), (0, 0, 0, 0))
    trail = Image.new("RGBA", (W_PX, H_PX), (0, 0, 0, 0)) if trails else None
    sizes = [max(2, int(round(f["px"]))) for f in st.flakes]
    if trails:
        for i in range(1, TRAIL_N + 1):
            a = 0.12 - (i - 1) * (0.12 - 0.04) / (TRAIL_N - 1)
            for (gx, gy), s in zip(pos_at(st, t - i * TRAIL_S / TRAIL_N), sizes):
                put(trail, flake_sprite(s, a), int(round(gx - s / 2)), int(round(gy - s / 2)))
    for (fx, fy), s in zip(pos_at(st, t), sizes):
        put(flake, flake_sprite(s, SNOW["alpha"]), int(round(fx - s / 2)), int(round(fy - s / 2)))
    return flake, trail


def poop_centre(inp):
    """Where run_frame() puts the hatted poop: pasted at (60, 560 - h // 2 + 20); its canvas centre is the hitbox centre."""
    p = half(inp.twin("poop-santa"))
    return 60 + p.width / 2, 560 - p.height // 2 + 20 + p.height / 2


def coverage(layer, inp):
    """(% of the two pipe gaps' rectangles, % of the poop's hitbox circle) covered by flake pixels with alpha >= 128."""
    a = layer.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    tot = cov = 0
    for xc, gy in RUN_PAIRS:
        reg = a.crop((xc - PIPE_W // 2, gy - GAP_H // 2, xc + PIPE_W // 2, gy + GAP_H // 2))
        tot += reg.width * reg.height
        cov += reg.histogram()[255]
    cx, cy = poop_centre(inp)
    r = int(POOP_RADIUS)
    x0, y0 = int(round(cx)) - r, int(round(cy)) - r
    mask = Image.new("L", (2 * r, 2 * r), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
    n_mask = mask.histogram()[255]
    n_cov = ImageChops.multiply(a.crop((x0, y0, x0 + 2 * r, y0 + 2 * r)), mask).histogram()[255]
    return 100.0 * cov / tot, 100.0 * n_cov / n_mask


def top_panel(lines):
    """A translucent white panel across y 0 to 90 with `lines` (the first bold and larger), as an RGBA overlay."""
    ov = Image.new("RGBA", (W_PX, H_PX), (0, 0, 0, 0))
    ov.paste(Image.new("RGBA", (W_PX, 90), (255, 255, 255, 215)), (0, 0))
    ys = [6 + i * 20 if i == 0 else 26 + (i - 1) * 18 for i in range(len(lines))]
    for i, (ln, y) in enumerate(zip(lines, ys)):
        size = 15 if i == 0 else 12
        while size > 9 and font(size, i == 0).getlength(ln) > W_PX - 16:  # a long line shrinks to fit the sheet
            size -= 1
        text(ov, (W_PX // 2, y), ln, size, (40, 20, 40), i == 0, "ma")
    return ov


def storm_header(spec, level, cov, trails):
    n = int(SNOW["count"]) + spec["extra"]
    lo, hi = SNOW["minSpeed"] * spec["vy_mult"], SNOW["maxSpeed"] * spec["vy_mult"]
    swirl = f"; K {spec['K']}" + (f", R {spec['R']:g}, S {spec['S']:g}" if spec["K"] else "")
    return top_panel([
        (f"Sheet 4c, the fart wind (every December run, while a fart is on), level {level} ({LEVEL_NAMES[level - 1]}), t = {STORM_T:g} s" if spec.get("F") else
         f"Sheet 4, storm option {spec['name']}" + (" (control: Stage 1 as live)" if spec["key"] == "light" else "") + f", level {level} ({LEVEL_NAMES[level - 1]}), t = {STORM_T:g} s"),
        (f"{n} light flakes blown right to left at {spec['F']:g} px/s (on at {FART_ON:g} s, off at {FART_OFF:g} s, {FART_RAMP:g} s ramps)" if spec.get("F") else
         f"{n} flakes ({int(SNOW['count'])} light + {spec['extra']}); fall {lo:g} to {hi:g} px/s; flake px {spec['px'][0]:g} to {spec['px'][1]:g}; "
         + (f"wind left to right {spec['G']:g} px/s +-{GUST:.0%}" if spec["G"] else "no wind") + swirl),
        f"coverage (flakes only, alpha >= 128): pipe gaps {cov[0]:.1f} %, poop hitbox {cov[1]:.1f} %",
        "trails show the last 0.24 s (sheet aid only; the game draws no trails)" if trails else "animation: t = 0 to 2.4 s, 15 fps, no trails; coverage above is at t = 1.2 s",
    ])


def storm_base(inp, level, poop="poop-santa"):
    """run_frame()'s mock at a level's colour with no caption panel (cached), the poop on `poop`'s frame."""
    key = ("storm-base", level, poop)
    if key not in inp._cache:
        pipe = inp.stock("pipe")
        snow = half(inp.twin("pipe-snow"))
        ox, oy, _ = pipe_snow_anchor(inp)
        inp._cache[key] = run_frame(inp, level, inp.stock("villi"), inp.stock("ceiling"), inp.stock("ground"), pipe, whiten(pipe, MOVE_FRAC),
                                    snow, (ox, oy), None, None, poop_key=poop)
    return inp._cache[key]


def render_storm_still(inp, spec, level, make_rng=random.Random, sim=None):
    """(image, coverage, sim): the level's run frame, trails, flakes at t = 1.2 s, then the header."""
    st = sim or simulate(spec, make_rng)
    img = storm_base(inp, level, spec.get("poop", "poop-santa")).copy()
    flake, trail = flake_layers(st, STORM_T, True)
    cov = coverage(flake, inp)
    img.alpha_composite(trail)
    img.alpha_composite(flake)
    img.alpha_composite(storm_header(spec, level, cov, True))
    return img, cov, st


# ---- the checks (each returns failure strings; selftest feeds each a broken input)
def check_still_size(im, label, expect=(W_PX, H_PX)):
    return [] if im.size == expect else [f"{label} is {im.size[0]} x {im.size[1]}, not {expect[0]} x {expect[1]}"]


def check_counts(st, key):
    want = EXPECTED_COUNTS[key]
    return [] if st.count == want and len(st.flakes) == want and len(st.xd[0]) == want else [f"storm {key}: {st.count} simulated flakes, the spec says {want}"]


def _mean_heading(st, flakes, steps):
    """Degrees of the mean drawn velocity of `flakes` over `steps` from straight down; + = to the right, - = to the left."""
    vx = sum(st.vel[k][i][0] for k in steps for i in flakes)
    vy = sum(st.vel[k][i][1] for k in steps for i in flakes)
    return math.degrees(math.atan2(vx, vy))


def check_gusts(st, expect):
    """The wind as Michael set it (26 Nov): a storm blows left to right throughout, gusty, its own flakes slanting 30 to
    60 degrees right of straight down; the fart blows right to left, its flakes 75 to 90 degrees left of down at full
    strength; Light has none."""
    w = st.wind
    lo, hi = min(w), max(w)
    key = expect["key"]
    if expect.get("F"):
        full = [k for k in range(st.steps + 1) if fart_ramp(k * STORM_DT) == 1.0]
        fails = [] if hi <= 0 else [f"{key}: the fart wind blows left to right at some step (up to {hi:+.1f} px/s)"]
        if not full or lo > -0.99 * abs(expect["F"]):
            fails.append(f"{key}: the fart wind never reaches full strength ({lo:+.1f} px/s)")
        h = _mean_heading(st, range(st.n_light), full) if full else 0.0
        if not (-90 <= h <= -75):
            fails.append(f"{key}: at full strength the flakes head {h:+.1f} deg from straight down, not 75 to 90 to the left (horizontal)")
        st.heading = h
        return fails
    if expect["G"] == 0:
        return [] if all(v == 0 for v in w) else [f"storm {key}: wind is not exactly 0 (range {lo:.2f} to {hi:.2f})"]
    fails = []
    if lo <= 0:
        fails.append(f"storm {key}: the wind does not blow left to right throughout (range {lo:+.1f} to {hi:+.1f})")
    if hi - lo < 0.25 * expect["G"]:
        fails.append(f"storm {key}: the gusts span {hi - lo:.1f} px/s, under a quarter of the mean wind {expect['G']:g}")
    h = _mean_heading(st, range(st.n_light, st.count), range(st.steps + 1))
    if not (30 <= h <= 60):
        fails.append(f"storm {key}: the storm flakes head {h:+.1f} deg from straight down, not 30 to 60 to the right (diagonal)")
    st.heading = h
    return fails


def _angles(st, i):
    """(max angle from straight down, max angle from the flake's own first heading) in degrees over the run, drawn velocity."""
    v0 = st.vel[0][i]
    a0 = math.atan2(v0[0], v0[1])
    down = turn = 0.0
    for k in range(st.steps + 1):
        vx, vy = st.vel[k][i]
        down = max(down, abs(math.degrees(math.atan2(vx, vy))))
        d = abs(math.degrees(math.atan2(vx, vy) - a0))
        turn = max(turn, min(d, 360 - d))
    return down, turn


def check_swirls(st, expect, make_rng=random.Random):
    """B and C: >= 5 % of the flakes passing within R/2 of a (spec'd) vortex head swing past 90 degrees from straight down
    (heading up the screen); Light and A: none of the light flakes does. Returns (failures, info line)."""
    ang = [_angles(st, i) for i in range(st.count)]
    if expect["K"] == 0:
        worst = max(a[0] for a in ang[: st.n_light])
        worst_turn = max(a[1] for a in ang[: st.n_light])
        info = f"storm {expect['key']}: light flakes' largest angle from straight down {worst:.1f} deg (limit 90); largest swing from their own first heading {worst_turn:.1f} deg"
        return ([] if worst <= 90 else [f"storm {expect['key']}: a light flake turns past 90 degrees ({worst:.1f})"]), info
    # Every flake that passes within R/2 of a (moving) vortex head at any step over the 2.4 s, not only those that
    # start there (supervisor fix, 26 Nov: the start-only sample held 4 flakes for B). The vortex heads come from the
    # simulation (they drift with the wind); `cs` is the spec'd start, compared with the simulation's first step.
    cs = vortex_centres(expect, make_rng)
    if len(st.cen[0]) != len(cs) or any(math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6 for a, b in zip(st.cen[0], cs)):
        return [f"storm {expect['key']}: the simulated vortex heads are not the spec'd ones ({len(st.cen[0])} vs {len(cs)})"], f"storm {expect['key']}: vortex mismatch"
    half = expect["R"] / 2
    sel = [i for i in range(st.count)
           if any(math.hypot(st.xd[k][i] - cx, st.y[k][i] - cy) < half for k in range(st.steps + 1) for cx, cy in st.cen[k])]
    n_turn = sum(1 for i in sel if ang[i][0] > 90)
    frac = n_turn / len(sel) if sel else 0.0
    info = (f"storm {expect['key']}: {len(sel)} flakes pass within R/2 of a vortex head; {n_turn} ({frac:.0%}) head past 90 deg "
            f"from straight down, i.e. up the screen (need >= 5 %)")
    return ([] if sel and frac >= 0.05 else [f"storm {expect['key']}: only {frac:.1%} of the flakes near a vortex turn past 90 degrees (need 5 %)"]), info



def check_light_control(st):
    """The Light option is snowfall.js as built: each light flake's vy inside the config range, drawn x within driftPx of its base x."""
    fails = []
    for i in range(st.n_light):
        f = st.flakes[i]
        if not (SNOW["minSpeed"] <= f["vy"] <= SNOW["maxSpeed"]):
            fails.append(f"light flake {i}: vy {f['vy']:.1f} outside [{SNOW['minSpeed']:g}, {SNOW['maxSpeed']:g}]")
        if not (_PX[0] <= f["px"] <= _PX[1]):
            fails.append(f"light flake {i}: px {f['px']:.1f} outside [{_PX[0]:g}, {_PX[1]:g}]")
        worst = max(abs(st.xd[k][i] - st.x0[i]) for k in range(st.steps + 1))
        if worst > SNOW["driftPx"] + 1e-9:
            fails.append(f"light flake {i}: drawn x strays {worst:.2f} px from its base x (driftPx {SNOW['driftPx']:g})")
    return fails


def near_white_mask(im):
    """255 where a pixel is opaque near-white: r, g, b >= 235 and alpha >= 250."""
    r, g, b, a = im.split()
    m = ImageChops.multiply(ImageChops.multiply(r.point(lambda v: 255 if v >= 235 else 0), g.point(lambda v: 255 if v >= 235 else 0)),
                            ImageChops.multiply(b.point(lambda v: 255 if v >= 235 else 0), a.point(lambda v: 255 if v >= 250 else 0)))
    return m


def check_piece_icon(im):
    """art-fit/advent.png: 192 x 192, four corner pixels alpha 0, >= 2 % of its pixels opaque near-white (the "?")."""
    if im.size != (192, 192):
        return [f"advent.png is {im.size[0]} x {im.size[1]}, not 192 x 192"], 0.0
    fails = []
    w, h = im.size
    for c in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if im.getpixel(c)[3] != 0:
            fails.append(f"advent.png corner {c} has alpha {im.getpixel(c)[3]}, not 0 (the knockout failed)")
    n = near_white_mask(im).histogram()[255]
    share = 100.0 * n / (w * h)
    if share < 2.0:
        fails.append(f"advent.png has {share:.2f} % opaque near-white pixels, under 2 % (the white ? did not survive)")
    return fails, share


def bow_holes(im, min_area=20):
    """Enclosed transparent regions (alpha < 128, not reachable from the border through such pixels): [(area, cx, cy)]."""
    w, h = im.size
    a = im.getchannel("A").load()
    seen = [[False] * w for _ in range(h)]

    def fill(sx, sy):
        stack, cells = [(sx, sy)], []
        seen[sy][sx] = True
        while stack:
            x, y = stack.pop()
            cells.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and a[nx, ny] < 128:
                    seen[ny][nx] = True
                    stack.append((nx, ny))
        return cells

    for x in range(w):
        for y in (0, h - 1):
            if a[x, y] < 128 and not seen[y][x]:
                fill(x, y)
    for y in range(h):
        for x in (0, w - 1):
            if a[x, y] < 128 and not seen[y][x]:
                fill(x, y)
    out = []
    for y in range(h):
        for x in range(w):
            if a[x, y] < 128 and not seen[y][x]:
                cells = fill(x, y)
                if len(cells) >= min_area:
                    out.append((len(cells), sum(c[0] for c in cells) / len(cells), sum(c[1] for c in cells) / len(cells)))
    return out


# ---- sheet 4
def hud_text(sheet, xy, s, size, fnt=None):
    """src/scenes/Play.js TEXT_STYLE: bold sans-serif, white, '#5a2a44' stroke. Phaser's 12 px stroke straddles the glyph edge,
    so 6 px of it shows outside the fill (Pillow's stroke_width draws outside only)."""
    ImageDraw.Draw(sheet).text(xy, s, font=fnt or font(size, True), fill=(255, 255, 255), anchor="mm",
                               stroke_width=HUD_STROKE_PX // 2, stroke_fill=HUD_STROKE_RGB)


def gif_save(frames, out_dir, name, inputs, manifest, failures):
    path = Path(out_dir) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    pal = [f.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    durs = [70, 70, 60] * (len(frames) // 3 + 1)  # 15 fps on average (GIF delays are whole centiseconds)
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=durs[: len(frames)], loop=0, disposal=1)
    with Image.open(path) as g:
        size, n, loop = g.size, g.n_frames, g.info.get("loop")
    if size != GIF_SIZE or n != GIF_FRAMES or loop != 0:
        failures.append(f"{name}: {size[0]} x {size[1]}, {n} frames, loop {loop}; expected {GIF_SIZE[0]} x {GIF_SIZE[1]}, {GIF_FRAMES} frames, loop 0")
    manifest.append({"sheet": name, "inputs": inputs, "size": size, "path": path, "expect": GIF_SIZE, "frames": n})


def banner_sheet(inp, level, out, manifest, failures):
    spec = STORM_OPTIONS["light"]
    st = simulate(spec)
    img = storm_base(inp, level).copy()
    flake, _ = flake_layers(st, STORM_T, False)
    img.alpha_composite(flake)
    img.alpha_composite(top_panel([
        "Banner one pair ahead: (a) text only, (b) on a dark band; the popup rows (dashed) stay clear",
        f"Light snow at t = 1.2 s, level {level} ({LEVEL_NAMES[level - 1]}); score 12 at y {HUD_SCORE_Y}, popup rows at y {POPUP_ROWS[0]} and {POPUP_ROWS[1]} ({POPUP_FONT} px text)",
    ]))
    hud_text(img, (W_PX // 2, HUD_SCORE_Y), "12", 80)
    for y in POPUP_ROWS:
        dashed_rect(img, (W_PX // 2 - 120, y - POPUP_FONT // 2, W_PX // 2 + 120, y + POPUP_FONT // 2), HUD_STROKE_RGB)
        text(img, (W_PX // 2 + 130, y), f"popup row, y {y}", 12, HUD_STROKE_RGB, False, "lm")
    band = Image.new("RGBA", (W_PX, 84), BAR_TRACK + (int(round(0.55 * 255)),))
    hud_text(img, (W_PX // 2, 320), "Snowstorm ahead!", 48)
    img.alpha_composite(band, (0, 420 - 42))
    hud_text(img, (W_PX // 2, 420), "Snowstorm ahead!", 48)
    zh = None
    for idx in (2, 0):  # Hiragino Sans GB W6 (bold) first, else W3
        try:
            zh = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 48, index=idx)
            break
        except Exception:
            continue
    if zh is not None:
        img.alpha_composite(band, (0, 520 - 42))
        hud_text(img, (W_PX // 2, 520), "前方有暴风雪！", 48, zh)
    else:
        print("note: Hiragino Sans GB.ttc could not be loaded; the zh-Hans banner line is skipped")
    for y, lab in ((320, "a"), (420, "b")) + (((520, "b zh"),) if zh is not None else ()):
        text(img, (14, y), lab, 22, (255, 255, 255), True, "lm", halo=HUD_STROKE_RGB)
    dashed_vline(img, 700, 96, 1150, HUD_STROKE_RGB, 12, 6, 4)
    dashed_vline(img, 700, 96, 1150, (255, 255, 255), 12, 6, 2)
    text(img, (690, 640), "the storm starts at the next pair", 13, (255, 255, 255), True, "rm", halo=HUD_STROKE_RGB)
    failures += check_still_size(img, f"sheet4b-banner-L{level}")
    sheet_save(img, out, f"sheet4b-banner-L{level}.png", ["src/config.js (hudScoreY, popup, barTrackColor)", "run frame as sheet 3", "Light snow at t = 1.2 s"] + ([] if zh else ["(zh line skipped)"]), manifest)


def sheet4(inp, out, manifest, failures):
    sims = {k: simulate(s) for k, s in STORM_OPTIONS.items()}
    print("sheet 4 checks:")
    for k, spec in STORM_OPTIONS.items():
        st = sims[k]
        fs = check_counts(st, k) + check_gusts(st, spec)
        sw, info = check_swirls(st, spec)
        fs += sw
        head = f"; heading {st.heading:+.1f} deg" if hasattr(st, "heading") else ""
        print(f"  {k:<5} flakes {st.count} (spec {EXPECTED_COUNTS[k]}); wind {min(st.wind):+.1f} to {max(st.wind):+.1f} px/s{head}; {info}")
        failures += fs
    lf = check_light_control(sims["light"])
    print(f"  light control vs snowfall.js: {'ok' if not lf else 'FAIL'} ({int(SNOW['count'])} flakes: vy in [{SNOW['minSpeed']:g}, {SNOW['maxSpeed']:g}], drawn x within {SNOW['driftPx']:g} px)")
    failures += lf
    rows = []
    ins = ["src/config.js snow line", "src/ui/snowfall.js rules", "run frame as sheet 3 (villi, ceiling, ground, pipe, pipe-snow, poop-santa)"]
    for k, spec in STORM_OPTIONS.items():
        for lvl in (1, 5):
            img, cov, _ = render_storm_still(inp, spec, lvl, sim=sims[k])
            failures += check_still_size(img, sheet_name(k, lvl, "png"))
            rows.append((spec["name"], lvl, cov))
            sheet_save(img, out, sheet_name(k, lvl, "png"), ins, manifest)
    a = render_storm_still(inp, STORM_OPTIONS["B"], 1)[0].tobytes()
    b = render_storm_still(inp, STORM_OPTIONS["B"], 1)[0].tobytes()
    print(f"  determinism: option B level 1 rendered twice in memory: {'byte-identical' if a == b else 'DIFFERENT'}")
    if a != b:
        failures.append("option B's level-1 still differs between two renders (an unseeded RNG?)")
    for lvl in (1, 5):
        banner_sheet(inp, lvl, out, manifest, failures)
    for k, spec in STORM_OPTIONS.items():
        st = sims[k]
        cov = next(c for n, l, c in rows if n == spec["name"] and l == 1)
        base = storm_base(inp, 1, spec.get("poop", "poop-santa"))
        head = storm_header(spec, 1, cov, False)
        frames = []
        for f in range(GIF_FRAMES):
            fl, _ = flake_layers(st, f * GIF_EVERY * STORM_DT, False)
            im = base.copy()
            im.alpha_composite(fl)
            im.alpha_composite(head)
            frames.append(im.convert("RGB").resize(GIF_SIZE, Image.Resampling.LANCZOS))
        gif_save(frames, out, sheet_name(k, 1, "gif"), ins + ["level 1, no trails, 15 fps, 36 frames"], manifest, failures)
    print("\nCOVERAGE (flakes only at t = 1.2 s, alpha >= 128; the flakes do not depend on the level colour):")
    print(f"  {'option':<8} {'level':<14} {'pipe gaps':>10} {'poop hitbox':>12}")
    for name, lvl, cov in rows:
        print(f"  {name:<8} L{lvl} {LEVEL_NAMES[lvl - 1]:<10} {cov[0]:>9.2f} % {cov[1]:>10.2f} %")


# ---- sheet 5a
def sheet5a(inp, out, manifest, failures):
    icon = inp.twin("advent")
    f, share = check_piece_icon(icon)
    failures += f
    holes = bow_holes(icon)
    print(f"sheet 5a: advent.png {icon.size[0]} x {icon.size[1]}, opaque near-white {share:.1f} % ({'ok' if not f else 'FAIL'}); enclosed transparent regions "
          f"(alpha < 128, >= 20 px): {[(a, round(x), round(y)) for a, x, y in holes]}")
    mys = inp.stock("mystery")
    coin = inp.stock("coin")
    if mys.width % 192 or mys.height != 192:
        raise SystemExit(f"FAIL: assets/mystery.png is {mys.size}, not 8 frames of 192 x 192")
    if coin.width % 106 or coin.height != 106:
        raise SystemExit(f"FAIL: assets/coin.png is {coin.size}, not frames of 106 x 106")
    mys0, coin0 = mys.crop((0, 0, 192, 192)), coin.crop((0, 0, 106, 106))
    items = [("advent (piece)", icon, SPRITE_SCALE), ("candy-cane", inp.twin("candy-cane"), SPRITE_SCALE), ("gingerbread", inp.twin("gingerbread"), SPRITE_SCALE),
             ("bacteria-santa", inp.twin("bacteria-santa"), SPRITE_SCALE), ("bean", inp.stock("bean"), SPRITE_SCALE), ("postbiotic", inp.stock("postbiotic"), SPRITE_SCALE),
             ("mystery (frame 0)", mys0, SPRITE_SCALE), (f"coin (frame 0, {COIN_PX:g} px)", coin0, COIN_PX / 106)]
    lab = (40, 30, 20)
    for lvl in (1, 5):
        sheet = new_sheet(level_rgb(lvl))
        lines = ["Sheet 5a: the Advent piece at 96 px among December's pickups; does it read apart from the mystery box?",
                 f"level {lvl} ({LEVEL_NAMES[lvl - 1]}); white ring = hitbox circle (itemRadius {ITEM_RADIUS:g}); the kernel has no ring"]
        if len(holes) >= 2:
            lines.append("the two holes inside the bow loops are transparent (alpha 0), so the level colour shows through")
        sheet.alpha_composite(top_panel(lines))
        for n, (name, im, sc) in enumerate(items):
            cx, cy = 90 + (n % 4) * 180, 230 + (n // 4) * 220
            cell = Cell(name, im, ITEM_RADIUS, scale=sc)
            paste_at(sheet, cell.img, int(round(cx - cell.img.width / 2)), int(round(cy - cell.img.height / 2)))
            if "coin" not in name:
                ring(sheet, cx, cy, ITEM_RADIUS)
            text(sheet, (cx, cy + 62), name, 12, lab, False, "ma")
        text(sheet, (W_PX // 2, 700), "confusion check: the piece beside the stock mystery box", 14, lab, True, "ma")
        for yc, k, tag in ((900, 0.5, None), (1080, 0.25, "at half size (48 px)")):
            for cx, im, name in ((260, icon, "advent piece (new)"), (460, mys0, "mystery box (stock)")):
                s = half(im, k)
                paste_at(sheet, s, int(round(cx - s.width / 2)), int(round(yc - s.height / 2)))
                text(sheet, (cx, yc + s.height // 2 + 6), name, 12, lab, False, "ma")
            if tag:
                text(sheet, (W_PX // 2, yc + 24 + 30), tag, 12, lab, True, "ma")
        failures += check_still_size(sheet, f"sheet5a-pickups-L{lvl}")
        sheet_save(sheet, out, f"sheet5a-pickups-L{lvl}.png", ["art-fit/advent, candy-cane, gingerbread, bacteria-santa", "assets/bean, postbiotic, mystery (frame 0), coin (frame 0)"], manifest)


# ---- sheet 5 (step 2.14): the Advent book mock-up on the real December shots
BOOK_ORDER = [7, 14, 4, 18, 17, 22, 12, 10, 20, 3, 23, 19, 8, 13, 1, 0, 11, 16, 21, 9, 15, 2, 5, 6]  # TUNING.advent.puzzle.order (asserted)
BOOK_COLS, BOOK_ROWS, BOOK_SLOT, BOOK_X0, BOOK_Y0 = 4, 6, 166, 28, 180
B_FILL, B_STROKE, B_GOLD = (26, 11, 20), (232, 94, 150), (255, 214, 0)
B_LOCK, B_LOCK_LINE = (42, 20, 32), (74, 42, 58)
B_LATE = {3, 7, 10, 12}  # found after their day (no star)
B_OWNED_B = set(range(1, 15)) - {6, 9, 13}
STAR_BOX = (133, 3, 163, 33)  # slot-relative box the tile check ignores (the on-the-day star)
BOOK_TILE_TOL = 3.0  # mean absolute difference per channel


def book_order():
    """TUNING.advent.puzzle.order from src/config.js (cfg() reads numbers only, so a small regex), asserted equal to the hard-coded copy."""
    m = re.search(r"puzzle:\s*\{[^}]*?order:\s*\[([0-9,\s]+)\]", _config)
    if not m:
        raise SystemExit("FAIL: TUNING.advent.puzzle.order not found in src/config.js")
    got = [int(v) for v in m.group(1).replace(",", " ").split()]
    if got != BOOK_ORDER:
        raise SystemExit(f"FAIL: src/config.js puzzle order {got} differs from advent_preview.py's copy {BOOK_ORDER}")
    return got


def slot_xy(cell):
    return BOOK_X0 + BOOK_SLOT * (cell % BOOK_COLS), BOOK_Y0 + BOOK_SLOT * (cell // BOOK_COLS)


def emoji_img(ch, size):
    """An Apple Color Emoji (only its 160 px bitmap strike exists) resized to size x size."""
    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 0), ch, font=ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 160), embedded_color=True)
    return im.resize((size, size), Image.Resampling.LANCZOS)


def _mask(size, fn, k=4):
    m = Image.new("L", (size[0] * k, size[1] * k), 0)
    fn(ImageDraw.Draw(m), k)
    return m.resize(size, Image.Resampling.LANCZOS)


def paint(sheet, xy, colour, mask, alpha=1.0):
    if alpha != 1.0:
        mask = mask.point(lambda v: int(round(v * alpha)))
    sheet.paste(tuple(colour) + (255,), (int(xy[0]), int(xy[1]), int(xy[0]) + mask.width, int(xy[1]) + mask.height), mask)


def rrect(sheet, box, radius, fill=None, alpha=1.0, stroke=None, sw=0):
    """A rounded rectangle on its edge box (x0, y0, x1, y1), anti-aliased; the stroke is centred on the edge (sw px wide)."""
    x0, y0, x1, y1 = box
    pad = sw // 2 + 2
    ox, oy, size = x0 - pad, y0 - pad, (x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)
    if fill is not None:
        paint(sheet, (ox, oy), fill, _mask(size, lambda d, k: d.rounded_rectangle(((x0 - ox) * k, (y0 - oy) * k, (x1 - ox) * k - 1, (y1 - oy) * k - 1), radius * k, fill=255)), alpha)
    if stroke is not None and sw:
        h = sw / 2

        def ring_fn(d, k):
            d.rounded_rectangle((round((x0 - ox - h) * k), round((y0 - oy - h) * k), round((x1 - ox + h) * k) - 1, round((y1 - oy + h) * k) - 1), round((radius + h) * k), fill=255)
            d.rounded_rectangle((round((x0 - ox + h) * k), round((y0 - oy + h) * k), round((x1 - ox - h) * k) - 1, round((y1 - oy - h) * k) - 1), max(0, round((radius - h) * k)), fill=0)
        paint(sheet, (ox, oy), stroke, _mask(size, ring_fn))


def dim_box(sheet, box, a):
    reg = sheet.crop(box)
    sheet.paste(Image.blend(reg, Image.new("RGBA", reg.size, (0, 0, 0, 255)), a), box[:2])


def glow_box(sheet, box, grow, blur, alpha):
    """A white glow: the box grown by `grow` px each side, Gaussian-blurred, at `alpha`."""
    m = Image.new("L", sheet.size, 0)
    ImageDraw.Draw(m).rectangle((box[0] - grow, box[1] - grow, box[2] - 1 + grow, box[3] - 1 + grow), fill=255)
    paint(sheet, (0, 0), (255, 255, 255), m.filter(ImageFilter.GaussianBlur(blur)), alpha)


def star_tile(cx, cy):
    """The on-the-day star: 5 points, outer radius 13, inner 5.5, one point up, gold with a 2 px dark outline centred on its edge.
    Returns (tile, top-left x, y) for a 40 x 40 RGBA tile."""
    k, n = 4, 40
    big = Image.new("RGBA", (n * k, n * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    pts = [((n / 2 + (13 if i % 2 == 0 else 5.5) * math.cos(math.radians(-90 + 36 * i))) * k,
            (n / 2 + (13 if i % 2 == 0 else 5.5) * math.sin(math.radians(-90 + 36 * i))) * k) for i in range(10)]
    d.polygon(pts, fill=B_GOLD + (255,))
    d.line(pts + [pts[0]], fill=B_FILL + (255,), width=2 * k, joint="curve")
    return big.resize((n, n), Image.Resampling.LANCZOS), int(round(cx - n / 2)), int(round(cy - n / 2))


class BookRes:
    """The Advent book's inputs (loaded once): the puzzle frames at 332 and 166, the shots, the piece icon."""

    def __init__(self):
        mc = main_checkout()
        self.order = book_order()
        sheet = load(mc / "meta/advent-previews/puzzle/out/advent-puzzle.png").convert("RGB")
        if sheet.size != (BOOK_COLS * 332, BOOK_ROWS * 332):
            raise SystemExit(f"FAIL: advent-puzzle.png is {sheet.size}, not {BOOK_COLS * 332} x {BOOK_ROWS * 332}")
        self.frames = [sheet.crop((332 * (c % BOOK_COLS), 332 * (c // BOOK_COLS), 332 * (c % BOOK_COLS + 1), 332 * (c // BOOK_COLS + 1))) for c in range(24)]
        self.tiles = [f.resize((BOOK_SLOT, BOOK_SLOT), Image.Resampling.LANCZOS) for f in self.frames]
        self.shots = mc / ".claude/plans/17-previews/D/shots"
        self.icon = load(ROOT / "assets/advent/advent.png")
        self._shot = {}

    def shot(self, name):
        if name not in self._shot:
            im = load(self.shots / name)
            if im.size != (W_PX, H_PX):
                raise SystemExit(f"FAIL: {name} is {im.size}, not 720 x 1280")
            self._shot[name] = im
        return self._shot[name].copy()

    def home(self):
        """D1a with its Advent chip covered by the same box of D0 (x 180..540, y 192..238)."""
        im = self.shot("D1a-home-1205-none-en.png")
        im.paste(self.shot("D0-home-1115-none-en.png").crop((180, 192, 540, 238)), (180, 192))
        return im


_BOOK_RES = []


def book_res():
    if not _BOOK_RES:
        _BOOK_RES.append(BookRes())
    return _BOOK_RES[0]


def book_sheet(res, owned, stars, count=None, draw_pieces=True):
    """The Advent book: D1a home darkened to 0.45, the panel, the count line, 24 slots (owned pieces at their cell, locked ones plain)."""
    sheet = res.home()
    sheet.paste(sheet.convert("RGB").point(lambda v: int(round(v * 0.45))).convert("RGBA"))
    sheet.alpha_composite(Image.new("RGBA", (696, 1112), B_FILL + (int(round(0.95 * 255)),)), (12, 84))
    rrect(sheet, (12, 84, 708, 1196), 0, stroke=B_STROKE, sw=8)
    x = res.shot("D2a-popup-1205-p1-5-en.png").convert("RGB").crop((588, 216, 644, 272))
    bg = x.getpixel((2, 2))
    lum = x.convert("L").point(lambda v: max(0, min(255, int(round((v - sum(bg) / 3) / (255 - sum(bg) / 3) * 255)))))
    paint(sheet, (636, 100), (255, 255, 255), lum)  # the Daily window's white X, same size, as a mask so its background does not show
    text(sheet, (360, 132), f"{len(owned) if count is None else count} of 24 found", 36, B_GOLD, True, "mm")
    cell_piece = {res.order[k - 1]: k for k in owned}
    d = ImageDraw.Draw(sheet)
    for c in range(24):
        sx, sy = slot_xy(c)
        if c in cell_piece:
            sheet.paste(res.tiles[c], (sx, sy))
            if cell_piece[c] in stars:
                tile, tx, ty = star_tile(sx + 148, sy + 18)
                sheet.alpha_composite(tile, (tx, ty))
        else:
            d.rectangle((sx, sy, sx + BOOK_SLOT - 1, sy + BOOK_SLOT - 1), fill=B_LOCK + (255,), outline=B_LOCK_LINE + (255,), width=1)
    return sheet


def check_book_tiles(sheet_img, owned, tiles, order=BOOK_ORDER):
    """Failure strings: every owned piece's slot must hold its frame (mean absolute difference per channel below 3, the star's corner box
    ignored) and every other slot's centre pixel must be the locked fill."""
    fails = []
    im = sheet_img.convert("RGB")
    if im.size != (W_PX, H_PX):
        return [f"book sheet is {im.size}, not 720 x 1280"]
    cells = {order[k - 1]: k for k in owned}
    ignored = (STAR_BOX[2] - STAR_BOX[0]) * (STAR_BOX[3] - STAR_BOX[1])
    n = BOOK_SLOT * BOOK_SLOT - ignored
    for c in range(24):
        sx, sy = slot_xy(c)
        if c in cells:
            reg = im.crop((sx, sy, sx + BOOK_SLOT, sy + BOOK_SLOT))
            diff = ImageChops.difference(reg, tiles[c])
            ImageDraw.Draw(diff).rectangle((STAR_BOX[0], STAR_BOX[1], STAR_BOX[2] - 1, STAR_BOX[3] - 1), fill=(0, 0, 0))
            means = [s / n for s in ImageStat.Stat(diff).sum]
            if max(means) >= BOOK_TILE_TOL:
                fails.append(f"piece {cells[c]} (cell {c}): slot at ({sx}, {sy}) differs from its frame by {max(means):.2f} per channel (limit {BOOK_TILE_TOL:g})")
        else:
            px = im.getpixel((sx + BOOK_SLOT // 2, sy + BOOK_SLOT // 2))
            if px != B_LOCK:
                fails.append(f"locked slot {c} at ({sx}, {sy}): centre pixel {px}, not {B_LOCK}")
    return fails


def _fit_pencil():
    """U+270E 22 px tall, white with a 3 px dark outline, as a tile (from Arial Unicode; a drawn polygon if the font is missing)."""
    k = 4
    try:
        f100 = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 100)
        h100 = f100.getmask("✎").getbbox()
        size = int(round(100 * 22 * k / (h100[3] - h100[1])))
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", size)
        pad = 3 * k + 4
        bb = f.getmask("✎").getbbox()
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        big = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        d.text((pad - bb[0], pad - bb[1]), "✎", font=f, fill=B_FILL + (255,), stroke_width=3 * k, stroke_fill=B_FILL + (255,))
        d.text((pad - bb[0], pad - bb[1]), "✎", font=f, fill=(255, 255, 255, 255))
        ink = (pad, pad, pad + w, pad + h)
    except Exception:
        w, h = 31 * k, 22 * k
        pad = 3 * k + 4
        big = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        poly = [(pad + 4, pad + h), (pad, pad + h - 10 * k // 2), (pad + w - 10, pad), (pad + w, pad + 8), (pad + 14, pad + h)]
        d.polygon(poly, fill=B_FILL + (255,), outline=B_FILL + (255,), width=3 * k)
        d.polygon(poly, fill=(255, 255, 255, 255))
        ink = (pad, pad, pad + w, pad + h)
    small = big.resize((big.width // k, big.height // k), Image.Resampling.LANCZOS)
    return small, ((ink[0] + ink[2]) / 2 / k, (ink[1] + ink[3]) / 2 / k)


def dominant(im, box, light=True):
    """The most common colour in a box among the light (or dark) pixels: a shot's text colour without hard-coding it."""
    from collections import Counter
    raw = im.convert("RGB").crop(box).tobytes()
    px = [p for p in zip(raw[0::3], raw[1::3], raw[2::3]) if (sum(p) > 400) == light]
    return Counter(px).most_common(1)[0][0]


def sheet5(inp, out, manifest, failures):
    res = book_res()
    order = res.order
    srcs_book = ["puzzle/out/advent-puzzle.png", "D shots: D1a (home), D0 (chip patch), D2a (the X)", "src/config.js advent.puzzle.order"]
    saved = []

    def save(sheet, name, inputs):
        failures.extend(check_still_size(sheet, name[:-4]))
        sheet_save(sheet, out, name, inputs, manifest)
        saved.append(name)
        return manifest[-1]["path"]

    print("sheet 5: the Advent book")
    all_p = set(range(1, 25))
    states = [("sheet5-book-a-none.png", set(), set()),
              ("sheet5-book-b-mix.png", B_OWNED_B, B_OWNED_B - B_LATE),
              ("sheet5-book-c-all.png", all_p, all_p - B_LATE),
              ("sheet5-book-c2-all-nomarks.png", all_p, set())]
    for name, owned, stars in states:
        path = save(book_sheet(res, owned, stars), name, srcs_book)
        bad = check_book_tiles(Image.open(path), owned, res.tiles, order)
        print(f"  {name}: {len(owned)} owned, {len(stars)} starred, tile check {'ok' if not bad else 'FAIL'}")
        failures.extend(f"{name}: {b}" for b in bad)
    # the add-piece animation: state b without piece 14 in its slot
    owned10 = B_OWNED_B - {14}
    stars10 = owned10 - B_LATE
    cell14 = order[13]
    sx, sy = slot_xy(cell14)
    assert (sx, sy) == (194, 678), (sx, sy)
    f14 = res.frames[cell14]
    panel_box = (8, 80, 712, 1200)
    caps = ["Frame 1 of 3 · 0 to 1.0 s · chimes build", "Frame 2 of 3 · 1.0 to 2.3 s · chimes peak", "Frame 3 of 3 · 2.3 s lock click · glow fades to 3.3 s"]
    # frame 1: dim 0.45, glow (grown 28, blur 14, 0.9), the piece at 332 centred at (360, 678)
    s = book_sheet(res, owned10, stars10)
    dim_box(s, panel_box, 0.45)
    glow_box(s, (194, 512, 526, 844), 28, 14, 0.9)
    s.paste(f14, (194, 512))
    text(s, (360, 1238), caps[0], 22, (255, 255, 255), False, "mm", halo=B_FILL)
    save(s, "sheet5-anim-1.png", srcs_book + ["frame of piece 14 (cell %d)" % cell14])
    # frame 2: dim 0.25, glow scaled to the piece (grown 21, blur 10.5, 0.75), the piece at 249 centred at (318.5, 719.5)
    s = book_sheet(res, owned10, stars10)
    dim_box(s, panel_box, 0.25)
    glow_box(s, (194, 595, 443, 844), 21, 10.5, 0.75)
    s.paste(f14.resize((249, 249), Image.Resampling.LANCZOS), (194, 595))
    text(s, (360, 1238), caps[1], 22, (255, 255, 255), False, "mm", halo=B_FILL)
    save(s, "sheet5-anim-2.png", srcs_book + ["frame of piece 14 (cell %d)" % cell14])
    # frame 3: no dim, the piece in its slot at 166, glow under it (grown 14, blur 8, 0.45), 11 found
    s = book_sheet(res, owned10, stars10, count=11)
    glow_box(s, (sx, sy, sx + BOOK_SLOT, sy + BOOK_SLOT), 14, 8, 0.45)
    s.paste(res.tiles[cell14], (sx, sy))
    tile, tx, ty = star_tile(sx + 148, sy + 18)
    s.alpha_composite(tile, (tx, ty))
    text(s, (360, 1238), caps[2], 22, (255, 255, 255), False, "mm", halo=B_FILL)
    save(s, "sheet5-anim-3.png", srcs_book + ["frame of piece 14 (cell %d)" % cell14])
    # the home screen with the Advent button
    srcs_home = ["D shots: D1a (home), D0 (chip patch)", "assets/advent/advent.png"]
    for name, haloed in (("sheet5-home-a-normal.png", False), ("sheet5-home-b-glow.png", True)):
        s = res.home()
        if haloed:  # white radial halo: alpha 0.9 up to the rim (r 44), fading linearly to 0 at r 84
            g = Image.new("L", (168, 168))
            g.putdata([int(round(255 * 0.9 * max(0.0, min(1.0, 1 - (math.hypot(x + 0.5 - 84, y + 0.5 - 84) - 44) / 40)))) for y in range(168) for x in range(168)])
            paint(s, (100 - 84, 124 - 84), (255, 255, 255), g)
        rrect(s, (56, 80, 144, 168), 44, fill=B_FILL, alpha=0.55, stroke=B_STROKE, sw=4)
        icon = res.icon.resize((60, 60), Image.Resampling.LANCZOS)
        s.alpha_composite(icon, (70, 94))
        ImageDraw.Draw(s).text((140, 164), "5/24", font=font(24, True), fill=B_GOLD, anchor="mm", stroke_width=2, stroke_fill=B_FILL)
        save(s, name, srcs_home)
    # the Daily window with the (?) and the pencil
    s = res.shot("D2a-popup-1205-p1-5-en.png")
    ring(s, 104, 244, 24, (255, 255, 255), 3, halo=False)
    ImageDraw.Draw(s).text((104, 244), "?", font=font(30, True), fill=(255, 255, 255), anchor="mm")
    pen, (pcx, pcy) = _fit_pencil()
    s.alpha_composite(pen, (int(round(222 - pcx)), int(round(292 - pcy))))
    save(s, "sheet5-daily.png", ["D shots: D2a (the Daily window)", "U+270E from Arial Unicode"])
    # the board with a fifth tab (Advent)
    src = res.shot("D5-board-1205-gifts-en.png")
    s = src.copy()
    panel = src.getpixel((100, 208))[:3]
    track, stroke, pill = src.getpixel((190, 208))[:3], src.getpixel((360, 181))[:3], src.getpixel((290, 208))[:3]
    title_pink, sub_col = dominant(src, (190, 110, 530, 170)), dominant(src, (270, 245, 450, 276))
    glyphs = {x: src.crop((x - 26, 180, x + 26, 232)) for x in (216, 312, 408, 504)}
    d = ImageDraw.Draw(s)
    d.rectangle((162, 176, 558, 240), fill=panel + (255,))  # the old 384 px track
    rrect(s, (120, 180, 600, 236), 28, fill=track, stroke=stroke, sw=4)
    rrect(s, (508, 185, 596, 231), 23, fill=pill)
    # The 🎅 was cropped from under the shot's selected pill: its pill-coloured pixels take the track's colour.
    g = glyphs[312].convert("RGB")
    g.putdata([track if sum(abs(a - b) for a, b in zip(px, pill)) < 40 else px for px in g.getdata()])
    glyphs[312] = g
    for old, new in zip((216, 312, 408, 504), (168, 264, 360, 456)):
        s.paste(glyphs[old], (new - 26, 206 - 26))
    s.alpha_composite(emoji_img("\U0001f9e9", 40), (552 - 20, 206 - 20))
    d.rectangle((190, 108, 530, 172), fill=panel + (255,))  # title
    d.rectangle((262, 244, 458, 276), fill=panel + (255,))  # sub-line
    d.text((360, 159), "ADVENT", font=font(51, True), fill=title_pink, anchor="ms")
    d.text((360, 267), "Dec 2026 · pieces found", font=font(22), fill=sub_col, anchor="ms")
    d.rectangle((48, 270, 672, 530), fill=panel + (255,))  # rows 1 to 5
    rows = [(1, "Gerty", "\U0001f384", 24), (2, "Bean", "\U0001f332", 24), (3, "Plop", None, 17), (4, "Michael", None, 11), (5, "Zed", None, 6)]
    for (rank, name, tree, n), y in zip(rows, (296, 348, 400, 452, 504)):
        mine = rank == 4
        d.text((96, y + 12), f"{rank}.", font=font(34, True), fill=title_pink, anchor="ls")
        d.text((164, y + 12), name, font=font(34, True), fill=title_pink if mine else (255, 255, 255), anchor="ls")
        if tree:
            ex = 164 + font(34, True).getlength(name) + 8
            s.alpha_composite(emoji_img(tree, 28), (int(round(ex)), y - 1 - 14))
        d.text((624, y + 12), str(n), font=font(34, True), fill=title_pink if mine else (255, 255, 255), anchor="rs")
    foot = dominant(src, (260, 1074, 460, 1100))
    d.rectangle((200, 1070, 520, 1104), fill=panel + (255,))  # "You: #4 of 5 · 42" (the Daily's score)
    d.text((360, 1096), "You: #4 of 5 · 11", font=font(24), fill=foot, anchor="ms")
    save(s, "sheet5-board-tabs.png", ["D shots: D5 (the board)", "Apple Color Emoji (puzzle, trees)"])
    if len(saved) != 11:
        failures.append(f"sheet 5 wrote {len(saved)} sheets, expected 11")
    return res


def book_selftest(missed):
    """Step 2.14's negative control: a state-b book with one owned tile pasted 6 px right of its slot must be rejected by check_book_tiles."""
    res = book_res()
    good = book_sheet(res, B_OWNED_B, B_OWNED_B - B_LATE)
    if check_book_tiles(good, B_OWNED_B, res.tiles, res.order):
        print("selftest: the real state-b book already fails its own tile check")
        missed.append("real book fails")
    bad = good.copy()
    cell = res.order[1]  # piece 2
    sx, sy = slot_xy(cell)
    ImageDraw.Draw(bad).rectangle((sx, sy, sx + BOOK_SLOT - 1, sy + BOOK_SLOT - 1), fill=B_LOCK + (255,))
    bad.paste(res.tiles[cell], (sx + 6, sy))
    fails = check_book_tiles(bad, B_OWNED_B, res.tiles, res.order)
    print(f"selftest: a book tile pasted 6 px right of its slot: {'REJECTED' if fails else 'ACCEPTED (check is blind!)'}" + (f" ({fails[0]})" if fails else ""))
    if not fails:
        missed.append("a book tile 6 px off")


# ---- sheet 10 (step 1b.2d): the "Choose your 🎅" mock-ups (Gate A, twelve sheets)
PANEL_FILL = (26, 11, 20)  # the Daily window's panel fill, also the picker's
PK_PINK, PK_TITLE = (232, 94, 150), (248, 160, 200)
Q_CENTRE, X_CENTRE, ZONE = (104, 244), (616, 244), 88
RED_DOT = (255, 59, 48)
ZONE_CYAN, ZONE_YELLOW, ZONE_WHITE = (0, 200, 255), (255, 214, 0), (255, 255, 255)
PICK_PANEL = (60, 290, 660, 990)
GRID_X0, GRID_Y0, CELL, STEP = 86, 420, 88, 92
TONES = ["", "\U0001F3FB", "\U0001F3FC", "\U0001F3FD", "\U0001F3FE", "\U0001F3FF"]
CJK_PATHS = ("/System/Library/Fonts/PingFang.ttc", "/Library/Fonts/Arial Unicode.ttf")
HELP_EN = ("All December, the \U0001F385 in the Daily Dump changes each time you visit. Tap it to choose your favourite, in any skin tone. "
           "It is saved on this device only.\n\nEach day's Daily hides one Advent piece. Find all 24 by 24 December for the \U0001F384, "
           "or by 31 December for the \U0001F332. Catch-ups count for both.")
HELP_ZH = ("整个十二月，每日一拉里的\U0001F385每次来访都会变。点它，选你最喜欢的一个，任何肤色都行。只保存在这台设备上。\n\n"
           "每天的每日一拉都藏着一块圣诞拼图。12月24日前找齐24块得\U0001F384，12月31日前找齐得\U0001F332。补领的都算。")
FONTS_USED = set()
_EMOJI_PNG = {}
_S10_SHOTS = {}


def emoji_png(seq, size):
    """One of the 18 picker emoji from meta/advent-previews/emoji/<hex code points joined by '-'>.png, cropped to its alpha box and
    fitted (aspect kept, centred) into a size x size square. SystemExit naming the file if it is missing."""
    name = "-".join(f"{ord(c):x}" for c in seq) + ".png"
    key = (name, size)
    if key not in _EMOJI_PNG:
        p = main_checkout() / "meta/advent-previews/emoji" / name
        if not p.exists():
            raise SystemExit(f"FAIL: missing emoji PNG {p}")
        im = Image.open(p).convert("RGBA")
        bb = ink_bbox(im)
        if not bb:
            raise SystemExit(f"FAIL: emoji PNG {p} is empty")
        im = im.crop(bb)
        k = size / max(im.size)
        im = im.resize((max(1, int(round(im.width * k))), max(1, int(round(im.height * k)))), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
        _EMOJI_PNG[key] = out
    return _EMOJI_PNG[key].copy()


def cjk_font(size):
    for p in CJK_PATHS:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    raise SystemExit("FAIL: no CJK font (PingFang.ttc or Arial Unicode.ttf) for the Chinese sheets")


class Face:
    """A text face: Helvetica (Latin) or a CJK font; CJK bold is faked with a 1 px stroke (the CJK fonts here have no bold)."""

    def __init__(self, cjk, size, bold=False):
        self.size, self.fake = size, bool(cjk and bold)
        self.f = cjk_font(size) if cjk else font(size, bold)
        FONTS_USED.add(f"{Path(self.f.path).name}{' (1 px stroke for bold)' if self.fake else ''}")
        self.asc, self.desc = self.f.getmetrics()

    def length(self, s):
        return self.f.getlength(s) + (2 if self.fake else 0)

    def draw(self, sheet, xy, s, fill):
        ImageDraw.Draw(sheet).text(xy, s, font=self.f, fill=fill, anchor="ls", stroke_width=1 if self.fake else 0, stroke_fill=fill)


_EMO = r"[\U0001F000-\U0001FAFF][\U0001F3FB-\U0001F3FF]?(?:‍[\U0001F000-\U0001FAFF][\U0001F3FB-\U0001F3FF]?)*️?"
_CJKR = r"　-〿㐀-鿿＀-￯"
_TOK = re.compile(_EMO + r"|\s+|[" + _CJKR + r"]|[^\s" + _CJKR + r"\U0001F000-\U0001FAFF]+")
_NOBREAK = set("，。；：、！？）」』”")


def tokens(s):
    return [("e" if re.fullmatch(_EMO, t) else "s" if t.isspace() else "t", t) for t in _TOK.findall(s)]


def tok_w(face, kind, t):
    return face.size if kind == "e" else face.length(t)


def line_w(face, toks):
    return sum(tok_w(face, k, t) for k, t in toks)


def wrap_text(s, face, maxw):
    """Greedy wrap at maxw px: a list of lines (token lists); '\\n' starts a paragraph, an empty paragraph is one blank line."""
    lines = []
    for para in s.split("\n"):
        cur, w = [], 0.0
        for kind, t in tokens(para):
            tw = tok_w(face, kind, t)
            if kind == "s" and not cur:
                continue
            if kind != "s" and cur and w + tw > maxw and t not in _NOBREAK:
                while cur and cur[-1][0] == "s":
                    cur.pop()
                lines.append(cur)
                cur, w = [], 0.0
            cur.append((kind, t))
            w += tw
        lines.append(cur)
    return lines


def draw_toks(sheet, toks, face, fill, x, baseline):
    for kind, t in toks:
        if kind == "e":
            sheet.alpha_composite(emoji_img(t, face.size), (int(round(x)), int(round(baseline - 0.35 * face.size - face.size / 2))))
        elif kind == "t":
            face.draw(sheet, (x, baseline), t, fill)
        x += tok_w(face, kind, t)


def mixed_mm(sheet, s, face, fill, cx, cy):
    """One line of text with inline emoji, centred on (cx, cy) the way anchor 'mm' centres plain text."""
    toks = tokens(s)
    draw_toks(sheet, toks, face, fill, cx - line_w(face, toks) / 2, cy + (face.asc - face.desc) / 2)


def caption(sheet, paras):
    """A light panel y 1196 to 1280 with 1 to 3 centred lines (20 px); each paragraph wraps at 664 px."""
    sheet.alpha_composite(Image.new("RGBA", (W_PX, 84), (245, 240, 235, 255)), (0, 1196))
    face = Face(False, 20)
    lines = [ln for p in paras for ln in wrap_text(p, face, 664)]
    for i, toks in enumerate(lines):
        mixed_mm(sheet, "".join(t for _, t in toks), face, (40, 20, 40), 360, 1238 - (len(lines) - 1) * 13 + i * 26)


def s10_shot(group, name):
    key = (group, name)
    if key not in _S10_SHOTS:
        im = load(main_checkout() / ".claude/plans/17-previews" / group / "shots" / name)
        if im.size != (W_PX, H_PX):
            raise SystemExit(f"FAIL: {name} is {im.size}, not 720 x 1280")
        _S10_SHOTS[key] = im
    return _S10_SHOTS[key].copy()


def daily_shot(zh=False):
    return book_res().shot("D2b-popup-1205-p1-5-zh.png") if zh else s10_shot("E", "E4a-daily-1214-en.png")


def measure_g(im):
    """The title glyph's box (x0, y0, x1, y1; half-open): in the band y 236 to 304, x 80 to 400, the first run of ink columns from the left
    (a pixel differing from the panel fill by more than 40 in any channel) that ends at a gap of 6 or more empty columns."""
    px = im.convert("RGB").load()
    cols = []
    for x in range(80, 400):
        cols.append([y for y in range(236, 304) if max(abs(px[x, y][i] - PANEL_FILL[i]) for i in range(3)) > 40])
    start = next((i for i, c in enumerate(cols) if c), None)
    if start is None:
        raise SystemExit("FAIL: no ink in the title row (y 236 to 304, x 80 to 400)")
    last, i = start, start
    while i < len(cols) and i - last < 6:
        if cols[i]:
            last = i
        i += 1
    if i - last < 6:
        raise SystemExit("FAIL: the title glyph's ink run has no 6 px gap before x 400")
    ys = [y for c in cols[start:last + 1] for y in c]
    return (80 + start, min(ys), 80 + last + 1, max(ys) + 1)


def glyph_zone(g):
    cx, cy = (g[0] + g[2]) / 2, (g[1] + g[3]) / 2
    x0, y0 = int(round(cx - ZONE / 2)), int(round(cy - ZONE / 2))
    return (x0, y0, x0 + ZONE, y0 + ZONE)


def zone_at(c):
    return (c[0] - ZONE // 2, c[1] - ZONE // 2, c[0] + ZONE // 2, c[1] + ZONE // 2)


def zone_gap(a, b):
    """Signed gap in px between two boxes (x0, y0, x1, y1): negative means they overlap, 0 means they touch."""
    return max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3])


def check_min_box(name, box, m=ZONE):
    w, h = box[2] - box[0], box[3] - box[1]
    return [] if w >= m and h >= m else [f"{name} is {w} x {h}, under {m} x {m}"]


def check_zones(q, g, x):
    fails = []
    for an, a, bn, b in (("(?)", q, "glyph", g), ("(?)", q, "close", x), ("glyph", g, "close", x)):
        if zone_gap(a, b) < 0:
            fails.append(f"the {an} zone {a} overlaps the {bn} zone {b} by {-zone_gap(a, b)} px")
    return fails


def check_inside(name, inner, outer):
    ok = inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]
    return [] if ok else [f"{name} {inner} is not inside {outer}"]


def check_help_fit(name, top, bottom):
    return [] if top >= 84 and bottom <= 1196 else [f"{name}: the card spans y {top} to {bottom}, outside 84 to 1196"]


def red_dot(sheet, cx, cy, r=9):
    n, k = 2 * (r + 2) + 4, 4
    big = Image.new("RGBA", (n * k, n * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = n * k / 2
    d.ellipse((c - (r + 2) * k, c - (r + 2) * k, c + (r + 2) * k, c + (r + 2) * k), fill=(255, 255, 255, 255))
    d.ellipse((c - r * k, c - r * k, c + r * k, c + r * k), fill=RED_DOT + (255,))
    sheet.alpha_composite(big.resize((n, n), Image.Resampling.LANCZOS), (int(round(cx - n / 2)), int(round(cy - n / 2))))


def zone_outline(sheet, box, colour):
    dashed_rect(sheet, (box[0], box[1], box[2] - 1, box[3] - 1), colour, 8, 5, 2)


def daily_marks(s, zones=True, q_centre=Q_CENTRE):
    """The Daily window's marks on shot `s`: the (?) top left, the pencil and the red dot on the title glyph, optionally the zones.
    Returns (g, glyph zone, (?) zone, close zone, gap between the (?) and glyph zones)."""
    g = measure_g(s)
    ring(s, q_centre[0], q_centre[1], 24, (255, 255, 255), 3, halo=False)
    ImageDraw.Draw(s).text(q_centre, "?", font=font(30, True), fill=(255, 255, 255), anchor="mm")
    pen, (pcx, pcy) = _fit_pencil()
    s.alpha_composite(pen, (int(round(g[2] + 4 - pcx)), int(round(g[3] - 2 - pcy))))
    red_dot(s, g[2] - 3, g[1] + 3)
    gz, qz, xz = glyph_zone(g), zone_at(q_centre), zone_at(X_CENTRE)
    if zones:
        zone_outline(s, gz, ZONE_CYAN)
        zone_outline(s, qz, ZONE_YELLOW)
        zone_outline(s, xz, ZONE_WHITE)
    return g, gz, qz, xz, zone_gap(qz, gz)


def close_x(sheet, res, cx, cy, size):
    """The Daily window's white X (D2a's, as book_sheet takes it) as a mask at `size` px (48 = as in the shot), centred on (cx, cy)."""
    x = res.shot("D2a-popup-1205-p1-5-en.png").convert("RGB").crop((588, 216, 644, 272))
    bg = x.getpixel((2, 2))
    lum = x.convert("L").point(lambda v: max(0, min(255, int(round((v - sum(bg) / 3) / (255 - sum(bg) / 3) * 255)))))
    n = int(round(56 * size / 48))
    if n != 56:
        lum = lum.resize((n, n), Image.Resampling.LANCZOS)
    paint(sheet, (int(round(cx - n / 2)), int(round(cy - n / 2))), (255, 255, 255), lum)


def glow_gold(sheet, box, grow=10, blur=6, alpha=0.6):
    m = Image.new("L", sheet.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((box[0] - grow, box[1] - grow, box[2] - 1 + grow, box[3] - 1 + grow), 14 + grow, fill=255)
    paint(sheet, (0, 0), B_GOLD, m.filter(ImageFilter.GaussianBlur(blur)), alpha)


def variant(r, c):
    base = ("\U0001F385", "\U0001F936", "\U0001F9D1")[r]
    return base + TONES[c] + ("‍\U0001F384" if r == 2 else "")


def picker(res, bg, zh=False, ringed=None, save_live=True, pad_ring=False, rows=((0, range(6)), (1, range(6)), (2, range(6)))):
    """The picker over the dimmed Daily shot `bg`. `rows` lists (character row, columns drawn), each row centred on x 360 and the rows
    closed up from the grid's top. Returns (sheet, list of every cell box, grid box)."""
    s = bg.copy()
    dim_box(s, (0, 0, W_PX, H_PX), 0.55)
    s.alpha_composite(Image.new("RGBA", (600, 700), PANEL_FILL + (int(round(0.97 * 255)),)), (60, 290))
    rrect(s, PICK_PANEL, 0, stroke=PK_PINK, sw=8)
    mixed_mm(s, "选择你的\U0001F385" if zh else "Choose your \U0001F385", Face(zh, 40, True), PK_TITLE, 360, 350)
    close_x(s, res, 616, 324, 48)
    cells = []
    for i, (r, cols) in enumerate(rows):
        cols = list(cols)
        x0 = 360 - (len(cols) * CELL + (len(cols) - 1) * (STEP - CELL)) / 2
        for j, c in enumerate(cols):
            x, y = int(round(x0 + j * STEP)), GRID_Y0 + STEP * i
            cells.append(((x, y, x + CELL, y + CELL), r, c))
    for box, r, c in cells:
        if ringed == (r, c):
            glow_gold(s, box)
    for box, r, c in cells:
        on = ringed == (r, c)
        rrect(s, box, 14, fill=(42, 18, 32), stroke=B_GOLD if on else (90, 42, 68), sw=5 if on else 2)
        s.alpha_composite(emoji_png(variant(r, c), 60), (box[0] + 14, box[1] + 14))
    save_col = PK_TITLE if save_live else (120, 90, 105)
    rrect(s, (210, 756, 510, 844), 20, fill=PANEL_FILL, alpha=1.0 if save_live else 0.5, stroke=PK_PINK if save_live else save_col, sw=4)
    mixed_mm(s, "保存" if zh else "Save", Face(zh, 40, True), save_col, 360, 800)
    mixed_mm(s, "v0.35.0 beta", Face(False, 24), PK_TITLE, 360, 950)
    if pad_ring:
        zx = zone_at((616, 324))
        rrect(s, (zx[0] - 8, zx[1] - 8, zx[2] + 8, zx[3] + 8), 16, stroke=(255, 255, 255), sw=4)
    grid = (min(b[0] for b, _, _ in cells), min(b[1] for b, _, _ in cells), max(b[2] for b, _, _ in cells), max(b[3] for b, _, _ in cells))
    return s, [b for b, _, _ in cells], grid


def help_card(res, bg, zh):
    s = bg.copy()
    dim_box(s, (0, 0, W_PX, H_PX), 0.55)
    face = Face(zh, 28)
    lines = wrap_text(HELP_ZH if zh else HELP_EN, face, 480)
    lh = face.asc + face.desc
    th = len(lines) * lh + (len(lines) - 1) * 8
    h = 64 + th + 40
    top = int(round(640 - h / 2))
    rrect(s, (80, top, 640, top + h), 20, fill=(36, 16, 28), stroke=PK_TITLE, sw=4)
    close_x(s, res, 640 - 36, top + 36, 40)
    for i, toks in enumerate(lines):
        draw_toks(s, toks, face, (226, 200, 214), 120, top + 64 + i * (lh + 8) + face.asc)
    return s, top, top + h


def sheet10(inp, out, manifest, failures):
    res = book_res()
    saved = []
    srcs = ["E/shots E4a (Daily en), D/shots D2b (Daily zh), E1b (home en), D2a (the X)", "meta/advent-previews/emoji/*.png (the 18 picker emoji)"]

    def save(sheet, name, cap):
        caption(sheet, cap)
        failures.extend(check_still_size(sheet, name[:-4]))
        sheet_save(sheet, out, name, srcs, manifest)
        saved.append(name)

    print("sheet 10: Choose your \U0001F385")
    # a, b, c: the Daily window's marks
    for name, zh, swap in (("sheet10-a-daily-en.png", False, False), ("sheet10-b-daily-zh.png", True, False), ("sheet10-c-daily-zwj-en.png", False, True)):
        s = daily_shot(zh)
        if swap:
            g0 = measure_g(s)
            ImageDraw.Draw(s).rectangle((g0[0] - 4, g0[1] - 4, g0[2] + 4 - 1, g0[3] + 4 - 1), fill=PANEL_FILL + (255,))
            em = emoji_png("\U0001F9D1\U0001F3FD‍\U0001F384", 52)
            s.alpha_composite(em, (int(round((g0[0] + g0[2]) / 2 - 26)), int(round((g0[1] + g0[3]) / 2 - 26))))
        g, gz, qz, xz, gap = daily_marks(s)
        print(f"  {name[:-4]}: g = {g} ({g[2] - g[0]} x {g[3] - g[1]}), glyph zone {gz}, (?) zone {qz}, gap (?) to glyph {gap} px")
        failures.extend(f"{name}: {m}" for m in check_min_box("the glyph zone", gz) + check_zones(qz, gz, xz))
        who = "Daily (zh)" if zh else "Daily (en)" + (", ZWJ title glyph (52 px)" if swap else "")
        save(s, name, [f"{who}: (?), pencil, red dot on the glyph",
                       f"zones: cyan glyph, yellow (?), white X; glyph box {g[2] - g[0]} x {g[3] - g[1]}",
                       f"gap between the (?) zone and the glyph zone: {gap} px"])
    # d: the home row, without and with the dot
    home = s10_shot("E", "E1b-home-1214-unseen14-en.png")
    s = new_sheet(PANEL_FILL)
    for y, label, dot in ((40, "without the home dot", False), (340, "with the home dot (radius 9, on the button's rim at 45 degrees)", True)):
        s.alpha_composite(home.crop((0, 0, W_PX, 260)), (0, y))
        if dot:
            red_dot(s, 360 + 31, y + 124 - 31)
        text(s, (360, y - 20), label, 22, (255, 255, 255), False, "mm")
    save(s, "sheet10-d-home-en.png", ["Home, en: the \U0001F385 button (88 px at 360, 124) without and with the home dot"])
    # e to j: the picker
    en = daily_shot(False)

    def pick(name, bg=en, **kw):
        s, cells, grid = picker(res, bg, **kw)
        failures.extend(f"{name}: {m}" for c in cells for m in check_min_box("a grid cell", c))
        failures.extend(f"{name}: {m}" for m in check_inside("the grid", grid, PICK_PANEL))
        return s

    save(pick("e", ringed=None, save_live=False), "sheet10-e-picker-empty-en.png", ["Picker, nothing saved: no cell ringed, Save greyed"])
    save(pick("f", ringed=(0, 0), save_live=True), "sheet10-f-picker-empty-alt-en.png", ["Picker, nothing saved, the other option: this visit's \U0001F385 (the plain one) ringed, Save live"])
    save(pick("g", ringed=(1, 4), pad_ring=True), "sheet10-g-picker-saved-en.png", ["Picker, a saved choice (the dark-tone Mrs. Claus, row 2, column 5) ringed, Save live, pad focus ring on the X"])
    save(pick("h", ringed=None), "sheet10-h-picker-cleared-en.png", ["Way back W1: after tapping the ringed choice again, no cell ringed", "Save now brings back the changing \U0001F385"])
    save(pick("i", bg=daily_shot(True), zh=True, ringed=(1, 4), pad_ring=True), "sheet10-i-picker-zh.png", ["Picker, zh: as g (saved choice ringed, Save live, pad focus ring on the X)"])
    s = pick("j", ringed=None, save_live=False, rows=((0, [0]), (1, [0])))
    s.paste(en.crop((60, 230, 660, 310)), (60, 1020))
    mixed_mm(s, "one variant: the title \U0001F385 is not tappable: no pencil, no dot", Face(False, 22), (255, 255, 255), 360, 1128)
    save(s, "sheet10-j-picker-narrow-en.png", ["Picker on a device that draws only the plain \U0001F385 and \U0001F936: one cell per row, each row centred, the third row left out"])
    # k, l: the help card
    for name, zh in (("sheet10-k-help-en.png", False), ("sheet10-l-help-zh.png", True)):
        s, top, bottom = help_card(res, daily_shot(zh), zh)
        failures.extend(f"{name}: {m}" for m in check_help_fit(name, top, bottom))
        print(f"  {name[:-4]}: card y {top} to {bottom}")
        save(s, name, [f"Help card ({'zh' if zh else 'en'}) over the Daily window, shown when the (?) is tapped"])
    if len(saved) != 12:
        failures.append(f"sheet 10 wrote {len(saved)} PNGs, expected 12")
    print("  fonts used: " + "; ".join(sorted(FONTS_USED)))


def sheet10_selftest(missed):
    """Step 1b.2d's negative controls: an 80 px grid cell, an 80 px glyph zone and a (?) moved 10 px right into the glyph zone must each be rejected."""
    g = measure_g(daily_shot(False))
    gz, qz, xz = glyph_zone(g), zone_at(Q_CENTRE), zone_at(X_CENTRE)
    real = check_min_box("a grid cell", (GRID_X0, GRID_Y0, GRID_X0 + CELL, GRID_Y0 + CELL)) + check_min_box("the glyph zone", gz) + check_zones(qz, gz, xz)
    if real:
        print(f"selftest: the real picker numbers already fail: {real[0]}")
        missed.append("real sheet 10 numbers fail")

    def report(what, fails):
        print(f"selftest: {what}: {'REJECTED' if fails else 'ACCEPTED (check is blind!)'}" + (f" ({fails[0]})" if fails else ""))
        if not fails:
            missed.append(what)

    report("a grid cell of 80 px", check_min_box("a grid cell", (GRID_X0, GRID_Y0, GRID_X0 + 80, GRID_Y0 + 80)))
    report("a glyph zone of 80 px", check_min_box("the glyph zone", (gz[0], gz[1], gz[0] + 80, gz[1] + 80)))
    report("the (?) moved 10 px right into the glyph zone", check_zones(zone_at((Q_CENTRE[0] + 10, Q_CENTRE[1])), gz, xz))


# ---------------------------------------------------------------- the manifest and the driver
def print_manifest(manifest):
    print("\nMANIFEST (sheet, size, inputs):")
    for m in manifest:
        print(f"  {m['sheet']:<42} {m['size'][0]} x {m['size'][1]}" + (f" x {m['frames']} frames" if "frames" in m else "") + f"   {'; '.join(m['inputs'])}")


def storm_selftest(inp, missed):
    """Step 2.6a's negative controls: each broken input must be rejected by the check that guards it."""
    opt = STORM_OPTIONS
    good = {k: simulate(s) for k, s in opt.items()}
    for k, s in opt.items():
        bad = check_counts(good[k], k) + check_gusts(good[k], s) + check_swirls(good[k], s)[0]
        if bad:  # a real finding of the model (the build run reports it too), not a blind check: note it and go on
            print(f"selftest: NOTE the real {k} storm fails its own check: {bad[0]}")
    if check_light_control(good["light"]):
        print("selftest: the real Light control already fails the snowfall.js check")
        missed.append("real light control fails")
    icon = inp.twin("advent")
    if check_piece_icon(icon)[0]:
        print(f"selftest: the real advent.png already fails: {check_piece_icon(icon)[0][0]}")
        missed.append("real icon fails")

    def report(what, fails):
        print(f"selftest: {what}: {'REJECTED' if fails else 'ACCEPTED (check is blind!)'}" + (f" ({fails[0]})" if fails else ""))
        if not fails:
            missed.append(what)

    report("a still of 720 x 1279", check_still_size(Image.new("RGB", (W_PX, H_PX - 1)), "still"))
    a = render_storm_still(inp, opt["B"], 1, make_rng=lambda seed: random.Random())[0].tobytes()
    b = render_storm_still(inp, opt["B"], 1, make_rng=lambda seed: random.Random())[0].tobytes()
    report("an unseeded RNG for option B (two renders compared)", [] if a == b else ["the two renders differ"])
    report("option B with 179 flakes", check_counts(simulate(opt["B"], extra=opt["B"]["extra"] - 1), "B"))
    report("option A with G = 0", check_gusts(simulate(dict(opt["A"], G=0.0)), opt["A"]))
    report("option B with gusts that reverse the wind (gust 1.6)", check_gusts(simulate(dict(opt["B"], gust=1.6)), opt["B"]))
    report("option A with twice the wind (too flat for a diagonal)", check_gusts(simulate(dict(opt["A"], G=2 * opt["A"]["G"])), opt["A"]))
    report("a fart wind blowing left to right", check_gusts(simulate(dict(opt["fart"], F=-opt["fart"]["F"])), opt["fart"]))
    report("a fart wind of 60 px/s (not horizontal)", check_gusts(simulate(dict(opt["fart"], F=60.0)), dict(opt["fart"], F=60.0)))
    report("option B with K = 0", check_swirls(simulate(dict(opt["B"], K=0)), opt["B"])[0])
    report("option C with K = 0 (C passes the swirl check as it is)", check_swirls(simulate(dict(opt["C"], K=0)), opt["C"])[0])
    w = icon.copy()
    w.putalpha(ImageChops.subtract(icon.getchannel("A"), near_white_mask(icon)))  # every opaque near-white pixel made transparent
    report("a piece icon with its opaque near-white pixels made transparent", check_piece_icon(w)[0])
    sq = Image.new("RGBA", icon.size, (255, 255, 255, 255))
    sq.alpha_composite(icon)
    report("a piece icon pasted on an opaque white 192 x 192 square", check_piece_icon(sq)[0])


def selftest(inp):
    """Negative controls: each broken input must make its check fail. Writes nothing. Exits 1 when the checks caught
    everything (a non-zero exit, as designed), 2 when a check missed a defect."""
    missed = []
    good = run_twin_checks(inp)
    if not all(ok for _, ok, _ in good):
        print("selftest: the unshifted twins already fail; fix the art or the check first")
        for t, ok, ln in good:
            if not ok:
                print("   ", ln)
        return 2
    print("selftest: unshifted twins pass (12 of 12)")
    for dx, dy, what in ((3, 0, "3 px right"), (0, 3, "3 px down"), (3, 3, "3 px right and down")):
        res = run_twin_checks(inp, shift_first=(dx, dy))
        bad = [ln for _, ok, ln in res if not ok]
        print(f"selftest: poop-santa shifted {what}: {'REJECTED' if bad else 'ACCEPTED (check is blind!)'}" + (f" ({bad[0]})" if bad else ""))
        if not bad:
            missed.append(what)
    # a twin whose circle is drawn off the canvas centre
    ok, ln = twin_check(inp.twin("poop-santa"), inp.stock("poop"), "poop-santa", (50.0, 50.0), (49.0, 50.0))[:2]
    print(f"selftest: circle 1 px off the canvas centre: {'REJECTED' if not ok else 'ACCEPTED (check is blind!)'}")
    if ok:
        missed.append("circle off centre")
    # step 1.5 controls: V that whitens everything must fail the fill-only assertion
    v = inp.stock("villi")
    bad_v = whiten(v, 0.4)
    ok_v, _ = v_changes_only_fill(v, bad_v, "villi.png")
    print(f"selftest: a V that whitens every pixel: {'REJECTED' if not ok_v else 'ACCEPTED (check is blind!)'}")
    if ok_v:
        missed.append("V on every pixel")
    ok_v, _ = v_changes_only_fill(v, v, "villi.png")
    print(f"selftest: a V that changes nothing: {'REJECTED' if not ok_v else 'ACCEPTED (check is blind!)'}")
    if ok_v:
        missed.append("V that is a no-op")
    # the cream-distance assertion: a pipe fill that is not the real one must trip it
    global PINK
    real, PINK = PINK, (232, 94, 170)
    fails = []
    distance_tables(fails, quiet=True)
    PINK = real
    print(f"selftest: a wrong pipe fill in the distance table: {'REJECTED' if fails else 'ACCEPTED (check is blind!)'}")
    if not fails:
        missed.append("wrong pipe fill")
    storm_selftest(inp, missed)
    book_selftest(missed)
    sheet10_selftest(missed)
    if missed:
        print("selftest: FAILED to catch:", ", ".join(missed))
        return 2
    print("selftest: every broken input was rejected; exiting 1 (non-zero) as the brief requires")
    return 1


def main():
    main_co = main_checkout()
    ap = argparse.ArgumentParser(description="Gate A mock-up sheets for the December art (plan 17, 1.4, 1.5, 2.6a, 2.14 and 1b.1)")
    ap.add_argument("--sheets", default="all", help="comma list of 1, 2, 3, 7, pipes, 4, 5a, 5, 9, 10 or all (all = 1, 2, 3, 7, pipes)")
    ap.add_argument("--art", default=str(main_co / "meta/advent-previews/art-fit"))
    ap.add_argument("--guides", default=str(main_co / "meta/advent-previews/art-guides"))
    ap.add_argument("--out", default=str(main_co / ".claude/plans/17-previews/gateA"))
    ap.add_argument("--backdrop", default=None)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    backdrop = args.backdrop or str(Path(args.out) / "backdrop-home-720x1280.png")
    inp = Inputs(args.art, args.guides, backdrop)
    if args.selftest:
        sys.exit(selftest(inp))
    wanted = {"1", "2", "3", "7", "pipes"} if args.sheets == "all" else set(args.sheets.split(","))
    unknown = wanted - {"1", "2", "3", "7", "pipes", "4", "5a", "5", "9", "10"}
    if unknown:
        raise SystemExit(f"unknown sheet(s): {', '.join(sorted(unknown))}")
    manifest, failures = [], []
    if "1" in wanted:
        sheet1(inp, args.out, manifest, failures)
    if "2" in wanted:
        sheet2(inp, args.out, manifest, failures)
    if "3" in wanted:
        sheet3(inp, args.out, manifest, failures)
    if "7" in wanted:
        sheet7(inp, args.out, manifest, failures)
    if "9" in wanted:
        sheet9(inp, args.out, manifest, failures)
    if "pipes" in wanted:
        pipes_sheets(inp, args.out, manifest, failures)
    if "4" in wanted:
        sheet4(inp, args.out, manifest, failures)
    if "5a" in wanted:
        sheet5a(inp, args.out, manifest, failures)
    if "5" in wanted:
        sheet5(inp, args.out, manifest, failures)
    if "10" in wanted:
        sheet10(inp, args.out, manifest, failures)
    for m in manifest:
        if m["size"] != m.get("expect", (W_PX, H_PX)):
            failures.append(f"{m['sheet']} is {m['size']}, not {m.get('expect', (W_PX, H_PX))}")
    print_manifest(manifest)
    if failures:
        print("\nFAIL:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print(f"\nOK: {len(manifest)} files, every one at its size (sheets 720 x 1280, GIFs 360 x 640); every check passed")


if __name__ == "__main__":
    main()
