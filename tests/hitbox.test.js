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
