// Text with links in it (plan 26: a quiz card's Wikipedia words), NO Phaser/DOM. linkSpans finds the
// linked terms in a text; layoutRich wraps the result into centred lines of parts, word by word, the
// way the quiz card's explanation wraps, so each link can be drawn underlined with a tap box over
// it. Widths come from a `measure(text)` the caller passes (the scene measures with its own font), so
// everything here runs in Node.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` as spans [{ text, href? }], each of `links` ({ term, href }) linking the first occurrence of
 * its term as a whole word or phrase (not inside a longer word). A term not in the text, or one that
 * would overlap a term already linked, links nothing. The spans join back into `text`.
 */
export function linkSpans(text, links = []) {
  const found = [];
  for (const { term, href } of links) {
    if (!term || !href) continue;
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'u').exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + term.length;
    if (found.some((f) => start < f.end && f.start < end)) continue;
    found.push({ start, end, href });
  }
  found.sort((a, b) => a.start - b.start);
  const spans = [];
  let at = 0;
  for (const f of found) {
    if (f.start > at) spans.push({ text: text.slice(at, f.start) });
    spans.push({ text: text.slice(f.start, f.end), href: f.href });
    at = f.end;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

/**
 * Spans laid out in lines no wider than `maxWidth`, breaking only at spaces (greedy, as Phaser's word
 * wrap does; a word wider than the line gets a line of its own). Each line: { text, width, x, parts },
 * where `x` centres it on 0 and each part ({ text, href?, x, width }) is a run of one span's words,
 * placed from the line's left edge. The spaces between words sit in the parts, so measuring a line's
 * parts left to right gives the same widths as the line. `measure(s)` is the width of `s` in the
 * card's font, spaces included.
 */
export function layoutRich(spans, { measure, maxWidth }) {
  // Words, each a list of pieces (a word can straddle a span edge: "bile's" with "bile" linked).
  const words = [];
  let word = null;
  for (const span of spans) {
    for (const piece of span.text.split(/( +)/)) {
      if (piece === '') continue;
      if (/^ +$/.test(piece)) {
        word = null;
        continue;
      }
      if (!word) {
        word = [];
        words.push(word);
      }
      word.push({ text: piece, href: span.href ?? null });
    }
  }
  const wordText = (w) => w.map((p) => p.text).join('');
  const lines = [];
  let current = [];
  for (const w of words) {
    const candidate = [...current, w];
    if (current.length && measure(candidate.map(wordText).join(' ')) > maxWidth) {
      lines.push(current);
      current = [w];
    } else current = candidate;
  }
  if (current.length) lines.push(current);
  return lines.map((lineWords) => {
    // Merge the pieces into parts: consecutive pieces with the same href, the spaces between words
    // joining the part they fall in (a space between two links is plain).
    const parts = [];
    lineWords.forEach((w, i) => {
      if (i > 0) {
        const prev = parts.at(-1);
        const next = w[0];
        if (prev.href && prev.href === next.href) prev.text += ' ';
        else if (!prev.href) prev.text += ' ';
        else parts.push({ text: ' ', href: null });
      }
      for (const p of w) {
        const prev = parts.at(-1);
        if (prev && prev.href === p.href) prev.text += p.text;
        else parts.push({ text: p.text, href: p.href });
      }
    });
    const text = parts.map((p) => p.text).join('');
    const width = measure(text);
    let left = 0;
    const placed = parts.map((p) => {
      const out = { text: p.text, x: left, width: measure(p.text), ...(p.href ? { href: p.href } : {}) };
      left += out.width;
      return out;
    });
    return { text, width, x: -width / 2, parts: placed };
  });
}
