// The Friends screen (plan 39, 3.3), drawn inside the 🌐 window of the tournament panel: the online
// home's 🤝 Friends button with its badge (asks waiting for this player's answer: online mode only,
// never anywhere else), and the screen itself: asks to answer (Accept | Decline), friends with a dot and
// a word for their state (online → in a game → offline, then by name), asks this player sent (Take back),
// recent opponents (their ⋯ adds), and the blocked list (Unblock). A friend's ⋯ shows Remove and Block, an
// opponent's Add friend and Block (Michael, 22 Nov); Remove and Block ask twice, like Remove on 📱 Devices. The decisions and the data are
// src/onlineFriends.js's; this file only draws them and turns taps into its calls.
//
// `ui` is the sign-in side's (onlineAccountViews.js): { tr, rerender, setStatus(text, kind), now, confirmMs }.
// `st` is its view state (createAccountState): the screen keeps `friends` (the last load), `badge`,
// `friendOpen` (the handle whose actions show), `friendArmed` / `friendArmedAt` and `blockedOpen` there.

import { stateLook } from '../onlineFriends.js';
import { inviteLeftMs, mmss, ringShare } from '../onlineInvites.js';
import { h } from './onlineAccountViews.js';

/** The CSS the Friends screen adds to the panel whose root is `#id`. */
export function friendsCss(id) {
  return `
#${id} .badge { display: inline-block; min-width: 1.4em; margin-left: 6px; padding: 1px 6px; border-radius: 10px; font-size: 13px; font-weight: bold; line-height: 1.3; color: #1a0b14; background: #ffd700; }
#${id} .sect { margin: 14px 0 4px; font-size: 13px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; color: #a898b4; }
#${id} .slot .st { font-size: 12px; }
#${id} .slot .st.on { color: #9be89b; }
#${id} .slot .st.game { color: #ffd27a; }
#${id} .slot .st.off { color: #a898b4; }
#${id} .slot .acts { display: flex; flex: none; gap: 6px; }
#${id} .more { display: flex; justify-content: flex-end; gap: 8px; margin: -2px 0 8px; }
#${id} button.wide { display: block; width: 100%; margin: 12px 0 0; padding: 10px 14px; font-size: 17px; }
#${id} .badge.inv { background: #9be89b; }
#${id} button.inv { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; }
#${id} .ring { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: conic-gradient(#1a0b14 calc(var(--f, 1) * 1turn), rgba(26, 11, 20, 0.25) 0); }
#${id} .ring > span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #f8a0c8; font-size: 15px; }
#${id} .slot .sub.inv { color: #9be89b; }
#${id} .slot.fr { flex-wrap: wrap; }
#${id} .slot.fr .who { flex: 1 0 auto; max-width: 100%; }
#${id} .slot.fr .acts { margin-left: auto; }
`;
}

const when = (tr, days) => (days === 0 ? tr('onlineToday') : days === 1 ? tr('onlineYesterday') : tr('onlineDaysAgo').replace('{n}', String(days)));
const daysAgo = (ui, at) => (Number.isFinite(at) ? Math.max(0, Math.floor((ui.now() - at) / 86400000)) : 0);

function button(id, label, cls, fn, primary = false) {
  const b = h('button', { type: 'button', id, class: cls || false, 'data-primary': primary || false }, label);
  b.addEventListener('click', fn);
  return b;
}

/** The online home's 🤝 Friends button, with the number of asks waiting for an answer. */
export function friendsButton(ui, st, friends) {
  const invites = ui.invites?.count?.() ?? 0; // 4.2: the outline's ✉️ count of friends' invites waiting
  const b = h(
    'button',
    { type: 'button', id: 'tour-friends', class: 'outline wide' },
    ui.tr('friendsButton'),
    st.badge > 0 ? h('span', { class: 'badge', id: 'tour-friends-badge' }, String(st.badge)) : null,
    invites > 0 ? h('span', { class: 'badge inv', id: 'tour-friends-inv' }, `✉️ ${invites}`) : null,
  );
  b.addEventListener('click', () => openFriends(ui, st, friends));
  return b;
}

/** Read the badge again (entering the home, back from the screen, the home's slow poll); true when it changed. */
export async function refreshBadge(st, friends) {
  if (!friends || !st.trusted) return false;
  const r = await friends.waiting();
  if (!r.ok) return false;
  const changed = r.count !== st.badge;
  st.badge = r.count;
  return changed;
}

