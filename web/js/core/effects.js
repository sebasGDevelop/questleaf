/* Visual effects: toasts, floating XP, confetti, the level-up celebration and the background particles. */
'use strict';

// Emoji passed as a toast icon → its pixel icon
const TOAST_ICON = {
  '🗑️': 'ui-delete', '🗑': 'ui-delete', '⏳': 'sec-schedule', '↩️': 'ui-alert', '🏆': 'achievement-clear', '🗺️': 'sec-schedule',
  '📋': 'sec-lists', '📏': 'sec-schedule', '📷': 'ui-edit', '⚙️': 'ui-settings', '🎮': 'ui-info', '💾': 'ui-info',
  '📂': 'ui-info', '🔊': 'ui-sound', '🔇': 'ui-sound', '🔔': 'ui-info', '🖼': 'ui-day', '🏁': 'achievement-clear',
  '🔥': 'hud-streak', '📝': 'sec-lists', '🎓': 'sec-university', '🌱': 'sec-habits', '🛡': 'ui-shield', '🧘': 'cat-meditation',
};

/**
 * Short notice in the corner. type: info | warn | xp | achieve.
 * opts: { icon, html (text is trusted HTML), duration, action: { label, fn } }
 */
function toast(text, type = 'info', opts = {}) {
  const defaultIcons = { info: UI_ICON.info, warn: UI_ICON.warn, xp: ico('hud-xp', '⭐'), achieve: ico('achievement-clear', '🏅') };
  const mappedIcon = opts.icon && TOAST_ICON[opts.icon];
  const box = el('div', `toast toast-${type}`);
  box.innerHTML = `<span class="t-icon">${mappedIcon ? ico(mappedIcon, opts.icon) : opts.icon || defaultIcons[type] || UI_ICON.info}</span>`
    + `<div class="t-text">${opts.html ? text : esc(text)}</div>`;
  if (opts.action) {
    const button = el('button', 'btn btn-small', esc(opts.action.label));
    button.onclick = () => { opts.action.fn(); box.remove(); };
    box.append(button);
  }
  $('#toasts').append(box);
  const duration = opts.duration || 2800;
  setTimeout(() => box.classList.add('out'), duration);
  setTimeout(() => box.remove(), duration + 400);
}

function floatText(text, rect, negative) {
  const node = el('div', 'float-xp' + (negative ? ' neg' : ''), esc(text));
  node.style.left = `${rect.left + rect.width / 2}px`;
  node.style.top = `${rect.top - 6}px`;
  document.body.append(node);
  setTimeout(() => node.remove(), 1200);
}
/** +XP / -XP floating over an element (or as a toast when there is no element). */
function xpFx(amount, sourceEl, label) {
  appEmit('xp', { amount, sourceEl }); // the sky sparkles, the spirit beast jumps
  const text = `${amount >= 0 ? '+' : ''}${amount} XP`;
  if (sourceEl && sourceEl.isConnected) floatText(text, sourceEl.getBoundingClientRect(), amount < 0);
  else toast(label ? `${text} · ${label}` : text, amount >= 0 ? 'xp' : 'warn', { icon: amount >= 0 ? undefined : '↩️' });
}
/** Runs fn and shows how much the total XP changed (for actions whose XP depends on effort). */
function xpChange(fn, sourceEl, label) {
  const before = totalXP();
  fn();
  const delta = totalXP() - before;
  if (delta) xpFx(delta, sourceEl, label);
}

function confetti(count = 46) {
  if (!state.settings.anim) return;
  for (let i = 0; i < count; i++) {
    const piece = el('div', 'confetti');
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = PASTELS[i % PASTELS.length];
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.animationDuration = `${1.3 + Math.random()}s`;
    document.body.append(piece);
    setTimeout(() => piece.remove(), 3000);
  }
}

