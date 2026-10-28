/**
 * Site search shared by the command palette and /search/.
 *
 * The index is built from the rendered pages at build time
 * (src/pages/search-index.json.ts). This module has no imports so the same
 * code runs in the browser, in Astro, and under `node --test`.
 */

export type DocType = 'page' | 'help' | 'news' | 'person' | 'department' | 'action';
export type GroupKey = 'actions' | 'pages' | 'help' | 'news' | 'people';

export type SearchSection = {
  heading: string;
  /** `#id`, a text fragment, or '' for the text before the first heading. */
  anchor: string;
  text: string;
};

export type SearchDoc = {
  id: string;
  type: DocType;
  title: string;
  /** Root-relative, without the site base. May also be a `tel:` link. */
  href: string;
  /** Breadcrumb labels above this page, starting with Home. */
  crumbs: string[];
  summary: string;
  keywords?: string;
  /** News publication date, as printed on the story. */
  date?: string;
  /** Top-level site area, used by the /search/ filter. */
  area: string;
  icon?: string;
  /** Second line for people and departments. */
  meta?: string;
  sections?: SearchSection[];
};

export type SearchIndex = {
  version: 1;
  docs: SearchDoc[];
};

export type SearchResult = {
  doc: SearchDoc;
  group: GroupKey;
  score: number;
  /** The section that matched best, when it was not the page as a whole. */
  section?: SearchSection;
  snippet: string;
  href: string;
};

export type ResultGroup = {
  key: GroupKey;
  label: string;
  results: SearchResult[];
  total: number;
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  pages: 'Pages',
  help: 'Help articles',
  news: 'News',
  people: 'People',
  actions: 'Quick actions',
};

export const GROUP_ORDER: GroupKey[] = ['pages', 'help', 'news', 'people', 'actions'];

export function groupOf(type: DocType): GroupKey {
  switch (type) {
    case 'help':
      return 'help';
    case 'news':
      return 'news';
    case 'person':
    case 'department':
      return 'people';
    case 'action':
      return 'actions';
    default:
      return 'pages';
  }
}

/* ---------- Text normalization ---------- */

function normChar(ch: string): string {
  const lower = ch.toLowerCase();
  if (lower.length !== 1) return ch;
  const base = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return base.length === 1 ? base : lower;
}

/** Lowercase and strip accents without changing string length, so offsets map back to the original. */
export function normalize(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) out += normChar(text[i]!);
  return out;
}

export type Token = { value: string; start: number; end: number };

