// The online lobby's screens (plan 39, 1.6c, as accepted in Preview A, item 36), drawn inside the 🌐
// window of the tournament panel: the 🌐 row (locked on where split-screen cannot fit, a phone), the
// online home (you, the opponent's empty row, Join with code / Create room, the safety line), Connecting,
// the host's code (grouped, its countdown, Share / Copy, waiting), a guest asking (Let in / Decline),
// the code keypad, the guest knocking, and the ready screen. The decisions are src/onlineLobby.js's;
// this file draws its state and turns taps into its calls. The keypad is the sign-in side's
// (src/ui/onlineAccountViews.js), so the pairing code and the room code type the same way.
//
// `ui` = { tr, me, setStatus(text, kind), rerender, homeExtras() → { notes, devices }, share(text, code) }:
// share with a text opens the share sheet (falling back to a copy), with null it copies the code.

import { SHARE } from '../config.js';
import { formatCode } from '../online.js';
import { h, keypad } from './onlineAccountViews.js';

/** The CSS the lobby adds to the panel whose root is `#id` (the shared bits come from accountCss). */
export function lobbyCss(id) {
  return `
#${id} .net { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 12px; padding: 8px 10px; border-radius: 10px; background: #24101d; }
#${id} .net .lbl { font-size: 16px; }
#${id} .net .sub { display: block; font-size: 13px; color: #c9b8dc; }
#${id} button.switch { position: relative; flex: none; box-sizing: border-box; width: 64px; height: 34px; padding: 0; border-radius: 17px; background: #4a3a44; border: 2px solid #e85e96; }
#${id} button.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; transition: left 120ms; }
#${id} button.switch[aria-pressed="true"] { background: #8a4b2a; }
#${id} button.switch[aria-pressed="true"]::after { left: 33px; }
#${id} button.switch:disabled { opacity: 0.7; }
#${id} .ttl.low { color: #ff8da8; }
#${id} .slot .mark { font-size: 14px; color: #c9b8dc; white-space: nowrap; }
#${id} .slot .mark.ok { color: #9be89b; font-weight: bold; }
`;
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const LOW_MS = 2 * 60 * 1000; // the countdown turns red under 2 minutes

function button(id, label, cls, fn, primary = false) {
  const b = h('button', { type: 'button', id, class: cls || false, 'data-primary': primary || false }, label);
  b.addEventListener('click', fn);
  return b;
}

/** A player row: name and tag, then a mark on the right (ready, waiting, host). */
function slot(id, name, tag, mark = null, markClass = '') {
  return h(
    'div',
    { class: 'slot', id },
    h('span', { class: `who${name ? '' : ' empty'}` }, name || '—', h('span', { class: 'tag' }, tag ? ` ${tag}` : '')),
    mark == null ? null : h('span', { class: `mark ${markClass}`.trim() }, mark),
  );
}

/** The 🌐 row over the panel: a switch, and a line saying what it does (or why it is locked on). */
export function netSwitch(ui, { on, forced }, onToggle) {
  const sw = h('button', { type: 'button', class: 'switch', id: 'tour-online', 'aria-pressed': on ? 'true' : 'false', 'aria-label': ui.tr('onlineSwitch') });
  sw.disabled = Boolean(forced);
  sw.addEventListener('click', () => {
    if (!forced) onToggle(!on);
  });
  const sub = forced ? ui.tr('onlineForced') : ui.tr(on ? 'onlineSwitchOnSub' : 'onlineSwitchOffSub');
  return h('div', { class: 'net', id: 'tour-net' }, h('span', { class: 'lbl' }, ui.tr('onlineSwitch'), h('span', { class: 'sub' }, sub)), sw);
}

/** "Race me in Flappy Poop: code 482 913" and the game's link (the share sheet's text). */
export function shareText(ui, code) {
  return `${ui.tr('onlineShareText').replace('{code}', formatCode(code))} ${SHARE.url}`;
}

const ttlText = (ui, left) => ui.tr('onlineCodeExpires').replace('{time}', mmss(left));

/**
 * The status line for the lobby's state: its message (an error, or a notice such as a new code), or
 * "Both ready" on the ready screen; null for nothing.
 */
export function lobbyMessage(ui, lobby) {
  const m = lobby.state.message;
  if (m) {
    let text = ui.tr(m.key).replace('{name}', m.name ?? '');
    // A dev host (ui.project 'live' / 'test') names this device's project on a wrong code: two devices
    // on different projects never see each other's rooms (item 43).
    if (m.key === 'onlineErrNoRoom' && (ui.project === 'live' || ui.project === 'test')) text += ` ${ui.tr(ui.project === 'test' ? 'onlineDevOnTest' : 'onlineDevOnLive')}`;
    return { text, kind: m.kind === 'error' ? 'error' : '' };
  }
  if (lobby.state.screen === 'ready' && lobby.bothReady()) return { text: ui.tr('onlineStarting'), kind: 'ok' };
  return null;
}

/** The host's countdown, redrawn in place once a second (no redraw, so the pad's ring stays). */
export function lobbyTick(ui, lobby) {
  const el = globalThis.document?.getElementById?.('tour-ttl');
  const left = lobby.codeLeftMs();
  if (!el || left === null) return;
  el.textContent = ttlText(ui, left);
  el.className = left < LOW_MS ? 'ttl low' : 'ttl';
}

/** The elements for the lobby's screen, under the 🌐 row. */
export function lobbyBody(ui, lobby) {
  const { tr } = ui;
  const st = lobby.state;
  const code = st.room?.code ?? '';
  // A tap's call has already set its screen (Connecting while create_room or join_room runs): draw that
  // now, then again with whatever it ends on.
  const draw = () => {
    const m = lobbyMessage(ui, lobby);
    ui.setStatus(m?.text ?? '', m?.kind ?? '');
    ui.rerender();
  };
  const redraw = (p) => {
    draw();
    return Promise.resolve(p).then(draw);
  };
  switch (st.screen) {
    case 'busy':
      return [h('p', { class: 'lead dots', id: 'tour-linking' }, tr('onlineConnecting'))];
    case 'host':
    case 'asked': {
      const left = lobby.codeLeftMs() ?? 0;
      const out = [
        h('p', { class: 'lead' }, tr('onlineCodeLead')),
        h('p', { class: 'code', id: 'tour-code' }, formatCode(code)),
        h('p', { class: left < LOW_MS ? 'ttl low' : 'ttl', id: 'tour-ttl' }, ttlText(ui, left)),
        h(
          'div',
          { class: 'share' },
          button('tour-share', tr('onlineShare'), '', () => ui.share(shareText(ui, code), code)),
          button('tour-copy', tr('onlineCopy'), 'outline', () => ui.share(null, code)),
        ),
        slot('tour-on-me', ui.me, tr('tournamentHostTag'), tr('onlineHostTag')),
      ];
      if (st.screen === 'host') {
        out.push(h('div', { class: 'slot', id: 'tour-on-them' }, h('span', { class: 'who empty' }, '—'), h('span', { class: 'mark dots' }, tr('onlineWaitingOpponent'))));
        out.push(h('div', { class: 'actions' }, button('tour-cancel', tr('onlineCancel'), 'outline', () => redraw(lobby.leave()))));
        return out;
      }
      out.push(h('p', { class: 'hint', id: 'tour-asked' }, tr('onlineAsked').replace('{name}', lobby.opponent())));
      out.push(h('div', { class: 'actions' }, button('tour-decline', tr('onlineDecline'), 'outline', () => redraw(lobby.answer(false))), button('tour-letin', tr('onlineLetIn'), '', () => redraw(lobby.answer(true)), true)));
      out.push(h('p', { class: 'note' }, tr('onlineDeclineNote')));
      return out;
    }
    case 'join':
      return [
        h('p', { class: 'lead' }, tr('onlineJoinLead')),
        ...keypad(ui, st, tr('onlineJoinGo'), () => redraw(lobby.join())),
        h('div', { class: 'actions' }, button('tour-cancel', tr('onlineBack'), 'outline', () => redraw(lobby.back()))),
      ];
    case 'knock':
      return [
        h('p', { class: 'code', id: 'tour-code' }, formatCode(code)),
        slot('tour-on-them', lobby.opponent(), tr('onlineHostTag')),
        slot('tour-on-me', ui.me, tr('tournamentHostTag')),
        h('p', { class: 'hint dots', id: 'tour-knock' }, tr('onlineKnocking').replace('{name}', lobby.opponent())),
        h('div', { class: 'actions' }, button('tour-cancel', tr('onlineCancel'), 'outline', () => redraw(lobby.leave()))),
      ];
    case 'ready': {
      const host = st.room?.role === 'host';
      const mark = (on) => [on ? tr('onlineIsReady') : tr('onlineNotReady'), on ? 'ok' : ''];
      const ready = button('tour-ready', tr(st.meReady ? 'onlineUnready' : 'onlineReady'), st.meReady ? 'outline' : '', () => redraw(lobby.setReady(!st.meReady)), true);
      const meTag = host ? `${tr('tournamentHostTag')} ${tr('onlineHostTag')}` : tr('tournamentHostTag');
      return [
        h('p', { class: 'lead' }, tr('onlineReadyLead').replace('{name}', lobby.opponent())),
        slot('tour-on-me', ui.me, meTag, ...mark(st.meReady)),
        slot('tour-on-them', lobby.opponent(), host ? '' : tr('onlineHostTag'), ...mark(st.themReady)),
        h('div', { class: 'actions' }, button('tour-leave', tr('onlineLeave'), 'outline', () => redraw(lobby.leave())), ready),
      ];
    }
    default: {
      const { notes = [], devices = null } = ui.homeExtras?.() ?? {};
      return [
        h('p', { class: 'lead' }, tr('onlineLead')),
        ...notes,
        slot('tour-on-me', ui.me, tr('tournamentHostTag')),
        slot('tour-on-them', '', '', tr('onlineOpponentNone')),
        h('div', { class: 'actions' }, button('tour-join', tr('onlineJoin'), 'outline', () => redraw(lobby.openJoin())), button('tour-create', tr('onlineCreate'), '', () => redraw(lobby.create()), true)),
        h('p', { class: 'note' }, tr('onlineNote')),
        devices,
      ].filter(Boolean);
    }
  }
}
