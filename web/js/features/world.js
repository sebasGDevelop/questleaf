/* Living world: festivals of the year and the real weather in the sky window (Open-Meteo). */
'use strict';

// ---------------------------------------------------------
// Festivals: the world dresses up for special dates
// ---------------------------------------------------------
function thirdSaturdayOfSeptember(year) {
  const firstDay = new Date(year, 8, 1);
  const firstSaturday = (6 - firstDay.getDay() + 7) % 7 + 1;
  return new Date(year, 8, firstSaturday + 14);
}
// `id` is saved (celebrated keys), used by the CSS (data-festival) and the dictionary key; `particles` drives the effects
const FESTIVALS = [
  { id: 'birthday', particles: 'confetti', test: d => { const b = state.profile.birthday; return !!b && +b.slice(5, 7) === d.getMonth() + 1 && +b.slice(8, 10) === d.getDate(); } },
  { id: 'halloween', particles: 'bats', test: d => d.getMonth() === 9 && d.getDate() >= 24 },
  { id: 'christmas', particles: 'lights', test: d => d.getMonth() === 11 && d.getDate() >= 16 && d.getDate() <= 26 },
  { id: 'newYear', particles: 'fireworks', test: d => (d.getMonth() === 11 && d.getDate() >= 30) || (d.getMonth() === 0 && d.getDate() <= 2) },
  { id: 'friendship', particles: 'hearts', test: d => { const s = thirdSaturdayOfSeptember(d.getFullYear()); const k = Math.round((d - s) / 864e5); return k >= -2 && k <= 1; } },
];
const festivalName = festival => t(`world.festivals.${festival.id}`);
function festivalNow(date = new Date()) {
  if (state.settings.festivals === false) return null;
  return FESTIVALS.find(f => f.test(date)) || null;
}
// Festival particles (mixed with the season ones). fxSpawn is wrapped instead of using an app event because it
// must return the particle.
const fxSpawnWithoutFestival = fxSpawn;
fxSpawn = function (night) { // eslint-disable-line no-global-assign
  const festival = festivalNow();
  if (!festival || Math.random() > 0.6) return fxSpawnWithoutFestival(night);
  const p = { x: Math.random() * innerWidth, y: Math.random() * innerHeight, ph: Math.random() * 6.28, fall: true, kind: festival.particles };
  if (festival.particles === 'hearts') { p.vx = (Math.random() - 0.5) * 8; p.vy = -(10 + Math.random() * 10); p.r = 2; p.c = pickOf(['#f0a9c4', '#ec8274', '#fbd9e6']); p.shape = 'heart'; }
  else if (festival.particles === 'bats') {
    if (Math.random() < 0.45) { p.vx = 20 + Math.random() * 16; p.vy = (Math.random() - 0.5) * 6; p.r = 2; p.c = night ? '#2f2230' : '#4a3779'; p.shape = 'bat'; }
    else { p.vx = (Math.random() - 0.5) * 8; p.vy = -(4 + Math.random() * 6); p.r = 2.5; p.c = pickOf(['#f5b066', '#dc8040', '#b29ae2']); }
  } else if (festival.particles === 'lights') { p.vx = (Math.random() - 0.5) * 4; p.vy = 6 + Math.random() * 8; p.r = 2.5; p.c = pickOf(['#ec8274', '#86c066', '#f6d874', '#87afe8']); p.shape = 'light'; }
  else if (festival.particles === 'fireworks') { p.vx = (Math.random() - 0.5) * 30; p.vy = -(20 + Math.random() * 30); p.r = 2; p.c = pickOf(['#f6d874', '#ec8274', '#87afe8', '#b29ae2', '#fff7e8']); p.shape = 'spark'; }
  else { p.vx = (Math.random() - 0.5) * 12; p.vy = 14 + Math.random() * 14; p.r = 3; p.c = pickOf(['#ec8274', '#f6d874', '#86c066', '#87afe8', '#b29ae2', '#f0a9c4']); p.shape = 'confetti'; }
  return p;
};
const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];
const BAT = [['X.....X', 'XX.X.XX', '.XXXXX.', '...X...'], ['.......', 'XXXXXXX', '.XXXXX.', '...X...']];
/** Draws a shaped particle (core/effects.js calls it). */
function fxShape(ctx, p, seconds) {
  const x0 = Math.round(p.x), y0 = Math.round(p.y), u = p.r;
  const grid = rows => rows.forEach((row, j) => [...row].forEach((c, i) => { if (c === 'X') ctx.fillRect(x0 + i * u, y0 + j * u, u, u); }));
  if (p.shape === 'heart') grid(HEART);
  else if (p.shape === 'bat') grid(BAT[Math.floor(seconds * 6 + p.ph) % 2]);
  else if (p.shape === 'light') { ctx.globalAlpha = 0.45 + 0.5 * Math.abs(Math.sin(seconds * 2 + p.ph)); ctx.fillRect(x0, y0, u * 2, u * 2); }
  else if (p.shape === 'spark') { ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(seconds * 5 + p.ph)); ctx.fillRect(x0 - u, y0, u * 3, u); ctx.fillRect(x0, y0 - u, u, u * 3); }
  else ctx.fillRect(x0, y0, u * (1 + Math.abs(Math.sin(seconds * 3 + p.ph))), u); // spinning confetti
}

