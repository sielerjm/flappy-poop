# Plan: How to play, pause bounce, and iOS audio
- Created: 2026-11-02
- Status: complete
- Baseline: v0.2.2 on `main`

## Goal
Fix iOS silence (resume + silent unlock before blips), bounce on unpause so the resume tap lifts the poop, update the pause banner copy, and add a ready-screen How to play overlay with fiber / probiotic / bacteria sprites.

## Result
Shipped as `0.2.3`.

- `unlock()` primes a 1-sample silent buffer, `resume()`s WebAudio and Phaser sound, and blips wait until the context is `running`.
- `resumePlay()` applies `flapVelocity` and no longer sets `flapLockedUntil` (overlay close still uses `armResumeLockout()`). Banner: `PAUSED — tap anywhere to resume`.
- Ready-screen How to play is hit-tested via `howToHit()` so it cannot start a run. `HowTo` scene shows `HOW_TO_PLAY_TEXT` plus `HOW_TO_ITEMS` sprites.

Manual-only (not marked tested): phone flap blip, pause bounce, How to play overlay.
