# Plan: scaled hitboxes and 4x textures
- Created: 2026-11-02
- Status: complete
- Baseline: v0.2.4 on `main`

## Goal
Arcade circle bodies use Phaser source pixels, so 96px textures at 0.5 scale made world hitboxes half the sprite. Convert logical radii via `scaledCircleBody`. Rebuild poop/items at 192px (4x) drawn at 0.25.

## Result
Shipped as `0.2.5`. World poop/item radii stay 17 / 16 logical px. Pipes unchanged.

Manual-only: graze a fiber; pipe hits match the drawing; sprites look less pixelated on a phone.
