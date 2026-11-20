/* Memories (a Calendar mode): on this day, the gratitude jar, time capsules and the year in review. */
'use strict';

const JAR_COLORS = ['#ec8274', '#f6d874', '#86c066', '#87afe8', '#b29ae2', '#f0a9c4', '#7bcbbb', '#f5b066'];
let reviewCardIndex = 0, reviewYear = new Date().getFullYear();

// ---------------------------------------------------------
// On this day: what you wrote a month and a year ago
// ---------------------------------------------------------
function memoriesFor(dateISO) {
  const date = parseISO(dateISO), found = [];
  const add = (label, key) => {
    const journal = state.journal[key], gratitude = state.gratitude.filter(x => x.d === key);
    if ((journal && (journal.text || journal.mood)) || gratitude.length) found.push({ label, key, journal, gratitude });
  };
  add(t('memories.yearAgo'), iso(new Date(date.getFullYear() - 1, date.getMonth(), date.getDate())));
  add(t('memories.monthAgo'), iso(new Date(date.getFullYear(), date.getMonth() - 1, date.getDate())));
  return found;
}
function memoriesHTML(dateISO) {
  const memories = memoriesFor(dateISO);
  if (!memories.length) return '';
  return `<div class="memories">${memories.map(m => `<button class="memory" data-cgo="${m.key}" title="${esc(t('memories.goToDay'))}">
      <small>${m.label}${m.journal && m.journal.mood ? ` · ${moodIco(m.journal.mood)}` : ''}</small>
      ${m.journal && m.journal.text ? `<p>${esc(m.journal.text.slice(0, 140))}</p>` : ''}
      ${m.gratitude.length ? `<p class="mem-g">${m.gratitude.map(x => `<i style="--c:${JAR_COLORS[x.c % 8]}"></i>${esc(x.text)}`).join(' ')}</p>` : ''}
    </button>`).join('')}</div>`;
}
// Something good about the day: each one is a marble in the jar
function gratitudeDayHTML(dateISO) {
  if (dateISO > todayISO()) return '';
  const gratitude = state.gratitude.filter(x => x.d === dateISO);
  const saveLabel = esc(t('memories.saveToJar'));
  return `<form class="grat-form" data-gform autocomplete="off">
      <span class="jar-mini" title="${esc(t('memories.jar'))}">${gratitude.length ? gratitude.map(x => `<i style="--c:${JAR_COLORS[x.c % 8]}"></i>`).join('') : '<i class="empty"></i>'}</span>
      <input type="text" name="g" maxlength="140" placeholder="${esc(t('memories.gratitudePlaceholder'))}" aria-label="${saveLabel}">
      <button class="btn btn-small btn-add" title="${saveLabel}" aria-label="${saveLabel}">+</button>
    </form>
    ${gratitude.length ? `<div class="grat-list">${gratitude.map(x => `<span class="chip" style="--c:${JAR_COLORS[x.c % 8]}">${esc(x.text)}<button class="chip-x" data-gdel="${esc(x.id)}" aria-label="${esc(t('common.remove'))}">×</button></span>`).join('')}</div>` : ''}`;
}

