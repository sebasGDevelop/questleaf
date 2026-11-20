/* Shop (paid with spirit stones) and streak shields. */
'use strict';

// ---------------------------------------------------------
// Streak shields
// ---------------------------------------------------------
function applyShields() {
  if (!state.shop.shields) return;
  const frozen = new Set(state.frozenDays);
  const gap = [];
  let day = addDays(new Date(), -1);
  while (gap.length <= SHIELD_MAX && !dayHasActivity(iso(day)) && !frozen.has(iso(day))) { gap.push(iso(day)); day = addDays(day, -1); }
  if (!gap.length || gap.length > state.shop.shields) return;
  if (!dayHasActivity(iso(day)) && !frozen.has(iso(day))) return; // there was no streak to save
  state.frozenDays.push(...gap);
  state.shop.shields -= gap.length;
  save();
  toast(tHtml('shop.shieldSavedHtml', { count: gap.length }), 'achieve', { icon: ico('ui-shield', '🛡'), html: true, duration: 5000 });
}
let shieldsCheckedOn = '';
/** Called every minute: on a new day the shields are checked again and the menu redrawn. */
function applyShieldsOnNewDay() {
  if (todayISO() === shieldsCheckedOn) return;
  shieldsCheckedOn = todayISO();
  applyShields();
  renderNav();
}

// ---------------------------------------------------------
// Rewards shop
// ---------------------------------------------------------
function shopBodyHTML() {
  const stoneCount = stones(), shop = state.shop;
  const card = (inner, cls = '') => `<div class="shop-card${cls}">${inner}</div>`;
  const buyButton = (attr, cost, extraDisabled) =>
    `<button class="btn btn-small btn-primary" ${attr} aria-label="${esc(t('shop.buyFor', { count: cost }))}"${stoneCount < cost || extraDisabled ? ' disabled' : ''}>${ico('ui-stones', '💎')} ${cost}</button>`;
  const edit = esc(t('common.edit')), remove = esc(t('common.delete')), newReward = esc(t('shop.newReward'));
  return `
    <div class="shop-head" title="${esc(t('shop.stonesTip', { rate: STONE_RATE }))}">${ico('ui-stones', '💎')}<b>${formatNumber(stoneCount)}</b><span>${t('shop.stones')}</span></div>
    <div class="shop-grid">
      ${card(`<span class="sc-ico">${ico('ui-shield', '🛡')}</span><b>${t('shop.shield.name')}</b>
        <small>${t('shop.shield.description', { count: shop.shields, max: SHIELD_MAX })}</small>
        ${buyButton('data-buy-shield', SHIELD_COST, shop.shields >= SHIELD_MAX)}`, ' special')}
      ${shop.rewards.map(reward => card(`
        <span class="sc-ico">${iconHTML(reward.icon)}</span><b>${esc(reward.name)}</b>
        <span class="sc-tools"><button class="icon-mini" data-redit="${esc(reward.id)}" title="${edit}" aria-label="${edit}">${UI_ICON.edit}</button><button class="icon-mini" data-rdel="${esc(reward.id)}" title="${remove}" aria-label="${remove}">${UI_ICON.del}</button></span>
        ${buyButton(`data-buy="${esc(reward.id)}"`, reward.cost)}`)).join('')}
      ${card(`<span class="sc-ico pet-sc">${petHTML(48)}</span><b>${esc(t('shop.petAccessories', { name: state.pet.name }))}</b>
        <small>${t('shop.petAccessoriesDescription')}</small>
        <button class="btn btn-small" data-shop-pet>${t('shop.view')}</button>`, ' special')}
      <button class="shop-card add" data-rnew title="${newReward}" aria-label="${newReward}">+</button>
    </div>
    ${shop.history.length ? `<details class="shop-history"><summary>${t('shop.history')}</summary><ul>
      ${shop.history.slice(-15).reverse().map(h => `<li><span>${esc(h.name)}</span><small>${formatShortDate(parseISO(h.date))} · ${h.cost}</small></li>`).join('')}
    </ul></details>` : ''}`;
}

