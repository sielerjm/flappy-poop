import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder } from '../ui/overlayStack.js';
import { t } from '../i18n.js';
import { createScrollView } from '../ui/scrollView.js';
import { CHANGELOG, changelogEntry, changelogNotes } from '../changelog.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };

/**
 * What's new overlay: one version's notes (the latest unless restarted with
 * { version }), then a link per other version. Opened from About's "Updated"
 * line or any overlay's version line; ✕ / Esc / tap outside return to the
 * overlay underneath. Scrollable (see ui/scrollView.js).
 */
export class Changelog extends Phaser.Scene {
  constructor() {
    super('Changelog');
  }

  create(data) {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const entry = changelogEntry(data?.version) ?? CHANGELOG[0];
    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const wrap = { width: 520, useAdvancedWrap: true };
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);
    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());

    const sv = createScrollView(this, panel, { fixed: [dimmer, panelRect, close] });

    sv.add(this.add.text(cx, cy - 440, t(locale, 'changelogTitle'), { ...STYLE, fontSize: '52px', color: PINK }).setOrigin(0.5));

    // Top-origin stack: the shown version's heading and bullets, then the other versions as links.
    let y = cy - 360;
    const heading = sv.add(this.add.text(cx, y, `${versionText(locale, entry.version)} · ${entry.date}`, { ...STYLE, fontSize: '36px' }).setOrigin(0.5, 0));
    y += heading.height + 20;
    const notes = sv.add(this.add.text(cx, y, changelogNotes(entry, locale), { ...MUTED, fontSize: '26px', align: 'left', wordWrap: wrap, lineSpacing: 8 }).setOrigin(0.5, 0));
    y += notes.height + 48;

    sv.add(this.add.text(cx, y, t(locale, 'changelogPrevious'), { ...STYLE, fontSize: '28px', color: PINK }).setOrigin(0.5, 0));
    y += 52;
    const links = [];
    for (const other of CHANGELOG) {
      if (other.version === entry.version) continue;
      const latest = other === CHANGELOG[0] ? `${t(locale, 'changelogLatest')} · ` : '';
      const link = sv.link(
        sv.add(this.add.text(cx, y, `${latest}${versionText(locale, other.version)} · ${other.date}`, { ...STYLE, fontSize: '30px', color: PINK, fontStyle: 'normal' }).setOrigin(0.5, 0)),
        () => this.scene.restart({ version: other.version }),
      );
      links.push(pressable(`v${other.version}`, link, { event: 'pointerup', scrolled: true }));
      y += 48;
    }
    sv.finish(y);

    this.input.keyboard?.on('keydown-ESC', () => this.close());
    // Controller: left / right walk ✕ and the version links (scrolled into view), up / down scroll the text.
    this.scroll = sv;
    this.focus = createFocus(this, T, {
      items: [pressable('close', close), ...links],
      scrolled: sv,
      onVertical: (dir) => sv.scrollBy(dir === 'up' ? T.focus.scrollStepPx : -T.focus.scrollStepPx),
    });
    this.focus.show(); // only under a controller (registry padMode)
  }

  close() {
    if (!isTopOverlay(this)) return; // Feedback is over it
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'changelog',
      stackedAbout: this.scene.isActive('About'),
      stackedUnder: hasOverlayUnder(this),
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}
