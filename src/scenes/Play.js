import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { createRng, pipeGapY, hasPassed, angleForVelocity, difficulty, createBestStore } from '../logic.js';
import { unlock, sfx } from '../sound.js';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontStyle: 'bold',
  color: '#ffffff',
  stroke: '#5a2a44',
  strokeThickness: 6,
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
    this.diff = difficulty(0, T);
    this.state = 'ready'; // 'ready' | 'playing' | 'dead'

    // Scrolling layers
    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg').setOrigin(0, 0);
    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.ground = this.add
      .tileSprite(0, GAME_HEIGHT - T.groundHeight, GAME_WIDTH, T.groundHeight, 'ground')
      .setOrigin(0, 0)
      .setDepth(5);

    // Player: no gravity until the first tap
    this.poop = this.physics.add.sprite(T.poopX, GAME_HEIGHT / 2, 'poop').setDepth(10);
    this.poop.body.setCircle(T.poopRadius, this.poop.width / 2 - T.poopRadius, this.poop.height / 2 - T.poopRadius);
    this.poop.body.setAllowGravity(false);
    this.bob = this.tweens.add({ targets: this.poop, y: '+=12', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // HUD
    this.scoreText = this.add.text(GAME_WIDTH / 2, 40, '0', { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(0.5).setDepth(20);
    this.readyText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, 'FLAPPY POOP\n\ntap to flap', { ...TEXT_STYLE, fontSize: '26px' })
      .setOrigin(0.5)
      .setDepth(20);

    // Collisions
    this.physics.add.overlap(this.poop, this.pipes, () => this.die(), undefined, this);

    // Input: any pointer (touch/mouse) or Space/Up
    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
  }

  start() {
    this.state = 'playing';
    this.bob.stop();
    this.readyText.setVisible(false);
    this.poop.body.setAllowGravity(true);
    this.poop.body.setGravityY(T.gravity);
    this.spawnTimer = this.time.addEvent({ delay: T.spawnEveryMs, loop: true, callback: () => this.spawnPipePair() });
    this.spawnPipePair();
  }

  flap() {
    unlock();
    if (this.state === 'ready') this.start();
    if (this.state !== 'playing') return;
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
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
    const top = this.pipes.create(x, gapY - gapH / 2, 'pipe');
    top.setOrigin(0.5, 1).setFlipY(true);
    // Bottom pipe stands up from the gap: cap already at the top of the image.
    const bottom = this.pipes.create(x, gapY + gapH / 2, 'pipe');
    bottom.setOrigin(0.5, 0);

    for (const p of [top, bottom]) {
      p.body.setSize(p.width, p.height);
      p.setVelocityX(-this.diff.pipeSpeed);
    }
    // Only the top pipe carries the "passed" flag so a pair scores once.
    top.setData('scoring', true);
    top.setData('passed', false);
  }

  applyDifficulty() {
    this.diff = difficulty(this.score, T);
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(-this.diff.pipeSpeed);
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.spawnTimer?.remove();
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(0);
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    sfx.die();
    const best = this.best.save(this.score);

    // Tumble: keep gravity so the poop falls, stop it at the ground, spin it.
    this.poop.setVelocityY(Math.max(this.poop.body.velocity.y, 0));
    this.poop.body.setCollideWorldBounds(false);
    this.tweens.add({ targets: this.poop, angle: 180, duration: T.deathToOverMs, ease: 'Quad.easeIn' });

    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      this.scene.launch('Over', { score: this.score, best });
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const scrolling = this.state !== 'dead';
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
        sfx.score();
        this.applyDifficulty();
      }
      if (pipe.x < -T.pipeWidth) pipe.destroy();
    }
  }
}
