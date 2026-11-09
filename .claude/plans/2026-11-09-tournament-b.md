# Plan: Tournament mode, Release B (🏅 medal board and head-to-head rows)
- Created: 2026-11-09 (revised the same day after a critical review)
- Status: in progress (step 4)
- Baseline: `9a70e6a` on `main` (Release A plus the join-row fix; 8 commits ahead of origin, not pushed), tree clean.
- Whole-suite verification: `npm test` (430 pass); `npm run smoke` (full; tournament 9, versus 81).
- Source: Michael's `.claude/plans/tournament_mode_bracket_0b9f821f.plan.md` (steps 7–10); archive it with this plan when done.
- Michael's decisions (9 Nov): board ranks **gold first** (🥇, then 🥈, 🥉, best race score); **commit PGlite SQL tests** (devDependency; the game stays dependency-free); head-to-head keeps **linked-vs-linked race rows only** (no full-bracket archive).
- Repo plan copy: `.claude/plans/2026-11-09-tournament-b.md` (`git add -f`).
- **Supabase:** Michael pastes `db/schema.sql` into the SQL editor after step 2 and before any push of steps 3+ (same rule as every schema change).

## Context
Release A plays a whole tournament on one device but saves nothing. Release B sends a finished tournament to the server. Players who joined with a user code (and the host's own player) then collect 🥇 🥈 🥉, a tournament count and a best race score on a new 🏅 board, shown as a second tab of the 🏆 overlay. Each race between two such players also leaves a row Michael can query later for head-to-head analysis. Guests still play and stand on the podium, but nothing about them is sent (not even their names).

## What the review changed
- `by` is a reserved word: the column is `decided_by`.
- No `hostCooldownS` knob (the orphan audit needs every knob read in `src/`); the SQL's 60 s and 3–8 are pinned by literals in the schema test.
- Bracket validation is per round (counts, once per round, the final = the two semi winners, the bronze match = the two semi losers, semi pairing from quarter ids), not just totals.
- Names on the 🏅 board go through `name_blocked`, because a user code can be minted with any name (the HMAC secret is public client JS).
- Receipt first, under an advisory lock, so two concurrent drains cannot double-count; `'duplicate'` is decided before the rate limit.
- The host's id is created when "Use my player" is claimed, and the smoke's "saves nothing" check becomes "the name and top list are untouched".
- The podium's status comes from a `posted` state in the registry, with a rejected state, not from guessing after the sync.
- The 🏆 ⟷ 🏅 pill is a pressable zone in the title row (no vertical cost; the pad's A toggles it), and switching restarts the scene instead of tearing the board down by hand.

## Design
**One server call per tournament, which the server checks.** At the podium the host sends one payload: `submit_tournament(p_host_id text, p_tournament jsonb) returns text` (`'ok'` | `'duplicate'`; errors raise).
- **Payload:** `{ id, levelPipes, players: [{ id | null, name | null }], matches: [{ id, round, a, b, winner, by, slots: [{ score, deaths, levelWins, finalFirst }, …] }] }`.
  - Raced matches only (byes are implied); `slots[0]` is side `a`; match `id` is the bracket id (`quarter0`, `semi1`, `bronze`, `final`).
  - Guests are `{ id: null, name: null }`.
  - `id` is a fresh 22-char id (`newId` from save.js, same regex as player ids). `levelPipes` records the level table the races used, so a later table change doesn't make old bests incomparable.
  - `p_host_id` is the host device's save id (`ensureId`), whether or not the host plays.
- **What the server checks** (`raise exception 'bad tournament: <reason>'`):
  - 3–8 players, every linked id valid and distinct *after alias resolution*, names valid or null;
  - per-round counts from N: quarters = max(0, N − 4), semis = N ≥ 4 ? 2 : 1, bronze = N ≥ 4 ? 1 : 0, final = 1; match ids match their round; each player appears at most once per round; a quarter loser appears nowhere later, a semi loser only in the bronze match;
  - the semi `s` is raced by the winners of quarters 2s / 2s + 1 or by players first seen in that semi (byes), with exactly size − N byes in all; the final is the two semi winners (N = 3: the semi winner and the bye player); the bronze match is the two semi losers;
  - `by` is one of score / deaths / levelWins / finalFirst, scores are 0 … `LEADERBOARD.maxScore`, and each `winner` agrees with its `by` and slots on the same ladder as `raceOutcome`.
- **The server derives the medals itself:** gold and silver from the final, bronze from the bronze match, or with 3 players the lone semi loser.
- **Client and server agree by test:** `tournamentPayload(tour, id)` (pure, `src/tournament.js`) builds the payload; a PGlite test feeds it payloads from simulated tournaments of every size and checks the server's medals against `placings()`.
- **What validation can't stop:** the host holds the pasted ids, so a determined host can still invent a consistent bracket. README states this alongside the existing trust note.
- **Receipt, idempotency, throttling** (in this order inside `submit_tournament`):
  1. `pg_advisory_xact_lock(hashtext(p_host_id))`;
  2. `insert into tournaments … on conflict (id) do nothing`; no row inserted → return `'duplicate'` (so a timed-out post resent within 60 s is a duplicate, not rate limited);
  3. another receipt from this host in the last 60 s → `'rate limited'` (the insert rolls back with the exception);
  4. validate, then write stats and matchups.
  - The client treats `'ok'`, `'duplicate'` and an empty 2xx body as success, keeps the payload on `'rate limited'` or no answer (offline / timeout), and drops it on any other 400 (`'rejected'`).
- **Tables** (RLS on, every privilege revoked from anon / authenticated; RPCs only):
  - `tournaments(id pk, host_id, players int, level_pipes int[], submitted_at)`, index `(host_id, submitted_at)`.
  - `tournament_stats(player_id pk, name, best_score, gold, silver, bronze, events, updated_at)`. Each linked player gets +1 events, their medal, and `best_score = greatest(old, best race score this tournament)`.
  - `tournament_matchups(id bigserial, tournament_id references tournaments, match_id, round, player_a, player_b, winner_id, score_a, score_b, deaths_a, deaths_b, level_wins_a, level_wins_b, decided_by, played_at)`, `check (winner_id in (player_a, player_b))`, no `player_a <> player_b` check (a later merge may make a self-edge; Michael filters it). One row per race where both sides are linked.
- **Names:** at submit, the stats name is the player's latest `scores` name if they have one; else the payload name unless `name_blocked(name_key(name), id)` (someone else owns it on the score board), in which case the existing stats name or `'Player'`. `tournament_board` reads `coalesce(latest scores name, stats.name)` so a 🏆 rename shows at once.
- **Merges:** `fold_player` also folds `tournament_stats` (medals and events summed, best maxed, the kept name per its existing rule) and re-points `player_a`, `player_b`, `winner_id` (one statement) and `tournaments.host_id`.
- **Board RPC:** `tournament_board(p_player_id text default null, p_limit int default 25)` returns `rank, name, best_score, gold, silver, bronze, events, me` ordered gold, silver, bronze, best_score desc, updated_at asc; when the caller has a row outside the top, it is appended with its true rank and `me = true`. No ids leave the server.
- **Client** (network stays in `src/leaderboard.js`, per AGENTS):
  - `submitTournament(payload, hostId)` → `'ok' | 'keep' | 'rejected'`;
  - `fetchTournamentBoard(id)` → rows validated (`validateName`) or `null`;
  - `createTournamentQueue(storage)` on `LEADERBOARD.tournamentsKey` (`flappyPoop.tournaments`), capped at `LEADERBOARD.tournamentQueueMax` 20 (oldest dropped), each entry `{ payload, hostId, state }`; `drain(submit)` posts in order, stops at the first `'keep'`, records each entry's last outcome, and guards against a concurrent drain with a single in-flight promise. `Play.signOut()` leaves it alone (entries carry their own host id).
- **When it sends:** `Play.syncLeaderboard()` drains the queue right after the merges and **before** the "no username" early return (a host who only pastes codes has no name of their own), so a payload posts at the podium, the next game over, the next board open or the next page load.
- **Exactly once, and the status:** when `onRace` records the Final it enqueues (if `linkedCount ≥ 1`) and sets `posted: 'queued'` in the registry state (`'none'` for an all-guest tournament); the drain's outcomes update it to `'sent'` or `'rejected'`. `renderPodium` renders from that state (Saving… / Saved to the 🏅 board / Saved on this device, posts when online / Couldn't save this tournament / No linked players, nothing saved), and New tournament or reopening never enqueue again.
- **The host's id:** claiming "Use my player" calls `ensureId`, so the host's player is always linked; the id is what the game would create at the first sync anyway.

## Steps

### Step 1/6: Payload builder (pure)  [done]
- **Change:** `src/tournament.js`: `tournamentPayload(tour, id, levelPipes)` and `linkedCount(tour)`. Both unused until step 4 → `ALLOWED_EXPORTS` with "remove in step 4" reasons (the Release A precedent).
- **Tests (`tests/tournament.test.js`):** for N = 3…8 and seeded random outcomes the payload has the per-round counts above and no byes; guests are `{ id: null, name: null }`; `slots` carry score / deaths / levelWins / finalFirst in side order; a JS reference `payloadMedals` (in the test file, written from the server rules) equals `placings()`.
- **Verify:** `npm test`.
- **Commit:** `feat(tournament-b, step 1/6): a server-ready payload for a finished tournament`
- Result: done. `tournamentPayload(tour, id, levelPipes = TUNING.tournament.levelPipes)` and `linkedCount` (allowlisted until step 4). Tests: N 3–8 × 15 seeds with realistic raceOutcome results: per-round counts, sides = matchPlayers, each winner agrees with raceOutcome(slots), payloadMedals = placings; guests { id: null, name: null } with no guest name in the JSON. npm test 432/432.

### Step 2/6: Schema and PGlite tests  [done]
- **Change:**
  - `db/schema.sql`: the three tables, `submit_tournament`, `tournament_board`, the `fold_player` additions, grants matching the score functions, the header's object list and the maintenance lines (wipe / cheater now span the new tables); idempotent as now.
  - `package.json`: `devDependencies: { "@electric-sql/pglite": <latest, pinned exactly> }`; **commit `package-lock.json`** (push.mjs ignores untracked files, so a forgotten lockfile would ship silently).
  - `tests/schema.test.js`: creates the `anon` / `authenticated` roles, applies `db/schema.sql` twice (`exec`), calls the RPCs under `set role anon` (`query`), and **fails with "run npm install"** if PGlite is missing. Literals pin 60 s, 3–8 and the score cap to `TUNING` / `LEADERBOARD`.
  - **Scenarios:** every N 3…8 (a distinct host id per N, so the cooldown doesn't trip) gives the medals of `placings()`, events +1, best = max race score; a resend → `duplicate`, nothing changes; a second tournament from one host within 60 s → rate limited, and a timed-out resend within 60 s → `duplicate`; forged payloads rejected: a quarter loser in a semi, a wrong final, a wrong per-round count, a player twice in a round, a score over the cap, a `winner` contradicting its `by`, an unknown `by`, two codes of one merged player, a bad id, a bad host id; guests leave no stats and no matchup; linked-vs-guest → no matchup, linked-vs-linked → one; anon cannot select any of the three tables and `tournament_board` exposes no id; the caller's row below the top comes back with `me`; names: on-scores name wins, a taken name becomes `'Player'`, a 🏆 rename shows on the board; `merge_players` folds medals and re-points matchups (a self-edge allowed); `submit_score` still works after the fold change.
- **Verify:** `npm install && npm test`.
- **Commit:** `feat(tournament-b, step 2/6): tournament stats, matchups and submit_tournament in the schema, with PGlite tests`
- **Handoff:** Michael applies `db/schema.sql` in Supabase; then a read-only live probe calls `tournament_board()` and a `submit_tournament` with a garbage payload (must be rejected).
- Result: done. Schema: `tournaments`, `tournament_stats`, `tournament_matchups` (RLS, all revoked), `submit_tournament` (receipt under a per-host advisory lock → 'duplicate' before the 60 s pace; per-round counts, once per round, semi sides from quarter winners or byes, final from semi winners or the bye, bronze from semi losers, winner = raceOutcome of its slots; medals derived; names via scores / name_blocked / 'Player'), `tournament_board` (gold, silver, bronze, best, earlier first; `me`, the caller appended below the top; limit 1–100), `fold_player` folds stats and re-points matchups and receipts; header and maintenance lines. PL/pgSQL gotcha: a bare CASE inside `IF … THEN` ends the condition at its THEN; parenthesised. PGlite pinned 0.5.12 (26 Oct; 0.5.16 was published today). tests/schema.test.js 10 tests: pins, anon denied, N 3–8 medals = placings, 300 legal brackets accepted, 16 forgeries rejected with no receipt left, duplicate / rate limit, guests, board order and `me`, names, merge fold. npm test 442/442. Step 1 commit `a022b86`.

### Step 3/6: Client API, queue and sync  [done]
- **Change:** `src/leaderboard.js`: `submitTournament`, `fetchTournamentBoard` (allowlisted until step 5), `createTournamentQueue`; `LEADERBOARD.tournamentsKey`, `tournamentQueueMax`; `Play.syncLeaderboard` drains before the name check.
- **Tests (`tests/leaderboard.test.js`, fake fetch):** the RPC path and `p_*` body; `"ok"`, `"duplicate"`, empty body, 400 rate limited, other 400, timeout and `dataApi` '' map to ok / keep / rejected; the queue survives throwing storage, caps at 20 dropping the oldest, keeps order, stops at the first keep, records outcomes, and a concurrent drain reuses the in-flight promise; the storage-key distinctness test gains the new key; board rows are validated.
- **Verify:** `npm test`; full smoke (score sync unchanged).
- **Commit:** `feat(tournament-b, step 3/6): queue and post finished tournaments with the leaderboard sync`
- Result: done. `submitTournament` → 'ok' (ok / duplicate / empty 2xx), 'rejected' only on a 400 saying 'bad tournament' / 'bad host id', else 'keep' (offline, timeout, rate limited, 404 before the schema is applied, 5xx). `fetchTournamentBoard` (rows validated, rank order, `me`). `createTournamentQueue`: entries { payload, hostId }, once per id, oldest dropped past `tournamentQueueMax`; drain state and outcomes shared per storage (WeakMap), so two Play instances or the podium and a game over join one drain. `LEADERBOARD.tournamentsKey` / `tournamentQueueMax`. `syncLeaderboard` drains after the merges and before the no-username return. `fetchTournamentBoard` allowlisted until step 5. npm test 447/447; full smoke 329/329. Step 2 commit `e637cc6`.

### Step 4/6: Podium sends the tournament  [pending]
- **Change:** `tournamentPanel.js`: `ensureId` on "Use my player"; enqueue and `posted` state in `onRace`; the podium status from the state; `onRace` awaits `play.syncLeaderboard()` and re-renders. Strings (en + zh-Hans + notes): the five status lines; `tournamentHowBody`'s last sentence → "Players who joined with their user code get their medals on the 🏅 board; guests aren't saved."; the panel's header comment and the notes' Tournament bullet lose "nothing is saved". Step-1 allowlist entries come off.
- **Smoke (`tournament`):** the "saves nothing" check becomes "name and top list untouched" (the host now gets an id); with `dataApi` '' the podium says "posts when online" and the queue holds one payload with the right medals; with a dummy `dataApi` and the page's `fetch` stubbed to answer 200 `"ok"` for `/rpc/submit_tournament`, a `syncLeaderboard()` empties it and the podium says Saved (then `dataApi` back to ''); an all-guest tournament queues nothing and says so.
- **Verify:** `npm test`; `--only=tournament`; full smoke.
- **Commit:** `feat(tournament-b, step 4/6): the podium posts linked players' medals`

### Step 5/6: 🏆 ⟷ 🏅 switch on the leaderboard overlay  [pending]
- **Change:**
  - `logic.js`: `leaderboardLayout(tab)` (title left in the panel, the pill at the right of the title row, column x's per tab); `createToggle` gains an `objects()` accessor so the pill joins `this.fixed`.
  - `Leaderboard.js`: the pill is a pressable zone (Settings' `handZone` pattern; a tap or the pad's A toggles, down still scrolls, B closes); switching does `scene.restart({ tab, synced: true })` (no sync again, `gen` bumped); the tab is remembered in the registry for the session, default 🏆.
  - 🏅 columns: rank · name (`fitScale`) · `🥇n 🥈n 🥉n` (one text) · best; the player's own `🏎️n` and a below-the-top rank line go in the footer; Loading / offline / empty states as 🏆; footer "Join a tournament with your user code to get on this board" when the player has no row. Emoji-only headers are drawn literally, not catalog keys.
  - Strings (en + zh-Hans + notes). `fetchTournamentBoard`'s allowlist entry comes off.
- **Smoke (`overlays`, muzzled):** the pill flips tabs and the tab is remembered on reopen; offline text on both tabs; the pad's A on the pill flips, down keeps `close` (pad-overlays unchanged); one title only; the remembered tab is reset to 🏆 at the end.
- **Screenshots:** en and zh-Hans at 1600 × 900 and 390 × 844 with fake board rows (16-char names, three-digit counts).
- **Verify:** `npm test`; `--only=overlays,pad`; full smoke.
- **Commit:** `feat(tournament-b, step 5/6): a 🏅 medal board tab on the leaderboard`

### Step 6/6: Docs and 0.10.0  [pending]
- **Change:** AGENTS (the tournament paragraph: posting, queue, board tab; the schema section: tables, RPCs, fold, grants; the file map: `tests/schema.test.js`; the dev-dependency and `npm install` where it now says zero dependencies); README (the board, guests not saved, the forged-bracket limit next to the trust note, `npm install` for tests, the same zero-dependency lines); `db/schema.sql` header; `VERSION` 0.10.0 with a changelog entry en + zh; archive this plan and Michael's source plan.
- **Verify:** `npm test`; full smoke; grep for stale "nothing is saved" / "zero dependencies" wording.
- **Commit:** `docs(tournament-b, step 6/6): medal board in AGENTS / README; 0.10.0`
- Push on Michael's word, only after the schema is live.

## Risks and notes
- **Git can't undo the database.** Everything is additive and re-runnable; `fold_player` is the only function whose behaviour changes, so its PGlite scenarios plus the existing `submit_score` checks are the guard.
- **Schema before client:** if the client shipped first, posts would fail and stay queued; harmless.
- **A new dev dependency:** `npm test` needs `npm install` once per checkout; `push.mjs` runs the tests and will say so.
- **Honest rejections:** two pasted codes that turn out to be one merged player are rejected and the podium says so; resolving that in the lobby (an RPC) is a later option.
- Tournament race scores run on the 225-pair table, so the 🏅 best is not the 🏆 score; the column reads "best race".
