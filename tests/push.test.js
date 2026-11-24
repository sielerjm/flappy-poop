// npm run push (tools/push.mjs), run for real in a temp copy (plan 28, 3.0 and the Checkpoint 3 audit):
// `git` and `npm` are stub scripts on PATH that log their calls, and the live schema check asks a
// local server (127.0.0.1), never Supabase. Each case checks what was committed and pushed, what the
// tests saw (the fixture equal to db/schema.sql, the stamp written), and what is left in the tree.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restamp, stampOf } from '../tools/schema_check.mjs';
import { readSwStamp } from '../tools/sw_stamp.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const SCHEMA = restamp("create table t (a int);\nselect '0000000000000000'::text; -- schema stamp\n");
const OLD_FIXTURE = restamp("create table t (a int, b int);\nselect '0000000000000000'::text; -- schema stamp\n");
const LOGIC = "export const VERSION = '9.9.9';\nexport const LAST_UPDATED = '1 Jan 2026, 00:00';\n";
// Plan 35, 3.1: the push also stamps index.html's import map and sw.js's build (tools/sw_stamp.mjs).
const INDEX = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <link rel="modulepreload" href="src/logic.js">\n</head>\n<body>\n  <script type="module" src="src/logic.js"></script>\n</body>\n</html>\n';
const SW = readFileSync(join(REPO, 'sw.js'), 'utf8');
const SW_OFF = readFileSync(join(REPO, 'tools/sw-off.js'), 'utf8');

// The live database, stood in for: schema_version() answers SCHEMA's stamp.
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(stampOf(SCHEMA)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const dirs = [];
after(() => {
  server.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A temp copy of what push.mjs touches, with stub git and npm. */
function sandbox({ fixture = OLD_FIXTURE, sw = SW } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'flappy-push-'));
  dirs.push(dir);
  for (const d of ['tools', 'src', 'db', 'tests/fixtures', 'bin']) mkdirSync(join(dir, d), { recursive: true });
  cpSync(join(REPO, 'tools/push.mjs'), join(dir, 'tools/push.mjs'));
  cpSync(join(REPO, 'tools/schema_check.mjs'), join(dir, 'tools/schema_check.mjs'));
  cpSync(join(REPO, 'tools/sw_stamp.mjs'), join(dir, 'tools/sw_stamp.mjs'));
  writeFileSync(join(dir, 'index.html'), INDEX);
  writeFileSync(join(dir, 'sw.js'), sw);
  const config = readFileSync(join(REPO, 'src/config.js'), 'utf8').replace(/dataApi: '[^']*'/, `dataApi: 'http://127.0.0.1:${PORT}/rest/v1'`);
  assert.doesNotMatch(config, /supabase\.co/, 'the copy never points at the live database');
  writeFileSync(join(dir, 'src/config.js'), config);
  writeFileSync(join(dir, 'src/logic.js'), LOGIC);
  writeFileSync(join(dir, 'db/schema.sql'), SCHEMA);
  if (fixture !== null) writeFileSync(join(dir, 'tests/fixtures/schema-applied.sql'), fixture);
  const log = join(dir, 'calls.log');
  // The dirty-tree check (--untracked-files=no) finds nothing; the commit's check finds the stamp.
  writeFileSync(join(dir, 'bin/git'), `#!/bin/bash\necho "git $*" >> "${log}"\ncase "$1 $2 $3" in "rev-parse --abbrev-ref HEAD") echo main;; "status --porcelain src/logic.js") echo " M src/logic.js";; esac\nexit 0\n`);
  writeFileSync(
    join(dir, 'bin/npm'),
    `#!/bin/bash\necho "npm $* fixture=$(cmp -s tests/fixtures/schema-applied.sql db/schema.sql && echo same || echo differs) stamp=$(grep -c "1 Jan 2026" src/logic.js) map=$(grep -c importmap index.html) build=$(grep -c "const BUILD = '9.9.9-" sw.js)" >> "${log}"\n` +
      `[ "$NPM_MODE" = sleep ] && { touch "${dir}/npm-started"; sleep 2; }\n[ "$NPM_MODE" = fail ] && exit 1\nexit 0\n`,
  );
  chmodSync(join(dir, 'bin/git'), 0o755);
  chmodSync(join(dir, 'bin/npm'), 0o755);
  return { dir, log };
}

/** Run push.mjs in the sandbox; `onStart(child)` may signal it. Resolves { code, signal, out, calls, logic, fixture }. */
function push(box, args = [], { mode = 'pass', onStart = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(box.dir, 'tools/push.mjs'), ...args], { cwd: box.dir, env: { ...process.env, PATH: `${join(box.dir, 'bin')}:${process.env.PATH}`, NPM_MODE: mode } });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    onStart?.(child);
    child.on('close', (code, signal) => {
      const read = (p) => (existsSync(join(box.dir, p)) ? readFileSync(join(box.dir, p), 'utf8') : null);
      resolve({ code, signal, out, calls: read('calls.log') ?? '', logic: read('src/logic.js'), fixture: read('tests/fixtures/schema-applied.sql'), index: read('index.html'), sw: read('sw.js') });
    });
  });
}

