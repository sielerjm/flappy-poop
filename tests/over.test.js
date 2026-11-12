import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { overButtonsLayout, overCellsLayout, overBandLayout, overEduLines, overHit, shareCardLayout, trayLayout } from '../src/logic.js';

const cx = GAME_WIDTH / 2;
const cy = GAME_HEIGHT / 2;
const PANEL = { x: cx, y: cy, width: 560, height: 720 }; // Over.js panel, stroke 8
const STROKE = 8;

test('game-over buttons: Share | Home on one row inside the panel, apart, thumb-sized', () => {
  const { share, home } = overButtonsLayout(cx, cy, T);
  assert.equal(share.id, 'share');
  assert.equal(home.id, 'home');
  assert.equal(share.y, home.y);
  assert.ok(share.x < home.x, 'Share on the left');
  assert.equal((share.x + home.x) / 2, cx, 'the pair is centred');
  const inner = { l: cx - PANEL.width / 2 + STROKE, r: cx + PANEL.width / 2 - STROKE, b: cy + PANEL.height / 2 - STROKE };
  for (const b of [share, home]) {
    assert.ok(b.x - b.width / 2 >= inner.l && b.x + b.width / 2 <= inner.r, `${b.id} inside the panel sides`);
    assert.ok(b.y + b.height / 2 <= inner.b, `${b.id} above the panel bottom`);
    assert.ok(b.height >= T.trayHitMin, `${b.id} at least trayHitMin tall`);
  }
  assert.equal(home.x - home.width / 2 - (share.x + share.width / 2), T.over.buttonGap, 'buttonGap between them');
});

test('a test run has Home alone at the centre and no share box', () => {
  const layout = overButtonsLayout(cx, cy, T, { share: false });
  assert.equal(layout.share, null);
  assert.equal(layout.home.x, cx);
  const both = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(both.share.x, both.share.y, layout), null, 'nothing where Share would be');
  assert.equal(overHit(cx, layout.home.y, layout), 'home');
});

test('overHit: centres hit their button; the gap and outside miss', () => {
  const layout = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(layout.share.x, layout.share.y, layout), 'share');
  assert.equal(overHit(layout.home.x, layout.home.y, layout), 'home');
  assert.equal(overHit(cx, layout.home.y, layout), null, 'the gap between them');
  assert.equal(overHit(layout.share.x, layout.share.y - layout.share.height / 2 - 1, layout), null);
  assert.equal(overHit(cx, cy, layout), null);
  assert.equal(overHit(cx, cy, null), null);
});

test('share card: every element sits inside the frame, top to bottom, without overlapping', () => {
  const L = shareCardLayout(T);
  const c = T.shareCard;
  assert.equal(L.width, 1080);
  assert.equal(L.height, 1350);
  const edge = L.border + c.margin;
  assert.equal(L.innerWidth, L.width - 2 * edge);
  // Vertical extents (centre ± half the font size or icon / box height), in drawing order.
  const bands = [
    ['headline', L.headline.y, L.headline.px],
    ['poop box', L.poopBox.y, L.poopBox.height + L.poopBox.stroke],
    ['score', L.score.y, L.score.px],
    ['row 1', L.rows[0][0].y, Math.max(L.rows[0][0].iconPx, L.rows[0][0].px)],
    ['row 2', L.rows[1][0].y, Math.max(L.rows[1][0].iconPx, L.rows[1][0].px)],
    ['pipes', L.pipe.y, Math.max(L.pipe.height, L.pipe.px)],
    ['footer', L.footer.y, L.footer.px],
  ].map(([name, y, h]) => ({ name, top: y - h / 2, bottom: y + h / 2 }));
  assert.ok(bands[0].top >= edge, `headline clear of the top frame (${bands[0].top})`);
  assert.ok(bands.at(-1).bottom <= L.height - edge, `footer clear of the bottom frame (${bands.at(-1).bottom})`);
  for (let i = 1; i < bands.length; i += 1) {
    assert.ok(bands[i].top >= bands[i - 1].bottom, `${bands[i].name} (${bands[i].top}) below ${bands[i - 1].name} (${bands[i - 1].bottom})`);
  }
  assert.ok(L.poop.size <= L.poopBox.height - 2 * L.poopBox.stroke && L.poop.size <= L.poopBox.width, 'the poop fits its frame');
  assert.ok(L.poopBox.width <= L.innerWidth, 'the frame fits the card');
});

