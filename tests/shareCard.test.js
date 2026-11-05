import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { shareCardLayout } from '../src/logic.js';
import { drawShareCard, renderShareCard } from '../src/ui/shareCard.js';

/** A 2D context that records what is drawn, with the fill colour current at each call. */
function fakeCtx() {
  const log = [];
  const ctx = {
    log,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: (...a) => log.push({ op: 'fillRect', a, fill: ctx.fillStyle }),
    strokeRect: (...a) => log.push({ op: 'strokeRect', a }),
    beginPath: () => {},
    roundRect: (...a) => log.push({ op: 'roundRect', a }),
    fill: () => log.push({ op: 'fill', fill: ctx.fillStyle }),
    stroke: () => log.push({ op: 'stroke', stroke: ctx.strokeStyle }),
    fillText: (text, x, y, maxWidth) => log.push({ op: 'fillText', text, x, y, maxWidth, font: ctx.font, fill: ctx.fillStyle, align: ctx.textAlign }),
    drawImage: (img, ...a) => log.push({ op: 'drawImage', img, a }),
  };
  return ctx;
}

const IMAGES = Object.fromEntries(['poop', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon', 'pipe'].map((k) => [k, { key: k }]));
const DATA = {
  headline: 'GAME OVER',
  won: false,
  tan: '#ead0a9',
  score: 'SCORE  146  ·  LV 4',
  counts: { fiber: 12, probiotic: 4, postbiotic: 3, bacteria: 7, bean: 6, mystery: 5 },
  pipes: 112,
  footer: 'Play: sielerjm.github.io/flappy-poop',
};

test('the card draws GAME OVER, score, the six counts, pipes and the footer, in that order', () => {
  const ctx = fakeCtx();
  const L = shareCardLayout(T);
  drawShareCard(ctx, L, DATA, IMAGES);
  const texts = ctx.log.filter((e) => e.op === 'fillText');
  assert.deepEqual(
    texts.map((e) => e.text),
    ['GAME OVER', 'SCORE  146  ·  LV 4', '×12', '×4', '×3', '×7', '×6', '×5', '×112', 'Play: sielerjm.github.io/flappy-poop'],
  );
  assert.equal(texts[0].fill, '#f8a0c8');
  assert.match(texts[0].font, new RegExp(`${T.shareCard.headlinePx}px`));
  for (const e of texts) assert.ok(e.maxWidth > 0 && e.maxWidth <= L.innerWidth, `"${e.text}" capped at ${e.maxWidth}`);
  assert.equal(ctx.log[0].op, 'fillRect');
  assert.equal(ctx.log[0].fill, '#1a0b14', 'dark card background first');
});

test('the happy poop sits in a tan frame; icons and the pipe cap are drawn', () => {
  const ctx = fakeCtx();
  const L = shareCardLayout(T);
  drawShareCard(ctx, L, DATA, IMAGES);
  const draws = ctx.log.filter((e) => e.op === 'drawImage');
  assert.deepEqual(draws.map((d) => d.img.key), ['poop', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon', 'pipe']);
  const poop = draws[0].a;
  const box = L.poopBox;
  assert.ok(poop[0] >= box.x - box.width / 2 && poop[0] + poop[2] <= box.x + box.width / 2, 'poop inside the frame (x)');
  assert.ok(poop[1] >= box.y - box.height / 2 && poop[1] + poop[3] <= box.y + box.height / 2, 'poop inside the frame (y)');
  const tanFill = ctx.log.findIndex((e) => e.op === 'fill' && e.fill === '#ead0a9');
  assert.ok(tanFill >= 0 && tanFill < ctx.log.indexOf(draws[0]), 'the tan frame is filled before the poop is drawn on it');
  assert.deepEqual(draws.at(-1).a.slice(0, 4), [0, 0, 128, 160], 'the pipe icon is the cap slice of pipe.png');
});

test('a win draws the gold win line at the smaller size; a missing image is skipped', () => {
  const ctx = fakeCtx();
  const imgs = { ...IMAGES };
  delete imgs.poop;
  drawShareCard(ctx, shareCardLayout(T), { ...DATA, headline: 'YOU MADE IT OUT!', won: true }, imgs);
  const head = ctx.log.find((e) => e.op === 'fillText');
  assert.equal(head.text, 'YOU MADE IT OUT!');
  assert.equal(head.fill, '#ffd700');
  assert.match(head.font, new RegExp(`${T.shareCard.winHeadlinePx}px`));
  assert.ok(!ctx.log.some((e) => e.op === 'drawImage' && e.img === undefined));
});

test('renderShareCard resolves the PNG blob, or null when it cannot draw or encode', async () => {
  const blob = { type: 'image/png' };
  const canvasWith = (over) => ({ getContext: () => fakeCtx(), toBlob: (cb, type) => cb(type === 'image/png' ? blob : null), ...over });
  const doc = (canvas) => ({ createElement: () => canvas });
  const args = { layout: shareCardLayout(T), data: DATA, images: IMAGES };
  const made = canvasWith({});
  assert.equal(await renderShareCard({ ...args, doc: doc(made) }), blob);
  assert.deepEqual([made.width, made.height], [1080, 1350]);
  assert.equal(await renderShareCard({ ...args, doc: doc(canvasWith({ toBlob: undefined })) }), null);
  assert.equal(await renderShareCard({ ...args, doc: doc(canvasWith({ getContext: () => null })) }), null);
  assert.equal(await renderShareCard({ ...args, doc: doc(canvasWith({ toBlob: () => { throw new Error('tainted'); } })) }), null);
  assert.equal(await renderShareCard({ ...args, doc: { createElement() { throw new Error('no DOM'); } } }), null);
});
