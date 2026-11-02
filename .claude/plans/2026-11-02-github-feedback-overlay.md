# 2026-11-02 — GitHub feedback overlay

## Goal

Let players file bugs and feature requests from the game via GitHub issue forms.

## Decision

- Primary entry: bottom-left tray message button (`💬`) beside language (`info | lang | feedback`).
- Secondary: pink **Bug or feature request?** links on About and HowTo open the same Feedback overlay.
- Feedback is a chooser only; Bug / Feature call `window.open` to
  `issues/new?template=bug.yml|feature.yml`.
- Templates live in `.github/ISSUE_TEMPLATE/`. Closing Feedback does not tear down
  parent overlays (unlike HowTo → About).

## Done when

- Tray + About/HowTo open Feedback; GitHub templates exist; chromeIntent/tests/docs updated.
