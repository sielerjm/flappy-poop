// The shared pause (plan 39, 2.1): src/onlineRace.js's createRacePause on two devices joined by a
// simulated link, each with the real sender, inbox and feed (onlineNet stamps seq / t / sid and its
// inbox filters), so the pause messages and the keyframes share one sequence per device as in the game.
// The rule under test: a disconnect never ends a match. Any trigger on either device (the tab hidden,
// offline, this side's channel down, a menu, the other side silent mid-run or gone from presence)
// pauses both; both Ready and the host's 3-2-1 resume both at one server ms, from where they stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createInbox, createNetSim, createSender, parseMessage } from '../src/online.js';
import { createRaceFeed, createRacePause } from '../src/onlineRace.js';

const P = T.online.pause;
const COUNT = T.online.race.countLeadMs + 3 * T.versus.countdownMs; // the host's resume: its GO this far ahead
const LAN = { latencyMs: 40, jitterMs: 0, loss: 0, reorder: 0 };
const SPEED = 300; // px/s the simulated halves fly while live

/**
 * Two devices (0 the host, 1 the guest) as OnlineRace will wire them: per device one sender and one
 * inbox, a feed (keyframes while live and mid-run, none while frozen) and the pause machine. A device
 * whose channel is not joined (or offline) sends nothing (onlineNet's send returns false) and hears
 * nothing; `cut[i]` loses everything device i sends (a one-way break); `drop(i, event, payload)` loses
 * one message; a hidden device ticks once (the visibilitychange handler) and then sleeps, hearing
 * nothing until shown. Time moves in small steps.
 */
function pausePair({ profile = LAN, start = 100000, seed = 7, drop = null, phase = 'run', t = T } = {}) {
  let clock = start;
  const now = () => clock;
  let r = seed;
  const rng = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sims = [createNetSim(profile, rng), createNetSim(profile, rng)];
  let q = [[], []];
  const cut = [false, false];
  const asleep = [false, false];
  const sent = [[], []];
  const effects = [[], []];
  const local = [0, 1].map(() => ({ phase, hidden: false, offline: false, channel: 'joined', menu: false }));
  const senders = [createSender({ sid: 'h', now }), createSender({ sid: 'g', now })];
  const inboxes = [createInbox(), createInbox()];
  const off = (i) => local[i].offline || local[i].channel !== 'joined';
  const send = (i) => (event, fields) => {
    if (off(i)) return false;
    const m = senders[i](event, fields);
    assert.ok(m && parseMessage(event, m.payload), `${event} ${JSON.stringify(fields)} is a valid message`);
    sent[i].push({ event, ...m.payload });
    const d = sims[i].delay();
    if (!cut[i] && d !== null && !drop?.(i, event, m.payload)) q[i].push({ item: { kind: 'peer', event, msg: m.payload, at: m.payload.t }, due: clock + d });
    return true;
  };
  const pauses = [createRacePause({ seat: 'host', now, send: send(0), t }), createRacePause({ seat: 'guest', now, send: send(1), t })];
  const feeds = [0, 1].map((i) => createRaceFeed({ now, send: send(i) }));
  const dist = [0, 0];
  const half = (i) => {
    const ph = local[i].phase;
    const state = ph === 'ended' ? 'over' : ph === null ? 'ready' : ph === 'break' || pauses[i].frozen() ? 'paused' : 'playing';
    return { state, levelBreak: ph === 'break', ended: ph === 'ended', distance: dist[i], speed: SPEED, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 1, pipesPassed: 0, score: 0, deaths: 0, levelWins: 0, finalFirst: false, flaps: 0 };
  };
  const collect = (i) => effects[i].push(...pauses[i].drain());
  const tick = (i) => {
    pauses[i].tick({ ...local[i] });
    feeds[i].tick(half(i));
    collect(i);
  };
  const deliver = () => {
    for (const i of [0, 1]) {
      const due = q[i].filter((x) => x.due <= clock).sort((a, b) => a.due - b.due);
      q[i] = q[i].filter((x) => x.due > clock);
      const to = 1 - i;
      for (const { item } of due) {
        if (off(to)) continue; // a device off the channel hears nothing
        if (asleep[to]) {
          q[i].push({ item, due: Infinity }); // the transport's queue holds it until the page wakes
          continue;
        }
        if (!inboxes[to].take(item.event, item.msg)) continue;
        feeds[to].receive(item);
        pauses[to].receive(item);
        collect(to);
      }
    }
  };
  const step = (ms) => {
    clock += ms;
    deliver();
    for (const i of [0, 1]) {
      if (asleep[i]) continue;
      if (local[i].phase === 'run' && !pauses[i].frozen()) dist[i] += (SPEED * ms) / 1000;
      tick(i);
    }
  };
  const advance = (ms, by = 10) => {
    for (let d = 0; d < ms; d += by) step(Math.min(by, ms - d));
  };
  /** Until `pred()` holds (checked after each step), at most `max` ms; → the ms it took, or null. */
  const until = (pred, max = 60000, by = 10) => {
    const t0 = clock;
    while (clock - t0 < max) {
      step(by);
      if (pred()) return clock - t0;
    }
    return null;
  };
  const hide = (i) => {
    local[i].hidden = true;
    tick(i); // the visibilitychange handler: the one tick a hidden page gets
    asleep[i] = true;
  };
  const show = (i) => {
    asleep[i] = false;
    local[i].hidden = false;
    for (const x of q[1 - i]) if (x.due === Infinity) x.due = clock;
    deliver();
    tick(i);
  };
  const presence = (i, event) => {
    pauses[i].receive({ kind: 'presence', event, peer: event === 'join' ? { name: 'Jolly', width: 720, seat: i === 0 ? 'guest' : 'host', protocol: 'aaaaaaaa', app: '0.25.0' } : null });
    collect(i);
  };
  const of = (i, type) => effects[i].filter((e) => e.type === type);
  const out = (i, event) => sent[i].filter((m) => m.event === event);
  const st = (i) => pauses[i].state();
  return { pauses, feeds, local, cut, asleep, sent, effects, dist, advance, step, until, hide, show, presence, of, out, st, now, setClock: (v) => (clock = v), tick };
}

