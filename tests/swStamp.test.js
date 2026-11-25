// tools/sw_stamp.mjs (plan 35 Stage 3, the 3.0 design's D1 and D6): `npm run push` writes a content-hashed
// import map into index.html and the build's file list into sw.js. Most cases run on a small temp tree, so
// a change is easy to make and to see; the last ones read the real tree (planStamp writes nothing) and
// check, by their own reading of the code, that every file the game asks for is listed exactly as it asks.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { planStamp, writeStamp, checkStamp, stampSw, readSwStamp, swIsOff } from '../tools/sw_stamp.mjs';
import { SPLASH_NOTES, splashArtUrl } from '../src/splash.js';
import { SUPABASE_JS_VERSION } from '../src/supabaseLoader.js';
import { VERSION } from '../src/logic.js';

const REPO = new URL('..', import.meta.url).pathname;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const INDEX = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>t</title>
  <link rel="modulepreload" href="src/main.js">
  <link rel="modulepreload" href="src/scenes/Boot.js">
</head>
<body>
  <img class="splash-poop" src="assets/poop.png" alt="">
  <script>
    (function (w, d) { var s = d.createElement('script'); s.src = 'assets/vendor/phaser.min.js?v=4.2.1'; })(window, document);
  </script>
  <script>
    import('./src/splash.js').then((m) => m.startSplash(document, window)).catch(() => {});
  </script>
  <script type="module" src="src/main.js"></script>
