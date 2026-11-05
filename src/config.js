// Logical playfield. Everything in the scenes is laid out in these units;
// Phaser's Scale Manager fits them to whatever screen the game runs on.
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// Tuning knobs. Pixels, seconds, milliseconds. Pure data, safe to import in Node.
export const TUNING = {
  gravity: 2600, // px/s^2 pulling the poop down
  flapVelocity: -760, // px/s applied on tap
  pipeSpeed: 275, // px/s pipes scroll left at level 1 (each level adds levels.speedStep)
  pipeSpacingPx: 412, // px between pipe pairs, fixed for every level (1.5 s at level-1 speed; faster levels = less time per pipe)
  gapHeight: 340, // vertical opening between a pipe pair
  pipeWidth: 128,
  groundHeight: 128,
  gapMargin: 80, // keep the gap this far from the ceiling and the ground
  poopX: 180, // fixed x of the player
  poopRadius: 48, // px circular hitbox = half the 96 logical-px sprite (the whole drawing, square corners excluded)
  spriteDisplayScale: 0.25, // 384 px textures drawn at 96 logical px
  hudProbioticSize: 96, // logical px; HUD icon uses setDisplaySize
  hudScoreY: 116, // px centre line of the 80 px score (and the 🚽 beside it): below the progress bar with air between
  pipePoints: 1, // points per pipe pair passed (× the postbiotic multiplier)
  maxFallAngle: 90, // degrees nose-down at terminal fall
  maxRiseAngle: -25, // degrees nose-up right after a flap
  angleFallRefVy: 1200, // px/s; vy at which fall tilt reaches maxFallAngle
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
  launchSlideMs: 700, // ms the poop slides from its ready spot to poopX on the start tap
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
    speedStep: 25, // px/s added to pipeSpeed per level after the first
    gapScale: [1.1, 1.05], // × gapHeight per level, index = level − 1 (374 / 357 px); later levels use gapHeight as is
    maxSpeed: 450, // px/s cap (level 8+)
    finishWidthPx: 96, // px width of the checkered finish line (three columns of finishCheckPx checks)
    finishCheckPx: 32, // px size of one check on the finish line
    // Level 1 is a scripted intro: which pair (1-based) carries which pickup; no random
    // rolls until level 2. Gap items ride in that pair's gap; fiber and the bean bob in
    // the open after it. All must be below levels.pipes[0].
    tutorial: { probiotic: 3, bacteria: 5, fiber: 7, bean: 9 },
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
    pipeY: 184, // px centre of the quick "+1" per pipe pair, under the 80 px score (between the bean and probiotic counters)
    itemY: 236, // px centre of the "+3" / "−3" for fiber / bacteria, stacked under the pipe row
    fontPx: 48, // px font size of both popup rows
    pipeFadeMs: 80, // ms the pipe "+1" fades in, and again out (quick; the next pipe restarts it)
    pipeHoldMs: 250, // ms the pipe "+1" stays at full alpha
    pipeColor: '#ffffff', // white "+1" / "+2"
    fadeMs: 200, // ms the item popup fades in, and again out
    holdMs: 500, // ms the item popup stays at full alpha between the fades
    fiberColor: '#a8f0a8', // light green "+3" when fiber is eaten
    bacteriaColor: '#ff9a9a', // light red "−3" when unshielded bad bacteria hits
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
    hazardStartScore: 15, // score at which bad bacteria may appear
    chancePerGap: 0.3, // 0–1 chance a gap rolls an item
    fiberPoints: 3, // points added by fiber
    bacteriaPenalty: 3, // points subtracted by unshielded bacteria (3 since probiotics stack)
    probioticPipes: 5, // pipes a probiotic lasts
    postbioticMultiplier: 2, // × on pipes and fiber while a postbiotic runs (fiber eaten with a probiotic up)
    itemRadius: 48, // px circular hitbox = half the 96 logical-px sprite (whole drawing)
    weights: { fiber: 3, probiotic: 2, bacteria: 4 },
    fiberPeriodMs: 3000, // ms for one full up-and-down bob of a fiber between pipe pairs (beans use beans.travelPeriodMs)
    moveFromLevel: 3, // from this level probiotic / bacteria move up and down inside their gap
    movePeriodMs: 1600, // ms for one full up-and-down sweep of a moving gap item
    moveMarginPx: 8, // px kept between a moving gap item and the pipe mouths
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

// Shared leaderboard (Supabase, plain fetch; see db/schema.sql and src/leaderboard.js).
// Both values are copied from the Supabase dashboard and are public by design: they
// ship to every player's browser. The schema's grants are the security boundary.
// An empty dataApi or publishableKey disables the feature (no requests are made).
export const LEADERBOARD = {
  dataApi: 'https://soaakwxspmpcprgyywul.supabase.co/rest/v1', // Data API base URL
  publishableKey: 'sb_publishable_yPcLgM5m3UwiywHuSH2nVA_46Eq1Cle', // sent as the apikey header
  timeoutMs: 4000, // ms before a request is abandoned (the game never waits on it)
  limit: 10, // rows on the board
  storageKey: 'flappyPoop.leaderboard', // localStorage key for the last confirmed submit
  maxScore: 200, // scores above this are not submitted (matches the CHECK in db/schema.sql)
};
