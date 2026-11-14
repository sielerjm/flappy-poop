import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS as CONFIG_LEVELS } from '../src/config.js';
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  initialLocale,
  t,
  catalogKeys,
  catalogFor,
  howToItems,
  countText,
  pauseBannerText,
  metaFontSize,
  rankText,
  shareCardFooter,
  profileButtonText,
  tallyLines,
  nextWaitText,
  countLines,
  TALLY_GAP,
} from '../src/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Keys that are intentionally identical in en and zh-Hans. */
const IDENTICAL_OK = new Set(['readyTitle', 'aboutName', 'langEnglish', 'langChinese']);

/** English UI literals that must not appear hardcoded in scenes / tray. */
const SCENE_DENYLIST = [
  'GAME OVER',
  'SETTINGS',
  'How to play',
  'tap to flap',
  'PAUSED',
  'Home',
  'ABOUT',
  'HOW TO PLAY',
  'Save / Load User',
  'HIGH SCORES',
  'LEADERBOARD',
  'Load user',
  'Share',
  'Play:',
];

const BANNED_IMPORTS = ['ABOUT_TEXT', 'HOW_TO_PLAY_TEXT', 'PAUSE_BANNER_TEXT', 'HOW_TO_ITEMS'];

test('LOCALES includes en and zh-Hans with English as default', () => {
  assert.deepEqual(LOCALES, ['en', 'zh-Hans']);
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('zh-Hans'), true);
  assert.equal(isLocale('fr'), false);
  assert.equal(isLocale(42), false);
});

test('every English catalog key exists in zh-Hans', () => {
  const enKeys = catalogKeys();
  const zh = catalogFor('zh-Hans');
  for (const key of enKeys) {
    assert.equal(typeof zh[key], 'string', `zh-Hans missing ${key}`);
    assert.ok(zh[key].length > 0, `zh-Hans ${key} empty`);
  }
});

test('zh-Hans differs from English except for the intentional allowlist', () => {
  const en = catalogFor('en');
  const zh = catalogFor('zh-Hans');
  for (const key of catalogKeys()) {
    if (IDENTICAL_OK.has(key)) {
      assert.equal(zh[key], en[key], `${key} should stay identical across locales`);
      continue;
    }
    assert.notEqual(zh[key], en[key], `zh-Hans ${key} still matches English — translate it or add to IDENTICAL_OK`);
  }
});

test('TRANSLATION_NOTES.md lists every catalog key', () => {
  const notes = readFileSync(join(ROOT, 'TRANSLATION_NOTES.md'), 'utf8');
  for (const key of catalogKeys()) {
    assert.match(notes, new RegExp(`\\|\\s*${key}\\s*\\|`), `TRANSLATION_NOTES.md missing key ${key}`);
  }
});

test('scenes and tray do not hardcode player-facing English or old string exports', () => {
  const files = [
    ...readdirSync(join(ROOT, 'src/scenes')).filter((f) => f.endsWith('.js')).map((f) => join('src/scenes', f)),
    'src/ui/tray.js',
  ];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (const banned of BANNED_IMPORTS) {
      assert.equal(src.includes(banned), false, `${rel} still references ${banned}`);
    }
    for (const phrase of SCENE_DENYLIST) {
      if (src.includes(`'${phrase}'`) || src.includes(`"${phrase}"`) || src.includes(`\`${phrase}\``)) {
        assert.fail(`${rel} hardcodes ${JSON.stringify(phrase)} — use t() / i18n.js`);
      }
    }
  }
});

test('t falls back to English for unknown locale or key', () => {
  assert.equal(t('fr', 'howToPlay'), t('en', 'howToPlay'));
  assert.equal(t('en', 'notARealKey'), 'notARealKey');
});

test('initialLocale prefers stored locale, else navigator zh*, else en', () => {
  assert.equal(initialLocale('en-US', 'zh-Hans'), 'zh-Hans');
  assert.equal(initialLocale('zh-CN', 'en'), 'en');
  assert.equal(initialLocale('zh-CN', null), 'zh-Hans');
  assert.equal(initialLocale('zh-TW', undefined), 'zh-Hans');
  assert.equal(initialLocale('en-US', null), 'en');
  assert.equal(initialLocale(undefined, null), 'en');
});

