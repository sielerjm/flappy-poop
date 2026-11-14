#!/usr/bin/env node
// Where does a player id or username appear? (plan 21, P1; the compliance
// report's R7 and its deletion runbook.) Searches the working tree (tracked,
// untracked and ignored files: meta/db-backups, .claude/plans and the rest),
// every commit in git history, and, with --issues, GitHub Issues. It prints
// locations only (file:line, commit and file) and a short fingerprint of what
// it searched for, never the id or name itself or the lines around it.
//
// Usage: node tools/privacy_scan.mjs - [--issues]         reads the id or name from stdin
//        node tools/privacy_scan.mjs <id or name> [--issues]
// Prefer stdin for a secret id (echo is kept out of shell history with a leading
// space in most shells; better: pbpaste | node tools/privacy_scan.mjs -).
// An id (22 base64url characters) matches exactly; a name ignores case, as the
// boards do. --issues sends the search term to GitHub's search (gh must be
// signed in): use it for names, or for an id that is already public.
// Exit code: 0 nothing found, 1 found somewhere, 2 an error. Zero dependencies.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** A player id's shape: the save code's 16 random bytes as base64url. */
export function isIdLike(s) {
  return /^[A-Za-z0-9_-]{22}$/.test(s);
}

/** A short, one-way label for a secret (sha256, first 8 hex digits): enough to tell two searches apart, useless for posting as the player. */
export function fingerprint(secret) {
  return createHash('sha256').update(secret).digest('hex').slice(0, 8);
}

/** argv → { needle, fromStdin, issues }; throws on no needle, an unknown option or a second needle. */
export function parseArgs(argv) {
  const out = { needle: null, fromStdin: false, issues: false };
  for (const arg of argv) {
    if (arg === '--issues') out.issues = true;
    else if (arg === '-') out.fromStdin = true;
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else if (out.needle !== null) throw new Error('search for one id or name at a time');
    else out.needle = arg;
  }
  if (!out.fromStdin && !out.needle) throw new Error('name an id or a username, or pass - to read it from stdin');
  if (out.fromStdin && out.needle) throw new Error('pass the id or name on stdin or as an argument, not both');
  return out;
}

/** The 1-based line numbers of `text` that hold `needle` (case-insensitive unless the needle looks like an id). */
export function lineHits(text, needle) {
  const exact = isIdLike(needle);
  const n = exact ? needle : needle.toLowerCase();
  const out = [];
  text.split('\n').forEach((line, i) => {
    if ((exact ? line : line.toLowerCase()).includes(n)) out.push(i + 1);
  });
  return out;
}

/**
 * Tracked paths that must never be in git: anything under meta/, .claude/plans/ or Claude outputs/
 * (Michael's private hand-over notes at the repo's root: plan 26, A2), and database row dumps
 * (*_rows.sql).
 */
export function forbiddenPaths(paths) {
  return paths.filter((p) => p.startsWith('meta/') || p.startsWith('.claude/plans/') || p.startsWith('Claude outputs/') || /_rows\.sql$/.test(p));
}

/** The ids in a SQL dump: every quoted 22-character base64url token, once each. */
export function dumpIds(sql) {
  return [...new Set([...sql.matchAll(/'([A-Za-z0-9_-]{22})'/g)].map((m) => m[1]))];
}

function isBinary(path) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally {
    closeSync(fd);
  }
}

/** Every file under `dir` but .git and node_modules, as absolute paths. */
export function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walkFiles(p);
    return e.isFile() ? [p] : [];
  });
}

function scanTree(needle) {
  const hits = [];
  for (const abs of walkFiles(ROOT)) {
    const size = statSync(abs).size;
    if (size === 0 || size > MAX_FILE_BYTES || isBinary(abs)) continue;
    const lines = lineHits(readFileSync(abs, 'utf8'), needle);
    if (lines.length) hits.push(`${relative(ROOT, abs)}:${lines.join(',')}`);
  }
  return hits;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/** Commits (on any ref) whose changes add or remove the needle, with the files involved. */
function scanHistory(needle) {
  const pick = isIdLike(needle) ? [`-S${needle}`] : ['-i', '--pickaxe-regex', `-S${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`];
  const out = git(['log', '--all', ...pick, '--format=@@%h %ad', '--date=short', '--name-only']);
  return out
    .split('@@')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [head, ...files] = block.split('\n').filter(Boolean);
      return `${head}  ${files.join(', ')}`;
    });
}

function scanIssues(needle) {
  const url = git(['remote', 'get-url', 'origin']).trim();
  const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(url)?.[1];
  if (!repo) throw new Error(`origin is not a GitHub repo: ${url}`);
  const raw = execFileSync('gh', ['search', 'issues', '--repo', repo, '--include-prs', '--json', 'number,url,state', '--limit', '100', '--', needle], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return JSON.parse(raw).map((i) => `#${i.number} (${i.state}) ${i.url}`);
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(argv) {
  const args = parseArgs(argv);
  const needle = args.fromStdin ? await readStdin() : args.needle;
  if (!needle) throw new Error('nothing to search for');
  console.log(`searching for ${isIdLike(needle) ? 'an id' : 'a name'} #${fingerprint(needle)}`);
  const sections = [
    ['working tree (tracked, untracked and ignored files)', () => scanTree(needle)],
    ['git history (commits that add or remove it)', () => scanHistory(needle)],
  ];
  if (args.issues) sections.push(['GitHub Issues and pull requests', () => scanIssues(needle)]);
  let found = 0;
  for (const [title, run] of sections) {
    const hits = run();
    found += hits.length;
    console.log(`\n${title}: ${hits.length ? hits.length : 'none'}`);
    for (const h of hits) console.log(`  ${h}`);
  }
  if (!args.issues) console.log('\nGitHub Issues: not searched (add --issues; it sends the search term to GitHub)');
  return found ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`privacy_scan: ${err.message}`);
      process.exit(2);
    },
  );
}
