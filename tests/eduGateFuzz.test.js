// A level break's gate, driven the way Play and the quiz do (audit 2026-11-16, AUD-056: zone A1's seeded
// simulation, fewer seeds): answers through schedule, this break's misses, the three kinds of Skip with the
// day's cap, quizzes closed and opened again, the clock moving, retired cards, and the break's two limits
// (new cards per level 3 / 5 / all; duePerBreak 0 / 1 / 3 / 10 / none). Plan 28, Stage 3b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const R = new URL('../src/', import.meta.url).href;
const { TUNING: T } = await import(R + 'config.js');
const { createRng } = await import(R + 'logic.js');
const { CARDS, DECKS } = await import(R + 'questions.js');
const E = await import(R + 'education.js');
const { pickCard, cardCounts, schedule, skipUntil, NEW_ORDERS, breakDecks } = E;

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const NOW0 = new Date(2026, 10, 16, 10, 0, 0).getTime(); // local 10:00
const SEGMENTS = DECKS.filter((d) => d !== 'general' && d !== 'rectum');

function randomSrs(rng, cards, now) {
  const srs = {};
  for (const c of cards) {
    const r = rng();
    const base = { stability: 0.5 + rng() * 20, difficulty: 1 + rng() * 9, reps: 2, lapses: 0, seen: 3, right: 2, firstAt: now - 30 * DAY };
    // ties: dueAt on a coarse grid so many equal
    const grid = Math.floor(rng() * 4) * HOUR;
    if (r < 0.2) srs[c.id] = { ...base, state: 'missed', dueAt: now - grid, reviewedAt: now - grid - MIN, lastAt: now - grid - MIN };
    else if (r < 0.45) {
      const stab = [2, 4, 4, 10][Math.floor(rng() * 4)];
      const dueAt = now - Math.floor(rng() * 3) * DAY;
      srs[c.id] = { ...base, state: 'review', stability: stab, dueAt, reviewedAt: dueAt - stab * DAY, lastAt: dueAt - stab * DAY };
    } else if (r < 0.55) srs[c.id] = { ...base, state: 'review', dueAt: now + (1 + Math.floor(rng() * 3)) * HOUR * 5, reviewedAt: now - DAY, lastAt: now - DAY - Math.floor(rng() * 5) * HOUR };
    else if (r < 0.6) srs[c.id] = { ...base, state: 'missed', dueAt: now + DAY, reviewedAt: now - MIN, lastAt: now - MIN };
    // else new
  }
  return srs;
}

const counted = (p) => Boolean(p) && !p.beyond && p.reason !== 'practice';

test('fuzz: the gate holds exactly while pickCard has a counted card, through answers, skips, new sessions and time', () => {
  let failures = [];
  for (let seed = 1; seed <= 150 && failures.length < 5; seed += 1) {
    const rng = createRng(seed);
    const cards = seed % 3 === 0 ? CARDS.map((c) => ({ ...c, retired: rng() < 0.08 })) : CARDS;
    let now = NOW0;
    const srs = randomSrs(rng, cards, now);
    const segIdx = Math.floor(rng() * SEGMENTS.length);
    const segment = SEGMENTS[segIdx];
    const level = segIdx + 2;
    const order = [...NEW_ORDERS, 'junk'][Math.floor(rng() * 4)];
    const per = [3, 5, 'all'][Math.floor(rng() * 3)];
    const duePer = [0, 1, 3, 10, null][Math.floor(rng() * 5)];
    const day = E.localDayKey(new Date(now));
    let buried = { day, n: 0, ids: cards.filter(() => rng() < 0.08).map((c) => c.id) };
    let recent = cards.filter(() => rng() < 0.1).map((c) => c.id).slice(-T.education.minGap);
    let breakMissed = [], newAsked = 0, dueAsked = 0, session = [];
    const limits = () => ({ newLeft: typeof per === 'number' ? Math.max(0, per - newAsked) : Infinity, dueLeft: Number.isFinite(duePer) ? Math.max(0, duePer - dueAsked) : Infinity });
    const qrng = createRng(seed * 7 + 1);
    const label = `seed ${seed} ${segment} order ${order} per ${per} duePer ${duePer}`;
    for (let step = 0; step < 120; step += 1) {
      const skipped = buried.day === E.localDayKey(new Date(now)) ? buried.ids : [];
      const L = limits();
      const counts = cardCounts(srs, { cards, context: 'break', level, segment, now, exclude: session, missed: breakMissed, skipped, ...L });
      const pick = pickCard({ cards, srs, context: 'break', level, segment, now, exclude: session, recent, rng: qrng, dueFirst: true, missed: breakMissed, order, skipped, ...L });
      const holds = counts.new + counts.missed + counts.review > 0;
      const ctx = () => `${label} step ${step}: counts ${JSON.stringify(counts)} limits ${JSON.stringify(L)} pick ${pick ? `${pick.card.id} ${pick.reason}${pick.beyond ? ' beyond' : ''}` : null} missed ${breakMissed.join(',')}`;
      if (holds !== counted(pick)) { failures.push(`gate ${holds} vs pick: ${ctx()}`); break; }
      if (counted(pick) && !(counts[pick.reason] >= 1)) { failures.push(`kind not counted: ${ctx()}`); break; }
      if (Object.values(counts).some((v) => v < 0)) { failures.push(`negative: ${ctx()}`); break; }
      if (pick && (pick.reason === 'practice' || pick.beyond)) {
        const all = cardCounts(srs, { cards, context: 'break', level, segment, now, exclude: session, missed: breakMissed, skipped });
        const more = all.missed + all.review - (counts.missed + counts.review);
        if (pick.reason === 'practice' && more !== 0) { failures.push(`practice while ${more} beyond cards wait: ${ctx()}`); break; }
        if (pick.beyond && more < 1) { failures.push(`beyond but quizMoreDue ${more}: ${ctx()}`); break; }
      }
      if (pick?.beyond && L.dueLeft > 0) { failures.push(`beyond with dueLeft: ${ctx()}`); break; }
      if (pick && !srs[pick.card.id] && skipped.includes(pick.card.id)) { failures.push(`skipped new offered: ${ctx()}`); break; }
      if (pick && session.includes(pick.card.id) && !breakMissed.includes(pick.card.id)) { failures.push(`session card again: ${ctx()}`); break; }
      if (!pick) {
        // a new quiz session sometimes; else stop
        if (rng() < 0.5) { session = []; now += 10 * MIN; continue; }
        break;
      }
      session.push(pick.card.id);
      const id = pick.card.id;
      const retry = breakMissed.includes(id);
      const act = rng();
      if (act < 0.12) {
        // Play.skipCard
        const due = retry || (srs[id] && srs[id].dueAt <= now);
        if (due) {
          if (buried.n >= T.education.buryPerDay) continue; // 'cap': no skip, the card stays on show (we move on)
          if (srs[id]) srs[id] = { ...srs[id], dueAt: skipUntil(now) };
          buried = { ...buried, n: buried.n + 1, ids: buried.ids.includes(id) ? buried.ids : [...buried.ids, id] };
          breakMissed = breakMissed.filter((x) => x !== id);
          if (!retry) dueAsked += 1;
        } else if (srs[id]) {
          buried = { ...buried, ids: buried.ids.includes(id) ? buried.ids : [...buried.ids, id] };
        } else {
          buried = { ...buried, ids: buried.ids.includes(id) ? buried.ids : [...buried.ids, id] };
          newAsked += 1;
        }
      } else {
        const correct = act > 0.4;
        srs[id] = schedule(srs[id] ?? null, correct ? 'good' : 'again', now, T, { practice: pick.reason === 'practice' });
        recent = [...recent, id].slice(-T.education.minGap);
        if (!pick.beyond) {
          if (pick.reason === 'new') newAsked += 1;
          else if (!retry && (pick.reason === 'missed' || pick.reason === 'review')) dueAsked += 1;
          const m = breakMissed.filter((x) => x !== id);
          breakMissed = correct ? m : [...m, id];
        }
      }
      if (rng() < 0.05) session = []; // the quiz closed and opened again
      now += rng() < 0.05 ? 3 * HOUR : 5000;
    }
  }
  assert.deepEqual(failures, []);
});

