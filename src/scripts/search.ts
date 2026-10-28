import { u } from '../lib/paths';
import {
  GROUP_ORDER,
  queryTerms,
  relatedHelp,
  search,
  type GroupKey,
  type PreparedDoc,
  type SearchResult,
} from '../lib/search-engine';
import { addRecent, getRecent, highlighted, iconFor, iconSvg, loadIndex, resolveHref, TYPE_LABELS, trailFor } from './search-client';

const PAGE_SIZE = 12;

const input = document.querySelector<HTMLInputElement>('#q');
const form = document.querySelector<HTMLFormElement>('#site-search');
const results = document.querySelector<HTMLOListElement>('#results');
const empty = document.querySelector<HTMLElement>('#search-empty');
const none = document.querySelector<HTMLElement>('#search-none');
const count = document.querySelector<HTMLElement>('#result-count');
const filters = document.querySelector<HTMLElement>('[data-search-filters]');
const area = document.querySelector<HTMLSelectElement>('#area');
const sort = document.querySelector<HTMLSelectElement>('#sort');
const more = document.querySelector<HTMLElement>('[data-search-more]');
const related = document.querySelector<HTMLElement>('[data-related]');
const recentBox = document.querySelector<HTMLElement>('[data-search-recent]');
const recentList = document.querySelector<HTMLElement>('[data-search-recent-list]');

type TypeFilter = 'all' | GroupKey;

let index: PreparedDoc[] = [];
let shown = PAGE_SIZE;
let typingTimer = 0;

function selectedType(): TypeFilter {
  return (document.querySelector<HTMLInputElement>('input[name="type"]:checked')?.value as TypeFilter) ?? 'all';
}

