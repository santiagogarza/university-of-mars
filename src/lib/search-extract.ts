import type { SearchDoc, SearchSection } from './search-engine';

/**
 * Turn one rendered page into a search document.
 *
 * Runs at build time on HTML produced by Astro for this site, so a small
 * tag scanner is enough; it does not try to be a general HTML parser.
 */

const SKIP = new Set(['script', 'style', 'svg', 'form', 'noscript', 'template', 'select', 'button', 'dialog', 'textarea', 'picture']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = /^(p|li|h[1-6]|div|section|article|aside|header|footer|tr|td|th|caption|dt|dd|summary|details|ul|ol|table|blockquote|address|figure|figcaption|br)$/;
const MAX_SECTION_TEXT = 1400;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  copy: '©',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function clean(text: string): string {
  return decodeEntities(text)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)”’])/g, '$1')
    .replace(/([(“‘])\s+/g, '$1')
    .trim();
}

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return undefined;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, 'i').test(attrs);
}

/** Text of the first element matching `open` (a regex for its opening tag). */
function firstText(html: string, open: RegExp, tag: string): string {
  const match = open.exec(html);
  if (!match) return '';
  const start = match.index + match[0].length;
  const end = html.indexOf(`</${tag}>`, start);
  return clean(html.slice(start, end < 0 ? undefined : end).replace(/<[^>]+>/g, ' '));
}

export function textFragment(text: string): string {
  const encoded = encodeURIComponent(text).replace(/-/g, '%2D').replace(/,/g, '%2C').replace(/&/g, '%26');
  return `#:~:text=${encoded}`;
}

type WalkSection = { heading: string; anchor: string; parts: string[] };

function walkMain(main: string): SearchSection[] {
  const sections: WalkSection[] = [{ heading: '', anchor: '', parts: [] }];
  const stack: { tag: string; id?: string; skip: boolean }[] = [];
  let skipDepth = 0;
  let heading: { level: number; id?: string; parentId?: string; parts: string[] } | null = null;
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)\s*(\/?)>/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string) => {
    if (skipDepth || !raw) return;
    if (heading) heading.parts.push(raw);
    else sections[sections.length - 1]!.parts.push(raw);
  };

  while ((match = tagRe.exec(main))) {
    pushText(main.slice(last, match.index));
    last = tagRe.lastIndex;
    if (match[0].startsWith('<!--')) continue;
    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    const attrs = match[3] ?? '';
    const selfClosing = match[4] === '/' || VOID.has(tag);

    if (closing) {
      // Pop to the matching element; tolerate stray closers.
      const at = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (at < 0) continue;
      const popped = stack.splice(at);
      skipDepth -= popped.filter((entry) => entry.skip).length;
      if (popped.some((entry) => entry.skip)) continue;
      if (heading && /^h[1-6]$/.test(tag) && Number(tag[1]) === heading.level) {
        const text = clean(heading.parts.join(' '));
        const { level, id, parentId } = heading;
        heading = null;
        if (!text) continue;
        const ownAnchor = id ? `#${id}` : parentId ? `#${parentId}` : textFragment(text);
        if (level === 2 || (level === 3 && (id || parentId))) {
          sections.push({ heading: text, anchor: ownAnchor, parts: [] });
        } else {
          sections[sections.length - 1]!.parts.push(/[.?!:]$/.test(text) ? ` ${text} ` : ` ${text}. `);
        }
      } else if (BLOCK.test(tag)) {
        pushText(' ');
      }
      continue;
    }

    if (selfClosing) {
      if (BLOCK.test(tag)) pushText(' ');
      continue;
    }

    const skip =
      SKIP.has(tag) ||
      hasAttr(attrs, 'hidden') ||
      attr(attrs, 'aria-hidden') === 'true' ||
      hasAttr(attrs, 'data-search-ignore');
    if (skipDepth || skip) {
      stack.push({ tag, skip });
      if (skip) skipDepth += 1;
      continue;
    }

    const parent = stack[stack.length - 1];
    const id = attr(attrs, 'id');
    stack.push({ tag, id, skip: false });
    if (/^h[1-6]$/.test(tag)) {
      heading = { level: Number(tag[1]), id, parentId: parent?.id && parent.id !== 'main' ? parent.id : undefined, parts: [] };
    } else if (BLOCK.test(tag)) {
      pushText(' ');
    }
  }
  pushText(main.slice(last));

  return sections
    .map((section) => {
      const text = clean(section.parts.join(' '));
      return {
        heading: section.heading,
        anchor: section.anchor,
        text: text.length > MAX_SECTION_TEXT ? `${text.slice(0, MAX_SECTION_TEXT).replace(/\s+\S*$/, '')}…` : text,
      };
    })
    .filter((section) => section.heading || section.text);
}

export type ExtractOptions = {
  path: string;
  area: string;
  keywords?: string;
};

export function extractPage(html: string, options: ExtractOptions): SearchDoc | null {
  const robots = /<meta\s+name="robots"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '';
  if (/noindex/i.test(robots)) return null;

  const docTitle = clean((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s*·\s*University of Mars$/, ''));
  const description = clean(/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '');

  const mainStart = html.search(/<main\b[^>]*>/i);
  const mainEnd = html.lastIndexOf('</main>');
  let main = mainStart >= 0 ? html.slice(mainStart, mainEnd > mainStart ? mainEnd : undefined) : html;

  const crumbNav = /<nav\b[^>]*aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/i.exec(main)?.[1] ?? '';
  const trail = [...crumbNav.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1]!.replace(/<[^>]+>/g, ' ')));
  const crumbs = trail.length > 1 ? trail.slice(0, -1) : ['Home'];

  const h1 = firstText(main, /<h1\b[^>]*>/i, 'h1');
  const eyebrow = firstText(main, /<p\b[^>]*class="[^"]*\beyebrow\b[^"]*"[^>]*>/i, 'p');
  const lede = firstText(main, /<p\b[^>]*class="[^"]*\blede\b[^"]*"[^>]*>/i, 'p');

  // The page hero is already captured as the title, eyebrow, and lede.
  main = main.replace(/<header\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/header>/i, '');

  const path = options.path;
  const type = path.startsWith('/support/articles/') ? 'help' : path.startsWith('/news/') ? 'news' : 'page';
  const title = path === '/' ? 'Home' : h1 || docTitle;
  const sections = walkMain(main);

  return {
    id: `page:${path}`,
    type,
    title,
    href: path,
    crumbs,
    summary: lede || description,
    keywords: [options.keywords, docTitle !== title ? docTitle : '', type === 'page' && eyebrow ? eyebrow : '']
      .filter(Boolean)
      .join(' '),
    date: type === 'news' ? eyebrow : undefined,
    area: options.area,
    sections,
  };
}
