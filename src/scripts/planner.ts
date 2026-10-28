import { COURSES, SAMPLE_RECORD, TERM } from '../data/courses';
import type { Course, DayCode, Section } from '../data/courses';
import {
  DAY_ORDER,
  buildIcs,
  checkPrereqs,
  conflictKey,
  creditState,
  dayLong,
  describeConflict,
  findConflicts,
  formatRange,
  formatTime,
  generateSchedules,
  groupConflicts,
  meetingLabel,
  placements,
  requirementLabel,
  scheduleStats,
  sectionMatches,
  sectionsConflict,
  sortSchedules,
  whereLabel,
} from '../lib/planner';
import type { Entry, Period, Pick, Placement, SortKey } from '../lib/planner';

const STORAGE_KEY = 'um-course-plan';
const GRID_START = 8 * 60;
const GRID_END = 21 * 60;
/** Keep in step with --hour in planner.css (48px per hour). */
const PX_PER_MIN = 0.8;
const METER_MAX = 21;
const PALETTE = ['#6b2430', '#1b3048', '#1f5a5e', '#8e3b2e', '#2f5d46', '#5b2a5e', '#24486a', '#6a4a1f', '#7a2848', '#3d4a5c'];

type StoredPick = Pick & { color: number };
type ColoredEntry = Entry & { color: number };
type Generator = {
  courses: Course[];
  colors: number[];
  raw: Section[][];
  list: Section[][];
  index: number;
  sort: SortKey;
  openOnly: boolean;
  truncated: boolean;
  blockers: string[];
};
type Preview = { code: string; target: string | null };

const byCode = new Map(COURSES.map((course) => [course.code, course]));

const state: { picks: StoredPick[]; completed: string[] } = { picks: [], completed: [...SAMPLE_RECORD] };
let generator: Generator | null = null;
let preview: Preview | null = null;
let dragging = false;
let undoPicks: StoredPick[] | null = null;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const root = document.querySelector<HTMLElement>('[data-planner]');

