# Plan: "See today's result" must not let taps through to the home screen underneath
- Created: 2026-11-10 (audited against the code the same day; every claim below was checked with a grep)
- Status: in progress (step 2)
- Baseline: `c87eb49` on `main` (0.11.2, one commit ahead of origin, not pushed).
- Whole-suite verification: `npm test` (473 pass), `npm run smoke` (361, full; read the summary line, never just grep it).
- Repo plan copy: `.claude/plans/2026-11-10-result-view.md` (`git add -f`), archived when done.

## Context
Michael found two bugs on the Daily Dump's "See today's result" screen.
1. Result → tap the score / rank link → a new run starts behind the leaderboard. Closing the board leaves it paused under the result; Home then unpauses it, the poop crashes, and a second game-over appears. Result → Home alone looks fine.
2. Result → tap outside the panel → the two-player join screen appears. Repeating it sometimes leaves a pile of windows: Versus, the 🌞 board, the old result, and two trays (his screenshot).

**Root cause (one bug, two symptoms).** `Play.showDailyResult` opens Over while Play is still on its **ready** screen (`state === 'ready'`).
- **Every tap on Over reaches Play too.** Over is the one panel without an interactive dimmer (by design: a game-over panel shows the dead run behind it). Its only listeners are scene-level `input.on('pointerdown' / 'pointerup')` (`Over.js:154, 168`); there is no interactive game object for Phaser's top-only input to stop at, so Play's own `pointerdown → flap()` runs on the same tap.
- **On a normal game over that is harmless.** Play is `'dead'`, and `flap()` returns at once (`Play.js:967`).
- **On the ready screen it starts a run.**
  - *Score / rank link:* `flap` → `launch()` → a run starts. The leaderboard opening mid-slide pauses it ("an overlay opened mid-slide must not leave the run playing"). Close the board → Over is still up with the run paused under it. Home → `retry` sees the paused run and resumes it instead of going home, so the poop flies with no input, crashes, and a real game-over follows.
  - *Outside the panel:* Over's tap means Home (`scene.stop` Over + `play.scene.restart`). In the same tap, `flap` → `launch()` → with the 👥 toggle on, `scene.start('Versus')`. A restart and a scene switch race each other, and sometimes Over and the board are left behind on top of Versus (the pile in the screenshot).
  - *Home alone:* also launches a run, but the restart wipes it at once. That is why it looked fine, and why the smoke's "Home on today's result" check passed without catching this.
  - *The keyboard (Space / ↑):* Play's own key handler (`Play.js:524`) starts a run the same way.

**Fix, in two layers, two commits.**
- **Step 1: showing a result is a finished state.** `showDailyResult` puts Play in `'dead'`, which is what every other game-over panel sits on. `flap()` then ignores taps and keys exactly as under a normal game over, and Over's "Home works while Play is on its ready screen" special case (`daily.view` → `'start'`, `Over.js:193`) goes away: Home is `'retry'` again. This alone removes both symptoms.
- **Step 2: Over owns its input.** A full-screen interactive zone at the bottom of Over makes Phaser's top-only input stop there, so no tap under any game-over panel ever reaches Play. That guards the whole class (any future state Over might be opened on), not just today's case.

## Steps

### Step 1/2: the result view is a finished screen  [done]
- **Change:**
  - `src/scenes/Play.js` `showDailyResult`: `this.state = 'dead'` before launching Over; drop `view` from the data; the doc comment says why.
  - `src/scenes/Over.js` `retry`: drop the `daily?.view && result.do === 'start'` branch (Home is `'retry'`).
  - What's new 0.11.2 (still unpushed) gains a line (en + zh): "See today's result" no longer starts a run behind it.
- **Smoke (`daily`; run first without the fix to see them fail):**
  1. Played today → popup → See today's result → Play's state is `'dead'` and `launching` is false (the existing "Home on today's result" check now asserts this **before** clicking Home, so it can no longer pass by accident).
  2. A **real click on the score link** → the board opens; Play is still `'dead'`, not launching, no run; Over is still up. Close the board → a **real click on Home** → a fresh ready screen with no second Over.
  3. The same at **1600 × 900 with the 👥 toggle on**: a real click **outside the panel** → a fresh ready screen; Versus never active; Over and the Leaderboard gone. Repeat three times (the pile came on a repeat). Then reset the metrics and the toggle.
  4. A real **Space** on the result → still `'dead'`, Over up, nothing launched.
- **Verify:** `npm test`; `--only=daily`; full smoke (summary line read).
- **Commit:** `fix(daily): "See today's result" is a finished screen, so taps on it start nothing`
- **Result:** the three new daily checks failed without the fix (a paused run behind the board; 1 launch on Space; Versus behind an outside tap, once mid-respawn) and pass with it. The Space check counts `launch()` calls: Over's own Space goes Home and the restart would hide a run.

### Step 2/2: Over stops every tap at itself  [pending]
- **Change:** `src/scenes/Over.js`: a full-field `this.add.zone(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT).setInteractive()` added first (lowest), with a comment: it is the interactive object Phaser's top-only input stops at, so Play never sees a tap under this panel; Over's own scene-level handlers (Home, Share, the links, its tray) are unchanged.
- **Smoke (`death` or `share`, under a normal game over):** count calls to `Play.flap` (wrap the method, then restore it) while a real click lands on Over's panel and one on empty field: 0 calls. Run it first without the zone: it reads 2 (the taps reached Play, harmless only because Play was dead).
- **Verify:** `npm test`; `--only=death,share,daily`; full smoke; the pad's game-over ring checks (`pad`) still pass (the zone is not a ring item).
- **Commit:** `fix(over): the game-over panel is the top of the input stack; nothing under it hears a tap`

## Risks and notes
- `'dead'` on the ready screen: Play's update pins a dead poop to the floor only when it is below the floor line (`Play.js:3238`); the hidden poop sits at its ready spot above it, so nothing moves. Home restarts Play anyway.
- With Play `'dead'`, its own tray is inert under Over (that is the normal game-over behaviour); Over's tray drives the chrome, as it already does.
- The zone sits under everything Over draws. Share's pointerdown / pointerup logic reads `overHit` on scene-level events, which still fire inside Over.
- Push on Michael's word; 0.11.2 then carries the cross-device fix and these two.
