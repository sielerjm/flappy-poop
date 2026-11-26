#!/usr/bin/env python3
"""advent_preview.py: Gate A mock-up sheets for the December art (plan 17, steps 1.4 and 1.5).

Composites draft art (fitted December files from meta/advent-previews/art-fit/) onto the real game
art (assets/*.png) at in-game size, on the level colours a run can have, so Michael can approve,
change or cut each piece before it enters assets/advent/. Nothing here touches src/ or assets/;
sheets go to the Dropbox checkout's .claude/plans/17-previews/gateA/ (gitignored).

Run:    ~/.local/bin/uv run --with pillow python3 tools/advent_preview.py [--sheets 1,2,3,7]
        --sheets  comma list of: 1, 2, 3, 7 (step 1.4), pipes (step 1.5), 9 (step 1b.1), or all (default)
        --art DIR       fitted December art (default <main checkout>/meta/advent-previews/art-fit/)
        --guides DIR    pipe-cap guides (default .../meta/advent-previews/art-guides/)
        --backdrop PNG  sheet 7's ready-screen backdrop (default <out>/backdrop-home-720x1280.png)
        --out DIR       default <main checkout>/.claude/plans/17-previews/gateA/
        --selftest      feed the sheet-1 check a twin shifted by 3 px (and a few other broken inputs)
                        and exit non-zero, as the checks must; writes nothing
The "main checkout" is found through git's common dir, so a worktree reads the same Dropbox folders.
Every game number (radii, scales, colours, layout) is read from src/config.js, src/logic.js and
tools/make_placeholders.py, so a changed constant changes the sheets and a moved line fails loudly.
Requires Pillow only. Exit 0 only if every check below passed (otherwise 1, with the reasons).

Checks (any failure exits non-zero):
  - every sheet is 720 x 1280;
  - sheet 1: for each of the 12 hatted twins, the brown-mask right and bottom edges (the mask of
    tools/process_art.py: r > g > b and r - b > 60), measured from the canvas centre, sit within 1 game
    px of the stock frame's, and the hitbox circle's centre is the canvas centre;
  - step 1.5: the printed cream distances (pipe 43 / 35 / 31 / 29 at 55 / 60 / 70 / 80 %; villi
    50 / 21 / 21 / 41 at 40 / 55 / 70 / 80 %) are within 1 of the plan's, and formula V changes no
    pixel that is not the villi fill on villi.png, ceiling.png and ground.png.
"""
import argparse
import math
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

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


def run_frame(inp, level, villi_im, ceil_im, ground_im, still_pipe, move_pipe, snow, snow_off, caption, sub):
    sheet = new_sheet(level_rgb(level))
    sheet.alpha_composite(villi_im, (0, 0))
    poop = half(inp.twin("poop-santa"))
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
SPLASH_OPTIONS = [  # (label, left, top, size) as shares of the hero box; the stock box first
    ("Today (stock poop.png)", None, None, None),
    ("A: the brief's box, 64 % moved", 0.15, 0.19, 0.64),
    ("B: 64 %, centred for the most room", 0.195, 0.195, 0.64),
    ("C: 70 %, the biggest box that passes", 0.165, 0.17, 0.70),
]


def splash_numbers():
    html = (ROOT / "index.html").read_text()
    blk = re.search(r"\.splash-poop \{([^}]*)\}", html).group(1)
    pct = lambda prop: float(re.search(rf"(?:^|[\s;]){prop}: (-?[\d.]+)%", blk).group(1)) / 100
    bob = float(re.search(r"@keyframes splash-bob \{ from \{ transform: translateY\(-([\d.]+)%\); \} to \{ transform: translateY\(([\d.]+)%\)", html).group(2)) / 100
    stroke = float(re.search(r"\.splash-ring circle \{[^}]*stroke-width: ([\d.]+);", html).group(1))
    r = float(re.search(r'class="splash-arc" cx="60" cy="60" r="(\d+)"', html).group(1))
    hexc = lambda name: tuple(int(re.search(rf"--{name}: #([0-9a-f]{{6}})", html).group(1)[i:i + 2], 16) for i in (0, 2, 4))
    return {"left": pct("left"), "top": pct("top"), "w": pct("width"), "bob": bob, "stroke": stroke, "r": r,
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


# ---------------------------------------------------------------- the manifest and the driver
def print_manifest(manifest):
    print("\nMANIFEST (sheet, size, inputs):")
    for m in manifest:
        print(f"  {m['sheet']:<42} {m['size'][0]} x {m['size'][1]}   {'; '.join(m['inputs'])}")


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
    if missed:
        print("selftest: FAILED to catch:", ", ".join(missed))
        return 2
    print("selftest: every broken input was rejected; exiting 1 (non-zero) as the brief requires")
    return 1


def main():
    main_co = main_checkout()
    ap = argparse.ArgumentParser(description="Gate A mock-up sheets for the December art (plan 17, 1.4 and 1.5)")
    ap.add_argument("--sheets", default="all", help="comma list of 1, 2, 3, 7, 9, pipes or all")
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
    wanted = {"1", "2", "3", "7", "9", "pipes"} if args.sheets == "all" else set(args.sheets.split(","))
    unknown = wanted - {"1", "2", "3", "7", "9", "pipes"}
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
    for m in manifest:
        if m["size"] != (W_PX, H_PX):
            failures.append(f"{m['sheet']} is {m['size']}, not 720 x 1280")
    print_manifest(manifest)
    if failures:
        print("\nFAIL:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print(f"\nOK: {len(manifest)} sheets, every one 720 x 1280; every check passed")


if __name__ == "__main__":
    main()
