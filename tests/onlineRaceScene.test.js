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

function fakeNet({ peerWidth = 720 } = {}) {
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
    peer: () => ({ name: 'Jolly', width: peerWidth }),
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
    launch: (o) => calls.push(['launch', o]),
    startRace: () => calls.push(['startRace']),
    chromeArgs: () => ({ overlay: null }),
    pausePlay() {
      calls.push(['pausePlay']);
      if (h.state === 'playing' || h.state === 'respawn') h.state = 'paused';
    },
    resumePlay() {
      calls.push(['resumePlay']);
      if (h.state === 'paused' && !h.levelBreak) h.state = 'playing';
    },
    raceSnapshot: () => ({
      state: h.state, levelBreak: h.levelBreak, ended: h.ended, won: h.ended, flaps: 0, distance: h.distance, speed: 0, y: 640, vy: 0, angle: 0,
      frame: 'poop', alpha: 1, level: h.level, pipesPassed: 0, score: h.score, deaths: 0, levelWins: 0, finalFirst: false,
    }),
    resumeSnapshot: () => ({ level: h.level, score: h.score, coins: h.coins ?? 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: h.levelWins ?? 0 }),
  };
  return h;
}

/**
 * A race scene past its start GO, as create() leaves it, with sinks for what it draws (`countdown`:
 * before its GO instead; `peerWidth`: the other side's presence width).
 */
function raceScene({ seat = 'host', round = 1, countdown = false, peerWidth = 720, resume = undefined, store = undefined } = {}) {
  const net = fakeNet({ peerWidth });
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
  s.initRace({ net, lobby, plan: { seed: 5, startAt: GO, seat, names: seat === 'host' ? ['Plop', 'Jolly'] : ['Jolly', 'Plop'], fieldW: 720, round }, resume, store });
  if (!countdown && !resume) s.match.status = 'playing';
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
  assert.deepEqual(sentOf(net, 'finish'), [{ event: 'finish', level: 1, distance: 4000, at: GO + 12_000 }], 'with the time it crossed (AUD-098)');
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

test('keys and pads in the online race (1.8 playtest): the one local half takes every device (no join screen claims one), so Space, ArrowUp and a pad flap it and a power key fires; split screen still needs the claimed device', () => {
  const groups = Object.values(T.versus.keys);
  const flapCodes = groups.map((g) => g.flap[0]);
  const powerCode = groups.find((g) => g.power?.length).power[0];
  const run = (otherHalf) => {
    const did = [];
    const p = playScene({ player: 1, match: { status: 'playing', slots: [{ device: null }, { device: null }] }, flap: () => did.push('flap'), activatePower: () => did.push('power') });
    const host = { halfScene: (i) => (i === 0 ? p : otherHalf) };
    p.versusHost = () => host;
    for (const code of ['Space', 'ArrowUp', ...flapCodes, powerCode]) p.onVersusKey(code);
    p.versusInput({ kind: 'pad', index: 2 }, 'flap');
    return did;
  };
  const online = run(null);
  assert.equal(online.filter((d) => d === 'flap').length, 3 + flapCodes.length, 'Space, ArrowUp, each group\'s flap key and the pad');
  assert.equal(online.filter((d) => d === 'power').length, 1);
  assert.deepEqual(run({}), [], 'split screen: nothing claimed, nothing flaps');
});

// --- 1.8: the wait offer (item 15), the results panel (C4), Rematch | Leave, the pad -------------------

/** A text as the scene draws it, keeping what the tests read. */
function fakeText() {
  const o = { text: '', visible: false, color: null, y: 0 };
  return Object.assign(o, {
    setText: (v) => ((o.text = v), o),
    setVisible: (v) => ((o.visible = Boolean(v)), o),
    setColor: (c) => ((o.color = c), o),
    setY: (y) => ((o.y = y), o),
  });
}
function fakeButton() {
  const b = { label: '', visible: false, alpha: 1, pulsing: false };
  return Object.assign(b, {
    setText: (v) => ((b.label = v), b),
    setVisible: (v) => ((b.visible = Boolean(v)), b),
    setAlpha: (a) => ((b.alpha = a), b),
    pulse: (on) => ((b.pulsing = Boolean(on)), b),
  });
}

/** raceScene plus what create() draws for the wait and the panel, a frame counter and a game clock. */
function drawnRace(opts) {
  const k = raceScene(opts);
  const { s } = k;
  const loop = { frame: 1, time: 0 };
  const started = [];
  Object.assign(s, {
    game: { loop },
    add: absorb(),
    scale: { width: 720, setGameSize: () => {} },
    cx: 360,
    plan: { ...s.plan, names: s.plan.names },
    waitText: fakeText(),
    offerText: fakeText(),
    keepButton: fakeButton(),
    leaveButton: fakeButton(),
    offerBoxes: { keep: { id: 'keep', x: 230, y: 852, width: 240, height: 88 }, leave: { id: 'leave', x: 490, y: 852, width: 240, height: 88 } },
  });
  s.scene.start = (key, data) => started.push([key, data]);
  return { ...k, loop, started };
}
const tap = (box) => ({ x: box.x, y: box.y });

test('the wait (item 15): ready in a break with the other not, a timer counts under the ready lines; after waitOfferMs, "<name> is taking a while" with Keep waiting | Leave', () => {
  const k = drawnRace();
  const { s, net, half } = k;
  inBreak(k);
  net.clock.now = GO + 20_000;
  s.onLevelTap(half);
  s.refreshWait(net.clock.now);
  assert.equal(s.waitText.visible, true);
  assert.equal(s.waitText.text, '⏱ 0:00');
  net.clock.now += 12_400;
  s.refreshWait(net.clock.now);
  assert.equal(s.waitText.text, '⏱ 0:12');
  assert.equal(s.keepButton.visible, false);
  net.clock.now = GO + 20_000 + R.waitOfferMs;
  s.refreshWait(net.clock.now);
  assert.equal(s.offerText.visible && s.keepButton.visible && s.leaveButton.visible, true);
});

test('Keep waiting hides the offer for another waitOfferMs, and that tap is not a ready tap; Leave leaves the room and starts plain Play', () => {
  const k = drawnRace();
  const { s, net, half, lobby, started } = k;
  inBreak(k);
  net.clock.now = GO + 20_000;
  s.onLevelTap(half);
  s.refreshWait(net.clock.now); // the frame after the tap: the wait starts
  net.clock.now += R.waitOfferMs;
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, true);
  s.onPointer(tap(s.offerBoxes.keep));
  s.onLevelTap(half); // the same tap, as Play hands it on in the same frame
  assert.equal(s.isReady(half), true, 'still ready');
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, false);
  net.clock.now += R.waitOfferMs - 1;
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, false);
  net.clock.now += 1;
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, true, 'back after another waitOfferMs');
  k.loop.frame += 1;
  s.onPointer(tap(s.offerBoxes.leave));
  assert.ok(lobby.calls.some((c) => c[0] === 'leave'));
  assert.deepEqual(started.map((x) => x[0]), ['Play']);
});

