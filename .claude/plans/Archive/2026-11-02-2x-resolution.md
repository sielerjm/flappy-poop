# 2× resolution + anti-jitter (2026-11-02)

## Goal

Sprites looked blocky on desktop and crawled while moving: 48 logical-px characters
on a 360×640 canvas, CSS-stretched by `Scale.FIT`, plus subpixel physics and
continuous tilt.

## Done

- Art contract: character/items **384×384**, pipe **128×960**, bg **720×1280**,
  ground **720×128** (`process_art.py`, `make_placeholders.py`, `assets/README.md`).
- Playfield **720×1280**; all TUNING px / px/s doubled; `spriteDisplayScale` 0.25
  → 96 logical px; UI fonts/panels/offsets doubled.
- `roundPixels: true` + whole-degree `angleForVelocity` (`angleFallRefVy` in TUNING).
- Tests and AGENTS/README/TRANSLATION_NOTES updated.

## Out of scope

Dynamic DPR, 3× fill-rate, redrawing source art.

## Phone check

Scene/render change — verify on a real phone that sprites stay sharp, feel
unchanged relative to the field, and tray/overlays still fit.
