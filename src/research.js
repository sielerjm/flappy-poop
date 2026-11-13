// The education tester pilot (plan 21, Stage 3b), NO Phaser/DOM: what one quiz answer looks like
// as an event, this device's consent, and the queue of events on their way to the server.
//
// Nothing here runs unless a tester joined in the Education data panel (an adult, with the invite
// code): Play.quizAnswer records an event only while the consent store says so, never in a test
// run, and only for answers given after joining. The server side is db/schema.sql
// (enrol_research, submit_research_events, delete_research); the notice testers read is
// RESEARCH.md. The pilot tests these tools: its answers are never analysed, and are deleted
// before any study.

import { EDUCATION, LEADERBOARD, TUNING } from './config.js';
import { fnv1a32, VERSION } from './logic.js';
import { cardHash, auditState } from './questionAudits.js';
import { createJsonStore } from './store.js';

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const CARD_RE = /^[A-Z]{2}-\d{2}$/;
const CONSENT_RE = /^[a-z0-9._-]{1,24}$/;
const PHASES = ['pilot', 'beta', 'study'];
const CONTEXTS = ['break', 'revive', 'bonus'];
const OPTION_KEYS = ['answer', 'w1', 'w2'];
/** What an event may hold, as the server keeps it (submit_research_events' list of known fields). */
export const EVENT_FIELDS = ['event_id', 'session_id', 'run_id', 'card_id', 'card_hash', 'audited', 'deck', 'context', 'seq', 'step', 'level', 'order', 'chosen', 'correct', 'rt_ms', 'interrupted', 'grade', 'reason', 'ease', 'interval_ms', 'reps', 'lapses', 'seen', 'since_ms', 'client_at', 'app', 'tuning', 'locale', 'field', 'input', 'consent', 'phase'];

const whole = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/**
 * The education tuning's fingerprint (8 hex digits): the grade thresholds, the scheduler's numbers
 * and the quiz's rules as this build has them. An event carries it, so answers given under
 * different tunings can be told apart.
 */
export function tuningVersion(t = TUNING) {
  return fnv1a32(JSON.stringify(t.education)).toString(16).padStart(8, '0');
}

/**
 * One quiz answer as an event for the pilot: a flat record of what was asked, what was picked and
 * what the device knew about the card before. Pure.
 *   ids      { event, session, run }: this event, this page load, this run (22-character ids)
 *   card     the card (its id, deck, content hash and whether its audit is current)
 *   context  'break' | 'revive' | 'bonus'; seq = this answer's number in the run (from 1);
 *            step = a revive's misses so far or its streak so far, else null; level = the level
 *   order    the three options as shown (keys); chosen = the key picked; correct; rtMs (null when
 *            unknown); interrupted (the page was hidden, or a card covered the question); grade and
 *            reason as the scheduler saw them
 *   before   the card's record before this answer (education.js schedule), or null at first
 *            sight: its ease, interval, reps and lapses, how often it was seen (`seen`: 0 = first
 *            sight) and how long ago (`since_ms`)
 *   now      the device's clock (ms); app, tuning, locale, field ('phone' | 'wide'), input
 *            ('touch' | 'mouse' | 'key' | 'pad'), consent (the notice's version), phase
 */
export function answerEvent({ ids, card, context, seq, step = null, level, order, chosen, correct, rtMs = null, interrupted = false, grade, reason, before = null, now, app = VERSION, tuning = tuningVersion(), locale, field, input, consent, phase }) {
  const seen = whole(before?.seen) ?? 0;
  return {
    event_id: ids.event,
    session_id: ids.session,
    run_id: ids.run,
    card_id: card.id,
    card_hash: cardHash(card),
    audited: auditState(card) === 'audited',
    deck: card.deck,
    context,
    seq: whole(seq) ?? 0,
    step: step === null ? null : whole(step),
    level: whole(level) ?? 1,
    order: [...order],
    chosen,
    correct: Boolean(correct),
    rt_ms: interrupted ? null : whole(rtMs),
    interrupted: Boolean(interrupted),
    grade,
    reason,
    ease: before && Number.isFinite(before.ease) ? before.ease : null,
    interval_ms: before ? whole(before.intervalMs) : null,
    reps: before ? whole(before.reps) : null,
    lapses: before ? whole(before.lapses) : null,
    seen,
    since_ms: before && Number.isFinite(before.lastAt) ? whole(now - before.lastAt) : null,
    client_at: now,
    app,
    tuning,
    locale,
    field,
    input,
    consent,
    phase,
  };
}