const fields = ({ reason, ready, round, count }) => ({ reason, ready, round, count });

test('a hidden tab pauses both at once: the hidden side on its own reason, the other on its pause message, one latency later', () => {
  const p = pausePair();
  p.advance(1000);
  assert.deepEqual([p.of(0, 'pause'), p.of(1, 'pause')], [[], []], 'racing: nobody paused');
  p.hide(1);
  assert.equal(p.st(1).phase, 'paused');
  assert.equal(p.st(1).mine, 'away');
  assert.deepEqual(fields(p.out(1, 'pause').at(-1)), { reason: 'away', ready: false, round: 0, count: 0 }, 'sent from the visibilitychange tick');
  assert.equal(p.st(0).phase, 'live', 'the other side has not heard yet');
  p.advance(LAN.latencyMs + 10);
  assert.equal(p.of(0, 'pause').length, 1);
  assert.equal(p.st(0).phase, 'paused');
  assert.equal(p.st(0).mine, null, 'nothing of its own');
  assert.equal(p.st(0).theirs, 'away');
  assert.equal(p.pauses[0].frozen(), true);
  const d0 = p.dist[0];
  p.advance(5000);
  assert.equal(p.dist[0], d0, 'the host is frozen where it stopped');
  assert.deepEqual([...p.of(0, 'resume'), ...p.of(0, 'abandoned'), ...p.of(1, 'resume')], [], 'a pause, nothing else');
});

test('silence: a peer mid-run quiet for online.pause.silenceMs pauses this side ("lost"), and its pause pauses the other', () => {
  const p = pausePair();
  p.advance(1000);
  p.cut[1] = true; // the guest's messages stop arriving; it flies on, hearing the host
  const cutAt = p.now();
  const took = p.until(() => p.st(0).phase === 'paused');
  assert.ok(took !== null, 'the host pauses');
  const at = cutAt + took;
  assert.ok(at >= cutAt + P.silenceMs - T.online.keyframeMs, `not before silenceMs past the last keyframe heard (${took} ms after the cut)`);
  assert.ok(at <= cutAt + P.silenceMs + 20, `by silenceMs after the cut at the latest (${took} ms)`);
  assert.equal(p.st(0).theirs, 'lost');
  assert.equal(fields(p.out(0, 'pause').at(-1)).reason, 'lost', 'its pause says it lost the other');
  p.advance(LAN.latencyMs + 10);
  assert.equal(p.st(1).phase, 'paused', 'the guest pauses on the host\'s pause');
  assert.equal(p.st(1).theirs, 'lost');
});

test('silence counts only mid-run: a peer quiet in its break or after its run ended never pauses this side', () => {
  for (const quiet of ['break', 'ended']) {
    const p = pausePair();
    p.advance(1000);
    p.local[1].phase = quiet; // its feed sends that phase once, then nothing
    p.advance(200);
    p.cut[1] = true;
    p.advance(10000, 50);
    assert.equal(p.st(0).phase, 'live', `${quiet}: no pause`);
    assert.deepEqual(p.of(0, 'pause'), [], quiet);
  }
});

test('a paused side keeps one message a second (online.pause.heartbeatMs): its pause, so a waiting peer never reads as silent', () => {
  const p = pausePair();
  p.advance(600);
  p.local[0].menu = true;
  p.advance(5000);
  const beats = p.out(0, 'pause');
  assert.ok(beats.length >= 5 && beats.length <= 6, `once at the pause, then about every heartbeatMs (${beats.length} in 5 s)`);
  for (let i = 1; i < beats.length; i += 1) assert.ok(beats[i].t - beats[i - 1].t <= P.heartbeatMs, 'never longer apart than a heartbeat');
  assert.ok(P.heartbeatMs * 2 <= P.silenceMs, 'two heartbeats fit in the silence a peer waits for');
  const frozenAt = p.out(0, 'pos').at(-1).t;
  assert.ok(frozenAt < beats[0].t + 50, 'no keyframes while frozen (the feed\'s rule)');
  assert.equal(p.st(1).theirs, 'menu', 'the guest reads the host\'s reason, not "lost"');
  assert.equal(p.st(1).phase, 'paused');
});

test('this side\'s own reasons: away, offline, the server busy (the events cap), the channel down, a menu, most telling first', () => {
  const cases = [
    [{ hidden: true }, 'away'],
    [{ offline: true, channel: 'retrying' }, 'offline'],
    [{ channel: 'busy' }, 'busy'],
    [{ channel: 'retrying' }, 'link'],
    [{ channel: 'closed' }, 'link'],
    [{ channel: 'timeout' }, 'link'],
    [{ menu: true }, 'menu'],
    [{ hidden: true, offline: true, menu: true }, 'away'],
  ];
  for (const [set, reason] of cases) {
    const p = pausePair();
    p.advance(600);
    Object.assign(p.local[0], set);
    p.tick(0);
    assert.equal(p.st(0).phase, 'paused', JSON.stringify(set));
    assert.equal(p.st(0).mine, reason, JSON.stringify(set));
  }
});

