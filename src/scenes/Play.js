import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { createRng, pipeGapY, hasPassed, angleForVelocity } from '../logic.js';

export class Play extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    this.rng = createRng(Date.now() & 0xffffffff);
    this.score = 0;
    this.alive = true;

    // Scrolling layers
    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg').setOrigin(0, 0);
    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.ground = this.add
      .tileSprite(0, GAME_HEIGHT - T.groundHeight, GAME_WIDTH, T.groundHeight, 'ground')
      .setOrigin(0, 0)
      .setDepth(5);

    // Player
    this.poop = this.physics.add.sprite(T.poopX, GAME_HEIGHT / 2, 'poop').setDepth(10);
    this.poop.body.setCircle(T.poopRadius, this.poop.width / 2 - T.poopRadius, this.poop.height / 2 - T.poopRadius);
    this.poop.body.setGravityY(T.gravity);

    // Score HUD
    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 40, '0', {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#5a2a44',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Collisions
    this.physics.add.overlap(this.poop, this.pipes, () => this.die(), undefined, this);

    // Input: any pointer (touch/mouse) or Space/Up
    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());

    // Spawn pipes
    this.spawnTimer = this.time.addEvent({
      delay: T.spawnEveryMs,
      loop: true,
      callback: () => this.spawnPipePair(),
    });
    this.spawnPipePair();
  }

  flap() {
    if (!this.alive) return;
    this.poop.setVelocityY(T.flapVelocity);
  }

  spawnPipePair() {
    const gapY = pipeGapY(this.rng, {
      gameHeight: GAME_HEIGHT,
      groundHeight: T.groundHeight,
      gapHeight: T.gapHeight,
      gapMargin: T.gapMargin,
    });
    const x = GAME_WIDTH + T.pipeWidth;

    // Top pipe hangs down: cap must face the gap, so flip the sprite and anchor its bottom.
    const top = this.pipes.create(x, gapY - T.gapHeight / 2, 'pipe');
    top.setOrigin(0.5, 1).setFlipY(true);
    // Bottom pipe stands up from the gap: cap already at the top of the image.
    const bottom = this.pipes.create(x, gapY + T.gapHeight / 2, 'pipe');
    bottom.setOrigin(0.5, 0);

    for (const p of [top, bottom]) {
      p.body.setSize(p.width, p.height);
      p.setVelocityX(-T.pipeSpeed);
    }
    // Only the top pipe carries the "passed" flag so a pair scores once.
    top.setData('scoring', true);
    top.setData('passed', false);
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.physics.pause();
    this.spawnTimer.remove();
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    // Step 5 replaces this with the Over scene and a retry lockout.
    this.time.delayedCall(900, () => this.scene.restart());
  }

  update(_time, delta) {
    const dt = delta / 1000;
    if (this.alive) {
      this.bg.tilePositionX += T.pipeSpeed * 0.25 * dt;
      this.ground.tilePositionX += T.pipeSpeed * dt;
      this.poop.setAngle(angleForVelocity(this.poop.body.velocity.y, T));

      // Ceiling and floor
      if (this.poop.y - T.poopRadius < 0 || this.poop.y + T.poopRadius > GAME_HEIGHT - T.groundHeight) {
        this.die();
        return;
      }
    }

    for (const pipe of this.pipes.getChildren()) {
      if (this.alive && pipe.getData('scoring') && !pipe.getData('passed') && hasPassed(pipe.x, T.pipeWidth, this.poop.x)) {
        pipe.setData('passed', true);
        this.score += 1;
        this.scoreText.setText(String(this.score));
      }
      if (pipe.x < -T.pipeWidth) pipe.destroy();
    }
  }
}
