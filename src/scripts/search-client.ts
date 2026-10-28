import { u } from '../lib/paths';
import { highlightRanges, prepare, type PreparedDoc, type SearchIndex, type SearchResult } from '../lib/search-engine';

const RECENT_KEY = 'um-recent-searches';
const RECENT_MAX = 5;

let loading: Promise<PreparedDoc[]> | null = null;

/** The index is a static file built with the site; it is fetched once per page view. */
export function loadIndex(): Promise<PreparedDoc[]> {
  if (!loading) {
    loading = fetch(u('/search-index.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`Search index returned ${response.status}`);
        return response.json() as Promise<SearchIndex>;
      })
      .then((index) => prepare(index))
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function getRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(query: string): void {
  const value = query.trim().replace(/\s+/g, ' ');
  if (value.length < 2) return;
  const next = [value, ...getRecent().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Private browsing can refuse storage; recent searches are optional. */
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Text with `<mark>` around the parts that match the query. */
export function highlighted(text: string, terms: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let at = 0;
  for (const [start, end] of highlightRanges(text, terms)) {
    if (start < at) continue;
    if (start > at) fragment.append(text.slice(at, start));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    fragment.append(mark);
    at = end;
  }
  if (at < text.length) fragment.append(text.slice(at));
  return fragment;
}

/** Breadcrumb trail for a result: the page's parents, then the page and section when a section matched. */
export function trailFor(result: SearchResult): { parts: string[]; section?: string } {
  const { doc, section } = result;
  if (doc.type === 'action') return { parts: ['Quick action'] };
  if (section?.heading) {
    const parts = doc.crumbs.at(-1) === doc.title ? doc.crumbs : [...doc.crumbs, doc.title];
    return { parts, section: section.heading };
  }
  return { parts: doc.crumbs };
}

export function resolveHref(href: string): string {
  return /^[a-z]+:/i.test(href) ? href : u(href);
}

export function go(href: string, newTab = false): void {
  const target = resolveHref(href);
  if (newTab && !/^tel:|^mailto:/i.test(target)) {
    window.open(target, '_blank', 'noopener');
    return;
  }
  window.location.assign(target);
}

export const TYPE_LABELS: Record<string, string> = {
  page: 'Page',
  help: 'Help article',
  news: 'News',
  person: 'Person',
  department: 'Department',
  action: 'Quick action',
};

const PATHS: Record<string, string> = {
  page: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M9.5 12h6M9.5 15h6M9.5 18h4"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>',
  news: '<path d="M4.5 6h12v12.5a1.5 1.5 0 0 0 1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M16.5 9h3v9.5a1.5 1.5 0 0 1-3 0M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
  person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.6 3.4-6 7-6s6.4 2.4 7 6"/>',
  building: '<path d="M4 20.5h16M6 20.5V8l6-4 6 4v12.5"/><path d="M9.5 11h1M13.5 11h1M9.5 14.5h1M13.5 14.5h1M11 20.5v-3h2v3"/>',
  college: '<path d="M3.5 9 12 4.5 20.5 9zM5 20.5h14M6.5 11v7M10 11v7M14 11v7M17.5 11v7"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.9 8.9a2 2 0 0 1-2.8-2.8l8.9-8.9a4 4 0 0 0-2.1-2.1z"/><path d="M14.6 5.4 17 3l4 4-2.4 2.4"/>',
  aid: '<ellipse cx="12" cy="7" rx="6.5" ry="2.5"/><path d="M5.5 7v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V7M5.5 12v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="1"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 13.5h2M14 13.5h2M8 16.5h2"/>',
  ticket: '<path d="M4 7.5h16v3a1.5 1.5 0 0 0 0 3v3H4v-3a1.5 1.5 0 0 0 0-3z"/><path d="M14.5 7.5v9" stroke-dasharray="1.5 1.5"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="m3.8 7 1 1 1.8-2M3.8 12l1 1 1.8-2M3.8 17l1 1 1.8-2"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M15.5 7.5l2 2M17.5 5.5l2 2"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5L16 13l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z"/>',
  book: '<path d="M12 6.5c-1.7-1.3-4.3-2-7.5-2v13c3.2 0 5.8.7 7.5 2 1.7-1.3 4.3-2 7.5-2v-13c-3.2 0-5.8.7-7.5 2zM12 6.5v13"/>',
  access: '<circle cx="12" cy="4.8" r="1.6"/><path d="M5 8.5c2.3.7 4.6 1 7 1s4.7-.3 7-1M12 9.5v4.5M12 14l-3 6M12 14l3 6"/>',
  map: '<path d="M12 20.5s6-5.4 6-10.5a6 6 0 0 0-12 0c0 5.1 6 10.5 6 10.5z"/><circle cx="12" cy="10" r="2.2"/>',
  card: '<rect x="3.5" y="6" width="17" height="12" rx="1.2"/><path d="M3.5 10h17M7 14.5h3"/>',
  recent: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  clear: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
};

/** Inline SVG markup for an icon. The markup is static; no user text is ever interpolated. */
export function iconSvg(name: string | undefined): string {
  const body = PATHS[name ?? ''] ?? PATHS.page;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function iconFor(result: SearchResult): string {
  return result.doc.icon ?? result.doc.type;
}

export function isMac(): boolean {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}
