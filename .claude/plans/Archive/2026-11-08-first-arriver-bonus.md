# Plan: Only the first player over each finish line earns the +25 (two-player); 0.8.2
- Created: 2026-11-08
- Status: complete
- Source: Michael's audit `.claude/plans/first-arriver_+25_audit_b41c635c.plan.md`. Its verdict and rules are kept. Its notes on 0.8.1 being unpushed, the uncommitted fart edits and polish step 5 are out of date: all of that has shipped.
- Baseline: `e0df7f8` on `main`, tree clean. The gate is met: the test-audit plan is complete, archived and pushed (`2907c06`..`e0df7f8`).
  - That audit changed no file this plan touches except README's dev section.
  - `Play.onFinishCrossed`, `Versus.onLevelReached` / `onRunEnded`, `versus.scoring` and VERSION 0.8.1 are as drafted.
- Whole-suite verification, per AGENTS' new "When to run what":
  - `npm test` before every commit. It now includes the orphan audit (`tests/orphans.test.js`); this plan adds no export, knob, string or texture, so nothing to allowlist.
  - Iterate with `npm run smoke -- --only=versus-match`; the two-player bonus checks all sit in that section, which runs alone.
  - The full `npm run smoke` before each commit that touches a scene (server on :8000).
- Repo plan copy: `.claude/plans/2026-11-08-first-arriver-bonus.md` (`git add -f`, the folder is gitignored), moved into `.claude/plans/Archive/` when complete. Michael's source plan moves into `Archive/` in step 1 (`git add -f`), as the audit did with the other generated plans.

## Context
In a match both halves get `versus.scoring.levelClearBonus` (+25) at every finish line (`Play.onFinishCrossed`, no first-arriver check). Michael wants it to be a race reward: **only the first half over each line, the rectum's included, gets +25 and its popup**; the second gets no score bonus and no popup. Level coins stay as they are (the level's number to whoever crosses; the +3 clean bonus match-only, already true since 0.8.1). Single player is unchanged (no score bonus at a line).

Level wins (🏁) already count "first over each line, and first out" in two places (`Versus.onLevelReached` and `Versus.onRunEnded`). The +25 should follow the same decision, so the decision moves into one claimer.

## Steps

### Step 1/2 — One first-claimer decides the +25 and the 🏁  [done]
- Change:
  - `src/scenes/Versus.js`: add `claimLevelFinish(half)`.
    - A `levelFirst` field (half index or null) is set in `create` and cleared in `beginLevel`. The rectum level starts through `beginLevel` too, so it is covered.
    - The first claimer of the current level sets `levelFirst`, gets `slot.levelWins += 1`, and the call returns true.
    - Any later claim returns false.
    - Remove the two existing `levelWins` increments (the `levelArrivals` test in `onLevelReached`, the first-ended test in `onRunEnded`). `levelArrivals` stays for the arrival stamp only.
  - `src/scenes/Play.js` `onFinishCrossed`:
    - In a match, call `const first = Boolean(this.versusHost()?.claimLevelFinish?.(this))` before `win()` / `startLevelBreak()`.
    - Add `levelClearBonus` and show `showScorePopup('levelClear')` only when `first`. Coins and `onLevelReached` are unchanged.
    - The score must move before `win()`, so `endRun` publishes it to the slot.
  - `src/config.js`: the `levelClearBonus` comment becomes "points for the first player over a finish line (the rectum's too); the second gets none".
- Smoke (`tools/headless_check.mjs`, all inside `section('versus-match')`, ~1733–2064): the bonus check is at ~1801, the rectum checks at ~1981 / 2010 / 2013, the headlines at ~2050 / 2053:
  - P1 first at level 1: unchanged, score 3 → 28 with the +25 popup.
  - P2 reaching the same line second (new check, beside "P2 crosses its finish line into its break" at ~1867): read P2's score and coins just before its line is placed. After the crossing its score is unchanged by the line and no "+25" popup shows, but its coins are still paid (1 + 3).
  - Rectum, P1 first out: still `5 + bonus`. P2 out second: `ended.scores[1]` is **9** (was 9 + bonus).
  - The result panel now reads **P1 WINS!** with 30 and 9. 🏁 is still P1 ×2 / P2 ×0.
  - Rematch headlines: `headline(scoreA, scoreB, …)` finishes P1 first, then P2, so P1 now takes the +25. To keep the tie-break and draw cases testing equal points, call `headline(9, 9 + want.bonus, …)` (both totals 34).