function setType(value: string): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="type"][value="${CSS.escape(value)}"]`);
  (radio ?? document.querySelector<HTMLInputElement>('input[name="type"][value="all"]'))!.checked = true;
}

function syncUrl(): void {
  const next = new URL(window.location.href);
  const params: [string, string][] = [
    ['q', input?.value.trim() ?? ''],
    ['type', selectedType() === 'all' ? '' : selectedType()],
    ['area', area?.value ?? ''],
    ['sort', sort?.value === 'title' ? 'title' : ''],
  ];
  for (const [key, value] of params) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  history.replaceState(null, '', next);
}

function resultItem(result: SearchResult, terms: string[]): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'search-result';
  li.dataset.type = result.doc.type;

  const icon = document.createElement('span');
  icon.className = 'search-result-icon';
  icon.innerHTML = iconSvg(iconFor(result));

  const body = document.createElement('div');
  const meta = document.createElement('p');
  meta.className = 'search-result-meta';
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = TYPE_LABELS[result.doc.type] ?? 'Page';
  meta.append(pill);
  if (result.doc.type !== 'action') {
    const trail = trailFor(result);
    const crumbs = document.createElement('span');
    crumbs.className = 'search-result-crumbs';
    crumbs.textContent = [...trail.parts, ...(trail.section ? [trail.section] : [])].join(' › ');
    meta.append(crumbs);
  }
  if (result.doc.date) {
    const date = document.createElement('span');
    date.className = 'search-result-date';
    date.textContent = result.doc.date;
    meta.append(date);
  }

  const heading = document.createElement('h2');
  heading.className = 'search-result-title';
  const link = document.createElement('a');
  link.href = resolveHref(result.href);
  link.append(highlighted(result.doc.title, terms));
  link.addEventListener('click', () => {
    if (input?.value.trim()) addRecent(input.value);
  });
  heading.append(link);
  body.append(meta, heading);

  if (result.doc.meta) {
    const sub = document.createElement('p');
    sub.className = 'search-result-sub';
    sub.append(highlighted(result.doc.meta, terms));
    body.append(sub);
  }
  if (result.snippet) {
    const snippet = document.createElement('p');
    snippet.className = 'search-result-snippet';
    snippet.append(highlighted(result.snippet, terms));
    body.append(snippet);
  }
  li.append(icon, body);
  return li;
}

function renderRecent(): void {
  if (!recentBox || !recentList) return;
  const recent = getRecent();
  recentBox.hidden = recent.length === 0;
  recentList.replaceChildren(
    ...recent.map((query) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = u(`/search/?q=${encodeURIComponent(query)}`);
      link.textContent = query;
      li.append(link);
      return li;
    }),
  );
}

function show(): void {
  if (!input || !results || !empty || !none || !count || !filters) return;
  const query = input.value.trim();
  const terms = queryTerms(query);
  results.replaceChildren();
  if (more) more.hidden = true;

  if (!terms.length) {
    empty.hidden = false;
    none.hidden = true;
    results.hidden = true;
    filters.hidden = true;
    count.textContent = '';
    renderRecent();
    return;
  }

  const all = search(index, query);
  const type = selectedType();
  const areaValue = area?.value ?? '';

  // Counts per type respect the area filter, so each chip says what choosing it would show.
  const inArea = areaValue ? all.filter((result) => result.doc.area === areaValue) : all;
  const counts: Record<string, number> = { all: inArea.length };
  for (const key of GROUP_ORDER) counts[key] = inArea.filter((result) => result.group === key).length;
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((node) => {
    const value = counts[node.dataset.count ?? ''] ?? 0;
    node.textContent = String(value);
    const chip = node.closest<HTMLElement>('.filter-chip');
    chip?.classList.toggle('is-empty', value === 0);
  });

  let matches = type === 'all' ? inArea : inArea.filter((result) => result.group === type);
  if (sort?.value === 'title') matches = [...matches].sort((a, b) => a.doc.title.localeCompare(b.doc.title));

  const filtered = type !== 'all' || Boolean(areaValue);
  document.querySelectorAll<HTMLElement>('[data-search-reset]').forEach((button) => {
    button.hidden = !filtered;
  });
  const filteredNote = none.querySelector<HTMLElement>('[data-none-filtered]');
  if (filteredNote) filteredNote.hidden = !(filtered && all.length > 0);

  empty.hidden = true;
  filters.hidden = all.length === 0;
  none.hidden = matches.length > 0;
  results.hidden = matches.length === 0;
  const term = none.querySelector('[data-term]');
  if (term) term.textContent = query;

  const scope = filtered ? ` (filtered from ${all.length})` : '';
  count.textContent = `${matches.length === 1 ? '1 result' : `${matches.length} results`} for “${query}”${matches.length ? scope : ''}`;

  if (!matches.length) {
    related?.replaceChildren(...relatedHelp(index, query, 3).map((result) => resultItem(result, terms)));
    return;
  }

  results.append(...matches.slice(0, shown).map((result) => resultItem(result, terms)));
  if (more) more.hidden = matches.length <= shown;
}

function fillAreas(): void {
  if (!area) return;
  const areas = [...new Set(index.map((entry) => entry.doc.area))].sort((a, b) => a.localeCompare(b));
  const current = new URLSearchParams(window.location.search).get('area') ?? '';
  for (const name of areas) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    area.append(option);
  }
  area.value = areas.includes(current) ? current : '';
}

async function start(): Promise<void> {
  if (!input || !form) return;
  const params = new URLSearchParams(window.location.search);
  input.value = params.get('q') ?? '';
  setType(params.get('type') ?? 'all');
  if (sort) sort.value = params.get('sort') === 'title' ? 'title' : 'relevance';
  renderRecent();

  try {
    index = await loadIndex();
  } catch {
    if (count) count.textContent = 'Search could not load. Refresh the page to try again.';
    return;
  }
  fillAreas();
  show();
  if (input.value.trim()) addRecent(input.value);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    shown = PAGE_SIZE;
    syncUrl();
    show();
    addRecent(input.value);
  });
  input.addEventListener('input', () => {
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => {
      shown = PAGE_SIZE;
      syncUrl();
      show();
    }, 120);
  });
  filters?.addEventListener('change', () => {
    shown = PAGE_SIZE;
    syncUrl();
    show();
  });
  document.querySelectorAll<HTMLElement>('[data-search-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      setType('all');
      if (area) area.value = '';
      shown = PAGE_SIZE;
      syncUrl();
      show();
      input.focus();
    });
  });
  more?.querySelector('button')?.addEventListener('click', () => {
    const before = shown;
    shown += PAGE_SIZE;
    show();
    results?.querySelectorAll<HTMLAnchorElement>('.search-result-title a')[before]?.focus();
  });
}

void start();
