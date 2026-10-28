import {
  CAMPUS_TODAY,
  EVENTS_RANGE,
  campusEvents,
  campusLocations,
  eventCategories,
  type CampusEvent,
  type EventCategoryId,
} from '../data/events';
import {
  addDays,
  addMonths,
  buildIcs,
  clampDay,
  eventDays,
  formatClock,
  formatDayHeading,
  formatEventDates,
  formatLongDate,
  formatMonthYear,
  formatTimeRange,
  formatWeekRange,
  formatWeekdayShort,
  isIsoDay,
  minutesOf,
  sameMonth,
  startOfMonth,
  startOfWeek,
  type IcsEvent,
} from '../lib/events';
import { u } from '../lib/paths';

type View = 'month' | 'week' | 'agenda' | 'mine';
type Motion = 'none' | 'fade' | 'next' | 'prev';

type State = {
  view: View;
  date: string;
  cats: Set<EventCategoryId>;
  q: string;
  eventId: string | null;
};

const VIEWS: View[] = ['month', 'week', 'agenda', 'mine'];
const STORAGE_KEY = 'um-saved-events';
const HOUR_START = 8;
const HOUR_END = 22;
const CELL_LIMIT = 3;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const eventById = new Map(campusEvents.map((event) => [event.id, event]));
const categoryById = new Map(eventCategories.map((category) => [category.id, category]));
const locationById = new Map(campusLocations.map((location) => [location.id, location]));

const app = document.querySelector<HTMLElement>('[data-events-app]');
const panel = document.querySelector<HTMLElement>('[data-ev-panel]');
const stage = document.querySelector<HTMLElement>('[data-ev-stage]');
const rangeHeading = document.querySelector<HTMLElement>('#ev-range');
const statusLine = document.querySelector<HTMLElement>('#ev-status');
const tablist = document.querySelector<HTMLElement>('[data-ev-tabs]');
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ev-tabs] [role="tab"]'));
const prevButton = document.querySelector<HTMLButtonElement>('[data-ev-prev]');
const nextButton = document.querySelector<HTMLButtonElement>('[data-ev-next]');
const todayButton = document.querySelector<HTMLButtonElement>('[data-ev-today]');
const searchInput = document.querySelector<HTMLInputElement>('#ev-q');
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-cat]'));
const savedCount = document.querySelector<HTMLElement>('[data-ev-saved-count]');

const popover = document.querySelector<HTMLElement>('[data-ev-popover]');
const popoverTitle = document.querySelector<HTMLElement>('[data-ev-popover-title]');
const popoverList = document.querySelector<HTMLElement>('[data-ev-popover-list]');
const popoverClose = document.querySelector<HTMLButtonElement>('[data-ev-popover-close]');

const modal = document.querySelector<HTMLDialogElement>('[data-ev-modal]');
const modalCat = document.querySelector<HTMLElement>('[data-ev-modal-cat]');
const modalTitle = document.querySelector<HTMLElement>('[data-ev-modal-title]');
const modalWhen = document.querySelector<HTMLElement>('[data-ev-modal-when]');
const modalWhere = document.querySelector<HTMLElement>('[data-ev-modal-where]');
const modalDesc = document.querySelector<HTMLElement>('[data-ev-modal-desc]');
const modalMap = document.querySelector<HTMLElement>('[data-ev-map]');
const modalMapCaption = document.querySelector<HTMLElement>('[data-ev-map-caption]');
const modalClose = document.querySelector<HTMLButtonElement>('[data-ev-modal-close]');
const icsButton = document.querySelector<HTMLButtonElement>('[data-ev-ics]');
const saveButton = document.querySelector<HTMLButtonElement>('[data-ev-save]');
const saveLabel = document.querySelector<HTMLElement>('[data-ev-save-label]');
const copyButton = document.querySelector<HTMLButtonElement>('[data-ev-copy]');
const copyStatus = document.querySelector<HTMLElement>('[data-ev-copy-status]');

let state: State = readUrl();
let saved = loadSaved();
let modalReturn: { element: HTMLElement | null; selector: string | null } = { element: null, selector: null };
let popoverReturn: HTMLElement | null = null;
let searchTimer = 0;

/* ---------- Helpers ---------- */

type Attrs = Record<string, string | number | boolean | null | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'style') node.setAttribute('style', String(value));
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function colorOf(event: CampusEvent): string {
  return categoryById.get(event.category)?.color ?? '#24486a';
}

function categoryLabel(event: CampusEvent): string {
  return categoryById.get(event.category)?.label ?? '';
}

function locationLabel(event: CampusEvent): string {
  const place = locationById.get(event.location)?.name ?? '';
  return event.room ? `${place}, ${event.room}` : place;
}

function sortKey(event: CampusEvent): string {
  return `${event.date} ${event.start ?? '00:00'} ${event.title}`;
}

