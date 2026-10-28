import { quickActions, type QuickAction } from '../data/quick-actions';
import { normalizePath, u } from '../lib/paths';
import {
  groupResults,
  prepare,
  queryTerms,
  relatedHelp,
  search,
  slugify,
  type PreparedDoc,
  type SearchDoc,
  type SearchResult,
} from '../lib/search-engine';
import {
  addRecent,
  clearRecent,
  getRecent,
  go,
  highlighted,
  iconFor,
  iconSvg,
  isMac,
  loadIndex,
  resolveHref,
  trailFor,
} from './search-client';

type Item =
  | { kind: 'result'; result: SearchResult }
  | { kind: 'recent'; query: string }
  | { kind: 'clear-recent' }
  | { kind: 'search-all'; query: string; total: number };

type Group = { key: string; label: string; total?: number; items: Item[] };

const PALETTE_LIMITS = { pages: 4, help: 3, news: 2, people: 3, actions: 2 };

const dialog = document.querySelector<HTMLDialogElement>('[data-cmdk]');
const input = document.querySelector<HTMLInputElement>('#cmdk-input');
const listbox = document.querySelector<HTMLElement>('#cmdk-listbox');
const notice = document.querySelector<HTMLElement>('[data-cmdk-notice]');
const status = document.querySelector<HTMLElement>('[data-cmdk-status]');
const fullLink = document.querySelector<HTMLAnchorElement>('[data-cmdk-full]');

function actionDoc(action: QuickAction): SearchDoc {
  return {
    id: `action:${action.id}`,
    type: 'action',
    title: action.title,
    href: action.href,
    crumbs: ['Quick action'],
    summary: action.description,
    keywords: action.keywords,
    area: 'Quick actions',
    icon: action.icon,
  };
}

/** A result shown without a query: no score, the summary as its snippet. */
function plain(doc: SearchDoc): SearchResult {
  return { doc, group: doc.type === 'action' ? 'actions' : 'help', score: 0, snippet: doc.summary, href: doc.href };
}

// Quick actions are bundled, so they work before the full index arrives.
const actionIndex = prepare(quickActions.map(actionDoc));
const featured = quickActions.filter((action) => action.featured).map((action) => plain(actionDoc(action)));
const askAction = quickActions.find((action) => action.id === 'submit-request');

let items: Item[] = [];
let groupStarts: number[] = [];
let active = -1;
let index: PreparedDoc[] | null = null;
let indexFailed = false;
let opener: HTMLElement | null = null;
let statusTimer = 0;
/** The person picked an option since the last keystroke; a late index load keeps that pick. */
let userMoved = false;

function ensureIndex(): void {
  if (index || !dialog) return;
  loadIndex()
    .then((prepared) => {
      index = prepared;
      indexFailed = false;
      if (dialog.open) render(!userMoved);
    })
    .catch(() => {
      indexFailed = true;
      if (dialog.open) render(!userMoved);
    });
}

