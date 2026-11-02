# Flappy Poop 💩

A poop emoji flaps through the gut, dodging pink intestinal folds. A Flappy Bird clone for phone browsers, built on [Phaser 4](https://phaser.io) with no build step. Version **0.2.7**. English and Simplified Chinese in-game.

**Play:** push this repo to GitHub, enable Pages (Settings → Pages → Deploy from branch → `main` / root), then open `https://<you>.github.io/<repo>/`. Add it to your home screen for a full-screen, app-like launch.

## How to play

Tap (or press Space / ↑) to flap. Pass a pipe pair for a point. Hit a pipe, the ceiling, or the floor and it's over — the poop swaps to its dead face. Your best score is saved in the browser. Pipes speed up and the gap narrows until score 30, then it stays hard.

From score 8, pickups can appear in the gap:

- **Fiber** (broccoli): +1.
- **Probiotic** (good bacteria): stays in your inventory for 5 pipes and blocks one bad-bacteria hit.
- **Bacteria** (bad): −2. Score never goes below 0. Does not kill. After score 15.

The probiotic does **not** save you from a pipe.

On iPhone, Silent mode mutes the game — turn it off to hear sound. The pause banner is two centered lines: **PAUSED** / tap anywhere to resume game.

## Controls

- **Tap / Space / ↑** — flap. The first tap also starts the run. After closing Settings or About during a run, tap or Space resumes; that tap does not flap. Unpausing from the pause banner bounces (same lift as a flap) so you can recover.
- **How to play** (ready screen, also linked from About) — overlay with flap/pipe rules, iPhone Silent-mode note, and what fiber, probiotic, and bad bacteria do. Tapping it does not start the run. Closing How to play that was opened from About also closes About, leaving a paused run if info was opened mid-play. Tap the dimmed area outside Settings, About, or How to play to close (same as X).
- **Bottom-left (i)** — About (credits, author, LLM note, last-updated stamp, How to play and feedback links). Independent of Settings.
- **Bottom-left (🌐)** — language (English / 简体中文). Persists. First visit with no saved choice follows the browser language when it starts with `zh`. Opening Language mid-run pauses.
- **Bottom-left (💬)** — feedback: choose Bug or Feature request to open a GitHub issue form in the browser (needs a GitHub account). Also linked from About and How to play.
- **Bottom-right tray** — pause, mute/unmute, settings. Tray taps never flap, and on the game-over screen they never retry.
- **P** or **Esc** — pause / resume (during a run). Ignored while Settings, About, How to play, Language, or Feedback is open; Esc then closes the top overlay.
- **M** — mute / unmute. Persists across reload. Still works while an overlay is open.
- **S** — settings (sound, haptics, About). Music is listed as coming soon. Opening Settings or About mid-run pauses; closing them leaves the pause banner until a new tap or Space.
- **I** — About.
- **F** — Feedback (bug / feature → GitHub).
- **L** — language.
- **Haptics** — a short buzz on death, Android / Chrome only. iPhone has no `navigator.vibrate` and must not error.

Translation review notes for LLMs / humans: [TRANSLATION_NOTES.md](TRANSLATION_NOTES.md).

## Run locally

```bash
npm start      # serves on 0.0.0.0:8000 and prints laptop + phone URLs
npm test       # Node 22 built-in test runner, zero dependencies
```

`npm start` prints `http://localhost:8000` for the laptop and `http://<LAN-IP>:8000` for a phone on the same Wi-Fi. Do not open localhost on the phone — that is the phone itself, not this laptop.

## Replacing the art

The player and items are drawings processed by `tools/process_art.py` from `assets/src/`. Drop a new source PNG in `assets/src/` and re-run that script (needs Pillow) to crop, knock out white, and write the 384×384 contract files (drawn at 0.25 scale → 96 logical px on the 720×1280 field).

Pipe, background, ground, and icons are still placeholders from `tools/make_placeholders.py`. That script must **not** overwrite `poop.png`. Overwrite any contract file at the same name and size; `assets/README.md` has the table and `npm test` enforces it.

## Repo layout

```
index.html              viewport/touch setup, loads Phaser + src/main.js
manifest.webmanifest    "Add to Home Screen" metadata
CREDITS.md              Phaser + fart-sample attribution, author/art/LLM note
src/
  main.js               Phaser.Game config: 720x1280, Scale.FIT, roundPixels, [Boot, Play, Over, Settings, About, HowTo, Language, Feedback]
  config.js             GAME_WIDTH/HEIGHT and TUNING
  logic.js              pure functions: rng, gaps, scoring, items, settings store, tray layout, issueUrl, chromeIntent
  i18n.js               en / zh-Hans catalog + t() / initialLocale
  sound.js              WebAudio blips + setMuted (also mutes the Phaser fart sample)
  ui/tray.js            Phaser wrapper for pause / mute / settings and bottom-left (i) / 🌐 / 💬
  scenes/
    Boot.js             preloads images + fart.mp3
    Play.js             ready -> playing -> paused -> dead; items; tray; locale
    Over.js             game-over panel; tray mute still works
    Settings.js         sound / haptics overlay; About link
    About.js            credits, author, LLM note, How to play + feedback links, last-updated
    HowTo.js            How to play overlay (ready screen and About link); feedback link
    Language.js         English / 简体中文 picker
    Feedback.js         Bug / Feature request chooser → GitHub issue forms
assets/                 contract PNGs + README.md (the art contract)
  poop.png poop-dead.png fiber.png probiotic.png bacteria.png
  pipe.png bg.png ground.png icon-192.png icon-512.png
  src/                  original drawings (not in the size table)
  sfx/fart.mp3          death sample
tools/make_placeholders.py   pipe / bg / ground / icons only (needs Pillow)
tools/process_art.py         crop Michael's sources into contract PNGs
tools/serve.py               npm start: bind 0.0.0.0:8000, print phone URL
tests/                  node --test: html assets logic state difficulty store smoke
                        settings sound tray items tuning about howto feedback overlay hitbox i18n chrome serve
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