/** Level-up celebration; reaching a new realm (breakthrough) adds a light pillar and a shake. */
function levelUpFx(level) {
  sfx('levelup');
  confetti();
  const realm = realmInfo(level), previous = realmInfo(level - 1);
  const breakthrough = realm.index !== previous.index;
  const overlay = el('div', `levelup${breakthrough ? ' breakthrough' : ''}`, `
    ${state.settings.anim && breakthrough ? '<div class="lu-beam"></div><div class="lu-flash"></div>' : ''}
    ${state.settings.anim ? '<div class="magic-circle"></div><div class="magic-circle inner"></div>' : ''}
    <div class="levelup-box">
      <div class="lu-avatar">${photoHTML()}</div>
      <div class="lu-title">${t(breakthrough ? 'levelUp.breakthrough' : 'levelUp.title')}</div>
      <div class="lu-level">${t('levelUp.level', { level })}</div>
      <div class="lu-sub">${breakthrough
        ? tHtml('levelUp.newRealmHtml', { realm: realm.name })
        : tHtml('levelUp.stageHtml', { realm: realm.name, stage: realm.stage })}</div>
    </div>`);
  document.body.append(overlay);
  if (breakthrough) {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 600);
    try { ensureAudio(); noise(audioCtx.currentTime + 0.02, 1.4, 180, 0.35, 60); } catch (e) { /* no audio available */ }
  }
  setTimeout(() => overlay.classList.add('out'), breakthrough ? 4200 : 2000);
  setTimeout(() => overlay.remove(), breakthrough ? 4700 : 2500);
}

// ---------------------------------------------------------
// Background particles. Performance: 24 frames per second, a 1x canvas (they are pixel motes)
// and a pre-drawn glow. Paused while the window is hidden or not focused (FX.idle).
// ---------------------------------------------------------
const FX = { parts: [], raf: 0, next: 0, last: 0, star: null, nextStar: 0, glow: null, idle: false };
const FX_FRAME = 1000 / 24;

