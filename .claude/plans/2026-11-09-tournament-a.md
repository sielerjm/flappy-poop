# Plan: Tournament mode, Release A (local bracket on one device)
- Created: 2026-11-09 (revised after Michael's critical-audit request the same day)
- Status: in progress (step 2)
- Baseline: `7a589bd` on `main` (0.8.5 pushed), tree clean.
- Whole-suite verification: `npm test` (411 pass); `npm run smoke` (315 checks).
- Source: Michael's `.claude/plans/tournament_mode_bracket_0b9f821f.plan.md`. Release B (the 🏅 medal board, stats, head-to-head rows) gets its own plan once A has been played; the source plan stays in place until then.
- Michael's decisions (9 Nov): shorter races on a **per-level table** 10 / 25 / 35 / 35 / 35 / 35 / 50 (225 pairs); entry from a **button on the 👥 join screen**; **two releases**; tiebreak by **first across the line** (no sudden death in A); lobby and podium as **DOM panels over the join screen**, no new scene.
- Repo plan copy: `.claude/plans/2026-11-09-tournament-a.md` (`git add -f`).

## Context
A same-device tournament: 3–8 players, a World Cup bracket, two at a time through the existing 👥 split screen, a podium for the top three. Players are **linked** (the host pastes their user code; id and name read in memory only) or **guests** (a silly temporary name). Release A posts nothing to the server; linked ids are kept in memory for the race and dropped at Home.

## What the audit changed (and why)
1. **No sudden death.** A draw needs equal score *and* equal crashes; Versus already records who crossed each line first (`claimLevelFinish`, 🏁 counts). Tournament outcome: score → fewer crashes → more 🏁 → first across the final line. Always resolves, ~10 lines, tournament-only (normal 2-player keeps DRAW). Sudden death becomes a later option.
2. **No `Tournament` scene.** Versus relaunches both halves and resizes the canvas on every start; a sibling scene would redo that, draw over a blank canvas and trip the "every scene is wired" test. Instead: lobby, bracket and podium are **DOM panels** (`src/ui/tournamentPanel.js`, the save panel's pattern), and the tournament state lives in the Phaser **registry** (like test mode) so it survives `scene.restart({ match })` between races.
3. **The per-level table is threaded explicitly.** Every level-boundary helper call in Play takes a per-match tuning object, guarded by a source-scan test, so normal play (285) and tournaments (225) cannot drift apart.
4. **Each race re-runs the join screen's device claims** (people swap seats). The left half is always bracket player A.
5. Stated choices: guests get English `AdjectiveNoun###` names in both languages; tournaments exist only where 👥 is offered (wide windows).
6. Smoke runs on every scene-touching step, not only at the end.

## Steps

### Step 1/6 — The bracket, pure (`src/tournament.js`)  [done]
- `createTournament(players, rng)`: 3–8 entries `{ name, playerId|null, guest }`, random seed, byes to 4 or 8; `nextMatch(t)` in queue order (round 1, semis, bronze when N ≥ 4, Final); `recordResult(t, matchId, winnerSide, slots)`; `placings(t)` → gold, silver, bronze (N = 3: the semi loser is bronze); `raceOutcome(slots)` → `{ winner, by: 'score' | 'deaths' | 'levelWins' | 'finalFirst' }` (reuses `matchResult` from `src/versus.js`, then the two new tiebreaks; `finalFirst` is set in step 4).
- `TUNING.tournament`: `minPlayers: 3`, `maxPlayers: 8`, `levelPipes: [10, 25, 35, 35, 35, 35, 50]`.
- Tests (`tests/tournament.test.js`): for N = 3…8 the bracket size, bye count, each player once, match count (N − 1, +1 bronze when N ≥ 4), queue order; placings for N = 3 and N = 4; `raceOutcome` on each tiebreak and never a draw once `finalFirst` is set; a seeded full run for every N ends with three distinct placers; the table sums to 225 and keeps level 1 at 10 (the scripted intro) and level 2 at 25.
- Verify: `npm test`. Commit: `feat(tournament, step 1/6): a pure World Cup bracket for 3–8 players`
- Result: done. `src/tournament.js` (createTournament, matchPlayers, nextMatch, recordResult, isDone, placings, raceOutcome); `TUNING.tournament` { minPlayers, maxPlayers }. Deviation: `levelPipes` moves to step 3, where Play first reads it (the audit fails on an unread knob); its sum test goes there. The five exports the game doesn't call yet are allowlisted in tests/orphans.test.js with "remove in step 4/5" reasons (a stale entry fails the audit). tests/tournament.test.js 9 tests; npm test 420/420.

### Step 2/6 — Guest names and in-memory claims
- `src/tournamentNames.js`: short clean adjectives, silly gut nouns; `rollGuestName(rng, taken)` → `AdjectiveNoun###`, rerolled on a clash.
- In `src/tournament.js`: `claimFromCode(text, players)` runs `importCode` with a **stub storage and `local: empty state`** (it merges and saves by default) → `{ playerId, name }` or `'unrecognised' | 'damaged' | 'duplicate'`; `claimHost(save, players)` for "Use my player" (needs a name; once per tournament).
- Tests: names ≤ 16 code points with a 3-digit tail; no banned stems; deterministic for a seeded rng; a claim never reads or writes the host's storage (spy); a tampered code and a repeated id are refused.
- Verify: `npm test`. Commit: `feat(tournament, step 2/6): guest names and in-memory user-code claims`

### Step 3/6 — Per-match level table
- `src/logic.js`: `withLevelPipes(t, pipes)` (a shallow `T` with `levels.pipes` replaced). `createMatch(seed, { levelPipes, names, tournament })` and `resetMatch` carry the options.
- `Play`: `this.tune = this.match?.levelPipes ? withLevelPipes(T, this.match.levelPipes) : T`, used by every call of `levelEnd` / `levelFor` / `levelPipes` / `levelProgress` / `isFinalLevel` / `testRunStart` / `courseDistance` / `coursePairStart` / `createCourse` (the course's box pacing reads level ends too). Versus's own code has no level-boundary calls.
- Tests: a source scan over `src/scenes/Play.js` (pattern: `tests/scenes.test.js`) that none of those helpers is called with bare `T`; `levelEnd(7, withLevelPipes(T, TUNING.tournament.levelPipes)) === 225` and `levelEnd(7, T) === 285`; the existing versus tests pass unchanged.
- Verify: `npm test`; the **full smoke** (normal and 2-player unchanged); a smoke check in `versus-match` that a match started with the tournament table spawns its level-3 finish line at pair 70.
- Commit: `feat(tournament, step 3/6): a match can run on its own level table`

### Step 4/6 — Names, Continue and the final-line tiebreak in Versus
- `match.names` ([a, b] or null): join labels, the "Waiting for…" / ready hints and the result panel show names instead of P1 / P2 when present (new strings take `{name}`; the P{n} strings stay for plain 2-player).
- `claimLevelFinish` on the final level sets `slot.finalFirst = true`. For `match.tournament` the result panel uses `raceOutcome` (headline "{name} wins!", the tiebreak shown as a small line) and its left button reads **Continue** (`versusContinue`) instead of Rematch; Continue hands the outcome to the tournament flow (step 5) rather than restarting.
- Smoke (`versus-match`): a match created with names shows them on the join screen and the result; a forced equal score and crashes resolves by 🏁 then by `finalFirst`; plain 2-player still says DRAW.
- Verify: `npm test`; `--only=versus-join,versus-match`; the full smoke.
- Commit: `feat(tournament, step 4/6): named halves, Continue, and first-across-the-line in Versus`

### Step 5/6 — Lobby, bracket and podium panels; the join-screen button
- Join screen: a "🏅 Tournament" button (tap, pad ring, Esc/B unchanged) under the hint; hidden once a tournament is running (the join screen then shows the matchup's names and "Round / Semi / Bronze / Final").
- `src/ui/tournamentPanel.js` (DOM, savePanel pattern, game keyboard disabled while open): **Lobby** (player count 3–8; per row Paste code / Guest / Use my player / clear; Start enables when every row is filled; Home); **Bracket** (the list of rounds with results so far, "Next: A vs B", Play, Abandon with a confirm); **Podium** (🥇 🥈 🥉 with names, guests marked; New tournament with the same players and a fresh seed; Home).
- Flow: Start → `createTournament` → registry `tournament` → Versus restarts with `createMatch(seed, { levelPipes, names, tournament: true })` for `nextMatch`; Continue → `recordResult` → the Bracket panel (or the Podium when done). Home / Abandon clears the registry; nothing is saved anywhere.
- Strings in en and zh-Hans with notes rows; the orphan audit sees every knob and string used.
- Smoke (new `tournament` section, wide window): open the lobby from the join screen; a bad code is refused; three rows (guest, a pasted test code, Use my player) enable Start; the first race's join screen shows the two names; `P1.win(); P2.win()` ends it and Continue shows the bracket with the result; the Final the same way; the podium names the right three; New tournament keeps the players; Home clears the registry.
- Verify: `npm test`; `--only=tournament`; the full smoke; lobby / bracket / podium screenshots in en and zh-Hans at 1600 × 900.
- Commit: `feat(tournament, step 5/6): lobby, bracket and podium over the join screen`

### Step 6/6 — Docs and 0.9.0
- AGENTS (`tournament.js`, `tournamentNames.js`, `ui/tournamentPanel.js`, `Play.tune`, the registry key, the smoke section); README (👥 → 🏅: paste / guest / Use my player, wide windows only, nothing saved, and the trust note: a pasted code hands that player's secret id to the host device in memory only); How to play if it lists modes; TRANSLATION_NOTES; `VERSION` 0.9.0 with en + zh-Hans notes. Archive this plan (the source plan stays for Release B).
- Verify: `npm test`; the full smoke; grep for stale P1/P2 wording in tournament paths.
- Commit: `docs(tournament, step 6/6): Tournament mode in AGENTS / README; 0.9.0`. Push on Michael's word.

## Risks and notes
- Step 3 is the one that can break normal play; its source scan and the full smoke are the guard. Step 5 is the largest UI step; if it outgrows one commit, split "button + lobby" from "bracket + podium".
- A reload mid-tournament loses it (registry only). An 8-player bracket is 8 races of 225 pairs.
- Release B notes carried forward: one server-side `submit_tournament(payload)` that validates the bracket and computes medals (not per-player deltas), queued retry when offline, PGlite scenarios, names from `player_name`, head-to-head rows owner-only.
