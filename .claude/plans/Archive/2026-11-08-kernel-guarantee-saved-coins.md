# Plan: A guaranteed kernel every level, half-size kernels, saved coins; About reorder
- Created: 2026-11-08
- Status: complete
- Baseline commit: `e51ba77` on `main` (6 ahead of origin: the unpushed 0.8.0 coins-and-shop work; tree clean apart from Michael's untracked `assets/sfx/ToiletFlush_Win.mp3`)
- Whole-suite verification: `npm test` (baseline 366 pass / 1 fail: `every file under assets/sfx/ is named in CREDITS.md`, the untracked toilet flush) + `npm run smoke` after each scene step (server on port 8000 is up). No source edits while a smoke runs (it imports `src/changelog.js` mid-run).
- Repo plan copy: `.claude/plans/2026-11-08-kernel-guarantee-saved-coins.md` (written in step 1, `git add -f`)

## Context
Michael asked me to double-check the coin work against what he wants (2026-11-08). The 0.8.0 build that landed in another session has coins as a random pickup from level 2 (~2 % of pairs), a per-run purse, and a level-break shop. Checked against his requests:

| Request | In 0.8.0? |
|---|---|
| Box odds: probiotic 20, bean 20, postbiotic 5, three beans 5, skip 1, 5 / 10 / 15 coins 10 / 5 / 1, fiber the rest (33) | Yes, exactly (`mystery.draws`); the shop's box rolls the same plain table |
| Coins bob from level 2 | Yes (band item at `items.fiberPeriodMs`) |
| One kernel guaranteed every level | **No** |
| Level 1: after the last pipe, holding still near its gap | **No** (level 1 never has a coin) |
| Kernels drawn at half size | **No** (96 px drawing, 48 px-radius hitbox) |
| Sound credits | Coin pickup / spend / shop already credited with his links; the toilet flush (untracked, unused) is not |

Decisions from Michael (AskUserQuestion, 2026-11-08): **one guaranteed kernel per level plus the random ones**; level 1's just past the last pipe, still; from level 2 at a random pair, bobbing; **coins saved across runs** (device and save code), the shop spending the saved balance; the About reorder (planned earlier) is in.

Decisions made here (overrule any at approval):
- Level 1's kernel sits **just past the last pair's pipe at that pair's gap height** (`coin.firstAfterPipePx` 112 px right of the pipe's centre), still. Pair 9 already carries the tutorial bean halfway to the finish line, so the two never overlap.
- From level 2 the guaranteed kernel takes the band slot (between its pair and the next, bobbing like any coin) of a pair drawn per level from the course (`course.kernelPair(level)`: any pair of the level but the last, from its own `mixSeed(seed, level, salt)` stream in both modes, so the single-player stream's order and its test are untouched, and both halves of a match get it at the same pair). It replaces a rolled fiber or coin for that pair; if the pair carries a box or a bean, it moves to the next pair.
- It stays guaranteed through a crash: if the respawn clears it before it is taken, it comes back with the re-filled stretch (the first pair spawned at or after its pair; with none left in the level, mid-screen one lead ahead). Flown past, farted through (pickups pass through a fart, as now) or skipped by a box's skip, it is gone for that level.
- **Half size**: in-world kernels (guaranteed and random) drawn at half (`coin.scale` 0.5 → 48 px) with a hitbox that is half too (`coin.radius` 24, the whole drawing, the existing rule). The HUD purse icon, the shop's coin and the box's reveal icon keep their sizes.
- **Saved coins**: the save state gains `coins` (whole, ≥ 0, default 0, capped at 99 999). A single-player run starts its purse from it and saves the purse after every change (pickup, box, purchase), so nothing is lost if the tab closes mid-run. Matches and test runs start at 0 and save nothing (the existing "records nothing" rule). The save code carries an optional `c`, written only when coins > 0 (codes of coinless players stay byte-identical: spec rule 5, like `l` / `h`); loading a code keeps the larger of the two balances (loading the same code twice cannot multiply coins). The purse row (kernel ×n) also shows on the home screen while the saved balance is above 0, at its run position.
- Toilet flush: a CREDITS.md line from his link (title / author / date from the Pixabay page if it loads), marked "not used in the game yet"; the file itself stays untracked and unloaded. The credits test goes green.
- The changes fold into the unpushed **0.8.0** notes (no new version).

## Steps

### Step 1/4 — About: links first, credits after, scrolls  [done]
- Change: `src/scenes/About.js`: order ABOUT → Flappy Poop → tagline → How to play → Bug or feature request? → Credits heading + lines → author + LLM note → version → Updated; roomier gaps (tagline → links 56 px, a 64 px gap under the Bug link, credits → author 56, LLM note → version 48) so it runs past the 1000 px panel and scrolls with the thumb like What's new (same scroll view). Ring order unchanged. `tools/headless_check.mjs`: About's down press must now scroll (`offset < 0`); a new check reads the texts' y order and scrolls to the Updated line.
- Visual check: a scratch CDP script screenshots About (top and bottom) at 720 × 1280 and on the wide field; I look at them.
- Verify: `npm test` (baseline failure only); `npm run smoke` green.
- Commit: `feat(about, step 1/4): links first, credits after; About scrolls like What's new`
- Result: npm test 366 / 367 (baseline failure only); npm run smoke all 270 checks passed (the new order check: name 280 < tagline 337 < How to play 422 < Bug 494 < Credits 599 < lines 651 < author 943 < LLM 1008 < version 1081 < Updated 1129; a down press scrolls 64 px). Screenshots at 720 × 1280 and 1800 × 1000, top and bottom, look right. Found: About's in-game credit lines lack the coin / shop sounds (CREDITS.md has them); added in step 4. Commit `95e7c35`.

### Step 2/4 — Pure: the kernel's pair, saved coins in the save and the code  [done]
- Change: `src/logic.js` `createCourse`: `kernelPair(level)` (level 1 → its last pair; later levels uniform over the level's pairs but the last, own stream). `src/save.js`: `coins` in the state (normalize, default, cap), `merge` keeps the larger, `serialize` writes `c` only when > 0, `parseV1` validates it. `src/config.js` `coin`: `scale: 0.5`, `radius: 24`, `firstAfterPipePx: 112`, `max: 99999`. Tests: `tests/course.test.js` (deterministic, in range, same on two shared courses, the single-stream test unchanged), `tests/save.test.js` (old saves read 0, round trip with `c`, a coinless code byte-identical to before, merge max, bad `c` rejected), `tests/tuning.test.js` (the coin knobs).
- Verify: `npm test` (baseline failure only).
- Commit: `feat(coins, step 2/4): the kernel's pair per level; coins in the save and the save code`
- Result: npm test 371 / 372 (baseline failure only). Execution notes: pair numbers are 1-based (`pipesSpawned`), so `kernelPair(1)` is pair 10 and later levels draw over `levelEnd(L−1)+1 … levelEnd(L)−1`; level 1's tutorial bean rides behind pair 9, so nothing else sits past pair 10. `coins` lives in the state only when above 0 (`coinBalance` / `withCoins`; `COINS_MAX` in save.js, which imports no config), so coinless saves and every existing literal-shape test are unchanged. Commit `c7c37c7`.

### Step 3/4 — Play: the guaranteed kernel, half size, the saved purse  [done]
- Change: `src/scenes/Play.js`: arm the level's kernel at `start()` and `endLevelBreak()`; `spawnPipePair` spawns it (level 1 just past the last pipe at its gap, still; later levels in the band slot, deferring past a box or bean), marks it, re-arms it in `clearFieldAhead`, ends it when taken or gone; `finishItem` sizes coins by `coin.scale` / `coin.radius`; the purse starts from `save.coins` in a single-player, non-test run and `persistCoins()` runs after `takeCoins` and a shop purchase; `refreshCoinHud` shows the saved balance on the home screen; a loaded save code (`setSaveState`) refreshes it. Smoke: level 1's kernel after the last pair (x past the pipe, y at its gap, still, 48 px, radius 24), collected into the purse; a level-2+ kernel at `course.kernelPair` (same pair on both halves of a match), bobbing; a crash before it brings it back; the purse saved to localStorage and a new run starting with it; a shop purchase saved; the save code carrying `c` and loading it; a match and a test run saving nothing; the home-screen purse row. Audit the existing coin and shop checks for a carried-over balance (reset `save.coins` where a check expects an empty purse).
- Verify: `npm test`; `npm run smoke` green.
- Commit: `feat(coins, step 3/4): a kernel guaranteed every level, drawn at half size; coins saved across runs`
- Result: npm test 371 / 372 (baseline failure only); npm run smoke all 279 checks passed (level 1's kernel 112 px past pair 10 at its gap, still, 48 px with a 48 px hitbox; taking it saves the purse; level 4's kernel deferred past a bean to the next pair, bobbing; a respawn's clear brings it back; a purchase saves; home shows the saved balance and a loaded balance; the next run starts with it; a match starts empty and saves nothing). Found and fixed in execution: `collectItem` destroys the item before its branches, so the kernel flag is read before `destroy()`; the pickup burst now takes the item's own scale (a half-size kernel's burst was full size). Only the old "home starts a new purse" smoke check encoded the per-run rule; it now checks the saved balance. Screenshots of the home row and a level-1 kernel look right. Also: a later level whose last pair's slot is taken puts its kernel past the last pipe, so it is never dropped. Commit `d274ce0`.

### Step 4/4 — Docs, How to play, credits, 0.8.0 notes  [done]
- Change: the How to play coin row (en + zh: one kernel on every level, level 1 just past the last pipe, more from level 2, boxes 5 / 10 / 15, the shop, saved between runs) + `TRANSLATION_NOTES.md`; `CREDITS.md` toilet flush line; `README.md` and `AGENTS.md` (coins, the kernel rule, saved coins, the save code `c`, About's order); `.claude/plans/Flappy Poop — Save Code Spec.md` (the `c` key); the 0.8.0 What's new notes (en + zh); plan status complete.
- Verify: `npm test` fully green (the credits test included); `npm run smoke` once more on the final tree.
- Commit: `docs(coins, step 4/4): the guaranteed kernel, saved coins, About's order, the toilet flush credit`
- Result: npm test 372 / 372 (the credits test green with the toilet flush line: "Toilet Flush 1" by FreeSounds-4U, Pixabay Content License, 2025-09-08, from the page itself); npm run smoke all 279 checks passed on the final tree. Also added the coin, purchase and shop sounds to About's in-game credits (both locales) and refreshed the stale credit blocks in TRANSLATION_NOTES.md.

## Risks and notes
- Saved coins persist through the smoke's own runs: later checks may start with leftover coins. Step 3 audits and resets where needed.
- The save code is a snapshot: exporting, spending, then importing restores the exported balance. Accepted for a local, unranked currency.
- A guaranteed kernel deferred to the level's last pair still fits (the band slot before the finish line); a pair beyond the level never carries it.
- Feel on devices (the half-size kernel, level 1's spot, the saved balance on the home screen) is Michael's hand check.

## Verification
- `npm test` and `npm run smoke` after steps 1, 3 and 4.
- Hand check (Michael): the level-1 kernel just past the last pipe; one kernel on every later level plus the odd random one; kernels at half size; coins still there after closing and reopening the game; the shop spending them; About's new order and scrolling. Then `npm run push`.

## Completion summary
- Commits on `main` since `e51ba77`: step 1 `95e7c35` (About), step 2 `c7c37c7` (kernel pair, saved coins in the save and code), step 3 `d274ce0` (Play: guaranteed kernel, half size, saved purse), step 4 `e088a0b` (docs, credits, 0.8.0 notes). Nothing pushed; `main` is 10 ahead of origin with the unpushed 0.8.0 work.
- Verified: `npm test` green at every step (fully green after step 4); `npm run smoke` all checks after steps 1, 3 and 4; screenshots of About, the home purse row and a level-1 kernel.
- Unverified: feel on devices (kernel size, level 1's spot, the saved balance), the Chinese strings (drafts).
- Roll back: `git revert <hash>` per step, or `git reset --hard e51ba77` (discards work).
