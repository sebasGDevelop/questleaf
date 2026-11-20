/* Music: short calm pieces composed on the spot, or your own tracks from the music folder. */
'use strict';

const MUSIC = { playing: false, timer: 0, out: null, reverb: null, endAt: 0, tracks: [], base: '', el: null, fade: 0, last: '' };

function musicReverb(ctx) {
  if (MUSIC.reverb) return MUSIC.reverb;
  const length = ctx.sampleRate * 3.2, buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  const convolver = ctx.createConvolver(); convolver.buffer = buffer;
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  convolver.connect(wet).connect(master);
  MUSIC.reverb = convolver;
  return convolver;
}
function musicNote(ctx, out, frequency, at, duration, volume, type = 'sine', attack = 0.01) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type; osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(out);
  osc.start(at); osc.stop(at + duration + 0.1);
}
const showNowPlaying = () => {
  const button = $('#soundBtn');
  button.classList.add('music-on');
  button.title = t('music.nowPlaying', { name: MUSIC.name });
};
function playSong(onlyApp) {
  clearTimeout(MUSIC.timer);
  const s = state.settings;
  if (s.music === 'off' || !s.sound || !s.volume || MUSIC.playing) { scheduleMusic(); return; }
  if (document.hidden) { MUSIC.timer = setTimeout(playSong, 60000); return; }
  const mine = MUSIC.tracks.filter(file => file !== MUSIC.last || MUSIC.tracks.length === 1);
  if (onlyApp !== true && mine.length && (s.musicSource === 'mine' || (s.musicSource === 'mix' && Math.random() < 0.5))) {
    playTrack(mine[Math.floor(Math.random() * mine.length)]);
    return;
  }
  let ctx;
  try { ctx = ensureAudio(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { return; }
  const out = ctx.createGain(), lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 3200;
  out.connect(lowpass); lowpass.connect(master); lowpass.connect(musicReverb(ctx));
  const volume = (s.musicVol / 100) * 0.55;
  const start = ctx.currentTime + 0.3;
  // Random key, tempo and progression (always soft)
  const hour = new Date().getHours(), night = hour >= 19 || hour < 6;
  const root = [261.63, 293.66, 349.23, 392.0, 220.0][Math.floor(Math.random() * 5)] * (night ? 0.75 : 1);
  const major = [0, 2, 4, 5, 7, 9, 11], penta = [0, 2, 4, 7, 9];
  const hz = semitones => root * Math.pow(2, semitones / 12);
  const PROGRESSIONS = [[0, 4, 5, 3], [0, 2, 3, 0], [5, 3, 0, 4], [0, 3, 1, 4], [3, 0, 4, 5]];
  const progression = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
  const beat = 60 / rand(58, 70), bar = beat * 4;
  const rounds = 3 + Math.floor(Math.random() * 2); // 3–4 rounds ≈ 1.5–2.5 min
  let at = start;
  for (let r = 0; r < rounds; r++) {
    for (const degree of progression) {
      const chord = [0, 2, 4].map(k => major[(degree + k) % 7] + 12 * Math.floor((degree + k) / 7));
      chord.forEach(n => musicNote(ctx, out, hz(n - 12), at, bar * 1.15, 0.05, 'triangle', 0.9)); // soft pad
      musicNote(ctx, out, hz(major[degree] - 24), at, bar, 0.07, 'sine', 0.05); // bass
      // Music-box melody: pentatonic notes with rests
      for (let b = 0; b < 8; b++) {
        if (Math.random() < (r === 0 ? 0.35 : 0.55)) continue;
        const n = penta[Math.floor(Math.random() * penta.length)] + (Math.random() < 0.3 ? 24 : 12);
        musicNote(ctx, out, hz(n), at + b * beat / 2, beat * 2.2, 0.06 + Math.random() * 0.03, 'sine', 0.005);
        if (Math.random() < 0.25) musicNote(ctx, out, hz(n) * 2, at + b * beat / 2, beat, 0.012, 'sine', 0.005); // shine
      }
      at += bar;
    }
  }
  const end = at + bar;
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 3);
  out.gain.setValueAtTime(volume, end - 6);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  const songs = tRaw('music.songs');
  MUSIC.playing = true; MUSIC.out = out; MUSIC.name = songs[Math.floor(Math.random() * songs.length)];
  showNowPlaying();
  MUSIC.timer = setTimeout(() => { stopMusic(true); scheduleMusic(); }, (end - ctx.currentTime + 0.5) * 1000);
}
// One of the player's tracks: it plays whole from the music folder, with soft fade in and out
const musicTarget = () => Math.min(1, (state.settings.musicVol / 100) * (state.settings.volume / 100));
const trackName = file => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
function fadeAudio(audio, to, ms, then) {
  clearInterval(MUSIC.fade);
  const from = audio.volume, start = Date.now();
  MUSIC.fade = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(MUSIC.fade); if (then) then(); }
  }, 60);
}
async function playTrack(file) {
  if (MUSIC.playing) stopMusic();
  let url = MUSIC.base ? MUSIC.base + encodeURIComponent(file) : '';
  if (!url && desktopApi && desktopApi.music_data) url = await desktopApi.music_data(file).catch(() => '');
  if (!url) { scheduleMusic(); return; }
  const audio = new Audio(url);
  audio.volume = 0;
  MUSIC.playing = true; MUSIC.el = audio; MUSIC.last = file; MUSIC.name = trackName(file);
  showNowPlaying();
  const done = () => { if (MUSIC.el === audio) { stopMusic(true); scheduleMusic(); } };
  audio.onended = done;
  audio.onerror = done;
  try { await audio.play(); } catch (e) { done(); return; }
  fadeAudio(audio, musicTarget(), 3000);
}
function refreshTracks() {
  if (!desktopApi || !desktopApi.music_list) return Promise.resolve(MUSIC.tracks);
  return desktopApi.music_list().then(list => { MUSIC.tracks = list || []; return MUSIC.tracks; }).catch(() => MUSIC.tracks);
}

