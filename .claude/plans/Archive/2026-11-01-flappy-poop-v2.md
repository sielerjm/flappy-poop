# Plan: Flappy Poop v2 — fart sample, control tray (pause/mute/settings), power-ups and hazards
- Created: 2026-11-01
- Status: complete
- Baseline commit: `e6fb084` on `main` (v1 complete, deployed, verified on phone and desktop)
- Whole-suite verification: `npm test` (baseline: 25 pass / 0 fail, Node 22 built-in runner, zero deps)
- Golden output: n/a (v2 changes behaviour on purpose; v1 feel is protected by the "no regression" manual checks below)

## Goal
Three additions, each independently shippable: (1) the Pixabay fart sample on death, properly credited, plus a unified mute; (2) a minimalist bottom tray — pause, mute/unmute, settings cog — with a settings overlay (sound, haptics, credits) that is ready for background music in v3; (3) two power-ups and one hazard that spawn inside pipe gaps, with rules in `logic.js` so they are testable in Node. "Done" = `npm test` green, every manual phone check below ticked, v2 live on GitHub Pages at `0.2.0`.

## Precondition (user does this before step 2)
Download `fart` by MacKaffee (Freesound), published via the Pixabay `freesound_community` account, from https://pixabay.com/sound-effects/people-fart-83471/ and save it as `assets/sfx/fart.mp3` in the repo. It is released under the Pixabay Content License (free for commercial and non-commercial use, no attribution required — we credit anyway; the licence does not allow redistributing the file on its own, so it is only ever bundled inside the game).

## Conventions this plan follows (from v1)
- Pure rules go in `src/logic.js` (no Phaser), rendering in `src/scenes/`, numbers in `TUNING` (`src/config.js`).
- New sprites are placeholders from `tools/make_placeholders.py`, listed in `assets/README.md`; `tests/assets.test.js` enforces name + size.
- No build step, no npm dependencies. v1's "no audio files" convention is relaxed to: audio files live in `assets/sfx/`, every one is listed in `CREDITS.md`, and `npm test` fails if a loaded file is missing or uncredited.
- Commit style: `type(step k/N): message`, verified line in the body. Don't push until the user says so.

## Documents to update in the final step
- Repo-structure overview: `README.md` (layout tree, "How to play", "Controls", "Tuning", "Credits" pointer, version)
- Asset contract: `assets/README.md` (new PNG rows; new "Sounds" section pointing at `CREDITS.md`)
- Credits: `CREDITS.md` (created in step 2)
- Project plans: this file (status → complete) and `.claude/plans/2026-11-01-flappy-poop-phaser-plan.md` (one line pointing here)
- Version strings: `VERSION` in `src/logic.js`, `"version"` in `package.json` → `0.2.0`

## Deferred to v3 (designed for, not built)
- Background music: the settings store already carries `music: true`, the settings panel shows the toggle greyed "coming soon", and `setMuted()` is the single place that will also mute the music track. Credit goes in `CREDITS.md` like the fart.

## Risks and notes
- **Phaser code can't run under `node --test`.** Steps 3 and 6 are verified by a manual phone checklist written into the step; mark them done only after ticking every box on a real phone. Never mark them green from desktop alone.
- **Two audio systems.** The fart plays through Phaser's sound manager (MP3 decode, iOS unlock handled by Phaser); the blips still come from the WebAudio synth in `sound.js`. One `setMuted(bool)` must gate both (`game.sound.mute = bool` and the synth flag), or the mute button will half-work. Both unlock on the first tap, as today.
- **Tray taps must not flap, and Over's retry must not fire from a tray tap.** `Play`'s `this.input.on('pointerdown', flap)` fires for every pointer; tray buttons use `setInteractive()` and `event.stopPropagation()`, and `Over`'s retry ignores taps whose y is inside the tray band (`TUNING.trayHeight` from the bottom). Checklist items cover both.
- **iOS Safari has no `navigator.vibrate`.** Haptics will work on Android/Chrome only; the helper must no-op elsewhere. Say so in the README and in the settings panel hint.
- **Hazard inside the gap changes the core difficulty curve.** Hazard spawn rate is 0 until `hazardStartScore`; the first play session of step 6 is a no-regression check.
- `localStorage` may throw (private browsing): the settings store must be try/catch-guarded exactly like `createBestStore`.
- Nothing in this plan writes outside the repo; every step reverts with `git checkout -- .` plus `git clean -fd` for the named new files.

## Steps