test('out at the finish with the other still racing is a wait too; the shop over a break hides the timer and the offer, and its time runs on', () => {
  const k = drawnRace();
  const { s, net, half } = k;
  s.match.slots[0].ended = true;
  net.clock.now = GO + 30_000;
  s.refreshWait(net.clock.now);
  assert.equal(s.waitText.visible, true);
  net.clock.now += R.waitOfferMs;
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, true);
  s.match.slots[0].ended = false;
  inBreak(k);
  s.onLevelTap(half);
  s.refreshWait(net.clock.now);
  half.shopOpen = true;
  net.clock.now += R.waitOfferMs;
  s.refreshWait(net.clock.now);
  assert.equal(s.waitText.visible || s.keepButton.visible, false, 'nothing over the shop');
  half.shopOpen = false;
  s.refreshWait(net.clock.now);
  assert.equal(s.keepButton.visible, true, 'the wait kept its time');
});

test('the race over: the results panel a deathToOverMs beat later, from the numbers the outcome came from (copied then, not the live slots)', () => {
  const k = drawnRace();
  const { s, timers } = k;
  Object.assign(s.match.slots[0], { ended: true, score: 31, deaths: 1, levelWins: 2, finalFirst: true });
  Object.assign(s.match.slots[1], { ended: true, score: 24, deaths: 3, levelWins: 1, finalFirst: false });
  s.feed.doneSent = () => true;
  s.checkOver();
  assert.equal(s.match.status, 'over');
  assert.equal(s.outcome.winner, 0);
  s.match.slots[0].score = 0; // Play keeps writing its slot
  assert.equal(s.finalSlots[0].score, 31);
  const beat = timers.find((x) => x.ms === T.deathToOverMs);
  assert.ok(beat, 'scheduled after deathToOverMs');
  assert.equal(s.result, null);
  beat.fn();
  assert.ok(s.result, 'the panel');
});

/** A scene past the race with its panel parts as stand-ins, opened at game time 0. */
function overRace(opts) {
  const k = drawnRace(opts);
  const { s } = k;
  s.match.status = 'over';
  s.result = { boxes: { share: { id: 'share', x: 220, y: 890, width: 240, height: 88 }, home: { id: 'home', x: 500, y: 890, width: 240, height: 88 } }, rematch: fakeButton(), status: fakeText(), openedAt: 0, shown: null };
  return k;
}

test('the panel\'s Rematch: after the tap lockout it asks (Rematch ✓, "Waiting for <name>…"), again takes it back; the other asking first is gold and breathes', () => {
  const k = overRace();
  const { s, net, loop } = k;
  s.refreshResult();
  assert.equal(s.result.rematch.label, 'Rematch');
  assert.equal(s.result.status.text, '');
  loop.time = T.retryLockoutMs - 1;
  s.onPointer(tap(s.result.boxes.share));
  assert.equal(sentOf(net, 'rematch').length, 0, 'inside the lockout: nothing');
  loop.time = T.retryLockoutMs;
  s.onPointer(tap(s.result.boxes.share));
  assert.deepEqual(sentOf(net, 'rematch').map((m) => m.want), [true]);
  s.refreshResult();
  assert.equal(s.result.rematch.label, 'Rematch ✓');
  assert.equal(s.result.status.text, 'Waiting for Jolly…');
  s.onPointer(tap(s.result.boxes.share));
  s.refreshResult();
  assert.deepEqual(sentOf(net, 'rematch').map((m) => m.want), [true, false]);
  assert.equal(s.result.rematch.label, 'Rematch');
  s.receive(peer('rematch', { want: true }, net.clock.now));
  s.refreshResult();
  assert.equal(s.result.status.text, 'Jolly wants a rematch');
  assert.equal(s.result.status.color, '#ffd700');
  assert.equal(s.result.rematch.pulsing, true);
});

