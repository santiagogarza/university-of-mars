import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editDistance,
  groupResults,
  highlightRanges,
  makeSnippet,
  matchTerm,
  normalize,
  prepare,
  relatedHelp,
  search,
  type SearchDoc,
} from '../src/lib/search-engine.ts';
import { extractPage, textFragment } from '../src/lib/search-extract.ts';

const docs: SearchDoc[] = [
  {
    id: 'page:/housing/',
    type: 'page',
    title: 'Housing & Residential Life',
    href: '/housing/',
    crumbs: ['Home'],
    summary: 'Residence halls, move-in, and maintenance.',
    area: 'Campus life & support',
    sections: [
      { heading: 'Move-in', anchor: '#move-in', text: 'Spring move-in for Olympus Mons Hall opens at 9 a.m.' },
      { heading: 'Maintenance', anchor: '#repairs', text: 'Report a leak or broken heater through the Help Center.' },
    ],
  },
  {
    id: 'page:/support/articles/housing-repair/',
    type: 'help',
    title: 'Request a housing repair',
    href: '/support/articles/housing-repair/',
    crumbs: ['Home', 'Student Support'],
    summary: 'Routine repairs are scheduled on weekdays.',
    keywords: 'maintenance work order',
    area: 'Campus life & support',
    sections: [{ heading: 'Call instead', anchor: '#:~:text=Call%20instead', text: 'Call for an active leak or a door that will not lock.' }],
  },
  {
    id: 'page:/support/articles/password/',
    type: 'help',
    title: 'Reset a UM password',
    href: '/support/articles/password/',
    crumbs: ['Home', 'Student Support'],
    summary: 'Unlock MyUM.',
    area: 'Campus life & support',
  },
  {
    id: 'person:sofia-lindqvist',
    type: 'person',
    title: 'Sofia Lindqvist',
    href: '/directory/#sofia-lindqvist',
    crumbs: ['Home', 'Campus directory', 'Office of the Registrar'],
    summary: 'Registration and transcripts.',
    meta: 'University Registrar · Office of the Registrar',
    area: 'Directory',
  },
  {
    id: 'action:report-repair',
    type: 'action',
    title: 'Report a housing repair',
    href: '/support/?category=housing-repair#request',
    crumbs: ['Quick action'],
    summary: 'Open the Help Center form.',
    keywords: 'maintenance broken leak',
    area: 'Quick actions',
  },
];

const index = prepare({ version: 1, docs });

test('normalize keeps offsets aligned with the original text', () => {
  const text = 'Café Jezero';
  assert.equal(normalize(text).length, text.length);
  assert.equal(normalize(text), 'cafe jezero');
});

test('edit distance counts a transposition as one edit', () => {
  assert.equal(editDistance('hosuing', 'housing', 2), 1);
  assert.equal(editDistance('regstration', 'registration', 2), 1);
  assert.ok(editDistance('aid', 'observatory', 2) > 2);
});

test('match quality prefers exact, then prefix, then fuzzy', () => {
  assert.equal(matchTerm('repair', 'repair', true)?.kind, 'exact');
  assert.equal(matchTerm('rep', 'repair', true)?.kind, 'prefix');
  assert.equal(matchTerm('repiar', 'repair', true)?.kind, 'fuzzy');
  assert.equal(matchTerm('repiar', 'repair', false), null);
});

test('title matches outrank body text', () => {
  const results = search(index, 'housing');
  assert.equal(results[0]?.doc.title, 'Housing & Residential Life');
  assert.ok(results.some((result) => result.doc.type === 'help'));
});

test('typos still find the page', () => {
  assert.equal(search(index, 'hosuing')[0]?.doc.href, '/housing/');
  assert.equal(search(index, 'lindqvst')[0]?.doc.type, 'person');
});

test('every term has to match somewhere', () => {
  assert.equal(search(index, 'housing zzzz').length, 0);
});

