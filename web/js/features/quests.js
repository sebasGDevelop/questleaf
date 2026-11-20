/* Quests: exam bosses, the daily side quest and the skill tree of the habits. */
'use strict';

// ---------------------------------------------------------
// Exam bosses: the more study a deadline needs, the stronger its boss
// ---------------------------------------------------------
const BOSS_TYPES = [
  { minutes: 60, icon: 'boss-slime', key: 'slime' }, { minutes: 120, icon: 'boss-golem', key: 'golem' },
  { minutes: 180, icon: 'boss-skeleton', key: 'skeleton' }, { minutes: 240, icon: 'boss-demon', key: 'demon' },
  { minutes: 360, icon: 'boss-wraith', key: 'wraith' }, { minutes: 480, icon: 'boss-knight', key: 'darkKnight' },
  { minutes: 600, icon: 'boss-dragon', key: 'dragon' }, { minutes: 900, icon: 'boss-fox', key: 'nineTailedFox' },
  { minutes: 1200, icon: 'boss-king', key: 'abyssKing' },
];
/** A deadline's `hp` is 0 (no boss) or the minutes of one boss type. */
const isValidBossHp = hp => hp === 0 || BOSS_TYPES.some(type => type.minutes === hp);
const bossTypeOf = event => BOSS_TYPES.find(type => event.hp <= type.minutes) || BOSS_TYPES[BOSS_TYPES.length - 1];
const bossName = type => t(`quests.bosses.${type.key}`);
const bossRewardXP = event => Math.round(event.hp / 2) + 30;
function bossDamage(event) {
  if (!event.hp || !event.act) return 0;
  const end = event.date < todayISO() ? event.date : todayISO();
  let minutes = 0;
  for (const d in state.focusLog) {
    if (d < (event.from || '0000') || d > end) continue;
    for (const session of state.focusLog[d]) if (session.act === event.act) minutes += session.min;
  }
  return minutes;
}
const bossHpLeft = event => Math.max(0, event.hp - bossDamage(event));
const isBossActive = event => event.hp > 0 && !event.won && daysUntil(event.date) >= 0;
const activeBossFor = activityId => state.university.events.filter(e => isBossActive(e) && e.act === activityId).sort((a, b) => a.date.localeCompare(b.date))[0];
function bossesLootXP() { return state.university.events.filter(e => e.won).reduce((n, e) => n + bossRewardXP(e), 0); }

function checkBosses(quiet) {
  for (const event of state.university.events) {
    if (!event.hp || event.won || !event.act) continue;
    if (bossDamage(event) >= event.hp) {
      event.won = todayISO();
      if (quiet) continue;
      const type = bossTypeOf(event);
      setTimeout(() => {
        sfx('levelup'); confetti(60);
        toast(tHtml('quests.bossDefeatedHtml', { boss: bossName(type), name: event.name, xp: bossRewardXP(event) }), 'achieve', { icon: ico(type.icon, '⚔'), html: true, duration: 5500 });
      }, 400);
    }
  }
}
function bossRowHTML(event) {
  if (!event.hp) return '';
  const left = bossHpLeft(event), pct = event.won ? 0 : left / event.hp * 100;
  const activity = activityById(event.act);
  const tip = event.won ? t('quests.bossWon', { xp: bossRewardXP(event) })
    : activity ? t('quests.bossLifeSubject', { left, hp: event.hp, subject: activity.name }) : t('quests.bossLife', { left, hp: event.hp });
  return `<div class="boss-row${event.won ? ' won' : daysUntil(event.date) < 0 ? ' fled' : ''}" title="${esc(tip)}">
    <span class="boss-ico">${ico(bossTypeOf(event).icon, '⚔')}</span>
    <span class="boss-hp"><i style="width:${pct.toFixed(1)}%"></i></span>
    <small>${event.won ? '✓' : `♥ ${left}`}</small>
  </div>`;
}

