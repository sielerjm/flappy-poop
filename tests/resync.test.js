// The resync (plan 35, 1.4): queued posts used to wait for the next boot or run. Now the browser's
// `online`, and the page shown again after a long hide, send them again (Play.syncLeaderboard), one
// send at a time (createResync in src/logic.js), outside a half of a match. Play's create wires it;
// the smoke's `resync` section fires the real events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResync } from '../src/logic.js';
import { LEADERBOARD } from '../src/config.js';
import { playScene } from './support/scenes.js';

const PLAY = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
const GAP = LEADERBOARD.resyncHiddenMs;

/** A send each test settles by hand: `calls` holds one { resolve, reject } per send started. */
function manualSend() {
  const calls = [];
  const send = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
  return { send, calls };
}

test('the hide that earns a resync is 30 s or longer', () => {
  assert.equal(GAP, 30000);
});

test('createResync: two triggers in a row send once; once that send settles, the next trigger sends again', async () => {
  const { send, calls } = manualSend();
  const r = createResync(send);
  const a = r.online();
  const b = r.online();
  assert.equal(calls.length, 1, 'the second trigger joins the send in flight');
  assert.equal(a, b, 'and gets the same promise');
  calls[0].resolve();
  assert.equal(await a, true);
  const c = r.online();
  assert.equal(calls.length, 2, 'settled: a new trigger sends again');
  calls[1].resolve();
  assert.equal(await c, true);
});

test('createResync: a send that fails (rejects, or throws at once) frees the guard, never rejects, and the next trigger retries', async () => {
  let n = 0;
  const r = createResync(() => {
    n += 1;
    if (n === 1) return Promise.reject(new Error('offline'));
    if (n === 2) throw new Error('the sync threw');
    return Promise.resolve();
  });
  assert.equal(await r.online(), false, 'a send that rejects');
  assert.equal(await r.online(), false, 'a send that throws');
  assert.equal(await r.online(), true, 'the retry');
  assert.equal(n, 3);
});

test('createResync: shown again after the gap sends; a shorter hide, or a show with no hide, sends nothing; online and a show together send once', async () => {
  let clock = 1_000_000;
  let n = 0;
  const r = createResync(() => ((n += 1), Promise.resolve()), { now: () => clock });
  assert.equal(r.shown(), null, 'never hidden: nothing');
  r.hidden();
  clock += GAP - 1;
  assert.equal(r.shown(), null, 'hidden a millisecond short: nothing');
  r.hidden();
  clock += 5000;
  r.hidden(); // a second hidden event keeps the first one's time
  clock += GAP - 5000;
  const p = r.shown();
  assert.ok(p, 'hidden for the gap: a send');
  assert.equal(await p, true);
  assert.equal(n, 1);
  assert.equal(r.shown(), null, 'a second show has no hide behind it');
  r.hidden();
  clock += 10 * GAP;
  const both = [r.online(), r.shown()]; // a phone waking: back online and shown in the same moment
  assert.equal(both[0], both[1], 'one send for both');
  await both[0];
  assert.equal(n, 2);
});

test('Play: online and a show after a long hide sync once; nothing in a half of a match (resyncOnline, resyncVisibility)', async () => {
  let clock = 0;
  let n = 0;
  const s = playScene({ match: null, syncLeaderboard: () => ((n += 1), Promise.resolve()) });
  s.resync = createResync(() => s.syncLeaderboard(), { now: () => clock });
  s.resyncOnline();
  s.resyncOnline();
  assert.equal(n, 1, 'two online events in a row: one sync');
  await s.resync.online(); // joins the send in flight: settles with it
  s.resyncVisibility(true);
  clock += GAP;
  s.resyncVisibility(false);
  assert.equal(n, 2, 'shown after a 30 s hide: a sync');
  await s.resync.online();
  s.match = { mode: 'versus' };
  s.resyncOnline();
  s.resyncVisibility(true);
  clock += 2 * GAP;
  s.resyncVisibility(false);
  assert.equal(n, 2, 'a half of a match syncs nothing');
});

test("Play's create wires the resync: one guard per scene object, `online` added and taken off with the scene, the visibility handler passes hide and show", () => {
  const start = PLAY.indexOf('this.resync ??=');
  assert.ok(start > 0 && start < PLAY.indexOf('this.onHidden = () =>'), 'the guard is made before the listeners that use it');
  const end = PLAY.indexOf("this.events.once('shutdown'", start);
  const create = PLAY.slice(start, end);
  const shutdown = PLAY.slice(end, end + 1200);
  assert.match(create, /this\.resync \?\?= createResync\(\(\) => this\.syncLeaderboard\(\)\)/, 'kept across restarts: a send in flight and the hide time survive Play.restart');
  assert.match(create, /this\.resyncVisibility\(hidden\)/);
  assert.match(create, /window\.addEventListener\('online', this\.onOnline\)/);
  assert.match(shutdown, /window\.removeEventListener\('online', this\.onOnline\)/);
});