test('howToItems and pauseBannerText resolve for both locales', () => {
  for (const locale of LOCALES) {
    const items = howToItems(locale);
    assert.deepEqual(
      items.map((i) => i.key),
      ['pipe', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'coin', 'mystery-icon', 'levels', 'controls', 'toilet', 'twoPlayer', 'tournament', 'daily', 'info', 'language', 'feedback', 'leaderboard', 'sound', 'settings'],
    );
    const banner = pauseBannerText(locale);
    assert.match(banner, /\n/);
    assert.ok(!banner.includes('—'));
  }
});

test('metaFontSize is larger for Chinese', () => {
  assert.equal(metaFontSize('en'), '24px');
  assert.equal(metaFontSize('zh-Hans'), '28px');
});

test('both About catalogs keep untranslated brand and credit tokens', () => {
  for (const locale of LOCALES) {
    const body = [
      t(locale, 'aboutName'),
      t(locale, 'aboutTagline'),
      t(locale, 'aboutBlurb'),
      t(locale, 'aboutLlmNote'),
      t(locale, 'aboutCreditsTitle'),
      t(locale, 'aboutCredits'),
    ].join('\n');
    assert.match(body, /Flappy Poop/);
    assert.match(body, /Michael Sieler/);
    assert.match(body, /Phaser 4\.2\.1/);
    assert.match(body, /MacKaffee/);
    assert.match(body, /Pixabay/);
    assert.match(body, /fart sound effect \(reed\)/);
    assert.match(body, /Tori Schummer/);
    assert.match(body, /Niklas Werner/);
  }
});

test('rankText fills score (with 🚽 on toilet runs), rank and total in both locales', () => {
  const info = { rank: 23, total: 150, score: 41, toilet: true };
  assert.equal(rankText('en', info), 'Your best 🚽 41 is #23 of 150');
  assert.equal(rankText('en', { ...info, toilet: false }), 'Your best 41 is #23 of 150');
  const zh = rankText('zh-Hans', info);
  assert.ok(zh.includes('🚽 41') && zh.includes('23') && zh.includes('150'), zh);
  assert.ok(!zh.includes('{'), 'no placeholder left over');
});

test('profileButtonText reads Load user until a username is set, then name · best, in both locales', () => {
  assert.equal(profileButtonText('en', { name: '', top: [] }), 'Load user');
  assert.equal(profileButtonText('zh-Hans', { name: '', top: [] }), '载入用户');
  assert.equal(profileButtonText('en', null), 'Load user');
  assert.equal(profileButtonText('en', { name: 'Alice', top: [] }), 'Alice');
  assert.equal(profileButtonText('zh-Hans', { name: 'Alice', top: [{ score: 41, toilet: true }] }), 'Alice · 🚽 41');
});

test('the share message has no strings of its own (it is only the link), and the old save hint is gone', () => {
  for (const locale of LOCALES) {
    for (const key of ['shareText', 'dailyShareText', 'dailyShareRank', 'newTopHint']) assert.equal(t(locale, key), key, `${locale}: no ${key}`);
  }
});

test('shareCardFooter shows the bare link after Play: in both locales', () => {
  const url = 'https://sielerjm.github.io/flappy-poop/';
  assert.equal(shareCardFooter('en', url), 'Play: sielerjm.github.io/flappy-poop');
  assert.equal(shareCardFooter('zh-Hans', url), '来玩：sielerjm.github.io/flappy-poop');
  assert.equal(shareCardFooter('en', 'http://localhost:8000//'), 'Play: localhost:8000');
});

test('countText is the coin count beside the kernel, the same in every locale', () => {
  assert.equal(countText(12), '12');
  assert.equal(countText(0), '0');
  assert.equal(countText(Infinity), '∞', 'a test run\'s endless purse');
});