// Focusing on a subject with a boss shows who is being hit (app events from features/focus.js)
appOn('focusStart', session => {
  const boss = activeBossFor(session.actId);
  if (!boss) return;
  const type = bossTypeOf(boss);
  const line = el('div', 'focus-boss', `${ico(type.icon, '⚔')}<span>${esc(t('quests.focusTarget', { boss: bossName(type), name: boss.name, left: bossHpLeft(boss) }))}</span>`);
  const nameBox = $('.focus-name', session.el);
  if (nameBox) nameBox.after(line);
});
// Every 5 minutes of focus the boss loses life: the line in the focus window and a small notice say so
appOn('focusProgress', ({ session, minutes }) => {
  const boss = activeBossFor(session.actId) || state.university.events.find(e => e.won === todayISO() && e.act === session.actId && e.hp);
  if (!boss) return;
  const type = bossTypeOf(boss), left = bossHpLeft(boss);
  const line = $('.focus-boss span', session.el);
  if (line) line.textContent = t('quests.focusTarget', { boss: bossName(type), name: boss.name, left });
  if (!boss.won) toast(t('quests.focusStep', { min: minutes, boss: bossName(type), left }), 'info', { icon: ico(type.icon, '⚔'), duration: 2600 });
});
// The boss is picked before the session is logged: if that session defeats it, the victory toast is enough
appOn('focusEnd', ({ session, finished }) => {
  const boss = finished ? activeBossFor(session.actId) : null;
  if (!boss) return;
  const type = bossTypeOf(boss);
  setTimeout(() => {
    if (!boss.won) toast(t('quests.focusHit', { min: session.min, boss: bossName(type), name: boss.name, left: bossHpLeft(boss) }), 'info', { icon: ico(type.icon, '⚔') });
  }, 900);
});

/** Window to create or edit a deliverable: kind, subject, date (optional) and its boss. */
function openDeadlineModal(existing, defaultSubject = '') {
  // Subjects first (the boss is defeated by focusing on one), then the other activities
  const activities = [...state.schedule.activities].sort((a, b) => (a.type === 'subject' ? 0 : 1) - (b.type === 'subject' ? 0 : 1));
  let kind = existing ? existing.kind : 'task';
  const bossOptions = [[0, t('quests.deadline.noBoss')], ...BOSS_TYPES.map(type => [type.minutes, t('quests.deadline.bossOption', { hours: type.minutes / 60, boss: bossName(type) })])];
  openModal({
    title: existing ? t('quests.deadline.editTitle') : t('quests.deadline.newTitle'),
    body: `<form data-eform autocomplete="off">
      <label class="field"><span>${t('quests.deadline.what')}</span><input type="text" name="name" maxlength="80" value="${esc(existing ? existing.name : '')}" placeholder="${esc(t('quests.deadline.placeholder'))}"></label>
      <div class="field"><span>${t('quests.deadline.kind')}</span><div class="kind-grid">${segHTML('ekind', DELIVERABLE_KINDS.map(k => [k, t(`university.kinds.${k}`).toUpperCase()]))}</div></div>
      <div class="row2">
        <label class="field"><span>${t('quests.deadline.subject')}</span><select name="act"><option value="">—</option>${activities.map(a => `<option value="${esc(a.id)}"${(existing ? existing.act : defaultSubject) === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('quests.deadline.date')}</span><input type="date" name="date" value="${existing ? existing.date : todayISO()}"><small class="set-hint">${t('quests.deadline.dateOptional')}</small></label>
      </div>
      <label class="field"><span>${t('quests.deadline.boss')}</span><select name="hp">${bossOptions.map(([value, label]) => `<option value="${value}"${(existing ? existing.hp : 0) === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <div class="boss-pick"><span data-bprev></span><small class="muted boss-tip">${t('quests.deadline.tip')}</small></div>
    </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-del title="${esc(t('common.delete'))}" aria-label="${esc(t('common.delete'))}">${UI_ICON.del}</button>` : ''}<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-eform]', modal);
      bindSeg(modal, 'ekind', () => kind, value => { kind = value; });
      const showBoss = () => { const hp = +form.hp.value; $('[data-bprev]', modal).innerHTML = hp ? ico(bossTypeOf({ hp }).icon, '⚔') : ''; };
      form.hp.addEventListener('change', () => { sfx('select'); showBoss(); });
      showBoss();
      const submit = () => {
        const name = form.name.value.trim(), date = form.date.value, hp = +form.hp.value, act = form.act.value;
        if (!name) { sfx('error'); toast(t('quests.deadline.nameRequired'), 'warn'); return; }
        if (hp && !isDateKey(date)) { sfx('error'); toast(t('quests.deadline.bossNeedsDate'), 'warn'); return; }
        if (hp && !act) { sfx('error'); toast(t('quests.deadline.subjectRequired'), 'warn'); return; }
        const cleanDate = isDateKey(date) ? date : '';
        if (existing) {
          if (hp !== existing.hp || act !== existing.act) Object.assign(existing, { from: existing.from || todayISO(), won: '' });
          Object.assign(existing, { name, date: cleanDate, hp, act, kind });
        } else state.university.events.push({ id: uid(), name, date: cleanDate, hp, act, kind, from: todayISO(), won: '', done: false, doneAt: '' });
        closeModal(); sfx('place'); commit();
        if (hp && !existing) {
          const type = bossTypeOf({ hp });
          toast(t('quests.deadline.bossAppeared', { boss: bossName(type) }), 'info', { icon: ico(type.icon, '⚔') });
        }
      };
      $('[data-ok]', modal).onclick = submit;
      form.addEventListener('submit', e => { e.preventDefault(); submit(); });
      const deleteButton = $('[data-del]', modal);
      if (deleteButton) deleteButton.onclick = () => { closeModal(); removeWithUndo(state.university, 'events', existing, existing.name); };
    },
  });
}