- Verify: `npm test` (incl. the orphan audit); `npm run smoke -- --only=versus-match` while iterating; then the full `npm run smoke`. The new P2-second check must fail on the old `onFinishCrossed`: try it once with the gate removed, then restore.
- Commit: `feat(versus, step 1/2): only the first over each finish line earns the +25; one claimer for it and the 🏁`
- Result: npm test 399/399 (orphan audit included); `--only=versus-match` 61 checks pass; with the old `onFinishCrossed` the new check fails (P2 1 → 26) along with four others; full smoke 305/305.

### Step 2/2 — Docs and 0.8.2  [done]
- Change:
  - `src/logic.js`: `VERSION` '0.8.2'. `src/changelog.js` gets a new 0.8.2 entry (today's date) with one bullet per locale:
    - en: "Two players: only the first one over each finish line (the rectum's too) earns the 25 points; the second still gets the level's coins."
    - zh: "双人模式：只有最先越过每条终点线（包括直肠）的玩家才能得到 25 分；后到的玩家仍能拿到本关的金币。"
  - `README.md` two-player bullet: "Clearing a level earns 25 points" → the first over each line earns 25.
  - `AGENTS.md` (find these by content; line numbers moved in the audit):
    - the scoring paragraph ("Clearing a level earns `versus.scoring.levelClearBonus`");
    - the config map line (`levelClearBonus`);
    - Play's `onFinishCrossed` line ("adds levelClearBonus");
    - Versus' ready-check lines (add `claimLevelFinish` / `levelFirst`; levelWins now comes from it);
    - the smoke summary ("+25 and its popup" for the first, none for the second).
  - Plan copy: `Status: complete`, moved into `.claude/plans/Archive/`.
  - Older changelog entries (0.7.x "clearing a level earns 25") are history: leave them.
- Verify: `npm test` (changelog test: first entry = VERSION; orphan audit). `grep -n "Clearing a level earns\|earns 25 points"` over README / AGENTS / TRANSLATION_NOTES finds no current-behaviour claim. `npm run smoke -- --only=versus-match` (docs only touch no scene, so the full run from step 1 stands).
- Commit: `docs(step 2/2): first-over-the-line +25 in README and AGENTS; 0.8.2`
- Result: VERSION 0.8.2 with one What's new bullet per locale; README and AGENTS (scoring paragraph, config map, onFinishCrossed, claimLevelFinish, smoke summary) updated; the stale-claim grep is clean; npm test 399/399; `--only=versus-match` passes. Step 1 commit `823fd2d`.
- Push only when Michael asks (`npm run push`).

## Risks and notes
- The rectum: P1 can be out (won, `endRun`) while P2 is still on the last level; P2's later `claimLevelFinish` returns false because `levelFirst` was set by P1 in the same level cycle. Both crossing in one frame: update order (Versus, PlayB, Play) makes P2 first; acceptable.
- The +25 now swings matches more (a race to each line is worth 25). That is the intent; crash penalties are unchanged.
- Out of scope: coin amounts, crash penalties, the shop, catch-up odds.

## Verification (end to end)
- `npm test`, full `npm run smoke`.
- Hand check (Michael): a two-player match where one player reaches a line first. Only that player's score jumps by 25 (gold +25). The other's score holds when they arrive, and the result panel's 🏁 matches who got there first.

## Completion summary
Commits since `e0df7f8`: `823fd2d` (the first-claimer and the +25 gate, smoke updated), then the step 2 docs / 0.8.2 commit. Full smoke 305/305 after step 1; the new second-arrival check fails on the old code. Not pushed. Roll back with `git revert` per commit.
