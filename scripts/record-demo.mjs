import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const audio = path.resolve(process.env.DEMO_AUDIO || 'scripts/demo-caller.wav');
const pageUrl = process.env.DEMO_URL || 'https://santiagogarza.github.io/university-of-mars/housing/';
const dir = path.resolve(process.env.DEMO_VIDEO_DIR || 'scripts/demo-recordings');
const holdMs = Number(process.env.DEMO_HOLD_MS || 90000);

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. Run npm install, then try again.');
  process.exit(1);
}

await mkdir(dir, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: process.env.DEMO_HEADLESS !== '0',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${audio}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({
  permissions: ['microphone'],
  recordVideo: { dir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
let failed = false;
try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  const launch = page.locator('[data-call-launch="housing"]').first();
  await launch.click();
  await page.locator('.call-panel[data-call-state="live"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(holdMs);
  const hangup = page.locator('.call-hangup');
  if (await hangup.isVisible()) await hangup.click();
  await page.waitForTimeout(1500);
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  const video = page.video();
  await context.close();
  const saved = video ? await video.path() : '';
  await browser.close();
  if (saved) console.log(`Wrote ${saved}`);
}

if (failed) process.exit(1);
