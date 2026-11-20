// The online race scene's wiring (plan 39, 1.7b): src/scenes/OnlineRace.js run in Node on a stand-in
// Play half and a fake transport (tests/support/scenes.js: the scene is Object.create(prototype) with
// sinks for what it draws). What is checked: the crossed line goes to the referee and the host's
// verdict comes back as awardLevelFirst; the level break's beat, ready taps and the shared count to
// the server GO (and its take-back); the run's done held for the final line's verdict; the end of the
// race with one raceOutcome and the room marked finished; the rematch into the next round. Play's
// side (which line it crossed, the late award) is checked at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absorb, playScene } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { raceOutcome } from '../src/tournament.js';

const { OnlineRace } = await import('../src/scenes/OnlineRace.js');

const R = T.online.race;
const COUNT_MS = 3 * T.versus.countdownMs;
const GO = 10_000; // the race's own GO (server ms)

function fakeNet() {
  const sent = [];
  const q = [];
  const clock = { now: GO };
  return {
    sent,
    clock,
    push: (...items) => q.push(...items),
    serverNow: () => clock.now,
    send(event, fields) {
      sent.push({ event, ...fields });
      return true;
    },
    take: () => q.splice(0),
    pump() {},
    peer: () => ({ name: 'Jolly', width: 720 }),
    close() {},
  };
}

function fakeLobby(room) {
  const calls = [];
  return {
    calls,
    state: { room },
    roomItem: (item) => calls.push(['roomItem', item.action.room.status]),
    finish: () => calls.push(['finish']),
    rematch: () => calls.push(['rematch']),
    leave: async () => calls.push(['leave']),
  };
}

/** The one local Play as the scene reads and drives it; `calls` records what the scene asked of it. */
function fakeHalf() {
  const calls = [];
  const h = {
    calls,
    level: 1,
    state: 'playing',
    levelBreak: false,
    shopOpen: false,
    ended: false,
    distance: 0,
    score: 0,
    refreshLevelBanner: () => calls.push(['banner']),
    setLevelHintVisible: (on) => calls.push(['hint', on]),
    refreshShopButton: () => calls.push(['shop']),
    beginLevel() {
      calls.push(['beginLevel', h.level]);
      h.levelBreak = false;
      h.state = 'playing';
    },
    awardLevelFirst: (o) => calls.push(['award', o]),
    chromeArgs: () => ({ overlay: null }),
    pausePlay: () => calls.push(['pausePlay']),
    resumePlay: () => calls.push(['resumePlay']),
    raceSnapshot: () => ({
      state: h.state, levelBreak: h.levelBreak, ended: h.ended, won: h.ended, flaps: 0, distance: h.distance, speed: 0, y: 640, vy: 0, angle: 0,
      frame: 'poop', alpha: 1, level: h.level, pipesPassed: 0, score: h.score, deaths: 0, levelWins: 0, finalFirst: false,
    }),
  };
  return h;
}

/** A race scene past its start GO, as create() leaves it, with sinks for what it draws. */
function raceScene({ seat = 'host', round = 1 } = {}) {
  const net = fakeNet();
  const half = fakeHalf();
  const room = { phase: 'playing', role: seat, code: '482913', hostName: 'Plop', guestName: 'Jolly', seed: 5, startMs: GO, round };
  const lobby = fakeLobby(room);
  const timers = [];
  const ops = [];
  const s = Object.create(OnlineRace.prototype);
  Object.assign(s, {
    scene: { get: (k) => (k === 'Play' ? half : null), stop: (k) => ops.push(['stop', k]), restart: (d) => ops.push(['restart', d]) },
    time: { delayedCall: (ms, fn) => timers.push({ ms, fn }) },
    sys: { isActive: () => true },
    tweens: absorb(),
    countText: absorb(),
    fitText: absorb(),
    sound: absorb(),
    cache: { audio: { exists: () => false } },
    hud: { card: absorb(), dot: absorb(), name: absorb(), score: absorb(), word: absorb(), link: null },
    locale: 'en',
  });
  s.initRace({ net, lobby, plan: { seed: 5, startAt: GO, seat, names: seat === 'host' ? ['Plop', 'Jolly'] : ['Jolly', 'Plop'], fieldW: 720, round } });
  s.match.status = 'playing';
  return { s, net, half, timers, ops, lobby, room };
}

