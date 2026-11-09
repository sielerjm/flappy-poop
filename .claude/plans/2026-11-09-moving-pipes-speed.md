# Plan: Fix the flaky moving-pipes smoke check; moving pipes speed up linearly per level and are a lighter pink
- Created: 2026-11-09
- Status: in progress (step 2)
- Baseline: `510afe2` on `main` (0.8.3 pushed), tree clean.
- Whole-suite verification: `npm test` (406 pass at baseline); `npm run smoke` (315 checks; the moving-pipes check fails now and then).
- Repo plan copy: `.claude/plans/2026-11-09-moving-pipes-speed.md` (`git add -f`), archived when done.
- Michael's answers: **+20 px/s per level**; **faster cycle, same swings**.

## Context
1. **The flaky check.** In the smoke's `testmode` section (`tools/headless_check.mjs` ~1445), the moving-pipes check spawns one bobbing pair plus a probiotic, waits 400 ms, and reads them back by searching:
   - "the last pipe with `move`" (`filter(...).pop()`);
   - "the first item with `bob === 'pair'`" (`find`).

   The game keeps running at level 4 meanwhile, so its own moving pairs and riding probiotics can match either search. The failure on 9 Nov read a probiotic 79 px below a top pipe instead of 170 (half the gap): another pair's probiotic.
2. **Moving pipes.** Michael likes level 4's motion and wants each later level's moving pipes faster, linearly. Today (`TUNING.pipeMove`, `src/config.js:183`), the average vertical speed of a gap (4 × swing ÷ cycle) is:

   | Level | Swing each way | Cycle | Average speed |
   |---|---|---|---|
   | L4 | 30 px | 6 s | 20 px/s |
   | L5 | 40 px | 5 s | 32 px/s |
   | L6 | 60 px | 5 s | 48 px/s |
   | L7 | 80 px | 6 s | 53 px/s |

   That rise is uneven, and L7 even slows its cycle. Levels end at 7 (`levels.lastLevel`), so this covers L5–L7.

## Design (moving pipes)
- **Config:** replace the `pipeMove.periodMs` table with a linear speed:
  - `speedPx: 20`: L4's average vertical speed, in px/s;
  - `speedStepPx: 20`: px/s added per level after `fromLevel`.

  Keep `chance` and `ampPx` as they are.
- **`pipeMoveParams`** (`src/logic.js:833`) derives each level's cycle: `periodMs = 4000 × ampPx ÷ (speedPx + speedStepPx × (level − fromLevel))`, rounded to the ms. The function shape and its callers (`rollPipeMove`, `Play.update`'s `gapBobY`) stay the same.

  | Level | Swing each way | Cycle | Average speed | Max shift during a crossing |
  |---|---|---|---|---|
  | L4 | 30 px | 6 s | 20 px/s (unchanged) | 22 px |
  | L5 | 40 px | 4 s | 40 px/s | 43 px |
  | L6 | 60 px | 4 s | 60 px/s | 65 px |
  | L7 | 80 px | 4 s | 80 px/s | 87 px |

  Past the table, the last row's swing repeats and the speed keeps its linear step. No level exists past 7 today.
- **Safety rule.** It loosens from half the poop's clearance (61 px) to **three quarters (91.5 px)**:
  - L6 and L7 then need the player to follow the gap a little;
  - a centred poop is still never clipped by the motion alone, because 87 px is less than the full 122 px clearance.

  The cycle floor stays at 4 s, so the gap still drifts rather than wobbling. The config comment, `tests/tuning.test.js` and `tests/pipeMove.test.js` all say so.

## Steps

### Step 1/4 — The smoke check measures its own pair  [done]
- Change (`tools/headless_check.mjs`, the testmode moving-pipes block):
  - right after the spawn, keep page references to the exact pipe and probiotic: `globalThis.__mvTop` (the pair `mvSpawn(false)` made) and `globalThis.__mvItem` (`spawnGapItem` returns it);
  - `mvRead` and the cleanup use those references instead of `filter(...).pop()` / `find(bob === 'pair')`;
  - also assert the item rides that pair (`item.getData('pair') === top`).
