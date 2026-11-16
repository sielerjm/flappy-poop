import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { overlayOutsideHit, clampScroll, settingsLayout, leaderboardLayout, statsLayout } from '../src/logic.js';
import { nearestTab } from '../src/ui/tabs.js';
import { dailyYouText, eduYouText } from '../src/i18n.js';

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

test('leaderboardLayout: the 🏆 · 🌞 · 🏅 tabs sit between the title and the header; the window\'s rows, the footer and the version fit the panel, the panel fits a phone', async () => {
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
  assert.ok(lastRow + L.pitch / 2 <= L.pager.y - L.pager.height / 2, 'the window\'s rows end above the pager row (plan 28, 5.2), which sits above the footer');
  assert.ok(top >= 0 && bottom <= GAME_HEIGHT && L.panel.width <= GAME_WIDTH - 80, 'the panel fits the phone field with 40 px each side');
  assert.ok(L.cols.rank > cx - L.panel.width / 2 + 16 && L.cols.right < cx + L.panel.width / 2 - 16, 'rank and score inside the frame');
  assert.ok(L.cols.toilet - 24 - L.cols.name >= 230, 'a 🏆 name gets at least 230 px (for its tags)');
  assert.ok(L.versionY + 12 <= bottom - 8 && L.title.y - 26 >= top + 8, 'title and version inside the frame');
  assert.ok(L.cols.medalsRight < L.cols.right - 60, 'the medals end before a three-digit best-race number');
  assert.ok(L.title.x + L.titleMaxW / 2 < L.close.x - 24, 'a title shrunk to titleMaxW clears the ✕');
});