test('the other player gone after the race (a confirmed room item: the room closed): "<name> left", Rematch greyed and inert; Leave goes home', () => {
  const k = overRace();
  const { s, net, loop, lobby, started } = k;
  s.receive({ kind: 'room', hint: 'left', action: { type: 'left', at: net.clock.now } });
  s.refreshResult();
  assert.equal(s.result.status.text, 'Jolly left');
  assert.equal(s.result.rematch.alpha, 0.4);
  loop.time = 10_000;
  s.onPointer(tap(s.result.boxes.share));
  assert.equal(sentOf(net, 'rematch').length, 0);
  s.onPointer(tap(s.result.boxes.home));
  assert.ok(lobby.calls.some((c) => c[0] === 'leave'));
  assert.deepEqual(started.map((x) => x[0]), ['Play']);
});

test('a room item mid-race is not "left" (Tier 2 takes a peer leaving mid-race); a playing / finished status still goes to the lobby', () => {
  const k = drawnRace();
  const { s, net, lobby } = k;
  s.receive({ kind: 'room', hint: 'left', action: { type: 'left', at: net.clock.now } });
  assert.equal(s.peerLeft, false);
  s.receive({ kind: 'room', hint: 'status', action: { type: 'status', room: { status: 'finished' }, at: net.clock.now } });
  assert.deepEqual(lobby.calls.at(-1), ['roomItem', 'finished']);
});

test('the pad on the panel (after the lockout): A is Rematch, B is Leave; nothing before the panel shows', () => {
  const k = overRace();
  const { s, net, loop, started } = k;
  const panel = s.result;
  s.result = null;
  s.onPadSelect();
  s.onPadBack();
  assert.equal(sentOf(net, 'rematch').length + started.length, 0);
  s.result = panel;
  loop.time = T.retryLockoutMs;
  s.onPadSelect();
  assert.deepEqual(sentOf(net, 'rematch').map((m) => m.want), [true]);
  s.onPadBack();
  assert.deepEqual(started.map((x) => x[0]), ['Play']);
});

/** The viewport for one test (the scene reads its field width from it), put back after. */
function withViewport(w, h, fn) {
  const saved = [globalThis.innerWidth, globalThis.innerHeight];
  globalThis.innerWidth = w;
  globalThis.innerHeight = h;
  try {
    return fn();
  } finally {
    [globalThis.innerWidth, globalThis.innerHeight] = saved;
  }
}

test('one field width (item 14, AUD-097): before GO the race sends this side\'s width; a newer one from the other side that moves the agreed width restarts the race on it; after GO nothing moves it', () => {
  withViewport(1200, 1280, () => {
    // The host announced 1600 in landscape at join, then turned its phone to portrait (720).
    const { s, net, ops } = raceScene({ seat: 'guest', countdown: true, peerWidth: 1600 });
    assert.equal(s.W, 1200);
    assert.equal(s.fieldW, 1200, 'the join-time width says the host is wider');
    net.clock.now = GO - 3500; // before the count's 3
    s.update();
    assert.deepEqual(sentOf(net, 'width').map((m) => m.width), [1200], 'this side\'s width, at once');
    net.clock.now += R.widthResendMs;
    s.update();
    assert.equal(sentOf(net, 'width').length, 2, 'again every online.race.widthResendMs');
    net.push(peer('width', { width: 1200 }, net.clock.now - 20));
    net.clock.now += 16;
    s.update();
    assert.deepEqual(ops.filter((o) => o[0] === 'restart'), [], 'a width that leaves the agreed one as it is changes nothing');
    net.push(peer('width', { width: 720 }, net.clock.now - 10));
    net.clock.now += 16;
    s.update();
    const restarts = ops.filter((o) => o[0] === 'restart');
    assert.equal(restarts.length, 1, 'the race again, on the smaller field');
    assert.deepEqual(ops.filter((o) => o[0] === 'stop'), [['stop', 'Play']]);
    const data = restarts[0][1];
    assert.equal(data.plan, s.plan, 'the same race: its seed and GO');
    assert.equal(data.peer.width, 720);
    s.update();
    assert.equal(ops.filter((o) => o[0] === 'restart').length, 1, 'once');
    const again = raceScene({ seat: 'guest', countdown: true, peerWidth: 1600 }).s;
    again.initRace(data);
    assert.equal(again.fieldW, 720, 'the restarted race plays the agreed width');
  });
  withViewport(1200, 1280, () => {
    const { s, net, ops } = raceScene({ seat: 'host', peerWidth: 1600 }); // past GO
    net.clock.now = GO + 500;
    s.update();
    net.push(peer('width', { width: 720 }, GO + 400));
    s.update();
    assert.deepEqual(ops, [], 'after GO a width moves nothing (Tier 2 re-fits at a break)');
    assert.equal(sentOf(net, 'width').length, 0, 'and none is sent');
  });
});