- Verify:
  - `npm run smoke -- --only=testmode` five times in a row → all pass;
  - then the full `npm run smoke` → 315/315.
- Commit: `test(smoke, step 1/4): the moving-pipes check reads back its own pair and probiotic`
- Result: done. `--only=testmode` (197 checks with its prerequisites) passed 5 runs in a row; full smoke 315/315.

### Step 2/4 — Linear moving-pipe speed
- Change: `src/config.js` (`pipeMove`: `speedPx`, `speedStepPx` in place of `periodMs`, and the comment); `src/logic.js` (`pipeMoveParams` derives `periodMs`); `tests/pipeMove.test.js` (rows expect the derived cycles 6000 / 4000 / 4000 / 4000; the shift test at ¾ clearance); `tests/tuning.test.js` (¾ clearance, cycle ≥ 4000 ms, and a new check that the average vertical speed rises by exactly `speedStepPx` per level from `speedPx` at `fromLevel`).
- Verify:
  - `npm test` (the orphan audit sees the two new knobs used and `periodMs` gone);
  - full `npm run smoke`: the moving-pipes check still expects `ampPx[0]` on level 4;
  - a screenshot sequence of an L7 moving pair (test mode's start level) to eyeball the motion.
- Commit: `feat(pipes, step 2/4): moving pipes speed up 20 px/s per level from level 4`

### Step 3/4 — Moving pipes are a lighter pink
- Why: Michael wants moving pairs told apart from still ones at a glance.
- How: Phaser's tint multiplies, so it can only darken. Instead, paint a second texture once, following `createFinishTexture` (`src/ui/finish.js`):
  - new `createLightTexture(scene, srcKey, key, frac)` in `src/ui/pipeShade.js`, idempotent (`textures.exists`);
  - draw `pipe` (`__BASE`) into a canvas texture `pipe-moving`, then fill white at alpha `frac` with `globalCompositeOperation = 'source-atop'`, so only the pipe's own pixels lighten and the transparent edges stay clear;
  - new knob `pipeMove.lightenFrac: 0.25` (25 % toward white: "slightly lighter").
- `Play.create` makes the texture next to `createFinishTexture`. `spawnPipePair` sets `top` and `bottom` to `pipe-moving` (`'__BASE'`) when the pair rolls a move. Bodies keep their size, because the texture is the same 128 × 1280.
- Tests:
  - `tests/tuning.test.js`: `lightenFrac` stays within 0.1–0.5 (visible, still pink);
  - smoke (the moving-pipes block): the moving pair and its mate use `pipe-moving`, the centred pair `pipe`, and a sampled pixel of `pipe-moving` is lighter than the same pixel of `pipe` but not white.
- Verify:
  - `npm test`;
  - full smoke;
  - a test-mode screenshot at level 7 with a moving and a still pair side by side, for Michael to judge the shade; `lightenFrac` is the one number to change.
- Commit: `feat(pipes, step 3/4): moving pipes are a lighter pink`

### Step 4/4 — Docs and 0.8.4
- `AGENTS.md:71-77` (the moving-pipes paragraph: speed knobs, ¾ clearance, the lighter `pipe-moving` texture), the `src/ui/` tree (pipeShade.js), `AGENTS.md:967` (`pipeMove.test.js` line); README if it mentions the motion (grep).
- `src/logic.js` `VERSION` 0.8.4 and a `src/changelog.js` entry (en + zh-Hans): "Moving pipes are a lighter pink and speed up with every level after level 4."
- Verify: `npm test`; `grep -rn "periodMs" src tests tools AGENTS.md | grep -i pipeMove` → nothing stale.
- Commit: `docs(step 4/4): moving pipes (speed, shade) in AGENTS; 0.8.4`
- Push: `npm run push` on Michael's word.

## Risks and notes
- L6–L7 get noticeably harder. If it's too much, lowering `speedStepPx` is the one-number change.
- Pairs rolled near the band edge swing less but keep the level's cycle, so they look slower. Same as today.
