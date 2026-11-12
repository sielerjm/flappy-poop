#!/usr/bin/env node
// Audit the education question bank (plan 21): which cards a real person has
// checked against their sources, and when.
//
// Usage: node tools/audit_questions.mjs [list]            unaudited and stale cards, then the counts
//        node tools/audit_questions.mjs report [--out=f]  a review sheet (markdown) of every card
//        node tools/audit_questions.mjs mark ST-01 ST-02 --by="Name" [--note="…"] [--on=YYYY-MM-DD]
//        node tools/audit_questions.mjs unmark ST-01
//
// mark stamps each card's current content hash with the auditor and the date
// (today, local time, unless --on); unmark drops a record (a stale one, or one
// made in error). Both rewrite only the QUESTION_AUDITS block of
// src/questionAudits.js, then re-read it to confirm. Before marking a card: read
// its cited sources, confirm the answer and the explanation, and check that
// neither wrong answer is also defensible. Zero dependencies.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CARDS, DECKS, REFERENCES } from '../src/questions.js';
import { QUESTION_AUDITS, auditState, cardHash } from '../src/questionAudits.js';

const AUDITS_FILE = new URL('../src/questionAudits.js', import.meta.url);
const BEGIN = '// BEGIN QUESTION_AUDITS';
const END = '// END QUESTION_AUDITS';
const COMMANDS = ['list', 'report', 'mark', 'unmark'];

/** argv → { command, ids, by, note, on, out }; throws on an unknown command, option or id, or a mark without --by. */
export function parseArgs(argv, cards = CARDS) {
  const [command = 'list', ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new Error(`unknown command ${command}; the commands are ${COMMANDS.join(', ')}`);
  const out = { command, ids: [], by: null, note: null, on: null, out: null };
  for (const arg of rest) {
    const m = /^--(by|note|on|out)=(.*)$/s.exec(arg);
    if (m) out[m[1]] = m[2].trim();
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else out.ids.push(arg.toUpperCase());
  }
  const known = new Set(cards.map((c) => c.id));
  const unknown = out.ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`no card ${unknown.join(', ')}`);
  if ((command === 'mark' || command === 'unmark') && !out.ids.length) throw new Error(`${command}: name at least one card`);
  if (command === 'mark' && !out.by) throw new Error('mark: say who audited, --by="Name"');
  if (out.on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(out.on)) throw new Error(`--on takes YYYY-MM-DD, not ${out.on}`);
  return out;
}

/** Today in local time as YYYY-MM-DD (the auditor's calendar day). */
export function localDay(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** The audits after a mark: each card's record replaced with its hash now, `by`, `on` and an optional note. */
export function markAudits(audits, ids, { by, on, note = null }, cards = CARDS) {
  const next = { ...audits };
  for (const id of ids) {
    const card = cards.find((c) => c.id === id);
    next[id] = { by, on, hash: cardHash(card), ...(note ? { note } : {}) };
  }
  return next;
}

/** The audits after an unmark: those records gone. */
export function unmarkAudits(audits, ids) {
  const next = { ...audits };
  for (const id of ids) delete next[id];
  return next;
}

const js = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/** The QUESTION_AUDITS block's text: one record per line, in bank order (unknown ids last, sorted). */
export function formatAudits(audits, cards = CARDS) {
  const order = new Map(cards.map((c, i) => [c.id, i]));
  const ids = Object.keys(audits).sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b));
  if (!ids.length) return `${BEGIN}\nexport const QUESTION_AUDITS = {};\n${END}`;
  const rows = ids.map((id) => {
    const r = audits[id];
    const note = r.note ? `, note: ${js(r.note)}` : '';
    return `  ${js(id)}: { by: ${js(r.by)}, on: ${js(r.on)}, hash: ${js(r.hash)}${note} },`;
  });
  return `${BEGIN}\nexport const QUESTION_AUDITS = {\n${rows.join('\n')}\n};\n${END}`;
}

/** src/questionAudits.js's text with its block replaced; throws when the BEGIN / END lines are missing. */
export function replaceBlock(src, block) {
  const start = src.indexOf(BEGIN);
  const end = src.indexOf(END, start);
  if (start < 0 || end < 0) throw new Error(`src/questionAudits.js has no ${BEGIN} … ${END} block`);
  return src.slice(0, start) + block + src.slice(end + END.length);
}

const STATE_LABEL = { audited: '✅ audited', stale: '⚠️ stale', unaudited: '⬜ unaudited', retired: '🚫 retired' };
const stateOf = (card, audits) => (card.retired ? 'retired' : auditState(card, audits));

