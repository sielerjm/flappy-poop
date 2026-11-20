// The match host (plan 39, 1.6b). A match half's Play talks to the scene that runs its match through
// one interface, looked up by the match's host key (matchHostKey), so the online race (1.7a) can host
// a single Play without the Versus scene. The tournament window opens over Play with no Versus behind
// it, and "👥 offered" is apart from "two halves fit" (splitFits). Every split-screen match and every
// tournament race still resolves to the Versus scene: the smoke's versus-* and tournament sections pass
// unchanged (their before/after logs are compared in the plan's Progress).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { El, installDom } from './support/dom.js';
import { playScene, registry } from './support/scenes.js';
import { FIELD, TUNING as T } from '../src/config.js';

const body = installDom();
// What the tournament panel uses beyond tests/support/dom.js (as tests/eduIntroPanel.test.js extends it).
const proto = El.prototype;
proto.replaceChildren = function (...cs) {
  this.children = [];
  this.append(...cs);
};
Object.defineProperty(proto, 'offsetParent', { get() { for (let e = this; e; e = e.parent) if (e.hidden) return null; return {}; }, configurable: true });
Object.defineProperty(proto, 'classList', {
  configurable: true,
  get() {
    const el = this;
    const set = () => new Set(el.className.split(' ').filter(Boolean));
    return {
      add: (c) => (el.className = [...set().add(c)].join(' ')),
      remove: (c) => {
        const s = set();
        s.delete(c);
        el.className = [...s].join(' ');
      },
      contains: (c) => set().has(c),
    };
  },
});
proto.hasAttribute = function (k) {
  return k in this.attrs;
};
const all = (el, out = []) => {
  out.push(el);
  for (const c of el.children) if (c instanceof El) all(c, out);
  return out;
};
proto.querySelectorAll = function (sel) {
  const els = all(this).slice(1);
  if (sel === 'button') return els.filter((e) => e.tag === 'button');
  if (sel === 'button.pad') return els.filter((e) => e.tag === 'button' && e.className.split(' ').includes('pad'));
  return [];
};

const { Versus } = await import('../src/scenes/Versus.js');
const { OnlineRace } = await import('../src/scenes/OnlineRace.js');
const { createMatch, resetMatch, matchHostKey, versusAvailable } = await import('../src/versus.js');
const { openTournamentPanel, isTournamentPanelOpen, closeTournamentPanel } = await import('../src/ui/tournamentPanel.js');

const PLAY_SRC = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
const VERSUS_SRC = readFileSync(new URL('../src/scenes/Versus.js', import.meta.url), 'utf8');
const ONLINE_SRC = readFileSync(new URL('../src/scenes/OnlineRace.js', import.meta.url), 'utf8');
const el = (id) => body.find(id);

/**
 * The host interface: every member Play reads on versusHost(). A host scene (Versus; 1.7a's online
 * race) implements all of them. `levelStage` is a field ('count' while the shared 3-2-1 to the next
 * level runs); the rest are methods. The pad's two (onPadSelect / onPadBack) come through padTop's
 * 'versus' top, the join screen or the result panel.
 */
const HOST_METHODS = ['anyLive', 'bothInBreak', 'claimLevelFinish', 'halfScene', 'isPaused', 'isReady', 'onJoinInput', 'onLevelReached', 'onLevelTap', 'onRunEnded', 'onShopChanged', 'openPeek', 'setPaused', 'togglePause'];
const HOST_FIELDS = ['levelStage'];
const HOST_PAD = ['onPadSelect', 'onPadBack'];

