// The online race's pure parts (plan 39, 1.7a): the start plan from the room, the server-time
// countdown, this device's phase, and the feed between the one local Play and the remote seat
// (pos keyframes plus flaps, crashes, the run's end; the other side rebuilt as a slot for the
// ghost, the rival marker and raceOutcome; the link's dot). Two fake peers on one server clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, TUNING as T } from '../src/config.js';
import { createInbox, createNetSim, createSender, parseMessage } from '../src/online.js';
import { raceStartPlan, countdownStep, localPhase, linkQuality, createRaceFeed, ONLINE_HOST_KEY } from '../src/onlineRace.js';
import { createMatch, matchHostKey, ghostPlacement } from '../src/versus.js';

const room = (extra = {}) => ({ phase: 'playing', role: 'host', code: '482913', hostName: 'Plop', guestName: 'Jolly', seed: 12345, startMs: 10000, round: 1, ...extra });

test('raceStartPlan: the room\'s seed and GO, me first (player 1), the smaller field width (item 14), the host key', () => {
  const p = raceStartPlan(room(), { mine: 1280, theirs: 720 });
  assert.equal(p.seed, 12345);
  assert.equal(p.startAt, 10000);
  assert.equal(p.seat, 'host');
  assert.deepEqual(p.names, ['Plop', 'Jolly']);
  assert.equal(p.fieldW, 720);
  const g = raceStartPlan(room({ role: 'guest' }), { mine: 720, theirs: 1280 });
  assert.equal(g.seat, 'guest');
  assert.deepEqual(g.names, ['Jolly', 'Plop']);
  assert.equal(g.fieldW, 720, 'both sides agree');
  assert.equal(raceStartPlan(room(), { mine: 1280, theirs: null }).fieldW, 1280, 'no word from the peer: my own');
  for (const bad of [null, room({ phase: 'ready' }), room({ seed: null }), room({ startMs: null })]) assert.equal(raceStartPlan(bad, { mine: 720, theirs: 720 }), null);
  const m = createMatch(p.seed, { names: p.names });
  m.hostKey = ONLINE_HOST_KEY;
  assert.equal(matchHostKey(m), 'OnlineRace');
});

test('countdownStep: 3, 2, 1 one versus.countdownMs apart ending at GO (server time), then go; nothing before the 3', () => {
  const ms = T.versus.countdownMs;
  const go = 10000;
  assert.equal(countdownStep(go - 3 * ms - 1, go), null);
  assert.equal(countdownStep(go - 3 * ms, go), 0);
  assert.equal(countdownStep(go - 2 * ms, go), 1);
  assert.equal(countdownStep(go - 1, go), 2);
  assert.equal(countdownStep(go, go), 3);
  assert.equal(countdownStep(go + 5000, go), 3);
  assert.equal(countdownStep(go, null), null);
});

test('localPhase: run, respawn, break and ended from the half', () => {
  assert.equal(localPhase({ state: 'playing' }), 'run');
  assert.equal(localPhase({ state: 'respawn' }), 'respawn');
  assert.equal(localPhase({ state: 'paused', levelBreak: true }), 'break');
  assert.equal(localPhase({ state: 'paused', levelBreak: false }), 'run', 'a pause mid-run is still the run');
  assert.equal(localPhase({ state: 'over', ended: true }), 'ended');
  assert.equal(localPhase({ state: 'ready' }), null);
});

test('linkQuality: good while messages come, slow past the slow line, lost past the lost line; good before the first', () => {
  const q = T.online.link;
  assert.equal(linkQuality(null, 5000), 'good');
  assert.equal(linkQuality(1000, 1000 + q.slowMs - 1), 'good');
  assert.equal(linkQuality(1000, 1000 + q.slowMs), 'slow');
  assert.equal(linkQuality(1000, 1000 + q.lostMs), 'lost');
});

/** Two peers on one server clock, joined by a simulated link each way (lossless unless asked). */
function pair({ profile = { latencyMs: 40, jitterMs: 0, loss: 0, reorder: 0 } } = {}) {
  let clock = 0;
  const now = () => clock;
  let r = 7;
  const rng = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const link = () => {
    const sim = createNetSim(profile, rng);
    let q = [];
    return {
      send(item, at) {
        const d = sim.delay();
        if (d !== null) q.push({ item, due: at + d });
      },
      take(at) {
        const out = q.filter((x) => x.due <= at).sort((a, b) => a.due - b.due);
        q = q.filter((x) => x.due > at);
        return out.map((x) => x.item);
      },
    };
  };
  const links = [link(), link()];
  const inbox = [[], []];
  const sent = [[], []];
  const senders = [0, 1].map((i) => createSender({ sid: `s${i}`, now }));
  const inboxes = [createInbox(), createInbox()];
  const feeds = [0, 1].map((i) =>
    createRaceFeed({
      now,
      send: (event, fields) => {
        // As onlineNet's send: stamped by the session's sender, only valid messages go.
        const m = senders[i](event, fields);
        assert.ok(m && parseMessage(event, m.payload), `${event} is a valid message`);
        sent[i].push(event);
        links[i].send({ kind: 'peer', event, msg: m.payload, at: m.payload.t }, now());
        return true;
      },
    }),
  );
  const advance = (ms) => {
    clock += ms;
    for (const i of [0, 1]) for (const item of links[i].take(clock)) inbox[1 - i].push(item);
    for (const i of [0, 1]) {
      for (const item of inbox[i]) if (inboxes[i].take(item.event, item.msg)) feeds[i].receive(item); // onlineNet's inbox
      inbox[i].length = 0;
    }
  };
  return { feeds, sent, advance, now };
}

