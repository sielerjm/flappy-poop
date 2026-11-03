# AGENTS.md — project context for humans and AI agents

Read this first. It says what Flappy Poop is, where things live, which rules the
code depends on, and how to check your work. `README.md` is the player/maintainer
guide; this file is the map for anyone changing the code.

## What this is

Flappy Poop is a Flappy Bird clone for phone browsers: a poop emoji flaps through
the gut dodging pink intestinal-fold pipes. One point per pipe pair passed; fiber
is +1, bad bacteria is −2 (floor 0), and a probiotic blocks one bacteria hit for
5 pipes (pickups stack; a hit clears the stack). From pipe 5 a bean bobs between pipe
pairs (15 % per pair to pipe 20 with one guaranteed by guaranteeScore, 6 % after);
one bean charges a fart
power (stink lines + glow; tap the poop) that plays `fart_accelerate.mp3`, ramps the
scroll speed up and down with the clip so five pipes pass, and cannot die. Hit a pipe, the ceiling, or the floor and the run ends (dead-poop
face). Best score and settings are kept in `localStorage`. Difficulty ramps
(faster pipes, narrower gap) until score 30, then stays flat. A signed
**user code** (`fp1.<payload>.<sig>`, the save code) carries a player's username
and best 6 scores between browsers via copy/paste (Save / Load User button on the
ready screen); spec in `.claude/plans/Flappy Poop — Save Code Spec.md`.

It is a side project by Michael Sieler (gut-microbiome researcher), hence the
theme. It is deliberately small: plain ES modules, no bundler, no npm
dependencies, Phaser 4 loaded from a CDN, deployed to GitHub Pages straight from
`main`. Keep it that way unless the game clearly outgrows it.

- Repo: `github.com/sielerjm/flappy-poop` (the pre-2026 "joke version" that used
  to live there was replaced wholesale; nothing from it survives).