/** The members Play.js reads on its host: `versusHost()?.x` and `host.x` / `host?.x` (the local it binds versusHost() to). */
function hostReads(src) {
  const names = new Set();
  for (const m of src.matchAll(/versusHost\(\)\??\.(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bhost\??\.(\w+)/g)) names.add(m[1]);
  return [...names].sort();
}

/** A game as the tournament panel reads it; `versus` is what getScene('Versus') returns, running or not (Phaser keeps a stopped scene's object). */
function fakeGame({ versus = null, active = false, play = null } = {}) {
  const listeners = {};
  return {
    registry: registry(),
    input: { keyboard: { enabled: true } },
    events: {
      on: (k, fn) => (listeners[k] ??= []).push(fn),
      emit: (k, d) => (listeners[k] ?? []).forEach((fn) => fn(d)),
      listenerCount: (k) => (listeners[k] ?? []).length,
    },
    scene: {
      getScene: (k) => (k === 'Versus' ? versus : k === 'Play' ? play : null),
      isActive: (k) => k === 'Versus' && active,
    },
  };
}

test('matchHostKey: no match has no host; every split-screen match and tournament race is the Versus scene; a match naming its host gets that one', () => {
  assert.equal(matchHostKey(null), null);
  assert.equal(matchHostKey(undefined), null);
  assert.equal(matchHostKey(createMatch(1)), 'Versus', 'the 👥 start (the lobby)');
  // As the tournament panel's startRace builds a race.
  const race = createMatch(2, { levelPipes: T.tournament.levelPipes, names: ['Ann', 'Bo'], tournament: { round: 'final', matchId: 'm1' } });
  assert.equal(matchHostKey(race), 'Versus', 'a tournament race');
  assert.equal(matchHostKey(resetMatch(race, 3)), 'Versus', "the smoke's rematch");
  assert.equal(matchHostKey({ ...createMatch(4), hostKey: 'OnlineRace' }), 'OnlineRace');
});

test('a split-screen match object is as it was: createMatch adds no host field (Versus is the default, not a stored key)', () => {
  assert.deepEqual(Object.keys(createMatch(1)), ['seed', 'status', 'slots', 'levelPipes', 'names', 'tournament']);
  assert.deepEqual(Object.keys(resetMatch(createMatch(1, { names: ['A', 'B'], tournament: { round: 'final', matchId: 'x' } }), 2)), ['seed', 'status', 'slots', 'levelPipes', 'names', 'tournament']);
});

test('Play.versusHost looks the host up by matchHostKey: null in single player (no lookup), the Versus scene for either half of a split-screen match, else the named host', () => {
  const asked = [];
  const scenes = { Versus: { id: 'versus' }, OnlineRace: { id: 'online' } };
  const scene = { get: (k) => (asked.push(k), scenes[k] ?? null) };
  assert.equal(playScene({ match: null, scene }).versusHost(), null);
  assert.deepEqual(asked, [], 'single player asks for no scene');
  for (const player of [1, 2]) assert.equal(playScene({ match: createMatch(5), player, scene }).versusHost(), scenes.Versus, `P${player}`);
  assert.equal(playScene({ match: { ...createMatch(6), hostKey: 'OnlineRace' }, player: 1, scene }).versusHost(), scenes.OnlineRace);
  assert.deepEqual(asked, ['Versus', 'Versus', 'OnlineRace']);
});

test("Play no longer hard-wires the Versus scene: no scene.get('Versus') / getScene('Versus'); its one 'Versus' is the split-screen start", () => {
  assert.doesNotMatch(PLAY_SRC, /scene\.get\(\s*'Versus'/);
  assert.doesNotMatch(PLAY_SRC, /getScene\(\s*'Versus'/);
  assert.deepEqual([...PLAY_SRC.matchAll(/'Versus'/g)].length, 1);
  assert.match(PLAY_SRC, /this\.scene\.start\('Versus', \{ match: null \}\)/);
});

test('the host interface: Play reads exactly these members on its host, and both hosts (Versus, OnlineRace) implement every one', () => {
  assert.deepEqual(hostReads(PLAY_SRC), [...HOST_METHODS, ...HOST_FIELDS].sort(), 'a new host call goes into this list, and into every host (1.7a: the online race)');
  for (const name of [...HOST_METHODS, ...HOST_PAD]) assert.equal(typeof Versus.prototype[name], 'function', `Versus.${name}`);
  for (const name of HOST_FIELDS) assert.match(VERSUS_SRC, new RegExp(`this\\.${name} = `), `Versus sets ${name}`);
  // The online race (1.7a) is the second host: every member, and its match names it.
  for (const name of [...HOST_METHODS, ...HOST_PAD]) assert.equal(typeof OnlineRace.prototype[name], 'function', `OnlineRace.${name}`);
  for (const name of HOST_FIELDS) assert.match(ONLINE_SRC, new RegExp(`this\\.${name} = `), `OnlineRace sets ${name}`);
  assert.match(ONLINE_SRC, /this\.match\.hostKey = ONLINE_HOST_KEY/);
  assert.match(PLAY_SRC, /top: 'versus', scene: this\.versusHost\(\)/, "the pad's join screen and result panel are the host's (padTop)");
});

test("a match half calls the host its match names, never the Versus scene: the pause, the other half, the chrome's state, the 💰 pill under the count", () => {
  const calls = [];
  const host = {
    setPaused: (on) => calls.push(['setPaused', on]),
    halfScene: (i) => (calls.push(['halfScene', i]), null),
    isPaused: () => true,
    anyLive: () => false,
    isReady: () => false,
    levelStage: 'count',
  };
  const versus = new Proxy({}, { get: (_t, k) => assert.fail(`Versus.${String(k)} was read`) });
  const scene = { get: (k) => ({ Versus: versus, OnlineRace: host })[k] ?? null };
  const s = playScene({ match: { ...createMatch(1), hostKey: 'OnlineRace', status: 'playing' }, player: 1, scene, state: 'playing', levelBreak: false, shopOpen: false, superQHold: false });
  s.pauseRun();
  assert.equal(s.otherHalf(), null, 'no other half on this device');
  assert.equal(s.chromeState(), 'paused');
  s.levelBreak = true;
  s.state = 'paused';
  assert.equal(s.shopButtonShown(), false, 'no shop under the count');
  assert.deepEqual(calls, [['setPaused', true], ['halfScene', 1]]);
});

test('"👥 offered" is apart from "two halves fit": splitFits is versusAvailable; offered outside a match and test mode at every size, phones too (1.6c, D2)', () => {
  const sizes = [[375, 667], [667, 375], [844, 390], [390, 844], [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1080], [3440, 1440], [800, 300], [0, 0]];
  try {
    for (const [w, h] of sizes) {
      globalThis.innerWidth = w;
      globalThis.innerHeight = h;
      const fits = versusAvailable(w, h, T, FIELD);
      const s = playScene({ match: null, isTestMode: () => false });
      assert.equal(s.splitFits(), fits, `${w}×${h} splitFits`);
      assert.equal(s.versusOffered(), true, `${w}×${h} offered`);
      assert.equal(playScene({ match: createMatch(1), isTestMode: () => false }).versusOffered(), false, `${w}×${h} in a match`);
      assert.equal(playScene({ match: null, isTestMode: () => true }).versusOffered(), false, `${w}×${h} in test mode`);
    }
    assert.ok(sizes.some(([w, h]) => versusAvailable(w, h, T, FIELD)) && sizes.some(([w, h]) => !versusAvailable(w, h, T, FIELD)), 'both answers covered');
  } finally {
    delete globalThis.innerWidth;
    delete globalThis.innerHeight;
  }
});

test('the tournament window opens without the Versus scene, on the 🌐 views locked on (1.6c): ✕ closes it back to the Play under it, and a stopped or never-run Versus is never asked to leave', async () => {
  // Stopped after a match (Phaser keeps its object and its last match), and never run (no match: its leave() would throw).
  for (const stale of [{ match: { status: 'left' } }, {}]) {
    const calls = [];
    stale.leave = () => calls.push('leave');
    const game = fakeGame({ versus: stale, active: false });
    openTournamentPanel({ game, locale: 'en', play: { getSaveState: () => ({ name: '' }) } });
    assert.equal(isTournamentPanelOpen(), true);
    assert.equal(el('tour-start'), null, 'no local lobby over Play');
    assert.equal(el('tour-online')?.disabled, true, '🌐 locked on');
    assert.equal(game.input.keyboard.enabled, false, 'the game keyboard is off under it');
    await el('tour-close').click();
    assert.equal(isTournamentPanelOpen(), false);
    assert.equal(game.input.keyboard.enabled, true, 'and back on');
    assert.deepEqual(calls, [], 'no Versus to leave');
  }
});

test('over a running Versus the window is as before: ✕ (or Esc) in the lobby leaves for single player through Versus.leave, once', async () => {
  for (const how of ['close', 'esc']) {
    const calls = [];
    const game = fakeGame({ versus: { leave: () => calls.push('leave') }, active: true });
    openTournamentPanel({ game, locale: 'en', play: { getSaveState: () => ({ name: '' }) } });
    if (how === 'close') await el('tour-close').click();
    else await el('tournament-panel').fire('keydown', { key: 'Escape' });
    assert.equal(isTournamentPanelOpen(), false, how);
    assert.deepEqual(calls, ['leave'], how);
  }
});

test('launch with 👥 on: the split screen where two halves fit (the Versus scene, as before), else the tournament window over this Play with no Versus behind it', async () => {
  const started = [];
  const stale = { leave: () => started.push(['leave']) };
  const game = fakeGame({ versus: stale, active: false });
  const s = playScene({ launching: false, state: 'ready', versusOn: true, match: null, focus: { hide() {} }, scene: { start: (k, d) => started.push([k, d]) }, game, locale: 'en', isTestMode: () => false, getSaveState: () => ({ name: '' }) });
  s.splitFits = () => true;
  s.launch();
  assert.deepEqual(started, [['Versus', { match: null }]], 'two halves fit: the Versus scene takes over');
  assert.equal(isTournamentPanelOpen(), false);
  // No room for two halves, 👥 still offered (1.6c offers it on phones; stood in here).
  s.splitFits = () => false;
  s.versusOffered = () => true;
  s.launch();
  assert.equal(started.length, 1, 'no Versus');
  assert.equal(isTournamentPanelOpen(), true, 'the window over Play');
  assert.equal(s.state, 'ready');
  assert.equal(Boolean(s.launching), false, 'no run starts under it');
  await el('tour-close').click();
  assert.equal(isTournamentPanelOpen(), false);
  assert.equal(started.length, 1, '✕ leaves this Play as it is');
  closeTournamentPanel();
});

// Plan 39, 1.7c (item 45's finding): Play steps the level on before it asks its host who was first, so
// Versus took finalFirst from the stepped-on level and gave it to the first over the line before the
// final one too. Play now names the line it crossed; Versus reads finalFirst from it.
test('split screen (1.7c): finalFirst goes to the first out of the final level, not to the first over the line before it', () => {
  const versus = Object.create(Versus.prototype);
  const match = { ...createMatch(9), status: 'playing' };
  const half = (player) => {
    const p = playScene({ player, match, crashesThisLevel: 0, score: 0, effects: { cancelPower: () => false }, scoreText: { setText() {} } });
    for (const m of ['statCall', 'refreshLevelBar', 'playSample', 'takeCoins', 'startLevelBreak', 'win', 'showScorePopup', 'refreshProbioticHud']) p[m] = () => {};
    p.versusHost = () => versus;
    return p;
  };
  const halves = [half(1), half(2)];
  Object.assign(versus, { match, levelFirst: null, halves: () => halves, onLevelReached() {} });
  const last = T.levels.lastLevel;
  halves[1].level = last - 1;
  halves[1].onFinishCrossed(); // P2 first over the line before the final level
  assert.equal(match.slots[1].levelWins, 1);
  assert.equal(Boolean(match.slots[1].finalFirst), false, 'that line is not the final one');
  versus.levelFirst = null; // GO into the final level (beginLevel)
  halves[0].level = last;
  halves[0].onFinishCrossed(); // P1 first out of the rectum
  assert.equal(match.slots[0].finalFirst, true);
  halves[1].level = last;
  halves[1].onFinishCrossed();
  assert.deepEqual(match.slots.map((s) => [s.levelWins, Boolean(s.finalFirst)]), [[1, true], [1, false]], 'one finalFirst, the first out\'s');
});
