/* Workflow section: one block per app with its usage guide and jobs, project threads and whether a paid app pays
   off. */
'use strict';

let draggedJobId = null;
let workflowThread = '';     // the thread that lights its apps ('' = none); not saved
let workflowAddingTo = '';   // the app whose "+" form is open
let workflowAddProject = ''; // the project chosen in that form
let threadIndex = new Map(); // thread id → thread, filled on each drawing
const openGuides = new Set(); // usage guides and finished jobs unfolded while the app is open ("g:<id>", "d:<id>")
const toolById = id => state.workflow.tools.find(x => x.id === id);

/** The subscription item a tool is linked to (from any "subscriptions" list), or null. */
function linkedSubscription(tool) {
  if (!tool.subscriptionId) return null;
  for (const list of state.lists) {
    if (list.kind !== 'subscriptions') continue;
    const item = list.items.find(i => i.id === tool.subscriptionId);
    if (item) return { list, item };
  }
  return null;
}

// ---------------------------------------------------------
// Model: jobs, threads and whether an app pays off
// ---------------------------------------------------------
const WORKFLOW_WINDOW_DAYS = 30;
const SUBJECT_THREAD = 's:'; // a University subject works as a thread by itself: "s:<activity id>"
/** The University deliverable a job stands for, or null (an own job, or a deliverable that was deleted). */
const jobEvent = job => (job.eventId ? state.university.events.find(e => e.id === job.eventId) || null : null);
/** A job whose deliverable was deleted stays in the save but is not shown. */
const isJobShown = job => !job.eventId || !!jobEvent(job);
const jobName = job => { const event = jobEvent(job); return event ? event.name : job.name; };
const isJobDone = job => { const event = jobEvent(job); return event ? !!event.done : !!job.done; };
const jobDoneAt = job => { const event = jobEvent(job); return (event ? event.done && event.doneAt : job.done && job.doneAt) || ''; };
function jobThreadIds(job) {
  const event = jobEvent(job), ids = [];
  if (job.projectId && state.workflow.projects.some(p => p.id === job.projectId)) ids.push(job.projectId);
  if (event && event.act && activityById(event.act)) ids.push(SUBJECT_THREAD + event.act);
  return ids;
}
const toolJobs = toolId => state.workflow.jobs.filter(job => job.toolId === toolId && isJobShown(job));
const daysAgoISO = days => iso(addDays(new Date(), -days));
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
function jobsFinishedSince(toolId, fromISO, toISO = todayISO()) {
  return toolJobs(toolId).filter(job => { const day = jobDoneAt(job); return day && day >= fromISO && day <= toISO; }).length;
}
/** Does the app pay off? Jobs finished in the last 30 days and the ones still open. */
function toolYield(tool) {
  return { done: jobsFinishedSince(tool.id, daysAgoISO(WORKFLOW_WINDOW_DAYS)), active: toolJobs(tool.id).filter(job => !isJobDone(job)).length };
}
/** Days since something happened with the app (a finished job, or its creation); null when nobody knows. */
function toolIdleDays(tool) {
  const last = [tool.created, ...toolJobs(tool.id).map(jobDoneAt)].filter(Boolean).sort().pop();
  return last ? Math.max(0, -daysUntil(last)) : null;
}
/** Nothing open and nothing finished or created in the last 30 days (a new app is not warned about). */
function isToolIdle(tool) {
  const { done, active } = toolYield(tool), days = toolIdleDays(tool);
  return !done && !active && (days === null || days >= WORKFLOW_WINDOW_DAYS);
}
/** The linked subscription item when it has a price and is still paid, or null. */
function toolPrice(tool) {
  const linked = linkedSubscription(tool);
  return linked && linked.item.price != null && !linked.item.done ? linked.item : null;
}
const isToolPaid = tool => { const linked = linkedSubscription(tool); return !!linked && !linked.item.done; };
const paidTools = () => state.workflow.tools.filter(isToolPaid);
/** Paid apps that finished no job since a day (the Sunday reminder looks 30 days back). */
const idlePaidTools = fromISO => paidTools().filter(tool => !jobsFinishedSince(tool.id, fromISO));
/** Paid apps charged within two days that finished nothing in the period being paid for (since the charge before). */
function idleBeforeCharge() {
  return paidTools().map(tool => { const item = linkedSubscription(tool).item; return { tool, item, charge: nextCharge(item) }; })
    .filter(({ tool, item, charge }) => charge && daysUntil(charge) <= 2 && !jobsFinishedSince(tool.id, previousCharge(item, charge)));
}
/** What each job finished this month cost ('' when the app is free or nothing was finished). */
function toolCostPerJob(tool) {
  const price = toolPrice(tool), count = price ? jobsFinishedSince(tool.id, monthStart()) : 0;
  return count ? formatMoney(monthlyCost(price) / count, price.currency) : '';
}
/** Project threads, then the subjects of the deliverables some app works on. */
function workflowThreads() {
  const subjectIds = new Set();
  state.workflow.jobs.forEach(job => { const event = toolById(job.toolId) && jobEvent(job); if (event && event.act) subjectIds.add(event.act); });
  const subjectThreads = [...subjectIds].map(activityById).filter(Boolean)
    .map(activity => ({ id: SUBJECT_THREAD + activity.id, name: activity.name, color: activity.color, subject: true }));
  return [...state.workflow.projects.map(project => ({ ...project, subject: false })), ...subjectThreads];
}

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------
/** A deliverable is checked in University (which gives its XP); an own job gives the XP of a task. */
function toggleJobDone(job, sourceEl) {
  const event = jobEvent(job);
  if (event) { toggleDelivered(event, sourceEl); return; }
  job.done = !job.done; job.doneAt = job.done ? todayISO() : '';
  sfx(job.done ? 'coin' : 'remove');
  xpFx(job.done ? XP.task : -XP.task, sourceEl, job.name);
  commit();
}
function addJob(toolId, name, projectId = '') {
  state.workflow.jobs.push({ id: uid(), name, toolId, done: false, doneAt: '', projectId, eventId: '' });
  sfx('place'); save(); renderWorkflow();
}
/** Links a deliverable to an app (once per app; several apps may work on the same one). */
function linkDeliverable(toolId, eventId, projectId = '') {
  if (state.workflow.jobs.some(job => job.toolId === toolId && job.eventId === eventId)) return;
  state.workflow.jobs.push({ id: uid(), name: '', toolId, done: false, doneAt: '', projectId, eventId });
  sfx('place'); save(); renderWorkflow();
}

