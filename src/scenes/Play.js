import { GAME_WIDTH, GAME_HEIGHT, TUNING as T, LEVELS, LEVEL_COLORS, BACKGROUND } from '../config.js';
import {
  createRng,
  pipeGapY,
  centredGapY,
  hasPassed,
  angleForVelocity,
  levelSpeed,
  levelEnd,
  levelProgress,
  levelBarLayout,
  levelColor,
  lerpColor,
  createBestStore,
  createSettingsStore,
  vibrate,
  rollItem,
  itemGapY,
  scoreAfterItem,
  createEffects,
  chromeIntent,
  trayLayout,
  trayHit,
  readyLayout,
  readyHit,
  scaledCircleBody,
  rollBean,
  pipeSpacing,
  beanSpawnX,
  beanBounds,
  beanY,
  beanAngle,
  poopTapHit,
  fartPeakMul,
  fartMul,
  fartFloat,
  hsvToRgb,
  rainbowHue,
  fartRemainingDistance,
  pipeClearDistance,
  beanButtonLayout,
  beanButtonHit,
} from '../logic.js';
import { t, pauseBannerText, levelBannerText, levelLabel, initialLocale, isLocale, profileButtonText } from '../i18n.js';
import { loadLocal, saveLocal, ensureId, recordScore, isNewTop, topScores, TOILET_EMOJI } from '../save.js';
import { unlock, attachGame, setMuted, isMuted, sfx } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createGlow, createRectGlow } from '../ui/glow.js';
import { createFinishTexture } from '../ui/finish.js';
import { createLevelBar } from '../ui/levelBar.js';
import { createSubmitStore, submitPlan, submitScore } from '../leaderboard.js';
import { createButton } from '../ui/button.js';
import { createToggle } from '../ui/toggle.js';
import { openSavePanel } from '../ui/savePanel.js';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontStyle: 'bold',
  color: '#ffffff',
  stroke: '#5a2a44',
  strokeThickness: 12,
  align: 'center',
};

