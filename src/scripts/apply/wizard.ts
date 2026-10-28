import {
  activityDescriptionLimit,
  activityLimit,
  activityTypes,
  applicantTypes,
  applyDates,
  applyTerm,
  colleges,
  essayLimit,
  essayPrompts,
  gradeOptions,
  nextSteps,
  programs,
  schoolTypes,
  testTypes,
} from '../../data/admissions.ts';
import {
  DRAFT_KEY,
  STEPS,
  countWords,
  emptyActivity,
  emptyCourse,
  emptySchool,
  emptyScore,
  emptyState,
  essayMessage,
  essayTone,
  incompleteSteps,
  monthLabel,
  newApplicationId,
  parseState,
  savedLabel,
  validateStep,
  type Activity,
  type AppState,
  type Course,
  type FieldError,
  type School,
  type Score,
} from './model.ts';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type StepError = FieldError & { step: number };

const LAST = STEPS.length - 1;
const STEP_INDEX = Object.fromEntries(STEPS.map((step, index) => [step.id, index])) as Record<string, number>;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(selector),
];

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

const app = $('#apply-app');
const form = $<HTMLFormElement>('#apply-form');
const confirmation = $('#apply-confirmation');

if (app && form && confirmation) {
  const summary = $('#apply-errors')!;
  const live = $('#apply-live')!;
  const savedEl = $('#saved-indicator')!;
  const savedText = $('.saved-text', savedEl)!;
  const backBtn = $<HTMLButtonElement>('#step-back')!;
  const nextBtn = $<HTMLButtonElement>('#step-next')!;
  const schoolList = $('#school-list')!;
  const scoreList = $('#score-list')!;
  const activityList = $('#activity-list')!;
  const programCards = $$('#program-grid .program');
  const search = $<HTMLInputElement>('#major-search')!;
  const sections = $$('.step', form);

  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') {
    localStorage.removeItem(DRAFT_KEY);
    params.delete('reset');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  let state: AppState = loadDraft() ?? emptyState();
  const restored = Boolean(state.savedAt) && !state.submitted;
  const attempted = new Set<number>();
  const touched = new Set<string>();
  const openActivities = new Set<string>();
  let returnToReview = false;
  let collegeFilter = '';
  let saveTimer = 0;
  let lastTone = '';

  function loadDraft(): AppState | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? parseState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  /* ---------- Autosave ---------- */

  function setSaved(mode: 'saving' | 'saved' | 'error' | 'idle', pulse = true) {
    savedEl.dataset.state = mode;
    if (mode === 'saving') savedText.textContent = 'Saving…';
    else if (mode === 'error') savedText.textContent = 'Not saved. This browser blocked storage.';
    else savedText.textContent = savedLabel(state.savedAt);
    if (mode === 'saved' && pulse) {
      savedEl.classList.remove('is-pulse');
      void savedEl.offsetWidth;
      savedEl.classList.add('is-pulse');
    }
  }

  function persist() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    state.savedAt = new Date().toISOString();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
      setSaved('saved');
    } catch {
      setSaved('error');
    }
  }

  function saveSoon() {
    setSaved('saving');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 650);
  }

  window.setInterval(() => {
    if (savedEl.dataset.state === 'saved' || savedEl.dataset.state === 'idle') {
      savedText.textContent = savedLabel(state.savedAt);
    }
  }, 15000);

  window.addEventListener('pagehide', () => {
    if (saveTimer) persist();
  });

  /* ---------- Static field binding ---------- */

  function readPath(path: string): unknown {
    return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], state.data);
  }

  function writePath(path: string, value: unknown) {
    const keys = path.split('.');
    const last = keys.pop()!;
    const parent = keys.reduce<Record<string, unknown>>(
      (node, key) => node[key] as Record<string, unknown>,
      state.data as unknown as Record<string, unknown>,
    );
    parent[last] = value;
  }

  function hydrateStatic() {
    for (const el of $$<Field>('[data-bind]', form!)) {
      const value = readPath(el.dataset.bind!);
      if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = el.value === value;
      else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
      else el.value = typeof value === 'string' ? value : '';
    }
  }

  /* ---------- Records in dynamic lists ---------- */

  function findRecord(kind: string, id: string): Record<string, unknown> | undefined {
    const d = state.data;
    if (kind === 'school') return d.schools.find((s) => s.id === id);
    if (kind === 'course') return d.schools.flatMap((s) => s.courses).find((c) => c.id === id);
    if (kind === 'score') return d.tests.scores.find((s) => s.id === id);
    if (kind === 'activity') return d.activities.find((a) => a.id === id);
    return undefined;
  }

  function fillValues(root: ParentNode) {
    for (const el of $$<Field>('[data-k]', root)) {
      const item = el.closest<HTMLElement>('[data-item]');
      const record = item && findRecord(item.dataset.item!, item.dataset.id!);
      if (!record) continue;
      const value = record[el.dataset.k!];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
      else el.value = typeof value === 'string' ? value : '';
    }
  }

  const options = (items: readonly { value: string; label: string }[], placeholder: string) =>
    `<option value="">${esc(placeholder)}</option>` +
    items.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('');

  const field = (id: string, label: string, control: string, extra = '', cls = '') =>
    `<div class="field ${cls}"><label for="${id}">${label}</label>${control}${extra}<p class="field-error" hidden></p></div>`;

  /* ---------- Schools and courses ---------- */

  function schoolTitle(school: School) {
    return school.name.trim() || 'New school';
  }

  function courseHTML(course: Course, index: number, schoolIndex: number) {
    const p = `course-${course.id}`;
    return `<li class="course is-new" data-item="course" data-id="${course.id}">
      ${field(`${p}-title`, 'Course title', `<input id="${p}-title" type="text" data-k="title" placeholder="PLSC 101 Intro to Planetary Science" required aria-required="true">`)}
      ${field(`${p}-term`, 'Term <span class="hint">(optional)</span>', `<input id="${p}-term" type="text" data-k="term" placeholder="Fall 2026">`)}
      ${field(`${p}-grade`, 'Grade', `<select id="${p}-grade" data-k="grade" required aria-required="true">${options(gradeOptions.map((g) => ({ value: g, label: g })), 'Select')}</select>`)}
      <button type="button" class="icon-btn" data-remove-course="${course.id}" aria-label="Remove course ${index + 1} from school ${schoolIndex + 1}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </li>`;
  }

  function schoolHTML(school: School, index: number) {
    const p = `school-${school.id}`;
    return `<li class="school" data-item="school" data-id="${school.id}">
      <div class="school-head">
        <h3><span class="kicker">School ${index + 1}</span> <span data-school-title>${esc(schoolTitle(school))}</span></h3>
        <button type="button" class="linkish" data-remove-school="${school.id}">Remove<span class="sr-only"> school ${index + 1}</span></button>
      </div>
      <div class="form-grid">
        ${field(`${p}-type`, 'Kind of school', `<select id="${p}-type" data-k="type" required aria-required="true">${options(schoolTypes, 'Select a kind')}</select>`)}
        ${field(`${p}-name`, 'School name', `<input id="${p}-name" type="text" data-k="name" autocomplete="off" required aria-required="true">`)}
        ${field(`${p}-city`, 'City', `<input id="${p}-city" type="text" data-k="city" required aria-required="true">`)}
        ${field(`${p}-gpa`, 'GPA <span class="hint">(optional)</span>', `<input id="${p}-gpa" type="text" inputmode="decimal" data-k="gpa" placeholder="3.60">`)}
        ${field(`${p}-start`, 'Started', `<input id="${p}-start" type="month" data-k="start" placeholder="YYYY-MM" max="${applyDates.campusTodayIso.slice(0, 7)}" required aria-required="true">`)}
        <div class="field school-end">
          <label for="${p}-end">Finished</label>
          <input id="${p}-end" type="month" data-k="end" placeholder="YYYY-MM" max="${applyDates.campusTodayIso.slice(0, 7)}" ${school.current ? 'disabled' : 'required aria-required="true"'}>
          <label class="check"><input type="checkbox" id="${p}-current" data-k="current"> I attend now</label>
          <p class="field-error" hidden></p>
        </div>
      </div>
      <div class="courses">
        <h4>Courses <span class="hint">(optional)</span></h4>
        <ol class="course-list">${school.courses.map((c, ci) => courseHTML(c, ci, index)).join('')}</ol>
        <button type="button" class="btn-small" data-add-course="${school.id}"><span aria-hidden="true">+</span> Add a course<span class="sr-only"> to school ${index + 1}</span></button>
      </div>
    </li>`;
  }

  function renderSchools() {
    schoolList.innerHTML = state.data.schools.map(schoolHTML).join('');
    fillValues(schoolList);
    for (const el of $$('.is-new', schoolList)) el.classList.remove('is-new');
  }

  /* ---------- Test scores ---------- */

  function scoreHTML(score: Score, index: number) {
    const p = `score-${score.id}`;
    const type = testTypes.find((t) => t.id === score.test);
    const range = type ? `min="${type.min}" max="${type.max}" step="${type.step}"` : '';
    return `<li class="score" data-item="score" data-id="${score.id}">
      <div class="score-head">
        <h3><span class="kicker">Score ${index + 1}</span></h3>
        <button type="button" class="linkish" data-remove-score="${score.id}">Remove<span class="sr-only"> score ${index + 1}</span></button>
      </div>
      <div class="score-grid">
        ${field(`${p}-test`, 'Test', `<select id="${p}-test" data-k="test" required aria-required="true">${options(testTypes.map((t) => ({ value: t.id, label: t.label })), 'Select a test')}</select>`)}
        ${type?.subject ? field(`${p}-subject`, 'Subject', `<input id="${p}-subject" type="text" data-k="subject" placeholder="Calculus BC" required aria-required="true">`) : ''}
        ${field(`${p}-value`, 'Score', `<input id="${p}-value" type="number" inputmode="decimal" data-k="value" ${range} required aria-required="true" ${type ? '' : 'disabled'}>`, type ? `<p class="hint">${esc(type.hint)}</p>` : '')}
        ${field(`${p}-date`, 'Month tested', `<input id="${p}-date" type="month" data-k="date" placeholder="YYYY-MM" required aria-required="true">`)}
      </div>
    </li>`;
  }

  function renderScores() {
    scoreList.innerHTML = state.data.tests.scores.map(scoreHTML).join('');
    fillValues(scoreList);
  }

  function syncTestsMode() {
    const optional = state.data.tests.optional;
    $('#tests-optional-note')!.hidden = !optional;
    $('#tests-entry')!.hidden = optional;
  }

  /* ---------- Activities ---------- */

  function activityTitle(a: Activity) {
    const parts = [a.role.trim(), a.org.trim()].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'New activity';
  }

  function activityMeta(a: Activity) {
    const bits = [a.type, a.hours && `${a.hours} hrs/wk`, a.weeks && `${a.weeks} wks/yr`].filter(Boolean);
    return bits.join(' · ') || 'Add the details below';
  }

  const icon = {
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  function activityHTML(a: Activity, index: number, total: number) {
    const p = `activity-${a.id}`;
    const open = openActivities.has(a.id);
    const name = esc(activityTitle(a));
    return `<li class="activity" data-item="activity" data-id="${a.id}" data-open="${open}">
      <div class="activity-head">
        <button type="button" class="drag-handle" data-handle aria-describedby="reorder-help" aria-label="Reorder ${name}, position ${index + 1} of ${total}">${icon.grip}</button>
        <span class="activity-rank" aria-hidden="true">${index + 1}</span>
        <div class="activity-summary">
          <strong data-activity-title>${name}</strong>
          <span data-activity-meta>${esc(activityMeta(a))}</span>
        </div>
        <div class="activity-tools">
          <button type="button" class="icon-btn" data-move="-1" aria-label="Move ${name} up" ${index === 0 ? 'disabled' : ''}>${icon.up}</button>
          <button type="button" class="icon-btn" data-move="1" aria-label="Move ${name} down" ${index === total - 1 ? 'disabled' : ''}>${icon.down}</button>
          <button type="button" class="btn-small" data-toggle aria-expanded="${open}" aria-controls="${p}-body">${open ? 'Done' : 'Edit'}<span class="sr-only"> ${name}</span></button>
          <button type="button" class="icon-btn" data-remove-activity="${a.id}" aria-label="Remove ${name}">${icon.close}</button>
        </div>
      </div>
      <div class="activity-body" id="${p}-body" ${open ? '' : 'hidden'}>
        <div class="form-grid">
          ${field(`${p}-type`, 'Type', `<select id="${p}-type" data-k="type" required aria-required="true">${options(activityTypes.map((t) => ({ value: t, label: t })), 'Select a type')}</select>`)}
          ${field(`${p}-role`, 'Your role', `<input id="${p}-role" type="text" data-k="role" placeholder="Captain" required aria-required="true">`)}
          ${field(`${p}-org`, 'Organization', `<input id="${p}-org" type="text" data-k="org" placeholder="Debate Society" required aria-required="true">`, '', 'full')}
          ${field(`${p}-desc`, 'What you did', `<textarea id="${p}-desc" data-k="desc" rows="2" maxlength="${activityDescriptionLimit + 40}" aria-describedby="${p}-desc-count" required aria-required="true"></textarea>`, `<p class="hint char-count" id="${p}-desc-count">${a.desc.length} / ${activityDescriptionLimit} characters</p>`, 'full')}
          ${field(`${p}-hours`, 'Hours per week', `<input id="${p}-hours" type="number" inputmode="numeric" min="1" max="60" data-k="hours" required aria-required="true">`)}
          ${field(`${p}-weeks`, 'Weeks per year', `<input id="${p}-weeks" type="number" inputmode="numeric" min="1" max="52" data-k="weeks" required aria-required="true">`)}
        </div>
      </div>
    </li>`;
  }

  function renderActivities() {
    const total = state.data.activities.length;
    activityList.innerHTML = state.data.activities.map((a, i) => activityHTML(a, i, total)).join('');
    fillValues(activityList);
    const addBtn = $<HTMLButtonElement>('#add-activity')!;
    addBtn.disabled = total >= activityLimit;
    $('#activity-count')!.textContent = total ? `${total} of ${activityLimit}` : '';
  }

  /** Animate list items from their old positions to the new ones. */
  function flip(list: HTMLElement, change: () => void) {
    const before = new Map($$('[data-item]', list).map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
    change();
    if (reduceMotion.matches) return;
    for (const el of $$(':scope > [data-item]', list)) {
      const old = before.get(el.dataset.id);
      if (old === undefined) continue;
      const delta = old - el.getBoundingClientRect().top;
      if (!delta) continue;
      el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
        duration: 260,
        easing: 'cubic-bezier(.2,.7,.2,1)',
      });
    }
  }

  function moveActivity(from: number, to: number, refocus: string) {
    const list = state.data.activities;
    if (to < 0 || to >= list.length || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    flip(activityList, renderActivities);
    const row = $(`[data-item="activity"][data-id="${item.id}"]`, activityList);
    const target = row && ($<HTMLButtonElement>(refocus, row) ?? $<HTMLButtonElement>('[data-handle]', row));
    (target && !target.disabled ? target : row && $<HTMLButtonElement>('[data-handle]', row))?.focus();
    row?.classList.add('is-dropped');
    window.setTimeout(() => row?.classList.remove('is-dropped'), 700);
    $('#reorder-live')!.textContent = `${activityTitle(item)} moved to position ${to + 1} of ${list.length}.`;
    afterEdit();
  }

  /* Pointer drag on the handle. Arrow buttons and arrow keys do the same without dragging. */
  type Drag = {
    row: HTMLElement;
    rows: HTMLElement[];
    tops: number[];
    mids: number[];
    from: number;
    to: number;
    startY: number;
    shift: number;
    pointerId: number;
    handle: HTMLElement;
  };
  let drag: Drag | null = null;

  activityList.addEventListener('pointerdown', (event) => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-handle]');
    if (!handle || event.button !== 0) return;
    const row = handle.closest<HTMLElement>('[data-item]')!;
    const rows = $$(':scope > [data-item]', activityList);
    if (rows.length < 2) return;
    event.preventDefault();
    const rects = rows.map((el) => el.getBoundingClientRect());
    const from = rows.indexOf(row);
    const gap = rows.length > 1 ? rects[1].top - rects[0].bottom : 12;
    drag = {
      row,
      rows,
      tops: rects.map((r) => r.top + window.scrollY),
      mids: rects.map((r) => r.top + window.scrollY + r.height / 2),
      from,
      to: from,
      startY: event.pageY,
      shift: rects[from].height + gap,
      pointerId: event.pointerId,
      handle,
    };
    handle.setPointerCapture(event.pointerId);
    activityList.classList.add('is-sorting');
    row.classList.add('is-dragging');
  });

  activityList.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.clientY < 90) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    const dy = event.pageY - drag.startY;
    drag.row.style.transform = `translateY(${dy}px) scale(1.015)`;
    const center = drag.mids[drag.from] + dy;
    let to = drag.from;
    drag.mids.forEach((mid, i) => {
      if (i > drag!.from && center > mid) to = i;
      if (i < drag!.from && center < mid && to >= drag!.from) to = i;
    });
    drag.to = to;
    drag.rows.forEach((el, i) => {
      const rank = $('.activity-rank', el);
      if (i === drag!.from) {
        if (rank) rank.textContent = String(to + 1);
        return;
      }
      let offset = 0;
      let position = i;
      if (i > drag!.from && i <= to) {
        offset = -drag!.shift;
        position = i - 1;
      }
      if (i < drag!.from && i >= to) {
        offset = drag!.shift;
        position = i + 1;
      }
      el.style.transform = offset ? `translateY(${offset}px)` : '';
      if (rank) rank.textContent = String(position + 1);
    });
  });

  function endDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, to, rows, row } = drag;
    drag = null;
    activityList.classList.remove('is-sorting');
    row.classList.remove('is-dragging');
    for (const el of rows) el.style.transform = '';
    if (from === to) rows.forEach((el, i) => ($('.activity-rank', el)!.textContent = String(i + 1)));
    else {
      const list = state.data.activities;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      renderActivities();
      const moved = $(`[data-item="activity"][data-id="${item.id}"]`, activityList);
      moved?.classList.add('is-dropped');
      window.setTimeout(() => moved?.classList.remove('is-dropped'), 700);
      $('#reorder-live')!.textContent = `${activityTitle(item)} moved to position ${to + 1} of ${list.length}.`;
      afterEdit();
    }
  }
  activityList.addEventListener('pointerup', endDrag);
  activityList.addEventListener('pointercancel', endDrag);

  activityList.addEventListener('keydown', (event) => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-handle]');
    if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const row = handle.closest<HTMLElement>('[data-item]')!;
    const from = state.data.activities.findIndex((a) => a.id === row.dataset.id);
    moveActivity(from, from + (event.key === 'ArrowUp' ? -1 : 1), '[data-handle]');
  });

  /* ---------- Intended major ---------- */

  const programName = (id: string) => programs.find((p) => p.id === id);

  function syncPrograms() {
    const { first, second } = state.data.major;
    for (const card of programCards) {
      const id = card.dataset.program!;
      const rank = id === first ? 'first' : id === second ? 'second' : '';
      card.dataset.rank = rank;
      $('.program-badge', card)!.textContent = rank === 'first' ? '1st choice' : rank === 'second' ? '2nd choice' : '';
      for (const btn of $$<HTMLButtonElement>('[data-pick]', card)) {
        btn.setAttribute('aria-pressed', String(btn.dataset.pick === rank));
      }
    }
    for (const slot of $$('[data-slot]')) {
      const which = slot.dataset.slot as 'first' | 'second';
      const program = programName(state.data.major[which]);
      const college = program && colleges.find((c) => c.id === program.college);
      $('.major-slot-name', slot)!.textContent = program
        ? `${program.name}, ${program.degree}${college ? ` · ${college.short}` : ''}`
        : 'Not chosen yet';
      slot.classList.toggle('is-filled', Boolean(program));
      $<HTMLButtonElement>('[data-clear]', slot)!.hidden = !program;
    }
  }

  function pickProgram(id: string, which: 'first' | 'second') {
    const major = state.data.major;
    const other = which === 'first' ? 'second' : 'first';
    if (major[which] === id) major[which] = '';
    else {
      if (major[other] === id) major[other] = major[which];
      major[which] = id;
    }
    if (!major.first && major.second) {
      major.first = major.second;
      major.second = '';
    }
    syncPrograms();
    const program = programName(id);
    if (program) {
      live.textContent =
        major.first === id
          ? `${program.name} is your first choice.`
          : major.second === id
            ? `${program.name} is your second choice.`
            : `${program.name} removed.`;
    }
    const card = programCards.find((c) => c.dataset.program === id);
    if (card && !reduceMotion.matches) {
      card.animate([{ transform: 'scale(0.98)' }, { transform: 'scale(1.01)' }, { transform: 'scale(1)' }], {
        duration: 320,
        easing: 'ease-out',
      });
    }
    afterEdit();
  }

  function filterPrograms() {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of programCards) {
      const text = card.dataset.search ?? '';
      const match = (!collegeFilter || card.dataset.college === collegeFilter) && terms.every((t) => text.includes(t));
      card.hidden = !match;
      if (match) shown += 1;
    }
    const where = collegeFilter ? ` in ${colleges.find((c) => c.id === collegeFilter)?.short}` : '';
    const query = search.value.trim();
    $('#major-results')!.textContent = query
      ? `${shown} ${shown === 1 ? 'program matches' : 'programs match'} “${query}”${where}`
      : `${shown} ${shown === 1 ? 'program' : 'programs'}${where}`;
    $('#major-empty')!.hidden = shown > 0;
  }

  /* ---------- Essay ---------- */

  function updateEssay() {
    const words = countWords(state.data.essay.text);
    const tone = essayTone(words);
    const meter = $('#essay-meter')!;
    meter.dataset.tone = tone;
    meter.style.setProperty('--fill', `${Math.min(words / essayLimit, 1) * 100}%`);
    $('#essay-count')!.innerHTML = `<strong>${words}</strong> / ${essayLimit} words`;
    $('#essay-count')!.dataset.tone = tone;
    $('#essay-note')!.textContent = essayMessage(words);
    if (lastTone && tone !== lastTone && tone !== 'empty') {
      $('#essay-live')!.textContent = `${words} words. ${essayMessage(words)}`;
    }
    lastTone = tone;
    const prompt = essayPrompts.find((p) => p.id === state.data.essay.prompt);
    const echo = $('#essay-prompt-echo')!;
    echo.hidden = !prompt;
    echo.textContent = prompt ? prompt.text : '';
  }

  /* ---------- Errors ---------- */

  function errorTarget(id: string) {
    return document.getElementById(id);
  }

  function clearInline(scope: ParentNode) {
    for (const box of $$('.is-invalid', scope)) box.classList.remove('is-invalid');
    for (const msg of $$('.field-error', scope)) {
      msg.hidden = true;
      msg.textContent = '';
    }
    for (const el of $$('[aria-invalid="true"]', scope)) el.removeAttribute('aria-invalid');
  }

  function describe(el: HTMLElement, errorId: string | null) {
    if (el.dataset.baseDescribedby === undefined) el.dataset.baseDescribedby = el.getAttribute('aria-describedby') ?? '';
    const ids = [el.dataset.baseDescribedby, errorId].filter(Boolean).join(' ');
    if (ids) el.setAttribute('aria-describedby', ids);
    else el.removeAttribute('aria-describedby');
  }

  function showInline(errors: FieldError[], scope: HTMLElement, only?: (id: string) => boolean) {
    clearInline(scope);
    for (const el of $$('[data-base-describedby]', scope)) describe(el, null);
    const seen = new Set<string>();
    for (const error of errors) {
      if (seen.has(error.id) || (only && !only(error.id))) continue;
      seen.add(error.id);
      const el = errorTarget(error.id);
      if (!el || !scope.contains(el)) continue;
      const box = el.closest<HTMLElement>('.field');
      const msg =
        $(`[data-error-for="${error.id}"]`, scope) ?? (box ? $(':scope > .field-error', box) : null);
      if (box) box.classList.add('is-invalid');
      if (msg) {
        msg.id = `${error.id}-error`;
        msg.hidden = false;
        msg.textContent = error.message;
      }
      if (el.matches('input, select, textarea')) {
        el.setAttribute('aria-invalid', 'true');
        describe(el, msg?.id ?? null);
      }
      const activity = el.closest<HTMLElement>('[data-item="activity"]');
      if (activity) activity.classList.add('has-error');
    }
  }

  function showSummary(errors: StepError[], lead: string) {
    summary.hidden = false;
    const seen = new Set<string>();
    const items = errors
      .filter((e) => !seen.has(e.id + e.message) && seen.add(e.id + e.message))
      .map((e) => {
        const prefix = e.step !== state.step ? `${STEPS[e.step].label}: ` : '';
        return `<li><a href="#${esc(e.id)}" data-step="${e.step}" data-field="${esc(e.id)}">${esc(prefix + e.message)}</a></li>`;
      })
      .join('');
    summary.innerHTML = `<p>${esc(lead)}</p><ul>${items}</ul>`;
    summary.focus();
    summary.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  function hideSummary() {
    summary.hidden = true;
    summary.replaceChildren();
  }

  function focusField(id: string) {
    const el = errorTarget(id);
    if (!el) return;
    const activity = el.closest<HTMLElement>('[data-item="activity"]');
    if (activity && activity.dataset.open !== 'true') toggleActivity(activity.dataset.id!, true);
    const target = errorTarget(id)!;
    target.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }

  summary.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-field]');
    if (!link) return;
    event.preventDefault();
    const step = Number(link.dataset.step);
    if (step !== state.step) {
      if (state.step === LAST) returnToReview = true;
      goTo(step, false);
      showInline(validateStep(step, state.data), sections[step]);
      attempted.add(step);
    }
    focusField(link.dataset.field!);
  });

  function refreshLiveErrors() {
    const errors = validateStep(state.step, state.data);
    const section = sections[state.step];
    if (attempted.has(state.step)) {
      showInline(errors, section);
      if (!summary.hidden && errors.length === 0) hideSummary();
    } else {
      showInline(errors, section, (id) => touched.has(id));
    }
  }

  /* ---------- Stepper and navigation ---------- */

  function updateChrome() {
    const step = state.step;
    const stepper = $$('.stepper-item');
    stepper.forEach((li, i) => {
      const reached = i <= state.furthest;
      const valid = validateStep(i, state.data).length === 0;
      let mode = 'todo';
      if (i === step) mode = 'current';
      else if (reached && i < state.furthest && i < LAST && valid) mode = 'done';
      else if (reached && i < state.furthest && i < LAST) mode = 'attention';
      else if (reached) mode = 'open';
      li.dataset.state = mode;
      const btn = $<HTMLButtonElement>('button', li)!;
      btn.disabled = !reached;
      if (i === step) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
      $('.stepper-status', li)!.textContent =
        mode === 'done' ? ', complete' : mode === 'attention' ? ', needs attention' : mode === 'todo' ? ', not started' : '';
    });
    $('.stepper')!.style.setProperty('--progress', String(state.furthest / LAST));
    $('#step-count')!.textContent = `Step ${step + 1} of ${STEPS.length} · ${STEPS[step].label}`;

    const done = STEPS.slice(0, LAST).filter((_, i) => i < state.furthest && validateStep(i, state.data).length === 0).length;
    const pct = state.submitted ? 100 : Math.round((done / STEPS.length) * 100);
    $('#progress-ring')!.style.setProperty('--pct', String(pct));
    $('#progress-pct')!.textContent = `${pct}%`;
    $('#apply-progress-fill')!.style.width = `${pct}%`;

    backBtn.hidden = step === 0;
    nextBtn.innerHTML =
      step === LAST
        ? 'Submit application'
        : returnToReview
          ? 'Save and return to review'
          : `Continue <span aria-hidden="true">→</span>`;
    nextBtn.classList.toggle('btn-submit', step === LAST);
  }

  function goTo(index: number, focusHeading = true) {
    const from = state.step;
    state.step = Math.max(0, Math.min(index, LAST));
    state.furthest = Math.max(state.furthest, state.step);
    sections.forEach((section, i) => {
      section.hidden = i !== state.step;
      section.classList.remove('enter-forward', 'enter-back');
    });
    const section = sections[state.step];
    if (!reduceMotion.matches && from !== state.step) {
      section.classList.add(state.step > from ? 'enter-forward' : 'enter-back');
    }
    if (STEPS[state.step].id === 'review') renderReview();
    if (STEPS[state.step].id === 'major') syncPrograms();
    if (STEPS[state.step].id === 'essay') updateEssay();
    hideSummary();
    if (!attempted.has(state.step)) clearInline(section);
    updateChrome();
    saveSoon();
    const top = app!.getBoundingClientRect().top + window.scrollY - 96;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (focusHeading) $<HTMLElement>('h2', section)?.focus({ preventScroll: true });
  }

  /* ---------- Review ---------- */

  const row = (label: string, value: string) =>
    `<div><dt>${esc(label)}</dt><dd>${value ? esc(value) : '<span class="muted">Not provided</span>'}</dd></div>`;

  function reviewSection(index: number, body: string) {
    const step = STEPS[index];
    const ok = validateStep(index, state.data).length === 0;
    return `<section class="review-section ${ok ? '' : 'needs-attention'}" aria-labelledby="review-h-${step.id}">
      <header>
        <h3 id="review-h-${step.id}"><span class="review-num">${index + 1}</span> ${esc(step.label)}</h3>
        <span class="pill ${ok ? 'pill-resolved' : 'pill-progress'}">${ok ? 'Complete' : 'Needs attention'}</span>
        <a class="review-edit" href="#step-${step.id}" data-edit="${index}">Edit<span class="sr-only"> ${esc(step.label)}</span></a>
      </header>
      ${body}
    </section>`;
  }

  function renderReview() {
    const d = state.data;
    const a = d.about;
    const c = d.contact;
    const type = applicantTypes.find((t) => t.value === a.applicantType);
    const birth = a.birthDate
      ? new Date(`${a.birthDate}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })
      : '';
    const about = `<dl class="review-grid">
      ${row('Applying as', type ? `${type.label}, ${applyTerm}` : '')}
      ${row('Legal name', [a.firstName, a.lastName].filter(Boolean).join(' '))}
      ${row('Preferred name', a.preferredName)}
      ${row('Pronouns', a.pronouns)}
      ${row('Date of birth', birth)}
      ${row('Citizenship', a.citizenship)}
      ${row('First in family', a.firstGen)}
    </dl>`;
    const pref = { email: 'Email', text: 'Text message', call: 'Phone call' }[c.contactPref] ?? '';
    const contact = `<dl class="review-grid">
      ${row('Email', c.email)}
      ${row('Phone', c.phone)}
      ${row('Address', [c.street, [c.city, c.region].filter(Boolean).join(', '), [c.postal, c.country].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}
      ${row('Reach me by', pref)}
    </dl>`;
    const schools = d.schools.length
      ? `<ol class="review-schools">${d.schools
          .map((s) => {
            const kind = schoolTypes.find((t) => t.value === s.type)?.label ?? '';
            const dates = `${monthLabel(s.start) || '?'} – ${s.current ? 'now' : monthLabel(s.end) || '?'}`;
            const courses = s.courses.length
              ? `<table class="review-courses"><caption class="sr-only">Courses at ${esc(s.name)}</caption><thead><tr><th scope="col">Course</th><th scope="col">Term</th><th scope="col">Grade</th></tr></thead><tbody>${s.courses
                  .map((co) => `<tr><td>${esc(co.title)}</td><td>${esc(co.term) || '—'}</td><td>${esc(co.grade)}</td></tr>`)
                  .join('')}</tbody></table>`
              : '';
            return `<li><strong>${esc(s.name || 'Unnamed school')}</strong><span>${esc([kind, s.city, dates, s.gpa && `GPA ${s.gpa}`].filter(Boolean).join(' · '))}</span>${courses}</li>`;
          })
          .join('')}</ol>`
      : '<p class="muted">No schools added.</p>';
    const tests = d.tests.optional
      ? '<p>Applying test-optional.</p>'
      : `<ul class="review-list">${d.tests.scores
          .map((s) => {
            const t = testTypes.find((x) => x.id === s.test);
            return `<li><strong>${esc(t ? t.label : 'Test')}${s.subject ? `, ${esc(s.subject)}` : ''}</strong> ${esc(s.value)} <span class="muted">${esc(monthLabel(s.date))}</span></li>`;
          })
          .join('')}</ul>`;
    const majorLine = (id: string) => {
      const p = programName(id);
      const college = p && colleges.find((x) => x.id === p.college);
      return p ? `${p.name}, ${p.degree} · ${college?.name ?? ''}` : '';
    };
    const major = `<dl class="review-grid">${row('First choice', majorLine(d.major.first))}${row('Second choice', majorLine(d.major.second))}</dl>`;
    const prompt = essayPrompts.find((p) => p.id === d.essay.prompt);
    const words = countWords(d.essay.text);
    const essay = `<p class="review-prompt"><strong>${esc(prompt?.title ?? 'No prompt chosen')}</strong> <span class="pill">${words} words</span></p>
      <div class="review-essay" tabindex="0" role="region" aria-label="Essay text">${d.essay.text.trim() ? esc(d.essay.text.trim()) : '<span class="muted">No essay yet.</span>'}</div>`;
    const activities = d.activities.length
      ? `<ol class="review-activities">${d.activities
          .map((x) => `<li><strong>${esc(activityTitle(x))}</strong><span>${esc(activityMeta(x))}</span>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</li>`)
          .join('')}</ol>`
      : '<p class="muted">No activities added.</p>';
    const bodies = [about, contact, schools, tests, major, essay, activities];
    $('#review-body')!.innerHTML = bodies.map((body, i) => reviewSection(i, body)).join('');
  }

  $('#review-body')!.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-edit]');
    if (!link) return;
    event.preventDefault();
    returnToReview = true;
    goTo(Number(link.dataset.edit));
  });

  /* ---------- Submit and confirmation ---------- */

  function submitApplication() {
    const errors: StepError[] = [];
    for (const i of incompleteSteps(state.data)) {
      for (const e of validateStep(i, state.data)) errors.push({ ...e, step: i });
    }
    for (const e of validateStep(LAST, state.data)) errors.push({ ...e, step: LAST });
    attempted.add(LAST);
    showInline(validateStep(LAST, state.data), sections[LAST]);
    if (errors.length) {
      renderReview();
      const sectionsLeft = new Set(errors.map((e) => e.step)).size;
      showSummary(
        errors,
        sectionsLeft === 1 && errors[0].step === LAST
          ? 'One more thing before you submit.'
          : `Fix ${errors.length === 1 ? 'this answer' : `these ${errors.length} answers`} before you submit.`,
      );
      return;
    }
    state.submitted = { id: newApplicationId(), at: new Date().toISOString() };
    persist();
    showConfirmation(true);
  }

  function showConfirmation(fresh: boolean) {
    const sub = state.submitted!;
    const d = state.data;
    const name = d.about.preferredName.trim() || d.about.firstName.trim();
    const at = new Date(sub.at);
    const clock = Number.isNaN(at.getTime())
      ? ''
      : at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' ');
    app!.hidden = true;
    confirmation!.hidden = false;
    confirmation!.classList.toggle('is-fresh', fresh && !reduceMotion.matches);
    $('#confirm-title')!.textContent = name ? `Thank you, ${name}. Your application is in.` : 'Your application is in.';
    $('#confirm-lede')!.textContent = `We received your ${applyTerm} transfer application on ${applyDates.campusToday}${clock ? ` at ${clock}` : ''}. A copy of your answers stays in this browser.`;
    $('#confirm-id')!.textContent = sub.id;
    const first = programName(d.major.first);
    const second = programName(d.major.second);
    $('#confirm-facts')!.innerHTML = [
      ['Applicant', [d.about.firstName, d.about.lastName].filter(Boolean).join(' ')],
      ['Entry term', `${applyTerm} · Transfer`],
      ['First choice', first ? `${first.name}, ${first.degree}` : ''],
      ['Second choice', second ? `${second.name}, ${second.degree}` : 'None'],
      ['Updates go to', d.contact.email],
    ]
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join('');
    const attended = d.schools
      .filter((s) => s.type && s.type !== 'high-school')
      .map((s) => s.name.trim())
      .filter(Boolean);
    $('#confirm-timeline')!.innerHTML = nextSteps
      .map((step, i) => {
        const extra =
          step.title === 'Transcripts due' && attended.length ? ` We are expecting ${attended.join(' and ')}.` : '';
        const cls = i === 0 ? 'is-done' : i === 1 ? 'is-next' : '';
        return `<li class="${cls}" style="--i:${i}">
          <span class="timeline-dot" aria-hidden="true"></span>
          <p class="timeline-when">${esc(step.when)}${i === 0 ? ' <span class="pill pill-resolved">Done</span>' : ''}</p>
          <h4>${esc(step.title)}</h4>
          <p>${esc(step.body + extra)}</p>
        </li>`;
      })
      .join('');
    window.scrollTo({ top: Math.max(0, confirmation!.getBoundingClientRect().top + window.scrollY - 110) });
    $<HTMLElement>('#confirm-title')!.focus({ preventScroll: true });
  }

  $('#copy-id')!.addEventListener('click', async () => {
    const status = $('#copy-status')!;
    try {
      await navigator.clipboard.writeText(state.submitted?.id ?? '');
      status.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('#confirm-id')!);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      status.textContent = 'Selected. Press Ctrl+C or Command+C to copy.';
    }
    window.setTimeout(() => (status.textContent = ''), 2500);
  });

  $('#print-copy')!.addEventListener('click', () => window.print());

  function startFresh() {
    localStorage.removeItem(DRAFT_KEY);
    state = emptyState();
    attempted.clear();
    touched.clear();
    openActivities.clear();
    returnToReview = false;
    lastTone = '';
    hydrateStatic();
    renderSchools();
    renderScores();
    renderActivities();
    syncTestsMode();
    syncPrograms();
    search.value = '';
    collegeFilter = '';
    for (const chip of $$('.chip', form!)) chip.setAttribute('aria-pressed', String(chip.dataset.filter === ''));
    filterPrograms();
    updateEssay();
    $('#restored-note')!.hidden = true;
    confirmation!.hidden = true;
    app!.hidden = false;
    goTo(0);
    setSaved('idle');
    window.clearTimeout(saveTimer);
    saveTimer = 0;
  }

  $('#new-application')!.addEventListener('click', startFresh);

  const startOver = $('#start-over')!;
  startOver.addEventListener('click', (event) => {
    const t = event.target as Element;
    const confirmBox = $('.start-over-confirm', startOver)!;
    const trigger = $<HTMLButtonElement>('[data-start-over]', startOver)!;
    if (t.closest('[data-start-over]')) {
      confirmBox.hidden = false;
      trigger.hidden = true;
      $<HTMLButtonElement>('[data-start-over-no]', startOver)!.focus();
    } else if (t.closest('[data-start-over-no]')) {
      confirmBox.hidden = true;
      trigger.hidden = false;
      trigger.focus();
    } else if (t.closest('[data-start-over-yes]')) {
      confirmBox.hidden = true;
      trigger.hidden = false;
      startFresh();
      live.textContent = 'Draft erased. The application is blank.';
    }
  });

  $('[data-dismiss-restored]')!.addEventListener('click', () => {
    $('#restored-note')!.hidden = true;
  });

  /* ---------- Editing ---------- */

  function afterEdit() {
    saveSoon();
    refreshLiveErrors();
    updateChrome();
  }

  function onEdit(event: Event) {
    const el = event.target as Field;
    if (el === search) {
      filterPrograms();
      return;
    }
    const bind = el.dataset?.bind;
    if (bind) {
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (!el.checked) return;
        writePath(bind, el.value);
      } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        writePath(bind, el.checked);
      } else writePath(bind, el.value);
      if (bind === 'tests.optional') {
        if (!state.data.tests.optional && state.data.tests.scores.length === 0) {
          state.data.tests.scores.push(emptyScore());
          renderScores();
        }
        syncTestsMode();
      }
      if (bind.startsWith('essay.')) updateEssay();
      afterEdit();
      return;
    }
    const key = el.dataset?.k;
    const item = el.closest<HTMLElement>('[data-item]');
    if (!key || !item) return;
    const record = findRecord(item.dataset.item!, item.dataset.id!);
    if (!record) return;
    record[key] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
    const kind = item.dataset.item;
    if (kind === 'school') {
      const school = record as School;
      if (key === 'name') $('[data-school-title]', item)!.textContent = schoolTitle(school);
      if (key === 'current') {
        const end = $<HTMLInputElement>('[data-k="end"]', item)!;
        end.disabled = school.current;
        end.required = !school.current;
        if (school.current) end.removeAttribute('aria-required');
        else end.setAttribute('aria-required', 'true');
        if (school.current) {
          school.end = '';
          end.value = '';
        }
      }
    }
    if (kind === 'score' && key === 'test' && event.type === 'change') {
      const score = record as Score;
      if (!testTypes.find((t) => t.id === score.test)?.subject) score.subject = '';
      renderScores();
      $<HTMLElement>(`#score-${score.id}-test`)?.focus();
    }
    if (kind === 'activity') {
      const activity = record as Activity;
      $('[data-activity-title]', item)!.textContent = activityTitle(activity);
      $('[data-activity-meta]', item)!.textContent = activityMeta(activity);
      if (key === 'desc') {
        const count = $(`#activity-${activity.id}-desc-count`)!;
        count.textContent = `${activity.desc.length} / ${activityDescriptionLimit} characters`;
        count.classList.toggle('is-over', activity.desc.length > activityDescriptionLimit);
      }
    }
    afterEdit();
  }

  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);

  form.addEventListener('focusout', (event) => {
    const el = event.target as Field;
    if (!el.id || !el.matches?.('input, select, textarea') || el === search) return;
    const hasValue = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? false : Boolean(el.value);
    if (hasValue) touched.add(el.id);
    refreshLiveErrors();
  });

  function toggleActivity(id: string, open?: boolean) {
    const next = open ?? !openActivities.has(id);
    if (next) openActivities.add(id);
    else openActivities.delete(id);
    const row = $(`[data-item="activity"][data-id="${id}"]`, activityList);
    if (!row) return;
    row.dataset.open = String(next);
    $('.activity-body', row)!.hidden = !next;
    const btn = $<HTMLButtonElement>('[data-toggle]', row)!;
    btn.setAttribute('aria-expanded', String(next));
    btn.firstChild!.textContent = next ? 'Done' : 'Edit';
  }

  form.addEventListener('click', (event) => {
    const t = event.target as Element;
    const btn = t.closest<HTMLButtonElement>('button');
    if (!btn) return;
    const d = state.data;

    if (btn.id === 'add-school') {
      const school = emptySchool(d.schools.some((s) => s.type !== 'high-school') ? '' : 'community-college');
      d.schools.push(school);
      renderSchools();
      animateIn($(`[data-id="${school.id}"]`, schoolList));
      $<HTMLElement>(`#school-${school.id}-type`)?.focus();
      live.textContent = `School ${d.schools.length} added.`;
      afterEdit();
    } else if (btn.dataset.removeSchool) {
      const index = d.schools.findIndex((s) => s.id === btn.dataset.removeSchool);
      if (index < 0) return;
      const [removed] = d.schools.splice(index, 1);
      renderSchools();
      $<HTMLElement>('#add-school')?.focus();
      live.textContent = `${schoolTitle(removed)} removed.`;
      afterEdit();
    } else if (btn.dataset.addCourse) {
      const school = d.schools.find((s) => s.id === btn.dataset.addCourse);
      if (!school) return;
      const course = emptyCourse();
      school.courses.push(course);
      renderSchools();
      animateIn($(`[data-id="${course.id}"]`, schoolList));
      $<HTMLElement>(`#course-${course.id}-title`)?.focus();
      afterEdit();
    } else if (btn.dataset.removeCourse) {
      const school = d.schools.find((s) => s.courses.some((c) => c.id === btn.dataset.removeCourse));
      if (!school) return;
      school.courses = school.courses.filter((c) => c.id !== btn.dataset.removeCourse);
      renderSchools();
      $<HTMLElement>(`[data-add-course="${school.id}"]`)?.focus();
      live.textContent = 'Course removed.';
      afterEdit();
    } else if (btn.id === 'add-score') {
      const score = emptyScore();
      d.tests.scores.push(score);
      renderScores();
      animateIn($(`[data-id="${score.id}"]`, scoreList));
      $<HTMLElement>(`#score-${score.id}-test`)?.focus();
      afterEdit();
    } else if (btn.dataset.removeScore) {
      d.tests.scores = d.tests.scores.filter((s) => s.id !== btn.dataset.removeScore);
      renderScores();
      $<HTMLElement>('#add-score')?.focus();
      live.textContent = 'Score removed.';
      afterEdit();
    } else if (btn.id === 'add-activity') {
      if (d.activities.length >= activityLimit) return;
      const activity = emptyActivity();
      d.activities.push(activity);
      openActivities.add(activity.id);
      renderActivities();
      animateIn($(`[data-id="${activity.id}"]`, activityList));
      $<HTMLElement>(`#activity-${activity.id}-type`)?.focus();
      afterEdit();
    } else if (btn.dataset.removeActivity) {
      const activity = d.activities.find((a) => a.id === btn.dataset.removeActivity);
      d.activities = d.activities.filter((a) => a.id !== btn.dataset.removeActivity);
      flip(activityList, renderActivities);
      $<HTMLElement>('#add-activity')?.focus();
      if (activity) live.textContent = `${activityTitle(activity)} removed.`;
      afterEdit();
    } else if (btn.dataset.move) {
      const rowEl = btn.closest<HTMLElement>('[data-item="activity"]')!;
      const from = d.activities.findIndex((a) => a.id === rowEl.dataset.id);
      const dir = Number(btn.dataset.move);
      moveActivity(from, from + dir, `[data-move="${dir}"]`);
    } else if (btn.hasAttribute('data-toggle')) {
      const rowEl = btn.closest<HTMLElement>('[data-item="activity"]')!;
      toggleActivity(rowEl.dataset.id!);
    } else if (btn.dataset.pick) {
      const card = btn.closest<HTMLElement>('.program')!;
      pickProgram(card.dataset.program!, btn.dataset.pick as 'first' | 'second');
    } else if (btn.dataset.clear) {
      const which = btn.dataset.clear as 'first' | 'second';
      const id = d.major[which];
      if (id) pickProgram(id, which);
      search.focus();
    } else if (btn.dataset.filter !== undefined) {
      collegeFilter = btn.dataset.filter;
      for (const chip of $$('.chip', form!)) chip.setAttribute('aria-pressed', String(chip === btn));
      filterPrograms();
    } else if (btn === backBtn) {
      goTo(state.step - 1);
    }
  });

  function animateIn(el: Element | null) {
    if (!el || reduceMotion.matches) return;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 280, easing: 'ease-out' },
    );
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const step = state.step;
    if (step === LAST) {
      submitApplication();
      return;
    }
    attempted.add(step);
    const errors = validateStep(step, state.data);
    showInline(errors, sections[step]);
    if (errors.length) {
      showSummary(
        errors.map((e) => ({ ...e, step })),
        errors.length === 1 ? 'Fix this answer to continue.' : `Fix these ${errors.length} answers to continue.`,
      );
      return;
    }
    if (STEPS[step].id === 'activities') {
      for (const a of state.data.activities) openActivities.delete(a.id);
      renderActivities();
    }
    if (returnToReview) {
      returnToReview = false;
      goTo(LAST);
    } else goTo(step + 1);
  });

  $('.stepper')!.addEventListener('click', (event) => {
    const btn = (event.target as Element).closest<HTMLButtonElement>('[data-goto]');
    if (!btn || btn.disabled) return;
    const index = Number(btn.dataset.goto);
    if (index === state.step) return;
    if (index !== LAST && state.step === LAST) returnToReview = true;
    if (index === LAST) returnToReview = false;
    goTo(index);
  });

  /* ---------- Start ---------- */

  hydrateStatic();
  for (const a of state.data.activities) {
    if (validateStep(STEP_INDEX.activities, { ...state.data, activities: [a] }).length) openActivities.add(a.id);
  }
  renderSchools();
  renderScores();
  renderActivities();
  syncTestsMode();
  syncPrograms();
  filterPrograms();
  updateEssay();
  lastTone = essayTone(countWords(state.data.essay.text));

  if (state.submitted) {
    showConfirmation(false);
  } else {
    app.hidden = false;
    sections.forEach((section, i) => (section.hidden = i !== state.step));
    if (STEPS[state.step].id === 'review') renderReview();
    updateChrome();
    if (restored) {
      $('#restored-note')!.hidden = false;
      setSaved('saved', false);
    }
  }
}
