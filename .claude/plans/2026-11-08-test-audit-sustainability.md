# Plan: Sustainable testing and audit workflow
- Created: 2026-11-08
- Status: in progress (step 2)
- Repo plan copy: `.claude/plans/2026-11-08-test-audit-sustainability.md` (folder is gitignored: `git add -f`, as every plan before it)
- Baseline commit: `c4226b7` on `main`, tree clean. **Re-check at start:** another session landed 8 commits during the audit; if HEAD moved or the tree is dirty with someone else's work, stop and report.
- Whole-suite verification: `npm test` (baseline **385 pass / 0 fail**, ~10 s) + full `npm run smoke` (server: `npm start` on :8000, Chrome, network for the live leaderboard reads). No source edits while a smoke runs (serve.py is no-store).
- Golden output: two baseline full smoke runs saved to the scratchpad as `smoke-golden-1.txt` / `-2.txt`; compared as sorted check labels with digits normalised (`sed -E 's/[0-9]+(\.[0-9]+)?/N/g' | sort`). The diff between the two baseline runs is the noise floor.
  Baseline: both runs "all checks passed", **303 checks** each (3m09s). Noise floor: two labels vary between runs (the three-beans rainbow hex colours; the popup stack contents in "when the +N fades").

## Context
The audit of the generated plan (`test_audit_sustainability_7b5eb48e.plan.md`) found the direction right but four things wrong: the npm-test tiers buy seconds for real maintenance, the orphan scanner counted tests as references (toothless), the smoke refactor hoisted the whole harness (brittle) and had a leaderboard-safety hole, and docs were stale. Since then another session shipped the How-to i18n sync and wired the toilet flush (credited, tracked, loaded), so those prerequisites are closed.

**Decisions (Michael, 2026-11-08):** no `test:unit` / `test:audit` scripts; dead exports and the dead `bestLabel` string are **deleted in their own step**; the two leftover generated plans are **moved into Archive and tracked**.

**Correction to the audit:** the leaderboard muzzle (`LEADERBOARD.dataApi = ''`) must **not** move up to boot. The `run` checks ("board names fit their column", the reopen race) need live board rows. It stays where it is, unwrapped, so it runs on every subset.

## Goal
1. `npm test` catches neglected code: unused exports, uncredited/unloaded/untracked sfx, unused texture keys and UI strings, config knobs nothing reads, overlays missing from Play's routing.
2. `npm run smoke -- --only=<sections>` and `--list` let scene work iterate on a subset without lying about coverage.
3. AGENTS.md says when to run what.

## Documents to update in the final step
- Repo-structure overview: `AGENTS.md` (repo map: tests/, tools/headless_check.mjs; "How to work on it"; stale lines listed in step 6), `README.md` ("Run locally", "Repo layout" tests line)
- Plans: this plan → `Status: complete` → `.claude/plans/Archive/`
- No data inventories or manifests in this repo.