test('leaderboardLayout (plan 28, 5.2): the pager row ‹ 26-50 › sits under the window\'s 14 rows, inside the panel; the footer starts under it, so a second line grows down, clear of the arrows and the version', async () => {
  const { LEADERBOARD } = await import('../src/config.js');
  const cx = 360;
  const L = leaderboardLayout(cx, 640);
  const p = L.pager;
  assert.equal(LEADERBOARD.visibleRows, 14, 'the pager takes what was the window\'s 15th row');
  const bandBottom = L.firstY - L.pitch / 2 + LEADERBOARD.visibleRows * L.pitch + 8; // Leaderboard's band: the rows plus 16 px
  assert.ok(p.y - p.height / 2 >= bandBottom, `under the window (top ${p.y - p.height / 2}, window bottom ${bandBottom})`);
  assert.ok(p.height >= 56 && p.width >= 96, 'arrows big enough to tap');
  assert.ok(cx - p.gap - p.width / 2 >= cx - L.panel.width / 2 + 16 && cx + p.gap + p.width / 2 <= cx + L.panel.width / 2 - 16, 'both arrows inside the panel');
  assert.ok(2 * (p.gap - p.width / 2) >= 120, 'room between them for the label ("976-1000" at 28 px)');
  assert.ok(L.footerTop >= p.y + p.height / 2 + 6, 'the footer\'s first line under the arrows');
  assert.ok(L.footerTop + 2 * 32 <= L.versionY - 14, 'two footer lines (26 px) end above the version line');
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

// B3 (plan 21): a device with education mode unlocked has a fourth board, 📚.
test('leaderboardLayout with four tabs (🏆 · 🌞 · 🏅 · 📚): the same row, wider; every glyph inside the panel, a pill apart, in a tap row that spans them; three tabs are as they were', () => {
  const cx = 360;
  const cy = 640;
  const three = leaderboardLayout(cx, cy);
  assert.deepEqual(leaderboardLayout(cx, cy, { tabs: 3 }), three, 'three is the default');
  assert.deepEqual(three.tab, { y: cy - 432, xs: [cx - 96, cx, cx + 96], track: { x: cx, y: cy - 432, width: 288, height: 56 }, pill: { width: 88, height: 46 }, width: 320, height: 72 }, 'the three-tab row has not moved');
  const four = leaderboardLayout(cx, cy, { tabs: 4 });
  const { tab } = four;
  assert.equal(tab.xs.length, 4);
  assert.equal(tab.y, three.tab.y, 'the same row');
  assert.equal((tab.xs[0] + tab.xs[3]) / 2, cx, 'centred');
  for (let i = 1; i < 4; i += 1) assert.ok(tab.xs[i] - tab.xs[i - 1] >= tab.pill.width, 'the pill behind one glyph never covers its neighbour');
  assert.ok(tab.track.x - tab.track.width / 2 <= tab.xs[0] - tab.pill.width / 2 && tab.track.x + tab.track.width / 2 >= tab.xs[3] + tab.pill.width / 2, 'the pill stays inside the track');
  assert.ok(tab.track.x - tab.track.width / 2 >= cx - four.panel.width / 2 + 24 && tab.track.x + tab.track.width / 2 <= cx + four.panel.width / 2 - 24, 'the track inside the panel');
  assert.ok(tab.xs.every((x) => Math.abs(x - tab.track.x) <= tab.width / 2) && tab.width <= four.panel.width - 16, 'the tap row spans every glyph, inside the panel');
  assert.ok(four.title.y + 52 / 2 <= tab.y - tab.track.height / 2, 'the row sits under the title (and the ✕ beside it)');
  assert.ok(tab.height >= T.trayHitMin * 0.8, 'a thumb-sized row');
  assert.deepEqual(tab.xs.map((x) => nearestTab(x, tab.xs)), [0, 1, 2, 3], 'a tap on a glyph picks it');
  assert.equal(nearestTab(tab.track.x + tab.width / 2, tab.xs), 3, 'the right end is 📚');
  // Everything but the tab row is the same panel.
  for (const key of ['panel', 'title', 'close', 'headerY', 'firstY', 'pitch', 'pager', 'footerTop', 'versionY', 'cols', 'titleMaxW']) assert.deepEqual(four[key], three[key], key);
  // The 📚 board's columns: the grade ends left of the run count, and a name keeps its room.
  const c = four.cols;
  assert.ok(c.gradeRight < c.right - 56, 'the grade ends before a three-digit run count');
  assert.ok(c.gradeRight - 140 - 12 - c.name >= 220, `a name gets at least 220 px left of "100.0 %" (${c.gradeRight - 140 - 12 - c.name})`);
  assert.equal(eduYouText('en', { rank: 3, total: 12, grade: 92.5 }), 'You: #3 of 12 · 92.5 %');
  assert.equal(eduYouText('en', { rank: 1, total: 1, grade: 100 }), 'You: #1 of 1 · 100.0 %', 'one decimal, always');
  assert.equal(eduYouText('zh-Hans', { rank: 3, total: 12, grade: 92.5 }), '你：第3名 / 共12人 · 92.5 %');
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
    assert.equal(L.careerCols, 5, 'the 13 career counters on three rows, each cell at least a thumb wide');
    assert.ok((L.right - L.left) / L.careerCols >= T.trayHitMin, 'a career cell is at least trayHitMin wide');
    const g = L.gate;
    assert.ok(g.panel.y - g.panel.height / 2 >= 0 && g.panel.y + g.panel.height / 2 <= GAME_HEIGHT && g.panel.width <= GAME_WIDTH, 'the gate fits the field and the phone column');
    assert.ok(g.title.y < g.bodyY && g.bodyY < g.button.y - g.button.height / 2 && g.button.y + g.button.height / 2 < g.versionY - 20 && g.versionY < g.panel.y + g.panel.height / 2, 'gate: title, body, Create user, then the version line');
    assert.ok(g.button.height >= T.trayHitMin && g.bodyW < g.panel.width && g.close.x < g.panel.x + g.panel.width / 2, "the gate's button is thumb-sized; body and ✕ inside");
    assert.ok(L.card.width <= p.width - 80 && Math.abs(L.card.x - p.x) < 1 && L.card.y > top + 200 && L.card.y < bottom - 200, 'the explanation card sits inside the panel, over the band');
  }
});
