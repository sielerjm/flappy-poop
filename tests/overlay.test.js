import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { overlayOutsideHit, clampScroll, settingsLayout, leaderboardLayout, statsLayout } from '../src/logic.js';
import { nearestTab } from '../src/ui/tabs.js';
import { dailyYouText } from '../src/i18n.js';

const howto = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 1000 };
const settings = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 860 };

test('overlayOutsideHit is false at the HowTo panel centre', () => {
  assert.equal(overlayOutsideHit(howto.x, howto.y, howto), false);
});

test('overlayOutsideHit is true 1 px outside each HowTo edge', () => {
  const hw = howto.width / 2;
  const hh = howto.height / 2;
  assert.equal(overlayOutsideHit(howto.x - hw - 1, howto.y, howto), true);
  assert.equal(overlayOutsideHit(howto.x + hw + 1, howto.y, howto), true);
  assert.equal(overlayOutsideHit(howto.x, howto.y - hh - 1, howto), true);
  assert.equal(overlayOutsideHit(howto.x, howto.y + hh + 1, howto), true);
});

test('overlayOutsideHit stays false 1 px inside each HowTo edge', () => {
  const hw = howto.width / 2;
  const hh = howto.height / 2;
  assert.equal(overlayOutsideHit(howto.x - hw + 1, howto.y, howto), false);
  assert.equal(overlayOutsideHit(howto.x + hw - 1, howto.y, howto), false);
  assert.equal(overlayOutsideHit(howto.x, howto.y - hh + 1, howto), false);
  assert.equal(overlayOutsideHit(howto.x, howto.y + hh - 1, howto), false);
});

test('Settings 600x760 panel: centre inside, 1 px beyond height is outside', () => {
  assert.equal(overlayOutsideHit(settings.x, settings.y, settings), false);
  assert.equal(overlayOutsideHit(settings.x, settings.y + settings.height / 2 + 1, settings), true);
});

test('Settings test-mode panel (settingsLayout, 600x1240): edges hit like the plain one', () => {
  const panel = settingsLayout(GAME_WIDTH, GAME_HEIGHT, T, { test: true }).panel;
  const hh = panel.height / 2;
  assert.equal(overlayOutsideHit(panel.x, panel.y, panel), false);
  assert.equal(overlayOutsideHit(panel.x, panel.y - hh + 1, panel), false, 'test title area is inside');
  assert.equal(overlayOutsideHit(panel.x, panel.y + hh - 1, panel), false, 'version line area is inside');
  assert.equal(overlayOutsideHit(panel.x, panel.y - hh - 1, panel), true);
  assert.equal(overlayOutsideHit(panel.x, panel.y + hh + 1, panel), true);
  // A tap that was inside the plain panel stays inside the taller one.
  assert.equal(overlayOutsideHit(settings.x, settings.y - settings.height / 2 + 1, panel), false);
});

test('clampScroll is 0 when the content fits and clamps to the overflow otherwise', () => {
  assert.equal(clampScroll(0, 800, 1000), 0);
  assert.equal(clampScroll(-300, 800, 1000), 0);
  assert.equal(clampScroll(50, 800, 1000), 0);
  assert.equal(clampScroll(-100, 1300, 1000), -100);
  assert.equal(clampScroll(-900, 1300, 1000), -300);
  assert.equal(clampScroll(40, 1300, 1000), 0);
  assert.equal(clampScroll(Number.NaN, 1300, 1000), 0);
});

