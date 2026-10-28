import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const axeSource = require('axe-core').source;
const port = Number(process.env.A11Y_PORT || 4391);
const site = `http://127.0.0.1:${port}/university-of-mars`;

const pages = [
  '/',
  '/about/',
  '/academics/',
  '/academics/calendar/',
  '/events/',
  '/admissions/',
  '/financial-aid/',
  '/housing/',
  '/research/',
  '/faculty/',
  '/students/',
  '/parents/',
  '/alumni/',
  '/give/',
  '/news/fellowships/',
  '/news/library-hours/',
  '/news/scholars/',
  '/accessibility/',
  '/privacy/',
  '/title-ix/',
  '/emergency/',
  '/search/',
  '/login/',
  '/support/',
  '/support/requests/',
  '/support/articles/password/',
  '/support/articles/registration/',
  '/support/articles/billing/',
  '/support/articles/financial-aid-hold/',
  '/support/articles/housing-repair/',
  '/support/articles/accommodations/',
];

const axeOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  resultTypes: ['violations'],
};

const impactRank = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function writeSummary(markdown) {
  const text = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}

function renderReport(results) {
  const findings = results.filter((page) => page.violations.length > 0);
  const clean = results.filter((page) => page.ok && page.violations.length === 0).map((page) => page.path);
  const lines = [
    '## Nightly accessibility check',
    '',
    `Scanned ${results.length} main pages on the built site with axe (WCAG 2.1 A and AA).`,
    'Findings do not fail this job. The site keeps a few accessibility issues on purpose.',
    '',
    `${findings.length} of ${results.length} pages have findings.`,
    '',
  ];
  if (clean.length) lines.push(`No findings: ${clean.join(', ')}`, '');
  for (const page of results) {
    if (!page.ok) {
      lines.push(`### ${page.path}`, '', `Could not scan this page: ${page.error}`, '');
      continue;
    }
    if (!page.violations.length) continue;
    lines.push(`### ${page.path}`, '');
    for (const violation of page.violations) {
      const help = violation.help.replace(/\.$/, '');
      const target = violation.target ? ` First target: \`${violation.target}\`.` : '';
      lines.push(`- **${violation.id}** (${violation.impact}, ${violation.nodes} element${violation.nodes === 1 ? '' : 's'}) — ${help}.${target}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const attempts = [{ channel: 'chrome', args }];
  const paths = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const executablePath of paths) attempts.push({ executablePath, args });
  let last = 'Chrome did not start.';
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last);
}

function startPreview() {
  const child = spawn(path.join(root, 'node_modules/.bin/astro'), ['preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  let log = '';
  const keep = (chunk) => {
    log = `${log}${chunk}`.slice(-4000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return {
    child,
    log: () => log,
    stop() {
      if (!child.pid || child.killed) return;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    },
  };
}

async function waitForServer(preview) {
  const home = `${site}/`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (preview.child.exitCode !== null) {
      throw new Error(`Preview exited ${preview.child.exitCode}. ${preview.log()}`);
    }
    try {
      const response = await fetch(home);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Preview did not start. ${preview.log()}`);
}

async function scanPage(page, pathname) {
  const url = `${site}${pathname}`;
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    if (response && response.status() >= 400) {
      return { path: pathname, ok: false, error: `HTTP ${response.status()}`, violations: [] };
    }
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async (options) => {
      const outcome = await window.axe.run(document, options);
      return outcome.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact || 'unknown',
        help: violation.help,
        nodes: violation.nodes.length,
        target: violation.nodes[0]?.target?.join(' ') || '',
      }));
    }, axeOptions);
    violations.sort((a, b) => (impactRank[a.impact] ?? 9) - (impactRank[b.impact] ?? 9) || a.id.localeCompare(b.id));
    return { path: pathname, ok: true, error: '', violations };
  } catch (error) {
    return { path: pathname, ok: false, error: error instanceof Error ? error.message : 'scan failed', violations: [] };
  }
}

async function main() {
  const preview = startPreview();
  let browser;
  try {
    await waitForServer(preview);
    browser = await launchBrowser();
    const page = await browser.newPage();
    const results = [];
    for (const pathname of pages) results.push(await scanPage(page, pathname));
    writeSummary(renderReport(results));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The scan did not finish.';
    writeSummary(`## Nightly accessibility check\n\nThe scan did not finish. Findings would not have failed this job.\n\n${message}\n`);
  } finally {
    await browser?.close().catch(() => {});
    preview.stop();
    process.exitCode = 0;
  }
}

await main();