test('share card rows: fiber · probiotic · postbiotic over bacteria · bean · box, centred, inside the frame', () => {
  const L = shareCardLayout(T);
  assert.deepEqual(L.rows.map((r) => r.map((cell) => cell.kind)), [['fiber', 'probiotic', 'postbiotic'], ['bacteria', 'bean', 'mystery']]);
  const edge = L.border + T.shareCard.margin;
  for (const row of L.rows) {
    assert.equal(row[1].textX - (L.cx + 4), 0, 'the middle column sits on the card centre');
    for (const cell of row) {
      assert.ok(cell.iconX - cell.iconPx / 2 >= edge, `${cell.kind} icon inside the left frame`);
      assert.ok(cell.textX + 3 * cell.px * 0.6 <= L.width - edge, `${cell.kind} "×nn" inside the right frame`);
      assert.ok(cell.iconX + cell.iconPx / 2 < cell.textX, `${cell.kind} icon left of its count`);
    }
  }
  assert.ok(L.pipe.iconX + L.pipe.width / 2 < L.pipe.textX, 'pipe cap left of its count');
  assert.ok(Math.abs(L.pipe.width / L.pipe.height - 128 / 160) < 0.02, 'pipe cap keeps the 128x160 slice shape');
});

test('a Daily Dump result: the score line is a box of its own, apart from Share and Home, inside the panel', () => {
  for (const share of [true, false]) {
    const layout = overButtonsLayout(cx, cy, T, { share, score: true });
    const box = layout.score;
    assert.equal(box.id, 'score');
    assert.equal(box.x, cx);
    assert.equal(box.y, cy + T.over.scoreOffsetY);
    assert.ok(box.height >= T.trayHitMin);
    assert.ok(box.x - box.width / 2 >= cx - PANEL.width / 2 + STROKE && box.x + box.width / 2 <= cx + PANEL.width / 2 - STROKE, 'inside the panel');
    assert.equal(overHit(box.x, box.y, layout), 'score');
    for (const b of [layout.share, layout.home].filter(Boolean)) {
      assert.ok(Math.abs(b.y - box.y) > (b.height + box.height) / 2, `${b.id} is on another row`);
    }
  }
  for (const share of [true, false]) {
    const layout = overButtonsLayout(cx, cy, T, { share, score: true });
    const r = layout.rank;
    assert.equal(r.id, 'rank');
    assert.ok(r.height >= T.trayHitMin);
    assert.ok(r.x - r.width / 2 >= cx - PANEL.width / 2 + STROKE && r.x + r.width / 2 <= cx + PANEL.width / 2 - STROKE, 'the rank cell inside the panel');
    assert.equal(overHit(r.x, r.y, layout), 'rank');
    for (const b of [layout.share, layout.home, layout.score].filter(Boolean)) {
      const apart = Math.abs(b.y - r.y) > (b.height + r.height) / 2 || Math.abs(b.x - r.x) > (b.width + r.width) / 2;
      assert.ok(apart, `the rank cell clears ${b.id}`);
    }
  }
  assert.equal(overButtonsLayout(cx, cy, T).rank, null, 'a normal game over has no rank box');
  assert.equal(overButtonsLayout(cx, cy, T).score, null, 'a normal game over has no score box');
  assert.equal(overHit(cx, cy + T.over.scoreOffsetY, overButtonsLayout(cx, cy, T)), null);
});