// ---------------------------------------------------------
// Daily side quest: a 5-minute creative task
// ---------------------------------------------------------
// The quest of each day is saved by its position (state.dailyQuests[day].i): keep the order and add at the end.
// `match`: the quest only shows up when a habit name matches (Spanish or English); null = for everyone.
const POETRY = /poes|poem|poet/i, CALLIGRAPHY = /caligr|callig/i, DRAWING = /dibuj|draw|sketch/i;
const DAILY_QUESTS = [
  { key: 'haiku', match: POETRY, icon: 'cat-writing' }, { key: 'verses', match: POETRY, icon: 'cat-writing' },
  { key: 'copyQuote', match: CALLIGRAPHY, icon: 'cat-writing' }, { key: 'favoriteLetter', match: CALLIGRAPHY, icon: 'cat-writing' },
  { key: 'drawMug', match: DRAWING, icon: 'cat-art' }, { key: 'drawMonster', match: DRAWING, icon: 'cat-art' },
  { key: 'slowScale', match: /piano/i, icon: 'cat-music' }, { key: 'byEar', match: /piano/i, icon: 'cat-music' },
  { key: 'harmonica', match: /armón|armon|harmonica/i, icon: 'cat-music' }, { key: 'readNew', match: /lect|read/i, icon: 'sec-books' },
  { key: 'squats', match: /ejerc|exercis|workout/i, icon: 'cat-strength' }, { key: 'gratitude', match: null, icon: 'sec-calendar' },
  { key: 'tidyDesk', match: null, icon: 'cat-home' }, { key: 'waterStretch', match: null, icon: 'cat-water' },
  { key: 'newWord', match: null, icon: 'cat-languages' }, { key: 'kindMessage', match: null, icon: 'cat-social' },
  { key: 'lookAtSky', match: null, icon: 'ui-day' }, { key: 'projectIdea', match: null, icon: 'sec-notes' },
];
const DAILY_QUEST_FALLBACK = DAILY_QUESTS.find(quest => quest.key === 'gratitude');
const DAILY_QUEST_XP = 15;
function eligibleDailyQuests() {
  const habitNames = state.habits.list.map(h => h.name);
  return DAILY_QUESTS.map((quest, i) => i).filter(i => !DAILY_QUESTS[i].match || habitNames.some(name => DAILY_QUESTS[i].match.test(name)));
}
function todaysDailyQuest() {
  const today = todayISO();
  if (!state.dailyQuests[today]) {
    const pool = eligibleDailyQuests(), random = seededRandom(hashString('mision' + today));
    state.dailyQuests[today] = { i: pool[Math.floor(random() * pool.length)], done: false, rr: false };
  }
  return state.dailyQuests[today];
}
const dailyQuestsXP = () => Object.values(state.dailyQuests).filter(q => q.done).length * DAILY_QUEST_XP;
function dailyQuestHTML() {
  const progress = todaysDailyQuest(), quest = DAILY_QUESTS[progress.i] || DAILY_QUEST_FALLBACK;
  const swap = esc(t('quests.daily.swap'));
  return `<li class="challenge side-quest${progress.done ? ' done' : ''}" style="--c:#f6d38a">
    <span class="ds-ico">${ico(quest.icon, '✦')}</span>
    <span class="challenge-text"><small class="side-tag">${t('quests.daily.tag')}</small><b>${progress.done ? '✓ ' : ''}${esc(t(`quests.daily.list.${quest.key}`))}</b></span>
    <span class="challenge-xp">+${DAILY_QUEST_XP} XP</span>
    <span class="side-btns">${progress.done || progress.rr ? '' : `<button class="icon-mini" data-sqswap title="${swap}" aria-label="${swap}">↻</button>`}
      <button class="qcheck" data-sqdone aria-label="${esc(progress.done ? t('common.uncheck') : t('common.complete'))}">${progress.done ? '✓' : ''}</button></span>
  </li>`;
}

