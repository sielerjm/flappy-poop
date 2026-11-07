// Logical playfield. Everything in the scenes is laid out in these units;
// Phaser's Scale Manager fits them to whatever screen the game runs on.
// GAME_WIDTH is the portrait (phone) width and the width of the chrome column;
// the live field can be wider (FIELD), which scenes read as this.scale.width.
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// Logical field: the height is fixed; the width follows the window's aspect
// between a phone portrait (minWidth = GAME_WIDTH) and 2:1 (maxWidth), so a
// desktop window fills sideways instead of showing dark bars. Chrome (tray,
// level bar, HUD, ready buttons) stays in a centred minWidth column
// (uiColumn); the world spans the full width. Chosen at boot and re-applied on
// a window resize only between runs. Pure data, Node-safe.
export const FIELD = {
  height: GAME_HEIGHT,
  minWidth: GAME_WIDTH,
  maxWidth: 2560, // px; wider windows get FIT's letterbox bars again
  resizeDebounceMs: 250, // ms a window resize must settle before the field is re-fitted
};

// Tuning knobs. Pixels, seconds, milliseconds. Pure data, safe to import in Node.
export const TUNING = {
  gravity: 2600, // px/s^2 pulling the poop down
  flapVelocity: -760, // px/s applied on tap
  pipeSpeed: 275, // px/s pipes scroll left at level 1 (each level adds levels.speedStep up to levels.maxSpeed)
  pipeSpacingPx: 412, // px between pipe pairs from levels.spacingRefLevel on (1.27 s at level-3 speed); slower levels get more, see pipeSpacing()
  gapHeight: 340, // vertical opening between a pipe pair
  pipeWidth: 128,
  groundHeight: 128, // px, the ground strip: the poop dies at its edge and gaps keep gapMargin above it
  ceilingHeight: 128, // px, the ceiling strip (the ground's mirror): the poop dies at its edge and gaps keep gapMargin below it
  gapMargin: 80, // keep the gap this far from the ceiling and the ground
  poopXFrac: 0.25, // 0–1 share of the field width where the player sits (180 px of a 720 field; the same share on a wider desktop field; poopX())
  poopRadius: 48, // px circular hitbox = half the 96 logical-px sprite (the whole drawing, square corners excluded)
  spriteDisplayScale: 0.25, // 384 px textures drawn at 96 logical px
  hudProbioticSize: 96, // logical px; HUD icon uses setDisplaySize
  hudScoreY: 116, // px centre line of the 80 px score (and the 🚽 beside it): below the progress bar with air between
  pipePoints: 1, // points per pipe pair passed (× the postbiotic multiplier)
  maxFallAngle: 90, // degrees nose-down at terminal fall
  maxRiseAngle: -25, // degrees nose-up right after a flap
  angleFallRefVy: 1200, // px/s; vy at which fall tilt reaches maxFallAngle
  fallLookVy: 1000, // px/s downward speed from which the poop wears its falling face (scared eyes, sweat marks): ≈0.4 s of free fall after the apex (0.7 s after the tap), so a tap-tap-tap never shows it and any flap clears it at once
  deathToOverMs: 700, // tumble time before the game-over panel appears
  retryLockoutMs: 400, // ignore taps on the panel for this long so a death tap can't restart
  bestKey: 'flappy-poop:best', // localStorage key
  settingsKey: 'flappy-poop:settings', // localStorage key
  vibrateOnDieMs: 60, // ms buzz on death (Android / Chrome only)
  trayHeight: 112, // px band at the bottom reserved for the control tray
  trayAlpha: 0.6, // 0–1 idle alpha of tray buttons
  trayHitMin: 88, // px minimum tray button hit size
  pauseResumeLockoutMs: 300, // ms after resume during which a tap must not flap
  readyButtonRadius: 24, // px corner radius of ready-screen buttons
  readyButtonAlpha: 0.55, // 0–1 fill alpha of ready-screen buttons
  readyPromptGlowPx: 40, // px the "Enter username" halo reaches past the button edge (fades to 0 there)
  readyPromptPulseMs: 900, // ms per halo pulse (one way)
  readyPromptMinAlpha: 0.45, // 0–1 halo pulse floor
  readyPromptMaxAlpha: 1, // 0–1 halo pulse ceiling
  savePanelCloseMs: 600, // ms "Username saved" stays up before the panel closes itself (Enter-username flow only)
  launchSlideMs: 700, // ms the poop slides from its ready spot to poopX() on the start tap
  readyTitlePx: 72, // px font size of the FLAPPY POOP title on the ready screen
  readyPoopScale: 1.5, // × spriteDisplayScale for the speech-bubble poop on the ready screen (shrinks back during the slide)
  toiletOffColor: 0x6a6a6a, // toggle track when off (grey)
  toiletOnColor: 0x8b5a2b, // toggle track when on (brown)
  toiletOffAlpha: 0.43, // 0–1 alpha of the 🚽 while the toggle is off
  toiletKnobMs: 150, // ms the toggle knob takes to slide
  fartVolume: 0.6, // 0–1 Phaser volume for the death fart sample
  levelUpVolume: 0.6, // 0–1 Phaser volume for the level-up chime (NewLevel.mp3)
  levels: {
    pipes: [10, 25, 50], // pipe pairs in levels 1, 2, 3; every later level repeats the last entry (ends at 10, 35, 85, 135, …)
    lastLevel: 7, // the final level (rectum, = LEVELS.length): crossing its finish line wins the run
    spacingRefLevel: 3, // levels slower than this one space their pipes pipeSpacingPx × (its speed ÷ theirs): 487 px on level 1, 446 on level 2
    speedStep: 25, // px/s added to pipeSpeed per level after the first
    gapScale: [1.1, 1.05], // × gapHeight per level, index = level − 1 (374 / 357 px); later levels use gapHeight as is
    maxSpeed: 325, // px/s cap = level 3's speed: levels 3+ share one cruise; later difficulty is content (hazards, mystery boxes, moving pipes), not a faster scroll
    finishWidthPx: 96, // px width of the checkered finish line (three columns of finishCheckPx checks)
    finishCheckPx: 32, // px size of one check on the finish line
    // Level 1 is a scripted intro: pair (1-based) → the pickup it carries; no random
    // rolls and no bad bacteria until level 2. Gap items ride in that pair's gap; fiber
    // and the bean sit in the open after it (fiber at 4 and 7 = between pairs 4–5 and
    // 7–8, the bean between 9–10). All must be below levels.pipes[0].
    tutorial: { 3: 'probiotic', 4: 'fiber', 7: 'fiber', 9: 'bean' },
    fadeMs: 600, // ms the background crossfades to the next level's colour during the break
    whiteBlend: 0.2, // 0–1 share of white mixed into every level colour (0 = the raw palette)
    barY: 48, // px centre line of the progress bar (air above it from the screen top)
    barHeight: 32, // px height of the progress bar
    barLabelPx: 26, // px font size of the LV n label (digits ≈ 19 px tall, so ~6 px of air inside the track)
    barFlagPx: 34, // px font size of the 🏁
    barInset: 48, // px from the field edges to the bar track (right side also leaves room for the 🏁)
    barAlpha: 0.6, // 0–1 alpha of the bar track
    barTrackColor: 0xd9d9d9, // light grey track
    barFillColor: 0xe85e96, // pipe pink fill (make_placeholders.py PINK)
    barTweenMs: 200, // ms the fill animates to its new width after each pipe
  },
  popup: {
    rowY: [184, 236], // px centres of the popup rows under the 80 px score: showing popups stack oldest first (top row between the bean and probiotic counters)
    shiftMs: 90, // ms a popup slides up a row when the one above it goes
    fontPx: 48, // px font size of both popup rows
    pipeFadeMs: 80, // ms the pipe "+1" fades in, and again out (quick; the next pipe restarts it)
    pipeHoldMs: 250, // ms the pipe "+1" stays at full alpha
    pipeColor: '#ffffff', // white "+1" / "+2"
    fadeMs: 200, // ms the item popup fades in, and again out
    holdMs: 500, // ms the item popup stays at full alpha between the fades
    fiberColor: '#a8f0a8', // light green "+3" when fiber is eaten
    bacteriaColor: '#ff9a9a', // light red "−3" when unshielded bad bacteria hits
  },
  over: {
    panelInMs: 180, // ms the game-over panel scales in
    buttonOffsetY: 250, // px below the panel centre of the Share | Home row
    buttonWidth: 240, // px per button (Home alone on a test run, centred)
    buttonHeight: 88, // px (= trayHitMin, a thumb-sized Share target)
    buttonGap: 40, // px between Share and Home (Home's halo reaches readyPromptGlowPx past its edge)
  },
  shareCard: {
    width: 1080, // px: the shared image, a 4:5 portrait (the largest shape Instagram's feed shows uncropped)
    height: 1350, // px
    border: 16, // px pink frame round the card
    margin: 24, // px kept between the frame and any text (fillText max width)
    headlineY: 130, // px centre of GAME OVER (or the win line)
    headlinePx: 110, // px font size of GAME OVER
    winHeadlinePx: 84, // px font size of the longer win line
    poopBox: { y: 400, width: 520, height: 360, radius: 28, stroke: 10 }, // px: the tan frame round the poop (centre y)
    poopPx: 300, // px the happy poop is drawn at inside the frame
    scoreY: 690, // px centre of "SCORE n · LV n"
    scorePx: 80, // px font size of the score line
    rowY: [820, 940], // px centres of the two pickup rows (fiber · probiotic · postbiotic / bacteria · bean · box)
    columnX: 300, // px from the card centre to the outer columns
    iconPx: 84, // px pickup icons
    countPx: 56, // px font size of the ×n counts
    pipeY: 1065, // px centre of the pipes row
    pipeIconPx: 88, // px height of the pipe-cap icon (the 128x160 top slice of pipe.png)
    pipePx: 68, // px font size of the pipes ×n
    footerY: 1235, // px centre of "Play: sielerjm.github.io/flappy-poop"
    footerPx: 46, // px font size of the footer
  },
  postbiotic: {
    color: '#ffd700', // gold "×2" badge beside the score while the multiplier runs
    glowColor: '#ffb300', // amber glow (text shadow) around the badge
    fontPx: 32, // px font size of the badge (a subscript to the 80 px score)
    glowPx: 12, // px shadow blur; also the text padding so the glow is not clipped
    pulseMs: 600, // ms per pulse (one way)
    minAlpha: 0.7, // 0–1 pulse floor
    maxScale: 1.15, // × size at the top of the pulse
    offsetX: 4, // px from the score digits' right edge to the badge glyphs
    offsetY: 26, // px below hudScoreY (subscript: sits on the digits' baseline)
  },
  items: {
    startScore: 8, // score at which pickups may appear
    hazardFromLevel: 2, // bad bacteria never appear before this level …
    hazardFromPair: 5, // … nor before this pair (1-based) of it: level 2, pair 5 = pipe pair 15 of the run
    chancePerGap: 0.3, // 0–1 chance a gap rolls an item
    fiberPoints: 3, // points added by fiber
    bacteriaPenalty: 3, // points subtracted by unshielded bacteria (3 since probiotics stack)
    probioticPipes: 5, // pipes a probiotic lasts
    postbioticMultiplier: 2, // × on pipes and fiber while a postbiotic runs (fiber eaten with a probiotic up)
    itemRadius: 48, // px circular hitbox = half the 96 logical-px sprite (whole drawing)
    weights: { fiber: 3, probiotic: 2, bacteria: 4 },
    fiberPeriodMs: 3000, // ms for one full up-and-down bob of a fiber between pipe pairs (beans use beans.travelPeriodMs)
    moveFromLevel: 3, // from this level probiotic / bacteria move up and down inside their gap
    bandMoveFromLevel: 2, // from this level fiber and beans bob between the pairs; before it they hold still, midway between the two gaps
    movePeriodMs: 1600, // ms for one full up-and-down sweep of a moving gap item
    moveMarginPx: 8, // px kept between a moving gap item and the pipe mouths
  },
  mystery: {
    firstLevel: 3, // boxes start on this level: the first is guaranteed …
    firstBefore: 5, // … after one of its first four pairs (picked at random), so it comes before pipe 5; after it boxes roll by weight on every pair
    moveFromLevel: 4, // boxes hold still midway between two gaps before this level; from it they bob at periodMs
    weight: 1.5, // share of the item roll (after the first box) = items.weights.fiber / 2, so a box is half as common as fiber (it takes the fiber spot between the pairs)
    periodMs: 6000, // ms per full up-and-down bob = 2 × items.fiberPeriodMs (half fiber's speed)
    frameMs: 70, // ms per spin frame (the source GIF's timing)
    postbioticPipes: 5, // pipes the postbiotic draw adds, ×2 already on (= items.probioticPipes)
    // 0–1 chance of each draw when a box opens; fiber (the default) takes the rest (0.49).
    // bean1 / bean3 add one / three beans; skip clears the rest of the level (skipped pairs score).
    draws: { probiotic: 0.2, bean1: 0.2, postbiotic: 0.05, bean3: 0.05, skip: 0.01 },
    revealMs: 700, // ms the drawn reward's icon rises out of the box and fades
    revealRisePx: 70, // px it rises
    color: '#ffd700', // gold "+N" for the skipped pairs
  },
  beans: {
    startScore: 5, // score from which beans may appear
    windowEndScore: 20, // end of the "at least one bean" window (scores 5–20)
    chanceInWindow: 0.15, // 0–1 chance per pipe pair inside the window (fiber's effective rate is ~0.10–0.18)
    chanceAfter: 0.06, // 0–1 chance per pipe pair after the window (below fiber's ~0.10)
    guaranteeScore: 17, // if no bean has spawned yet, the pair spawned at this score carries one (on screen ~2 pipes later, by pipe 20)
    toCharge: 1, // beans needed to ready the fart power
    maxBeans: 3, // beans the poop can carry; none spawn or are taken past this
    superBeans: 3, // beans held at activation that make it a super fart
    powerPipes: 5, // pipe pairs that cross the screen during one fart (1–2 beans)
    superPipes: 20, // pipe pairs during a super fart, in the same clip (≈10× base speed at the peak)
    powerMs: 4344, // ms; fallback power length = the fart_accelerate clip (the loaded sound's duration wins)
    travelPeriodMs: 4000, // ms for one full up-and-down bob
    travelFrac: 0.5, // 0–1 share of the playable height the bob covers, centred (0.5 = middle half)
    wiggleDeg: 15, // degrees of rotation wiggle about the bean's centre (±)
    wigglePeriodMs: 450, // ms per wiggle cycle
    graceMs: 700, // ms of invulnerability after the fart ends (clears a pipe column at level-1 speed: 0.7 × 275 ≥ pipeWidth + poopRadius)
    stinkFrameMs: 180, // ms between stink-line frames while charged
    glowRadiusPx: 64, // px radius of the glow behind the poop (scale 1)
    glowFadeFrac: 0.25, // 0–1 outer share of the glow radius that fades to transparent
    glowMinAlpha: 0.2, // 0–1 white glow pulse floor while charged
    glowMaxAlpha: 0.6, // 0–1 white glow pulse ceiling while charged
    glowPulseMs: 600, // ms per glow pulse (one way)
    fartAlphaMs: 250, // ms per opacity swing (1 → 0.5) while farting
    centreMs: 300, // ms the poop takes to float to mid-height when the fart starts (gravity off, flaps ignored until it ends)
    waveAmplitudePx: 60, // px the floating poop rises and falls around mid-height while farting
    wavePeriodMs: 1200, // ms for one full rise-and-fall of the float wave
    waveTiltDeg: 15, // degrees the floating poop tilts: nose up (−) while rising, nose down (+) while falling
    rainbowPeriodMs: 1500, // ms for one full hue cycle of the glow / bean button with superBeans held, and of the super-fart halo
    superGlowAlpha: 0.75, // 0–1 alpha of the rainbow halo behind the poop during a super fart
    superGlowScale: 1.4, // × glow radius during a super fart
    endClearMarginPx: 64, // px of extra scroll kept in hand so the last pipe is fully behind the poop when the fart ends
    beanRadius: 48, // px circular hitbox = half the 96 logical-px sprite
  },
  prefill: {
    leadGrowth: 0.25, // 0–1 share of the field's extra width (beyond a phone's 720) added to the first pair's lead, so a wide field's first pipes settle a little past the middle: more buffer before the poop reaches them (a phone adds nothing)
    sweepMs: 1200, // ms the pre-filled pairs take to come in from the right edge and settle (quadratic ease-out: fast off the edge, braking to the level's scroll speed by about the field's middle, fading in); only a field wider than a phone has anything to sweep
  },
  gamepad: {
    // Standard-mapping button indices (Xbox: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, View 8, Menu 9, d-pad 12–15).
    // A pad that reports another layout (pad.mapping !== 'standard') is retuned here, not in code.
    select: 0, // A: flap / start / resume / press the ringed button
    back: 1, // B: close the top overlay, resume from pause, hide the ring
    mute: 3, // Y: toggle sound
    power: 7, // RT: fire the bean power (analog; see triggerThreshold)
    pause: 9, // Menu: pause / resume
    up: 12, // d-pad
    down: 13,
    left: 14,
    right: 15,
    triggerThreshold: 0.5, // 0–1 fraction of RT travel that counts as a press (Phaser's default 1 = pulled to the stop)
    stickDeadzone: 0.5, // 0–1 stick deflection below which a stick does not navigate
    repeatDelayMs: 350, // ms a stick is held before it starts repeating
    repeatEveryMs: 150, // ms between repeats while held
  },
  focus: {
    ringPad: 10, // px the ring sits outside the focused button's bounds
    ringWidth: 4, // px stroke
    ringRadius: 14, // px corner radius
    fillAlpha: 0.18, // 0–1 translucent white inside the ring so it lifts off the villi (0 = outline only)
    pulseScale: 1.06, // × ring scale at the top of the pulse
    pulseMs: 500, // ms per pulse (one way)
    scrollStepPx: 160, // px a d-pad up / down scrolls About and How to play
  },
};