test('Play again sits centred under Share | Home with its glow inside the panel; the lifted, grown panel clears the ⏸ and the field; none unless asked', async () => {
  const { trayLayout } = await import('../src/logic.js');
  const lifted = cy - T.over.againLiftPx; // Over's centre when Play again is shown
  for (const share of [true, false]) {
    const layout = overButtonsLayout(cx, lifted, T, { share, again: true });
    const a = layout.again;
    assert.equal(a.id, 'again');
    assert.equal(a.x, cx);
    assert.ok(a.height >= T.trayHitMin);
    const top = lifted - PANEL.height / 2 + STROKE;
    const bottom = lifted + PANEL.height / 2 + T.over.againPanelGrowPx - STROKE;
    assert.ok(a.y + a.height / 2 + T.readyPromptGlowPx <= bottom, 'Play again and its glow inside the panel');
    assert.ok(a.x - a.width / 2 >= cx - PANEL.width / 2 + STROKE && a.x + a.width / 2 <= cx + PANEL.width / 2 - STROKE);
    assert.ok(a.y - a.height / 2 >= layout.home.y + layout.home.height / 2 + 16, 'a clear gap under the Share | Home row');
    assert.equal(overHit(a.x, a.y, layout), 'again');
    assert.ok(top - STROKE >= 160, 'the panel top stays under the HUD');
  }
  // The panel's bottom clears the ⏸ (above the cog) and the tray band.
  const pause = trayLayout(GAME_WIDTH, GAME_HEIGHT, T).pause;
  const panelBottom = lifted + PANEL.height / 2 + T.over.againPanelGrowPx;
  assert.ok(panelBottom <= pause.y - pause.size / 2 - 12, `panel bottom ${panelBottom} vs ⏸ top ${pause.y - pause.size / 2}`);
  assert.equal(overButtonsLayout(cx, cy, T).again, null);
  assert.equal(overButtonsLayout(cx, cy, T, { score: true }).again, null, 'a Daily Dump result has none');
});


test('the game-over summary cells: inside the panel, clear of each other and the buttons; no coin cell in a Daily Dump', () => {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2 - T.over.againLiftPx;
  const panel = { left: cx - 280, right: cx + 280, top: cy - 360 };
  for (const daily of [false, true]) {
    const cells = overCellsLayout(cx, cy, T, { daily });
    assert.deepEqual(cells.map((c) => c.id), ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'falls', 'closeCalls', 'pipes', ...(daily ? [] : ['coin'])]);
    const buttons = overButtonsLayout(cx, cy, T, { share: true, score: daily, again: !daily });
    const edges = (b) => ({ l: b.x - b.width / 2, r: b.x + b.width / 2, t: b.y - b.height / 2, b: b.y + b.height / 2 });
    const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    for (const c of cells) {
      const e = edges(c);
      assert.ok(e.l >= panel.left && e.r <= panel.right && e.t > panel.top, `${c.id} inside the panel`);
      for (const o of cells) if (o !== c) assert.ok(!overlap(e, edges(o)), `${c.id} clear of ${o.id}`);
      for (const b of [buttons.share, buttons.home, buttons.again, buttons.rank].filter(Boolean)) assert.ok(!overlap(e, edges(b)), `${c.id} clear of ${b.id}`);
      assert.ok(c.textX > c.iconX && c.iconX > e.l && c.textX < e.r, `${c.id}: icon then ×n inside its box`);
    }
    // A tap on a cell names it; a button wins over nothing else.
    const layout = { ...buttons, cells };
    assert.equal(overHit(cells[0].x, cells[0].y, layout), 'cell:fiber');
    assert.equal(overHit(cells.at(-1).x, cells.at(-1).y, layout), `cell:${cells.at(-1).id}`);
    assert.equal(overHit(buttons.home.x, buttons.home.y, layout), 'home');
  }
  assert.equal(overCellsLayout(cx, cy, T).find((c) => c.id === 'coin').y, cy + T.over.rankBox.dy, "the coin cell is where a Daily Dump's rank goes");
});

