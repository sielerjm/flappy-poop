#!/usr/bin/env python3
"""process_art.py — crop, knock out background white, and resize Michael's
drawings into the gameplay art-contract PNGs.

Created by Michael Sieler. Last updated: 2026-11-25 (plan 17, 1.1: --only / --out / --src, a layer mode, a same-body-scale mode for
poop twins and items, and a fit-height option; plan 35, 2.1: frames at 2x their drawn size, 192 px, and
every PNG losslessly recompressed with oxipng when it is installed).

Run:    uv run --with pillow python3 tools/process_art.py   (or any Python with Pillow)
        Options: --only NAME[,NAME] (an output file's stem; default the full run), --out DIR (default assets/),
        --src DIR (default assets/src/; stock reference frames are always read from assets/src/),
        --anchor X,Y and --scale F (layer mode), --body-like STOCK_PNG and --fit-height PX_OR_PNG (item modes).
        With oxipng on PATH (`brew install oxipng`) every output is recompressed losslessly
        (`oxipng -o 4 --strip safe`, about 20 % smaller than Pillow's own optimizer); without it,
        Pillow's optimized save is kept.
Input:  assets/src/{Poop_Emoji_Alive,Poop_Emoji_Dead,Poop_Stink1,Poop_Stink2,PoopFalling,
                    PoopStinkFalling1,PoopStinkFalling2,PoopScared,PoopScaredStink1,PoopScaredStink2,
                    Poop_Fart,Poop_Speech,
                    Fiber,Good_Bacteria,Bad_Bacteria,Kidney_Bean,Postbiotic,MysteryBox_Icon}.png,
        assets/src/{MysteryBox,CornKernel}.gif (animated) and assets/src/FlappyPoopAppArt.png (the app icon)
Output: assets/{poop,poop-dead,fiber,probiotic,bacteria,bean,postbiotic,mystery-icon}.png at 192x192 RGBA
        (2x the 96 logical px they are drawn at, spriteDisplayScale 0.5),
        assets/coin.png: the kernel GIF's frames side by side, 106x106 each (drawn at 53 px: a clean
        2:1 shrink instead of 8:1),
        assets/poop-scared.png (the near-miss face) at 192x192 too,
        assets/{poop-stink1,poop-stink2,poop-falling,poop-stink-falling1,poop-stink-falling2,
                poop-stink-scared1,poop-stink-scared2,poop-fart,poop-speech}.png on larger squares,
        assets/mystery.png: the GIF's frames side by side, 192x192 each (a Phaser spritesheet), and
        assets/{icon-192,icon-512,apple-touch-icon}.png from the app art (see process_icons).

Only white connected to the image border is made transparent, so eyes and
mouths stay white. Items are trimmed independently.

The poop set shares ONE body scale: alive + dead define the body box (union of
both bounding boxes, as before). The stink and falling frames are cut on a
bigger square centred on that same body centre, so swapping textures (origin
0.5) never moves the body. The fart frame's body sits elsewhere on its source canvas (cloud on
the left), so its centre is found with a brown-pixel mask and the square is
centred there; the cloud trails left of the body in the game.

Same-body-scale mode (process_twin, cut_same_body_scale): every poop frame beyond alive/dead, and any
twin of one (a hatted frame), is cut on its STOCK frame's body centre with the set's scale k (never
from the twin's own pixels), half = frame_half(its ink, that centre), size = 2 * half * k made even.
An optional pre-transform (scale, dx, dy: source pixel (x, y) goes to (scale * x + dx, scale * y + dy))
is applied first on a padded canvas. process_item does the same for items (--body-like) and can
scale the ink to a reference height (--fit-height). Layer mode (process_layer) keeps the white,
scales, crops to the alpha bbox and prints the crop's offset from an anchor.
"""
import argparse
from collections import deque
from pathlib import Path
import shutil
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STOCK_SRC = ROOT / "assets" / "src"  # the stock frames every twin lines up with; never moved by --src
SRC = STOCK_SRC
OUT = ROOT / "assets"
SIZE = 192  # 2x the 96 logical px a poop frame or an item is drawn at (plan 35, 2.1; was 384 at 4x)
WHITE_CUTOFF = 245  # near-white on the border is treated as background
PAD = 4  # px of source padding kept around the ink after trim


