// Plan 35, 1.1: the error card. index.html's trap keeps the game's own uncaught errors (the last one in
// memory, for a bug report with its links removed) and shows them: on the splash's failed state before the
// game exists, on the card (src/ui/errorCard.js) after. During a run the card pauses it (Reload or Keep
// playing); an unhandled rejection shows it only when the frame loop has stopped. The headless smoke's
// error-card section throws inside a real frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { errorReportText, issueUrl, errorCardContext, loopStalled, VERSION } from '../src/logic.js';
import { t } from '../src/i18n.js';
import { bootTrap } from './support/bootTrap.js';
import { installDom } from './support/dom.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('errorReportText: a script URL in a stack keeps its file name and line, nothing of the host or query', () => {
  const stack = [
    'TypeError: cannot read x',
    '    at Play.update (https://sielerjm.github.io/flappy-poop/src/scenes/Play.js?v=0.24.1:5613:12)',
    '    at http://localhost:8000/src/main.js:40:3',
    '    at step (https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js:1:2345)',
  ].join('\n');
  assert.equal(
    errorReportText(stack),
    ['TypeError: cannot read x', '    at Play.update (Play.js:5613:12)', '    at main.js:40:3', '    at step (phaser.min.js:1:2345)'].join('\n'),
  );
});

test('errorReportText: every other link becomes [link], and an invite code goes wherever it sits', () => {
  const out = errorReportText('failed https://sielerjm.github.io/flappy-poop/?invite=ABC123 and www.example.com/a, blob:https://x/1 data:text/plain,hi; then invite=XYZ789 left');
  assert.equal(out, 'failed [link] and [link] [link] [link] then  left', 'a link takes its trailing , or ; along (a data: URL can hold both)');
  assert.ok(!/ABC123|XYZ789|https?:|www\./.test(out));
});

test('errorReportText: blank lines dropped, line ends trimmed, cut to max with an ellipsis, nothing for nothing', () => {
  assert.equal(errorReportText('a  \n\n   \nb\n'), 'a\nb');
  const long = errorReportText('x'.repeat(900));
  assert.equal(long.length, 600);
  assert.ok(long.endsWith('…'));
  assert.equal(errorReportText('x'.repeat(50), 20).length, 20);
  for (const empty of [undefined, null, '', ' \n ']) assert.equal(errorReportText(empty), '');
  assert.equal(errorReportText(new Error('boom')), 'Error: boom');
});

