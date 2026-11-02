# Assets — the art contract

Gameplay sprites are listed below. `npm test` checks that the sizes in this table match the PNG files, so if you change a size, update this table and the scene code that positions it.

The player and items are Michael's drawings. Put a new source PNG in `assets/src/` and run `python3 tools/process_art.py` (Pillow) to crop, knock out **background** white (not eyes or mouths), and write the 96×96 contract files. The game draws them at 0.5 scale (48 logical px). Do not list source files in this table.

`pipe.png`, `bg.png`, `ground.png`, and the icons are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png`.

| File | Size (px) | What it is | Notes for redrawing |
|---|---|---|---|
| `poop.png` | 96x96 | The player (alive) | Transparent background. Subject centred. Drawn at 0.5 scale. Hitbox is a circle ~70 % of the 48 logical-px size (`poopRadius` 17). Source: `assets/src/Poop_Emoji_Alive.png`. |
| `poop-dead.png` | 96x96 | The player on death | Same canvas as `poop.png` so the sprite does not jump. Source: `assets/src/Poop_Emoji_Dead.png`. |
| `fiber.png` | 96x96 | Bonus +1 pickup | Transparent background, subject centred. Drawn at 0.5 scale. Hitbox is a 16 px circle. Source: `assets/src/Fiber.png`. |
| `probiotic.png` | 96x96 | Good bacteria (5-pipe shield vs bad bacteria) | Same hitbox. Source: `assets/src/Good_Bacteria.png`. |
| `bacteria.png` | 96x96 | Bad bacteria (−2) | Same hitbox. Hair / flagellum are visual-only. Source: `assets/src/Bad_Bacteria.png`. |
| `pipe.png` | 64x480 | One intestinal-fold pipe | Cap at the **top**; the game flips it vertically for the bottom pipe. Only the top ~300 px are ever visible, but keep the full height so the column always reaches the screen edge. |
| `bg.png` | 360x640 | Gut-wall background | Scrolls slowly; must tile **horizontally** (left edge continues into right edge). Pink villi fringe top and bottom, mucosa in the middle. |
| `ground.png` | 360x64 | Scrolling floor strip | Must tile horizontally. Drawn at the bottom of the screen on top of `bg.png`. |
| `icon-192.png` | 192x192 | Home-screen icon | Referenced by `manifest.webmanifest`. Keep the subject inside the central 80 % so maskable icons don't crop it. |
| `icon-512.png` | 512x512 | Home-screen icon (large) | Same drawing as `icon-192.png`. Also used as the Apple touch icon. |

Image format: PNG with alpha. The logical playfield is 360x640; draw at 1x (or 2x and let the game scale — set the `scale` when loading if you do).

## Sounds

Audio files live in `assets/sfx/`. Every file there must be named in `CREDITS.md` with a URL; `npm test` fails otherwise. Synth blips (flap, score, pickup, shield, hazard, and the die fallback) stay in `src/sound.js` and need no file.

| File | What it is |
|---|---|
| `sfx/fart.mp3` | Death fart. "fart" by MacKaffee (Freesound) via Pixabay. See `CREDITS.md`. |
