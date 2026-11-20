/* Spirit beast: a jade dragon that grows with your consistency and sleeps if you leave it. */
'use strict';

const PET_STAGES = [{ key: 'egg', days: 0 }, { key: 'hatchling', days: 3 }, { key: 'young', days: 21 }, { key: 'spiritDragon', days: 60 }];
// `id` is saved (pet.owned, pet.acc) and names the image files; `key` is the dictionary key
const PET_ACCESSORIES = [
  { id: 'flower', key: 'flower', slot: 'head', cost: 25 }, { id: 'scarf', key: 'scarf', slot: 'neck', cost: 40 },
  { id: 'glasses', key: 'glasses', slot: 'face', cost: 45 }, { id: 'hat', key: 'wizardHat', slot: 'head', cost: 60 },
  { id: 'crown', key: 'crown', slot: 'head', cost: 150 },
];
// Moods: each one names a CSS class (pet-asleep…) and a dictionary entry (pet.moods.*, pet.lines.*)
const PET = { blinkTimer: 0, bondDay: '', bond: 0, dirty: false };
const petStageName = stage => t(`pet.stages.${PET_STAGES[stage].key}`);
const accessoryName = accessory => t(`pet.accessories.${accessory.key}`);

function petBond() {
  const today = todayISO();
  if (PET.bondDay === today && !PET.dirty) return PET.bond;
  const days = new Set();
  Object.keys(state.habits.log).forEach(d => { if (state.habits.log[d].length) days.add(d); });
  Object.entries(state.schedule.log).forEach(([d, log]) => { if (Object.keys(log).some(k => !k.startsWith('__'))) days.add(d); });
  Object.keys(state.workout.log).forEach(d => days.add(d));
  Object.keys(state.journal).forEach(d => days.add(d));
  Object.keys(state.focusLog).forEach(d => days.add(d));
  PET.bondDay = today; PET.dirty = false;
  return (PET.bond = days.size);
}
const petStage = (bond = petBond()) => PET_STAGES.reduce((stage, step, i) => (bond >= step.days ? i : stage), 0);
function petMood() {
  const now = new Date();
  if (dayHasActivity(iso(now))) return 'happy';
  if (dayHasActivity(iso(addDays(now, -1)))) return 'calm';
  return 'asleep';
}
function petHTML(size = 72, extra = '') {
  const stage = petStage(), mood = petMood(), pet = state.pet;
  const accessories = stage ? Object.values(pet.acc).filter(Boolean).map(id => `<img class="pet-acc" src="assets/pet/acc-${id}-${stage}.png" alt="">`).join('') : '';
  const src = `assets/pet/pet-${stage}${stage && mood === 'asleep' ? 'b' : ''}.png`;
  return `<span class="pet st-${stage} pet-${mood}${extra}" style="--ps:${size}px" data-stage="${stage}">
    <img class="pet-body" src="${src}" alt="${esc(pet.name)}">${accessories}<i class="pet-heart"></i></span>`;
}
// Blinking: one timer for every visible beast
function petBlink() {
  clearTimeout(PET.blinkTimer);
  PET.blinkTimer = setTimeout(petBlink, 3200 + Math.random() * 3800);
  if (FX.idle || document.hidden || !state.settings.anim) return;
  $$('.pet:not(.st-0):not(.pet-asleep) .pet-body').forEach(img => {
    const stage = img.closest('.pet').dataset.stage;
    img.src = `assets/pet/pet-${stage}b.png`;
    setTimeout(() => { img.src = `assets/pet/pet-${stage}.png`; }, 170);
  });
}
function petPoke(node, say = true) {
  const pet = node && node.closest('.pet');
  if (!pet) return;
  pet.classList.remove('hop'); void pet.offsetWidth; pet.classList.add('hop');
  if (say) {
    const bubble = el('span', 'pet-say', esc(pickOf(tRaw(`pet.lines.${petMood()}`))));
    pet.append(bubble);
    setTimeout(() => bubble.remove(), 2200);
  }
  sfx('select');
}
// Whenever you earn something, your beast jumps for joy
appOn('xp', ({ amount }) => {
  if (amount > 0) $$('.pet').forEach(p => { p.classList.remove('hop'); void p.offsetWidth; p.classList.add('hop'); });
});
function checkPetGrowth() {
  PET.dirty = true;
  const stage = petStage();
  if (state.pet.seen == null) { state.pet.seen = stage; return; }
  if (stage > state.pet.seen) {
    state.pet.seen = stage;
    save();
    setTimeout(() => {
      sfx('levelup'); confetti(50);
      toast(tHtml('pet.grewHtml', { name: state.pet.name, stage: petStageName(stage) }), 'achieve', { icon: `<img class="ico-img" src="assets/pet/pet-${stage}.png" alt="">`, html: true, duration: 5000 });
    }, 500);
  }
}