test("the summary band (plan 22): under the score line, down to the buttons' top edge, inside the panel; every cell and the rank link sit in it", () => {
  for (const again of [false, true]) {
    const y0 = cy - (again ? T.over.againLiftPx : 0);
    const band = overBandLayout(cx, y0, T);
    assert.equal(band.top, y0 + T.over.band.top);
    assert.equal(band.bottom, y0 + T.over.band.bottom);
    assert.ok(band.top >= y0 + T.over.scoreOffsetY + 24, 'below the 48 px score line');
    const { home, rank } = overButtonsLayout(cx, y0, T, { score: true, again });
    assert.ok(band.bottom <= home.y - home.height / 2, 'it ends where the buttons begin');
    assert.ok(band.left >= PANEL.x - PANEL.width / 2 + STROKE && band.right <= PANEL.x + PANEL.width / 2 - STROKE, 'inside the panel border');
    for (const daily of [false, true]) {
      for (const c of overCellsLayout(cx, y0, T, { daily })) {
        assert.ok(c.y - c.height / 2 >= band.top && c.y + c.height / 2 <= band.bottom && c.x - c.width / 2 >= band.left && c.x + c.width / 2 <= band.right, `cell ${c.id} is in the band`);
      }
    }
    assert.ok(rank.y - 20 >= band.top && rank.y + 20 <= band.bottom && rank.x + rank.width / 2 <= band.right, 'the daily rank is in the band');
    // What createScrollView takes: it insets 8 px a side, which lands on the band's edges.
    assert.deepEqual(band.panel, { x: cx, y: (band.top + band.bottom) / 2, width: T.over.panelWidth, height: band.bottom - band.top + 16 });
    assert.equal(band.panel.y - band.panel.height / 2 + 8, band.top);
    assert.equal(band.panel.x - band.panel.width / 2 + 8, band.left);
  }
  assert.equal(T.over.panelWidth, PANEL.width);
});

test('the lines under the cells fit the band at rest: a personal best over a badge line, or a countdown', () => {
  const band = overBandLayout(cx, cy, T);
  const half = (px) => Math.ceil((px * 1.2) / 2); // a line's half height, generously
  // Over.js: a personal best (34 px) or a countdown (28 px) at +150, a badge line (28 px) at +186.
  assert.ok(cy + 150 + half(34) <= band.bottom, 'the personal-best line');
  assert.ok(cy + 186 + half(28) <= band.bottom + 2, 'the badge line under it (a pixel or two of a tall glyph does not make the band scroll)');
});

// E5 (plan 21): the education game-over panel. Home | Play again side by side, the tally in the grid.
const EDU_Y = cy - T.over.againLiftPx; // an education panel offers Play again: the lifted, grown panel
const EDU_PANEL = { left: cx - PANEL.width / 2 + STROKE, right: cx + PANEL.width / 2 - STROKE, top: EDU_Y - PANEL.height / 2 + STROKE, bottom: EDU_Y + PANEL.height / 2 + T.over.againPanelGrowPx - STROKE };
const box = (b) => ({ l: b.x - b.width / 2, r: b.x + b.width / 2, t: b.y - b.height / 2, b: b.y + b.height / 2 });
const overlapping = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const halfLine = (px) => Math.ceil((px * 1.2) / 2);