test('presence: the other side gone from the channel pauses this side ("lost"); back in presence it waits for Ready', () => {
  const p = pausePair();
  p.advance(1000);
  p.presence(0, 'leave');
  p.advance(20);
  assert.equal(p.st(0).phase, 'paused');
  assert.equal(p.st(0).theirs, 'lost');
  p.presence(0, 'join');
  p.advance(20);
  assert.equal(p.st(0).phase, 'paused', 'back, but a pause ends only on Ready and the count');
});

test('resume: both Ready, then the host\'s resume (GO = now + countLeadMs + 3 × countdownMs); both count to it and resume at that server ms, from where they stopped', () => {
  const p = pausePair();
  p.advance(1000);
  p.local[0].menu = true;
  p.advance(100);
  const stopped = [...p.dist];
  p.local[0].menu = false;
  p.advance(100);
  assert.equal(p.st(0).phase, 'paused', 'no reason left, but nobody has said Ready');
  assert.equal(p.pauses[0].setReady(true), true);
  p.advance(500);
  assert.equal(p.out(0, 'resume').length, 0, 'the guest has not said Ready');
  assert.deepEqual(p.st(0).ready, { mine: true, theirs: false });
  assert.equal(p.pauses[1].setReady(true), true);
  p.step(10);
  const decided = p.until(() => p.out(0, 'resume').length > 0, 200, 5);
  assert.ok(decided !== null && decided <= LAN.latencyMs + 10, 'the host decides when the guest\'s Ready lands');
  const go = p.out(0, 'resume')[0];
  assert.equal(go.cancel, false);
  assert.equal(go.round, 0);
  assert.equal(go.startAt, go.t + COUNT);
  assert.deepEqual(p.of(0, 'count'), [{ type: 'count', startAt: go.startAt }]);
  p.advance(LAN.latencyMs + 10);
  assert.deepEqual(p.of(1, 'count'), [{ type: 'count', startAt: go.startAt }]);
  p.advance(go.startAt - 10 - p.now());
  assert.deepEqual([p.of(0, 'resume'), p.of(1, 'resume')], [[], []], 'not before GO');
  assert.deepEqual([p.dist[0], p.dist[1]], stopped, 'neither moved while paused or counting');
  p.advance(20, 5);
  assert.deepEqual([p.of(0, 'resume'), p.of(1, 'resume')], [[{ type: 'resume', late: false }], [{ type: 'resume', late: false }]]);
  assert.deepEqual([p.st(0).phase, p.st(1).phase, p.st(0).round, p.st(1).round], ['live', 'live', 1, 1]);
  p.advance(500);
  assert.ok(p.dist[0] > stopped[0] && p.dist[1] > stopped[1], 'both fly on from where they stopped');
  p.advance(5000);
  assert.equal(p.of(0, 'pause').length + p.of(1, 'pause').length, 2, 'and stay live: an old pause message never pauses again');
});

test('Ready: a mid-run side taps it; a side in its break or before GO is ready by itself; refused while this side has its own reason', () => {
  const p = pausePair();
  p.advance(600);
  p.local[1].offline = true;
  p.local[1].channel = 'retrying';
  p.advance(100);
  assert.equal(p.pauses[1].setReady(true), false, 'offline: Ready is refused');
  assert.equal(p.st(1).ready.mine, false);
  p.local[1].offline = false;
  p.local[1].channel = 'joined';
  p.advance(100);
  assert.equal(p.st(1).ready.mine, false, 'mid-run: not ready until tapped');
  assert.equal(p.pauses[1].setReady(true), true);
  assert.equal(p.st(1).ready.mine, true);
  p.local[1].menu = true;
  p.advance(50);
  assert.equal(p.st(1).ready.mine, false, 'a new reason of its own takes Ready back');
  p.local[1].menu = false;
  p.advance(50);
  assert.equal(p.st(1).ready.mine, false, 'and it stays taken back');

  for (const ph of ['break', null]) {
    const b = pausePair({ phase: ph });
    b.advance(600);
    b.local[0].menu = true;
    b.advance(100);
    assert.equal(b.st(1).phase, 'paused', `${ph}: paused`);
    assert.equal(b.st(1).ready.mine, true, `${ph}: ready by itself`);
    b.local[0].menu = false;
    b.advance(100);
    assert.notEqual(b.st(0).phase, 'paused', `${ph}: the host goes on without a tap once its menu is shut (at once in a break, a count before GO)`);
  }
});

test('in a level break a pause resumes without a count once both are back (the break\'s own ready check follows); before GO it counts', () => {
  const p = pausePair({ phase: 'break' });
  p.advance(600);
  p.local[1].menu = true;
  p.advance(100);
  assert.equal(p.st(0).phase, 'paused');
  p.local[1].menu = false;
  const took = p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 1000);
  assert.ok(took !== null && took <= 2 * LAN.latencyMs + 30, `back at once (${took} ms)`);
  assert.deepEqual([p.of(0, 'count'), p.of(1, 'count')], [[], []], 'no 3-2-1');

  const g = pausePair({ phase: null });
  g.advance(600);
  g.local[1].menu = true;
  g.advance(100);
  g.local[1].menu = false;
  g.until(() => g.of(0, 'count').length > 0, 1000);
  assert.equal(g.of(0, 'count')[0].startAt - g.out(0, 'resume')[0].t, COUNT, 'before GO the restart is counted');
});

