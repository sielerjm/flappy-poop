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
a 5-pipe postbiotic 5 % (×2 already on), three beans 5 %, a skip to the end of the level 1 %, 5 coins 10 %,
10 coins 5 %, 15 coins 1 % (the coin draws come after skip in `MYSTERY_DRAWS`, so the older bands hold), else
fiber (33 %, `rollMystery`); a draw that cannot do anything (bean with a full bag, skip with the finish line out) becomes
fiber (`resolveMystery`). A skip scores every pair left in the level at the current multiplier (countdown
paused, like a fart), clears what is ahead and brings the finish line in from the right edge. The first
box is guaranteed after one of level 3's first four pairs (`scriptedMysteryPair`, so before pipe 5); on every
later pair boxes roll at half fiber's weight (`mysteryRolls`). On level 3 they hold still midway between two
gaps; from level 4 they bob at half fiber's speed (`mysteryMoves`). **Coins** (`coin.png`, a golden corn
kernel, drawn at `coin.scale` with a `coin.radius` hitbox) join the item roll from level 2 at `coin.weight`
(half a box's) as a band item like fiber (`BAND_ITEMS`), and every level carries **one guaranteed kernel**
(`Play.armKernel` from `course.kernelPair(level)`: level 1's waits `coin.firstAfterPipePx` past its last pair
at that pair's gap, still; from level 2 it takes its pair's band slot, or the next pair's without a box or
bean, or past the last pipe; `clearFieldAhead` re-arms it when a respawn clears it untaken). A coin or a
box's coin draw goes into the purse (`effects.addCoins`, `Coin_Pickup.mp3`), shown in the top-left
inventory over the beans (`inventoryRows`, `TUNING.hudInventory`: the rows shown stack from the top). Coins
last **one run**: `start()` empties the purse, nothing is saved, a single-player death empties it and clears
every power-up (`effects.clearPowerups`), and a two-player crash keeps `crashCoins` (90 %, rounded down) and
clears the power-ups. Pickups with no motion data pulse (`pulseStill` / `pulseScale`, `stillPulseScale`,
`items.stillPulse`), their circle body re-fitted each frame so the hitbox holds. The **shop** (`TUNING.shop`): in a level break a
💰 pill under the banner (`shopButtonLayout`; dimmed at 0 coins, the single-player hint then drops its
"· 💰 to shop") opens a panel of rows (`shopLayout`, `SHOP_ITEMS`) in the chrome column: fiber 1, one bean 6,
a super bean 16 (fills the bag to `superBeans`), a mystery box 5 (the plain draw table, `pairsLeft` 0 so a
skip becomes fiber). `buyBlocker` / `canBuy` grey a row the purse or the bag refuses; `Play.buyItem` spends
and applies it, and the reward animates in the paused break. ✕, a tap outside the panel, Esc / P / B and
the power input (B key, RT, a versus power key) close it (`chromeIntent` `closeShop`, arming the resume
lockout); closing never continues the level. The game-over panel shows `collected.coin` beside the pipes
(the share card does not). Level 1 is
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
`levelSpeed()` (275 + 25 per level, capped at `levels.maxSpeed` 325 = level 3's speed, so
levels 3+ share one cruise and later difficulty is content), applied when the break ends; the gap
is `levelGap()` (`gapHeight` × `levels.gapScale[level − 1]`: 1.1, 1.05, then 1). **Moving pipes:** from
`pipeMove.fromLevel` (4) a share of the pairs (`pipeMove.chance` per level, with `ampPx` /
`periodMs` rows) bob their gap centre on a sine: `rollPipeMove` at spawn (after the item and bean
draws; never for the centred pair after a fart; amplitude clamped into `gapBounds`), `gapBobY` in
`update()` moving both columns, a probiotic / bacteria in that pair riding the gap centre (`bob: 'pair'`).
`pipeMoveShiftPx` is the gap's shift during one column crossing; `tests/tuning.test.js` keeps every
row under half the poop's clearance so the motion alone can never clip a centred poop. One spacing after a level's last pair a checkered finish
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
**Two players** (`src/versus.js`, `scenes/Versus.js`): a 👥 toggle under the toilet toggle, offered
only where two phone-width halves fit the window (`versusAvailable`: landscape, at least
`versus.minViewportH` css px tall; never in test mode), turns the start tap into a match. The Versus
scene sets the canvas to two half-window fields (`versusLayout`, capped at `FIELD.maxWidth / 2` each),
launches `Play` as P1 on the left strip and `PlayB` (a second Play instance) as P2 on the right (each
`Play.init` gets `{ player, match, fieldW, fieldX }` and a camera viewport), and sits above both. The
join screen claims a slot per device (`claimDevice`: a tap takes its own half, a keyboard group
(`versus.keys`: W / Space + E / Left Shift, ↑ / Enter + Right Shift / Numpad 0) or a pad the first free
slot), then counts 3-2-1-GO and launches both halves together. Both halves run one **shared course**
(`createCourse(seed, T, { shared: true })`: every draw per pair and purpose, the pair number standing
in for the score gates, beans spawning into a full bag), while each player's mystery **draws** come
from their own stream (`rngDraw`) on the **catch-up** table (`catchUpTier` / `catchUpDraws`: 10–24
pipes behind doubles the bean draws, 25+ forces bean3 = a super fart ready). Each half publishes its
slot every frame (`publishSlot`: score, pipes, level, distance, y, angle, frame, alpha; the distance is
the half's place on the course: the scroll, re-anchored at the end of every re-fill and after a skip by
`rebaseDistance` on `courseDistance`, since a fart, a respawn, a skip or a re-fill's fixed lead would
otherwise drift it from the pipes) and shows the other as a faded **ghost** in its lumen at the
distance gap (`ghostPlacement`) and as a
**marker** on its level bar (`rivalMarker`). A crash never ends a match run: it is a **respawn**
(`startRespawn` / `tickRespawn` / `endRespawn` on `respawnPose`, state `'respawn'`): the half's world
halts, the score loses `versus.scoring.deathPenaltyPerLevel` × level (floored at 0, the −N popup), the
slot counts the crash, the poop tumbles, everything not yet credited is cleared, it glides back to
mid-screen, blinks, and plays on with the next pair at mid-height. Clearing a level earns
`versus.scoring.levelClearBonus`. Levels start together: the first player over a finish line waits in
its level break under "Waiting for P2…" (no shade, a tap does not end it); once both are there
(`Versus.onLevelReached`) and `levelSyncDelayMs` has passed, both read "Tap to continue", a tap from
either (`Versus.onLevelTap`) runs the match-start 3-2-1-GO (`runCountdown`, holding while an overlay is
open), and `beginLevel` ends both breaks in the same frame. Each half shops in its own break (the panel
is Play's, in its strip; the other half plays on), and a shop open on either half holds the shared start
(`Versus.onLevelTap` waits; the other half reads "Waiting for Pn…" until it closes, `onShopChanged`); the
💰 pill hides once the count runs. The pause key / ⏸ / Menu toggle the
**shared pause** (`Versus.setPaused`, remembering which halves it paused so a break is never ended by
the other player; a respawning half's clock stops with it). Chrome decisions in a match read
`chromeState()` (the match's state, not the half's), so a finished or respawning half still pauses and
resumes the match. The match ends once **both** have cleared the rectum (the first one out waits under
"Made it out!" / "Waiting for P2…", `showEscapedBanner`); the result panel names the higher score
(`matchResult`: score, then fewer crashes, else a draw) with each player's 💀 count and offers Rematch
(same devices, new seed) | Home (the canvas re-fits the window). A match records nothing: no best, no
save-code score, no leaderboard.

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
                            arcade physics, activePointers 2 (two thumbs in a
                            match), input.gamepad on (bound once, in
                            Play), scene order
                            [Boot, Play, new Play('PlayB'), Over, Versus, Settings,
                            About, HowTo, Changelog, Language, Feedback, Scores,
                            Leaderboard] ('PlayB' is the right half of a match,
                            launched only by Versus).
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
                            default Invincible). TUNING.hudProbioticPulse = the
                            HUD icon's breath; resumeFlapScale = the resume
                            bounce's share of a flap; beans.buttonEdgeMarginPx =
                            the bean button's inset by a thumb on a wide field.
                            TUNING.pipeMove = moving pairs
                            (fromLevel, per-level chance / ampPx / periodMs rows). TUNING.gamepad = the pad's
                            standard-mapping button indices (A / B / Y / RT /
                            Menu / d-pad), RT threshold, stick deadzone + repeat;
                            TUNING.focus = the focus ring's geometry, fill alpha,
                            pulse and the overlay scroll step. TUNING.versus = the
                            two-player knobs: minViewportH (the gate), keys (the
                            two keyboard groups), countdownMs, ghostRangePx /
                            ghostAlpha / ghostFadeMs, barRivalPx / barRivalAlpha,
                            dividerPx, catchUp (superBehind, beanBehindMin,
                            beanOddsMul), scoring (deathPenaltyPerLevel,
                            levelClearBonus), levelSyncDelayMs (the beat after both
                            reach a line before a tap can start the next level),
                            respawn (crashMs, glideMs,
                            blinkMs, blinkCycles, blinkAlpha).
                            Pure data, Node-safe.
  logic.js                  Pure functions, NO Phaser/DOM: field (fieldWidth,
                            uiColumn, poopX, pipeLeadPx, pipeLead, prefillPairs,
                            sweepOffset;
                            trayLayout /
                            levelBarLayout / readyLayout / howToLayout take a
                            trailing x0 = the column's left edge; readyLayout takes
                            { versus } for the 👥 box), rng, createCourse / mixSeed
                            (every random draw a run makes behind one object: one
                            stream in single player, exposed as course.rng for the
                            pickup-time mystery draw and the smoke's forced rolls;
                            per pair and purpose in a match's shared course;
                            tests/course.test.js), gap placement,
                            scoring (pipePoints, scorePopup, multiplierLayout),
                            items (rollItem, hazardsAllowed, bandItemsMove,
                            bandMidY, tutorialSpawn), beans (rollBean, beanSpawnX, beanY,
                            beanAngle, bobY, gapBobAmplitude, gapBobY,
                            poopTapHit; beanButtonLayout(width, height, t, {
                            colWidth, hand, match }): centred, or by the hand's
                            thumb at beans.buttonEdgeMarginPx from the edge of a
                            field wider than the column outside a match;
                            beanButtonHit's circle is twice the
                            drawn button), poopFrame (the live poop's texture
                            key: plain / stink frame, or the falling faces at
                            fallLookVy px/s down), fart envelope (pipeSpacing,
                            fartPeakMul, fartMul, fartRemainingDistance), fartFloat
                            (wave + tilt), moving pipes (pipeMoveParams,
                            pipeMoveAmplitude, pipeMoveShiftPx, rollPipeMove), hsvToRgb / rainbowHue, glowAlphaAt /
                            glowStops, sprite angle, VERSION (bump it when art
                            under an existing file name changes: Boot's ?v=; every
                            bump needs a CHANGELOG entry), versionText(locale,
                            version) = the "v0.5.16 beta" line every overlay shows, retry
                            lockout, levels (levelPipes, levelEnd, levelFor, isFinalLevel,
                            levelSpeed, levelName, levelColor, levelProgress,
                            levelBarLayout, lerpColor),
                            best-score store, settings store (incl. locale,
                            howToSeenAt and hand: HANDS 'left' | 'right', the
                            bean button's side) + howToPromptDue, vibrate
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
                            RT / Menu / Y / nav do on Play, Over, an overlay or the
                            versus join / result screen: versusSelect / versusBack);
                            rollMystery(rng, t, draws) takes an optional draw table
                            (the versus catch-up); coins and the shop: BAND_ITEMS,
                            MYSTERY_COINS, createEffects addCoins / spendCoins /
                            coins, SHOP_ITEMS, buyBlocker / canBuy, shopButtonLayout
                            / shopButtonHit, shopLayout / shopHit, chromeIntent's
                            shop / breaking args and 'shop' input; test mode:
                            isTestWord, testRunStart, nextTestLevel, TEST_POWERS,
                            settingsLayout (Settings panel + rows, taller with the
                            test section). Fully unit-tested.
  changelog.js              What's new data, NO Phaser/DOM: CHANGELOG (one entry per
                            version, newest first: version, date like LAST_UPDATED's
                            day, notes per locale), changelogEntry, changelogNotes
                            (bulleted block for a locale, English fallback).
  versus.js                 Two-player match logic, NO Phaser/DOM: versusAvailable
                            (landscape + minViewportH), versusLayout (two half-window
                            fields, capped at maxWidth / 2), createMatch / resetMatch
                            / slotTemplate, keyGroup / sameDevice / claimDevice /
                            allClaimed / deviceLabel (the join screen), ghostPlacement
                            (scaled by the other's alpha, 0 once ended), rivalMarker,
                            catchUpTier / catchUpDraws, matchResult (score, fewer
                            deaths, draw), respawnTotalMs / respawnPose (the crash →
                            glide → blink → done timeline, pure in elapsed ms),
                            coursePairStart / courseDistance (a pair's place on the
                            course; what a half's distance reads with a pair a given
                            lead ahead), VERSUS_EMOJI. Fully unit-tested
                            (tests/versus.test.js).
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
                            v1 payload {i, n, s, p, [l], [h], t}; p = optional toilet
                            flags; h = 'l' only for a left-handed player, handed
                            back as `hand` beside the state, never in SaveState;
                            via Web Crypto, 16-byte tag, base64url), PARSERS per
                            wire version, SECRET constant (permanent). Fully
                            unit-tested.
  i18n.js                   en / zh-Hans string catalog, t(), initialLocale,
                            howToItems, pauseBannerText, metaFontSize, welcomeText,
                            levelBannerText(locale, level, levels, { shop }),
                            coinLabel ("💰 12", locale-free).
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
                            on a non-standard mapping; every action is handed on with
                            the pad's index (a match routes A / RT to the half that
                            claimed that pad); returns padDown(index, padIndex) /
                            padNav(dir, padIndex) shims for the smoke driver. Only
                            Play binds (P1 in a match; P2 never).
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
                            geometry from levelBarLayout(). setRival(marker) /
                            rival(): the other player's marker in a match (a small
                            faded poop at rivalMarker's share; gold at the 🏁 a level
                            ahead, grey at the start behind).
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
    toggle.js               createToggle(scene, box, { on, glyph, glyphLeft }): the toilet switch
                            (pill track, knob tween, 🚽 alpha) from readyLayout().toilet,
                            with glyph 👥 the two-player switch from
                            readyLayout().versus, and with glyphLeft 👈 / glyph 👉
                            Settings' hand row (the off-side glyph lit) from
                            settingsLayout().hand; setOn(). No pointer handlers.
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
                            spritesheet; coin.png) + the sfx MP3s (coin, coin-spend,
                            shop beside fart / fart-accelerate / level-up); create() makes the global
                            'mystery-spin' anim (mystery.frameMs), then starts Play.
    Play.js                 State machine: 'ready' -> 'playing' -> 'paused'/'dead'
                            (+ 'respawn' in a match: between a crash and its restart).
                            The constructor takes the scene key ('Play'; 'PlayB' is
                            the second instance for a match's right half); init(data)
                            reads { player, match, fieldW, fieldX } (nothing in
                            single player). create() starts with applyFieldSize()
                            (setGameSize to fieldWidth(window) if it changed; a
                            match half skips it and sets its camera viewport to its
                            strip instead), then W = this.fieldW (the canvas, or
                            the half's strip: the only this.scale.width read outside
                            the fit, tests/scenes.test.js), this.col = uiColumn(W),
                            this.poopX = poopX(W): the world (background rect + tileSprites
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
                            closing them does not resume. Unpause applies
                            resumeFlapVelocity (resumeFlapScale × a flap, 0.5) as
                            a recovery bounce, none during a fart. Pause banner is two centered lines
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
                            the 'postbiotic' texture (the icon sits in the
                            probioticHud container, which setProbioticPulse
                            breathes on hudProbioticPulse while the count runs;
                            paused with the run, scale 1 once spent) and setMultiplierBadge() shows
                            the "×2" at multiplierLayout() (TUNING.postbiotic) in
                            two layers: multGlow (text shadow + padding, alpha
                            pulse) under the crisp, shadowless multText, which
                            follows its scale. collectItem counts postbiotic starts
                            (applyFiber() true) in this.collected.postbiotic. All
                            popup / badge tweens pause with the run. Beans: group
                            spawned in spawnPipePair (rollBean with beanSpawned for
                            the one-per-run guarantee, halfway to the next pair), bobbed in update() from per-bean elapsed ms;
                            moving pairs: the top pipe carries { move, elapsed, mate, gapH }
                            from rollPipeMove and update() places both columns (gapBobY),
                            frozen while paused;
                            collectBean → effects.addBean (up to maxBeans; holdingBean
                            = bag full or farting); setCharged() alternates
                            stink frames through refreshPoopLook() + pulses this.glow
                            and the bean button in the tray centre slot
                            (beanButtonLayout with beanButtonOpts(): the
                            settings' hand puts it by a thumb on a wide field,
                            a match half keeps the centre; applyHand() re-places
                            it, getHand / setHand serve Settings and the save
                            panel; same period). refreshPoopLook()
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
                            onFinishCrossed → win() on the final level (endRun():
                            state 'dead', score recorded; showOver(won)), else
                            startLevelBreak (pausePlay with
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
                            Versus half: this.course = createCourse(seed, T, { shared })
                            replaces every this.rng read (gapY / item / bean /
                            pipeMove / phase / itemY / spinFrame by pair number;
                            mysteryPair at start); this.rngDraw (per player) rolls
                            the mystery draw on catchUpDraws(catchUpTier(behind))
                            in collectItem; this.distance (its place on the course:
                            the scroll, re-anchored by rebaseDistance at the end of
                            every prefillPipes and after skipToFinish, from the next
                            pair due to spawn or the level's finish line);
                            publishSlot() every frame; refreshGhost (this.ghost at
                            depth 9.5 from ghostPlacement; a live ghost follows its
                            alpha, an ended one fades over ghostFadeMs) and refreshRival
                            (levelBar.setRival on a level / pair change); a match
                            records nothing: endRun reports to Versus.onRunEnded;
                            showOver is a no-op. die() in a match → startRespawn
                            (state 'respawn', the world halted, scoreAfterDeath +
                            the 'death' popup, slot.deaths, setCharged off), then
                            tickRespawn every frame on respawnPose (the tumble under
                            physics with deathTween; the first glide frame clears
                            the field ahead with hasPassed, drops pipesSpawned back
                            to pipesPassed and a finish line ahead; the glide and
                            blinks drive y / angle / alpha) and endRespawn (grace,
                            centreNextGap + prefillPipes like endPower, re-charged).
                            pausePlay accepts 'respawn' (respawnPaused) and
                            resumePlay returns to it without the bounce; autoPause
                            too. onFinishCrossed adds levelClearBonus (the popup
                            after the break starts); win() → showEscapedBanner
                            (levelTitle / levelHint, no shade; applyLocale keeps it).
                            chromeState() / overlayPause(): chromeArgs and
                            onPadAction read the match's state ('paused' in this
                            half's own break or under the shared pause, 'playing'
                            while any half is live) so a finished or respawning half
                            still drives the match; flap() lets a finished half
                            through to its tray and the resume tap. Input:
                            localPointer() shifts a pointer into the half and drops
                            the other half's; keyboard events are read by P1 alone
                            (onVersusKey → keyGroup) and routed with pads by
                            versusInput() to the half whose device it is (a
                            join-screen input claims a slot through
                            Versus.onJoinInput); P2 draws no tray, no ring, binds no
                            keys and no pad. handleChrome('pause' / 'esc') toggles
                            the shared pause (Versus.togglePause); pauseRun() /
                            autoPause forward to it; a 'resume' tap (and a pad's B)
                            lifts the shared pause for both and, from a half in its
                            level break, reaches Versus.onLevelTap (the go-ahead once
                            both are at the line, else nothing): a match half's break
                            ends only on the shared count (beginLevel, from Versus).
                            Coins and the shop: takeCoins (purse, collected.coin,
                            refreshCoinHud, the coin sample), refreshInventory (coin
                            and bean rows by inventoryRows), clearPowerups (die in
                            single player with the purse emptied; startRespawn with
                            crashCoins), pulseStill / pulseScale (still pickups and
                            still beans breathe, body re-fitted), armKernel /
                            markKernel / spawnStillCoin (the level's guaranteed
                            kernel; collectItem reads its flag before destroy),
                            giveBeans, playSample
                            (a sample or its synth fallback), buyItem(id, opts);
                            shopOpen / shop, refreshShopButton / shopButtonShown
                            (the 💰 pill, depth 27), openShop / refreshShop /
                            shopBuy / closeShop (panel 27, texts 28-29, the reveal
                            29.5 and running while paused: revealMystery { depth,
                            run }); flap() routes an open shop's taps (✕, a row, the
                            panel, outside → handleChrome('tap') → closeShop) before
                            the power tap; activatePower in a break toggles the shop;
                            handleChrome's match pause shortcut skips an open shop;
                            endRun / start / endLevelBreak close it; the ring walks
                            the 💰, ✕ and the rows (shop, shopClose, shop:<id>).
                            onFinishCrossed reports Versus.onLevelReached;
                            refreshLevelBanner shows "Waiting for P{n}…" as a match
                            break's hint until Versus's levelStage is 'tap', then
                            "Tap to continue" (applyLocale keeps it), setPauseBanner
                            keeps the shade off there, and setLevelHintVisible hides
                            the hint through the beat and the count. The
                            ready screen's 👥 toggle
                            (versusOffered(): outside a match, not test mode,
                            versusAvailable; toggleVersus → registry 'versus',
                            session-only) makes launch() scene.start('Versus')
                            instead of sliding the poop; a match half hides the
                            ready UI and starts with the plain face.
    Versus.js               The two-player match, above the two Play halves and
                            below the overlays (bringToTop after launching them):
                            create({ match }) lays the halves out (versusLayout),
                            resizes the canvas, launches Play (P1) and PlayB (P2)
                            with their strips, draws the divider, the join screen
                            (title, P1 / P2 prompts → device badges, hint, Home),
                            the countdown text and the shared PAUSED banner. Status
                            join → countdown → playing → over (→ left). onJoinInput
                            claims (claimDevice; a tap that pressed Home is not a
                            claim), startCountdown runs runCountdown (3-2-1-GO on
                            timers, never synchronously: a rematch starts it inside
                            create(); it stops on a restart or a status change and,
                            for a level, holds while an overlay is open, then repeats
                            the step for a full beat), go() launches both halves.
                            levelStage: onLevelReached with both halves in their
                            level break → 'arming' (hints hidden for
                            levelSyncDelayMs) → 'tap' ("Tap to continue" on both) →
                            onLevelTap (a tap from either; ignored while anyShopOpen)
                            → 'count' (each half's 💰 pill hides): runCountdown
                            under status 'playing' (ghosts and the pause plumbing as
                            usual) → beginLevel (both Play.beginLevel in one call,
                            levelStage back to null; a hidden tab pauses at once).
                            shopOpenElsewhere(half) / onShopChanged: the other half's
                            prompt reads "Waiting for Pn…" while a shop is open.
                            setPaused(on) pauses every
                            playing or respawning half and remembers them
                            (pausedHalves), resumes only those; togglePause for the
                            pause key; anyLive() for chromeState. onRunEnded waits
                            for both slots to end (the first finisher waits under its
                            own banner), then shows the result panel after
                            deathToOverMs: matchResult headline, both scores / level
                            / pipes / 💀 crashes, the not-saved line, Rematch | Home
                            on overButtonsLayout's row with a focus ring. rematch()
                            restarts the scene with resetMatch (devices
                            kept, new seed); leave() stops both halves, re-fits the
                            canvas to the window and starts Play with explicit data
                            (a start without data keeps the last launch data).
                            onPadSelect / onPadBack are the pad's A / B here
                            (padIntent 'versus'); Esc = back.
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
    Settings.js             Overlay (geometry from settingsLayout): sound, haptics (Android only), the
                            hand row (👈 pill 👉 from createToggle with glyphLeft, a
                            Zone over the row, a hint line; toggleHand →
                            Play.setHand, which moves the bean button on every
                            running Play instance), Reload game
                            (hardReloadGame(): re-fetches loaded scripts with
                            cache: 'reload', then location.replace with a fresh r=
                            query; picks up a push at once, works on home-screen
                            installs), About link, version. Tap outside the panel
                            closes (overlayOutsideHit), same as X. The panel is 860
                            px; in test mode 1240 px with the test section (start level ◀ ▶,
                            Invincible, TEST_POWERS buttons live only while a test run
                            is paused, Exit → setTestMode(false) + scene.restart()).
    About.js                Overlay: How to play + feedback links, then the
                            engine/art/sound credits, author and LLM note, version
                            and Updated last; longer than its panel, it scrolls
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
  poop-speech.png fiber.png probiotic.png postbiotic.png bacteria.png bean.png coin.png
                            (coin.png: the golden corn kernel, a placeholder cut from
                            assets/src/Kernel_0.png until a spin GIF replaces it;
                            postbiotic.png: HUD icon only, never spawned;
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
  sfx/Coin_Pickup.mp3       A coin picked up, or a box paying coins.
  sfx/Coin_Spend.mp3        A shop purchase.
  sfx/ShopOpenClose.mp3     The shop opening and closing.
  (sfx/ToiletFlush_Win.mp3 may sit untracked in a working copy: Michael's placeholder,
   uncredited, so the CREDITS test fails until it is credited or removed.)

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
  logic.test.js             gap bounds, rng determinism, hasPassed, angle,
                            resumeFlapVelocity
  levels.test.js            level lengths / ends / levelFor table, final level,
                            per-level pipe spacing, levelSpeed cap (the level-3 cruise),
                            names + colours, levelProgress, lerpColor, gap + grace
                            sanity, levelBannerText, levelBarLayout, levelLabel
  state.test.js             retry lockout
  store.test.js             best-score store incl. throwing/missing storage
  settings.test.js          settings store (incl. hand) + vibrate helper
  sound.test.js             sfx keys, mute, Node import
  tray.test.js              trayHeight / trayLayout geometry including info + lang +
                            feedback; trayHit centre hits vs miss in the tray gap;
                            the bean button centred in portrait, by either thumb on
                            a wide field, centred in a match half
  pipeMove.test.js          pipeMoveParams rows, pipeMoveAmplitude clamp, pipeMoveShiftPx,
                            rollPipeMove (no draw below fromLevel, centred pair, seeded share ≈ chance),
                            every row's shift under half the clearance
  items.test.js             rollItem, itemGapY, scoreAfterItem, deathPenalty /
                            scoreAfterDeath (floor) + the death and levelClear
                            popups, probiotic inventory
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
                            the gold skip popup; coins: the roll's coin share (half a
                            box's, no flag needed), BAND_ITEMS, MYSTERY_COINS, the
                            purse, buyBlocker / canBuy
  fart.test.js              fartFloat (glide, wave band, tilt sign vs direction),
                            hsvToRgb, rainbowHue, wave stays inside the play area
  tuning.test.js            item / fartVolume / beans sanity bounds (normal and
                            super fart peaks), popup rows, postbiotic badge, the
                            HUD icon pulse under the gap to its count, the resume
                            bounce scale in (0, 1), the
                            mystery block (levels, half fiber's weight and speed,
                            the locked draw table with the coin draws), coins (half
                            a box's weight, the locked shop prices, the volumes,
                            the purse row clear of the bean row)
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
                            (incl. the hand row)
  hitbox.test.js            scaledCircleBody source radius/offset for 2x and 4x
  chrome.test.js            chromeIntent matrix across state x overlay x input
                            (incl. the Changelog over About, 'respawn' pausing like
                            'playing' and ignoring taps, the shop's open / close rows)
  shop.test.js              shopButtonLayout (under the banner hint, above the bean
                            button, clear of the tray and the break's poop), the
                            panel and its rows (inside the strips, apart, covering the
                            pill), shopButtonHit / shopHit
  gamepad.test.js           padAction (every knob, unmapped → null, a retuned layout),
                            stickNav deadzone / larger axis, focusStep wrapping,
                            focusRingLayout, padIntent matrix across top x state x
                            ring x action (+ the save-panel short-circuit)
  versus.test.js            TUNING.versus sanity (gate, ghost, disjoint key groups,
                            catch-up tiers), versusAvailable, versusLayout (= the wide
                            field's width, the maxWidth / 2 cap), createMatch /
                            resetMatch, keyGroup, claimDevice (touch takes its half,
                            keys / pads the first free slot, refusals), deviceLabel,
                            ghostPlacement (gap, edge, range, the other's blink,
                            ended), rivalMarker, matchResult (score, fewer deaths,
                            draw; pipes never decide), respawnPose (phase boundaries,
                            the glide from the fall to mid-screen and the nearest
                            whole turn, the blink's triangle wave, done, purity),
                            coursePairStart / courseDistance (level spacings, a
                            line one spacing after its level's last pair, the same
                            place read from any pair, −pipeLead at the start), the
                            scoring / respawn / level-sync knobs, catchUpTier at 9 / 10 / 24
                            / 25, catchUpDraws + rollMystery on the doubled and
                            super tables, the 👥 ready box, padIntent on the versus
                            top
  course.test.js            mixSeed; a single-player course equals a hand-rolled
                            single stream in Play's order (course.rng swappable); a
                            shared course is the same for two players whatever their
                            score or bag, per pair (order-independent), differs by
                            seed, takes the pair number for the score gates, lets
                            beans spawn into a full bag, rolls moving pipes from
                            pipeMove.fromLevel
  smoke.test.js             logic.js imports and exports VERSION
  save.test.js              save codes: spec rows 1-10 (round trip, tamper, relabel,
                            v2 migration, merge, name rules, wrapped paste, empty
                            scores, throwing storage) + helper coverage, best 6,
                            the optional h (hand) key
  ready.test.js             readyLayout boxes inside the field, non-overlapping,
                            clear of the bobbing poop; readyHit centre / gap / profile
  serve.test.js             npm start points at tools/serve.py; bind + URL print;
                            the no-store handler
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
                            reads GAME_WIDTH (the field is this.scale.width), and
                            Play.js reads this.scale.width only to fit the field (its
                            world is this.fieldW: a half of the canvas in a match).
  tools.test.js             npm run smoke points at headless_check.mjs; its OVERLAYS
                            (Boot, Play, new Play('PlayB'), Over and Versus excluded)
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
                            MysteryBox_Icon.png, coin.png from Kernel_0.png; process_sheet cuts MysteryBox.gif's
                            frames on one shared square into the mystery.png strip;
                            process_icons cuts icon-192 / icon-512 (padded to the
                            maskable safe zone) and apple-touch-icon (full bleed)
                            from FlappyPoopAppArt.png.
                            Arcade circles use scaledCircleBody (Phaser source pixels).
  serve.py                  npm start: bind 0.0.0.0:8000, print laptop + phone URLs;
                            NoStoreHandler sends Cache-Control: no-store on every
                            response so a reload never serves a mix of cached and
                            fresh ES modules (an old scene with a new config.js
                            once looked like a broken leaderboard). Pages caches
                            ~10 min: Settings → Reload game there.
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
                            the full-bag fallback, and a skip into level 4's break), coins
                            (a rolled coin bobbing like fiber, the purse and its HUD row,
                            the coin draws, buyItem with a full bag, level 1's
                            kernel past its last pair at half size, a later level's
                            kernel deferred past a bean and brought back after a
                            respawn's clear, fiber for 1, the coin row over the
                            bean row and the stacking, a still fiber pulsing with
                            its hitbox held, a single-player death clearing coins
                            and power-ups with Over counting the coins, an empty
                            purse at Home and in the next run, a match crash
                            keeping 90 % of the coins and clearing the power-ups),
                            the shop (the 💰 pill and hint, rows bought by real taps, a
                            greyed row, the reveal over the panel while paused, ✕, a tap
                            outside without continuing, the super bean filling the bag,
                            RT, the controller ring, the empty purse at level 4's break),
                            and
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
                            at Home), and two players (A: the 👥 toggle on a
                            1800×1000 window and not in portrait, the join screen's
                            two halves and cameras, claims and refusals, the
                            countdown, five identical pairs on both halves, inputs
                            routed by device, Home, Esc / B, the flag ignored in
                            portrait; B: the shared pause, the first one over a
                            level's line waiting (+25 and its popup, "Waiting for
                            P2…" with no shade; Settings from the break pauses the
                            other half; its tap and a pad's B do not end the break,
                            Menu / B pause and lift the other; P1 shopping while P2
                            plays on, P2's strip never reaching P1's shop, B closing
                            it), the other's arrival
                            (hints hidden through the beat, a tap then ignored), "Tap
                            to continue" on both with no count until a tap, P1's open
                            shop holding the start ("Waiting for P1…" on P2, its tap
                            ignored, P1's power key closing the shop), P2's tap
                            starting the count, Settings holding it, GO starting
                            level 2 on both with equal distances and
                            each ghost on the other's poop, the catch-up draws at
                            15 / 30 / 0 behind, a crash as a respawn (the −N popup,
                            the halted world, the cleared field and finish line, the
                            glide, a shared pause mid-blink, Settings mid-respawn,
                            the restart with grace and a centred pair, the 0 floor),
                            the first finisher waiting under its banner while its
                            tray / tap / d-pad still pause and resume the other, the
                            end when both are out with no Over and nothing recorded,
                            the panel's 💀 row, rematches for the fewer-crashes
                            tiebreak and the draw, Home; C: the ghost at the distance
                            gap with the live face, level, past the range, the rival
                            marker, the crash face and blink on the ghost, P2's
                            distance against its real next pair after a respawn
                            and after a fart, the fade-out once the other's run
                            ends). The
                            viewport is pinned to 720x1280 before load
                            (Emulation.setDeviceMetricsOverride) so the rest is
                            the phone field; tapAt maps through the live
                            __flappy.scale size. The page's
                            navigator.getGamepads is stubbed to [] before load: a
                            pad paired to the machine is visible to headless Chrome
                            and its presses would otherwise reach the game.
                            Zero dependencies (fetch + WebSocket).

.claude/plans/              Active / incomplete dated build plans + living specs
                            (e.g. the Save Code Spec). Add a new dated plan here
                            for new multi-step work; when Status is complete, move
                            it into Archive/.
.claude/plans/Archive/      Completed build plans (historical record + decision
                            log). Don't edit archived plans.
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
   Scenes never read `GAME_WIDTH`: the world uses `this.scale.width` (Play: `this.fieldW`,
   its strip of the canvas in a two-player match), the chrome
   `uiColumn()` (`tests/scenes.test.js` enforces both). Touch is the primary input (`pointerdown`); keyboard
   (Space / Up / M / P / Esc / S / I / L / F / B / T; in a match the two groups of
   `TUNING.versus.keys`) and the gamepad (A / B / Y /
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
  controller can walk it. A scene that is not an overlay (Versus, the second
  Play instance) is instead excluded from the overlay list in `tests/tools.test.js`.
- Version bump (`VERSION` in `src/logic.js`) → a new first entry in
  `src/changelog.js` with the date and 1–5 bullets in both locales (the What's
  new page; `tests/changelog.test.js` fails the suite, and so `npm run push`,
  without it).
- New pad button or action → a knob in `TUNING.gamepad`, a row in `padAction`
  and `padIntent` (+ `tests/gamepad.test.js`), a `case` in `Play.onPadAction`
  that calls an existing handler (it receives the pad's index too). Never bind the
  Gamepad plugin in another scene: Play's binding sees every press and routes it
  to the scene on top, or to the half that claimed the pad in a match.
- Two-player rule or knob → pure parts in `src/versus.js` (+ `tests/versus.test.js`),
  a knob in `TUNING.versus`, wiring in `scenes/Versus.js` (the match) or `Play.js`
  (a half); anything random a run spawns goes through the course (`createCourse`),
  never a fresh `Math.random` / `createRng` in Play, or the halves drift apart.
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
  `parseVN` to `PARSERS`, never delete an old parser, never change `SECRET`. An
  optional key with a default (`p`, `l`, `h`) joins the current version without a
  bump (spec rule 5): write it only when it differs from the default so older
  codes stay byte-identical, and update the spec's payload table.
- New UI string → both locales in `src/i18n.js` + a row in `TRANSLATION_NOTES.md`
  (+ allowlist in `tests/i18n.test.js` only if intentionally identical). Scenes
  call `t(locale, key)`; never hardcode player English.
- Multi-step work worth planning → a dated markdown plan in `.claude/plans/`;
  when Status is complete, move it into `.claude/plans/Archive/`.
- Repo-wide conventions → this file. Player-facing docs → `README.md`.
- Locale copy review for LLMs → `TRANSLATION_NOTES.md` (keep in sync with `src/i18n.js`).