test('a rematch starts from the newest width heard, not the join-time one', () => {
  withViewport(1200, 1280, () => {
    const { s, net, ops, room } = raceScene({ seat: 'host', countdown: true, peerWidth: 1600 });
    net.clock.now = GO - 3500;
    net.push(peer('width', { width: 900 }, net.clock.now - 10));
    s.update();
    const first = ops.find((o) => o[0] === 'restart')[1];
    const s2 = raceScene({ seat: 'host', peerWidth: 1600 });
    s2.s.initRace(first);
    s2.s.match.status = 'over';
    Object.assign(room, { round: 2, seed: 9, startMs: GO + 90_000 });
    s2.s.lobby.state.room = room;
    s2.s.checkRematch();
    const next = s2.ops.find((o) => o[0] === 'restart')[1];
    assert.equal(next.plan.fieldW, 900, 'the next round\'s plan');
    assert.equal(next.peer.width, 900, 'and the newest width rides along');
  });
});

/** The canvas, cameras and the half's camera as a turn mid-race touches them, for onFieldResize. */
function fitRig(ctx, { W, fieldW }) {
  const { s, half } = ctx;
  const ops = [];
  const cam = (name) => ({
    setSize: (w, h) => (ops.push([name, 'size', w, h]), cam(name)),
    setScroll: (x, y) => (ops.push([name, 'scroll', x, y]), cam(name)),
    setViewport: (x, y, w, h) => (ops.push([name, 'viewport', x, y, w, h]), cam(name)),
  });
  s.scale = { width: W, height: 1280, setGameSize(w, h) { ops.push(['game', w, h]); this.width = w; } };
  s.cameras = { main: cam('race') };
  half.half = { fieldW, fieldX: Math.floor((W - fieldW) / 4) * 2 };
  half.fieldX = half.half.fieldX;
  half.cameras = { main: cam('half') };
  s.fieldW = fieldW;
  s.fieldX0 = half.fieldX;
  s.shiftX = 0;
  return ops;
}

test('a turn mid-race (Michael\'s phone check, 21 Nov): the canvas re-fits the screen around the same field, the half moves with it, taps follow, and nothing pauses', () => {
  const ctx = raceScene({ seat: 'host' });
  const ops = fitRig(ctx, { W: 2560, fieldW: 720 }); // raced in landscape on a 720 field
  ctx.s.onFieldResize(720); // turned to portrait
  assert.deepEqual(ops.filter((o) => o[0] === 'game'), [['game', 720, 1280]], 'the canvas is the portrait screen\'s width again');
  assert.deepEqual(ops.find((o) => o[0] === 'half'), ['half', 'viewport', 0, 0, 720, 1280], 'the half\'s field at the new centre, the same width');
  assert.equal(ctx.half.fieldX, 0, 'the half reads its taps from the new place');
  assert.equal(ctx.s.shiftX, -920, 'the race\'s own HUD moves with the field');
  assert.ok(ops.some((o) => o[0] === 'race' && o[1] === 'scroll' && o[2] === 920));
  assert.deepEqual(ctx.half.calls.filter((c) => c[0] === 'pausePlay'), [], 'no pause: the other side races on');

  const wide = raceScene({ seat: 'guest' });
  const wops = fitRig(wide, { W: 1200, fieldW: 1200 }); // a 1200 field, turned to portrait (720)
  wide.s.onFieldResize(720);
  assert.deepEqual(wops.filter((o) => o[0] === 'game'), [], 'never narrower than the field: the browser letterboxes it until the race ends');
  assert.equal(wide.s.shiftX, 0);
});

test('taps on the race\'s buttons follow the field after a turn (the offer and the results panel)', () => {
  const ctx = raceScene({ seat: 'host' });
  fitRig(ctx, { W: 2560, fieldW: 720 });
  ctx.s.onFieldResize(720);
  const kept = [];
  ctx.s.keepButton = { visible: true };
  ctx.s.offerBoxes = { keep: { id: 'keep', x: 1280, y: 900, width: 200, height: 100 }, leave: { id: 'leave', x: 1600, y: 900, width: 200, height: 100 } };
  ctx.s.game = { loop: { frame: 7 } };
  ctx.s.keepWaiting = () => kept.push('keep');
  ctx.s.onPointer({ x: 1280 - 920, y: 900 });
  assert.deepEqual(kept, ['keep'], 'the button drawn 920 px to the left answers there');
});

// --- 2.2: the shared pause in the scene (2.1's machine wired: the half, the ghost, the overlay's taps, the end) ---

const P2 = T.online.pause;
const RESUME_MS = R.countLeadMs + COUNT_MS;
const pausesOf = (net) => sentOf(net, 'pause');
const called = (half, name) => half.calls.filter((c) => c[0] === name).length;
/** A paused race's scene with a game loop (taps compare frames, Leave compares times). */
function pauseRig(opts) {
  const ctx = raceScene(opts);
  ctx.s.game = { loop: { frame: 1, time: 0 } };
  ctx.net.clock.now = GO + 5000;
  ctx.s.update();
  return ctx;
}