test('a Ready taken back during the count calls it off: the host\'s at once, the guest\'s when the host hears it; nobody resumes at that GO', () => {
  const setup = () => {
    const p = pausePair();
    p.advance(600);
    p.local[0].menu = true;
    p.advance(100);
    p.local[0].menu = false;
    p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
    p.pauses[0].setReady(true);
    p.pauses[1].setReady(true);
    p.until(() => p.of(1, 'count').length > 0, 1000);
    return p;
  };
  const g = setup();
  const go = g.out(0, 'resume')[0].startAt;
  assert.equal(g.pauses[1].setReady(false), true);
  g.tick(1); // the harness collects the effects on a tick
  assert.deepEqual(g.of(1, 'cancel'), [{ type: 'cancel' }], 'the guest stops counting at once');
  assert.equal(g.st(1).phase, 'paused');
  assert.equal(fields(g.out(1, 'pause').at(-1)).ready, false, 'and says so at once');
  g.advance(LAN.latencyMs + 10);
  assert.deepEqual(g.of(0, 'cancel'), [{ type: 'cancel' }]);
  const off = g.out(0, 'resume').at(-1);
  assert.deepEqual([off.round, off.cancel, off.startAt], [0, true, go], 'the cancel names the GO it calls off');
  g.setClock(go + 10);
  g.advance(100);
  assert.deepEqual([g.of(0, 'resume'), g.of(1, 'resume')], [[], []]);

  const h = setup();
  assert.equal(h.pauses[0].setReady(false), true);
  h.tick(0);
  assert.deepEqual(h.of(0, 'cancel'), [{ type: 'cancel' }], 'the host calls it off at once');
  assert.equal(h.out(0, 'resume').at(-1).cancel, true);
  h.advance(LAN.latencyMs + 10);
  assert.deepEqual(h.of(1, 'cancel'), [{ type: 'cancel' }]);
  h.local[0].menu = true; // a new reason during a fresh count works the same way
  h.advance(50);
  assert.equal(h.st(0).phase, 'paused');
});

