// Play feeds the run summary (plan 30): each flap is counted by what stood behind it; a forged
// "event" (a plain object, a copy) is no press; the game's own flaps are marked as its own; the
// first error switches the summary off without touching the run; only single-player and Daily
// runs keep one; and every input listener that can flap carries the press stamp. The flaps behind
// real browser input are checked in the smoke (tools/headless_check.mjs, run-stats), which drives
// Chrome's input layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playScene, fakeStorage } from './support/scenes.js';
import { createRunStats } from '../src/runStats.js';
import { createRunQueue } from '../src/leaderboard.js';

const { pressFacts } = await import('../src/scenes/Play.js');
const PLAY = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');

test('pressFacts: only a real browser event can be a person\'s press; a plain object or a dressed-up copy is none; a pad press counts', () => {
  const now = performance.now();
  assert.deepEqual(pressFacts({ isTrusted: true, timeStamp: now }, 'key', now), { trusted: false, recent: false, ts: -1 }, 'a plain object');
  const dressed = Object.create(Event.prototype);
  Object.defineProperty(dressed, 'isTrusted', { value: true });
  Object.defineProperty(dressed, 'timeStamp', { value: now });
  assert.deepEqual(pressFacts(dressed, 'key', now), { trusted: false, recent: false, ts: -1 }, 'an object dressed as an Event');
  const real = new Event('keydown');
  const f = pressFacts(real, 'key', performance.now());
  assert.equal(f.trusted, false, 'a script-made event: the browser marks it untrusted');
  assert.equal(f.recent, true);
  assert.ok(f.ts >= 0);
  assert.equal(pressFacts(real, 'key', f.ts + 10_000).recent, false, 'an old event is not recent');
  assert.deepEqual(pressFacts(null, 'pad', now), { trusted: true, recent: true, ts: -1 });
  assert.deepEqual(pressFacts(null, 'touch', now), { trusted: false, recent: false, ts: -1 });
});

/** A playing scene with a summary begun and a bottom pipe ahead whose lip sits 200 px under the poop. */
function flying(over = {}) {
  const stats = createRunStats();
  stats.begin({ runId: 'R'.repeat(22), session: 'sessionAB12', version: '0.20.1', now: performance.now(), wall: Date.now() });
  const pipe = { active: true, originY: 0, x: 500, y: 800 };
  const scene = playScene({
    state: 'playing',
    time: { now: 1000 },
    flapLockedUntil: 0,
    effects: { powerActive: () => false },
    poop: { x: 200, y: 600, setVelocityY() {} },
    pipes: { getChildren: () => [pipe, { active: true, originY: 1, x: 500, y: 300 }, { active: true, originY: 0, x: 900, y: 100 }] },
    runStats: stats,
    runStatsOn: true,
    flapInfo: { now: 0, applied: false, internal: false, pressed: false, trusted: false, fresh: false, lip: null },
    ...over,
  });
  return scene;
}

test('doFlap counts every flap by what stood behind it: no press, the game\'s own, a lockout; the lip is the next pair\'s', () => {
  const scene = flying();
  assert.equal(scene.doFlap(), true, 'a flap with no press behind it (a direct call) still flies');
  assert.equal(scene.doFlap({ internal: true }), true);
  scene.flapLockedUntil = 5000;
  assert.equal(scene.doFlap(), false, 'locked out: no flap, but counted');
  scene.state = 'ready';
  assert.equal(scene.doFlap(), false);
  const d = scene.runStats.end({ now: performance.now(), wall: Date.now(), score: 0, level: 1 }).data;
  assert.deepEqual([d.flaps, d.flaps_physics, d.flaps_internal, d.flaps_pressed, d.flaps_trusted, d.flaps_fresh], [3, 2, 1, 0, 0, 0]);
  assert.equal(d.lip_mean, 200, 'the nearest bottom pipe ahead: its top is the lower lip');
});

test('the first error switches the summary off for the rest of the run, and the run never notices', () => {
  const scene = flying({ runStats: { flap() { throw new Error('boom'); }, frame() { throw new Error('never reached'); } } });
  assert.equal(scene.doFlap(), true);
  assert.equal(scene.runStatsOn, false);
  scene.statCall('frame', 16, 3);
  assert.equal(scene.doFlap(), true);
});

test('queueRunSummary queues the row under the player id once; nothing when no summary was kept', () => {
  const storage = fakeStorage();
  const scene = flying({ runQueue: createRunQueue(storage), save: { id: 'P'.repeat(22) }, score: 9, level: 2, won: false });
  scene.queueRunSummary();
  scene.queueRunSummary();
  const q = scene.runQueue.load();
  assert.equal(q.length, 1);
  assert.equal(q[0].playerId, 'P'.repeat(22));
  assert.deepEqual([q[0].row.score, q[0].row.level, q[0].row.mode], [9, 2, 'single']);
  const off = flying({ runStatsOn: false, runQueue: createRunQueue(fakeStorage()), save: { id: 'P'.repeat(22) } });
  off.queueRunSummary();
  assert.deepEqual(off.runQueue.load(), []);
});

