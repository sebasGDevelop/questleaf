/* Translation engine: t() and tHtml(). A missing key falls back to Spanish, then to the key itself. */
'use strict';

const LANGUAGES = [
  { code: 'es', name: 'Español', locale: 'es-CO' },
  { code: 'en', name: 'English', locale: 'en-US' },
];
const DEFAULT_LANGUAGE = 'es';

const i18n = {
  lang: DEFAULT_LANGUAGE,
  dictionaries: {},
  pluralRules: null,
  reported: new Set(),
};

/** Called by each dictionary file: registerLocale('en', { ... }). */
function registerLocale(code, dictionary) {
  i18n.dictionaries[code] = dictionary;
}

const isSupportedLanguage = code => LANGUAGES.some(l => l.code === code);
const currentLanguage = () => i18n.lang;
const currentLocale = () => (LANGUAGES.find(l => l.code === i18n.lang) || LANGUAGES[0]).locale;

function setLanguage(code) {
  i18n.lang = isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
  i18n.pluralRules = new Intl.PluralRules(currentLocale());
  document.documentElement.lang = i18n.lang;
}

/** Best guess from the system language, used to preselect the first-run picker. */
function detectLanguage() {
  const prefs = [...(navigator.languages || []), navigator.language || ''];
  const match = prefs.map(p => String(p).slice(0, 2).toLowerCase()).find(isSupportedLanguage);
  return match || DEFAULT_LANGUAGE;
}

function lookupKey(dictionary, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dictionary);
}

/** Raw dictionary entry (string, array or object) with fallback. Used for lists such as default habits. */
function tRaw(key) {
  let entry = lookupKey(i18n.dictionaries[i18n.lang], key);
  if (entry === undefined) entry = lookupKey(i18n.dictionaries[DEFAULT_LANGUAGE], key);
  if (entry === undefined && !i18n.reported.has(key)) {
    i18n.reported.add(key);
    console.warn(`[i18n] Missing key: ${key}`);
  }
  return entry;
}

const isPluralEntry = entry => !!entry && typeof entry === 'object' && !Array.isArray(entry) && 'other' in entry;

function resolveEntry(key, params) {
  let entry = tRaw(key);
  if (entry === undefined) return key;
  if (isPluralEntry(entry)) {
    const category = Number.isFinite(+params.count) ? i18n.pluralRules.select(+params.count) : 'other';
    entry = entry[category] ?? entry.other;
  }
  return String(entry);
}

function interpolate(text, params, transform) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? transform(params[name]) : match));
}

/**
 * Plain text. Safe for textContent and for innerHTML only when no parameter carries user data.
 * Example: t('settings.saved')  ·  t('settings.schedule.blocksOutside', { count: 2 })
 */
function t(key, params = {}) {
  return interpolate(resolveEntry(key, params), params, value => String(value));
}

/**
 * HTML. The dictionary text may contain markup (<b>…</b>); every parameter is escaped,
 * so user data can be passed safely. Use it whenever the result goes into innerHTML with params.
 */
function tHtml(key, params = {}) {
  return interpolate(resolveEntry(key, params), params, value => escapeHtml(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Fills static markup from index.html: data-i18n (text), data-i18n-title and data-i18n-aria-label.
 */
function translateStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); });
}

// ---------------------------------------------------------
// Locale-aware formatting
// ---------------------------------------------------------
const formatNumber = n => Number(n).toLocaleString(currentLocale());
const formatDate = (date, options) => new Intl.DateTimeFormat(currentLocale(), options).format(date);

setLanguage(DEFAULT_LANGUAGE);