</body>
</html>
`;

/** A small tree shaped like the game's: what the stamper reads, and the files it lists. */
function tree({ version = '1.2.3', lastUpdated = '1 Jan 2026, 00:00' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'flappy-swstamp-'));
  dirs.push(dir);
  const put = (p, s) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), s);
  };
  put('src/logic.js', `export const VERSION = '${version}';\nexport const LAST_UPDATED = '${lastUpdated}';\n`);
  put('src/main.js', "import './logic.js';\nimport { Boot } from './scenes/Boot.js';\n");
  put('src/scenes/Boot.js', "const V = '?v=x';\nthis.load.image('a', 'assets/a.png' + V);\nthis.load.audio('s', 'assets/sfx/s.mp3' + V);\n");
  put('src/splash.js', "export const NOTES = [{ art: { file: 'b.png' } }, { art: { file: 'a.png', frames: 2 } }];\n");
  put('src/supabaseLoader.js', "export const SUPABASE_JS_VERSION = '2.0.0';\nconst FILE = 'assets/vendor/supabase.js';\n");
  put('index.html', INDEX);
  put('sw.js', readFileSync(join(REPO, 'sw.js'), 'utf8'));
  for (const f of ['assets/a.png', 'assets/b.png', 'assets/poop.png', 'assets/sfx/s.mp3', 'assets/vendor/phaser.min.js', 'assets/vendor/supabase.js', 'assets/icon-192.png']) put(f, `bytes of ${f}`);
  return { dir, put, read: (p) => readFileSync(join(dir, p), 'utf8') };
}

const mapOf = (html) => {
  const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]).imports : null;
};
const short = (s) => sha(s).slice(0, 10);

test('the stamp: an import map after the charset meta and before every script and modulepreload; every module hashed; the main tag and preloads carry the same ?h=', () => {
  const t = tree();
  writeStamp(t.dir);
  const html = t.read('index.html');
  const map = mapOf(html);
  const modules = ['src/logic.js', 'src/main.js', 'src/scenes/Boot.js', 'src/splash.js', 'src/supabaseLoader.js'];
  assert.deepEqual(Object.keys(map).sort(), modules.map((m) => `./${m}`).sort(), 'every src/**/*.js, keyed as the page resolves it');
  for (const m of modules) assert.equal(map[`./${m}`], `./${m}?h=${short(t.read(m))}`, m);
  const at = html.indexOf('<script type="importmap">');
  assert.ok(html.indexOf('<meta charset="utf-8">') < at, 'after the charset meta (it must stay in the first 1024 bytes)');
  for (const later of ['<script>', '<script type="module"', '<link rel="modulepreload"']) assert.ok(at < html.indexOf(later), `before ${later}`);
  assert.match(html, new RegExp(`<script type="module" src="src/main\\.js\\?h=${short(t.read('src/main.js'))}"></script>`));
  assert.match(html, new RegExp(`<link rel="modulepreload" href="src/main\\.js\\?h=${short(t.read('src/main.js'))}">`));
  assert.match(html, new RegExp(`<link rel="modulepreload" href="src/scenes/Boot\\.js\\?h=${short(t.read('src/scenes/Boot.js'))}">`));
  assert.ok(html.includes("import('./src/splash.js')"), 'the inline import stays a bare specifier: the map resolves it');
});

test("sw.js: BUILD is VERSION plus a hash of the list; FILES lists index.html, every module and every asset as the page requests it", () => {
  const t = tree();
  const plan = writeStamp(t.dir);
  const { build, files } = readSwStamp(t.read('sw.js'));
  assert.equal(build, plan.build);
  assert.match(build, /^1\.2\.3-[0-9a-f]{10}$/);
  const urls = files.map(([u]) => u);
  assert.deepEqual(urls, [
    'index.html',
    `src/logic.js?h=${short(t.read('src/logic.js'))}`,
    `src/main.js?h=${short(t.read('src/main.js'))}`,
    `src/scenes/Boot.js?h=${short(t.read('src/scenes/Boot.js'))}`,
    `src/splash.js?h=${short(t.read('src/splash.js'))}`,
    `src/supabaseLoader.js?h=${short(t.read('src/supabaseLoader.js'))}`,
    'assets/a.png?v=1.2.3',
    'assets/b.png?v=1.2.3',
    'assets/poop.png',
    'assets/sfx/s.mp3?v=1.2.3',
    'assets/vendor/phaser.min.js?v=4.2.1',
    'assets/vendor/supabase.js?v=2.0.0',
  ]);
  for (const [u, h] of files) assert.equal(h, sha(readFileSync(join(t.dir, u.split('?')[0]))), `${u}: the SHA-256 of the file as stamped`);
  assert.ok(!urls.some((u) => /icon|manifest|sw\.js/.test(u)), 'icons, the manifest and sw.js stay out');
  assert.deepEqual(checkStamp(t.dir), []);
});

test('stamping is stable: the same tree gives byte-identical files, and restamping a stamped tree changes nothing', () => {
  const t = tree();
  const a = planStamp(t.dir);
  assert.deepEqual(planStamp(t.dir), a);
  writeStamp(t.dir);
  const html = t.read('index.html');
  const sw = t.read('sw.js');
  writeStamp(t.dir);
  assert.equal(t.read('index.html'), html);
  assert.equal(t.read('sw.js'), sw);
  assert.equal(planStamp(t.dir).build, a.build);
});

test('a push with the same VERSION (a new LAST_UPDATED): a new BUILD and a new ?h= for logic.js only', () => {
  const t = tree();
  const a = writeStamp(t.dir);
  t.put('src/logic.js', "export const VERSION = '1.2.3';\nexport const LAST_UPDATED = '2 Jan 2026, 09:00';\n");
  const b = writeStamp(t.dir);
  assert.notEqual(b.build, a.build);
  assert.match(b.build, /^1\.2\.3-/);
  const changed = Object.keys(b.imports).filter((k) => b.imports[k] !== a.imports[k]);
  assert.deepEqual(changed, ['./src/logic.js']);
  const assets = (p) => p.files.filter(([u]) => u.startsWith('assets/'));
  assert.deepEqual(assets(b), assets(a), 'the art and sound URLs stay');
});

test('a VERSION bump: a new BUILD and new ?v= art and sound URLs; the vendored files keep their own pins', () => {
  const t = tree();
  const a = writeStamp(t.dir);
  t.put('src/logic.js', "export const VERSION = '1.3.0';\nexport const LAST_UPDATED = '1 Jan 2026, 00:00';\n");
  const b = writeStamp(t.dir);
  assert.match(b.build, /^1\.3\.0-/);
  const urls = b.files.map(([u]) => u);
  assert.ok(urls.includes('assets/a.png?v=1.3.0') && urls.includes('assets/sfx/s.mp3?v=1.3.0'));
  assert.ok(urls.includes('assets/vendor/phaser.min.js?v=4.2.1') && urls.includes('assets/vendor/supabase.js?v=2.0.0'));
  assert.equal(b.imports['./src/main.js'], a.imports['./src/main.js'], 'an unchanged module keeps its URL');
});

test('checkStamp names what is wrong: a BUILD for another VERSION, a module or asset not listed, a stale hash, a listed file gone', () => {
  const t = tree();
  writeStamp(t.dir);
  t.put('sw.js', t.read('sw.js').replace(/const BUILD = '1\.2\.3-/, "const BUILD = '1.2.2-"));
  assert.match(checkStamp(t.dir).join('\n'), /BUILD 1\.2\.2-\S+ is not for VERSION 1\.2\.3/);

  writeStamp(t.dir);
  t.put('src/ui/new.js', 'export const x = 1;\n'); // a module added after the stamp
  t.put('src/scenes/Boot.js', t.read('src/scenes/Boot.js') + "this.load.image('c', 'assets/c.png' + V);\n");
  t.put('assets/c.png', 'c');
  t.put('assets/a.png', 'a changed');
  rmSync(join(t.dir, 'assets/b.png'));
  const problems = checkStamp(t.dir).join('\n');
  assert.match(problems, /src\/ui\/new\.js: not in the import map/);
  assert.match(problems, /src\/ui\/new\.js\?h=[0-9a-f]{10}: not in sw\.js FILES/);
  assert.match(problems, /assets\/c\.png\?v=1\.2\.3: not in sw\.js FILES/);
  assert.match(problems, /assets\/a\.png\?v=1\.2\.3: its hash in FILES is not the file's/);
  assert.match(problems, /assets\/b\.png\?v=1\.2\.3: listed, but assets\/b\.png is missing/);
  assert.match(problems, /src\/scenes\/Boot\.js: stale \?h= in the import map/);
});

test('the kill switch: an sw.js that is tools/sw-off.js is left byte for byte; index.html is still stamped', () => {
  const t = tree();
  const off = readFileSync(join(REPO, 'tools/sw-off.js'), 'utf8');
  t.put('sw.js', off);
  assert.equal(swIsOff(off), true);
  const plan = writeStamp(t.dir);
  assert.equal(plan.off, true);
  assert.equal(t.read('sw.js'), off);
  assert.ok(mapOf(t.read('index.html')), 'the import map is still written');
  assert.deepEqual(checkStamp(t.dir), []);
});

test('stampSw replaces only the stamp block and refuses a file without one', () => {
  const sw = readFileSync(join(REPO, 'sw.js'), 'utf8');
  const out = stampSw(sw, '1.0.0-abcdef0123', [['index.html', 'a'.repeat(64)]]);
  assert.deepEqual(readSwStamp(out), { build: '1.0.0-abcdef0123', files: [['index.html', 'a'.repeat(64)]] });
  const strip = (s) => s.replace(/\/\/ --- stamp[\s\S]*?\/\/ --- end of stamp ---/, '');
  assert.equal(strip(out), strip(sw), 'nothing outside the block changes');
  assert.ok(readSwStamp(sw), 'the committed sw.js has a stamp block (empty, or the last push\'s)');
  assert.deepEqual(readSwStamp(stampSw(sw, '', [])), { build: '', files: [] }, 'an empty stamp reads back empty');
  assert.throws(() => stampSw('self.addEventListener("fetch", () => {});', 'b', []), /no stamp block/);
});

// --- the real tree: what the game asks for, read by this test's own patterns ---

/** Every file under src/ ending .js, as the page's URL path. */
function modules() {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(join(REPO, d))) {
      const p = join(d, n);
      if (statSync(join(REPO, p)).isDirectory()) walk(p);
      else if (n.endsWith('.js')) out.push(p);
    }
  };
  walk('src');
  return out.sort();
}

test('the real tree: every src/**/*.js is in the import map and in FILES, each with its own hash', () => {
  const plan = planStamp(REPO);
  const urls = new Set(plan.files.map(([u]) => u));
  for (const m of modules()) {
    const h = short(readFileSync(join(REPO, m)));
    assert.equal(plan.imports[`./${m}`], `./${m}?h=${h}`, `${m} in the map`);
    assert.ok(urls.has(`${m}?h=${h}`), `${m} in FILES`);
  }
  assert.match(plan.build, new RegExp(`^${VERSION.replace(/\./g, '\\.')}-[0-9a-f]{10}$`));
});

test('the real tree: every asset Boot, loadLazyAudio, the splash cards, the trap and supabaseLoader ask for is listed with the query it is asked with', () => {
  const plan = planStamp(REPO);
  const urls = new Set(plan.files.map(([u]) => u));
  const read = (p) => readFileSync(join(REPO, p), 'utf8');
  const want = new Set();
  for (const m of read('src/scenes/Boot.js').matchAll(/this\.load\.(?:image|spritesheet|audio)\('[^']+', '(assets\/[^']+)' \+ V/g)) want.add(`${m[1]}?v=${VERSION}`);
  const play = read('src/scenes/Play.js');
  const lazy = play.slice(play.indexOf('  loadLazyAudio() {'), play.indexOf('\n  }\n', play.indexOf('  loadLazyAudio() {')));
  for (const m of lazy.matchAll(/this\.load\.audio\('[^']+', '(assets\/[^']+)' \+ V\)/g)) want.add(`${m[1]}?v=${VERSION}`);
  for (const n of SPLASH_NOTES) if (n.art?.file) want.add(splashArtUrl(n.art.file));
  const html = read('index.html');
  want.add(/s\.src = '(assets\/vendor\/phaser\.min\.js\?v=[^']+)'/.exec(html)[1]);
  want.add(/<img class="splash-poop" src="(assets\/[^"]+)"/.exec(html)[1]);
  want.add(`assets/vendor/supabase.js?v=${SUPABASE_JS_VERSION}`);
  assert.ok(want.size >= 40, `found ${want.size} asset URLs in the code`);
  for (const u of want) assert.ok(urls.has(u), `${u} is not in FILES`);
  const listed = plan.files.map(([u]) => u).filter((u) => u.startsWith('assets/'));
  for (const u of listed) {
    assert.ok(want.has(u), `${u} is listed but no code asks for it`);
    assert.ok(existsSync(join(REPO, u.split('?')[0])), `${u}: the file exists`);
  }
  const bytes = plan.files.reduce((n, [u]) => n + statSync(join(REPO, u === 'index.html' ? 'index.html' : u.split('?')[0])).size, 0);
  assert.ok(bytes < 6e6, `one build in Cache Storage is ${(bytes / 1e6).toFixed(2)} MB (the design's estimate: about 4.7 MB)`);
});

