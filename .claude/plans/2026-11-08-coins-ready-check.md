# Plan: More coins (as extras), a sharper kernel, coins for clearing a level, a two-player ready check, a new tagline
- Created: 2026-11-08
- Status: in progress
- Baseline commit: `6cf72e6` on `main` (2 ahead of origin; tree clean apart from Michael's untracked `assets/sfx/ToiletFlush_Win.mp3`)
- Whole-suite verification: `npm test` (baseline green) + `npm run smoke` after every step (server on port 8000). No source edits while a smoke runs.
- Repo plan copy: `.claude/plans/2026-11-08-coins-ready-check.md` (written in step 1, `git add -f`)

## Context
Michael's asks (2026-11-08):
1. **Twice as many coins from level 2, as extras**: more coins, but never at the expense of fiber, probiotic, bad bacteria or boxes.
2. **A sharper kernel** at the same 48 px size (AskUserQuestion: sharper, not bigger).
3. **Clearing a level pays coins equal to that level's number**, in both modes, to each player whoever finishes first.
4. **+3 coins for a level without a crash** (AskUserQuestion: per level; in single player every cleared level, since a death ends the run).
5. **About tagline**: "The #1 game to play while going #2!" instead of "A gut-themed Flappy Bird clone."
6. **Two-player ready check**: at a level pause both players tap to say they are ready, then the countdown runs; a second tap takes the ready back (to shop again or take a break). AskUserQuestion: a player may mark ready any time in their own pause, before the other arrives.

What the code does today: a coin is one of the item roll's kinds (`rollItem`: fiber 3, probiotic 2, bacteria 4, box 1.5, coin 0.75 within `items.chancePerGap` 0.3), so a coin takes a pair's only pickup slot (about 2 % of pairs). The kernel image is 384 px drawn at 48 px (an 8:1 shrink with no mipmaps, so it aliases). The finish line pays nothing in coins. In a match, once both are at the line and a beat has passed, both read "Tap to continue" and the first tap starts the 3-2-1-GO (`Versus.levelStage` 'arming' → 'tap' → 'count'); an open shop holds the start.

Decisions made here (overrule any at approval):
- **Coins as extras**: the coin leaves `rollItem` (the other kinds get their full shares back). A separate per-pair coin roll from level 2, `course.coin(n)` (own `mixSeed` salt in both modes: the single stream keeps its order, both halves agree), puts a coin in the band slot **only when that slot is empty**: no rolled fiber or box, no bean, no guaranteed kernel. `coin.chance` 0.05 per free slot ≈ 4 % of pairs (double today's ≈ 2 %); gap pickups (probiotic, bacteria) can share a pair with a coin.
- **Sharper kernel**: `assets/coin.png` re-made at 96 px by `tools/process_art.py` (Lanczos from the source, a 2:1 shrink at 48 px instead of 8:1). The in-field kernel sizes by `coin.displayPx` (48) over the frame width; the box reveal draws icons at the pickup size (96 px) by display size rather than a scale that assumed 384 px textures. HUD, shop and Over already size by display size. A side-by-side screenshot (old and new at 48 px) checks the result.
- **Level coins**: `levelClearCoins(level, crashes, t)` = `level × coin.perLevel (1)` + `coin.cleanLevelBonus (3)` when no crash this level. Paid at the finish line (before the break, so the shop can spend it; on the rectum before the win). `crashesThisLevel` counts respawns, reset at each level start. They count toward the run's coins on the game-over panel.
- **Ready check** (two-player only): each half toggles ready with a tap once `levelSyncDelayMs` has passed since **its own** arrival (the arrival flap never counts). Hints: "Tap when ready", then "Ready! Waiting for P2…". While ready, the 💰 pill hides and the shop cannot open (tap again to un-ready and shop). Both ready → the 3-2-1-GO (holding under an overlay as now); a tap from either during the count cancels it and un-readies that player. `Versus.levelStage` 'arming' / 'tap' and the shop-blocking hints are replaced by `readyHalves` and the count. Single player is unchanged.
- **Tagline**: en "The #1 game to play while going #2!", zh "上大号时必玩的头号游戏！" (draft).
- Version **0.8.1** with its own What's new entry (0.8.0 is pushed).

## Steps

### Step 1/4 — Coins as extras; a sharper kernel  [done]
- Change: `src/config.js` `coin`: `chance: 0.05` replaces `weight`, `displayPx: 48` replaces `scale`. `src/logic.js`: `rollItem` without the coin; `createCourse().coin(n)`. `tools/process_art.py`: `process_item(..., size)`, `coin.png` at 96; regenerate (only `assets/coin.png` may change); `assets/README.md` row. `src/scenes/Play.js`: `finishItem` sizes a coin by `displayPx`; `spawnPipePair` adds the coin to an empty band slot from level 2; the reveal sizes icons by display size. Tests: `rollItem` never rolls a coin and its shares match the weights without one; `course.coin` deterministic, the same on two shared courses, the single stream untouched; tuning (`coin.chance`, `displayPx`, radius = displayPx / 2). Smoke: the old "a level-4 pair rolls a coin" check rewritten (a free slot with `course.coin` true carries a bobbing coin; a rolled fiber keeps its slot and no coin appears); kernel checks read `displayPx`; the reveal's coin at 96 px.
- Visual check: old vs new kernel side by side at 48 px.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(coins, step 1/4): coins as extras in empty slots, twice as often; a sharper kernel`
- Result: npm test 375 / 375; npm run smoke all 284 checks passed (an empty level-4 slot takes a bobbing 48 px coin; a fiber keeps its slot; the reveal shows the kernel at 96 px from the 96 px image). The art script regenerated only `assets/coin.png` (96 × 96). The forced-box smoke check had to move its stub (0.85 → 0.95) because the roll's total dropped from 11.25 to 10.5. Side-by-side render at 48 px: the new kernel's outline is smooth where the old one stair-stepped. Commit `<c1>`.

### Step 2/4 — Coins for clearing a level, +3 without a crash  [pending]
- Change: `src/logic.js` `levelClearCoins`; `src/config.js` `coin.perLevel: 1`, `coin.cleanLevelBonus: 3`; `src/scenes/Play.js` `crashesThisLevel` (reset at `start()` / `endLevelBreak()`, +1 in `startRespawn`), `onFinishCrossed` pays `takeCoins(levelClearCoins(levelDone, crashes))`. Tests: 1 → 4, 3 → 6 clean, 3 with a crash → 3. Smoke: single player crosses level 1's line → +4; a match: P1 clean crosses level 1 → +4, P2 crashed once → +1; both paid whoever is first.
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(coins, step 2/4): a level pays its number in coins, +3 without a crash`

### Step 3/4 — Two-player ready check  [pending]
- Change: `src/scenes/Versus.js`: `readyHalves`, arrival times, `onLevelReached(half)`, `onLevelTap(half)` (toggle; both ready → count; a tap during the count cancels it with a token checked by `runCountdown`), `isReady(half)`, `beginLevel` clears; drop 'arming' / 'tap' and `shopOpenElsewhere` / `onShopChanged`'s hint flip. `src/scenes/Play.js`: `refreshLevelBanner` hints, `shopButtonShown` / the power-input shop toggle blocked while ready, `applyChrome` 'resume' passes the half. `src/i18n.js`: `versusTapReady`, `versusReadyWaiting` (en + zh) + `TRANSLATION_NOTES.md`. Smoke: section B's level-break block rewritten (P1 arrives, its beat, "Tap when ready", ready → "Ready! Waiting for P2…" with the 💰 hidden, un-ready → pill back, ready again; P2's arrival flap ignored; P2 ready → the count; P2's tap during the count cancels it and P1 stays ready; P2 ready again → count, Settings hold, GO with equal distances); the shop-holds-the-start check becomes "a shopping player is not ready, so the count waits".
- Verify: `npm test`; `npm run smoke`.
- Commit: `feat(versus, step 3/4): both players tap ready at the level pause; a second tap takes it back`

### Step 4/4 — Tagline, docs, What's new 0.8.1  [pending]
- Change: `aboutTagline` (en + zh) + notes row; `README.md`, `AGENTS.md`, How to play's coin row (more coins from level 2, the level reward and the +3), `src/changelog.js` 0.8.1 (en + zh), `VERSION` + `package.json`; plan status complete.
- Verify: `npm test`; grep for stale wording ("Tap to continue" for a match break, `coin.weight`, `coin.scale`, "gut-themed"); `npm run smoke` on the final tree.
- Commit: `docs(step 4/4): the new tagline, coins and the ready check; 0.8.1`

## Risks and notes
- The extra-coin roll draws only from its own stream, so neither the single-player course nor the shared course moves for anything else.
- Re-running the art script rewrites every asset; only `assets/coin.png` may change (checked with `git status`).
- The ready check changes a flow two smoke blocks depend on (the level break and the shop in a match); both are rewritten in step 3.
- Feel (coin density, level rewards, the ready flow on a tablet) is Michael's hand check.

## Verification
- `npm test` and `npm run smoke` after every step.
- Hand check (Michael): more coins from level 2 without fewer other pickups; the kernel crisper; the coin count rising at each finish line (+3 when clean); in two-player both tapping ready, un-readying to shop, a tap cancelling the count; About's tagline. Then `npm run push`.

## Completion summary
(filled at the end)
