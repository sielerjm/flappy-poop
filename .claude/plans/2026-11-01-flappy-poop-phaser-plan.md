# Plan: Flappy Poop — fresh build on Phaser 4 (mobile-first browser game)
- Created: 2026-11-01
- Status: in progress
- Baseline commit: none yet — Step 1 runs `git init` in a new, empty repo (old sielerjm/flappy-poop is reference only)
- Whole-suite verification: `npm test` (Node 22 built-in `node --test`, zero dependencies) — created in Step 1
- Golden output: n/a (new project)

## Goal
A Flappy Bird clone where a poop emoji flaps through a GI tract dodging pink intestinal-fold pipes. Plays in a phone browser (touch, fills the screen in portrait, no zoom/scroll), scores one point per pipe passed, keeps a best score, and deploys to GitHub Pages straight from `main` with no build step. Art is placeholder, structured so Michael can drop in his own drawings by file name.

## Engine decision
- **Phaser 4.2.1** (current stable; 4.0 shipped April 2026, 4.2.1 in July 2026), loaded from jsDelivr pinned to that exact version. Gives arcade physics, sprite/animation, tweens, the Scale Manager (FIT + autoCenter handles every phone size), pointer input that unifies touch and mouse, and iOS audio unlock — i.e. everything the old hand-rolled version got wrong. No bundler needed; one `<script>` tag.
- Alternatives considered: **Kaplay** (terser API, Flappy Bird is literally its demo; but stable 3001 last released June 2025 and v4000 is still alpha); **Godot 4 web export** (great engine, but 30–40 MB wasm and awkward iOS Safari/threads story — wrong tool for a one-tap browser game); **TypeScript** (nice, but forces a build step; skip until the game outgrows ~500 lines).
- Caveat: Phaser 4 is API-compatible with Phaser 3 for everything this game uses, but my detailed knowledge is Phaser 3; Step 2 exists partly to confirm the pinned 4.x build behaves as expected before anything is built on it.

## Repo layout
```
flappy-poop/
  index.html            # viewport meta, loads phaser + src/main.js
  src/main.js           # Phaser.Game config (360x640, Scale.FIT, arcade physics)
  src/scenes/Boot.js    # preload placeholder assets
  src/scenes/Play.js    # the game: poop, pipes, score, death
  src/scenes/Over.js    # game-over overlay, best score, tap to retry
  src/logic.js          # pure, Node-testable: difficulty(score), spawnGap(rng), best-score adapter
  assets/               # placeholder PNGs; assets/README.md is the "asset contract"
  tests/                # node --test
  .claude/plans/
```

## Documents to update in the final step
- Repo-structure overview: `README.md` (create)
- Asset contract: `assets/README.md` (create in Step 3, update in Step 7)
- Project plans / decision logs: this file
- Subdirectory READMEs: none other

