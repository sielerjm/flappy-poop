// The online race's sign-in screens (plan 39, 1.6a, as accepted in Preview B, item 37), drawn inside
// the 🌐 window of the tournament panel (1.6c mounts them): no username yet (the name field), the
// Connecting state, the notes on the online home (a demotion, blocked
// storage), 📱 Devices on a paired device (the list, Remove asked twice, Pair a new device and its
// code) and on a waiting device (the pairing keypad, Remove this device). The decisions are in
// src/onlineAccount.js; this file only draws them and turns taps into its calls.
//
// Each view returns the elements to show under the 🌐 row; the caller (the panel) puts them in its
// body and passes `ui`: { tr, rerender, setStatus(text, kind), now, confirmMs, onLinked(result) }.
// `st` is the view state from createAccountState(); a redraw reads it again.

/** The CSS the sign-in screens add to the panel whose root is `#id` (its .slot, buttons and .status come from the panel). */
export function accountCss(id) {
  return `
#${id} .lead { margin: 0 0 12px; font-size: 15px; text-align: center; color: #c9b8dc; }
#${id} .warn, #${id} .note.warn { color: #ffd27a; }
#${id} .note { margin: 12px 0 0; font-size: 14px; text-align: center; color: #a898b4; }
#${id} .status.ok { color: #9be89b; font-weight: bold; }
#${id} .slot .sub { display: block; font-size: 12px; color: #c9b8dc; }
#${id} button.small { padding: 6px 12px; font-size: 13px; }
#${id} .code { margin: 4px 0 2px; font: bold 44px ui-monospace, Menlo, monospace; letter-spacing: 4px; text-align: center; color: #ffd700; }
#${id} .ttl { margin: 0 0 10px; font-size: 15px; text-align: center; color: #c9b8dc; }
#${id} .share { display: flex; justify-content: center; gap: 10px; margin: 0 0 12px; }
#${id} .dots::after { content: ''; animation: online-dots 1.2s steps(4) infinite; }
@keyframes online-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
#${id} .boxes { display: flex; justify-content: center; gap: 6px; margin: 4px 0 14px; }
#${id} .boxes span { width: 2.1ch; height: 1.2em; line-height: 1.2em; padding: 6px 0; font: bold 30px ui-monospace, Menlo, monospace; text-align: center; color: #ffd700; border-bottom: 3px solid #e85e96; }
#${id} .boxes span.gap { width: 1ch; border: 0; }
#${id} .boxes span.cur { border-bottom-color: #ffd700; }
#${id} .keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 300px; margin: 0 auto; }
#${id} .keys button { padding: 12px 0; font-size: 22px; }
#${id} .keys button.outline:active, #${id} .keys button.outline.hit { background: rgba(248, 160, 200, 0.3); }
`;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v || '';
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== '') el.append(c);
  return el;
}