function pluralEvents(count: number): string {
  return count === 1 ? '1 event' : `${count} events`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- URL state ---------- */

function readUrl(): State {
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view') as View | null;
  const view = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
  const eventParam = params.get('event');
  const eventId = eventParam && eventById.has(eventParam) ? eventParam : null;
  const dateParam = params.get('date');
  let date = isIsoDay(dateParam) ? dateParam : CAMPUS_TODAY;
  if (eventId && !isIsoDay(dateParam)) date = eventById.get(eventId)?.date ?? date;
  date = clampDay(date, EVENTS_RANGE.first, EVENTS_RANGE.last);
  const cats = new Set(
    (params.get('cat') ?? '')
      .split(',')
      .filter((id): id is EventCategoryId => categoryById.has(id as EventCategoryId)),
  );
  return { view, date, cats, q: params.get('q') ?? '', eventId };
}

function urlFor(next: State): string {
  const params = new URLSearchParams();
  if (next.view !== 'month') params.set('view', next.view);
  if (next.date !== CAMPUS_TODAY) params.set('date', next.date);
  if (next.cats.size) params.set('cat', eventCategories.filter((c) => next.cats.has(c.id)).map((c) => c.id).join(','));
  if (next.q.trim()) params.set('q', next.q.trim());
  if (next.eventId) params.set('event', next.eventId);
  const query = params.toString().replace(/%2C/g, ',');
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

function writeUrl(mode: 'push' | 'replace') {
  const next = urlFor(state);
  if (next === `${window.location.pathname}${window.location.search}`) return;
  if (mode === 'push') window.history.pushState(null, '', next);
  else window.history.replaceState(null, '', next);
}

function eventUrl(id: string): string {
  return new URL(`${u('/events/')}?event=${encodeURIComponent(id)}`, window.location.origin).href;
}

/* ---------- Saved events ---------- */

function loadSaved(): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((id): id is string => typeof id === 'string' && eventById.has(id)));
  } catch {
    return new Set();
  }
}

function persistSaved() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]));
  } catch {
    // Private browsing can refuse storage; the stars still work for this visit.
  }
}

function toggleSaved(id: string) {
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  persistSaved();
  syncSaved(id);
}

function syncSaved(changed?: string) {
  if (savedCount) {
    savedCount.textContent = String(saved.size);
    savedCount.classList.toggle('is-empty', saved.size === 0);
    if (changed) {
      savedCount.classList.remove('is-bumped');
      void savedCount.offsetWidth;
      savedCount.classList.add('is-bumped');
    }
  }
  for (const star of document.querySelectorAll<HTMLButtonElement>('[data-star]')) {
    const id = star.dataset.star ?? '';
    const on = saved.has(id);
    star.setAttribute('aria-pressed', String(on));
    if (id === changed) {
      star.classList.remove('is-popping');
      void star.offsetWidth;
      star.classList.add('is-popping');
    }
  }
  for (const item of document.querySelectorAll<HTMLElement>('[data-event]')) {
    item.classList.toggle('is-saved', saved.has(item.dataset.event ?? ''));
  }
  if (modal?.open && state.eventId) syncModalSave(state.eventId, changed === state.eventId);
}

/* ---------- Filtering ---------- */

function filtersActive(): boolean {
  return state.cats.size > 0 || state.q.trim() !== '';
}

function matches(event: CampusEvent): boolean {
  if (state.cats.size && !state.cats.has(event.category)) return false;
  const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [event.title, event.description, locationLabel(event), categoryLabel(event)].join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function filteredEvents(): CampusEvent[] {
  return campusEvents.filter(matches).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function eventsByDay(events: CampusEvent[]): Map<string, CampusEvent[]> {
  const map = new Map<string, CampusEvent[]>();
  for (const event of events) {
    for (const day of eventDays(event)) {
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.start ?? '00:00').localeCompare(b.start ?? '00:00') || a.title.localeCompare(b.title));
  }
  return map;
}

function overlaps(event: CampusEvent, first: string, last: string): boolean {
  const end = event.endDate ?? event.date;
  return event.date <= last && end >= first;
}

function highlight(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const terms = state.q.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    fragment.append(text);
    return fragment;
  }
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  for (const part of text.split(pattern)) {
    if (!part) continue;
    if (terms.some((term) => term.toLowerCase() === part.toLowerCase())) fragment.append(h('mark', {}, part));
    else fragment.append(part);
  }
  return fragment;
}

/* ---------- Period ---------- */

function period(): { first: string; last: string; label: string } {
  if (state.view === 'week') {
    const first = startOfWeek(state.date);
    return { first, last: addDays(first, 6), label: formatWeekRange(first) };
  }
  if (state.view === 'mine') return { first: EVENTS_RANGE.first, last: EVENTS_RANGE.last, label: 'My events' };
  const first = startOfMonth(state.date);
  return { first, last: addDays(addMonths(first, 1), -1), label: formatMonthYear(first) };
}

function step(direction: 1 | -1) {
  const next =
    state.view === 'week' ? addDays(state.date, direction * 7) : startOfMonth(addMonths(state.date, direction));
  const clamped = clampDay(next, EVENTS_RANGE.first, EVENTS_RANGE.last);
  if (clamped === state.date) return;
  state.date = clamped;
  writeUrl('push');
  render(direction === 1 ? 'next' : 'prev');
}

/* ---------- Render ---------- */

