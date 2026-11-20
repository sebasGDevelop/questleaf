/* Workshop: the metronome, the 16×16 sticker editor and the poem mode of Notes. */
'use strict';

// ---------------------------------------------------------
// Metronome
// ---------------------------------------------------------
const METRONOME = { on: false, beat: 0, next: 0, timer: 0, start: 0, taps: [] };
const metronomeSettings = () => state.sanctuary.metro;
function metronomeBodyHTML() {
  const settings = metronomeSettings();
  const mt = key => esc(t(`workshop.metronome.${key}`));
  if (metronomeFloating) return `<p class="mt-floating">${mt('isFloating')}</p>`;
  return `<div class="mt-top">
      <button class="rm-btn small" data-mtstep="-5" title="${mt('slower')}" aria-label="${mt('slower')}">−</button>
      <b data-mtbpm>${settings.bpm}</b><small>BPM</small>
      <button class="rm-btn small" data-mtstep="5" title="${mt('faster')}" aria-label="${mt('faster')}">+</button>
    </div>
    <input type="range" min="40" max="208" value="${settings.bpm}" data-mtrange aria-label="${mt('tempo')}">
    <div class="mt-dots">${range(0, settings.beats).map(i => `<i data-mtdot="${i}"${i === 0 ? ' class="first"' : ''}></i>`).join('')}</div>
    <div class="mt-row">
      <select data-mtbeats aria-label="${mt('beatsPerBar')}">${[2, 3, 4, 6].map(b => `<option value="${b}"${settings.beats === b ? ' selected' : ''}>${b}/4</option>`).join('')}</select>
      <button class="btn btn-small" data-mttap title="${mt('tapTip')}">${mt('tap')}</button>
      <select data-mthabit aria-label="${mt('logPracticeIn')}"><option value="">—</option>${state.habits.list.map(h => `<option value="${esc(h.id)}"${settings.habit === h.id ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
    </div>
    ${canFloat() ? `<button class="btn btn-small full" data-mtfloat title="${mt('floatingTip')}">${ico('ui-float', '')} ${mt('floating')}</button>` : ''}
    <button class="btn btn-primary full" data-mtgo title="${METRONOME.on ? mt('stop') : mt('start')}" aria-label="${METRONOME.on ? mt('stop') : mt('start')}">${METRONOME.on ? '■' : '▶'}</button>`;
}
function metronomeClick(time, accent) {
  const ctx = audioCtx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'square'; osc.frequency.value = accent ? 1320 : 880;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime((state.settings.volume / 100) * (accent ? 0.35 : 0.22), time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time); osc.stop(time + 0.06);
}
function metronomeSchedule() {
  const ctx = audioCtx, settings = metronomeSettings();
  while (METRONOME.next < ctx.currentTime + 0.12) {
    const beat = METRONOME.beat, at = METRONOME.next;
    metronomeClick(at, beat === 0);
    setTimeout(() => {
      $$('[data-mtdot]').forEach(d => d.classList.toggle('on', +d.dataset.mtdot === beat));
    }, Math.max(0, (at - ctx.currentTime) * 1000));
    METRONOME.beat = (beat + 1) % settings.beats;
    METRONOME.next += 60 / settings.bpm;
  }
}
function metronomeStart() {
  if (METRONOME.on) return;
  const ctx = ensureAudio();
  if (ctx.state === 'suspended') ctx.resume();
  METRONOME.on = true; METRONOME.beat = 0; METRONOME.next = ctx.currentTime + 0.08; METRONOME.start = Date.now();
  METRONOME.timer = setInterval(metronomeSchedule, 25);
  metronomeSchedule();
}
function metronomeStop() {
  if (!METRONOME.on) return;
  METRONOME.on = false;
  clearInterval(METRONOME.timer);
  $$('[data-mtdot]').forEach(d => d.classList.remove('on'));
  const minutes = Math.round((Date.now() - METRONOME.start) / 60000), habitId = metronomeSettings().habit;
  const habit = habitId && state.habits.list.find(x => x.id === habitId);
  if (habit && minutes >= 1) {
    state.practice[habitId] = (state.practice[habitId] || 0) + minutes;
    toast(t('workshop.metronome.practiceLogged', { min: minutes, habit: habit.name }), 'info', { icon: iconHTML(habit.icon) });
    commit();
  }
}
function metronomeTap() {
  const now = performance.now(), taps = METRONOME.taps.filter(tap => now - tap < 2500);
  taps.push(now);
  METRONOME.taps = taps;
  if (taps.length >= 3) {
    const gaps = taps.slice(1).map((tap, i) => tap - taps[i]);
    const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    metronomeSettings().bpm = Math.max(40, Math.min(208, bpm));
  }
}

// ---------------------------------------------------------
// Pixel canvas: 16x16 stickers with the app palette
// ---------------------------------------------------------
const STICKER_PALETTE = ['#2f2230', '#fff7e8', '#8a87a0', '#c1bfd2', '#c64d55', '#ec8274', '#dc8040', '#f6d874',
  '#4b8c53', '#86c066', '#3b8f8b', '#4c6fbd', '#87afe8', '#765cb6', '#f0a9c4', '#8f5f3e'];
const STICKER_SIZE = 16, stickerCache = new Map();
const emptyPixels = () => '.'.repeat(STICKER_SIZE * STICKER_SIZE);
const stickerById = id => state.stickers.find(s => s.id === id);
function stickerDataUrl(sticker) {
  const key = sticker.id + sticker.px;
  if (stickerCache.has(key)) return stickerCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = STICKER_SIZE;
  const ctx = canvas.getContext('2d');
  [...sticker.px].forEach((ch, i) => { if (ch !== '.') { ctx.fillStyle = STICKER_PALETTE[parseInt(ch, 16)]; ctx.fillRect(i % STICKER_SIZE, Math.floor(i / STICKER_SIZE), 1, 1); } });
  const url = canvas.toDataURL();
  stickerCache.set(key, url);
  return url;
}
const stickerImgHTML = (sticker, size = 32, cls = '') => `<img class="sticker${cls}" src="${stickerDataUrl(sticker)}" alt="${esc(sticker.name)}" title="${esc(sticker.name)}" style="width:${size}px;height:${size}px">`;

/** The sticker workshop. With onPick, clicking a sticker returns its id (to stick it on a note). */
function openStickerWorkshop(editId, onPick) {
  let current = editId ? { ...stickerById(editId) } : { id: '', name: '', px: emptyPixels() };
  let color = 0, tool = 'pen';
  const st = key => esc(t(`workshop.stickers.${key}`));
  openModal({
    title: t('workshop.stickers.title'), wide: true,
    body: `<div class="workshop">
      <div class="tl-left">
        <canvas class="tl-canvas" width="320" height="320" data-tlc></canvas>
        <div class="tl-pal">${STICKER_PALETTE.map((c, i) => `<button type="button" data-tlcol="${i}" style="--c:${c}" class="${i === 0 ? 'on' : ''}" aria-label="${esc(t('common.colorNamed', { color: i + 1 }))}"></button>`).join('')}</div>
        <div class="tl-tools">
          <button type="button" class="btn btn-small on" data-tltool="pen" title="${st('pen')}" aria-label="${st('pen')}">${ico('ui-edit', '')}</button>
          <button type="button" class="btn btn-small" data-tltool="erase" title="${st('eraser')}" aria-label="${st('eraser')}">${ico('ui-eraser', '')}</button>
          <button type="button" class="btn btn-small" data-tltool="fill" title="${st('fill')}" aria-label="${st('fill')}">${ico('ui-bucket', '')}</button>
          <button type="button" class="btn btn-small" data-tlclear title="${st('clear')}" aria-label="${st('clear')}">${UI_ICON.del}</button>
        </div>
      </div>
      <div class="tl-right">
        <label class="field"><span>${t('common.nameLabel')}</span><input type="text" data-tlname maxlength="24" placeholder="${st('namePlaceholder')}" value="${esc(current.name)}"></label>
        <button type="button" class="btn btn-primary full" data-tlsave>${st('save')}</button>
        <h3 class="pet-sub">${st('mine')}</h3>
        <div class="tl-list" data-tllist></div>
      </div>
    </div>`,
    onMount: modal => {
      const canvas = $('[data-tlc]', modal), ctx = canvas.getContext('2d'), list = $('[data-tllist]', modal);
      const draw = () => {
        ctx.clearRect(0, 0, 320, 320);
        for (let i = 0; i < STICKER_SIZE * STICKER_SIZE; i++) {
          const x = i % STICKER_SIZE, y = Math.floor(i / STICKER_SIZE);
          ctx.fillStyle = (x + y) % 2 ? '#efe6d2' : '#f8f1e2';
          ctx.fillRect(x * 20, y * 20, 20, 20);
          const ch = current.px[i];
          if (ch !== '.') { ctx.fillStyle = STICKER_PALETTE[parseInt(ch, 16)]; ctx.fillRect(x * 20, y * 20, 20, 20); }
        }
      };
      const drawList = () => {
        const edit = esc(t('common.edit')), remove = esc(t('common.delete'));
        list.innerHTML = state.stickers.length ? state.stickers.map(s => `<div class="tl-item${s.id === current.id ? ' on' : ''}">
          <button type="button" data-tlpick="${esc(s.id)}" title="${esc(t(onPick ? 'workshop.stickers.useNamed' : 'common.editNamed', { name: s.name }))}">${stickerImgHTML(s, 48)}</button>
          ${onPick ? `<button type="button" class="icon-mini" data-tledit="${esc(s.id)}" title="${edit}" aria-label="${edit}">${UI_ICON.edit}</button>` : ''}
          <button type="button" class="icon-mini" data-tldel="${esc(s.id)}" title="${remove}" aria-label="${remove}">${UI_ICON.del}</button></div>`).join('')
          : `<small class="muted">${st('empty')}</small>`;
      };
      const setPixel = (i, ch) => { current.px = current.px.slice(0, i) + ch + current.px.slice(i + 1); };
      const fill = (i, ch) => {
        const target = current.px[i];
        if (target === ch) return;
        const stack = [i];
        while (stack.length) {
          const k = stack.pop();
          if (current.px[k] !== target) continue;
          setPixel(k, ch);
          const x = k % STICKER_SIZE, y = Math.floor(k / STICKER_SIZE);
          if (x > 0) stack.push(k - 1); if (x < STICKER_SIZE - 1) stack.push(k + 1);
          if (y > 0) stack.push(k - STICKER_SIZE); if (y < STICKER_SIZE - 1) stack.push(k + STICKER_SIZE);
        }
      };
      let painting = false;
      const paint = e => {
        const r = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / r.width * STICKER_SIZE), y = Math.floor((e.clientY - r.top) / r.height * STICKER_SIZE);
        if (x < 0 || y < 0 || x >= STICKER_SIZE || y >= STICKER_SIZE) return;
        const i = y * STICKER_SIZE + x, ch = tool === 'erase' ? '.' : color.toString(16);
        if (tool === 'fill') fill(i, ch); else setPixel(i, ch);
        draw();
      };
      canvas.addEventListener('pointerdown', e => { painting = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } paint(e); });
      canvas.addEventListener('pointermove', e => { if (painting && tool !== 'fill') paint(e); });
      canvas.addEventListener('pointerup', () => { painting = false; });
      const loadSticker = id => { current = { ...stickerById(id) }; $('[data-tlname]', modal).value = current.name; draw(); drawList(); };
      modal.addEventListener('click', e => {
        const colorButton = e.target.closest('[data-tlcol]');
        if (colorButton) {
          color = +colorButton.dataset.tlcol; if (tool === 'erase') tool = 'pen';
          $$('[data-tlcol]', modal).forEach(b => b.classList.toggle('on', b === colorButton));
          $$('[data-tltool]', modal).forEach(b => b.classList.toggle('on', b.dataset.tltool === tool));
          return;
        }
        const toolButton = e.target.closest('[data-tltool]');
        if (toolButton) { tool = toolButton.dataset.tltool; $$('[data-tltool]', modal).forEach(b => b.classList.toggle('on', b === toolButton)); return; }
        if (e.target.closest('[data-tlclear]')) { current.px = emptyPixels(); draw(); return; }
        if (e.target.closest('[data-tlsave]')) {
          if (!/[0-9a-f]/.test(current.px)) { sfx('error'); toast(t('workshop.stickers.drawFirst'), 'warn'); return; }
          current.name = $('[data-tlname]', modal).value.trim().slice(0, 24) || t('workshop.stickers.defaultName');
          const existing = current.id && stickerById(current.id);
          if (existing) Object.assign(existing, { name: current.name, px: current.px });
          else { current.id = uid(); state.stickers.push({ id: current.id, name: current.name, px: current.px }); }
          sfx('place'); save(); drawList(); renderAll();
          toast(t('workshop.stickers.saved'), 'info', { icon: stickerImgHTML(current, 24) });
          return;
        }
        const pickButton = e.target.closest('[data-tlpick]');
        if (pickButton) {
          if (onPick) { closeModal(); onPick(pickButton.dataset.tlpick); return; }
          loadSticker(pickButton.dataset.tlpick); return;
        }
        const editButton = e.target.closest('[data-tledit]');
        if (editButton) { loadSticker(editButton.dataset.tledit); return; }
        const deleteButton = e.target.closest('[data-tldel]');
        if (deleteButton) {
          const id = deleteButton.dataset.tldel;
          state.stickers = state.stickers.filter(s => s.id !== id);
          state.notes.forEach(n => { n.stickers = n.stickers.filter(stickerId => stickerId !== id); });
          if (current.id === id) current = { id: '', name: '', px: emptyPixels() };
          sfx('remove'); save(); draw(); drawList(); renderAll();
        }
      });
      draw(); drawList();
    },
  });
}

// ---------------------------------------------------------
// Poem mode: metrical syllables (Spanish rules) and rhyme of each line
// ---------------------------------------------------------
const VOWELS = 'aeiouáéíóúü';
const STRONG_VOWELS = 'aeoáéíóú';
// Phonetic syllables of a word (basic diphthongs and hiatus)
function wordSyllables(rawWord) {
  const word = rawWord.toLowerCase().replace(/[^a-záéíóúüñ]/g, '').replace(/y$/, 'i').replace(/qu|gu(?=[eiéí])/g, 'q');
  if (!word) return { count: 0, stress: 0 };
  let count = 0, previous = '';
  const nuclei = [];
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (!VOWELS.includes(c)) { previous = ''; continue; }
    // two strong vowels together = hiatus (different syllables); otherwise a diphthong
    if (previous && !(STRONG_VOWELS.includes(previous) && STRONG_VOWELS.includes(c))) { previous = c; nuclei[nuclei.length - 1].push(i); continue; }
    count++; nuclei.push([i]); previous = c;
  }
  // Stress: written accent, or the rule for words ending in vowel, n or s (penultimate) / otherwise last
  let stress = nuclei.findIndex(group => group.some(i => 'áéíóú'.includes(word[i])));
  if (stress < 0) stress = /[aeiouns]$/.test(word) && count > 1 ? count - 2 : count - 1;
  return { count, stress, word, nuclei };
}
// Metrical syllables of a line: synalepha and the last word adjustment (oxytone +1, proparoxytone -1)
function verseInfo(line) {
  const words = line.split(/\s+/).filter(x => /[a-záéíóúüñ]/i.test(x));
  if (!words.length) return null;
  let total = 0;
  const infos = words.map(wordSyllables);
  infos.forEach((info, i) => {
    total += info.count;
    const nextWord = words[i + 1];
    if (nextWord && /[aeiouáéíóúy]$/i.test(words[i].replace(/[^a-záéíóúüñ]/gi, '')) && /^h?[aeiouáéíóú]/i.test(nextWord.replace(/[^a-záéíóúüñ]/gi, ''))) total--; // synalepha
  });
  const last = infos[infos.length - 1];
  const fromEnd = last.count - 1 - last.stress; // 0 = oxytone, 1 = paroxytone, 2 = proparoxytone
  total += fromEnd === 0 ? 1 : fromEnd >= 2 ? -1 : 0;
  // Rhyme: from the last stressed vowel
  const from = last.nuclei && last.nuclei[last.stress] ? last.nuclei[last.stress][0] : 0;
  const tail = (last.word || '').slice(from).replace(/[áéíóú]/g, c => 'aeiou'['áéíóú'.indexOf(c)]);
  return { syllables: Math.max(1, total), consonant: tail, assonant: tail.replace(/[^aeiou]/g, '') };
}
/** The gutter next to the poem: syllables (Spanish only) and rhyme letters (uppercase consonant, lowercase assonant). */
function poemGutter(text) {
  const showSyllables = currentLanguage() === 'es';
  const consonantLetters = {}, assonantLetters = {};
  let nextLetter = 0;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const infos = text.split('\n').map(verseInfo);
  // letters only go to rhymes that repeat
  const consonantCount = {}, assonantCount = {};
  infos.forEach(v => { if (v) { consonantCount[v.consonant] = (consonantCount[v.consonant] || 0) + 1; assonantCount[v.assonant] = (assonantCount[v.assonant] || 0) + 1; } });
  return infos.map(v => {
    if (!v) return '<span></span>';
    let letter = '', isConsonant = false;
    if (v.consonant && consonantCount[v.consonant] > 1) { letter = consonantLetters[v.consonant] || (consonantLetters[v.consonant] = LETTERS[nextLetter++ % 26]); isConsonant = true; }
    else if (v.assonant && assonantCount[v.assonant] > 1) letter = (assonantLetters[v.assonant] || (assonantLetters[v.assonant] = LETTERS[nextLetter++ % 26])).toLowerCase();
    const rhyme = letter ? t(isConsonant ? 'workshop.poem.consonantRhyme' : 'workshop.poem.assonantRhyme', { letter }) : '';
    const tip = [showSyllables ? t('workshop.poem.syllables', { count: v.syllables }) : '', rhyme].filter(Boolean).join(' · ');
    return `<span${tip ? ` title="${esc(tip)}"` : ''}>${showSyllables ? `<b>${v.syllables}</b>` : ''}${letter ? `<i>${letter}</i>` : ''}</span>`;
  }).join('');
}

// ---------------------------------------------------------
// Wiring with Notes and the Sanctuary
// ---------------------------------------------------------
function workshopBoot() {
  const notesView = $('#view-notes');
  // Notes: stickers on the note and poem mode
  notesView.addEventListener('click', e => {
    if (e.target.closest('[data-ntaller]')) { openStickerWorkshop(); return; }
    const note = selectedNoteId && state.notes.find(x => x.id === selectedNoteId);
    if (!note) return;
    if (e.target.closest('[data-nstick]')) {
      if (!state.stickers.length) { openStickerWorkshop(); return; }
      openStickerWorkshop(null, id => { if (note.stickers.length < 6) note.stickers.push(id); save(); renderNotes(); });
      return;
    }
    const unstickButton = e.target.closest('[data-nunstick]');
    if (unstickButton) { note.stickers.splice(+unstickButton.dataset.nunstick, 1); save(); renderNotes(); return; }
    if (e.target.closest('[data-npoem]')) { note.poem = !note.poem; save(); renderNotes(); sfx('select'); }
  });
  const syncPoem = () => {
    const textarea = $('#view-notes .ne-body.poem'), gutter = $('#view-notes [data-pgut]');
    if (!textarea || !gutter) return;
    gutter.innerHTML = poemGutter(textarea.value);
    gutter.scrollTop = textarea.scrollTop;
  };
  notesView.addEventListener('input', e => { if (e.target.matches('.ne-body.poem')) syncPoem(); });
  notesView.addEventListener('scroll', e => { if (e.target.matches && e.target.matches('.ne-body.poem')) syncPoem(); }, true);
  // Sanctuary: metronome
  const showBpm = () => { const bpm = $('[data-mtbpm]', SANCTUARY.layer); if (bpm) bpm.textContent = metronomeSettings().bpm; };
  SANCTUARY.el.addEventListener('click', e => {
    if (!e.target.closest('.rw-metro')) return;
    const stepButton = e.target.closest('[data-mtstep]');
    if (stepButton) { metronomeSettings().bpm = Math.max(40, Math.min(208, metronomeSettings().bpm + +stepButton.dataset.mtstep)); refreshSanctuaryWidgets(['metro']); saveSanctuarySoon(); return; }
    if (e.target.closest('[data-mttap]')) { metronomeTap(); showBpm(); saveSanctuarySoon(); return; }
    if (e.target.closest('[data-mtfloat]')) { openFloat('metro'); return; }
    if (e.target.closest('[data-mtgo]')) { if (METRONOME.on) metronomeStop(); else metronomeStart(); refreshSanctuaryWidgets(['metro']); }
  });
  SANCTUARY.el.addEventListener('input', e => {
    if (e.target.matches('[data-mtrange]')) { metronomeSettings().bpm = +e.target.value; showBpm(); saveSanctuarySoon(); }
  });
  SANCTUARY.el.addEventListener('change', e => {
    if (e.target.matches('[data-mtbeats]')) { metronomeSettings().beats = +e.target.value; METRONOME.beat = 0; refreshSanctuaryWidgets(['metro']); saveSanctuarySoon(); }
    if (e.target.matches('[data-mthabit]')) { metronomeSettings().habit = e.target.value; saveSanctuarySoon(); }
  });
}
// Leaving the Sanctuary stops the metronome (and logs the practice)
appOn('sanctuaryClose', metronomeStop);
