import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { TUNING as T } from '../config.js';
import { VERSION, purseSpinRate } from '../logic.js';
import { setSplashProgress, splashReady } from '../splash.js';

// Cache-bust so browsers pick up new PNGs after art/contract bumps.
const V = `?v=${VERSION}`;

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.on('progress', setSplashProgress); // the loading splash's ring (index.html, src/splash.js)
    this.load.image('poop', 'assets/poop.png' + V);
    this.load.image('poop-dead', 'assets/poop-dead.png' + V);
    this.load.image('fiber', 'assets/fiber.png' + V);
    this.load.image('probiotic', 'assets/probiotic.png' + V);
    this.load.image('postbiotic', 'assets/postbiotic.png' + V);
    // Mystery box: 8 spin frames side by side (assets/README.md); the anim is made in create().
    this.load.spritesheet('mystery', 'assets/mystery.png' + V, { frameWidth: 384, frameHeight: 384 });
    this.load.image('mystery-icon', 'assets/mystery-icon.png' + V); // static view for the game-over summary and How to play
    this.load.image('question', 'assets/question.png' + V); // the challenge question bubble (plan 34)
    this.load.image('bacteria', 'assets/bacteria.png' + V);
    this.load.image('bean', 'assets/bean.png' + V);
    // Golden corn kernel: the purse's coin. 12 spin frames side by side; a field kernel plays 'coin-spin'
    // (made in create()), every still use (HUD, box reveal, shop, Over) shows frame 0.
    this.load.spritesheet('coin', 'assets/coin.png' + V, { frameWidth: 106, frameHeight: 106 });
    this.load.image('poop-stink1', 'assets/poop-stink1.png' + V);
    this.load.image('poop-stink2', 'assets/poop-stink2.png' + V);
    this.load.image('poop-falling', 'assets/poop-falling.png' + V); // long fall, no power ready (fallLookVy)
    this.load.image('poop-stink-falling1', 'assets/poop-stink-falling1.png' + V); // long fall while charged, frame A
    this.load.image('poop-stink-falling2', 'assets/poop-stink-falling2.png' + V); // frame B
    this.load.image('poop-scared', 'assets/poop-scared.png' + V); // a near miss with a pipe, no power ready (scaredNearPx)
    this.load.image('poop-stink-scared1', 'assets/poop-stink-scared1.png' + V); // a near miss while charged, frame A
    this.load.image('poop-stink-scared2', 'assets/poop-stink-scared2.png' + V); // frame B
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
    // The education quiz (plan 22): a book opening with the card, a page turned for each next question, the book shut on leaving.
    this.load.audio('book-open', 'assets/sfx/Book_Open.mp3' + V);
    this.load.audio('book-flip', 'assets/sfx/Book_PageTurn.mp3' + V);
    this.load.audio('book-close', 'assets/sfx/Book_Close.mp3' + V);
    this.load.audio('sparkle', 'assets/sfx/Sparkle_Restore.mp3' + V); // a revive's streak wins everything back
    this.load.audio('bubble-pop', 'assets/sfx/Bubble_Pop.mp3' + V); // the challenge question's bubble touched (plan 34, round 2: Michael's sound)
  }

  create() {
    console.log('[Boot] assets loaded', this.scale.width, this.scale.height);
    // Global animation manager: every scene can play it.
    if (!this.anims.exists('mystery-spin')) {
      this.anims.create({ key: 'mystery-spin', frames: this.anims.generateFrameNumbers('mystery'), frameRate: 1000 / T.mystery.frameMs, repeat: -1 });
    }
    if (!this.anims.exists('coin-spin')) {
      this.anims.create({ key: 'coin-spin', frames: this.anims.generateFrameNumbers('coin'), frameRate: 1000 / T.coin.frameMs, repeat: -1 });
    }
    // The quiz purse's kernel (plan 34): spinTurns quick turns inside the glow's fade when a right answer pays.
    if (!this.anims.exists('coin-spin-quick')) {
      const frames = this.anims.generateFrameNumbers('coin');
      const G = T.education.purseGlow;
      this.anims.create({ key: 'coin-spin-quick', frames, frameRate: purseSpinRate(frames.length, G), repeat: G.spinTurns - 1 });
    }
    // The splash's Continue starts Play (on its release, so the press cannot flap or start a run).
    splashReady(() => this.scene.start('Play'));
  }
}
