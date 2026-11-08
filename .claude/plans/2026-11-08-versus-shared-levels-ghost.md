# Plan: Versus — levels start together; the ghost anchored to the course
- Created: 2026-11-08
- Status: complete
- Baseline commit: `7d6cfbf` on `main` (5 ahead of origin, unpushed; tree clean apart from Michael's untracked `assets/sfx/Coin_*.mp3`, `ShopOpenClose.mp3`, `ToiletFlush_Win.mp3`, `assets/src/Kernel_0.png`, never staged here)
- Whole-suite verification: `npm test` (baseline 350 pass / 1 fail: `every file under assets/sfx/ is named in CREDITS.md`, from those untracked files, not this plan's) + `npm run smoke` after every scene step (server on port 8000 is up)
- Golden output: n/a
- Repo plan copy: `.claude/plans/2026-11-08-versus-shared-levels-ghost.md` (written in step 1, `git add -f`)

## Context
Two issues from Michael's play test of 0.7.0 (2026-11-08):
1. **Levels are not shared.** The first player over a finish line taps through their level break and runs on into the next level while the other is still finishing. Michael wants the first one to **wait at the line until the other arrives, and both to start the next level at the same moment**. Decisions (AskUserQuestion): once both are at the line, a **shared 3-2-1-GO countdown** (the match-start one) starts both halves; no tap. The waiting half shows a **banner with the poop idling at mid-screen** (the level-break glide and bob, no shade): `LEVEL n · segment` over `Waiting for P2…`.
2. **The ghost comes and goes inconsistently.** Traced (2026-11-08, Explore agent): not a respawn defect. The ghost is placed by `distance` (px scrolled), and `distance` stops meaning "where on the course" after the first fart, crash or skip: a 5-pipe fart scrolls ~2060–2435 px while normal flight covers the same 5 pipes in ~1200–1400 px, and the restart's pre-fill puts the next pair at a fixed lead whatever the distance, so the farter then reads ~650 px (level 3+) to ~1240 px (level 1) ahead of where they are; a respawn adds its 2.9 s of frozen distance plus the pre-fill shift; a skip subtracts ~40 pairs' worth. Nothing ever re-aligns the two, so the error accumulates for the whole match, and at 600 px the ghost's alpha is 0.06 (gone). Decision (AskUserQuestion): **keep the distance-based ghost, but re-anchor `distance` from the course at every pre-fill** (run start, fart end, respawn end, level start, skip), so the ghost sits by the pipes the other player is actually at. Frame-order staleness (P2 reads P1 one frame late, ≤ 5 px normally) is real but not the cause.

Decisions made here, flagged so they can be overruled:
- **Course distance** of a half = the course position of its next uncredited pair (`pipesPassed` pairs in, each pair one `pipeSpacing(levelFor(k))` further) minus how far that pair still is from the poop: `courseDistance(pairsPassed, anchorX, poopX, t)`. With a finish line ahead and no pair, the line stands at the position of pair `levelEnd(level)`. Re-anchoring happens where the field is re-filled, so during a fart the farter's distance still runs ahead (they *are* ahead) and snaps back to the course when the fart ends; the ghost may jump then (≤ ~1 screen). Accepted.
- The shared level start reuses the match-start countdown (`3 · 2 · 1 · GO!`, `countdownMs` per step) after a `levelSyncDelayMs` (600) beat so the second arrival sees the banner and its background fade finishes. The countdown **holds while an overlay is open** (Settings opened from P1's tray during it) and resumes when the overlay closes; the pause key does nothing while both are at the line (nothing is live).
- The level is still bumped at the crossing (the bar's label steps, the +25 lands, the waiter's marker sits at the other's flag), as today.
- A tap on a waiting half no longer ends its break in a match (the countdown does); it still lifts a shared pause. Single player's level break is untouched.
- The final level is unchanged: `win()`, `Made it out!` / `Waiting for P2…`, the result when both are out.
- Version **0.7.1** with its own What's new entry.
- Out of scope: course-position ghosts (a different placement rule), a "ready" tap, bumping the level only at the shared start.

## What the code says (verified 2026-11-08)
- `distance` is written only at `create` / `start()` (0) and in `update()` while `'playing'` (`+= scrollSpeed() · dt`, `Play.js` ~:2261); frozen in `'paused'` (shared pause and level break), `'respawn'`, `'dead'`. `scrollSpeed()` carries `scrollMul` = `fartMul(...)` during a fart (peak from `fartPeakMul`: 1.7–2.6 for 5 pipes, 8.6–12.2 for a super fart). `skipToFinish`, `endPower`, `onFinishCrossed`, `prefillPipes` and the sweep never touch it.
- `prefillPipes()` (`Play.js:1343`): `endSweep()`; returns early (only `distanceSinceSpawn = 0`) when `finishSpawned`; else spawns `prefillPairs(fieldW, poopX, pipeSpacing(level), T, FIELD).xs` (first at `poopX + pipeLead`) up to `levelEnd(level)` and sets `distanceSinceSpawn`. Callers: `start()`, `endLevelBreak()`, `endPower()`, `endRespawn()`. `skipToFinish()` (`:1988`) puts the finish line `pipeLead` ahead (`spawnFinishLine(shift)`), `pipesPassed = pipesSpawned = levelEnd`.
- Pairs are numbered by `pipesSpawned`; the next uncredited pair's index is `pipesPassed` (the top pipe carries `scoring` + `passed`); `pipeSpacing(level, t)` = 487 / 446 / 412 px (level 1 / 2 / 3+); `levelFor(pipesPassed, t).level`; `levelEnd(level, t)`.
- `refreshGhost` (`:2047`) hides unless `match.status` is `'playing'` / `'over'`, places by `ghostPlacement` (range 720, alpha `0.35·(1−|dx|/720)·other.alpha`), fades out only when `other.ended`. `publishSlot` runs every frame in every state (`:2320`), so the respawn is fine.
- Level break: `onFinishCrossed()` (`:603`) bumps `level` (not final), chime, cuts a fart, `+25` in a match, then `win()` / `startLevelBreak()`, then the popup. `startLevelBreak()` (`:648`): `levelBreak = true`, `refreshLevelBanner()`, `pausePlay()`, `fadeBackground()`, gravity off, `breakGlide` → `breakBob`. `endLevelBreak()` (`:676`, inside `resumePlay`): clears the flag, stops the tweens, `finishSpawned = false`, gravity, grace, `centreNextGap`, `applyLevel()`, `prefillPipes()`; `resumePlay` then resumes physics / effects, hides the banner, half-flap bounce, flap sound. `refreshLevelBanner()` (`:624`) writes `levelBannerText` (`'LEVEL {n} · segment'` + `levelContinue`) into `levelTitle` / `levelHint`; `applyLocale` re-runs it. `showEscapedBanner` (`:635`) uses `versusEscaped` / `versusWaiting` (both locales exist).
- Chrome in a match: `chromeState()` (`:923`) returns `'paused'` when `this.levelBreak`; a tap → `chromeIntent` `'resume'` → `applyChrome` (`:991`): `if (this.levelBreak) this.resumePlay(); host.setPaused(false)`. `Versus.setPaused` skips level-break halves; `anyLive()` excludes them; `overlayPause()` pauses when any half is live.
- Countdown (`Versus.js:117–146`): `startCountdown()` sets `status = 'countdown'`, hides join UI, then `tick` every `countdownMs` through `['3','2','1', versusGo]` with `countText` (canvas centre) scaling in and `sfx.score()`, guarded by `sys.isActive()` and `status === 'countdown'`, first tick via `delayedCall(0)`; `go()` sets `'playing'` and `launch()`es both halves. Status `'countdown'` would hide the ghosts and disable the pause, so the level countdown must run under status `'playing'`.
- Scene update order each frame: Versus, then PlayB, then Play (Phaser runs the active list in reverse; Versus is on top), so a Versus-driven resume runs before either half's `update` that frame.
- Smoke section B's break block (`tools/headless_check.mjs:1439–1468`): `bonus`, `brkSettings` / `brkSettings2`, `brk`, `brk2` hold; **`brk3` (P1's tap ends its break into level 2 while P2 stays on 1) contradicts the new rule**. Section C sets `distance` by hand through `place()` and after the respawn (`:1675`), which hides the drift.
- Docs stating the per-half rule: `AGENTS.md` ~:109–111 ("Level breaks stay per half") and the Play / Versus entries; `README.md:51` ("Level breaks are each player's own …"); `TRANSLATION_NOTES.md:44`.

## Design

**Knob** (`src/config.js`, `TUNING.versus`): `levelSyncDelayMs: 600` (ms between the second player reaching the line and the countdown's first tick).

**Pure** (`src/versus.js`):
- `coursePairStart(n, t)` = Σ_{k<n} `pipeSpacing(levelFor(k, t).level, t)` (the course position of pair `n`; 0 for n = 0).
- `courseDistance(pairsPassed, anchorX, poopX, t)` = `coursePairStart(pairsPassed) − (anchorX − poopX)`: what `distance` reads when the next uncredited pair (index `pairsPassed`) is `anchorX − poopX` px ahead. Tests: `−pipeLead` at the run start (pair 0 at `poopX + pipeLead`; the same constant on both halves, so harmless), equal for equal inputs, grows by one spacing per pair, uses each pair's own level spacing across a level boundary, a finish line as pair `levelEnd`.

**Play half** (`src/scenes/Play.js`):
- **Changed in step 1 (execution):** the anchor is the *next pair due to spawn*: index `pipesSpawned`, at `fieldW + pipeWidth + pipeSpacing(level) − distanceSinceSpawn` (one spacing after the last pair, `distanceSinceSpawn` into it). Right after a re-fill that is exactly the re-filled stretch's geometry (its first pair at `poopX + pipeLead`), it has no off-by-one window around a pair that has just cleared the poop, it holds even when the re-fill spawns nothing (the line comes next), and `distance − courseDistance(pipesSpawned, that x)` stays 0 through every later cadence spawn, so the smoke can check it at any moment. With the line out and not crossed: the line, converted to a pair's centre (`line.x + pipeWidth − finishWidthPx / 2`), index `levelEnd(level)`. The paragraph below is the approved first version.
- `rebaseDistance()`: anchor = the finish line when `finishSpawned` and not crossed (pair index `levelEnd(level)`; `level` is the unbumped one in every pre-fill and in `skipToFinish`), else the **lowest-x pipe with `scoring && !passed`** (its index is `pipesPassed` by definition, whether it sits a little behind or ahead of the poop: a pair that has just cleared the poop is credited only in the pipe sweep later in the same `update`, after `endPower`'s pre-fill, so "x > poop.x" would be one spacing off exactly on the fart case), reading `getData('sweep')?.baseX ?? x`; if neither, leave `distance` alone. `this.distance = courseDistance(index, anchorX, this.poopX, T)`. Called at the end of `prefillPipes()` (both branches; `start()` ends in a pre-fill, so no separate call) and in `skipToFinish()` after the line is placed. A common additive constant (the run start's `−pipeLead`) is harmless: only the difference of the two distances is read. Single player gets the same bookkeeping (nothing reads it there).
- **Shared level break.** `onFinishCrossed()` non-final in a match: `startLevelBreak()` as today, then `versusHost().onLevelReached()`. `refreshLevelBanner()` writes the hint as `versusWaiting` with the other's number when `this.match && this.levelBreak` (the flag is set before `startLevelBreak` calls it, and `applyLocale` re-runs it), so no separate banner method. `setPauseBanner` keeps the shade off for a match's level break (`pauseShade` visible only when `!(level && this.match)`), per Michael's "no shade" choice. `setLevelHintVisible(on)` for the countdown.
- `applyChrome` `'resume'`: `if (this.levelBreak && !this.match) this.resumePlay();` then the shared-pause lift as today (a match's break is ended only by Versus).
- `beginLevel()` (called by Versus on GO; not `startLevel`, which is a test-settings field name): `resumePlay()` (which runs `endLevelBreak` → `applyLevel`, `prefillPipes` → `rebaseDistance`), so both halves start in the same frame with the same `distance`.
- `showEscapedBanner()` stays separate: the final level still goes through `win()`.

**Versus** (`src/scenes/Versus.js`):
- `runCountdown(onDone, { status })`: the existing tick loop generalised. The join countdown passes `status: 'countdown'` (unchanged behaviour); the level countdown passes `status: 'playing'`; the tick guard reads the captured `match` object (not `this.match`, so a restarted scene's new match is never consulted) and its status. Each tick, if an overlay is open (`this.scene.get('Play')?.chromeArgs('tap').overlay`), it polls every 100 ms without advancing (the count holds under Settings) and, once the overlay is gone, **re-shows the current step for a full `countdownMs`** before advancing: closing an overlay arms P1's 300 ms resume lockout, and a GO 100 ms later would swallow its first flap.
- `onLevelReached()`: ignore unless `status === 'playing'`; if both halves are in `levelBreak` (and neither has `ended`): hide both hints, `levelCountdown = true`, `delayedCall(levelSyncDelayMs, () => runCountdown(() => this.beginLevel()))`.
- `beginLevel()`: `levelCountdown = false`; `countText` hidden; `for (half of halves()) half.beginLevel()`; then `if (document.hidden) this.setPaused(true)` (a blur during the count pauses nothing, since nothing is live; this catches GO landing on a hidden tab).
- `togglePause()` / `setPaused(true)` need no change (nothing is live while both wait); `rematch()` / `leave()` restart or stop the scene, which drops the timers; the tick's `sys.isActive()` guard covers a stop mid-count.

**Smoke** (`tools/headless_check.mjs`):
- Section B's break block: P1 crosses → `levelBreak`, hint `Waiting for P2…`, `+25` (as now), Settings / Menu / tap interplay (as now); **P1's tap no longer ends its break** (`brk3` inverted: P1 still `'paused'` in the break on level 2, P2 `'playing'` on 1); P2 crosses its line → both in the break, hints hidden, `levelCountdown`; within `levelSyncDelayMs + countdownMs` the count shows `3`; open Settings from P1 → the count holds (same text 1 s later), close → it advances; after GO both `'playing'`, `level === 2`, `levelBreak` false on both, `distance` equal on both (re-anchored), status `'playing'`, ghosts visible on both poops.
- Section C: after P2's respawn assert `P2.distance === courseDistance(P2.pipesPassed, anchor.x, P2.poopX)` (the anchor read from the page: the lowest-x `scoring && !passed` pipe) and, placing **P1 only** at `P2.distance − 100` (P2's re-anchored value is thousands of px from the hand-set 1000), that P1's ghost is back at the placement alpha for that gap; add a fart-drift check: grant P2 a bean through `effects`, `activatePower()`, `until(!powerActive)` with a generous budget (the clip's length), re-pin atomically (gravity returns at `endPower`), then `P2.distance` equals the course value for its new anchor (no 650 px lead).

## Documents to update in the final step
- `AGENTS.md`: the Two players paragraph (level breaks shared: wait, countdown; the ghost's course anchor), the versus.js entry (`coursePairStart` / `courseDistance`), the Play entry (`rebaseDistance`, the `refreshLevelBanner` hint, `beginLevel`, the resume rule, the shade), the Versus entry (`runCountdown`, `onLevelReached`, `beginLevel`, `levelSyncDelayMs`), the knob line, tests / smoke rows.
- `README.md`: the 👥 bullet (level breaks are shared; the ghost by course position).
- `src/changelog.js`: 0.7.1 entry (en + zh); `VERSION` + `package.json`.
- `TRANSLATION_NOTES.md:44`: the Two players rule (levels start together); no new keys (`versusWaiting` reused).

## Risks and notes
- `rebaseDistance` reads the live pipe sprite positions right after the pre-fill: on a wide half the swept-in pairs start `o0` px right of their base (`sweep` tag) and settle later. Use the base (`getData('sweep')?.baseX ?? x`) so the anchor is the settled position.
- The level countdown runs under status `'playing'` so the ghosts and the pause plumbing stay as they are; the only new gate is the tick's overlay hold.
- Both halves resume in one Versus call, so they get the same frame; their `distance` values are then equal by construction (same `pipesPassed`, same pre-fill geometry, same `poopX`).
- Smoke timing: after GO both halves get `resumePlay()` (gravity on, the half-flap bounce), so section B re-pins atomically inside the `until(both playing)` expression; its budget covers `levelSyncDelayMs + 4 · countdownMs` plus the Settings hold.
- Review (Plan agent, 2026-11-08) folded in: the anchor is the first uncredited pair (not "ahead of the poop"), no separate `start()` call, the shade gated off for a match break, a full step after an overlay hold, `beginLevel` naming, the captured match in the tick, the section C re-placement, the hidden-tab GO.
- Phone / pad feel (the 600 ms beat, the count over a level banner) is Michael's hand check.
- Pre-existing failing test (`assets` credits) stays red at every step; not this plan's.

## Steps

### Step 1/4 — Course distance (pure) and the knob  [done]
- Change: `src/versus.js` (`coursePairStart`, `courseDistance`), `src/config.js` (`levelSyncDelayMs`), `tests/versus.test.js` (the cases above + a knob bound).
- Verify: `npm test` green but for the baseline failure.
- Commit: `feat(versus, step 1/4): course distance for the ghost's anchor; level-sync knob`
- Result: npm test 352 / 353 (the baseline's assets failure only). Commit `24bc539`.

### Step 2/4 — Re-anchor distance at every pre-fill  [done]
- Change: `Play.rebaseDistance()`; calls in `prefillPipes` (both branches; this covers `start()`, `endPower`, `endRespawn`, `endLevelBreak`) and `skipToFinish`; `tools/headless_check.mjs` section C (the respawn and fart checks above).
- Verify: `npm test`; `npm run smoke` green.
- Commit: `fix(versus, step 2/4): the ghost reads the course, not the scroll: distance re-anchored at every pre-fill`
- Result: npm test 352 / 353 (baseline failure only); npm run smoke all checks passed, including P2's distance against its real next pair after a respawn and after a fart (within 15 px), and the ghost back at its placement alpha 100 px apart after the respawn. Section C's crash now happens mid-level 2 (no boxes, so no skip can cut the checks short). Commit `48da0b8`.

### Step 3/4 — Levels start together  [done]
- Change: `Play` (`refreshLevelBanner` hint, the shade gate in `setPauseBanner`, `setLevelHintVisible`, `beginLevel`, the `'resume'` rule, `onFinishCrossed` report), `Versus` (`runCountdown`, `onLevelReached`, `beginLevel`), smoke section B's break block.
- Verify: `npm test`; `npm run smoke` green.
- Commit: `feat(versus, step 3/4): the first player at the line waits; both start the next level on a shared countdown`
- Result: npm test 352 / 353 (baseline failure only); npm run smoke all checks passed: P1's tap no longer ends its break (it waits under "Waiting for P2…", no shade), P2's arrival arms the count with both hints hidden, the count shows 3 after the beat, Settings from P1 holds it, closing it costs a full beat, GO starts level 2 on both with equal distances, and each ghost sits on the other's poop. Found and fixed in execution: a pad's B on a waiting half mapped to the pause toggle and paused the other player; in a match B now only lifts a shared pause (checked in the smoke). Commit `bce3339`.

### Step 4/4 — Docs, What's new, 0.7.1  [done]
- Change: `AGENTS.md`, `README.md`, `TRANSLATION_NOTES.md`, `src/changelog.js`, `VERSION` + `package.json`; plan status complete.
- Verify: `grep -n "per half\|each player's own\|continue tap" AGENTS.md README.md` finds nothing stale for the match; `npm test`.
- Commit: `docs(versus, step 4/4): shared level starts, the course-anchored ghost; 0.7.1`
- Result: the grep finds no per-half break or scroll-distance wording for the match (two stale comments, in Play.chromeState and the smoke's section B header, fixed here); npm test 352 / 353 (baseline failure only). Commit `d27ac2d`.

## Verification
- `npm test` after every step; `npm run smoke` after steps 2 and 3.
- Hand check (Michael): reach a finish line first and wait; the other arrives; the count; both start together; a fart then the ghost staying by the right pipes; a respawn with the ghost returning. Then `npm run push` when he decides.

## Completion summary
- Commits on `main` since the baseline `7d6cfbf`: step 1 `24bc539` (course distance, the knob), step 2 `48da0b8` (distance re-anchored at every re-fill), step 3 `bce3339` (levels start together; pad B fix), step 4 `d27ac2d` (docs, 0.7.1). Nothing pushed; `main` is now 9 commits ahead of origin (with the unpushed 0.7.0 work).
- Verified: `npm test` 352 / 353 at every step (the one failure is the baseline's uncredited sfx files, untouched); `npm run smoke` all checks passed after steps 2 and 3.
- Deviation from the approved design: the distance anchor is the next pair due to spawn (exact for the re-filled stretch, no off-by-one window, valid when nothing spawns) instead of the first uncredited pipe; recorded under Design.
- Unverified: the feel on real devices (the 600 ms beat, the count over the banners, the ghost after farts and crashes), the Chinese strings (drafts).
- Roll back: `git revert <hash>` per step, or `git reset --hard 7d6cfbf` to drop all four (discards work).
