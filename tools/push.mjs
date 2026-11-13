#!/usr/bin/env node
// npm run push — stamp LAST_UPDATED with now, run the tests, commit the stamp,
// and push main. The About overlay shows LAST_UPDATED, so this keeps it equal
// to the time of the last push without a build step or a server.
// First it asks the live database which db/schema.sql it has (tools/schema_check.mjs,
// one read-only call): it pushes only when that is this file, since a client must not
// go out before the functions it calls. Then tests/fixtures/schema-applied.sql, the
// schema the upgrade test starts from, becomes this file and goes in the same commit.
//
// Usage: npm run push                       (refuses on a dirty tree or a non-main branch)
//        npm run push -- --dry              (check + stamp + test only; no commit, no push)
//        npm run push -- --no-schema-check  (skip the live check; the fixture stays as it is)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { liveSchemaState, pushDecision, SCHEMA_PATH, FIXTURE_PATH } from './schema_check.mjs';

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

// Asked first, so a refusal changes no file; the fixture is copied only once the tests pass.
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
writeFileSync(file, next);
console.log(`stamped LAST_UPDATED = ${stamp()}`);

execSync('npm test', { stdio: 'inherit' });

if (dry) {
  console.log('dry run: stamp written, tests passed, nothing committed or pushed');
  process.exit(0);
}
// The live database has db/schema.sql: the upgrade test starts from it from now on.
if (copyFixture) {
  writeFileSync(FIXTURE_PATH, readFileSync(SCHEMA_PATH));
  sh('git add tests/fixtures/schema-applied.sql');
}
sh('git add src/logic.js');
if (sh('git status --porcelain src/logic.js tests/fixtures/schema-applied.sql')) {
  const what = copyFixture ? 'stamp last updated and the applied schema for push' : 'stamp last updated for push';
  execSync(`git commit -q -m "chore: ${what}"`, { stdio: 'inherit' });
}
execSync('git push origin main', { stdio: 'inherit' });
console.log('pushed main');
