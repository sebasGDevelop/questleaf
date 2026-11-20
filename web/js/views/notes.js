/* Notes section: a notebook that saves while you type, with search, colors, bullets and pins. */
'use strict';

const NOTE_COLORS = ['#fff3b0', '#ffd9a8', '#f7c6d9', '#d9c6f2', '#c6dcf7', '#c9ecd7', '#e8dcc8'];
let selectedNoteId = null, noteSearch = '', noteSaveTimer = 0;
const noteById = id => state.notes.find(n => n.id === id);
/** "YYYY-MM-DDTHH:MM" in local time. */
const nowStamp = () => { const d = new Date(); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const noteTitle = note => note.title.trim() || note.body.trim().split('\n')[0].slice(0, 60) || t('notes.untitled');
const noteEmpty = note => !note.title.trim() && !note.body.trim();
function formatNoteStamp(stamp) {
  if (!stamp) return '';
  const [day, time] = stamp.split('T');
  return `${day === todayISO() ? t('dates.today') : formatShortDate(parseISO(day))}${time ? ` · ${time}` : ''}`;
}
/** Pinned notes first, then the most recently edited. */
const sortedNotes = () => [...state.notes].sort((a, b) =>
  (isPinned('nt', b.id) - isPinned('nt', a.id)) || b.updated.localeCompare(a.updated));

function createNote(body = '', title = '') {
  const note = { id: uid(), title, body, color: NOTE_COLORS[0], created: nowStamp(), updated: nowStamp(), stickers: [], poem: false };
  state.notes.unshift(note);
  return note;
}
/** When leaving a note that stayed empty, it is discarded. */
function dropNoteIfEmpty(id) {
  const note = id && noteById(id);
  if (note && noteEmpty(note)) { state.notes = state.notes.filter(x => x.id !== id); unpin('nt', id); }
}

function noteCardsHTML() {
  const query = noteSearch.trim();
  const notes = sortedNotes().filter(n => !query || matchesSearch(`${n.title} ${n.body}`, query));
  if (!notes.length) return `<p class="empty">${t(query ? 'notes.noMatches' : 'notes.noNotes')}</p>`;
  return notes.map(n => `
    <button class="note-card${n.id === selectedNoteId ? ' sel' : ''}" data-nopen="${esc(n.id)}" style="--c:${esc(n.color)}">
      ${isPinned('nt', n.id) ? `<span class="nc-pin">${UI_ICON.pin}</span>` : ''}
      ${n.stickers.length ? `<span class="nc-stickers">${n.stickers.slice(0, 3).map(id => { const s = stickerById(id); return s ? stickerImgHTML(s, 26) : ''; }).join('')}</span>` : ''}
      <b>${esc(noteTitle(n))}</b>
      <p>${esc(n.body.slice(0, 160))}</p>
      <small>${formatNoteStamp(n.updated)}</small>
    </button>`).join('');
}

function noteEditorHTML(note) {
  const pinned = isPinned('nt', note.id);
  return `<div class="note-editor" style="--c:${esc(note.color)}">
    <div class="ne-tools">
      <div class="ne-colors">${NOTE_COLORS.map(c => `<button type="button" class="${c === note.color ? 'on' : ''}" data-ncolor="${c}" style="background:${c}" aria-label="${esc(t('notes.color'))}"></button>`).join('')}</div>
      <button class="icon-mini ne-bullet" data-nbullet title="${esc(t('notes.bullets'))}" aria-label="${esc(t('notes.bulletsAria'))}">•≡</button>
      <button class="icon-mini${note.poem ? ' on' : ''}" data-npoem title="${esc(t('notes.poemMode'))}" aria-label="${esc(t('notes.poemModeAria'))}">${ico('cat-writing', '✒')}</button>
      <button class="icon-mini" data-nstick title="${esc(t('notes.addSticker'))}" aria-label="${esc(t('notes.addSticker'))}">${ico('cat-art', '🎨')}</button>
      <button class="icon-mini${pinned ? ' on' : ''}" data-npin title="${esc(t(pinned ? 'common.unpin' : 'common.pin'))}">${UI_ICON.pin}</button>
      ${canFloat() ? `<button class="icon-mini" data-nfloat title="${esc(t('notes.floating'))}" aria-label="${esc(t('notes.floating'))}">${ico('ui-float', '')}</button>` : ''}
      <button class="icon-mini" data-ndel title="${esc(t('notes.deleteNote'))}">${UI_ICON.del}</button>
    </div>
    <input class="ne-title" data-nfield="title" maxlength="80" value="${esc(note.title)}" placeholder="${esc(t('notes.titlePlaceholder'))}">
    ${note.stickers.length ? `<div class="ne-stickers">${note.stickers.map((id, i) => { const s = stickerById(id); return s ? `<button type="button" data-nunstick="${i}" title="${esc(t('common.remove'))}">${stickerImgHTML(s, 40)}</button>` : ''; }).join('')}</div>` : ''}
    ${note.poem
      ? `<div class="poem-wrap"><div class="poem-gutter" data-pgut>${poemGutter(note.body)}</div><textarea class="ne-body poem" data-nfield="body" maxlength="20000" wrap="off" placeholder="${esc(t('notes.poemPlaceholder'))}">${esc(note.body)}</textarea></div>`
      : `<textarea class="ne-body" data-nfield="body" maxlength="20000" placeholder="${esc(t('notes.bodyPlaceholder'))}">${esc(note.body)}</textarea>`}
    <small class="ne-meta" title="${esc(t('notes.createdOn', { date: formatNoteStamp(note.created) }))}"><span data-nstamp>${formatNoteStamp(note.updated)}</span></small>
  </div>`;
}

function renderNotes() {
  if (!selectedNoteId || !noteById(selectedNoteId)) selectedNoteId = sortedNotes()[0] ? sortedNotes()[0].id : null;
  const note = selectedNoteId && noteById(selectedNoteId);
  $('#view-notes').innerHTML = `
  <div class="spread spread-notes">
    <div class="page page-left">
      ${pageHead('notes', t('notes.subtitle'), `<button class="btn btn-primary btn-add" data-nnew title="${esc(t('notes.newNote'))}" aria-label="${esc(t('notes.newNote'))}">+</button>`, state.notes.length || '')}
      <input type="search" class="search notes-search" data-nsearch placeholder="${esc(t('notes.searchPlaceholder'))}" value="${esc(noteSearch)}">
      <div class="note-cards" id="noteCards">${noteCardsHTML()}</div>
    </div>
    <div class="page page-right">${note ? noteEditorHTML(note) : `<div class="detail-empty">${ico('sec-notes', '📒')}<p>${t('notes.emptyEditor')}</p></div>`}</div>
  </div>`;
}
const refreshNoteCards = () => { const cards = $('#noteCards'); if (cards) cards.innerHTML = noteCardsHTML(); };

function openNote(id) {
  if (id !== selectedNoteId) dropNoteIfEmpty(selectedNoteId);
  selectedNoteId = id;
}

// ---------------------------------------------------------
// Bullets
// ---------------------------------------------------------
const BULLET = '• ';
const bulletOf = line => (/^(\s*)([•\-*]) /.exec(line) || [])[0] || '';
/** Writes over the selection with insertText, so Ctrl+Z works and the note saves itself. */
function replaceRange(textarea, from, to, text) {
  textarea.focus();
  textarea.setSelectionRange(from, to);
  if (!document.execCommand('insertText', false, text)) {
    textarea.setRangeText(text, from, to, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
/** Adds or removes the bullet on every selected line. */
function toggleBullets(textarea) {
  const value = textarea.value, start = textarea.selectionStart, end = textarea.selectionEnd;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const lastBreak = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  const to = lastBreak < 0 ? value.length : lastBreak;
  const lines = value.slice(from, to).split('\n');
  const allBulleted = lines.every(l => !l.trim() || bulletOf(l));
  const result = lines.map(l => (allBulleted ? l.replace(/^(\s*)[•\-*] /, '$1') : !l.trim() || bulletOf(l) ? l : BULLET + l)).join('\n');
  replaceRange(textarea, from, to, result);
  textarea.setSelectionRange(from, from + result.length);
}
/** Enter inside a bulleted list continues it; Enter on an empty bullet ends the list. */
function bulletEnter(textarea, event) {
  const value = textarea.value, caret = textarea.selectionStart;
  if (caret !== textarea.selectionEnd) return;
  const from = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(from, caret), bullet = bulletOf(line);
  if (!bullet) return;
  event.preventDefault();
  const restOfLine = value.slice(caret, (value.indexOf('\n', caret) + 1 || value.length + 1) - 1);
  if (line.trim() === bullet.trim() && restOfLine.trim() === '') {
    replaceRange(textarea, from, caret, '');
    return;
  }
  replaceRange(textarea, caret, caret, '\n' + bullet);
}
/** Keys shared by every note box (Notes and the Sanctuary note): Enter continues a list; Alt+V and Ctrl+Shift+8 toggle bullets. */
function bulletKeydown(textarea, e) {
  const altV = e.code === 'KeyV' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey; // AltGr is Ctrl+Alt: left alone
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) bulletEnter(textarea, e);
  else if (altV || ((e.key === '*' || e.code === 'Digit8') && e.ctrlKey && e.shiftKey)) { e.preventDefault(); toggleBullets(textarea); }
}
/** Writing "- " (or "* ") at the start of a line turns it into a bullet, as in Notion or Obsidian. Ctrl+Z gives the dash back. */
function bulletAutoformat(textarea, e) {
  if (e.inputType !== 'insertText' || e.data !== ' ') return;
  const value = textarea.value, caret = textarea.selectionStart;
  if (caret !== textarea.selectionEnd) return;
  const from = value.lastIndexOf('\n', caret - 1) + 1;
  const match = /^(\s*)[-*] $/.exec(value.slice(from, caret));
  if (match) replaceRange(textarea, from + match[1].length, caret, BULLET);
}

function bindNotes() {
  const view = $('#view-notes');
  view.addEventListener('keydown', e => {
    const textarea = e.target.closest('.ne-body');
    if (textarea) bulletKeydown(textarea, e);
  });
  view.addEventListener('click', e => {
    const target = e.target;
    if (target.closest('[data-nbullet]')) {
      const textarea = $('.ne-body', view);
      if (textarea) toggleBullets(textarea);
      return;
    }
    if (target.closest('[data-nnew]')) {
      dropNoteIfEmpty(selectedNoteId);
      selectedNoteId = createNote().id;
      sfx('page'); save(); renderNotes();
      const titleInput = $('#view-notes .ne-title');
      if (titleInput) titleInput.focus();
      return;
    }
    const card = target.closest('[data-nopen]');
    if (card) { openNote(card.dataset.nopen); sfx('select'); renderNotes(); return; }
    const note = selectedNoteId && noteById(selectedNoteId);
    if (!note) return;
    const colorButton = target.closest('[data-ncolor]');
    if (colorButton) { note.color = colorButton.dataset.ncolor; save(); renderNotes(); return; }
    if (target.closest('[data-nfloat]')) { save(); openFloat('note', note.id); return; }
    if (target.closest('[data-npin]')) { togglePin('nt', note.id, note.id); renderNotes(); return; }
    if (target.closest('[data-ndel]')) {
      unpin('nt', note.id); selectedNoteId = null;
      if (noteEmpty(note)) { state.notes = state.notes.filter(x => x !== note); sfx('remove'); save(); renderAll(); }
      else removeWithUndo(state, 'notes', note, noteTitle(note), () => { save(); renderAll(); });
    }
  });
  // Typing saves by itself (without redrawing the editor, so the caret is kept)
  view.addEventListener('input', e => {
    if (e.target.matches('[data-nsearch]')) { noteSearch = e.target.value; refreshNoteCards(); return; }
    if (e.target.matches('.ne-body:not(.poem)')) bulletAutoformat(e.target, e); // a dash in a poem stays a dash
    const field = e.target.dataset.nfield;
    const note = selectedNoteId && noteById(selectedNoteId);
    if (!field || !note) return;
    note[field] = e.target.value;
    note.updated = nowStamp();
    const stamp = $('[data-nstamp]', view);
    if (stamp) stamp.textContent = formatNoteStamp(note.updated);
    refreshNoteCards();
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => { save(); renderPins(); }, 500);
  });
}

registerView('notes', {
  render: renderNotes, bind: bindNotes,
  reset: () => { selectedNoteId = null; noteSearch = ''; },
});
