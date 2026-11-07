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
