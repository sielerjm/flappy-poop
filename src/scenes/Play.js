import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import {
  createRng,
  pipeGapY,
  hasPassed,
  angleForVelocity,
  difficulty,
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
} from '../logic.js';
import { t, pauseBannerText, initialLocale, isLocale } from '../i18n.js';
import { loadLocal, saveLocal, recordScore, isNewTop, profileLine } from '../save.js';
import { unlock, attachGame, setMuted, isMuted, sfx } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createButton } from '../ui/button.js';
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
    this.diff = difficulty(0, T);
    this.state = 'ready'; // 'ready' | 'playing' | 'paused' | 'dead'
    this.flapLockedUntil = 0;
    this.effects = createEffects(T);
    this.locale = this.resolveLocale();
    attachGame(this.game);
    setMuted(!this.settings.load().sound);

    // Scrolling layers. Tile-scale maps one texture copy onto the playfield so a
    // stale shorter bg cannot vertically repeat into a mid-screen fold band.
    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg').setOrigin(0, 0);
    {
      const f = this.bg.frame;
      this.bg.setTileScale(GAME_WIDTH / f.width, GAME_HEIGHT / f.height);
    }
    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.items = this.physics.add.group({ allowGravity: false, immovable: true });
    this.ground = this.add
      .tileSprite(0, GAME_HEIGHT - T.groundHeight, GAME_WIDTH, T.groundHeight, 'ground')
      .setOrigin(0, 0)
      .setDepth(5);
    {
      const f = this.ground.frame;
      this.ground.setTileScale(GAME_WIDTH / f.width, T.groundHeight / f.height);
    }

    // Player: no gravity until the first tap
    this.poop = this.physics.add.sprite(T.poopX, GAME_HEIGHT / 2, 'poop').setDepth(10);
    this.poop.setScale(T.spriteDisplayScale);
    const poopBody = scaledCircleBody(this.poop.frame.width, T.spriteDisplayScale, T.poopRadius);
    this.poop.body.setCircle(poopBody.radius, poopBody.offset, poopBody.offset);
    this.poop.body.setAllowGravity(false);
    this.bob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // HUD
    this.scoreText = this.add.text(GAME_WIDTH / 2, 80, '0', { ...TEXT_STYLE, fontSize: '80px' }).setOrigin(0.5).setDepth(20);
    this.probioticIcon = this.add
      .image(GAME_WIDTH / 2 - 56, 156, 'probiotic')
      .setDisplaySize(T.hudProbioticSize, T.hudProbioticSize)
      .setDepth(20)
      .setVisible(false);
    this.probioticText = this.add.text(GAME_WIDTH / 2 + 16, 156, '', { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.readyTitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, t(this.locale, 'readyTitle'), { ...TEXT_STYLE, fontSize: '52px' })
      .setOrigin(0.5)
      .setDepth(20);
    // Ready-screen buttons. Taps resolve through readyHit() in flap(), not
    // GameObject handlers, so the chrome is purely visual.
    this.readyBoxes = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
    this.howToBtn = createButton(this, this.readyBoxes.howto, t(this.locale, 'howToPlay'), { ...TEXT_STYLE, fontSize: '40px', color: '#f8a0c8' });
    this.startBtn = createButton(this, this.readyBoxes.start, t(this.locale, 'tapToFlap'), { ...TEXT_STYLE, fontSize: '44px' });
    this.saveLoadBtn = createButton(this, this.readyBoxes.saveLoad, t(this.locale, 'saveLoadButton'), {
      ...TEXT_STYLE,
      fontSize: '36px',
      color: '#f8a0c8',
    });
    // "<name> · best" button under Save / Load User; tapping it opens the Scores
    // overlay. Hidden until a username is set.
    this.profileBtn = createButton(this, this.readyBoxes.profile, profileLine(this.save), { ...TEXT_STYLE, fontSize: '32px', color: '#f8a0c8' });
    this.refreshProfile();

    this.pauseShade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setDepth(25).setVisible(false);
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

    // Collisions
    this.physics.add.overlap(this.poop, this.pipes, () => this.die(), undefined, this);
    this.physics.add.overlap(this.poop, this.items, (_poop, item) => this.collectItem(item), undefined, this);

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

    this.onHidden = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause();
    };
    this.onBlur = () => this.autoPause();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
    this.game.events.on('blur', this.onBlur);
    this.events.once('shutdown', () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
      this.game.events.off('blur', this.onBlur);
    });
  }

  start() {
    this.state = 'playing';
    this.bob.stop();
    this.readyTitle.setVisible(false);
    this.howToBtn.setVisible(false);
    this.startBtn.setVisible(false);
    this.saveLoadBtn.setVisible(false);
    this.profileBtn.setVisible(false);
    this.poop.body.setAllowGravity(true);
    this.poop.body.setGravityY(T.gravity);
    this.spawnTimer = this.time.addEvent({ delay: T.spawnEveryMs, loop: true, callback: () => this.spawnPipePair() });
    this.spawnPipePair();
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
      if (this.state === 'ready') {
        const hit = readyHit(pointer.x, pointer.y, this.readyBoxes, { hasProfile: Boolean(this.save?.name) });
        if (hit === 'howto') {
          this.handleChrome('howto');
          return;
        }
        if (hit === 'saveload') {
          this.openSavePanel();
          return;
        }
        if (hit === 'profile') {
          this.handleChrome('scores');
          return;
        }
        // 'start' or empty space both start the run below.
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

  refreshProfile() {
    const line = profileLine(this.save);
    this.profileBtn?.setText(line);
    if (this.state === 'ready') this.profileBtn?.setVisible(Boolean(line));
  }

  openSavePanel() {
    openSavePanel({ game: this.game, play: this, locale: this.locale });
  }

  applyLocale(next) {
    if (!isLocale(next)) return;
    this.locale = next;
    this.readyTitle?.setText(t(next, 'readyTitle'));
    this.howToBtn?.setText(t(next, 'howToPlay'));
    this.startBtn?.setText(t(next, 'tapToFlap'));
    this.saveLoadBtn?.setText(t(next, 'saveLoadButton'));
    const [pauseTitle, pauseHint] = pauseBannerText(next).split('\n');
    this.pauseText?.setText(pauseTitle);
    this.pauseHint?.setText(pauseHint);
  }

  chromeArgs(input) {
    const about = this.scene.isActive('About');
    const howto = this.scene.isActive('HowTo');
    const settings = this.scene.isActive('Settings');
    const language = this.scene.isActive('Language');
    const feedback = this.scene.isActive('Feedback');
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
                : scores
                  ? 'scores'
                  : null,
      stackedSettings: about && settings,
      stackedAbout: howto && about,
      stackedUnder: feedback && (about || howto || settings || language || scores),
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
      case 'start':
        this.start();
        this.doFlap();
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
    this.pauseText.setVisible(visible);
    this.pauseHint.setVisible(visible);
  }

  pausePlay() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.physics.pause();
    if (this.spawnTimer) this.spawnTimer.paused = true;
    this.bob.pause();
    this.setPauseBanner(true);
  }

  resumePlay() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.physics.resume();
    if (this.spawnTimer) this.spawnTimer.paused = false;
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
    const gapY = pipeGapY(this.rng, {
      gameHeight: GAME_HEIGHT,
      groundHeight: T.groundHeight,
      gapHeight: this.diff.gapHeight,
      gapMargin: T.gapMargin,
    });
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
      p.setVelocityX(-this.diff.pipeSpeed);
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
      item.setVelocityX(-this.diff.pipeSpeed);
      item.setData('kind', kind);
    }
  }

  applyDifficulty() {
    this.diff = difficulty(this.score, T);
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(-this.diff.pipeSpeed);
    for (const item of this.items.getChildren()) item.setVelocityX(-this.diff.pipeSpeed);
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
      this.applyDifficulty();
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
        this.applyDifficulty();
        sfx.hazard();
      }
    }
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.spawnTimer?.remove();
    this.poop.setTexture('poop-dead');
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(0);
    for (const item of this.items.getChildren()) item.setVelocityX(0);
    this.setPauseBanner(false);
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    if (this.settings.load().haptics) vibrate(globalThis.navigator, T.vibrateOnDieMs);
    if (this.cache.audio.exists('fart')) {
      this.sound.play('fart', { volume: T.fartVolume });
    } else {
      sfx.die();
    }
    const best = this.best.save(this.score);
    const newTop = isNewTop(this.save, this.score);
    this.save = saveLocal(recordScore(this.save, this.score));

    // Tumble: keep gravity so the poop falls, stop it at the ground, spin it.
    this.poop.setVelocityY(Math.max(this.poop.body.velocity.y, 0));
    this.poop.body.setCollideWorldBounds(false);
    this.tweens.add({ targets: this.poop, angle: 180, duration: T.deathToOverMs, ease: 'Quad.easeIn' });

    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      this.scene.launch('Over', { score: this.score, best, newTop });
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const scrolling = this.state === 'ready' || this.state === 'playing';
    if (scrolling) {
      this.bg.tilePositionX += this.diff.pipeSpeed * 0.25 * dt;
      this.ground.tilePositionX += this.diff.pipeSpeed * dt;
    }

    if (this.state === 'playing') {
      this.poop.setAngle(angleForVelocity(this.poop.body.velocity.y, T));
      if (this.poop.y - T.poopRadius < 0 || this.poop.y + T.poopRadius > GAME_HEIGHT - T.groundHeight) {
        this.die();
      }
    }

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
        this.scoreText.setText(String(this.score));
        this.effects.onPipePassed();
        this.refreshProbioticHud();
        sfx.score();
        this.applyDifficulty();
      }
      if (pipe.x < -T.pipeWidth) pipe.destroy();
    }
    for (const item of this.items.getChildren()) {
      if (item.x < -T.pipeWidth) item.destroy();
    }
  }
}
