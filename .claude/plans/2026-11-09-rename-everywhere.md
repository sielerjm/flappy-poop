# Plan: A rename reaches every device on its own, and a fourth Save / Load step says so
- Created: 2026-11-09
- Status: in progress (step 2)
- Baseline: `b367afd` on `main` (0.8.2 pushed), tree clean.
- Whole-suite verification: `npm test` (403 pass at baseline); `npm run smoke -- --only=home` while iterating, the full `npm run smoke` before the client commit.
- Repo plan copy: `.claude/plans/2026-11-09-rename-everywhere.md` (`git add -f`), archived when done.
- Michael's comments: (1) "If we automate the renaming we'll need to update point 4 accordingly"; (2) automate it, so "the latest username for a player ID is updated automatically when a user loads their player code into a different device or browser".

## Context
Today the board takes a player's name from whichever device posted last. After a rename on phone A, phone B still holds the old name, and the next time B posts a new best it renames the player back (`submitPlan` in `src/leaderboard.js` posts whenever the local best beats the last confirmed one; `submit_score` renames all of the player's rows). Loading a code also brings the name that code carried, which may be older than the board's.

The fix: **the board's name is the truth, and a device only overrides it on purpose.** A device remembers a rename the player typed there ("pending rename") until a post carrying it is confirmed. On every sync, a device without a pending rename asks the board for its player's current name and adopts it before posting. So a stale device switches to the new name instead of switching the board back, and a freshly loaded code picks up the latest name too.

