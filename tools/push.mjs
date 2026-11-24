#!/usr/bin/env node
// npm run push — stamp LAST_UPDATED with now, run the tests, commit the stamp,
// and push main. The About overlay shows LAST_UPDATED, so this keeps it equal
// to the time of the last push without a build step or a server.
// Then the service worker's stamp (plan 35, 3.1; tools/sw_stamp.mjs): index.html's import map (every
// module at its content hash) and sw.js's BUILD and FILES, checked (BUILD for this VERSION, every module
// and every asset the code names listed) before the tests run; refused, nothing is committed. Both files
// go in the stamp commit. An sw.js that is the kill switch (tools/sw-off.js) is left as it is.
// First it asks the live database which db/schema.sql it has (tools/schema_check.mjs,
// one read-only call): it pushes only when that is this file, since a client must not
// go out before the functions it calls. Then tests/fixtures/schema-applied.sql, the
// schema the upgrade test starts from, becomes this file before the tests run, so they
// test the tree that is committed (plan 28, 3.0), and goes in the same commit. If the
// tests fail or the run is interrupted (Ctrl-C, a stop, a closed terminal), the stamp and
// the fixture are put back and nothing is committed; a dry run puts them back too.
// The order is pushSteps() in tools/schema_check.mjs.
//
// Usage: npm run push                       (refuses on a dirty tree or a non-main branch)
//        npm run push -- --dry              (check + stamp + test, then the tree put back; no commit, no push)
//        npm run push -- --no-schema-check  (skip the live check; the fixture stays as it is)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { liveSchemaState, pushDecision, pushSteps, SCHEMA_PATH, FIXTURE_PATH } from './schema_check.mjs';
import { writeStamp, checkStamp } from './sw_stamp.mjs';

const dry = process.argv.includes('--dry');
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`push.mjs: on branch ${branch}, expected main`);
  process.exit(1);
}
const dirty = sh('git status --porcelain --untracked-files=no');
if (dirty) {
  console.error('push.mjs: commit or stash your changes first:\n' + dirty);
  process.exit(1);
}

// Asked first, so a refusal changes no file; the fixture is then copied before the tests run.
let copyFixture = false;
if (process.argv.includes('--no-schema-check')) {
  console.log('push.mjs: --no-schema-check: not asking the live database which schema it has');
} else {
  const decision = pushDecision(await liveSchemaState());
  if (!decision.ok) {
    console.error(decision.message);
    process.exit(1);
  }
  console.log(decision.message);
  copyFixture = decision.copyFixture;
}

/** "3 Nov 2026, 19:52" in local time: the format tests/about.test.js expects. */
export function stamp(date = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
}

const file = new URL('../src/logic.js', import.meta.url);
const src = readFileSync(file, 'utf8');
const next = src.replace(/export const LAST_UPDATED = '[^']*';/, `export const LAST_UPDATED = '${stamp()}';`);
if (next === src) {
  console.error('push.mjs: LAST_UPDATED line not found in src/logic.js');
  process.exit(1);
}
// The service worker's two files as they were, put back with the stamp.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SW_FILES = ['index.html', 'sw.js'].map((p) => new URL(`../${p}`, import.meta.url));
const swBefore = SW_FILES.map((f) => readFileSync(f));
let fixtureBefore = null; // the fixture as it was (null: no file yet), put back on a failed test run or after a dry run
try {
  fixtureBefore = readFileSync(FIXTURE_PATH);
} catch {
  // no fixture file yet
}

/** Put the fixture back as it was before this push wrote it. */
function restoreFixture() {
  if (!copyFixture) return;
  if (fixtureBefore) writeFileSync(FIXTURE_PATH, fixtureBefore);
  else rmSync(FIXTURE_PATH, { force: true });
}

/** Put back what this push changed: the stamp (src/logic.js), index.html and sw.js, and the fixture. */
function restore() {
  writeFileSync(file, src);
  SW_FILES.forEach((f, i) => writeFileSync(f, swBefore[i]));
  restoreFixture();
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
for (const step of pushSteps({ copyFixture, dry })) {
  if (step === 'stamp') {
    writeFileSync(file, next);
    console.log(`stamped LAST_UPDATED = ${stamp()}`);
  } else if (step === 'sw') {
    try {
      const plan = writeStamp(ROOT);
      const problems = checkStamp(ROOT);
      if (problems.length) throw new Error(problems.join('\n'));
      console.log(plan.off ? 'sw_stamp: sw.js is the kill switch (tools/sw-off.js), left as it is; index.html stamped' : `sw_stamp: build ${plan.build}, ${plan.files.length} files`);
    } catch (err) {
      restore();
      console.error(`push.mjs: sw_stamp refused, the tree is put back, nothing committed or pushed:\n${err.message}`);
      process.exit(1);
    }
  } else if (step === 'fixture') {
    // The live database has db/schema.sql: the upgrade test starts from it from now on, and the
    // tests below run on it.
    writeFileSync(FIXTURE_PATH, readFileSync(SCHEMA_PATH));
    console.log('tests/fixtures/schema-applied.sql is db/schema.sql now');
  } else if (step === 'test') {
    // A signal while npm test runs (Ctrl-C reaches both; a stop button or `kill` may reach this
    // process alone) is remembered, not obeyed at once: an interrupted run is a failed one, so the
    // stamp and the fixture go back and nothing is committed or pushed (the Checkpoint 3 audit,
    // AUD-050). The handler runs only once execSync returns and the event loop turns: hence the wait.
    let interrupted = false;
    const hold = () => {
      interrupted = true;
    };
    for (const sig of SIGNALS) process.on(sig, hold);
    let failed = false;
    try {
      execSync('npm test', { stdio: 'inherit' });
    } catch {
      failed = true;
    }
    await new Promise((r) => setTimeout(r, 50));
    for (const sig of SIGNALS) process.off(sig, hold);
    if (failed || interrupted) {
      restore();
      console.error(`push.mjs: ${interrupted ? 'interrupted' : 'the tests failed'}; the stamp and the fixture are put back, nothing committed or pushed`);
      process.exit(interrupted ? 130 : 1);
    }
  } else if (step === 'restore') {
    restore();
  } else if (step === 'commit') {
    if (copyFixture) sh('git add tests/fixtures/schema-applied.sql');
    sh('git add src/logic.js index.html sw.js');
    if (sh('git status --porcelain src/logic.js index.html sw.js tests/fixtures/schema-applied.sql')) {
      const what = copyFixture ? 'stamp last updated and the applied schema for push' : 'stamp last updated for push';
      execSync(`git commit -q -m "chore: ${what}"`, { stdio: 'inherit' });
    }
  } else if (step === 'push') {
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('pushed main');
  }
}
if (dry) console.log(`dry run: tests passed on the stamped tree${copyFixture ? ' with the fixture the push would commit' : ''}; the tree is put back, nothing committed or pushed`);
