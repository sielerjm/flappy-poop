#!/usr/bin/env node
// tools/sw_stamp.mjs: the service worker's stamp (plan 35, Stage 3, the 3.0 design's D1 and D6), written by
// `npm run push` right after LAST_UPDATED, so it hashes the files that are committed.
//
// index.html gets an import map (after its charset meta, before every script) that sends every module to
// src/<path>.js?h=<first 10 hex of its SHA-256>; the main module tag and the modulepreload hrefs carry the
// same ?h=. Source files keep their bare imports (Node tests are untouched); a ?h= URL's bytes never change,
// so a cached copy is right whatever build a page or the worker is on, and an unchanged module keeps its URL.
// sw.js gets BUILD (<VERSION>-<10 hex over the list>) and FILES: [URL exactly as the page asks for it,
// SHA-256 of the bytes] for index.html, every module, and every file the code asks for under assets/
// (?v=<VERSION> for the art and sounds in src/, the splash's <img> as written, the vendored Phaser and
// supabase-js with their own pins). Icons and the manifest stay out (the OS keeps those).
// An sw.js holding FLAPPY_SW_OFF (tools/sw-off.js copied over it) is left as it is.
//
// Usage: node tools/sw_stamp.mjs [--check | --check-if-stamped] [--root=DIR]   (stamp and check; --check only checks;
//        --check-if-stamped is the pre-push hook's: an unstamped tree passes, a stamped one must be fresh)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STAMP_RE = /\/\/ --- stamp[^\n]*\n[\s\S]*?\/\/ --- end of stamp ---/;
const MAP_RE = /\n[ \t]*<!-- sw_stamp[^>]*-->\n[ \t]*<script type="importmap">[\s\S]*?<\/script>/;
const TAG_RE = /(<link rel="modulepreload" href="|<script type="module" src=")(src\/[\w/.-]+\.js)(?:\?h=[0-9a-f]+)?(")/g;
const MAP_NOTE = '<!-- sw_stamp: the import map, written by npm run push (tools/sw_stamp.mjs); every module at its content hash, so a cached copy is never another build\'s -->';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shortHash = (bytes) => sha256(bytes).slice(0, 10);

/** True for the kill switch (tools/sw-off.js), which the stamp leaves alone. */
export function swIsOff(source) {
  return /FLAPPY_SW_OFF/.test(source);
}

/** { build, files } from sw.js's stamp block, or null when it has none. */
export function readSwStamp(source) {
  const block = STAMP_RE.exec(source)?.[0];
  if (!block) return null;
  const build = /const BUILD = '([^']*)';/.exec(block)?.[1];
  const files = /const FILES = (\[[\s\S]*?\]);\n/.exec(block)?.[1];
  if (build == null || files == null) return null;
  return { build, files: JSON.parse(files) };
}

/** sw.js with its stamp block rewritten to `build` and `files`; nothing else changes. Throws on a file with no block. */
export function stampSw(source, build, files) {
  const block = STAMP_RE.exec(source)?.[0];
  if (!block) throw new Error('sw_stamp: sw.js has no stamp block (// --- stamp … // --- end of stamp ---)');
  const list = files.length ? `[\n${files.map((f) => `  ${JSON.stringify(f)}`).join(',\n')}\n]` : '[]';
  const next = `${block.split('\n')[0]}\nconst BUILD = '${build}';\nconst FILES = ${list};\n// --- end of stamp ---`;
  return source.replace(STAMP_RE, () => next);
}

/** The import map's `imports`, or null. */
export function importMapOf(html) {
  const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]).imports : null;
}