test('start() keeps a summary for single-player and Daily runs and a split-screen race\'s half (runSummaryMode, tests/raceRun.test.js), off the toilet in a race', () => {
  const body = PLAY.slice(PLAY.indexOf('  start() {'), PLAY.indexOf('  runSession() {'));
  assert.match(body, /const summary = this\.runSummaryMode\(daily\);\s+this\.runStatsOn = summary !== null;/);
  assert.match(body, /if \(this\.runStatsOn\) this\.statCall\('begin', \{/);
  assert.match(body, /mode: summary,/);
  assert.match(body, /toilet: summary === 'race' \? false : this\.toilet,/);
  const endRun = PLAY.slice(PLAY.indexOf('  endRun({ report = true } = {}) {'), PLAY.indexOf('  endRun({ report = true } = {}) {') + 4000);
  const at = endRun.indexOf('this.queueRunSummary();');
  assert.ok(at > endRun.indexOf('if (this.runIsEducation) {') && at > endRun.indexOf('if (this.runIsTest) return;') && at < endRun.indexOf('if (this.runIsDaily) {'), 'queued after the match, test and education returns, before the Daily and single-player records');
});

test('every doFlap( call in src/ is the tap\'s flap or marked as the game\'s own', () => {
  const calls = [];
  for (const file of ['src/scenes/Play.js', 'src/scenes/Versus.js', 'src/scenes/Over.js']) {
    let src = '';
    try {
      src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/doFlap\(([^)]*)\)/g)) calls.push({ file, arg: m[1], line: src.slice(0, m.index).split('\n').length, text: src.split('\n')[src.slice(0, m.index).split('\n').length - 1].trim() });
  }
  const outside = calls.filter((c) => !c.text.startsWith('doFlap({ internal = false } = {}) {') && !c.text.startsWith('*'));
  for (const c of outside) {
    const ok = c.arg === '{ internal: true }' || c.text === 'if (this.doFlap()) this.tryStartBoost();';
    assert.ok(ok, `${c.file}:${c.line} ${c.text}`);
  }
  assert.equal(outside.filter((c) => c.arg === '').length, 1, 'one flap from a press: the tap\'s');
  assert.equal(outside.filter((c) => c.arg === '{ internal: true }').length, 2, 'the launch flap and the race\'s GO flap');
});

test('every input listener that can flap carries the press stamp', () => {
  const create = PLAY.slice(PLAY.indexOf("this.input.on('pointerdown'"), PLAY.indexOf('this.onHidden = () =>'));
  const method = (name) => PLAY.slice(PLAY.indexOf(`  ${name}(`), PLAY.indexOf('\n  }\n', PLAY.indexOf(`  ${name}(`)));
  // The listeners hand each press to a method (plan 39, 2.8: the press counts in the half it belongs to); the methods set the stamp.
  assert.match(create, /this\.input\.on\('pointerdown', \(pointer\) => this\.onPointerDown\(pointer\)\);/);
  assert.match(method('onPointerDown'), /withInput\(pointer\.event, kind,/);
  assert.match(create, /keys\?\.on\('keydown-SPACE', \(event\) => this\.onFlapKey\(event\)\);/);
  assert.match(create, /keys\?\.on\('keydown-UP', \(event\) => this\.onFlapKey\(event\)\);/);
  assert.match(method('onFlapKey'), /withInput\(event, 'key',/);
  // 5.2b (AUD-149, AUD-144): an online race drops a held key's auto-repeat before the stamp (onlineRepeat, raceRun.test.js).
  assert.match(create, /keys\?\.on\('keydown', \(event\) => this\.onlineRepeat\(event\) \|\| withInput\(event, 'key', \(\) => this\.onVersusKey\(event\?\.code\)\)\)/);
  assert.match(create, /keys\?\.on\('keydown-P', \(event\) => this\.onlineRepeat\(event\) \|\| this\.handleChrome\('pause'\)\);/);
  assert.match(create, /keys\?\.on\('keydown-ESC', \(event\) => this\.onlineRepeat\(event\) \|\| this\.handleChrome\('esc'\)\);/);
  assert.match(create, /bindPad\(this, \(action, padIndex\) => this\.onPadPress\(action, padIndex\), T\)/);
  assert.match(method('onPadPress'), /withInput\(null, 'pad', \(\) => this\.onPadAction\(action, padIndex\)\)/);
  assert.doesNotMatch(PLAY, /export\s+(const|let)\s+STAMP|export\s+function\s+withInput/, 'the stamp and its setter stay inside Play.js');
});
