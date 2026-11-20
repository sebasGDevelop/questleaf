/* Look of the book: leather, accent, background, mood palette and cursor, and the idle mode. */
'use strict';

// [saved key, color]
const LEATHERS = [['brown', '#7a5c45'], ['wine', '#7b3438'], ['forest', '#3f6146'], ['night', '#34406e'], ['ebony', '#3b332e']];
const ACCENTS = [['terracotta', '#b8673a'], ['gold', '#b3871f'], ['emerald', '#2f8a63'], ['sapphire', '#3a64b0'], ['amethyst', '#8a4fb0']];
const MOOD_PALETTES = {
  pastel: ['#f7a8a8', '#d9b3e6', '#a9cbe8', '#a8d8a0', '#f6d38a'],
  vivid: ['#ef5b5b', '#b072e0', '#4f9be8', '#55c26a', '#ffc532'],
  earth: ['#c46a4f', '#9a7aa8', '#7f9cb0', '#8aa86a', '#d9a74a'],
};
function applyLook() {
  const s = state.settings, root = document.documentElement;
  root.dataset.leather = s.leather;
  root.dataset.accent = s.accent;
  root.dataset.bg = s.bg === 'image' && !s.bgImage ? 'leaves' : s.bg;
  document.body.style.setProperty('--user-bg', s.bgImage ? `url("${s.bgImage}")` : 'none');
  root.classList.toggle('cursor-on', !!s.cursor);
  (MOOD_PALETTES[s.moodPalette] || MOOD_PALETTES.pastel).forEach((color, i) => { MOODS[i + 1].color = color; });
  updateSky();
}

// Background image: scaled down to 1920 px and stored as JPEG
function downscaleImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1920 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function pickBackgroundFile() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  return new Promise(resolve => {
    input.onchange = () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => downscaleImage(reader.result).then(resolve);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
/** The desktop app uses the native file picker; the browser, an <input type=file>. */
async function pickBackgroundAny() {
  if (desktopApi && desktopApi.pick_image) {
    const raw = await desktopApi.pick_image();
    return raw ? downscaleImage(raw) : null;
  }
  return pickBackgroundFile();
}

// ---------------------------------------------------------
// Idle mode: without focus the particles stop
// ---------------------------------------------------------
function setIdle(idle) {
  if (FX.idle === idle) return;
  FX.idle = idle;
  document.documentElement.classList.toggle('idle', idle);
  if (idle) fxStop(); else fxStart();
  appEmit('idle', idle); // the sanctuary pauses its rain
}
function lookBoot() {
  window.addEventListener('blur', () => setIdle(true));
  window.addEventListener('focus', () => setIdle(false));
  document.addEventListener('visibilitychange', () => setIdle(document.hidden || !document.hasFocus()));
  applyLook();
}