/** index.html with the import map (any old one replaced) and the module tags' ?h= from `imports`. */
export function stampIndex(html, imports) {
  const bare = html.replace(MAP_RE, '');
  const entries = Object.keys(imports).map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(imports[k])}`);
  const block = `\n  ${MAP_NOTE}\n  <script type="importmap">\n  {"imports": {\n${entries.join(',\n')}\n  }}\n  </script>`;
  if (!bare.includes('<meta charset="utf-8">')) throw new Error('sw_stamp: index.html has no <meta charset="utf-8"> to put the import map after');
  return bare.replace('<meta charset="utf-8">', () => `<meta charset="utf-8">${block}`).replace(TAG_RE, (all, open, path, close) => {
    const url = imports[`./${path}`];
    if (!url) throw new Error(`sw_stamp: index.html loads ${path}, which is not a module under src/`);
    return `${open}${url.slice(2)}${close}`;
  });
}

const reader = (root) => (p, enc) => readFileSync(join(root, p), enc);

/** VERSION from src/logic.js. */
function versionOf(root) {
  const v = /export const VERSION = '([^']+)'/.exec(reader(root)('src/logic.js', 'utf8'))?.[1];
  if (!v) throw new Error('sw_stamp: no VERSION in src/logic.js');
  return v;
}

/** Every src/**\/*.js as a URL path, sorted. */
export function moduleFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(join(root, dir))) return;
    for (const name of readdirSync(join(root, dir))) {
      const p = `${dir}/${name}`;
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(p);
    }
  };
  walk('src');
  return out.sort();
}

/**
 * Every assets/ URL the game asks for, exactly as asked: each 'assets/….png' or '….mp3' literal in src/
 * (Boot and Play.loadLazyAudio add ?v=VERSION to them), the splash cards' `file: '….png'` (splashArtUrl,
 * the same ?v=), index.html's <img> sources as written (the splash poop, bare), the vendored scripts the
 * inline trap names with their ?v= pin (Phaser), and supabase-js (supabaseLoader's FILE?v=VERSION pin).
 */
export function assetUrls(root = ROOT, version = versionOf(root)) {
  const read = reader(root);
  const urls = new Set();
  for (const m of moduleFiles(root)) {
    for (const hit of read(m, 'utf8').matchAll(/['"`](assets\/[\w./-]+\.(?:png|mp3))['"`]/g)) urls.add(`${hit[1]}?v=${version}`);
  }
  if (existsSync(join(root, 'src/splash.js'))) for (const hit of read('src/splash.js', 'utf8').matchAll(/\bfile: '([\w.-]+\.png)'/g)) urls.add(`assets/${hit[1]}?v=${version}`);
  const html = read('index.html', 'utf8');
  for (const hit of html.matchAll(/<img\b[^>]*\bsrc="(assets\/[^"]+)"/g)) urls.add(hit[1]);
  for (const hit of html.matchAll(/'(assets\/vendor\/[\w.-]+\.js\?v=[\w.-]+)'/g)) urls.add(hit[1]);
  if (existsSync(join(root, 'src/supabaseLoader.js'))) {
    const loader = read('src/supabaseLoader.js', 'utf8');
    const file = /const FILE = '(assets\/[^']+)'/.exec(loader)?.[1];
    const pin = /export const SUPABASE_JS_VERSION = '([^']+)'/.exec(loader)?.[1];
    if (file && pin) urls.add(`${file}?v=${pin}`);
  }
  return [...urls].sort();
}

/** What a stamp would write, without writing: { version, build, files, imports, index, sw, off }. */
export function planStamp(root = ROOT) {
  const read = reader(root);
  const version = versionOf(root);
  const modules = moduleFiles(root);
  const imports = {};
  for (const m of modules) imports[`./${m}`] = `./${m}?h=${shortHash(read(m))}`;
  const index = stampIndex(read('index.html', 'utf8'), imports);
  const swSource = read('sw.js', 'utf8');
  const off = swIsOff(swSource);
  const assetFile = (url) => {
    const path = url.split('?')[0];
    if (!existsSync(join(root, path))) throw new Error(`sw_stamp: ${path} (asked for as ${url}) is missing`);
    return read(path);
  };
  const files = [['index.html', sha256(index)], ...modules.map((m) => [imports[`./${m}`].slice(2), sha256(read(m))]), ...assetUrls(root, version).map((u) => [u, sha256(assetFile(u))])];
  const build = `${version}-${shortHash(files.map(([u, h]) => `${u} ${h}`).join('\n'))}`;
  return { version, build, files, imports, index, sw: off ? swSource : stampSw(swSource, build, files), off };
}

/** Stamp index.html and sw.js (the kill switch left alone); returns the plan. */
export function writeStamp(root = ROOT) {
  const plan = planStamp(root);
  const write = (p, text) => {
    if (reader(root)(p, 'utf8') !== text) writeFileSync(join(root, p), text);
  };
  write('index.html', plan.index);
  if (!plan.off) write('sw.js', plan.sw);
  return plan;
}

/**
 * Of these paths (relative to root), the ones git does not track: `npm run push` commits only tracked
 * files, so a stamp that names one would 404 for every player at install (AUD-156). [] when root is not
 * the top of a git work tree (a temp tree in a test), so only the real repo is judged.
 */
