// Chinese line breaking for the quiz card (plan 28, 2.1): Phaser's advanced wrap breaks only at spaces,
// so a Chinese explanation with a number in it ("2014 年的一项研究…") left the number alone on a line
// and pushed the rest down. wrapCjk breaks between Chinese characters, keeps a Latin word or a number
// whole, and never starts a line with closing punctuation or ends one with opening punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cjkUnits, wrapCjk } from '../src/logic.js';

// A fake font: a Chinese character or full-width mark is 2 wide, anything else 1.
const measure = (s) => [...s].reduce((w, ch) => w + (/[\p{Script=Han}　-〿＀-￯“”‘’]/u.test(ch) ? 2 : 1), 0);
const closing = /^[，。、；：？！）」』》”’…%,.;:?!)]/;
const opening = /[（「『《“‘(]$/;

test('cjkUnits: one unit per Chinese character, a Latin word or number whole, closing marks on the unit before, opening ones on the unit after, spaces kept as break points', () => {
  assert.deepEqual(cjkUnits('2014 年的“一个”'), ['2014', ' ', '年', '的', '“一', '个”']);
  assert.deepEqual(cjkUnits('约 pH 1.5，酸。'), ['约', ' ', 'pH', ' ', '1.5，', '酸。']);
  assert.deepEqual(cjkUnits('维生素 B12'), ['维', '生', '素', ' ', 'B12']);
});

test('wrapCjk: a number stays with the Chinese after it, lines fill to the width, nothing is lost', () => {
  const text = '2014 年的一项研究把过去“一个网球场”的估计下调到约 32 平方米，大部分面积来自绒毛和褶皱。';
  const lines = wrapCjk(text, 40, measure);
  assert.ok(lines[0].startsWith('2014 年的一项'), `the first line keeps going after the number: "${lines[0]}"`);
  for (const l of lines) assert.ok(measure(l) <= 40, `"${l}" fits`);
  for (const l of lines.slice(0, -1)) assert.ok(measure(l) > 40 - 6, `"${l}" is filled (no early break)`);
  assert.equal(lines.join('').replace(/ /g, ''), text.replace(/ /g, ''), 'every character kept, in order');
});

test('wrapCjk: no line starts with closing punctuation or ends with opening punctuation; a number or Latin word is never split', () => {
  const text = '流行的“10 比 1”说法在 2016 年被修正为约 38 万亿个细菌对 30 万亿个人体细胞。胃液通常在 pH 1.5 到 3.5 之间，酸到足以杀死大多数细菌。';
  for (let width = 12; width <= 60; width += 1) {
    const lines = wrapCjk(text, width, measure);
    for (const l of lines) {
      assert.ok(!closing.test(l), `width ${width}: "${l}" starts with a closing mark`);
      assert.ok(!opening.test(l), `width ${width}: "${l}" ends with an opening mark`);
      assert.ok(!/^ | $/.test(l), `width ${width}: "${l}" keeps a space at its edge`);
    }
    const words = lines.join('\n').match(/[A-Za-z0-9.]+/g);
    assert.deepEqual(words, ['10', '1', '2016', '38', '30', 'pH', '1.5', '3.5'], `width ${width}: numbers and Latin words whole`);
  }
});

test('wrapCjk: short text is one line; explicit line breaks are kept; a unit wider than the line stands alone', () => {
  assert.deepEqual(wrapCjk('胃液有多酸？', 40, measure), ['胃液有多酸？']);
  assert.deepEqual(wrapCjk('第一行\n第二行', 40, measure), ['第一行', '第二行']);
  assert.deepEqual(wrapCjk('Methanobrevibacter 古菌', 10, measure), ['Methanobrevibacter', '古菌']);
});

test('cjkUnits keeps the text whole and in order (review of plan 28, 2.1): a closing mark after a space, an opening mark before one, a name\'s dot and a dash never split', () => {
  for (const text of ['维生素 B12 ，很好', '说“ 一个”', '巴里·马歇尔', '研究——发现', '2014 年的“一个”', '约 pH 1.5，酸。']) {
    assert.equal(cjkUnits(text).join(''), text, `"${text}" comes back unchanged`);
  }
  assert.deepEqual(cjkUnits('维生素 B12 ，很好'), ['维', '生', '素', ' ', 'B12 ，', '很', '好']);
  assert.deepEqual(cjkUnits('巴里·马歇尔'), ['巴', '里·马', '歇', '尔']);
  assert.deepEqual(cjkUnits('研究——发现'), ['研', '究——发', '现']);
  for (let width = 6; width <= 20; width += 1) {
    for (const l of wrapCjk('维生素 B12 ，很好。巴里·马歇尔做了研究——发现', width, measure)) {
      assert.ok(!closing.test(l) && !/^[·—]/.test(l) && !/[·—]$/.test(l), `width ${width}: "${l}"`);
    }
  }
});

test("the quiz card's wrap (Quiz.js cjkWrap, every wrapped Text's wordWrap.callback): Chinese goes through wrapCjk at the Text's wrap width, anything else to Phaser's advanced wrap", async () => {
  await import('./support/scenes.js'); // Phaser's stand-in, before the scene module loads
  const { cjkWrap } = await import('../src/scenes/Quiz.js');
  const calls = [];
  const obj = { style: { wordWrapWidth: 40 }, context: { measureText: (s) => ({ width: measure(s) }) }, advancedWordWrap: (text, ctx, width) => (calls.push([text, width]), 'phaser') };
  assert.equal(cjkWrap('Short English text', obj), 'phaser');
  assert.deepEqual(calls, [['Short English text', 40]]);
  const zh = '2014 年的一项研究把过去“一个网球场”的估计下调到约 32 平方米。';
  assert.deepEqual(cjkWrap(zh, obj), wrapCjk(zh, 40, measure));
  assert.equal(calls.length, 1, 'Phaser\'s wrap not asked for Chinese');
});