// ---------------------------------------------------------
// Skill tree: every habit climbs the ranks of a sect
// ---------------------------------------------------------
const SKILL_RANKS = [
  { key: 'novice', points: 0 }, { key: 'outerDisciple', points: 5 }, { key: 'innerDisciple', points: 15 },
  { key: 'coreDisciple', points: 35 }, { key: 'elder', points: 70 }, { key: 'master', points: 120 }, { key: 'grandmaster', points: 200 },
];
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const skillRankName = rank => t(`quests.skills.ranks.${SKILL_RANKS[rank].key}`);
function skillPoints(habit) {
  let points = 0;
  for (const d in state.habits.log) if (state.habits.log[d].includes(habit.id)) points++;
  return points + Math.floor((state.practice[habit.id] || 0) / 15);
}
const skillRank = points => SKILL_RANKS.reduce((rank, step, i) => (points >= step.points ? i : rank), 0);
function skillsHTML() {
  if (!state.habits.list.length) return '';
  return foldHTML('habits.skills', t('quests.skills.title'), '', () => `<div class="skills">${state.habits.list.map(habit => {
    const points = skillPoints(habit), rank = skillRank(points), next = SKILL_RANKS[rank + 1];
    const pct = next ? (points - SKILL_RANKS[rank].points) / (next.points - SKILL_RANKS[rank].points) * 100 : 100;
    const practice = state.practice[habit.id];
    const tip = [
      t('quests.skills.points', { count: points }),
      next ? t('quests.skills.toNext', { count: next.points - points, rank: skillRankName(rank + 1) }) : t('quests.skills.maxRank'),
      practice ? t('quests.skills.practice', { count: practice }) : '',
    ].filter(Boolean).join(' · ');
    return `<div class="skill r${rank}" style="--c:${esc(habit.color)}" title="${esc(tip)}">
        <span class="ds-ico">${iconHTML(habit.icon)}</span>
        <div class="sk-text"><b>${esc(habit.name)}</b><small>${skillRankName(rank)}</small><span class="pbar"><div style="width:${pct.toFixed(1)}%"></div></span></div>
        <span class="sk-rank">${ROMAN_NUMERALS[rank]}</span>
      </div>`;
  }).join('')}</div>`, 'skills-card');
}
function checkSkills(quiet) {
  for (const habit of state.habits.list) {
    const rank = skillRank(skillPoints(habit)), seen = state.skillSeen[habit.id];
    if (seen == null || quiet) { state.skillSeen[habit.id] = rank; continue; }
    if (rank > seen) {
      state.skillSeen[habit.id] = rank;
      setTimeout(() => {
        sfx('achieve'); confetti(30);
        toast(tHtml('quests.skills.rankUpHtml', { habit: habit.name, rank: skillRankName(rank) }), 'achieve', { icon: iconHTML(habit.icon), html: true });
      }, 500);
    }
  }
}

// ---------------------------------------------------------
// Wiring
// ---------------------------------------------------------
// Every commit first checks bosses and skills (before challenges, goals and achievements)
appOn('commit', () => { checkBosses(false); checkSkills(false); });

function questsBoot() {
  checkBosses(true);
  checkSkills(true);
  $('#view-home').addEventListener('click', e => {
    const doneButton = e.target.closest('[data-sqdone]');
    if (doneButton) {
      const progress = todaysDailyQuest();
      progress.done = !progress.done;
      sfx(progress.done ? 'achieve' : 'remove');
      xpFx(progress.done ? DAILY_QUEST_XP : -DAILY_QUEST_XP, doneButton, t('quests.daily.name'));
      commit();
      return;
    }
    if (e.target.closest('[data-sqswap]')) {
      const progress = todaysDailyQuest(), pool = eligibleDailyQuests().filter(i => i !== progress.i);
      progress.i = pool[Math.floor(Math.random() * pool.length)]; progress.rr = true;
      sfx('page'); commit();
    }
  });
  $('#view-university').addEventListener('click', e => {
    const button = e.target.closest('[data-eedit]');
    if (button) openDeadlineModal(state.university.events.find(x => x.id === button.dataset.eedit));
  });
}
