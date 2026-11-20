/* The sky window (time of day and seasons), sparkles, rolling numbers and the streak flame. */
'use strict';

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, k) => a + (b - a) * k;
function mixHex(color1, color2, k) {
  const channels = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = channels(color1), b = channels(color2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], k)).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------
// Living window: the sky goes through dawn, day, dusk and night
// ---------------------------------------------------------
// [hour, top color, bottom color]
const SKY_KEYS = [
  [0, '#0d1033', '#1f2456'], [5, '#0d1033', '#1f2456'], [6, '#4a4e8f', '#f2a98c'], [7.5, '#8cc3ea', '#fde3b8'],
  [12, '#7ab8ea', '#cfe8f7'], [16.5, '#86bde6', '#f6dcae'], [18, '#5b5aa0', '#f39a6b'], [19.5, '#1a1c4a', '#4a3a6e'], [24, '#0d1033', '#1f2456'],
];
function skyAt(hour) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1][0]) i++;
  const [h0, top0, bottom0] = SKY_KEYS[i], [h1, top1, bottom1] = SKY_KEYS[i + 1];
  const k = (hour - h0) / (h1 - h0 || 1);
  return [mixHex(top0, top1, k), mixHex(bottom0, bottom1, k)];
}
// Used by the CSS (data-phase / data-season) and as dictionary keys (sky.phases.*, sky.seasons.*)
function phaseOf(hour) {
  if (hour >= 5 && hour < 7.5) return 'dawn';
  if (hour >= 7.5 && hour < 16.5) return 'day';
  if (hour >= 16.5 && hour < 19.5) return 'dusk';
  return 'night';
}
function seasonOf(date = new Date()) {
  const month = date.getMonth();
  if (month === 11 || month === 0) return 'winter';
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'summer';
}
function updateSky() {
  const win = $('#skyWin');
  if (!win) return;
  const now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
  const [top, bottom] = skyAt(hour);
  const phase = phaseOf(hour), season = seasonOf(now);
  win.style.setProperty('--sky-top', top);
  win.style.setProperty('--sky-bottom', bottom);
  win.dataset.phase = phase;
  win.dataset.season = state.settings.seasons ? season : 'none';
  // Sun from 6:00 to 18:30, moon the rest; both cross an arc from left to right
  const sunUp = hour >= 6 && hour < 18.5;
  const k = sunUp ? (hour - 6) / 12.5 : ((hour + 24 - 18.5) % 24) / 11.5;
  const body = $('.sky-body', win);
  body.innerHTML = sunUp ? ico('ui-day', '☀️') : ico('ui-night', '🌙');
  body.style.left = `${8 + k * 70}%`;
  body.style.top = `${62 - Math.sin(k * Math.PI) * 52}%`;
  // features/world.js adds the weather and the festival to this title
  win.dataset.skyTitle = [t(`sky.phases.${phase}`), `${pad(now.getHours())}:${pad(now.getMinutes())}`, state.settings.seasons ? t(`sky.seasons.${season}`) : '']
    .filter(Boolean).join(' · ');
  win.title = win.dataset.skyTitle;
  document.documentElement.dataset.phase = phase;
  if (typeof applyWeather === 'function') applyWeather();
}
function buildSkyWindow() {
  const brand = $('.hud .brand');
  if (!brand || $('#skyWin')) return;
  const win = el('div', 'sky-window', `
    <div class="sky"><span class="sky-stars"></span><span class="sky-body"></span><span class="sky-fall"></span><span class="sky-weather"></span></div>
    <span class="sky-cross"></span>`);
  win.id = 'skyWin';
  const candle = el('span', 'sky-candle', ico('ui-candle', '🕯️'));
  brand.after(win, candle);
  updateSky();
}

// ---------------------------------------------------------
// Small celebrations: pixel sparkle and rolling numbers
// ---------------------------------------------------------
function sparkle(sourceEl, count = 10) {
  if (!state.settings.anim || !sourceEl || !sourceEl.isConnected) return;
  const r = sourceEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const colors = ['#ffe27a', '#f6c49a', '#a8f0b0', '#9fe8ff', '#fff'];
  for (let i = 0; i < count; i++) {
    const spark = el('i', 'spark');
    const angle = (i / count) * 6.283 + Math.random() * 0.5, dist = 26 + Math.random() * 26;
    spark.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % colors.length]};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px`;
    document.body.append(spark);
    setTimeout(() => spark.remove(), 650);
  }
}
appOn('xp', ({ amount, sourceEl }) => { if (amount > 0) sparkle(sourceEl); });

function rollNumber(node, from, to) {
  if (!node || from === to || !state.settings.anim) { if (node) node.textContent = formatNumber(to); return; }
  const start = performance.now(), duration = 700;
  const step = now => {
    const k = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - k, 3);
    node.textContent = formatNumber(Math.round(lerp(from, to, eased)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------
// Streak in the top bar: the flame grows with the days
// ---------------------------------------------------------
const STREAK_MILESTONES = [7, 30, 100, 365];
const flameSize = days => (days >= 100 ? 'xl' : days >= 30 ? 'l' : days >= 7 ? 'm' : days >= 1 ? 's' : 'off');
let previousHud = null;
appOn('hudRender', () => {
  const stoneCount = stones(), streak = computeStreak();
  if (previousHud) rollNumber($('#shopBtn b'), previousHud.stones, stoneCount);
  const chip = $('#streakChip');
  if (chip) {
    chip.className = `streak-chip flame-${flameSize(streak)}`;
    chip.innerHTML = `${ico('hud-streak', '🔥')}<b>${streak}</b>${state.shop.shields ? `<small>${ico('ui-shield', '🛡')}${state.shop.shields}</small>` : ''}`;
    chip.title = streak ? t('sky.streakTitle', { count: streak }) : t('sky.streakStart');
  }
  previousHud = { stones: stoneCount, streak };
  checkStreakMilestone(streak);
});
function checkStreakMilestone(streak) {
  const milestone = STREAK_MILESTONES.filter(x => streak >= x).pop();
  if (!milestone || state.celebrated[`streak${milestone}`]) return;
  state.celebrated[`streak${milestone}`] = todayISO();
  save();
  setTimeout(() => streakFx(milestone), 500);
}
function streakFx(days) {
  sfx('achieve'); confetti(60);
  const tier = days >= 365 ? 'year' : days >= 100 ? 'hundred' : days >= 30 ? 'month' : 'week';
  const overlay = el('div', 'levelup streak-fx', `
    <div class="levelup-box">
      <div class="sfx-flame flame-${flameSize(days)}">${ico('hud-streak', '🔥')}</div>
      <div class="lu-title">${t('sky.milestoneTitle', { count: days })}</div>
      <div class="lu-sub">${t(`sky.milestone.${tier}`)}</div>
    </div>`);
  document.body.append(overlay);
  setTimeout(() => overlay.classList.add('out'), 3200);
  setTimeout(() => overlay.remove(), 3700);
}

function skyBoot() {
  buildSkyWindow();
  $('#streakChip').addEventListener('click', openProfile);
  setInterval(updateSky, 60000);
}