/** The sign-in side's view state. */
export function createAccountState() {
  return { view: 'linking', nameDraft: '', typed: '', rows: [], history: null, name: '', trusted: false, demoted: false, blocked: false, code: '', expiresAt: 0, removeArmed: null, removeArmedAt: 0, busy: false, friends: null, badge: 0, friendOpen: null, friendArmed: null, friendArmedAt: 0, blockedOpen: false };
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function button(id, label, cls, fn, primary = false) {
  const b = h('button', { type: 'button', id, class: cls || false, 'data-primary': primary || false }, label);
  b.addEventListener('click', fn);
  return b;
}

/** How long a pressed key stays light pink after the redraw that replaced it (plan 39, item 70, N10). */
export const KEY_FLASH_MS = 150;

/**
 * A pressed key's light pink: each press redraws the keypad, so the key under the thumb is a new
 * element at once and its :active look is gone; the press records `st.hit` and the redrawn key
 * carries `hit` until KEY_FLASH_MS after the press.
 */
function pressedLook(st, b) {
  const left = st.hit?.id === b.id ? st.hit.at + KEY_FLASH_MS - Date.now() : 0;
  if (left <= 0) return b;
  b.className = `${b.className || ''} hit`.trim();
  setTimeout(() => {
    b.className = b.className.replace(/\s*\bhit\b/, '');
  }, left);
  return b;
}

/**
 * Six code boxes (a gap after the third) and a 3×4 keypad: digits, ⌫ and the go key, which waits
 * for six digits. The room code (1.6c) and the pairing code share it. `st.typed` holds the digits.
 */
export function keypad(ui, st, goLabel, onGo) {
  const boxes = [];
  for (let i = 0; i < 6; i += 1) {
    if (i === 3) boxes.push(h('span', { class: 'gap' }));
    boxes.push(h('span', { class: i === st.typed.length ? 'cur' : '' }, st.typed[i] ?? ''));
  }
  const press = (d) => {
    if (st.typed.length >= 6) return;
    st.typed += d;
    st.hit = { id: `tour-key-${d}`, at: Date.now() };
    ui.setStatus('');
    ui.rerender();
  };
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => button(`tour-key-${d}`, d, 'outline', () => press(d)));
  const back = button('tour-key-back', '⌫', 'outline', () => {
    st.typed = st.typed.slice(0, -1);
    st.hit = { id: 'tour-key-back', at: Date.now() };
    ui.rerender();
  });
  const go = button('tour-key-go', goLabel, '', onGo);
  go.disabled = st.typed.length !== 6;
  const keys = [...digits, back, button('tour-key-0', '0', 'outline', () => press('0'))].map((b) => pressedLook(st, b));
  return [h('div', { class: 'boxes', id: 'tour-boxes' }, ...boxes), h('div', { class: 'keys', id: 'tour-keys' }, ...keys, go)];
}

/** An account result's state into `st` (enter, claim). */
function applyLinked(st, r) {
  Object.assign(st, { view: 'home', name: r.name, trusted: r.trusted, demoted: r.demoted, blocked: r.blocked });
}

/**
 * Entering 🌐: Connecting, then the online home (ui.onLinked), the name field, or a refusal with
 * its message on the status line (view 'failed': the panel offers 🌐 off or a retry).
 */
export async function enterOnline(ui, st, account) {
  st.view = 'linking';
  ui.setStatus('');
  ui.rerender();
  const r = await account.enter();
  if (!r.ok) {
    st.view = 'failed';
    ui.rerender();
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return r;
  }
  st.blocked = r.blocked;
  if (r.view === 'noname') {
    st.view = 'noname';
    ui.rerender();
    ui.setStatus(r.errorKey ? ui.tr(r.errorKey) : '', r.errorKey ? 'error' : '');
    return r;
  }
  applyLinked(st, r);
  ui.rerender();
  ui.onLinked?.(r);
  return r;
}

async function onClaim(ui, st, account, value) {
  if (st.busy) return;
  st.nameDraft = String(value ?? '');
  st.busy = true;
  ui.setStatus(ui.tr('saveNameChecking'));
  const r = await account.claim(st.nameDraft);
  st.busy = false;
  if (!r.ok) {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return;
  }
  applyLinked(st, r);
  ui.setStatus('');
  ui.rerender();
  ui.onLinked?.(r);
}

async function openDevices(ui, st, account) {
  st.typed = '';
  st.removeArmed = null;
  const still = ui.mark?.() ?? (() => true);
  const r = await account.devices();
  if (!still()) return; // a late answer draws nothing (3.6, AUD-115)
  if (r.ok) {
    st.rows = r.rows;
    st.trusted = true;
  } else if (r.pending) {
    st.trusted = false;
  } else {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return;
  }
  st.view = 'devices';
  ui.setStatus('');
  ui.rerender();
}

async function openRaces(ui, st, account) {
  const still = ui.mark?.() ?? (() => true);
  const r = await account.races();
  if (!still()) return; // a late answer draws nothing (3.6, AUD-115)
  if (r.ok) {
    st.history = { rival: r.rival, recent: r.recent };
    st.trusted = true;
  } else if (r.pending) {
    st.trusted = false;
    st.history = null;
  } else {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return;
  }
  st.view = 'races';
  ui.setStatus('');
  ui.rerender();
}