/** The counts per state, over every card. */
export function auditCounts(audits = QUESTION_AUDITS, cards = CARDS) {
  const counts = { audited: 0, stale: 0, unaudited: 0, retired: 0 };
  for (const c of cards) counts[stateOf(c, audits)] += 1;
  return counts;
}

/** Lines for `list`: each stale or unaudited card (stale first), then the counts. */
export function listLines(audits = QUESTION_AUDITS, cards = CARDS) {
  const pending = cards.filter((c) => ['stale', 'unaudited'].includes(stateOf(c, audits)));
  pending.sort((a, b) => (stateOf(a, audits) === 'stale' ? 0 : 1) - (stateOf(b, audits) === 'stale' ? 0 : 1));
  const lines = pending.map((c) => {
    const st = stateOf(c, audits);
    const was = st === 'stale' ? ` (audited by ${audits[c.id].by} on ${audits[c.id].on}, changed since)` : '';
    return `${c.id}  ${STATE_LABEL[st]}${was}  [${c.deck}]  ${c.q}`;
  });
  const n = auditCounts(audits, cards);
  lines.push(`${cards.length} cards: ${n.audited} audited, ${n.stale} stale, ${n.unaudited} unaudited, ${n.retired} retired`);
  return lines;
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The review sheet: the checklist, then a table per deck (status, auditor, the card), then the references and who cites them. */
export function reportMarkdown(audits = QUESTION_AUDITS, cards = CARDS, refs = REFERENCES, decks = DECKS, today = localDay()) {
  const n = auditCounts(audits, cards);
  const out = [
    '# Flappy Poop question bank: audit sheet',
    '',
    `Generated ${today} by \`node tools/audit_questions.mjs report\` from \`src/questions.js\`. ${cards.length} cards: ${n.audited} audited, ${n.stale} stale, ${n.unaudited} unaudited, ${n.retired} retired.`,
    '',
    'Per card: read the cited sources, confirm the answer and the explanation, check that neither wrong answer is also defensible, and that the card asks what the gut and its microbes do, never about the player\'s own health or habits. Then `node tools/audit_questions.mjs mark <ID> --by="Your name"`. Fix a card in `src/questions.js` first (its audit goes stale on any edit).',
  ];
  for (const deck of decks) {
    const inDeck = cards.filter((c) => c.deck === deck);
    if (!inDeck.length) continue;
    const level = decks.indexOf(deck) + 1;
    out.push('', deck === 'general' ? '## General (any level)' : `## Level ${level} · ${deck}`, '');
    out.push('| ID | Status | Audit | Question | Answer | Wrong answers | Explanation | Refs | Hash |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const c of inDeck) {
      const st = stateOf(c, audits);
      const rec = audits[c.id];
      const audit = rec ? `${cell(rec.by)}, ${rec.on}${rec.note ? ` (${cell(rec.note)})` : ''}` : '';
      out.push(`| ${c.id} | ${STATE_LABEL[st]} | ${audit} | ${cell(c.q)} | ${cell(c.answer)} | ${c.wrong.map(cell).join(' / ')} | ${cell(c.explain)} | ${c.refs.join(', ')} | \`${cardHash(c)}\` |`);
    }
  }
  out.push('', '## References', '');
  for (const [num, text] of Object.entries(refs)) {
    const by = cards.filter((c) => c.refs.includes(Number(num))).map((c) => c.id);
    out.push(`${num}. ${text} Cited by: ${by.join(', ') || 'none'}.`);
  }
  return `${out.join('\n')}\n`;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.command === 'list') {
    console.log(listLines().join('\n'));
    return;
  }
  if (args.command === 'report') {
    const md = reportMarkdown();
    if (args.out) {
      writeFileSync(args.out, md);
      console.log(`wrote ${args.out}`);
    } else process.stdout.write(md);
    return;
  }
  const next = args.command === 'mark' ? markAudits(QUESTION_AUDITS, args.ids, { by: args.by, on: args.on ?? localDay(), note: args.note }) : unmarkAudits(QUESTION_AUDITS, args.ids);
  writeFileSync(AUDITS_FILE, replaceBlock(readFileSync(AUDITS_FILE, 'utf8'), formatAudits(next)));
  // Read the file back as a fresh module: what the game and the tests will see.
  const fresh = await import(`${AUDITS_FILE.href}?t=${Date.now()}`);
  for (const id of args.ids) {
    const card = CARDS.find((c) => c.id === id);
    const st = fresh.auditState(card, fresh.QUESTION_AUDITS);
    const want = args.command === 'mark' ? 'audited' : 'unaudited';
    if (st !== want) throw new Error(`${id} reads back as ${st}, expected ${want}`);
    console.log(`${id}: ${STATE_LABEL[st]}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`audit_questions: ${err.message}`);
    process.exit(1);
  });
}
