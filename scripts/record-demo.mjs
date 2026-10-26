import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
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

const launch = {
  headless: process.env.DEMO_HEADLESS !== '0',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${audio}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
  ],
};
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
else launch.channel = process.env.CHROME_CHANNEL || 'chrome';

const browser = await chromium.launch(launch);

const context = await browser.newContext({
  permissions: ['microphone'],
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
let failed = false;
let connectDelayMs = 0;
try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  const pageLoadedAt = Date.now();
  const button = page.locator('[data-call-launch="housing"]').first();
  await button.click();
  await page.locator('.call-panel[data-call-state="live"]').waitFor({ timeout: 20000 });
  connectDelayMs = Date.now() - pageLoadedAt;
  console.log(`Call connected ${connectDelayMs} ms after page load.`);
  await page.locator('#housing-request').evaluate((card) => {
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(holdMs);
  const hangup = page.locator('.call-hangup');
  if (await hangup.isVisible()) await hangup.click();
  await page.locator('#housing-request').evaluate((card) => {
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(1500);
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  const video = page.video();
  await context.close();
  const saved = video ? await video.path() : '';
  await browser.close();
  if (saved) {
    console.log(`Wrote ${saved}`);
    console.log('That Playwright file has no audio track.');
    const muxed = await muxCallerAudio(saved, audio, process.env.DEMO_AGENT_AUDIO, connectDelayMs);
    if (muxed) console.log(`Wrote ${muxed}`);
  }
}

if (failed) process.exit(1);

async function muxCallerAudio(videoPath, callerWav, agentWav, connectDelayMs) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    console.log('To add the caller WAV, install ffmpeg (`npx playwright-core install ffmpeg`) or put ffmpeg on PATH. Agent speech is not in the recording: it plays inside the page and Playwright does not capture it. Pass DEMO_AGENT_AUDIO only if you already have that WAV.');
    return '';
  }
  const duration = await probeDuration(ffmpeg, videoPath);
  if (!(duration > 0)) {
    console.log('Could not read the video duration, so the caller WAV was not muxed. The silent video is unchanged.');
    return '';
  }
  const delayMs = Math.max(0, Math.round(connectDelayMs));
  const whole = duration.toFixed(3);
  const mixed = videoPath.replace(/\.webm$/i, '') + '-audio.webm';
  const args = ['-y', '-i', videoPath];
  if (agentWav) {
    args.push(
      '-i',
      callerWav,
      '-i',
      path.resolve(agentWav),
      '-filter_complex',
      `[1:a]adelay=${delayMs}:all=1[caller];[2:a]adelay=${delayMs}:all=1[agent];[caller][agent]amix=inputs=2:duration=longest,apad=whole_dur=${whole}[a]`,
      '-map',
      '0:v:0',
      '-map',
      '[a]',
    );
  } else {
    args.push(
      '-i',
      callerWav,
      '-filter_complex',
      `[1:a]adelay=${delayMs}:all=1,apad=whole_dur=${whole}[a]`,
      '-map',
      '0:v:0',
      '-map',
      '[a]',
    );
  }
  args.push('-c:v', 'copy', '-c:a', 'libopus', '-t', whole, mixed);
  const code = await run(ffmpeg, args);
  if (code !== 0) {
    console.log('ffmpeg could not mux audio. The silent video is unchanged. Agent speech is not captured from the page.');
    return '';
  }
  if (!agentWav) {
    console.log('Muxed the caller WAV only. Agent speech is not captured from the page.');
  }
  return mixed;
}

async function probeDuration(ffmpeg, videoPath) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
  const probed = await runCapture(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath]);
  const fromProbe = Number(probed.stdout.trim());
  if (fromProbe > 0) return fromProbe;
  const info = await runCapture(ffmpeg, ['-i', videoPath]);
  const match = info.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if ((await run('ffmpeg', ['-version'])) === 0) return 'ffmpeg';
  const caches = [
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ];
  for (const cache of caches) {
    let entries = [];
    try {
      entries = await readdir(cache);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.startsWith('ffmpeg')) continue;
      const bin = path.join(cache, entry, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if ((await run(bin, ['-version'])) === 0) return bin;
    }
  }
  return '';
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function runCapture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', () => resolve({ code: 1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
