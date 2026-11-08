# Plan: About How to play link, last-updated, 2x sprites
- Created: 2026-11-02
- Status: complete
- Baseline: v0.2.3 on `main`

## Goal
How to play link on About; last-updated stamp under the version; X/Esc on HowTo opened from About returns to a paused run; 96px player/item textures drawn at 48 logical px.

## Result
Shipped as `0.2.4`.

- Overlay order is howto > about > settings. `howto` from About opens HowTo without pausing again. Close HowTo with About underneath closes both and arms the resume lockout.
- About shows How to play, `v0.2.4`, and `Updated` + `LAST_UPDATED`.
- `process_art.py` writes 96x96; Play uses `spriteDisplayScale: 0.5`.

Manual-only: mid-run (i) → How to play → X → pause banner; sharper poop/items on a phone.
