# Plan: One ready-screen user button; retire the High scores overlay
- Created: 2026-11-09
- Status: in progress (step 2)
- Baseline: `d204131` on `main` (0.8.4 pushed; Michael's README refresh with pickup icons and section emojis committed on top), tree clean.
- Whole-suite verification: `npm test` (407 pass); `npm run smoke` (316 checks).
- Source: Michael's `.claude/plans/merge_ready_user_button_34e25606.plan.md` (audited below); archived with this plan when done.
- Michael's answers (9 Nov): keep **"name · best"** on the named button; the unnamed label stays **"Load user"**.

## Goal
One button on the ready screen:
- **Load user** (with the pulsing halo) before a username is set;
- **name · best** after;
- either way, a tap opens the save panel.

The local High scores overlay goes away. Top scores keep being recorded in the save code and posted to the 🏆 board.

## Audit of the source plan
**Kept:**
- one `profile` box at today's lower slot (y 1067), with `saveLoad` dropped;
- a new `loadUserButton` key;
- every tap opens `openSavePanel`, with focus on the name field when unnamed and no auto-close, so the code stays visible after Save;
- `Scores.js` and all its wiring go; `scoresEmpty` stays (the 🏆 board uses it); `topScores` stays;
- 0.8.5.

**Fixed:**
1. **The baseline is stale.** It's `d204131` now, not `918b0e7`.
2. **Steps 1 and 2 can't be separate commits.** Removing `readyBoxes.saveLoad` in step 1 crashes `Play.create` (`createButton` on an undefined box) until step 2 lands. They become one step, so every commit runs.
3. **No smoke anywhere.** The home section asserts "Enter username", the halo, that Save closes the panel, and `profilePrompt` after Clear. The overlays and pad-overlays sections walk the Scores overlay. Each step gets smoke runs.
4. **Dropping `closeOnSave` leaves dead code.** That's the `closeOnSave` option and timers in `savePanel.js` (Save and the test-word toggle) and the knob `T.savePanelCloseMs` with its range test (`tests/ready.test.js:114`). The orphan audit would fail on the unused knob, so all of it goes.
5. **"Update `leaderboardNameTaken` to say Load user" is wrong.** A player with that message is named, so their button shows their name, not "Load user". The copy becomes:
   - `leaderboardJoin` (unnamed): "Tap Load user on the home screen to set a username and join";
   - `leaderboardNameTaken` (named): "Your username belongs to another player: tap your name on the home screen to fix it".
6. **`profileLine` stays "name · best".** Michael's answer: with Scores gone, the button is the only offline place a player sees their best. `save.js`, its tests and the toilet emoji are untouched.
7. **Missed:** `Play.setReadyUiVisible` (`saveLoadBtn`, line 618), the locale refresh (line 1213), the readyLayout and Play comments, `tests/versus.test.js:338` (the 👥 toggle "above Save / Load User" becomes "above the user button"), `tests/field.test.js:53` (box ids), `TRANSLATION_NOTES.md` rows, and the README's ready-screen and save sections.
8. **Step 5 (an empty "final checkpoint" commit) is dropped.** The plan file rides along with every step.

## Steps

### Step 1/3 — One user button  [done]
- **`src/logic.js`**: `readyLayout` loses `saveLoad`, and `profile` stays at `1111 − boxH/2`. `readyHit` checks toilet, versus, ? and profile. Comments updated. The toggles keep their y.
- **`src/i18n.js`** (en + zh-Hans):
  - adds `loadUserButton` ("Load user" / "载入用户");
  - removes `saveLoadButton` and `profilePrompt`;
  - `profileButtonText` = `profileLine(state) || loadUserButton`;
  - new `leaderboardJoin` / `leaderboardNameTaken` copy (audit item 5);
  - `saveTitle` ("SAVE / LOAD USER") stays as the panel's heading.
- **`src/scenes/Play.js`**:
  - no `saveLoadBtn`;
  - the profile halo shows while unnamed (as today);
  - a tap on `profile` runs `openSavePanel({ focusName: !this.save?.name })`;
  - `setReadyUiVisible` and the locale refresh lose the old button.
- **`src/ui/savePanel.js`**: `closeOnSave` and its two timers go. **`src/config.js`**: `savePanelCloseMs` goes.
- **Tests**:
  - `tests/ready.test.js`: box ids, stacking and non-overlap with one button; the `saveLoad` y pin and the `savePanelCloseMs` range go; `profile.y` is pinned at 1067;
  - `tests/field.test.js` box ids;
  - `tests/versus.test.js:328,338`: the 👥 toggle sits above the user button;
  - `tests/i18n.test.js` parity follows the keys.
- **Smoke** (`home`):
  - a fresh profile shows "Load user" with a pulsing halo;
  - a tap opens the panel on the name field;
  - Save stores "Smoke" and the panel **stays open** with a code in the code field; then close;
  - the button reads "Smoke" without the halo;
  - a tap on the named button opens the panel (not High scores);
  - after Clear the button reads "Load user" (`loadUserButton`).
- **`TRANSLATION_NOTES.md`**: add the `loadUserButton` row, remove the `saveLoadButton` and `profilePrompt` rows, update the two leaderboard rows.
- **Verify**:
  - `npm test`;
  - `npm run smoke -- --only=home`, then the full smoke;
  - ready-screen screenshots (unnamed and named, en and zh-Hans, portrait and a wide window with 👥).
- **Commit**: `feat(ready, step 1/3): one user button: Load user, then name · best; it always opens the save panel`
- Result: done. npm test 407/407; smoke home 15 checks (onboarding rewritten: "Load user" + halo, the panel stays open on the code after Save, the named button reopens the panel); full smoke 317/317. Screenshots (scratchpad shots6: portrait en unnamed / named, zh named; 1600×900 en / zh unnamed with 👥): one button, the toggles keep their places with clear air below. Also the TRANSLATION_NOTES glossary line now names the user button.

### Step 2/3 — Retire the High scores overlay
- **Code**:
  - delete `src/scenes/Scores.js`;
  - `src/main.js` drops the import and the scene entry;
  - `src/scenes/Play.js` drops the overlay detection (lines 1257, 1275), the `openScores` case and the scene-key map entry;
  - `src/logic.js` `chromeIntent` drops `scores` from its typedefs and its branch (line 1621);
  - `src/i18n.js` drops `scoresTitle` (`scoresEmpty` stays), and the `TRANSLATION_NOTES.md` row goes with it.
- **Tests**:
  - `tests/chrome.test.js` (the overlay lists and the `openScores` case);
  - `tests/orphans.test.js` (the scene list) and `tests/tools.test.js` if they list it;
  - smoke `OVERLAYS` (`tools/headless_check.mjs:36`) and the pad walk (line 1212).
- **Verify**:
  - `npm test`;
  - `npm run smoke -- --only=overlays,pad-overlays`, then the full smoke;
  - `grep -rn "Scores\b\|openScores\|scoresTitle" src tests tools` → only `scoresEmpty` / `topScores`-style hits.
- **Commit**: `refactor(ui, step 2/3): retire the local High scores overlay`

### Step 3/3 — Docs and 0.8.5
- **`AGENTS.md`**:
  - the ready-screen description, the scene list (no Scores);
  - `savePanel.js` (no `closeOnSave`) and `readyLayout`;
  - the smoke summary (the home section's onboarding).
- **`README.md`** (Michael's refreshed version, `d204131`: keep its emojis, icons and layout; touch only these two lines):
  - the Ready screen line under 🎮 Controls (`README.md:125`: "…toilet toggle, and your **user button**: `Load user` until you set a name, then `name · best`; it opens Save / Load");
  - step 1 of "Username & save code" under 🏆 (`README.md:189`: "Tap **Load user** (or your name, once set) on the ready screen").
- **`src/logic.js`**: `VERSION` 0.8.5.
- **`src/changelog.js`** (en + zh-Hans): "One button for your user on the home screen: Load user until you pick a name, then your name and best. It always opens Save / Load. The separate High scores page is gone; your best is on that button and on the 🏆 board."
- **Verify**:
  - `npm test`;
  - `grep -rn "Save / Load User\|Enter username\|saveLoadButton\|profilePrompt\|openScores\|Scores.js\|savePanelCloseMs\|closeOnSave" src tests tools AGENTS.md README.md TRANSLATION_NOTES.md` → only historical changelog entries.
- **Commit**: `docs(step 3/3): one user button and no High scores in AGENTS / README; 0.8.5` (archives this plan and Michael's source plan)
- **Push**: `npm run push` on Michael's word.

## Risks and notes
- The pad focus ring still skips the user button (it needs the keyboard), as today.
- Players used to "Save / Load User" see "Load user" until they pick a name; the panel title still says SAVE / LOAD USER.
- Rollback: `git revert` of any step commit. Nothing outside the repo changes.