function fxResize() {
  const canvas = $('#fxCanvas');
  canvas.width = innerWidth; canvas.height = innerHeight;
}
function fxGlow() {
  if (FX.glow) return FX.glow;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
  gradient.addColorStop(0, 'rgba(255,248,200,1)'); gradient.addColorStop(0.25, 'rgba(255,243,160,.85)'); gradient.addColorStop(1, 'rgba(255,243,160,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 24, 24);
  return (FX.glow = canvas);
}
function fxSchedule() {
  clearTimeout(FX.next);
  FX.next = setTimeout(() => { FX.raf = requestAnimationFrame(fxLoop); }, FX_FRAME);
}
function fxStop() { cancelAnimationFrame(FX.raf); clearTimeout(FX.next); FX.raf = 0; FX.next = 0; }
function fxStart() {
  fxStop();
  if (!document.documentElement.classList.contains('anim-on') || FX.idle || document.hidden) return;
  FX.last = 0; FX.raf = requestAnimationFrame(fxLoop);
}
const pickOf = list => list[Math.floor(Math.random() * list.length)];

/** A new particle for the current theme and season. */
function fxSpawn(night) {
  const season = state.settings.seasons ? seasonOf() : 'none';
  const kind = season === 'winter' ? 'snow' : night ? 'fly' : season === 'autumn' ? 'leaf' : season === 'spring' ? 'petal' : 'mote';
  const p = { x: Math.random() * innerWidth, y: Math.random() * innerHeight, ph: Math.random() * 6.28, kind };
  if (kind === 'fly') {
    p.vx = (Math.random() - 0.5) * 12; p.vy = (Math.random() - 0.5) * 12; p.r = 1.6 + Math.random() * 1.6;
  } else if (kind === 'mote') {
    p.vx = 4 + Math.random() * 8; p.vy = -(3 + Math.random() * 7); p.r = 2 + Math.random() * 2.5; p.c = pickOf(PASTELS);
  } else {
    p.vx = (Math.random() - 0.5) * 10; p.vy = kind === 'snow' ? 14 + Math.random() * 16 : 16 + Math.random() * 14;
    p.r = kind === 'snow' ? 2 + Math.random() * 2.5 : 3 + Math.random() * 2.5;
    p.c = kind === 'snow' ? '#ffffff' : kind === 'leaf' ? pickOf(['#d9822b', '#c0582f', '#e0a93a', '#9c5a2b']) : pickOf(['#f7c6d9', '#fde4ec', '#f2a7c3']);
  }
  return p;
}

function fxLoop(now) {
  if (document.hidden || FX.idle) { FX.raf = 0; return; }
  fxSchedule();
  const dt = Math.min(0.05, (now - (FX.last || now)) / 1000); FX.last = now;
  const canvas = $('#fxCanvas'), ctx = canvas.getContext('2d'), W = innerWidth, H = innerHeight;
  const night = document.documentElement.dataset.theme === 'night';
  const sceneKey = `${night}|${state.settings.seasons ? seasonOf() : ''}`;
  if (FX.night !== sceneKey) { FX.night = sceneKey; FX.parts = Array.from({ length: night ? 34 : 30 }, () => fxSpawn(night)); }
  ctx.clearRect(0, 0, W, H);
  const seconds = now / 1000;
  // The window candle flickers in this same loop (no separate CSS animation)
  const candle = FX.candle || (FX.candle = document.querySelector('.sky-candle'));
  if (candle) candle.style.setProperty('--flame', (0.55 + 0.25 * Math.sin(seconds * 2.6) + 0.12 * Math.sin(seconds * 7.3)).toFixed(2));
  skyWeatherFrame(seconds);
  for (const p of FX.parts) {
    if (p.fall || p.kind === 'snow' || p.kind === 'leaf' || p.kind === 'petal') { // falling, swaying
      p.x += (p.vx + Math.sin(seconds * 1.4 + p.ph) * 14) * dt; p.y += p.vy * dt;
      if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
      if (p.y < -30) { p.y = H + 20; p.x = Math.random() * W; }
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      ctx.shadowBlur = 0; ctx.globalAlpha = p.kind === 'snow' ? 0.85 : 0.7; ctx.fillStyle = p.c;
      const width = p.kind === 'leaf' ? p.r * (1 + 0.5 * Math.abs(Math.sin(seconds * 2 + p.ph))) : p.r;
      if (p.shape) fxShape(ctx, p, seconds); else ctx.fillRect(Math.round(p.x), Math.round(p.y), width, p.r);
      continue;
    }
    if (p.kind === 'fly') { // firefly: wanders and flickers
      p.vx += (Math.random() - 0.5) * 18 * dt; p.vy += (Math.random() - 0.5) * 18 * dt;
      p.vx = clampNumber(p.vx, -16, 16); p.vy = clampNumber(p.vy, -16, 16);
    }
    p.x += p.vx * dt; p.y += p.vy * dt + (p.kind === 'fly' ? 0 : Math.sin(seconds + p.ph) * 6 * dt);
    if (p.x < -20) p.x = W + 20;
    if (p.x > W + 20) p.x = -20;
    if (p.y < -20) p.y = H + 20;
    if (p.y > H + 20) p.y = -20;
    const alpha = 0.25 + 0.75 * (Math.sin(seconds * (night ? 2.2 : 1) + p.ph) + 1) / 2;
    if (p.kind === 'fly') {
      ctx.globalAlpha = alpha;
      const glowSize = p.r * 7;
      ctx.drawImage(fxGlow(), p.x - glowSize / 2, p.y - glowSize / 2, glowSize, glowSize);
    } else {
      ctx.globalAlpha = 0.35 * alpha + 0.15; ctx.shadowBlur = 0; ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.r, p.r); // pixel motes
    }
  }
  // An occasional shooting star at night
  if (night && now > FX.nextStar && !FX.star) {
    FX.star = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.3, life: 0 };
    FX.nextStar = now + 9000 + Math.random() * 12000;
  }
  if (FX.star) {
    const star = FX.star; star.life += dt;
    const length = 90, px = star.x + star.life * 700, py = star.y + star.life * 260;
    ctx.globalAlpha = Math.max(0, 1 - star.life / 0.8);
    const gradient = ctx.createLinearGradient(px, py, px - length, py - length * 0.37);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - length, py - length * 0.37); ctx.stroke();
    if (star.life > 0.8) FX.star = null;
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

/** Turns animations on or off (also respects "reduce motion" from the operating system). */
function applyAnim() {
  const on = !!state.settings.anim && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('anim-on', on);
  fxStop();
  const canvas = $('#fxCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  if (on) { fxResize(); FX.night = null; fxStart(); }
}
