# Plan: Versus — split-screen two-player mode

Baseline `66c414d` on `main`, clean; `npm test` 322 pass / 0 fail (moving pipes from level 4 landed after the draft: `rollPipeMove` draws from the run stream too, so the course covers it). Supersedes the draft at
`.claude/plans/2026-11-07-versus-split-screen.md` (copy this file over it in step 1 so the repo keeps
the decision log; that is the only plan file the repo convention wants).

## Context

Flappy Poop is a single-run phone game that already fills a desktop window sideways (the wide field).
Michael wants a local party mode: two portrait playfields side by side, one run each, the same gut
course, both flapping at once. Each player's progress bar should also show where the other player is,
and when the two are close the other poop should appear in your lumen as a faded ghost.

Decisions from Michael (2026-11-07):
- Same course for both: pipes, fiber, bacteria, probiotics and beans identical. Mystery **boxes** sit at the
  same spots; what a box **gives** is rolled per player.
- Level breaks are independent: a player paused at a finish line does not hold the other up.
- The match ends the moment either player dies (or makes it out of the rectum). **Higher score wins**;
  ties go to pipes passed, then to the survivor.
- Versus is never reflected in the leaderboard (nor the best score or the save code).
- Entry: a **👥 toggle under the toilet toggle** on the ready screen (session-only, like 🚽), shown only
  when the window can fit two phone-width halves (landscape and tall enough); hidden otherwise.
- Controls are **claimed on a join screen**: left half is P1, right half P2; the first device to flap takes
  P1, the next distinct device P2; then a 3-2-1 countdown starts both runs together.
- **Catch-up through the mystery box** (added 2026-11-07): a player **25 or more pipes behind** the other
  opens a box into a guaranteed super fart; a player **10 to 24 pipes behind** has double the usual odds
  of a bean draw. "Behind" is the difference in pipes passed when the box opens. Versus only.