function openPetModal() {
  const pet = state.pet;
  const draw = () => {
    const stage = petStage(), bond = petBond(), next = PET_STAGES[stage + 1];
    return `<div class="pet-room">
      <div class="pet-stage-box">${petHTML(168)}</div>
      <div class="pet-info">
        <label class="field"><span>${t('common.nameLabel')}</span><input type="text" data-petname maxlength="16" value="${esc(pet.name)}"></label>
        <p class="pet-line"><b>${petStageName(stage)}</b> · ${t(`pet.moods.${petMood()}`)}</p>
        ${next ? `<div class="pbar" title="${esc(t('pet.daysWithYou'))}"><div style="width:${Math.min(100, (bond - PET_STAGES[stage].days) / (next.days - PET_STAGES[stage].days) * 100).toFixed(1)}%"></div><span>${t('pet.daysProgress', { count: bond, next: next.days })}</span></div>`
    : `<p class="muted small">${t('pet.daysTogether', { count: bond })}</p>`}
        <small class="muted">${t('pet.growHint')}</small>
      </div>
    </div>
    <h3 class="pet-sub">${t('pet.accessoriesTitle')} <small class="muted">${formatNumber(stones())} ${ico('ui-stones', '💎')}</small></h3>
    ${stage ? '' : `<p class="muted small pet-egg-note">${t('pet.eggNote')}</p>`}
    <div class="pet-accs">${PET_ACCESSORIES.map(accessory => {
    const owned = pet.owned.includes(accessory.id), worn = pet.acc[accessory.slot] === accessory.id, shown = Math.max(1, stage);
    const tip = owned ? (worn ? t('pet.takeOff') : t('pet.putOn')) : t('pet.buy', { count: accessory.cost });
    return `<button class="pet-acc-card${worn ? ' on' : ''}" data-pacc="${accessory.id}" title="${esc(tip)}">
          <span class="pac-img"><img src="assets/pet/pet-${shown}.png" alt=""><img src="assets/pet/acc-${accessory.id}-${shown}.png" alt=""></span>
          <small>${accessoryName(accessory)}</small>${owned ? (worn ? '<b>✓</b>' : '') : `<b>${ico('ui-stones', '💎')} ${accessory.cost}</b>`}</button>`;
  }).join('')}</div>`;
  };
  openModal({
    title: t('pet.title'), wide: true,
    body: '<div data-petbox></div>',
    onMount: modal => {
      const box = $('[data-petbox]', modal);
      const refresh = () => { box.innerHTML = draw(); };
      refresh();
      box.addEventListener('click', e => {
        if (e.target.closest('.pet-stage-box .pet')) { petPoke(e.target); return; }
        const card = e.target.closest('[data-pacc]');
        if (!card) return;
        const accessory = PET_ACCESSORIES.find(a => a.id === card.dataset.pacc);
        if (!pet.owned.includes(accessory.id)) {
          if (stones() < accessory.cost) { sfx('error'); toast(t('pet.missingStones', { count: accessory.cost - stones() }), 'warn', { icon: ico('ui-stones', '💎') }); return; }
          state.shop.spent += accessory.cost;
          state.shop.history.push({ name: t('pet.accessoryPurchase', { name: accessoryName(accessory) }), cost: accessory.cost, date: todayISO() });
          pet.owned.push(accessory.id);
          floatText(`-${accessory.cost}`, card.getBoundingClientRect(), true);
          sfx('coin');
        }
        pet.acc[accessory.slot] = pet.acc[accessory.slot] === accessory.id ? '' : accessory.id;
        sfx('place'); save(); refresh(); renderHUD(); if (currentView === 'home') renderHome();
        const big = $('.pet-stage-box .pet', box); if (big) petPoke(big, false);
      });
      box.addEventListener('change', e => {
        if (!e.target.matches('[data-petname]')) return;
        pet.name = e.target.value.trim().slice(0, 16) || 'Jade';
        save(); if (currentView === 'home') renderHome();
      });
    },
  });
}

// After every change: did your beast grow?
appOn('render', () => { if (state.pet) checkPetGrowth(); });
function petBoot() {
  petBlink();
  checkPetGrowth();
}
