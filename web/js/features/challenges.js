/* Weekly challenges: three per week, the same ones all week long (seeded random). */
'use strict';

const CHALLENGE_DIFFICULTIES = ['easy', 'medium', 'hard'];
const weekMonday = (date = new Date()) => iso(addDays(date, -weekdayIndex(date)));
const weekDates = monday => Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(monday), i)));
// A challenge counts from the day it appeared (this week's ones, from Monday)
const challengeDays = (challenge, monday) => weekDates(monday).filter(d => d >= (challenge.from || monday));
const trainingDayCount = () => state.workout.days.filter(d => (d.exercises || []).length).length;
const scheduledHours = () => scheduleData().blocks.reduce((n, b) => n + b.duration, 0);
const scheduledDayCount = () => new Set(scheduleData().blocks.map(b => b.day)).size;

/** Seeded pseudo-random generator: the same seed always gives the same sequence. */
function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Each challenge type: when it is available, targets per difficulty, how it is measured and the
// section it leads to. The keys are saved values (state.challenges[monday].list[].kind).
const CHALLENGE_TYPES = {
  habits: {
    isAvailable: () => state.habits.list.length > 0, section: 'habits', icon: () => 'sec-habits',
    targets: () => { const n = state.habits.list.reduce((sum, h) => sum + h.days.length, 0); return [Math.ceil(n * .35), Math.ceil(n * .6), Math.ceil(n * .85)]; },
    text: challenge => t('challenges.types.habits', { count: challenge.target }),
    value: (challenge, days) => days.reduce((n, d) => n + (state.habits.log[d] || []).length, 0),
  },
  habit: {
    isAvailable: () => state.habits.list.length > 0, section: 'habits',
    pickRef: random => state.habits.list[Math.floor(random() * state.habits.list.length)].id,
    icon: challenge => (habitById(challenge.ref) || {}).icon || 'sec-habits',
    targets: challenge => { // 3, 5 and 7 times for a daily habit; fewer for one with fewer days
      const days = (habitById(challenge.ref) || { days: ALL_WEEKDAYS }).days.length;
      return [Math.max(1, Math.ceil(days * 3 / 7)), Math.max(1, Math.ceil(days * 5 / 7)), days];
    },
    text: challenge => {
      const habit = habitById(challenge.ref);
      return habit ? t('challenges.types.habit', { count: challenge.target, habit: habit.name }) : t('challenges.types.anyHabit', { count: challenge.target });
    },
    value: (challenge, days) => days.filter(d => (state.habits.log[d] || []).includes(challenge.ref)).length,
  },
  workout: {
    isAvailable: () => trainingDayCount() > 0, section: 'workout', icon: () => 'sec-workout',
    targets: () => { const n = trainingDayCount(); return [Math.max(1, Math.ceil(n * .4)), Math.max(1, Math.ceil(n * .7)), n]; },
    text: challenge => t('challenges.types.workout', { count: challenge.target }),
    value: (challenge, days) => days.filter(d => state.workout.log[d]).length,
  },
  schedule: {
    isAvailable: () => scheduleData().blocks.length > 0, section: 'schedule', icon: () => 'sec-schedule',
    targets: () => { const h = scheduledHours(); return [Math.max(1, Math.ceil(h * .4)), Math.max(1, Math.ceil(h * .7)), h]; },
    text: challenge => t('challenges.types.schedule', { count: challenge.target }),
    value: (challenge, days) => days.reduce((n, d) => n + Object.entries(scheduleData().log[d] || {})
      .reduce((m, [key, entry]) => m + (key.startsWith('__') ? 0 : entry.h || 0), 0), 0),
  },
  perfectDays: {
    isAvailable: () => scheduleData().blocks.length > 0, section: 'schedule', icon: () => 'achievement-clear',
    targets: () => { const n = scheduledDayCount(); return [1, Math.min(3, n), Math.min(5, n)]; },
    text: challenge => t('challenges.types.perfectDays', { count: challenge.target }),
    value: (challenge, days) => days.filter(d => scheduleData().log[d] && scheduleData().log[d].__clear).length,
  },
  journal: {
    isAvailable: () => true, section: 'calendar', icon: () => 'sec-calendar',
    targets: () => [3, 5, 7],
    text: challenge => t('challenges.types.journal', { count: challenge.target }),
    value: (challenge, days) => days.filter(d => state.journal[d]).length,
  },
  focus: {
    isAvailable: () => true, section: 'home', icon: () => 'cat-meditation',
    targets: () => [60, 150, 300],
    text: challenge => t('challenges.types.focus', { count: challenge.target }),
    value: (challenge, days) => days.reduce((n, d) => n + (state.focusLog[d] || []).reduce((m, s) => m + s.min, 0), 0),
  },
  reading: {
    isAvailable: () => state.books.some(b => !b.done), section: 'books', icon: () => 'sec-books',
    base: () => pagesRead(), targets: () => [40, 100, 200],
    text: challenge => t('challenges.types.reading', { count: challenge.target }),
    value: challenge => Math.max(0, pagesRead() - challenge.base),
  },
  todos: {
    isAvailable: () => state.lists.some(l => l.kind === 'todo'), section: 'lists', icon: () => 'sec-lists',
    base: () => state.listStats.done, targets: () => [3, 6, 10],
    text: challenge => t('challenges.types.todos', { count: challenge.target }),
    value: challenge => Math.max(0, state.listStats.done - challenge.base),
  },
};