// ---------------------------------------------------------
// Gratitude jar (pixel art): the marbles pile up from the bottom
// ---------------------------------------------------------
function drawJar(canvas) {
  const W = 60, H = 72, ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  const outline = '#2f2230', glass = 'rgba(205, 225, 250, .35)';
  // jar body
  ctx.fillStyle = glass; ctx.fillRect(8, 14, 44, 54);
  ctx.fillStyle = outline;
  ctx.fillRect(7, 14, 1, 54); ctx.fillRect(52, 14, 1, 54); ctx.fillRect(8, 68, 44, 1);
  ctx.fillRect(12, 8, 36, 1); ctx.fillRect(11, 9, 1, 5); ctx.fillRect(48, 9, 1, 5); ctx.fillRect(8, 13, 4, 1); ctx.fillRect(48, 13, 5, 1);
  // wooden lid
  ctx.fillStyle = '#c08a58'; ctx.fillRect(12, 3, 36, 5); ctx.fillStyle = '#e8bf86'; ctx.fillRect(12, 3, 36, 1);
  ctx.fillStyle = outline; ctx.fillRect(11, 2, 38, 1); ctx.fillRect(11, 8, 38, 1); ctx.fillRect(11, 3, 1, 5); ctx.fillRect(48, 3, 1, 5);
  // 4x4 marbles in staggered rows of 11
  const marbles = state.gratitude.slice(-120);
  marbles.forEach((x, i) => {
    const row = Math.floor(i / 11), col = i % 11, offset = row % 2 ? 2 : 0;
    const px = 9 + col * 4 + offset - (offset && col === 10 ? 4 : 0), py = 64 - row * 4;
    if (py < 15) return;
    ctx.fillStyle = JAR_COLORS[x.c % 8]; ctx.fillRect(px, py, 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(px, py, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px + 3, py + 3, 1, 1);
  });
  // glass shine
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(12, 18, 2, 30);
}

// ---------------------------------------------------------
// Time capsules: a letter that opens in the future
// ---------------------------------------------------------
const isCapsuleReady = capsule => !capsule.opened && capsule.open <= todayISO();
function capsulesHTML() {
  const capsules = [...state.capsules].sort((a, b) => (isCapsuleReady(b) - isCapsuleReady(a)) || a.open.localeCompare(b.open));
  if (!capsules.length) return `<p class="empty small">${t('memories.capsule.empty')}</p>`;
  return capsules.map(capsule => {
    const ready = isCapsuleReady(capsule);
    const status = capsule.opened ? t('memories.capsule.opened') : ready ? t('memories.capsule.ready') : t('memories.capsule.opensIn', { when: formatRelativeDays(daysUntil(capsule.open)) });
    return `<div class="capsule${ready ? ' ready' : capsule.opened ? ' opened' : ''}">
      <span class="cap-ico">${ico('ui-letter', '✉')}</span>
      <div><b>${status}</b><small>${t('memories.capsule.writtenOn', { created: formatShortDate(parseISO(capsule.created)), open: formatShortDate(parseISO(capsule.open)) })}</small></div>
      ${capsule.opened || ready ? `<button class="btn btn-small${ready ? ' btn-primary' : ''}" data-capread="${esc(capsule.id)}">${ready ? t('memories.capsule.open') : t('memories.capsule.read')}</button>` : `<span class="cap-lock" title="${esc(t('memories.capsule.sealed'))}">🔒</span>`}
    </div>`;
  }).join('');
}
function openCapsuleModal() {
  const choices = [['1m', 1], ['3m', 3], ['6m', 6], ['1y', 12]];
  const choiceLabel = months => (months === 12 ? t('memories.capsule.inOneYear') : t('memories.capsule.inMonths', { count: months }));
  openModal({
    title: t('memories.capsule.title'),
    body: `<form data-capform autocomplete="off">
      <label class="field"><span>${t('memories.capsule.toFutureSelf')}</span><textarea name="text" rows="8" maxlength="4000" placeholder="${esc(t('memories.capsule.placeholder'))}"></textarea></label>
      <div class="field"><span>${t('memories.capsule.opensLabel')}</span><div class="seg cap-when">${choices.map(([key, months], i) => `<button type="button" class="btn btn-small${i === 3 ? ' on' : ''}" data-capwhen="${key}">${choiceLabel(months)}</button>`).join('')}
        <input type="date" name="date" min="${iso(addDays(new Date(), 1))}" aria-label="${esc(t('memories.capsule.opensLabel'))}"></div></div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('memories.capsule.seal')}</button>`,
    onMount: modal => {
      const form = $('[data-capform]', modal);
      let months = 12;
      const setDate = () => { const d = new Date(); d.setMonth(d.getMonth() + months); form.date.value = iso(d); };
      setDate();
      modal.addEventListener('click', e => {
        const choice = e.target.closest('[data-capwhen]');
        if (choice) { months = choices.find(c => c[0] === choice.dataset.capwhen)[1]; $$('[data-capwhen]', modal).forEach(b => b.classList.toggle('on', b === choice)); setDate(); }
      });
      $('[data-ok]', modal).onclick = () => {
        const text = form.text.value.trim(), open = form.date.value;
        if (!text) { sfx('error'); toast(t('memories.capsule.messageRequired'), 'warn'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(open) || open <= todayISO()) { sfx('error'); toast(t('memories.capsule.futureDateRequired'), 'warn'); return; }
        state.capsules.push({ id: uid(), text, created: todayISO(), open, opened: false, notified: false });
        closeModal(); sfx('achieve'); confetti(16); save(); renderCalendar();
        toast(t('memories.capsule.sealedUntil', { date: formatShortDate(parseISO(open)) }), 'info', { icon: ico('ui-letter', '✉') });
      };
    },
  });
}
function readCapsule(capsule) {
  const isFirstTime = !capsule.opened;
  capsule.opened = true; save();
  if (isFirstTime) { sfx('levelup'); confetti(40); }
  const days = Math.max(1, Math.round((parseISO(capsule.open) - parseISO(capsule.created)) / 864e5));
  openModal({
    title: t('memories.capsule.letterTitle', { date: formatShortDate(parseISO(capsule.created)).toUpperCase() }),
    body: `<div class="capsule-letter"><p>${esc(capsule.text)}</p><small>${t('memories.capsule.signature', { count: days })}</small></div>`,
    footer: `<span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.closeUpper')}</button>`,
  });
  renderCalendar();
}
function checkCapsules() {
  for (const capsule of state.capsules) {
    if (isCapsuleReady(capsule) && !capsule.notified) {
      capsule.notified = true;
      save();
      notifyWin(t('memories.capsule.notifyTitle'), t('memories.capsule.notifyBody'));
      setTimeout(() => toast(t('memories.capsule.openedToastHtml'), 'achieve', { icon: ico('ui-letter', '✉'), html: true, duration: 6000 }), 2500);
    }
  }
}

// ---------------------------------------------------------
// Your year: cards with the highlights (a yearly review)
// ---------------------------------------------------------
function yearStats(year) {
  const prefix = `${year}-`, inYear = key => key.startsWith(prefix);
  let focusMin = 0, sessions = 0;
  for (const d in state.focusLog) if (inYear(d)) state.focusLog[d].forEach(s => { focusMin += s.min; if (!s.part) sessions++; });
  const books = state.books.filter(b => b.done && (b.doneAt ? inYear(b.doneAt) : year === new Date().getFullYear()));
  const pages = books.reduce((n, b) => n + (b.pages || 0), 0);
  const movies = state.movies.filter(m => m.done && (m.doneAt ? inYear(m.doneAt) : false)).length;
  // best streak within the year
  let best = 0, run = 0;
  const end = year === new Date().getFullYear() ? new Date() : new Date(year, 11, 31);
  for (let d = new Date(year, 0, 1); d <= end; d = addDays(d, 1)) { if (dayHasActivity(iso(d))) { run++; best = Math.max(best, run); } else run = 0; }
  const habitCount = {};
  for (const d in state.habits.log) if (inYear(d)) state.habits.log[d].forEach(id => { habitCount[id] = (habitCount[id] || 0) + 1; });
  const topHabit = Object.entries(habitCount).sort((a, b) => b[1] - a[1])[0];
  const moods = [0, 0, 0, 0, 0, 0];
  for (const d in state.journal) if (inYear(d) && state.journal[d].mood) moods[state.journal[d].mood]++;
  const moodTop = moods.indexOf(Math.max(...moods.slice(1)));
  let challenges = 0;
  for (const [monday, week] of Object.entries(state.challenges)) if (inYear(monday)) challenges += week.list.filter(c => c.done).length;
  const bosses = state.university.events.filter(e => e.won && inYear(e.won)).length;
  const dailyQuests = Object.entries(state.dailyQuests).filter(([d, q]) => inYear(d) && q.done).length;
  const gratitude = state.gratitude.filter(g => inYear(g.d));
  const habitTotal = Object.values(habitCount).reduce((a, b) => a + b, 0);
  return { focusMin, sessions, books: books.length, pages, movies, best, topHabit, habitTotal, moods, moodTop, challenges, bosses, dailyQuests, gratitude };
}
function yearReviewCards(year) {
  const s = yearStats(year), habit = s.topHabit && state.habits.list.find(x => x.id === s.topHabit[0]);
  const card = (icon, color, big, label, sub = '') => ({ icon, color, big, label, sub });
  const r = key => `memories.review.${key}`;
  const moodBars = [5, 4, 3, 2, 1].map(n => `<i style="--c:${MOODS[n].color};--h:${Math.max(4, s.moods[n] / Math.max(1, ...s.moods.slice(1)) * 40)}px" title="${esc(MOODS[n].name)}: ${s.moods[n]}"></i>`).join('');
  return [
    card(ico('cat-meditation', '🧘'), '#d9b3e6', `${Math.round(s.focusMin / 60)} h`, t(r('focus')), t(r('focusSessions'), { count: s.sessions })),
    card(ico('sec-books', '📚'), '#e3c49f', s.books, t(r('books'), { count: s.books }), s.pages ? t('books.pagesCount', { count: s.pages, pages: formatNumber(s.pages) }) : ''),
    card(ico('sec-movies', '🎬'), '#f3e7a1', s.movies, t(r('movies'), { count: s.movies })),
    card(ico('hud-streak', '🔥'), '#f6b98a', s.best, t(r('streak'), { count: s.best }), t(r('streakSub'))),
    card(habit ? iconHTML(habit.icon) : ico('sec-habits', '🌱'), '#a8d8a0', habit ? esc(habit.name) : '—', t(r('topHabit')),
      habit ? `${t(r('habitTimes'), { count: s.topHabit[1] })} · ${t(r('habitsChecked'), { count: s.habitTotal })}` : ''),
    card(s.moodTop > 0 ? moodIco(s.moodTop) : ico('mood-3', '😐'), '#9fd9c9', s.moodTop > 0 ? esc(MOODS[s.moodTop].name) : '—', t(r('topMood')),
      `<span class="wr-moods">${moodBars}</span>`),
    card(ico('achievement-clear', '🏆'), '#f6d38a', s.challenges + s.bosses + s.dailyQuests, t(r('victories'), { count: s.challenges + s.bosses + s.dailyQuests }),
      [t(r('challenges'), { count: s.challenges }), t(r('bosses'), { count: s.bosses }), t(r('dailyQuests'), { count: s.dailyQuests })].join(' · ')),
    card('<canvas class="wr-jar" data-wrjar></canvas>', '#cfe3a0', s.gratitude.length, t(r('gratitude'), { count: s.gratitude.length }),
      s.gratitude.length ? `“${esc(pickOf(s.gratitude).text)}”` : ''),
    card(petHTML(72), '#7bcbbb', petBond(), esc(t(r('daysWithPet'), { name: state.pet.name })), petStageName(petStage())),
  ];
}
function yearReviewHTML() {
  const cards = yearReviewCards(reviewYear), current = cards[reviewCardIndex % cards.length];
  return `<div class="wrap-box">
    <div class="wrap-head">
      <button class="btn btn-small" data-wyear="-1" aria-label="${esc(t('calendar.previousYear'))}">◀</button>
      <h2 class="detail-title">${t('memories.review.title', { year: reviewYear })}</h2>
      <button class="btn btn-small" data-wyear="1" aria-label="${esc(t('calendar.nextYear'))}"${reviewYear >= new Date().getFullYear() ? ' disabled' : ''}>▶</button>
    </div>
    <div class="wrap-card" style="--c:${current.color}" data-wrapnext title="${esc(t('memories.review.nextCard'))}">
      <span class="wr-ico">${current.icon}</span>
      <b class="wr-big">${current.big}</b>
      <span class="wr-label">${current.label}</span>
      ${current.sub ? `<small class="wr-sub">${current.sub}</small>` : ''}
    </div>
    <div class="wrap-dots">${cards.map((x, i) => `<button class="${i === reviewCardIndex % cards.length ? 'on' : ''}" data-wrapi="${i}" style="--c:${x.color}" aria-label="${esc(t('memories.review.card', { number: i + 1 }))}"></button>`).join('')}</div>
  </div>`;
}

function renderMemories() {
  $('#view-calendar').innerHTML = `
  <div class="spread spread-cal">
    <div class="page page-left">
      ${pageHead('calendar', t('memories.subtitle'), calendarModeSeg())}
      <section class="card jar-card">
        <h2 class="card-title">${t('memories.jarTitle')} <small>${state.gratitude.length}</small></h2>
        <div class="jar-row">
          <canvas class="jar" data-jar title="${esc(t('memories.jarHint'))}"></canvas>
          <div class="jar-side">
            <div class="jar-memory" data-jarmem><small>${t('memories.shakeHint')}</small></div>
            <button class="btn btn-primary" data-shake${state.gratitude.length ? '' : ' disabled'}>${t('memories.shake')}</button>
          </div>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">${t('memories.capsulesTitle')} <button class="btn btn-small btn-add" data-capnew title="${esc(t('memories.newCapsule'))}" aria-label="${esc(t('memories.newCapsule'))}">+</button></h2>
        <div class="capsules">${capsulesHTML()}</div>
      </section>
    </div>
    <div class="page page-right">${yearReviewHTML()}</div>
  </div>`;
  drawJar($('[data-jar]'));
  const reviewJar = $('[data-wrjar]');
  if (reviewJar) drawJar(reviewJar);
}

function memoriesBoot() {
  const view = $('#view-calendar');
  view.addEventListener('submit', e => {
    const form = e.target.closest('[data-gform]');
    if (!form) return;
    e.preventDefault();
    const text = form.g.value.trim();
    if (!text) return;
    state.gratitude.push({ id: uid(), d: calendarDay || todayISO(), text: text.slice(0, 140), c: state.gratitude.length % 8 });
    sfx('coin'); sparkle(form.querySelector('.jar-mini'), 8);
    commit();
  });
  view.addEventListener('click', e => {
    const target = e.target;
    const deleteButton = target.closest('[data-gdel]');
    if (deleteButton) { state.gratitude = state.gratitude.filter(x => x.id !== deleteButton.dataset.gdel); sfx('remove'); commit(); return; }
    const dayButton = target.closest('[data-cgo]');
    if (dayButton) {
      calendarDay = dayButton.dataset.cgo; calendarWeek = null;
      const day = parseISO(calendarDay);
      calendarMonth = new Date(day.getFullYear(), day.getMonth(), 1);
      sfx('page'); renderCalendar(); return;
    }
    if (target.closest('[data-shake]')) {
      const jar = $('[data-jar]', view), memory = $('[data-jarmem]', view), picked = pickOf(state.gratitude);
      jar.classList.remove('shake'); void jar.offsetWidth; jar.classList.add('shake');
      sfx('select');
      setTimeout(() => { memory.innerHTML = `<p>“${esc(picked.text)}”</p><small>${formatShortDate(parseISO(picked.d))} ${parseISO(picked.d).getFullYear()}</small>`; sfx('place'); }, 600);
      return;
    }
    if (target.closest('[data-capnew]')) { openCapsuleModal(); return; }
    const readButton = target.closest('[data-capread]');
    if (readButton) { readCapsule(state.capsules.find(c => c.id === readButton.dataset.capread)); return; }
    const yearButton = target.closest('[data-wyear]');
    if (yearButton) { reviewYear += +yearButton.dataset.wyear; reviewCardIndex = 0; sfx('page'); renderMemories(); return; }
    const dotButton = target.closest('[data-wrapi]');
    if (dotButton) { reviewCardIndex = +dotButton.dataset.wrapi; sfx('select'); renderMemories(); return; }
    if (target.closest('[data-wrapnext]')) { reviewCardIndex++; sfx('page'); renderMemories(); }
  });
  checkCapsules();
  setInterval(checkCapsules, 30 * 60000);
}
