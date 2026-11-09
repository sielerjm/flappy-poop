import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scenesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'scenes');

/**
 * Phaser.Scene installs these as instance properties (plugins and systems) on
 * every scene before create() runs. A scene method with one of these names is
 * silently shadowed: `this.load(...)` becomes "this.load is not a function"
 * inside create(), which escapes Phaser's step and freezes the whole game.
 * Node never runs scenes, so this is the only place it can be caught.
 */
const RESERVED = [
  'add', 'anims', 'cache', 'cameras', 'children', 'data', 'events', 'game', 'input', 'lights', 'load',
  'make', 'matter', 'physics', 'plugins', 'registry', 'renderer', 'scale', 'scene', 'sound', 'sys',
  'textures', 'time', 'tweens', 'render',
];
const LIFECYCLE = new Set(['init', 'preload', 'create', 'update', 'constructor']);

/** Method names declared at class-body indentation (two spaces) in a scene file. */
function methodNames(source) {
  const names = [];
  for (const m of source.matchAll(/^ {2}(?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) names.push(m[1]);
  return names;
}

test('every scene file declares at least create() and no method shadows a Phaser.Scene property', () => {
  const files = readdirSync(scenesDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 9, `expected the scene files, got ${files.length}`);
  for (const file of files) {
    const names = methodNames(readFileSync(join(scenesDir, file), 'utf8'));
    assert.ok(names.includes('create') || names.includes('preload'), `${file}: no lifecycle method found (regex drift?)`);
    for (const name of names) {
      if (LIFECYCLE.has(name)) continue;
      assert.ok(!RESERVED.includes(name), `${file}: method "${name}()" shadows Phaser.Scene's this.${name}`);
    }
  }
});

test('no scene or ui module reads GAME_WIDTH: the live field is this.scale.width (wider on desktop), chrome sits in uiColumn()', () => {
  const uiDir = join(scenesDir, '..', 'ui');
  const files = [...readdirSync(scenesDir).map((f) => join(scenesDir, f)), ...readdirSync(uiDir).map((f) => join(uiDir, f))].filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 15, `expected the scene and ui files, got ${files.length}`);
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/\bGAME_WIDTH\b/.test(src), `${file}: uses GAME_WIDTH; read this.scale.width (the world) or uiColumn() (the chrome column) instead`);
  }
});

test('Play.js reads this.scale.width only to fit the field: its world is this.fieldW (a half of the canvas in a versus match)', () => {
  const src = readFileSync(join(scenesDir, 'Play.js'), 'utf8');
  const lines = src.split('\n').filter((line) => line.includes('scale.width'));
  assert.ok(lines.length >= 1, 'applyFieldSize still fits the canvas');
  for (const line of lines) {
    assert.match(line, /setGameSize|fieldWidth\(globalThis|this\.fieldW = this\.half/, `Play.js reads the canvas width outside the field fit: ${line.trim()}`);
  }
  assert.ok(/this\.fieldW/.test(src), 'the world width is this.fieldW');
});

test('the guard itself catches a shadowing method', () => {
  const names = methodNames('class X extends Phaser.Scene {\n  create() {\n  }\n\n  async load(a) {\n  }\n}');
  assert.deepEqual(names, ['create', 'load']);
});

// Helpers that read the level lengths (levels.pipes, directly or through another): Play must pass
// them this.tune (a tournament race's own table, or T), never bare T, or a half's finish lines,
// level bar and ghost would follow the normal 285-pair course in a 225-pair race.
const LEVEL_TABLE_HELPERS = ['courseDistance', 'coursePairStart', 'createCourse', 'hazardsAllowed', 'levelEnd', 'levelFor', 'levelPipes', 'levelProgress', 'nextTestLevel', 'rivalMarker', 'scriptedMysteryPair', 'skipPairs', 'testRunStart'];

/** Each call of one of `names` in `src` as { name, args } (top-level arguments, trimmed), parens balanced. */
function helperCalls(src, names) {
  const calls = [];
  const re = new RegExp(`\\b(${names.join('|')})\\(`, 'g');
  for (const m of src.matchAll(re)) {
    let depth = 1;
    let i = m.index + m[0].length;
    let arg = '';
    const args = [];
    for (; i < src.length && depth > 0; i += 1) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      if (c === ')' || c === ']' || c === '}') depth -= 1;
      if (depth === 0) break;
      if (c === ',' && depth === 1) {
        args.push(arg.trim());
        arg = '';
      } else arg += c;
    }
    args.push(arg.trim());
    calls.push({ name: m[1], args });
  }
  return calls;
}

const stripLineComments = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

test('Play.js passes this.tune, never bare T, to every helper that reads the level lengths', () => {
  const calls = helperCalls(stripLineComments(readFileSync(join(scenesDir, 'Play.js'), 'utf8')), LEVEL_TABLE_HELPERS);
  assert.ok(calls.length >= 15, `found ${calls.length} calls`);
  const bare = calls.filter((c) => c.args.includes('T')).map((c) => `${c.name}(${c.args.join(', ')})`);
  assert.deepEqual(bare, []);
  assert.ok(calls.every((c) => c.args.includes('this.tune')), 'each one names this.tune');
});

test('the level-table guard itself catches a bare T, nested calls included', () => {
  const calls = helperCalls('a = courseDistance(levelEnd(this.level, T), x + T.pipeWidth, p, this.tune);', LEVEL_TABLE_HELPERS);
  assert.deepEqual(calls.map((c) => [c.name, c.args.at(-1)]), [['courseDistance', 'this.tune'], ['levelEnd', 'T']]);
});
