/* Sanctuary (key R): your background with widgets you place anywhere (notes, pomodoro, sounds, metronome…). */
'use strict';

let isSanctuaryOpen = false;
const SANCTUARY = { bg: null, el: null, layer: null, dock: null, rain: null, raf: 0, last: 0, drops: [], tick: 0,
  dockTimer: 0, stillTimer: 0, menu: null, resizeObserver: null, saveTimer: 0, full: false };
// Widget types (saved in state.sanctuary.widgets[].type) → icon; the name comes from sanctuary.widgets.<type>
const WIDGET_TYPES = {
  note: 'sec-notes', focus: 'cat-meditation', clock: 'sec-schedule', sound: 'ui-sound', todo: 'sec-lists',
  quote: 'sec-reflections', music: 'cat-music', pet: 'ui-beast', metro: 'ui-metronome', sticker: 'cat-art',
};
// Where each widget shows up the first time (in % of the window)
const WIDGET_SPOTS = { focus: [70, 9], clock: [38, 7], sound: [72, 56], todo: [5, 54], quote: [36, 60], music: [70, 31], pet: [8, 76], metro: [40, 30] };
const widgetName = type => t(`sanctuary.widgets.${type}`);
const widgetById = id => state.sanctuary.widgets.find(w => w.id === id);
const saveSanctuarySoon = () => { clearTimeout(SANCTUARY.saveTimer); SANCTUARY.saveTimer = setTimeout(save, 400); };

// ---------------------------------------------------------
// Open and close
// ---------------------------------------------------------
function openSanctuary() {
  if (isSanctuaryOpen) return;
  isSanctuaryOpen = true;
  closeModal();
  if (typeof closeBag === 'function') closeBag();
  if (focus && !focus.el.hidden) { focus.el.hidden = true; }
  document.documentElement.classList.add('sanctuary-on');
  SANCTUARY.bg.hidden = SANCTUARY.el.hidden = false;
  applySanctuaryBackground();
  renderSanctuary();
  showDock(3500);
  const hint = $('.ref-hint', SANCTUARY.el);
  hint.classList.remove('gone'); void hint.offsetWidth;
  setTimeout(() => hint.classList.add('gone'), 3800);
  startRain();
  syncFire();
  syncAmbience();
  if (state.sanctuary.widgets.some(w => w.type === 'music')) pollMedia(true);
  sfx('page');
}
function closeSanctuary() {
  if (!isSanctuaryOpen) return;
  appEmit('sanctuaryClose'); // the workshop stops the metronome (and logs the practice)
  isSanctuaryOpen = false;
  document.documentElement.classList.remove('sanctuary-on', 'ref-still');
  SANCTUARY.bg.hidden = SANCTUARY.el.hidden = true;
  closeNoteMenu();
  stopRain();
  syncFire();
  syncAmbience();
  if (SANCTUARY.full) setSanctuaryFullscreen(false);
  state.sanctuary.widgets.filter(w => w.type === 'note').forEach(w => {
    const note = state.notes.find(x => x.id === w.ref);
    if (note && noteEmpty(note)) { state.notes = state.notes.filter(x => x !== note); unpin('nt', note.id); }
  });
  if (focus && focus.pill) focus.pill.hidden = false;
  save();
  renderAll(); // notes edited here show up in their section
  sfx('remove');
}

// Background: the one chosen in Appearance, clean (without the app's veil)
function applySanctuaryBackground() {
  const image = state.settings.bgImage;
  SANCTUARY.bg.style.backgroundImage = image ? `url("${image}")` : '';
  SANCTUARY.bg.classList.toggle('no-img', !image);
}

// ---------------------------------------------------------
// Widgets
// ---------------------------------------------------------
function addWidget(type, ref) {
  const widgets = state.sanctuary.widgets;
  if (type !== 'note' && type !== 'sticker') {
    const existing = widgets.find(w => w.type === type);
    if (existing) { flashWidget(existing.id); return; }
  }
  const noteCount = widgets.filter(w => w.type === 'note').length;
  const [x, y] = type === 'note' ? [8 + (noteCount % 5) * 6, 10 + (noteCount % 5) * 7]
    : type === 'sticker' ? [20 + Math.random() * 55, 15 + Math.random() * 50] : WIDGET_SPOTS[type];
  const widget = { id: uid(), type, x, y };
  if (type === 'note') { widget.ref = ref; widget.w = 250; widget.h = 230; }
  if (type === 'sticker') widget.ref = ref;
  if (type === 'music') setTimeout(() => pollMedia(true), 50);
  widgets.push(widget);
  sfx('place');
  save();
  renderSanctuary();
  if (type === 'note') { const textarea = $(`[data-wid="${widget.id}"] .rw-text`, SANCTUARY.el); if (textarea && !textarea.value) textarea.focus(); }
}
function removeWidget(id) {
  state.sanctuary.widgets = state.sanctuary.widgets.filter(w => w.id !== id);
  sfx('remove');
  save();
  renderSanctuary();
}
function flashWidget(id) {
  const node = $(`[data-wid="${id}"]`, SANCTUARY.el);
  if (!node) return;
  node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
}

