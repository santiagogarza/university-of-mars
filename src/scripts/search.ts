import { searchIndex } from '../data/search-index';
import { u } from '../lib/paths';

const input = document.querySelector<HTMLInputElement>('#q');
const results = document.querySelector<HTMLElement>('#results');
const empty = document.querySelector<HTMLElement>('#search-empty');
const none = document.querySelector<HTMLElement>('#search-none');
const count = document.querySelector<HTMLElement>('#result-count');
const form = document.querySelector<HTMLFormElement>('#site-search');

function show(query: string) {
  if (!results || !empty || !none || !count) return;
  const needle = query.trim().toLowerCase();
  results.replaceChildren();
  if (!needle) {
    empty.hidden = false;
    none.hidden = true;
    results.hidden = true;
    count.textContent = '';
    return;
  }

  const matches = searchIndex.filter((item) => {
    const haystack = `${item.title} ${item.group} ${item.text}`.toLowerCase();
    return needle.split(/\s+/).every((part) => haystack.includes(part));
  });

  empty.hidden = true;
  none.hidden = matches.length > 0;
  results.hidden = matches.length === 0;
  count.textContent = matches.length === 1 ? '1 result' : `${matches.length} results`;

  if (none instanceof HTMLElement) {
    const term = none.querySelector('[data-term]');
    if (term) term.textContent = query.trim();
  }

  for (const item of matches) {
    const li = document.createElement('li');
    const group = document.createElement('span');
    group.className = 'kicker';
    group.textContent = item.group;
    const link = document.createElement('a');
    link.href = u(item.href);
    link.textContent = item.title;
    li.append(group, link);
    results.append(li);
  }
}

if (input && form) {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('q') ?? '';
  input.value = initial;
  show(initial);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = new URL(window.location.href);
    const value = input.value.trim();
    if (value) next.searchParams.set('q', value);
    else next.searchParams.delete('q');
    history.replaceState(null, '', next);
    show(input.value);
  });
}