Decisions made here, flagged so they can be overruled:
- Any pause input (⏸, P, Esc, a pad's Menu, tab hidden, window blur) pauses **both** halves under one banner;
  a tap or A on either half resumes both.
- After a fart or a skip the course is no longer pair-for-pair identical for that player (one centred gap,
  a distance shift, the skipped pairs gone). Accepted: the ghost and the marker track distance and pairs,
  not pipe identity.
- Both halves make their own sounds (two flaps, two death farts). Accepted for a party mode.
- The 👥 toggle is hidden in test mode; a versus run ignores the test start level.
- Key groups: P1 flaps with W / Space and fires the power with E / Left Shift; P2 flaps with ↑ / Enter and
  fires with Right Shift / Numpad 0. Single player keeps Space, ↑ and B exactly as today.
- Result panel: `P1 WINS!` / `P2 WINS!` / `DRAW`, both scores with level and pipes, **Rematch** (same
  claims, new seed) | **Home** (back to single player at the window's field).
- The guaranteed super fart is delivered as the existing `bean3` draw: the bag is topped up to three
  beans, so a super fart is ready on the next tap of the poop or the bean button (not fired by the box
  itself). A player whose bag is already full already has it, and the draw falls back to fiber as today.
- Boxes exist only from level 3 (the first is guaranteed early in level 3, later ones roll at half
  fiber's rate), so the catch-up cannot act in levels 1 and 2. Flagged, not widened: raising a trailing
  player's box rate would be a follow-up knob.

## What the code does today (verified 2026-11-07)

- `src/scenes/Play.js` is one scene keyed `'Play'`. `create()` treats the whole canvas as the world
  (`this.scale.width`, 11 reads), lays the chrome in `uiColumn()`, binds the pad once (`bindPad` in
  `src/input/pad.js`, actions arrive without a pad index), binds `keydown-SPACE` / `keydown-UP` plus the
  letter keys, and takes every `pointerdown`.
- One `this.rng` stream (`createRng(Date.now())`) feeds pipe gaps, item and bean rolls, bobbing phases,
  the scripted mystery pair, **and** the mystery draw at pickup (`rollMystery` in `collectItem`).
  `rollItem(rng, score, …)` returns nothing below `items.startScore`; `rollBean(rng, score, …, { holding })`
  returns false while a bean is held and consumes no random number then. So one seed does **not** give two
  players the same course: score and bag state change both the rolls and how many numbers each player draws.
  `collectBean` already lets a bean float past a full bag.
- No per-run distance counter exists (`distanceSinceSpawn` resets every spacing); the pre-fill sweep keeps its own.
- `endRun()` records the score and `showOver()` launches `Over`; a test run (`runIsTest`) already skips the
  recording, the pattern a versus run reuses. `win()` is `endRun()` without the death effects.
- `src/main.js` registers scenes as a class array with `activePointers: 1`; `tests/tools.test.js` parses that
  array and treats everything but Boot / Play / Over as an overlay the smoke must open.
- `fieldWidth(innerW / 2, innerH, FIELD)` for an 1800×1000 window is 1152 per half, 2304 in all: the same
  canvas width the wide field already uses for that window, so FIT needs nothing new.
- Each scene has its own `cameras.main` (viewport + per-camera flash / shake) and its own Arcade world.
- `readyLayout()` (`src/logic.js`) stacks title 380, poop 672 (bubble + bob reach y 765), toilet 812 (box
  776–848), Save / Load 967 (top 923), profile 1067; `tests/ready.test.js` pins the last two, the order, every
  box clear of the bubble, and a 60–120 px toilet-to-Save/Load gap. The toilet toggle therefore **stays at
  812** (moving it up by even 12 px overlaps the bubble by 1 px) and 👥 goes at **y 886, 72 tall** (850–922),
  inside the 75 px gap with 1 px of air at each end.
- `startLevelBreak` pauses through `pausePlay`; the continue tap resumes through `chromeIntent` → `'resume'`
  → `applyChrome` → `resumePlay`, which ends the break. `pausePlay` / `resumePlay` guard on state, so repeated
  calls are safe. Each Play registers its own `visibilitychange` and `blur` handlers (both call `autoPause`).
- Phaser draws scenes in launch order; every overlay calls `this.scene.bringToTop()` in its own `create()`.
- `fieldWidth` clamps to `FIELD.maxWidth` (2560) per call, so two halves could reach 5120 px on an ultra-wide
  window without a second clamp.
- `src/ui/toggle.js` is the toilet switch (track, knob, 🚽 emoji); it takes the emoji from `save.js`.

## Design

**Layout.** `versusLayout(innerW, innerH, FIELD)` → `{ halfW, totalW, x: [0, halfW] }`, `halfW =
min(fieldWidth(innerW / 2, innerH), FIELD.maxWidth / 2)` so the canvas never exceeds today's 2560 cap.
Versus sets the game size to `totalW × 1280`, launches two Play
instances with `{ player, match, fieldW: halfW, fieldX }`. In Play every `this.scale.width` becomes
`this.fieldW` (single player: `scale.width`, `fieldX = 0`), `cameras.main.setViewport(fieldX, 0, fieldW,
1280)`, physics bounds likewise, pointer positions read through the camera
(`pointer.positionToCamera(this.cameras.main)`) and rejected outside 0–`fieldW`. Chrome stays in
`uiColumn(fieldW)` per half. Versus draws a divider and the shared banners over the full canvas; after
launching both halves it calls `this.scene.bringToTop()` so it renders above them, and the overlays bring
themselves above it as they do today. `versusAvailable(innerW, innerH, t)`: aspect ≥ 2 × 720 / 1280 and
`innerH ≥ t.versus.minViewportH` (600 css px).

**Scenes.** `Play`'s constructor takes its key (`constructor(key = 'Play')`); `main.js` registers `Play`
(P1 and the single-player scene), `new Play('PlayB')` (P2, launched only by Versus) and `Versus`.
Versus is a state machine `join → countdown → playing → over`. `enter()` (from the start tap with the
toggle on): stop Play, resize, `createMatch`, launch both halves on the join screen. `exit()` (Home):
stop both, `setGameSize(fieldWidth(window))`, start `Play`. Overlays keep working: they centre on
`this.scale.width` (the whole canvas) and talk to `scene.get('Play')`, which stays P1, the chrome owner.
P2 draws no tray, binds no chrome keys and no pad, and shows no ready UI.

**Match state** (`src/versus.js`, pure): `createMatch(seed)` → `{ seed, status, slots: [slot, slot] }`,
slot = `{ device, score, pipesPassed, level, distance, y, angle, frame, alive, ended, won }`. Each Play
writes its slot every playing frame (`publishSlot`) and reads the other's. Passed by reference in the
launch data, never the registry.

**Shared course.** `createCourse(seed, t, { shared })` in `src/logic.js` (pure, tested) becomes the one
place Play asks for randomness during a run: `gapY(n)`, `item(n, ctx)`, `bean(n, ctx)`, `phase(n, slot)`,
`mysteryPair()`. Single player (`shared: false`) wraps today's calls on one stream in today's order, so its
behaviour is unchanged. Shared mode draws every value from a per-pair stream
(`createRng(mix(seed, n))`), feeds `rollItem` / `rollBean` the pair number as the score stand-in instead
of the player's score, ignores `holding` (the bean spawns; a full bag lets it pass) and keeps the
one-bean guarantee per course. The mystery **draw** comes from a separate per-player stream
`this.rngDraw = createRng(Date.now() ^ player)` in versus (and the course stream, as today, in single
player). `this.distance` (px scrolled this run) is the new per-run counter.

**Input.** `claimDevice(match, device)` (pure): device = `{ kind: 'keys', group: 'left' | 'right' }` from
`keyGroup(event.code, t)`, `{ kind: 'pad', index }`, or `{ kind: 'touch', side }`; touch takes its own
half, anything else the first free slot; claimed devices are refused. `bindPad` passes `pad.index` as
a second argument; P1's `onPadAction` forwards a claimed pad's `select` / `power` to the owning Play's
`flap()` / `activatePower()` and keeps `pause` / `mute` / `back` global. Each Play filters keyboard
events by its group's codes and pointers by its half. Join badges: ⌨ W/Space, ⌨ ↑/Enter, 🎮 n, 👆.
Esc / B / Home on the join screen return to single player. `main.js` gets `activePointers: 2`.

**Ghost.** `ghostPlacement(me, other, t)` (pure) → `{ visible, x, y, alpha, angle, frame }`: `x = poopX +
(other.distance − me.distance)`, visible while the other is alive and `|dx| ≤ t.versus.ghostRangePx`,
alpha from `ghostAlpha` (0.35) fading to 0 at the range edge; y, angle and frame copied from the slot
(scared face, stink lines, fart frame included). One `this.ghost` Image per Play at depth 9.5, hidden in
single player. A player in a level break is a ghost holding still at that finish line.

**Catch-up.** `catchUpTier(behind, t)` (pure, `src/versus.js`) → `'super'` when `behind ≥
t.versus.catchUp.superBehind` (25), `'beans'` when `behind ≥ beanBehindMin` (10) and below that, else
null. `catchUpDraws(tier, t)` → the draw table to roll with: unchanged for null; for `'beans'` the
`bean1` and `bean3` chances × `beanOddsMul` (2: bean1 0.4, bean3 0.1, fiber's remainder shrinks to
0.24); for `'super'` a table that is `bean3` with chance 1. `rollMystery(rng, t, draws = t.mystery.draws)`
takes the table as an optional third argument, so single player is untouched. In a versus `collectItem`,
`behind = other.pipesPassed − me.pipesPassed` from the slots, and the draw is
`rollMystery(this.rngDraw, T, catchUpDraws(catchUpTier(behind, T), T))`, then `resolveMystery` and
`openMystery` exactly as today (`bean3` tops the bag up to `maxBeans`). Knobs in `TUNING.versus.catchUp`.

**Rival marker.** `rivalMarker(me, other, t)` (pure) → `{ frac, relation: 'same' | 'ahead' | 'behind' }`:
`levelProgress(other.pipesPassed, me.level)` on the same level, pinned at 1 (the 🏁) a level ahead,
0 behind. `createLevelBar` gains `setRival(marker | null)`: a small faded poop on the track
(`barRivalPx`, `barRivalAlpha`; gold when ahead, grey when behind). Refreshed on pair / level changes.

**Pause and end.** `Versus.setPaused(on)` owns the shared pause and is idempotent: on `true` it calls
`pausePlay()` on each half that is `'playing'` and remembers those in `this.pausedHalves`; on `false` it
calls `resumePlay()` **only on the halves it paused** and clears the set. A half sitting in a level break
is never touched by it, so a shared pause and resume cannot end a break early. Play forwards to it in a
match from `applyChrome`'s `'pause'` case, from `autoPause` (both halves' `visibilitychange` / `blur`
handlers fire, which is why `setPaused` must be idempotent; do not remove P2's handlers), and from
`applyChrome`'s `'resume'` case **only when `this.levelBreak` is false**; a level-break continue stays local
(`resumePlay` → `endLevelBreak`) and never resumes the other half. One shared PAUSED banner in Versus;
each Play's own pause banner is suppressed in a match, the level-break banner is not.
`endRun()` in a versus run records nothing (`runIsVersus`), never launches Over and calls
`Versus.onRunEnded(player, { score, level, pipesPassed, won })`. `onRunEnded` acts once (status `'over'`
guards later reports): it halts the other half with `Play.haltRun()`, which is `endRun()` without the death
effects **and without the report** (factored out of `win()`), and also stops `breakGlide` / `breakBob` in case
that half was mid-break. Versus then waits `deathToOverMs` and shows the result panel (`matchResult(slots)`
pure) with a focus ring (Rematch, Home, P1's tray) and `padTop()` `'versus'` so A / B route to it. Mid-match
window resizes only pause; the field re-fits at Home.

**Ready screen.** `readyLayout` keeps the toilet toggle at y 812 and adds `versus` (y 886, 72 tall, same
240 × track geometry, 👥 emoji) only when called with `{ versus: true }`; `readyHit` returns `'versus'`. A
second `createToggle` with the emoji parameterised (`toggle.js` takes `{ emoji }`, defaulting to 🚽), on the
focus ring beside the toilet toggle. `this.versusOn` in the registry (`'versus'`); `launch()` calls
`Versus.enter()` instead of sliding the poop only when the flag is on **and** `versusAvailable()` is true at
that moment (the window may have shrunk since the toggle was set; the toggle itself is hidden then).

**Out of scope.** Online play, a share card for a match, more than two players, test-mode tools inside a match.

## Files

- New: `src/versus.js`, `src/scenes/Versus.js`, `tests/versus.test.js`.
- Changed: `src/logic.js` (`createCourse`, `versusLayout`, `versusAvailable`, `readyLayout` / `readyHit`,
  `padIntent` `top: 'versus'`, `rollMystery` optional table), `src/config.js` (`TUNING.versus` incl.
  `catchUp: { superBehind: 25, beanBehindMin: 10, beanOddsMul: 2 }`), `src/i18n.js` + `TRANSLATION_NOTES.md`
  (new keys, both locales; numerals and `P1` / `P2` on the allowlist), `src/scenes/Play.js`,
  `src/input/pad.js` (pad index), `src/ui/toggle.js` (emoji), `src/ui/levelBar.js` (`setRival`),
  `src/main.js` (scenes, `activePointers`), `tests/tools.test.js` (filter), `tests/scenes.test.js` (a guard
  that Play never reads `this.scale.width`), `tests/ready.test.js`, `tests/gamepad.test.js`,
  `tests/logic.test.js` (course), `tools/headless_check.mjs` (sections A–C), `README.md`, `AGENTS.md`,
  `src/changelog.js` + `VERSION` 0.6.0 (+ `package.json`).

## Steps (each ends in `npm test` green and a commit)

1. **Pure logic, knobs, strings.** `src/versus.js`, `createCourse` in `logic.js`, `TUNING.versus`
   (`minViewportH`, `keys`, `countdownMs`, `ghostRangePx`, `ghostAlpha`, `ghostFadeMs`, `barRivalPx`,
   `barRivalAlpha`, `dividerPx`), ready layout box + hit, `padIntent` rows, i18n keys + notes.
   Tests: course shared mode is identical for two "players" with different scores and bags and differs
   between seeds; single mode reproduces today's call order (same numbers as a hand-rolled single stream);
   layout halves equal the wide field for 1800×1000; gate rejects portrait and short landscape; claims;
   ghost visible / edge / hidden / dead; marker same / ahead / behind; `matchResult` score, pipes, survivor,
   draw; catch-up tier at 9 / 10 / 24 / 25 behind and when ahead; the doubled table sums to at most 1 with
   bean1 0.4 and bean3 0.1; the super table always rolls `bean3`; `rollMystery` with no table equals today's
   roll on the same numbers; `resolveMystery` of a forced `bean3` with a full bag is still fiber; layout
   halves capped at `FIELD.maxWidth / 2` on a 6000×1000 viewport; ready boxes with the toggle still inside,
   ordered, non-overlapping, clear of the bubble, toilet / Save / Load / profile unmoved, `readyHit` at the
   👥 centre.
   Commit `feat(versus, step 1/6): course generator, match logic, knobs, ready toggle box, strings`.
   Result: done. `npm test` 342 / 342 (20 new in tests/versus.test.js and tests/course.test.js).
2. **Play parametrised, single player unchanged.** Key, launch data, `fieldW` / `fieldX`, viewport,
   camera-space pointer, `this.course` replaces every `this.rng` read, `rngDraw`, `distance`, `publishSlot`,
   `runIsVersus`, `haltRun()`, versus input filters, forwarding hooks, `pad.js` index, `activePointers: 2`,
   the `scale.width` guard test. Verify: `npm test`; `npm start` + `npm run smoke` with **no new sections**
   (the whole existing suite is the single-player regression). Commit
   `refactor(play, step 2/6): a Play instance owns a field strip and asks a course for its randomness`.
   Result: done. `npm test` 343 / 343; `npm run smoke` green with the existing sections only (single player unchanged). Step 1 is `c5a95d8`.
3. **Versus scene: enter, join, countdown, exit; the 👥 toggle.** Register scenes, widen the
   `tools.test.js` filter, toggle on the ready screen (hidden when unavailable or in test mode), `launch()`
   → `enter()`. Smoke section A at 1800×1000: toggle present, absent at 720×1280; toggle on + start →
   canvas `2 × halfW`, both halves on the join screen; dispatched Space claims P1 with its badge, ArrowUp
   claims P2, `padDown(select, 0)` refused; countdown → both `'playing'`; the first three pairs' gap y and
   item kinds equal in both worlds; Versus's scene index is above both Plays; Esc on the join screen →
   single-player `'ready'` at the wide field; with the toggle on, shrink the viewport to 720×1280 → the toggle
   is gone and the start tap launches a single-player run.
   Commit `feat(versus, step 3/6): 👥 toggle, join screen, device claims, countdown, two Play strips`.
   Result: done. The whole Versus scene (pause, end, panel, rematch included) landed here; section A proves the join flow, section B (step 4) the rest. `npm test` 343 / 343; smoke green with section A. Step 2 is `941ef46`.
4. **Shared pause, match end, result panel, rematch.** Smoke section B: Menu pauses both under one banner,
   a tap on the right half resumes both; put P1 in a level break (pin `pipesPassed` to the level end and
   cross the line) and press Menu → P2 `'paused'`, P1 still in its break; tap → P2 `'playing'`, P1 still in
   its break; P1's continue tap ends the break and leaves P2 untouched; pin scores, `getScene('PlayB').die()` → both halted, panel names
   the higher score, `DRAW` on equal score and pipes, survivor on a full tie; no Over, save top list
   unchanged, no leaderboard POST; Rematch → new seed, both `'playing'`; Home → single player. Catch-up:
   pin P2 `pipesPassed` 30 and P1 0, spawn a box in P1's world (`spawnBandItem('mystery')`) and move it onto
   the poop → P1's `effects.beans() === 3` and the reveal shows ×3; pin the gap to 15 and open a box with
   `rngDraw` stubbed to return 0.3 → `bean1` (0.2 + 0.4 covers it), where the plain table would give
   probiotic / fiber.
   Commit `feat(versus, step 4/6): shared pause, match ends on a death, result panel, rematch, catch-up box`.
5. **Ghost and rival marker.** Smoke section C: pinned distances place the ghosts at `poopX ± 300` with
   alpha in `(0, ghostAlpha]`, beyond the range hidden; P2 three pairs into level 1 → P1's marker `0.3`
   `'same'`; P2 on level 2 → `1` `'ahead'`; P2 dead → ghost alpha reaches 0 within `ghostFadeMs`.
   Commit `feat(versus, step 5/6): the other player as a ghost in your lumen; rival marker on the level bar`.
6. **Docs.** README (How to play "Two players", Controls: toggle, join, key groups, pads, touch halves,
   ghost, marker, the catch-up box rules, no leaderboard), AGENTS (map rows, the `fieldW` rule, the new-scene checklist), changelog
   entry + VERSION 0.6.0. Verify by grep: no `scale.width` in Play, every new file named in AGENTS, no stale
   helper names. Commit `docs(versus, step 6/6): two-player mode; 0.6.0`.

## Verification

- `npm test` after every step (≥ 312 + the new tests); `npm run smoke` after steps 2–5, existing sections
  untouched, sections A–C added.
- Hand check (Michael) before `npm run push`: two keyboard groups; keyboard + pad; two pads; iPad landscape
  with two thumbs; a level break on one half while the other flaps; Settings mid-match pauses both; phone
  portrait shows no toggle and plays exactly as before; sound.

## Risks

- Phaser 4.2.1 points to confirm in step 2/3, not assume: a Scene instance with a custom key inside the
  `scene:` array; `positionToCamera` on a viewport camera; both Plays receiving every keyboard event;
  `setGameSize` while two scenes run (both restart right after). Fallbacks: `game.scene.add('PlayB', Play,
  false)` after boot; a Versus-owned `keydown` dispatcher.
- The course refactor touches every random read in `spawnPipePair` / `spawnBandItem` / `spawnGapItem`;
  the single-mode course test plus the untouched smoke are the guard that single player did not move.
- Audit 2026-11-07 folded in: toggle at y 886 (the toilet toggle cannot move up without touching the
  bubble), pause ownership per half so level breaks survive a shared pause, `haltRun` reports nothing and
  stops break tweens, Versus brought to the top after launching the halves, half width capped at
  `maxWidth / 2`, the 👥 flag rechecked at the start tap, both halves' blur handlers kept and `setPaused`
  idempotent.
- Two physics worlds and two tileSprite stacks: fine on a laptop; feel is the hand check's job.
