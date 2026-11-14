// Text with links (plan 26): src/richText.js, with a measure of 10 px a character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRich, linkSpans } from '../src/richText.js';

const measure = (s) => s.length * 10;
const W = 'https://en.wikipedia.org/wiki/';

test('linkSpans: the first whole-word occurrence of each term; a term inside a longer word, a missing one or an overlapping one links nothing; the spans join back into the text', () => {
  const text = 'Bile from the liver is toxic, and bile acids feed Bilophila.';
  const spans = linkSpans(text, [
    { term: 'bile acids', href: `${W}Bile_acid` },
    { term: 'Bile', href: `${W}Bile` },
    { term: 'liver', href: `${W}Liver` },
    { term: 'acids feed', href: `${W}Nope` }, // overlaps "bile acids"
    { term: 'kidney', href: `${W}Kidney` }, // not in the text
    { term: 'Bilo', href: `${W}Nope` }, // only inside "Bilophila"
  ]);
  assert.equal(spans.map((s) => s.text).join(''), text);
  assert.deepEqual(spans.filter((s) => s.href).map((s) => [s.text, s.href.slice(W.length)]), [['Bile', 'Bile'], ['liver', 'Liver'], ['bile acids', 'Bile_acid']]);
  assert.deepEqual(linkSpans('plain text', []), [{ text: 'plain text' }]);
  assert.deepEqual(linkSpans('', [{ term: 'x', href: 'y' }]), []);
  assert.deepEqual(linkSpans('Escherichia coli (E. coli) lives here.', [{ term: 'E. coli', href: `${W}Escherichia_coli` }]).map((s) => s.text), ['Escherichia coli (', 'E. coli', ') lives here.'], 'regex characters in a term are literal');
});

test('layoutRich: greedy wrapping at spaces within maxWidth, lines centred, parts placed left to right with the spaces inside them', () => {
  const spans = linkSpans('Stomach acid kills most microbes we swallow, so it is the first barrier.', [{ term: 'Stomach acid', href: `${W}Gastric_acid` }]);
  const lines = layoutRich(spans, { measure, maxWidth: 200 });
  for (const line of lines) {
    assert.ok(line.width <= 200 || !line.text.includes(' '), `"${line.text}" fits`);
    assert.equal(line.x, -line.width / 2);
    assert.equal(line.parts.map((p) => p.text).join(''), line.text);
    let left = 0;
    for (const p of line.parts) {
      assert.equal(p.x, left);
      left += p.width;
    }
    assert.equal(left, line.width, 'the parts add up to the line');
  }
  assert.equal(lines.map((l) => l.text).join(' '), 'Stomach acid kills most microbes we swallow, so it is the first barrier.', 'no word lost, one space at each break');
  assert.deepEqual(lines[0].parts[0], { text: 'Stomach acid', x: 0, width: 120, href: `${W}Gastric_acid` }, 'the link, its two words together');
  assert.equal(lines[0].parts[1].text.startsWith(' '), true, 'the space after a link is plain');
  // The same wrap as a plain greedy wrap of the whole text.
  const plain = layoutRich([{ text: lines.map((l) => l.text).join(' ') }], { measure, maxWidth: 200 });
  assert.deepEqual(plain.map((l) => l.text), lines.map((l) => l.text));
});

test('layoutRich: a link split by a line break stays a link on both lines; a word wider than the line gets a line of its own; a link inside a word keeps the word whole', () => {
  const href = `${W}Small_intestine`;
  const lines = layoutRich(linkSpans('aaaa small intestine bbbb', [{ term: 'small intestine', href }]), { measure, maxWidth: 110 });
  assert.deepEqual(lines.map((l) => l.text), ['aaaa small', 'intestine', 'bbbb']);
  assert.deepEqual(lines.map((l) => l.parts.filter((p) => p.href).map((p) => p.text)), [['small'], ['intestine'], []]);
  const long = layoutRich([{ text: 'a supercalifragilistic b' }], { measure, maxWidth: 100 });
  assert.deepEqual(long.map((l) => l.text), ['a', 'supercalifragilistic', 'b']);
  const inside = layoutRich(linkSpans("the bile's job", [{ term: 'bile', href: `${W}Bile` }]), { measure, maxWidth: 1000 });
  assert.deepEqual(inside[0].parts.map((p) => [p.text, Boolean(p.href)]), [['the ', false], ['bile', true], ["'s job", false]]);
});