test('a push: the tests run on the committed tree (the fixture is db/schema.sql, the stamp written); then it commits both and pushes', async () => {
  const r = await push(sandbox());
  assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /npm test fixture=same stamp=0/, 'npm test saw the new fixture and the new stamp');
  assert.match(r.calls, /git add tests\/fixtures\/schema-applied.sql/);
  assert.match(r.calls, /git commit/);
  assert.match(r.calls, /git push origin main/);
  assert.equal(r.fixture, SCHEMA);
  assert.doesNotMatch(r.logic, /1 Jan 2026/, 'stamped');
});

test('failing tests: nothing committed or pushed; the stamp and the fixture are put back', async () => {
  const r = await push(sandbox(), [], { mode: 'fail' });
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.calls, /git (commit|push)/);
  assert.equal(r.logic, LOGIC);
  assert.equal(r.fixture, OLD_FIXTURE);
  assert.equal(r.index, INDEX, 'index.html put back');
  assert.equal(r.sw, SW, 'sw.js put back');
});

test('a first push with no fixture file and failing tests removes the file it wrote', async () => {
  const r = await push(sandbox({ fixture: null }), [], { mode: 'fail' });
  assert.equal(r.code, 1);
  assert.equal(r.fixture, null);
  assert.equal(r.logic, LOGIC);
});

test('an interrupt that reaches only the push while npm test runs (tests that then pass): no commit, no push, the tree put back', async () => {
  const box = sandbox();
  const r = await push(box, [], {
    mode: 'sleep',
    onStart: (child) => {
      const wait = setInterval(() => {
        if (existsSync(join(box.dir, 'npm-started'))) {
          clearInterval(wait);
          child.kill('SIGINT'); // the push's own process only, not npm's
        }
      }, 50);
    },
  });
  assert.doesNotMatch(r.calls, /git (commit|push)/, r.calls);
  assert.notEqual(r.code, 0);
  assert.equal(r.logic, LOGIC);
  assert.equal(r.fixture, OLD_FIXTURE);
});

test('a dry run tests the tree the push would commit, then leaves the tree as it was', async () => {
  const r = await push(sandbox(), ['--dry']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /npm test fixture=same stamp=0 map=1 build=1/, 'the tests ran on the stamped index.html and sw.js');
  assert.doesNotMatch(r.calls, /git (add|commit|push)/);
  assert.equal(r.logic, LOGIC, 'the stamp is put back too, so the next push does not find a dirty tree');
  assert.equal(r.fixture, OLD_FIXTURE);
  assert.equal(r.index, INDEX, '--dry writes nothing: index.html as it was');
  assert.equal(r.sw, SW, '--dry writes nothing: sw.js as it was');
});

test('--no-schema-check: no live check, the fixture left as it is, only the stamp committed', async () => {
  const r = await push(sandbox(), ['--no-schema-check']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /npm test fixture=differs stamp=0/);
  assert.doesNotMatch(r.calls, /git add tests\/fixtures/);
  assert.match(r.calls, /git push origin main/);
  assert.equal(r.fixture, OLD_FIXTURE);
});

test('a push stamps index.html and sw.js after LAST_UPDATED, the tests see both, and the commit takes both', async () => {
  const r = await push(sandbox());
  assert.equal(r.code, 0, r.out);
  assert.match(r.calls, /npm test fixture=same stamp=0 map=1 build=1/);
  assert.match(r.calls, /git add src\/logic\.js index\.html sw\.js/);
  const { build, files } = readSwStamp(r.sw);
  assert.match(build, /^9\.9\.9-[0-9a-f]{10}$/);
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const logic = files.find(([u]) => u.startsWith('src/logic.js?h='));
  assert.equal(logic[1], sha(r.logic), "FILES holds the stamped logic.js (the new LAST_UPDATED), the file that is committed");
  assert.equal(files.find(([u]) => u === 'index.html')[1], sha(r.index));
  assert.match(r.index, new RegExp(`<script type="module" src="src/logic\\.js\\?h=${sha(r.logic).slice(0, 10)}">`));
});

test('an sw.js the stamper cannot read (no stamp block, not the kill switch): refused, the tree put back, nothing committed', async () => {
  const broken = SW.replace(/\/\/ --- stamp[\s\S]*?\/\/ --- end of stamp ---/, "const BUILD = 'x';");
  const r = await push(sandbox({ sw: broken }));
  assert.equal(r.code, 1);
  assert.match(r.out, /sw_stamp/);
  assert.doesNotMatch(r.calls, /npm test|git (add|commit|push)/);
  assert.equal(r.logic, LOGIC);
  assert.equal(r.sw, broken);
  assert.equal(r.index, INDEX);
  assert.equal(r.fixture, OLD_FIXTURE);
});

test('the kill switch: with tools/sw-off.js copied over sw.js, the push leaves it byte for byte and still pushes', async () => {
  const r = await push(sandbox({ sw: SW_OFF }));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.sw, SW_OFF);
  assert.match(r.index, /<script type="importmap">/);
  assert.match(r.calls, /git push origin main/);
});