let seq = 0;
const peer = (event, fields, t) => ({ kind: 'peer', event, msg: { seq: ++seq, t, sid: 'other', ...fields }, at: t });
const sentOf = (net, event) => net.sent.filter((m) => m.event === event);

/** The local half arrives in its break at `level` and its beat passes. */
function inBreak({ s, half, timers }, level = 2) {
  half.level = level;
  half.levelBreak = true;
  half.state = 'paused';
  s.onLevelReached(half);
  timers.shift().fn();
}

test('claimLevelFinish: the crossed line goes to the referee (the guest claims it over the wire); nobody takes the +25 on the spot', () => {
  const { s, net, half } = raceScene({ seat: 'guest' });
  net.clock.now = GO + 12_000;
  half.distance = 4000;
  assert.equal(s.claimLevelFinish(half, { level: 1, final: false }), false);
  assert.deepEqual(sentOf(net, 'finish'), [{ event: 'finish', level: 1, distance: 4000 }]);
  assert.equal(s.claimLevelFinish(half), false, 'no line named: nothing');
  assert.equal(s.claimLevelFinish({}, { level: 1, final: false }), false, 'not this race\'s half');
  assert.equal(sentOf(net, 'finish').length, 1);
});

test('the level break: the hint waits out levelSyncDelayMs; a tap then marks this side ready over the wire, a second takes it back; not before the beat, not while shopping', () => {
  const { s, net, half, timers } = raceScene();
  half.level = 2;
  half.levelBreak = true;
  half.state = 'paused';
  s.onLevelReached(half);
  assert.deepEqual(half.calls.filter((c) => c[0] === 'hint'), [['hint', false]]);
  s.onLevelTap(half);
  assert.equal(s.isReady(half), false, 'the arrival flap does not count');
  assert.deepEqual(timers.map((x) => x.ms), [T.versus.levelSyncDelayMs]);
  timers[0].fn();
  assert.deepEqual(half.calls.filter((c) => c[0] === 'hint').at(-1), ['hint', true]);
  s.onLevelTap(half);
  assert.equal(s.isReady(half), true);
  s.onLevelTap(half);
  assert.equal(s.isReady(half), false, 'a second tap takes it back');
  assert.deepEqual(sentOf(net, 'ready').map((m) => [m.level, m.ready]), [[2, true], [2, false]]);
  half.shopOpen = true;
  s.onLevelTap(half);
  assert.equal(s.isReady(half), false, 'not while the shop is open');
});

test('the shared count: both ready → levelStage count (no 💰 under it) to the host\'s GO, and the half begins at that server ms', () => {
  const ctx = raceScene();
  const { s, net, half } = ctx;
  net.clock.now = GO + 20_000;
  inBreak(ctx);
  net.push(peer('ready', { level: 2, ready: true }, net.clock.now - 30));
  s.onLevelTap(half);
  s.update();
  const go = sentOf(net, 'go');
  assert.equal(go.length, 1);
  assert.equal(go[0].startAt, net.clock.now + R.countLeadMs + COUNT_MS);
  assert.equal(s.levelStage, 'count');
  assert.equal(half.calls.filter((c) => c[0] === 'hint').at(-1)[1], false, 'the prompt hides under the count');
  net.clock.now = go[0].startAt - 1;
  s.update();
  assert.equal(half.calls.some((c) => c[0] === 'beginLevel'), false);
  net.clock.now = go[0].startAt;
  s.update();
  assert.deepEqual(half.calls.filter((c) => c[0] === 'beginLevel'), [['beginLevel', 2]]);
  assert.equal(s.levelStage, null);
});

