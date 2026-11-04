// WebAudio synth blips plus a mute gate that also drives Phaser's sound
// manager (the fart and level-up MP3s). unlock() must run from a user gesture: it
// creates the AudioContext, plays a silent buffer (iOS unlock), resume()s
// it, unlocks Phaser's sound manager, and starts the silent-switch keeper
// (below). Blips wait until the context is running — notes started while
// suspended never become audible on iOS.
//
// iOS silent switch: WebAudio output follows the hardware ringer switch, so
// a phone on silent plays no game audio at all even once unlocked. Playing
// an HTML <audio> element switches the page's iOS audio session to "media
// playback", which the switch does not gate, and WebAudio rides along. The
// keeper is a looping, silent WAV data URI started on the first gesture
// (touchend/click/keydown fallback, since touchstart is not a user
// activation on every WebKit). Side effect: it pauses music or podcasts the
// player has running in another app, as any media playback does.

let ctx = null;
let muted = false;
let game = null;
let keeper = null; // HTMLAudioElement looping silence, or null
let keeperArmed = false;

function audioContextCtor() {
  const w = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return w?.AudioContext || w?.webkitAudioContext;
}

export function attachGame(g) {
  game = g ?? null;
  if (game?.sound) game.sound.mute = muted;
}

export function setMuted(bool) {
  muted = Boolean(bool);
  if (game?.sound) game.sound.mute = muted;
  // Muted players should not have their other apps' audio taken over.
  if (muted) {
    try {
      keeper?.pause?.();
    } catch {
      /* ignore */
    }
  } else if (keeper) {
    startKeeper();
  }
}

export function isMuted() {
  return muted;
}

function primeSilent(ac) {
  try {
    const buffer = ac.createBuffer(1, 1, ac.sampleRate || 22050);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.start(0);
  } catch {
    /* Node / restricted contexts */
  }
}

/** Base64 of a 0.25 s silent 16-bit mono 8 kHz PCM WAV. Node-safe. */
export function silentWavDataUri(seconds = 0.25, sampleRate = 8000) {
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = frames * 2;
  const buf = new Uint8Array(44 + dataBytes);
  const view = new DataView(buf.buffer);
  const ascii = (off, str) => {
    for (let i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  // sample data is already zero = silence
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

function keeperPlaying() {
  return Boolean(keeper && !keeper.paused && !keeper.ended);
}

/**
 * Start (or retry) the silent looping <audio> that keeps iOS in media
 * playback mode. Safe to call repeatedly; no-op where HTMLAudioElement is
 * missing (Node). Returns the play() promise when one was issued.
 */
export function startKeeper(AudioCtor = globalThis.Audio) {
  if (!keeper) {
    if (typeof AudioCtor !== 'function') return undefined;
    try {
      keeper = new AudioCtor();
      keeper.src = silentWavDataUri();
      keeper.loop = true;
      keeper.preload = 'auto';
      keeper.setAttribute?.('playsinline', '');
      keeper.setAttribute?.('aria-hidden', 'true');
    } catch {
      keeper = null;
      return undefined;
    }
  }
  if (keeperPlaying()) return undefined;
  try {
    const p = keeper.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return p;
  } catch {
    return undefined;
  }
}

// touchstart (Phaser's pointerdown on iOS) does not always count as a user
// activation for media playback, so arm one-shot listeners on the gesture
// end events too. They remove themselves once the keeper is playing.
function armKeeperFallback() {
  if (keeperArmed || typeof document === 'undefined' || typeof globalThis.Audio !== 'function') return;
  keeperArmed = true;
  const events = ['touchend', 'pointerup', 'click', 'keydown'];
  const handler = () => {
    if (!muted) startKeeper();
    if (keeperPlaying()) {
      for (const ev of events) document.removeEventListener(ev, handler, true);
    }
  };
  for (const ev of events) document.addEventListener(ev, handler, true);
}

// Backgrounding Safari pauses the keeper; restart it when the page returns
// (allowed without a gesture once media has played on this page).
function armKeeperVisibility() {
  if (typeof document === 'undefined' || armKeeperVisibility.done) return;
  armKeeperVisibility.done = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && keeper && !muted) startKeeper();
  });
}

export function unlock() {
  if (!ctx) {
    const AC = audioContextCtor();
    if (AC) ctx = new AC();
  }
  if (ctx) {
    primeSilent(ctx);
    if (ctx.state !== 'running') ctx.resume();
  }
  game?.sound?.unlock?.();
  game?.sound?.context?.resume?.();
  if (!muted) {
    startKeeper();
    armKeeperFallback();
  }
  armKeeperVisibility();
}

/** Test hook: forget the keeper element so a fresh Audio ctor can be injected. */
export function _resetKeeperForTests() {
  try {
    keeper?.pause?.();
  } catch {
    /* ignore */
  }
  keeper = null;
  keeperArmed = false;
  armKeeperVisibility.done = false;
}

function whenRunning(play) {
  if (muted || !ctx) return;
  if (ctx.state === 'running') {
    play();
    return;
  }
  const p = ctx.resume?.();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      if (!muted && ctx?.state === 'running') play();
    }).catch(() => {});
  }
}

function blip({ freq = 440, to = freq, type = 'square', duration = 0.08, gain = 0.08 }) {
  whenRunning(() => {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + duration);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  });
}

function noiseSquelch({ duration = 0.14, gain = 0.1 }) {
  whenRunning(() => {
    const t0 = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t0);
    filter.frequency.exponentialRampToValueAtTime(90, t0 + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  });
}

export const sfx = {
  flap: () => blip({ freq: 520, to: 780, type: 'square', duration: 0.07 }),
  score: () => blip({ freq: 880, to: 1320, type: 'triangle', duration: 0.12, gain: 0.1 }),
  die: () => blip({ freq: 300, to: 60, type: 'sawtooth', duration: 0.35, gain: 0.12 }),
  pickup: () => blip({ freq: 660, to: 1320, type: 'triangle', duration: 0.1, gain: 0.1 }),
  shield: () => noiseSquelch({ duration: 0.14, gain: 0.1 }),
  levelUp: () => {
    blip({ freq: 660, to: 990, type: 'triangle', duration: 0.16, gain: 0.1 });
    blip({ freq: 990, to: 1480, type: 'triangle', duration: 0.22, gain: 0.08 });
  },
  hazard: () => {
    blip({ freq: 90, to: 50, type: 'square', duration: 0.08, gain: 0.12 });
    blip({ freq: 70, to: 40, type: 'square', duration: 0.1, gain: 0.1 });
  },
};
