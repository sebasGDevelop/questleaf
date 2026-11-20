/* Pure helpers: DOM, text, ids, colors, app events and dates (weeks start on Monday). */
'use strict';

// ---------------------------------------------------------
// DOM
// ---------------------------------------------------------
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/** One HTML escaper for the whole app (defined by the i18n engine, which loads first). */
const esc = escapeHtml;

// ---------------------------------------------------------
// Values
// ---------------------------------------------------------
const pad = n => String(n).padStart(2, '0');
const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
/** Any value as text, cut to `max` characters (used when validating saved data). */
const clipText = (value, max = 500) => String(value ?? '').slice(0, max);
/** Removes accents, for accent-insensitive search. */
const stripAccents = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '');
const isValidColor = color => /^#[0-9a-f]{3,8}$/i.test(color || '');

function hashString(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) | 0;
  return Math.abs(hash);
}
/** A stable pastel color for any name. */
const colorFor = text => PASTELS[hashString(text) % PASTELS.length];

// ---------------------------------------------------------
// App events: one module announces, others listen, nobody replaces anybody's functions.
// Events in use: commit, render, hudRender, xp, reminder, idle, listItemToggle, foto (the profile photo changed),
// focusStarting, focusStart, focusTick, focusProgress, focusEnd and sanctuaryClose.
// ---------------------------------------------------------
const appEmit = (name, detail) => document.dispatchEvent(new CustomEvent(`lia:${name}`, { detail }));
const appOn = (name, listener) => document.addEventListener(`lia:${name}`, e => listener(e.detail));

// ---------------------------------------------------------
// Dates (YYYY-MM-DD strings in local time; weeks start on Monday)
// ---------------------------------------------------------
const iso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function parseISO(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}
const todayISO = () => iso(new Date());
/** 0 = Monday … 6 = Sunday */
const weekdayIndex = date => (date.getDay() + 6) % 7;
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function startOfWeek(date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(day, -weekdayIndex(day));
}
/** The 7 dates of the current week moved by `offset` weeks. */
function weekDatesFor(offset) {
  const start = addDays(startOfWeek(new Date()), offset * 7);
  return range(0, 7).map(i => addDays(start, i));
}
function isoWeek(date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
}
const daysUntil = dateISO => Math.round((parseISO(dateISO) - parseISO(todayISO())) / 86400000);

// Names in the active language (index 0 = Monday / January). style: 'long' or 'short'
const dayNames = (style = 'long') => [...tRaw(style === 'short' ? 'dates.weekdaysShort' : 'dates.weekdays')];
const dayName = (index, style = 'long') => dayNames(style)[index];
/** Weekday name inside a sentence: Spanish writes it in lowercase ("del lunes"), English does not ("of Monday"). */
const dayNameInSentence = index => (currentLanguage() === 'es' ? dayName(index).toLowerCase() : dayName(index));
const monthNames = (style = 'long') => [...tRaw(style === 'short' ? 'dates.monthsShort' : 'dates.months')];
const monthName = (index, style = 'long') => monthNames(style)[index];

const formatHour = hour => `${pad(hour)}:00`;
/** "17 nov" in Spanish, "Nov 17" in English. */
const formatShortDate = date => t('dates.shortDate', { day: date.getDate(), month: monthName(date.getMonth(), 'short') });
/** "today", "tomorrow", "yesterday", "in 3 days", "2 days ago". */
function formatRelativeDays(days) {
  if (days === 0) return t('dates.today');
  if (days === 1) return t('dates.tomorrow');
  if (days === -1) return t('dates.yesterday');
  return days > 0 ? t('dates.inDays', { count: days }) : t('dates.daysAgo', { count: -days });
}