function render(motion: Motion = 'none') {
  if (!panel) return;
  closePopover(false);
  const events = filteredEvents();
  const range = period();

  for (const tab of tabs) {
    const selected = tab.dataset.view === state.view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) panel.setAttribute('aria-labelledby', tab.id);
  }
  moveTabThumb();

  if (rangeHeading) rangeHeading.textContent = range.label;
  app?.setAttribute('data-view', state.view);
  const navLabel = state.view === 'week' ? 'week' : 'month';
  if (prevButton) {
    prevButton.setAttribute('aria-label', `Previous ${navLabel}`);
    prevButton.disabled = state.view === 'mine' || range.first <= EVENTS_RANGE.first;
  }
  if (nextButton) {
    nextButton.setAttribute('aria-label', `Next ${navLabel}`);
    nextButton.disabled = state.view === 'mine' || range.last >= EVENTS_RANGE.last;
  }
  if (todayButton) todayButton.disabled = state.view === 'mine';

  for (const chip of chips) {
    const id = chip.dataset.cat;
    const pressed = id === 'all' ? state.cats.size === 0 : state.cats.has(id as EventCategoryId);
    chip.setAttribute('aria-pressed', String(pressed));
  }
  if (searchInput && searchInput.value !== state.q) searchInput.value = state.q;

  updateStatus(events, range);

  let view: HTMLElement;
  if (state.view === 'week') view = buildWeek(events);
  else if (state.view === 'agenda') view = buildAgenda(events, range.first, range.last, false);
  else if (state.view === 'mine') view = buildMine(events);
  else view = buildMonth(events);
  panel.replaceChildren(view);
  syncSaved();
  animate(motion);
}

function animate(motion: Motion) {
  if (!panel || motion === 'none' || prefersReducedMotion()) return;
  panel.classList.remove('ev-anim-fade', 'ev-anim-next', 'ev-anim-prev');
  void panel.offsetWidth;
  panel.classList.add(`ev-anim-${motion}`);
}

function updateStatus(events: CampusEvent[], range: { first: string; last: string; label: string }) {
  if (!statusLine) return;
  if (state.view === 'mine') {
    const mine = events.filter((event) => saved.has(event.id)).length;
    statusLine.textContent =
      saved.size === 0
        ? 'No saved events yet.'
        : filtersActive()
          ? `${mine} of ${saved.size} saved events match.`
          : `${pluralEvents(saved.size)} saved in this browser.`;
    return;
  }
  const inRange = events.filter((event) => overlaps(event, range.first, range.last)).length;
  const where = state.view === 'week' ? `the week of ${range.label}` : range.label;
  if (!filtersActive()) {
    statusLine.textContent = `${pluralEvents(inRange)} in ${where}.`;
    return;
  }
  const across = events.length;
  statusLine.textContent = `${inRange} matching ${inRange === 1 ? 'event' : 'events'} in ${where} · ${across} from January to March.`;
}

/* ---------- Month view ---------- */

function buildMonth(events: CampusEvent[]): HTMLElement {
  const byDay = eventsByDay(events);
  const first = startOfMonth(state.date);
  const gridStart = startOfWeek(first);
  const monthLast = addDays(addMonths(first, 1), -1);
  const gridEnd = addDays(startOfWeek(monthLast), 6);

  const wrap = h('div', { class: 'ev-month-wrap' });
  wrap.append(
    h(
      'p',
      { id: 'ev-grid-help', class: 'sr-only' },
      'Use the arrow keys to move between days, Page Up and Page Down to change month, and Enter to list a day’s events.',
    ),
  );
  const grid = h('div', {
    class: 'ev-month',
    role: 'grid',
    'aria-labelledby': 'ev-range',
    'aria-describedby': 'ev-grid-help',
  });
  const head = h('div', { class: 'ev-month-row ev-month-head', role: 'row' });
  for (const name of WEEKDAYS) {
    head.append(h('div', { role: 'columnheader', class: 'ev-weekday' }, h('abbr', { title: name }, name.slice(0, 3))));
  }
  grid.append(head);

  for (let weekStart = gridStart; weekStart <= gridEnd; weekStart = addDays(weekStart, 7)) {
    const row = h('div', { class: 'ev-month-row', role: 'row' });
    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(weekStart, offset);
      row.append(buildDayCell(day, byDay.get(day) ?? [], first));
    }
    grid.append(row);
  }
  wrap.append(grid);
  return wrap;
}

