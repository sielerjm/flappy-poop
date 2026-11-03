# AGENTS.md — project context for humans and AI agents

Read this first. It says what Flappy Poop is, where things live, which rules the
code depends on, and how to check your work. `README.md` is the player/maintainer
guide; this file is the map for anyone changing the code.

## What this is

Flappy Poop is a Flappy Bird clone for phone browsers: a poop emoji flaps through
the gut dodging pink intestinal-fold pipes. One point per pipe pair passed; fiber
is +1, bad bacteria is −2 (floor 0), and a probiotic blocks one bacteria hit for
up to 5 pipes. Hit a pipe, the ceiling, or the floor and the run ends (dead-poop
face). Best score and settings are kept in `localStorage`. Difficulty ramps
(faster pipes, narrower gap) until score 30, then stays flat. A signed
**save code** (`fp1.<payload>.<sig>`) carries a player's name and top 3 scores
between browsers via copy/paste; spec in `.claude/plans/Flappy Poop — Save Code Spec.md`.

It is a side project by Michael Sieler (gut-microbiome researcher), hence the
theme. It is deliberately small: plain ES modules, no bundler, no npm
dependencies, Phaser 4 loaded from a CDN, deployed to GitHub Pages straight from
`main`. Keep it that way unless the game clearly outgrows it.

- Repo: `github.com/sielerjm/flappy-poop` (the pre-2026 "joke version" that used
  to live there was replaced wholesale; nothing from it survives).
- Engine: Phaser **4.2.1**, pinned by exact version in `index.html`.
- Runtime: any modern mobile/desktop browser. Tests need Node 22+ (built-in
  `node --test`). `tools/` needs Python 3 + Pillow for art scripts.

## Repo map