function widgetHTML(widget) {
  let title = widgetName(widget.type), head = '', body = '', style = '', cls = '';
  if (widget.type === 'note') {
    const note = state.notes.find(x => x.id === widget.ref);
    if (!note) return '';
    title = note.title.trim() || widgetName('note');
    style = `--c:${esc(note.color)};width:${widget.w}px;height:${widget.h}px;`;
    const changeColor = esc(t('sanctuary.changeColor')), anotherNote = esc(t('sanctuary.anotherNote'));
    head = `<button class="rw-btn" data-ncycle title="${changeColor}" aria-label="${changeColor}">●</button><button class="rw-btn" data-nadd title="${anotherNote}" aria-label="${anotherNote}">+</button>`;
    body = `<textarea class="rw-text" data-note="${esc(note.id)}" maxlength="20000" placeholder="${esc(t('sanctuary.notePlaceholder'))}">${esc(note.body)}</textarea>`;
  } else if (widget.type === 'sticker') {
    const sticker = stickerById(widget.ref);
    if (!sticker) return '';
    title = sticker.name; cls = ' rw-pet';
    body = stickerImgHTML(sticker, 112);
  } else {
    body = widgetBodyHTML(widget.type);
    cls = widget.type === 'pet' ? ' rw-pet' : ' rw-card';
    if (widget.type === 'pet') title = state.pet.name;
  }
  const remove = esc(t('sanctuary.removeWidget'));
  return `<div class="rw rw-${widget.type}${cls}" data-wid="${esc(widget.id)}" style="left:${widget.x}%;top:${widget.y}%;${style}">
    <div class="rw-head" data-drag><span class="rw-title">${esc(title)}</span>${head}<button class="rw-btn rw-x" data-wclose title="${remove}" aria-label="${remove}">×</button></div>
    <div class="rw-body">${body}</div>
  </div>`;
}
// In Spanish the weekday goes in lowercase inside a sentence; in English it keeps its capital
const clockDate = date => t('sanctuary.clockDate', { weekday: dayNameInSentence(weekdayIndex(date)), date: formatShortDate(date) });

function widgetBodyHTML(type) {
  if (type === 'clock') {
    const now = new Date();
    return `<b class="rc-time" data-rclock>${pad(now.getHours())}:${pad(now.getMinutes())}</b>
      <small data-rdate>${clockDate(now)}</small>`;
  }
  if (type === 'focus') {
    if (focus) {
      return `<div class="rf-run">
        <img src="assets/icons/plant-${focus.stage}.png" alt="" data-rplant>
        <div><b data-rtime>${formatFocusLeft()}</b><small>${esc(focus.name)}${focus.paused ? ` · ${t('focus.paused')}` : ''}</small></div>
      </div>
      <div class="rf-btns"><button class="btn btn-small" data-rpause>${focus.paused ? t('focus.resume') : t('focus.pause')}</button>
        <button class="btn btn-small btn-danger" data-rstop>${t('focus.stop')}</button></div>`;
    }
    const s = state.settings;
    const less = esc(t('focus.lessMinutes')), more = esc(t('focus.moreMinutes'));
    return `<div class="rf-idle"><img src="assets/icons/plant-1.png" alt="">
      <div class="rf-mins">${FOCUS_MINUTES.map(m => `<button class="btn btn-small${s.focusMin === m ? ' on' : ''}" data-rmin="${m}">${m}</button>`).join('')}</div></div>
      <div class="rf-custom"><span class="min-step"><button type="button" class="btn btn-small" data-rstep="-5" title="${less}" aria-label="${less}">−</button><input type="number" class="min-input" data-rcustom min="1" max="240" value="${s.focusMin}" aria-label="${esc(t('focus.minutes'))}"><button type="button" class="btn btn-small" data-rstep="5" title="${more}" aria-label="${more}">+</button></span><small>${t('focus.minUnit')}</small></div>
      <button class="btn btn-primary full" data-rstart title="${esc(t('focus.startMinutes', { count: s.focusMin }))}" aria-label="${esc(t('focus.start'))}">▶</button>`;
  }
  if (type === 'sound') {
    const sanctuaryState = state.sanctuary;
    const row = (key, label, icon) => `<label class="rs-row"><span class="rs-ico">${ico(icon, '')}</span><span>${label}</span>
      <input type="range" min="0" max="100" step="5" value="${sanctuaryState[key]}" data-amb="${key}" aria-label="${esc(t('sanctuary.volumeOf', { name: label }))}"></label>`;
    return `${row('rain', t('sanctuary.rain'), 'cat-water')}${row('fire', t('sanctuary.fire'), 'hud-streak')}
      <button class="btn btn-small full" data-rmusic>${MUSIC.playing ? t('sanctuary.stopMusic') : t('sanctuary.playMusic')}</button>`;
  }
  if (type === 'todo') {
    const today = todayISO();
    const items = [];
    // A future date is not for today: it shows up here (and is reminded) on its day
    state.lists.filter(l => l.kind === 'todo').forEach(list => list.items.filter(i => !i.done && (!i.due || i.due <= today)).forEach(item => items.push({ list, item })));
    items.sort((a, b) => (a.item.due || '9999').localeCompare(b.item.due || '9999'));
    if (!items.length) return `<p class="rt-empty">${t('sanctuary.nothingPending')}</p>`;
    return `<ul class="rt-list">${items.slice(0, 7).map(({ list, item }) => `<li>
      <button class="qcheck" data-rcheck="${esc(list.id)}|${esc(item.id)}" aria-label="${esc(t('backpack.completeNamed', { name: item.text }))}"></button>
      <span>${esc(item.text)}</span>${item.due && item.due <= today ? `<small class="rt-due">${t('sanctuary.today')}</small>` : ''}</li>`).join('')}</ul>
      ${items.length > 7 ? `<small class="rt-more">${t('sanctuary.more', { count: items.length - 7 })}</small>` : ''}`;
  }
  if (type === 'music') return mediaBodyHTML();
  if (type === 'pet') return petHTML(120);
  if (type === 'metro') return metronomeBodyHTML();
  if (type === 'quote') {
    const quote = quoteOfTheDay();
    return `<p class="rq-text">${quote ? `“${esc(quote.text)}”` : t('sanctuary.noQuotes')}</p>`;
  }
  return '';
}

