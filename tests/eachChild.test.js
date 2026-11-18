// Plan 35, 1.3: a Phaser group's getChildren() is the group's live array, and destroy() takes a child out
// of it. Destroying inside `for (const x of group.getChildren())` shifts the next child into the slot just
// visited, so it misses that frame (two pipes of a pair leave on the same frame: the mate skipped its
// move). eachChild walks a copy, as skipToFinish always did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { eachChild } from '../src/logic.js';

/** A group as Phaser keeps one: destroy() splices the child out of the live array and deactivates it. */
function group(xs) {
  const children = [];
  for (const [i, x] of xs.entries()) {
    const child = {
      name: `p${i}`,
      x,
      moves: 0,
      active: true,
      destroy() {
        const at = children.indexOf(this);
        if (at >= 0) children.splice(at, 1);
        this.active = false;
      },
    };
    children.push(child);
  }
  return { children, getChildren: () => children };
}

const W = 100; // T.pipeWidth's role: off the left edge past -W
const step = (pipe) => {
  pipe.x -= 10;
  pipe.moves += 1;
  if (pipe.x < -W) pipe.destroy();
};

test('the bug: a for-of over the live array skips the child after one it destroys', () => {
  const g = group([-95, -95, 300]);
  const [a, b, c] = g.children;
  for (const pipe of g.getChildren()) step(pipe);
  assert.equal(a.moves, 1);
  assert.equal(b.moves, 0, 'the mate missed its move');
  assert.equal(c.moves, 1);
});

test('eachChild: two pipes leave on the same frame, and both get their move', () => {
  const g = group([-95, -95, 300]);
  const [a, b, c] = g.children;
  eachChild(g.getChildren(), step);
  assert.deepEqual([a.moves, b.moves, c.moves], [1, 1, 1]);
  assert.equal(a.active || b.active, false, 'both left');
  assert.deepEqual(g.children, [c]);
});

test('eachChild: order kept; a child destroyed earlier in the walk is not visited; one added mid-walk waits a frame', () => {
  const g = group([10, 20, 30]);
  const [a, b, c] = g.children;
  const seen = [];
  eachChild(g.getChildren(), (child) => {
    seen.push(child.name);
    if (child === a) b.destroy();
    if (child === c) g.children.push({ name: 'new', active: true });
  });
  assert.deepEqual(seen, ['p0', 'p2']);
  assert.equal(g.children.length, 3);
});

test('eachChild: plain objects with no active flag are walked; an empty or missing list is nothing', () => {
  const seen = [];
  eachChild([{ n: 1 }, { n: 2 }], (o) => seen.push(o.n));
  assert.deepEqual(seen, [1, 2]);
  assert.doesNotThrow(() => eachChild([], () => assert.fail('called')));
  assert.doesNotThrow(() => eachChild(undefined, () => assert.fail('called')));
});

// The scenes: no loop over a live getChildren() destroys its own child.
const scenesDir = new URL('../src/scenes/', import.meta.url);

/** The body of the block whose `{` is at `open`, by brace count (scene code keeps braces in strings balanced). */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

test('no scene destroys a child inside a for-of over its live getChildren() (walk a copy, or eachChild)', () => {
  const offenders = [];
  let loops = 0;
  for (const file of readdirSync(scenesDir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(file, scenesDir), 'utf8');
    for (const m of src.matchAll(/for \(const (\w+) of ([\w.$]+)\.getChildren\(\)\) \{/g)) {
      loops += 1;
      if (new RegExp(`\\b${m[1]}\\.destroy\\(`).test(blockAt(src, m.index + m[0].length - 1))) offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
  }
  assert.ok(loops > 0, 'the regex still finds the loops');
  assert.deepEqual(offenders, []);
});

test("Play.update walks its pipes, items and beans with eachChild", () => {
  const play = readFileSync(new URL('Play.js', scenesDir), 'utf8');
  for (const g of ['pipes', 'items', 'beans']) assert.match(play, new RegExp(`eachChild\\(this\\.${g}\\.getChildren\\(\\), \\(\\w+\\) => \\{`), g);
});
