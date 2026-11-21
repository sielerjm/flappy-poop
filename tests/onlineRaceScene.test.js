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
    pausePlay: () => calls.push(['pausePlay']),
    resumePlay: () => calls.push(['resumePlay']),
    raceSnapshot: () => ({
      state: h.state, levelBreak: h.levelBreak, ended: h.ended, won: h.ended, flaps: 0, distance: h.distance, speed: 0, y: 640, vy: 0, angle: 0,
      frame: 'poop', alpha: 1, level: h.level, pipesPassed: 0, score: h.score, deaths: 0, levelWins: 0, finalFirst: false,
    }),
  };
  return h;
}

/**
 * A race scene past its start GO, as create() leaves it, with sinks for what it draws (`countdown`:
 * before its GO instead; `peerWidth`: the other side's presence width).
 */
function raceScene({ seat = 'host', round = 1, countdown = false, peerWidth = 720 } = {}) {
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
  s.initRace({ net, lobby, plan: { seed: 5, startAt: GO, seat, names: seat === 'host' ? ['Plop', 'Jolly'] : ['Jolly', 'Plop'], fieldW: 720, round } });
  if (!countdown) s.match.status = 'playing';
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
