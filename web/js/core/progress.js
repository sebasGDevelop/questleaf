/* Progress: XP, levels and realms, spirit stones, the streak and achievements. XP is recalculated from the state,
   never stored. */
'use strict';

let lastLevel = 1; // to celebrate when commit() sees a higher level

// ---------------------------------------------------------
// Levels and realms
// ---------------------------------------------------------
const xpToNext = level => 100 + 50 * (level - 1);
function levelInfo(xp) {
  let level = 1, remaining = xp;
  while (remaining >= xpToNext(level)) { remaining -= xpToNext(level); level++; }
  return { level, cur: remaining, need: xpToNext(level) };
}

// Cultivation realms: minimum level and the colors of the character [hat, hat brim, robe, orb].
// Names come from the dictionary (realms.<index>).
const REALMS = [
  { minLevel: 1, colors: ['#9a8f80', '#6f665a', '#8fa3c7', '#cfd8e8'] },
  { minLevel: 3, colors: ['#7fbf77', '#4f8a48', '#a9cbe8', '#a8f0b0'] },
  { minLevel: 5, colors: ['#6f9ee0', '#3f6aa8', '#b8b4ec', '#9fe8ff'] },
  { minLevel: 8, colors: ['#e0b23a', '#9c7616', '#f6c49a', '#ffe27a'] },
  { minLevel: 11, colors: ['#b07ae0', '#7446a8', '#d9b3e6', '#e6b3ff'] },
  { minLevel: 15, colors: ['#e06f8f', '#a33d5c', '#efb3d0', '#ffb3c8'] },
  { minLevel: 20, colors: ['#5fd6c4', '#2f9a8a', '#fff3c4', '#ffffff'] },
];
const realmName = index => t(`realms.${index}`);
function realmInfo(level) {
  const index = REALMS.reduce((found, realm, i) => (level >= realm.minLevel ? i : found), 0);
  const realm = REALMS[index];
  return { name: realmName(index), stage: level - realm.minLevel + 1, colors: realm.colors, index };
}
/** The player's title is the name of their realm. */
const titleFor = level => realmInfo(level).name;

// ---------------------------------------------------------
// XP by effort
// ---------------------------------------------------------
function habitChecks() {
  let count = 0;
  for (const day in state.habits.log) count += state.habits.log[day].length;
  return count;
}
/** Pages read: finished books in full plus the progress of the ones being read. */
function pagesRead() {
  return state.books.reduce((n, b) => n + (b.done ? (b.pages || 0) : Math.min(b.progress || 0, b.pages || Infinity)), 0);
}
const focusXP = minutes => Math.round(minutes / XP.focusMinutesPerXp);
// Pages with diminishing returns (light novels go past 10,000 pages):
// 1 XP every 2 pages up to 600, 1 every 10 up to 3,000 and 1 every 20 after that
const pagesXP = pages => Math.floor(Math.min(pages, 600) / 2 + Math.max(0, Math.min(pages, 3000) - 600) / 10 + Math.max(0, pages - 3000) / 20);
const bookXP = book => pagesXP(book.done ? (book.pages || XP.bookAssumedPages) : Math.min(book.progress || 0, book.pages || Infinity))
  + (book.done ? XP.bookFinished : 0);
const goalSize = goal => GOAL_SIZES.find(size => size.key === goal.size) || GOAL_SIZES[1];
const goalSizeName = key => t(`goals.sizes.${key}.name`);          // "Short", "Epic"…
const goalSizeDuration = key => t(`goals.sizes.${key}.duration`);  // "days", "a year or more"…
/** Half of a goal's XP is split among its milestones, the rest arrives when it is done. */
function goalParts(goal) {
  const total = goalSize(goal).xp, count = goal.milestones.length;
  const perMilestone = count ? Math.round(total * 0.5 / count) : 0;
  return { total, per: perMilestone, fin: total - perMilestone * count };
}
const goalXP = goal => goal.milestones.filter(m => m.done).length * goalParts(goal).per + (goal.done ? goalParts(goal).fin : 0);

function earnedXP() {
  return state.books.reduce((n, b) => n + bookXP(b), 0)
    + state.movies.filter(m => m.done).length * XP.movie
    + state.university.events.filter(e => e.done).reduce((n, e) => n + deliverableXP(e), 0)
    + state.workflow.jobs.filter(job => job.done && !job.eventId).length * XP.task // a deliverable gives its own XP
    + state.profile.projects.reduce((n, goal) => n + goalXP(goal), 0)
    + Object.keys(state.chronicles).length * XP.chronicle
    + Object.values(state.focusLog).reduce((n, sessions) => n + sessions.reduce((m, s) => m + focusXP(s.min), 0), 0)
    + state.listStats.done * XP.todo
    + challengesXP() + dailyQuestsXP() + bossesLootXP();
}

// ---------------------------------------------------------
// The earlier XP rules also scored daily things. A save scored with them keeps the difference (state.xpReform), so
// nobody loses levels. Do the same if the rules ever change.
// ---------------------------------------------------------
function scheduleLegacyXP() {
  let total = 0;
  for (const day in state.schedule.log) for (const key in state.schedule.log[day]) total += state.schedule.log[day][key].xp || 0;
  return total;
}
function legacyXP() {
  const R = LEGACY_XP_RULES;
  return scheduleLegacyXP()
    + habitChecks() * R.habit
    + Object.keys(state.workout.log).length * R.workout
    + state.books.filter(b => b.done).length * R.book
    + state.movies.filter(m => m.done).length * R.movie
    + state.university.events.filter(e => e.done).length * R.task
    + state.profile.projects.filter(goal => goal.done).length * R.project
    + state.profile.projects.reduce((n, goal) => n + goal.milestones.filter(m => m.done).length, 0) * R.milestone
    + Object.keys(state.journal).length * R.journal
    + Object.keys(state.chronicles).length * R.chronicle
    + Object.values(state.focusLog).reduce((n, sessions) => n + sessions.length, 0) * R.focus
    + state.listStats.done * R.todo;
}
function ensureXpReform() {
  if (state.xpReform) return;
  const old = legacyXP();
  state.xpReform = { date: todayISO(), base: old, adjust: old - earnedXP() };
}
const totalXP = () => Math.max(0, earnedXP() + (state.xpReform ? state.xpReform.adjust : 0));