test('leaderboardLayout: the 🏆 · 🌞 · 🏅 tabs sit between the title and the header; ten rows, the footer and the version fit the panel', async () => {
  const { LEADERBOARD } = await import('../src/config.js');
  const cx = 360;
  const cy = 640;
  const L = leaderboardLayout(cx, cy);
  const top = cy - L.panel.height / 2;
  const bottom = cy + L.panel.height / 2;
  const titleBottom = L.title.y + 52 / 2;
  const tabTop = L.tab.y - L.tab.track.height / 2;
  assert.ok(titleBottom <= tabTop, 'the pill clears the title');
  assert.ok(L.tab.y + L.tab.track.height / 2 < L.headerY - 10, 'the pill clears the header');
  assert.ok(L.tab.height >= T.trayHitMin * 0.8 && L.tab.width >= T.trayHitMin * 3, 'the switch row is a thumb-sized target');
  assert.equal(L.tab.xs.length, 3, 'three boards');
  assert.ok(L.tab.xs[0] < L.tab.xs[1] && L.tab.xs[1] === cx && L.tab.xs[1] < L.tab.xs[2], 'left to right, the middle one centred');
  assert.ok(L.tab.xs[0] - 24 > cx - L.panel.width / 2 && L.tab.xs[2] + 24 < L.close.x - 24, 'every glyph inside the panel, clear of ✕');
  assert.ok(L.tab.xs[1] - L.tab.xs[0] >= L.tab.pill.width && L.tab.xs[2] - L.tab.xs[1] >= L.tab.pill.width, 'the pill behind one glyph never covers its neighbour');
  assert.ok(L.tab.track.x - L.tab.track.width / 2 <= L.tab.xs[0] - L.tab.pill.width / 2 && L.tab.track.x + L.tab.track.width / 2 >= L.tab.xs[2] + L.tab.pill.width / 2, 'the pill stays inside the track');
  assert.ok(L.tab.xs.every((x) => Math.abs(x - L.tab.track.x) <= L.tab.width / 2), 'the tap row spans every glyph');
  assert.ok(L.headerY < L.firstY - L.pitch / 2, 'the header sits above the first row');
  const lastRow = L.firstY + (LEADERBOARD.visibleRows - 1) * L.pitch;
  assert.ok(lastRow + L.pitch / 2 <= L.footerY - 26, 'ten rows end above the footer');
  assert.ok(L.versionY + 12 <= bottom - 8 && L.title.y - 26 >= top + 8, 'title and version inside the frame');
  assert.ok(L.cols.medalsRight < L.cols.right - 60, 'the medals end before a three-digit best-race number');
  assert.ok(L.title.x + L.titleMaxW / 2 < L.close.x - 24, 'a title shrunk to titleMaxW clears the ✕');
});

test('a tap on the tab row picks the nearest glyph; the 🌞 footer names your rank', () => {
  const { tab } = leaderboardLayout(360, 640);
  assert.deepEqual(tab.xs.map((x) => nearestTab(x, tab.xs)), [0, 1, 2]);
  assert.equal(nearestTab(tab.track.x - tab.width / 2, tab.xs), 0, 'the left end');
  assert.equal(nearestTab(tab.track.x + tab.width / 2, tab.xs), 2, 'the right end');
  assert.equal(nearestTab((tab.xs[0] + tab.xs[1]) / 2 + 1, tab.xs), 1, 'just past halfway');
  assert.equal(dailyYouText('en', { rank: 3, total: 12, score: 87 }), 'You: #3 of 12 · 87');
  assert.equal(dailyYouText('zh-Hans', { rank: 3, total: 12, score: 87 }), '你：第3名 / 共12人 · 87');
});

test('the Profile panel (statsLayout): inside the field, ✕ and title above the band, the detail strip and version line below it', () => {
  for (const W of [GAME_WIDTH, 1440]) {
    const L = statsLayout(W / 2, GAME_HEIGHT / 2);
    const p = L.panel;
    const top = p.y - p.height / 2;
    const bottom = p.y + p.height / 2;
    assert.ok(top >= 0 && bottom <= GAME_HEIGHT && p.x - p.width / 2 >= 0 && p.x + p.width / 2 <= W, 'the panel fits the field');
    assert.ok(p.width <= GAME_WIDTH, 'and the phone column');
    const bandTop = L.band.y - L.band.height / 2;
    const bandBottom = L.band.y + L.band.height / 2;
    assert.ok(bandTop >= top && bandBottom <= bottom, 'the band is inside the panel');
    assert.ok(L.title.y + 30 < bandTop && L.close.y + 30 < bandTop && L.close.y - 30 > top, 'title and ✕ sit above the band, inside the panel');
    assert.ok(L.detailY - 30 > bandBottom && L.versionY - 20 > L.detailY + 30 && L.versionY + 20 < bottom, 'the detail strip and then the version line below the band');
    assert.ok(L.left > p.x - p.width / 2 && L.right < p.x + p.width / 2 && L.titleMaxW < p.width - 100, 'rows and title clear of the edges and the ✕');
    assert.ok(Number.isInteger(L.badgeCols) && L.badgeCols >= 3);
  }
});
