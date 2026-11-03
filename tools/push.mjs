#!/usr/bin/env node
// npm run push — stamp LAST_UPDATED with now, run the tests, commit the stamp,
// and push main. The About overlay shows LAST_UPDATED, so this keeps it equal
// to the time of the last push without a build step or a server.
//
// Usage: npm run push            (refuses on a dirty tree or a non-main branch)
//        npm run push -- --dry   (stamp + test only; no commit, no push)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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
sh('git add src/logic.js');
if (sh('git status --porcelain src/logic.js')) {
  execSync('git commit -q -m "chore: stamp last updated for push"', { stdio: 'inherit' });
}
execSync('git push origin main', { stdio: 'inherit' });
console.log('pushed main');
