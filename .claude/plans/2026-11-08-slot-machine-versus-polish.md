# Plan: Shop slot machine, test-mode coins, two-player polish (flush, GO boost, level wins, pulsing prompts), a quicker fart, coin rules, How to play sync
- Created: 2026-11-08
- Status: in progress (approved 2026-11-08)
- Baseline commit: `bde331d` on `main` (7 ahead of origin, unpushed 0.8.1; uncommitted: Michael's How to play / save / feedback English edits in `src/i18n.js`; untracked `assets/sfx/ToiletFlush_Win.mp3`)
- Whole-suite verification: `npm test` (baseline: 1 failure, `tests/howto.test.js`, from those English edits; step 1 fixes it) + `npm run smoke` after every scene step (server on port 8000). No source edits while a smoke runs.
- Repo plan copy: `.claude/plans/2026-11-08-slot-machine-versus-polish.md` (written in step 1, `git add -f`)

## Context
Michael's eight asks (2026-11-08), with two answers (AskUserQuestion):
1. **Shop mystery box as a slot machine**: a small window cycles horizontally through possible rewards like a reel, lands on what the box's odds drew, pauses briefly, then grants it.
2. **Test mode has infinite money** in the shop; leaving test mode clears the coins.
3. **Two-player**: (a) the result panel shows each player's level wins with 🏁 (panel widened); (b) a **toilet flush** when GO appears (`ToiletFlush_Win.mp3`); (c) a **tap right at GO** boosts you two poop-widths forward, with the fart face meanwhile; (d) "Tap when ready" / "Tap to continue" **pulse** with a subtle white glow; (e) once ready, a smaller second line says you can tap again to un-ready. Answer: **the race starts the moment GO appears**, and a tap within ~0.3 s of it earns the boost.
4. **A quicker single-bean fart**: its 5 pipes in ~2.5 s instead of ~4.3 s, the pipe re-emergence unchanged, the super fart unchanged. Answer: the sound keeps its pitch and is **faded out early**.
5. **A postbiotic doubles coins picked up** (kernels in the field), never a box's coins.
6. **The +3 clean-level bonus only in two-player** (a single-player death ends the run).
7. How to play: the iPhone Silent-mode note leaves the top paragraph for **its own row at the bottom with 🔊**.
8. **How to play sync** per `.claude/plans/i18n_howto_sync_1687e16d.plan.md`: Michael's shortened English (Kernels, the short mystery and levels rows, `saveIntro`, `feedbackBody`) is the source; bring zh-Hans and `TRANSLATION_NOTES.md` in line, retarget `tests/howto.test.js`, and review the whole overlay's text for accuracy.

Decisions made here (overrule any at approval):
- **Reel** (shop only; boxes in the field keep their rising reveal): buying a box spends its price, draws on the plain table (a skip resolves to fiber in the break, as now), then a window over the shop panel scrolls a strip of reward icons right to left (fiber, probiotic, postbiotic, bean, bean ×3, kernel ×5 / ×10 / ×15) with an ease-out stop on the drawn one at the centre, a tick per passing icon and a landing sound; it holds `reel.pauseMs`, then grants the reward (`openMystery` without its own reveal) and closes. Edge icons fade out (no hard clip needed). While a reel runs the shop buys nothing; closing the shop or starting the level mid-spin grants the reward at once. Pure helpers: `reelStrip(result, rng, t)` (the strip, the result last) and `reelProgress(elapsed, t)`. Knobs `shop.reel { items: 16, spinMs: 1800, pauseMs: 700, iconPx: 72 }`.
- **Test-mode coins**: in a test run the purse reads ∞ (HUD, 💰 pill, shop line), no row greys for price (a full bag still greys), buying deducts nothing; `setTestMode(false)` empties the purse. Single player only (test mode never runs in a match).
- **Level wins**: the first player across each level's finish line, and the first out of the rectum, gets a level win (`slot.levelWins`); the result panel grows to 820 px wide with a "🏁 ×n" line per player.
- **GO**: the countdown's GO step starts the race at once (both the match start and each level start), plays the flush, and GO stays on screen one beat. **Boost**: the first flap within `versus.startBoost.windowMs` (300) of the start scrolls that half `distancePx` (192 = two 96 px poops) extra over `durationMs` (400) on a sine surge (`boostPeakMul`, like `fartPeakMul`), with the fart face; once per start, cancelled by a fart. The ghost reads the gained distance naturally.
- **Pulse**: the tap prompt (single player "Tap to continue[ · 💰 to shop]", two-player "Tap when ready") breathes (scale 1 → 1.05) under a white glow copy that swells and fades each cycle; "Ready! Waiting for P2…" does not pulse but gets a smaller line under it, en "Tap again to un-ready" / zh "再点一次可取消准备".
- **Fart**: `beans.normalPowerMs` 2500 for a 1–2 bean fart (the peak multiplier refits so 5 pairs still pass); the clip plays from the start and fades out over `beans.normalFadeMs` (250) as the fart ends; a super fart keeps the clip length.
- **Coins**: a picked-up kernel adds `1 × effects.multiplier()` (2 under a postbiotic); box coins, level rewards and the shop are never doubled. `levelClearCoins` pays the +3 only in a match.
- **How to play**: `howToBody` keeps the flap rule only; a new last row `sound` (🔊, en "Sound" / zh "声音") carries the Silent-mode note. Michael's English stays as written; zh rewritten to match (the sync plan's table), notes updated, tests retargeted (no "5 coins"; Kernels / 玉米粒; the short mystery line; the Silent note now in the sound row). The postbiotic row adds that it doubles kernels picked up.
- The flush file is committed and its CREDITS line changes from "not used in the game yet" to what it plays for.
- Folded into the unpushed **0.8.1** notes (at most five bullets per locale).

