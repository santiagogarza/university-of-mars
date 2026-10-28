import { allRooms, halls } from '../data/rooms.ts';
import type { Floor, Hall, Room } from '../data/rooms.ts';
import {
  STATUS_LABELS,
  bedsLine,
  defaultFilters,
  formatRate,
  isFiltering,
  matchesFilters,
  toggleCompare,
} from '../lib/room-finder.ts';
import type { RoomFilters, RoomType } from '../lib/room-finder.ts';

const finder = document.querySelector<HTMLElement>('#finder');
const ceiling = Number(finder?.dataset.rateCeiling ?? 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const byId = new Map(allRooms.map((room) => [room.id, room]));
const hallById = new Map(halls.map((hall) => [hall.id, hall]));

const state = {
  hall: halls[0]!.id,
  level: 1,
  filters: defaultFilters(ceiling),
  compare: [] as string[],
  active: null as string | null,
  requested: null as string | null,
};

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const stage = $('#plan-stage');
const tooltip = $('#plan-tooltip');
const form = $<HTMLFormElement>('#room-filters');
const rateInput = $<HTMLInputElement>('#filter-rate');
const rateOutput = $<HTMLOutputElement>('#filter-rate-output');
const summary = $('#plan-summary');
const jump = $<HTMLButtonElement>('#plan-jump');
const drawer = $<HTMLDialogElement>('#room-drawer');
const compareDialog = $<HTMLDialogElement>('#compare-dialog');
const tray = $('#compare-tray');

const roomEls = new Map<string, SVGGElement>();
for (const el of document.querySelectorAll<SVGGElement>('.room[data-room]')) {
  roomEls.set(el.dataset.room ?? '', el);
  el.dataset.label = el.getAttribute('aria-label') ?? '';
}

function hallOf(id = state.hall): Hall {
  return hallById.get(id) ?? halls[0]!;
}

function floorOf(hall = hallOf(), level = state.level): Floor {
  return hall.floors.find((floor) => floor.level === level) ?? hall.floors[0]!;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function setText(selector: string, value: string) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function isOpen(room: Room) {
  return room.status !== 'full';
}

function matching(rooms: Room[]) {
  return rooms.filter((room) => matchesFilters(room, state.filters));
}

/* View: hall, floor, and URL. */

function applyView() {
  const hall = hallOf();
  const floor = floorOf(hall);
  for (const svg of document.querySelectorAll<SVGSVGElement>('.plan-svg')) {
    const active = svg.dataset.floor === floor.id;
    svg.toggleAttribute('hidden', !active);
    if (active) svg.classList.remove('is-entering');
    for (const room of svg.querySelectorAll<SVGGElement>('.room')) room.setAttribute('tabindex', active ? '0' : '-1');
    if (active && !reducedMotion.matches) {
      void svg.getBoundingClientRect();
      svg.classList.add('is-entering');
    }
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-hall-option]')) {
    button.setAttribute('aria-pressed', String(button.dataset.hallOption === hall.id));
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="floor"]')) {
    radio.checked = Number(radio.value) === floor.level;
  }
  setText('#plan-heading', hall.name);
  setText('#plan-eyebrow', hall.years);
  const tags = $('#floor-tags');
  if (tags) {
    const chips = [
      floor.quiet ? '<span class="floor-chip floor-chip-quiet">Quiet floor</span>' : '',
      floor.genderInclusive ? '<span class="floor-chip floor-chip-gi">Gender-inclusive</span>' : '',
    ].join('');
    tags.innerHTML = `${chips}<span class="floor-note">${escapeHtml(floor.note)}</span>`;
  }
  hideTooltip();
  const params = new URLSearchParams(window.location.search);
  params.set('hall', hall.id);
  params.set('floor', String(floor.level));
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  applyFilters();
}

/* Filters. */

function readFilters(): RoomFilters {
  const data = new FormData(form ?? undefined);
  return {
    type: (String(data.get('type') ?? 'any') as RoomType | 'any') || 'any',
    maxRate: Number(data.get('maxRate') ?? ceiling),
    accessibleOnly: data.get('accessibleOnly') === 'on',
    quietFloor: data.get('quietFloor') === 'on',
    genderInclusive: data.get('genderInclusive') === 'on',
  };
}

let summaryTimer = 0;

