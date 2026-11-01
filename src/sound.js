// Tiny WebAudio synth: no audio files, nothing to license. The AudioContext is
// created on the first call, which must come from a user gesture (iOS rule), so
// call unlock() from the first tap handler.

let ctx = null;

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
}

function blip({ freq = 440, to = freq, type = 'square', duration = 0.08, gain = 0.08 }) {
  if (!ctx) return;
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
}

export const sfx = {
  flap: () => blip({ freq: 520, to: 780, type: 'square', duration: 0.07 }),
  score: () => blip({ freq: 880, to: 1320, type: 'triangle', duration: 0.12, gain: 0.1 }),
  die: () => blip({ freq: 300, to: 60, type: 'sawtooth', duration: 0.35, gain: 0.12 }),
};
