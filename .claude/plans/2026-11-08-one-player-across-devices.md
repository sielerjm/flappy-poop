# Plan: One player across devices — backend account merging, a username claim, clear save/load steps, and Clear
- Created: 2026-11-08
- Status: in progress (approved 2026-11-08)
- Source: Michael's `.claude/plans/username_uniqueness_claim_8632d0fc.plan.md` (audited), his asks (merge today's duplicates, prevent new ones, succinct save/load instructions; a pink-outlined **Clear** left of Save) and two answers: a held name typed on a new browser is **refused with the code steps** (no auto-join); Clear **signs this device out**.
- Baseline: `26831f7` on `main`, tree clean. 0.8.2 is committed, not pushed: this joins its What's new.
- Whole-suite verification: `npm test` (orphan audit included); `npm run smoke -- --only=home` while iterating on the panel; the full `npm run smoke` before each scene commit. SQL proven in a throwaway local Postgres (`colima start`, Michael's OK) before he pastes `db/schema.sql` into Supabase.
- Repo plan copy: `.claude/plans/2026-11-08-one-player-across-devices.md` (`git add -f`); archived with Michael's source plan when complete.

## Context
- A player is their secret save-code `id`; the name is a label. Playing on a second browser mints a second `id`, so the board shows the same person twice (32 rows under 19 names today; 3 names held by two ids).
- The backend cannot tell "same person, other browser" from "stranger with the same name" by the name alone. What it *can* trust is the secret ids: a client that holds two ids (the one this browser had, the one just pasted) owns both.
- So: **merge on the backend** whenever that proof appears, keep the merged ids as **aliases** so every device keeps working, let Michael **fold today's duplicates** by hand once, and **refuse** a held name on a new browser with the exact steps to load the code instead.

## Audit of the source plan (kept / fixed)
Keep: the rows-based claim with grandfathering, the case-insensitive key, the advisory lock, the read-only `name_available` RPC, `{ ok, reason }` from `submitScore`, offline saves staying local, hijack-safety (a claim needs the secret id).
Fix or add:
1. **Rename moved only one row** (the upsert touches one toilet kind): `submit_score` renames all of the player's rows.
2. **`Play.syncLeaderboard` does `if (ok)`**: an object return is always truthy; it must read `res.ok`.
3. **One key definition**: `name_key(text) = lower(btrim(text))`, immutable, used by the check, the RPC and an expression index.
4. **Blur/Save race**: one shared `claimName` gates blur, change and Save; nothing is stored until the answer is free / yours / offline.
5. **Smoke determinism**: the check goes through `play.checkNameAvailable` so the smoke stubs it (the `home` section saves "Smoke" before the live muzzle).
6. **Lost races are silent**: Play remembers `nameTaken` from the last sync; the 🏆 overlay and the panel say so.
7. **Deploy order**: SQL in Supabase first, then `npm run push`.
8. **No backend merge at all** (new): the source plan left every old id's rows orphaned. This plan's aliases and `merge_players` fix that.

## Design

### Aliases (the "additional ids" of one player)
- `public.player_aliases (alias_id text primary key, canonical_id text not null, merged_at timestamptz)`. RLS on, **no grants to anon**: only `security definer` functions read it; the game's key never sees an id.
- `resolve_player(id)`: the canonical id, one hop (merges keep the table flat by re-pointing aliases of the merged id).
- `submit_score`, `player_rank` and `name_available` resolve first. A browser still holding an old id keeps posting into the merged account; its rank reads the merged rows; the rate limit is per canonical id.
- The upsert's name always follows the latest post, as today; a merged account's name is whichever device posted last. Aliases never change the board's row count: one player, at most two rows.

### `merge_players(p_keep_id, p_merge_id)` — the proof-of-ownership merge
- Called by the game after a successful **Load user code**: `keep` = the pasted code's id (the local merge adopts it), `merge` = the id this browser had before, when they differ.
- Security definer, granted to anon. Both ids must be valid and distinct; both resolve first (merging an alias is a no-op; a `merge` that already is `keep`'s alias is a no-op), so it is idempotent and retry-safe.
- Per toilet kind: `keep`'s row takes `greatest(score)` and the level of the higher score, keeps `keep`'s name (the pasted name wins, as in `save.js` `merge`); `merge`'s rows are deleted; `merge` becomes an alias of `keep`; aliases of `merge` are re-pointed to `keep`. Under the advisory lock on `keep`'s name key.
- A stranger cannot call it usefully: they would need both secrets.

### Today's duplicates — `admin_merge_name(p_name)` (not for the game)
- Security definer, **revoked from anon and authenticated**; Michael runs it in the SQL editor: `select public.admin_merge_name('alice');`
- Folds every id under `name_key(p_name)` into the one holding the highest score (ties: the earliest `updated_at`), through the same merge routine, so each old device becomes an alias and keeps working. Returns the ids merged (count) for the log.
- Also `admin_merge_all_duplicates()` listing and folding every duplicated key in one call, for the three today. The header comments say when it is safe: only when Michael knows the duplicates are one person (small community); otherwise merge by name one at a time.

### The claim (prevents new duplicates)
- A name key is **blocked** for an id when another canonical id has a row under it and this id (resolved) has none. Grandfathered rows stay. `submit_score` raises `name taken`; `name_available` reports it; `submit_score` renames all rows on a successful post.
- Client: a refused name is **not stored**; the status gives the steps (below). Scores still save locally and post once the code is loaded (the local merge unions them, `merge_players` folds the ids).

### Clear = sign out this device
- Pink-outlined, transparent **Clear** left of Save; disabled with no stored name. First tap warns ("Copy your user code first: without it this username and its scores can't come back. Tap Clear again to sign out"); a second tap within `T.saveClearConfirmMs` (4000) signs out, else it disarms.
- Forgets: the save state (name, id, top, exportedAt), the submit store (`clear()`), the legacy best (`createBestStore().clear()`, or `Play.create` re-seeds it) and any pending merge. Keeps settings (hand, locale, toilet, test mode). The old id stays on the board under its name; retyping it is refused; the code brings it back.

### Instructions (succinct; the YouTube videos come later)
- `saveIntro` becomes three short numbered lines (the panel renders `white-space: pre-line`):
  1. Pick a username and press Save.
  2. Copy your user code and keep it somewhere safe (a note, a message to yourself).
  3. On another phone or browser, paste it under Load user code: your name and scores follow you, and the leaderboard joins both into one player.
- `saveNameTaken`: "That username is taken. If it's yours, copy your user code on the device where you set it and paste it here under Load user code. Otherwise pick another name."
- After a Load that merged: `saveMerged` "Welcome back, {name} — this device is now part of your player" (replaces the welcome line only when a merge was queued).
- `saveNameOffline`, `saveClear`, `saveClearConfirm`, `saveCleared`, `leaderboardNameTaken` as in the audit; zh-Hans for all; `TRANSLATION_NOTES.md` rows and a context paragraph (ids, aliases, the claim).

## Steps

### Step 1/5 — Schema: aliases, resolve, merge, the claim, the admin fold (`db/schema.sql`)  [done]
- Change: `player_aliases` + RLS; `name_key`; the expression index; `resolve_player`; `merge_players`; `admin_merge_name` / `admin_merge_all_duplicates`; `submit_score` (resolve, lock, claim, upsert, rename all rows); `player_rank` and `name_available` resolving; grants (`merge_players`, `name_available` to anon; admin functions to nobody); header comments (the model, the claim, apply-before-push, the one-time duplicate fold).
- Verify in a throwaway `postgres:16` (scratchpad scripts, not committed): the file runs twice cleanly; as anon: a new name posts; a second id on the same name (other case) is refused and `name_available` says so; a grandfathered pair still posts, a third id is refused; a rename moves both rows and frees the old key; `merge_players` folds rows (max per kind, pasted name), aliases the old id, and a later post from the old id lands on the canonical rows with the right rank; calling it again is a no-op; anon cannot select `player_aliases` nor call the admin functions; `admin_merge_name` folds a three-id duplicate into the top scorer. `npm test` (the schema-cap test).
- Commit: `feat(board, step 1/5): player aliases, merge_players, a username claim, and an admin fold for today's duplicates`
- Result: colima's VM cannot start (its config mounts a network volume) and Docker Desktop would not start either, so the SQL ran in PGlite (Postgres 17.5 in WebAssembly, installed in the scratchpad only): the file applies twice cleanly; all 18 scenario checks pass (a new name posts; a second id on the same name in another case is refused and `name_available` agrees; the grandfathered pair posts and a third id is refused; a rename moves both rows and frees the key; the rate limit holds; anon can neither read `player_aliases` nor call the admin / internal functions; `merge_players` folds rows under the kept name, aliases the old id, a later post from the old id lands on the kept rows with the same rank, and repeats are no-ops; `admin_merge_name` folds a three-id duplicate into the top scorer and the old device keeps posting; `admin_merge_all_duplicates` then finds none). npm test 399/399.

### Step 2/5 — Client: `submitScore` reasons, `checkNameAvailable`, `mergePlayers`, pending merges  [done]
- Change (`src/leaderboard.js`): `request` opt-in error bodies; `submitScore` → `{ ok, reason }`; `checkNameAvailable` → true / false / null; `mergePlayers(keepId, mergeId)` → true / false; a `createMergeStore` (localStorage `flappyPoop.merges`: queued `{ keep, merge }` pairs, `add` / `load` / `remove` / `clear`). `Play`: `syncLeaderboard` drains the merge queue first, then posts, confirming only on `res.ok` and recording `boardNameTaken`; `checkNameAvailable` and `queueMerge` wrappers; `createSubmitStore().clear()`.
- Tests (`tests/leaderboard.test.js`): the three `submitScore` shapes; `checkNameAvailable` on 200 / 404 / timeout / disabled; `mergePlayers` body and failure; the merge store round trip; a sync-order test on a fake `Play`-like driver if cheap, else covered by the smoke.
- Verify: `npm test`.
- Commit: `feat(board, step 2/5): submitScore reasons, name checks and queued account merges in the client`
- Result: npm test 403/403 (the orphan audit sees `LEADERBOARD.mergesKey` and the three new exports used from Play). Step 1 commit `e00e090`.

### Step 3/5 — Save panel: the claim, the merge on Load, the instructions, Clear  [done]
- Change: `src/ui/savePanel.js` (`claimName` gating blur/change/Save; Load queues `merge_players(pasted, old)` when the ids differ and runs a sync; the numbered intro; the taken-name steps; Clear with the outline style and two-tap confirm); `src/logic.js` `createBestStore().clear()`; `Play.signOut()`; `src/scenes/Leaderboard.js` the taken line; `src/config.js` `saveClearConfirmMs`; i18n + notes.
- Smoke (`home`, with `play.checkNameAvailable` and `mergePlayers` stubbed): Smoke saves; a taken name is refused and nothing stored; offline saves with the note; blur then Save checks once; Load of a code with another id queues the merge and the sync drains it (the stub records the pair); Clear warns then signs out (state, submit store, legacy best, merge queue gone; settings kept; the code field reads "Enter a username first"); the 🏆 overlay shows the taken line; onboarding and the test-mode trigger word still pass.
- Verify: `npm test`; `--only=home`; the full smoke; a screenshot of the panel (Clear beside Save) in both locales.
- Commit: `feat(save, step 3/5): a taken username points at the user code; loading a code merges the accounts; Clear signs out`
- Result: npm test 403/403; `--only=home` 11 checks; full smoke 312/312. Screenshots of the panel (fresh, named, Clear armed, zh-Hans) checked. Not in the smoke: the 🏆 overlay's taken line (the overlay needs the live board; the branch is three lines in `showBoard`, read in review). Save is not disabled during the check (a disabled button swallows the phone tap that blurred the field); blur and Save share one cached check instead. Step 2 commit `05d660b`.

### Step 4/5 — Docs and 0.8.2 notes
- `README.md` (Save / Load bullet; the leaderboard section: one player across devices, aliases, the claim, Clear), `AGENTS.md` (save / leaderboard sections, `schema.sql`, the smoke summary, the maintenance recipe), the Save Code Spec (dated note: name vs id, aliases, merge, Clear), `src/changelog.js` 0.8.2 (two bullets per locale: load your code on any device and the leaderboard joins them; usernames belong to one player, with Clear).
- Verify: `npm test`; stale-wording grep; `--only=home`.
- Commit: `docs(step 4/5): one player across devices in README, AGENTS and the spec; 0.8.2`

### Step 5/5 — Rollout (Michael, with a live probe)
1. Paste the whole `db/schema.sql` into the Supabase SQL editor ("Success. No rows returned").
2. Run `select * from public.admin_merge_all_duplicates();` (or `admin_merge_name` per name) once he has confirmed the three duplicated names are one person each.
3. I run a read-only probe: `name_available` is false for a held name with a random id and true for a fresh one; `fetchTop` shows the duplicates gone.
4. `npm run push` on his word.

## Risks and notes
- A stranger who already holds a name keeps it; the real owner reclaims nothing without a code (out of scope, as before). Squatting a fresh name still needs a positive score.
- Two devices of one player that **never** load the code stay two players until Michael folds them by name; the refused-name message is what nudges them to load the code.
- `merge_players` trusts possession of both ids; the ids only travel inside signed codes or local storage, same trust level as today's leaderboard identity.
- Confusables (Latin vs Cyrillic) are not merged; only case and surrounding spaces.
- If colima will not start, the SQL is verified only on Supabase (apply, probe, and a `merge_players` call between two throwaway ids), which is weaker; say so in the commit.

## Verification (end to end)
- `npm test`, full `npm run smoke`, the local Postgres scenarios, the live probe after the SQL is applied.
- Hand check (Michael): on a second browser, type a board name → refused with the steps; paste the code → welcome + merged, and the 🏆 shows one row per kind; the first browser (old id) still posts into it. Clear asks twice, then the panel is empty and the profile halo returns.
