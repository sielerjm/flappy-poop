// Plan 35, 2.3: the sounds no run needs in its first seconds load after Play's first frame, not in Boot,
// so the splash waits on less: the quiz's book sounds (ACC-010), the revive's sparkle, the challenge
// bubble's pop and the two-player flush. Scenes are read as text (AGENTS.md rule 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const LAZY = ['book-open', 'book-flip', 'book-close', 'sparkle', 'bubble-pop', 'flush'];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('Boot no longer loads the lazy sounds; Play loads each one, skipping a key already in', () => {
  const boot = read('src/scenes/Boot.js');
  const play = read('src/scenes/Play.js');
  for (const key of LAZY) {
    assert.doesNotMatch(boot, new RegExp(`load\\.audio\\(\\s*'${key}'`), `Boot still loads '${key}'`);
    assert.match(play, new RegExp(`if \\(!has\\('${key}'\\)\\) this\\.load\\.audio\\('${key}', 'assets/sfx/[^']+\\.mp3' \\+ V\\);`), `Play's lazy load lacks '${key}'`);
  }
  const body = play.slice(play.indexOf('  loadLazyAudio() {'), play.indexOf('\n  }\n', play.indexOf('  loadLazyAudio() {')));
  assert.ok(body.length > 0, 'Play has no loadLazyAudio()');
  assert.match(body, /this\.load\.start\(\)/, 'the lazy load is started');
  assert.match(body, /this\.registry\.get\('lazyAudio'\)/, 'one lazy load at a time across Play and PlayB');
});

test("Play's create starts the lazy load after its first frame", () => {
  const play = read('src/scenes/Play.js');
  const create = play.slice(play.indexOf('  create() {'), play.indexOf('\n  applyFieldSize() {'));
  assert.match(create, /this\.events\.once\('render', \(\) => this\.loadLazyAudio\(\)\)/);
});

test('every play of a lazy sound checks the key is in first (silence or a synth until it loads)', () => {
  const play = read('src/scenes/Play.js');
  assert.match(play, /playSample\(key, volume, fallback = null\) \{\n\s+if \(this\.cache\.audio\.exists\(key\)\)/, 'playSample checks the cache');
  for (const file of walk(join(root, 'src')).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8');
    for (const line of src.split('\n')) {
      for (const key of LAZY) {
        if (!new RegExp(`sound\\.(play|add)\\(\\s*'${key}'`).test(line)) continue;
        assert.match(line, new RegExp(`cache\\.audio\\.exists\\('${key}'\\)`), `${file}: '${key}' played without the exists check: ${line.trim()}`);
      }
    }
  }
});