test('fuzz: a static drain with the break\'s own misses, limits and skips: counts are the picks, kind by kind', () => {
  const failures = [];
  for (let seed = 1; seed <= 400 && failures.length < 5; seed += 1) {
    const rng = createRng(seed + 99);
    const cards = seed % 4 === 0 ? CARDS.map((c) => ({ ...c, retired: rng() < 0.1 })) : CARDS;
    const now = NOW0;
    const srs = randomSrs(rng, cards, now);
    const segIdx = Math.floor(rng() * SEGMENTS.length);
    const segment = SEGMENTS[segIdx];
    const level = segIdx + 2;
    const order = [...NEW_ORDERS][Math.floor(rng() * 3)];
    const newLeft = [0, 1, 3, Infinity, null, NaN][Math.floor(rng() * 6)];
    const dueLeft = [0, 1, 2, 5, Infinity, null][Math.floor(rng() * 6)];
    const skipped = cards.filter(() => rng() < 0.1).map((c) => c.id);
    const recent = cards.filter(() => rng() < 0.15).map((c) => c.id).slice(-5);
    // missed in this break: cards with a missed record due now, in exclude
    const missed = Object.keys(srs).filter((id) => srs[id].state === 'missed' && srs[id].dueAt <= now && rng() < 0.4);
    const exclude = [...missed];
    const counts = cardCounts(srs, { cards, context: 'break', level, segment, now, exclude, missed, skipped, newLeft, dueLeft });
    const got = { new: 0, missed: 0, review: 0 };
    let nl = newLeft, dl = dueLeft;
    const ex = [...exclude];
    let m = [...missed];
    const qrng = createRng(seed);
    for (let g = 0; g < 200; g += 1) {
      const p = pickCard({ cards, srs, context: 'break', level, segment, now, exclude: ex, recent, rng: qrng, dueFirst: true, missed: m, order, skipped, newLeft: nl, dueLeft: dl });
      if (!counted(p)) break;
      got[p.reason] += 1;
      if (m.includes(p.card.id)) m = m.filter((x) => x !== p.card.id); // answered right
      else if (p.reason === 'new') nl = typeof nl === 'number' && !Number.isNaN(nl) ? nl - 1 : nl;
      else dl = typeof dl === 'number' && !Number.isNaN(dl) ? dl - 1 : dl;
      ex.push(p.card.id);
    }
    try { assert.deepEqual(counts, got); } catch { failures.push(`seed ${seed} ${segment} ${order} newLeft ${newLeft} dueLeft ${dueLeft} missed ${missed.length}: counts ${JSON.stringify(counts)} picks ${JSON.stringify(got)}`); }
  }
  assert.deepEqual(failures, []);
});
