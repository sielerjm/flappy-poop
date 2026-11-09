// Orphan audit: code, config, copy and art that nothing in the game uses any more.
// Each check reads the sources as text (zero deps, like tests/scenes.test.js) and
// fails on something defined but never used, so neglected code cannot pile up.
// A thing kept on purpose goes in an allowlist below with a one-line reason; an
// allowlist entry that stops being true (the thing is gone, or is now used) fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CONFIG from '../src/config.js';
import { catalogFor } from '../src/i18n.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Exports nothing in src/ or tools/ uses, kept on purpose: name → why. Tests never count as a use. */
const ALLOWED_EXPORTS = {
  catalogKeys: 'test hook: tests/i18n.test.js checks every locale against the English keys',
  catalogFor: 'test hook: tests/i18n.test.js and this audit read a whole locale',
  _resetKeeperForTests: 'test hook: tests/sound.test.js resets the silent-audio keeper between tests',
  pipeMoveShiftPx: "test guard: tests/pipeMove.test.js and tuning.test.js keep every moving-pipe row under half the poop's clearance",
  glowAlphaAt: "test reference: the glow's alpha profile that glowStops() draws (tests/fart.test.js)",
  topScores: 'test hook: tests/save.test.js reads top lists as plain numbers (its last game use, isNewTop, is gone)',
  createTournament: 'tournament plan (2026-11-09-tournament-a), step 5 wires it into the lobby; remove this entry then',
  nextMatch: 'tournament plan, step 5 races the queue; remove this entry then',
  recordResult: 'tournament plan, step 5 records each race; remove this entry then',
  placings: 'tournament plan, step 5 shows the podium; remove this entry then',
  raceOutcome: 'tournament plan, step 4 decides a tournament race with it; remove this entry then',
};

/** UI string keys no source names literally: prefix → why (they are built at run time). */
const ALLOWED_KEY_PREFIXES = {
  'level.': 'levelBannerText builds `level.${key}` from LEVELS',
};

/** UI string keys kept although nothing shows them: key → why. */
const ALLOWED_KEYS = {};

/** The config objects whose every leaf must be read somewhere in src/ (outside config.js). */
const CONFIG_ROOTS = ['TUNING', 'FIELD', 'LEADERBOARD', 'TEST_MODE', 'SHARE', 'BACKGROUND'];

/** Config leaves nothing reads, kept on purpose: dotted path → why. */
const ALLOWED_KNOBS = {};

// --- scanners (pure; the self-tests at the bottom prove each can fail) ---

/**
 * Source with its comments removed, strings kept (a name inside a string is a use:
 * the smoke driver's evaluate() templates call game code). Quotes are tracked so a
 * `//` inside a string is not a comment; ' and " strings end at a newline, which
 * bounds the damage a regex literal with a quote in it can do to one line.
 */
function stripComments(src) {
  let out = '';
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 1;
      } else if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i + 1 < src.length && src[i + 1] !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 1;
      out += ' ';
    } else out += c;
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (name, flags = '') => new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`, flags);
const quotedRe = (name) => new RegExp(`['"\`]${escapeRe(name)}['"\`]`);

/** Names a module exports by declaration (`export function / const / let / class`). */
function exportedNames(src) {
  return [...src.matchAll(/^export (?:async )?(?:function\*?\s*|const |let |class )([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
}

/**
 * Exports no other file uses and their own file never uses past the declaration.
 * `files` maps a path to comment-stripped source; `modules` are the paths whose
 * exports are audited (the rest are only places a use may sit).
 */
function orphanExports(files, modules) {
  const out = [];
  for (const path of modules) {
    for (const name of exportedNames(files[path])) {
      const elsewhere = Object.entries(files).some(([p, src]) => p !== path && wordRe(name).test(src));
      const ownUses = (files[path].match(wordRe(name, 'g')) ?? []).length;
      if (!elsewhere && ownUses < 2) out.push(`${path}: ${name}`);
    }
  }
  return out;
}

/**
 * Whether a haystack names a key: in quotes, or for a numbered key (poop-stink2) as
 * its stem in a template literal (`poop-stink${n}`), the way poopFrame picks a frame.
 */
function namesKey(key, haystack) {
  if (quotedRe(key).test(haystack)) return true;
  const stem = /^(.*\D)\d+$/.exec(key)?.[1];
  return Boolean(stem) && new RegExp(`\`${escapeRe(stem)}\\$\\{`).test(haystack);
}

/** Keys no haystack names (see namesKey). */
function unquotedKeys(keys, haystack) {
  return keys.filter((k) => !namesKey(k, haystack));
}

/** Dotted config leaves: arrays and numeric-keyed maps (a pair → kind table) are leaves. */
function configLeaves(obj, path = []) {
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = [...path, k];
    const branch = v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).every((x) => /^\d+$/.test(x));
    return branch ? configLeaves(v, p) : [p];
  });
}

/**
 * Whether a leaf is read: a top-level knob by its bare name (scenes write T.gravity,
 * logic destructures { maxFallAngle } from its tuning argument); a nested one as
 * `parent.leaf`, or with its parent and its name in one file (destructuring again).
 */
function knobUsed(path, sources) {
  const leaf = path[path.length - 1];
  if (path.length === 2) return sources.some((s) => wordRe(leaf).test(s));
  const parent = path[path.length - 2];
  const direct = new RegExp(`(?<![\\w$])${escapeRe(parent)}\\??\\.${escapeRe(leaf)}(?![\\w$])`);
  return sources.some((s) => direct.test(s) || (wordRe(parent).test(s) && wordRe(leaf).test(s)));
}

/** A method's body in a class file (two-space indented, as tests/scenes.test.js reads them). */
function methodBody(src, name) {
  const start = src.search(new RegExp(`^ {2}${escapeRe(name)}\\([^)]*\\)\\s*\\{`, 'm'));
  assert.ok(start >= 0, `method ${name}() not found`);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end < 0 ? undefined : end);
}

// --- the repo, read once ---

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const read = (abs) => stripComments(readFileSync(abs, 'utf8'));
const rel = (abs) => relative(ROOT, abs);
const srcPaths = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
const toolPaths = readdirSync(join(ROOT, 'tools')).filter((n) => /\.m?js$/.test(n)).map((n) => join(ROOT, 'tools', n));
const SRC = Object.fromEntries(srcPaths.map((f) => [rel(f), read(f)]));
const CODE = { ...SRC, ...Object.fromEntries(toolPaths.map((f) => [rel(f), read(f)])) };

const exportsIn = (src) => new Set(exportedNames(src));
const allExports = new Set(Object.values(SRC).flatMap((s) => [...exportsIn(s)]));

/** src/i18n.js split into the catalog object and the rest (the helpers that use keys). */
function i18nParts() {
  const src = SRC['src/i18n.js'];
  const start = src.indexOf('const STRINGS = {');
  const end = src.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'STRINGS catalog not found in src/i18n.js (regex drift?)');
  return { helpers: src.slice(0, start) + src.slice(end) };
}

