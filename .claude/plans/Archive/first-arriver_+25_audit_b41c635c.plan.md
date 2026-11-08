---
name: First-arriver +25 audit
overview: Gate the two-player +25 level-clear score bonus on first arriver only; keep level coins and match-only +3 clean coins; fix docs that still claim single-player gets +3.
todos:
  - id: claim-first
    content: Add Versus.claimLevelFinish; gate +25 score and popup on first arriver (incl. rectum)
    status: pending
  - id: commit-claim
    content: "Intermediate commit: first-arriver +25"
    status: pending
  - id: tests-smoke
    content: Update smoke (P2 second = no +25; rectum only first gets bonus) + any unit coverage
    status: pending
  - id: commit-tests
    content: "Intermediate commit: tests/smoke for first-only +25"
    status: pending
  - id: docs-sync
    content: "README, AGENTS, changelog 0.8.1, config comments: first +25; +3 match-only"
    status: pending
  - id: final-commit
    content: Final commit after docs; npm test (+ smoke if scenes touched)
    status: pending
isProject: false
---

# First-arriver +25 and finish-bonus congruence

## Verdict (already audited)
- **Bug relative to your intent:** yes — both halves get `+25` today in [`Play.onFinishCrossed`](src/scenes/Play.js) with no first-arriver check.
- **Not a double-award glitch:** original versus design and README treated +25 as “clearing a level,” paid to both.
- **Coins:** leave as current code — level number to whoever crosses; `cleanLevelBonus` (+3) **match-only** when `crashesThisLevel === 0`.
- **Docs drift:** README / 0.8.1 changelog still imply every finish (incl. single player) gets +3; code/smoke pay SP level number only.

## Chosen rules
- **Score +25:** first half to each finish line (including rectum) only; second gets **0** score bonus and **no** `+25` popup.
- **Coins:** unchanged — `level × perLevel` both modes; `+3` clean only in a match.
- **Single player:** no score finish bonus (unchanged); coins = level number only.

## Implementation

### First-claimer (shared hook)
Add `Versus.claimLevelFinish(half)` used from `Play.onFinishCrossed` **before** awarding points (and for the rectum path that never calls `onLevelReached` today):

- If `levelArrivals` is empty for this level cycle → this half is first → return `true`, record arrival (same Map `beginLevel` already clears).
- Else → return `false` (still record arrival / ready-check timing via existing `onLevelReached` for non-final, or claim records both).

Concrete wiring in `onFinishCrossed`:

```js
this.takeCoins(levelClearCoins(done, this.crashesThisLevel, T, { match: Boolean(this.match) }));
let first = false;
if (this.match) {
  first = Boolean(this.versusHost()?.claimLevelFinish?.(this));
  if (first) {
    this.score += T.versus.scoring.levelClearBonus;
    this.scoreText.setText(String(this.score));
    this.refreshProbioticHud();
  }
}
// … win / startLevelBreak …
if (this.match && first) this.showScorePopup('levelClear');
if (this.match && !final) this.versusHost()?.onLevelReached?.(this);
```

Keep `onLevelReached` for ready-check / hint timing; either have `claimLevelFinish` only decide firstness (and still call `onLevelReached` for non-final), or fold arrival recording into claim and make `onLevelReached` a thin wrapper — prefer **claim returns firstness + records arrival once**, `onLevelReached` calls claim if not already recorded, so rectum and mid-level share one path.

Update knobs/comments in [`src/config.js`](src/config.js): `levelClearBonus` = “points for the first player across a finish line.”

**Overlap with in-progress polish plan step 5** ([`.claude/plans/2026-11-08-slot-machine-versus-polish.md`](.claude/plans/2026-11-08-slot-machine-versus-polish.md)): `slot.levelWins` should increment on the same `claimLevelFinish === true`. Implement the claimer here; step 5 only adds the 🏁 counter/UI on top.

### Docs
- [`README.md`](README.md) coins bullet: +3 clean is **two-player only**; versus bullet: **first** across the line earns 25.
- [`AGENTS.md`](AGENTS.md): same.
- [`src/changelog.js`](src/changelog.js) 0.8.1 (still unpushed): clarify match-only +3 and first-arriver +25 (stay within 5 bullets / locale).
- Config / logic JSDoc for `levelClearCoins` already match-only — leave; fix any README contradiction only.

### Tests / smoke
- Unit: if any pure helper is extracted for “first of two arrivals,” cover it in `tests/versus.test.js`; otherwise scene behavior via smoke.
- [`tools/headless_check.mjs`](tools/headless_check.mjs):
  - P1 first at level 1 → still `score + bonus` and `+25` popup.
  - When P2 reaches the same intermediate line second → score **unchanged** by bonus, no `+25` popup; coins still paid.
  - Rectum end block (~1790–1822): today both `5+bonus` and `9+bonus` — change so **only the first out** keeps `+bonus` (P1 first → P2 score stays 9).

## Working-tree note
Uncommitted fart-duration edits (polish step 3) are already in the tree — do not mix them into this plan’s commits; either finish/park that step first, or stage only finish-bonus files.

## Out of scope
- Changing coin amounts, crash penalties, or shop.
- Implementing 🏁 levelWins UI (polish step 5) beyond sharing `claimLevelFinish`.