if (root) {
  const filtersForm = el<HTMLFormElement>('catalog-filters');
  const courseList = el<HTMLUListElement>('course-list');
  const catalogCount = el('catalog-count');
  const catalogEmpty = el('catalog-empty');
  const saveStatus = el('save-status');
  const creditTotal = el('credit-total');
  const creditUnit = el('credit-unit');
  const creditMeter = el('credit-meter');
  const creditStateText = el('credit-state');
  const creditsBox = el('credits');
  const generateBtn = el<HTMLButtonElement>('generate');
  const exportBtn = el<HTMLButtonElement>('export-ics');
  const clearBtn = el<HTMLButtonElement>('clear-plan');
  const genBox = el('generator');
  const genCount = el('gen-count');
  const genStats = el('gen-stats');
  const genProgress = el('gen-progress');
  const genPrev = el<HTMLButtonElement>('gen-prev');
  const genNext = el<HTMLButtonElement>('gen-next');
  const genSort = el<HTMLSelectElement>('gen-sort');
  const genOpen = el<HTMLInputElement>('gen-open');
  const genApply = el<HTMLButtonElement>('gen-apply');
  const genClose = el<HTMLButtonElement>('gen-close');
  const alerts = el<HTMLUListElement>('alerts');
  const week = el('week');
  const weekGrid = el('week-grid');
  const ghostLayer = el('week-ghosts');
  const blockLayer = el<HTMLUListElement>('week-blocks');
  const conflictLayer = el('week-conflicts');
  const weekEmpty = el('week-empty');
  const planList = el<HTMLOListElement>('plan-list');
  const planEmpty = el('plan-empty');
  const planHeading = el('plan-heading');
  const record = el<HTMLDetailsElement>('record');
  const recordList = el<HTMLUListElement>('record-list');
  const recordCount = el('record-count');
  const recordForm = el<HTMLFormElement>('record-add');
  const recordInput = el<HTMLInputElement>('record-input');
  const recordReset = el<HTMLButtonElement>('record-reset');
  const live = el('planner-live');

  const cards = new Map<string, HTMLElement>();
  for (const card of courseList.querySelectorAll<HTMLElement>('.course-card')) {
    if (card.dataset.code) cards.set(card.dataset.code, card);
  }
  const blocks = new Map<string, HTMLLIElement>();
  let reorderTimer = 0;

  // ---------- state ----------

  function sectionOf(course: Course, id: string): Section {
    return course.sections.find((section) => section.id === id) ?? course.sections[0]!;
  }

  function planEntries(): ColoredEntry[] {
    return state.picks.flatMap((pick) => {
      const course = byCode.get(pick.code);
      return course ? [{ course, section: sectionOf(course, pick.section), color: pick.color }] : [];
    });
  }

  function shownEntries(): ColoredEntry[] {
    if (generator && generator.list.length) {
      const sections = generator.list[generator.index]!;
      return generator.courses.map((course, index) => ({
        course,
        section: sections[index]!,
        color: generator!.colors[index]!,
      }));
    }
    return planEntries();
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { picks?: unknown; completed?: unknown };
      if (Array.isArray(saved.picks)) {
        state.picks = saved.picks.flatMap((item: unknown, index) => {
          if (!item || typeof item !== 'object') return [];
          const { code, section, color } = item as Record<string, unknown>;
          const course = typeof code === 'string' ? byCode.get(code) : undefined;
          if (!course || typeof section !== 'string') return [];
          if (!course.sections.some((option) => option.id === section)) return [];
          return [{ code: course.code, section, color: typeof color === 'number' ? color : index }];
        });
      }
      if (Array.isArray(saved.completed)) {
        state.completed = saved.completed.filter((code): code is string => typeof code === 'string');
      }
    } catch {
      state.picks = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, term: TERM.name, picks: state.picks, completed: state.completed }),
      );
      paintSaveStatus();
    } catch {
      saveStatus.textContent = 'This browser is not saving the plan.';
    }
  }

  function paintSaveStatus() {
    saveStatus.replaceChildren();
    if (undoPicks) {
      saveStatus.append('Plan cleared. ');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'linkish';
      button.textContent = 'Undo';
      button.addEventListener('click', () => {
        state.picks = undoPicks ?? [];
        undoPicks = null;
        commit();
        announce(`Restored ${plural(state.picks.length, 'course')}.`);
        generateBtn.focus();
      });
      saveStatus.append(button);
      return;
    }
    const icon = document.createElement('span');
    icon.className = 'save-dot';
    icon.setAttribute('aria-hidden', 'true');
    saveStatus.append(
      icon,
      state.picks.length ? `Saved in this browser · ${plural(state.picks.length, 'course')}` : 'Saved in this browser',
    );
  }

  function commit() {
    save();
    render();
  }

  function announce(message: string) {
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = message;
    }, 40);
  }

  function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
  }

  // ---------- filters ----------

  function readFilters() {
    const data = new FormData(filtersForm);
    return {
      query: String(data.get('q') ?? '')
        .trim()
        .toLowerCase(),
      dept: String(data.get('dept') ?? ''),
      open: data.get('open') === 'on',
      levels: new Set(data.getAll('level').map((value) => Number(value))),
      days: new Set(data.getAll('day').map(String) as DayCode[]),
      periods: new Set(data.getAll('period').map(String) as Period[]),
    };
  }

  function haystack(course: Course): string {
    const people = course.sections.map((section) => section.instructor);
    const rooms = course.sections.flatMap((section) => section.meetings.map(whereLabel));
    return [course.code, course.code.replace(' ', ''), course.title, course.summary, ...people, ...rooms]
      .join(' ')
      .toLowerCase();
  }
  const haystacks = new Map(COURSES.map((course) => [course.code, haystack(course)]));

  function applyFilters() {
    const filters = readFilters();
    const tokens = filters.query.split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const course of COURSES) {
      const card = cards.get(course.code);
      if (!card) continue;
      const text = haystacks.get(course.code) ?? '';
      const level = Math.min(400, Math.floor(course.number / 100) * 100);
      const sectionHits = course.sections.map((section) =>
        sectionMatches(section, { days: filters.days, periods: filters.periods, openOnly: filters.open }),
      );
      const visible =
        tokens.every((token) => text.includes(token)) &&
        (!filters.dept || course.dept === filters.dept) &&
        filters.levels.has(level) &&
        sectionHits.some(Boolean);
      card.hidden = !visible;
      card.querySelectorAll<HTMLElement>('[data-section]').forEach((row, index) => {
        row.classList.toggle('is-dim', !sectionHits[index]);
      });
      if (visible) shown += 1;
    }
    catalogCount.textContent = shown === COURSES.length ? `${COURSES.length} courses` : `${shown} of ${COURSES.length} courses`;
    catalogEmpty.hidden = shown > 0;
  }

  // ---------- plan edits ----------

  function chooseSection(course: Course): Section {
    const filters = readFilters();
    const others = planEntries().filter((entry) => entry.course.code !== course.code);
    const fits = (section: Section) => !others.some((entry) => sectionsConflict(entry.section, section));
    const matches = (section: Section) =>
      sectionMatches(section, { days: filters.days, periods: filters.periods, openOnly: true });
    const tiers: ((section: Section) => boolean)[] = [
      (section) => matches(section) && fits(section),
      (section) => section.seats > 0 && fits(section),
      fits,
      (section) => section.seats > 0,
    ];
    for (const tier of tiers) {
      const found = course.sections.find(tier);
      if (found) return found;
    }
    return course.sections[0]!;
  }

  function nextColor(): number {
    const used = new Set(state.picks.map((pick) => pick.color));
    let color = 0;
    while (used.has(color)) color += 1;
    return color;
  }

  function sectionSummary(section: Section): string {
    return section.meetings
      .map((meeting) => `${meeting.kind === 'Lecture' ? '' : `${meeting.kind} `}${meetingLabel(meeting)}`)
      .join(', ');
  }

  function conflictNote(code: string): string {
    const clashes = groupConflicts(findConflicts(planEntries())).filter(
      (group) => group.first.course.code === code || group.second.course.code === code,
    );
    if (!clashes.length) return '';
    const names = [
      ...new Set(clashes.map((group) => (group.first.course.code === code ? group.second : group.first).course.code)),
    ];
    return ` Time conflict with ${names.join(' and ')}.`;
  }

  function addCourse(code: string, sectionId?: string) {
    const course = byCode.get(code);
    if (!course) return;
    applyGenerated(false);
    generator = null;
    undoPicks = null;
    const existing = state.picks.find((pick) => pick.code === code);
    const section = sectionId ? sectionOf(course, sectionId) : chooseSection(course);
    if (existing) {
      if (existing.section === section.id) return;
      existing.section = section.id;
      commit();
      announce(`Moved ${code} to section ${section.id}, ${sectionSummary(section)}.${conflictNote(code)}`);
      return;
    }
    state.picks.push({ code, section: section.id, color: nextColor() });
    commit();
    announce(
      `Added ${code} ${course.title}, section ${section.id}, ${sectionSummary(section)}. ` +
        `${plural(totalCredits(planEntries()), 'credit')} total.${conflictNote(code)}`,
    );
  }

  function removeCourse(code: string) {
    const index = state.picks.findIndex((pick) => pick.code === code);
    if (index < 0) return;
    applyGenerated(false);
    generator = null;
    undoPicks = null;
    state.picks.splice(index, 1);
    commit();
    announce(`Removed ${code}. ${plural(totalCredits(planEntries()), 'credit')} total.`);
  }

  function setSection(code: string, sectionId: string) {
    const pick = state.picks.find((item) => item.code === code);
    if (!pick) return;
    if (generator) {
      // Keep the generated choice the student was looking at, then apply the edit on top of it.
      applyGenerated(false);
    }
    pick.section = sectionId;
    commit();
    const course = byCode.get(code)!;
    announce(`${code} is now section ${sectionId}, ${sectionSummary(sectionOf(course, sectionId))}.${conflictNote(code)}`);
  }

  function totalCredits(entries: Entry[]): number {
    return entries.reduce((sum, entry) => sum + entry.course.credits, 0);
  }

  // ---------- calendar ----------

  type Laid = Placement & { key: string; color: number; lane: number; lanes: number };

  function layout(entries: ColoredEntry[]): Laid[] {
    const items: Laid[] = entries.flatMap((entry) =>
      placements(entry.course, entry.section).map((placement, index) => ({
        ...placement,
        key: `${entry.course.code}|${index}`,
        color: entry.color,
        lane: 0,
        lanes: 1,
      })),
    );
    for (const day of DAY_ORDER) {
      const list = items.filter((item) => item.day === day).sort((a, b) => a.start - b.start || b.end - a.end);
      let cluster: Laid[] = [];
      let laneEnds: number[] = [];
      let clusterEnd = -1;
      const close = () => {
        for (const item of cluster) item.lanes = laneEnds.length;
        cluster = [];
        laneEnds = [];
      };
      for (const item of list) {
        if (item.start >= clusterEnd) close();
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(item.end);
        } else {
          laneEnds[lane] = item.end;
        }
        item.lane = lane;
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
      }
      close();
    }
    return items;
  }

  function place(node: HTMLElement, day: DayCode, start: number, end: number, lane = 0, lanes = 1) {
    const column = DAY_ORDER.indexOf(day);
    const width = 20 / lanes;
    node.style.top = `${(start - GRID_START) * PX_PER_MIN}px`;
    node.style.height = `${(end - start) * PX_PER_MIN}px`;
    node.style.left = `calc(${column * 20 + lane * width}% + 3px)`;
    node.style.width = `calc(${width}% - 6px)`;
  }

  function renderBlocks(entries: ColoredEntry[]) {
    const laid = layout(entries);
    const conflicts = findConflicts(entries);
    const clashing = new Map<string, Set<string>>();
    for (const conflict of conflicts) {
      for (const [self, other] of [
        [conflict.first, conflict.second],
        [conflict.second, conflict.first],
      ] as const) {
        const key = `${self.course.code}|${self.day}|${self.start}|${self.meeting.kind}`;
        clashing.set(key, (clashing.get(key) ?? new Set()).add(other.course.code));
      }
    }

    const seen = new Set<string>();
    for (const item of laid) {
      seen.add(item.key);
      let li = blocks.get(item.key);
      const isNew = !li;
      if (!li) {
        li = document.createElement('li');
        li.className = 'block is-entering';
        li.dataset.key = item.key;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block-button';
        li.append(button);
        blockLayer.append(li);
        blocks.set(item.key, li);
      }
      li.classList.remove('is-leaving');
      const button = li.querySelector('button')!;
      const others = clashing.get(`${item.course.code}|${item.day}|${item.start}|${item.meeting.kind}`);
      li.dataset.code = item.course.code;
      li.dataset.day = item.day;
      li.dataset.start = String(item.start);
      li.style.setProperty('--c', PALETTE[item.color % PALETTE.length]!);
      li.classList.toggle('has-conflict', Boolean(others));
      li.classList.toggle('is-short', item.end - item.start < 60);
      li.classList.toggle('is-narrow', item.lanes > 1);
      place(li, item.day, item.start, item.end, item.lane, item.lanes);

      const kind = item.meeting.kind === 'Lecture' ? '' : item.meeting.kind;
      button.innerHTML = '';
      const code = document.createElement('span');
      code.className = 'block-code';
      code.textContent = item.course.code;
      if (kind) {
        const tag = document.createElement('span');
        tag.className = 'block-kind';
        tag.textContent = kind;
        code.append(' ', tag);
      }
      const time = document.createElement('span');
      time.className = 'block-time';
      time.textContent = formatRange(item.start, item.end);
      const room = document.createElement('span');
      room.className = 'block-room';
      room.textContent = `${item.meeting.building} ${item.meeting.room} · ${item.section.id}`;
      const more = document.createElement('span');
      more.className = 'sr-only';
      more.textContent =
        `, ${dayLong(item.day)}, ${item.course.title} ${item.meeting.kind.toLowerCase()} in ${whereLabel(item.meeting)}.` +
        (others ? ` Time conflict with ${[...others].join(' and ')}.` : '');
      button.append(code, ' ', time, ' ', room, more);
      if (others) {
        const flag = document.createElement('span');
        flag.className = 'block-flag';
        flag.setAttribute('aria-hidden', 'true');
        flag.textContent = '!';
        button.append(flag);
      }
      if (isNew) {
        const fresh = li;
        requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('is-entering')));
      }
    }

    for (const [key, li] of blocks) {
      if (seen.has(key)) continue;
      blocks.delete(key);
      if (li.contains(document.activeElement)) planHeading.focus();
      li.classList.add('is-leaving');
      window.setTimeout(() => li.remove(), 320);
    }

    // DOM order drives tab order; reorder once blocks have finished moving so the transition is not cut short.
    window.clearTimeout(reorderTimer);
    reorderTimer = window.setTimeout(() => {
      const active = document.activeElement;
      const sorted = [...blocks.values()].sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dataset.day as DayCode) - DAY_ORDER.indexOf(b.dataset.day as DayCode) ||
          Number(a.dataset.start) - Number(b.dataset.start),
      );
      const current = [...blockLayer.children].filter((child) => !child.classList.contains('is-leaving'));
      if (sorted.every((node, index) => current[index] === node)) return;
      for (const node of sorted) blockLayer.append(node);
      if (active instanceof HTMLElement && blockLayer.contains(active)) active.focus({ preventScroll: true });
    }, 650);

    conflictLayer.replaceChildren();
    const numbers = new Map(groupConflicts(conflicts).map((group, index) => [conflictKey(group), index + 1]));
    for (const conflict of conflicts) {
      const zone = document.createElement('div');
      zone.className = 'conflict-zone';
      place(zone, conflict.day, conflict.start, conflict.end);
      const label = document.createElement('span');
      label.textContent = `Conflict ${numbers.get(conflictKey(conflict)) ?? ''}`.trim();
      zone.append(label);
      conflictLayer.append(zone);
    }

    weekEmpty.hidden = laid.length > 0 || dragging;
  }

  function renderGhosts() {
    ghostLayer.replaceChildren();
    week.classList.toggle('is-previewing', Boolean(preview));
    if (!preview) return;
    const course = byCode.get(preview.code);
    if (!course) return;
    const current = shownEntries().find((entry) => entry.course.code === course.code)?.section.id;
    for (const section of course.sections) {
      for (const placement of placements(course, section)) {
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        if (section.id === preview.target) ghost.classList.add('is-target');
        if (section.id === current) ghost.classList.add('is-current');
        if (section.seats <= 0) ghost.classList.add('is-full');
        place(ghost, placement.day, placement.start, placement.end);
        const kind = placement.meeting.kind === 'Lecture' ? '' : ` ${placement.meeting.kind}`;
        ghost.textContent = `${course.code}${kind} · ${section.id}${section.seats <= 0 ? ' · Full' : ''}`;
        ghostLayer.append(ghost);
      }
    }
  }

  function nearestSection(course: Course, day: DayCode, minute: number): string {
    let best = course.sections[0]!.id;
    let bestScore = Infinity;
    for (const section of course.sections) {
      for (const placement of placements(course, section)) {
        const dayGap = Math.abs(DAY_ORDER.indexOf(placement.day) - DAY_ORDER.indexOf(day));
        const timeGap =
          minute < placement.start ? placement.start - minute : minute > placement.end ? minute - placement.end : 0;
        const score = dayGap * 600 + timeGap + (section.seats <= 0 ? 30 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = section.id;
        }
      }
    }
    return best;
  }

  function pointToSlot(event: MouseEvent): { day: DayCode; minute: number } {
    const rect = weekGrid.getBoundingClientRect();
    const column = Math.max(0, Math.min(4, Math.floor(((event.clientX - rect.left) / rect.width) * 5)));
    const minute = GRID_START + (event.clientY - rect.top) / PX_PER_MIN;
    return { day: DAY_ORDER[column]!, minute: Math.max(GRID_START, Math.min(GRID_END, minute)) };
  }

  // ---------- panels ----------

  function renderCredits(entries: Entry[]) {
    const total = totalCredits(entries);
    const status = creditState(total);
    const stats = scheduleStats(entries);
    creditTotal.textContent = String(total);
    creditUnit.textContent = total === 1 ? 'credit' : 'credits';
    creditsBox.dataset.state = entries.length ? status : 'empty';
    creditMeter.style.setProperty('--fill', String(Math.min(total, METER_MAX) / METER_MAX));
    creditMeter.setAttribute('aria-valuenow', String(Math.min(total, METER_MAX)));
    const hours = Math.round((stats.classMinutes / 60) * 10) / 10;
    const inClass = entries.length ? ` · ${hours} hours in class each week` : '';
    let text = '';
    if (status === 'under') {
      text = `${TERM.minCredits - total} more to reach full-time (${TERM.minCredits}–${TERM.maxCredits})`;
    } else if (status === 'full') {
      text = total === TERM.maxCredits ? 'Full-time, at the 18-credit limit' : 'Full-time load';
    } else {
      text = `Over ${TERM.maxCredits}: an overload needs your dean’s approval`;
    }
    creditStateText.textContent = `${text}${inClass}`;
    creditMeter.setAttribute('aria-valuetext', `${total} credits. ${text}.`);
  }

  function alertItem(kind: 'conflict' | 'prereq' | 'seats' | 'ok', title: string, body: string, action?: [string, () => void]) {
    const li = document.createElement('li');
    li.className = `alert alert-${kind}`;
    const icon = document.createElement('span');
    icon.className = 'alert-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title;
    text.append(strong, ` ${body}`);
    li.append(icon, text);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'linkish alert-action';
      button.textContent = action[0];
      button.addEventListener('click', action[1]);
      li.append(button);
    }
    return li;
  }

  function renderAlerts(entries: Entry[]) {
    alerts.replaceChildren();
    if (!entries.length) return;
    const completed = new Set(state.completed);
    const planned = new Set(entries.map((entry) => entry.course.code));
    const items: HTMLLIElement[] = [];
    for (const [index, group] of groupConflicts(findConflicts(entries)).entries()) {
      items.push(
        alertItem(
          'conflict',
          `Conflict ${index + 1}.`,
          describeConflict(group),
          generator ? undefined : ['Find schedules that fit', () => openGenerator()],
        ),
      );
    }
    for (const entry of entries) {
      const check = checkPrereqs(entry.course, completed, planned);
      if (!check.missing.length) continue;
      const needs = check.missing.map(requirementLabel).join(' and ');
      const later = check.plannedOnly.length
        ? ` ${check.plannedOnly.map(requirementLabel).join(' and ')} ${check.plannedOnly.length === 1 ? 'is' : 'are'} in this plan, but must be completed first.`
        : '';
      items.push(
        alertItem(
          'prereq',
          'Missing prerequisite.',
          `${entry.course.code} ${entry.course.title} needs ${needs}, which ${check.missing.length === 1 ? 'is' : 'are'} not on your record.${later}`,
          [
            'Review your record',
            () => {
              record.open = true;
              recordInput.focus();
            },
          ],
        ),
      );
    }
    for (const entry of entries) {
      if (entry.section.seats > 0) continue;
      items.push(
        alertItem(
          'seats',
          'Section full.',
          `${entry.course.code} section ${entry.section.id} has no open seats. Pick another section or join the waitlist in MyUM.`,
        ),
      );
    }
    if (!items.length) {
      items.push(alertItem('ok', 'Looks good.', 'No time conflicts, and every prerequisite is on your record.'));
    }
    alerts.append(...items);
  }

  function renderPlanList(entries: ColoredEntry[]) {
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active?.dataset.focusKey;
    planList.replaceChildren();
    planEmpty.hidden = entries.length > 0;
    const completed = new Set(state.completed);
    const planned = new Set(entries.map((entry) => entry.course.code));
    const clashes = new Set(
      findConflicts(entries).flatMap((conflict) => [conflict.first.course.code, conflict.second.course.code]),
    );
    const planSections = new Map(state.picks.map((pick) => [pick.code, pick.section]));

    for (const entry of entries) {
      const { course, section } = entry;
      const slug = course.code.replace(' ', '-');
      const li = document.createElement('li');
      li.className = 'plan-item';
      li.dataset.code = course.code;
      li.style.setProperty('--c', PALETTE[entry.color % PALETTE.length]!);

      const main = document.createElement('div');
      main.className = 'plan-main';
      const title = document.createElement('p');
      title.className = 'plan-title';
      const strong = document.createElement('strong');
      strong.textContent = course.code;
      title.append(strong, ` ${course.title}`);
      const meta = document.createElement('p');
      meta.className = 'plan-meta';
      meta.textContent = `${plural(course.credits, 'credit')} · ${section.instructor} · ${sectionSummary(section)} · ${whereLabel(section.meetings[0]!)}`;
      const flags = document.createElement('p');
      flags.className = 'plan-flags';
      const flag = (cls: string, text: string) => {
        const span = document.createElement('span');
        span.className = `flag ${cls}`;
        span.textContent = text;
        flags.append(span);
      };
      if (clashes.has(course.code)) flag('flag-conflict', 'Time conflict');
      if (checkPrereqs(course, completed, planned).missing.length) flag('flag-prereq', 'Missing prerequisite');
      if (section.seats <= 0) flag('flag-full', 'Section full');
      else if (section.seats <= 5) flag('flag-low', `${section.seats} seats left`);
      if (generator && planSections.get(course.code) !== section.id) flag('flag-changed', 'Changed in this schedule');
      main.append(title, meta);
      if (flags.childElementCount) main.append(flags);

      const field = document.createElement('div');
      field.className = 'plan-section';
      const label = document.createElement('label');
      label.htmlFor = `plan-section-${slug}`;
      label.textContent = 'Section';
      const select = document.createElement('select');
      select.id = `plan-section-${slug}`;
      select.dataset.focusKey = `select-${course.code}`;
      for (const option of course.sections) {
        const opt = document.createElement('option');
        opt.value = option.id;
        opt.textContent = `${option.id} · ${sectionSummary(option)} · ${option.seats > 0 ? `${option.seats} seats` : 'Full'}`;
        opt.selected = option.id === section.id;
        select.append(opt);
      }
      select.disabled = course.sections.length === 1;
      select.addEventListener('change', () => setSection(course.code, select.value));
      field.append(label, select);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'linkish plan-remove';
      remove.dataset.focusKey = `remove-${course.code}`;
      remove.innerHTML = `Remove<span class="sr-only"> ${course.code}</span>`;
      remove.addEventListener('click', () => {
        const next = li.nextElementSibling?.querySelector<HTMLElement>('.plan-remove') ??
          li.previousElementSibling?.querySelector<HTMLElement>('.plan-remove');
        const nextKey = next?.dataset.focusKey;
        removeCourse(course.code);
        const target = nextKey ? planList.querySelector<HTMLElement>(`[data-focus-key="${nextKey}"]`) : null;
        (target ?? planHeading).focus();
      });

      li.append(main, field, remove);
      planList.append(li);
    }
    if (focusKey) planList.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  function renderCatalogState(entries: Entry[]) {
    const completed = new Set(state.completed);
    const planned = new Set(entries.map((entry) => entry.course.code));
    for (const course of COURSES) {
      const card = cards.get(course.code);
      if (!card) continue;
      const added = state.picks.some((pick) => pick.code === course.code);
      card.classList.toggle('is-added', added);
      const verb = card.querySelector('[data-add-verb]');
      const rest = card.querySelector('[data-add-rest]');
      if (verb) verb.textContent = added ? 'Remove' : 'Add';
      if (rest) rest.textContent = added ? 'from plan' : 'to plan';
      const status = card.querySelector<HTMLElement>('[data-prereq-status]');
      if (status && course.prereqs.length) {
        const missing = checkPrereqs(course, completed, planned).missing;
        status.className = `prereq-status ${missing.length ? 'is-missing' : 'is-met'}`;
        status.textContent = missing.length ? `Missing ${missing.map(requirementLabel).join(', ')}` : 'Met';
      }
    }
  }

  function renderRecord() {
    recordList.replaceChildren();
    recordCount.textContent = `(${state.completed.length})`;
    for (const code of [...state.completed].sort()) {
      const li = document.createElement('li');
      li.className = 'record-chip';
      li.append(code);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Remove ${code} from completed coursework`);
      button.textContent = '×';
      button.addEventListener('click', () => {
        const next = (li.nextElementSibling ?? li.previousElementSibling)?.querySelector('button');
        const nextLabel = next?.getAttribute('aria-label');
        state.completed = state.completed.filter((item) => item !== code);
        commit();
        announce(`Removed ${code} from your completed coursework.`);
        const target = nextLabel ? recordList.querySelector<HTMLElement>(`[aria-label="${nextLabel}"]`) : null;
        (target ?? recordInput).focus();
      });
      li.append(button);
      recordList.append(li);
    }
  }

  function describeStats(entries: Entry[]): string {
    const stats = scheduleStats(entries);
    const gapHours = Math.floor(stats.gapMinutes / 60);
    const gapMins = stats.gapMinutes % 60;
    const gap =
      stats.gapMinutes === 0
        ? 'no gaps between classes'
        : `${gapHours ? `${gapHours} h ` : ''}${gapMins ? `${gapMins} min ` : ''}of gaps between classes`.trim();
    return `${plural(stats.daysOnCampus, 'day')} on campus · first class ${formatTime(stats.earliest)} · done by ${formatTime(stats.latest)} · ${gap}`;
  }

  function renderGenerator() {
    genBox.hidden = !generator;
    root!.classList.toggle('is-generating', Boolean(generator));
    if (!generator) return;
    const total = generator.list.length;
    genPrev.disabled = total < 2;
    genNext.disabled = total < 2;
    genApply.disabled = total === 0;
    if (!total) {
      genCount.textContent = 'No conflict-free schedule';
      genStats.textContent = generator.blockers.join(' ');
      genProgress.style.width = '0';
      return;
    }
    genCount.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = `Schedule ${generator.index + 1}`;
    genCount.append(
      strong,
      ` of ${total}${generator.truncated ? '+' : ''} conflict-free ${total === 1 ? 'combination' : 'combinations'}`,
    );
    genProgress.style.width = `${((generator.index + 1) / total) * 100}%`;
    genStats.textContent = describeStats(shownEntries());
  }

  function render() {
    const entries = shownEntries();
    renderBlocks(entries);
    renderGhosts();
    renderCredits(entries);
    renderAlerts(entries);
    renderPlanList(entries);
    renderCatalogState(entries);
    renderGenerator();
    renderRecord();
    const has = state.picks.length > 0;
    generateBtn.disabled = !has;
    exportBtn.disabled = !has;
    clearBtn.disabled = !has;
  }

  // ---------- generator ----------

  function computeGenerator(keepIndex = false) {
    const picks = state.picks.filter((pick) => byCode.has(pick.code));
    const courses = picks.map((pick) => byCode.get(pick.code)!);
    const sort = genSort.value as SortKey;
    const openOnly = genOpen.checked;
    const result = generateSchedules(courses, { openOnly });
    const list = sortSchedules(courses, result.schedules, sort);
    const previous = keepIndex && generator ? generator.index : 0;
    generator = {
      courses,
      colors: picks.map((pick) => pick.color),
      raw: result.schedules,
      list,
      index: Math.min(previous, Math.max(0, list.length - 1)),
      sort,
      openOnly,
      truncated: result.truncated,
      blockers: result.blockers,
    };
  }

  function openGenerator() {
    if (!state.picks.length) return;
    undoPicks = null;
    computeGenerator();
    render();
    genBox.focus({ preventScroll: true });
    genBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const total = generator!.list.length;
    announce(
      total
        ? `${total} conflict-free schedules for ${plural(state.picks.length, 'course')}. Schedule 1: ${describeStats(shownEntries())}. Use the left and right arrow keys to flip through them.`
        : `No conflict-free schedule. ${generator!.blockers.join(' ')}`,
    );
  }

  function stepGenerator(delta: number) {
    if (!generator || generator.list.length < 2) return;
    const total = generator.list.length;
    generator.index = (generator.index + delta + total) % total;
    render();
    announce(`Schedule ${generator.index + 1} of ${total}. ${describeStats(shownEntries())}.`);
  }

  function applyGenerated(withAnnouncement = true) {
    if (!generator || !generator.list.length) return;
    const sections = generator.list[generator.index]!;
    generator.courses.forEach((course, index) => {
      const pick = state.picks.find((item) => item.code === course.code);
      if (pick) pick.section = sections[index]!.id;
    });
    const number = generator.index + 1;
    generator = null;
    commit();
    if (withAnnouncement) announce(`Schedule ${number} is now your plan. No time conflicts.`);
  }

  function closeGenerator() {
    if (!generator) return;
    generator = null;
    render();
    announce('Back to your plan.');
    generateBtn.focus();
  }

  // ---------- export ----------

  function exportIcs() {
    const entries = shownEntries();
    if (!entries.length) return;
    const blob = new Blob([buildIcs(entries)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'um-spring-2027-schedule.ics';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Downloaded um-spring-2027-schedule.ics with ${plural(entries.length, 'course')}.`);
  }

  // ---------- events ----------

  const refilter = () => {
    applyFilters();
    courseList.scrollTop = 0;
  };
  // Not on change: a search box fires change when it loses focus, which would jump the list mid-click.
  filtersForm.addEventListener('input', refilter);
  filtersForm.addEventListener('change', applyFilters);
  filtersForm.addEventListener('submit', (event) => event.preventDefault());
  filtersForm.addEventListener('reset', () => window.setTimeout(refilter, 0));

  courseList.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
    const code = button?.closest<HTMLElement>('.course-card')?.dataset.code;
    if (!code) return;
    if (state.picks.some((pick) => pick.code === code)) removeCourse(code);
    else addCourse(code);
  });

  const showPreview = (code: string | undefined) => {
    if (dragging) return;
    const next = code ? { code, target: null } : null;
    if (preview?.code === next?.code) return;
    preview = next;
    renderGhosts();
  };
  courseList.addEventListener('mouseover', (event) => {
    showPreview((event.target as HTMLElement).closest<HTMLElement>('.course-card')?.dataset.code);
  });
  courseList.addEventListener('mouseleave', () => showPreview(undefined));
  courseList.addEventListener('focusin', (event) => {
    showPreview((event.target as HTMLElement).closest<HTMLElement>('.course-card')?.dataset.code);
  });
  courseList.addEventListener('focusout', (event) => {
    if (!courseList.contains(event.relatedTarget as Node | null)) showPreview(undefined);
  });

  // Pointer events rather than HTML drag and drop, so dragging also works with touch and pen.
  type DragSession = {
    code: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    over: boolean;
    avatar: HTMLElement | null;
    source: Element | null;
  };
  let drag: DragSession | null = null;
  let suppressClick = false;

  function beginDrag(event: PointerEvent, code: string) {
    if (event.button !== 0 || drag) return;
    drag = {
      code,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      over: false,
      avatar: null,
      source: event.currentTarget as Element | null,
    };
  }

  function activateDrag(session: DragSession) {
    const course = byCode.get(session.code);
    if (!course) return;
    session.active = true;
    // Capture only once a drag starts; capturing on pointerdown retargets plain clicks on calendar blocks.
    try {
      session.source?.setPointerCapture(session.pointerId);
    } catch {
      // The pointer was already released.
    }
    dragging = true;
    preview = { code: session.code, target: null };
    window.getSelection()?.removeAllRanges();
    root!.classList.add('is-dragging');
    week.classList.add('is-drop-ready');
    weekEmpty.hidden = true;
    const avatar = document.createElement('div');
    avatar.className = 'drag-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const pick = state.picks.find((item) => item.code === course.code);
    avatar.style.setProperty('--c', PALETTE[(pick?.color ?? nextColor()) % PALETTE.length]!);
    const strong = document.createElement('strong');
    strong.textContent = course.code;
    const hint = document.createElement('span');
    hint.textContent = course.title;
    avatar.append(strong, hint);
    document.body.append(avatar);
    session.avatar = avatar;
    renderGhosts();
  }

  function moveDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      activateDrag(drag);
    }
    if (!drag.avatar || !preview) return;
    event.preventDefault();
    drag.avatar.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 10}px)`;
    const rect = weekGrid.getBoundingClientRect();
    const over =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    drag.over = over;
    week.classList.toggle('is-over', over);
    const course = byCode.get(drag.code)!;
    const target = over ? nearestSection(course, ...pointToSlotArgs(event)) : null;
    const hint = drag.avatar.querySelector('span');
    if (hint) {
      const section = target ? sectionOf(course, target) : null;
      hint.textContent = section ? `Section ${section.id} · ${sectionSummary(section)}` : course.title;
    }
    if (target !== preview.target) {
      preview.target = target;
      renderGhosts();
    }
  }

  function finishDrag(event: PointerEvent | null) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    if (event && drag.active) moveDrag(event);
    const session = drag;
    drag = null;
    if (!session.active) return;
    const target = event && session.over ? preview?.target : null;
    session.avatar?.remove();
    dragging = false;
    preview = null;
    root!.classList.remove('is-dragging');
    week.classList.remove('is-drop-ready', 'is-over');
    weekEmpty.hidden = blocks.size > 0;
    renderGhosts();
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (target) addCourse(session.code, target);
    else if (event) announce('Drop on the calendar to add a course.');
  }

  function pointToSlotArgs(event: PointerEvent): [DayCode, number] {
    const slot = pointToSlot(event);
    return [slot.day, slot.minute];
  }

  courseList.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;
    const code = target.closest<HTMLElement>('.course-card')?.dataset.code;
    if (code) beginDrag(event, code);
  });
  courseList.addEventListener('mousedown', (event) => {
    if (!(event.target as HTMLElement).closest('button, a, input, select, textarea')) event.preventDefault();
  });
  blockLayer.addEventListener('pointerdown', (event) => {
    const code = (event.target as HTMLElement).closest<HTMLElement>('.block')?.dataset.code;
    if (code) beginDrag(event, code);
  });
  document.addEventListener('pointermove', moveDrag, { passive: false });
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', () => finishDrag(null));
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && drag?.active) {
        event.stopPropagation();
        finishDrag(null);
        announce('Drag canceled.');
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  blockLayer.addEventListener('click', (event) => {
    const code = (event.target as HTMLElement).closest<HTMLElement>('.block')?.dataset.code;
    if (!code) return;
    const item = planList.querySelector<HTMLElement>(`[data-code="${code}"]`);
    if (!item) return;
    item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    item.classList.remove('is-flash');
    void item.offsetWidth;
    item.classList.add('is-flash');
    const select = item.querySelector<HTMLSelectElement>('select:not(:disabled)');
    (select ?? item.querySelector<HTMLElement>('.plan-remove'))?.focus({ preventScroll: true });
  });
  blockLayer.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const code = (event.target as HTMLElement).closest<HTMLElement>('.block')?.dataset.code;
    if (!code) return;
    event.preventDefault();
    removeCourse(code);
    const next = [...blockLayer.querySelectorAll<HTMLElement>('.block:not(.is-leaving) button')][0];
    (next ?? planHeading).focus();
  });

  generateBtn.addEventListener('click', openGenerator);
  exportBtn.addEventListener('click', exportIcs);
  clearBtn.addEventListener('click', () => {
    undoPicks = state.picks.map((pick) => ({ ...pick }));
    generator = null;
    state.picks = [];
    save();
    render();
    paintSaveStatus();
    announce('Plan cleared. Press Undo to restore it.');
    saveStatus.querySelector('button')?.focus();
  });

  genPrev.addEventListener('click', () => stepGenerator(-1));
  genNext.addEventListener('click', () => stepGenerator(1));
  genApply.addEventListener('click', () => {
    applyGenerated();
    generateBtn.focus();
  });
  genClose.addEventListener('click', closeGenerator);
  genSort.addEventListener('change', () => {
    computeGenerator();
    render();
    announce(`Sorted. Schedule 1 of ${generator?.list.length ?? 0}. ${describeStats(shownEntries())}.`);
  });
  genOpen.addEventListener('change', () => {
    computeGenerator();
    render();
    const total = generator?.list.length ?? 0;
    announce(total ? `${total} schedules use only open sections.` : `No schedule fits. ${generator?.blockers.join(' ')}`);
  });

  document.addEventListener('keydown', (event) => {
    if (!generator || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const typing = target.closest('input, select, textarea, [contenteditable="true"]');
    if (event.key === 'Escape' && !typing) {
      event.preventDefault();
      closeGenerator();
      return;
    }
    if (typing) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepGenerator(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepGenerator(-1);
    }
  });

  recordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const match = /^([a-z]{4})\s*(\d{3})$/i.exec(recordInput.value.trim());
    if (!match) {
      announce('Enter a course number like PHYS 152.');
      recordInput.setAttribute('aria-invalid', 'true');
      return;
    }
    recordInput.removeAttribute('aria-invalid');
    const code = `${match[1]!.toUpperCase()} ${match[2]}`;
    if (!state.completed.includes(code)) state.completed.push(code);
    recordInput.value = '';
    commit();
    announce(`Added ${code} to your completed coursework.`);
  });
  recordReset.addEventListener('click', () => {
    state.completed = [...SAMPLE_RECORD];
    commit();
    announce('Restored the sample record.');
  });

  load();
  applyFilters();
  render();
  paintSaveStatus();
  root.classList.add('is-ready');
}