// ---------------------------------------------------------
// Drawing
// ---------------------------------------------------------
/** "today", "tomorrow" or "18 nov". */
const shortWhen = dateISO => { const days = daysUntil(dateISO); return Math.abs(days) <= 1 ? formatRelativeDays(days) : formatShortDate(parseISO(dateISO)); };
function toolPriceText(tool) {
  const price = toolPrice(tool);
  return price ? t('workflow.pricePer', { amount: formatMoney(price.price, price.currency), cycle: t(`lists.cycleShort.${price.cycle}`) }) : '';
}
const dotHTML = thread => `<i class="wf-dot" style="--c:${esc(thread.color)}" title="${esc(thread.name)}"></i>`;

function guideHTML(tool) {
  if (!tool.guide.length) return '';
  return `<details class="wf-guide" data-unfold="g:${esc(tool.id)}"${openGuides.has(`g:${tool.id}`) ? ' open' : ''}>
    <summary title="${esc(t('workflow.guide'))}"><span class="wf-guide-label">${t('workflow.guide')}</span><span class="wf-guide-sum">${tool.guide.map(esc).join(' · ')}</span></summary>
    <ul class="wf-guide-list">${tool.guide.map(point => `<li>${esc(point)}</li>`).join('')}</ul>
  </details>`;
}