function openShop() {
  openModal({
    title: t('shop.title'), wide: true,
    body: '<div id="shopBody"></div>',
    onMount: modal => {
      const body = $('#shopBody', modal);
      const refresh = () => { body.innerHTML = shopBodyHTML(); renderHUD(); };
      refresh();
      body.addEventListener('click', e => {
        const target = e.target, shop = state.shop;
        const pay = (name, cost, source) => {
          shop.spent += cost;
          shop.history.push({ name, cost, date: todayISO() });
          sfx('coin');
          floatText(`-${cost}`, source.getBoundingClientRect(), true);
          save(); refresh();
        };
        const shieldButton = target.closest('[data-buy-shield]');
        if (shieldButton) {
          if (stones() < SHIELD_COST || shop.shields >= SHIELD_MAX) return;
          shop.shields++;
          pay(t('shop.shield.name'), SHIELD_COST, shieldButton);
          toast(t('shop.shieldReady'), 'info', { icon: ico('ui-shield', '🛡') });
          return;
        }
        const buyButton = target.closest('[data-buy]');
        if (buyButton) {
          const reward = shop.rewards.find(x => x.id === buyButton.dataset.buy);
          if (!reward || stones() < reward.cost) return;
          pay(reward.name, reward.cost, buyButton);
          confetti(20);
          toast(tHtml('shop.redeemedHtml', { name: reward.name }), 'achieve', { icon: iconHTML(reward.icon), html: true });
          return;
        }
        if (target.closest('[data-rnew]')) { openRewardModal(null); return; }
        if (target.closest('[data-shop-pet]')) { closeModal(); openPetModal(); return; }
        const editButton = target.closest('[data-redit]');
        if (editButton) { openRewardModal(shop.rewards.find(x => x.id === editButton.dataset.redit)); return; }
        const deleteButton = target.closest('[data-rdel]');
        if (deleteButton) {
          shop.rewards = shop.rewards.filter(x => x.id !== deleteButton.dataset.rdel);
          sfx('remove'); save(); refresh();
        }
      });
    },
  });
}

function openRewardModal(existing) {
  const draft = existing ? { ...existing } : { name: '', cost: 50, icon: 'cat-games' };
  openModal({
    title: existing ? t('shop.reward.editTitle') : t('shop.reward.newTitle'),
    body: `<form data-rform autocomplete="off">
      <div class="row2">
        <label class="field"><span>${t('shop.reward.name')}</span><input type="text" name="name" maxlength="60" value="${esc(draft.name)}" placeholder="${esc(t('shop.reward.placeholder'))}"></label>
        <label class="field"><span>${t('shop.reward.cost')}</span><input type="number" name="cost" min="1" max="99999" value="${draft.cost}"></label>
      </div>
      <div class="field"><span>${t('common.iconLabel')}</span><div class="icon-grid">${categoryPickerHTML(draft.icon)}</div></div>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-back>${t('common.back')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-rform]', modal);
      const syncIcons = () => $$('[data-icon]', modal).forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
      $$('[data-icon]', modal).forEach(b => { b.onclick = () => { draft.icon = b.dataset.icon; syncIcons(); }; });
      syncIcons();
      $('[data-back]', modal).onclick = openShop;
      const submit = () => {
        const name = form.name.value.trim().slice(0, 60), cost = Math.max(1, parseInt(form.cost.value, 10) || 0);
        if (!name) { sfx('error'); toast(t('shop.reward.nameRequired'), 'warn'); return; }
        if (existing) Object.assign(existing, { name, cost, icon: draft.icon });
        else state.shop.rewards.push({ id: uid(), name, cost, icon: draft.icon });
        sfx('place'); save(); openShop();
      };
      $('[data-ok]', modal).onclick = submit;
      form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    },
  });
}

function shopBoot() {
  shieldsCheckedOn = todayISO();
  applyShields();
  $('#shopBtn').addEventListener('click', openShop);
}
