import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaledCircleBody } from '../src/logic.js';

test('scaledCircleBody maps 17 logical px on a 96@0.5 sprite to source radius 34', () => {
  const body = scaledCircleBody(96, 0.5, 17);
  assert.equal(body.radius, 34);
  assert.equal(body.offset, 14);
  assert.equal(body.radius * 0.5, 17);
});

test('scaledCircleBody maps 17 logical px on a 192@0.25 sprite to source radius 68', () => {
  const body = scaledCircleBody(192, 0.25, 17);
  assert.equal(body.radius, 68);
  assert.equal(body.offset, 28);
  assert.equal(body.radius * 0.25, 17);
});

test('item logical 16 on 192@0.25 is source radius 64, centred', () => {
  const body = scaledCircleBody(192, 0.25, 16);
  assert.equal(body.radius, 64);
  assert.equal(body.offset, 32);
  assert.equal(body.radius * 0.25, 16);
});