// Gut segments the poop travels through, one per level, in order. `key` is the
// i18n name key (`level.<key>`). Past the last row a level has no name.
export const LEVELS = [{ key: 'stomach' }, { key: 'duodenum' }, { key: 'jejunum' }, { key: 'ileum' }, { key: 'caecum' }, { key: 'colon' }, { key: 'rectum' }];

// Solid background colour per level, cycling past the end (level 7 = colour 1 …).
// ColorBrewer Set2 (the light Dark2) minus its orange #fc8d62 and salmon #fb8072,
// which sit too close to the villi pink (#ec8ca0, within ~60 channel units) and would wash the fringes
// out; tests/levels.test.js keeps every colour at a distance from the villi and
// the cream bands (#f6ded2).
export const LEVEL_COLORS = [
  0xe5c494, // tan (level 1)
  0x66c2a5, // teal
  0x8da0cb, // periwinkle
  0xa6d854, // lime
  0xffd92f, // yellow
  0x80b1d3, // light blue
];

// Transparent overlay layers drawn over the level colour, back to front. Each is a
// tileSprite of `key` (loaded in Boot) scrolled at `parallax` × the pipe speed.
export const BACKGROUND = {
  layers: [{ key: 'villi', parallax: 0.25 }],
};

// Test mode: a session-only sandbox (start level, invincible, power-ups on demand)
// whose runs never save. Typing one of `words` in the save panel's Username field and
// pressing Save toggles it; a trigger word is never stored as a name (so it can never
// relabel the player's leaderboard row). It is public in
// this source on purpose: test runs cannot reach the top list or the leaderboard.
export const TEST_MODE = {
  words: ['pooptest', 'testpoop'], // triggers (either spelling), matched trimmed and case-insensitively (each fits NAME_MAX 16)
  defaultInvincible: true, // Invincible toggle state when test mode turns on
};