## Risks and notes
- **Smoke wrapping changes scope.** Top-level `const`s inside run() become closure-local when wrapped. Any binding a later section reads must be hoisted into the unwrapped area. A miss is a runtime ReferenceError that only the full smoke catches (`node --check` won't).
- **Smoke sections are chained** (farts → levels → mystery → death → share; pipes-after-over → skip → final). `needs` defaults to "everything before me"; only sections proven to pass alone get relaxed.
- **Invariant that keeps subsets safe:** `--only` skips sections, never reorders them, and unwrapped harness lines (gamepad stub, viewport pin, boot wait, shared constants, the muzzle) always run. A subset can therefore never do anything the full run does not.
- The smoke's leaderboard checks need network; offline they fail with or without this plan.
- Deleting `howToLayout` touches `tests/field.test.js` and `tests/ready.test.js`, where it also checks the column x0 shift. Retarget those assertions to `readyLayout().howto` rather than dropping coverage.
- Rollback for every step is `git revert <hash>` or `git reset --hard <prev>`; nothing writes outside the repo except scratchpad golden files.

## Steps

### Step 1/6 — Plan copy and plan housekeeping  [done]
- Change: write this plan to `.claude/plans/2026-11-08-test-audit-sustainability.md` (`git add -f`). `git mv` the two complete, tracked plans (`2026-11-08-coins-ready-check.md`, `2026-11-08-slot-machine-versus-polish.md`) into `Archive/`. Move the two untracked generated plans (`test_audit_sustainability_7b5eb48e.plan.md`, `i18n_howto_sync_1687e16d.plan.md`) into `Archive/` and `git add -f` them. Record both smoke golden runs in the scratchpad before any code change.
- Verify: `ls .claude/plans` shows only the new dated plan, the Save Code Spec and `Archive/`; `git status --short` shows only those renames/adds; `npm test` 385/385; both golden files end in "all checks passed".
- Commit: `docs(plan, step 1/6): test audit plan; archive finished and superseded plans`
- Result: plans folder = this plan + Save Code Spec + Archive/; npm test 385/385; golden smoke 303/303 twice.

### Step 2/6 — Orphan audit suite  [pending]
- Change: new `tests/orphans.test.js`, zero deps (`fs` + regex, comments stripped before matching so a name mentioned only in a comment still counts as orphaned):
  1. **Exports**: every `export function|const|let|class` in `src/**/*.js` is referenced in `src/**` or `tools/*.mjs` outside its own file, or used in its own file beyond the declaration. Tests never count. `ALLOWED_EXPORTS` maps name → reason. Initial entries: test hooks `catalogKeys`, `catalogFor`, `_resetKeeperForTests`, `pipeMoveShiftPx` (tuning guard), `glowAlphaAt` (glowStops' profile), plus the seven dead ones marked `'dead: removed in step 3'`.
  2. **Config knobs**: flatten `TUNING`, `FIELD`, `LEADERBOARD`, `TEST_MODE`, `SHARE`, `BACKGROUND`. Arrays and numeric-keyed maps such as `levels.tutorial` count as leaves. A nested leaf is used if `parent.leaf` appears in `src/` outside config.js, or if both `parent` and `leaf` appear in the same file (covers destructuring). A top-level leaf is used if its bare word appears, which covers `angleForVelocity`'s destructured knobs. The prototype found zero real orphans.
  3. **UI strings**: every `en` catalog key appears quoted in `src/` outside the catalog. Allowlisted prefix: `level.` (built as `` `level.${key}` ``). `bestLabel` is allowlisted as `'dead: removed in step 3'`.
  4. **Texture keys**: every literal `load.image` / `load.spritesheet` key in Boot appears quoted somewhere in `src/` other than its load line.
  5. **Overlay wiring**: for each overlay in main.js's scene list (same exclusions as `tests/tools.test.js`), `Play.chromeArgs` has `isActive('K')`, `Play.padTop`'s map has `'K'`, and some scene calls `launch('K')`. This follows the AGENTS "New scene" checklist.
  6. **Allowlist hygiene**: every allowlist entry still names something that exists, so stale entries fail.
  7. **Self-tests**: run the export and key scanners on small fixture strings that must report an orphan. This is the same idea as the guard test in `tests/scenes.test.js`.
- Also, in `tests/assets.test.js` (it already reads CREDITS and the `load.audio` calls), add the two missing sfx edges. Every tracked `assets/sfx/` file is loaded by a `load.audio`. Every `assets/sfx/X` named in CREDITS is a tracked file. Use `git ls-files`, falling back to `readdirSync` outside a checkout.
- Verify: `node --test tests/orphans.test.js tests/assets.test.js` passes. Each self-test fails if its fixture orphan is removed: try once, then revert. `npm test` passes.
- Commit: `test(audit, step 2/6): orphan audit for exports, knobs, strings, textures, overlay wiring; sfx triangle`

### Step 3/6 — Delete the dead code  [pending]
- Change: remove `levelName`, `howToLayout`, `howToHit` (logic.js), `isNewTop`, `summaryLine`, `EMPTY_STATE` (save.js), `respawnTotalMs` (versus.js), and `bestLabel` (en + zh-Hans in i18n.js and its `TRANSLATION_NOTES.md` row). Delete the tests that only exercised them. Where a test used one as a helper or checked live behaviour through it, retarget instead: field.test's x0 shift and ready.test should use `readyLayout().howto`, and versus.test should compute the respawn total inline. Remove the `'dead'` entries from the allowlists.
- Verify: `npm test` passes, with the count dropping only by the deleted tests (list them in the commit body). `grep -rwn` for each removed name in `src tests tools` finds nothing. The hygiene check from step 2 passes, which shows no entry was left behind.
- Commit: `refactor(audit, step 3/6): drop seven unused exports and the unused BEST label`

### Step 4/6 — Smoke sections, full run unchanged  [pending]
- Change: in `tools/headless_check.mjs`, add a static `export const SECTIONS = [{ name, needs, about }]` and, inside `run()`, `section(name, fn)`. It checks that `name` is the next registered section, records it, counts its `ok()` calls, and runs `fn`. Wrap each existing comment-block section in place, with assertion text and order untouched. Sections in run order: `home`, `overlays`, `level1`, `howto-seen`, `run`, `farts`, `levels`, `mystery`, `death`, `share`, `pad`, `pad-overlays`, `pipes-after-over`, `skip`, `final`, `testmode`, `wide`, `versus-join`, `versus-match`, `versus-ghost`. Keep these unwrapped: Chrome/CDP setup, the hermetic stubs, the boot wait, helpers, the shared constants (`play`, `T`, `TT`, `SPACING`, `end1`, `end2`, …), the muzzle, and the final loop and exception checks. The level-3 jump at the start of the fart block moves inside `farts`. Hoist every binding a later section reads. Every `needs` is the full prefix for now. At the end, print checks per section and assert every registered section ran.
- Verify: full `npm run smoke` passes, and its normalised labels diff against the golden runs within the noise floor. The run also prints 20 sections with a per-section count whose total equals the golden check count.
- Commit: `refactor(smoke, step 4/6): named sections with per-section check counts`

### Step 5/6 — `--list`, `--only`, proven-independent sections  [pending]
- Change: export pure `parseArgs(argv)` → `{ url, only, list }`. It accepts a positional URL or `--url=`, `--list`, and `--only=a,b`; an unknown name is an error that lists the valid names. Export `expandOnly(names, SECTIONS)`, which returns the transitive `needs` closure in fixed order. `--list` prints name, needs and about without launching Chrome. `section()` skips anything not in the expanded set. Then relax `needs` for each candidate (`pad`, `pad-overlays`, `pipes-after-over`, `testmode`, `wide`, `versus-join`, `versus-ghost`, `overlays`, `level1`) only when `--only=<it>` passes alone with the same check count as in the full run. Leave the rest chained. The `about` text says "runs after X" so nothing pretends to be independent.
- `tests/tools.test.js` gains these checks:
  - Section names are unique, and `needs` point only backwards.
  - The `section('…')` calls in the file match `SECTIONS` in order.
  - The muzzle sits unwrapped between `section('run'` and `section('farts'`, and the gamepad stub comes before `Page.navigate`.
  - `parseArgs` and `expandOnly` produce the expected results.
- Verify: `npm test` passes and `npm run smoke -- --list` prints 20 sections. Each relaxed section passes `--only` alone with its full-run count. A chained pick such as `--only=share` runs its prefix and passes. Full `npm run smoke` still matches the golden labels.
- Commit: `feat(smoke, step 5/6): --list and --only with declared section needs`

### Step 6/6 — Docs, when-to-run, close the plan  [pending]
- Change: in `AGENTS.md`, rewrite "How to work on it" with a when-to-run table:
  - while iterating on logic, `node --test tests/<area>.test.js`;
  - before every commit, `npm test`;
  - while iterating on a scene or UI, `npm run smoke -- --only=<sections>`;
  - before pushing scene, UI or sound work, the full `npm run smoke`;
  - for input, scaling, audio or locale changes, ask for a phone check.

  Also in `AGENTS.md`:
  - Add repo-map rows for `tests/orphans.test.js`, the assets.test sfx edges, the tools.test additions, and headless_check's sections and flags.
  - Fix the stale lines: the ready screen's How to play routes through `readyHit()`, not `howToHit()`; drop the deleted names from the logic.js, save.js, versus.js and howto.test rows.
  - In the commit-type list, add `fix`, `test`, `refactor` and `tune`.
  - Add allowlist guidance to "Where to put new things": a deliberate test hook goes in `ALLOWED_EXPORTS` with a reason.

  In `README.md`, add the smoke flags to "Run locally" and update the tests line in "Repo layout". Set this plan's Status to complete and `git mv` it into `Archive/`.
- Verify:
  - `npm test` passes.
  - A grep over AGENTS.md, README.md and `src` finds no removed name or `howToHit`.
  - Every new flag and file is named in AGENTS.md: `--only`, `--list`, `orphans.test.js` and `SECTIONS`.
  - `npm run smoke -- --list` matches the documented names.
- Commit: `docs(test, step 6/6): when to run what; audit and smoke sections in AGENTS; plan archived`

## Completion summary
To fill in at the end: `git log --oneline c4226b7..HEAD`, the result of each verification, which sections were relaxed and which stay chained, and anything left unverified. A phone check is not needed because nothing here changes touch, scaling, audio or locale behaviour.
