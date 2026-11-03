import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit, clampScroll } from '../logic.js';
import { t, howToItems, metaFontSize } from '../i18n.js';
import { TOILET_EMOJI } from '../save.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const DRAG_TAP_PX = 12; // pointer movement below this still counts as a tap on a link

/**
 * How to play overlay. Everything inside the panel except the ✕ is rendered
 * by a second camera whose viewport is the panel interior (Phaser 4 has no
 * setMask in WebGL; a camera viewport clips in every renderer). Dragging
 * (finger or mouse) and the wheel scroll that camera, clamped by clampScroll().
 */
export class HowTo extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    // Scroll view = panel interior inside the 8 px stroke.
    const view = { x: cx - panel.width / 2 + 8, y: cy - panel.height / 2 + 8, width: panel.width - 16, height: panel.height - 16 };
    this.view = view;
    this.scrollOffset = 0;
    this.contentObjects = [];
    const add = (obj) => {
      this.contentObjects.push(obj);
      return obj;
    };

    add(this.add.text(cx, cy - 440, t(locale, 'howToTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5));
    add(
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

    // Rows (pipe first, toilet last): icon at the left, name + wrapped detail at the right.
    const row0 = cy - 190;
    let lastBottom = row0;
    howToItems(locale).forEach((item, i) => {
      const y = row0 + i * 136;
      if (item.key === 'pipe') {
        // pipe.png is 128x1280 with the cap at the top: show a 64x80 cap slice.
        add(this.add.image(cx - 220, y - 40, 'pipe').setOrigin(0.5, 0).setScale(0.5).setCrop(0, 0, 128, 160));
      } else if (item.key === 'toilet') {
        add(this.add.text(cx - 220, y, TOILET_EMOJI, { fontFamily: 'sans-serif', fontSize: '56px' }).setOrigin(0.5));
      } else {
        add(this.add.image(cx - 220, y, item.key).setDisplaySize(80, 80));
      }
      add(this.add.text(cx - 160, y - 34, item.name, { ...STYLE, fontSize: '32px', color: '#f8a0c8' }).setOrigin(0, 0.5));
      // Top-aligned under the name so a three-line detail grows downward.
      const detail = add(
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
      lastBottom = Math.max(lastBottom, y + 44, detail.y + detail.height);
    });

    const feedbackY = lastBottom + 70;
    const feedback = add(
      this.add
        .text(cx, feedbackY, t(locale, 'feedbackLink'), { ...STYLE, fontSize: '36px', color: '#f8a0c8' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true }),
    );
    // Fire on release, and only if this was a tap rather than a scroll.
    feedback.on('pointerup', () => {
      if (this.dragMoved < DRAG_TAP_PX) this.scene.get('Play')?.handleChrome('feedback');
    });

    const versionY = feedbackY + 80;
    add(
      this.add
        .text(cx, versionY, `v${VERSION}`, {
          ...STYLE,
          fontSize: metaFontSize(locale),
          color: '#6a5a74',
          fontStyle: 'normal',
        })
        .setOrigin(0.5),
    );

    this.contentHeight = versionY + 40 - view.y;
    this.thumb = this.add.graphics();

    // Content camera: viewport = panel interior, scrolled so world == screen at offset 0.
    this.contentCam = this.cameras.add(view.x, view.y, view.width, view.height);
    this.contentCam.setScroll(view.x, view.y);
    this.contentCam.ignore([dimmer, panelRect, this.thumb]);
    this.cameras.main.ignore(this.contentObjects);
    this.setScroll(0);

    // Drag / wheel scrolling. A drag that starts inside the panel never closes it.
    this.dragging = false;
    this.dragMoved = 0;
    this.input.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) return;
      this.dragging = true;
      this.dragMoved = 0;
      this.dragStartY = pointer.y;
      this.dragStartOffset = this.scrollOffset;
    });
    this.input.on('pointermove', (pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const dy = pointer.y - this.dragStartY;
      this.dragMoved = Math.max(this.dragMoved, Math.abs(dy));
      this.setScroll(this.dragStartOffset + dy);
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.input.on('wheel', (_pointer, _objects, _dx, dy) => this.setScroll(this.scrollOffset - dy));

    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.contentCam.ignore(close);
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('Feedback')) return;
      this.close();
    });
  }

  setScroll(offset) {
    this.scrollOffset = clampScroll(offset, this.contentHeight, this.view.height);
    this.contentCam.scrollY = this.view.y - this.scrollOffset;
    this.drawThumb();
  }

  /** Thin pink thumb on the right edge; hidden when everything fits. */
  drawThumb() {
    const g = this.thumb;
    g.clear();
    const maxScroll = Math.max(0, this.contentHeight - this.view.height);
    if (maxScroll === 0) return;
    const trackTop = this.view.y + 8;
    const trackH = this.view.height - 16;
    const thumbH = Math.max(40, (this.view.height / this.contentHeight) * trackH);
    const y = trackTop + (-this.scrollOffset / maxScroll) * (trackH - thumbH);
    g.fillStyle(0xf8a0c8, 0.6);
    g.fillRoundedRect(this.view.x + this.view.width - 10, y, 4, thumbH, 2);
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