test('a disconnect never ends a match: a peer gone for ten minutes keeps both paused; only the room\'s confirmed leave or abandon ends it, with no winner', () => {
  const p = pausePair();
  p.advance(1000);
  p.cut[1] = true;
  p.presence(0, 'leave');
  for (let i = 0; i < 600; i += 1) p.step(1000);
  assert.equal(p.st(0).phase, 'paused', 'still paused after ten minutes');
  assert.deepEqual(p.of(0, 'abandoned'), []);
  assert.deepEqual(new Set(p.effects[0].map((e) => e.type)), new Set(['pause']), 'nothing but the pause');
  p.pauses[0].receive({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest', at: p.now() } });
  assert.deepEqual(p.pauses[0].drain(), [{ type: 'abandoned', seat: 'guest' }]);
  assert.equal(p.st(0).phase, 'over');
  assert.equal(p.pauses[0].frozen(), false, 'nothing left to freeze: the race is over');
  const before = p.out(0, 'pause').length;
  p.advance(3000);
  assert.equal(p.out(0, 'pause').length, before, 'no more pause messages');
  assert.deepEqual(p.pauses[0].drain(), []);

  const s = pausePair();
  s.advance(1000);
  for (const status of ['playing', 'finished']) s.pauses[1].receive({ kind: 'room', hint: 'status', action: { type: 'status', room: { ok: true, status }, at: s.now() } });
  assert.equal(s.st(1).phase, 'live', 'a playing or finished status changes nothing');
  s.pauses[1].receive({ kind: 'room', hint: 'status', action: { type: 'status', room: { ok: true, status: 'abandoned' }, at: s.now() } });
  assert.deepEqual(s.pauses[1].drain(), [{ type: 'abandoned', seat: null }]);
});

test('airplane mode on one phone mid-run pauses both; back on and Ready on both resumes the same run from the same spot (the outline\'s "done when")', () => {
  const p = pausePair();
  p.advance(1000);
  p.local[1].offline = true;
  p.local[1].channel = 'retrying';
  p.tick(1);
  assert.equal(p.st(1).mine, 'offline', 'the phone pauses itself at once');
  const guestStop = p.dist[1];
  const took = p.until(() => p.st(0).phase === 'paused');
  assert.ok(took <= P.silenceMs + 20, `the other pauses on silence (${took} ms)`);
  const hostStop = p.dist[0];
  assert.ok(hostStop - guestStop <= (SPEED * (P.silenceMs + 20)) / 1000 + 1, 'the far side flew at most silenceMs more');
  p.advance(20000, 50);
  p.local[1].offline = false;
  p.local[1].channel = 'joined';
  assert.ok(p.until(() => p.of(1, 'back').length === 1, P.heartbeatMs + 100) !== null, 'the phone is back and hears the host: one back effect');
  assert.ok(p.until(() => p.of(0, 'back').length === 1, 200) !== null, 'and the host hears the phone again');
  assert.ok(p.until(() => p.st(0).theirs === 'peer', P.heartbeatMs + 100) !== null, 'the phone hears the host again: paused on the host\'s pause now');
  p.pauses[1].setReady(true);
  p.pauses[0].setReady(true);
  p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 6000);
  assert.deepEqual([p.of(0, 'resume').length, p.of(1, 'resume').length], [1, 1]);
  assert.deepEqual([p.dist[0], p.dist[1]].map((d) => Math.round(d)), [hostStop, guestStop].map((d) => Math.round(d)), 'each resumed from where it stopped');
  p.advance(1000);
  assert.ok(p.dist[0] > hostStop && p.dist[1] > guestStop);
});

test('a lost resume: a guest that heard nothing of the count catches up late, on the host\'s first keyframe mid-run, or (before GO, in silence) on the host\'s answer to its Ready pause', () => {
  // silenceMs above the count here, so a guest that heard nothing of the whole count is not yet lost
  // (with the game's tuning it would be, and both would stay paused: the test below): these are the
  // last lines of defence for a resume lost on the wire.
  const t = { ...T, online: { ...T.online, pause: { ...T.online.pause, silenceMs: COUNT + 2000 } } };
  for (const phase of ['run', null]) {
    let gate = true;
    const p = pausePair({ t, phase, drop: (i, event, m) => gate && i === 0 && (event === 'resume' || (event === 'pause' && m.count > 0)) });
    p.advance(600);
    p.local[0].menu = true;
    p.advance(100);
    p.local[0].menu = false;
    p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
    p.pauses[0].setReady(true);
    p.pauses[1].setReady(true);
    p.until(() => p.of(0, 'count').length > 0, 1000);
    const go = p.of(0, 'count')[0].startAt;
    p.advance(go - 5 - p.now());
    assert.equal(p.st(1).phase, 'paused', `${phase}: the guest heard neither the resume nor the count`);
    p.advance(10, 5);
    assert.equal(p.st(0).phase, 'live', `${phase}: the host resumed at its GO`);
    if (phase === 'run') {
      const took = p.until(() => p.st(1).phase === 'live', 1000, 5);
      assert.ok(took !== null && took <= LAN.latencyMs + 10, `run: the host's first keyframe after its pause (${took} ms)`);
    } else {
      p.advance(P.heartbeatMs * 2);
      assert.equal(p.st(1).phase, 'paused', 'before GO nothing moves: the guest waits on the host\'s answer');
      assert.ok(p.out(0, 'resume').length >= 2, 'the host answers the guest\'s Ready pause with the same resume');
      gate = false;
      const took = p.until(() => p.st(1).phase === 'live', 3000);
      assert.ok(took !== null && took <= P.heartbeatMs + 2 * LAN.latencyMs + 20, `the guest resumes within a heartbeat and a round trip (${took} ms)`);
      const n = p.out(0, 'resume').length;
      p.advance(5000);
      assert.equal(p.out(0, 'resume').length, n, 'the answers stop once the guest resumed (once per Ready pause)');
    }
    assert.deepEqual(p.of(1, 'resume'), [{ type: 'resume', late: true }], `${phase}: late`);
    assert.deepEqual([p.st(0).round, p.st(1).round], [1, 1], `${phase}: one round on both`);
    p.advance(3000);
    assert.equal(p.of(0, 'pause').length, 1, `${phase}: and nobody paused again`);
  }
});

test('a lost cancel: the guest that resumed alone hears the host paused a round behind, not counting to that GO, and pauses again; then both agree on one round', () => {
  let gate = false;
  const p = pausePair({ drop: (i) => gate && i === 0 });
  p.advance(600);
  p.local[0].menu = true;
  p.advance(100);
  p.local[0].menu = false;
  p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
  p.pauses[0].setReady(true);
  p.pauses[1].setReady(true);
  p.until(() => p.of(1, 'count').length > 0, 1000);
  const go = p.of(1, 'count')[0].startAt;
  p.advance(go - 1200 - p.now()); // just after the host's count heartbeat at GO - 1250: under silenceMs old at GO
  gate = true; // from here the host's cancel and pauses are lost until after GO
  p.local[0].menu = true;
  p.advance(20);
  assert.deepEqual(p.of(0, 'cancel'), [{ type: 'cancel' }]);
  p.advance(go + 15 - p.now());
  assert.equal(p.st(1).phase, 'live', 'the guest, hearing nothing, resumed at GO');
  assert.equal(p.st(0).phase, 'paused');
  gate = false;
  const took = p.until(() => p.st(1).phase === 'paused', 3000);
  assert.ok(took !== null && took <= P.heartbeatMs + LAN.latencyMs + 20, `the guest pauses again on the host's next pause (${took} ms)`);
  p.advance(LAN.latencyMs + 20);
  assert.equal(p.st(0).round, p.st(1).round, 'one round on both');
  p.local[0].menu = false;
  p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
  p.pauses[0].setReady(true);
  p.pauses[1].setReady(true);
  p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 6000);
  assert.deepEqual([p.st(0).phase, p.st(1).phase], ['live', 'live']);
  assert.equal(p.st(0).round, p.st(1).round);
});

test('a one-way break: a side that cannot hear the other says so ("lost"), and the host counts only once it hears the host again', () => {
  const p = pausePair();
  p.advance(1000);
  p.cut[0] = true; // the guest hears nothing from the host; the host hears the guest
  p.until(() => p.st(1).phase === 'paused');
  assert.equal(p.st(1).theirs, 'lost');
  p.advance(LAN.latencyMs + 20);
  assert.equal(p.st(0).phase, 'paused', 'the host pauses on the guest\'s pause');
  assert.equal(p.st(0).theirs, 'lost');
  p.pauses[0].setReady(true);
  p.pauses[1].setReady(true);
  p.advance(5000);
  assert.equal(p.out(0, 'resume').length, 0, 'no count while the guest cannot hear the host');
  p.cut[0] = false;
  p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 8000);
  assert.deepEqual([p.st(0).phase, p.st(1).phase], ['live', 'live']);
  assert.equal(p.of(1, 'back').length, 1, 'the guest hears the host again: one back');
});

