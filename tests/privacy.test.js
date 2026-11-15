// Privacy guard (plan 21, P1; the compliance report's R7): no player data is ever committed
// again. npm test (so npm run push) fails when git tracks a local-only path (meta/,
// .claude/plans/, Claude outputs/, a *_rows.sql dump) or a tracked file holds an id from the
// local database dumps in meta/db-backups/. Failures name files and a fingerprint, never the id.
// Claude outputs/ (plan 26, A2) holds Michael's hand-over notes: private, never player data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpIds, fingerprint, forbiddenPaths, isIdLike, lineHits, parseArgs } from '../tools/privacy_scan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BACKUPS = join(ROOT, 'meta', 'db-backups');
const TEXT = /\.(?:js|mjs|cjs|json|md|html|sql|yml|yaml|css|txt|py|svg|webmanifest|gitignore)$/i;

/** Tracked paths, or null outside a git checkout (a downloaded zip: nothing to guard). */
function tracked() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

test('git tracks nothing local-only: no meta/, no .claude/plans/, no Claude outputs/, no *_rows.sql dump', (t) => {
  const paths = tracked();
  if (!paths) return t.skip('not a git checkout');
  assert.deepEqual(forbiddenPaths(paths), [], 'untrack these (git rm --cached <path>); they are private or may hold player data');
});

test('no tracked file holds a player id from the local database dumps (meta/db-backups)', (t) => {
  const paths = tracked();
  if (!paths) return t.skip('not a git checkout');
  if (!existsSync(BACKUPS)) return t.skip('no meta/db-backups on this machine');
  const ids = new Set(readdirSync(BACKUPS).filter((n) => n.endsWith('.sql')).flatMap((n) => dumpIds(readFileSync(join(BACKUPS, n), 'utf8'))));
  assert.ok(ids.size > 0, 'the dumps hold no ids (did their format change? dumpIds reads quoted 22-character tokens)');
  const leaks = [];
  for (const p of paths.filter((x) => TEXT.test(x))) {
    const abs = join(ROOT, p);
    if (!existsSync(abs) || statSync(abs).size > 5 * 1024 * 1024) continue;
    const text = readFileSync(abs, 'utf8');
    for (const id of ids) if (text.includes(id)) leaks.push(`${p} holds id #${fingerprint(id)}`);
  }
  assert.deepEqual(leaks, [], 'player ids in tracked files: replace them with synthetic ids (node tools/privacy_scan.mjs - finds every copy)');
});

test('forbiddenPaths flags meta/, .claude/plans/, Claude outputs/ and row dumps, nothing else', () => {
  const paths = ['meta/db-backups/x.sql', '.claude/plans/Archive/a.md', 'db/scores_rows.sql', 'Claude outputs/handoff.md', 'Claude outputs/pack/skills/x.md', 'docs/save-code-spec.md', 'db/schema.sql', '.claude/skills/x/SKILL.md', 'src/meta.js', 'docs/Claude outputs.md', 'docs/Claude outputs/x.md'];
  assert.deepEqual(forbiddenPaths(paths), ['meta/db-backups/x.sql', '.claude/plans/Archive/a.md', 'db/scores_rows.sql', 'Claude outputs/handoff.md', 'Claude outputs/pack/skills/x.md']);
});

test('forbiddenPaths matches its folders in any case at the root (AUD-035: git on macOS ignores case, so "claude outputs/" is the same folder), and only at the root', () => {
  const flagged = ['claude outputs/a.md', 'Claude Outputs/a.md', 'CLAUDE OUTPUTS/x/y.md', 'Meta/x', 'META/db-backups/y.sql', '.claude/Plans/x.md', '.Claude/plans/x.md', 'db/Scores_Rows.SQL'];
  const kept = ['Claude  outputs/a.md', 'sub/Claude outputs/a.md', 'sub/claude outputs/a.md', 'Claude outputs', 'src/Meta.js', '.claude/skills/x/SKILL.md', 'docs/meta/x.md'];
  assert.deepEqual(forbiddenPaths([...flagged, ...kept]), flagged);
});

test('dumpIds reads each quoted 22-character token once; isIdLike and fingerprint', () => {
  const a = 'AAAAAAAAAAAAAAAAAAAAA1';
  const b = 'b-b_bbbbbbbbbbbbbbbbbb';
  const sql = `insert into scores values ('${a}', 'name', 10), ('${b}', 'x', 2), ('${a}', 'y', 3); -- ${'C'.repeat(22)} unquoted, '${'D'.repeat(23)}' too long`;
  assert.deepEqual(dumpIds(sql), [a, b]);
  assert.ok(isIdLike(a) && isIdLike(b) && !isIdLike('short') && !isIdLike(`${a}x`) && !isIdLike('AAAAAAAAAAAAAAAAAAAAA!'));
  const fp = fingerprint(a);
  assert.match(fp, /^[0-9a-f]{8}$/);
  assert.equal(fingerprint(a), fp, 'stable');
  assert.notEqual(fingerprint(b), fp);
  assert.ok(!a.includes(fp) && !fp.includes(a.slice(0, 8)), 'the fingerprint does not reveal the id');
});

test('lineHits: an id matches exactly; a name ignores case', () => {
  const id = 'AAAAAAAAAAAAAAAAAAAAA1';
  assert.deepEqual(lineHits(`one\n${id}\n${id.toLowerCase()}\n`, id), [2]);
  assert.deepEqual(lineHits('Hello GutBug\nnone\ngutbug!', 'GUTBUG'), [1, 3]);
});

test('privacy_scan parseArgs: one needle or stdin, --issues; bad input throws', () => {
  assert.deepEqual(parseArgs(['somebody']), { needle: 'somebody', fromStdin: false, issues: false });
  assert.deepEqual(parseArgs(['-', '--issues']), { needle: null, fromStdin: true, issues: true });
  assert.throws(() => parseArgs([]), /name an id or a username/);
  assert.throws(() => parseArgs(['a', 'b']), /one id or name at a time/);
  assert.throws(() => parseArgs(['-', 'a']), /not both/);
  assert.throws(() => parseArgs(['a', '--all']), /unknown option --all/);
});