const half = (extra = {}) => ({
  state: 'playing', levelBreak: false, ended: false, distance: 0, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1,
  level: 1, pipesPassed: 0, score: 0, deaths: 0, levelWins: 0, finalFirst: false, flaps: 0, ...extra,
});

test('the feed: a pos at once, then keyframes every online.keyframeMs mid-run; flaps on top; nothing during the countdown', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ state: 'ready' }));
  assert.deepEqual(sent[0], [], 'no run yet: nothing sent');
  const h = half();
  feeds[0].tick(h);
  assert.deepEqual(sent[0], ['pos']);
  advance(T.online.keyframeMs - 10);
  feeds[0].tick({ ...h, distance: 150 });
  assert.deepEqual(sent[0], ['pos']);
  advance(20);
  feeds[0].tick({ ...h, distance: 160 });
  assert.deepEqual(sent[0], ['pos', 'pos']);
  feeds[0].tick({ ...h, distance: 161, flaps: 1, vy: T.flapVelocity });
  assert.deepEqual(sent[0], ['pos', 'pos', 'flap']);
  feeds[0].tick({ ...h, distance: 162, flaps: 1 });
  assert.equal(sent[0].length, 3, 'one flap, one message');
});

test('the remote slot: the ghost of the other peer at the right distance, its score and level, extrapolated between keyframes', () => {
  const { feeds, advance } = pair();
  assert.equal(feeds[1].slot(), null, 'nothing heard yet');
  feeds[0].tick(half({ distance: 1000, score: 3, level: 2, pipesPassed: 12 }));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.score, 3);
  assert.equal(s.level, 2);
  assert.equal(s.pipesPassed, 12);
  assert.ok(Math.abs(s.distance - (1000 + 300 * 0.04)) < 1, 'latency is extrapolated away: distance is where the sender is now');
  advance(100);
  assert.ok(Math.abs(feeds[1].slot().distance - (1000 + 300 * 0.14)) < 1, 'keeps moving at its speed');
  const g = ghostPlacement({ distance: 1000 + 300 * 0.14 }, feeds[1].slot(), 200, T);
  assert.ok(Math.abs(g.x - 200) < 1, 'the ghost sits beside me at the same distance');
});

test('a crash over the wire: the other side sees deaths and the respawn at once, and a late crash still counts', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ distance: 500 }));
  advance(40);
  feeds[0].tick(half({ state: 'respawn', distance: 510, deaths: 1, score: 2 }));
  assert.ok(sent[0].includes('crash'));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.deaths, 1);
  assert.equal(s.respawning, true);
  feeds[0].tick(half({ state: 'respawn', distance: 510, deaths: 1, score: 2 }));
  assert.equal(sent[0].filter((e) => e === 'crash').length, 1, 'one crash per death');
});

test('the run\'s end: done with the final numbers; the remote slot reads ended', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ distance: 900 }));
  feeds[0].tick(half({ state: 'over', ended: true, distance: 900, score: 40, deaths: 2, levelWins: 3, finalFirst: true }));
  assert.ok(sent[0].includes('done'));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.ended, true);
  assert.equal(s.score, 40);
  assert.equal(s.finalFirst, true);
  feeds[0].tick(half({ state: 'over', ended: true, distance: 900, score: 40 }));
  assert.equal(sent[0].filter((e) => e === 'done').length, 1);
});

test('the link dot follows the newest message from the peer; a peer\'s ready or go never moves the ghost', () => {
  const { feeds, advance } = pair();
  feeds[0].tick(half());
  advance(40);
  assert.equal(feeds[1].link(), 'good');
  advance(T.online.link.slowMs + 10);
  assert.equal(feeds[1].link(), 'slow');
  advance(T.online.link.lostMs);
  assert.equal(feeds[1].link(), 'lost');
  assert.equal(feeds[1].receive({ kind: 'peer', event: 'ready', msg: { level: 2, ready: true, seq: 99, t: 1, sid: 's0' } }), false);
});

test('on a bad link (loss and reorder) the ghost still ends where the sender is, within the snap', () => {
  const { feeds, advance } = pair({ profile: { latencyMs: 120, jitterMs: 60, loss: 0.1, reorder: 0.1 } });
  let d = 0;
  for (let i = 0; i < 120; i += 1) {
    d += 300 * 0.05;
    feeds[0].tick(half({ distance: d, flaps: Math.floor(i / 7), vy: i % 7 === 0 ? T.flapVelocity : 0 }));
    advance(50);
  }
  advance(400);
  assert.ok(Math.abs(feeds[1].slot().distance - (d + 300 * 0.4)) < T.online.ghost.snapPx);
  assert.ok(FIELD.minWidth > 0);
});