test('once the other side\'s run has ended a pause is this side\'s alone: away or a menu only, its own Ready and a local count, no pause message', () => {
  const p = pausePair();
  p.advance(1000);
  p.local[1].phase = 'ended'; // its feed sends pos ended + done
  p.advance(200);
  assert.equal(p.st(0).solo, true);
  const before = p.out(0, 'pause').length;
  p.local[0].offline = true;
  p.local[0].channel = 'retrying';
  p.advance(100);
  assert.equal(p.st(0).phase, 'live', 'offline alone does not pause a solo run');
  p.local[0].offline = false;
  p.local[0].channel = 'joined';
  p.hide(0);
  assert.equal(p.st(0).phase, 'paused', 'a hidden tab does');
  p.show(0);
  p.advance(500);
  assert.equal(p.st(0).phase, 'paused', 'until its Ready');
  p.pauses[0].setReady(true);
  p.advance(10);
  assert.equal(p.of(0, 'count').length, 1, 'a local count');
  p.until(() => p.st(0).phase === 'live', COUNT + 100);
  assert.equal(p.out(0, 'pause').length, before, 'no pause message in a solo pause');
  assert.equal(p.out(0, 'resume').length, 0, 'and no resume');
  assert.equal(p.st(1).phase, 'live');
});

test('a side whose run has ended never pauses and sends no pause; it still reads the other side\'s pause', () => {
  const p = pausePair();
  p.advance(1000);
  p.local[1].phase = 'ended';
  p.advance(200);
  p.local[1].offline = true;
  p.local[1].channel = 'retrying';
  p.advance(100);
  p.local[1].offline = false;
  p.local[1].channel = 'joined';
  p.hide(1);
  p.show(1);
  p.local[1].menu = true;
  p.advance(100);
  p.local[1].menu = false;
  assert.deepEqual(p.of(1, 'pause'), []);
  assert.deepEqual(p.out(1, 'pause'), []);
  p.local[0].menu = true;
  p.advance(100);
  assert.equal(p.st(0).phase, 'paused', 'the racer\'s own menu pauses the racer');
  assert.equal(p.st(1).phase, 'live');
  assert.equal(p.pauses[1].frozen(), false);
  assert.equal(p.out(0, 'pause').length, 0, 'and it sends nothing to a finished side');
});

test('back: one effect each time this side\'s link or the other side returns (2.2 sends the run\'s standing end again)', () => {
  const p = pausePair();
  p.advance(1000);
  p.local[0].channel = 'retrying';
  p.advance(100);
  assert.deepEqual(p.of(0, 'back'), []);
  p.local[0].channel = 'joined';
  p.advance(10);
  assert.equal(p.of(0, 'back').length, 1, 'the channel joined again');
  p.presence(0, 'leave');
  p.advance(100);
  p.presence(0, 'join');
  p.advance(10);
  assert.equal(p.of(0, 'back').length, 2, 'the other side in presence again');
  p.advance(5000);
  assert.equal(p.of(0, 'back').length, 2, 'and nothing more');
});

test('a pause stamped more than a heartbeat before this race\'s machine started is the last round\'s and is dropped', () => {
  let clock = 50000;
  const now = () => clock;
  const sent = [];
  const m = createRacePause({ seat: 'host', now, send: (event, f) => (sent.push({ event, ...f }), true) });
  const old = createSender({ sid: 'g', now: () => 50000 - P.heartbeatMs - 1 });
  const stale = old('pause', { reason: 'away', ready: false, round: 0, count: 0 });
  m.tick({ phase: 'run' });
  m.receive({ kind: 'peer', event: stale.event, msg: stale.payload, at: clock });
  assert.equal(m.state().phase, 'live');
  const fresh = createSender({ sid: 'g2', now: () => 50000 - P.heartbeatMs + 1 })('pause', { reason: 'away', ready: false, round: 0, count: 0 });
  m.receive({ kind: 'peer', event: fresh.event, msg: fresh.payload, at: clock });
  assert.equal(m.state().phase, 'paused');
  assert.equal(sent.at(-1).event, 'pause', 'and says so');
});

test('silence during a pause: a side whose pause messages stop for online.pause.silenceMs is lost, so a count to the host\'s GO is called off on both sides', () => {
  const p = pausePair();
  p.advance(600);
  p.local[0].menu = true;
  p.advance(100);
  p.local[0].menu = false;
  p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
  p.pauses[0].setReady(true);
  p.pauses[1].setReady(true);
  p.until(() => p.of(1, 'count').length > 0, 1000);
  const go = p.of(1, 'count')[0].startAt;
  p.cut[0] = true; // the guest hears nothing more from the host
  p.advance(go - p.now() + 100, 20);
  assert.equal(p.of(1, 'cancel').length, 1, 'the guest called its count off: it never resumes on a silent host');
  assert.equal(p.st(1).theirs, 'lost');
  assert.equal(p.of(0, 'cancel').length, 1, 'the host too, on the guest\'s pause saying it lost the host');
  assert.deepEqual([p.st(0).phase, p.st(1).phase, p.of(0, 'resume').length], ['paused', 'paused', 0]);
  p.cut[0] = false;
  p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 8000);
  assert.deepEqual([p.st(0).phase, p.st(1).phase, p.st(0).round, p.st(1).round], ['live', 'live', 1, 1], 'a fresh count once the link is back');
});

