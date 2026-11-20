/* Pixel-art icons (web/assets/icons) and the activity and habit categories. */
'use strict';

const missingIcons = new Set();

/** <img> for a drawn icon; falls back to the emoji if the file cannot be loaded. */
function ico(key, emoji) {
  if (missingIcons.has(key)) return `<span class="ico-emoji">${emoji}</span>`;
  return `<img class="ico-img" src="assets/icons/${key}.png" alt="" data-ico="${esc(key)}" data-emoji="${esc(emoji)}" onerror="handleMissingIcon(this)">`;
}
function handleMissingIcon(img) {
  missingIcons.add(img.dataset.ico);
  const fallback = document.createElement('span');
  fallback.className = 'ico-emoji';
  fallback.textContent = img.dataset.emoji;
  img.replaceWith(fallback);
}

/** Interface icons of the pixel set (the emoji is only the fallback). */
const UI_ICON = {
  get edit() { return ico('ui-edit', '✎'); },
  get del() { return ico('ui-delete', '🗑'); },
  get info() { return ico('ui-info', '💬'); },
  get warn() { return ico('ui-alert', '⚠️'); },
  get pin() { return ico('ui-pin', '📌'); },
  get bag() { return ico('ui-backpack', '🎒'); },
};

// ---------------------------------------------------------
// Categories: drawn icons for activities and habits. The key is stored in the save;
// the name comes from the dictionary (categories.<key without "cat-">).
// ---------------------------------------------------------
const CATEGORIES = [
  ['cat-study', '📘'], ['cat-math', '📐'], ['cat-science', '🧪'], ['cat-code', '💻'],
  ['cat-languages', '🗣️'], ['cat-writing', '✒️'], ['cat-art', '🎨'], ['cat-music', '🎵'],
  ['cat-strength', '🏋️'], ['cat-cardio', '🏃'], ['cat-meditation', '🧘'], ['cat-health', '🌿'],
  ['cat-food', '🍖'], ['cat-drink', '🍵'], ['cat-water', '💧'], ['cat-rest', '😴'],
  ['cat-games', '🎲'], ['cat-social', '🍻'], ['cat-home', '🧹'], ['cat-work', '💰'],
  ['cat-shopping', '🧺'],
];
const CATEGORY_EMOJI = Object.fromEntries(CATEGORIES);
const categoryName = key => t(`categories.${key.replace(/^cat-/, '')}`);

// Emoji icons a save may hold, mapped to their category
const CATEGORY_BY_EMOJI = {};
Object.entries({
  'cat-study': ['📘', '📖', '📚', '🏛️', '⚖️', '🎓', '⭐'],
  'cat-math': ['📐', '🧮', '📊'],
  'cat-science': ['🧪', '🧬', '🔭'],
  'cat-code': ['💻', '🌐'],
  'cat-languages': ['🗣️', '🌍'],
  'cat-writing': ['✍️', '✒️', '📝', '📜'],
  'cat-art': ['🎨'],
  'cat-music': ['🎵', '🎶', '🎹', '🎸'],
  'cat-strength': ['🏋️', '💪'],
  'cat-cardio': ['🚶', '🏃', '🚌', '🚴'],
  'cat-meditation': ['🧘', '🙏', '📵'],
  'cat-health': ['💊', '🦷', '❤️'],
  'cat-food': ['🍔', '🍎', '🍳'],
  'cat-drink': ['☕', '🍵'],
  'cat-water': ['💧'],
  'cat-rest': ['😴', '🛏️', '🌅'],
  'cat-games': ['🎮', '🎲', '🎬'],
  'cat-social': ['👥'],
  'cat-home': ['🧹', '🏠'],
  'cat-shopping': ['🛒', '🧺'],
  'cat-work': ['💼'],
}).forEach(([key, emojis]) => emojis.forEach(emoji => { CATEGORY_BY_EMOJI[emoji.replace(/️/g, '')] = key; }));

/** Turns an emoji (or a cut key) into a category key; unknown values stay as they are. */
function toCategory(icon, fallback = 'cat-study') {
  const value = String(icon || '');
  if (!value) return fallback;
  if (CATEGORY_EMOJI[value]) return value;
  // Spanish keys of version-2 saves: "cat-escritura" → "cat-writing" (core/migrations.js), also when cut ("cat-escr")
  const oldKeys = typeof V2_CATEGORY_ICONS !== 'undefined' ? V2_CATEGORY_ICONS : {};
  if (oldKeys[value]) return oldKeys[value];
  if (value.startsWith('cat-')) {
    const oldKey = Object.keys(oldKeys).find(key => key.startsWith(value));
    return CATEGORIES.map(([key]) => key).find(key => key.startsWith(value)) || (oldKey && oldKeys[oldKey]) || fallback;
  }
  return CATEGORY_BY_EMOJI[value.replace(/️/g, '')] || value.slice(0, 8);
}
/** Icon of an activity or habit: a category, or a custom emoji. */
function iconHTML(value) {
  return CATEGORY_EMOJI[value] ? ico(value, CATEGORY_EMOJI[value]) : `<span class="ico-emoji">${esc(value)}</span>`;
}
/** Buttons to choose a category (plus the current custom emoji, if any). */
function categoryPickerHTML(current) {
  const custom = current && !CATEGORY_EMOJI[current]
    ? `<button type="button" data-icon="${esc(current)}" title="${esc(t('common.current'))}">${esc(current)}</button>` : '';
  return custom + CATEGORIES.map(([key, emoji]) => {
    const name = esc(categoryName(key));
    return `<button type="button" data-icon="${key}" title="${name}" aria-label="${name}">${ico(key, emoji)}</button>`;
  }).join('');
}
