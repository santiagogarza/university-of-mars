import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const date = 'Friday, January 15, 2027';
const dateFiles = [
  'src/pages/index.astro',
  'src/pages/academics/calendar.astro',
  'src/pages/financial-aid.astro',
  'src/pages/support/index.astro',
  'src/pages/support/articles/registration.astro',
];

const failures = [];
const fail = (message) => failures.push(message);

const aid = await read('src/pages/financial-aid.astro');
if (!aid.includes('2025-26 Verification Worksheet')) {
  fail('S1: financial aid page is missing the 2025-26 Verification Worksheet string.');
}
if (aid.includes('2026-27 Verification Worksheet') || aid.includes('2027-28 Verification Worksheet')) {
  fail('S1: financial aid page names a corrected worksheet.');
}
if (!aid.includes('2026–27') && !aid.includes('2026-27')) {
  fail('S1: financial aid page does not state aid year 2026-27.');
}

const home = await read('src/pages/index.astro');
const hero = home.match(/<img\b[^>]*class="hero-media"[^>]*>/);
if (!hero) fail('S2: home hero image tag was not found.');
else if (/\balt\s*=/.test(hero[0])) fail('S2: home hero image has an alt attribute.');

const css = await read('src/styles/global.css');
if (!/#a8a29e/i.test(css) || !css.includes('.news-meta')) {
  fail('S3: news metadata color #A8A29E was not found.');
}

const support = await read('src/pages/support/index.astro');
const studentField = support.match(/<input\b[^>]*id="student-id"[^>]*>/);
if (!studentField) fail('S4: Student ID input was not found.');
else {
  const tag = studentField[0];
  if (/\baria-label\s*=/.test(tag) || /\baria-labelledby\s*=/.test(tag) || /\btitle\s*=/.test(tag)) {
    fail('S4: Student ID input has an accessible name attribute.');
  }
}
if (/<label[^>]*for="student-id"/.test(support)) {
  fail('S4: Student ID input has an associated label.');
}

for (const file of dateFiles) {
  const text = await read(file);
  if (!text.includes(date)) fail(`S5: ${file} is missing ${date}.`);
  if (/Winter Quarter/i.test(text)) fail(`${file} still says Winter Quarter.`);
}

const shared = ['src/data', 'src/lib', 'src/scripts'];
for (const file of dateFiles) {
  /* dates are page-local */
}
for (const folder of shared) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(path.join(root, folder));
  for (const entry of entries) {
    if (!entry.endsWith('.ts')) continue;
    const text = await read(path.join(folder, entry));
    if (text.includes(date)) fail(`S5: ${folder}/${entry} shares the add/drop date.`);
    if (text.includes('Verification Worksheet')) {
      fail(`S1: ${folder}/${entry} also mentions Verification Worksheet.`);
    }
  }
}

const banned = ['ServiceNow', 'University of California', 'Harvard', 'Stanford', 'Workday'];
const { readdir } = await import('node:fs/promises');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(astro|css|ts|md|mjs|html)$/.test(entry.name)) files.push(full);
  }
  return files;
}
for (const file of await walk(path.join(root, 'src'))) {
  const text = await readFile(file, 'utf8');
  for (const word of banned) {
    if (text.includes(word)) fail(`${path.relative(root, file)} contains ${word}.`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Demo seeds are present.');