OXIPNG = shutil.which("oxipng")


def save_png(im: Image.Image, dest: Path) -> None:
    """Save with Pillow's optimizer, then (if installed) oxipng's lossless pass: same pixels, fewer bytes."""
    im.save(dest, optimize=True)
    if OXIPNG:
        subprocess.run([OXIPNG, "-q", "-o", "4", "--strip", "safe", str(dest)], check=True)


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
    return im.crop(padded_box(im.size, bbox, pad))


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


# ---------------------------------------------------------------------------
# Same-body-scale mode (poop twins and items) and layer mode (plan 17, 1.1)
# ---------------------------------------------------------------------------
# Reference frames (the stock set a twin must line up with) are read from STOCK_SRC, the repo's own
# assets/src/, whatever --src says: an advent run points --src at the Dropbox drafts, which hold
# no stock frames. A stock entry's reference is its own --src (REF_OWN), so a --src copy of
# assets/src reproduces the stock output.
REF_OWN = "own"
_poop_body_cache = {}
_ref_centre_cache = {}


def poop_body(ref_dir: Path) -> dict:
    """The poop set's shared body: alive + dead define the body box (union of both bounding
    boxes), its centre, its half-side and the scale k (output px per source px) of the whole set."""
    key = str(ref_dir)
    if key not in _poop_body_cache:
        alive = knock_background(Image.open(ref_dir / "Poop_Emoji_Alive.png"))
        dead = knock_background(Image.open(ref_dir / "Poop_Emoji_Dead.png"))
        ba = content_bbox(alive)
        bd = content_bbox(dead)
        if not ba or not bd:
            raise SystemExit("poop source has no visible ink")
        union = (min(ba[0], bd[0]), min(ba[1], bd[1]), max(ba[2], bd[2]), max(ba[3], bd[3]))
        centre = ((union[0] + union[2]) / 2, (union[1] + union[3]) / 2)
        half = frame_half(union, centre)
        _poop_body_cache[key] = {"alive": alive, "dead": dead, "centre": centre, "half": half, "k": SIZE / (2 * half)}
    return _poop_body_cache[key]


# The stock frames whose brown body (not their whole ink) sets a twin's centre.
BROWN_REFS = {"fart": "Poop_Fart.png", "speech": "Poop_Speech.png"}


def ref_centre(ref_dir: Path, which: str):
    """The stock body centre a twin is cut on: "body" is the set's shared centre; "fart" and
    "speech" are the stock frame's brown_bbox centre (a twin's own brown mask is wrong, the hat
    covers the top of the body)."""
    if which == "body":
        return poop_body(ref_dir)["centre"]
    if which not in BROWN_REFS:
        raise SystemExit(f"unknown stock frame {which!r} (body, {', '.join(BROWN_REFS)})")
    key = (str(ref_dir), which)
    if key not in _ref_centre_cache:
        frame = knock_background(Image.open(ref_dir / BROWN_REFS[which]))
        body = brown_bbox(frame)
        if not body:
            raise SystemExit(f"{BROWN_REFS[which]} has no brown body")
        _ref_centre_cache[key] = ((body[0] + body[2]) / 2, (body[1] + body[3]) / 2)
    return _ref_centre_cache[key]


def cut_same_body_scale(im: Image.Image, centre, k: float):
    """The one cut every stink, falling, fart, speech and twin frame goes through: a square centred
    on the stock body `centre` (source px) with half = frame_half(this frame's ink, centre), scaled by
    the set's k to an even size, so the canvas grows where the ink sticks out and the body stays put."""
    bbox = content_bbox(im)
    if not bbox:
        return None
    half = frame_half(bbox, centre)
    size = int(round(2 * half * k))
    size += size % 2
    return scale_to(crop_centred(im, centre, half), size), half


def pre_transform(im: Image.Image, scale: float, dx: float, dy: float):
    """Map source pixel (x, y) to (scale * x + dx, scale * y + dy) on a canvas padded just enough that
    nothing clips (a twin drawn a little off its stock frame can land past the 2000 px canvas edge).
    Returns the image and the (x, y) shift of the original canvas's origin on the padded one."""
    w, h = im.size
    nw, nh = int(round(w * scale)), int(round(h * scale))
    moved = im if (nw, nh) == (w, h) else im.resize((nw, nh), Image.Resampling.LANCZOS)
    dx, dy = int(round(dx)), int(round(dy))
    x0, y0 = min(0, dx), min(0, dy)
    x1, y1 = max(w, dx + nw), max(h, dy + nh)
    out = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    out.paste(moved, (dx - x0, dy - y0), moved)
    return out, (-x0, -y0)


