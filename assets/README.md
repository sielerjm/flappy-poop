# Assets — the art contract

Gameplay sprites are listed below. `npm test` checks that the sizes in this table match the PNG files, so if you change a size, update this table and the scene code that positions it.

The player and items are Michael's drawings. Put a new source PNG in `assets/src/` and run `uv run --with pillow python3 tools/process_art.py` (or any Python with Pillow) to crop, knock out **background** white (not eyes or mouths), and write the 384×384 contract files. The poop set (alive, dead, stink1, stink2, fart) shares one body scale and is cut around the body centre, so texture swaps never move the body; the fart frame's body is found with a brown-pixel mask because its cloud sits to the left. The game draws them at 0.25 scale (96 logical px on the 720×1280 field). Do not list source files in this table.

`pipe.png`, `villi.png`, `ground.png`, and the icons are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png`.

| File | Size (px) | What it is | Notes for redrawing |
|---|---|---|---|
| `poop.png` | 384x384 | The player (alive) | Transparent background. Subject centred. Drawn at 0.25 scale. Hitbox is a 48 px circle = the whole 96 logical-px drawing (`poopRadius`). Source: `assets/src/Poop_Emoji_Alive.png`. |
| `poop-dead.png` | 384x384 | The player on death | Same canvas as `poop.png` so the sprite does not jump. Source: `assets/src/Poop_Emoji_Dead.png`. |
| `poop-stink1.png` | 714x714 | Player, power-up charged (stink lines, frame A) | Same body scale and centre as `poop.png` on a bigger square (the lines stick out). Source: `assets/src/Poop_Stink1.png`. |
| `poop-stink2.png` | 714x714 | Player, power-up charged (stink lines, frame B) | Alternates with frame A. Source: `assets/src/Poop_Stink2.png`. |
| `poop-fart.png` | 876x876 | Player during the fart power | Body at the canvas centre (brown mask), cloud trails left. Source: `assets/src/Poop_Fart.png`. |
| `poop-speech.png` | 1020x1020 | Player on the ready screen with the "TAP TO FLAP!" bubble | Body at the canvas centre (brown mask); the bubble reaches ~127 px up and ~116 px right of the body at display scale. Source: `assets/src/Poop_Speech.png`. |
| `fiber.png` | 384x384 | Bonus +3 pickup (+6 under a postbiotic; eaten with a probiotic up it makes one) | Transparent background, subject centred. Drawn at 0.25 scale. Hitbox is a 48 px circle (the whole 96 px drawing, `itemRadius`). Source: `assets/src/Fiber.png`. |
| `probiotic.png` | 384x384 | Good bacteria (5-pipe shield vs bad bacteria) | Same hitbox. Source: `assets/src/Good_Bacteria.png`. |
| `postbiotic.png` | 384x384 | Postbiotic HUD icon (replaces the probiotic counter icon while the ×2 multiplier runs) | Not a world pickup, so no hitbox. Same crop rules as the items. Source: `assets/src/Postbiotic.png`. |
| `bacteria.png` | 384x384 | Bad bacteria (−3) | Same hitbox. Hair / flagellum are visual-only. Source: `assets/src/Bad_Bacteria.png`. |
| `bean.png` | 384x384 | Bean (one readies the fart power; three make it a super fart) | Same hitbox. Bobs up and down between pipe pairs. Source: `assets/src/Kidney_Bean.png`. |
| `pipe.png` | 128x1280 | One intestinal-fold pipe | Cap at the **top**; the game flips it vertically for the bottom pipe. Height must be **at least the playfield height** (1280) so a flipped top pipe always reaches the ceiling when the gap sits low. |
| `villi.png` | 720x1280 | Villi overlay over the level colour | Exact playfield size, **transparent** except the cream bands and villi fringes top and bottom. Scrolls slowly (parallax 0.25); must tile **horizontally** (left edge continues into right edge). See "Background layers" below. |
| `ground.png` | 720x128 | Scrolling floor strip | Must tile horizontally. Drawn at the bottom of the screen on top of every background layer. |
| `icon-192.png` | 192x192 | Home-screen icon | Referenced by `manifest.webmanifest`. Keep the subject inside the central 80 % so maskable icons don't crop it. |
| `icon-512.png` | 512x512 | Home-screen icon (large) | Same drawing as `icon-192.png`. Also used as the Apple touch icon. |

Image format: PNG with alpha. The logical playfield is 720x1280. Player and item textures are 4x (384px) drawn at `spriteDisplayScale` 0.25.

## Sounds

Audio files live in `assets/sfx/`. Every file there must be named in `CREDITS.md` with a URL; `npm test` fails otherwise. Synth blips (flap, score, pickup, shield, hazard, and the die fallback) stay in `src/sound.js` and need no file.

| File | What it is |
|---|---|
| `sfx/fart.mp3` | Death fart. "fart" by MacKaffee (Freesound) via Pixabay. See `CREDITS.md`. |
| `sfx/fart_accelerate.mp3` | Fart power-up (4.3 s); the power lasts exactly this clip. "fart sound effect (reed)" via Pixabay. See `CREDITS.md`. |

## Background layers (art contract)

The background is a **solid colour per level** (`LEVEL_COLORS` in `src/config.js`, cycling, softened by `levels.whiteBlend`, crossfaded between levels at the break) with one or more **transparent PNG overlay layers** on top. Each layer is a `tileSprite` listed in `BACKGROUND.layers` (`key`, `parallax`) and scrolls at its own fraction of the pipe speed (villi 0.25). Pipes, items, the poop and the ground draw above all layers; the ground strip (bottom 128 px) hides that part of every layer.

- `villi.png`: 720×1280, PNG with alpha, exactly the playfield (it is scaled to the screen height, never tiled vertically). Transparent wherever the level colour should show; opaque only where the villi / mucosa are. Must tile horizontally: the right edge continues into the left (the placeholder draws 40 px past each side and wraps). A 2× version (1440×2560) is fine; keep each side ≤ 4096 px (phone WebGL limit); the scene scales by `GAME_WIDTH / frame.width`. Keep the fringes clear of the middle ~50 % of the height where the gaps sit.
- The same villi show over every level colour (Set2: tan, teal, periwinkle, lime, yellow, light blue). Keep villi away from those hues; `tests/levels.test.js` rejects a level colour that comes within reach of the villi pink or the cream bands, so a redrawn villi colour means re-checking that test's constants.
- Adding a layer: a PNG with the same rules, a row in `BACKGROUND.layers`, a `load.image` in `src/scenes/Boot.js`, and a row in the table above. Nothing in `Play.js` changes.
- The finish line is a generated texture (`src/ui/finish.js`). A drawn one later: `finish.png`, 64×1280, alpha, scrolls with the pipes.