### Step 1/8 — Settings store and haptics helper (pure logic)  [pending]
- Change: in `src/logic.js` add `createSettingsStore(storage, key = 'flappy-poop:settings')` with `load()` → `{ sound: true, music: true, haptics: true }` defaults, `set(patch)` merge-and-save, try/catch guarded like `createBestStore`; unknown keys in storage are ignored, missing keys get defaults. Add `vibrate(navigatorLike, pattern)` that returns `false` and does nothing when `navigatorLike?.vibrate` is missing, returns `true` after calling it. Add `settingsKey`, `vibrateOnDieMs: 60`, `trayHeight: 56`, `pauseResumeLockoutMs: 300` to `TUNING`. New `tests/settings.test.js`: defaults on empty/corrupt storage, patch persists and merges, throwing storage doesn't throw, `vibrate` no-ops without the API and calls it with the API (fake navigator object).
- Verify: `npm test` → `# pass 31` (25 + ≥6 new), `# fail 0`. Confirm a check can fail once: temporarily return `{}` from `load()` and see the defaults test go red, then restore.
- Commit: `feat(step 1/8): settings store (sound, music, haptics) and vibrate helper`
- Rollback: `git checkout -- . && git clean -fd tests/settings.test.js`
- Result:

### Step 2/8 — Fart sample on death, credits, unified mute  [pending]
- Change: confirm `assets/sfx/fart.mp3` exists (precondition above). `src/scenes/Boot.js`: `this.load.audio('fart', 'assets/sfx/fart.mp3')`. `src/sound.js`: `setMuted(bool)` / `isMuted()` gating every `sfx.*`; `attachGame(game)` so `setMuted` also sets `game.sound.mute`; guard `window` at call time, not import time, so the module imports in Node. Add `sfx.pickup()` (rising triangle chirp), `sfx.shield()` (short wet squelch: noise burst 400→90 Hz), `sfx.hazard()` (low double-thud) for step 6. `Play.die()`: `this.sound.play('fart', { volume: TUNING.fartVolume })` replaces `sfx.die()`; keep `sfx.die()` as a synth fallback used only if the `fart` key failed to load (`this.cache.audio.exists('fart')`). Create `CREDITS.md`: Phaser (MIT), and `assets/sfx/fart.mp3` — "fart" by MacKaffee (Freesound), uploaded by freesound_community, https://pixabay.com/sound-effects/people-fart-83471/, Pixabay Content License, published 2022-08-11. Extend `tests/assets.test.js`: every `this.load.audio()` path in `src/` exists, and every file under `assets/sfx/` is named in `CREDITS.md` with a URL. New `tests/sound.test.js`: module imports in Node, `sfx` has keys `flap score die pickup shield hazard`, every one returns without throwing when muted and when no AudioContext exists, `setMuted(true)` on a fake game sets `game.sound.mute`.
- Verify: `npm test` → all pass (≥4 new). Manual, desktop is fine: `npm start`, die into a pipe → the Pixabay fart plays once at a sensible volume relative to the flap blip; `rm` the mp3 temporarily → `npm test` fails on the missing-audio check, restore.
- Commit: `feat(step 2/8): Pixabay fart sample on death, CREDITS.md, unified mute, extra blips`
- Rollback: `git checkout -- . && git clean -fd CREDITS.md tests/sound.test.js` (keep `assets/sfx/fart.mp3`; it's the user's download)
- Result:

### Step 3/8 — Bottom control tray (pause · mute · settings) and settings overlay  [pending]
- Change: new `src/ui/tray.js` exporting `createTray(scene, { onPause, onMute, onSettings, muted })`: three circular buttons (⏸, 🔊/🔇, ⚙) in a row at bottom-right over the ground strip, each ≥ 44×44 logical px hit area, alpha 0.6 idle → 1.0 on press, depth 30, `setInteractive()` + `event.stopPropagation()` so a tray tap never flaps. New `src/scenes/Settings.js`: overlay scene (dim rectangle + panel) with toggles for Sound, Haptics ("Android only" hint), Music (greyed, "coming soon"), a Credits block (fart + Phaser, from `CREDITS.md` text), version line, and a close ✕; opening it pauses Play exactly like the pause button; closing resumes. `Play.js`: build the tray in `create()`, `pause()`/`resume()` methods (`physics.pause()`, `spawnTimer.paused`, bob tween, dim overlay "PAUSED — tap to resume"; resume re-arms a `pauseResumeLockoutMs` flap lockout so the resume tap doesn't flap); auto-pause on `document.visibilitychange` → hidden and Phaser `blur` only while `state === 'playing'`; `die()` → `if (settings.haptics) vibrate(navigator, T.vibrateOnDieMs)`. Mute button toggles `settings.sound` and calls `setMuted`. `Over.js`: retry ignores pointer events with `y > GAME_HEIGHT - T.trayHeight`; the mute button keeps working on the Over screen. Keyboard: `M` mute, `P`/`Esc` pause, `S` settings. Register `Settings` in `main.js`.
- Verify: `npm test` green (no logic change beyond tray geometry; add `tests/tray.test.js` asserting `trayHeight ≥ 44` and that the three button x-centres from a pure `trayLayout(width, height, t)` helper are ≥ 44 px apart and inside the field). **Manual phone checklist, all boxes required:** (a) tray visible at bottom, three buttons, readable over the ground strip, not covering the score; (b) tap 🔊 → 🔇, flap and fart are both silent, reload → still muted (persists); (c) tapping any tray button during play does **not** flap; (d) ⏸ freezes everything, tap → resumes, that tap does not flap; (e) switch apps mid-run and return → paused, not dead; (f) ⚙ opens the panel, toggles persist across reload, credits text shows the Pixabay attribution, ✕ resumes play; (g) on the Game Over screen, a tray tap does not retry, a tap elsewhere does; (h) die on Android → short buzz; on iPhone → no error, no buzz (expected); (i) desktop: M, P, S keys work; (j) no-regression: a full run start→death→retry feels identical to v1.
- Commit: `feat(step 3/8): bottom tray (pause/mute/settings), settings overlay with credits, auto-pause, haptics`
- Rollback: `git checkout -- . && git clean -fd src/ui/tray.js src/scenes/Settings.js tests/tray.test.js`
- Result:

### Step 4/8 — Power-up and hazard rules (pure logic)  [pending]
- Change: `src/logic.js` — `ITEM_KINDS = ['fiber', 'probiotic', 'pepper']` with `fiber` = shield (next pipe/hazard hit is absorbed), `probiotic` = slow-mo (pipe speed ×0.6 for `slowMoMs`), `pepper` = hazard (touching it kills; a shield absorbs it). `rollItem(rng, score, t)` → `null` or a kind, using `TUNING.items = { startScore: 8, hazardStartScore: 15, chancePerGap: 0.3, slowMoMs: 4000, slowMoFactor: 0.6, weights: { fiber: 3, probiotic: 2, pepper: 4 } }` — hazards get weight 0 below `hazardStartScore`. `itemGapY(gapY, gapHeight, rng, kind)`: pickups sit at the gap centre ±20 %, pepper sits off-centre (top or bottom third) so there is always a path past it. `createEffects()` state object: `apply(kind, now)`, `has(kind, now)` (shield is a count, slow-mo is an expiry), `consumeShield()`, `speedFactor(now)`. New `tests/items.test.js`: with a seeded `createRng`, 1000 rolls below `startScore` → all null; between start and hazardStart → no pepper; above → all three appear at roughly their weights (±10 %); `itemGapY` always inside the gap and pepper never at centre; effects expire exactly at `now + slowMoMs`; `consumeShield` decrements and never goes negative; `difficulty()` unchanged (existing test).
- Verify: `npm test` → all pass, ≥8 new tests. Run the weights test once with `weights.pepper = 0` above `hazardStartScore` to confirm it fails, then restore.
- Commit: `feat(step 4/8): item spawn rules, placement, timed effects`
- Rollback: `git checkout -- . && git clean -fd tests/items.test.js`
- Result:

### Step 5/8 — Placeholder sprites and asset contract for items  [pending]
- Change: `tools/make_placeholders.py` — add `fiber.png` (32×32, green sprig/leaf), `probiotic.png` (32×32, yellow capsule), `pepper.png` (36×36, red chili), PNG-with-alpha, same flat style as `poop.png`. Three rows in `assets/README.md` with redraw notes (centred subject, transparent background, pepper's hitbox is a 14 px circle). `src/scenes/Boot.js` — `this.load.image()` for the three. Generate only the new files (don't regenerate existing art the user may have replaced) and commit the PNGs (each < 5 KB).
- Verify: `npm test` → `assets.test.js` passes (sizes match the table, every `load.image` path exists). `ls -la assets/*.png` shows the three new files; `git status --short` shows no existing PNG modified.
- Commit: `feat(step 5/8): placeholder item sprites and asset contract rows`
- Rollback: `git checkout -- . && git clean -fd assets/fiber.png assets/probiotic.png assets/pepper.png`
- Result:

### Step 6/8 — Wire items into the Play scene  [pending]
- Change: `src/scenes/Play.js` — in `spawnPipePair()`, `rollItem()` and if non-null create a sprite in a new `this.items` physics group (no gravity, immovable, same `setVelocityX` as pipes, destroyed off-screen, `setData('kind', …)`). Overlap handlers: pickup → `effects.apply`, `sfx.pickup()`, destroy sprite, scale-pop tween; pepper → if shield `consumeShield()`, `sfx.shield()`, flash, destroy pepper; else `sfx.hazard()` then `die()` (fart follows). Pipe collision also checks the shield first. `applyDifficulty()` multiplies pipe **and item** velocity by `effects.speedFactor(now)`; a timer re-applies when slow-mo expires. Pause/resume (step 3) must also freeze/unfreeze the slow-mo expiry clock (store remaining ms on pause). HUD: small 🛡 ×n and a shrinking bar for slow-mo under the score. Shield visual: translucent ring on the poop while held. Effects reset on restart (`createEffects()` in `create()`).
- Verify: `npm test` green. **Manual phone checklist:** (a) nothing new appears before score 8 (v1 feel intact); (b) fiber → 🛡 shows, next pipe hit is absorbed with a squelch and play continues; (c) probiotic → pipes visibly slow, bar drains, speed returns and matches `difficulty()` for the current score (no permanent slow-down after the effect); (d) pause during slow-mo, wait 10 s, resume → bar continues from where it stopped; (e) pepper only after score 15, kills on touch with thud + fart, is absorbed when shielded; (f) items scroll at pipe speed and never float free after death; (g) retry → no leftover shield or slow-mo; (h) 20 consecutive gaps: no item ever overlaps a pipe body or leaves the gap.
- Commit: `feat(step 6/8): spawn, collect and collide with items in the Play scene`
- Rollback: `git checkout -- .`
- Result:

### Step 7/8 — Tune and lock the numbers  [pending]
- Change: play ≥10 runs on the phone and adjust only `TUNING.items`, `fartVolume`, `vibrateOnDieMs` and tray alpha. Add `tests/tuning.test.js` with sanity bounds in the spirit of `state.test.js` (`chancePerGap` in 0.1–0.5, `hazardStartScore ≥ startScore`, `slowMoMs` 2–8 s, `slowMoFactor` in 0.4–0.8, every weight ≥ 0 and the sum > 0, `fartVolume` in 0.2–1) so a careless later edit fails loudly.
- Verify: `npm test` green including the new bounds; one more full phone run → fun, not unfair.
- Commit: `chore(step 7/8): tune item rates, slow-mo, fart volume; add tuning bounds`
- Rollback: `git checkout -- . && git clean -fd tests/tuning.test.js`
- Result:

### Step 8/8 — Update project documentation and bump version  [pending]
- Change: `README.md` — "How to play" (items), new "Controls" section (tray: pause, mute, settings; keyboard; haptics Android-only), layout tree (`src/ui/tray.js`, `src/scenes/Settings.js`, `assets/sfx/`, `CREDITS.md`, new tests), "Tuning" (items block), a "Credits" line pointing at `CREDITS.md`, and the convention note that audio files must be credited there. `assets/README.md` — "Sounds" section. `VERSION` → `'0.2.0'` in `src/logic.js`, `package.json` version `0.2.0`. One line in the v1 plan file: "v2 continued in `2026-11-01-flappy-poop-v2.md`". Set this plan's status to `complete` and fill the completion summary.
- Verify: `npm test` green; `grep -n "0.1.0" README.md src/logic.js package.json` → nothing; `grep -n "fiber\|probiotic\|pepper\|tray\|CREDITS" README.md` → each term found; every new file in `src/`, `tests/` and `assets/` appears in the README tree.
- Commit: `docs(step 8/8): README for v2 items, tray, credits; bump to 0.2.0`
- Rollback: `git checkout -- .`
- Result:

## After the plan (not a step — user decides)
Push to `main` → GitHub Pages redeploys; hard-refresh on the phone (or remove and re-add the home-screen app) because the PWA manifest/cache may hold v1.

## Completion summary

Implemented from current `main` (after `490f170`) as 0.2.0. Items diverged from this draft: fiber is +1, bacteria is −2, probiotic is a 5-pipe one-hit shield; no slow-mo or pepper. Art is Michael's drawings via `tools/process_art.py`. The v1 plan file was not edited (AGENTS.md forbids it).

`git log --oneline e6fb084..HEAD` at close:

```
docs(step 8/8): README for v2 items, tray, credits; bump to 0.2.0
57fd58c chore(step 7/8): tune item rates and fart volume; add tuning bounds
f373ccf feat(step 6/8): spawn items, score pickups, dead-poop on crash
a439dc0 feat(step 5/8): crop and contract poop, fiber, and bacteria art
d496c70 feat(step 4/8): item spawn rules, fiber/bacteria scoring, probiotic inventory
4768348 feat(step 3/8): bottom tray (pause/mute/settings), settings overlay with credits, auto-pause, haptics
0816680 feat(step 2/8): Pixabay fart sample on death, CREDITS.md, unified mute, extra blips
2a24ad7 feat(step 1/8): settings store (sound, music, haptics) and vibrate helper
490f170 docs: add AGENTS.md project context and CLAUDE.md pointer
```

Manual-only (not marked tested): phone checklists for steps 2, 3, 6, 7 (audio unlock/mute, tray a–j, items/dead-face a–h, one more full run). Haptics Android-only.

Rollback: `git reset --hard e6fb084` (destroys v2) or revert the step commits newest-first.

## Stop report (only if stopped)
(filled in if a step fails three times)