test("tallyLines: an education run's answers, one line per level answered, in level order, in both locales", () => {
  const tally = { answered: 7, right: 5, wrong: 2, byLevel: { 3: { answered: 2, right: 2, wrong: 0 }, 1: { answered: 4, right: 2, wrong: 2 }, 2: { answered: 1, right: 1, wrong: 0 } } };
  const G = TALLY_GAP;
  assert.equal(G, '\u00A0\u00A0 ', 'two no-break spaces and a space: a wrapped Phaser text folds plain spaces into one');
  assert.deepEqual(tallyLines('en', tally, CONFIG_LEVELS), [`LV 1 · Stomach${G}✅ 2${G}❌ 2`, `LV 2 · Duodenum${G}✅ 1${G}❌ 0`, `LV 3 · Jejunum${G}✅ 2${G}❌ 0`]);
  const zh = tallyLines('zh-Hans', tally, CONFIG_LEVELS);
  assert.equal(zh.length, 3);
  assert.ok(zh[0].includes(t('zh-Hans', 'level.stomach')) && zh[0].endsWith(`✅ 2${G}❌ 2`), zh[0]);
  assert.deepEqual(tallyLines('en', { byLevel: {} }, CONFIG_LEVELS), [], 'nothing answered: no lines');
  assert.deepEqual(tallyLines('en', null, CONFIG_LEVELS), [], 'no tally');
  assert.deepEqual(tallyLines('en', { byLevel: { 7: { right: 3 } } }, CONFIG_LEVELS), [`LV 7 · Rectum${G}✅ 3${G}❌ 0`], 'a row from before wrong was kept still reads');
});

test('nextWaitText: again soon under a minute; then minutes, hours, days, months, years, rounded, a unit that rounds up moving to the next; both locales (plan 26; "Next review:" since its A2, as Michael asked)', () => {
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const cases = [
    [-5, 'Next review: again soon'],
    [0, 'Next review: again soon'],
    [59 * 1000, 'Next review: again soon'],
    [MIN, 'Next review: in 1 min'],
    [10 * MIN, 'Next review: in 10 min'],
    [HOUR, 'Next review: in 1 h'],
    [5.4 * HOUR, 'Next review: in 5 h'],
    [DAY, 'Next review: in 1 day'],
    [2 * DAY + HOUR, 'Next review: in 2 days'],
    [30 * DAY, 'Next review: in 30 days'],
    [46 * DAY, 'Next review: in 2 months'],
    [30.6 * DAY, 'Next review: in 1 month'],
    [31 * DAY, 'Next review: in 1 month'],
    [DAY - 5, 'Next review: in 1 day'],
    [2 * DAY - 5, 'Next review: in 2 days'],
    [HOUR - 5, 'Next review: in 1 h'],
    [364 * DAY, 'Next review: in 1 year'],
    [200 * DAY, 'Next review: in 7 months'],
    [365 * DAY, 'Next review: in 1 year'],
    [NaN, 'Next review: again soon'],
  ];
  for (const [ms, want] of cases) assert.equal(nextWaitText('en', ms), want, String(ms));
  assert.equal(nextWaitText('zh-Hans', 2 * DAY), '下次复习：2 天后');
  assert.equal(nextWaitText('zh-Hans', 0), '下次复习：很快');
});

test("countLines: the three lines Michael worded (plan 26, A2): new (not seen yet), missed (due now), to review (due today); both locales", () => {
  assert.deepEqual(countLines('en', { new: 2, missed: 1, review: 3 }), ['🔵 2 new (not seen yet)', '🔴 1 missed (due now)', '🟢 3 to review (due today)']);
  assert.deepEqual(countLines('zh-Hans', { new: 2, missed: 1, review: 3 }), ['🔵 2 张新卡（还没见过）', '🔴 1 张答错（现在到期）', '🟢 3 张待复习（今天到期）']);
});

test("the 📚 popup's words (plan 26, A2): where the data is kept, what a right answer earns, and a line for each new-card order; both locales", () => {
  assert.equal(t('en', 'eduIntroDevice'), 'Your data is stored locally on your device in the browser, not on our servers, unless you choose to share it.');
  assert.equal(t('en', 'eduIntroHowCoins'), "Right answers in a level break earn you corn kernels. Cards are automatically ordered to be shown right before you're likely to forget them.");
  for (const locale of ['en', 'zh-Hans']) {
    const hints = ['eduOrderBeforeHint', 'eduOrderMixedHint', 'eduOrderAfterHint'].map((k) => t(locale, k));
    assert.equal(new Set(hints).size, 3, `${locale}: three different lines`);
    for (const h of hints) assert.ok(h.length > 10 && !h.startsWith('eduOrder'), `${locale}: ${h}`);
  }
  assert.match(t('en', 'eduOrderBeforeHint'), /before.*missed and review cards/i, 'before: says the new cards come ahead of the cards a break waits for');
});