/** Remove asks twice (like Clear): the first tap warns, a second inside ui.confirmMs removes. */
async function onRemove(ui, st, account, which) {
  const now = ui.now();
  if (st.removeArmed !== which || now - st.removeArmedAt > ui.confirmMs) {
    st.removeArmed = which;
    st.removeArmedAt = now;
    ui.setStatus(ui.tr(which === 'me' ? 'onlineRemoveThisConfirm' : 'onlineRemoveConfirm'), 'error');
    return;
  }
  st.removeArmed = null;
  const me = which === 'me' || st.rows[which]?.me === true;
  const uid = which === 'me' ? null : st.rows[which]?.uid;
  const r = await account.remove(uid, { me });
  if (!r.ok) {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return;
  }
  if (r.left) {
    Object.assign(st, { view: 'left', name: '', trusted: false, rows: [] });
    ui.rerender();
    ui.setStatus(ui.tr('onlineRemovedThis'), 'ok');
    return;
  }
  st.rows = st.rows.filter((_, i) => i !== which);
  ui.rerender();
  ui.setStatus(ui.tr('onlineRemoved'), 'ok');
}

async function onPairCode(ui, st, account) {
  const r = await account.pairCode();
  if (!r.ok) {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return;
  }
  Object.assign(st, { view: 'paircode', code: r.code, expiresAt: r.expiresAt });
  ui.setStatus('');
  ui.rerender();
}

async function onPair(ui, st, account) {
  const still = ui.mark?.() ?? (() => true);
  const r = await account.pair(st.typed);
  st.typed = '';
  if (r.ok) Object.assign(st, { trusted: true, demoted: false }); // paired, wherever the player is now
  if (r.ok) ui.onPaired?.();
  if (!still()) return; // a late answer draws nothing (3.6, AUD-115)
  if (!r.ok) {
    ui.rerender();
    ui.setStatus(ui.tr(r.errorKey).replace('{n}', String(r.left ?? '')), 'error');
    return;
  }
  await openDevices(ui, st, account);
  ui.setStatus(ui.tr('onlinePairedOk'), 'ok');
}

/** The pairing code's countdown, for the panel's once-a-second tick (no redraw). */
export function pairCodeLeft(ui, st) {
  return ui.tr('onlinePairCodeExpires').replace('{time}', mmss(st.expiresAt - ui.now()));
}

/**
 * The online home's notes: a demotion (M1 rule 5) and blocked storage. A device waiting to pair gets no
 * note here (plan 39, 3.8: it races and its races are saved); the prompt shows where a gated screen opens.
 */
export function accountNotes(ui, st) {
  const out = [];
  if (st.demoted) out.push(h('p', { class: 'hint warn', id: 'tour-demoted' }, ui.tr('onlineDemoted')));
  if (st.blocked) out.push(h('p', { class: 'note warn', id: 'tour-blocked' }, ui.tr('onlineStorageBlocked')));
  return out;
}

/** The online home's 🏁 Recent races and 📱 Devices buttons. */
export function devicesButton(ui, st, account) {
  return h('div', { class: 'share' }, button('tour-races', ui.tr('onlineRaces'), 'outline small', () => openRaces(ui, st, account)), button('tour-devices', ui.tr('onlineDevices'), 'outline small', () => openDevices(ui, st, account)));
}

/**
 * The sign-in side's own views: 'noname', 'linking', 'devices', 'races' (2.5), 'paircode' ('home', 'failed' and
 * 'left' belong to the panel). `back()` returns to the online home.
 */
