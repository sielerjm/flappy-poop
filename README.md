# Flappy Poop 💩

A poop emoji flaps through the gut, dodging pink intestinal folds. A Flappy Bird clone for phone browsers, built on [Phaser 4](https://phaser.io) with no build step. Version **0.2.1**.

**Play:** push this repo to GitHub, enable Pages (Settings → Pages → Deploy from branch → `main` / root), then open `https://<you>.github.io/<repo>/`. Add it to your home screen for a full-screen, app-like launch.

## How to play

Tap (or press Space / ↑) to flap. Pass a pipe pair for a point. Hit a pipe, the ceiling, or the floor and it's over — the poop swaps to its dead face. Your best score is saved in the browser. Pipes speed up and the gap narrows until score 30, then it stays hard.

From score 8, pickups can appear in the gap:

- **Fiber** (broccoli): +1.
- **Probiotic** (good bacteria): stays in your inventory for 5 pipes and blocks one bad-bacteria hit.
- **Bacteria** (bad): −2. Score never goes below 0. Does not kill. After score 15.

The probiotic does **not** save you from a pipe.

## Controls

- **Tap / Space / ↑** — flap. The first tap also starts the run. After closing Settings or About during a run, tap or Space resumes; that tap does not flap.
- **Bottom-left (i)** — About (credits, author, LLM note). Independent of Settings.
- **Bottom-right tray** — pause, mute/unmute, settings. Tray taps never flap, and on the game-over screen they never retry.
- **P** or **Esc** — pause / resume (during a run). Ignored while Settings or About is open; Esc then closes the top overlay.
- **M** — mute / unmute. Persists across reload. Still works while an overlay is open.
- **S** — settings (sound, haptics, About). Music is listed as coming soon. Opening Settings or About mid-run pauses; closing them leaves the pause banner until a new tap or Space.
- **I** — About.
- **Haptics** — a short buzz on death, Android / Chrome only. iPhone has no `navigator.vibrate` and must not error.

## Run locally

```bash
npm start      # serves on http://localhost:8000 (python3 -m http.server)
npm test       # Node 22 built-in test runner, zero dependencies
```

To test on your phone: run `npm start` on your laptop, then open `http://<laptop-ip>:8000` from the phone on the same Wi-Fi.

## Replacing the art

The player and items are drawings processed by `tools/process_art.py` from `assets/src/`. Drop a new source PNG in `assets/src/` and re-run that script (needs Pillow) to crop, knock out white, and write the 48×48 contract files.

Pipe, background, ground, and icons are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png`. Overwrite any contract file at the same name and size; `assets/README.md` has the table and `npm test` enforces it.

## Repo layout

```
index.html              viewport/touch setup, loads Phaser + src/main.js
manifest.webmanifest    "Add to Home Screen" metadata
CREDITS.md              Phaser + fart-sample attribution, author/art/LLM note
src/
  main.js               Phaser.Game config: 360x640, Scale.FIT, [Boot, Play, Over, Settings, About]
  config.js             GAME_WIDTH/HEIGHT and TUNING
  logic.js              pure functions: rng, gaps, scoring, items, settings store, tray layout, chromeIntent
  sound.js              WebAudio blips + setMuted (also mutes the Phaser fart sample)
  ui/tray.js            Phaser wrapper for the pause / mute / settings tray and bottom-left (i)
  scenes/
    Boot.js             preloads images + fart.mp3
    Play.js             ready -> playing -> paused -> dead; items; tray
    Over.js             game-over panel; tray mute still works
    Settings.js         sound / haptics overlay; About link
    About.js            credits, author, LLM note overlay
assets/                 contract PNGs + README.md (the art contract)
  poop.png poop-dead.png fiber.png probiotic.png bacteria.png
  pipe.png bg.png ground.png icon-192.png icon-512.png
  src/                  original drawings (not in the size table)
  sfx/fart.mp3          death sample
tools/make_placeholders.py   pipe / bg / ground / icons only (needs Pillow)
tools/process_art.py         crop Michael's sources into contract PNGs
tests/                  node --test: html assets logic state difficulty store smoke
                        settings sound tray items tuning about chrome
.claude/plans/          checkpointed build plans
```

## Tuning

Everything that affects feel lives in `TUNING` in `src/config.js`: gravity, flap impulse, pipe speed, spawn interval, gap height, the difficulty ramp, death/retry timings, tray size/alpha, fart volume, and the `items` block (`startScore`, `hazardStartScore`, `chancePerGap`, `fiberPoints`, `bacteriaPenalty`, `probioticPipes`, `itemRadius`, weights). Change a number, reload.

## Credits

See [`CREDITS.md`](CREDITS.md). Every file under `assets/sfx/` must be listed there with a URL; `npm test` fails if a loaded audio file is missing or uncredited.

## Phaser version

Pinned in `index.html` to `phaser@4.2.1` from jsDelivr. To bump it, change that one tag; `tests/html.test.js` only checks that it stays pinned to an exact version.

## Lineage

Rewritten from scratch, replacing the 2018-tutorial-based joke version at [sielerjm/flappy-poop](https://github.com/sielerjm/flappy-poop).