function buildDayCell(day: string, events: CampusEvent[], monthFirst: string): HTMLElement {
  const inMonth = sameMonth(day, monthFirst);
  const inRange = day >= EVENTS_RANGE.first && day <= EVENTS_RANGE.last;
  const isToday = day === CAMPUS_TODAY;
  const selected = day === state.date;
  const labelParts = [formatLongDate(day)];
  if (isToday) labelParts.push('today');
  labelParts.push(events.length ? pluralEvents(events.length) : 'no events');
  const cell = h('div', {
    role: 'gridcell',
    class: [
      'ev-day',
      inMonth ? '' : 'is-outside',
      inRange ? '' : 'is-out-of-range',
      isToday ? 'is-today' : '',
      selected ? 'is-selected' : '',
    ]
      .filter(Boolean)
      .join(' '),
    'data-date': day,
    tabindex: selected ? 0 : -1,
    'aria-selected': String(selected),
    'aria-disabled': inRange ? null : 'true',
  });

  const top = h('div', { class: 'ev-day-top', 'aria-hidden': 'true' }, h('span', { class: 'ev-daynum' }, String(Number(day.slice(8)))));
  if (isToday) top.append(h('span', { class: 'ev-today-tag' }, 'Today'));
  cell.append(h('span', { class: 'sr-only' }, `${labelParts.join(', ')}.`), top);

  if (events.length) {
    const shown = events.length <= CELL_LIMIT ? events : events.slice(0, CELL_LIMIT - 1);
    const list = h('ul', { class: 'ev-cell-events' });
    for (const event of shown) {
      list.append(
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'ev-pill',
              tabindex: -1,
              'data-event': event.id,
              'data-open': event.id,
              style: `--c: ${colorOf(event)}`,
            },
            h('span', { class: 'ev-dot', 'aria-hidden': 'true' }),
            event.start ? h('span', { class: 'ev-pill-time' }, formatClock(event.start).replace(' ', '\u00a0')) : null,
            h('span', { class: 'ev-pill-title' }, event.title),
          ),
        ),
      );
    }
    cell.append(list);
    if (events.length > shown.length) {
      cell.append(
        h(
          'button',
          { type: 'button', class: 'ev-more', tabindex: -1, 'data-more': day, 'aria-haspopup': 'dialog' },
          `+${events.length - shown.length} more`,
        ),
      );
    }
    const dots = h('span', { class: 'ev-cell-dots', 'aria-hidden': 'true' });
    for (const event of events.slice(0, 5)) dots.append(h('span', { class: 'ev-dot', style: `--c: ${colorOf(event)}` }));
    cell.append(dots);
  }
  return cell;
}

function monthCells(): HTMLElement[] {
  return Array.from(panel?.querySelectorAll<HTMLElement>('.ev-day') ?? []);
}

function selectDay(day: string, focus: boolean) {
  const clamped = clampDay(day, EVENTS_RANGE.first, EVENTS_RANGE.last);
  const monthChanged = !sameMonth(clamped, state.date);
  const direction: Motion = clamped > state.date ? 'next' : 'prev';
  state.date = clamped;
  if (monthChanged) {
    writeUrl('push');
    render(direction);
  } else {
    writeUrl('replace');
    for (const cell of monthCells()) {
      const on = cell.dataset.date === clamped;
      cell.classList.toggle('is-selected', on);
      cell.setAttribute('aria-selected', String(on));
      cell.tabIndex = on ? 0 : -1;
    }
  }
  if (focus) panel?.querySelector<HTMLElement>(`.ev-day[data-date="${clamped}"]`)?.focus();
}

function onGridKey(event: KeyboardEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('.ev-day');
  if (!cell || event.target !== cell) return;
  const day = cell.dataset.date ?? state.date;
  const moves: Record<string, () => string> = {
    ArrowLeft: () => addDays(day, -1),
    ArrowRight: () => addDays(day, 1),
    ArrowUp: () => addDays(day, -7),
    ArrowDown: () => addDays(day, 7),
    Home: () => startOfWeek(day),
    End: () => addDays(startOfWeek(day), 6),
    PageUp: () => addMonths(day, -1),
    PageDown: () => addMonths(day, 1),
  };
  const move = moves[event.key];
  if (move) {
    event.preventDefault();
    selectDay(move(), true);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const hasEvents = (eventsByDay(filteredEvents()).get(day) ?? []).length > 0;
    if (hasEvents) openPopover(day, cell);
  }
}

/* ---------- Popover ---------- */