export function tokenize(text: string): Token[] {
  const norm = normalize(text);
  const tokens: Token[] = [];
  const re = /[a-z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(norm))) {
    tokens.push({ value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const token of tokenize(query)) seen.add(token.value);
  return [...seen];
}

function uniqueTokens(text: string | undefined): string[] {
  if (!text) return [];
  return [...new Set(tokenize(text).map((token) => token.value))];
}

/* ---------- Matching ---------- */

/** Optimal string alignment distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows[i] = [i];
  }
  for (let j = 1; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length]![b.length]!;
}

export type MatchKind = 'exact' | 'prefix' | 'infix' | 'fuzzy';

function maxEdits(term: string): number {
  if (term.length >= 8) return 2;
  if (term.length >= 4) return 1;
  return 0;
}

/** How well one query term matches one indexed token, 0 to 1. */
export function matchTerm(term: string, token: string, fuzzy: boolean): { quality: number; kind: MatchKind } | null {
  if (token === term) return { quality: 1, kind: 'exact' };
  if (token.startsWith(term)) {
    if (term.length === 1) return token.length <= 3 ? { quality: 0.5, kind: 'prefix' } : null;
    return { quality: 0.6 + 0.3 * (term.length / token.length), kind: 'prefix' };
  }
  if (term.length >= 3 && token.length > term.length && token.includes(term)) return { quality: 0.4, kind: 'infix' };
  if (!fuzzy) return null;
  const edits = maxEdits(term);
  if (!edits) return null;
  if (Math.abs(token.length - term.length) <= edits) {
    const distance = editDistance(term, token, edits);
    if (distance <= edits) return { quality: distance === 1 ? 0.6 : 0.45, kind: 'fuzzy' };
  }
  if (term.length >= 5 && token.length > term.length) {
    const distance = editDistance(term, token.slice(0, term.length), 1);
    if (distance <= 1) return { quality: 0.45, kind: 'fuzzy' };
  }
  return null;
}

/* ---------- Prepared index ---------- */

type Field = { tokens: string[]; weight: number; fuzzy: boolean };

type PreparedSection = {
  section: SearchSection;
  heading: Field;
  text: Field;
};

export type PreparedDoc = {
  doc: SearchDoc;
  group: GroupKey;
  normTitle: string;
  fields: Field[];
  sections: PreparedSection[];
};

const WEIGHT = {
  title: 10,
  keywords: 6,
  meta: 5,
  heading: 5,
  crumbs: 2.5,
  summary: 3,
  text: 1.5,
};

export function prepare(index: SearchIndex | SearchDoc[]): PreparedDoc[] {
  const docs = Array.isArray(index) ? index : index.docs;
  return docs.map((doc) => ({
    doc,
    group: groupOf(doc.type),
    normTitle: normalize(doc.title),
    fields: [
      { tokens: uniqueTokens(doc.title), weight: WEIGHT.title, fuzzy: true },
      { tokens: uniqueTokens(doc.keywords), weight: WEIGHT.keywords, fuzzy: true },
      { tokens: uniqueTokens(doc.meta), weight: WEIGHT.meta, fuzzy: true },
      { tokens: uniqueTokens(doc.crumbs.slice(1).join(' ')), weight: WEIGHT.crumbs, fuzzy: false },
      { tokens: uniqueTokens(doc.summary), weight: WEIGHT.summary, fuzzy: true },
    ],
    sections: (doc.sections ?? []).map((section) => ({
      section,
      heading: { tokens: uniqueTokens(section.heading), weight: WEIGHT.heading, fuzzy: true },
      text: { tokens: uniqueTokens(section.text), weight: WEIGHT.text, fuzzy: false },
    })),
  }));
}

function fieldScore(term: string, field: Field): number {
  let best = 0;
  for (const token of field.tokens) {
    const match = matchTerm(term, token, field.fuzzy);
    if (match && match.quality > best) {
      best = match.quality;
      if (best === 1) break;
    }
  }
  return best * field.weight;
}

type Scored = { score: number; section?: SearchSection; matched: number };

function scoreDoc(prepared: PreparedDoc, terms: string[], phrase: string, requireAll: boolean): Scored | null {
  let total = 0;
  let matched = 0;
  const sectionTotals = prepared.sections.map(() => 0);
  const sectionHits = prepared.sections.map(() => 0);
  let docFieldTotal = 0;

  for (const term of terms) {
    let best = 0;
    for (const field of prepared.fields) best = Math.max(best, fieldScore(term, field));
    docFieldTotal += best;
    let bestSection = 0;
    prepared.sections.forEach((section, i) => {
      const value = Math.max(fieldScore(term, section.heading), fieldScore(term, section.text));
      sectionTotals[i]! += value;
      if (value > 0) sectionHits[i]! += 1;
      if (value > bestSection) bestSection = value;
    });
    const termScore = Math.max(best, bestSection);
    if (termScore > 0) matched += 1;
    else if (requireAll) return null;
    total += termScore;
  }
  if (!matched) return null;

  if (phrase.length >= 2) {
    if (prepared.normTitle.startsWith(phrase)) total += 8;
    else if (prepared.normTitle.includes(phrase)) total += 5;
  }

  let section: SearchSection | undefined;
  let sectionScore = 0;
  prepared.sections.forEach((entry, i) => {
    const value = sectionTotals[i]! + sectionHits[i]! * 0.5;
    if (value > sectionScore) {
      sectionScore = value;
      section = entry.section;
    }
  });
  // Point at a section only when it explains the match better than the title, summary, or keywords do.
  if (section && sectionScore <= docFieldTotal) section = undefined;
  return { score: total, section, matched };
}

/* ---------- Snippets and highlighting ---------- */

export type Range = [number, number];

export function highlightRanges(text: string, terms: string[]): Range[] {
  if (!terms.length || !text) return [];
  const ranges: Range[] = [];
  const norm = normalize(text);
  for (const token of tokenize(text)) {
    let best: Range | null = null;
    for (const term of terms) {
      const match = matchTerm(term, token.value, term.length >= 4);
      if (!match) continue;
      let range: Range;
      if (match.kind === 'prefix') range = [token.start, token.start + term.length];
      else if (match.kind === 'infix') {
        const at = norm.indexOf(term, token.start);
        range = [at, at + term.length];
      } else range = [token.start, token.end];
      if (!best || range[1] - range[0] > best[1] - best[0]) best = range;
    }
    if (best) ranges.push(best);
  }
  return ranges;
}

export function makeSnippet(text: string, terms: string[], length = 150): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= length) return clean;
  const ranges = highlightRanges(clean, terms);
  const first = ranges[0]?.[0] ?? 0;
  let start = Math.max(0, first - Math.round(length * 0.3));
  if (start > 0) {
    const space = clean.indexOf(' ', start);
    start = space >= 0 && space < first ? space + 1 : start;
  }
  let end = Math.min(clean.length, start + length);
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end);
    if (space > start + length / 2) end = space;
  }
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