function applyFilters() {
  const filtering = isFiltering(state.filters, ceiling);
  finder?.classList.toggle('is-filtering', filtering);
  for (const [id, el] of roomEls) {
    const room = byId.get(id);
    if (!room) continue;
    const match = matchesFilters(room, state.filters);
    el.classList.toggle('is-dimmed', !match);
    el.setAttribute('aria-label', match ? (el.dataset.label ?? '') : `${el.dataset.label}, does not match filters`);
  }

  for (const hall of halls) {
    const rooms = hall.floors.flatMap((floor) => floor.rooms);
    setText(`[data-hall-count="${hall.id}"]`, String(matching(rooms).filter(isOpen).length));
    setText(
      `[data-hall-count-label="${hall.id}"]`,
      filtering ? 'open rooms match' : 'open rooms',
    );
  }

  const hall = hallOf();
  for (const floor of hall.floors) {
    const open = matching(floor.rooms).filter(isOpen).length;
    setText(`[data-floor-count="${floor.level}"]`, filtering ? `${open} ${open === 1 ? 'match' : 'matches'}` : `${open} open`);
  }

  window.clearTimeout(summaryTimer);
  summaryTimer = window.setTimeout(writeSummary, 250);
}

function writeSummary() {
  if (!summary || !jump) return;
  const hall = hallOf();
  const floor = floorOf(hall);
  const filtering = isFiltering(state.filters, ceiling);
  const total = floor.rooms.length;
  const matched = matching(floor.rooms);
  const open = matched.filter(isOpen).length;
  jump.hidden = true;
  if (!filtering) {
    summary.textContent = `${floor.label}: ${open} of ${total} rooms have open beds. Hover over or tab to a room to preview it.`;
    return;
  }
  summary.textContent = `${floor.label}: ${matched.length} of ${total} rooms match your filters, ${open} with open beds.`;
  if (open > 0) return;
  const elsewhere = hall.floors
    .filter((other) => other.level !== floor.level)
    .map((other) => ({ hall, floor: other, count: matching(other.rooms).filter(isOpen).length }))
    .concat(
      halls
        .filter((other) => other.id !== hall.id)
        .flatMap((other) => other.floors.map((f) => ({ hall: other, floor: f, count: matching(f.rooms).filter(isOpen).length }))),
    )
    .sort((a, b) => b.count - a.count)[0];
  if (elsewhere && elsewhere.count > 0) {
    const where = elsewhere.hall.id === hall.id ? elsewhere.floor.label : `${elsewhere.hall.name}, ${elsewhere.floor.label}`;
    jump.textContent = `Show ${where} (${elsewhere.count} open)`;
    jump.dataset.hall = elsewhere.hall.id;
    jump.dataset.level = String(elsewhere.floor.level);
    jump.hidden = false;
  }
}

/* Tooltip. */

function showTooltip(el: SVGGElement) {
  const room = byId.get(el.dataset.room ?? '');
  if (!room || !tooltip || !stage) return;
  setText('[data-tip="number"]', `Room ${room.number}`);
  setText('[data-tip="type"]', room.type);
  setText('[data-tip="status"]', `${STATUS_LABELS[room.status]} · ${bedsLine(room.beds, room.taken)}`);
  setText('[data-tip="rate"]', `${formatRate(room.rate)} / semester`);
  setText('[data-tip="sqft"]', `${room.sqft} sq ft`);
  tooltip.dataset.status = room.status;
  tooltip.classList.toggle('is-dimmed', el.classList.contains('is-dimmed'));

  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  tooltip.classList.add('is-measuring');
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  tooltip.classList.remove('is-measuring');
  const below = r.top - s.top < th + 16;
  const center = r.left - s.left + stage.scrollLeft + r.width / 2;
  const left = Math.min(Math.max(center, stage.scrollLeft + tw / 2 + 6), stage.scrollLeft + s.width - tw / 2 - 6);
  const top = below ? r.bottom - s.top + 10 : r.top - s.top - 10;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.toggle('is-below', below);
  tooltip.classList.add('is-visible');
}

function hideTooltip() {
  tooltip?.classList.remove('is-visible');
}

/* Drawer. */