/** An event as the server would take it (submit_research_events' checks), with known fields only; null for anything else. */
export function cleanEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.event_id !== 'string' || !ID_RE.test(raw.event_id)) return null;
  if (typeof raw.card_id !== 'string' || !CARD_RE.test(raw.card_id)) return null;
  if (!CONTEXTS.includes(raw.context) || typeof raw.correct !== 'boolean') return null;
  if (!Number.isInteger(raw.client_at) || raw.client_at <= 0) return null;
  for (const k of ['rt_ms', 'since_ms']) if (raw[k] !== null && raw[k] !== undefined && typeof raw[k] !== 'number') return null;
  if (raw.seen !== undefined && typeof raw.seen !== 'number') return null;
  if (raw.order !== undefined && !(Array.isArray(raw.order) && raw.order.length === 3 && raw.order.every((k) => OPTION_KEYS.includes(k)))) return null;
  const out = {};
  for (const k of EVENT_FIELDS) if (raw[k] !== undefined) out[k] = raw[k];
  return JSON.stringify(out).length <= 1800 ? out : null;
}

/**
 * This device's consent to the pilot (flappyPoop.eduConsent): { version, phase, at, id } while the
 * tester is joined, else null. version = the notice they agreed to (EDUCATION.consentVersion then),
 * phase = the server's phase when they joined, at = when (ms), id = the player id they joined under
 * (plan 24, AUD-001: a user code loaded later changes the device's id, and the answers and Withdraw
 * still go under the id that joined; the server follows a merge from it). The invite code is never kept.
 * Every read normalises; storage follows src/store.js (another tab's change shows at once, a full
 * storage keeps the consent for this page load); it never throws.
 */
export function createConsentStore(storage = globalThis.localStorage, key = LEADERBOARD.eduConsentKey) {
  const clean = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.version !== 'string' || !CONSENT_RE.test(raw.version) || !PHASES.includes(raw.phase) || !Number.isFinite(raw.at) || raw.at <= 0) return null;
    const out = { version: raw.version, phase: raw.phase, at: raw.at };
    if (typeof raw.id === 'string' && ID_RE.test(raw.id)) out.id = raw.id;
    return out;
  };
  const box = createJsonStore(storage, key, clean);
  const read = box.read;
  return {
    load: read,
    /** Is this device's tester joined? */
    joined() {
      return read() !== null;
    },
    /** The tester joined (enrol_research answered): record it. Returns what was stored, or null for junk. */
    join(consent) {
      const c = clean(consent);
      if (!c) return null;
      return box.write(c); // storage full or blocked: the consent lives for this page load only
    },
    /** The tester withdrew, was told they are not enrolled, or Clear forgot the player: nothing more is recorded. */
    clear() {
      box.clear();
    },
  };
}

/**
 * The events on their way to the server (flappyPoop.researchQueue): `pending` (recorded, not sent
 * yet; at most `max`, the oldest dropped first) and one batch in flight (`inflight`: up to
 * `batchMax` events under a batch id, resent unchanged until the server answers; the id is the
 * receipt). Every read normalises, every write is guarded; it never throws.
 */
export function createResearchQueue(storage = globalThis.localStorage, { key = LEADERBOARD.researchQueueKey, max = EDUCATION.researchQueueMax, batchMax = EDUCATION.researchBatch } = {}) {
  const list = (v) => (Array.isArray(v) ? v.map(cleanEvent).filter(Boolean) : []);
  const clean = (raw) => {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const f = r.inflight;
    const inflight = f && typeof f === 'object' && typeof f.batch === 'string' && ID_RE.test(f.batch) && list(f.events).length ? { batch: f.batch, events: list(f.events).slice(0, batchMax) } : null;
    return { v: 1, pending: list(r.pending).slice(-max), inflight };
  };
  // Storage full or blocked: the queue lives for this page load only (src/store.js).
  const box = createJsonStore(storage, key, clean);
  const read = box.read;
  const write = box.write;
  return {
    load: read,
    /** How many events wait here (pending and in flight). */
    size() {
      const q = read();
      return q.pending.length + (q.inflight?.events.length ?? 0);
    },
    /** Record one event (answerEvent). False for anything the server would refuse. */
    add(event) {
      const e = cleanEvent(event);
      if (!e) return false;
      const q = read();
      q.pending = [...q.pending, e].slice(-max);
      write(q);
      return true;
    },
    /** The batch to send: the one already in flight, else the oldest pending events under a new id (makeId); null when nothing waits. */
    beginBatch(makeId) {
      const q = read();
      if (!q.inflight && q.pending.length) {
        const batch = makeId();
        if (typeof batch !== 'string' || !ID_RE.test(batch)) return null;
        q.inflight = { batch, events: q.pending.slice(0, batchMax) };
        q.pending = q.pending.slice(batchMax);
        write(q);
      }
      return q.inflight;
    },
    /** The server has the batch (or will never take it: 'bad …'): forget it. */
    confirmBatch(batch) {
      const q = read();
      if (q.inflight?.batch !== batch) return;
      q.inflight = null;
      write(q);
    },
    clear() {
      box.clear();
    },
  };
}
