# Assets — the art contract

Gameplay sprites are listed below. `npm test` checks that the sizes in this table match the PNG files, so if you change a size, update this table and the scene code that positions it.

The player and items are Michael's drawings. Put a new source PNG in `assets/src/` and run `uv run --with pillow python3 tools/process_art.py` (or any Python with Pillow) to crop, knock out **background** white (not eyes or mouths), and write the 384×384 contract files (an animated GIF becomes a one-row spritesheet of 384×384 frames). The poop set (alive, dead, stink1, stink2, falling, stink-falling1, stink-falling2, fart) shares one body scale and is cut around the body centre, so texture swaps never move the body; the fart frame's body is found with a brown-pixel mask because its cloud sits to the left. The game draws them at 0.25 scale (96 logical px on the 720×1280 field). Do not list source files in this table.

`pipe.png`, `villi.png`, and `ground.png` are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png` or the icons. The icons are cut from `assets/src/FlappyPoopAppArt.png` by `process_art.py` (`process_icons`). Browsers cache favicons and manifest icons by URL for a long time, so every icon link in `index.html` and `manifest.webmanifest` carries the same `?v=N`; bump it whenever the icon art changes (`tests/assets.test.js` keeps the tags equal).

| File | Size (px) | What it is | Notes for redrawing |
|---|---|---|---|
| `poop.png` | 384x384 | The player (alive) | Transparent background. Subject centred. Drawn at 0.25 scale. Hitbox is a 48 px circle = the whole 96 logical-px drawing (`poopRadius`). Source: `assets/src/Poop_Emoji_Alive.png`. |
| `poop-dead.png` | 384x384 | The player on death | Same canvas as `poop.png` so the sprite does not jump. Source: `assets/src/Poop_Emoji_Dead.png`. |
| `poop-stink1.png` | 714x714 | Player, power-up charged (stink lines, frame A) | Same body scale and centre as `poop.png` on a bigger square (the lines stick out). Source: `assets/src/Poop_Stink1.png`. |
| `poop-stink2.png` | 714x714 | Player, power-up charged (stink lines, frame B) | Alternates with frame A. Source: `assets/src/Poop_Stink2.png`. |
| `poop-falling.png` | 536x536 | Player on a long fall (scared face, sweat marks), no power ready | Shown once the poop falls faster than `fallLookVy`; any flap swaps back. Same body scale and centre as `poop.png` on a bigger square (the sweat marks stick out). Source: `assets/src/PoopFalling.png`. |
| `poop-stink-falling1.png` | 714x714 | Player on a long fall, power-up charged (sweat marks + stink lines, frame A) | The falling face with the stink lines; alternates with frame B like the stink frames. Source: `assets/src/PoopStinkFalling1.png`. |
| `poop-stink-falling2.png` | 714x714 | Player on a long fall, power-up charged (frame B) | Alternates with frame A. Source: `assets/src/PoopStinkFalling2.png`. |
| `poop-fart.png` | 876x876 | Player during the fart power | Body at the canvas centre (brown mask), cloud trails left. Source: `assets/src/Poop_Fart.png`. |
| `poop-speech.png` | 1020x1020 | Player on the ready screen with the "TAP TO FLAP!" bubble | Body at the canvas centre (brown mask); the bubble reaches ~127 px up and ~116 px right of the body at display scale. Source: `assets/src/Poop_Speech.png`. |
| `fiber.png` | 384x384 | Bonus +3 pickup (+6 under a postbiotic; eaten with a probiotic up it makes one) | Transparent background, subject centred. Drawn at 0.25 scale. Hitbox is a 48 px circle (the whole 96 px drawing, `itemRadius`). Source: `assets/src/Fiber.png`. |
| `probiotic.png` | 384x384 | Good bacteria (5-pipe shield vs bad bacteria) | Same hitbox. Source: `assets/src/Good_Bacteria.png`. |
| `postbiotic.png` | 384x384 | Postbiotic HUD icon (replaces the probiotic counter icon while the ×2 multiplier runs) | Not a world pickup, so no hitbox. Same crop rules as the items. Source: `assets/src/Postbiotic.png`. |
| `bacteria.png` | 384x384 | Bad bacteria (−3) | Same hitbox. Hair / flagellum are visual-only. Source: `assets/src/Bad_Bacteria.png`. |
| `bean.png` | 384x384 | Bean (one readies the fart power; three make it a super fart) | Same hitbox. Bobs up and down between pipe pairs. Source: `assets/src/Kidney_Bean.png`. |
| `mystery.png` | 3072x384 | Mystery box (from level 3; opens into a random reward) | Spritesheet: the 8 frames of the spinning GIF side by side, 384x384 each, all cut on one square so the cube never jitters; played at 70 ms per frame (`mystery.frameMs`). Same hitbox as the items. Bobs between pipe pairs at half fiber's speed. Source: `assets/src/MysteryBox.gif`. |
| `mystery-icon.png` | 384x384 | Mystery box icon (game-over summary and How to play) | Static three-quarter view; never spawned, so no hitbox. Same crop rules as the items. Source: `assets/src/MysteryBox_Icon.png`. |
| `pipe.png` | 128x1280 | One intestinal-fold pipe | Cap at the **top**; the game flips it vertically for the bottom pipe. Height must be **at least the playfield height** (1280) so a flipped top pipe always reaches the ceiling when the gap sits low. |
| `villi.png` | 720x1280 | Villi overlay over the level colour | Exact playfield size, **transparent** except the cream bands and villi fringes top and bottom and the ceiling strip (top 128 px: dark band, cream line, a front row of fingers, mirroring `ground.png`; background only, pipes and the poop draw over it). Scrolls slowly (parallax 0.25); must tile **horizontally** (left edge continues into right edge). See "Background layers" below. |
| `ground.png` | 720x128 | Scrolling floor strip | Must tile horizontally. Drawn at the bottom of the screen on top of every background layer. The top 16 px are transparent except the fingers' undulating tips (`TIP_ZONE`); the cream line and the dark band start below them; the fingers run past the bottom edge. |
| `icon-192.png` | 192x192 | Home-screen icon (Android / manifest) and the tab favicon | From `assets/src/FlappyPoopAppArt.png` on its own tan: the drawing is scaled to the central 80 % (`ICON_SAFE_FRAC`) so a circular or squircle mask never clips the fart cloud. Referenced by `manifest.webmanifest` (`purpose: any maskable`) and `index.html`. |
| `icon-512.png` | 512x512 | Home-screen icon (large) | Same cut as `icon-192.png`. |
| `apple-touch-icon.png` | 180x180 | iPhone home-screen icon | The same art full bleed (iOS only rounds the corners, no mask). Linked from `index.html`. |

Image format: PNG with alpha. The logical playfield is 720x1280. Player and item textures are 4x (384px) drawn at `spriteDisplayScale` 0.25.

## Sounds

Audio files live in `assets/sfx/`. Every file there must be named in `CREDITS.md` with a URL; `npm test` fails otherwise. Synth blips (flap, score, pickup, shield, hazard, and the die fallback) stay in `src/sound.js` and need no file.

| File | What it is |
|---|---|
| `sfx/fart.mp3` | Death fart. "fart" by MacKaffee (Freesound) via Pixabay. See `CREDITS.md`. |
| `sfx/fart_accelerate.mp3` | Fart power-up (4.3 s); the power lasts exactly this clip. "fart sound effect (reed)" via Pixabay. See `CREDITS.md`. |

## Background layers (art contract)

The background is a **solid colour per level** (`LEVEL_COLORS` in `src/config.js`, cycling, softened by `levels.whiteBlend`, crossfaded between levels at the break) with one or more **transparent PNG overlay layers** on top. Each layer is a `tileSprite` listed in `BACKGROUND.layers` (`key`, `parallax`) and scrolls at its own fraction of the pipe speed (villi 0.25). Pipes, items, the poop and the ground draw above all layers; the ground strip (bottom 128 px) hides that part of every layer.

- `villi.png`: 720×1280, PNG with alpha, exactly the portrait playfield (it is scaled to the screen height, never tiled vertically). On a wider desktop field the same 720 px copy repeats sideways (tile scale `FIELD.minWidth / width`), as does `ground.png`, so a seam at the wrap would show there first. Transparent wherever the level colour should show; opaque only where the villi / mucosa are and in the ceiling strip along the top edge (the ground's mirror, so both ends show a back fringe and a front row; it is background, so the ceiling kill line and the gap margin are unchanged). Every finger's rounded far end is off the image edge (the strips' front rows) or behind a strip (the fringes), so the walls read as villi running off-screen, not teeth; `villi_band(min_frac)` enforces the minimum length. The lumen-side tips undulate along x on a sine with a whole number of periods per 720 px tile (`BACK_WAVE` ±24 px on the fringes, `FRONT_WAVE` ±8 px on the strips, inside their 16 px `TIP_ZONE`), plus a little per-finger jitter. Must tile horizontally: the right edge continues into the left (the placeholder draws 40 px past each side and wraps). A 2× version (1440×2560) is fine; keep each side ≤ 4096 px (phone WebGL limit); the scene scales by `GAME_WIDTH / frame.width`. Keep the fringes clear of the middle ~50 % of the height where the gaps sit.
- The same villi show over every level colour (Set2: tan, teal, periwinkle, lime, yellow, light blue). Keep villi away from those hues; `tests/levels.test.js` rejects a level colour that comes within reach of the villi pink or the cream bands, so a redrawn villi colour means re-checking that test's constants.
- Adding a layer: a PNG with the same rules, a row in `BACKGROUND.layers`, a `load.image` in `src/scenes/Boot.js`, and a row in the table above. Nothing in `Play.js` changes.
- The finish line is a generated texture (`src/ui/finish.js`). A drawn one later: `finish.png`, 64×1280, alpha, scrolls with the pipes.