function stopMusic(natural) {
  if (MUSIC.el) {
    const audio = MUSIC.el;
    MUSIC.el = null;
    if (natural) audio.pause(); else fadeAudio(audio, 0, 1200, () => audio.pause());
  }
  if (MUSIC.out && !natural) {
    try { const gain = MUSIC.out.gain, now = audioCtx.currentTime; gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value || 0.0001, now); gain.exponentialRampToValueAtTime(0.0001, now + 1.2); } catch (e) { /* already stopped */ }
    const old = MUSIC.out; setTimeout(() => { try { old.disconnect(); } catch (e) { /* already disconnected */ } }, 1500);
  }
  MUSIC.out = null; MUSIC.playing = false;
  const button = $('#soundBtn');
  if (button) button.classList.remove('music-on');
}
// Saved values of settings.music: 'off', 'sometimes' (now and then), 'often'.
function scheduleMusic(first) {
  clearTimeout(MUSIC.timer);
  const mode = state.settings.music;
  if (mode === 'off') return;
  const waitMinutes = first ? rand(1.5, 4) : (mode === 'often' ? rand(4, 8) : rand(10, 20));
  MUSIC.timer = setTimeout(() => refreshTracks().then(() => playSong()), waitMinutes * 60000);
}

// The sound button shows when music plays; turning the sound off stops it
appOn('hudRender', () => {
  if (MUSIC.playing && (!state.settings.sound || state.settings.music === 'off')) stopMusic();
  const button = $('#soundBtn');
  if (button) button.classList.toggle('music-on', MUSIC.playing);
});

function musicBoot() {
  if (desktopApi && desktopApi.music_setup) {
    desktopApi.music_setup().then(r => { MUSIC.base = r.base || ''; MUSIC.tracks = r.files || []; }).catch(() => {});
  }
  scheduleMusic(true);
  // Any click wakes the audio up (WebView2 keeps it paused until there is interaction)
  document.addEventListener('pointerdown', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { passive: true });
}