def process_twin(name: str, spec: dict):
    """A poop frame (stock stink / falling / fart / speech, or a December twin) on the poop set's body
    centre and scale: `stock` picks the centre ("body", "fart" or "speech"); `pre` is an optional
    (scale, dx, dy) applied to the source canvas first; `ref` is REF_OWN (a stock entry) or omitted
    (the reference is the repo's stock frames)."""
    src_name = spec["src"]
    ref_dir = SRC if spec.get("ref") == REF_OWN else STOCK_SRC
    which = spec.get("stock", "body")
    im = knock_background(Image.open(SRC / src_name))
    centre = ref_centre(ref_dir, which)
    k = poop_body(ref_dir)["k"]
    if spec.get("pre"):
        im, (sx, sy) = pre_transform(im, *spec["pre"])
        centre = (centre[0] + sx, centre[1] + sy)
    cut = cut_same_body_scale(im, centre, k)
    if not cut:
        raise SystemExit(f"{src_name} has no visible ink")
    out, half = cut
    save_png(out, OUT / f"{name}.png")
    shown = tuple(round(v) for v in centre)
    what = "body centre" if which != "body" else "centre"
    print(f"{name}.png: {out.size}  ({what} {shown} of {im.size}, k {k:.5f}, half {half})")


def process_body_frame(name: str, spec: dict):
    """poop.png / poop-dead.png: cut on the body box itself (size SIZE)."""
    body = poop_body(SRC)
    out = scale_to(crop_centred(body[spec["which"]], body["centre"], body["half"]), SIZE)
    save_png(out, OUT / f"{name}.png")
    print(f"{name}.png: {out.size}")


def padded_box(size, bbox, pad=PAD):
    """bbox grown by pad px and clamped to an image of `size`."""
    l, t, r, b = bbox
    return (max(0, l - pad), max(0, t - pad), min(size[0], r + pad), min(size[1], b + pad))


def item_square(im: Image.Image):
    """The square process_item cuts: the ink (plus PAD) on a square of the longer side, centred.
    Returns (left, top, side) in source px of that square, and its centre."""
    bbox = content_bbox(im)
    if not bbox:
        return None
    l, t, r, b = padded_box(im.size, bbox)
    w, h = r - l, b - t
    side = max(w, h)
    sl, st = l - (side - w) // 2, t - (side - h) // 2
    return (sl, st, side), (sl + side / 2, st + side / 2)


def ink_box(im: Image.Image):
    """Bounding box of every pixel with any alpha (the ink as drawn, soft edges included)."""
    return im.split()[-1].getbbox()


def ink_height(path: Path) -> int:
    """Height in px of a PNG's ink (any alpha above 0: probiotic.png's is 176)."""
    bbox = ink_box(Image.open(path).convert("RGBA"))
    if not bbox:
        raise SystemExit(f"{path.name} has no visible ink")
    return bbox[3] - bbox[1]


def fit_height_ref(ref) -> int:
    """--fit-height: a number of px, or a PNG (a path, or a name under the repo's assets/) whose ink height it is."""
    try:
        return int(ref)
    except (TypeError, ValueError):
        pass
    path = Path(str(ref))
    return ink_height(path if path.is_file() else ROOT / "assets" / path)


def item_source_for(stock_png: str) -> str:
    """A stock item's source drawing from its output file name ("bacteria.png" or "bacteria")."""
    stem = Path(stock_png).stem
    for src_name, dest in ITEMS:
        if dest == stem:
            return src_name
    raise SystemExit(f"--body-like: {stock_png!r} is not a stock item ({', '.join(d for _, d in ITEMS)})")