```
index.html                  Entry page. Viewport/touch CSS, <script> for Phaser from
                            jsDelivr, then <script type=module src=src/main.js>.
manifest.webmanifest        PWA "Add to Home Screen" metadata (fullscreen, portrait).
package.json                Only `npm test` and `npm start`; no dependencies.
CREDITS.md                  Phaser + every assets/sfx/ file with a URL.

src/
  main.js                   new Phaser.Game(...): 720x1280 logical field, Scale.FIT,
                            roundPixels,
                            arcade physics, scene order
                            [Boot, Play, Over, Settings, About, HowTo, Language,
                            Feedback].
  config.js                 GAME_WIDTH / GAME_HEIGHT and the TUNING object. Every
                            feel-related number lives here. Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: rng, gap placement,
                            scoring, items, sprite angle, retry lockout, difficulty,
                            best-score store, settings store (incl. locale), vibrate
                            helper, trayLayout, trayHit, howToLayout, howToHit,
                            LAST_UPDATED, issueUrl, openExternalUrl, chromeIntent,
                            overlayOutsideHit, scaledCircleBody. Fully unit-tested.
  save.js                   Save codes, NO Phaser/DOM: loadLocal / saveLocal
                            (flappyPoop.save, schema 1), recordScore, isNewTop,
                            merge, summaryLine, exportCode / importCode (HMAC-SHA256
                            via Web Crypto, 16-byte tag, base64url), PARSERS per
                            wire version, SECRET constant (permanent). Fully
                            unit-tested.
  i18n.js                   en / zh-Hans string catalog, t(), initialLocale,
                            howToItems, pauseBannerText, metaFontSize, welcomeText.
                            Player copy lives here (not in logic.js). See
                            TRANSLATION_NOTES.md.
  sound.js                  WebAudio synth blips + setMuted/isMuted/attachGame.
                            setMuted also sets game.sound.mute (the fart MP3).
                            unlock() must run from a user gesture: create,
                            silent-prime, resume() the AudioContext, and
                            game.sound.unlock(). Blips wait until running.
  ui/
    tray.js                 Phaser wrapper around trayLayout: pause / mute / settings
                            plus bottom-left info, language (🌐), and feedback (💬).
                            Chrome taps use trayHit() in Play/Over, not GameObject
                            pointer handlers.
    savePanel.js            Plain DOM panel over the canvas (name field, read-only
                            code + Copy, Load field + status). Opened from Settings.
                            Disables game.input.keyboard while open so typing does
                            not flap. Copy calls clipboard.writeText inside the tap
                            handler (iOS); falls back to selecting the field.
  scenes/
    Boot.js                 preload() gameplay PNGs + fart.mp3, then start Play.
    Play.js                 State machine: 'ready' -> 'playing' -> 'paused'/'dead'.
                            Spawns pipes and items, tray, auto-pause, haptics, dies,
                            then launches Over as an overlay scene. Tray / keyboard
                            go through chromeIntent. Overlay order is feedback >
                            language > howto > about > settings. Opening Settings,
                            About, HowTo, Language, or Feedback while playing pauses;
                            closing them does not resume. Unpause applies flapVelocity
                            as a recovery bounce. Pause banner is two centered lines
                            from i18n. Locale via getLocale / applyLocale. Holds the
                            SaveState (loadLocal on create, seeded once from the
                            legacy best); die() records the score and passes newTop
                            to Over; saveLine under the ready hint shows
                            summaryLine(); getSaveState / setSaveState for the panel.
    Over.js                 Game-over panel (score, best, "tap to retry") with a
                            tap lockout and its own tray (mute still works). Shows
                            newTopHint when the run entered the top 3.
    Settings.js             Overlay: sound, haptics (Android only), music coming
                            soon, Save code link (opens the DOM panel), About
                            link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X.
    About.js                Overlay: author, LLM note, engine/art/sound credits,
                            How to play + feedback links, LAST_UPDATED under the
                            version. Tap outside the panel closes. Wrapped text uses
                            useAdvancedWrap for CJK.
    HowTo.js                Overlay: flap/pipe rules plus fiber / probiotic /
                            bacteria sprites and a feedback link. Ready-screen How
                            to play uses howToHit() so it does not start a run.
                            Opened from About, X/Esc/tap-outside closes HowTo and
                            About together. useAdvancedWrap on body text.
    Language.js             Overlay: English / 简体中文 picker (🌐 or L).
    Feedback.js             Overlay: Bug / Feature request chooser (💬, F, or links
                            from About/HowTo). Buttons open GitHub issue forms via
                            issueUrl() + openExternalUrl(); closing leaves any
                            parent overlay open.

assets/                     Contract PNGs + README.md (the art contract).
  README.md                 File name, pixel size, orientation rules. tests enforce it.
  poop.png poop-dead.png fiber.png probiotic.png bacteria.png
  pipe.png bg.png ground.png
  icon-192.png icon-512.png
  src/                      Original drawings; not in the size table.
  sfx/fart.mp3              Death sample.

tests/                      node --test, zero deps. Each file is self-describing:
  html.test.js              index.html invariants (viewport, no scroll, pinned Phaser)
  assets.test.js            load.image / load.audio paths; README sizes; sfx credits
  logic.test.js             gap bounds, rng determinism, hasPassed, angle
  difficulty.test.js        ramp is monotonic, caps, tightest gap still fits the poop
  state.test.js             retry lockout
  store.test.js             best-score store incl. throwing/missing storage
  settings.test.js          settings store + vibrate helper
  sound.test.js             sfx keys, mute, Node import
  tray.test.js              trayHeight / trayLayout geometry including info + lang +
                            feedback; trayHit centre hits vs miss in the tray gap
  items.test.js             rollItem, itemGapY, scoreAfterItem, probiotic inventory
  tuning.test.js            item / fartVolume sanity bounds
  about.test.js             About copy (both locales) names author, LLM, Phaser, JS, sound;
                            LAST_UPDATED has a year and a time
  howto.test.js             HOW_TO copy, pause banner, howToLayout / howToHit geometry
  feedback.test.js          issueUrl bug/feature templates; openExternalUrl paths;
                            feedback i18n keys
  i18n.test.js              catalog key parity, zh≠en (allowlist), TRANSLATION_NOTES
                            key coverage, scene English denylist, initialLocale
  overlay.test.js           overlayOutsideHit inside vs 1px outside HowTo/Settings panels
  hitbox.test.js            scaledCircleBody source radius/offset for 2x and 4x
  chrome.test.js            chromeIntent matrix across state x overlay x input
  smoke.test.js             logic.js imports and exports VERSION
  save.test.js              save codes: spec rows 1-10 (round trip, tamper, relabel,
                            v2 migration, merge, name rules, wrapped paste, empty
                            scores, throwing storage) + helper coverage
  serve.test.js             npm start points at tools/serve.py; bind + URL print

.github/ISSUE_TEMPLATE/     GitHub issue forms opened from Feedback (bug.yml,
                            feature.yml); config.yml allows blank issues.

tools/
  make_placeholders.py      Regenerates pipe / bg / ground / icons only. Must not
                            overwrite poop.png. Run only when you intend to.
  process_art.py            Crops assets/src/ drawings into 384x384 contract PNGs
                            (drawn at spriteDisplayScale 0.25 → 96 logical px).
                            Arcade circles use scaledCircleBody (Phaser source pixels).
  serve.py                  npm start: bind 0.0.0.0:8000, print laptop + phone URLs.

.claude/plans/              Checkpointed build plans. Historical record + decision
                            log. Don't edit completed plans; add a new plan file
                            for new multi-step work.
```

## Rules the code depends on