/** Spirit stones, the shop currency: earned with XP (the pre-reform XP pays 1 every 10), spent on rewards. */
function stones() {
  const total = totalXP(), base = state.xpReform ? state.xpReform.base : 0;
  return Math.floor(Math.min(total, base) / 10) + Math.floor(Math.max(0, total - base) / STONE_RATE) - state.shop.spent;
}

// ---------------------------------------------------------
// Streak: consecutive days with a schedule block, a habit, the workout or a journal entry
// ---------------------------------------------------------
function dayHasActivity(dateISO) {
  const scheduleDay = state.schedule.log[dateISO];
  return (!!scheduleDay && Object.keys(scheduleDay).some(k => !k.startsWith('__')))
    || (state.habits.log[dateISO] || []).length > 0
    || !!state.workout.log[dateISO]
    || !!state.journal[dateISO];
}
function computeStreak() {
  let day = new Date(), count = 0;
  const frozen = new Set(state.frozenDays);
  if (!dayHasActivity(iso(day))) day = addDays(day, -1); // today does not break the streak yet
  for (;;) {
    const key = iso(day);
    if (dayHasActivity(key)) count++;
    else if (!frozen.has(key)) break; // a day saved by a shield does not count, but does not break it either
    day = addDays(day, -1);
  }
  return count;
}

// ---------------------------------------------------------
// Achievements: unlocked once (the date is stored in state.achievements).
// Name and description come from the dictionary (achievements.<id>).
// ---------------------------------------------------------
const defineAchievement = (id, icon, test) => ({
  id, icon, test,
  get name() { return t(`achievements.${id}.name`); },
  get desc() { return t(`achievements.${id}.description`); },
});
const ACHIEVEMENTS = [
  defineAchievement('first', '🗡️', g => g.completions >= 1),
  defineAchievement('builder', '🧱', g => g.blocks >= 10),
  defineAchievement('combo5', '⚡', g => g.maxDay >= 5),
  defineAchievement('clear', '🏆', g => g.clear),
  defineAchievement('balance', '☯️', g => g.balance),
  defineAchievement('early', '🌅', g => g.early),
  defineAchievement('night', '🦉', g => g.night),
  defineAchievement('streak3', '🔥', g => g.streak >= 3),
  defineAchievement('streak7', '🌋', g => g.streak >= 7),
  defineAchievement('scholar', '🎓', g => g.subjectHours >= 20),
  defineAchievement('reader', '📖', g => g.booksDone >= 5),
  defineAchievement('reader2', '🏛️', g => g.booksDone >= 20),
  defineAchievement('cinema', '🍿', g => g.moviesDone >= 25),
  defineAchievement('athlete', '💪', g => g.workouts >= 5),
  defineAchievement('garden', '🌱', g => g.habits >= 30),
  defineAchievement('uni', '📝', g => g.uniDone >= 5),
  defineAchievement('lvl5', '🎖️', g => g.level >= 5),
  defineAchievement('lvl10', '👑', g => g.level >= 10),
];

/** Totals the achievements are tested against. */
function aggregates() {
  const g = { completions: 0, maxDay: 0, clear: false, balance: false, early: false, night: false, subjectHours: 0 };
  for (const day in state.schedule.log) {
    const entries = state.schedule.log[day];
    let count = 0, hasSubject = false, hasPersonal = false;
    for (const key in entries) {
      if (key.startsWith('__')) { if (key === '__clear') g.clear = true; continue; }
      const entry = entries[key];
      count++; g.completions++;
      if (entry.t === 'subject') { hasSubject = true; g.subjectHours += entry.h || 0; } else hasPersonal = true;
      if (entry.s < 8) g.early = true;
      if (entry.s >= 21) g.night = true;
    }
    g.maxDay = Math.max(g.maxDay, count);
    if (hasSubject && hasPersonal) g.balance = true;
  }
  g.streak = computeStreak();
  g.level = levelInfo(totalXP()).level;
  g.blocks = state.schedule.blocks.length;
  g.booksDone = state.books.filter(b => b.done).length;
  g.moviesDone = state.movies.filter(m => m.done).length;
  g.workouts = Object.keys(state.workout.log).length;
  g.habits = habitChecks();
  g.uniDone = state.university.events.filter(e => e.done).length;
  return g;
}
/** silent = true stores the achievements already earned without notifying (when the app opens). */
function checkAchievements(silent) {
  const g = aggregates();
  const fresh = ACHIEVEMENTS.filter(a => !state.achievements[a.id] && a.test(g));
  fresh.forEach((achievement, i) => {
    state.achievements[achievement.id] = todayISO();
    if (silent) return;
    setTimeout(() => {
      sfx('achieve');
      toast(tHtml('achievements.unlockedHtml', { name: achievement.name, description: achievement.desc }), 'achieve',
        { icon: ico(`achievement-${achievement.id}`, achievement.icon), html: true, duration: 4200 });
    }, 500 + i * 700);
  });
}