test('an education panel: Home | Play again side by side on Play again\'s row; the glow stays off Home and inside the panel; a won run\'s bonus button sits over the pair', () => {
  const glow = T.over.pairGlowPx;
  for (const bonus of [false, true]) {
    const L = overButtonsLayout(cx, EDU_Y, T, { pair: true, bonus });
    const { home, again } = L;
    assert.deepEqual([home.id, again.id, L.share, L.score, L.rank], ['home', 'again', null, null, null], 'Home and Play again, nothing to share');
    assert.ok(home.x < again.x, 'Play again on the right');
    assert.equal((home.x + again.x) / 2, cx, 'the pair is centred');
    assert.equal(home.y, again.y, 'one row');
    assert.equal(again.y, EDU_Y + T.over.againOffsetY, 'where Play again always sat: the panel keeps its size and place');
    for (const b of [home, again]) {
      const e = box(b);
      assert.ok(b.height >= T.trayHitMin && b.width >= 2 * T.trayHitMin, `${b.id} is thumb-sized (${b.width} × ${b.height})`);
      assert.ok(e.l >= EDU_PANEL.left && e.r <= EDU_PANEL.right && e.b <= EDU_PANEL.bottom, `${b.id} inside the panel's border`);
    }
    // Play again's glow reaches pairGlowPx past it on every side.
    const halo = { l: box(again).l - glow, r: box(again).r + glow, t: box(again).t - glow, b: box(again).b + glow };
    assert.ok(halo.l - box(home).r >= 12, `the glow clears Home by ${halo.l - box(home).r} px`);
    assert.ok(halo.r <= EDU_PANEL.right - 4 && halo.b <= EDU_PANEL.bottom - 4, `the glow stays inside the panel's border (right ${EDU_PANEL.right - halo.r} px, bottom ${EDU_PANEL.bottom - halo.b} px to spare)`);
    assert.ok(glow < T.readyPromptGlowPx && glow >= 16, `a shorter glow than a lone button's (${glow} < ${T.readyPromptGlowPx})`);
    assert.equal(box(again).l - box(home).r, T.over.pairGap);
    assert.equal(overHit(home.x, home.y, L), 'home');
    assert.equal(overHit(again.x, again.y, L), 'again');
    assert.equal(overHit(cx, home.y, L), null, 'the gap between them is neither');
    // The summary band: down to just above the glow, or to the bonus button's top.
    const band = overBandLayout(cx, EDU_Y, T, { tall: !bonus });
    if (bonus) {
      const bb = L.bonus;
      assert.deepEqual([bb.id, bb.x, bb.y], ['bonus', cx, EDU_Y + T.over.buttonOffsetY], 'centred, where Share | Home sits on a normal panel');
      assert.ok(bb.height >= T.trayHitMin && box(bb).l >= EDU_PANEL.left && box(bb).r <= EDU_PANEL.right);
      assert.ok(box(home).t - box(bb).b >= 16, `the bonus button clears the pair by ${box(home).t - box(bb).b} px`);
      assert.ok(halo.t >= box(bb).b, 'and the glow does not run over it');
      assert.ok(band.bottom <= box(bb).t, 'the band ends where the bonus button begins');
      assert.equal(band.bottom, EDU_Y + T.over.band.bottom, 'the band a normal panel has');
      assert.equal(overHit(bb.x, bb.y, L), 'bonus');
    } else {
      assert.equal(L.bonus, null);
      assert.equal(band.bottom, EDU_Y + T.over.eduBandBottom);
      assert.ok(band.bottom <= halo.t && halo.t - band.bottom <= 12, `the band ends just above the glow (${halo.t - band.bottom} px)`);
      assert.ok(band.bottom > EDU_Y + T.over.band.bottom, 'it took the row Home left');
      assert.equal(overHit(cx, EDU_Y + T.over.buttonOffsetY, L), null, 'nothing where the bonus button would be');
    }
  }
  // The panel's bottom still clears the ⏸ above the cog: the panel did not grow for the pair.
  const pause = trayLayout(GAME_WIDTH, GAME_HEIGHT, T).pause;
  assert.ok(EDU_PANEL.bottom + STROKE <= pause.y - pause.size / 2 - 12);
});