## Steps

### Step 1/6 — How to play sync and the 🔊 row  [done]
- Change: commit Michael's English edits with zh-Hans to match (sync plan table), `howToBody` without the Silent sentence, the `sound` row (en + zh) and its 🔊 in `HowTo.js` (`EMOJI_ROWS`), `TRANSLATION_NOTES.md` rows, `tests/howto.test.js` + `tests/i18n.test.js` row lists retargeted; review every How to play row en + zh against the game.
- Verify: `npm test` fully green; `npm run smoke` (the How to play overlay opens, scrolls, walks its rows).
- Commit: `docs(howto, step 1/6): the shortened How to play in both languages; the Silent note gets a 🔊 row`
- Result: npm test 377/377; smoke all passed; 🔊 row checked in a screenshot; commit `03ba916`

### Step 2/6 — Coin rules: postbiotic doubles kernels, +3 in two-player only, ∞ in test mode  [done]
- Change: `collectItem` coin × multiplier (the postbiotic How to play row says so, en + zh + notes: moved here from step 1 so each commit's text matches the game); `levelClearCoins(level, crashes, t, { match })`; Play `testCoins()` / `purseLabel()` (∞), `buyBlocker` with an infinite purse, `buyItem` skips the spend, `setTestMode(false)` empties the purse; `coinLabel` shows ∞. Tests: levelClearCoins in and out of a match; buyBlocker with Infinity. Smoke: a kernel under a postbiotic adds 2; a box's coins under a postbiotic stay 10; single player's level 2 pays 2 (no +3); a match keeps +3; a test run shows ∞, buys without spending, exiting test mode empties the purse.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(coins, step 2/6): a postbiotic doubles kernels picked up; +3 only in two-player; infinite coins in test mode`
- Result: npm test 377/377; smoke all passed (kernel ×2 / box 10 under a postbiotic; single-player level 2 pays 2; match +3 kept; ∞ purse and its reset); commit `0a41168`

### Step 3/6 — A quicker single-bean fart  [done]
- Change: `beans.normalPowerMs`, `beans.normalFadeMs`; `activatePower` picks the duration by super / normal, fades the clip out at the end of a normal fart. Tests: tuning (normal shorter than the clip, fade inside it); `fartPeakMul` for 5 pairs in 2.5 s. Smoke: a normal fart passes its 5 pairs in about 2.5 s and ends with the sound faded; a super fart still runs the clip length; the re-fill after it unchanged.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(fart, step 3/6): a single-bean fart crosses its five pipes in about 2.5 s`
- Result: npm test 379/379; smoke all passed on the second run (normal fart 2500 ms, peak ×3.41 on level 3, clip 0.6 → 0.18 mid-fade, cut at the end; super fart 4344 ms). The first run had one two-player ready-check timing failure that did not reproduce. Commit `caf6440`.

### Step 4/6 — The shop's slot machine  [done]
- Change: `src/logic.js` `reelStrip`, `reelProgress`; `src/config.js` `shop.reel`; `src/sound.js` `sfx.tick`; `src/scenes/Play.js` `spinReel` (window, strip, ticks, landing, pause, grant, close), `buyItem('mystery')` through it, purchases blocked while spinning, `closeShop` / `endLevelBreak` finish it at once, `openMystery(draw, x, y, { reveal: false })`. Tests: the strip's length and last item, only grantable rewards in it; `reelProgress` monotone 0 → 1 over spinMs. Smoke: a bought box with the draw stubbed to `coin10` opens the reel, a second buy is refused mid-spin, the reel stops on the kernel ×10, then the purse gains 10 and the window closes; closing the shop mid-spin grants at once.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(shop, step 4/6): a bought mystery box spins a reel that lands on its draw`
- Result: npm test 383/383; smoke all passed on the rerun (reel spins right to left, refuses a second buy, lands centred on the bean, grants after its beat; closing mid-spin grants +10 with the reveal). One run hit the known two-player "same course" flake, not reproduced. Mid-spin screenshot checked. Draw resolved at purchase; the strip itself uses Math.random (cosmetic). `mysteryFace` now shared by the reveal and the reel.

### Step 5/6 — Two-player: GO starts the race with a flush, the GO boost, level wins, pulsing prompts  [pending]
- Change: `Versus.runCountdown` starts at GO (flush there, GO visible one beat); Boot loads `flush` (`ToiletFlush_Win.mp3`, committed; CREDITS line updated); Play `armStartBoost()` (at `launch` in a match and `beginLevel`), the boost in `doFlap` / `update` (`boostPeakMul`, fart face); `slot.levelWins` (first to each line, first out) and the wider result panel with 🏁; Play `setHintPulse()` (scale + glow copy) for tap prompts in both modes, `levelSubHint` under "Ready! Waiting…"; i18n `versusUnreadyHint` (en + zh) + notes. Tests: `boostPeakMul` (the extra distance integrates to `distancePx`); `slotTemplate` levelWins; tuning knobs. Smoke: the match starts at GO (both halves playing while GO shows), the flush plays (sound key requested), a flap within the window boosts (distance gains ≈ 192 px over the other half, fart face during), a late flap does not; level wins counted (P1 first at level 1) and shown on the panel; the prompts pulse (scale moves, glow alpha moves); the sub-hint shows only while ready; the shared-start checks adjusted to GO starting the level.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(versus, step 5/6): GO starts the race with a flush, a tap at GO boosts, level wins on the panel, pulsing prompts`

### Step 6/6 — Docs, 0.8.1 notes  [pending]
- Change: `README.md`, `AGENTS.md`, `assets/README.md` (the flush), `TRANSLATION_NOTES.md`, the 0.8.1 What's new (en + zh, ≤ 5 bullets); plan status complete.
- Verify: `npm test` green; stale-wording grep; `npm run smoke` on the final tree.
- Commit: `docs(step 6/6): slot machine, test-mode coins, two-player polish, the quicker fart; 0.8.1`

## Risks and notes
- Step 1 commits Michael's own English edits as they stand (he asked for the sync); nothing else of his is touched.
- Starting at GO changes the timing of every countdown; the smoke's shared-start checks (GO visible after the start, the elapsed time after Settings closes) move with it.
- The reel runs inside a paused level break: its timers and tweens are created after the pause, so they run (the reveal already relies on this).
- Feel (reel speed, boost size and window, pulse strength, the 2.5 s fart, the fade) is Michael's hand check; all are knobs.

## Verification
- `npm test` and `npm run smoke` after every step.
- Hand check (Michael): buy a box in the shop and watch the reel; a test run's ∞ purse and its reset on exit; a two-player start with the flush and a boost tap at GO; level wins on the result panel; the pulsing prompts and the un-ready line; the quicker single fart; double kernels under a postbiotic; the How to play text in both languages with the 🔊 row. Then `npm run push`.

## Completion summary
(filled at the end)
