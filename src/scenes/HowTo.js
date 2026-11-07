import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { t, howToItems, metaFontSize } from '../i18n.js';
import { TOILET_EMOJI } from '../save.js';
import { createScrollView } from '../ui/scrollView.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
/** Rows drawn as an emoji instead of a texture (see howToItems). */
const EMOJI_ROWS = { toilet: TOILET_EMOJI, levels: '🏁', controls: '🎮' };

/** How to play overlay: title, rules, one row per item, scrollable (see ui/scrollView.js). */
export class HowTo extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);
    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());

    const sv = createScrollView(this, panel, { fixed: [dimmer, panelRect, close] });

    sv.add(this.add.text(cx, cy - 440, t(locale, 'howToTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5));
    sv.add(
      this.add
        .text(cx, cy - 330, t(locale, 'howToBody'), {
          ...STYLE,
          fontSize: '28px',
          color: '#c9b8dc',
          fontStyle: 'normal',
          wordWrap: { width: 520, useAdvancedWrap: true },
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );

    // Rows (pipe first, toilet last): icon at the left, name + wrapped detail at
    // the right. Rows flow from each detail's real height (min pitch 136 px).
    const ROW_PITCH = 136;
    let nextY = cy - 190;
    let lastBottom = nextY;
    howToItems(locale).forEach((item) => {
      const y = nextY;
      if (item.key === 'pipe') {
        // pipe.png is 128x1280 with the cap at the top: show a 64x80 cap slice.
        sv.add(this.add.image(cx - 220, y - 40, 'pipe').setOrigin(0.5, 0).setScale(0.5).setCrop(0, 0, 128, 160));
      } else if (EMOJI_ROWS[item.key]) {
        sv.add(this.add.text(cx - 220, y, EMOJI_ROWS[item.key], { fontFamily: 'sans-serif', fontSize: '56px' }).setOrigin(0.5));
      } else {
        sv.add(this.add.image(cx - 220, y, item.key).setDisplaySize(80, 80));
      }
      sv.add(this.add.text(cx - 160, y - 34, item.name, { ...STYLE, fontSize: '32px', color: '#f8a0c8' }).setOrigin(0, 0.5));
      // Top-aligned under the name so a three-line detail grows downward.
      const detail = sv.add(
        this.add
          .text(cx - 160, y - 14, item.detail, {
            ...STYLE,
            fontSize: '26px',
            color: '#c9b8dc',
            fontStyle: 'normal',
            align: 'left',
            wordWrap: { width: 400, useAdvancedWrap: true },
          })
          .setOrigin(0, 0),
      );
      const bottom = Math.max(y + 44, detail.y + detail.height);
      lastBottom = Math.max(lastBottom, bottom);
      nextY = Math.max(y + ROW_PITCH, bottom + 60);
    });

    const feedbackY = lastBottom + 70;
    const feedbackLink = sv.link(sv.add(this.add.text(cx, feedbackY, t(locale, 'feedbackLink'), { ...STYLE, fontSize: '36px', color: '#f8a0c8' }).setOrigin(0.5)), () =>
      this.scene.get('Play')?.handleChrome('feedback'),
    );

    const versionY = feedbackY + 80;
    sv.add(
      this.add
        .text(cx, versionY, versionText(locale), {
          ...STYLE,
          fontSize: metaFontSize(locale),
          color: '#6a5a74',
          fontStyle: 'normal',
        })
        .setOrigin(0.5),
    );
    sv.finish(versionY);

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('Feedback')) return;
      this.close();
    });
    // Controller: left / right walk ✕ and the feedback link (scrolled into view), up / down scroll the rows.
    this.scroll = sv;
    this.focus = createFocus(this, T, {
      items: [pressable('close', close), pressable('feedback', feedbackLink, { event: 'pointerup', scrolled: true })],
      scrolled: sv,
      onVertical: (dir) => sv.scrollBy(dir === 'up' ? T.focus.scrollStepPx : -T.focus.scrollStepPx),
    });
    this.focus.show(); // only under a controller (registry padMode)
  }

  close() {
    if (this.scene.isActive('Feedback')) return;
    const play = this.scene.get('Play');
    const stackedAbout = this.scene.isActive('About');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'howto',
      stackedAbout,
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.closeAbout) this.scene.stop('About');
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}
