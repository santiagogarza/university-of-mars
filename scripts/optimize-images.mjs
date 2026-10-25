import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'public', 'images');
const names = ['hero-quad', 'library', 'residence-halls', 'students', 'lecture-hall', 'research'];
const widths = [640, 960, 1280, 1920];

await mkdir(dir, { recursive: true });

for (const name of names) {
  const input = path.join(dir, `${name}.jpg`);
  let sourceStat;
  try {
    sourceStat = await stat(input);
  } catch {
    console.error(`Missing ${input}. Add the photograph before building.`);
    process.exit(1);
  }

  for (const width of widths) {
    const output = path.join(dir, `${name}-${width}.webp`);
    let fresh = false;
    try {
      const outputStat = await stat(output);
      fresh = outputStat.mtimeMs >= sourceStat.mtimeMs;
    } catch {
      fresh = false;
    }
    if (fresh) continue;

    await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(output);
    console.log(`wrote ${path.relative(root, output)}`);
  }
}