// ---------------------------------------------------------
// Real weather in the sky window
// ---------------------------------------------------------
const WEATHER = { code: null, temp: null, at: 0, kind: '', flash: 0 };
// Kinds: used by the CSS (data-weather) and as dictionary keys (world.weather.*)
const WEATHER_KINDS = ['storm', 'snow', 'rain', 'fog', 'cloudy', 'clear'];
function weatherKind(code) {
  if (code == null) return '';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloudy';
  return 'clear';
}
/** Internet requests go through Python in the desktop app (no browser permission problems). */
async function netJSON(url) {
  if (desktopApi && desktopApi.net_json) return desktopApi.net_json(url);
  const response = await fetch(url);
  return response.ok ? response.json() : null;
}
async function updateWeather(force) {
  const place = state.settings.weather;
  if (!place || place.lat == null) { WEATHER.kind = ''; applyWeather(); return; }
  if (!force && Date.now() - WEATHER.at < 30 * 60000) return;
  WEATHER.at = Date.now();
  try {
    const data = await netJSON(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=weather_code,temperature_2m&timezone=auto`);
    if (data && data.current) { WEATHER.code = data.current.weather_code; WEATHER.temp = Math.round(data.current.temperature_2m); WEATHER.kind = weatherKind(WEATHER.code); }
  } catch (e) { /* offline: the window keeps the normal sky */ }
  applyWeather();
}
function weatherText() {
  if (!WEATHER.kind) return '';
  const weather = t(`world.weather.${WEATHER.kind}`), city = state.settings.weather && state.settings.weather.city;
  if (WEATHER.temp == null) return weather;
  return city ? t('world.weatherInCity', { weather, temp: WEATHER.temp, city }) : t('world.weatherTemp', { weather, temp: WEATHER.temp });
}
function applyWeather() {
  const win = $('#skyWin');
  if (!win) return;
  win.dataset.weather = WEATHER.kind || '';
  const festival = festivalNow();
  win.dataset.festival = festival ? festival.id : '';
  win.title = [win.dataset.skyTitle || '', weatherText(), festival ? festivalName(festival) : ''].filter(Boolean).join(' · ');
}
async function searchCity(name) {
  const data = await netJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${currentLanguage()}`);
  return data && data.results ? data.results.map(r => ({ name: r.name, country: r.country || '', admin: r.admin1 || '', lat: +r.latitude.toFixed(3), lon: +r.longitude.toFixed(3) })) : [];
}
/** Rain and storm in the window move in the particles' loop (core/effects.js calls it). */
function skyWeatherFrame(seconds) {
  const win = FX.sky || (FX.sky = $('#skyWin'));
  if (!win || !WEATHER.kind || !['rain', 'storm', 'snow'].includes(WEATHER.kind)) return;
  win.style.setProperty('--wy', `${Math.round((seconds * (WEATHER.kind === 'snow' ? 14 : 60)) % 60)}px`);
  if (WEATHER.kind === 'storm' && Math.random() < 0.004) { win.classList.add('flash'); setTimeout(() => win.classList.remove('flash'), 120); }
}

// Once a day a new festival may start; the weather refreshes every 30 min
let worldDay = '';
function worldTick() {
  const today = todayISO();
  if (today !== worldDay) {
    worldDay = today;
    FX.night = null; // the particles are rebuilt in case a festival started
    const festival = festivalNow();
    const key = festival && `fest:${festival.id}:${today.slice(0, 4)}`;
    if (festival && !state.celebrated[key]) {
      state.celebrated[key] = true;
      save();
      const message = festival.id === 'birthday' ? 'world.birthdayHtml' : 'world.festivalHtml';
      setTimeout(() => toast(tHtml(message, { name: festivalName(festival) }), 'achieve', { html: true, duration: 5000 }), 1800);
    }
  }
  updateWeather(false);
  applyWeather();
}

function worldBoot() {
  worldTick();
  setInterval(worldTick, 5 * 60000);
}