export function untrackedPaths(root, paths) {
  let tracked;
  try {
    const git = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString();
    const top = git('rev-parse', '--show-toplevel').trim();
    if (!top || realpathSync(top) !== realpathSync(root)) return []; // (realpathSync('') is the cwd)
    tracked = new Set(git('ls-files').split('\n'));
  } catch {
    return [];
  }
  return [...new Set(paths)].filter((p) => !tracked.has(p));
}

/** True when index.html or sw.js carries a stamp (the first push stamps; before it the tree is plain). */
export function isStamped(root = ROOT) {
  const read = reader(root);
  return Boolean(importMapOf(read('index.html', 'utf8'))) || Boolean(readSwStamp(read('sw.js', 'utf8')).build);
}

/** What is wrong with the tree's stamp as it is on disk ([] when nothing): push refuses on any. */
export function checkStamp(root = ROOT) {
  const read = reader(root);
  const problems = [];
  const version = versionOf(root);
  const html = read('index.html', 'utf8');
  const map = importMapOf(html);
  const modules = moduleFiles(root);
  if (!map) problems.push('index.html: no import map');
  else {
    for (const m of modules) {
      if (!map[`./${m}`]) problems.push(`${m}: not in the import map`);
      else if (map[`./${m}`] !== `./${m}?h=${shortHash(read(m))}`) problems.push(`${m}: stale ?h= in the import map`);
    }
    for (const hit of html.matchAll(/(?:<link rel="modulepreload" href="|<script type="module" src=")(src\/[\w/.-]+\.js(?:\?h=[0-9a-f]+)?)"/g)) {
      const path = hit[1].split('?')[0];
      if (map[`./${path}`] && map[`./${path}`] !== `./${hit[1]}`) problems.push(`index.html: ${hit[1]} is not the import map's URL for ${path}`);
    }
  }
  const notTracked = (paths) => untrackedPaths(root, paths).map((p) => `${p}: stamped, but git does not track it (a push would not commit it, so it would 404 for every player)`);
  problems.push(...notTracked(['index.html', ...modules]));
  const swSource = read('sw.js', 'utf8');
  if (swIsOff(swSource)) return problems;
  const stamp = readSwStamp(swSource);
  if (!stamp) return [...problems, 'sw.js: no stamp block'];
  if (!stamp.build.startsWith(`${version}-`)) problems.push(`sw.js: BUILD ${stamp.build || "''"} is not for VERSION ${version}`);
  else if (stamp.build !== `${version}-${shortHash(stamp.files.map(([u, h]) => `${u} ${h}`).join('\n'))}`) problems.push('sw.js: BUILD does not match its FILES');
  const listed = new Set(stamp.files.map(([u]) => u));
  for (const [url, hash] of stamp.files) {
    const path = url.split('?')[0];
    if (!existsSync(join(root, path))) problems.push(`${url}: listed, but ${path} is missing`);
    else if (sha256(read(path)) !== hash) problems.push(`${url}: its hash in FILES is not the file's`);
  }
  if (!listed.has('index.html')) problems.push('index.html: not in sw.js FILES');
  for (const m of modules) {
    const url = `${m}?h=${shortHash(read(m))}`;
    if (!listed.has(url)) problems.push(`${url}: not in sw.js FILES`);
  }
  for (const url of assetUrls(root, version)) if (!listed.has(url)) problems.push(`${url}: not in sw.js FILES`);
  problems.push(...notTracked(stamp.files.map(([u]) => u.split('?')[0])));
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArg = process.argv.find((a) => a.startsWith('--root='));
  const root = rootArg ? resolve(rootArg.slice('--root='.length)) : ROOT;
  if (process.argv.includes('--check-if-stamped') && !isStamped(root)) {
    console.log('sw_stamp: the tree is not stamped yet (the first push stamps it): nothing to check');
    process.exit(0);
  }
  if (!process.argv.includes('--check') && !process.argv.includes('--check-if-stamped')) {
    const plan = writeStamp(root);
    console.log(plan.off ? 'sw_stamp: sw.js is the kill switch, left as it is; index.html stamped' : `sw_stamp: build ${plan.build}, ${plan.files.length} files`);
  }
  const problems = checkStamp(root);
  for (const p of problems) console.error(`sw_stamp: ${p}`);
  process.exit(problems.length ? 1 : 0);
}
