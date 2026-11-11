import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfMode, createFrameStats, perfLines, PERF_TAGS } from '../src/logic.js';
import { TUNING as T } from '../src/config.js';

test('perfMode: ?perf is the meter, ?perf=var adds the variable step, anything else is off', () => {
  assert.equal(perfMode(''), null);
  assert.equal(perfMode(undefined), null);
  assert.equal(perfMode('?lang=en'), null);
  assert.equal(perfMode('?perf'), 'meter');
  assert.equal(perfMode('?perf=1'), 'meter');
  assert.equal(perfMode('?x=1&perf=var'), 'var');
});

test('frame stats: the period is the median raw delta, not the mean a hitch would drag up', () => {
  const s = createFrameStats({ periodFrames: 5, longFactor: 1.5 });
  for (const ms of [8.3, 8.4, 8.3, 50, 8.3]) s.record(ms, 1, 1, 0, false);
  assert.ok(Math.abs(s.refreshPeriod() - 8.3) < 0.01);
  assert.equal(s.summary().frames, 0, 'frames outside a run are not counted');
});

test('frame stats: a long frame in a run is blamed on the previous frame\'s tags', () => {
  const s = createFrameStats({ periodFrames: 4, longFactor: 1.5 });
  for (let i = 0; i < 4; i += 1) s.record(16.7, 2, 1, 0, true);
  s.refreshPeriod();
  s.record(16.7, 6, 1, PERF_TAGS.pipe | PERF_TAGS.daily, true); // the pipe-pass frame overruns...
  s.record(33.4, 2, 2, 0, true); // ...so the next frame starts late, and physics catches up twice
  s.record(16.7, 2, 0, PERF_TAGS.spawn, true);
  const sum = s.summary();
  assert.equal(sum.frames, 7);
  assert.equal(sum.long, 1);
  assert.deepEqual(sum.longTags, { pipe: 1, spawn: 0, pickup: 0, daily: 1 });
  assert.equal(Math.round(sum.worstMs), 33);
  assert.ok(Math.abs(sum.stepsOffPct - (100 * 2) / 7) < 1e-9);
  assert.equal(sum.cpuMaxMs, 6);
  s.resetRun();
  assert.equal(s.summary().frames, 0);
  assert.equal(s.summary().long, 0);
});

test('frame stats: ten thousand frames run through the fixed buffers', () => {
  const s = createFrameStats(T.perf);
  for (let i = 0; i < 10_000; i += 1) s.record(16.7, 1, 1, 0, true);
  s.refreshPeriod();
  assert.equal(s.summary().frames, 10_000);
});

test('perfLines names the step mode and every tag', () => {
  const s = createFrameStats(T.perf);
  const text = perfLines(s.summary(), 'var');
  assert.match(text, /^var step/);
  for (const k of Object.keys(PERF_TAGS)) assert.match(text, new RegExp(`\\b${k} 0\\b`));
  assert.match(perfLines(s.summary(), 'meter'), /^fixed step/);
  assert.equal(text.split('\n').length, 2);
});

test('the meter knobs are sane', () => {
  assert.ok(T.perf.periodFrames >= 30);
  assert.ok(T.perf.longFactor > 1);
  assert.ok(T.perf.refreshMs >= 250, 'redrawing faster would perturb what it measures');
});
