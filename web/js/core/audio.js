/* Sound effects synthesized with WebAudio: the fantasy pack or the classic 8-bit one. */
'use strict';

let audioCtx = null, master = null, shimmer = null; // shared with the music, sanctuary and metronome modules

// [frequency Hz, duration s] notes played one after another
const SFX_8BIT = {
  place: [[440, .05], [660, .07]],
  coin: [[988, .06], [1319, .14]],
  remove: [[330, .06], [220, .09]],
  error: [[180, .1], [140, .14]],
  select: [[660, .04]],
  page: [[520, .03], [780, .05]],
  levelup: [[523, .09], [659, .09], [784, .09], [1047, .09], [784, .07], [1047, .28]],
  achieve: [[784, .07], [988, .07], [1175, .07], [1568, .22]],
};

/** Creates the audio graph the first time and applies the current volume. */
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.connect(audioCtx.destination);
    // Soft echo (a castle hall / magic feeling)
    const delay = audioCtx.createDelay(), feedback = audioCtx.createGain(), lowpass = audioCtx.createBiquadFilter();
    delay.delayTime.value = 0.19; feedback.gain.value = 0.32; lowpass.type = 'lowpass'; lowpass.frequency.value = 2600;
    delay.connect(lowpass).connect(feedback).connect(delay);
    lowpass.connect(master);
    shimmer = audioCtx.createGain(); shimmer.gain.value = 0.45;
    shimmer.connect(delay);
  }
  master.gain.value = (state.settings.volume / 100) * 0.7;
  return audioCtx;
}

/** One note with an envelope (short attack, exponential decay). */
function tone(frequency, startAt, duration, type = 'sine', volume = 0.3, echo = true) {
  const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain();
  oscillator.type = type; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain); gain.connect(master);
  if (echo) gain.connect(shimmer);
  oscillator.start(startAt); oscillator.stop(startAt + duration + 0.05);
}

/** Filtered noise (pages, whispers), optionally sweeping to another frequency. */
function noise(startAt, duration, frequency, volume = 0.25, sweepTo) {
  const length = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
  source.buffer = buffer; filter.type = 'bandpass'; filter.Q.value = 0.9; filter.frequency.setValueAtTime(frequency, startAt);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, startAt + duration);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter).connect(gain).connect(master);
  source.start(startAt); source.stop(startAt + duration);
}

const SFX_FANTASY = {
  place: at => { tone(196, at, 0.16, 'triangle', 0.35, false); tone(392, at, 0.1, 'sine', 0.12); noise(at, 0.05, 3000, 0.08); },
  coin: at => { tone(1318.5, at, 0.6, 'sine', 0.22); tone(1975.5, at, 0.45, 'sine', 0.1); tone(1760, at + 0.07, 0.7, 'sine', 0.2); tone(2637, at + 0.07, 0.4, 'sine', 0.07); },
  remove: at => { noise(at, 0.28, 1400, 0.22, 260); tone(330, at, 0.18, 'triangle', 0.12, false); },
  error: at => { tone(110, at, 0.28, 'triangle', 0.35, false); tone(116.5, at, 0.28, 'triangle', 0.3, false); },
  select: at => { tone(880, at, 0.18, 'triangle', 0.16); tone(1320, at + 0.03, 0.14, 'sine', 0.07); },
  page: at => { noise(at, 0.16, 2400, 0.18, 900); noise(at + 0.07, 0.12, 3200, 0.1, 1500); },
  levelup: at => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => tone(f, at + i * 0.085, 0.75, 'triangle', 0.18));
    [2093, 2637, 3136].forEach((f, i) => tone(f, at + 0.55 + i * 0.06, 0.5, 'sine', 0.06));
  },
  achieve: at => {
    [[392, 0], [523.25, 0.11], [659.25, 0.22], [783.99, 0.33]].forEach(([f, offset], i) => {
      tone(f, at + offset, i === 3 ? 0.9 : 0.25, 'sawtooth', 0.06);
      tone(f * 2, at + offset, i === 3 ? 0.9 : 0.25, 'triangle', 0.1);
    });
  },
};

/** Plays a sound effect by name (place, coin, remove, error, select, page, levelup, achieve). */
function sfx(type) {
  if (!state || !state.settings.sound || !state.settings.volume) return;
  try {
    ensureAudio();
    const startAt = audioCtx.currentTime + 0.01;
    if (state.settings.soundStyle === '8bit') {
      let at = startAt;
      for (const [frequency, duration] of SFX_8BIT[type] || []) { tone(frequency, at, duration, 'square', 0.12, false); at += duration; }
    } else if (SFX_FANTASY[type]) {
      SFX_FANTASY[type](startAt);
    }
  } catch (e) { /* no audio available */ }
}
