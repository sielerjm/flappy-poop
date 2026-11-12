// Audits of the question bank (plan 21), NO Phaser/DOM.
//
// A card is audited when a real person has read its cited sources and confirmed
// the answer, the explanation and that neither wrong answer is also defensible.
// The audit records who, when, and the card's content hash at that moment, so
// editing an audited card cancels its audit by itself: auditState says 'stale'
// and tests/questions.test.js fails until the card is audited again (mark) or the
// record is dropped (unmark). Every logged answer carries the card's hash and
// audit state, so analyses can tell answers to audited and unaudited text apart.
//
// Record: { by: 'Name', on: 'YYYY-MM-DD', hash: 8 hex digits, note? }
// Written by tools/audit_questions.mjs (mark / unmark), which rewrites only the
// block between the BEGIN and END lines; edit it by hand only with care.

import { fnv1a32 } from './logic.js';

// BEGIN QUESTION_AUDITS
export const QUESTION_AUDITS = {};
// END QUESTION_AUDITS

/**
 * A card's content hash: 32-bit FNV-1a over its English facts (question, answer,
 * wrong answers, explanation, refs), as 8 hex digits. The deck, retired and zh are
 * left out: moving a card between decks or adding a translation keeps its audit.
 */
export function cardHash(card) {
  const facts = JSON.stringify([card.q, card.answer, card.wrong, card.explain, card.refs]);
  return fnv1a32(facts).toString(16).padStart(8, '0');
}

/** 'audited' (a record whose hash matches the card now), 'stale' (a record from before an edit) or 'unaudited'. */
export function auditState(card, audits = QUESTION_AUDITS) {
  const rec = audits?.[card.id];
  if (!rec) return 'unaudited';
  return rec.hash === cardHash(card) ? 'audited' : 'stale';
}