test('only the host\'s resume counts: a resume reaching the host from the guest changes nothing', () => {
  const p = pausePair();
  p.advance(600);
  p.local[1].menu = true;
  p.advance(100);
  p.local[1].menu = false;
  p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
  p.pauses[0].setReady(true);
  const forged = createSender({ sid: 'g', now: p.now })('resume', { round: 0, startAt: p.now() + 10, cancel: false });
  p.pauses[0].receive({ kind: 'peer', event: forged.event, msg: { ...forged.payload, seq: 9999 }, at: p.now() });
  p.advance(100);
  assert.equal(p.st(0).phase, 'paused');
  assert.deepEqual(p.of(0, 'count'), []);
});

test('stats for finish_match\'s telemetry (2.4a): pauses counted once each, pausedMs from each pause to its GO', () => {
  const p = pausePair();
  p.advance(600);
  assert.deepEqual(p.pauses[0].stats(), { pauses: 0, pausedMs: 0 });
  p.local[0].menu = true;
  p.advance(10);
  const from = p.now();
  p.advance(2990);
  assert.equal(p.pauses[0].stats().pausedMs, p.now() - from, 'a running pause counts so far');
  p.local[0].menu = false;
  p.advance(20); // the machine hears the menu shut before Ready (setReady refuses on a reason it still holds)
  p.pauses[0].setReady(true);
  p.pauses[1].setReady(true);
  p.until(() => p.st(0).phase === 'live', 6000, 5);
  const s = p.pauses[0].stats();
  assert.equal(s.pauses, 1);
  assert.ok(Math.abs(s.pausedMs - (p.now() - from)) <= 5, `pausedMs ${s.pausedMs} ≈ ${p.now() - from}`);
  p.advance(1000);
  assert.equal(p.pauses[0].stats().pausedMs, s.pausedMs, 'nothing while live');
  p.local[1].menu = true;
  p.advance(100);
  assert.equal(p.pauses[0].stats().pauses, 2);
});

test('on a bad link (loss, jitter and reorder) a pause and its resume still end with both live on one round, their GOs within a latency', () => {
  for (const seed of [3, 11, 29, 47, 83]) {
    const p = pausePair({ profile: { latencyMs: 120, jitterMs: 60, loss: 0.05, reorder: 0.05 }, seed });
    p.advance(1000, 20);
    p.local[seed % 2].menu = true;
    p.advance(400, 20);
    p.local[seed % 2].menu = false;
    p.until(() => p.st(0).phase === 'paused' && p.st(1).phase === 'paused', 8000, 20);
    p.pauses[0].setReady(true);
    p.pauses[1].setReady(true);
    const took = p.until(() => p.st(0).phase === 'live' && p.st(1).phase === 'live', 20000, 20);
    assert.ok(took !== null, `seed ${seed}: both live again`);
    assert.equal(p.st(0).round, p.st(1).round, `seed ${seed}: one round`);
    p.advance(3000, 20);
    assert.deepEqual([p.st(0).phase, p.st(1).phase], ['live', 'live'], `seed ${seed}: and they stay live`);
  }
});

// --- 2.2: what the scene builds on the machine (the ghost's hold, the run's end again, the overlay's words, the wake lock) ---

const ghostMsg = (event, fields, t, seq) => ({ kind: 'peer', event, msg: { seq, t, sid: 'g', ...fields }, at: t });

test('2.2 the ghost holds while paused: it stands at the hold time, moves to the other side\'s own pause time, and goes on at its first message stamped after the release', () => {
  let clock = 1000;
  const feed = createRaceFeed({ now: () => clock, send: () => true, since: 0 });
  feed.receive(ghostMsg('pos', { phase: 'run', distance: 1000, speed: SPEED, y: 640, vy: 0, level: 1 }, 1000, 1));
  clock = 1500;
  assert.equal(Math.round(feed.slot().distance), 1150, 'live: extrapolated at its speed');
  feed.hold(1200);
  assert.equal(Math.round(feed.slot().distance), 1060, 'held: where it was at the hold time');
  clock = 1900;
  assert.equal(Math.round(feed.slot().distance), 1060, 'and stays there');
  feed.receive(ghostMsg('pause', { reason: 'peer', ready: false, round: 0, count: 0 }, 1240, 2));
  assert.equal(Math.round(feed.slot().distance), 1072, 'the other side\'s first pause message: the time it stopped');
  feed.receive(ghostMsg('pause', { reason: 'peer', ready: true, round: 0, count: 0 }, 1800, 3));
  assert.equal(Math.round(feed.slot().distance), 1072, 'later heartbeats do not move it');
  clock = 5000;
  feed.release(4800);
  assert.equal(Math.round(feed.slot().distance), 1072, 'released: still standing until the other side moves');
  feed.receive(ghostMsg('pos', { phase: 'run', distance: 1072, speed: SPEED, y: 640, vy: 0, level: 1 }, 4700, 4));
  assert.equal(Math.round(feed.slot().distance), 1072, 'a message stamped before the release (still on the wire) keeps the hold');
  feed.receive(ghostMsg('pos', { phase: 'run', distance: 1072, speed: SPEED, y: 640, vy: 0, level: 1 }, 4800, 5));
  clock = 5100;
  assert.equal(Math.round(feed.slot().distance), 1162, 'its first message from the resume on: the ghost flies again from where it stood');
});