test('the committed tree is unstamped or consistently stamped (the push restamps it)', () => {
  const sw = readSwStamp(readFileSync(join(REPO, 'sw.js'), 'utf8'));
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  if (!sw.build) {
    assert.deepEqual(sw.files, []);
    return;
  }
  assert.ok(mapOf(html), 'a stamped sw.js comes with a stamped index.html');
});

// AUD-155 and AUD-156 (audit 2026-11-25): a stamp that names a file git does not track would 404 for every
// player at install, and a stamped tree whose files moved on would deploy old modules behind new bytes.
const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', dir, ...args], { stdio: 'pipe' }).toString();
const SW_STAMP = join(REPO, 'tools/sw_stamp.mjs');

test('AUD-156: checkStamp refuses a stamped file git does not track (push only commits tracked files)', () => {
  const t = tree();
  git(t.dir, 'init', '-q');
  git(t.dir, 'add', '-A');
  git(t.dir, 'commit', '-q', '-m', 'base');
  writeStamp(t.dir);
  assert.deepEqual(checkStamp(t.dir), [], 'every listed file is tracked: nothing wrong');
  t.put('src/extra.js', 'export const x = 1;\n');
  t.put('assets/vendor/new.js', 'x');
  writeStamp(t.dir);
  const problems = checkStamp(t.dir).join('\n');
  assert.match(problems, /src\/extra\.js: .*not track/);
  git(t.dir, 'add', 'src/extra.js');
  assert.doesNotMatch(checkStamp(t.dir).join('\n'), /extra\.js/, 'tracked once added');
});