- Engine: Phaser **4.2.1**, pinned by exact version in `index.html`.
- Runtime: any modern mobile/desktop browser. Tests need Node 22+ (built-in
  `node --test`). `tools/` needs Python 3 + Pillow for art scripts
  (`uv run --with pillow python3 tools/process_art.py` works without installing it).

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
                            Feedback, Scores].
  config.js                 GAME_WIDTH / GAME_HEIGHT and the TUNING object. Every
                            feel-related number lives here. Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: rng, gap placement,
                            scoring, items, beans (rollBean, beanSpawnX, beanY,
                            beanAngle, poopTapHit), fart envelope (pipeSpacing,
                            fartPeakMul, fartMul), sprite angle, retry lockout, difficulty,
                            best-score store, settings store (incl. locale), vibrate
                            helper, trayLayout, trayHit, readyLayout, readyHit
                            (howToLayout / howToHit wrap them),
                            LAST_UPDATED, issueUrl, openExternalUrl, chromeIntent,
                            overlayOutsideHit, clampScroll, scaledCircleBody. Fully
                            unit-tested.
  save.js                   Save codes, NO Phaser/DOM: loadLocal / saveLocal
                            (flappyPoop.save, schema 2: top entries { score,
                            toilet }; schema 1 numbers still load; MAX_TOP = 6),
                            recordScore(state, score, { toilet }), isNewTop,
                            merge, topScores, formatScore ("🚽 41"), summaryLine,
                            profileLine, exportCode / importCode (HMAC-SHA256,
                            v1 payload {i, n, s, p, t}; p = optional toilet flags;
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
    button.js               createButton(): Graphics rounded rect + centred text
                            for the ready-screen boxes from readyLayout. No pointer
                            handlers; Play resolves taps with readyHit().
    toggle.js               createToggle(): toilet switch (pill track, knob tween,
                            🚽 alpha) from readyLayout().toilet; setOn(). No pointer
                            handlers.
    scrollView.js           createScrollView(): second camera clipped to a panel
                            interior, drag / wheel via clampScroll(), thumb, link()
                            that fires on pointerup only when moved < 12 px. Used
                            by HowTo and About.
    savePanel.js            Plain DOM panel over the canvas (Username field,
                            read-only user code + Copy, Load field + status).
                            Opened from the ready-screen Save / Load User button.
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
                            to Over. Ready screen (readyLayout: title, poop spot
                            wearing poop-speech.png's "TAP TO FLAP!" bubble, then
                            toilet toggle / How to play / Save / Load User /
                            profileLine() buttons; profile hidden until a username
                            is set; any other tap starts); launch() swaps to the
                            plain poop frame and slides it to poopX over
                            launchSlideMs, then start(); extra taps during the
                            slide are ignored (launching flag). Toilet mode:
                            this.toilet from the registry (session-only), toggle
                            under tap to flap, 🚽 HUD left of the score while
                            playing, passed to recordScore and Over. Beans: group
                            spawned in spawnPipePair (rollBean with beanSpawned for
                            the one-per-run guarantee, halfway to the next pair), bobbed in update() from per-bean elapsed ms;
                            collectBean → effects.addBean; setCharged() alternates
                            stink frames + pulses this.glow and the bean button in
                            the tray centre slot (beanButtonLayout, same period); a
                            tap on the poop (poopTapHit) or the button
                            (beanButtonHit) calls activatePower(): fart texture,
                            alpha tween, fart_accelerate clip, effects.activatePower
                            (clip length), scrollMul from fartMul() each frame via
                            applyScroll(); the poop floats at mid-height (gravity
                            off, doFlap ignored); spawnHeldByFart() stops pipe
                            spawning once fartRemainingDistance() < pipeClearDistance()
                            so the screen is clear at the end; endPower() restores
                            gravity and spawns the next pair at the right edge with
                            its gap at mid-screen (centreNextGap → centredGapY),
                            graceLeftMs blocks die(). Pipes spawn by scrolled distance (pipeSpacing),
                            not a timer. Nothing here reads time.now;
                            readyHit() routes taps (howto, start, saveload, profile
                            → Scores). getSaveState / setSaveState for the panel.
    Over.js                 Game-over panel (score, best, "tap to go home") with a
                            tap lockout and its own tray (mute still works). Shows
                            newTopHint when the run entered the top 6.
    Settings.js             Overlay: sound, haptics (Android only), Reload game
                            (reloadGame(): location.replace with a fresh r= query,
                            for home-screen installs), About link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X.
    About.js                Overlay: author, LLM note, engine/art/sound credits
                            (both fart clips), How to play + feedback links,
                            LAST_UPDATED under the version, inside
                            createScrollView(). Tap outside the panel closes.
                            Wrapped text uses useAdvancedWrap for CJK.
    HowTo.js                Overlay: flap rules plus pipe / fiber / probiotic /
                            bacteria / bean / toilet rows (howToItems, pipe first;
                            the pipe icon is a cropped cap slice, toilet is the 🚽
                            emoji) and a feedback link, inside createScrollView(). Ready-screen How
                            to play uses howToHit() so it does not start a run.
                            Opened from About, X/Esc/tap-outside closes HowTo and
                            About together. useAdvancedWrap on body text.
    Language.js             Overlay: English / 简体中文 picker (🌐 or L).
    Feedback.js             Overlay: Bug / Feature request chooser (💬, F, or links
                            from About/HowTo). Buttons open GitHub issue forms via
                            issueUrl() + openExternalUrl(); closing leaves any
                            parent overlay open.
    Scores.js               Overlay: username + up to 6 high scores from the
                            SaveState; opened by tapping the profile line.

assets/                     Contract PNGs + README.md (the art contract).
  README.md                 File name, pixel size, orientation rules. tests enforce it.
  poop.png poop-dead.png poop-stink1.png poop-stink2.png poop-fart.png
  poop-speech.png fiber.png probiotic.png bacteria.png bean.png
  pipe.png bg.png ground.png
  icon-192.png icon-512.png
  src/                      Original drawings; not in the size table.
  sfx/fart.mp3              Death sample.
  sfx/fart_accelerate.mp3   Fart power-up clip; its duration is the power length.

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
                            scores, throwing storage) + helper coverage, best 6
  ready.test.js             readyLayout boxes inside the field, non-overlapping,
                            clear of the bobbing poop; readyHit centre / gap / profile
  serve.test.js             npm start points at tools/serve.py; bind + URL print

.github/ISSUE_TEMPLATE/     GitHub issue forms opened from Feedback (bug.yml,
                            feature.yml); config.yml allows blank issues.

tools/
  make_placeholders.py      Regenerates pipe / bg / ground / icons only. Must not
                            overwrite poop.png. Run only when you intend to.
  process_art.py            Crops assets/src/ drawings into 384x384 contract PNGs
                            (drawn at spriteDisplayScale 0.25 → 96 logical px);
                            the poop set (alive / dead / stink1 / stink2 / fart /
                            speech) shares one body scale and centre, stink / fart /
                            speech on bigger squares; bean.png from Kidney_Bean.png.
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
   (Space / Up / M / P / Esc / S / I / L / F / B) is a convenience. Keep `touch-action: none`,
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
# In a browser, globalThis.__flappy is the Phaser.Game (debug / automation only):
#   __flappy.scene.getScene('Play').spawnPipePair()
npm start         # tools/serve.py: http://localhost:8000 plus a printed
                  # http://<LAN-IP>:8000 for a phone on the same Wi-Fi
                  # (localhost on the phone is the phone, not the laptop)
uv run --with pillow python3 tools/process_art.py   # rebuild poop set / items / bean from assets/src/
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
