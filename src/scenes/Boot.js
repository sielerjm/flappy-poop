import { TUNING as T } from '../config.js';
import { VERSION } from '../logic.js';

// Cache-bust so browsers pick up new PNGs after art/contract bumps.
const V = `?v=${VERSION}`;

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('poop', 'assets/poop.png' + V);
    this.load.image('poop-dead', 'assets/poop-dead.png' + V);
    this.load.image('fiber', 'assets/fiber.png' + V);
    this.load.image('probiotic', 'assets/probiotic.png' + V);
    this.load.image('postbiotic', 'assets/postbiotic.png' + V);
    // Mystery box: 8 spin frames side by side (assets/README.md); the anim is made in create().
    this.load.spritesheet('mystery', 'assets/mystery.png' + V, { frameWidth: 384, frameHeight: 384 });
    this.load.image('mystery-icon', 'assets/mystery-icon.png' + V); // static view for the game-over summary and How to play
    this.load.image('bacteria', 'assets/bacteria.png' + V);
    this.load.image('bean', 'assets/bean.png' + V);
    this.load.image('coin', 'assets/coin.png' + V); // golden corn kernel: the purse's coin (pickup, HUD, box reveal, shop)
    this.load.image('poop-stink1', 'assets/poop-stink1.png' + V);
    this.load.image('poop-stink2', 'assets/poop-stink2.png' + V);
    this.load.image('poop-falling', 'assets/poop-falling.png' + V); // long fall, no power ready (fallLookVy)
    this.load.image('poop-stink-falling1', 'assets/poop-stink-falling1.png' + V); // long fall while charged, frame A
    this.load.image('poop-stink-falling2', 'assets/poop-stink-falling2.png' + V); // frame B
    this.load.image('poop-fart', 'assets/poop-fart.png' + V);
    this.load.image('poop-speech', 'assets/poop-speech.png' + V);
    this.load.image('pipe', 'assets/pipe.png' + V);
    this.load.image('villi', 'assets/villi.png' + V); // transparent overlay above the per-level colour
    this.load.image('ceiling', 'assets/ceiling.png' + V); // the ceiling strip, the ground's mirror: in front of the pipes at pipe speed
    this.load.image('ground', 'assets/ground.png' + V);
    this.load.audio('fart', 'assets/sfx/fart.mp3' + V);
    this.load.audio('fart-accelerate', 'assets/sfx/fart_accelerate.mp3' + V);
    this.load.audio('level-up', 'assets/sfx/NewLevel.mp3' + V); // finish-line chime
    this.load.audio('coin', 'assets/sfx/Coin_Pickup.mp3' + V); // a coin picked up, or a box paying coins
    this.load.audio('coin-spend', 'assets/sfx/Coin_Spend.mp3' + V); // a shop purchase
    this.load.audio('shop', 'assets/sfx/ShopOpenClose.mp3' + V); // the shop panel opening / closing
    this.load.audio('flush', 'assets/sfx/ToiletFlush_Win.mp3' + V); // a two-player GO
  }

  create() {
    console.log('[Boot] assets loaded', this.scale.width, this.scale.height);
    // Global animation manager: every scene can play it.
    if (!this.anims.exists('mystery-spin')) {
      this.anims.create({ key: 'mystery-spin', frames: this.anims.generateFrameNumbers('mystery'), frameRate: 1000 / T.mystery.frameMs, repeat: -1 });
    }
    this.scene.start('Play');
  }
}