function jobRowHTML(job) {
  const event = jobEvent(job), done = isJobDone(job);
  const late = event && event.date && !done && daysUntil(event.date) < 0;
  const dots = jobThreadIds(job).map(id => threadIndex.get(id)).filter(Boolean).map(dotHTML).join('');
  const removeLabel = t(event ? 'workflow.unlink' : 'common.delete');
  return `<li class="wf-job${done ? ' done' : ''}" draggable="true" data-job="${esc(job.id)}">
    <button class="qcheck" data-jdone="${esc(job.id)}" title="+${event ? deliverableXP(event) : XP.task} XP" aria-label="${esc(t(done ? 'common.uncheck' : 'common.complete'))}">${done ? '✓' : ''}</button>
    ${event ? `<span class="wf-kind" title="${esc(t(`university.kinds.${event.kind}`))}">${ico(DELIVERABLE_ICONS[event.kind], '📌')}</span>` : ''}
    ${isJobEditable(job) ? `<button type="button" class="wf-job-name" data-jedit="${esc(job.id)}" title="${esc(t('workflow.editJob'))}">${esc(jobName(job))}</button>`
      : `<span class="wf-job-name">${esc(jobName(job))}</span>`}
    ${event && event.date && !done ? `<small class="wf-when${late ? ' late' : ''}">${esc(shortWhen(event.date))}</small>` : ''}
    ${dots ? `<span class="wf-dots">${dots}</span>` : ''}
    <button class="icon-mini" data-jdel="${esc(job.id)}" title="${esc(removeLabel)}" aria-label="${esc(removeLabel)}">✕</button>
  </li>`;
}

/** An own job can be renamed; any job can change project when there are projects. */
const isJobEditable = job => !job.eventId || state.workflow.projects.length > 0;