export class Play extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    this.rng = createRng(Date.now() & 0xffffffff);
    this.score = 0;
    this.best = createBestStore(globalThis.localStorage, T.bestKey);
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);
    // Save-code state (name + top 3). Seed from the legacy best once so an
    // existing player's record is not lost when top is still empty.
    this.save = loadLocal();
    const legacyBest = this.best.load();
    if (this.save.top.length === 0 && legacyBest > 0) this.save = saveLocal(recordScore(this.save, legacyBest));
    this.submitStore = createSubmitStore(); // last confirmed leaderboard submit
    // Levels: pipe pairs passed decide the level; speed is per level, gap is fixed.
    this.level = 1;
    this.pipesPassed = 0;
    this.pipesSpawned = 0;
    this.diff = { pipeSpeed: levelSpeed(1, T), gapHeight: T.gapHeight };
    // Finish line + break: the line spawns in the slot after a level's last pair
    // and nothing follows it; crossing it pauses the run (levelBreak) until a tap.
    // A fart never carries the poop past the line: it is cut there.
    this.finishLine = null;
    this.finishSpawned = false;
    this.levelBreak = false;
    this.breakBob = null;
    this.breakGlide = null;
    createFinishTexture(this, 'finish', { width: T.levels.finishWidthPx, height: GAME_HEIGHT, check: T.levels.finishCheckPx });
    this.state = 'ready'; // 'ready' | 'playing' | 'paused' | 'dead'
    this.flapLockedUntil = 0;
    this.effects = createEffects(T);
    // Scroll multiplier (1 normally, the fart envelope while the power runs),
    // post-fart grace, and distance-based pipe spawning. None of these read
    // this.time.now: they advance by delta only while playing, so pausing freezes them.
    this.scrollMul = 1;
    this.graceLeftMs = 0;
    this.distanceSinceSpawn = 0;
    this.fartDurationMs = 0;
    this.fartPeak = 1;
    this.charged = false;
    this.centreNextGap = false; // first pair after a fart opens at the poop's float height
    this.beanBounds = beanBounds({ gameHeight: GAME_HEIGHT, groundHeight: T.groundHeight, radius: T.beans.beanRadius, frac: T.beans.travelFrac });
    this.locale = this.resolveLocale();
    attachGame(this.game);
    setMuted(!this.settings.load().sound);

    // Background: a solid per-level colour (crossfaded at each break) under the
    // transparent overlay layers from BACKGROUND.layers, each a tileSprite scrolled
    // at its own parallax. Tile-scale maps one texture copy onto the playfield so
    // a layer never repeats vertically.
    // Negative depths: pipes, items and beans are created later at depth 0 and must draw over every layer.
    this.bgColor = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, levelColor(1, LEVEL_COLORS), 1).setOrigin(0, 0).setDepth(-20);
    this.bgFade = null;
    this.bgLayers = BACKGROUND.layers.map((layer, i) => {
      const sprite = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, layer.key).setOrigin(0, 0).setDepth(-10 + i);
      const f = sprite.frame;
      sprite.setTileScale(GAME_WIDTH / f.width, GAME_HEIGHT / f.height);
      return { sprite, parallax: layer.parallax };
    });
    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.items = this.physics.add.group({ allowGravity: false, immovable: true });
    this.beans = this.physics.add.group({ allowGravity: false, immovable: true });
    this.ground = this.add
      .tileSprite(0, GAME_HEIGHT - T.groundHeight, GAME_WIDTH, T.groundHeight, 'ground')
      .setOrigin(0, 0)
      .setDepth(5);
    {
      const f = this.ground.frame;
      this.ground.setTileScale(GAME_WIDTH / f.width, T.groundHeight / f.height);
    }

    // Ready-screen geometry (title, poop spot, buttons). Taps resolve through
    // readyHit() in flap(), not GameObject handlers, so the chrome is visual only.
    this.readyBoxes = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
    this.launching = false;
    // Toilet mode: session-only (registry survives scene.restart, not a reload).
    this.toilet = Boolean(this.registry.get('toilet'));

    // Player: bobs at its ready spot wearing the "TAP TO FLAP!" bubble; no gravity
    // until launch() has swapped to the plain frame and slid it to poopX.
    this.poop = this.physics.add.sprite(this.readyBoxes.poop.x, this.readyBoxes.poop.y, 'poop-speech').setDepth(10);
    this.poop.setScale(T.spriteDisplayScale * T.readyPoopScale); // bigger on the ready screen; launch() shrinks it back
    this.setPoopTexture('poop-speech');
    this.beanSpawned = false;
    this.poop.body.setAllowGravity(false);
    // Soft-edged white glow behind the poop while the fart power is charged (alpha
    // pulses; tinted by applyRainbow). Scale 1 = glowRadiusPx.
    this.glow = createGlow(this, this.poop.x, this.poop.y, { radius: T.beans.glowRadiusPx, fadeFrac: T.beans.glowFadeFrac })
      .setAlpha(0)
      .setDepth(9);
    this.bob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // HUD
    this.scoreText = this.add.text(GAME_WIDTH / 2, 80, '0', { ...TEXT_STYLE, fontSize: '80px' }).setOrigin(0.5).setDepth(20);
    // Level progress bar above the score: hidden on the ready screen, shown from start(), kept through breaks and death.
    this.levelBar = createLevelBar(this, levelBarLayout(T, GAME_WIDTH)).setVisible(false);
    this.refreshLevelBar();
    // 🚽 left of the score while a toilet-mode run is on.
    this.toiletHud = this.add.text(GAME_WIDTH / 2 - 96, 80, TOILET_EMOJI, { fontFamily: 'sans-serif', fontSize: '44px' }).setOrigin(0.5).setDepth(20).setVisible(false);
    this.probioticIcon = this.add
      .image(GAME_WIDTH / 2 - 56, 156, 'probiotic')
      .setDisplaySize(T.hudProbioticSize, T.hudProbioticSize)
      .setDepth(20)
      .setVisible(false);
    this.probioticText = this.add.text(GAME_WIDTH / 2 + 16, 156, '', { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    // Bean counter (left of the HUD): bean ×n until the power is spent.
    this.beanIcon = this.add.image(72, 156, 'bean').setDisplaySize(56, 56).setDepth(20).setVisible(false);
    this.beanText = this.add.text(108, 156, '', { ...TEXT_STYLE, fontSize: '36px' }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.readyTitle = this.add
      .text(this.readyBoxes.title.x, this.readyBoxes.title.y, t(this.locale, 'readyTitle'), { ...TEXT_STYLE, fontSize: '52px' })
      .setOrigin(0.5)
      .setDepth(20);
    this.toiletToggle = createToggle(this, this.readyBoxes.toilet, { on: this.toilet });
    this.howToBtn = createButton(this, this.readyBoxes.howto, t(this.locale, 'howToPlay'), { ...TEXT_STYLE, fontSize: '40px', color: '#f8a0c8' });
    this.saveLoadBtn = createButton(this, this.readyBoxes.saveLoad, t(this.locale, 'saveLoadButton'), {
      ...TEXT_STYLE,
      fontSize: '36px',
      color: '#f8a0c8',
    });
    // "<name> · best" button under Save / Load User: opens the Scores overlay.
    // Without a username it shows the enter-username prompt under a pulsing
    // soft white halo and opens the save panel on the name field instead.
    {
      const b = this.readyBoxes.profile;
      this.profileHalo = createRectGlow(this, b.x, b.y, { key: 'ready-halo', width: b.width, height: b.height, radius: T.readyButtonRadius, pad: T.readyPromptGlowPx })
        .setDepth(19)
        .setAlpha(T.readyPromptMinAlpha);
      this.profileHaloTween = this.tweens.add({ targets: this.profileHalo, alpha: T.readyPromptMaxAlpha, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    }
    this.profileBtn = createButton(this, this.readyBoxes.profile, profileButtonText(this.locale, this.save), { ...TEXT_STYLE, fontSize: '32px' }); // white: the player's own line, not a menu item
    this.refreshProfile();

    this.pauseShade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setDepth(25).setVisible(false);
    // Level-break banner shares the shade with the pause banner; setPauseBanner picks one.
    this.levelTitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, '', { ...TEXT_STYLE, fontSize: '52px', color: '#f8a0c8', wordWrap: { width: GAME_WIDTH - 64, useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.levelHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4 + 72, '', { ...TEXT_STYLE, fontSize: '36px' })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    const [pauseTitle, pauseHint] = pauseBannerText(this.locale).split('\n');
    this.pauseText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.40, pauseTitle, { ...TEXT_STYLE, fontSize: '52px' })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.pauseHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.40 + 72, pauseHint, {
        ...TEXT_STYLE,
        fontSize: '36px',
        wordWrap: { width: GAME_WIDTH - 64, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);

    this.tray = createTray(this, { muted: isMuted() });

    // Bean power button in the tray's centre slot: shown while charged, pulses
    // in step with the glow, and fires the fart like a tap on the poop.
    this.beanButtonBox = beanButtonLayout(GAME_WIDTH, GAME_HEIGHT, T);
    {
      const b = this.beanButtonBox;
      const r = b.size / 2;
      const bg = this.add.circle(0, 0, r, 0xffffff, 0.75).setStrokeStyle(4, 0xe85e96); // translucent white disc
      const icon = this.add.image(0, 0, 'bean').setDisplaySize(56, 56);
      // Container so the pulse scales circle + icon together without touching the icon's own scale.
      this.beanButton = this.add.container(b.x, b.y, [bg, icon]).setDepth(30).setVisible(false);
      this.beanButtonBg = bg; // recoloured by applyRainbow() with three beans held
    }
    this.rainbowMs = 0;
    this.rainbowMode = null; // null | 'charged' (superBeans held) | 'super' (super fart running)

    // Collisions
    this.physics.add.overlap(this.poop, this.pipes, () => this.die(), undefined, this);
    this.physics.add.overlap(this.poop, this.items, (_poop, item) => this.collectItem(item), undefined, this);
    this.physics.add.overlap(this.poop, this.beans, (_poop, bean) => this.collectBean(bean), undefined, this);

    // Input: any pointer (touch/mouse) or Space/Up. Tray taps go through trayHit.
    this.input.on('pointerdown', (pointer) => this.flap(pointer));
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
    this.input.keyboard?.on('keydown-M', () => this.handleChrome('mute'));
    this.input.keyboard?.on('keydown-P', () => this.handleChrome('pause'));
    this.input.keyboard?.on('keydown-ESC', () => this.handleChrome('esc'));
    this.input.keyboard?.on('keydown-S', () => this.handleChrome('settings'));
    this.input.keyboard?.on('keydown-I', () => this.handleChrome('info'));
    this.input.keyboard?.on('keydown-L', () => this.handleChrome('lang'));
    this.input.keyboard?.on('keydown-F', () => this.handleChrome('feedback'));
    this.input.keyboard?.on('keydown-T', () => this.handleChrome('leaderboard'));
    this.input.keyboard?.on('keydown-B', () => this.activatePower()); // no-op unless the bean power is charged

    this.onHidden = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause();
    };
    this.onBlur = () => this.autoPause();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
    this.game.events.on('blur', this.onBlur);
    this.events.once('shutdown', () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
      this.game.events.off('blur', this.onBlur);
      if (this.fartSound) {
        this.fartSound.stop();
        this.fartSound.destroy();
        this.fartSound = null;
      }
    });
  }

  /**
   * Start tap: hide the ready UI, slide the poop from its ready spot to the
   * play position, then start(). Extra taps during the slide are ignored.
   */
  launch() {
    if (this.launching || this.state !== 'ready') return;
    this.launching = true;
    this.bob.stop();
    this.setReadyUiVisible(false);
    this.setPoopTexture('poop');
    this.tweens.add({
      targets: this.poop,
      x: T.poopX,
      y: GAME_HEIGHT / 2,
      scale: T.spriteDisplayScale,
      duration: T.launchSlideMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.launching = false;
        if (this.state !== 'ready') return;
        this.start();
        this.doFlap();
        // An overlay opened mid-slide must not leave the run playing under it.
        if (this.chromeArgs('tap').overlay) this.pausePlay();
      },
    });
  }

  setReadyUiVisible(visible) {
    this.readyTitle.setVisible(visible);
    this.toiletToggle.setVisible(visible);
    this.howToBtn.setVisible(visible);
    this.saveLoadBtn.setVisible(visible);
    this.profileBtn.setVisible(visible);
    this.profileHalo.setVisible(visible && !this.save?.name);
  }

  start() {
    this.state = 'playing';
    this.bob.stop();
    this.toiletHud.setVisible(this.toilet);
    this.poop.body.setAllowGravity(true);
    this.poop.body.setGravityY(T.gravity);
    this.level = 1;
    this.pipesPassed = 0;
    this.pipesSpawned = 0;
    this.finishLine?.destroy();
    this.finishLine = null;
    this.finishSpawned = false;
    this.levelBreak = false;
    this.applyLevel();
    this.levelBar.setVisible(true);
    this.refreshLevelBar();
    this.bgFade?.stop();
    this.bgFade = null;
    this.bgColor.setFillStyle(levelColor(1, LEVEL_COLORS), 1);
    this.distanceSinceSpawn = 0;
    this.spawnPipePair();
  }

  /** Crossfade the background to the current level's colour (used at each break). */
  fadeBackground() {
    const from = this.bgColor.fillColor;
    const to = levelColor(this.level, LEVEL_COLORS);
    this.bgFade?.stop();
    const o = { f: 0 };
    this.bgFade = this.tweens.add({
      targets: o,
      f: 1,
      duration: T.levels.fadeMs,
      onUpdate: () => this.bgColor.setFillStyle(lerpColor(from, to, o.f), 1),
      onComplete: () => this.bgColor.setFillStyle(to, 1),
    });
  }

  /** Bar label and fill for the current level and pipes passed. */
  refreshLevelBar() {
    this.levelBar?.setLabel(levelLabel(this.locale, this.level));
    this.levelBar?.setProgress(levelProgress(this.pipesPassed, this.level, T));
  }

  /** The checkered line one spacing after a level's last pair; crossing it ends the level. */
  spawnFinishLine() {
    const w = T.levels.finishWidthPx;
    this.finishLine?.destroy();
    this.finishLine = this.add.image(GAME_WIDTH + w / 2, 0, 'finish').setOrigin(0.5, 0).setDepth(4);
    this.finishLine.setData('crossed', false);
    this.finishSpawned = true;
  }

  /**
   * The poop has cleared the finish line: next level and the break. A fart that
   * carried it here ends now, so only the pairs it actually passed have scored.
   */
  onFinishCrossed() {
    this.level += 1;
    this.refreshLevelBar(); // new level: label steps, fill back to 0
    sfx.levelUp();
    if (this.effects.cancelPower()) {
      this.fartSound?.stop();
      this.endPower();
    }
    this.startLevelBreak();
  }

  refreshLevelBanner() {
    const [title, hint] = levelBannerText(this.locale, this.level, LEVELS).split('\n');
    this.levelTitle?.setText(title);
    this.levelHint?.setText(hint);
  }

  /** Between levels: a real pause with the level banner, the poop gliding to mid-height and bobbing. */
  startLevelBreak() {
    if (this.state !== 'playing') return;
    this.levelBreak = true;
    this.refreshLevelBanner();
    this.pausePlay();
    this.fadeBackground();
    this.poop.setVelocity(0, 0);
    this.poop.body.setAllowGravity(false);
    this.breakGlide = this.tweens.add({
      targets: this.poop,
      y: GAME_HEIGHT / 2,
      angle: 0,
      duration: T.beans.centreMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!this.levelBreak) return;
        this.breakBob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
  }

  /** The tap that ends the break: new level's speed, grace, and the first pair opening at mid-screen (the fart's landing). */
  endLevelBreak() {
    this.levelBreak = false;
    this.breakGlide?.stop();
    this.breakGlide = null;
    this.breakBob?.stop();
    this.breakBob = null;
    this.finishSpawned = false;
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    this.centreNextGap = true;
    this.distanceSinceSpawn = pipeSpacing(T);
    this.applyLevel();
  }

  flap(pointer) {
    unlock();
    if (this.state === 'dead') return;
    if (pointer) {
      const id = trayHit(pointer.x, pointer.y, trayLayout(GAME_WIDTH, GAME_HEIGHT, T));
      if (id) {
        this.handleChrome(id);
        return;
      }
      if (this.state === 'ready' && !this.launching) {
        const hit = readyHit(pointer.x, pointer.y, this.readyBoxes);
        if (hit === 'howto') {
          this.handleChrome('howto');
          return;
        }
        if (hit === 'toilet') {
          this.toggleToilet();
          return;
        }
        if (hit === 'saveload') {
          this.openSavePanel();
          return;
        }
        if (hit === 'profile') {
          // Named: the High scores overlay. Unnamed: the prompt opens the save panel on the name field.
          if (this.save?.name) this.handleChrome('scores');
          else this.openSavePanel({ focusName: true, closeOnSave: true });
          return;
        }
        // 'start' or empty space both start the run below.
      }
      // Charged power: a tap on the poop itself or on the bean button fires the fart instead of flapping.
      if (this.state === 'playing' && this.effects.powerReady() && (poopTapHit(pointer.x, pointer.y, this.poop, T.poopRadius) || beanButtonHit(pointer.x, pointer.y, this.beanButtonBox))) {
        this.activatePower();
        return;
      }
    }
    this.handleChrome('tap');
  }

  resolveLocale() {
    let stored = null;
    try {
      const raw = globalThis.localStorage?.getItem(T.settingsKey);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (isLocale(parsed?.locale)) stored = parsed.locale;
      }
    } catch {
      /* private mode */
    }
    const locale = initialLocale(globalThis.navigator?.language, stored);
    if (stored == null) this.settings.set({ locale });
    return locale;
  }

  getLocale() {
    return this.locale ?? 'en';
  }

  getSaveState() {
    return this.save;
  }

  /** Called by the save panel after a name edit or a successful load. */
  setSaveState(state) {
    this.save = state;
    this.refreshProfile();
  }

  /**
   * Post the player's best to the shared leaderboard when it is newer than the
   * last confirmed submit. Named players only; the id is created on first use
   * (same as the first save-code export). Resolves on every outcome; a failed
   * post is retried on the next game over or board open.
   */
  syncLeaderboard() {
    if (!this.save?.name) return Promise.resolve();
    if (!this.save.id) this.save = ensureId(this.save);
    const plan = submitPlan(this.save, this.submitStore.load());
    if (!plan) return Promise.resolve();
    return submitScore(plan)
      .then((ok) => {
        if (ok) this.submitStore.save(plan);
      })
      .catch(() => {});
  }

  refreshProfile() {
    const named = Boolean(this.save?.name);
    this.profileBtn?.setText(profileButtonText(this.locale, this.save));
    if (this.state === 'ready' && !this.launching) {
      this.profileBtn?.setVisible(true);
      this.profileHalo?.setVisible(!named);
    }
  }

  openSavePanel(opts = {}) {
    openSavePanel({ game: this.game, play: this, locale: this.locale, ...opts });
  }

  toggleToilet() {
    this.toilet = !this.toilet;
    this.registry.set('toilet', this.toilet);
    this.toiletToggle.setOn(this.toilet);
  }

  applyLocale(next) {
    if (!isLocale(next)) return;
    this.locale = next;
    this.readyTitle?.setText(t(next, 'readyTitle'));
    this.howToBtn?.setText(t(next, 'howToPlay'));
    this.saveLoadBtn?.setText(t(next, 'saveLoadButton'));
    this.refreshProfile(); // the enter-username prompt is localised too
    const [pauseTitle, pauseHint] = pauseBannerText(next).split('\n');
    this.pauseText?.setText(pauseTitle);
    this.pauseHint?.setText(pauseHint);
    this.refreshLevelBanner();
    this.refreshLevelBar();
  }

  chromeArgs(input) {
    const about = this.scene.isActive('About');
    const howto = this.scene.isActive('HowTo');
    const settings = this.scene.isActive('Settings');
    const language = this.scene.isActive('Language');
    const feedback = this.scene.isActive('Feedback');
    const leaderboard = this.scene.isActive('Leaderboard');
    const scores = this.scene.isActive('Scores');
    return {
      state: this.state,
      overlay: feedback
        ? 'feedback'
        : language
          ? 'language'
          : howto
            ? 'howto'
            : about
              ? 'about'
              : settings
                ? 'settings'
                : leaderboard
                  ? 'leaderboard'
                  : scores
                    ? 'scores'
                    : null,
      stackedSettings: about && settings,
      stackedAbout: howto && about,
      stackedUnder: feedback && (about || howto || settings || language || leaderboard || scores),
      input,
      resumeLocked: this.time.now < this.flapLockedUntil,
    };
  }

  handleChrome(input) {
    this.applyChrome(chromeIntent(this.chromeArgs(input)));
  }

  applyChrome(result) {
    switch (result.do) {
      case 'pause':
        this.pausePlay();
        break;
      case 'resume':
        this.resumePlay();
        break;
      case 'toggleMute':
        this.toggleMute();
        break;
      case 'openSettings':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Settings')) this.scene.launch('Settings');
        this.scene.bringToTop('Settings');
        break;
      case 'openAbout':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('About')) this.scene.launch('About');
        this.scene.bringToTop('About');
        break;
      case 'openHowTo':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('HowTo')) this.scene.launch('HowTo');
        this.scene.bringToTop('HowTo');
        break;
      case 'openLanguage':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Language')) this.scene.launch('Language');
        this.scene.bringToTop('Language');
        break;
      case 'openFeedback':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Feedback')) this.scene.launch('Feedback');
        this.scene.bringToTop('Feedback');
        break;
      case 'openScores':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Scores')) this.scene.launch('Scores');
        this.scene.bringToTop('Scores');
        break;
      case 'openLeaderboard':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Leaderboard')) this.scene.launch('Leaderboard');
        this.scene.bringToTop('Leaderboard');
        break;
      case 'start':
        this.launch();
        break;
      case 'flap':
        this.doFlap();
        break;
      default:
        break;
    }
  }

  doFlap() {
    if (this.state !== 'playing') return;
    if (this.time.now < this.flapLockedUntil) return;
    if (this.effects.powerActive()) return; // the fart carries the poop through the middle
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
  }

  toggleMute() {
    const next = !this.settings.load().sound;
    this.settings.set({ sound: next });
    setMuted(!next);
    this.tray?.setMuted(!next);
    this.scene.get('Over')?.tray?.setMuted(!next);
  }

  autoPause() {
    if (this.state === 'playing') this.pausePlay();
  }

  setPauseBanner(visible) {
    this.pauseShade.setVisible(visible);
    const level = this.levelBreak;
    this.pauseText.setVisible(visible && !level);
    this.pauseHint.setVisible(visible && !level);
    this.levelTitle.setVisible(visible && level);
    this.levelHint.setVisible(visible && level);
  }

  pausePlay() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.physics.pause();
    if (this.stinkTimer) this.stinkTimer.paused = true;
    this.fartSound?.pause();
    this.fartTween?.pause();
    this.bob.pause();
    this.setPauseBanner(true);
  }

  resumePlay() {
    if (this.state !== 'paused') return;
    if (this.levelBreak) this.endLevelBreak();
    this.state = 'playing';
    this.physics.resume();
    if (this.stinkTimer) this.stinkTimer.paused = false;
    this.fartSound?.resume();
    this.fartTween?.resume();
    this.bob.resume();
    this.setPauseBanner(false);
    // Recovery bounce on the resume tap. Do not set flapLockedUntil: chrome
    // already maps that tap to resume, not flap; a lockout delays the next flap.
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
  }

  armResumeLockout() {
    this.flapLockedUntil = this.time.now + T.pauseResumeLockoutMs;
  }

  spawnPipePair() {
    this.pipesSpawned += 1;
    const gapCfg = {
      gameHeight: GAME_HEIGHT,
      groundHeight: T.groundHeight,
      gapHeight: this.diff.gapHeight,
      gapMargin: T.gapMargin,
    };
    const gapY = this.centreNextGap ? centredGapY(gapCfg) : pipeGapY(this.rng, gapCfg);
    this.centreNextGap = false;
    const gapH = this.diff.gapHeight;
    const x = GAME_WIDTH + T.pipeWidth;

    // Top pipe hangs down: cap must face the gap, so flip the sprite and anchor its bottom.
    const gapTop = gapY - gapH / 2;
    const gapBot = gapY + gapH / 2;
    const top = this.pipes.create(x, gapTop, 'pipe');
    top.setOrigin(0.5, 1).setFlipY(true);
    // Stretch if needed so the column always reaches the ceiling (stale short textures too).
    top.setDisplaySize(T.pipeWidth, Math.max(top.frame.height, gapTop + 4));
    // Bottom pipe stands up from the gap: cap already at the top of the image.
    const bottom = this.pipes.create(x, gapBot, 'pipe');
    bottom.setOrigin(0.5, 0);
    bottom.setDisplaySize(T.pipeWidth, Math.max(bottom.frame.height, GAME_HEIGHT - gapBot + 4));

    for (const p of [top, bottom]) {
      // Body uses unscaled frame units; scale comes from setDisplaySize.
      p.body.setSize(p.frame.width, p.frame.height);
      p.setVelocityX(-this.scrollSpeed());
    }
    // Only the top pipe carries the "passed" flag so a pair scores once.
    top.setData('scoring', true);
    top.setData('passed', false);

    const kind = rollItem(this.rng, this.score, T);
    if (kind) {
      const y = itemGapY(gapY, gapH, this.rng, kind);
      const item = this.items.create(x, y, kind);
      item.setDepth(8);
      item.setScale(T.spriteDisplayScale);
      const itemBody = scaledCircleBody(item.frame.width, T.spriteDisplayScale, T.items.itemRadius);
      item.body.setCircle(itemBody.radius, itemBody.offset, itemBody.offset);
      item.setVelocityX(-this.scrollSpeed());
      item.setData('kind', kind);
    }

    // Beans ride halfway between this pair and the next, bobbing top to bottom.
    if (rollBean(this.rng, this.score, T, { spawnedThisRun: this.beanSpawned, holding: this.effects.holdingBean() })) {
      this.beanSpawned = true;
      const phase = this.rng() * Math.PI * 2;
      const bean = this.beans.create(beanSpawnX(GAME_WIDTH, T.pipeWidth, T.pipeSpacingPx), beanY(0, phase, this.beanBounds, T), 'bean');
      bean.setDepth(8);
      bean.setScale(T.spriteDisplayScale);
      const beanBody = scaledCircleBody(bean.frame.width, T.spriteDisplayScale, T.beans.beanRadius);
      bean.body.setCircle(beanBody.radius, beanBody.offset, beanBody.offset);
      bean.setVelocityX(-this.scrollSpeed());
      bean.setData({ elapsed: 0, phase });
    }
  }

  /** Speed for the current level (the gap never changes); pushes it onto everything scrolling. */
  applyLevel() {
    this.diff = { pipeSpeed: levelSpeed(this.level, T), gapHeight: T.gapHeight };
    this.applyScroll();
  }

  /** Current scroll speed (px/s): level speed × the fart envelope. */
  scrollSpeed() {
    return this.diff.pipeSpeed * this.scrollMul;
  }

  /** Single place that pushes the scroll speed onto everything that moves left. */
  applyScroll() {
    const v = -this.scrollSpeed();
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(v);
    for (const item of this.items.getChildren()) item.setVelocityX(v);
    for (const bean of this.beans.getChildren()) bean.setVelocityX(v);
  }

  refreshBeanHud() {
    const n = this.effects.beans();
    const show = n > 0;
    this.beanIcon.setVisible(show);
    this.beanText.setVisible(show);
    if (show) this.beanText.setText(`×${n}`);
  }

  /** Swap the player texture and rebuild the circle body for that frame size. */
  setPoopTexture(key) {
    this.poop.setTexture(key);
    const body = scaledCircleBody(this.poop.frame.width, T.spriteDisplayScale, T.poopRadius);
    this.poop.body.setCircle(body.radius, body.offset, body.offset);
  }

  collectBean(bean) {
    if (this.state !== 'playing' || !bean.active) return;
    if (this.effects.holdingBean()) return; // already carrying one: let it float past
    const ghost = this.add.image(bean.x, bean.y, 'bean').setScale(T.spriteDisplayScale).setDepth(12);
    this.tweens.add({
      targets: ghost,
      scale: T.spriteDisplayScale * 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
    bean.destroy();
    this.effects.addBean();
    this.refreshBeanHud();
    sfx.pickup();
    if (this.effects.powerReady()) this.setCharged(true);
  }

  /**
   * Rainbow colouring, driven every frame: with superBeans held the glow and
   * the bean button disc cycle through hues; during a super fart the glow is a
   * bigger, steadier halo doing the same. Otherwise everything is white again.
   */
  applyRainbow() {
    const superFart = this.effects.powerActive() && this.effects.powerIsSuper();
    const mode = superFart ? 'super' : this.charged && this.effects.superReady() ? 'charged' : null;
    if (mode !== this.rainbowMode) {
      this.rainbowMode = mode;
      if (mode === 'super') this.glow.setAlpha(T.beans.superGlowAlpha).setScale(T.beans.superGlowScale);
      else this.glow.setScale(1);
      if (mode === null) {
        this.glow.clearTint();
        this.beanButtonBg.setFillStyle(0xffffff, 0.75);
      }
    }
    if (!mode) return;
    const color = hsvToRgb(rainbowHue(this.rainbowMs, T.beans.rainbowPeriodMs), 1, 1);
    this.glow.setTint(color);
    if (mode === 'charged') this.beanButtonBg.setFillStyle(color, 0.85);
  }

  /** Charged look: alternating stink-line frames and a pulsing white glow. */
  setCharged(on) {
    if (on === this.charged) return;
    this.charged = on;
    if (on) {
      this.stinkFrame = 0;
      this.setPoopTexture('poop-stink1');
      this.stinkTimer = this.time.addEvent({
        delay: T.beans.stinkFrameMs,
        loop: true,
        callback: () => {
          this.stinkFrame ^= 1;
          this.setPoopTexture(this.stinkFrame ? 'poop-stink2' : 'poop-stink1');
        },
      });
      this.glow.setAlpha(T.beans.glowMinAlpha);
      this.glowTween = this.tweens.add({ targets: this.glow, alpha: T.beans.glowMaxAlpha, yoyo: true, repeat: -1, duration: T.beans.glowPulseMs });
      // Bean button: same period as the glow, started in the same frame so they stay in phase.
      this.beanButton.setVisible(true).setScale(1).setAlpha(0.7);
      this.beanButtonTween = this.tweens.add({
        targets: this.beanButton,
        scale: 1.12,
        alpha: 1,
        yoyo: true,
        repeat: -1,
        duration: T.beans.glowPulseMs,
      });
    } else {
      this.stinkTimer?.remove();
      this.stinkTimer = null;
      this.glowTween?.stop();
      this.glowTween = null;
      this.glow.setAlpha(0);
      this.beanButtonTween?.stop();
      this.beanButtonTween = null;
      this.beanButton.setVisible(false);
      if (this.state === 'playing') this.setPoopTexture('poop');
    }
  }

  /** Tap on a charged poop: fart through the next pipes for the length of the clip. */
  activatePower() {
    if (this.state !== 'playing' || !this.effects.powerReady()) return;
    this.setCharged(false);
    const snd = this.cache.audio.exists('fart-accelerate') ? this.sound.add('fart-accelerate', { volume: T.fartVolume }) : null;
    const durationMs = snd && snd.duration > 0 ? Math.round(snd.duration * 1000) : T.beans.powerMs;
    this.effects.activatePower(durationMs);
    this.fartDurationMs = durationMs;
    this.fartPeak = fartPeakMul(durationMs, this.effects.powerPipeCount(), T.pipeSpacingPx, this.diff.pipeSpeed); // 5 pipes, or 20 for a super fart, at this level's speed
    if (snd) {
      this.fartSound = snd;
      snd.once('complete', () => {
        snd.destroy();
        if (this.fartSound === snd) this.fartSound = null;
      });
      snd.play();
    }
    this.setPoopTexture('poop-fart');
    this.fartTween = this.tweens.add({ targets: this.poop, alpha: 0.5, yoyo: true, repeat: -1, duration: T.beans.fartAlphaMs });
    // Float through the middle: no gravity, no flaps; update() drives y and the
    // tilt from fartFloat() (glide to mid-height, then the undulating wave).
    this.poop.body.setAllowGravity(false);
    this.poop.setVelocity(0, 0);
    this.fartStartY = this.poop.y;
    this.refreshBeanHud();
  }

  /**
   * While farting, hold pipe spawning once the scroll still to come cannot
   * carry a new pair fully past the poop before the clip ends. The screen is
   * then naturally clear at the end and the next pair enters from the right.
   */
  spawnHeldByFart() {
    if (!this.effects.powerActive()) return false;
    const remaining = fartRemainingDistance(this.effects.powerElapsed(), this.fartDurationMs, this.fartPeak, this.diff.pipeSpeed);
    // At super-fart speed one frame scrolls ~60 px, so keep at least three frames in hand.
    const margin = Math.max(T.beans.endClearMarginPx, this.scrollSpeed() * 0.05);
    return remaining < pipeClearDistance(GAME_WIDTH, T.pipeWidth, T.poopX) + margin;
  }

  endPower() {
    this.fartTween?.stop();
    this.fartTween = null;
    this.poop.setAlpha(1);
    this.glow.setAlpha(0).setScale(1); // the super-fart halo goes out; applyRainbow() whitens it next frame
    this.scrollMul = 1;
    this.setPoopTexture('poop');
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    // Next pair spawns on the next frame at the right edge with its gap at the
    // poop's float height: a full screen of warning and the easiest line through.
    this.centreNextGap = true;
    this.distanceSinceSpawn = pipeSpacing(T);
    this.applyScroll();
    if (this.effects.powerReady()) this.setCharged(true);
  }

  refreshProbioticHud() {
    const n = this.effects.pipesLeft();
    const show = n > 0;
    this.probioticIcon.setVisible(show);
    this.probioticText.setVisible(show);
    if (show) this.probioticText.setText(`×${n}`);
  }

  collectItem(item) {
    if (this.state !== 'playing' || !item.active) return;
    if (this.effects.powerActive()) return; // farting: fiber, probiotic and bacteria scroll straight through
    const kind = item.getData('kind');
    const ghost = this.add.image(item.x, item.y, kind).setScale(T.spriteDisplayScale).setDepth(12);
    this.tweens.add({
      targets: ghost,
      scale: T.spriteDisplayScale * 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
    item.destroy();
    if (kind === 'fiber') {
      this.score = scoreAfterItem(this.score, kind, T);
      this.scoreText.setText(String(this.score));
      sfx.pickup();
    } else if (kind === 'probiotic') {
      this.effects.applyProbiotic();
      this.refreshProbioticHud();
      sfx.pickup();
    } else if (kind === 'bacteria') {
      if (this.effects.hasProbiotic()) {
        this.effects.consumeProbiotic();
        this.refreshProbioticHud();
        this.cameras.main.flash(100, 180, 255, 180);
        sfx.shield();
      } else {
        this.score = scoreAfterItem(this.score, kind, T);
        this.scoreText.setText(String(this.score));
        sfx.hazard();
      }
    }
  }

  die() {
    if (this.state !== 'playing') return;
    // Farting (or just finished and still clearing the pipe) cannot die.
    if (this.effects.powerActive() || this.graceLeftMs > 0) return;
    this.state = 'dead';
    this.setCharged(false);
    this.setPoopTexture('poop-dead');
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(0);
    for (const item of this.items.getChildren()) item.setVelocityX(0);
    for (const bean of this.beans.getChildren()) bean.setVelocityX(0);
    this.setPauseBanner(false);
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    if (this.settings.load().haptics) vibrate(globalThis.navigator, T.vibrateOnDieMs);
    if (this.cache.audio.exists('fart')) {
      this.sound.play('fart', { volume: T.fartVolume });
    } else {
      sfx.die();
    }
    this.best.save(this.score); // legacy store, kept for first-run seeding
    const newTop = isNewTop(this.save, this.score);
    this.save = saveLocal(recordScore(this.save, this.score, { toilet: this.toilet, level: this.level }));
    this.syncLeaderboard(); // fire and forget; never awaited inside the update loop
    // BEST on the game-over panel = the save state's top score, so a loaded code counts too.
    const best = Math.max(this.score, topScores(this.save)[0] ?? 0);

    // Tumble: keep gravity so the poop falls, stop it at the ground, spin it.
    this.poop.setVelocityY(Math.max(this.poop.body.velocity.y, 0));
    this.poop.body.setCollideWorldBounds(false);
    this.tweens.add({ targets: this.poop, angle: 180, duration: T.deathToOverMs, ease: 'Quad.easeIn' });

    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      this.scene.launch('Over', { score: this.score, best, newTop, toilet: this.toilet, level: this.level });
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    this.rainbowMs += delta; // keeps cycling while paused: it is only colour
    this.applyRainbow();
    const scrolling = this.state === 'ready' || this.state === 'playing';
    if (scrolling) {
      for (const layer of this.bgLayers) layer.sprite.tilePositionX += this.scrollSpeed() * layer.parallax * dt;
      this.ground.tilePositionX += this.scrollSpeed() * dt;
    }

    if (this.state === 'playing') {
      // Fart power clock and envelope; grace countdown; distance-based spawning.
      this.effects.tickPower(delta);
      if (this.effects.powerActive()) {
        this.scrollMul = fartMul(this.effects.powerElapsed(), this.fartDurationMs, this.fartPeak);
        this.applyScroll();
        const float = fartFloat(this.effects.powerElapsed(), this.fartStartY, GAME_HEIGHT / 2, T);
        this.poop.y = float.y;
        this.poop.setAngle(float.angle);
      }
      if (this.effects.endedPower()) this.endPower();
      if (this.graceLeftMs > 0) this.graceLeftMs = Math.max(0, this.graceLeftMs - delta);
      const spacing = pipeSpacing(T);
      if (this.spawnHeldByFart()) {
        this.distanceSinceSpawn = 0;
      } else {
        this.distanceSinceSpawn += this.scrollSpeed() * dt;
        if (this.distanceSinceSpawn >= spacing) {
          this.distanceSinceSpawn -= spacing;
          if (this.pipesSpawned === levelEnd(this.level, T) && !this.finishSpawned) {
            this.spawnFinishLine();
          } else if (this.finishSpawned) {
            this.distanceSinceSpawn = 0; // nothing follows the line until the break ends, fart or not
          } else {
            this.spawnPipePair();
          }
        }
      }
      if (this.finishLine) {
        this.finishLine.x -= this.scrollSpeed() * dt;
        if (!this.finishLine.getData('crossed') && hasPassed(this.finishLine.x, T.levels.finishWidthPx, this.poop.x)) {
          this.finishLine.setData('crossed', true);
          this.onFinishCrossed();
        }
        if (this.finishLine && this.finishLine.x < -T.levels.finishWidthPx) {
          this.finishLine.destroy();
          this.finishLine = null;
        }
      }

      if (!this.effects.powerActive()) this.poop.setAngle(angleForVelocity(this.poop.body.velocity.y, T));
      const top = T.poopRadius;
      const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
      if (this.poop.y < top || this.poop.y > floor) {
        if (this.effects.powerActive() || this.graceLeftMs > 0) {
          this.poop.y = Math.min(Math.max(this.poop.y, top), floor);
          this.poop.setVelocityY(0);
        } else {
          this.die();
        }
      }
    }
    this.glow.setPosition(this.poop.x, this.poop.y);

    if (this.state === 'dead') {
      // Pin the tumbling poop to the ground instead of letting it fall off-screen.
      const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
      if (this.poop.y > floor) {
        this.poop.y = floor;
        this.poop.setVelocityY(0);
      }
    }

    for (const pipe of this.pipes.getChildren()) {
      if (this.state === 'playing' && pipe.getData('scoring') && !pipe.getData('passed') && hasPassed(pipe.x, T.pipeWidth, this.poop.x)) {
        pipe.setData('passed', true);
        this.score += 1;
        this.pipesPassed += 1;
        this.levelBar.setProgress(levelProgress(this.pipesPassed, this.level, T));
        this.scoreText.setText(String(this.score));
        this.effects.onPipePassed();
        this.refreshProbioticHud();
        sfx.score();
      }
      if (pipe.x < -T.pipeWidth) pipe.destroy();
    }
    for (const item of this.items.getChildren()) {
      if (item.x < -T.pipeWidth) item.destroy();
    }
    for (const bean of this.beans.getChildren()) {
      if (this.state === 'playing') {
        const elapsed = bean.getData('elapsed') + delta;
        bean.setData('elapsed', elapsed);
        bean.y = beanY(elapsed, bean.getData('phase'), this.beanBounds, T);
        bean.setAngle(beanAngle(elapsed, T));
      }
      if (bean.x < -T.pipeWidth) bean.destroy();
    }
  }
}