const EN_KEYS = Object.keys(catalogFor('en'));
const keyUses = () => [...Object.entries(SRC).filter(([p]) => p !== 'src/i18n.js').map(([, s]) => s), i18nParts().helpers].join('\n');
const keyAllowed = (k) => k in ALLOWED_KEYS || Object.keys(ALLOWED_KEY_PREFIXES).some((p) => k.startsWith(p));

// --- the audit ---

test('every export in src/ is used by src/ or tools/ (tests do not count), or is allowlisted with a reason', () => {
  const orphans = orphanExports(CODE, Object.keys(SRC)).filter((o) => !(o.split(': ')[1] in ALLOWED_EXPORTS));
  assert.deepEqual(orphans, [], `unused exports (delete them, or add a reason to ALLOWED_EXPORTS in tests/orphans.test.js):\n  ${orphans.join('\n  ')}`);
});

test('every config knob is read somewhere in src/ outside config.js, or is allowlisted with a reason', () => {
  const sources = Object.entries(SRC).filter(([p]) => p !== 'src/config.js').map(([, s]) => s);
  const leaves = CONFIG_ROOTS.flatMap((r) => (CONFIG[r] ? configLeaves(CONFIG[r], [r]) : []));
  assert.ok(leaves.length > 100, `expected the config leaves, got ${leaves.length} (did CONFIG_ROOTS drift?)`);
  const unused = leaves.map((p) => p.join('.')).filter((p) => !(p in ALLOWED_KNOBS) && !knobUsed(p.split('.'), sources));
  assert.deepEqual(unused, [], `config knobs nothing reads (delete them, or add a reason to ALLOWED_KNOBS):\n  ${unused.join('\n  ')}`);
});

test('every UI string key is named in quotes outside the catalog, or is allowlisted with a reason', () => {
  assert.ok(EN_KEYS.length > 50, `expected the catalog, got ${EN_KEYS.length} keys`);
  const unused = unquotedKeys(EN_KEYS, keyUses()).filter((k) => !keyAllowed(k));
  assert.deepEqual(unused, [], `UI strings nothing shows (delete them in every locale and TRANSLATION_NOTES.md, or allowlist):\n  ${unused.join('\n  ')}`);
});