function closeWithMotion(dialog: HTMLDialogElement, done?: () => void) {
  if (!dialog.open) return;
  const finish = () => {
    dialog.classList.remove('is-closing');
    dialog.close();
    done?.();
  };
  if (reducedMotion.matches) {
    finish();
    return;
  }
  dialog.classList.add('is-closing');
  let finished = false;
  const once = () => {
    if (finished) return;
    finished = true;
    finish();
  };
  dialog.addEventListener('animationend', once, { once: true });
  window.setTimeout(once, 400);
}

function openDialog(dialog: HTMLDialogElement) {
  dialog.classList.remove('is-closing');
  if (!dialog.open) dialog.showModal();
}

function markActive(id: string | null) {
  for (const el of roomEls.values()) el.classList.toggle('is-active', el.dataset.room === id);
}

function fillDrawer(room: Room) {
  const hall = hallOf(room.hallId);
  setText('#drawer-eyebrow', `${room.hallName} · ${room.floorLabel}`);
  setText('#drawer-title', `Room ${room.number}`);
  setText('#drawer-type', room.type);
  const status = $('#drawer-status');
  if (status) {
    status.dataset.status = room.status;
    status.innerHTML = `<span class="status-dot"></span>${STATUS_LABELS[room.status]} · ${escapeHtml(bedsLine(room.beds, room.taken))}`;
  }
  setText('#drawer-rate', formatRate(room.rate));
  setText('#drawer-sqft', `${room.sqft} sq ft`);
  setText('#drawer-beds', room.beds === 1 ? '1 bed' : `${room.beds - room.taken} of ${room.beds} open`);

  const mates = $('#drawer-roommates');
  if (mates) {
    if (room.beds === 1) mates.textContent = 'None. This is a single.';
    else if (room.roommates.length === 0) mates.textContent = `No one yet. You would be the first of ${room.beds}.`;
    else
      mates.innerHTML = `<ul class="drawer-list">${room.roommates
        .map((mate) => `<li>${escapeHtml(mate)}</li>`)
        .join('')}</ul>`;
  }
  const access = $('#drawer-access');
  if (access) {
    access.innerHTML = room.accessible
      ? `<ul class="drawer-list drawer-list-check">${room.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : 'Standard room. Elevator access to this floor.';
  }
  setText('#drawer-view', room.view);
  const floorTags = [room.quiet ? 'Quiet floor' : '', room.genderInclusive ? 'Gender-inclusive' : ''].filter(Boolean);
  setText('#drawer-floor', floorTags.length ? `${room.floorLabel} · ${floorTags.join(' · ')}` : `${room.floorLabel} · Standard floor`);
  setText('#drawer-amenities', hall.amenities.join(' · '));
  syncDrawerActions(room);
}

function syncDrawerActions(room: Room) {
  const request = $<HTMLButtonElement>('#drawer-request');
  const compare = $<HTMLButtonElement>('#drawer-compare');
  const note = $('#drawer-action-note');
  if (request) {
    request.disabled = room.status === 'full';
    request.textContent = state.requested === room.id ? 'View your request' : 'Request this room';
  }
  if (compare) {
    const inList = state.compare.includes(room.id);
    compare.setAttribute('aria-pressed', String(inList));
    compare.textContent = inList ? 'Remove from compare' : 'Add to compare';
  }
  if (note) note.textContent = room.status === 'full' ? 'This room is full. Rooms marked Available or Limited can be requested.' : '';
}

function showDetails() {
  $('#drawer-details')?.removeAttribute('hidden');
  $('#drawer-actions')?.removeAttribute('hidden');
  const confirm = $('#drawer-confirm');
  confirm?.setAttribute('hidden', '');
  confirm?.classList.remove('is-playing');
  $('#confirm-actions')?.setAttribute('hidden', '');
}

function openDrawer(id: string) {
  const room = byId.get(id);
  if (!room || !drawer) return;
  hideTooltip();
  state.active = id;
  markActive(id);
  fillDrawer(room);
  showDetails();
  openDialog(drawer);
  $<HTMLButtonElement>('#drawer-close')?.focus();
}

function closeDrawer() {
  if (!drawer) return;
  closeWithMotion(drawer, () => {
    markActive(null);
    const id = state.active;
    state.active = null;
    if (id) roomEls.get(id)?.focus({ preventScroll: true });
  });
}

/* Request preview. */

function referenceFor(room: Room) {
  return `RF-${hallOf(room.hallId).short.slice(0, 3).toUpperCase()}-${room.number}`;
}

function showConfirmation(room: Room, replaced: Room | null) {
  setText('#confirm-heading', `Room ${room.number} is on your request`);
  setText('#confirm-detail', `${room.hallName} · ${room.floorLabel} · ${room.type} · ${formatRate(room.rate)} per semester`);
  setText('#confirm-ref', referenceFor(room));
  const replacedNote = $('#confirm-replaced');
  if (replacedNote) {
    replacedNote.hidden = !replaced;
    replacedNote.textContent = replaced ? `This replaces your earlier request for Room ${replaced.number}, ${replaced.hallName}.` : '';
  }
  $('#drawer-details')?.setAttribute('hidden', '');
  $('#drawer-actions')?.setAttribute('hidden', '');
  $('#confirm-actions')?.removeAttribute('hidden');
  const confirm = $('#drawer-confirm');
  if (confirm) {
    confirm.classList.remove('is-playing');
    confirm.removeAttribute('hidden');
    void confirm.offsetWidth;
    confirm.classList.add('is-playing');
  }
  $<HTMLElement>('#confirm-heading')?.focus({ preventScroll: true });
}

function setRequested(id: string | null) {
  state.requested = id;
  for (const el of roomEls.values()) el.classList.toggle('is-requested', el.dataset.room === id);
}

/* Compare. */

function renderCompare() {
  const list = state.compare.map((id) => byId.get(id)).filter((room): room is Room => Boolean(room));
  roomEls.forEach((el, id) => {
    const index = state.compare.indexOf(id);
    if (index === -1) {
      delete el.dataset.compare;
      return;
    }
    el.dataset.compare = String(index + 1);
    const label = el.querySelector('.room-compare text');
    if (label) label.textContent = String(index + 1);
  });
  setText('#compare-count', `${list.length} of 3 rooms`);
  const chips = $('#compare-chips');
  if (chips) {
    chips.innerHTML = list
      .map(
        (room, index) => `<li class="compare-chip" data-status="${room.status}">
          <span class="compare-chip-index">${index + 1}</span>
          <span><strong>Room ${escapeHtml(room.number)}</strong> ${escapeHtml(hallOf(room.hallId).short)} · ${formatRate(room.rate)}</span>
          <button type="button" class="compare-chip-remove" data-remove="${room.id}" aria-label="Remove Room ${escapeHtml(room.number)}, ${escapeHtml(room.hallName)}, from compare">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"></path></svg>
          </button>
        </li>`,
      )
      .join('');
  }
  const open = $<HTMLButtonElement>('#compare-open');
  if (open) {
    open.disabled = list.length < 2;
    open.textContent = list.length < 2 ? 'Add another room' : 'Compare side by side';
  }
  if (tray) {
    const show = list.length > 0;
    tray.dataset.open = String(show);
    tray.toggleAttribute('inert', !show);
    document.body.classList.toggle('has-compare-tray', show);
  }
  if (compareDialog?.open) renderCompareTable();
  const active = state.active ? byId.get(state.active) : null;
  if (active) syncDrawerActions(active);
}

function flashTray() {
  if (!tray) return;
  tray.classList.remove('is-flashing');
  void tray.offsetWidth;
  tray.classList.add('is-flashing');
}

function toggleCompareRoom(id: string) {
  const result = toggleCompare(state.compare, id, 3);
  state.compare = result.list;
  renderCompare();
  const note = $('#drawer-action-note');
  if (result.full) {
    if (note) note.textContent = 'You can compare up to three rooms. Remove one from the tray first.';
    flashTray();
  } else if (result.added) {
    if (note) note.textContent = `Added to compare (${state.compare.length} of 3).`;
    flashTray();
  } else if (note) {
    note.textContent = 'Removed from compare.';
  }
}

function best(list: Room[], value: (room: Room) => number, mode: 'min' | 'max') {
  if (list.length < 2) return new Set<string>();
  const values = list.map(value);
  const target = mode === 'min' ? Math.min(...values) : Math.max(...values);
  if (values.every((v) => v === target)) return new Set<string>();
  return new Set(list.filter((room) => value(room) === target).map((room) => room.id));
}

const perFoot = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function renderCompareTable() {
  const table = $('#compare-table');
  if (!table) return;
  const list = state.compare.map((id) => byId.get(id)).filter((room): room is Room => Boolean(room));
  const cheapest = best(list, (room) => room.rate, 'min');
  const biggest = best(list, (room) => room.sqft, 'max');
  const perShare = (room: Room) => room.rate / (room.sqft / room.beds);
  const value = best(list, perShare, 'min');
  const tag = (show: boolean, text: string) => (show ? ` <span class="best-tag">${text}</span>` : '');
  const row = (label: string, cell: (room: Room) => string) =>
    `<tr><th scope="row">${label}</th>${list.map((room) => `<td>${cell(room)}</td>`).join('')}</tr>`;
  const head = `<thead><tr><td class="compare-corner"></td>${list
    .map(
      (room, index) => `<th scope="col">
        <span class="compare-col-index">${index + 1}</span>
        <span class="compare-col-title">Room ${escapeHtml(room.number)}</span>
        <span class="compare-col-sub">${escapeHtml(room.hallName)} · ${room.floorLabel}</span>
        <span class="compare-col-actions">
          <button type="button" class="linkish" data-details="${room.id}">Details</button>
          <button type="button" class="linkish" data-remove="${room.id}">Remove<span class="sr-only"> Room ${escapeHtml(room.number)}</span></button>
        </span>
      </th>`,
    )
    .join('')}</tr></thead>`;
  const body = [
    row('Status', (room) => `<span class="status-pill" data-status="${room.status}"><span class="status-dot"></span>${STATUS_LABELS[room.status]}</span>`),
    row('Room type', (room) => escapeHtml(room.type)),
    row('Rate per semester', (room) => `<strong>${formatRate(room.rate)}</strong>${tag(cheapest.has(room.id), 'Lowest rate')}`),
    row('Square footage', (room) => `${room.sqft} sq ft${tag(biggest.has(room.id), 'Most space')}`),
    row('Rate per sq ft of your share', (room) => `${perFoot.format(perShare(room))}${tag(value.has(room.id), 'Best value')}`),
    row('Beds', (room) => escapeHtml(bedsLine(room.beds, room.taken))),
    row('Roommates', (room) =>
      room.beds === 1
        ? 'None (single)'
        : room.roommates.length
          ? room.roommates.map((mate) => escapeHtml(mate)).join('<br />')
          : 'No one yet',
    ),
    row('Accessibility', (room) => (room.accessible ? escapeHtml(room.features.join('; ')) : 'Standard room')),
    row('Window view', (room) => escapeHtml(room.view)),
    row('Floor', (room) =>
      [room.quiet ? 'Quiet floor' : '', room.genderInclusive ? 'Gender-inclusive' : ''].filter(Boolean).join(' · ') ||
      'Standard floor',
    ),
    row('', (room) =>
      room.status === 'full'
        ? '<span class="note">Full</span>'
        : `<button type="button" class="btn btn-small" data-request="${room.id}">${state.requested === room.id ? 'View your request' : 'Request this room'}</button>`,
    ),
  ].join('');
  table.innerHTML = `<caption class="sr-only">Comparison of ${list.length} rooms</caption>${head}<tbody>${body}</tbody>`;
}

function requestRoom(room: Room) {
  if (room.status === 'full') return;
  if (state.requested === room.id) {
    showConfirmation(room, null);
    return;
  }
  const previous = state.requested ? (byId.get(state.requested) ?? null) : null;
  setRequested(room.id);
  showConfirmation(room, previous);
  if (compareDialog?.open) renderCompareTable();
}

/* Events. */

document.querySelectorAll<HTMLButtonElement>('[data-hall-option]').forEach((button) => {
  button.addEventListener('click', () => {
    state.hall = button.dataset.hallOption ?? state.hall;
    applyView();
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="floor"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.level = Number(radio.value);
    applyView();
  });
});

form?.addEventListener('input', () => {
  state.filters = readFilters();
  if (rateOutput) rateOutput.textContent = formatRate(state.filters.maxRate);
  if (rateInput) rateInput.style.setProperty('--fill', `${((state.filters.maxRate - Number(rateInput.min)) / (Number(rateInput.max) - Number(rateInput.min))) * 100}%`);
  applyFilters();
});

form?.addEventListener('reset', () => {
  window.setTimeout(() => {
    state.filters = defaultFilters(ceiling);
    if (rateOutput) rateOutput.textContent = formatRate(ceiling);
    rateInput?.style.setProperty('--fill', '100%');
    applyFilters();
  });
});

jump?.addEventListener('click', () => {
  state.hall = jump.dataset.hall ?? state.hall;
  state.level = Number(jump.dataset.level ?? state.level);
  applyView();
});

const roomFrom = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<SVGGElement>('.room[data-room]') : null;

stage?.addEventListener('pointerover', (event) => {
  const el = roomFrom(event.target);
  if (el && event.pointerType !== 'touch') showTooltip(el);
});
stage?.addEventListener('pointerout', (event) => {
  const el = roomFrom(event.target);
  if (el && !el.contains(event.relatedTarget as Node | null)) hideTooltip();
});
stage?.addEventListener('focusin', (event) => {
  const el = roomFrom(event.target);
  if (el?.matches(':focus-visible')) showTooltip(el);
});
stage?.addEventListener('focusout', hideTooltip);
stage?.addEventListener('click', (event) => {
  const el = roomFrom(event.target);
  if (el?.dataset.room) openDrawer(el.dataset.room);
});
stage?.addEventListener('keydown', (event) => {
  const el = roomFrom(event.target);
  if (!el?.dataset.room) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openDrawer(el.dataset.room);
  }
});

$('#drawer-close')?.addEventListener('click', closeDrawer);
drawer?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDrawer();
});
drawer?.addEventListener('click', (event) => {
  if (event.target === drawer) closeDrawer();
});

$('#drawer-request')?.addEventListener('click', () => {
  const room = state.active ? byId.get(state.active) : null;
  if (room) requestRoom(room);
});
$('#drawer-compare')?.addEventListener('click', () => {
  if (state.active) toggleCompareRoom(state.active);
});
$('#confirm-done')?.addEventListener('click', closeDrawer);
$('#confirm-withdraw')?.addEventListener('click', () => {
  const room = state.active ? byId.get(state.active) : null;
  setRequested(null);
  if (room) {
    syncDrawerActions(room);
    showDetails();
    const note = $('#drawer-action-note');
    if (note) note.textContent = `Request for Room ${room.number} withdrawn.`;
    $<HTMLButtonElement>('#drawer-request')?.focus();
  }
});

tray?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-remove]') : null;
  if (target?.dataset.remove) toggleCompareRoom(target.dataset.remove);
});
tray?.addEventListener('animationend', () => tray.classList.remove('is-flashing'));

$('#compare-clear')?.addEventListener('click', () => {
  state.compare = [];
  renderCompare();
});

$('#compare-open')?.addEventListener('click', () => {
  if (!compareDialog || state.compare.length < 2) return;
  renderCompareTable();
  openDialog(compareDialog);
  $<HTMLButtonElement>('#compare-close')?.focus();
});

const closeCompare = (done?: () => void) => compareDialog && closeWithMotion(compareDialog, done);
$('#compare-close')?.addEventListener('click', () => closeCompare());
compareDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeCompare();
});
compareDialog?.addEventListener('click', (event) => {
  if (event.target === compareDialog) {
    closeCompare();
    return;
  }
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-remove],[data-details],[data-request]') : null;
  if (!target) return;
  if (target.dataset.remove) {
    toggleCompareRoom(target.dataset.remove);
    if (state.compare.length < 2) closeCompare();
    return;
  }
  const id = target.dataset.details ?? target.dataset.request ?? '';
  const room = byId.get(id);
  if (!room) return;
  const wantsRequest = Boolean(target.dataset.request);
  closeCompare(() => {
    state.hall = room.hallId;
    state.level = Number(room.floorId.split('-').pop());
    applyView();
    openDrawer(room.id);
    if (wantsRequest) requestRoom(room);
  });
});

/* Start. */

const params = new URLSearchParams(window.location.search);
const startHall = params.get('hall');
if (startHall && hallById.has(startHall)) state.hall = startHall;
const startLevel = Number(params.get('floor'));
if (floorOf(hallOf(), startLevel).level === startLevel) state.level = startLevel;
if (form) form.reset();
rateInput?.style.setProperty('--fill', '100%');
applyView();
renderCompare();