test("issueUrl('bug') carries the last error, links removed, in the form's extras field with the version", () => {
  const url = new URL(issueUrl('bug', { error: 'Error: boom\n    at https://h.example/src/scenes/Play.js?v=1:10:2 ?invite=SECRET' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/sielerjm/flappy-poop/issues/new');
  assert.equal(url.searchParams.get('template'), 'bug.yml');
  assert.equal(url.searchParams.get('version'), `v${VERSION}`);
  const extras = url.searchParams.get('extras');
  assert.match(extras, /Error: boom/);
  assert.match(extras, /Play\.js:10:2/);
  assert.ok(!/https?:|h\.example|SECRET/.test(extras), extras);
  // The bug form has these two fields (.github/ISSUE_TEMPLATE/bug.yml).
  const form = read('.github/ISSUE_TEMPLATE/bug.yml');
  for (const id of ['version', 'extras']) assert.match(form, new RegExp(`id: ${id}\\b`));
});

test("issueUrl('bug') with no error (or only blanks) is the bare form, as before", () => {
  for (const error of [undefined, '', '  \n']) assert.equal(issueUrl('bug', { error }), 'https://github.com/sielerjm/flappy-poop/issues/new?template=bug.yml');
});

test('errorCardContext: a run (playing, respawn, paused) or a Daily Dump attempt in one; else the menu', () => {
  assert.equal(errorCardContext(), 'menu');
  assert.equal(errorCardContext([]), 'menu');
  for (const state of ['ready', 'countdown', 'dead', 'won', undefined]) assert.equal(errorCardContext([{ state }]), 'menu', state);
  for (const state of ['playing', 'respawn', 'paused']) assert.equal(errorCardContext([{ state }]), 'run', state);
  assert.equal(errorCardContext([{ state: 'playing', daily: true }]), 'daily');
  assert.equal(errorCardContext([{ state: 'ready', daily: true }]), 'menu', 'a Daily Dump on its ready screen has no attempt to lose');
  assert.equal(errorCardContext([{ state: 'paused' }, { state: 'playing', daily: true }]), 'daily');
  assert.equal(errorCardContext([null, { state: 'playing' }]), 'run');
});

test('loopStalled: frames older than the bar; a hidden page or no frame yet never counts', () => {
  assert.equal(loopStalled(1000, 1500), false);
  assert.equal(loopStalled(1000, 2001), true);
  assert.equal(loopStalled(1000, 1300, { ms: 200 }), true);
  assert.equal(loopStalled(1000, 9000, { hidden: true }), false);
  assert.equal(loopStalled(null, 9000), false);
});

// index.html's trap, run in Node (tests/support/bootTrap.js).
const ORIGIN = 'https://game.example';
const failedSplash = () => {
  const calls = [];
  return { calls, importSplash: async () => ({ splashFailed: () => (calls.push(1), true) }) };
};

test("trap: before the game exists, the game's own uncaught error fails the splash and is kept", async () => {
  const f = failedSplash();
  const { B, fire, listeners, settle } = bootTrap({ origin: ORIGIN, importSplash: f.importSplash });
  assert.ok(listeners.error?.some((l) => l.capture), 'error, captured');
  assert.ok(listeners.unhandledrejection?.length, 'unhandledrejection');
  const err = new Error('boom');
  err.stack = `Error: boom\n    at ${ORIGIN}/src/i18n.js:3:1`;
  fire('error', { target: undefined, filename: `${ORIGIN}/src/i18n.js`, message: 'Uncaught Error: boom', error: err });
  await settle();
  assert.equal(B.count, 1);
  assert.equal(B.last, err.stack, "Chrome's 'Uncaught Error: boom' is not repeated over a stack that holds 'boom'");
  assert.equal(B.failed, true, 'no card yet (no i18n maybe), so the splash');
  assert.equal(f.calls.length, 1);
});

test("trap: errors that aren't the game's are ignored: another origin, and the browser's bare 'Script error.'", async () => {
  const { B, w, fire, settle } = bootTrap({ origin: ORIGIN });
  fire('error', { target: w, filename: 'chrome-extension://abc/content.js', message: 'x' });
  fire('error', { target: w, filename: 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js', message: 'x' });
  fire('error', { target: w, filename: '', message: 'Script error.' });
  await settle();
  assert.equal(B.count, 0);
  assert.equal(B.last, '');
  assert.equal(B.failed, false);
});

test('trap: an unhandled rejection before the game is only kept (soft), never a failed splash', async () => {
  const { B, fire, settle } = bootTrap({ origin: ORIGIN });
  fire('unhandledrejection', { reason: new Error('network') });
  await settle();
  assert.equal(B.count, 1);
  assert.match(B.last, /network/);
  assert.equal(B.failed, false);
});

test("trap: once the card is installed it gets every report: hard for errors and own scripts, soft for rejections; the stack isn't doubled", async () => {
  const { B, w, fire, settle } = bootTrap({ origin: ORIGIN });
  const seen = [];
  B.card = (text, soft) => seen.push({ text, soft });
  const err = new Error('in a frame');
  fire('error', { target: w, filename: `${ORIGIN}/src/scenes/Play.js`, message: 'Uncaught Error: in a frame', error: err });
  fire('error', { target: w, filename: '', message: 'Uncaught Error: from the console', error: null });
  fire('unhandledrejection', { reason: 'just a string' });
  fire('error', { target: { tagName: 'SCRIPT', src: `${ORIGIN}/src/ui/late.js` } });
  await settle();
  assert.deepEqual(
    seen.map((s) => s.soft),
    [false, false, true, false],
  );
  assert.ok(seen[0].text.startsWith('Error: in a frame'), 'a stack that already holds the message stands alone');
  assert.equal(seen[1].text, 'Uncaught Error: from the console');
  assert.equal(seen[2].text, 'just a string');
  assert.match(seen[3].text, /could not load .*src\/ui\/late\.js/);
  assert.equal(B.count, 4);
  assert.equal(B.last, seen[3].text);
  assert.equal(B.failed, false, 'the card, not the splash');
});

test('trap: a long error is kept to 2,000 characters', () => {
  const { B, w, fire } = bootTrap({ origin: ORIGIN });
  B.card = () => true;
  fire('error', { target: w, filename: `${ORIGIN}/src/x.js`, message: 'y'.repeat(5000), error: null });
  assert.equal(B.last.length, 2000);
});

// The card itself, on the fake DOM (tests/support/dom.js).
test('the card: pauses a run, says so, one at a time; Keep playing closes it and restarts a stopped loop', async () => {
  const body = installDom();
  let clock = 1000;
  const realNow = performance.now;
  performance.now = () => clock;
  try {
    const { installErrorCard, showErrorCard } = await import('../src/ui/errorCard.js');
    assert.equal(showErrorCard(), false, 'nothing before the game');
    const on = {};
    const makePlay = (key) => ({
      key,
      state: 'playing',
      daily: null,
      pauses: 0,
      locale: 'en',
      autoPause() {
        this.pauses += 1;
        if (this.state === 'playing') this.state = 'paused';
      },
      getLocale() {
        return this.locale;
      },
      sys: { isActive: () => true },
    });
    const play = makePlay('Play');
    const scenes = { Play: play };
    const game = {
      events: { on: (type, fn) => (on[type] = fn) },
      scene: { getScene: (k) => scenes[k] },
      input: { keyboard: { enabled: true } },
      loop: { sleeps: 0, wakes: [], sleep() { this.sleeps += 1; }, wake(x) { this.wakes.push(x); } },
    };
    const boot = { card: null };
    installErrorCard(game, boot);
    assert.equal(typeof boot.card, 'function', "the trap's handler");
    assert.equal(typeof on.poststep, 'function', "every frame stamps the loop's heartbeat");
    on.poststep();
    clock = 1100;

    assert.equal(boot.card('Error: soft', true), false, 'a rejection with the loop running: kept, not shown');
    assert.equal(body.children.length, 0, 'not even built');

    assert.equal(boot.card('Error: hard', false), true);
    const root = body.find('error-card');
    assert.ok(root && !root.hidden);
    assert.equal(root.attrs.role, 'alertdialog');
    assert.equal(play.pauses, 1);
    assert.equal(play.state, 'paused');
    assert.equal(body.find('error-card-title').textContent, t('en', 'errorTitle'));
    assert.equal(root.children[0].children.find((c) => c.className === 'body').textContent, t('en', 'errorBodyRun'));
    assert.equal(root.children[0].children.find((c) => c.className === 'note').textContent, t('en', 'errorReport'));
    assert.equal(body.find('error-card-reload').textContent, t('en', 'reloadGame'));
    assert.equal(body.find('error-card-keep').textContent, t('en', 'errorKeep'));
    assert.equal(game.input.keyboard.enabled, false, "Phaser's keys are off under the card");
    assert.equal(globalThis.document.activeElement, body.find('error-card-keep'));

    assert.equal(boot.card('Error: again', false), true, 'a second error while it is up');
    assert.equal(play.pauses, 1, 'not paused again');
    assert.equal(body.children.filter((c) => c.id === 'error-card').length, 1, 'one card');

    // Input stays on the card.
    let stopped = 0;
    await root.fire('pointerdown', { stopPropagation: () => (stopped += 1) });
    await root.fire('touchstart', { stopPropagation: () => (stopped += 1) });
    assert.equal(stopped, 2);

    // Esc (or Keep playing) closes and restarts the loop, even 100 ms after its last frame: the error ended
    // the frame chain the instant the card opened, so a quick tap must not leave the game frozen.
    await root.fire('keydown', { key: 'Escape' });
    assert.equal(root.hidden, true);
    assert.equal(game.input.keyboard.enabled, true);
    assert.equal(game.loop.sleeps, 1);
    assert.deepEqual(game.loop.wakes, [true]);
    assert.equal(play.state, 'paused', 'the run stays paused (Preview A, choice 5)');

    // The loop stopped (no frame for 4 s): a rejection now shows the card, and Keep playing restarts it.
    clock = 5100;
    assert.equal(boot.card('Error: soft, stalled', true), true);
    assert.equal(root.hidden, false);
    await body.find('error-card-keep').click();
    assert.equal(root.hidden, true);
    assert.equal(game.loop.sleeps, 2);
    assert.deepEqual(game.loop.wakes, [true, true]);

    // A Daily Dump attempt, in Chinese.
    on.poststep();
    play.state = 'playing';
    play.daily = { day: '2026-11-18' };
    play.locale = 'zh-Hans';
    showErrorCard();
    assert.equal(root.lang, 'zh-Hans');
    assert.equal(root.children[0].children.find((c) => c.className === 'body').textContent, t('zh-Hans', 'errorBodyDaily'));
    assert.equal(body.find('error-card-title').textContent, t('zh-Hans', 'errorTitle'));
    await body.find('error-card-keep').click();

    // The menu (the ready screen), and a keyboard that was off before the card stays off after it.
    play.state = 'ready';
    play.daily = null;
    play.locale = 'en';
    game.input.keyboard.enabled = false;
    showErrorCard();
    assert.equal(root.children[0].children.find((c) => c.className === 'body').textContent, t('en', 'errorBody'));
    await body.find('error-card-keep').click();
    assert.equal(game.input.keyboard.enabled, false);
    game.input.keyboard.enabled = true;

    // Two players: both halves pause.
    const playB = makePlay('PlayB');
    scenes.PlayB = playB;
    play.state = 'playing';
    play.pauses = 0;
    showErrorCard();
    assert.equal(play.pauses, 1);
    assert.equal(playB.pauses, 1);
    assert.equal(root.children[0].children.find((c) => c.className === 'body').textContent, t('en', 'errorBodyRun'));

    // A scene that throws while pausing still gets the card.
    await body.find('error-card-keep').click();
    playB.autoPause = () => {
      throw new Error('broken');
    };
    assert.equal(showErrorCard(), true);

    // Reload: both buttons go dead at once (hardReloadGame; Node has no location, so it stops there).
    await body.find('error-card-reload').click();
    assert.equal(body.find('error-card-reload').disabled, true);
    assert.equal(body.find('error-card-keep').disabled, true);
  } finally {
    performance.now = realNow;
    delete globalThis.document;
  }
});

test('the card reloads through hardReloadGame, and main.js hands the trap to it right after the game exists', () => {
  const card = read('src/ui/errorCard.js');
  assert.match(card, /hardReloadGame\(globalThis\)/);
  const main = read('src/main.js');
  const game = main.indexOf('new Phaser.Game(');
  const install = main.indexOf('installErrorCard(game)');
  assert.ok(game > 0 && install > game, 'installErrorCard(game) after new Phaser.Game');
});

test("Feedback's bug button sends the trap's last error; the feature button sends nothing", () => {
  const src = read('src/scenes/Feedback.js');
  const body = src.slice(src.indexOf('  openIssue(kind) {'), src.indexOf('\n  }\n', src.indexOf('  openIssue(kind) {')));
  assert.match(body, /kind === 'bug' \? \(globalThis\.__flappyBoot\?\.last \?\? ''\) : ''/);
  assert.match(body, /issueUrl\(kind, \{ error \}\)/);
});

test('the card and the failed splash have their words in both locales', () => {
  for (const key of ['errorTitle', 'errorBody', 'errorBodyRun', 'errorBodyDaily', 'errorReport', 'errorKeep', 'splashFailed']) {
    for (const locale of ['en', 'zh-Hans']) assert.notEqual(t(locale, key), key, `${locale}: ${key}`);
  }
});