/* ---------- Rendering ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function trailElement(parts: string[], section: string | undefined, id: string): HTMLElement {
  const line = el('span', 'cmdk-crumbs');
  line.id = id;
  parts.forEach((part, i) => {
    if (i) line.append(separator());
    line.append(el('span', undefined, part));
  });
  if (section) {
    line.append(separator());
    line.append(el('span', 'cmdk-section', section));
  }
  return line;
}

function separator(): HTMLElement {
  const sep = el('span', 'cmdk-sep', '›');
  sep.setAttribute('aria-hidden', 'true');
  return sep;
}

function optionElement(item: Item, position: number, terms: string[]): HTMLElement {
  const id = `cmdk-opt-${position}`;
  const option = el('div', 'cmdk-option');
  option.id = id;
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');
  option.dataset.index = String(position);

  const icon = el('span', 'cmdk-icon');
  const text = el('span', 'cmdk-text');
  const title = el('span', 'cmdk-title');
  title.id = `${id}-t`;
  const labelled = [title.id];
  let described: string | undefined;
  let aside: HTMLElement | null = null;

  if (item.kind === 'result') {
    const { result } = item;
    const { doc } = result;
    option.dataset.type = doc.type;
    icon.innerHTML = iconSvg(iconFor(result));
    title.append(highlighted(doc.title, terms));
    text.append(title);
    if (doc.meta) {
      const meta = el('span', 'cmdk-crumbs');
      meta.id = `${id}-c`;
      meta.append(highlighted(doc.meta, terms));
      text.append(meta);
      labelled.push(meta.id);
    } else if (doc.type !== 'action') {
      const trail = trailFor(result);
      text.append(trailElement(trail.parts, trail.section, `${id}-c`));
      labelled.push(`${id}-c`);
    }
    if (result.snippet) {
      const snippet = el('span', 'cmdk-snippet');
      snippet.id = `${id}-s`;
      snippet.append(highlighted(result.snippet, terms));
      text.append(snippet);
      described = snippet.id;
    }
    if (doc.date) aside = el('span', 'cmdk-date', doc.date);
  } else if (item.kind === 'recent') {
    option.dataset.type = 'recent';
    icon.innerHTML = iconSvg('recent');
    title.textContent = item.query;
    text.append(title, el('span', 'cmdk-crumbs', 'Search again'));
  } else if (item.kind === 'clear-recent') {
    option.dataset.type = 'clear';
    option.classList.add('cmdk-option-quiet');
    icon.innerHTML = iconSvg('clear');
    title.textContent = 'Clear recent searches';
    text.append(title);
  } else {
    option.dataset.type = 'search-all';
    icon.innerHTML = iconSvg('search');
    title.textContent = item.total ? `See all ${item.total} results for “${item.query.trim()}”` : `Search the full site for “${item.query.trim()}”`;
    text.append(title, el('span', 'cmdk-crumbs', 'Search page, with filters by type and area'));
  }

  option.setAttribute('aria-labelledby', labelled.join(' '));
  if (described) option.setAttribute('aria-describedby', described);
  option.append(icon, text);
  if (aside) option.append(aside);
  const enter = el('span', 'cmdk-enter');
  enter.setAttribute('aria-hidden', 'true');
  enter.textContent = '↵';
  option.append(enter);
  return option;
}

function buildGroups(query: string): Group[] {
  const terms = queryTerms(query);
  const groups: Group[] = [];
  if (notice) {
    notice.hidden = true;
    notice.replaceChildren();
  }

  if (!terms.length) {
    const recent = getRecent();
    if (recent.length) {
      groups.push({
        key: 'recent',
        label: 'Recent searches',
        items: [...recent.map((q): Item => ({ kind: 'recent', query: q })), { kind: 'clear-recent' }],
      });
    }
    groups.push({ key: 'actions', label: 'Quick actions', items: featured.map((result) => ({ kind: 'result', result })) });
    if (index) {
      const help = index.filter((entry) => entry.doc.type === 'help').slice(0, 4);
      groups.push({
        key: 'help',
        label: 'Popular help articles',
        items: help.map((entry) => ({ kind: 'result', result: plain(entry.doc) })),
      });
    }
    return groups;
  }

  if (!index) {
    showNotice(
      indexFailed ? 'The full index could not load.' : 'Loading every page…',
      indexFailed ? 'Quick actions still work, and the search page can try again.' : 'Quick actions are ready now.',
    );
    const actions = search(actionIndex, query).slice(0, 4);
    groups.push({
      key: 'actions',
      label: 'Quick actions',
      items: [...actions.map((result): Item => ({ kind: 'result', result })), { kind: 'search-all', query, total: 0 }],
    });
    return groups;
  }

  const results = search(index, query);
  if (results.length) {
    for (const group of groupResults(results, PALETTE_LIMITS)) {
      groups.push({ key: group.key, label: group.label, total: group.total, items: group.results.map((result) => ({ kind: 'result', result })) });
    }
    let actions = groups.find((group) => group.key === 'actions');
    if (!actions) {
      actions = { key: 'actions', label: 'Quick actions', items: [] };
      groups.push(actions);
    }
    actions.items.push({ kind: 'search-all', query, total: results.length });
    return groups;
  }

  showNotice(`No results for “${query.trim()}”`, 'Check the spelling or try a broader word. These help articles may be related.');
  groups.push({
    key: 'related',
    label: 'Related help articles',
    items: relatedHelp(index, query, 3).map((result) => ({ kind: 'result', result })),
  });
  const fallback: Item[] = [];
  if (askAction) fallback.push({ kind: 'result', result: plain(actionDoc(askAction)) });
  fallback.push({ kind: 'search-all', query, total: 0 });
  groups.push({ key: 'actions', label: 'Quick actions', items: fallback });
  return groups;
}

function showNotice(heading: string, body: string): void {
  if (!notice) return;
  notice.replaceChildren(el('strong', undefined, heading), el('span', undefined, body));
  notice.hidden = false;
}

function render(resetActive = true): void {
  if (!listbox || !input) return;
  if (resetActive) userMoved = false;
  const query = input.value;
  const terms = queryTerms(query);
  const groups = buildGroups(query);
  const previous = items[active];

  items = [];
  groupStarts = [];
  const nodes: HTMLElement[] = [];
  groups.forEach((group, g) => {
    if (!group.items.length) return;
    const wrapper = el('div', 'cmdk-group');
    wrapper.setAttribute('role', 'group');
    const label = el('div', 'cmdk-group-label');
    label.id = `cmdk-group-${g}`;
    label.setAttribute('role', 'presentation');
    label.append(el('span', undefined, group.label));
    const shown = group.items.filter((item) => item.kind === 'result').length;
    if (group.total && group.total > shown) {
      const count = el('span', 'cmdk-count', `${shown} of ${group.total}`);
      count.setAttribute('aria-hidden', 'true');
      label.append(count);
    }
    wrapper.setAttribute('aria-labelledby', label.id);
    wrapper.append(label);
    groupStarts.push(items.length);
    for (const item of group.items) {
      wrapper.append(optionElement(item, items.length, terms));
      items.push(item);
    }
    nodes.push(wrapper);
  });
  listbox.replaceChildren(...nodes);
  listbox.scrollTop = 0;

  let next = items.length ? 0 : -1;
  if (!resetActive && previous) {
    const same = items.findIndex((item) => sameItem(item, previous));
    if (same >= 0) next = same;
  }
  setActive(next, false);
  if (fullLink) fullLink.href = u(query.trim() ? `/search/?q=${encodeURIComponent(query.trim())}` : '/search/');
  announce(groups, query);
}

function sameItem(a: Item, b: Item): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'result' && b.kind === 'result') return a.result.doc.id === b.result.doc.id;
  if (a.kind === 'recent' && b.kind === 'recent') return a.query === b.query;
  return true;
}

function announce(groups: Group[], query: string): void {
  if (!status) return;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    const visible = groups.filter((group) => group.items.length);
    const count = items.filter((item) => item.kind === 'result').length;
    let message: string;
    if (!query.trim()) message = `${visible.map((group) => group.label).join(', ')}.`;
    else if (notice && !notice.hidden && index) message = `No results for ${query.trim()}. ${count} related help articles.`;
    else message = `${count} ${count === 1 ? 'result' : 'results'} in ${visible.length} ${visible.length === 1 ? 'group' : 'groups'}.`;
    status.textContent = message;
  }, 450);
}

/* ---------- Active option ---------- */