test('a take-back during the count: the host\'s own tap calls it off at once; the guest\'s count stops on the host\'s word', () => {
  const ctx = raceScene();
  const { s, net, half } = ctx;
  net.clock.now = GO + 20_000;
  inBreak(ctx);
  net.push(peer('ready', { level: 2, ready: true }, net.clock.now - 30));
  s.onLevelTap(half);
  s.update();
  const { startAt } = sentOf(net, 'go')[0];
  net.clock.now += 500;
  s.onLevelTap(half);
  assert.equal(s.levelStage, null);
  assert.deepEqual(sentOf(net, 'go').at(-1), { event: 'go', level: 2, startAt, cancel: true });
  assert.equal(half.calls.filter((c) => c[0] === 'hint').at(-1)[1], true, 'the prompt is back');
  net.clock.now = startAt + 10;
  s.update();
  assert.equal(half.calls.some((c) => c[0] === 'beginLevel'), false);

  const g = raceScene({ seat: 'guest' });
  g.net.clock.now = GO + 20_000;
  inBreak(g);
  g.s.onLevelTap(g.half);
  const at = g.net.clock.now + 3000;
  g.net.push(peer('go', { level: 2, startAt: at, cancel: false }, g.net.clock.now));
  g.s.update();
  assert.equal(g.s.levelStage, 'count');
  g.net.push(peer('go', { level: 2, startAt: at, cancel: true }, g.net.clock.now + 100));
  g.s.update();
  assert.equal(g.s.levelStage, null);
});

test('the verdict: the winner\'s half takes the level through awardLevelFirst, once; the final line\'s with final; none once its done went out', () => {
  const ctx = raceScene({ seat: 'guest' });
  const { s, net, half } = ctx;
  net.clock.now = GO + 12_000;
  s.claimLevelFinish(half, { level: 1, final: false });
  net.push(peer('first', { level: 1, seat: 'guest' }, net.clock.now + 40), peer('first', { level: 1, seat: 'guest' }, net.clock.now + 41));
  s.update();
  assert.deepEqual(half.calls.filter((c) => c[0] === 'award'), [['award', { final: false }]]);

  half.level = T.levels.lastLevel;
  net.clock.now += 60_000;
  s.claimLevelFinish(half, { level: half.level, final: true });
  half.ended = true;
  half.state = 'dead';
  s.match.slots[0].ended = true;
  s.onRunEnded(1);
  s.update();
  assert.equal(sentOf(net, 'done').length, 0, 'the run\'s end waits for the final line\'s verdict');
  net.push(peer('first', { level: half.level, seat: 'guest' }, net.clock.now + 40));
  s.update();
  assert.deepEqual(half.calls.filter((c) => c[0] === 'award').at(-1), ['award', { final: true }]);
  assert.equal(sentOf(net, 'done').length, 1, 'then done, in the same frame');
  net.push(peer('first', { level: 6, seat: 'guest' }, net.clock.now + 50));
  s.update();
  assert.equal(half.calls.filter((c) => c[0] === 'award').length, 2, 'a verdict after done changes nothing');
});

test('the end: over once both runs are out (this side\'s done sent, the other\'s heard), one raceOutcome; the host marks the room finished, the guest never', () => {
  for (const seat of ['host', 'guest']) {
    const { s, net, half, lobby } = raceScene({ seat });
    net.clock.now = GO + 60_000;
    half.level = T.levels.lastLevel;
    s.claimLevelFinish(half, { level: half.level, final: true });
    half.ended = true;
    half.state = 'dead';
    Object.assign(s.match.slots[0], { ended: true, score: 40, deaths: 1, levelWins: 3, finalFirst: false });
    s.onRunEnded(1);
    const other = seat === 'host' ? 'guest' : 'host';
    net.push(peer('done', { score: 52, deaths: 0, levelWins: 4, finalFirst: true, won: true }, net.clock.now + 10));
    s.update();
    assert.equal(s.match.slots[1].ended, true, `${seat}: the other is out`);
    assert.equal(sentOf(net, 'done').length, 0, `${seat}: this side's final line is not settled yet`);
    assert.equal(s.match.status, 'playing', `${seat}: so the race is not over`);
    if (seat === 'guest') net.push(peer('first', { level: half.level, seat: 'host' }, net.clock.now + 30));
    net.clock.now += R.firstGraceMs;
    s.update();
    assert.equal(sentOf(net, 'done').length, 1, `${seat}: done`);
    assert.equal(s.match.status, 'over');
    assert.deepEqual(s.outcome, raceOutcome(s.match.slots));
    assert.equal(s.outcome.winner, 1, `${seat}: the ${other} won on points`);
    assert.deepEqual(lobby.calls.filter((c) => c[0] === 'finish').length, seat === 'host' ? 1 : 0);
  }
});

