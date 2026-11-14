// FSRS-6, the memory model behind education mode's review schedule (plan 26), NO Phaser/DOM/imports.
//
// FSRS (the Free Spaced Repetition Scheduler) is by Jarrett Ye, Jingyi Su and Yilong Cao: "A
// Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling", KDD 2022,
// doi:10.1145/3534678.3539081, and the open-spaced-repetition project's algorithm notes. Anki
// schedules with it too. This file is a port of the formulas in py-fsrs (scheduler.py), whose
// default weights and test results it uses; no Anki code is used. py-fsrs's licence:
//
//   MIT License
//
//   Copyright (c) 2022 Open Spaced Repetition
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// A card's memory is two numbers. Stability S (days): how long until the chance of recalling it
// falls to 90 %. Difficulty D (1 to 10): how hard it is to raise S. Retrievability R (0 to 1) is
// that chance after t days. A grade is 1 again, 2 hard, 3 good or 4 easy. `w` is the 21 weights
// (FSRS_W, the official defaults, unless TUNING.education.fsrs gives others).

/** FSRS-6's default weights w0 to w20 (py-fsrs DEFAULT_PARAMETERS). */
export const FSRS_W = Object.freeze([0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]);

/** The grade names as FSRS numbers them. */
export const GRADE_NUM = Object.freeze({ again: 1, hard: 2, good: 3, easy: 4 });

const S_MIN = 0.001;
const clampS = (s) => Math.max(s, S_MIN);
const clampD = (d) => Math.min(Math.max(d, 1), 10);
const decay = (w) => -w[20];
const factor = (w) => 0.9 ** (1 / decay(w)) - 1;

/** R after `days` whole days at stability `s`: (1 + FACTOR · t / S) ^ DECAY. */
export function retrievability(days, s, w = FSRS_W) {
  return (1 + (factor(w) * Math.max(0, days)) / s) ** decay(w);
}

/** A new card's stability after its first grade `g` (1 to 4): w[g − 1]. */
export function initStability(g, w = FSRS_W) {
  return clampS(w[g - 1]);
}

/** A new card's difficulty after its first grade: w4 − e^(w5 (g − 1)) + 1, clamped to [1, 10] unless `clamp` is false. */
export function initDifficulty(g, w = FSRS_W, clamp = true) {
  const d = w[4] - Math.exp(w[5] * (g - 1)) + 1;
  return clamp ? clampD(d) : d;
}

/** Difficulty after grade `g`: a step of −w6 (g − 3), damped as D nears 10, pulled by w7 toward a first Easy's difficulty. */
export function nextDifficulty(d, g, w = FSRS_W) {
  const delta = -w[6] * (g - 3);
  const damped = d + ((10 - d) * delta) / 9;
  return clampD(w[7] * initDifficulty(4, w, false) + (1 - w[7]) * damped);
}

/** Stability after a second answer on the same day (less than a whole day since the last review). Never lower after a right answer. */
export function shortTermStability(s, g, w = FSRS_W) {
  let inc = Math.exp(w[17] * (g - 3 + w[18])) * s ** -w[19];
  if (g >= 2) inc = Math.max(inc, 1);
  return clampS(s * inc);
}

/** Stability after an answer a day or more later, at retrievability `r`: the recall update for a right answer, the lapse update for a wrong one. */
export function nextStability(d, s, r, g, w = FSRS_W) {
  if (g === 1) {
    const longTerm = w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp((1 - r) * w[14]);
    const shortTerm = s / Math.exp(w[17] * w[18]);
    return clampS(Math.min(longTerm, shortTerm));
  }
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return clampS(s * (1 + Math.exp(w[8]) * (11 - d) * s ** -w[9] * (Math.exp((1 - r) * w[10]) - 1) * hard * easy));
}

/** The wait, in whole days (at least 1, at most `maxDays`), until R falls to `retention` (0.9 gives S itself, rounded). */
export function nextIntervalDays(s, { w = FSRS_W, retention = 0.9, maxDays = 36500 } = {}) {
  const days = Math.round((s / factor(w)) * (retention ** (1 / decay(w)) - 1));
  return Math.min(Math.max(days, 1), maxDays);
}