## Risks and notes
- Cannot run Phaser in this container (no browser; Playwright's Chromium download is off the allowed network list). Scene behaviour is verified by: `node --check` on every file, an asset-reference test, Node tests on `src/logic.js`, and manual checks on a phone that are marked as such — never claimed as passed here.
- GitHub Pages URL is unreachable from here; deploy check is yours after pushing.
- Placeholder art: generated programmatically (solid-colour shapes + the poop emoji rendered to PNG via Pillow), sized to a documented contract. Replace by overwriting files with the same name and size, or edit the size table in `assets/README.md`.
- Nothing is pushed. Delivery is a `git bundle` (or tarball) of the new repo for you to push to a new GitHub repo or force onto the old one — your call.

## Steps

### Step 1/7 — New repo, scaffold, test runner  [done]
- Change: `git init`; `.gitignore` (`.DS_Store`, `node_modules/`); `package.json` (`"type":"module"`, `"test":"node --test tests/"`, `"start":"python3 -m http.server 8000"`); `tests/smoke.test.js` (imports `src/logic.js` stub); `README.md` stub; this plan file.
- Verify: `npm test` → `# pass 1 / # fail 0`.
- Commit: `chore(step 1/7): scaffold repo, test runner, plan`
- Rollback: delete the directory (nothing else is touched).
- Result: npm test 1/1 pass; wrong assertion correctly fails; commit `0b14cad`

### Step 2/7 — Phaser boots: blank scene at phone size  [done]
- Change: `index.html` (`<meta viewport ... viewport-fit=cover>`, `touch-action:none`, `overscroll-behavior:none`, black letterbox background, `<script src="https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js">`); `src/main.js` with `new Phaser.Game({ width:360, height:640, scale:{mode:FIT, autoCenter:CENTER_BOTH}, physics:{default:'arcade'}, scene:[Boot, Play, Over] })`; empty scenes that log their name.
- Verify: `node --check` on all `src/**/*.js`; `tests/html.test.js` asserts `index.html` contains the viewport meta, `touch-action:none`, and a Phaser script tag pinned to an exact version (regex `phaser@\d+\.\d+\.\d+/`). Manual: open on phone → black canvas fills screen, no scroll, console shows scene names.
- Commit: `feat(step 2/7): Phaser 4 boot with mobile scale config`
- Rollback: `git checkout -- .`
- Result (commit `41b0989`): node --check 6/6 files; npm test 5/5 pass; phaser@4.2.1 npm tarball confirmed to contain dist/phaser.min.js with Scale.FIT, autoCenter, activePointers. Phone render: MANUAL, not verified here.

### Step 3/7 — Placeholder asset contract  [done]
- Change: Python script `tools/make_placeholders.py` (Pillow) generating `assets/poop.png` (48x48, emoji rendered), `assets/pipe.png` (64x480 pink column, cap baked in at top; flipped in code for the bottom), `assets/bg.png` (360x640 placeholder: pink villi band top/bottom, purple mucosa middle — tile-able horizontally), `assets/ground.png` (360x64, tile-able). `assets/README.md`: table of file → size → what it is → how to replace. `Boot.js` preloads them.
- Verify: `python3 tools/make_placeholders.py && npm test` with `tests/assets.test.js`: every `this.load.image('key','assets/x.png')` in `src/` points at an existing file, and each file's PNG header dimensions match the table in `assets/README.md` (parsed). Success: all pass; test fails if a size is edited in the README without regenerating.
- Commit: `feat(step 3/7): placeholder assets and asset contract`
- Rollback: `git checkout -- . && git clean -fd assets tools`
- Result (commit `53c4565`): 4 PNGs generated at contract sizes; npm test 7/7 pass; README size mismatch correctly fails (6/1). Placeholder bg has a visible horizontal seam — fine for a placeholder, the contract tells the artist to make it tile.

### Step 4/7 — Core loop: flap, pipes, collision, score  [done]
- Change: `Play.js` — poop as arcade sprite (gravity ~1200, flap velocity ~ -380, angle tweened to velocity, body hitbox inset ~20 %); pipe pairs spawned on a timer as a physics group moving left at constant speed, recycled when off-screen; invisible score trigger per pair (overlap → `score += 1` once, flag on the pair); collide with pipes/ground/ceiling → `die()`. `src/logic.js` — `pipeGap(rng, config)` returns a gap centre inside safe bounds; `createRng(seed)` (mulberry32). Score text pinned to the camera.
- Verify: `npm test` with `tests/logic.test.js`: `pipeGap` output always within `[minY, maxY]` over 10 000 draws; same seed → same sequence; `node --check` green. Manual on phone: tap flaps, pipes scroll, score increments once per pipe, hitting anything ends the run.
- Commit: `feat(step 4/7): flap physics, pipe spawning, collision, scoring`
- Rollback: `git checkout -- .`
- Result: node --check 7/7; npm test 13/13 pass (gap bounds over 10k draws, seed determinism, hasPassed edge, angle clamp). Tuning moved to `src/config.js` so Node can import it. Phone play: MANUAL, not verified here.

### Step 5/7 — Game states: ready → playing → dead → retry  [pending]
- Change: ready state in `Play.js` (poop bobs, gravity off, "TAP" text; first tap starts physics); on death: camera shake + flash, pipes stop, poop tumbles, then launch `Over` scene after ~600 ms (input lockout so the death tap doesn't restart). `Over.js` shows score, best, "tap to retry" → restarts `Play`. Keyboard Space mirrors tap for desktop.
- Verify: `npm test` with `tests/logic.test.js` additions for the pure retry lockout helper `canRestart(deathTime, now, lockoutMs)`; `node --check`. Manual on phone: full cycle ready → play → die → over → retry twice without reload.
- Commit: `feat(step 5/7): ready/over scenes and retry lockout`
- Rollback: `git checkout -- .`

### Step 6/7 — Best score, difficulty ramp, sound, install-ability  [pending]
- Change: `src/logic.js` — `difficulty(score)` (gap and speed tighten linearly to a cap), `bestStore(storage)` adapter with try/catch (private mode / blocked storage → 0). `Play.js` uses them. WebAudio blips generated in code (flap, score, death; no audio files). `manifest.webmanifest` + 192/512 px icons so "Add to Home Screen" launches standalone; `<link rel="icon">`.
- Verify: `npm test` with `tests/difficulty.test.js` (gap non-increasing, speed non-decreasing, equal to cap at and beyond cap, `difficulty(0)` equals base) and `tests/store.test.js` (fake storage; throwing storage yields 0 and does not propagate); `python3 -c "import json;json.load(open('manifest.webmanifest'))"`; assets test extended to manifest icons. Manual: install to home screen on iOS/Android opens full-screen; sound plays after first tap.
- Commit: `feat(step 6/7): best score, difficulty ramp, generated sounds, PWA manifest`
- Rollback: `git checkout -- . && git clean -fd`

### Step 7/7 — Documentation and deploy  [pending]
- Change: `README.md` — what it is, play link, controls, run locally (`npm start` → http://localhost:8000; `npm test`), repo tree, how to replace art (points at `assets/README.md`), Phaser version and how to bump it, credit to the original joke version. Mark this plan complete.
- Verify: `for f in $(git ls-files src assets tests tools); do grep -q "$(basename $f)" README.md assets/README.md || echo MISSING $f; done` prints nothing; `npm test` green. Manual after push: `curl -sI https://<user>.github.io/<repo>/ | head -1` → `200`, Pages set to `main` / root.
- Commit: `docs(step 7/7): README, art-replacement guide, mark plan complete`
- Rollback: `git checkout -- .`

## Completion summary
(filled in when done)
## Stop report (only if stopped)
(filled in if a step fails three times)