test('a section match deep-links to that section', () => {
  const result = search(index, 'olympus mons').find((entry) => entry.doc.href === '/housing/');
  assert.equal(result?.section?.heading, 'Move-in');
  assert.equal(result?.href, '/housing/#move-in');
});

test('groups are ordered by their best hit and respect limits', () => {
  const groups = groupResults(search(index, 'repair'), { help: 1 });
  assert.ok(groups.length >= 2);
  const help = groups.find((group) => group.key === 'help');
  assert.equal(help?.results.length, 1);
  assert.ok(groups.every((group, i) => i === 0 || (groups[i - 1]!.results[0]!.score >= group.results[0]!.score)));
});

test('highlight ranges cover prefix and whole-word matches', () => {
  const text = 'Request a housing repair';
  const ranges = highlightRanges(text, ['hous', 'repair']);
  assert.deepEqual(
    ranges.map(([start, end]) => text.slice(start, end)),
    ['hous', 'repair'],
  );
});

test('snippets center on the first match', () => {
  const long = `${'Background sentence about the campus. '.repeat(8)}The observatory opens for viewing nights. ${'More filler text. '.repeat(8)}`;
  const snippet = makeSnippet(long, ['observatory'], 100);
  assert.ok(snippet.startsWith('…'));
  assert.ok(snippet.includes('observatory'));
});

test('no-result queries still suggest help articles', () => {
  const related = relatedHelp(index, 'leaky door', 2);
  assert.equal(related[0]?.doc.href, '/support/articles/housing-repair/');
  assert.equal(relatedHelp(index, 'qqqq', 2).length, 2);
});

test('text fragments escape the characters the syntax reserves', () => {
  assert.equal(textFragment('Move-in, spring'), '#:~:text=Move%2Din%2C%20spring');
});

test('extractPage reads title, breadcrumbs, and sections from rendered HTML', () => {
  const html = `<!doctype html><html><head><title>Request a housing repair · University of Mars</title>
    <meta name="description" content="How to ask for a repair."></head><body>
    <header class="site-header"><nav aria-label="Primary">Academics</nav></header>
    <main id="main"><header class="page-hero"><nav aria-label="Breadcrumb"><ol class="crumbs">
      <li><a href="/">Home</a></li><li><a href="/support/">Student Support</a></li><li><span aria-current="page">Housing repair</span></li>
    </ol></nav><p class="eyebrow">Housing</p><h1>Request a housing repair</h1><p class="lede">Routine repairs are scheduled on weekdays.</p></header>
    <article><p>Include the hall &amp; the room number.</p><script>var x = 1;</script>
    <h2>Call instead</h2><p>Call for an active leak.</p>
    <div hidden><p>Secret confirmation text</p></div>
    <article class="card" id="college-arts"><h3>College of Arts &amp; Letters</h3><p>English and history.</p></article>
    </article></main><footer>Footer text</footer></body></html>`;
  const doc = extractPage(html, { path: '/support/articles/housing-repair/', area: 'Campus life & support' });
  assert.ok(doc);
  assert.equal(doc.type, 'help');
  assert.equal(doc.title, 'Request a housing repair');
  assert.deepEqual(doc.crumbs, ['Home', 'Student Support']);
  assert.equal(doc.summary, 'Routine repairs are scheduled on weekdays.');
  assert.deepEqual(
    doc.sections?.map((section) => [section.heading, section.anchor]),
    [
      ['', ''],
      ['Call instead', '#:~:text=Call%20instead'],
      ['College of Arts & Letters', '#college-arts'],
    ],
  );
  assert.equal(doc.sections?.[0]?.text, 'Include the hall & the room number.');
  const all = JSON.stringify(doc);
  assert.ok(!all.includes('Secret confirmation'));
  assert.ok(!all.includes('var x'));
  assert.ok(!all.includes('Footer text'));
});

test('extractPage skips noindex pages', () => {
  const html = '<html><head><meta name="robots" content="noindex"><title>Staff</title></head><body><main></main></body></html>';
  assert.equal(extractPage(html, { path: '/staff/', area: 'About UM' }), null);
});
