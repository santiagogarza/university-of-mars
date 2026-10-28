import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { departmentName, departments, people } from '../data/directory';
import { quickActions } from '../data/quick-actions';
import { searchIndex as keywordIndex } from '../data/search-index';
import { u } from '../lib/paths';
import type { SearchDoc, SearchIndex } from '../lib/search-engine';
import { extractPage } from '../lib/search-extract';

type PageModule = { default: Parameters<AstroContainer['renderToString']>[0] };

const pages = import.meta.glob<PageModule>(['./**/*.astro', '!./staff/**', '!./404.astro', '!./search.astro']);

const AREAS: [RegExp, string][] = [
  [/^\/(academics|research)\//, 'Academics & research'],
  [/^\/(admissions|financial-aid)\//, 'Admissions & aid'],
  [/^\/(students|housing|support)\//, 'Campus life & support'],
  [/^\/(faculty|parents|alumni|give|login)\//, 'Audiences & giving'],
  [/^\/directory\//, 'Directory'],
];

const POPULAR_HELP = [
  '/support/articles/financial-aid-hold/',
  '/support/articles/housing-repair/',
  '/support/articles/registration/',
  '/support/articles/password/',
  '/support/articles/billing/',
  '/support/articles/accommodations/',
];

function areaFor(path: string): string {
  return AREAS.find(([pattern]) => pattern.test(path))?.[1] ?? 'About UM';
}

function routeFor(file: string): string {
  const route = file.replace(/^\.\//, '/').replace(/(\/index)?\.astro$/, '');
  return route.endsWith('/') ? route : `${route}/`;
}

async function pageDocs(): Promise<SearchDoc[]> {
  const container = await AstroContainer.create();
  const docs: SearchDoc[] = [];
  for (const [file, load] of Object.entries(pages).sort(([a], [b]) => a.localeCompare(b))) {
    const path = routeFor(file);
    const module = await load();
    const html = await container.renderToString(module.default, {
      request: new Request(new URL(u(path), 'https://santiagogarza.github.io')),
    });
    const keywords = keywordIndex
      .filter((item) => item.href === path)
      .map((item) => `${item.title} ${item.text}`)
      .join(' ');
    const doc = extractPage(html, { path, area: areaFor(path), keywords });
    if (!doc) continue;
    if (path === '/directory/') {
      // People and departments are indexed one by one below.
      doc.sections = [];
      doc.keywords = `${doc.keywords} people staff contacts phone email offices`;
    }
    docs.push(doc);
  }
  // Help articles in the order the Help Center lists them as most read; the palette shows the first few.
  const popular = (doc: SearchDoc) => {
    const at = POPULAR_HELP.indexOf(doc.href);
    return at < 0 ? POPULAR_HELP.length : at;
  };
  const help = docs.filter((doc) => doc.type === 'help').sort((a, b) => popular(a) - popular(b));
  return [...docs.filter((doc) => doc.type !== 'help'), ...help];
}

function directoryDocs(): SearchDoc[] {
  const deptDocs: SearchDoc[] = departments.map((department) => ({
    id: `department:${department.id}`,
    type: 'department',
    title: department.name,
    href: `/directory/#${department.id}`,
    crumbs: ['Home', 'Campus directory'],
    summary: department.summary,
    keywords: `${department.kind} ${department.keywords} ${department.email}`,
    meta: `${department.kind} · ${department.location} · ${department.phone}`,
    area: 'Directory',
    icon: department.kind === 'College' ? 'college' : 'building',
  }));
  const personDocs: SearchDoc[] = people.map((person) => {
    const dept = departmentName(person.department);
    return {
      id: `person:${person.id}`,
      type: 'person',
      title: person.name,
      href: `/directory/#${person.id}`,
      crumbs: ['Home', 'Campus directory', dept],
      summary: `${person.focus} ${person.office}. ${person.phone}, ${person.email}.`,
      keywords: `${person.title} ${dept} ${person.email}`,
      meta: `${person.title} · ${dept}`,
      area: 'Directory',
      icon: 'person',
    };
  });
  return [...personDocs, ...deptDocs];
}

function actionDocs(): SearchDoc[] {
  return quickActions.map((action) => ({
    id: `action:${action.id}`,
    type: 'action',
    title: action.title,
    href: action.href,
    crumbs: ['Quick action'],
    summary: action.description,
    keywords: action.keywords,
    area: 'Quick actions',
    icon: action.icon,
  }));
}

export const GET: APIRoute = async () => {
  const index: SearchIndex = {
    version: 1,
    docs: [...(await pageDocs()), ...directoryDocs(), ...actionDocs()],
  };
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