test('every texture Boot loads by a literal key is used somewhere in src/', () => {
  const boot = SRC['src/scenes/Boot.js'];
  const loads = [...boot.matchAll(/this\.load\.(?:image|spritesheet)\(\s*['"]([^'"]+)['"][^\n]*/g)];
  assert.ok(loads.length >= 20, `expected Boot's texture loads, got ${loads.length}`);
  const bootRest = loads.reduce((s, m) => s.replace(m[0], ''), boot);
  const haystack = [...Object.entries(SRC).filter(([p]) => p !== 'src/scenes/Boot.js').map(([, s]) => s), bootRest].join('\n');
  const unused = unquotedKeys(loads.map((m) => m[1]), haystack);
  assert.deepEqual(unused, [], `textures loaded but never drawn (drop the load and the file, or use it):\n  ${unused.join('\n  ')}`);
});

test("every overlay scene in main.js is wired into Play's chrome: chromeArgs, padTop and a launch", () => {
  const main = SRC['src/main.js'];
  const play = SRC['src/scenes/Play.js'];
  const registered = /scene:\s*\[([^\]]+)\]/.exec(main)[1].split(',').map((s) => s.trim());
  const overlays = registered.filter((s) => !['Boot', 'Play', "new Play('PlayB')", 'Over', 'Versus'].includes(s));
  assert.ok(overlays.length >= 7, `expected the overlays (seven since the High scores page went), got ${overlays.join(', ')}`);
  const chromeArgs = methodBody(play, 'chromeArgs');
  const padTop = methodBody(play, 'padTop');
  const scenes = Object.entries(SRC).filter(([p]) => p.startsWith('src/scenes/')).map(([, s]) => s).join('\n');
  for (const key of overlays) {
    assert.ok(chromeArgs.includes(`isActive('${key}')`), `Play.chromeArgs never asks whether ${key} is open`);
    assert.ok(padTop.includes(`'${key}'`), `Play.padTop does not map ${key}: a controller cannot reach it`);
    assert.ok(scenes.includes(`launch('${key}'`), `no scene launches ${key}`);
  }
});

test('every allowlist entry still holds: the thing exists, is still unused, and says why', () => {
  const stillOrphan = new Set(orphanExports(CODE, Object.keys(SRC)).map((o) => o.split(': ')[1]));
  for (const [name, why] of Object.entries(ALLOWED_EXPORTS)) {
    assert.ok(why.trim().length > 0, `ALLOWED_EXPORTS.${name} has no reason`);
    assert.ok(allExports.has(name), `ALLOWED_EXPORTS.${name}: no such export any more; drop the entry`);
    assert.ok(stillOrphan.has(name), `ALLOWED_EXPORTS.${name}: now used by src/ or tools/; drop the entry`);
  }
  const quoted = new Set(EN_KEYS.filter((k) => quotedRe(k).test(keyUses())));
  for (const [key, why] of Object.entries(ALLOWED_KEYS)) {
    assert.ok(why.trim().length > 0, `ALLOWED_KEYS.${key} has no reason`);
    assert.ok(EN_KEYS.includes(key), `ALLOWED_KEYS.${key}: no such key any more; drop the entry`);
    assert.ok(!quoted.has(key), `ALLOWED_KEYS.${key}: now used; drop the entry`);
  }
  for (const prefix of Object.keys(ALLOWED_KEY_PREFIXES)) {
    assert.ok(EN_KEYS.some((k) => k.startsWith(prefix)), `ALLOWED_KEY_PREFIXES '${prefix}' matches no key; drop the entry`);
  }
  const leaves = new Set(CONFIG_ROOTS.flatMap((r) => (CONFIG[r] ? configLeaves(CONFIG[r], [r]) : [])).map((p) => p.join('.')));
  for (const path of Object.keys(ALLOWED_KNOBS)) assert.ok(leaves.has(path), `ALLOWED_KNOBS.${path}: no such knob any more; drop the entry`);
});

// --- the scanners can fail ---

test('stripComments drops comments and keeps strings, URLs included', () => {
  const out = stripComments("const a = 'http://x'; // used()\n/* used() */ const b = `//${c}`;\nconst re = /'/; useMe();");
  assert.ok(out.includes("'http://x'") && out.includes('`//${c}`'), out);
  assert.ok(!/used\(\)/.test(out), `comments survived: ${out}`);
  assert.ok(out.includes('useMe()'), 'a quote in a regex literal swallows at most its own line');
});

test('orphanExports reports an export used nowhere, even when a comment names it', () => {
  const files = {
    'src/a.js': stripComments('export function used() {}\nexport function dead() {}\nexport const self = 1;\nconst x = self;'),
    'src/b.js': stripComments("import { used } from './a.js';\nused(); // dead() was here"),
  };
  assert.deepEqual(orphanExports(files, ['src/a.js']), ['src/a.js: dead']);
});

test('unquotedKeys, configLeaves and knobUsed report what nothing names', () => {
  assert.deepEqual(unquotedKeys(['shown', 'hidden'], stripComments("t(locale, 'shown') // 'hidden'")), ['hidden']);
  assert.deepEqual(unquotedKeys(['face1', 'face2', 'tail3'], 'return `face${n}`; const k = `tail-${n}`;'), ['tail3']);
  assert.deepEqual(configLeaves({ a: 1, b: { c: [1, 2], d: { 3: 'x', 9: 'y' } } }, ['T']).map((p) => p.join('.')), ['T.a', 'T.b.c', 'T.b.d']);
  assert.equal(knobUsed(['T', 'pipeMove', 'chance'], ['x = T.pipeMove.chance']), true);
  assert.equal(knobUsed(['T', 'pipeMove', 'chance'], ['const { chance } = t.pipeMove']), true);
  assert.equal(knobUsed(['T', 'pipeMove', 'chance'], ['x = T.items.chance']), false);
  assert.equal(knobUsed(['T', 'gravity'], ['x = 1']), false);
});