## Design
- **Server** (`db/schema.sql`): `player_name(p_player_id text) returns text`, security definer, granted to anon. It resolves the id through `player_aliases` and returns the name on that player's rows (they share one name; latest `updated_at` if not), or null when the player has no rows. Safe to expose: you need the secret id to ask, and names are public anyway.
- **Client** (`src/leaderboard.js`):
  - `fetchPlayerName(id)` → the name, `null` (no rows), or `undefined` (unreachable / not deployed).
  - `createRenameStore()` (localStorage `flappyPoop.rename`, `LEADERBOARD.renameKey`): `{ id, name }` of a rename typed on this device, with `load` / `set` / `clear`.
  - A pure `nameAction({ local, board, pending, id })` → `'adopt'` (take the board's name) or `'keep'`. It returns 'adopt' only when the board has a name, it differs from the local one, and no pending rename matches this id + local name. Unit-tested.
- **`Play.syncLeaderboard`**: merges first (as today); then, with a name and an id, fetch the board's name and adopt it when `nameAction` says so (`setSaveState(saveLocal({ ...save, name }))`, which updates the ready-screen profile). Then post as today, with the adopted name. Clear the pending rename once a post carrying that id + name is confirmed; a `nameTaken` refusal keeps it.
- **When it runs**: as today (game over, 🏆 board, Save), plus **once at boot** when the device has a name, so the new name shows as soon as the game opens online.
- **Panel** (`src/ui/savePanel.js`):
  - storing a typed name records the pending rename (`play.noteRename(name)`);
  - **Load** clears it, because the code's name is not a rename, and starts a sync right away. The board's latest name replaces the code's older one while the panel is still open: an adopt calls back into the open panel, which refreshes the Username field and the code, and the welcome line names the adopted name;
  - **Clear** (sign out) clears it too.
- **Unreachable board**: nothing is adopted, and posts behave as today.

## The line (step 4)
Michael's direction: "New usernames will be updated when you load your player code into other devices and browsers." With this design that holds for a fresh Load, and devices that already use the code update on their own too, so:
- en: `4. To change your username, type a new one and press Save. Devices and browsers that use your user code update to the new name automatically.`
- zh-Hans: `4. 要更改用户名，输入新名字并按“保存”。使用你用户码的其他设备和浏览器会自动更新为新名字。`

## Steps

### Step 1/4 — Schema: `player_name`  [done]
- Change: the function, its grant to anon, a header line in the access-model list, and the "one player across devices" comment block (the board's name wins; devices adopt it).
- Verify in PGlite (scratchpad harness, as for 0.8.2): the file applies twice; as anon, `player_name` returns the name for a canonical id and for an alias id, and null for an unknown id; after a rename through `submit_score` it returns the new name; anon still can't read `player_aliases`. Then `npm test`.
- Commit: `feat(board, step 1/4): player_name, the board's current name for a player`
- Result: done. PGlite: the file applies twice; 10 player_name checks pass (canonical / alias / unknown / bad / null ids; a rename posted from an alias device shows on both ids and both rows; anon still refused on player_aliases; anon may execute, authenticated may not); the 18 earlier scenarios still pass. npm test 403/403.

### Step 2/4 — Client: adopt the board's name, keep a deliberate rename
- Change: `src/leaderboard.js` (`fetchPlayerName`, `createRenameStore`, `nameAction`); `src/config.js` (`renameKey`); `src/scenes/Play.js` (`renameStore`, `noteRename`, the adopt step in `syncLeaderboard`, the boot sync, `signOut` clears it); `src/ui/savePanel.js` (store → `noteRename`; Load → clear).
- Tests (`tests/leaderboard.test.js`):
  - `nameAction` table: no board name; same name; stale device; pending matches; pending for another id or name; after a Load;
  - `fetchPlayerName` on 200 / null / 404 / timeout;
  - the rename-store round trip.
- Smoke (`home`, board calls stubbed so nothing reaches the live board):
  - a stale device adopts the board's name (profile and panel field show it);
  - a pending rename is posted, not overwritten;
  - Load of a code carrying an older name shows the board's newer name in the open panel, and clears the pending rename;
  - the boot sync makes no live request.
- Verify: `npm test`; `--only=home`; the full smoke.
- Commit: `feat(save, step 2/4): a rename reaches every device; a stale device adopts the board's name`

### Step 3/4 — Copy, docs, 0.8.3
- `src/i18n.js` `saveIntro` gets step 4 (en + zh-Hans); the panel already renders `pre-line` and scrolls past 90vh.
- `TRANSLATION_NOTES.md`: the row, plus a sentence in the "One player across devices" bullet.
- `README.md:47` (four steps; the board's name wins); `AGENTS.md` (`leaderboard.js`, `schema.sql`).
- `src/logic.js` `VERSION` 0.8.3, with a `src/changelog.js` entry (en + zh): "Change your username once: your other phones and browsers pick it up the next time they open the game." Also correct 0.8.2's date to 9 Nov (its push day).
- Verify:
  - `npm test`;
  - `--only=home`;
  - panel screenshots (scratchpad `shot.mjs`) in en and zh-Hans at 390×844 and 844×390: four lines, nothing clipped;
  - `grep` for "three steps" / "三个步骤": nothing stale.
- Commit: `docs(step 3/4): a fourth Save / Load step; 0.8.3`

### Step 4/4 — Rollout (Michael, then me)
1. Michael: back up both tables (`meta/db-backups/README.md`), then paste the whole `db/schema.sql` into the SQL Editor. It is idempotent: the fold already ran, and nothing in the file re-runs it.
2. Me, a read-only probe: `player_name` with a random id → null; the new client's boot sync against the live board adopts nothing for a matching name.
3. `npm run push` on Michael's word. SQL before push: until `player_name` exists the client treats the board as unreachable and keeps today's behaviour, so a push first is safe, just inert.

## Risks and notes
- **Two devices renamed differently while offline:** whichever posts last wins, as today.
- **A device renamed but with no local score yet:** its rename reaches the board with its first post. Until then, other devices keep the board's name.
- **Boot sync:** one extra request per launch for named players. Fire and forget, never awaited, with the existing 4 s timeout.
- **Old clients:** until players reload, the old client can still post an old name. It clears once they reload, because the game is cache-busted on push.
