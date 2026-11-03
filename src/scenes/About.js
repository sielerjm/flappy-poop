import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, LAST_UPDATED, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';
import { createScrollView } from '../ui/scrollView.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };

/** About overlay: name, blurb, credits, links, version; scrollable (see ui/scrollView.js). */
export class About extends Phaser.Scene {
  constructor() {
    super('About');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const wrap = { width: 520, useAdvancedWrap: true };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);
    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());

    const sv = createScrollView(this, panel, { fixed: [dimmer, panelRect, close] });

    sv.add(this.add.text(cx, cy - 440, t(locale, 'aboutTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5));

    // Top-origin stack so multi-line blurb/credits grow downward and never overlap titles.
    let y = cy - 360;
    const stack = (key, style, gapAfter) => {
      const text = sv.add(this.add.text(cx, y, t(locale, key), style).setOrigin(0.5, 0));
      y += text.height + gapAfter;
      return text;
    };

    stack('aboutName', { ...STYLE, fontSize: '40px' }, 12);
    stack('aboutTagline', { ...MUTED, fontSize: '26px', wordWrap: wrap, lineSpacing: 4 }, 12);
    stack('aboutBlurb', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 6 }, 36);
    stack('aboutCreditsTitle', { ...STYLE, fontSize: '28px', color: '#f8a0c8' }, 16);
    stack('aboutCredits', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 8 }, 48);

    // Links and meta flow after the credits so longer credit blocks push them down.
    sv.link(sv.add(this.add.text(cx, y, t(locale, 'howToPlay'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' }).setOrigin(0.5, 0)), () =>
      this.scene.get('Play')?.handleChrome('howto'),
    );
    y += 64;
    sv.link(sv.add(this.add.text(cx, y, t(locale, 'feedbackLink'), { ...STYLE, fontSize: '36px', color: '#f8a0c8' }).setOrigin(0.5, 0)), () =>
      this.scene.get('Play')?.handleChrome('feedback'),
    );
    y += 72;

    // LLM note sits at the bottom, under the links, above the version lines.
    const llm = sv.add(this.add.text(cx, y, t(locale, 'aboutLlmNote'), { ...MUTED, fontSize: '22px', wordWrap: wrap, lineSpacing: 4 }).setOrigin(0.5, 0));
    y += llm.height + 28;

    const metaSize = metaFontSize(locale);
    sv.add(this.add.text(cx, y, `v${VERSION}`, { ...STYLE, fontSize: metaSize, color: '#6a5a74', fontStyle: 'normal' }).setOrigin(0.5, 0));
    y += 44;
    const updated = sv.add(
      this.add
        .text(cx, y, `${t(locale, 'updatedPrefix')} ${LAST_UPDATED}`, {
          ...STYLE,
          fontSize: metaSize,
          color: '#6a5a74',
          fontStyle: 'normal',
        })
        .setOrigin(0.5, 0),
    );
    sv.finish(updated.y + updated.height);

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('HowTo') || this.scene.isActive('Feedback')) return;
      this.close();
    });
  }

  close() {
    if (this.scene.isActive('HowTo') || this.scene.isActive('Feedback')) return;
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'about',
      stackedSettings: this.scene.isActive('Settings'),
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}
