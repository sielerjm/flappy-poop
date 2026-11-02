// WebAudio synth blips plus a mute gate that also drives Phaser's sound
// manager (the death fart MP3). unlock() must run from a user gesture: it
// creates the AudioContext, plays a silent buffer (iOS unlock), resume()s
// it, and unlocks Phaser's sound manager. Blips wait until the context is
// running — notes started while suspended never become audible on iOS.

let ctx = null;
let muted = false;
let game = null;

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
  hazard: () => {
    blip({ freq: 90, to: 50, type: 'square', duration: 0.08, gain: 0.12 });
    blip({ freq: 70, to: 40, type: 'square', duration: 0.1, gain: 0.1 });
  },
};
