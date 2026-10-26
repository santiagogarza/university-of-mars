import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('scripts/demo-caller.wav');
const key = process.env.XAI_API_KEY;

if (!key) {
  console.error('XAI_API_KEY is not set. The caller recording was not created.');
  process.exit(1);
}

const leadSeconds = Number(process.env.DEMO_LEAD_SECONDS || 9);
const gapSeconds = Number(process.env.DEMO_GAP_SECONDS || 12);

const lines = [
  {
    language: 'en',
    text: 'Hi, my name is Jordan Rivera. My student ID is 7 0 0, 1 2 3, 4 5 6. My email is jordan.rivera at umars dot edu. I live in Isidis Hall, room 214, and there is a leak under my bathroom sink.',
  },
  {
    language: 'es-MX',
    text: 'El agua ya está llegando al piso. Me preocupa porque hay un enchufe muy cerca.',
  },
  {
    language: 'en',
    text: 'Sorry, back to English. It needs to be fixed soon, but it is not an emergency. I am available weekday mornings. Please do not submit the form. I will press the button myself.',
  },
];

const clips = [silence(24000, leadSeconds)];
for (const line of lines) {
  const response = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text: line.text,
      voice_id: 'ara',
      language: line.language,
      text_normalization: true,
      output_format: { codec: 'wav', sample_rate: 24000 },
    }),
  });
  if (!response.ok) {
    console.error(`Speech request failed (${response.status}).`);
    process.exit(1);
  }
  const type = response.headers.get('content-type') || '';
  let bytes;
  if (type.includes('json')) {
    const payload = await response.json();
    const audio = payload.audio || payload.data;
    if (!audio) {
      console.error('Speech response did not include audio.');
      process.exit(1);
    }
    bytes = Buffer.from(audio, 'base64');
  } else {
    bytes = Buffer.from(await response.arrayBuffer());
  }
  clips.push(decodeWav(bytes));
  clips.push(silence(24000, gapSeconds));
}

const merged = concat(clips);
const wav = encodeWav(resample(merged.samples, merged.rate, 48000), 48000);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, wav);
console.log(`Wrote ${out}`);

function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Speech response was not a WAV file.');
  }
  let offset = 12;
  let rate = 24000;
  let channels = 1;
  let bits = 16;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(start + 2);
      rate = buffer.readUInt32LE(start + 4);
      bits = buffer.readUInt16LE(start + 14);
    } else if (id === 'data') {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!data) throw new Error('WAV data was missing.');
  if (bits !== 16) throw new Error(`Expected 16-bit audio, received ${bits}.`);
  const samples = [];
  for (let i = 0; i + 1 < data.length; i += 2 * channels) {
    samples.push(data.readInt16LE(i) / 32768);
  }
  return { samples, rate };
}

function silence(rate, seconds) {
  return { samples: Array.from({ length: Math.floor(rate * seconds) }, () => 0), rate };
}

function concat(parts) {
  const rate = parts[0].rate;
  const samples = [];
  for (const part of parts) {
    if (part.rate !== rate) throw new Error('Audio clips did not share a sample rate.');
    for (const sample of part.samples) samples.push(sample);
  }
  return { samples, rate };
}

function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const length = Math.floor(samples.length / ratio);
  const output = new Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const mix = pos - left;
    output[i] = samples[left] * (1 - mix) + samples[right] * mix;
  }
  return output;
}

function encodeWav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(value < 0 ? value * 0x8000 : value * 0x7fff, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