function createChallenge(kind, diff, random) {
  const type = CHALLENGE_TYPES[kind];
  const challenge = { id: uid(), kind, diff, xp: CHALLENGE_XP[diff], done: false, from: todayISO() };
  if (type.pickRef) challenge.ref = type.pickRef(random);
  if (type.base) challenge.base = type.base();
  // A challenge that starts mid-week gets a target scaled to the days left
  const weekLeft = (7 - weekdayIndex(new Date())) / 7;
  challenge.target = Math.max(1, Math.round(type.targets(challenge)[diff] * weekLeft));
  return challenge;
}
// Picks distinct available kinds ("all habits" and "one habit" never together)
function pickChallengeKinds(random, avoid = []) {
  const kinds = Object.keys(CHALLENGE_TYPES).filter(k => CHALLENGE_TYPES[k].isAvailable() && !avoid.includes(k));
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const picked = [];
  for (const kind of kinds) {
    const twin = kind === 'habit' ? 'habits' : kind === 'habits' ? 'habit' : '';
    if (twin && (picked.includes(twin) || avoid.includes(twin))) continue;
    picked.push(kind);
  }
  return picked;
}
function ensureWeekChallenges() {
  const monday = weekMonday();
  if (state.challenges[monday]) return state.challenges[monday];
  // The very first week, with less than 4 days left, the challenges start next Monday
  if (!Object.keys(state.challenges).length && weekdayIndex(new Date()) >= 4) return (state.challenges[monday] = { list: [], rerolls: 0 });
  const random = seededRandom(hashString(monday));
  const week = { list: pickChallengeKinds(random).slice(0, 3).map((kind, i) => createChallenge(kind, i, random)), rerolls: 0 };
  state.challenges[monday] = week;
  return week;
}
const challengeValue = (challenge, days) => (CHALLENGE_TYPES[challenge.kind] ? CHALLENGE_TYPES[challenge.kind].value(challenge, days) : 0);
const challengeText = challenge => (CHALLENGE_TYPES[challenge.kind] ? CHALLENGE_TYPES[challenge.kind].text(challenge) : t('challenges.fallback'));
function challengesXP() {
  let xp = 0;
  for (const week of Object.values(state.challenges)) for (const challenge of week.list) if (challenge.done) xp += challenge.xp;
  return xp;
}

/** Checks this week's challenges (past weeks stay as they ended). */
function checkChallenges(quiet = false) {
  const monday = weekMonday(), week = ensureWeekChallenges();
  for (const challenge of week.list) {
    const done = challengeValue(challenge, challengeDays(challenge, monday)) >= challenge.target;
    if (done === challenge.done) continue;
    challenge.done = done;
    if (quiet) continue;
    if (done) {
      setTimeout(() => {
        sfx('achieve'); confetti(36);
        toast(tHtml('challenges.completedHtml', { text: challengeText(challenge), xp: challenge.xp }), 'achieve', { icon: ico('achievement-clear', '🏆'), html: true, duration: 4500 });
      }, 350);
    } else toast(t('challenges.undone', { xp: challenge.xp }), 'warn', { icon: '↩️' });
  }
}

function challengesCardHTML() {
  const monday = weekMonday(), week = ensureWeekChallenges();
  const daysLeft = 7 - weekdayIndex(new Date());
  const rows = () => week.list.map(challenge => {
    const type = CHALLENGE_TYPES[challenge.kind];
    if (!type) return '';
    const value = Math.min(challenge.target, challengeValue(challenge, challengeDays(challenge, monday)));
    const reroll = esc(t('challenges.reroll'));
    return `<li class="challenge d${challenge.diff}${challenge.done ? ' done' : ''}" style="--c:${sectionColor(type.section)}">
      <span class="ds-ico">${ico(type.icon(challenge), '🎯')}</span>
      <span class="challenge-text" data-go="${type.section}" title="${esc(t('challenges.goToSection'))}">
        <b>${challenge.done ? '✓ ' : ''}${esc(challengeText(challenge))}</b>
        <span class="pbar"><div style="width:${(value / challenge.target * 100).toFixed(1)}%"></div><span>${formatNumber(value)}/${formatNumber(challenge.target)}</span></span>
      </span>
      <span class="challenge-xp"><small>${'★'.repeat(challenge.diff + 1)} ${t(`challenges.difficulty.${CHALLENGE_DIFFICULTIES[challenge.diff]}`)}</small>+${challenge.xp} XP</span>
      ${!challenge.done && week.rerolls < 1 ? `<button class="icon-mini reto-swap" data-reroll="${esc(challenge.id)}" title="${reroll}" aria-label="${reroll}">↻</button>` : '<span></span>'}
    </li>`;
  }).join('');
  // A fold on Home: closed, its title still says how the week goes (the daily quest lives in the Today card)
  const done = week.list.filter(challenge => challenge.done).length;
  const summary = week.list.length ? `${done}/${week.list.length} · ${t('challenges.daysLeft', { count: daysLeft })}` : '';
  return foldHTML('home.challenges', t('challenges.title'), summary,
    () => (week.list.length ? `<ul class="challenges">${rows()}</ul>` : `<p class="empty small">${t('challenges.arriveMonday')}</p>`), 'challenges-card');
}

function rerollChallenge(id) {
  const week = ensureWeekChallenges(), challenge = week.list.find(x => x.id === id);
  if (!challenge || challenge.done || week.rerolls >= 1) return;
  const random = seededRandom(hashString(weekMonday() + id));
  const kind = pickChallengeKinds(random, week.list.map(x => x.kind))[0];
  if (!kind) { sfx('error'); toast(t('challenges.noOther'), 'warn'); return; }
  week.list[week.list.indexOf(challenge)] = createChallenge(kind, challenge.diff, random);
  week.rerolls++;
  sfx('page');
  commit();
}

function challengesBoot() {
  $('#view-home').addEventListener('click', e => {
    const button = e.target.closest('[data-reroll]');
    if (button) rerollChallenge(button.dataset.reroll);
  });
}