test('2.2 the pause key mid-run pauses both: the half freezes, this side says why over the wire (menu), and the referee is held', () => {
  const { s, net, half } = pauseRig();
  const held = [];
  const tick = s.referee.tick.bind(s.referee);
  s.referee.tick = (l) => (held.push(l.held), tick(l));
  s.setPaused(true);
  assert.equal(s.isPaused(), true);
  assert.equal(called(half, 'pausePlay'), 1);
  assert.deepEqual(pausesOf(net).at(-1), { event: 'pause', reason: 'menu', ready: false, round: 0, count: 0 });
  net.clock.now += 16;
  s.update();
  assert.deepEqual(held, [true], 'the referee ticks held (no level count starts under a pause)');
  s.togglePause();
  assert.equal(pausesOf(net).at(-1).ready, true, 'the pause key again says Ready (the race goes on only when both say it)');
  assert.equal(s.isPaused(), true);
});

test('2.2 the other side\'s pause pauses this side and stands the ghost where it stopped; a tap says Ready; both ready, the host\'s 3-2-1 resumes the half at its GO', () => {
  const { s, net, half } = pauseRig({ seat: 'host' });
  net.push(peer('pos', { phase: 'run', distance: 2000, speed: 300, y: 640, vy: 0, level: 1, score: 3 }, GO + 4900));
  s.update();
  const stop = GO + 5010;
  net.push(peer('pause', { reason: 'menu', ready: false, round: 0, count: 0 }, stop));
  net.clock.now = GO + 5060;
  s.update();
  assert.equal(called(half, 'pausePlay'), 1, 'paused one latency after the other side');
  assert.equal(s.pillLink(), 'paused', 'the pill says the other side paused, not a bad link');
  net.clock.now = GO + 9000;
  s.update();
  assert.equal(Math.round(s.match.slots[1].distance), 2000 + Math.round(300 * 0.11), 'the ghost stands at the other side\'s pause time');
  assert.equal(pausesOf(net).at(-1).ready, false, 'mid-run, this side waits for a tap');
  s.game.loop.frame = 2;
  s.setPaused(false); // Play's tap while paused (applyChrome 'resume')
  assert.equal(pausesOf(net).at(-1).ready, true);
  assert.equal(sentOf(net, 'resume').length, 0, 'the guest is not ready yet');
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: 0 }, GO + 9050));
  net.clock.now = GO + 9100;
  s.update();
  assert.deepEqual(sentOf(net, 'resume'), [{ event: 'resume', round: 0, startAt: GO + 9100 + RESUME_MS, cancel: false }]);
  assert.equal(called(half, 'resumePlay'), 0, 'counting');
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: GO + 9100 + RESUME_MS }, GO + 9150)); // the guest counts with it
  net.clock.now = GO + 9100 + RESUME_MS - 900;
  s.update();
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: GO + 9100 + RESUME_MS }, net.clock.now)); // its heartbeat
  net.clock.now = GO + 9100 + RESUME_MS;
  s.update();
  assert.equal(called(half, 'resumePlay'), 1, 'at the GO');
  assert.equal(s.isPaused(), false);
  assert.equal(s.menuHeld, false);
});

test('2.2 a pause before GO holds the opening GO: no race starts while frozen; the resume\'s GO starts it', () => {
  const { s, net, half } = raceScene({ seat: 'host', countdown: true });
  net.clock.now = GO - 2000;
  s.update();
  net.push({ kind: 'presence', event: 'leave', peer: { name: 'Jolly' } });
  s.update();
  assert.equal(s.isPaused(), true, 'the other side gone from presence: lost');
  net.clock.now = GO + 3000;
  s.update();
  assert.equal(called(half, 'startRace'), 0, 'GO passed under the pause: nothing starts');
  assert.equal(s.match.status, 'countdown');
  net.push({ kind: 'presence', event: 'join', peer: { name: 'Jolly' } });
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: 0 }, GO + 3050));
  net.clock.now = GO + 3100;
  s.update();
  const go = sentOf(net, 'resume').at(-1);
  assert.equal(go?.startAt, GO + 3100 + RESUME_MS, 'before GO both are ready by themselves: the host counts at once');
  net.clock.now = go.startAt - 900;
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: go.startAt }, net.clock.now)); // the guest's heartbeat, counting
  s.update();
  net.clock.now = go.startAt;
  s.update();
  assert.equal(called(half, 'startRace'), 1, 'the resume\'s GO starts the race');
  assert.equal(s.match.status, 'playing');
});

test('2.2 a hidden page pauses from the visibilitychange handler (no frames run there): this side sends away', () => {
  const { s, net, half } = pauseRig();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { hidden: true };
  try {
    s.tickPause(); // what create()'s onVisibility runs
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had);
    else delete globalThis.document;
  }
  assert.equal(called(half, 'pausePlay'), 1);
  assert.equal(pausesOf(net).at(-1).reason, 'away');
});

