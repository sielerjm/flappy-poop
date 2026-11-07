# AGENTS.md — project context for humans and AI agents

Read this first. It says what Flappy Poop is, where things live, which rules the
code depends on, and how to check your work. `README.md` is the player/maintainer
guide; this file is the map for anyone changing the code.

## What this is

Flappy Poop is a Flappy Bird clone for phone browsers: a poop emoji flaps through
the gut dodging pink intestinal-fold pipes. One point per pipe pair passed; fiber
is +3 (it sits between pipe pairs like a bean), bad bacteria is −3 (floor 0; never before level 2, pair 5), and a probiotic blocks one bacteria hit for
5 pipes (pickups stack; a hit clears the stack). Fiber eaten while a probiotic is up makes a
**postbiotic** (`effects.applyFiber`): pipes and fiber score × `items.postbioticMultiplier` (2) until
the probiotic countdown ends, fart pipes included; another probiotic extends it, a hit ends it. A
**mystery box** (`TUNING.mystery`, spinning spritesheet) opens into one reward: probiotic 20 %, one bean 20 %,
a 5-pipe postbiotic 5 % (×2 already on), three beans 5 %, a skip to the end of the level 1 %, else fiber
(`rollMystery`); a draw that cannot do anything (bean with a full bag, skip with the finish line out) becomes
fiber (`resolveMystery`). A skip scores every pair left in the level at the current multiplier (countdown
paused, like a fart), clears what is ahead and brings the finish line in from the right edge. The first
box is guaranteed after one of level 3's first four pairs (`scriptedMysteryPair`, so before pipe 5); on every
later pair boxes roll at half fiber's weight (`mysteryRolls`). On level 3 they hold still midway between two
gaps; from level 4 they bob at half fiber's speed (`mysteryMoves`). Level 1 is
scripted (probiotic at pair 3, fiber after 4 and 7, a bean after 9) and its fiber and bean hold still midway
between the two gaps; from level 2 they bob and a bean rolls per pair
(15 % per pair to pipe 20 with one guaranteed by guaranteeScore, 6 % after);
beans stack to maxBeans (3); one charges a fart power (stink lines + glow; tap the poop
or the bean button) that plays `fart_accelerate.mp3`, ramps the scroll speed up and
down with the clip so five pipes pass (superPipes = 20 with superBeans = 3 held, under
a rainbow glow), floats the poop on a ±15° undulating wave, and cannot die; items pass
through it and the probiotic countdown pauses. A normal fart spends one bean (the rest stay in the bag, up to maxBeans); a super fart spends all three. Hit a pipe, the ceiling, or the floor and the run ends (dead-poop
face). Best score and settings are kept in `localStorage`. The run is cut into
**levels** by pipe pairs passed (`pipesPassed`, fart pipes included; score never):
level n is `levels.pipes[n − 1]` (10, 25, then 50 each); ends at 10, 35, 85, 135,
185, 235, 285. Level 7 (rectum, `levels.lastLevel`) is the last: crossing its finish
line wins the run (`win()`, Over headline "YOU MADE IT OUT!", score saved at level 7).
Pipe spacing is `pipeSpacing(level)`: `pipeSpacingPx` (412) from
`levels.spacingRefLevel` (3) on, scaled by the speed ratio on the slower levels
before it (487 px on level 1, 446 on level 2); speed is
`levelSpeed()` (275 + 25 per level, cap 450), applied when the break ends; the gap
is `levelGap()` (`gapHeight` × `levels.gapScale[level − 1]`: 1.1, 1.05, then 1). One spacing after a level's last pair a checkered finish
line (generated texture, plain Image) scrolls in and no pair follows it outside a
fart; crossing it (any level but the last) bumps `level`, plays `NewLevel.mp3` (`sfx.levelUp` blip if the
sample is missing), and pauses the run as the
level break (`levelBreak`, the normal `'paused'` state with its own banner "LEVEL n
· segment / Tap to continue", the poop gliding to mid-height and bobbing, the
background crossfading to `levelColor(n, LEVEL_COLORS)`, Set2 colours cycling). A fart never carries the poop past
the line: crossing it cancels the power (`effects.cancelPower()`, `endPower()`),
so only the pairs actually passed have scored, and the break starts at once. A progress bar (`ui/levelBar.js`) fills one
step per pair. Each top score remembers its level. A signed
**user code** (`fp1.<payload>.<sig>`, the save code) carries a player's username
and best 6 scores between browsers via copy/paste (Save / Load User button on the
ready screen); spec in `.claude/plans/Flappy Poop — Save Code Spec.md`.
**Test mode** is a session-only sandbox: typing either of `TEST_MODE.words` (`pooptest` or `testpoop`, any
case) as the username and pressing Save toggles it (a trigger word is never stored as a name, so it can
never relabel the player's leaderboard row). Settings then grows a test section:
start level for the next run (`testRunStart`: the pairs before it passed, a par score), Invincible (on by
default; pipes, ceiling and floor cannot kill), power-up buttons (`grantTest` → `openMystery`) and Exit.
A test run (`runIsTest`, latched for the whole run) records nothing: no legacy best, top list or
leaderboard sync, and Over says so. A 🧪 badge shows while it is on.

It is a side project by Michael Sieler (gut-microbiome researcher), hence the
theme. The logical field is 1280 px tall and as wide as the window's aspect asks,
from a phone portrait (720, `GAME_WIDTH`) to 2:1 (`FIELD`, `fieldWidth()`), so a
desktop window fills sideways; the world (background, pipes, items, dimmers) spans
the whole width, the chrome (tray, level bar, HUD, ready buttons) keeps its phone
layout in a centred 720 px column (`uiColumn()`), and the poop sits at
`poopXFrac` (25 %) of the width (`poopX()`). The width is fitted on every Play
(re)start (`applyFieldSize`); a window resize or a phone rotation re-fits at once on
the ready screen and otherwise after Home (`onFieldResize` → `update()`), never
mid-run: a running run auto-pauses at that moment. Android home-screen installs are
portrait-locked by the manifest (iOS ignores that), by choice. A run start,
the end of a level break and the end of a fart pre-fill the field (`prefillPipes`,
`prefillPairs`): the first pair `pipeLead` ahead (the phone's `pipeLeadPx`, 668 px, plus
`prefill.leadGrowth` of the width beyond a phone's, so on a wide field the first pipes
settle a little past the middle: a buffer before the poop reaches them), then one per
spacing to the edge (a phone keeps its one edge spawn); a skip's finish line gets the
same lead. On a wide field
the pre-filled stretch does not pop in: it sweeps in from the right edge over
`prefill.sweepMs` (`sweepOffset`: quadratic ease-out, fastest off the edge and braking
to the level's scroll speed by about the field's middle, fading from transparent),
settling exactly where the pre-fill put it.
It is deliberately small: plain ES modules, no bundler, no npm
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
package.json                `npm test`, `npm start`, `npm run push`; no dependencies.
CREDITS.md                  Phaser + every assets/sfx/ file with a URL.

src/
  main.js                   new Phaser.Game(...): fieldWidth(window) x 1280 logical
                            field (720 on a phone, wider on desktop), Scale.FIT,
                            a debounced window resize (a phone rotation too) →
                            Play.onFieldResize() when the width would change,
                            roundPixels,
                            arcade physics, input.gamepad on (bound once, in
                            Play), scene order
                            [Boot, Play, Over, Settings, About, HowTo, Changelog,
                            Language, Feedback, Scores, Leaderboard].
  config.js                 GAME_WIDTH / GAME_HEIGHT (the portrait field = the
                            chrome column), FIELD (height, minWidth, maxWidth,
                            resizeDebounceMs), the TUNING object (every
                            feel-related number lives here; poopXFrac = the
                            player's share of the width; prefill.leadGrowth /
                            sweepMs = the pre-fill's lead and sweep-in on a wide
                            field), and LEADERBOARD
                            (Supabase Data API URL + publishable key, both public
                            by design; timeout, limit = the Top 25, visibleRows = the
                            ten in the board's window, storage key, score cap),
                            LEVELS (gut segment name keys, in order), LEVEL_COLORS
                            (Set2 backgrounds, cycling) and BACKGROUND (overlay
                            layers: key + parallax), TEST_MODE (trigger words,
                            default Invincible). TUNING.gamepad = the pad's
                            standard-mapping button indices (A / B / Y / RT /
                            Menu / d-pad), RT threshold, stick deadzone + repeat;
                            TUNING.focus = the focus ring's geometry, fill alpha,
                            pulse and the overlay scroll step.
                            Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: field (fieldWidth,
                            uiColumn, poopX, pipeLeadPx, pipeLead, prefillPairs,
                            sweepOffset;
                            trayLayout /
                            levelBarLayout / readyLayout / howToLayout take a
                            trailing x0 = the column's left edge), rng, gap placement,
                            scoring (pipePoints, scorePopup, multiplierLayout),
                            items (rollItem, hazardsAllowed, bandItemsMove,
                            bandMidY, tutorialSpawn), beans (rollBean, beanSpawnX, beanY,
                            beanAngle, bobY, gapBobAmplitude, gapBobY,
                            poopTapHit; beanButtonHit's circle is twice the
                            drawn button), poopFrame (the live poop's texture
                            key: plain / stink frame, or the falling faces at
                            fallLookVy px/s down), fart envelope (pipeSpacing,
                            fartPeakMul, fartMul, fartRemainingDistance), fartFloat
                            (wave + tilt), hsvToRgb / rainbowHue, glowAlphaAt /
                            glowStops, sprite angle, VERSION (bump it when art
                            under an existing file name changes: Boot's ?v=; every
                            bump needs a CHANGELOG entry), versionText(locale,
                            version) = the "v0.5.16 beta" line every overlay shows, retry
                            lockout, levels (levelPipes, levelEnd, levelFor, isFinalLevel,
                            levelSpeed, levelName, levelColor, levelProgress,
                            levelBarLayout, lerpColor),
                            best-score store, settings store (incl. locale and
                            howToSeenAt) + howToPromptDue, vibrate
                            helper, trayLayout, trayHit, readyLayout, readyHit
                            (howToLayout / howToHit wrap them),
                            LAST_UPDATED, issueUrl, openExternalUrl, chromeIntent
                            (inputs incl. 'changelog'; a Changelog over About closes
                            back to About without the lockout),
                            overlayOutsideHit, clampScroll, scaledCircleBody; gamepad:
                            padAction (button index → action), stickNav, focusNearest
                            (spatial: the nearest item in a direction, straight
                            ahead beating a diagonal), focusStep (list order,
                            wrapping: the fallback), focusRingLayout, padIntent
                            (the pad's state matrix beside chromeIntent: what A / B /
                            RT / Menu / Y / nav do on Play, Over or an overlay); test mode:
                            isTestWord, testRunStart, nextTestLevel, TEST_POWERS,
                            settingsLayout (Settings panel + rows, taller with the
                            test section). Fully unit-tested.
  changelog.js              What's new data, NO Phaser/DOM: CHANGELOG (one entry per
                            version, newest first: version, date like LAST_UPDATED's
                            day, notes per locale), changelogEntry, changelogNotes
                            (bulleted block for a locale, English fallback).
  leaderboard.js            Shared leaderboard, NO Phaser/DOM: submitPlan / submitPlans
                            (pure: what to post; up to two rows per player, best
                            off and best on the toilet, via save.js bestByToilet),
                            createSubmitStore (flappyPoop.leaderboard: last
                            confirmed submit per kind, { off, on }), submitScore /
                            fetchTop / fetchRank(id, toilet) over the Supabase
                            REST API with an injected fetch, apikey header only,
                            4 s abort, false / null on any failure, never throws.
                            Writes go through the submit_score() SQL function.
                            Fully unit-tested with a fake fetch.
  share.js                  Game-over share, NO Phaser; navigator / document / URL
                            injected: shareMode ('share' when
                            canShare({ files }), else 'download'), shareScoreImage
                            (navigator.share called synchronously inside the tap;
                            AbortError = cancelled; other errors and no share sheet
                            → <a download> PNG; never rejects).
  save.js                   Save codes, NO Phaser/DOM: loadLocal / saveLocal
                            (flappyPoop.save, schema 3: top entries { score,
                            toilet, level }; schema 1 numbers and schema 2 still
                            load at level 1; MAX_TOP = 6), recordScore(state,
                            score, { toilet, level }), isNewTop,
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
                            setMuted also sets game.sound.mute (the MP3 samples).
                            unlock() must run from a user gesture: create,
                            silent-prime, resume() the AudioContext, and
                            game.sound.unlock(). Blips wait until running.
  input/
    pad.js                  bindPad(scene, onAction, t): Phaser Gamepad plugin →
                            pad actions. Edge-triggered 'down' (holding A flaps
                            once), RT threshold lowered on connect, sticks polled
                            on the scene update with key-repeat, a console warning
                            on a non-standard mapping; returns padDown(index) /
                            padNav(dir) shims for the smoke driver. Only Play binds.
  ui/
    focus.js                createFocus(scene, t, { items, scrolled, onVertical }):
                            the controller focus ring, a pulsing pink rounded
                            outline (Graphics, depth 1000) around one item of a
                            scene over a faint white fill (focus.fillAlpha) that
                            is moved in the display list to sit directly under
                            the focused object (same depth; a box item: just
                            under createButton's depth; a Zone: no fill), so the
                            button's art draws over it; a nav press moves to the
                            nearest visible item in that direction (focusNearest)
                            and falls back to the list order (focusStep, wrapping)
                            when nothing lies that way; the ring rings one item of a
                            scene; items are { id, obj | box, activate, visible?,
                            scrolled? }, pressable(id, obj) wraps a Game Object
                            whose own pointerdown is the press. Shows only in
                            controller mode (registry padMode: set by a pad press,
                            cleared by the scene's next pointerdown), so touch and
                            mouse never see it. scrolled items are ringed by a
                            second Graphics the scroll camera alone renders.
    finish.js               createFinishTexture(): black / white checkered
                            canvas texture for the finish line.
    levelBar.js             createLevelBar(): grey track, pipe-pink fill tweened
                            one step per pipe (levelProgress), LV n label, 🏁;
                            geometry from levelBarLayout().
    glow.js                 createGlow(): white radial-gradient canvas texture
                            (solid core, outer glowFadeFrac fading to 0, from
                            glowStops) as an Image behind the poop; tinted for
                            the rainbow, alpha / scale tweened by Play.
                            createRectGlow(): rounded-rect halo (canvas shadow
                            with the box cut out) for the "Enter username" prompt.
    tray.js                 Phaser wrapper around trayLayout: leaderboard (🏆) /
                            mute / settings bottom-right, pause directly above the
                            cog, plus bottom-left info, language (🌐), feedback (💬).
                            Chrome taps use trayHit() in Play/Over, not GameObject
                            pointer handlers. Returns buttons (id → circle) for the
                            focus ring.
    shareCard.js            The share image, NO Phaser: drawShareCard(ctx, layout,
                            data, images) paints the 1080x1350 card with Canvas 2D
                            (dark fill, pink frame, GAME OVER or the gold win line,
                            the happy poop in a tan level-1 frame, score · level,
                            fiber / probiotic / postbiotic over bacteria / bean /
                            mystery-icon, the pipe cap ×n, the Play: link);
                            renderShareCard() draws it on a fresh canvas and
                            resolves canvas.toBlob's PNG or null (never rejects).
    button.js               createButton(): Graphics rounded rect + centred text
                            for the ready-screen boxes from readyLayout. No pointer
                            handlers; Play resolves taps with readyHit().
    toggle.js               createToggle(): toilet switch (pill track, knob tween,
                            🚽 alpha) from readyLayout().toilet; setOn(). No pointer
                            handlers.
    scrollView.js           createScrollView(): second camera clipped to a panel
                            interior, drag / wheel via clampScroll(), thumb, link()
                            that fires on pointerup only when moved < 12 px; offset,
                            scrollBy, scrollTo and addScrolled for the focus ring.
                            Used by HowTo and About.
    savePanel.js            Plain DOM panel over the canvas (Username field,
                            read-only user code + Copy, Load field, a full-width
                            Save button that stores the username and confirms
                            "Username saved", status line).
                            Opened from the ready-screen Save / Load User button,
                            and by the "Enter username" prompt with
                            { focusName: true, closeOnSave: true } (caret in the
                            field at once; Save closes it after savePanelCloseMs).
                            Disables game.input.keyboard while open so typing does
                            not flap. The test-mode word in Username: Save toggles
                            Play.setTestMode instead of renaming; blur never stores it. Copy calls clipboard.writeText inside the tap
                            handler (iOS); falls back to selecting the field.
  scenes/
    Boot.js                 preload() gameplay PNGs (mystery.png as a 384 px
                            spritesheet) + the sfx MP3s; create() makes the global
                            'mystery-spin' anim (mystery.frameMs), then starts Play.
    Play.js                 State machine: 'ready' -> 'playing' -> 'paused'/'dead'.
                            create() starts with applyFieldSize() (setGameSize to
                            fieldWidth(window) if it changed), then W =
                            this.scale.width, this.col = uiColumn(W), this.poopX =
                            poopX(W): the world (background rect + tileSprites
                            at tile scale minWidth / texture width, pipe / item /
                            bean / finish spawns at W, pause shade, banners) uses
                            W; the chrome (tray, level bar, ready boxes, test
                            badge, bean HUD, probiotic HUD's right edge) uses col.
                            onFieldResize() sets fieldResizeWanted and autoPauses
                            a running run; update() restarts the scene once
                            canRefitField() (ready, not launching, no overlay /
                            Over / save panel).
                            prefillPipes() (start, endLevelBreak, endPower; a
                            no-op while finishSpawned: a fart cut at the line
                            leaves the break's own pre-fill to fill the next
                            level) spawns prefillPairs' pairs through spawnPipePair(shift) /
                            spawnBandItem(kind, stillY, shift) (shift = px left of
                            the edge spawn), stops at levelEnd, and sets
                            distanceSinceSpawn so the cadence resumes one spacing
                            after the last pair; skipToFinish passes the same
                            shift to spawnFinishLine(shift). On a wide field
                            prefillPipes tags the new objects (data 'sweep' =
                            { baseX }, alpha 0, velocity 0, x += o0 = edge − first
                            pair) and sets this.sweep; update() drives x = baseX −
                            scrolled + dx and alpha from sweepOffset until done →
                            endSweep() (snap to baseX − scrolled, alpha 1, untag,
                            applyScroll). applyScroll skips tagged objects;
                            activatePower, skipToFinish and endRun call endSweep()
                            first.
                            Never read GAME_WIDTH in a scene (tests/scenes.test.js).
                            Spawns pipes and items, tray, auto-pause, haptics, dies,
                            then launches Over as an overlay scene. Tray / keyboard
                            go through chromeIntent. Overlay order is feedback >
                            language > howto > changelog > about > settings >
                            leaderboard > scores. Opening Settings, About, HowTo, Changelog, Language,
                            Feedback, or Leaderboard while playing pauses;
                            closing them does not resume. Unpause applies flapVelocity
                            as a recovery bounce. Pause banner is two centered lines
                            from i18n. Locale via getLocale / applyLocale. Holds the
                            SaveState (loadLocal on create, seeded once from the
                            legacy best); die() records the score (endRun) and
                            launches Over (showOver). Ready screen (readyLayout: a round "?" in the
                            top-right (howto; under a pulsing createGlow halo while
                            howToPromptDue(settings, LAST_UPDATED), i.e. until this
                            build is acknowledged by opening How to play or dying),
                            title, poop spot wearing poop-speech.png's "TAP TO
                            FLAP!" bubble, toilet toggle / Save / Load User /
                            profileButtonText() button: "Enter username" (white,
                            under a pulsing createRectGlow halo, opens the save
                            panel on the name field) until a name is set, then
                            "name · best" opening Scores; any other tap starts); launch() swaps to the
                            plain poop frame and slides it to poopX over
                            launchSlideMs, then start(); extra taps during the
                            slide are ignored (launching flag). Toilet mode:
                            this.toilet from the registry (session-only), toggle
                            under tap to flap, 🚽 HUD left of the score while
                            playing, passed to recordScore and Over. Score popups
                            (scorePopup() in logic.js, TUNING.popup), two reused
                            texts: showPipePopup(mult) is the quick white "+1"
                            ("+2" under a postbiotic) on every pair, restarted by
                            the next pipe; showScorePopup(kind, mult) fades "+3" /
                            "−3" after fiber or an unshielded bacteria hit. The
                            ones showing stack oldest first on popup.rowY
                            (popupOrder + popupSlots(); enqueuePopup puts a new or
                            restarted one underneath, dequeuePopup on fade-out and
                            layoutPopups slide the rest up over popup.shiftMs).
                            Postbiotic: refreshProbioticHud swaps probioticIcon to
                            the 'postbiotic' texture and setMultiplierBadge() shows
                            the "×2" at multiplierLayout() (TUNING.postbiotic) in
                            two layers: multGlow (text shadow + padding, alpha
                            pulse) under the crisp, shadowless multText, which
                            follows its scale. collectItem counts postbiotic starts
                            (applyFiber() true) in this.collected.postbiotic. All
                            popup / badge tweens pause with the run. Beans: group
                            spawned in spawnPipePair (rollBean with beanSpawned for
                            the one-per-run guarantee, halfway to the next pair), bobbed in update() from per-bean elapsed ms;
                            collectBean → effects.addBean (up to maxBeans; holdingBean
                            = bag full or farting); setCharged() alternates
                            stink frames through refreshPoopLook() + pulses this.glow
                            and the bean button in the tray centre slot
                            (beanButtonLayout, same period). refreshPoopLook()
                            (poopFrame: charged, stinkFrame, body vy) also runs
                            every playing frame outside a fart, so a drop at
                            fallLookVy or faster wears poop-falling (or
                            poop-stink-falling1/2 while charged) until the next
                            flap; startLevelBreak and win() call it once so the
                            break glide / the win never keep the scared face;
                            die's poop-dead and the fart frame are untouched;
                            applyRainbow() each frame recolours glow + button disc
                            with superBeans held and makes the glow a rainbow halo
                            during a super fart (poop art never tinted); a
                            tap on the poop (poopTapHit) or the button
                            (beanButtonHit) calls activatePower(): fart texture,
                            alpha tween, fart_accelerate clip, effects.activatePower
                            (clip length; superPipes with superBeans held, else
                            powerPipes → fartPeak), scrollMul from fartMul() each
                            frame via applyScroll(); fartFloat() drives y + angle
                            (glide to mid-height, then the wave with ±waveTiltDeg;
                            gravity off, doFlap ignored); collectItem ignores items
                            while farting; spawnHeldByFart() stops pipe
                            spawning once fartRemainingDistance() < pipeClearDistance()
                            so the screen is clear at the end; endPower() restores
                            gravity and spawns the next pair at the right edge with
                            its gap at mid-screen (centreNextGap → centredGapY),
                            graceLeftMs blocks die(). Pipes spawn by scrolled distance (pipeSpacing(level),
                            px), not a timer. Items: level 1 is scripted
                            (tutorialSpawn / levels.tutorial pair → kind map:
                            probiotic 3, fiber 4 and 7, bean 9, nothing else, no
                            bacteria); from level 2 rollItem per pair, bacteria
                            only once hazardsAllowed(pipesSpawned) (level 2 pair 5);
                            fiber → spawnBandItem (halfway to the next pair,
                            bobY on items.fiberPeriodMs, yields to a bean rolled
                            for the same pair). Below items.bandMoveFromLevel
                            fiber and beans hold still at bandMidY of this gap
                            and the next one, which is pre-rolled into
                            this.nextGapY (cleared wherever centreNextGap is
                            set); probiotic / bacteria →
                            spawnGapItem (depth −1 under the pipes; from
                            items.moveFromLevel they sweep the gap with gapBobY /
                            gapBobAmplitude). Mystery boxes take the band spot like
                            fiber: the guaranteed first box rides after
                            this.mysteryPair (scriptedMysteryPair in start(), one of
                            level 3's first four pairs; it owns that spot, no bean);
                            after it rollItem gets { mystery:
                            mysteryRolls(pipesSpawned, mysteryPair) }. Boxes hold
                            still at bandMidY before mystery.moveFromLevel (4) and
                            bob on mystery.periodMs from it (mysteryMoves). Every box plays
                            'mystery-spin'; setBoxSpin pauses / resumes it with the
                            run. collectItem → openMystery(resolveMystery(
                            rollMystery(rng))): fiber and probiotic reuse
                            eatFiber / takeProbiotic (shared with the plain
                            pickups), postbiotic = effects.applyPostbiotic,
                            beans = addBean × MYSTERY_BEANS, skip = skipToFinish
                            (skipPairs × pipePoints at the multiplier, pipes /
                            items / beans ahead of the poop destroyed, the rest
                            marked passed, pipesPassed = pipesSpawned = levelEnd,
                            spawnFinishLine, gold flash and "+N"); revealMystery
                            then raises the drawn icon (🏁 for a skip, "×3"
                            beside the bean) out of the box over mystery.revealMs.
                            openMystery takes the draw directly so the smoke can
                            force one. this.collected counts pickups for Over's
                            summary rows (a box's reward also counts as its own
                            kind). Spawn slots: at levelEnd(level)
                            pairs the slot is the finish line (spawnFinishLine),
                            then nothing until the break ends unless a fart runs;
                            onFinishCrossed → win() on the final level (endRun()
                            shared with die(): state 'dead', score recorded;
                            showOver(won)), else startLevelBreak (pausePlay with
                            levelBreak, setPauseBanner shows levelTitle/levelHint,
                            breakGlide + breakBob, fadeBackground), cutting a
                            running fart first (cancelPower + endPower);
                            resumePlay → endLevelBreak (applyLevel, grace,
                            centreNextGap). Background = bgColor rectangle (depth
                            −20) under bgLayers tileSprites (depth −10+) from
                            BACKGROUND.layers; the ceiling and ground strips are
                            tileSprites at depth 5 (over the pipes) scrolled at full
                            pipe speed, and the poop dies at their edges
                            (ceilingHeight + poopRadius, GAME_HEIGHT − groundHeight −
                            poopRadius; gapBounds keeps gapMargin inside both);
                            levelBar above the score. Nothing here reads time.now;
                            readyHit() routes taps (howto, start, saveload, profile
                            → Scores). getSaveState / setSaveState for the panel.
                            Test mode: registry testMode / testStartLevel /
                            testInvincible (session, like toilet); isTestMode,
                            setTestMode, testSettings / setTestSettings,
                            testInvincible (die() and the ceiling / floor clamp
                            treat it like grace), grantTest(draw) (resolveMystery +
                            openMystery, then pauseEffects() if paused); start()
                            seeds level / pipes / score / beanSpawned from
                            testRunStart; runIsTest latches per run and endRun()
                            records nothing for it; testBadge (refreshTestBadge).
                            pausePlay / resumePlay share pauseEffects / resumeEffects.
                            Gamepad: this.pad = bindPad(...) is the game's one
                            binding (this scene is never paused; overlays and Over
                            run on top of it). onPadAction → padTop (the topmost
                            overlay, else Over, else Play) → padIntent → the same
                            handler a tap / key uses: 'tap' = flap(), power =
                            activatePower, mute / pause / resume = handleChrome,
                            closeTop = the overlay's close(), retry = Over.retry(),
                            activate / move / hideRing = that scene's focus ring;
                            a nav press mid-run pauses and rings ⏸ (pauseAndFocus).
                            this.focus rings the tray in screen order, then the
                            ready screen's toilet toggle and ? (box items visible
                            only while 'ready' and not launching; Save / Load and
                            the profile button are off the ring on purpose: they
                            need the keyboard); launch and resumePlay hide it.
                            padDown / padNav are the smoke shims.
    Over.js                 Game-over panel (score, run summary of fiber / probiotic / postbiotic over bacteria / bean / mystery box (mystery-icon.png), pipes crossed, then Share | glowing Home on one row from overButtonsLayout) with a
                            tap lockout (openedAt = game.loop.time: a relaunched
                            scene's this.time.now is stale) and its own tray (mute
                            still works). makeShareCard() at create (not on a
                            test run): renderShareCard (ui/shareCard.js) from the
                            loaded textures' source images, shareCardLayout(T),
                            the panel's headline / score line / counts / pipes and
                            shareCardFooter(); its toBlob PNG becomes
                            this.shareFile (a File) and Share shows.
                            pointerdown on Share marks it pressed (no home);
                            pointerup over it runs shareRun() → shareScoreImage
                            with shareText(). { test: true }: the gold
                            testRunNotSaved line, no Share, Home alone at centre.
                            With { won: true } the headline is the gold runWon text.
                            retry(pointer) is a method (the pad's A calls it with no
                            pointer); this.focus rings Home, Share (once the card
                            exists) and the tray, shown as the buttons fade in under
                            a controller; tray and focus are nulled on shutdown.
    Settings.js             Overlay (geometry from settingsLayout): sound, haptics (Android only), Reload game
                            (hardReloadGame(): re-fetches loaded scripts with
                            cache: 'reload', then location.replace with a fresh r=
                            query; picks up a push at once, works on home-screen
                            installs), About link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X. In test mode the
                            panel is 1160 px with the test section (start level ◀ ▶,
                            Invincible, TEST_POWERS buttons live only while a test run
                            is paused, Exit → setTestMode(false) + scene.restart()).
    About.js                Overlay: author, LLM note, engine/art/sound credits
                            (both fart clips), How to play + feedback links,
                            "Updated LAST_UPDATED" under the version as a link to
                            Changelog (What's new), inside
                            createScrollView(). Tap outside the panel closes.
                            Wrapped text uses useAdvancedWrap for CJK.
    HowTo.js                Overlay: flap rules plus pipe / fiber / probiotic /
                            postbiotic / bacteria / bean / mystery box (mystery-icon) /
                            toilet / levels rows (howToItems, pipe first;
                            the pipe icon is a cropped cap slice, toilet is the 🚽
                            emoji) and a feedback link, inside createScrollView(). Ready-screen How
                            to play uses howToHit() so it does not start a run.
                            Opened from About, X/Esc/tap-outside closes HowTo and
                            About together. useAdvancedWrap on body text.
    Changelog.js            Overlay (What's new): one version's notes from
                            src/changelog.js (the latest, or create({ version })
                            after a link's scene.restart), then a link per other
                            version ("Latest · " on the newest), inside
                            createScrollView(). Opened from About's Updated line
                            (chromeIntent 'changelog'); ✕ / Esc / B / tap outside
                            return to About.
    Language.js             Overlay: English / 简体中文 picker (🌐 or L).
    Feedback.js             Overlay: Bug / Feature request chooser (💬, F, or links
                            from About/HowTo). Buttons open GitHub issue forms via
                            issueUrl() + openExternalUrl(); closing leaves any
                            parent overlay open.
    Scores.js               Overlay: username + up to 6 high scores from the
                            SaveState; opened by tapping the profile line.
    (every overlay builds this.focus from pressable() items, ✕ first then its
                            rows, and calls focus.show(), which only shows under a
                            controller; About / HowTo / Changelog pass scrolled: sv and
                            onVertical so up / down scroll the text; Leaderboard
                            passes onVertical only, scrolling its rows band)
    Leaderboard.js          Overlay (🏆 tray button or T): awaits
                            Play.syncLeaderboard() (posts a pending best), then
                            fetchTop + fetchRank in parallel behind a Loading line.
                            Top 25 (LEADERBOARD.limit): rank · name · 🚽 · LV n ·
                            score rows in a band that shows visibleRows (10) at once
                            and scrolls (createScrollView over the band; title,
                            header, footer, version fixed), own row highlighted
                            by rank, footer = join hint (no username) / rankText
                            (off the board) / "not on the board yet". A generation
                            counter drops loads from a closed instance.

assets/                     Contract PNGs + README.md (the art contract).
  README.md                 File name, pixel size, orientation rules. tests enforce it.
  poop.png poop-dead.png poop-stink1.png poop-stink2.png poop-falling.png
  poop-stink-falling1.png poop-stink-falling2.png poop-fart.png
  poop-speech.png fiber.png probiotic.png postbiotic.png bacteria.png bean.png
                            (postbiotic.png: HUD icon only, never spawned;
                            the falling frames: scared face + sweat marks for a
                            long drop, with / without stink lines)
  mystery.png               Mystery box spin: 8 frames of 384x384 side by side (3072x384),
                            loaded as a spritesheet; mystery-icon.png is its static view
                            for the game-over summary and How to play (never spawned).
  pipe.png villi.png ceiling.png ground.png
                            (villi.png: transparent overlay over the level colour with
                            the back fringes; ceiling.png / ground.png: the front rows,
                            mirrors of each other, drawn over the pipes; art contract
                            in assets/README.md "Background layers")
  icon-192.png icon-512.png apple-touch-icon.png
                            App icons from src/FlappyPoopAppArt.png (process_art.py
                            process_icons): the two manifest / favicon icons keep the
                            drawing inside the central 80 % (maskable safe zone) on
                            the art's own tan; the Apple touch icon is full bleed.
  src/                      Original drawings; not in the size table.
  sfx/fart.mp3              Death sample.
  sfx/fart_accelerate.mp3   Fart power-up clip; its duration is the power length.
  sfx/NewLevel.mp3          Level-up chime at the finish line.

db/schema.sql               Supabase schema: scores table (player_id = save-code id,
                            name, score, toilet, updated_at), RLS + a column grant
                            that hides player_id, submit_score() (max score, toilet
                            flag follows the score, 5 s rate limit raises) and
                            player_rank(). Run by hand in the SQL editor, never by
                            any integration; it is the source of truth for the
                            backend.

tests/                      node --test, zero deps. Each file is self-describing:
  field.test.js             fieldWidth (phone, desktop, 2:1 cap, bad input, even),
                            uiColumn, poopX, the x0 shift of trayLayout /
                            levelBarLayout / readyLayout, hits on a shifted column,
                            pipeLeadPx, pipeLead (grows with the extra width),
                            prefillPairs (one edge pair on a phone; a wide field
                            filled from its lead to its edge), sweepOffset
                            (ends, midpoint, monotonic, fastest off the edge,
                            peak extra speed bound)
  html.test.js              index.html invariants (viewport, no scroll, pinned Phaser)
  assets.test.js            load.image / load.spritesheet / load.audio paths; README
                            sizes; a spritesheet is a whole number of frames; sfx credits
  logic.test.js             gap bounds, rng determinism, hasPassed, angle
  levels.test.js            level lengths / ends / levelFor table, final level,
                            per-level pipe spacing, levelSpeed cap,
                            names + colours, levelProgress, lerpColor, gap + grace
                            sanity, levelBannerText, levelBarLayout, levelLabel
  state.test.js             retry lockout
  store.test.js             best-score store incl. throwing/missing storage
  settings.test.js          settings store + vibrate helper
  sound.test.js             sfx keys, mute, Node import
  tray.test.js              trayHeight / trayLayout geometry including info + lang +
                            feedback; trayHit centre hits vs miss in the tray gap
  items.test.js             rollItem, itemGapY, scoreAfterItem, probiotic inventory
                            (paused during the fart), postbiotic multiplier (fiber
                            with a probiotic up, countdown, extend, hit, fart),
                            pipe / item popups, popupSlots stack, postbiotic
                            start count, bean stacking to maxBeans,
                            normal vs super fart, fart envelope integrals; mystery
                            box: the roll at half fiber (only with { mystery }),
                            mysteryRolls only after the first box's pair,
                            mysteryMoves from level 4, scriptedMysteryPair in level
                            3's first four pairs, rollMystery bands and frequencies,
                            resolveMystery fallbacks, skipPairs, applyPostbiotic,
                            the gold skip popup
  fart.test.js              fartFloat (glide, wave band, tilt sign vs direction),
                            hsvToRgb, rainbowHue, wave stays inside the play area
  tuning.test.js            item / fartVolume / beans sanity bounds (normal and
                            super fart peaks), popup rows, postbiotic badge, the
                            mystery block (levels, half fiber's weight and speed,
                            the locked draw table)
  about.test.js             About copy (both locales) names author, LLM, Phaser, JS, sound;
                            LAST_UPDATED has a year and a time; versionText carries
                            the version and the beta tag in both locales
  changelog.test.js         CHANGELOG[0] is VERSION (a bump without notes fails the
                            suite and so npm run push), newest first, dated, notes
                            in every locale and translated; changelogEntry / Notes
  howto.test.js             HOW_TO copy, pause banner, howToLayout / howToHit geometry
  feedback.test.js          issueUrl bug/feature templates; openExternalUrl paths;
                            feedback i18n keys
  i18n.test.js              catalog key parity, zh≠en (allowlist), TRANSLATION_NOTES
                            key coverage, scene English denylist, initialLocale
  share.test.js             shareMode branches, shareScoreImage (share
                            called synchronously, cancel, error → download, download
                            name + revoke, never rejects)
  over.test.js              overButtonsLayout (Share | Home inside the panel, Home
                            alone on a test run), overHit, shareCardLayout (inside
                            the frame, top-to-bottom order, rows inside the card)
  shareCard.test.js         drawShareCard on a fake 2D context (text order, tan frame
                            before the poop, icons + pipe cap slice, win line, text
                            max widths), renderShareCard blob / null paths
  overlay.test.js           overlayOutsideHit inside vs 1px outside HowTo/Settings panels
                            (plain and test-mode)
  testmode.test.js          isTestWord, testRunStart (levels, par score, clamping),
                            nextTestLevel wrap, TEST_POWERS, settingsLayout geometry
  hitbox.test.js            scaledCircleBody source radius/offset for 2x and 4x
  chrome.test.js            chromeIntent matrix across state x overlay x input
                            (incl. the Changelog over About)
  gamepad.test.js           padAction (every knob, unmapped → null, a retuned layout),
                            stickNav deadzone / larger axis, focusStep wrapping,
                            focusRingLayout, padIntent matrix across top x state x
                            ring x action (+ the save-panel short-circuit)
  smoke.test.js             logic.js imports and exports VERSION
  save.test.js              save codes: spec rows 1-10 (round trip, tamper, relabel,
                            v2 migration, merge, name rules, wrapped paste, empty
                            scores, throwing storage) + helper coverage, best 6
  ready.test.js             readyLayout boxes inside the field, non-overlapping,
                            clear of the bobbing poop; readyHit centre / gap / profile
  serve.test.js             npm start points at tools/serve.py; bind + URL print
  leaderboard.test.js       LEADERBOARD config shape (limit 25, visibleRows 10); submitScore headers / body /
                            400 / throw / timeout; disabled config makes no request;
                            fetchTop parsing + order; fetchRank; submitPlan matrix
                            (name, id, cap, confirmed, rename, flag, id change);
                            submit store incl. throwing storage
  scenes.test.js            no scene method is named after a Phaser.Scene property
                            (add, load, input, time, render, …): such a method is
                            shadowed by the plugin and throws inside create(), which
                            freezes the game loop. Node never runs scenes, so this is
                            the only place to catch it. Also: no scene / ui module
                            reads GAME_WIDTH (the field is this.scale.width).
  tools.test.js             npm run smoke points at headless_check.mjs; its OVERLAYS
                            map equals the overlay scenes registered in main.js

.github/ISSUE_TEMPLATE/     GitHub issue forms opened from Feedback (bug.yml,
                            feature.yml); config.yml allows blank issues.

tools/
  make_placeholders.py      Regenerates pipe / villi / ceiling / ground only (icons
                            moved to process_art.py); ceiling.png is the ground's
                            mirror (ceiling_strip), drawn by the game as its own
                            strip over the pipes; a cream backdrop from each
                            screen edge to BAR_FRAC of the shortest fringe tip
                            sits behind everything; fingers run off the
                            edges / behind the strips (villi_band min_frac) and
                            their lumen-side tips undulate (BACK_WAVE on the
                            fringes, FRONT_WAVE in the strips' TIP_ZONE). Must
                            not overwrite poop.png. Run only when you intend to.
  process_art.py            Crops assets/src/ drawings into 384x384 contract PNGs
                            (drawn at spriteDisplayScale 0.25 → 96 logical px);
                            the poop set (alive / dead / stink1 / stink2 / falling /
                            stink-falling1 / stink-falling2 / fart / speech) shares
                            one body scale and centre, stink / falling / fart /
                            speech on bigger squares; bean.png from Kidney_Bean.png,
                            postbiotic.png from Postbiotic.png, mystery-icon.png from
                            MysteryBox_Icon.png; process_sheet cuts MysteryBox.gif's
                            frames on one shared square into the mystery.png strip;
                            process_icons cuts icon-192 / icon-512 (padded to the
                            maskable safe zone) and apple-touch-icon (full bleed)
                            from FlappyPoopAppArt.png.
                            Arcade circles use scaledCircleBody (Phaser source pixels).
  serve.py                  npm start: bind 0.0.0.0:8000, print laptop + phone URLs.
  push.mjs                  npm run push: stamps LAST_UPDATED in src/logic.js with the
                            current local time, runs npm test, commits the stamp, pushes
                            main. Refuses a dirty tree or a non-main branch; --dry skips
                            commit + push.
  headless_check.mjs        npm run smoke [url]: launches headless Chrome (CHROME env
                            overrides the path), drives the running game over the
                            DevTools protocol through globalThis.__flappy, and fails
                            on a page exception, a stalled __flappy.loop.frame, or an
                            overlay that does not open / close. Covers every overlay in
                            OVERLAYS (tests/tools.test.js keeps that list equal to
                            main.js), a run start, leaderboard mid-run pause, and a
                            close-and-reopen race, plus the mystery box (level 3's
                            still first box, a still rolled level-3 box, a bobbing
                            level-4 box, the spin pausing, forced draws,
                            the full-bag fallback, and a skip into level 4's break), and
                            test mode (trigger word, start level, Invincible, Settings
                            power-ups, nothing recorded, Exit latch, normal run after;
                            a test run's Over has no Share), and the game-over share
                            (no save hint, the 1080x1350 share card and its pixels:
                            dark fill, pink frame, tan poop frame with the poop; a
                            real tap on Share through a stubbed
                            navigator.share, cancel, download fallback, Home), and
                            the controller through Play.padDown / padNav (plugin
                            wiring, A / Menu / B / RT / Y, an overlay under A and B,
                            the save panel, the tray ring, the game-over ring and
                            Share, every overlay's ring, Settings / Language /
                            Feedback / About through the ring), and the wide field
                            (a 1800x1000 viewport re-fits the ready screen to 2304
                            px: world widths, column chrome, poop at 25 %, right-
                            edge spawns, the pre-fill at a run start / fart end /
                            skip and its sweep-in (edge + invisible + unpowered,
                            mid-sweep, settled opaque at exact spacing), a super
                            fart carried over the finish line (no pairs during
                            the break, one pre-fill after it),
                            centred Settings closed by a click on the
                            wide world, a mid-run resize deferred until Home; the
                            phone field's pre-fill is one edge pair; a phone
                            rotation: portrait 720 → landscape cap → back, a
                            mid-run rotation pauses in the old field and re-fits
                            at Home). The
                            viewport is pinned to 720x1280 before load
                            (Emulation.setDeviceMetricsOverride) so the rest is
                            the phone field; tapAt maps through the live
                            __flappy.scale size. The page's
                            navigator.getGamepads is stubbed to [] before load: a
                            pad paired to the machine is visible to headless Chrome
                            and its presses would otherwise reach the game.
                            Zero dependencies (fetch + WebSocket).

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
   its cap at the top and is flipped vertically for the top pipe; `villi.png`,
   `ceiling.png` and `ground.png` must tile horizontally. Player/item redraws go through
   `assets/src/` + `tools/process_art.py`.
4. **Phaser stays pinned.** `index.html` loads `phaser@4.2.1` from jsDelivr.
   Bump it by changing that one tag; `tests/html.test.js` only checks the pin is
   an exact version. Phaser is a global (`Phaser.Scene`, `Phaser.Game`), not an
   import.
5. **No build step, no dependencies.** The site is served as-is from the repo
   root by GitHub Pages. Don't add a bundler, TypeScript, or npm packages without
   a strong reason; if you do, the deploy story has to change too.
6. **Mobile first.** The phone portrait layout is the design; a desktop window
   only widens the world around it (the chrome column stays the phone layout).
   Scenes never read `GAME_WIDTH`: the world uses `this.scale.width`, the chrome
   `uiColumn()` (`tests/scenes.test.js` enforces it). Touch is the primary input (`pointerdown`); keyboard
   (Space / Up / M / P / Esc / S / I / L / F / B / T) and the gamepad (A / B / Y /
   RT / Menu / d-pad, `src/input/pad.js`) are conveniences that must produce the
   same intents a tap does, through `chromeIntent` / `padIntent`; the focus ring
   is the only controller-only UI and must never show without a pad press. Keep `touch-action: none`,
   the viewport meta, and the WebAudio unlock-on-gesture. Wrapped UI text that
   can show Chinese must set `useAdvancedWrap: true`. Test on a real phone
   when you touch input, scaling, audio, or locale.
7. **Storage can throw.** Private-mode Safari and blocked storage throw on
   `localStorage` access. Go through `createBestStore()`,
   `createSettingsStore()`, `loadLocal()` / `saveLocal()` from `save.js`, or
   `createSubmitStore()` from `leaderboard.js`; never touch `localStorage`
   directly in scenes.
8. **Player-facing copy is multi-locale.** Change UI strings only in
   `src/i18n.js` for **every** locale (`en` and `zh-Hans`), update matching
   rows in `TRANSLATION_NOTES.md`, and do not hardcode English in scenes.
   If a string must stay identical across locales (brand, language names),
   add its key to the allowlist in `tests/i18n.test.js`. `npm test` fails
   when a locale or the notes file lags; run it before every commit and push.
9. **Share inside the tap.** `navigator.share()` needs transient user activation,
   which iOS Safari grants only during the tap itself and which touch gives on
   pointer-up, not pointer-down. Make the file before the tap (Over draws the
   share card as it opens) and call `shareScoreImage()` straight from the
   `pointerup` handler: no `await`, timer, or fetch before it.

## How to work on it

```bash
npm test          # run everything; must pass before committing
npm run push      # stamp LAST_UPDATED = now, run tests, commit the stamp, push main
                  # (always push this way so the About overlay's "Updated" is the push time)
# In a browser, globalThis.__flappy is the Phaser.Game (debug / automation only):
#   __flappy.scene.getScene('Play').spawnPipePair()
npm start         # tools/serve.py: http://localhost:8000 plus a printed
                  # http://<LAN-IP>:8000 for a phone on the same Wi-Fi
                  # (localhost on the phone is the phone, not the laptop)
# Test mode: type pooptest or testpoop as the username + Save (again to leave; a reload also
#   leaves). Settings then has start level, Invincible, power-ups; nothing is saved.
npm run smoke     # with npm start running: headless Chrome drives the real game
                  # (needs Google Chrome; CHROME=/path overrides). Run it after
                  # any change to src/scenes/* or src/ui/*.
uv run --with pillow python3 tools/process_art.py   # rebuild poop set / items / bean from assets/src/
uv run --with pillow python3 tools/make_placeholders.py   # pipe / villi / ceiling / ground only
```

Scene behaviour (physics, rendering, audio) cannot be verified in Node. When you
change `src/scenes/*` or `src/sound.js`, run `npm run smoke` (catches exceptions
inside scenes and a dead game loop, which `node --check` cannot), then say so and
ask for a phone check for touch, scaling, and audio; don't report those as tested.
Never name a scene method after a Phaser.Scene property (`load`, `add`, `input`,
`time`, `render`, …): `tests/scenes.test.js` enforces this.

Commits so far follow `type(scope): summary` (`feat`, `docs`, `chore`); keep it.

## Where to put new things

- New game mechanic → pure parts in `src/logic.js` + test in `tests/`, wiring in
  `src/scenes/Play.js`, knobs in `src/config.js`.
- New art → gameplay sprites via `assets/src/` + `tools/process_art.py` + a row
  in `assets/README.md` + `load.image()` (or `load.spritesheet()` for an
  animated GIF, cut by `process_sheet`) in `src/scenes/Boot.js`. A new poop
  face goes in the poop-set loop there (same body box as `Poop_Emoji_Alive.png`)
  and in `poopFrame()` if the game picks it. App icons: replace
  `assets/src/FlappyPoopAppArt.png` and re-run the script. Remaining
  placeholders still go through `make_placeholders.py`, which must not overwrite
  `poop.png`.
- New sound → a `blip()` preset in `src/sound.js`, **or** a file in `assets/sfx/`
  plus a `CREDITS.md` row with a URL plus `this.load.audio()` in Boot.
- New scene → `src/scenes/`, register in the `scene:` array in `src/main.js`.
  An overlay also needs an `isActive` check in `Play.chromeArgs` (and its place
  in the overlay ternary), a `case` in `Play.applyChrome`, a key in
  `Play.padTop`, rows in `tests/chrome.test.js`, an entry in `OVERLAYS` in
  `tools/headless_check.mjs` (the smoke opens every overlay), and a `this.focus`
  ring built from `pressable()` items (✕ first) with `focus.show()` so a
  controller can walk it.
- Version bump (`VERSION` in `src/logic.js`) → a new first entry in
  `src/changelog.js` with the date and 1–5 bullets in both locales (the What's
  new page; `tests/changelog.test.js` fails the suite, and so `npm run push`,
  without it).
- New pad button or action → a knob in `TUNING.gamepad`, a row in `padAction`
  and `padIntent` (+ `tests/gamepad.test.js`), a `case` in `Play.onPadAction`
  that calls an existing handler. Never bind the Gamepad plugin in another
  scene: Play's binding sees every press and routes it to the scene on top.
- Network call → `src/leaderboard.js` only, with `fetch` injected and a timeout;
  tests pass a fake `fetch`. Never `await` a request inside a Phaser update
  loop; fire and forget from gameplay, `await` only in an overlay's `create()`.
- Backend change → edit `db/schema.sql`, run it by hand in the Supabase SQL
  editor, keep `LEADERBOARD.maxScore` and the schema's score cap in step.
- New UI chrome → `src/ui/` (Phaser wrapper) with any pure layout helper in
  `src/logic.js`, positioned inside the chrome column (`this.col`: pass
  `col.width` as the width and `col.x` as the helper's `x0`, or add `col.x`
  to a fixed x). New world objects (things that scroll, full-screen shades)
  use `this.scale.width`. Text input belongs in a DOM panel like `src/ui/savePanel.js`,
  not Phaser UI.
- Save-code wire format change → bump `CURRENT_VERSION` in `src/save.js`, add
  `parseVN` to `PARSERS`, never delete an old parser, never change `SECRET`.
- New UI string → both locales in `src/i18n.js` + a row in `TRANSLATION_NOTES.md`
  (+ allowlist in `tests/i18n.test.js` only if intentionally identical). Scenes
  call `t(locale, key)`; never hardcode player English.
- Multi-step work worth planning → a dated markdown plan in `.claude/plans/`.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
- Locale copy review for LLMs → `TRANSLATION_NOTES.md` (keep in sync with `src/i18n.js`).