// ---------------------------------------------------------
// Windows media: Spotify (or whatever is playing) with cover,
// buttons and its own volume, through the Windows media controls
// ---------------------------------------------------------
const MEDIA = { s: null, key: '', thumb: '', at: 0, busy: false, volumeTimer: 0 };
const formatSeconds = seconds => `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;
function mediaBodyHTML() {
  if (!desktopApi || !desktopApi.media_state) return `<p class="rt-empty">${t('sanctuary.desktopOnly')}</p>`;
  const s = MEDIA.s;
  if (!s || !s.available) {
    return `<p class="rt-empty">${t('sanctuary.openSpotifyHint')}</p>
      <button class="btn btn-small full" data-mopen>${t('sanctuary.openSpotify')}</button>`;
  }
  const position = mediaPosition();
  // Opening tag only: the caller adds `disabled` when needed and the symbol
  const button = (cmd, key, extra = '') => `<button class="rm-btn${extra}" data-mcmd="${cmd}" title="${esc(t(`sanctuary.media.${key}`))}" aria-label="${esc(t(`sanctuary.media.${key}`))}"`;
  return `<div class="rm-track">
      ${MEDIA.thumb ? `<img class="rm-cover" src="${MEDIA.thumb}" alt="">` : `<span class="rm-cover none">${ico('cat-music', '♪')}</span>`}
      <div class="rm-text"><b title="${esc(s.title)}">${esc(s.title || t('sanctuary.untitled'))}</b><small title="${esc(s.artist)}">${esc(s.artist)}</small></div>
    </div>
    ${s.end > 0 ? `<div class="rm-time"><small data-mpos>${formatSeconds(position)}</small><span class="pbar"><div data-mbar style="width:${Math.min(100, position / s.end * 100).toFixed(1)}%"></div></span><small>${formatSeconds(s.end)}</small></div>` : ''}
    <div class="rm-btns">
      ${s.shuffle !== null && s.shuffle !== undefined ? `${button('shuffle', 'shuffle', ` small${s.shuffle ? ' on' : ''}`)}>⤮</button>` : ''}
      ${button('prev', 'previous')}${s.canPrev ? '' : ' disabled'}>⏮</button>
      ${button('toggle', s.playing ? 'pause' : 'play', ' big')}>${s.playing ? '⏸' : '▶'}</button>
      ${button('next', 'next')}${s.canNext ? '' : ' disabled'}>⏭</button>
    </div>
    ${s.volume !== null && s.volume !== undefined ? `<label class="rs-row rm-vol"><span class="rs-ico">${ico('ui-sound', '')}</span><span>${esc(s.app)}</span>
      <input type="range" min="0" max="100" step="2" value="${s.volume}" data-mvol aria-label="${esc(t('sanctuary.volumeOf', { name: s.app }))}"></label>` : ''}`;
}
// Spotify does not report its position every second: between polls it is estimated with the clock
const mediaPosition = () => { const s = MEDIA.s; if (!s) return 0; return Math.min(s.end || 0, s.pos + (s.playing ? (Date.now() - MEDIA.at) / 1000 : 0)); };
async function pollMedia(force) {
  if (MEDIA.busy || !desktopApi || !desktopApi.media_state) return;
  MEDIA.busy = true;
  try {
    let s = await desktopApi.media_state(false);
    const key = s && s.available ? `${s.title}|${s.artist}|${s.album}` : '';
    if (key && key !== MEDIA.key) { s = await desktopApi.media_state(true); MEDIA.thumb = s.thumb || ''; }
    const changed = force || key !== MEDIA.key || !MEDIA.s || MEDIA.s.playing !== s.playing || MEDIA.s.available !== s.available
      || MEDIA.s.shuffle !== s.shuffle || (MEDIA.s.volume !== s.volume && !MEDIA.volumeTimer);
    MEDIA.s = s; MEDIA.key = key; MEDIA.at = Date.now();
    // While Spotify plays, the app's own music goes quiet so they do not mix
    if (s.playing && MUSIC.playing) stopMusic();
    if (changed) refreshSanctuaryWidgets(['music']);
  } catch (e) { /* the music app closed: retried on the next round */ } finally { MEDIA.busy = false; }
}
async function sendMediaCommand(cmd) {
  if (!desktopApi || !desktopApi.media_command) return;
  sfx('select');
  if (cmd === 'toggle' && MEDIA.s) { MEDIA.s.playing = !MEDIA.s.playing; refreshSanctuaryWidgets(['music']); }
  await desktopApi.media_command(cmd).catch(() => false);
  setTimeout(() => pollMedia(true), 350);
}

function renderSanctuary() {
  if (!SANCTUARY.layer) return;
  state.sanctuary.widgets = state.sanctuary.widgets.filter(w => (w.type !== 'note' || state.notes.some(n => n.id === w.ref))
    && (w.type !== 'sticker' || stickerById(w.ref)));
  SANCTUARY.el.classList.toggle('ref-solo', !!state.sanctuary.hide);
  SANCTUARY.layer.innerHTML = state.sanctuary.widgets.map(widgetHTML).join('');
  // Whatever ended up outside the window (if it got smaller) comes back in
  $$('.rw', SANCTUARY.layer).forEach(node => {
    const W = innerWidth, H = innerHeight, r = node.getBoundingClientRect();
    if (r.left > W - 60) node.style.left = `${Math.max(0, W - r.width - 10)}px`;
    if (r.top > H - 40) node.style.top = `${Math.max(0, H - r.height - 10)}px`;
  });
  SANCTUARY.resizeObserver.disconnect();
  $$('.rw-note', SANCTUARY.layer).forEach(node => SANCTUARY.resizeObserver.observe(node));
  syncDock();
}
/** Redraws the widgets that change on their own (clock, pomodoro, to-dos) without touching the notes being typed. */
function refreshSanctuaryWidgets(types = ['focus', 'todo', 'quote', 'sound']) {
  if (!isSanctuaryOpen) return;
  types.forEach(type => {
    const node = $(`.rw-${type} .rw-body`, SANCTUARY.layer);
    if (node) node.innerHTML = widgetBodyHTML(type);
  });
}
function sanctuaryTick() {
  if (!isSanctuaryOpen) return;
  const now = new Date();
  const clock = $('[data-rclock]', SANCTUARY.layer);
  if (clock) {
    clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    $('[data-rdate]', SANCTUARY.layer).textContent = clockDate(now);
  }
  const focusWidget = $('.rw-focus .rw-body', SANCTUARY.layer);
  if (focusWidget) {
    const running = !!$('[data-rtime]', focusWidget);
    if (running !== !!focus) refreshSanctuaryWidgets(['focus']);
    else if (focus) {
      $('[data-rtime]', focusWidget).textContent = formatFocusLeft();
      const plant = $('[data-rplant]', focusWidget);
      if (plant && !plant.src.endsWith(`plant-${focus.stage}.png`)) plant.src = `assets/icons/plant-${focus.stage}.png`;
    }
  }
  if (focus && focus.pill) focus.pill.hidden = true; // the pomodoro already has its widget
  const mediaWidget = $('.rw-music .rw-body', SANCTUARY.layer);
  if (mediaWidget) {
    SANCTUARY.tick = (SANCTUARY.tick + 1) % 3;
    if (!SANCTUARY.tick) pollMedia();
    const s = MEDIA.s, bar = $('[data-mbar]', mediaWidget);
    if (s && bar && s.end > 0) { const position = mediaPosition(); bar.style.width = `${Math.min(100, position / s.end * 100).toFixed(1)}%`; $('[data-mpos]', mediaWidget).textContent = formatSeconds(position); }
  }
}

// ---------------------------------------------------------
// Dragging and saving positions
// ---------------------------------------------------------
function startWidgetDrag(e) {
  const head = e.target.closest('[data-drag]');
  if (!head || e.target.closest('button') || e.button !== 0) return;
  const node = head.closest('.rw'), widget = widgetById(node.dataset.wid);
  if (!widget) return;
  e.preventDefault();
  SANCTUARY.layer.append(node); // to the front
  state.sanctuary.widgets = state.sanctuary.widgets.filter(x => x !== widget).concat(widget);
  const r = node.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  node.classList.add('dragging');
  try { head.setPointerCapture(e.pointerId); } catch (err) { /* no capture: it still moves */ }
  const move = ev => {
    const x = Math.max(-r.width + 60, Math.min(innerWidth - 60, ev.clientX - dx));
    const y = Math.max(0, Math.min(innerHeight - 36, ev.clientY - dy));
    node.style.left = `${x}px`; node.style.top = `${y}px`;
  };
  const up = () => {
    head.removeEventListener('pointermove', move);
    head.removeEventListener('pointerup', up);
    head.removeEventListener('pointercancel', up);
    node.classList.remove('dragging');
    const nr = node.getBoundingClientRect();
    widget.x = +(nr.left / innerWidth * 100).toFixed(2);
    widget.y = +(nr.top / innerHeight * 100).toFixed(2);
    saveSanctuarySoon();
  };
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------
// Bottom dock (shows up when the mouse gets close) and notes menu
// ---------------------------------------------------------
function showDock(ms = 2200) {
  SANCTUARY.dock.classList.add('show');
  clearTimeout(SANCTUARY.dockTimer);
  SANCTUARY.dockTimer = setTimeout(() => { if (!SANCTUARY.menu && !SANCTUARY.dock.matches(':hover')) SANCTUARY.dock.classList.remove('show'); }, ms);
}
function syncDock() {
  $$('[data-radd]', SANCTUARY.dock).forEach(b => b.classList.toggle('on', !['note', 'sticker'].includes(b.dataset.radd) && state.sanctuary.widgets.some(w => w.type === b.dataset.radd)));
  const hideButton = $('[data-rhide]', SANCTUARY.dock);
  if (hideButton) hideButton.classList.toggle('on', !!state.sanctuary.hide);
}
function toggleNoteMenu(button) {
  if (SANCTUARY.menu) { closeNoteMenu(); return; }
  const placed = new Set(state.sanctuary.widgets.filter(w => w.type === 'note').map(w => w.ref));
  const free = sortedNotes().filter(n => !placed.has(n.id)).slice(0, 8);
  const menu = el('div', 'ref-menu', `<button class="btn btn-primary btn-small full" data-mnew>${t('sanctuary.newNote')}</button>
    ${free.length ? `<small>${t('sanctuary.fromNotebook')}</small>${free.map(n => `<button class="ref-mitem" data-mnote="${esc(n.id)}" style="--c:${esc(n.color)}">${esc(noteTitle(n))}</button>`).join('')}` : ''}`);
  SANCTUARY.el.append(menu);
  const r = button.getBoundingClientRect();
  menu.style.left = `${Math.max(8, r.left + r.width / 2 - 110)}px`;
  menu.style.bottom = `${innerHeight - r.top + 10}px`;
  SANCTUARY.menu = menu;
  menu.addEventListener('click', e => {
    if (e.target.closest('[data-mnew]')) { closeNoteMenu(); addWidget('note', createNote().id); return; }
    const item = e.target.closest('[data-mnote]');
    if (item) { closeNoteMenu(); addWidget('note', item.dataset.mnote); }
  });
}
function closeNoteMenu() { if (SANCTUARY.menu) { SANCTUARY.menu.remove(); SANCTUARY.menu = null; } }

async function pickSanctuaryBackground() {
  const url = await pickBackgroundAny();
  if (!url) return;
  state.settings.bgImage = url;
  state.settings.bg = 'image';
  applyLook();
  applySanctuaryBackground();
  save();
  toast(t('sanctuary.backgroundUpdated'), 'info', { icon: ico('ui-day', '🖼') });
}
// Full screen: the desktop app uses the Windows window; the browser, its own
function setSanctuaryFullscreen(on) {
  SANCTUARY.full = on;
  if (desktopApi && desktopApi.set_fullscreen) desktopApi.set_fullscreen(on).catch(() => {});
  else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const button = $('[data-rfull]', SANCTUARY.dock);
  if (button) button.classList.toggle('on', on);
}

// ---------------------------------------------------------
// Pixel rain (only while the sanctuary is open and the window active)
// ---------------------------------------------------------
function syncFire() {
  SANCTUARY.bg.classList.toggle('fire-on', isSanctuaryOpen && state.sanctuary.fire > 0 && state.settings.anim);
  SANCTUARY.bg.style.setProperty('--fire-o', (0.35 + state.sanctuary.fire / 160).toFixed(2));
}
function startRain() {
  const wanted = isSanctuaryOpen && state.sanctuary.rain > 0 && state.settings.anim && !FX.idle;
  if (!wanted) { stopRain(); return; }
  const canvas = SANCTUARY.rain;
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
  if (!SANCTUARY.raf) SANCTUARY.raf = requestAnimationFrame(rainLoop);
}
function stopRain() {
  cancelAnimationFrame(SANCTUARY.raf);
  SANCTUARY.raf = 0;
  if (SANCTUARY.rain) SANCTUARY.rain.getContext('2d').clearRect(0, 0, SANCTUARY.rain.width, SANCTUARY.rain.height);
}
function rainLoop(now) {
  SANCTUARY.raf = requestAnimationFrame(rainLoop);
  if (now - SANCTUARY.last < 1000 / 24) return;
  SANCTUARY.last = now;
  const canvas = SANCTUARY.rain, ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const count = Math.round(state.sanctuary.rain * 2.2);
  while (SANCTUARY.drops.length < count) SANCTUARY.drops.push({ x: Math.random() * W, y: Math.random() * H, v: rand(16, 26), l: rand(7, 14) });
  if (SANCTUARY.drops.length > count) SANCTUARY.drops.length = count;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = document.documentElement.dataset.theme === 'night' ? 'rgba(190, 205, 255, .42)' : 'rgba(225, 235, 255, .55)';
  for (const drop of SANCTUARY.drops) {
    drop.y += drop.v; drop.x += drop.v * .12;
    if (drop.y > H) { drop.y = -drop.l; drop.x = Math.random() * W; }
    ctx.fillRect(Math.round(drop.x), Math.round(drop.y), 2, Math.round(drop.l));
  }
}

// ---------------------------------------------------------
// Ambient sounds made with filtered noise (not recordings)
// ---------------------------------------------------------
const AMBIENCE = { out: null, rain: null, fire: null, crackle: 0 };
function ambienceNoise(ctx, brown) {
  const length = ctx.sampleRate * 2, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer; source.loop = true;
  return source;
}
function ambienceLayer(ctx, kind) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(AMBIENCE.out);
  const nodes = [];
  const chain = (source, ...filters) => { let node = source; filters.forEach(f => { node.connect(f); node = f; }); node.connect(gain); source.start(); nodes.push(source); };
  const filter = (type, frequency, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; return f; };
  if (kind === 'rain') {
    chain(ambienceNoise(ctx, false), filter('highpass', 500), filter('lowpass', 3200));
    const low = ctx.createGain(); low.gain.value = 0.5;
    chain(ambienceNoise(ctx, true), filter('lowpass', 420), low);
  } else {
    const roar = ctx.createGain(); roar.gain.value = 0.9;
    chain(ambienceNoise(ctx, true), filter('lowpass', 380), roar);
  }
  return { g: gain, nodes };
}
function fireCrackle() {
  const ctx = audioCtx;
  if (!ctx || !AMBIENCE.fire) return;
  if (Math.random() > .35) return;
  const at = ctx.currentTime, duration = rand(.006, .03);
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource(), bandpass = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = buffer; bandpass.type = 'bandpass'; bandpass.frequency.value = rand(1200, 4200); bandpass.Q.value = 1.2;
  gain.gain.value = rand(.25, .9) * (state.sanctuary.fire / 100);
  source.connect(bandpass).connect(gain).connect(AMBIENCE.fire.g);
  source.start(at);
}
function syncAmbience() {
  const volume = key => (isSanctuaryOpen && state.settings.sound ? state.sanctuary[key] / 100 : 0) * (state.settings.volume / 100);
  const needed = ['rain', 'fire'].some(key => volume(key) > 0);
  if (!needed && !AMBIENCE.rain && !AMBIENCE.fire) return;
  const ctx = ensureAudio();
  if (!AMBIENCE.out) { AMBIENCE.out = ctx.createGain(); AMBIENCE.out.gain.value = 0.55; AMBIENCE.out.connect(ctx.destination); }
  ['rain', 'fire'].forEach(key => {
    const v = volume(key);
    if (v > 0 && !AMBIENCE[key]) AMBIENCE[key] = ambienceLayer(ctx, key);
    if (!AMBIENCE[key]) return;
    AMBIENCE[key].g.gain.setTargetAtTime(v * (key === 'rain' ? .5 : .65), ctx.currentTime, .4);
    if (v === 0) {
      const layer = AMBIENCE[key];
      AMBIENCE[key] = null;
      setTimeout(() => layer.nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } }), 1600);
    }
  });
  clearInterval(AMBIENCE.crackle);
  if (AMBIENCE.fire) AMBIENCE.crackle = setInterval(fireCrackle, 70);
}

// ---------------------------------------------------------
// Events
// ---------------------------------------------------------
function onSanctuaryClick(e) {
  const target = e.target;
  if (SANCTUARY.menu && !target.closest('.ref-menu') && !target.closest('[data-radd="note"]')) closeNoteMenu();
  const addButton = target.closest('[data-radd]');
  if (addButton) {
    if (addButton.dataset.radd === 'note') toggleNoteMenu(addButton);
    else if (addButton.dataset.radd === 'sticker') openStickerWorkshop(null, id => addWidget('sticker', id));
    else addWidget(addButton.dataset.radd);
    return;
  }
  if (target.closest('[data-rexit]')) { closeSanctuary(); return; }
  if (target.closest('[data-rhide]')) { state.sanctuary.hide = !state.sanctuary.hide; save(); renderSanctuary(); return; }
  if (target.closest('[data-rbg]')) { pickSanctuaryBackground(); return; }
  if (target.closest('[data-rfull]')) { setSanctuaryFullscreen(!SANCTUARY.full); return; }
  const node = target.closest('.rw');
  if (!node) return;
  const widget = widgetById(node.dataset.wid);
  if (!widget) return;
  if (target.closest('[data-wclose]')) { removeWidget(widget.id); return; }
  if (widget.type === 'note') {
    const note = state.notes.find(x => x.id === widget.ref);
    if (target.closest('[data-ncycle]') && note) {
      note.color = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color) + 1) % NOTE_COLORS.length];
      node.style.setProperty('--c', note.color);
      sfx('select'); saveSanctuarySoon();
      return;
    }
    if (target.closest('[data-nadd]')) { addWidget('note', createNote().id); return; }
  }
  if (widget.type === 'focus') {
    const minutesButton = target.closest('[data-rmin]');
    if (minutesButton) { setFocusMin(+minutesButton.dataset.rmin); sfx('select'); return; }
    const stepButton = target.closest('[data-rstep]');
    if (stepButton) { setFocusMin(state.settings.focusMin + +stepButton.dataset.rstep); sfx('select'); return; }
    if (target.closest('[data-rstart]')) {
      startFocus(state.settings.focusAct, state.settings.focusMin);
      if (focus) { focus.el.hidden = true; focus.pill.hidden = true; }
      refreshSanctuaryWidgets(['focus']);
      return;
    }
    if (target.closest('[data-rpause]') && focus) { const pauseButton = $('[data-fpause]', focus.el); if (pauseButton) pauseButton.click(); refreshSanctuaryWidgets(['focus']); return; }
    const stopButton = target.closest('[data-rstop]');
    if (stopButton && focus) {
      if (stopButton.classList.contains('confirm')) { endFocus(false); refreshSanctuaryWidgets(['focus']); return; }
      stopButton.classList.add('confirm');
      stopButton.textContent = t('sanctuary.sure');
      setTimeout(() => { if (stopButton.isConnected) { stopButton.classList.remove('confirm'); stopButton.textContent = t('focus.stop'); } }, 3000);
      return;
    }
  }
  if (widget.type === 'pet' && target.closest('.pet')) { petPoke(target); return; }
  if (widget.type === 'music') {
    const mediaButton = target.closest('[data-mcmd]');
    if (mediaButton && !mediaButton.disabled) { sendMediaCommand(mediaButton.dataset.mcmd); return; }
    if (target.closest('[data-mopen]') && desktopApi && desktopApi.open_spotify) {
      desktopApi.open_spotify();
      toast(t('sanctuary.openingSpotify'), 'info', { icon: ico('cat-music', '♪') });
      return;
    }
  }
  if (widget.type === 'sound' && target.closest('[data-rmusic]')) {
    if (MUSIC.playing) stopMusic(); else playSong();
    setTimeout(() => refreshSanctuaryWidgets(['sound']), 300);
    return;
  }
  if (widget.type === 'todo') {
    const checkButton = target.closest('[data-rcheck]');
    if (checkButton) {
      const [listId, itemId] = checkButton.dataset.rcheck.split('|');
      const list = state.lists.find(x => x.id === listId), item = list && list.items.find(x => x.id === itemId);
      if (item) toggleListItem(list, item, checkButton);
    }
  }
}
function onSanctuaryInput(e) {
  const textarea = e.target.closest('.rw-text');
  if (textarea) {
    bulletAutoformat(textarea, e);
    const note = state.notes.find(x => x.id === textarea.dataset.note);
    if (!note) return;
    note.body = textarea.value;
    note.updated = nowStamp();
    saveSanctuarySoon();
    return;
  }
  if (e.target.matches('[data-rcustom]')) { const v = +e.target.value; if (v >= 1 && v <= 240) setFocusMin(v); return; }
  const volumeInput = e.target.closest('[data-mvol]');
  if (volumeInput) {
    const v = +volumeInput.value;
    if (MEDIA.s) MEDIA.s.volume = v;
    clearTimeout(MEDIA.volumeTimer);
    MEDIA.volumeTimer = setTimeout(() => { MEDIA.volumeTimer = 0; if (desktopApi && desktopApi.media_volume) desktopApi.media_volume(v).catch(() => {}); }, 90);
    return;
  }
  const ambienceInput = e.target.closest('[data-amb]');
  if (ambienceInput) {
    state.sanctuary[ambienceInput.dataset.amb] = +ambienceInput.value;
    syncAmbience();
    startRain();
    syncFire();
    saveSanctuarySoon();
  }
}
function onSanctuaryKey(e) {
  if (!isSanctuaryOpen) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.altKey && !e.metaKey && !['input', 'textarea', 'select'].includes(tag)
      && !e.target.isContentEditable && !$('#modalRoot .overlay') && !(focus && !focus.el.hidden)) { e.preventDefault(); openSanctuary(); }
    return;
  }
  const textarea = e.target.closest && e.target.closest('.rw-text');
  if (textarea) {
    if (e.key === 'Escape') { textarea.blur(); return; }
    bulletKeydown(textarea, e);
    return;
  }
  if (['input', 'select'].includes((e.target.tagName || '').toLowerCase()) || $('#modalRoot .overlay')) return;
  if (focus && !focus.el.hidden) return;
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') { if (SANCTUARY.menu) closeNoteMenu(); else closeSanctuary(); }
  else if (key === 'r') closeSanctuary();
  else if (key === 'h') { state.sanctuary.hide = !state.sanctuary.hide; save(); renderSanctuary(); }
  else if (key === 'f') addWidget('focus');
  else if (key === 'n') addWidget('note', createNote().id);
  else return;
  e.preventDefault();
}
function onSanctuaryPointer(e) {
  if (!isSanctuaryOpen) return;
  document.documentElement.classList.remove('ref-still');
  clearTimeout(SANCTUARY.stillTimer);
  SANCTUARY.stillTimer = setTimeout(() => { if (isSanctuaryOpen && !SANCTUARY.menu) document.documentElement.classList.add('ref-still'); }, 3000);
  if (e.clientY > innerHeight - 110) showDock();
}

// What changes in the app (to-dos, focus) also shows in the sanctuary
appOn('render', () => { if (isSanctuaryOpen) refreshSanctuaryWidgets(['focus', 'todo', 'quote']); });
// The rain pauses while the window is not active (saves resources)
appOn('idle', idle => { if (idle) stopRain(); else startRain(); });

function sanctuaryBoot() {
  SANCTUARY.bg = el('div', 'sanctuary-bg', '<canvas class="ref-rain"></canvas><div class="ref-fire"></div>');
  SANCTUARY.bg.hidden = true;
  const dockButton = (attr, icon, tipKey, labelKey) => `<button class="ref-tool" ${attr} title="${esc(t(tipKey))}">${ico(icon, '')}<span>${t(labelKey)}</span></button>`;
  SANCTUARY.el = el('div', 'sanctuary', `
    <div class="ref-widgets"></div>
    <div class="ref-hint">${tHtml('sanctuary.hintHtml')}</div>
    <nav class="ref-dock" aria-label="${esc(t('sanctuary.tools'))}">
      ${Object.entries(WIDGET_TYPES).map(([type, icon]) => `<button class="ref-tool" data-radd="${type}" title="${esc(widgetName(type))}">${ico(icon, '')}<span>${widgetName(type)}</span></button>`).join('')}
      <span class="ref-sep"></span>
      ${dockButton('data-rbg', 'ui-landscape', 'sanctuary.changeBackground', 'sanctuary.background')}
      ${dockButton('data-rhide', 'ui-eye', 'sanctuary.onlyBackgroundTip', 'sanctuary.onlyBackground')}
      ${dockButton('data-rfull', 'ui-screen', 'sanctuary.fullscreenTip', 'sanctuary.fullscreen')}
      ${dockButton('data-rexit', 'ui-sanctuary', 'sanctuary.exitTip', 'sanctuary.exit')}
    </nav>`);
  SANCTUARY.el.hidden = true;
  SANCTUARY.el.id = 'sanctuary';
  document.body.append(SANCTUARY.bg, SANCTUARY.el);
  SANCTUARY.layer = $('.ref-widgets', SANCTUARY.el);
  SANCTUARY.dock = $('.ref-dock', SANCTUARY.el);
  SANCTUARY.rain = $('.ref-rain', SANCTUARY.bg);
  SANCTUARY.resizeObserver = new ResizeObserver(entries => {
    let changed = false;
    entries.forEach(entry => {
      const widget = widgetById(entry.target.dataset.wid);
      if (!widget) return;
      const width = Math.round(entry.target.offsetWidth), height = Math.round(entry.target.offsetHeight);
      if (width && height && (width !== widget.w || height !== widget.h)) { widget.w = width; widget.h = height; changed = true; }
    });
    if (changed) saveSanctuarySoon();
  });
  SANCTUARY.el.addEventListener('click', onSanctuaryClick);
  SANCTUARY.el.addEventListener('input', onSanctuaryInput);
  SANCTUARY.el.addEventListener('pointerdown', startWidgetDrag);
  SANCTUARY.dock.addEventListener('mouseleave', () => showDock(1200));
  document.addEventListener('keydown', onSanctuaryKey);
  document.addEventListener('pointermove', onSanctuaryPointer, { passive: true });
  window.addEventListener('resize', () => { if (isSanctuaryOpen) { startRain(); renderSanctuary(); } });
  const button = $('#sanctuaryBtn');
  if (button) { button.innerHTML = ico('ui-sanctuary', '⛺'); button.addEventListener('click', openSanctuary); }
  setInterval(sanctuaryTick, 500);
}