test('2.2 the other side left mid-race (the room\'s confirmed leave): over with no winner, the half frozen, no finish, no rematch; after the race a leave is only "left"', () => {
  const { s, net, half, timers, lobby } = pauseRig({ seat: 'host' });
  net.push({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest' } });
  s.update();
  assert.equal(s.match.status, 'over');
  assert.deepEqual(s.abandoned, { seat: 'guest' });
  assert.equal(s.outcome.winner, null);
  assert.equal(called(half, 'pausePlay'), 1);
  assert.deepEqual(lobby.calls.filter((c) => c[0] === 'finish'), [], 'the room is abandoned, not finished');
  assert.deepEqual(timers.map((x) => x.ms), [T.deathToOverMs], 'the results panel a beat later');
  s.match.status = 'over';
  s.toggleRematch();
  assert.equal(sentOf(net, 'rematch').length, 0, 'no rematch with nobody to race');

  const after = pauseRig({ seat: 'host' });
  after.s.match.status = 'over';
  after.net.push({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest' } });
  after.s.update();
  assert.equal(after.s.abandoned, null, 'a race already over is not abandoned');
  assert.equal(after.s.peerLeft, true);
});

test('2.2 back (this side\'s link or the other side returned) sends the run\'s end again', () => {
  const { s } = pauseRig();
  const again = [];
  s.feed.again = () => again.push(1);
  const drain = s.pause.drain;
  s.pause.drain = () => [{ type: 'back' }, ...drain()];
  s.tickPause();
  assert.equal(again.length, 1);
});

test('2.2 Leave on the pause overlay asks twice: one tap arms it for leaveConfirmMs, a second inside it leaves, a late one arms it again', () => {
  const { s } = pauseRig();
  const left = [];
  s.leave = () => left.push(s.game.loop.time);
  s.setPaused(true);
  s.tapLeave();
  assert.deepEqual(left, []);
  s.game.loop.time = P2.leaveConfirmMs + 1;
  s.tapLeave();
  assert.deepEqual(left, [], 'too late: armed again');
  s.game.loop.time += P2.leaveConfirmMs - 1;
  s.tapLeave();
  assert.deepEqual(left, [2 * P2.leaveConfirmMs], 'the second tap in time');
});

test('2.2 a tap on the overlay\'s Ready button says Ready once: Play\'s chrome sees the same tap and does nothing more', () => {
  const { s, net } = pauseRig();
  s.setPaused(true);
  const box = { id: 'ready', x: 200, y: 700, width: 200, height: 88 };
  s.pauseUi = { panel: { visible: true }, ready: { visible: true }, boxes: { ready: box, leave: { id: 'leave', x: 500, y: 700, width: 200, height: 88 }, alone: { id: 'leave', x: 360, y: 700, width: 200, height: 88 } } };
  s.game.loop.frame = 9;
  s.onPointer({ x: 200, y: 700 });
  assert.equal(pausesOf(net).at(-1).ready, true);
  s.setPaused(false); // the same tap reaching Play (applyChrome 'resume')
  assert.equal(pausesOf(net).at(-1).ready, true, 'not taken back by its own twin');
  s.game.loop.frame = 10;
  s.setPaused(false);
  assert.equal(pausesOf(net).at(-1).ready, false, 'a later tap takes it back');
});

test('2.2 the pill while paused reads the pause machine: lost when the other side is silent mid-run, never "slow" for a paused peer', () => {
  const { s, net } = pauseRig({ seat: 'guest' });
  net.push(peer('pos', { phase: 'run', distance: 2000, speed: 300, y: 640, vy: 0, level: 1 }, GO + 5000));
  s.update();
  net.clock.now = GO + 5000 + P2.silenceMs + 10;
  s.update();
  assert.equal(s.isPaused(), true);
  assert.equal(s.pillLink(), 'lost');
});

// --- 2.3: reload resume (D4) --------------------------------------------------------------------

/** The tab's resume record as the scene writes it (src/onlineRace.js's createResumeStore). */
function fakeStore() {
  const recs = [];
  return { recs, set: (r) => recs.push(JSON.parse(JSON.stringify(r))), clear: () => recs.push(null), get: () => recs.at(-1) ?? null, last: () => recs.at(-1) };
}
const START = { level: 1, score: 0, coins: 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 0 };
const LV2 = { level: 2, score: 31, coins: 3, beans: 1, probiotic: 0, postbiotic: false, deaths: 1, levelWins: 1 };
const LV3 = { level: 3, score: 64, coins: 5, beans: 2, probiotic: 4, postbiotic: true, deaths: 1, levelWins: 2 };
const restarts = (ops) => ops.filter((o) => o[0] === 'restart').map((o) => o[1]);

test('2.3 a fresh race writes the tab\'s resume record at its start: the room, the round, the seat, level 1\'s empty start', () => {
  const store = fakeStore();
  raceScene({ seat: 'guest', round: 2, store });
  const rec = store.last();
  assert.deepEqual({ code: rec.code, round: rec.round, seat: rec.seat, pauseRound: rec.pauseRound, levels: rec.levels }, { code: '482913', round: 2, seat: 'guest', pauseRound: 0, levels: { 1: START } });
});

test('2.3 a rewound race: Play launches at the level\'s start with its snapshot, the slot carries its numbers, the pause holds the GO (rewind) and the rewind goes every heartbeat', () => {
  const store = fakeStore();
  const { s, net, half } = raceScene({ resume: { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'me' }, store });
  assert.equal(s.match.status, 'countdown');
  assert.deepEqual(s.launchData().resume, LV2, 'what create() hands Play');
  assert.deepEqual([s.match.slots[0].score, s.match.slots[0].deaths, s.match.slots[0].levelWins, s.match.slots[0].level], [31, 1, 1, 2]);
  net.clock.now = GO + 60_000;
  s.update();
  assert.equal(s.isPaused(), true);
  assert.equal(s.pause.state().mine, 'rewind');
  assert.equal(called(half, 'startRace'), 0, 'the room\'s GO is long past: nothing starts while held');
  assert.deepEqual(sentOf(net, 'rewind'), [{ event: 'rewind', round: 1, level: 2, at: GO }], 'its level and its restart time');
  net.clock.now += 500;
  s.update();
  assert.equal(sentOf(net, 'rewind').length, 1);
  net.clock.now += T.online.pause.heartbeatMs;
  s.update();
  assert.equal(sentOf(net, 'rewind').length, 2, 'again a heartbeat later');
  assert.deepEqual(store.last().levels, { 1: START, 2: LV2 });
});

test('2.3 Ready clears the rewind hold; both ready, the host\'s resume GO starts the race at the level\'s start, and the rewind stops', () => {
  const { s, net, half } = raceScene({ resume: { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'them' } });
  net.clock.now = GO + 60_000;
  s.update();
  s.toggleReady();
  assert.equal(s.pause.state().mine, null, 'the tap cleared it');
  assert.equal(s.pause.state().ready.mine, true, 'before GO: ready by itself');
  net.push(peer('pause', { reason: 'rewind', ready: true, round: 0, count: 0 }, net.clock.now - 20));
  s.update();
  const go = sentOf(net, 'resume').at(-1);
  assert.equal(go?.startAt, net.clock.now + RESUME_MS, 'the host counts');
  net.clock.now = go.startAt - 900;
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: go.startAt }, net.clock.now));
  s.update();
  const rewinds = sentOf(net, 'rewind').length;
  net.clock.now = go.startAt;
  s.update();
  assert.equal(called(half, 'startRace'), 1, 'GO: the level runs');
  assert.equal(s.match.status, 'playing');
  assert.equal(s.rewound, null);
  net.clock.now += 5000;
  s.update();
  assert.equal(sentOf(net, 'rewind').length, rewinds, 'no rewind once flying');
});

test('2.3 the other side\'s rewind restarts a live race at the lower level\'s start: its snapshots up to that level, by them, the floor at the sender\'s restart', () => {
  const store = fakeStore();
  const { s, net, half, ops } = raceScene({ seat: 'guest', store });
  s.levels[2] = LV2;
  s.levels[3] = LV3;
  half.level = 3;
  net.clock.now = GO + 90_000;
  net.push(peer('rewind', { round: 1, level: 2, at: GO + 89_000 }, GO + 89_000));
  s.update();
  assert.deepEqual(ops.filter((o) => o[0] === 'stop'), [['stop', 'Play']]);
  const [data] = restarts(ops);
  assert.equal(restarts(ops).length, 1);
  assert.deepEqual(data.resume, { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'them', floor: GO + 89_000 });
  assert.equal(data.plan, s.plan);
  assert.equal(data.net, net);
  assert.equal(data.store, store);
  net.push(peer('rewind', { round: 1, level: 2, at: GO + 89_000 }, GO + 89_500));
  s.update();
  assert.equal(restarts(ops).length, 1, 'once');
});

test('2.3 a rewind past this side\'s level brings it to its own start; rewound already, a lower one takes it back further, the same or a higher one only raises the floor', () => {
  const live = raceScene({ seat: 'host' });
  live.s.levels[2] = LV2;
  live.half.level = 2;
  live.net.clock.now = GO + 50_000;
  live.net.push(peer('rewind', { round: 1, level: 3, at: GO + 49_000 }, GO + 49_000));
  live.s.update();
  assert.equal(restarts(live.ops)[0]?.resume.level, 2, 'its own level start (its rewind takes the other back)');

  const r = raceScene({ seat: 'host', resume: { level: 3, levels: { 1: START, 2: LV2, 3: LV3 }, pauseRound: 0, by: 'me' } });
  r.net.clock.now = GO + 50_000;
  r.net.push(peer('rewind', { round: 1, level: 3, at: GO + 49_000 }, GO + 49_000));
  r.s.update();
  assert.deepEqual(restarts(r.ops), [], 'the same level: no restart');
  const pos = (t) => peer('pos', { phase: 'run', distance: 100, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 3, pipesPassed: 4, score: 4, deaths: 0, levelWins: 0, finalFirst: false }, t);
  assert.equal(r.s.feed.receive(pos(GO + 48_000)), false, 'the floor is the other side\'s restart now');
  r.net.push(peer('rewind', { round: 1, level: 2, at: GO + 49_000 }, GO + 49_600));
  r.s.update();
  assert.deepEqual(restarts(r.ops)[0]?.resume, { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'them', floor: GO + 49_000 }, 'a lower one: further back');
});

test('2.3 stale and out of bounds: a rewind stamped before this side last left a rewind, one for another round, or any once this side\'s run has ended changes nothing', () => {
  const { s, net, ops } = raceScene({ resume: { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'me' } });
  net.clock.now = GO + 60_000;
  s.update();
  s.toggleReady();
  net.push(peer('pause', { reason: 'rewind', ready: true, round: 0, count: 0 }, net.clock.now - 20));
  s.update();
  const go = sentOf(net, 'resume').at(-1).startAt;
  net.clock.now = go;
  net.push(peer('pause', { reason: 'peer', ready: true, round: 0, count: go }, go - 10));
  s.update();
  assert.equal(s.match.status, 'playing');
  net.push(peer('rewind', { round: 1, level: 2, at: GO + 59_000 }, go - 1));
  net.push(peer('rewind', { round: 2, level: 1, at: go + 100 }, go + 100));
  net.clock.now = go + 200;
  s.update();
  assert.deepEqual(restarts(ops), [], 'from before its GO, or another round');
  s.feed.doneFixed = () => true;
  net.push(peer('rewind', { round: 1, level: 2, at: go + 300 }, go + 300));
  s.update();
  assert.deepEqual(restarts(ops), [], 'its run has ended: it never rewinds');
});

test('2.3 each level break writes its snapshot once its line is settled, and the record with it; a purchase in the break updates it', () => {
  const store = fakeStore();
  const k = raceScene({ seat: 'host', store });
  const { s, net, half } = k;
  net.clock.now = GO + 20_000;
  half.distance = 5000;
  s.claimLevelFinish(half, { level: 1, final: false });
  half.score = 26;
  half.coins = 4;
  half.levelWins = 1;
  inBreak(k, 2);
  s.update();
  assert.equal(s.levels[2], undefined, 'not before the line\'s verdict (the host\'s grace)');
  net.clock.now += R.firstGraceMs + 10;
  s.update();
  assert.deepEqual(s.levels[2], { level: 2, score: 26, coins: 4, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 1 });
  assert.deepEqual(store.last().levels[2], s.levels[2]);
  const writes = store.recs.length;
  s.update();
  assert.equal(store.recs.length, writes, 'unchanged: not written again');
  half.coins = 1;
  s.update();
  assert.equal(store.last().levels[2].coins, 1, 'the shop spent 3');
});

test('2.3 the record goes once this side\'s run has ended (a reload after its finish does not resume) and when the race is abandoned', () => {
  const a = fakeStore();
  const { s } = raceScene({ store: a });
  s.feed.doneFixed = () => true;
  s.update();
  assert.equal(a.last(), null);
  const b = fakeStore();
  const k = raceScene({ store: b });
  k.net.push({ kind: 'room', action: { type: 'left', seat: 'guest' } });
  k.s.update();
  assert.equal(b.last(), null);
});

test('2.3 a re-fit while rewound (a width before its GO) restarts on the same rewind', () => {
  withViewport(1200, 1280, () => {
    const { s, net, ops } = raceScene({ resume: { level: 2, levels: { 1: START, 2: LV2 }, pauseRound: 0, by: 'me' }, peerWidth: 1600 });
    assert.equal(s.fieldW, 1200);
    net.clock.now = GO + 60_000; // the room's GO long past: the rewind's GO is still to come
    s.update();
    assert.ok(sentOf(net, 'width').length >= 1, 'its width goes until the rewind\'s GO');
    net.push(peer('width', { width: 720 }, net.clock.now - 10));
    net.clock.now += 16;
    s.update();
    const [data] = restarts(ops);
    assert.equal(data?.peer.width, 720);
    assert.equal(data.resume.level, 2, 'the same rewind');
    assert.deepEqual(data.resume.levels, { 1: START, 2: LV2 });
  });
});

test('2.3 one final line: a host whose fresh referee decides the final line for itself takes nothing once the other side\'s run already holds it (a reload after the guest finished)', () => {
  for (const held of [false, true]) {
    const { s, net, half } = raceScene({ seat: 'host' });
    if (held) Object.assign(s.match.slots[1], { ended: true, finalFirst: true });
    s.feed.slot = () => null; // the remote slot as set here (no ghost messages in this test)
    net.clock.now = GO + 400_000;
    half.level = T.levels.lastLevel;
    s.claimLevelFinish(half, { level: T.levels.lastLevel, final: true });
    net.clock.now += R.firstGraceMs + 10;
    s.update();
    assert.equal(half.calls.filter((c) => c[0] === 'award').length, held ? 0 : 1, held ? 'the other side holds the final line: no award' : 'control: the host takes its line');
  }
});

test("2.3 the record goes at the race's end (checkOver itself, not only the run's own end)", () => {
  const store = fakeStore();
  const { s } = raceScene({ store });
  s.match.slots[0].ended = true;
  s.match.slots[1].ended = true;
  s.feed.doneSent = () => true;
  s.checkOver();
  assert.equal(s.match.status, 'over');
  assert.equal(store.last(), null);
});