// Share from the game-over panel (src/share.js): the image's file name, the share
// sheet title, and the link in the message (always the live game, even from localhost).
export const SHARE = {
  url: 'https://sielerjm.github.io/flappy-poop/',
  title: 'Flappy Poop',
  fileName: 'flappy-poop-score.png',
};

// Shared leaderboard (Supabase, plain fetch; see db/schema.sql and src/leaderboard.js).
// Both values are copied from the Supabase dashboard and are public by design: they
// ship to every player's browser. The schema's grants are the security boundary.
// An empty dataApi or publishableKey disables the feature (no requests are made).
export const LEADERBOARD = {
  dataApi: 'https://soaakwxspmpcprgyywul.supabase.co/rest/v1', // Data API base URL
  publishableKey: 'sb_publishable_yPcLgM5m3UwiywHuSH2nVA_46Eq1Cle', // sent as the apikey header
  timeoutMs: 4000, // ms before a request is abandoned (the game never waits on it)
  limit: 25, // rows fetched and shown on the board (Top 25)
  visibleRows: 10, // rows inside the board's window at once; the rest scroll (finger, wheel, d-pad)
  storageKey: 'flappyPoop.leaderboard', // localStorage key for the last confirmed submit
  maxScore: 1000, // scores above this are not submitted (matches the CHECK and submit_score() in db/schema.sql); a full 285-pair run with ×2 fits
};