1. **Phaser-free logic stays in `src/logic.js`** (and save-code logic in
   `src/save.js`). Anything that can be a pure function (maths, state
   decisions, storage adapters) goes there with a test.
   Scenes in `src/scenes/` and `src/ui/` are thin wrappers that call it. This is
   what makes the game testable in Node, where Phaser cannot run.
2. **Tune numbers in `src/config.js`, never inline.** Scenes import `TUNING as T`.
   If you add a feel-related constant, add it to `TUNING` with a short comment
   and units (px, px/s, ms).
3. **Respect the art contract.** Asset file names and sizes are fixed by
   `assets/README.md`. Change a size only if you update that table AND the scene
   code that positions the sprite. `npm test` fails otherwise. The pipe image has
   its cap at the top and is flipped vertically for the top pipe; `bg.png` and
   `ground.png` must tile horizontally. Player/item redraws go through
   `assets/src/` + `tools/process_art.py`.
4. **Phaser stays pinned.** `index.html` loads `phaser@4.2.1` from jsDelivr.
   Bump it by changing that one tag; `tests/html.test.js` only checks the pin is
   an exact version. Phaser is a global (`Phaser.Scene`, `Phaser.Game`), not an
   import.
5. **No build step, no dependencies.** The site is served as-is from the repo
   root by GitHub Pages. Don't add a bundler, TypeScript, or npm packages without
   a strong reason; if you do, the deploy story has to change too.
6. **Mobile first.** Touch is the primary input (`pointerdown`); keyboard
   (Space / Up / M / P / Esc / S / I / L) is a convenience. Keep `touch-action: none`,
   the viewport meta, and the WebAudio unlock-on-gesture. Wrapped UI text that
   can show Chinese must set `useAdvancedWrap: true`. Test on a real phone
   when you touch input, scaling, audio, or locale.
7. **Storage can throw.** Private-mode Safari and blocked storage throw on
   `localStorage` access. Go through `createBestStore()`,
   `createSettingsStore()`, or `loadLocal()` / `saveLocal()` from `save.js`;
   never touch `localStorage` directly in scenes.
8. **Player-facing copy is multi-locale.** Change UI strings only in
   `src/i18n.js` for **every** locale (`en` and `zh-Hans`), update matching
   rows in `TRANSLATION_NOTES.md`, and do not hardcode English in scenes.
   If a string must stay identical across locales (brand, language names),
   add its key to the allowlist in `tests/i18n.test.js`. `npm test` fails
   when a locale or the notes file lags; run it before every commit and push.

## How to work on it

```bash
npm test          # run everything; must pass before committing
npm start         # tools/serve.py: http://localhost:8000 plus a printed
                  # http://<LAN-IP>:8000 for a phone on the same Wi-Fi
                  # (localhost on the phone is the phone, not the laptop)
python3 tools/process_art.py         # rebuild poop/items from assets/src/ (Pillow)
python3 tools/make_placeholders.py   # pipe / bg / ground / icons only
```

Scene behaviour (physics, rendering, audio) cannot be verified in Node. When you
change `src/scenes/*` or `src/sound.js`, say so and ask for a phone check; don't
report it as tested. `node --check src/scenes/Play.js` at least catches syntax.

Commits so far follow `type(scope): summary` (`feat`, `docs`, `chore`); keep it.

## Where to put new things

- New game mechanic → pure parts in `src/logic.js` + test in `tests/`, wiring in
  `src/scenes/Play.js`, knobs in `src/config.js`.
- New art → gameplay sprites via `assets/src/` + `tools/process_art.py` + a row
  in `assets/README.md` + `load.image()` in `src/scenes/Boot.js`. Remaining
  placeholders still go through `make_placeholders.py`, which must not overwrite
  `poop.png`.
- New sound → a `blip()` preset in `src/sound.js`, **or** a file in `assets/sfx/`
  plus a `CREDITS.md` row with a URL plus `this.load.audio()` in Boot.
- New scene → `src/scenes/`, register in the `scene:` array in `src/main.js`.
- New UI chrome → `src/ui/` (Phaser wrapper) with any pure layout helper in
  `src/logic.js`. Text input belongs in a DOM panel like `src/ui/savePanel.js`,
  not Phaser UI.
- Save-code wire format change → bump `CURRENT_VERSION` in `src/save.js`, add
  `parseVN` to `PARSERS`, never delete an old parser, never change `SECRET`.
- New UI string → both locales in `src/i18n.js` + a row in `TRANSLATION_NOTES.md`
  (+ allowlist in `tests/i18n.test.js` only if intentionally identical). Scenes
  call `t(locale, key)`; never hardcode player English.
- Multi-step work worth planning → a dated markdown plan in `.claude/plans/`.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
- Locale copy review for LLMs → `TRANSLATION_NOTES.md` (keep in sync with `src/i18n.js`).
