# Plan: About overlay and settings pause-until-tap
- Created: 2026-11-02
- Status: complete
- Baseline: v0.2.0 on `main`

## Goal
Standalone About overlay (bottom-left `(i)`, also linked from Settings) with author / art / LLM / sound / engine credits. Opening Settings or About mid-run pauses; closing either leaves the pause banner until a new tap or Space. Button behaviour is locked in `chromeIntent` and tested for every game state and overlay.

## Result
Shipped as `0.2.1`. Phaser 4 `scene.stop('Key')` from inside that scene does not shut it down; overlays call `this.scene.stop()` with no key, and `bringToTop()` in `create()` so About stacks above Settings and Over.

Manual-only (not marked tested): phone pass on touch targets, dimmer swallowing tray taps, and audio unlock.