test('an education panel\'s cells: the tally is the third row, ‼️ 😢 move under the coins; nothing overlaps; a lost run\'s rows and lines all sit in its band', () => {
  for (const badge of [false, true]) {
    const cells = overCellsLayout(cx, EDU_Y, T, { education: true, badge });
    assert.deepEqual(cells.map((c) => c.id), ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'eduAnswered', 'eduRight', 'eduWrong', 'pipes', 'coin', 'falls', 'closeCalls']);
    const plain = overCellsLayout(cx, EDU_Y, T);
    const at = (list, id) => list.find((c) => c.id === id);
    for (const id of ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'pipes', 'coin']) assert.deepEqual(at(cells, id), at(plain, id), `${id} is where it is on every panel`);
    const tally = ['eduAnswered', 'eduRight', 'eduWrong'].map((id) => at(cells, id));
    assert.ok(tally.every((c) => c.y === at(plain, 'falls').y), "the tally takes the ‼️ 😢 row's place");
    assert.deepEqual(tally.map((c) => c.x), ['fiber', 'probiotic', 'postbiotic'].map((id) => at(cells, id).x), 'in the three columns of the rows above');
    const lines = overEduLines(T, { badge });
    assert.equal(at(cells, 'falls').y, EDU_Y + lines.falls);
    assert.equal(at(cells, 'closeCalls').y, at(cells, 'falls').y);
    assert.deepEqual([at(cells, 'falls').x, at(cells, 'closeCalls').x], [at(plain, 'falls').x, at(plain, 'closeCalls').x], '‼️ 😢 keep their columns');
    assert.ok(at(cells, 'falls').y > at(cells, 'coin').y, 'under the coins row');
    for (const c of cells) {
      const e = box(c);
      assert.ok(e.l >= EDU_PANEL.left && e.r <= EDU_PANEL.right, `${c.id} inside the panel`);
      for (const o of cells) if (o !== c) assert.ok(!overlapping(e, box(o)), `${c.id} clear of ${o.id}`);
      assert.ok(c.height >= 44 && c.width >= 120, `${c.id} is a tap target`);
    }
    // The rows under the coins: the badge line (28 px), the ‼️ 😢 row (50 px cells), the note (24 px), each clear of the next.
    const coinB = box(at(cells, 'coin')).b;
    const fallsBox = box(at(cells, 'falls'));
    if (badge) {
      assert.equal(lines.badge, T.over.eduLinesY.badge);
      assert.ok(EDU_Y + lines.badge - halfLine(28) >= coinB && EDU_Y + lines.badge + halfLine(28) <= fallsBox.t, 'the badge line sits between the coins row and the ‼️ 😢 row');
    } else {
      assert.equal(lines.badge, null);
      assert.ok(fallsBox.t >= coinB, 'the ‼️ 😢 row sits under the coins row');
    }
    assert.ok(EDU_Y + lines.note - halfLine(24) >= fallsBox.b, 'the note sits under the ‼️ 😢 row');
    const gaps = badge ? [lines.badge - T.over.rankBox.dy, lines.falls - lines.badge, lines.note - lines.falls] : [lines.falls - T.over.rankBox.dy, lines.note - lines.falls];
    assert.ok(gaps.every((g) => g >= 50 && g <= 68), `the rows are a row apart, as the cells above are (${gaps.join(', ')} px; those are ${T.over.cellRowsY[1] - T.over.cellRowsY[0]})`);
    // A lost run: the taller band holds every row and line, so nothing scrolls.
    const tall = overBandLayout(cx, EDU_Y, T, { tall: true });
    for (const c of cells) assert.ok(box(c).t >= tall.top && box(c).b <= tall.bottom, `lost: ${c.id} is in the band`);
    assert.ok(EDU_Y + lines.note + halfLine(24) <= tall.bottom, `lost: the note ends inside the band (${tall.bottom - (EDU_Y + lines.note + halfLine(24))} px to spare)`);
    // The buttons are clear of every cell.
    for (const bonus of [false, true]) {
      const L = overButtonsLayout(cx, EDU_Y, T, { pair: true, bonus });
      if (!bonus) for (const c of cells) for (const b of [L.home, L.again]) assert.ok(!overlapping(box(c), box(b)), `${c.id} clear of ${b.id}`);
      assert.equal(overHit(tally[1].x, tally[1].y, { ...L, cells }), 'cell:eduRight');
    }
  }
  // A won run: the bonus button takes a row, so the band is the normal one. The first row under the
  // coins stays in view; what does not fit starts below the band's bottom, whole: nothing is cut by it.
  const fold = overBandLayout(cx, EDU_Y, T).bottom;
  for (const badge of [false, true]) {
    const lines = overEduLines(T, { badge, won: true });
    const cells = overCellsLayout(cx, EDU_Y, T, { education: true, badge, won: true });
    const falls = box(cells.find((c) => c.id === 'falls'));
    assert.equal(falls.t, EDU_Y + lines.falls - T.over.cellH / 2);
    const rows = [
      ...(badge ? [['the badge line', EDU_Y + lines.badge - halfLine(28), EDU_Y + lines.badge + halfLine(28)]] : []),
      ['the ‼️ 😢 row', falls.t, falls.b],
      ['the note', EDU_Y + lines.note - halfLine(24), EDU_Y + lines.note + halfLine(24)],
    ];
    for (const [name, top, bottom] of rows) assert.ok(bottom <= fold || top >= fold, `won${badge ? ', a badge' : ''}: ${name} (${top}–${bottom}) is not cut by the band's bottom (${fold})`);
    assert.ok(rows[0][2] <= fold - 16, `won${badge ? ', a badge' : ''}: ${rows[0][0]} is in view, clear of the bonus button by ${fold - rows[0][2]} px`);
    assert.ok(rows.at(-1)[1] >= fold, `won${badge ? ', a badge' : ''}: the note is below the fold: the band scrolls to it`);
    for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i][1] >= rows[i - 1][2], `won: ${rows[i][0]} under ${rows[i - 1][0]}`);
    for (const c of cells) for (const o of cells) if (o !== c) assert.ok(!overlapping(box(c), box(o)), `won: ${c.id} clear of ${o.id}`);
  }
  assert.notDeepEqual(overEduLines(T, { badge: true, won: true }), overEduLines(T, { badge: true, won: false }), 'a won run sets its rows for the shorter band');
});

