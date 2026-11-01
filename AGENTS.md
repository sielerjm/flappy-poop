# AGENTS.md — project context for humans and AI agents

Read this first. It says what Flappy Poop is, where things live, which rules the
code depends on, and how to check your work. `README.md` is the player/maintainer
guide; this file is the map for anyone changing the code.

## What this is

Flappy Poop is a Flappy Bird clone for phone browsers: a poop emoji flaps through
the gut dodging pink intestinal-fold pipes. One point per pipe pair passed; hit a
pipe, the ceiling, or the floor and the run ends. Best score is kept in
`localStorage`. Difficulty ramps (faster pipes, narrower gap) until score 30, then
stays flat.

It is a side project by Michael Sieler (gut-microbiome researcher), hence the
theme. It is deliberately small: plain ES modules, no bundler, no npm
dependencies, Phaser 4 loaded from a CDN, deployed to GitHub Pages straight from
`main`. Keep it that way unless the game clearly outgrows it.

- Repo: `github.com/sielerjm/flappy-poop` (the pre-2026 "joke version" that used
  to live there was replaced wholesale; nothing from it survives).
- Engine: Phaser **4.2.1**, pinned by exact version in `index.html`.
- Runtime: any modern mobile/desktop browser. Tests need Node 22+ (built-in
  `node --test`). `tools/` needs Python 3 + Pillow, and only for regenerating
  placeholder art.

## Repo map

```
index.html                  Entry page. Viewport/touch CSS, <script> for Phaser from
                            jsDelivr, then <script type=module src=src/main.js>.
manifest.webmanifest        PWA "Add to Home Screen" metadata (fullscreen, portrait).
package.json                Only `npm test` and `npm start`; no dependencies.

src/
  main.js                   new Phaser.Game(...): 360x640 logical field, Scale.FIT,
                            arcade physics, scene order [Boot, Play, Over].
  config.js                 GAME_WIDTH / GAME_HEIGHT and the TUNING object. Every
                            feel-related number lives here. Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: rng, gap placement,
                            scoring, sprite angle, retry lockout, difficulty ramp,
                            best-score store. Fully unit-tested.
  sound.js                  WebAudio synth blips (flap/score/die). No audio files.
                            unlock() must be called from a user gesture (iOS).
  scenes/
    Boot.js                 preload() the four gameplay PNGs, then start Play.
    Play.js                 The game. State machine: 'ready' -> 'playing' -> 'dead'.
                            Spawns pipe pairs, scores, applies difficulty, dies,
                            then launches Over as an overlay scene.
    Over.js                 Game-over panel (score, best, "tap to retry") with a
                            tap lockout so the death tap can't restart the run.

assets/                     All art. Placeholders for now; Michael will replace
                            them with his own drawings.
  README.md                 THE ART CONTRACT: file name, pixel size, orientation
                            rules per image. tests/assets.test.js enforces it.
  poop.png pipe.png bg.png ground.png     gameplay sprites
  icon-192.png icon-512.png               PWA / Apple touch icons

tests/                      node --test, zero deps. Each file is self-describing:
  html.test.js              index.html invariants (viewport, no scroll, pinned Phaser)
  assets.test.js            every load.image() exists; README size table == PNG headers
  logic.test.js             gap bounds, rng determinism, hasPassed, angle
  difficulty.test.js        ramp is monotonic, caps, tightest gap still fits the poop
  state.test.js             retry lockout
  store.test.js             best-score store incl. throwing/missing storage
  smoke.test.js             logic.js imports and exports VERSION

tools/
  make_placeholders.py      Regenerates every PNG in assets/ (Pillow). Run only
                            when you intentionally change placeholder art.

.claude/plans/              The checkpointed build plan this repo was made from
                            (2026-11-01). Historical record + decision log
                            (why Phaser over Kaplay/Godot, etc.). Don't edit;
                            add a new plan file for new multi-step work.
```

## Rules the code depends on

1. **Phaser-free logic stays in `src/logic.js`.** Anything that can be a pure
   function (maths, state decisions, storage adapters) goes there with a test.
   Scenes in `src/scenes/` are thin wrappers that call it. This is what makes
   the game testable in Node, where Phaser cannot run.
2. **Tune numbers in `src/config.js`, never inline.** Scenes import `TUNING as T`.
   If you add a feel-related constant, add it to `TUNING` with a short comment
   and units (px, px/s, ms).
3. **Respect the art contract.** Asset file names and sizes are fixed by
   `assets/README.md`. Change a size only if you update that table AND the scene
   code that positions the sprite. `npm test` fails otherwise. The pipe image has
   its cap at the top and is flipped vertically for the top pipe; `bg.png` and
   `ground.png` must tile horizontally.
4. **Phaser stays pinned.** `index.html` loads `phaser@4.2.1` from jsDelivr.
   Bump it by changing that one tag; `tests/html.test.js` only checks the pin is
   an exact version. Phaser is a global (`Phaser.Scene`, `Phaser.Game`), not an
   import.
5. **No build step, no dependencies.** The site is served as-is from the repo
   root by GitHub Pages. Don't add a bundler, TypeScript, or npm packages without
   a strong reason; if you do, the deploy story has to change too.
6. **Mobile first.** Touch is the primary input (`pointerdown`); keyboard
   (Space / Up) is a convenience. Keep `touch-action: none`, the viewport meta,
   and the WebAudio unlock-on-gesture. Test on a real phone when you touch
   input, scaling, or audio.
7. **Storage can throw.** Private-mode Safari and blocked storage throw on
   `localStorage` access. Go through `createBestStore()`; never touch
   `localStorage` directly in scenes.

## How to work on it

```bash
npm test          # run everything; must pass before committing
npm start         # http://localhost:8000 — then open on a phone on the same Wi-Fi
                  # via http://<laptop-ip>:8000 for real touch testing
python3 tools/make_placeholders.py   # only to regenerate placeholder PNGs
```

Scene behaviour (physics, rendering, audio) cannot be verified in Node. When you
change `src/scenes/*` or `src/sound.js`, say so and ask for a phone check; don't
report it as tested. `node --check src/scenes/Play.js` at least catches syntax.

Commits so far follow `type(scope): summary` (`feat`, `docs`, `chore`); keep it.

## Where to put new things

- New game mechanic → pure parts in `src/logic.js` + test in `tests/`, wiring in
  `src/scenes/Play.js`, knobs in `src/config.js`.
- New art → `assets/`, add a row to `assets/README.md`, load it in `src/scenes/Boot.js`.
- New sound → a `blip()` preset in `src/sound.js`.
- New scene → `src/scenes/`, register in the `scene:` array in `src/main.js`.
- Multi-step work worth planning → a dated markdown plan in `.claude/plans/`.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
