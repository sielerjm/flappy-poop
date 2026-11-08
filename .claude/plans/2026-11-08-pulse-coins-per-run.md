# Plan: Still pickups pulse, coins per run (death clears them), coins on Over, coins above beans, fiber 1
- Created: 2026-11-08
- Status: in progress
- Baseline commit: `38a65a8` on `main` (11 ahead of origin, unpushed 0.8.0 work; tree clean apart from Michael's untracked `assets/sfx/ToiletFlush_Win.mp3`)
- Whole-suite verification: `npm test` (baseline 372 / 372) + `npm run smoke` after each scene step (server on port 8000). No source edits while a smoke runs.
- Repo plan copy: `.claude/plans/2026-11-08-pulse-coins-per-run.md` (written in step 1, `git add -f`)

## Context
Michael's six asks after playing the 0.8.0 build (2026-11-08):
1. **Stationary pickups pulse** slightly (size only, hitbox unchanged); anything that bobs or sweeps does not.
2. **Coins collected** on the single-player game-over panel, next to the other counts.
3. **Coins above beans** in the top-left inventory.
4. **Fiber costs 1 coin** in the shop (was 2).
5. **Death and coins**: single-player death resets coins to 0. Clarified (AskUserQuestion): coins only persist across levels within one run; a new game always starts at 0; a win keeps nothing; nothing is saved between runs. This **reverses last turn's saved coins**. Two-player: a crash keeps 90 % of your coins, rounded down (15 → 13, 5 → 4, 1 → 0).
6. **Death resets every power-up** (beans and a super fart ready, probiotic / postbiotic) in both modes; in a match this replaces the old rule that beans and a probiotic survive a crash.

Decisions made here (overrule any at approval):
- "Stationary" = a pickup with no motion data: level 1's fiber, beans and kernel; level 2's gap probiotic and bacteria; level 3's held boxes; a stranded kernel. The pulse is `1 + items.stillPulse.amount · sin(2π · elapsed / periodMs)` on its display scale (amount 0.06, period 1200 ms), clocked by the item's own `elapsed`, which only runs while playing, so it freezes under a pause. The hitbox stays fixed by re-fitting the circle body to the current scale each frame (`scaledCircleBody`, as at spawn; Arcade otherwise grows the body with the sprite).
- The inventory rows stack from the top in the order **coins, beans**: whichever rows are shown take y 156 then 216, so there is never an empty slot (the bean row moves down one row once a coin is held). `TUNING.hudCoin` becomes `hudInventory { y0: 156, pitch: 60, iconX, textX, iconPx, fontPx }`, with a pure `inventoryRows({ coins, beans }, t)`.
- Game over: the pipes line becomes two cells, **pipe ×n | coin ×n** (the coins this run collected: kernels plus box coins, `collected.coin`). The share card is not changed.
- Saved coins removed outright (0.8.0 never shipped, so no save code in the wild carries `c`): `save.js` drops the coin field, merge rule and the `c` key; Play drops `persistCoins` / `savesCoins` and the home-screen balance. The guaranteed kernel, half size and `course.kernelPair` stay.
- Death in single player empties the purse and clears the power-ups as the run ends (the HUD rows go; Over shows what was collected). A match crash (`startRespawn`): `crashCoins(coins, t)` = `floor(coins × versus.crashCoinKeep)` (0.9) and the power-ups cleared (`effects.clearPowerups()`: beans 0, probiotic 0, postbiotic off, any power cancelled). No coin popup; the count drops.
- Folded into the unpushed **0.8.0** notes.

## Steps

### Step 1/3 — Pure: clear power-ups, crash coins, inventory rows, pulse, fiber 1; saved coins out  [done]
- Change: `src/logic.js`: `createEffects().clearPowerups()`, `crashCoins(coins, t)`, `inventoryRows(shown, t)`, `stillPulseScale(elapsed, t)`. `src/config.js`: `shop.prices.fiber: 1`, `versus.crashCoinKeep: 0.9`, `items.stillPulse { amount: 0.06, periodMs: 1200 }`, `hudCoin` → `hudInventory`. `src/save.js`: remove `COINS_MAX`, `coinBalance`, `withCoins`, the coin merge, `c` in `serialize` / `parseV1`. Tests: `tests/items.test.js` (clearPowerups after beans / probiotic / postbiotic), `tests/versus.test.js` (crashCoins 15 → 13, 5 → 4, 1 → 0, 0 → 0), `tests/logic.test.js` or `tests/levels.test.js` (inventoryRows order and stacking), `tests/tuning.test.js` (price, pulse bounds: amount small enough that the pulsed drawing stays clear of neighbours; the inventory rows under the level bar), `tests/save.test.js` (the three coin tests removed).
- Verify: `npm test` green.
- Commit: `feat(logic, step 1/3): power-ups clear on death, a crash keeps 90 % of the coins, inventory rows, the still pulse, fiber 1; coins no longer saved`
- Result: npm test 374 / 374; npm run smoke all 279 checks passed. Scope moved in from step 2 so this commit runs in the browser: Play drops the saved-coin wiring (`persistCoins`, `savesCoins`, the home-screen balance; every run starts at 0) and places the coin and bean rows by `inventoryRows` (`refreshInventory`). `save.js` and its tests restored from before `c7c37c7`. Smoke: the saved-coin checks became per-run ones, fiber costs 1, the stacking check, the coin row over the beans. Commit `ed62694`.

### Step 2/3 — Play and Over  [done]
- Change: `src/scenes/Play.js`: `start()` empties the purse; no saving, no home-screen balance; `die()` (single player) empties the purse and clears the power-ups and their HUDs; `startRespawn()` applies `crashCoins` and clears the power-ups; `refreshInventory()` places the coin and bean rows by `inventoryRows`; `finishItem` (and the bean spawn) record the base scale and logical radius; `update()` pulses still items and still beans and re-fits their bodies. `src/scenes/Over.js`: pipe ×n | coin ×n. Smoke: replace last turn's saved-coin checks (home shows no coins; a new run starts at 0); single-player death with coins, beans and a probiotic → all cleared, Over shows the coins collected; a match crash with 15 coins, beans and a probiotic → 13 coins, none; a still pickup's scale changes over 300 ms while its body width does not, a bobbing one's scale does not; the coin row above the bean row (the old `got.y > got.beanY` flips), stacking when only beans are held; the shop sells fiber for 1.
- Visual check: screenshots of the inventory rows, a level-1 pickup mid-pulse and the Over panel.
- Verify: `npm test`; `npm run smoke` green.
- Commit: `feat(play, step 2/3): still pickups pulse, death clears coins and power-ups, coins above beans and on Over`
- Result: npm test 374 / 374; npm run smoke all 282 checks passed (a still fiber pulses 0.235–0.265 while a bobbing one stays 0.25; the body is re-fitted each frame and reads 95.6–96.5 px between physics steps, exact in the step where collisions run, so the check allows 2 px; single-player death clears 3 coins, a bean and a probiotic and Over counts the coins beside the pipes; a match crash 15 → 13 coins, beans and probiotic gone). One earlier run failed the two-player "same course" check once; it did not reproduce in a fresh-page repro (both halves identical) or the next full run. Screenshots of the inventory (coins over beans) and the Over row look right. Commit `<p2>`.

### Step 3/3 — Docs and 0.8.0 notes  [pending]
- Change: `README.md`, `AGENTS.md`, How to play's coin row and `TRANSLATION_NOTES.md` (coins per run, death, the crash cost, above the beans, fiber 1, the pulse), `.claude/plans/Flappy Poop — Save Code Spec.md` (the `c` row removed), the 0.8.0 What's new notes (en + zh); plan status complete.
- Verify: `npm test`; `grep -n "saved between runs\|stay saved\|persistCoins\|coinBalance\|hudCoin\|fiber 2\|for 2 coins" README.md AGENTS.md src/ tests/ tools/ TRANSLATION_NOTES.md` finds nothing; `npm run smoke` once more on the final tree.
- Commit: `docs(coins, step 3/3): coins per run, death clears them and the power-ups, the still pulse`

## Risks and notes
- Re-fitting a body every frame is cheap for the few still pickups on screen; the smoke checks the body width holds while the scale moves.
- The bean row now moves down when the first coin is taken; fixed slots were the alternative (an empty top slot while only beans are held).
- Feel (pulse size and speed, the death reset, the crash cost) is Michael's hand check.

## Verification
- `npm test` after every step; `npm run smoke` after steps 2 and 3.
- Hand check (Michael): level 1's pickups pulsing and level 2's bobbing ones not; die with coins and beans → next run starts empty; a two-player crash costs coins and power-ups; coins above beans; Over's coin count; fiber for 1 in the shop. Then `npm run push`.

## Completion summary
(filled at the end)