/** Name (own jobs; a deliverable keeps the University name) and project of a job that already exists. */
function openJobModal(job) {
  const event = jobEvent(job), projects = state.workflow.projects;
  let projectId = projects.some(p => p.id === job.projectId) ? job.projectId : '';
  openModal({
    title: t('workflow.editJobTitle'),
    body: `<form data-jform autocomplete="off">
      ${event ? '' : `<label class="field"><span>${t('common.nameLabel')}</span><input type="text" name="name" maxlength="80" value="${esc(job.name)}"></label>`}
      ${projects.length ? `<div class="field"><span>${t('workflow.projectLabel')}</span><div class="chips wf-add-projects" role="group" aria-label="${esc(t('workflow.project'))}">${projects.map(p =>
        `<button type="button" class="chip wf-thread" data-mproject="${esc(p.id)}" style="--c:${esc(p.color)}"><i class="wf-dot"></i>${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t('common.save')}</button>`,
    onMount: modal => {
      const form = $('[data-jform]', modal);
      const sync = () => $$('[data-mproject]', modal).forEach(chip => {
        chip.classList.toggle('on', chip.dataset.mproject === projectId);
        chip.setAttribute('aria-pressed', chip.dataset.mproject === projectId);
      });
      $$('[data-mproject]', modal).forEach(chip => { chip.onclick = () => { projectId = projectId === chip.dataset.mproject ? '' : chip.dataset.mproject; sfx('select'); sync(); }; });
      sync();
      const accept = () => {
        const name = form.name ? form.name.value.trim().slice(0, 80) : '';
        if (form.name && !name) { sfx('error'); toast(t('workflow.nameRequired'), 'warn'); form.name.focus(); return; }
        if (form.name) job.name = name;
        job.projectId = projectId;
        closeModal(); sfx('place'); save(); renderWorkflow();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
      setTimeout(() => (form.name || $('[data-mproject]', modal)).focus(), 50);
    },
  });
}

function yieldHTML(tool) {
  const { done, active } = toolYield(tool), total = done + active;
  if (!total) return '';
  const squares = Math.min(total, 10), filled = Math.round(done / total * squares), cost = toolCostPerJob(tool);
  return `<div class="wf-yield" title="${esc(t('workflow.yieldTip', { done, active }))}">
    <span class="wf-bar" aria-hidden="true">${'<i class="on"></i>'.repeat(filled)}${'<i></i>'.repeat(squares - filled)}</span>
    <b>✓ ${done}/${total}</b>${cost ? `<small>${esc(t('workflow.perJob', { amount: cost }))}</small>` : ''}
  </div>`;
}

function idleHTML(tool, paid) {
  const days = toolIdleDays(tool);
  return `<p class="wf-idle${paid ? ' paid' : ''}" title="${esc(days === null ? t('workflow.noWork') : t('workflow.idleTip', { days }))}">${UI_ICON.warn}<span>${days === null ? t('workflow.noWork') : t('workflow.idleDays', { days })}</span></p>`;
}

/** The pending deliverables that match what is typed (four at most), the closest first. */
function pickListHTML(tool, query) {
  const linked = new Set(state.workflow.jobs.filter(job => job.toolId === tool.id && job.eventId).map(job => job.eventId));
  return pendingDeliverables().filter(e => !linked.has(e.id) && matchesSearch(e.name, query))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 4)
    .map(e => {
      const subject = e.act && activityById(e.act);
      const meta = [subject ? esc(subject.name) : '', e.date ? esc(shortWhen(e.date)) : ''].filter(Boolean).join(' · ');
      return `<li><button type="button" class="wf-pick-item" data-jlink="${esc(e.id)}" style="--c:${subject ? esc(subject.color) : 'var(--peri)'}" aria-label="${esc(t('workflow.linkNamed', { name: e.name }))}">
        ${ico(DELIVERABLE_ICONS[e.kind], '📌')}<span><b>${esc(e.name)}</b>${meta ? `<small>${meta}</small>` : ''}</span></button></li>`;
    }).join('');
}

function jobFormHTML(tool) {
  const projects = state.workflow.projects;
  return `<form class="wf-add" data-jadd="${esc(tool.id)}" autocomplete="off">
    <div class="wf-add-row">
      <input type="text" name="name" maxlength="80" placeholder="${esc(t('workflow.addJob'))}" aria-label="${esc(t('workflow.addJob'))}">
      <button class="btn btn-small" type="submit" title="${esc(t('common.add'))}" aria-label="${esc(t('common.add'))}">+</button>
    </div>
    ${projects.length ? `<div class="chips wf-add-projects" role="group" aria-label="${esc(t('workflow.project'))}">${projects.map(p =>
      `<button type="button" class="chip wf-thread${workflowAddProject === p.id ? ' on' : ''}" data-jproject="${esc(p.id)}" aria-pressed="${workflowAddProject === p.id}" style="--c:${esc(p.color)}"><i class="wf-dot"></i>${esc(p.name)}</button>`).join('')}</div>` : ''}
    <ul class="wf-pick" data-jpick>${pickListHTML(tool, '')}</ul>
  </form>`;
}

function toolBlockHTML(tool) {
  const jobs = toolJobs(tool.id), open = jobs.filter(job => !isJobDone(job));
  const done = jobs.filter(isJobDone).sort((a, b) => jobDoneAt(b).localeCompare(jobDoneAt(a)));
  const idle = isToolIdle(tool), priceText = toolPriceText(tool);
  const threadIds = [...new Set(jobs.flatMap(jobThreadIds))], threads = threadIds.map(id => threadIndex.get(id)).filter(Boolean);
  const light = workflowThread ? (threadIds.includes(workflowThread) ? ' lit' : ' dim') : '';
  return `<section class="wf-block${idle ? ' idle' : ''}${light}" data-tool="${esc(tool.id)}" style="--c:${esc(tool.color)}" aria-label="${esc(tool.name)}">
    <header class="wf-head">
      <span class="item-icon">${iconHTML(tool.icon)}</span>
      <span class="wf-title"><b>${esc(tool.name)}</b>${priceText ? `<small class="wf-price">${esc(priceText)}</small>` : ''}</span>
      <button class="icon-mini" data-tedit="${esc(tool.id)}" title="${esc(t('common.edit'))}" aria-label="${esc(t('common.editNamed', { name: tool.name }))}">${UI_ICON.edit}</button>
    </header>
    ${guideHTML(tool)}
    ${threads.length ? `<div class="wf-tags">${threads.map(x => `<span class="wf-tag">${dotHTML(x)}${esc(x.name)}</span>`).join('')}</div>` : ''}
    ${idle ? idleHTML(tool, isToolPaid(tool)) : ''}
    ${open.length ? `<ul class="wf-jobs" data-paged="wf:${esc(tool.id)}" data-pager="inside" data-paged-reserve="210">${open.map(jobRowHTML).join('')}</ul>` : ''}
    ${workflowAddingTo === tool.id ? `${yieldHTML(tool)}${jobFormHTML(tool)}`
      : `<div class="wf-foot">${yieldHTML(tool)}<button class="btn btn-small wf-plus" data-jopen="${esc(tool.id)}" title="${esc(t('workflow.addJob'))}" aria-label="${esc(t('workflow.addJobTo', { name: tool.name }))}">+</button></div>`}
    ${done.length ? `<details class="wf-done" data-unfold="d:${esc(tool.id)}"${openGuides.has(`d:${tool.id}`) ? ' open' : ''}>
      <summary title="${esc(t('workflow.doneJobs', { count: done.length }))}">✓ ${done.length}</summary><ul class="wf-jobs">${done.map(jobRowHTML).join('')}</ul></details>` : ''}
  </section>`;
}

function threadsBarHTML(threads) {
  const active = threadIndex.get(workflowThread);
  return `<div class="wf-threads" role="group" aria-label="${esc(t('workflow.threads'))}">
    ${threads.map(x => `<button type="button" class="chip wf-thread${x.id === workflowThread ? ' on' : ''}" data-thread="${esc(x.id)}" aria-pressed="${x.id === workflowThread}" style="--c:${esc(x.color)}" title="${esc(t('workflow.threadTip', { name: x.name }))}"><i class="wf-dot"></i>${esc(x.name)}</button>`).join('')}
    ${active && !active.subject ? `<button type="button" class="icon-mini" data-pedit="${esc(active.id)}" title="${esc(t('workflow.editProject'))}" aria-label="${esc(t('common.editNamed', { name: active.name }))}">${UI_ICON.edit}</button>` : ''}
    <button type="button" class="chip chip-add" data-pnew title="${esc(t('workflow.newProject'))}" aria-label="${esc(t('workflow.newProject'))}">+</button>
  </div>`;
}

/** Order of the blocks: apps with open jobs, then paid apps without them, then the rest (each group as created). */
const toolOrder = tool => (toolYield(tool).active ? 0 : isToolPaid(tool) ? 1 : 2);

function renderWorkflow() {
  const tools = state.workflow.tools, threads = workflowThreads();
  threadIndex = new Map(threads.map(x => [x.id, x]));
  if (workflowThread && !threadIndex.has(workflowThread)) workflowThread = '';
  if (workflowAddingTo && !toolById(workflowAddingTo)) workflowAddingTo = '';
  const sorted = tools.map((tool, i) => ({ tool, i, order: toolOrder(tool) })).sort((a, b) => a.order - b.order || a.i - b.i).map(x => x.tool);
  $('#view-workflow').innerHTML = `
    ${pageHead('workflow', t('workflow.subtitle'),
      `<button class="btn btn-primary btn-add" data-tnew title="${esc(t('workflow.newTool'))}" aria-label="${esc(t('workflow.newTool'))}">+</button>`, tools.length || '')}
    ${tools.length
      ? `${threadsBarHTML(threads)}<div class="wf-board" data-paged="workflow">${sorted.map(toolBlockHTML).join('')}</div>`
      : `<button class="wf-empty" data-tnew title="${esc(t('workflow.newTool'))}" aria-label="${esc(t('workflow.newTool'))}">${ico('sec-workflow', '🔀')}<span aria-hidden="true">+</span></button>`}`;
}

/** Chronicle of a week: the jobs each app finished, the busiest first. */
function workflowWeekHTML(mondayISO) {
  const tools = state.workflow.tools;
  if (!tools.length) return '';
  const sunday = iso(addDays(parseISO(mondayISO), 6));
  const rows = tools.map(tool => ({ tool, done: jobsFinishedSince(tool.id, mondayISO, sunday) })).sort((a, b) => b.done - a.done);
  return `<div class="chips chron-top wf-week">${rows.map(({ tool, done }) =>
    `<span class="chip${done ? '' : ' wf-unused'}" style="--c:${esc(tool.color)}">${iconHTML(tool.icon)} ${esc(tool.name)} · ${done ? t('workflow.jobsDone', { count: done }) : t('workflow.noJobsDone')}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------
// The "+" form of a block
// ---------------------------------------------------------
const jobFormInput = () => $(`#view-workflow [data-jadd="${workflowAddingTo}"] input[name=name]`);
/** A block that grows (its "+" form, a new job) may move to another page of the board: turn to the page it is on. */
function revealOpenBlock() {
  if (!workflowAddingTo) return;
  const block = () => $(`#view-workflow [data-tool="${workflowAddingTo}"]`);
  paginateAll();
  for (let page = 0; page < 30 && block() && block().hidden; page++) { PAGE_OF.workflow = page; paginateAll(); }
}
function refocusJobForm() { revealOpenBlock(); const input = jobFormInput(); if (input) input.focus(); }
/** Opens the form of an app (or closes it when it was open). An active project thread comes chosen. */
function toggleJobForm(toolId) {
  const opening = workflowAddingTo !== toolId, active = threadIndex.get(workflowThread);
  workflowAddingTo = opening ? toolId : '';
  workflowAddProject = opening && active && !active.subject ? active.id : '';
  sfx('select');
  renderWorkflow();
  if (opening) refocusJobForm();
  else { const plus = $(`#view-workflow [data-jopen="${toolId}"]`); if (plus) plus.focus(); }
}
function syncProjectChips() {
  $$('#view-workflow [data-jproject]').forEach(chip => {
    const on = chip.dataset.jproject === workflowAddProject;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', on);
  });
}

// ---------------------------------------------------------
// Windows: project (name and colour) and app
// ---------------------------------------------------------
function openProjectModal(existing) {
  if (!existing && state.workflow.projects.length >= 30) { sfx('error'); toast(t('workflow.projectsFull'), 'warn'); return; }
  const draft = { color: existing ? existing.color : pickOf(PASTELS) };
  openModal({
    title: t(existing ? 'workflow.editProjectTitle' : 'workflow.newProjectTitle'),
    body: `<form data-pform autocomplete="off">
      <label class="field"><span>${t('common.nameLabel')}</span><input type="text" name="name" maxlength="30" value="${esc(existing ? existing.name : '')}"></label>
      <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
    </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-delete>${UI_ICON.del} ${t('common.deleteUpper')}</button>` : ''}<span class="spacer"></span>
      <button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t(existing ? 'common.save' : 'common.create')}</button>`,
    onMount: modal => {
      const form = $('[data-pform]', modal);
      const sync = () => $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === draft.color));
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { draft.color = b.dataset.color; sync(); }; });
      sync();
      const accept = () => {
        const name = form.name.value.trim().slice(0, 30);
        if (!name) { sfx('error'); toast(t('workflow.nameRequired'), 'warn'); form.name.focus(); return; }
        if (existing) Object.assign(existing, { name, color: draft.color });
        else state.workflow.projects.push({ id: uid(), name, color: draft.color });
        closeModal(); sfx('place'); save(); renderWorkflow();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
      const deleteButton = $('[data-delete]', modal);
      // Its jobs keep the id and lose the thread; UNDO brings it back with them
      if (deleteButton) deleteButton.onclick = () => { closeModal(); removeWithUndo(state.workflow, 'projects', existing, existing.name, () => { save(); renderWorkflow(); }); };
      setTimeout(() => form.name.focus(), 50);
    },
  });
}

/** "MCP, context\n• rules" → ['MCP', 'context', 'rules']: one point per line or per comma, bullets dropped. */
const parseGuide = text => [...new Set(String(text).split('\n').map(x => x.replace(/^\s*[•\-*]\s*/, '').trim().slice(0, 60)).filter(Boolean))].slice(0, 12);

/** Name, how it is used, icon and colour; the price (a link to a "Subscriptions and bills" item) waits in a closed fold. */
function openToolModal(existing) {
  const draft = existing ? { icon: existing.icon, color: existing.color } : { icon: 'cat-code', color: pickOf(PASTELS) };
  const subscriptionItems = state.lists.filter(l => l.kind === 'subscriptions').flatMap(list => list.items.map(item => ({ list, item })));
  const priceText = existing ? toolPriceText(existing) : '';
  openModal({
    title: t(existing ? 'workflow.editTool' : 'workflow.newToolTitle'),
    body: `<form data-tform autocomplete="off">
      <label class="field"><span>${t('common.nameLabel')}</span><input type="text" name="name" maxlength="40" value="${esc(existing ? existing.name : '')}" placeholder="${esc(t('workflow.namePlaceholder'))}"></label>
      <label class="field"><span>${t('workflow.guideLabel')}</span><textarea name="guide" rows="4" maxlength="800" placeholder="${esc(t('workflow.guidePlaceholder'))}">${esc(existing ? existing.guide.map(point => BULLET + point).join('\n') : '')}</textarea></label>
      <div class="field"><span>${t('common.iconLabel')}</span><div class="icon-grid">${categoryPickerHTML(draft.icon)}</div></div>
      <div class="field"><span>${t('common.colorLabel')}</span>${swatchesHTML()}</div>
      <details class="wf-price-fold">
        <summary>${t('workflow.price')}${priceText ? ` <small>${esc(priceText)}</small>` : ''}</summary>
        ${subscriptionItems.length ? `<label class="field"><span>${t('workflow.subscription')}</span><select name="subscription">
          <option value="">${t('workflow.noSubscription')}</option>
          ${subscriptionItems.map(({ list, item }) => `<option value="${esc(item.id)}"${existing && existing.subscriptionId === item.id ? ' selected' : ''}>${esc(item.text)}${item.price != null ? ` · ${formatMoney(item.price, item.currency)}` : ''} (${esc(list.name)})</option>`).join('')}
        </select></label>` : `<p class="set-hint">${t('workflow.noSubscriptionsYet')}</p>`}
      </details>
    </form>`,
    footer: `${existing ? `<button class="btn btn-danger" data-delete>${UI_ICON.del} ${t('common.deleteUpper')}</button>` : ''}<span class="spacer"></span>
      <button class="btn" data-close>${t('common.cancel')}</button><button class="btn btn-primary" data-ok>${t(existing ? 'common.save' : 'common.create')}</button>`,
    onMount: modal => {
      const form = $('[data-tform]', modal);
      const sync = () => {
        $$('[data-icon]', modal).forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
        $$('[data-color]', modal).forEach(b => b.classList.toggle('on', b.dataset.color === draft.color));
      };
      $$('[data-icon]', modal).forEach(b => { b.onclick = () => { draft.icon = b.dataset.icon; sync(); }; });
      $$('[data-color]', modal).forEach(b => { b.onclick = () => { draft.color = b.dataset.color; sync(); }; });
      sync();
      // The guide is written as in a note: "- " makes a bullet, Enter continues the list, Alt+V toggles it
      form.guide.addEventListener('keydown', e => bulletKeydown(form.guide, e));
      form.guide.addEventListener('input', e => bulletAutoformat(form.guide, e));
      const accept = () => {
        const name = form.name.value.trim().slice(0, 40);
        if (!name) { sfx('error'); toast(t('workflow.nameRequired'), 'warn'); form.name.focus(); return; }
        // roles, activityIds and created are left as they are
        const fields = { name, guide: parseGuide(form.guide.value), icon: draft.icon, color: draft.color,
          subscriptionId: form.subscription ? form.subscription.value : existing ? existing.subscriptionId : '' };
        if (existing) Object.assign(existing, fields);
        else state.workflow.tools.push({ id: uid(), ...fields, roles: [], activityIds: [], created: todayISO() });
        closeModal(); sfx('place'); commit();
      };
      $('[data-ok]', modal).onclick = accept;
      form.addEventListener('submit', e => { e.preventDefault(); accept(); });
      const deleteButton = $('[data-delete]', modal);
      if (deleteButton) deleteButton.onclick = () => { closeModal(); removeWithUndo(state.workflow, 'tools', existing, existing.name); }; // its jobs stay
      setTimeout(() => form.name.focus(), 50);
    },
  });
}

// ---------------------------------------------------------
// Events
// ---------------------------------------------------------
function bindWorkflow() {
  const view = $('#view-workflow');
  const jobById = id => state.workflow.jobs.find(x => x.id === id);
  view.addEventListener('toggle', e => { // the guide and the finished jobs stay unfolded while the app is open
    const fold = e.target;
    if (!fold.matches || !fold.matches('details[data-unfold]')) return;
    if (fold.open) openGuides.add(fold.dataset.unfold); else openGuides.delete(fold.dataset.unfold);
  }, true);
  view.addEventListener('click', e => {
    const target = e.target;
    if (target.closest('[data-tnew]')) { openToolModal(null); return; }
    const editButton = target.closest('[data-tedit]');
    if (editButton) { openToolModal(toolById(editButton.dataset.tedit)); return; }
    const threadButton = target.closest('[data-thread]');
    if (threadButton) { workflowThread = workflowThread === threadButton.dataset.thread ? '' : threadButton.dataset.thread; sfx('select'); renderWorkflow(); return; }
    if (target.closest('[data-pnew]')) { openProjectModal(null); return; }
    const projectEdit = target.closest('[data-pedit]');
    if (projectEdit) { openProjectModal(state.workflow.projects.find(p => p.id === projectEdit.dataset.pedit)); return; }
    const openButton = target.closest('[data-jopen]');
    if (openButton) { toggleJobForm(openButton.dataset.jopen); return; }
    const projectChip = target.closest('[data-jproject]');
    if (projectChip) { workflowAddProject = workflowAddProject === projectChip.dataset.jproject ? '' : projectChip.dataset.jproject; sfx('select'); syncProjectChips(); return; }
    const linkButton = target.closest('[data-jlink]');
    if (linkButton) { linkDeliverable(linkButton.closest('[data-jadd]').dataset.jadd, linkButton.dataset.jlink, workflowAddProject); refocusJobForm(); return; }
    const editJob = target.closest('[data-jedit]');
    if (editJob) { const job = jobById(editJob.dataset.jedit); if (job) openJobModal(job); return; }
    const doneButton = target.closest('[data-jdone]');
    if (doneButton) { const job = jobById(doneButton.dataset.jdone); if (job) toggleJobDone(job, doneButton); return; }
    const deleteButton = target.closest('[data-jdel]');
    if (deleteButton) { const job = jobById(deleteButton.dataset.jdel); if (job) removeWithUndo(state.workflow, 'jobs', job, jobName(job)); }
  });
  view.addEventListener('submit', e => {
    const form = e.target.closest('[data-jadd]');
    if (!form) return;
    e.preventDefault();
    const name = form.name.value.trim().slice(0, 80);
    if (!name) return;
    addJob(form.dataset.jadd, name, workflowAddProject);
    refocusJobForm();
  });
  view.addEventListener('input', e => { // what is typed also looks for a pending deliverable
    const input = e.target.closest('[data-jadd] input[name=name]');
    if (!input) return;
    const form = input.closest('[data-jadd]');
    $('[data-jpick]', form).innerHTML = pickListHTML(toolById(form.dataset.jadd), input.value.trim());
  });
  // Drag a job to another app (a deliverable is not linked twice to the same app)
  view.addEventListener('dragstart', e => {
    const job = e.target.closest('[data-job]');
    if (!job) return;
    draggedJobId = job.dataset.job;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedJobId);
  });
  view.addEventListener('dragover', e => {
    const block = e.target.closest('.wf-block');
    if (!draggedJobId || !block) return;
    e.preventDefault();
    $$('.wf-block.over', view).forEach(x => x !== block && x.classList.remove('over'));
    block.classList.add('over');
  });
  view.addEventListener('drop', e => {
    const block = e.target.closest('.wf-block');
    if (!draggedJobId || !block) return;
    e.preventDefault();
    const job = jobById(draggedJobId), toolId = block.dataset.tool;
    draggedJobId = null;
    const twice = job && job.eventId && state.workflow.jobs.some(x => x !== job && x.toolId === toolId && x.eventId === job.eventId);
    if (job && job.toolId !== toolId && !twice) { job.toolId = toolId; sfx('place'); save(); }
    renderWorkflow();
  });
  view.addEventListener('dragend', () => { draggedJobId = null; $$('.wf-block.over', view).forEach(x => x.classList.remove('over')); });
}

registerView('workflow', {
  render: renderWorkflow, bind: bindWorkflow,
  tick: () => { if (!workflowAddingTo) renderWorkflow(); }, // never wipe what is being typed
  reset: () => { workflowThread = ''; workflowAddingTo = ''; workflowAddProject = ''; },
  onEscape: () => { if (workflowAddingTo) toggleJobForm(workflowAddingTo); },
});