function setActive(next: number, scroll = true): void {
  if (!listbox || !input) return;
  listbox.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
  active = next;
  const option = next >= 0 ? listbox.querySelector<HTMLElement>(`#cmdk-opt-${next}`) : null;
  if (!option) {
    input.removeAttribute('aria-activedescendant');
    return;
  }
  option.setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', option.id);
  if (scroll) {
    const group = option.parentElement;
    const first = group?.querySelector('.cmdk-option') === option;
    (first && group ? group : option).scrollIntoView({ block: 'nearest' });
  }
}

function move(delta: number): void {
  if (!items.length) return;
  userMoved = true;
  setActive((active + delta + items.length) % items.length);
}

function groupOfIndex(position: number): number {
  let current = 0;
  groupStarts.forEach((start, g) => {
    if (position >= start) current = g;
  });
  return current;
}

function moveGroup(delta: number): void {
  if (!groupStarts.length) return;
  userMoved = true;
  const current = groupOfIndex(Math.max(active, 0));
  const next = (current + delta + groupStarts.length) % groupStarts.length;
  setActive(groupStarts[next]!);
}

/* ---------- Actions ---------- */

function activate(position: number, newTab = false): void {
  const item = items[position];
  if (!item || !input) return;
  const query = input.value;
  switch (item.kind) {
    case 'recent':
      input.value = item.query;
      render();
      input.focus();
      return;
    case 'clear-recent':
      clearRecent();
      render();
      if (status) status.textContent = 'Recent searches cleared.';
      return;
    case 'search-all':
      addRecent(item.query);
      close();
      go(`/search/?q=${encodeURIComponent(item.query.trim())}`, newTab);
      return;
    case 'result':
      if (query.trim()) addRecent(query);
      navigateTo(item.result.href, newTab);
  }
}