function resultHref(doc: SearchDoc, section?: SearchSection): string {
  if (!section?.anchor || doc.href.includes('#') || /^[a-z]+:/i.test(doc.href)) return doc.href;
  return `${doc.href}${section.anchor}`;
}

function toResult(prepared: PreparedDoc, scored: Scored, terms: string[]): SearchResult {
  const { doc } = prepared;
  const section = scored.section;
  const source = section?.text || doc.summary || doc.sections?.[0]?.text || '';
  return {
    doc,
    group: prepared.group,
    score: scored.score,
    section,
    snippet: makeSnippet(source, terms),
    href: resultHref(doc, section),
  };
}

/* ---------- Queries ---------- */

export function search(prepared: PreparedDoc[], query: string): SearchResult[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const phrase = normalize(query.trim().replace(/\s+/g, ' '));
  const results: SearchResult[] = [];
  for (const entry of prepared) {
    const scored = scoreDoc(entry, terms, phrase, true);
    if (scored) results.push(toResult(entry, scored, terms));
  }
  return results.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
}

export const GROUP_LIMITS: Record<GroupKey, number> = {
  pages: 5,
  help: 4,
  news: 3,
  people: 4,
  actions: 3,
};

/** Group results, ordering the groups by their best hit. */
export function groupResults(results: SearchResult[], limits: Partial<Record<GroupKey, number>> = GROUP_LIMITS): ResultGroup[] {
  const groups = new Map<GroupKey, ResultGroup>();
  for (const result of results) {
    let group = groups.get(result.group);
    if (!group) {
      group = { key: result.group, label: GROUP_LABELS[result.group], results: [], total: 0 };
      groups.set(result.group, group);
    }
    group.total += 1;
    const limit = limits[result.group] ?? Infinity;
    if (group.results.length < limit) group.results.push(result);
  }
  return [...groups.values()].sort(
    (a, b) =>
      (b.results[0]?.score ?? 0) - (a.results[0]?.score ?? 0) ||
      GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key),
  );
}

/**
 * Help articles loosely related to a query that found nothing: any single
 * term may match, typos are allowed in body text, and the most-read articles
 * fill in when even that finds nothing.
 */
export function relatedHelp(prepared: PreparedDoc[], query: string, count = 3): SearchResult[] {
  const terms = queryTerms(query).filter((term) => term.length >= 3);
  const help = prepared.filter((entry) => entry.doc.type === 'help');
  const loose = help.map((entry) => ({
    ...entry,
    sections: entry.sections.map((section) => ({ ...section, text: { ...section.text, fuzzy: true } })),
  }));
  const scored: SearchResult[] = [];
  if (terms.length) {
    for (const entry of loose) {
      const result = scoreDoc(entry, terms, '', false);
      if (result) scored.push(toResult(entry, result, terms));
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, count);
  for (const entry of help) {
    if (picked.length >= count) break;
    if (picked.some((result) => result.doc.id === entry.doc.id)) continue;
    picked.push(toResult(entry, { score: 0, matched: 0 }, []));
  }
  return picked;
}