/**
 * Open the screen: one load of the lists, the dots and the recent opponents. True when drawn; an
 * answer after the player moved to another screen draws nothing (3.6, AUD-115).
 */
export async function openFriends(ui, st, friends, { keepStatus = false } = {}) {
  const still = ui.mark?.() ?? (() => true);
  // 4.2: the invites are read with the lists (entering Friends, and after every call here: a Block or
  // Remove ends that friend's invite, item 65), so a missed broadcast never leaves a ✉️ behind.
  const [r] = await Promise.all([friends.load(), Promise.resolve(ui.refreshInvites?.()).catch(() => null)]);
  if (!still()) return false;
  if (r.ok) {
    st.friends = r;
    st.trusted = true;
    st.badge = r.incoming.length;
  } else if (r.pending) {
    st.trusted = false;
    st.friends = null;
  } else {
    ui.setStatus(ui.tr(r.errorKey), 'error');
    return false;
  }
  st.view = 'friends';
  if (!keepStatus) {
    st.friendOpen = null;
    st.friendArmed = null;
    ui.setStatus('');
  }
  ui.rerender();
  return true;
}

/** The screen's poll: the dots again, redrawn only when one changed. */
export async function pollFriends(ui, st, friends) {
  if (st.view !== 'friends' || !st.friends) return;
  const r = await friends.statuses();
  if (!r.ok || st.view !== 'friends' || !st.friends) return;
  let changed = false;
  for (const f of st.friends.friends) {
    const s = r.states.get(f.peer) ?? 'offline';
    if (s !== f.state) {
      f.state = s;
      changed = true;
    }
  }
  if (!changed) return;
  const rank = (s) => ['online', 'in_game', 'offline'].indexOf(s);
  st.friends.friends.sort((a, b) => rank(a.state) - rank(b.state) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  ui.rerender();
}

/** One call, its line on the status bar ({name} filled in), then the lists again. */
async function run(ui, st, friends, call, okKey, name) {
  if (st.busy) return;
  st.busy = true;
  const still = ui.mark?.() ?? (() => true);
  const r = await call();
  st.busy = false;
  if (!still()) return; // the player left this screen meanwhile: nothing drawn (AUD-115)
  st.friendArmed = null;
  st.friendOpen = null;
  if (!r.ok) {
    if (r.pending) {
      st.trusted = false;
      st.friends = null;
      ui.rerender();
      return;
    }
    // A refusal ('no request', 'no peer': the ask or the player is gone) reads the lists again (AUD-116).
    if (!(await openFriends(ui, st, friends, { keepStatus: true }))) {
      if (!still()) return;
      ui.rerender();
    }
    ui.setStatus(ui.tr(r.errorKey).replace('{name}', name), 'error');
    return;
  }
  const key = typeof okKey === 'function' ? okKey(r) : okKey;
  await openFriends(ui, st, friends, { keepStatus: true });
  ui.setStatus(ui.tr(key).replace('{name}', name), 'ok');
}

/** Remove and Block ask twice: the first tap says what happens, a second inside ui.confirmMs does it. */
function armed(ui, st, what, peer, name) {
  const now = ui.now();
  if (st.friendArmed?.what === what && st.friendArmed?.peer === peer && now - st.friendArmedAt <= ui.confirmMs) return true;
  st.friendArmed = { what, peer };
  st.friendArmedAt = now;
  ui.setStatus(ui.tr(what === 'block' ? 'friendBlockConfirm' : 'friendRemoveConfirm').replace('{name}', name), 'error');
  return false;
}

function onRemove(ui, st, friends, x) {
  if (armed(ui, st, 'remove', x.peer, x.name)) run(ui, st, friends, () => friends.remove(x.peer), 'friendRemoved', x.name);
}

function onBlock(ui, st, friends, x) {
  if (armed(ui, st, 'block', x.peer, x.name)) run(ui, st, friends, () => friends.block(x.peer), 'friendBlocked', x.name);
}

/** A row's ⋯: its actions under it (one row at a time), or closed again. */
function moreButton(ui, st, id, x) {
  return button(id, '⋯', 'outline small', () => {
    st.friendOpen = st.friendOpen === x.peer ? null : x.peer;
    st.friendArmed = null;
    ui.setStatus('');
    ui.rerender();
  });
}

/** Add friend: the ask (a crossed one makes friends at once). */
function onAdd(ui, st, friends, x) {
  run(ui, st, friends, () => friends.ask(x.peer), (r) => (r.status === 'accepted' ? 'friendNowFriends' : 'friendAddedSent'), x.name);
}

function moreLine(ui, st, friends, i, x, { remove = false, add = false }) {
  if (st.friendOpen !== x.peer) return null;
  return h(
    'div',
    { class: 'more', id: `tour-fr-more-${i}` },
    ...(add ? [button(`tour-fr-add-${i}`, ui.tr('friendAdd'), 'small', () => onAdd(ui, st, friends, x))] : []),
    ...(remove ? [button(`tour-fr-rm-${i}`, ui.tr('friendRemove'), 'outline small', () => onRemove(ui, st, friends, x))] : []),
    button(`tour-fr-block-${i}`, ui.tr('friendBlock'), 'outline small', () => onBlock(ui, st, friends, x)),
  );
}

/**
 * 4.2: a 🟢 friend's buttons: their ✉️ (a ring of the time left, and m:ss) with ✕ when they invited
 * this player, else Invite (only with no room or an open one: ui.canInvite). Shown only while the
 * friend reads 🟢 (item 65: a sender who left online mode leaves an invite that reads expired, untold).
 */
function inviteButtons(ui, i, x) {
  const inv = x.state === 'online' ? ui.invites?.from?.(x.peer) ?? null : null;
  if (inv) {
    const now = ui.serverNow?.() ?? Date.now();
    const left = h('span', { class: 'left', id: `tour-fr-inv-left-${i}` });
    left.textContent = mmss(inviteLeftMs(inv, now));
    const yes = h(
      'button',
      { type: 'button', id: `tour-fr-inv-${i}`, class: 'small inv', 'data-primary': '', 'aria-label': ui.tr('inviteJoinLabel').replace('{name}', x.name), 'data-exp': String(inv.expiresAt), 'data-sent': String(inv.sentAt) },
      h('span', { class: 'ring', id: `tour-fr-inv-ring-${i}`, style: `--f: ${ringShare(inv, now).toFixed(3)}` }, h('span', {}, '✉️')),
      left,
    );
    yes.addEventListener('click', () => ui.acceptInvite?.(inv));
    const no = button(`tour-fr-invno-${i}`, '✕', 'outline small', () => ui.declineInvite?.(inv));
    no.setAttribute('aria-label', ui.tr('inviteDeclineLabel').replace('{name}', x.name));
    return [yes, no];
  }
  if (x.state === 'online' && ui.invites && (ui.canInvite?.() ?? true)) return [button(`tour-fr-invite-${i}`, ui.tr('friendInvite'), 'small', () => ui.invite?.(x))];
  return [];
}

/** 4.2: the ✉️ rings and times redrawn in place once a second (no redraw, so the pad's ring stays). */
export function inviteTick(ui) {
  const byId = (id) => globalThis.document?.getElementById?.(id) ?? null;
  const now = ui.serverNow?.() ?? Date.now();
  for (let i = 0; byId(`tour-fr-${i}`); i += 1) {
    const b = byId(`tour-fr-inv-${i}`);
    if (!b) continue;
    const inv = { sentAt: Number(b.getAttribute('data-sent')), expiresAt: Number(b.getAttribute('data-exp')) };
    byId(`tour-fr-inv-ring-${i}`)?.setAttribute('style', `--f: ${ringShare(inv, now).toFixed(3)}`);
    const left = byId(`tour-fr-inv-left-${i}`);
    if (left) left.textContent = mmss(inviteLeftMs(inv, now));
  }
}

/** The Friends screen. `back()` returns to the online home. */
export function friendsBody(ui, st, friends, back) {
  const { tr } = ui;
  const home = button('tour-fr-back', tr('onlineBack'), '', back, true);
  if (!st.trusted || !st.friends) return [h('p', { class: 'lead' }, tr('friendsLead')), h('p', { class: 'hint warn', id: 'tour-fr-pending' }, tr('friendsPending')), h('div', { class: 'actions' }, home)];
  const { friends: list, incoming, outgoing, opponents, blocked } = st.friends;
  const out = [h('p', { class: 'lead' }, tr('friendsLead'))];
  if (incoming.length) {
    out.push(h('p', { class: 'sect' }, tr('friendsAskedYou')));
    incoming.forEach((x, i) => {
      out.push(
        h(
          'div',
          { class: 'slot', id: `tour-fr-in-${i}` },
          h('span', { class: 'who' }, x.name, h('span', { class: 'sub' }, tr('friendAskedWhen').replace('{when}', when(tr, daysAgo(ui, x.at))))),
          h(
            'span',
            { class: 'acts' },
            button(`tour-fr-no-${i}`, tr('friendDecline'), 'outline small', () => run(ui, st, friends, () => friends.respond(x.peer, false), 'friendDeclined', x.name)),
            button(`tour-fr-yes-${i}`, tr('friendAccept'), 'small', () => run(ui, st, friends, () => friends.respond(x.peer, true), 'friendNowFriends', x.name)),
            moreButton(ui, st, `tour-fr-in-more-${i}`, x),
          ),
        ),
      );
      const more = moreLine(ui, st, friends, `in-${i}`, x, { remove: false });
      if (more) out.push(more);
    });
  }
  out.push(h('p', { class: 'sect' }, tr('friendsList').replace('{n}', String(list.length))));
  if (!list.length) out.push(h('p', { class: 'hint', id: 'tour-fr-none' }, tr('friendsNone')));
  // 4.2: a 🟢 friend whose invite is live comes first (it lasts 2 minutes: never below the fold).
  const invitedBy = (x) => x.state === 'online' && Boolean(ui.invites?.from?.(x.peer));
  [...list.filter(invitedBy), ...list.filter((x) => !invitedBy(x))].forEach((x, i) => {
    const look = stateLook(x.state);
    const invited = x.state === 'online' && Boolean(ui.invites?.from?.(x.peer));
    out.push(
      h(
        'div',
        // 4.2 (Michael, Preview I): a friend's buttons go under the name when it does not fit beside them,
        // so a 16-character name never pushes the ✉️'s time out or shrinks the name to nothing.
        { class: 'slot fr', id: `tour-fr-${i}` },
        h('span', { class: 'who' }, `${look.dot} ${x.name}`, invited ? h('span', { class: 'sub inv' }, tr('inviteFromSub')) : h('span', { class: `sub st ${look.cls}` }, tr(look.key))),
        h('span', { class: 'acts' }, ...inviteButtons(ui, i, x), moreButton(ui, st, `tour-fr-more-btn-${i}`, x)),
      ),
    );
    const more = moreLine(ui, st, friends, i, x, { remove: true });
    if (more) out.push(more);
  });
  if (outgoing.length) {
    out.push(h('p', { class: 'sect' }, tr('friendsYouAsked')));
    outgoing.forEach((x, i) => {
      out.push(
        h(
          'div',
          { class: 'slot', id: `tour-fr-out-${i}` },
          h('span', { class: 'who' }, x.name, h('span', { class: 'sub' }, tr('friendSentWhen').replace('{when}', when(tr, daysAgo(ui, x.at))))),
          h('span', { class: 'acts' }, button(`tour-fr-undo-${i}`, tr('friendTakeBack'), 'outline small', () => run(ui, st, friends, () => friends.remove(x.peer), 'friendTookBack', x.name))),
        ),
      );
    });
  }
  if (opponents.length) {
    out.push(h('p', { class: 'sect' }, tr('friendsOpponents')));
    opponents.forEach((x, i) => {
      out.push(
        h(
          'div',
          { class: 'slot', id: `tour-fr-op-${i}` },
          h('span', { class: 'who' }, x.name, h('span', { class: 'sub' }, tr('friendRacedWhen').replace('{when}', when(tr, x.days)))),
          h('span', { class: 'acts' }, moreButton(ui, st, `tour-fr-op-more-${i}`, x)), // Add friend lives in the ⋯ (Michael, 22 Nov)
        ),
      );
      const more = moreLine(ui, st, friends, `op-${i}`, x, { add: true }); // Michael, 22 Nov: Add friend in the ⋯ too
      if (more) out.push(more);
    });
  }
  if (blocked.length) {
    out.push(
      button('tour-fr-blocked', `${tr('friendsBlocked').replace('{n}', String(blocked.length))} ${st.blockedOpen ? '▴' : '▾'}`, 'outline wide', () => {
        st.blockedOpen = !st.blockedOpen;
        ui.rerender();
      }),
    );
    if (st.blockedOpen) {
      blocked.forEach((x, i) => {
        out.push(h('div', { class: 'slot', id: `tour-fr-bl-${i}` }, h('span', { class: 'who' }, x.name), h('span', { class: 'acts' }, button(`tour-fr-unblock-${i}`, tr('friendUnblock'), 'outline small', () => run(ui, st, friends, () => friends.unblock(x.peer), 'friendUnblocked', x.name)))));
      });
    }
  }
  out.push(h('p', { class: 'note' }, tr('friendsNote')));
  out.push(h('div', { class: 'actions' }, home));
  return out;
}