export function accountBody(ui, st, account, back) {
  const { tr } = ui;
  if (st.view === 'linking') return [h('p', { class: 'lead dots', id: 'tour-linking' }, tr('onlineConnecting'))];
  if (st.view === 'noname') {
    const input = h('input', { type: 'text', id: 'tour-name', placeholder: tr('saveNamePlaceholder'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '32' });
    input.value = st.nameDraft;
    const save = button('tour-name-save', tr('onlineNameSave'), '', () => onClaim(ui, st, account, input.value), true);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onClaim(ui, st, account, input.value);
    });
    return [h('p', { class: 'lead' }, tr('onlineNeedName')), h('div', { class: 'slot' }, input, save), h('p', { class: 'note' }, tr('onlineNameNote'))];
  }
  if (st.view === 'devices' && !st.trusted) {
    return [
      h('p', { class: 'lead' }, tr('onlinePendingLead')),
      ...(st.demoted ? [h('p', { class: 'hint warn', id: 'tour-demoted' }, tr('onlineDemoted'))] : []),
      h('p', { class: 'hint' }, tr('onlinePairHow')),
      ...keypad(ui, st, tr('onlinePairGo'), () => onPair(ui, st, account)),
      h('div', { class: 'actions' }, button('tour-remove-me', tr('onlineRemoveThis'), 'outline', () => onRemove(ui, st, account, 'me')), button('tour-dev-back', tr('onlineBack'), '', back, true)),
    ];
  }
  if (st.view === 'devices') {
    const rows = st.rows.map((d, i) => {
      const what = d.me ? tr('onlineThisDevice') : tr('onlineOtherDevice').replace('{n}', String(i + 1));
      const when = tr(d.trusted ? 'onlineSeen' : 'onlineLinked').replace('{when}', d.days === 0 ? tr('onlineToday') : d.days === 1 ? tr('onlineYesterday') : tr('onlineDaysAgo').replace('{n}', String(d.days)));
      const row = h('div', { class: 'slot', id: `tour-dev-${i}` }, h('span', { class: 'who' }, what, h('span', { class: 'tag' }, ` · ${tr(d.trusted ? 'onlinePaired' : 'onlineWaitingPair')}`), h('span', { class: 'sub' }, when)));
      if (!d.me) row.append(button(`tour-dev-rm-${i}`, tr('onlineRemove'), 'outline', () => onRemove(ui, st, account, i)));
      return row;
    });
    return [
      h('p', { class: 'lead' }, tr('onlineDevicesLead')),
      ...rows,
      h('div', { class: 'actions' }, button('tour-dev-back', tr('onlineBack'), 'outline', back), button('tour-pair-new', tr('onlinePairNew'), '', () => onPairCode(ui, st, account), true)),
    ];
  }
  if (st.view === 'races') {
    const home = button('tour-races-back', tr('onlineBack'), '', back, true);
    if (!st.trusted || !st.history) return [h('p', { class: 'lead' }, tr('onlineRacesLead')), h('p', { class: 'hint warn', id: 'tour-races-pending' }, tr('onlineRacesPending')), h('div', { class: 'actions' }, home)];
    const { rival, recent } = st.history;
    const when = (d) => (d === 0 ? tr('onlineToday') : d === 1 ? tr('onlineYesterday') : tr('onlineDaysAgo').replace('{n}', String(d)));
    const rows = recent.map((x, i) =>
      h(
        'div',
        { class: 'slot', id: `tour-race-${i}` },
        h('span', { class: 'who' }, x.name, h('span', { class: 'sub' }, when(x.days))),
        h('span', { class: `mark ${x.result === 'won' ? 'ok' : ''}`.trim() }, `${tr({ won: 'onlineRaceWon', lost: 'onlineRaceLost', draw: 'onlineRaceDraw' }[x.result])} ${x.mine}–${x.theirs}`),
      ),
    );
    return [
      h('p', { class: 'lead' }, tr('onlineRacesLead')),
      h('div', { class: 'slot', id: 'tour-rival' }, h('span', { class: 'who' }, tr('onlineRival'), h('span', { class: 'sub' }, rival ? tr('statsRivalLine').replace('{name}', rival.name).replace('{losses}', String(rival.losses)).replace('{meetings}', String(rival.meetings)) : '—'))),
      ...(rows.length ? rows : [h('p', { class: 'hint', id: 'tour-races-none' }, tr('onlineRacesNone'))]),
      h('p', { class: 'note' }, tr('onlineRacesNote')),
      h('div', { class: 'actions' }, home),
    ];
  }
  if (st.view === 'paircode') {
    return [
      h('p', { class: 'lead' }, tr('onlinePairCodeLead')),
      h('p', { class: 'code', id: 'tour-pair-code' }, `${st.code.slice(0, 3)} ${st.code.slice(3)}`),
      h('p', { class: 'ttl', id: 'tour-pair-ttl' }, pairCodeLeft(ui, st)),
      h('p', { class: 'note' }, tr('onlinePairCodeNote')),
      h('div', { class: 'actions' }, button('tour-pair-done', tr('onlineBack'), '', () => openDevices(ui, st, account), true)),
    ];
  }
  return [];
}