function openPopover(day: string, anchor: HTMLElement) {
  if (!popover || !popoverList || !popoverTitle || !stage) return;
  const events = eventsByDay(filteredEvents()).get(day) ?? [];
  popoverTitle.textContent = formatDayHeading(day);
  popoverList.replaceChildren(
    ...events.map((event) =>
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'ev-pop-item', 'data-event': event.id, 'data-open': event.id, style: `--c: ${colorOf(event)}` },
          h('span', { class: 'ev-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'ev-pop-time' }, formatTimeRange(event.start, event.end)),
          h('span', { class: 'ev-pop-title' }, event.title),
        ),
      ),
    ),
  );
  popoverReturn = anchor.closest<HTMLElement>('.ev-day') ?? anchor;
  popover.hidden = false;
  const cellRect = popoverReturn.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const width = Math.min(Math.max(cellRect.width * 1.9, 300), stageRect.width);
  const left = Math.min(Math.max(cellRect.left - stageRect.left - (width - cellRect.width) / 2, 0), stageRect.width - width);
  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(cellRect.top - stageRect.top - 6, 0)}px`;
  popover.classList.remove('is-entering');
  void popover.offsetWidth;
  popover.classList.add('is-entering');
  syncSaved();
  popoverList.querySelector<HTMLElement>('button')?.focus();
}

function closePopover(restore: boolean) {
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  if (restore && popoverReturn?.isConnected) popoverReturn.focus();
}

/* ---------- Week view ---------- */

type Placed = { event: CampusEvent; column: number; columns: number };

function layoutDay(events: CampusEvent[]): Placed[] {
  const timed = events
    .filter((event) => event.start && event.end)
    .sort((a, b) => minutesOf(a.start!) - minutesOf(b.start!) || minutesOf(b.end!) - minutesOf(a.end!));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const event of timed) {
    const start = minutesOf(event.start!);
    const end = minutesOf(event.end!);
    if (start >= clusterEnd) flush();
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else columnEnds[column] = end;
    const item = { event, column, columns: 1 };
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return placed;
}

function buildWeek(events: CampusEvent[]): HTMLElement {
  const byDay = eventsByDay(events);
  const first = startOfWeek(state.date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const hours = HOUR_END - HOUR_START;
  const wrap = h('div', { class: 'ev-week', style: `--hours: ${hours}` });

  const head = h('div', { class: 'ev-week-head', 'aria-hidden': 'true' }, h('span', { class: 'ev-week-corner' }));
  for (const day of days) {
    head.append(
      h(
        'div',
        {
          class: ['ev-week-dayhead', day === CAMPUS_TODAY ? 'is-today' : '', day === state.date ? 'is-selected' : '']
            .filter(Boolean)
            .join(' '),
        },
        h('span', { class: 'ev-week-dow' }, formatWeekdayShort(day)),
        h('span', { class: 'ev-week-num' }, String(Number(day.slice(8)))),
        day === CAMPUS_TODAY ? h('span', { class: 'ev-today-tag' }, 'Today') : null,
      ),
    );
  }
  wrap.append(head);

  const allDay = h('div', { class: 'ev-week-allday' }, h('span', { class: 'ev-week-allday-label', 'aria-hidden': 'true' }, 'All day'));
  for (const day of days) {
    const list = h('ul', { class: 'ev-week-allday-cell', 'aria-label': `All-day events, ${formatDayHeading(day)}` });
    for (const event of (byDay.get(day) ?? []).filter((item) => !item.start)) {
      list.append(
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'ev-allday-pill', 'data-event': event.id, 'data-open': event.id, style: `--c: ${colorOf(event)}` },
            h('span', { class: 'ev-dot', 'aria-hidden': 'true' }),
            h('span', {}, event.title),
          ),
        ),
      );
    }
    allDay.append(list);
  }
  wrap.append(allDay);

  const body = h('div', { class: 'ev-week-body' });
  const gutter = h('div', { class: 'ev-week-gutter', 'aria-hidden': 'true' });
  for (let hour = HOUR_START; hour < HOUR_END; hour += 1) {
    gutter.append(h('span', { class: 'ev-hour' }, formatClock(`${String(hour).padStart(2, '0')}:00`).replace('noon', '12 p.m.')));
  }
  body.append(gutter);

  for (const day of days) {
    const column = h('section', {
      class: ['ev-week-col', day === CAMPUS_TODAY ? 'is-today' : ''].filter(Boolean).join(' '),
      'aria-label': `${formatDayHeading(day)}${day === CAMPUS_TODAY ? ', today' : ''}`,
    });
    const list = h('ul', { class: 'ev-week-list' });
    for (const { event, column: col, columns } of layoutDay(byDay.get(day) ?? [])) {
      const start = minutesOf(event.start!) - HOUR_START * 60;
      const length = minutesOf(event.end!) - minutesOf(event.start!);
      const total = hours * 60;
      list.append(
        h(
          'li',
          {
            class: 'ev-block-slot',
            style: [
              `top: ${(start / total) * 100}%`,
              `height: ${(length / total) * 100}%`,
              `left: calc(${(col / columns) * 100}% + 2px)`,
              `width: calc(${100 / columns}% - 4px)`,
            ].join('; '),
          },
          h(
            'button',
            {
              type: 'button',
              class: ['ev-block', length < 60 ? 'is-short' : ''].filter(Boolean).join(' '),
              'data-event': event.id,
              'data-open': event.id,
              style: `--c: ${colorOf(event)}`,
            },
            h('span', { class: 'ev-block-time' }, formatTimeRange(event.start, event.end)),
            h('strong', { class: 'ev-block-title' }, event.title),
            h('span', { class: 'ev-block-loc' }, locationById.get(event.location)?.name ?? ''),
          ),
        ),
      );
    }
    column.append(list);
    body.append(column);
  }
  wrap.append(body);
  return h('div', { class: 'ev-week-scroll' }, wrap);
}

/* ---------- Agenda and My events ---------- */

function buildAgendaItem(event: CampusEvent): HTMLElement {
  return h(
    'li',
    { class: 'ev-agenda-item', style: `--c: ${colorOf(event)}` },
    h(
      'button',
      { type: 'button', class: 'ev-agenda-main', 'data-event': event.id, 'data-open': event.id },
      h('span', { class: 'ev-agenda-time' }, formatTimeRange(event.start, event.end)),
      h(
        'span',
        { class: 'ev-agenda-text' },
        h('span', { class: 'ev-agenda-cat' }, h('span', { class: 'ev-dot', 'aria-hidden': 'true' }), categoryLabel(event)),
        h('strong', { class: 'ev-agenda-title' }, highlight(event.title)),
        h('span', { class: 'ev-agenda-loc' }, highlight(locationLabel(event))),
      ),
    ),
    starButton(event),
  );
}

function starButton(event: CampusEvent): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'ev-star',
      'data-star': event.id,
      'aria-pressed': String(saved.has(event.id)),
      'aria-label': `Save ${event.title}`,
    },
    starSvg(),
  );
}

function starSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ev-star-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z');
  svg.append(path);
  return svg;
}

function buildAgenda(events: CampusEvent[], first: string, last: string, showMonths: boolean): HTMLElement {
  const byDay = eventsByDay(events);
  const days = [...byDay.keys()].filter((day) => day >= first && day <= last).sort();
  const wrap = h('div', { class: 'ev-agenda' });
  if (!days.length) {
    wrap.append(emptyState());
    return wrap;
  }
  let month = '';
  for (const day of days) {
    if (showMonths && day.slice(0, 7) !== month) {
      month = day.slice(0, 7);
      wrap.append(h('h3', { class: 'ev-agenda-month' }, formatMonthYear(day)));
    }
    const isToday = day === CAMPUS_TODAY;
    const section = h(
      'section',
      { class: ['ev-agenda-day', isToday ? 'is-today' : '', day === state.date ? 'is-selected' : ''].filter(Boolean).join(' ') },
      h(
        'div',
        { class: 'ev-agenda-date', 'aria-hidden': 'true' },
        h('span', { class: 'ev-agenda-dow' }, formatWeekdayShort(day)),
        h('span', { class: 'ev-agenda-num' }, String(Number(day.slice(8)))),
      ),
    );
    const body = h(
      'div',
      { class: 'ev-agenda-body' },
      h(
        showMonths ? 'h4' : 'h3',
        { class: 'ev-agenda-heading' },
        formatDayHeading(day),
        isToday ? h('span', { class: 'ev-today-tag' }, 'Today') : null,
      ),
      h('ul', { class: 'ev-agenda-list' }, ...(byDay.get(day) ?? []).map(buildAgendaItem)),
    );
    section.append(body);
    wrap.append(section);
  }
  return wrap;
}

function buildMine(events: CampusEvent[]): HTMLElement {
  const mine = events.filter((event) => saved.has(event.id));
  const wrap = h('div', { class: 'ev-mine' });
  if (saved.size === 0) {
    wrap.append(
      h(
        'div',
        { class: 'ev-empty' },
        h('span', { class: 'ev-empty-icon', 'aria-hidden': 'true' }, starSvg()),
        h('h3', {}, 'No saved events yet'),
        h('p', {}, 'Select the star on any event to keep it here. Saved events stay in this browser, so nothing is sent anywhere.'),
      ),
    );
    return wrap;
  }
  const bar = h(
    'div',
    { class: 'ev-mine-bar' },
    h('p', {}, `${pluralEvents(saved.size)} saved. Add them all to your calendar app at once.`),
    h('button', { type: 'button', class: 'btn btn-navy', 'data-ics-all': true }, 'Download all (.ics)'),
  );
  wrap.append(bar);
  if (!mine.length) {
    wrap.append(emptyState());
    return wrap;
  }
  wrap.append(buildAgenda(mine, EVENTS_RANGE.first, EVENTS_RANGE.last, true));
  return wrap;
}

function emptyState(): HTMLElement {
  return h(
    'div',
    { class: 'ev-empty' },
    h('h3', {}, 'No events match'),
    h('p', {}, filtersActive() ? 'Try another word, or show every category.' : 'Nothing is scheduled in this period.'),
    filtersActive() ? h('button', { type: 'button', class: 'btn btn-ghost', 'data-clear-filters': true }, 'Clear filters') : null,
  );
}

/* ---------- Modal ---------- */

function mapMarkup(locationId: string): string {
  const active = locationById.get(locationId);
  const boxes = new Map<string, (typeof campusLocations)[number]>();
  for (const location of campusLocations) {
    const key = `${location.box.x},${location.box.y}`;
    if (!boxes.has(key) || location.id === locationId) boxes.set(key, location);
  }
  const buildings = [...boxes.values()]
    .map((location) => {
      const { x, y, w, h: height } = location.box;
      const isActive = active && active.box.x === x && active.box.y === y;
      const isQuad = location.id === 'quad';
      const isField = location.id === 'field';
      return `<g class="ev-map-b${isActive ? ' is-active' : ''}${isQuad ? ' is-quad' : ''}${isField ? ' is-field' : ''}">
        <rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${isField ? 18 : 3}"></rect>
        <text x="${x + w / 2}" y="${y + height - 6}" text-anchor="middle">${escapeXml(location.mapLabel)}</text>
      </g>`;
    })
    .join('');
  const pin = active
    ? `<g class="ev-map-pin" transform="translate(${active.pin.x} ${active.pin.y})">
        <circle class="ev-map-pulse" r="7"></circle>
        <path d="M0 0c-6-8-9-12.5-9-17a9 9 0 0 1 18 0c0 4.5-3 9-9 17z"></path>
        <circle cy="-17" r="3.4" class="ev-map-pin-dot"></circle>
      </g>`
    : '';
  return `<svg viewBox="0 0 400 200" role="img" aria-label="${escapeXml(`Campus map with a pin on ${active?.name ?? 'campus'}`)}">
    <rect class="ev-map-ground" x="0" y="0" width="400" height="200" rx="6"></rect>
    <path class="ev-map-walk" d="M0 63h400M0 133h400M100 0v200M220 0v200M309 0v200"></path>
    <circle class="ev-map-tower" cx="160" cy="88" r="4"></circle>
    ${buildings}
    <path class="ev-map-dome" d="M356 160a10 10 0 0 1 20 0z"></path>
    ${pin}
  </svg>`;
}

function openModal(id: string, push: boolean, returnTo?: HTMLElement | null) {
  const event = eventById.get(id);
  if (!modal || !event) return;
  closePopover(false);
  const category = categoryById.get(event.category);
  const location = locationById.get(event.location);
  if (modalCat) {
    modalCat.replaceChildren(h('span', { class: 'ev-dot', 'aria-hidden': 'true' }), category?.label ?? '');
    modalCat.style.setProperty('--c', category?.color ?? '');
  }
  modal.style.setProperty('--c', category?.color ?? '');
  if (modalTitle) modalTitle.textContent = event.title;
  if (modalWhen) {
    modalWhen.replaceChildren(
      h('span', {}, formatEventDates(event)),
      h('span', { class: 'ev-facts-sub' }, formatTimeRange(event.start, event.end)),
    );
  }
  if (modalWhere) {
    modalWhere.replaceChildren(h('span', {}, location?.name ?? ''));
    if (event.room) modalWhere.append(h('span', { class: 'ev-facts-sub' }, event.room));
  }
  if (modalDesc) modalDesc.textContent = event.description;
  if (modalMap) modalMap.innerHTML = mapMarkup(event.location);
  if (modalMapCaption) modalMapCaption.textContent = location ? `${location.name}: ${location.area}.` : '';
  if (copyStatus) copyStatus.textContent = '';
  syncModalSave(id, false);

  if (returnTo !== undefined) {
    modalReturn = { element: returnTo, selector: returnTo ? `[data-open="${id}"]` : null };
  }
  state.eventId = id;
  if (push) writeUrl('push');
  if (!modal.open) {
    modal.showModal();
    modal.classList.remove('is-entering');
    void modal.offsetWidth;
    modal.classList.add('is-entering');
  }
  modalTitle?.setAttribute('tabindex', '-1');
  modalTitle?.focus();
}

function syncModalSave(id: string, bump: boolean) {
  if (!saveButton || !saveLabel) return;
  const on = saved.has(id);
  saveButton.setAttribute('aria-pressed', String(on));
  saveLabel.textContent = on ? 'Saved' : 'Save';
  if (bump) {
    saveButton.classList.remove('is-popping');
    void saveButton.offsetWidth;
    saveButton.classList.add('is-popping');
  }
}

function onModalClosed() {
  if (state.eventId) {
    state.eventId = null;
    writeUrl('replace');
  }
  const { element, selector } = modalReturn;
  let target: HTMLElement | null = element && element.isConnected ? element : null;
  if (!target && selector) target = panel?.querySelector<HTMLElement>(selector) ?? null;
  if (target?.tabIndex === -1 && target.closest('.ev-day')) target = target.closest<HTMLElement>('.ev-day');
  (target ?? tabs.find((tab) => tab.getAttribute('aria-selected') === 'true'))?.focus();
  modalReturn = { element: null, selector: null };
}

function toIcs(event: CampusEvent): IcsEvent {
  const location = locationById.get(event.location);
  return {
    uid: `${event.id}@events.umars.edu`,
    title: event.title,
    description: `${event.description}\n\nSample listing from the University of Mars demo site.`,
    location: `${[location?.name, event.room].filter(Boolean).join(', ')}, University of Mars, Jezero`,
    category: categoryLabel(event),
    url: eventUrl(event.id),
    date: event.date,
    endDate: event.endDate,
    start: event.start,
    end: event.end,
  };
}

function downloadIcs(events: CampusEvent[], filename: string) {
  const text = buildIcs(events.map(toIcs), {
    stamp: new Date(),
    calendarName: events.length > 1 ? 'My University of Mars events' : undefined,
  });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyLink(id: string) {
  const url = eventUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    if (copyStatus) copyStatus.textContent = 'Link copied.';
  } catch {
    if (copyStatus) copyStatus.textContent = url;
  }
}

/* ---------- Tabs ---------- */

function moveTabThumb() {
  const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
  if (!tablist || !active) return;
  tablist.style.setProperty('--thumb-x', `${active.offsetLeft}px`);
  tablist.style.setProperty('--thumb-w', `${active.offsetWidth}px`);
}

function setView(view: View) {
  if (view === state.view) return;
  state.view = view;
  writeUrl('push');
  render('fade');
}

/* ---------- Wiring ---------- */

function bind() {
  if (!app || !panel) return;

  for (const tab of tabs) {
    tab.addEventListener('click', () => setView(tab.dataset.view as View));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = -1;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === -1) return;
      event.preventDefault();
      setView(tabs[next].dataset.view as View);
      tabs[next].focus();
    });
  }

  prevButton?.addEventListener('click', () => step(-1));
  nextButton?.addEventListener('click', () => step(1));
  todayButton?.addEventListener('click', () => {
    const direction: Motion = CAMPUS_TODAY > state.date ? 'next' : CAMPUS_TODAY < state.date ? 'prev' : 'fade';
    state.date = CAMPUS_TODAY;
    writeUrl('push');
    render(direction);
  });

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const id = chip.dataset.cat;
      if (id === 'all') state.cats.clear();
      else if (state.cats.has(id as EventCategoryId)) state.cats.delete(id as EventCategoryId);
      else state.cats.add(id as EventCategoryId);
      if (state.cats.size === eventCategories.length) state.cats.clear();
      writeUrl('replace');
      render('none');
    });
  }

  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.q = searchInput.value;
      writeUrl('replace');
      render('none');
    }, 140);
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      searchInput.value = '';
      state.q = '';
      writeUrl('replace');
      render('none');
    }
  });

  app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const star = target.closest<HTMLButtonElement>('[data-star]');
    if (star) {
      const id = star.dataset.star ?? '';
      toggleSaved(id);
      if (state.view === 'mine' && !saved.has(id)) {
        const stars = Array.from(panel.querySelectorAll<HTMLElement>('[data-star]'));
        const nextId = stars[stars.indexOf(star) + 1]?.dataset.star ?? stars[stars.indexOf(star) - 1]?.dataset.star;
        render('none');
        (nextId ? panel.querySelector<HTMLElement>(`[data-star="${nextId}"]`) : tabs[3])?.focus();
      }
      return;
    }
    const opener = target.closest<HTMLElement>('[data-open]');
    if (opener) {
      const returnTo = popover?.contains(opener) ? popoverReturn : (opener.closest<HTMLElement>('.ev-day') ?? opener);
      openModal(opener.dataset.open ?? '', true, returnTo);
      return;
    }
    const more = target.closest<HTMLElement>('[data-more]');
    if (more) {
      openPopover(more.dataset.more ?? '', more);
      return;
    }
    if (target.closest('[data-clear-filters]')) {
      state.cats.clear();
      state.q = '';
      writeUrl('replace');
      render('none');
      searchInput?.focus();
      return;
    }
    if (target.closest('[data-ics-all]')) {
      const mine = campusEvents.filter((item) => saved.has(item.id)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      downloadIcs(mine, 'my-university-of-mars-events.ics');
      return;
    }
    const cell = target.closest<HTMLElement>('.ev-day');
    if (cell && cell.getAttribute('aria-disabled') !== 'true') {
      const day = cell.dataset.date ?? state.date;
      const stayInMonth = sameMonth(day, state.date);
      selectDay(day, true);
      if (stayInMonth && window.matchMedia('(max-width: 680px)').matches && cell.querySelector('.ev-cell-dots')) {
        openPopover(day, cell);
      }
    }
  });

  panel.addEventListener('keydown', onGridKey);

  popoverClose?.addEventListener('click', () => closePopover(true));
  popover?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePopover(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = Array.from(popover.querySelectorAll<HTMLElement>('.ev-pop-item'));
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index === -1) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  });
  popover?.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !popover.contains(next) && !modal?.contains(next)) closePopover(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!popover || popover.hidden) return;
    const target = event.target as HTMLElement;
    if (popover.contains(target) || target.closest('[data-more]')) return;
    closePopover(false);
  });
  window.addEventListener('resize', () => {
    closePopover(false);
    moveTabThumb();
  });

  modalClose?.addEventListener('click', () => modal?.close());
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
  modal?.addEventListener('close', onModalClosed);
  icsButton?.addEventListener('click', () => {
    const event = state.eventId ? eventById.get(state.eventId) : null;
    if (event) downloadIcs([event], `${event.id}.ics`);
  });
  saveButton?.addEventListener('click', () => {
    if (state.eventId) toggleSaved(state.eventId);
    if (state.view === 'mine') {
      const keep = modalReturn;
      render('none');
      modalReturn = keep;
    }
  });
  copyButton?.addEventListener('click', () => {
    if (state.eventId) void copyLink(state.eventId);
  });

  window.addEventListener('popstate', () => {
    const previous = state;
    state = readUrl();
    const motion: Motion =
      previous.view !== state.view
        ? 'fade'
        : previous.date === state.date
          ? 'none'
          : state.date > previous.date
            ? 'next'
            : 'prev';
    render(motion);
    if (state.eventId) openModal(state.eventId, false, null);
    else if (modal?.open) {
      modal.close();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    saved = loadSaved();
    if (state.view === 'mine') render('none');
    else syncSaved();
  });

  document.fonts?.ready.then(moveTabThumb).catch(() => undefined);
}

bind();
render('none');
if (state.eventId) openModal(state.eventId, false, null);
