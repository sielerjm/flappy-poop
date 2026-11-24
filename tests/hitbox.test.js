import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaledCircleBody } from '../src/logic.js';

test('scaledCircleBody maps 17 logical px on a 96@0.5 sprite to source radius 34', () => {
  const body = scaledCircleBody(96, 0.5, 17);
  assert.equal(body.radius, 34);
  assert.equal(body.offset, 14);
  assert.equal(body.radius * 0.5, 17);
});

test('scaledCircleBody maps 34 logical px on a 384@0.25 sprite to source radius 136', () => {
  const body = scaledCircleBody(384, 0.25, 34);
  assert.equal(body.radius, 136);
  assert.equal(body.offset, 56);
  assert.equal(body.radius * 0.25, 34);
});

test('item logical 32 on 384@0.25 is source radius 128, centred', () => {
  const body = scaledCircleBody(384, 0.25, 32);
  assert.equal(body.radius, 128);
  assert.equal(body.offset, 64);
  assert.equal(body.radius * 0.25, 32);
});

// Plan 35, 2.1: the art went from 384 px frames at 0.25 to 192 px at 0.5. The hitboxes are set in
// logical px, so on screen they must not move: the same radius and the same offset from the sprite's edge.
test('the 2x art (192@0.5) keeps the 4x art’s hitboxes on screen', async () => {
  const { TUNING: T } = await import('../src/config.js');
  for (const r of [T.poopRadius, T.items.itemRadius]) {
    const was = scaledCircleBody(384, 0.25, r);
    const now = scaledCircleBody(192, T.spriteDisplayScale, r);
    assert.equal(now.radius * T.spriteDisplayScale, was.radius * 0.25, `radius ${r}`);
    assert.equal(now.offset * T.spriteDisplayScale, was.offset * 0.25, `offset for radius ${r}`);
  }
});
