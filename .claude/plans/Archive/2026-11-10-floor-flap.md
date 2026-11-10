# Plan: a tap on the floor lifts the poop again (Invincible / fart grace)
- Created: 2026-11-10
- Status: complete
- Baseline: `76ef9c2` on `main` (pushed; tree clean).
- Whole-suite verification: `npm test` (448 pass); `npm run smoke` (336, full).
- Repo plan copy: `.claude/plans/2026-11-10-floor-flap.md` (`git add -f`), archived when done.

## Context
In test mode with Invincible on, once the poop drops onto the floor, a tap barely lifts it, so it takes several quick taps to climb off the floor.

A headless probe at 720×1280 (floor line y = 1104, flap −760 px/s) showed why:

| frame | sprite y as `update()` sees it | velocity |
|---|---|---|
| resting | 1104.7 (0.7 px below the line) | 43, then the clamp sets 0 |
| tap: physics step | sprite not yet moved (body already ~12 px up) | −717 |
| tap: `update()` | 1104.7 > 1104, so the clamp runs **`setVelocityY(0)`** | 0 |
| after the frame | 1092 (the step's 12 px is all you get) | 0, falls again |

**Cause:** the clamp in `Play.update()` (`src/scenes/Play.js` ~line 3004) zeroes *all* vertical velocity whenever the sprite is past the ceiling or floor. Arcade writes the physics step back to the sprite only after `update()`. On the tap frame the sprite still reads a hair below the floor from the last gravity step, so the clamp cancels the flap it was just given.

The same clamp also runs during the bean fart (`powerActive`) and the short grace after it (`graceLeftMs`). A real player who taps while touching the floor in that grace window loses the flap the same way. So this is not only a test-mode bug, though test mode is where it is easy to see.

**Fix:** at the floor, cancel only downward speed; at the ceiling, cancel only upward speed. A flap from the floor keeps its upward speed, and a fall from the ceiling keeps its downward speed. The position clamp is unchanged.

## Steps

### Step 1/2: the clamp keeps a flap away from the floor  [done]
- **Change:**
  - `src/logic.js`: a pure `clampToPlayArea(y, vy, top, floor)` → `{ y, vy }`. y is clamped to [top, floor]. vy becomes 0 only if it pushes further out (vy > 0 at or past the floor, vy < 0 at or past the ceiling). Otherwise vy is returned unchanged.
  - `src/scenes/Play.js`: the `powerActive || graceLeftMs > 0 || testInvincible()` branch of the strip check uses it: sets `poop.y`, and calls `setVelocityY` only when vy changed. The `die()` branch and the dead / respawn floor pin are unchanged.
- **Tests:**
  - `tests/logic.test.js` (or whichever file holds the strip / angle helpers), `clampToPlayArea`:
    - a flap below the floor (−717) keeps −717 at the floor line;
    - a fall below the floor (+43) becomes 0;
    - rising past the ceiling (−300) becomes 0;
    - falling from the ceiling (+100) is kept;
    - inside the band, nothing changes.
  - Smoke (`testmode`, next to the existing "Invincible: the poop is clamped at the floor" check):
    - let the poop rest on the floor with gravity on for ~500 ms;
    - call `flap()` once;
    - over the next ~350 ms the highest point is at least 80 px above the floor line (a whole flap rises 760² / (2 × 2600) ≈ 111 px; the broken one gave 12).
  - I'll run the new smoke check once **before** the Play change to confirm it fails (the probe gives ~12 px).
- **Verify:** `npm test`; `npm run smoke -- --only=testmode`; full smoke.
- **Commit:** `fix(play): a tap on the floor lifts the poop under Invincible and the fart grace`
- **Result:** new smoke check failed first (12 px), passes after (105 px); npm test 449/449; full smoke 337/337.

### Step 2/2: docs and 0.10.1  [done]
- **Change:**
  - `VERSION` 0.10.1 and `src/changelog.js` 0.10.1 (en + zh-Hans), one line: in test mode with Invincible, and just after a fart, a tap on the floor lifts you again.
  - `AGENTS.md`: the Play.js note on testInvincible (~line 734) says the clamp stops only motion further into the strip, and names `clampToPlayArea` among the logic.js helpers.
  - Archive this plan.
- **Verify:** `npm test` (the changelog test needs the first entry to match VERSION); full smoke.
- **Commit:** `docs: floor flap fix in AGENTS; 0.10.1`
- **Result:** step 1 commit `c463b95`; npm test and full smoke green after the bump.
- **Push:** only on Michael's word.

## Risks and notes
- **Fart float:** if the float ever drives the poop into a strip, it now keeps its wave speed away from the edge instead of stopping dead. That is the intended behaviour; the fart smoke (`farts`, 27 checks) guards it.
- **No server or data change.** A plain revert undoes it.
