import './phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { FIELD } from './config.js';
import { fieldWidth, perfMode, inviteFromSearch, withoutInvite, debugHandleAllowed } from './logic.js';
import { attachPerfMeter } from './ui/perfMeter.js';
import { installErrorCard } from './ui/errorCard.js';
import { Boot } from './scenes/Boot.js';
import { Play } from './scenes/Play.js';
import { Over } from './scenes/Over.js';
import { Versus } from './scenes/Versus.js';
import { Settings } from './scenes/Settings.js';
import { About } from './scenes/About.js';
import { HowTo } from './scenes/HowTo.js';
import { Changelog } from './scenes/Changelog.js';
import { Language } from './scenes/Language.js';
import { Feedback } from './scenes/Feedback.js';
import { Leaderboard } from './scenes/Leaderboard.js';
import { Daily } from './scenes/Daily.js';
import { Stats } from './scenes/Stats.js';
import { Quiz } from './scenes/Quiz.js';

// ?perf shows the frame meter (src/ui/perfMeter.js); ?perf=var also lets Arcade step by each
// frame's delta instead of its fixed 60 Hz, to A/B the physics step on a phone. Debug only.
const perf = perfMode(globalThis.location?.search);

// ?invite=<code> (plan 28, 2.4): read once, taken out of the address bar at once (it would sit in the
// history and be shared with the link), and handed to Play through the registry (Play.openPendingInvite).
const invite = inviteFromSearch(globalThis.location?.search);
try {
  // Out of the address bar whenever the parameter is there, a code too long to use included.
  const clean = globalThis.location ? withoutInvite(globalThis.location.href) : null;
  if (clean && clean !== globalThis.location.href) globalThis.history?.replaceState?.(globalThis.history.state, '', clean);
} catch {
  /* no history API: the code stays in the address, and still works */
}

// Logical field: 1280 tall; as wide as the window's aspect asks, between a phone
// portrait (720) and 2:1 (FIELD). Scale.FIT then letterboxes only what is left.
// Phaser is a global: index.html's CDN tag, or its vendored fallback (src/phaserReady.js waits for it).
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD),
  height: FIELD.height,
  backgroundColor: '#1a0b14',
  pixelArt: false,
  roundPixels: true,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false, fixedStep: perf !== 'var' },
  },
  input: {
    activePointers: 2, // two: a versus match on a tablet takes one thumb per half
    gamepad: true, // Phaser Gamepad plugin; bound once, in Play (src/input/pad.js)
  },
  // Play twice: 'Play' is single player and the left half of a versus match, 'PlayB' the right half
  // (only Versus launches it). Versus owns the match and sits above both halves, below the overlays.
  scene: [Boot, Play, new Play('PlayB'), Over, Versus, Settings, About, HowTo, Changelog, Language, Feedback, Leaderboard, Daily, Stats, Quiz],
});

// A window resize (or a phone rotating) asks Play for a new field width. Play
// re-fits at once on the ready screen and otherwise at its next restart (Home),
// so a run is never re-laid-out mid-flight; FIT letterboxes until then.
let resizeTimer = null;
globalThis.addEventListener?.('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const want = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    if (want !== game.scale.width) game.scene.getScene('Play')?.onFieldResize?.(want);
  }, FIELD.resizeDebounceMs);
});

installErrorCard(game); // index.html's error trap shows the card from here on (plan 35, 1.1)
if (perf) attachPerfMeter(game, perf);
if (invite) game.registry.set('pendingInvite', invite);

// Debug / automation handle (headless drivers reach scenes through it), on this machine and the local
// network only, or when a driver opts in before the page loads (debugHandleAllowed). No gameplay effect.
if (debugHandleAllowed(globalThis.location?.hostname, globalThis.__flappyDebug === true)) globalThis.__flappy = game;