test('rematch: asked only after the race; both asks → the host\'s lobby.rematch(); the room playing a later round restarts the race on its seed and GO', () => {
  const { s, net, lobby, ops, room } = raceScene();
  s.wantRematch();
  assert.equal(sentOf(net, 'rematch').length, 0, 'not mid-race');
  s.match.status = 'over';
  s.wantRematch();
  assert.deepEqual(sentOf(net, 'rematch').map((m) => m.want), [true]);
  net.push(peer('rematch', { want: true }, net.clock.now + 20));
  s.update();
  assert.deepEqual(lobby.calls.filter((c) => c[0] === 'rematch'), [['rematch']]);
  assert.deepEqual(ops, [], 'no restart before the room says so');
  Object.assign(room, { seed: 77, startMs: GO + 90_000, round: 2 });
  s.update();
  assert.equal(ops.length, 2);
  assert.deepEqual(ops[0], ['stop', 'Play']);
  const [, data] = ops[1];
  assert.equal(data.net, net);
  assert.equal(data.lobby, lobby);
  assert.deepEqual([data.plan.seed, data.plan.startAt, data.plan.round, data.plan.seat], [77, GO + 90_000, 2, 'host']);
  s.update();
  assert.equal(ops.length, 2, 'once');
  const next = Object.create(OnlineRace.prototype);
  next.initRace(data);
  assert.equal(next.match.hostKey, 'OnlineRace', 'the new round\'s match names its host again (item 39)');
  assert.equal(next.match.seed, 77);
});

test('the room from the race: its confirmed playing / finished status reaches the lobby; a leave or an abandoned room does not (Tier 2)', () => {
  const { s, net, lobby } = raceScene({ seat: 'guest' });
  const item = (status) => ({ kind: 'room', hint: 'status', action: { type: 'status', room: { code: '482913', status }, at: 1 } });
  net.push(item('finished'), item('abandoned'), { kind: 'room', hint: 'left', action: { type: 'left', seat: 'host', at: 1 } }, item('playing'));
  s.update();
  assert.deepEqual(lobby.calls, [['roomItem', 'finished'], ['roomItem', 'playing']]);
});

// --- Play's side -----------------------------------------------------------------------------------

function crossing(level, host) {
  const p = playScene({
    level,
    player: 1,
    match: { status: 'playing', slots: [{}, {}] },
    crashesThisLevel: 0,
    runTopLevel: level,
    score: 10,
    effects: { cancelPower: () => false },
    scoreText: { setText() {} },
  });
  for (const m of ['statCall', 'refreshLevelBar', 'playSample', 'takeCoins', 'startLevelBreak', 'win', 'showScorePopup', 'refreshProbioticHud']) p[m] = () => {};
  p.versusHost = () => host;
  return p;
}

test('Play: onFinishCrossed names the line it crossed to the host (its level, final or not), the level before it steps on', () => {
  const lines = [];
  const host = { claimLevelFinish: (half, line) => (lines.push(line), false), onLevelReached() {} };
  crossing(3, host).onFinishCrossed();
  crossing(T.levels.lastLevel - 1, host).onFinishCrossed();
  crossing(T.levels.lastLevel, host).onFinishCrossed();
  assert.deepEqual(lines, [
    { level: 3, final: false },
    { level: T.levels.lastLevel - 1, final: false },
    { level: T.levels.lastLevel, final: true },
  ]);
});

test('Play: awardLevelFirst (the host\'s verdict, later than the line) gives the level win, versus.scoring.levelClearBonus and its popup; finalFirst on the final line', () => {
  const shown = [];
  const p = playScene({ player: 1, match: { status: 'playing', slots: [{ levelWins: 1 }, {}] }, score: 30, scoreText: { text: '', setText(v) { this.text = v; } } });
  let published = 0;
  p.publishSlot = () => (published += 1);
  p.refreshProbioticHud = () => {};
  p.showScorePopup = (kind) => shown.push(kind);
  p.awardLevelFirst({ final: false });
  assert.equal(p.score, 30 + T.versus.scoring.levelClearBonus);
  assert.equal(p.scoreText.text, String(p.score));
  assert.equal(p.match.slots[0].levelWins, 2);
  assert.equal(p.match.slots[0].finalFirst, undefined);
  assert.deepEqual(shown, ['levelClear']);
  assert.equal(published, 1, 'the slot carries it to the feed');
  p.awardLevelFirst({ final: true });
  assert.equal(p.match.slots[0].finalFirst, true);
  assert.equal(p.match.slots[0].levelWins, 3);
});