function navigateTo(href: string, newTab: boolean): void {
  const target = resolveHref(href);
  if (newTab) {
    go(href, true);
    return;
  }
  if (/^[a-z]+:/i.test(href)) {
    close();
    window.location.href = target;
    return;
  }
  const url = new URL(target, window.location.href);
  const samePage = normalizePath(url.pathname) === normalizePath(window.location.pathname) && url.search === window.location.search;
  close(!samePage);
  if (samePage && url.hash) {
    if (window.location.hash === url.hash) revealHash(true);
    else {
      focusOnHashChange = true;
      window.location.hash = url.hash;
    }
    return;
  }
  go(href);
}

/* ---------- Section anchors ---------- */

let focusOnHashChange = false;

/**
 * Search links point at headings without an id as `#heading-slug`. Find that
 * heading, give it the id, and scroll to it. Real ids are left to the browser.
 */
function revealHash(focus: boolean): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  let target = document.getElementById(id);
  if (!target) {
    target = [...document.querySelectorAll<HTMLElement>('main h2, main h3')].find((node) => slugify(node.textContent ?? '') === id) ?? null;
    if (!target) return;
    target.id = id;
    target.scrollIntoView({ block: 'start' });
    target.classList.remove('search-target');
    void target.offsetWidth;
    target.classList.add('search-target');
  }
  if (focus) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

revealHash(false);
window.addEventListener('hashchange', () => {
  revealHash(focusOnHashChange);
  focusOnHashChange = false;
});

/* ---------- Open and close ---------- */

function open(query = ''): void {
  if (!dialog || !input) return;
  if (dialog.open) {
    input.focus();
    input.select();
    return;
  }
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  input.value = query;
  dialog.showModal();
  document.documentElement.classList.add('cmdk-open');
  render();
  input.focus();
  input.select();
  ensureIndex();
}

function close(restoreFocus = true): void {
  if (!restoreFocus) opener = null;
  if (dialog?.open) dialog.close();
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName);
}

function focusables(): HTMLElement[] {
  if (!dialog) return [];
  return [...dialog.querySelectorAll<HTMLElement>('input, button, a[href]')].filter((node) => !node.closest('[hidden]'));
}

if (dialog && input && listbox) {
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';
  document.querySelectorAll<HTMLElement>('[data-cmdk-kbd]').forEach((node) => {
    node.textContent = shortcut;
  });

  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-cmdk-open]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger.dataset.cmdkQuery ?? '');
  });

  document.querySelectorAll<HTMLElement>('[data-cmdk-open]').forEach((trigger) => {
    trigger.addEventListener('pointerenter', ensureIndex, { once: true });
    trigger.addEventListener('focus', ensureIndex, { once: true });
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) close();
      else open();
      return;
    }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !dialog.open && !isEditable(event.target)) {
      event.preventDefault();
      open();
    }
  });

  input.addEventListener('input', () => render());

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        moveGroup(1);
        break;
      case 'PageUp':
        event.preventDefault();
        moveGroup(-1);
        break;
      case 'Tab':
        if (!items.length) return;
        event.preventDefault();
        moveGroup(event.shiftKey ? -1 : 1);
        break;
      case 'Enter':
        if (event.isComposing) return;
        event.preventDefault();
        if (active >= 0) activate(active, event.metaKey || event.ctrlKey);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
    }
  });

  // Keep Tab inside the dialog for the buttons and links outside the combobox.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target !== input) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || event.target === input) return;
    const nodes = focusables();
    if (!nodes.length) return;
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const next = (at + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
    event.preventDefault();
    nodes[next]!.focus();
  });

  listbox.addEventListener('mousedown', (event) => event.preventDefault());
  // Only a pointer that actually moves picks an option; results re-rendering under a still cursor must not.
  let pointer = { x: -1, y: -1 };
  listbox.addEventListener('mousemove', (event) => {
    if (event.clientX === pointer.x && event.clientY === pointer.y) return;
    const first = pointer.x < 0;
    pointer = { x: event.clientX, y: event.clientY };
    if (first) return;
    const option = (event.target as Element).closest<HTMLElement>('.cmdk-option');
    if (!option) return;
    const position = Number(option.dataset.index);
    if (position !== active) {
      userMoved = true;
      setActive(position, false);
    }
  });
  listbox.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('.cmdk-option');
    if (!option) return;
    activate(Number(option.dataset.index), event.metaKey || event.ctrlKey);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.querySelector('[data-cmdk-close]')?.addEventListener('click', () => close());
  fullLink?.addEventListener('click', () => {
    if (input.value.trim()) addRecent(input.value);
  });

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('cmdk-open');
    input.removeAttribute('aria-activedescendant');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });
}
