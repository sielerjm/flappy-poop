// The tournament lobby's first rows (plan 39, 1.6e; Michael's ask with Preview A, item 36, accepted in
// Preview C): a player with a username opens the lobby on row 1 as themselves, as if Use my player
// was tapped (an id made for a save that has none, as that button does), with a guest on row 2; with
// no username, two guests as before. Over a running Versus (the local lobby). The panel keeps its
// roster between opens in one page load (by design: the players stay for the next race), so each case
// opens a fresh copy of the module on a fresh fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGame, installPanelDom, textOf } from './support/panelDom.js';
import { t } from '../src/i18n.js';

let body = null;
let closeTournamentPanel = () => {};
let fresh = 0;
const el = (id) => body.find(id);

async function open(save) {
  body = installPanelDom();
  const panel = await import(`../src/ui/tournamentPanel.js?case=${(fresh += 1)}`);
  closeTournamentPanel = panel.closeTournamentPanel;
  const stored = [];
  const play = { getSaveState: () => save, setSaveState: (s) => (stored.push(s), (save = s)) };
  const game = fakeGame({ versus: { leave() {} }, active: true });
  panel.openTournamentPanel({ game, locale: 'en', play, timers: { setInterval: () => 1, clearInterval() {} } });
  return { stored, row: (i) => textOf(el(`tour-slot-${i}`)) };
}

test('a player with a username starts as row 1, tagged (you); row 2 is a guest; Use my player is taken', async () => {
  const k = await open({ name: 'PlopMaster', id: 'p-123' });
  assert.ok(k.row(0).startsWith('PlopMaster') && k.row(0).includes(t('en', 'tournamentHostTag')), k.row(0));
  assert.ok(k.row(1).includes(t('en', 'tournamentGuestTag')), k.row(1));
  assert.deepEqual(k.stored, [], 'an id already there: the save is left alone');
  // Clearing row 1 brings back the empty row, and its Use my player.
  el('tour-clear-0').click();
  assert.equal(el('tour-me-0')?.disabled, false);
  closeTournamentPanel();
});

test('a username with no id yet: the id is made and stored, as Use my player does', async () => {
  const k = await open({ name: 'PlopMaster' });
  assert.ok(k.row(0).startsWith('PlopMaster'));
  assert.equal(k.stored.length, 1);
  assert.match(String(k.stored[0].id ?? ''), /.{8,}/);
  closeTournamentPanel();
});

test('no username: two guests, as before', async () => {
  for (const save of [{ name: '' }, {}, null]) {
    const k = await open(save);
    assert.ok(k.row(0).includes(t('en', 'tournamentGuestTag')) && k.row(1).includes(t('en', 'tournamentGuestTag')), JSON.stringify(save));
    closeTournamentPanel();
  }
});
