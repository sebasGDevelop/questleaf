/* What's new: shown once after an update. */
'use strict';

const NEWS_VERSION = '2026-11-07';
// [icon HTML, dictionary key under news.items]
const NEWS_ITEMS = () => [
  ['<img class="ico-img" src="assets/pet/pet-1.png" alt="">', 'pet'],
  [ico('boss-golem', '⚔'), 'bosses'],
  [ico('sec-habits', '🌱'), 'dailyQuest'],
  [ico('ui-letter', '✉'), 'memories'],
  [ico('cat-art', '🎨'), 'creativeNotes'],
  [ico('cat-meditation', '🧘'), 'pomodoro'],
  [ico('ui-sanctuary', '⛺'), 'sanctuary'],
  [ico('sec-books', '📚'), 'library'],
  [ico('ui-day', '☀'), 'world'],
  [ico('sec-lists', '📝'), 'recurring'],
];

function openNewsModal() {
  openModal({
    title: t('news.title'), wide: true,
    body: `<ul class="help-list news-list">
      ${NEWS_ITEMS().map(([icon, key]) => `<li><span class="help-ico" style="--c:#f6d38a">${icon}</span><span><b>${t(`news.items.${key}.title`)}</b> ${t(`news.items.${key}.text`)}</span></li>`).join('')}
    </ul>`,
    footer: `<span class="spacer"></span><button class="btn btn-primary" data-close>${t('common.letsGo')}</button>`,
  });
}

function newsBoot() {
  if (state.seenHelp && state.seenNews !== NEWS_VERSION) {
    state.seenNews = NEWS_VERSION;
    save();
    setTimeout(openNewsModal, 1500);
  } else if (!state.seenNews) { state.seenNews = NEWS_VERSION; save(); }
}