test('AUD-156: a tree that is not its own git repo is not judged on tracking', () => {
  const t = tree();
  writeStamp(t.dir);
  assert.deepEqual(checkStamp(t.dir), []);
});

test('AUD-155: --check-if-stamped passes an unstamped tree and a fresh stamp, and fails a stamp the files moved past', () => {
  const run = (dir) => {
    try {
      execFileSync('node', [SW_STAMP, `--root=${dir}`, '--check-if-stamped'], { stdio: 'pipe' });
      return 0;
    } catch (err) {
      return err.status;
    }
  };
  const t = tree();
  assert.equal(run(t.dir), 0, 'unstamped (before the first push): nothing to be stale');
  writeStamp(t.dir);
  assert.equal(run(t.dir), 0, 'fresh');
  t.put('src/main.js', "import './logic.js';\nconsole.log('changed after the stamp');\n");
  assert.equal(run(t.dir), 1, 'stale: new bytes behind the old ?h=');
});

test('AUD-155: the pre-push hook checks the stamp of a push to main, and only of main', () => {
  const hook = join(REPO, 'tools/git-hooks/pre-push');
  assert.ok(statSync(hook).mode & 0o100, 'executable');
  const text = readFileSync(hook, 'utf8');
  assert.match(text, /refs\/heads\/main/);
  assert.match(text, /sw_stamp\.mjs" --check-if-stamped/);
  const run = (ref) => execFileSync('sh', [hook], { cwd: REPO, input: `${ref} abc ${ref} def\n`, stdio: 'pipe' });
  run('refs/heads/main'); // the real tree is unstamped or fresh: exits 0
  run('refs/heads/other');
});
