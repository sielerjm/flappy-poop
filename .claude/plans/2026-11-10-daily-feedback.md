# Plan: Daily Dump feedback (rank link, popup emoji and copy) + the leaderboard's own-row highlight
- Created: 2026-11-10
- Status: in progress (step 2)
- Baseline: `a2e0c5a` on `main` (pushed; tree clean).
- Whole-suite verification: `npm test` (473 pass), `npm run smoke` (357, full).
- Repo plan copy: `.claude/plans/2026-11-10-daily-feedback.md` (`git add -f`), archived when done.
- **Never commit Michael's user codes** (they carry his secret player id). They are used here only to explain the bug; no test or doc quotes them.

## Context
Michael's feedback after playing 0.11.0:
1. On the daily result, the rank ("#1 of 1") should have a 🏆 to its left, and tapping it should open the Daily Dump leaderboard.
2. The Daily Dump popup should show "🌞 💩 🛌 🔁" under the main text, above the username note / the button.
3. The popup's last sentence becomes: "Compare scores on the 🌞 leaderboard; a new course starts every day at midnight UTC."
4. The 🏆 board highlights both of his rows on mobile (#1 261 🚽 and #5 197) but only #5 on desktop, even after a reload.

**Cause of 4** (read from the code, not a server problem): `Leaderboard.loadBoard` asks the server for the player's rank only for the kinds the *device* has a local best of. It calls `fetchRank(id, false)` only when `bestByToilet(state).off` exists, and `fetchRank(id, true)` only when `.on` does. Both of Michael's codes carry the same player id, but the desktop's local top list has no toilet run, so it never asks for the 🚽 row's rank and leaves #1 unhighlighted. The phone has the 261 🚽 run locally, so it asks for both. It is device data, which is why a reload changes nothing. It is not new in 0.11.0; it shows now because the two devices have drifted apart (a merged player's rows come from all their devices).

**Fix:** a named player always asks for both ranks. `player_rank` returns null for a kind the player has no row of, so this costs one small request and changes nothing for single-kind players. The footer's "not on the board yet" stays keyed on the local best, so it still only speaks for a run this device made.

## Steps

### Step 1/3: the 🏆 board highlights every row of yours, whatever this device has played  [done]
- **Change:** `src/scenes/Leaderboard.js` `loadBoard`: `fetchRank(id, false)` and `fetchRank(id, true)` whenever the player is named (`state.name && state.id`), regardless of the local best. Fix the comment.
- **Smoke (`overlays` or `run`, board stubbed like the daily section):** a named save with only non-toilet local scores; the stubbed `/scores` top includes a 🚽 row; the stubbed `player_rank` answers rank 1 for `p_toilet: true` and 5 for `false`. Both rows render pink, and both `player_rank` calls were made. Run it once **before** the change to see it fail (only rank 5 is pink).
- **Verify:** `npm test`; that smoke section; full smoke.
- **Commit:** `fix(leaderboard): highlight all of the player's rows, not just the kinds this device has played`
- **Result:** the new overlays check failed first (🚽 261 white, only the off-toilet rank asked for), passes after; npm test 473/473; full smoke 358/358.

### Step 2/3: the daily rank reads "🏆 #1 of 1" and opens the 🌞 board  [pending]
- **Change:**
  - `src/i18n.js` `dailyRankText` → `🏆 #{rank} of {total}`. The 🏆 goes in the string catalog (`dailyRank`, en + zh-Hans + notes row), so the share text keeps its own plain wording (`dailyShareRank`, unchanged).
  - The status lines ("Posts when online", "Not saved", …) stay without the 🏆.
  - `src/logic.js` `overButtonsLayout(…, { score: true })` also returns a `rank` box at the coin cell (`cx + 120 + 10`, `cy + 60`; about 240 × trayHitMin, inside the panel); `overHit` returns 'rank'.
  - `src/scenes/Over.js`: 'rank' does what 'score' does (`openDailyBoard`, after the lockout); the rank text is `fitScale`d to its box (a long zh rank stays inside the panel); a ring stop `rank` for the pad.
- **Tests:**
  - `tests/over.test.js`: the rank box is inside the panel and clear of Share, Home and the score box.
  - `tests/daily.test.js`: `dailyRankText` gives "🏆 #3 of 12" / "🏆 第3名 / 共12人", and the share text has no 🏆.
- **Smoke (`daily`):**
  - the stubbed-board check reads "🏆 #4 of 9";
  - a real click on the rank cell opens the board on 🌞 (as the score link does).
- **Screenshots:** the result in en + zh.
- **Commit:** `feat(daily): the result's rank carries a 🏆 and opens the 🌞 board`

### Step 3/3: the popup's emoji line and new copy; 0.11.1  [pending]
- **Change:**
  - `src/scenes/Daily.js`: an emoji line "🌞 💩 🛌 🔁" (about 40 px, no translation: emoji only) between the body and the note, at about `cy + 20`. The note stays at `cy + 100` and the button at `cy + 200`.
  - `dailyBody` (en): "… Compare scores on the 🌞 leaderboard; a new course starts every day at midnight UTC."
  - `dailyBody` (zh-Hans): "…在🌞排行榜上比分数；\n每天UTC午夜换一条新赛道。" (the explicit line breaks stay); TRANSLATION_NOTES row to match.
  - The How to play 🌞 row and the README say "00:00 UTC"; they are left as they are (only the popup's copy was asked for).
  - `VERSION` 0.11.1 with a What's new entry (en + zh): the rank links to the 🌞 board; the 🏆 board marks all your rows on every device; the popup's new line.
- **Tests:** `npm test` (the i18n / notes checks).
- **Smoke:** the popup checks still pass.
- **Screenshots:** the popup in its Create user / Play / result states, en + zh, 720×1280, so the line clears the body and the note.
- **Commit:** `feat(daily): the popup's 🌞 💩 🛌 🔁 line and "midnight UTC"; 0.11.1`
- **Push:** on Michael's word. No schema change.

## Risks and notes
- One extra `player_rank` request per board open for named players; it is a cheap RPC and the board already makes two or three requests.
- The emoji glyphs differ by platform (🛌 renders as a person in bed on Apple / Google); no layout depends on their exact width.