def process_item(src: Path, dest_name: str, size: int = SIZE, body_like=None, fit_height=None):
    """Item drawing -> size x size PNG.
    Default: knock out the background, trim to the ink and refit on a square (every item fills its square).
    body_like="bacteria.png": same-body-scale mode: cut on the stock item's crop square centre and its
      scale, so a twin (a hatted bacterium aligned on the stock canvas) keeps the body where it was and
      the canvas grows where the extra ink sticks out. The stock source is read from STOCK_SRC.
    fit_height=176 or "probiotic.png": scale the ink to that height (or that PNG's ink height), centred
      on the size x size square (the gingerbread takes the probiotic's height)."""
    im = knock_background(Image.open(src))
    bbox = content_bbox(im)
    if not bbox:
        raise SystemExit(f"{src.name} has no visible ink")
    if body_like and fit_height:
        raise SystemExit("--body-like and --fit-height are separate modes")
    dest = OUT / dest_name
    if body_like:
        stock = knock_background(Image.open(STOCK_SRC / item_source_for(body_like)))
        (sl, st, side), centre = item_square(stock)
        k = size / side
        out, half = cut_same_body_scale(im, centre, k)
        save_png(out, dest)
        print(f"{dest_name}: {out.size}  (centre {tuple(round(v, 1) for v in centre)}, k {k:.5f}, half {half}; stock square {side})")
        return
    if fit_height:
        ref_h = fit_height_ref(fit_height)
        ink = im.crop(ink_box(im))
        f = ref_h / ink.height
        nw, nh = int(round(ink.width * f)), int(round(ink.height * f))
        if max(nw, nh) > size:
            raise SystemExit(f"{src.name}: ink {nw} x {nh} does not fit {size} px")
        ink = ink.resize((nw, nh), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(ink, (int(round((size - nw) / 2)), int(round((size - nh) / 2))), ink)
        save_png(out, dest)
        print(f"{dest_name}: {out.size}  (ink {nw} x {nh}, scale {f:.5f} to height {ref_h})")
        return
    im = crop_to_bbox(im, bbox)
    side = max(im.width, im.height)
    im = scale_to(fit_on_square(im, side), size)
    save_png(im, dest)
    print(f"{dest_name}: {im.size}")


def process_layer(src: Path, dest_name: str, scale: float = 0.5, anchor=None):
    """Layer mode (snow, light strips, a title image): no white knockout (soft white glows stay), scale
    by `scale` (default 0.5, 4x art to 2x), crop to the alpha bbox (any alpha above 0). With
    anchor=(ax, ay), a point in SOURCE px (the pipe cap's top-left, --anchor 96,128), print the crop's
    offset from it: in source px, in output px, and in game px (output px at spriteDisplayScale 0.5)."""
    im = Image.open(src).convert("RGBA")
    bbox = im.split()[-1].getbbox()  # on the source, so resampling's faint spill cannot grow the box
    if not bbox:
        raise SystemExit(f"{src.name} has no visible ink")
    out = im.crop(bbox)
    if scale != 1:
        out = out.resize((max(1, int(round(out.width * scale))), max(1, int(round(out.height * scale)))), Image.Resampling.LANCZOS)
    save_png(out, OUT / dest_name)
    line = f"{dest_name}: {out.size}  (scale {scale}, crop box {bbox} of {im.size})"
    if anchor:
        ox, oy = bbox[0] - anchor[0], bbox[1] - anchor[1]
        line += (f"\n  offset from anchor {tuple(anchor)}: source px ({ox:g}, {oy:g}),"
                 f" output px ({ox * scale:g}, {oy * scale:g}), game px ({ox * scale * 96 / SIZE:g}, {oy * scale * 96 / SIZE:g})")
    print(line)


def process_sheet(src: Path, dest_name: str, size: int = SIZE):
    """Animated GIF -> one row of size x size frames. Every frame is cut on the same
    square (centred on the union of all frames' ink), so the animation never jitters."""
    gif = Image.open(src)
    frames = []
    for i in range(getattr(gif, "n_frames", 1)):
        gif.seek(i)
        frames.append(knock_background(gif.convert("RGBA")))
    boxes = [content_bbox(f) for f in frames]
    if not all(boxes):
        raise SystemExit(f"{src.name} has a frame with no visible ink")
    union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    centre = ((union[0] + union[2]) / 2, (union[1] + union[3]) / 2)
    half = frame_half(union, centre)
    sheet = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(scale_to(crop_centred(f, centre, half), size), (i * size, 0))
    save_png(sheet, OUT / dest_name)
    print(f"{dest_name}: {sheet.size} ({len(frames)} frames of {size}x{size})")


ICON_SAFE_FRAC = 0.8  # maskable icons: Android may crop to a circle; the central 80 % is always kept
ICONS = (("icon-192.png", 192), ("icon-512.png", 512))
APPLE_ICON = ("apple-touch-icon.png", 180)


def process_icons(src: Path, only=None):
    """App icons from the square app art (opaque, its own background colour).

    icon-192 / icon-512 (manifest, purpose "any maskable", and the tab favicon):
    the drawing is scaled to the central ICON_SAFE_FRAC of a canvas filled with
    the art's own background (sampled at the top-left corner) so a circular or
    squircle mask never clips the fart cloud. apple-touch-icon (iPhone home
    screen, where iOS only rounds the corners): the full art, no padding.
    """
    art = Image.open(src).convert("RGBA")
    if art.width != art.height:
        raise SystemExit(f"{src.name} must be square, is {art.size}")
    bg = art.getpixel((0, 0))
    for name, size in ICONS:
        if only and name not in only:
            continue
        inner = int(round(size * ICON_SAFE_FRAC))
        out = Image.new("RGBA", (size, size), bg)
        out.paste(scale_to(art, inner), ((size - inner) // 2, (size - inner) // 2))
        save_png(out, OUT / name)
        print(f"{name}: {out.size} (drawing {inner} px on {bg[:3]})")
    name, size = APPLE_ICON
    if only and name not in only:
        return
    out = scale_to(art, size)
    save_png(out, OUT / name)
    print(f"{name}: {out.size} (full bleed)")


# ---------------------------------------------------------------------------
# Entries and the command line
# ---------------------------------------------------------------------------
# name (the output file's stem) -> spec. A no-flag run does DEFAULT_RUN, today's full run, in order.
# Anything added to ENTRIES but not to DEFAULT_RUN (the December art, plan 17 step 1.2) runs only through
# --only, so a no-flag run stays today's run. Spec kinds: body, twin, item, sheet, icon, layer. Examples:
#   ENTRIES["x-twin"] = {"kind": "twin", "src": "X.png", "stock": "body"|"fart"|"speech", "pre": (scale, dx, dy)}
#   ENTRIES["x-item"] = {"kind": "item", "src": "X.png", "body_like": "bacteria.png"} or {"fit_height": "probiotic.png"}
#   ENTRIES["x-layer"] = {"kind": "layer", "src": "X.png", "scale": 0.5, "anchor": (96, 128)}
POOP_FRAMES = (
    ("poop-stink1", "Poop_Stink1.png"),
    ("poop-stink2", "Poop_Stink2.png"),
    ("poop-falling", "PoopFalling.png"),
    ("poop-stink-falling1", "PoopStinkFalling1.png"),
    ("poop-stink-falling2", "PoopStinkFalling2.png"),
    ("poop-scared", "PoopScared.png"),  # near miss with a pipe: no lines, so the body box (192)
    ("poop-stink-scared1", "PoopScaredStink1.png"),
    ("poop-stink-scared2", "PoopScaredStink2.png"),
)
ITEMS = (
    ("Fiber.png", "fiber"),
    ("Good_Bacteria.png", "probiotic"),
    ("Bad_Bacteria.png", "bacteria"),
    ("Kidney_Bean.png", "bean"),
    ("Postbiotic.png", "postbiotic"),
    ("MysteryBox_Icon.png", "mystery-icon"),
)
ENTRIES = {}
DEFAULT_RUN = []


def add_stock(name, spec):
    ENTRIES[name] = spec
    DEFAULT_RUN.append(name)


add_stock("poop", {"kind": "body", "which": "alive"})
add_stock("poop-dead", {"kind": "body", "which": "dead"})
# Stink / falling frames: same body centre and scale, bigger square for the lines and the sweat marks.
for _name, _src in POOP_FRAMES:
    add_stock(_name, {"kind": "twin", "src": _src, "stock": "body", "ref": REF_OWN})
# Fart frame: the body is elsewhere on the canvas; centre on the brown body. Speech frame (ready screen
# "TAP TO FLAP!" bubble): same rule.
add_stock("poop-fart", {"kind": "twin", "src": "Poop_Fart.png", "stock": "fart", "ref": REF_OWN})
add_stock("poop-speech", {"kind": "twin", "src": "Poop_Speech.png", "stock": "speech", "ref": REF_OWN})
for _src, _name in ITEMS:
    add_stock(_name, {"kind": "item", "src": _src})
add_stock("mystery", {"kind": "sheet", "src": "MysteryBox.gif"})
add_stock("coin", {"kind": "sheet", "src": "CornKernel.gif", "size": 106})  # 12 spin frames, drawn at 53 px (coin.displayPx) in the field
for _name, _size in ICONS + (APPLE_ICON,):
    add_stock(_name[:-4], {"kind": "icon", "src": "FlappyPoopAppArt.png"})

RUNNERS = {
    "body": process_body_frame,
    "twin": process_twin,
    "item": lambda name, s: process_item(SRC / s["src"], f"{name}.png", s.get("size", SIZE), s.get("body_like"), s.get("fit_height")),
    "sheet": lambda name, s: process_sheet(SRC / s["src"], f"{name}.png", s.get("size", SIZE)),
    "layer": lambda name, s: process_layer(SRC / s["src"], f"{name}.png", s.get("scale", 0.5), s.get("anchor")),
}


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Crop, fit and resize Michael's drawings into the gameplay art PNGs.")
    ap.add_argument("--only", help="NAME[,NAME]: run just these entries (an output file's stem, e.g. fiber,poop-stink1); default: the full run")
    ap.add_argument("--out", help="output folder (default assets/)")
    ap.add_argument("--src", help="source folder (default assets/src/); the stock reference frames always come from assets/src/")
    ap.add_argument("--anchor", help="X,Y in source px: layer mode prints the crop's offset from this point (e.g. 96,128, the pipe cap's top-left)")
    ap.add_argument("--scale", type=float, help="layer mode: scale factor (default 0.5)")
    ap.add_argument("--body-like", metavar="STOCK_PNG", help="item mode: cut on this stock item's crop square and scale (e.g. bacteria.png)")
    ap.add_argument("--fit-height", metavar="PX_OR_PNG", help="item mode: scale the ink to this height in px, or to this PNG's ink height (e.g. probiotic.png)")
    return ap.parse_args(argv)


def main(argv=None):
    global SRC, OUT
    args = parse_args(argv)
    if args.src:
        SRC = Path(args.src).resolve()
    if args.out:
        OUT = Path(args.out).resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    names = [n.strip() for n in args.only.split(",") if n.strip()] if args.only else list(DEFAULT_RUN)
    unknown = [n for n in names if n not in ENTRIES]
    if unknown:
        raise SystemExit(f"unknown --only name(s): {', '.join(unknown)}. Known: {', '.join(ENTRIES)}")
    overrides = {}
    if args.anchor:
        try:
            overrides["anchor"] = tuple(float(v) for v in args.anchor.split(","))
            assert len(overrides["anchor"]) == 2
        except (ValueError, AssertionError):
            raise SystemExit("--anchor takes X,Y, e.g. 96,128")
    if args.scale is not None:
        overrides["scale"] = args.scale
    if args.body_like:
        overrides["body_like"] = args.body_like
    if args.fit_height:
        overrides["fit_height"] = args.fit_height
    layer_flags = {"anchor", "scale"} & overrides.keys()
    item_flags = {"body_like", "fit_height"} & overrides.keys()
    for flags, kind in ((layer_flags, "layer"), (item_flags, "item")):
        if flags and not any(ENTRIES[n]["kind"] == kind for n in names):
            raise SystemExit(f"--{'/--'.join(sorted(f.replace('_', '-') for f in flags))} apply to {kind}-mode entries, and none is selected")
    icons = []
    for name in names:
        spec = dict(ENTRIES[name])
        kind = spec["kind"]
        if kind == "icon":
            icons.append(name)
            continue
        wanted = layer_flags if kind == "layer" else item_flags if kind == "item" else set()
        spec.update({k: overrides[k] for k in wanted})
        RUNNERS[kind](name, spec)
    if icons:
        process_icons(SRC / "FlappyPoopAppArt.png", {f"{n}.png" for n in icons})


if __name__ == "__main__":
    main()