test('the panels that are not education panels are laid out as before', () => {
  const o = T.over;
  const b = (id, x, y) => ({ id, x, y, width: o.buttonWidth, height: o.buttonHeight });
  const off = (o.buttonWidth + o.buttonGap) / 2;
  // A normal run: Share | Home, Play again under them.
  assert.deepEqual(overButtonsLayout(cx, EDU_Y, T, { share: true, again: true }), { share: b('share', cx - off, EDU_Y + o.buttonOffsetY), home: b('home', cx + off, EDU_Y + o.buttonOffsetY), score: null, rank: null, again: b('again', cx, EDU_Y + o.againOffsetY) });
  // A test run: Home alone, Play again under it.
  assert.deepEqual(overButtonsLayout(cx, EDU_Y, T, { share: false, again: true }), { share: null, home: b('home', cx, EDU_Y + o.buttonOffsetY), score: null, rank: null, again: b('again', cx, EDU_Y + o.againOffsetY) });
  // A Daily Dump: Share | Home, the score and rank links, no Play again.
  const daily = overButtonsLayout(cx, cy, T, { share: true, score: true });
  assert.deepEqual([daily.share, daily.home, daily.again], [b('share', cx - off, cy + o.buttonOffsetY), b('home', cx + off, cy + o.buttonOffsetY), null]);
  assert.deepEqual([daily.score.id, daily.rank.id], ['score', 'rank']);
  for (const L of [overButtonsLayout(cx, EDU_Y, T, { share: true, again: true }), daily]) assert.equal(L.bonus, undefined, 'no bonus box off an education panel');
  // Their cells and their band.
  assert.deepEqual(overCellsLayout(cx, cy, T).map((c) => c.id), ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'falls', 'closeCalls', 'pipes', 'coin']);
  assert.deepEqual(overCellsLayout(cx, cy, T, { badge: true }), overCellsLayout(cx, cy, T), 'a badge line moves nothing off an education panel');
  assert.equal(overCellsLayout(cx, cy, T).find((c) => c.id === 'falls').y, cy + o.cellRowsY[2]);
  assert.deepEqual(overBandLayout(cx, cy, T), overBandLayout(cx, cy, T, { tall: false }));
  assert.equal(overBandLayout(cx, cy, T).bottom, cy + o.band.bottom);
});
