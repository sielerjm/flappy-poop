# Plan: Daily Dump mode (audited revision of `daily_dump_mode_f097792f.plan.md`)
- Created: 2026-11-10 (an audit of Michael's draft against the code)
- Status: in progress (step 3)
- Baseline: `2690200` on `main` (pushed; tree clean).
- Whole-suite verification: `npm test` (449 pass), `npm run smoke` (337, full).
- On approval, this revision replaces the draft at `.claude/plans/daily_dump_mode_f097792f.plan.md`. Repo copy: `.claude/plans/2026-11-10-daily-dump.md` (`git add -f`, only that file).
- **Michael's decisions (10 Nov):**
  - The difficulty is **one level, 3–7, fixed for the whole run**, as drafted.
  - The daily panel gets **Share + Home**.
- **Kept from the draft:**
  - UTC day.
  - One attempt per day.
  - A username is required.
  - Endless: no finish lines, level breaks or win.
  - No coins and no shop.
  - Daily posts never touch the 🏆 board.
  - Toilet and 👥 are off for this mode.
  - A 🌞 at the top centre of the ready screen.
  - A third leaderboard tab.
  - A `daily_scores` table.
- **Michael's addition (10 Nov):** the 🌞 opens a **Daily Dump popup**: a short explanation and one button.
  - **Create user** when there is no username; it opens the save panel.
  - **Play** when the player has a name.
  - ✕ / Esc / a tap outside the popup goes back to the home screen.
- **Second audit (10 Nov, after the popup was added)** found four more holes, folded in below:
  - a reload or Settings → Reload game mid-run would give the attempt back, so the attempt is now claimed at the start and the score is saved as it grows;
  - the rank on the result panel had no fetch path, and the share card was built before the rank could exist;
  - a server-side copy of the level hash needs a hash that is easy in both JS and PL/pgSQL, so it is FNV-1a, not mulberry32;
  - a three-stop pill with a knob would hide its middle glyph, so the tabs are a new small widget.
- **Supabase:** Michael pastes `db/schema.sql` after step 3 and before any push of steps 4+.

## Context
Daily Dump is a Wordle-style daily challenge:
- Once per UTC day, every player flies the same date-seeded endless course at one level of difficulty.
- One crash ends the attempt.
- Players compare scores on a daily board and share their result.

## What the audit changed (draft → this plan)
1. **Mystery boxes would crash a single-player shared course.**
   - `rollMystery(this.match ? this.rngDraw : this.course.rng)` (Play ~2307, ~2404) gets `null`, because a shared course has no `course.rng`.
   - Fix: a per-pair reward stream in `createCourse` (a new `COURSE_SALT.reward`), so the same box gives every player the same reward.
2. **The seed is fixed in `create()`, not `start()`** (Play ~173). A daily run builds its course in `start()` from the day it latches there. That also means a ready screen left open over midnight starts the right day.
3. **Levels 3–7 differ only in moving pipes (none on 3) and box bobbing.** Speed, gap and spacing are the same for all five. Michael kept a fixed level; the popup shows "Today: LV n" so players know what kind of day it is.
4. **Coins:** `takeCoins` is the single way coins come in. The plan also blocks the coin and kernel spawns and turns the box's coin draws into fiber, which lifts fiber's share of box draws from 33 % to 49 %.
5. **More level code to switch off:**
   - finish-line spawn and the prefill stop;
   - `skipToFinish` (a skip box would spawn a finish line);
   - `kernelPast`;
   - the level bar, which would read full.
6. **Score:** a daily run starts at 0, with pipes at `levelEnd(L−1)`. The shared course gates items and beans on the pair number, not the score, so pickups appear from the first pair.
7. **Recording:** a daily score must never reach `recordScore` / `submitPlans`. A best above 1000 would silently stop all 🏆 posts (`submitPlan` returns null when `best > maxScore`).
8. **Server:**
   - the day is computed as `(now() at time zone 'utc')::date`, never `current_date`;
   - it accepts today, and yesterday (for a run that ends after midnight or is posted later from offline);
   - the first post per player per day is kept, and a resend returns `'duplicate'`, not an error (the tournament receipt pattern);
   - the cap is a separate `dailyMaxScore` (10000), with the SQL placed after `submit_score` so the existing cap regexes still pin 1000.
9. **Offline:** posts wait in a queue modelled on `createTournamentQueue`. The name is read when the post is sent, so a rename made in the meantime is used.
10. **UI gaps:**
    - the save panel has no "continue" callback; the popup handles this by redrawing its button when a name is saved (Create user → Play), so the player never has to find the 🌞 again;
    - every Over tap that misses Share goes Home, so the score needs its own hit box;
    - Over has no update loop, and its `this.time.now` is stale after a relaunch, so the countdown runs on `Date.now()`;
    - the leaderboard switch only has two states, and `Leaderboard.js` turns any tab that isn't 🏅 into 🏆;
    - the smoke's "up from the toilet → ?" ring check will land on the 🌞 instead.
11. **Known limits (to state in the README):**
    - the day comes from the device clock, so someone can move the clock forward and practise tomorrow's course, or back a day and post for yesterday after seeing its board;
    - scores are reported by the client, as for 🏆;
    - the local "played today" record can be cleared, so the server's first-post rule is the real limit.
12. **Abandoning a run must not give the attempt back.** The store is written when the run starts and updated as the score grows; a record found unfinished at the next page load is the day's result. Without this, Settings → Reload game (or a browser reload) during a bad run would be a free retry.

## Design

### Rules
- **Day key** (`utcDayKey(now)`, `'YYYY-MM-DD'`): latched in `start()`.
- **Course:** `createCourse(dailySeed(day), tune, { shared: true })`. Every draw is per pair. The one exception left is the mid-height pair after a fart, which follows the player's own fart.
- **Hash:** `fnv1a32(string)` (FNV-1a, 32-bit, `Math.imul` in JS; bigint with `& 4294967295` in SQL). It is easy to write identically on both sides, which mulberry32 is not.
  - `dailySeed(day)` = `fnv1a32(day + ':course')`, then the course's own `mixSeed` per pair.
  - `dailyLevel(day)` = `3 + fnv1a32(day + ':level') % 5`.
- **Level:** 3–7 from `dailyLevel(day)`.
  - The start is `{ level, pipes: levelEnd(level − 1), score: 0 }`, so the course and its gates read like that level. On a level-3 day that puts the scripted first box at pairs 36–39, the same for everyone.
  - The level never changes during the run.
- **Endless:** guarded with `runIsDaily`:
  - no finish line (the update branch and the prefill stop);
  - box skip draws become fiber;
  - the level bar is hidden, and the HUD shows `🌞 LV n`.
- **No coins:** no kernel (`this.kernel = null`), no rolled coin, and box coin draws become fiber. The shop can't open because there is no level break.
- **Off in this mode:**
  - `this.toilet` is false for the run (the registry's toggle is left alone for later runs);
  - `startDaily()` calls `start()` directly and ignores the 👥 toggle (`launch()` is what diverts to Versus);
  - in test mode the popup's button reads **Practice**: the run is a test run (`runIsTest`), so it is not recorded, doesn't claim the day and can be replayed.
- **The attempt is claimed at the start.** `startDaily()` writes the store `{ day, playerId, level, score: 0, pipes: 0, collected, final: false }`; every score change rewrites it (a few hundred small writes a run). `endRun` sets `final: true` and queues the post. A record found with `final: false` at the next page load (a reload, Reload game, a crash) is finalised as it stands and queued: that was the attempt.
- **End of the run** (`endRun` branch order: match → test → daily → normal):
  - the daily branch finalises the store, adds the queue entry, calls `syncLeaderboard()` (which drains it) and `showOver(false)` with `{ daily: { day, level, sync } }`, where `sync` is the sync's promise so Over can wait for the post before asking for the rank;
  - it does **not** call `best.save`, `recordScore` or `submitPlans`;
  - it still marks How to play as seen (`markHowToSeen`), as any finished run does.
- **Already played:** the popup's button reads **See today's result** and opens Over from the stored result; Over fetches the rank again.

### Pure helpers (`src/logic.js`, `src/leaderboard.js`)
- **`src/logic.js`:**
  - `utcDayKey(date)`, `msUntilUtcMidnight(date)` and `countdownText(ms)` (hh:mm:ss);
  - `fnv1a32(str)`, `dailySeed(day)` and `dailyLevel(day)`;
  - `dailyRunStart(level, t)`;
  - `createCourse`'s `reward(n)` stream for both modes (single player keeps `course.rng` for boxes, so normal runs don't change).
- **`src/leaderboard.js`:**
  - `createDailyStore(storage)`: the record above, with `load(day, playerId)` returning null unless both match (so a different player on the same device isn't locked out), `save`, and `clear`;
  - `createDailyQueue`: a copy of the tournament queue, one entry per player and day, capped at 3; `outcome(key)` gives `'queued' | 'sent' | 'nameTaken' | 'rejected'`.

### Server (`db/schema.sql`, appended after the scores section)
- **Table `daily_scores`:** `(player_id, day date, name, score 0..10000, level 3..7, pipes, submitted_at)`, primary key `(player_id, day)`, and an index on `(day, score desc, submitted_at)`.
  - RLS on, all revoked: RPCs only.
- **`submit_daily_score(p_player_id, p_name, p_day date, p_score int, p_level int, p_pipes int) returns text`:**
  1. validate the id, name and ranges;
  2. `p_day` must be today or yesterday in UTC, else `'bad day'`;
  3. `p_level` must equal the server's own `daily_level(p_day)` (the same FNV-1a in PL/pgSQL; a PGlite test compares both sides over 365 dates), else `'bad level'`;
  4. resolve the player; take the advisory lock on the name key; `name_blocked` → `'name taken'`;
  5. insert, `on conflict do nothing` → `'duplicate'`; otherwise `'ok'`.
- **`daily_board(p_player_id, p_day default today UTC, p_limit default 25)`:** returns `(rank, name, score, level, pipes, me, total)`.
  - The name is `coalesce(latest scores name, stored name)`, so a 🏆 rename shows at once.
  - The caller's row is added below the top 25 when they aren't in it, as in `tournament_board`.
- **`fold_player`:** daily rows are moved with `insert … select … on conflict do nothing` (the kept id's row wins a same-day clash), then the merged id's rows are deleted.
- Grants, the header and the maintenance lines (wipe / cheater cover the new table).

### Client (`src/leaderboard.js`, `src/config.js`, `Play.syncLeaderboard`)
- **New config:** `LEADERBOARD.dailyKey`, `dailyQueueKey` and `dailyMaxScore: 10000`. Every knob is read in `src/`, and the distinctness test lists both new keys.
- **`submitDailyScore` → `'ok' | 'keep' | 'rejected' | 'nameTaken'`:**
  - ok / duplicate / an empty 2xx → `'ok'`;
  - a 400 with bad day / bad level / bad … → `'rejected'`;
  - name taken → keep the entry and set `boardNameTaken`;
  - anything else → `'keep'`.
- **`fetchDailyBoard(id, day)`:** rows are checked with `validateName`; one bad row → null. The caller's own row (`me`) carries the rank and `total` that Over shows.
- **`syncLeaderboard`:** finalises and queues any unfinished daily record first (the abandoned-run case), then drains the daily queue after name adoption and before the 🏆 plans; the name is read at send time.
- **`signOut`:** leaves the queue alone, because entries carry their own id; it also calls the popup's `refresh()` if the popup is open.

### UI
- **Ready 🌞 (`readyLayout.daily`, `readyHit`, Play):**
  - a round 88 px button at (cx, the ?'s y), with a halo from `createGlow` and the `readyPrompt*` alpha tween;
  - a size pulse on the glyph Text and the glow only (`createButton` can't scale about its centre);
  - pulse and glow on while today's attempt is unplayed;
  - wired into `setReadyUiVisible` and `applyLocale`, plus a ring item with `visible: onReady`.
  - A tap opens the Daily Dump popup (below), never a run directly.
  - Tests: `tests/ready.test.js` (added to the boxes list), `tests/field.test.js` (ids), and the smoke ring check rewritten (up from the toilet → 🌞).
- **Daily Dump popup:** a new overlay scene, `src/scenes/Daily.js`, built like Feedback (a 600-wide panel).
  - **Content:**
    - title "🌞 DAILY DUMP";
    - "Today: LV n";
    - a short explanation (en + zh-Hans): one try a day; everyone flies the same course; it never ends, so go as far as you can; no kernels or shop; compare on the 🌞 board; a new course every day at 00:00 UTC;
    - one button: **Create user** / **Play** / **See today's result**;
    - the countdown to the next day once today is played;
    - the version line, which opens What's new.
  - **The button:**
    - **Create user** (no name) calls `openSavePanel({ focusName: true })` and the popup stays underneath. `Play.setSaveState` calls `scene.get('Daily')?.refresh()`, so after Save the button becomes **Play** (and after Clear, Create user again).
    - **Play** closes the popup and calls `play.startDaily()`. `startDaily({ day } = {})` takes the day only so the smoke can pin one; the game never passes it.
    - **See today's result** closes the popup and opens Over from the stored result.
    - In test mode the button reads **Practice**: the run isn't recorded and doesn't use up the day.
  - **Closing:** ✕ / Esc / a tap outside / the pad's B → the home screen (`isTopOverlay` guard, chromeIntent `close`).
  - **Overlay wiring** (the AGENTS "new overlay" checklist):
    - a `daily` entry in `OVERLAY_SCENES` (`src/ui/overlayStack.js`) and `main.js`;
    - chromeIntent: a `daily` input opens it from the ready screen only; on any other state it is `'ignore'`;
    - an `applyChrome` case;
    - `tests/chrome.test.js` rows;
    - an `OVERLAYS` entry in `tools/headless_check.mjs`;
    - a focus ring: ✕, the button, the version line.
- **Daily Over (Over.js, overButtonsLayout):**
  - headline "DAILY DUMP · 10 Nov" with "🌞 LV n";
  - the score line is tappable through a new `overHit` box checked before Home; it sets registry `leaderboardTab = 'daily'` and opens the board;
  - the icon rows as now;
  - the pipes / coins row becomes "pipes ×n · Rank #3 of 12" (coins are always 0 here);
  - **the rank line's states**, from the queue's `outcome` after `daily.sync` settles: `sent` → `fetchDailyBoard` and read the `me` row ("Rank #3 of 12"); `queued` → "Posts when online"; `nameTaken` → the board's existing name-taken copy; `rejected` → "Not saved"; a null fetch → "Rank unavailable";
  - the old test-note slot holds "Next Daily Dump in hh:mm:ss", ticked by a 1 s `time.addEvent` on `Date.now()` and stopped on shutdown;
  - Share | Home: the card's headline and score lines get the daily text, plus a new `dailyShareText` ("Daily Dump 10 Nov: 87 · #3 of 12 · {url}"). The card and text are built when Over opens **without** the rank, and built again when the rank arrives (an async rebuild, usually long before any tap); sharing stays on `pointerup` with whatever is built (rule 9).
- **Leaderboard 🏆 · 🌞 · 🏅:**
  - a new widget `createTabs(scene, box, { glyphs, index })` in `src/ui/tabs.js`: a row of emoji with a filled pill behind the selected one that tweens to the new position (`setIndex`, `objects()`, `setVisible`, `destroy`). `createToggle` is left as it is (a pill with a knob cannot show a middle glyph);
  - `leaderboardLayout` gives the row three centres inside the 320 px band, each clear of ✕ (the overlay test pins this);
  - `leaderboardTab` is `'scores' | 'daily' | 'medals'`;
  - a tap on a third of the row picks that tab; the pad's A moves to the next one;
  - 🌞 columns: rank · name · `LV n` · score; the footer shows your daily rank, or "Play today's Daily Dump from the 🌞 on the home screen";
  - the layout test and the smoke tab checks are updated, and the How to play leaderboard row mentions 🌞.
- **How to play:** a `daily` 🌞 row after 🏅 Tournament (the tray-button rows stay last); en + zh-Hans with notes rows.

## Steps
Each step is verified, then committed. The full suite runs at every step.

### Step 1/8: daily pure helpers and the reward stream  [done]
- **Change:**
  - the logic.js helpers above;
  - `createCourse` `reward(n)`;
  - `createDailyStore` / `createDailyQueue` with their config keys.
- **Tests:**
  - day key across midnight and timezones (fixed `Date`s);
  - `fnv1a32` against two published test vectors (`''` → 0x811c9dc5, `'a'` → 0xe40c292c);
  - the seed and level are stable for a date and spread over 3–7 across 365 days;
  - two shared walkers draw identical rewards per pair;
  - the store rolls over at the new day and when the player changes;
  - queue order, cap, dedupe and concurrent drain;
  - key distinctness.
  - Anything unused until a later step goes in `ALLOWED_EXPORTS` with "remove in step N".
- **Commit:** `feat(daily, step 1/8): day key, seed, level, reward stream and the daily stores`
- **Result:** npm test 457/457 (8 new in tests/daily.test.js); full smoke 337/337. The tournament queue now runs on a shared `createPostQueue` (its tests and the tournament smoke unchanged). Config: `TUNING.daily { minLevel, maxLevel }`, `LEADERBOARD.dailyKey / dailyQueueKey / dailyQueueMax / dailyMaxScore`.

### Step 2/8: the daily run in Play (no entry point yet)  [done]
- **Change:** `runIsDaily` in `start({ daily })`, all the guards above, the HUD badge, the store writes (claim at start, each score change, final at `endRun`), the unfinished-record finalise in `syncLeaderboard`, and `endRun` / `showOver` routing. `startDaily({ day })` is reached from the smoke.
- **Smoke (a new `daily` section, always with a pinned day so the checks don't depend on today's level):** the run reaches pair `levelEnd(L)+20` with no finish line and the level unchanged; it has no coin, kernel or shop; a forced skip draw becomes fiber; the store reads `final: false` with the live score mid-run; dying writes `final: true` and leaves the 🏆 top list and best untouched; a `scene.restart()` mid-run (standing in for a reload) leaves an unfinished record that the next sync finalises and queues; two runs on the same pinned day reach the same gap sequence.
- **Commit:** `feat(daily, step 2/8): an endless, date-seeded, coin-free run at the day's level`
- **Result:** npm test 457/457; full smoke 345/345 with the new `daily` section (8 checks; it failed 8/8 until its own `home()` waited for the restarted scene). The record is rewritten from `update()` whenever the score or pipe count moves; `syncLeaderboard` finalises only an *unfinished* record (never the run in flight), and `endRun` queues its own.

### Step 3/8: schema and PGlite tests  [pending]
- **Change:** the server section above.
- **Tests (`tests/schema.test.js`):**
  - submit ok, then a resend gives duplicate (with no row change);
  - a second, higher score the same day is ignored;
  - a day two days old is rejected, and yesterday is accepted;
  - a wrong level is rejected, and the client and server `dailyLevel` agree for 365 dates;
  - name taken / blocked;
  - board order, `me` and the appended caller, and `total`;
  - the merge fold (including a same-day clash);
  - anon is denied the table;
  - run under `set timezone 'America/Los_Angeles'` to prove the day is computed in UTC;
  - the cap is pinned to `dailyMaxScore`, and the 🏆 cap regexes still read 1000.
- **Handoff:** Michael applies the schema, then a read-only live probe: `daily_board()` → `[]`, and a garbage submit → 400.
- **Commit:** `feat(daily, step 3/8): daily_scores, submit_daily_score and daily_board, with PGlite tests`

### Step 4/8: client post and board fetch  [pending]
- **Change:** `submitDailyScore`, `fetchDailyBoard`, and the `syncLeaderboard` drain.
- **Tests:** fake fetch for each answer mapping; rows validated.
- **Smoke:** `daily` with a stubbed fetch: the queue empties, and the stub is removed afterwards.
- **Commit:** `feat(daily, step 4/8): queue and post the daily score with the leaderboard sync`

### Step 5/8: the 🌞 and the Daily Dump popup  [pending]
- **Change:**
  - the 🌞's layout, hit test, pulse and ring;
  - the `Daily` overlay scene with its three button states, the refresh after a save, the stored-result reopen, and Practice in test mode;
  - the overlay wiring;
  - strings (en + zh-Hans + notes).
- **Tests:** the layout tests above; chromeIntent rows for `daily`; the orphan audit's overlay check (it reads `OVERLAY_SCENES`).
- **Smoke:**
  - a real click on the 🌞 opens the popup, and ✕ goes back to the ready screen with no run started;
  - unnamed, the button reads Create user and opens the save panel; saving a name turns it into Play;
  - Play starts a daily run;
  - after the attempt, the 🌞 is still, and the popup offers See today's result, which opens Over;
  - in test mode the button reads Practice, and the run isn't recorded.
- **Screenshots:** the popup in its three states, en + zh, 720×1280 and wide; the ready screen with the 🧪 badge (check it clears the 🌞's halo).
- **Commit:** `feat(daily, step 5/8): the 🌞 opens the Daily Dump popup: Create user, Play or today's result`

### Step 6/8: daily Over and Share  [pending]
- **Change:** the Over layout above, the countdown, the score link, `dailyShareText`, and the card text.
- **Tests:** `tests/over.test.js` (the daily hit box sits apart from Home and Share), countdown text, share text.
- **Smoke:**
  - the countdown ticks;
  - a real click on the score opens the board on 🌞;
  - Home restarts plain;
  - the offline rank text shows (the API is muzzled in the smoke).
- **Screenshots:** en + zh.
- **Commit:** `feat(daily, step 6/8): the daily result: rank, countdown, share`

### Step 7/8: 🏆 · 🌞 · 🏅 on the leaderboard  [pending]
- **Change:** `src/ui/tabs.js`, the tab logic, the 🌞 columns and footer, copy (the How to play leaderboard row loses "🏆 ⟷ 🏅").
- **Tests:** `tests/overlay.test.js` (three glyphs clear of ✕ and inside the panel; `tests/howto.test.js`'s 🏅 check still holds).
- **Smoke:** the overlays tab checks for three tabs; the pad's A cycles; the tab is remembered and reset.
- **Screenshots:** with fake rows.
- **Commit:** `feat(daily, step 7/8): a 🌞 daily tab on the leaderboard`

### Step 8/8: How to play, docs and 0.11.0  [pending]
- **Change:**
  - the How to play row and its tests;
  - AGENTS (rules, file map, schema section, the "new overlay / new mode" notes);
  - README: a Daily Dump section, the known limits, and the fix for the stale "write only through submit_score() and merge_players()" line;
  - `VERSION` 0.11.0 and the changelog (en + zh);
  - archive this plan and the draft.
- **Verify:** full suite; a grep for stale "🏆 ⟷ 🏅" wording.
- **Commit:** `docs(daily, step 8/8): Daily Dump in How to play, AGENTS and README; 0.11.0`
- **Push:** on Michael's word, after the schema is live.

## Risks and notes
- **The database can't be rolled back with git.** The new table and functions are additive and re-runnable. `fold_player` is the only function whose behaviour changes, so the PGlite merge tests guard it.
- **The fart's mid-height pair** makes courses differ slightly between players. It is deterministic for a given action; README says so.
- **UTC reset:** Daily Dump resets at 01:00 in Geneva (00:00 UTC) and at 16:00–19:00 on the US west coast.
- **Endless runs are long:** a strong player can run 10+ minutes at a fixed level. The 10000 cap leaves plenty of headroom.
- **A run cut off by a crash of the browser itself** loses only the points since the last score change, because the store is rewritten on each one.
- **Rank changes through the day** ("#3 of 12" at noon may be "#9 of 40" at night). The share text carries the rank at the time of sharing; the popup's See today's result refetches.