test('2.2 back: the feed sends its fixed run end again (again()), once more until the transport takes it; nothing before the end is fixed', () => {
  const sent = [];
  let up = true;
  const feed = createRaceFeed({ now: () => 2000, send: (e) => (sent.push(e), up), since: 0 });
  feed.again();
  const half = { state: 'over', levelBreak: false, ended: true, won: true, flaps: 0, distance: 900, speed: 0, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 7, pipesPassed: 30, score: 30, deaths: 0, levelWins: 1, finalFirst: true };
  assert.deepEqual(sent, [], 'no end yet: nothing to send again');
  feed.tick(half);
  assert.deepEqual(sent, ['pos', 'done']);
  assert.equal(feed.doneSent(), true);
  feed.tick(half);
  assert.equal(sent.length, 2, 'sent once');
  up = false;
  feed.again();
  assert.equal(feed.doneSent(), false);
  feed.tick(half);
  assert.deepEqual(sent.slice(2), ['pos', 'done'], 'again, refused');
  up = true;
  feed.tick(half);
  assert.deepEqual(sent.slice(4), ['pos', 'done'], 'and again until taken');
  assert.equal(feed.doneSent(), true);
});

test('2.2 pauseOverlay: the title (this side\'s connection, the other side\'s, why it paused, else PAUSED), the line, both rows and the Ready button', async () => {
  const { pauseOverlay } = await import('../src/onlineRace.js');
  const st = (o) => ({ phase: 'paused', round: 0, mine: null, theirs: null, solo: false, since: 0, ready: { mine: false, theirs: false }, count: null, ...o });
  assert.equal(pauseOverlay(null), null);
  assert.equal(pauseOverlay(st({ phase: 'live' })), null);
  assert.equal(pauseOverlay(st({ phase: 'over' })), null);
  assert.deepEqual(pauseOverlay(st({ phase: 'count', count: 5 })), { count: true });
  assert.deepEqual(pauseOverlay(st({ mine: 'menu', theirs: 'peer', ready: { mine: false, theirs: true } })), { count: false, title: 'pauseTitle', sub: 'onlinePauseTap', mine: 'onlineNotReady', theirs: 'onlineIsReady', ready: 'onlineReady' });
  assert.deepEqual(pauseOverlay(st({ theirs: 'menu', ready: { mine: true, theirs: false } })), { count: false, title: 'onlinePausedBy', sub: 'versusWaiting', mine: 'onlineIsReady', theirs: 'onlineHudPaused', ready: 'onlineIsReady' });
  assert.equal(pauseOverlay(st({ theirs: 'away' })).title, 'onlinePausedAway');
  for (const r of ['lost', 'offline', 'link']) {
    const v = pauseOverlay(st({ theirs: r }));
    assert.deepEqual([v.title, v.sub, v.theirs], ['onlinePausedLost', 'versusWaiting', 'onlineHudLost'], r);
  }
  const off = pauseOverlay(st({ mine: 'offline', theirs: 'lost' }));
  assert.deepEqual([off.title, off.sub, off.mine, off.ready], ['onlinePausedOffline', 'onlinePauseWaitNet', 'onlineHudLost', null], 'this side\'s own link first; no Ready while it is down');
  assert.equal(pauseOverlay(st({ mine: 'link' })).title, 'onlinePausedLink');
  assert.equal(pauseOverlay(st({ mine: 'busy' })).title, 'onlinePausedBusy');
  assert.equal(pauseOverlay(st({ theirs: 'busy' })).title, 'onlinePausedBusy');
  assert.equal(pauseOverlay(st({ mine: 'menu', theirs: 'away' })).title, 'onlinePausedAway', 'the other side\'s reason tells more than this side\'s menu');
  const brk = pauseOverlay(st({ theirs: 'lost', ready: { mine: true, theirs: false } }), { midRun: false });
  assert.equal(brk.ready, null, 'in a break (or before GO) this side is ready by itself: no Ready button');
  assert.equal(pauseOverlay(st({ solo: true, mine: 'menu' })).theirs, null, 'solo: no row for the other side');
});

test('2.2 the wake lock (item 16): one request while wanted, released when not; a lock arriving after want(false) is let go; refused or unsupported, nothing happens', async () => {
  const { createWakeLock } = await import('../src/onlineRace.js');
  const log = [];
  const sentinel = () => ({ released: false, release() { this.released = true; log.push('release'); return Promise.resolve(); } });
  const nav = { wakeLock: { request: (type) => (log.push(type), Promise.resolve(sentinel())) } };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const w = createWakeLock(nav);
  w.want(true);
  w.want(true);
  await flush();
  assert.deepEqual(log, ['screen'], 'one request');
  assert.equal(w.held(), true);
  w.want(true);
  await flush();
  assert.deepEqual(log, ['screen'], 'held: no second request');
  w.want(false);
  await flush();
  assert.deepEqual(log, ['screen', 'release']);
  assert.equal(w.held(), false);
  w.want(true);
  w.want(false);
  await flush();
  assert.deepEqual(log, ['screen', 'release', 'screen', 'release'], 'arrived after want(false): released at once');
  const refused = createWakeLock({ wakeLock: { request: () => Promise.reject(new Error('NotAllowedError')) } });
  refused.want(true);
  await flush();
  assert.equal(refused.held(), false);
  const none = createWakeLock({});
  assert.doesNotThrow(() => none.want(true));
  assert.equal(none.held(), false);
});
