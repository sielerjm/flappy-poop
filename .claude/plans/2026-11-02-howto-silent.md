# Plan: How to play Silent note, pause banner, tap-outside close
- Created: 2026-11-02
- Status: complete
- Baseline: v0.2.5 on `main`

## Goal
Tell players that iPhone Silent mode mutes Web Audio. Stop the pause banner clipping the 360px field. Close overlay panels by tapping the dimmer, not only X.

## Result
Shipped as `0.2.6`. How to play mentions Silent. Pause banner is two centered lines (`PAUSED` / `tap anywhere to resume game`). HowTo, About, and Settings call `close()` on `overlayOutsideHit`.

Manual-only: extra HowTo line does not sit on Fiber; both pause lines fully visible; tap outside closes; tap inside the panel (not X) does not.
