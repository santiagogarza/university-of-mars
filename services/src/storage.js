import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'seed-data.json');

export function loadSeed() {
  return JSON.parse(readFileSync(seedPath, 'utf8'));
}

export function memoryStorage(initial) {
  let state = structuredClone(initial);
  let queue = Promise.resolve();
  return {
    async read() {
      return queue.then(() => structuredClone(state));
    },
    async update(mutator) {
      const run = queue.then(async () => {
        const next = await mutator(structuredClone(state));
        state = structuredClone(next);
        return structuredClone(state);
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

const BLOB_PATH = 'uom-services/state.json';

export function blobStorage(token) {
  let queue = Promise.resolve();
  return {
    async read() {
      return readBlob(token);
    },
    async update(mutator) {
      const run = queue.then(async () => {
        const current = await readBlob(token);
        const next = await mutator(current);
        await writeBlob(token, next);
        return structuredClone(next);
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

async function readBlob(token) {
  const { get } = await import('@vercel/blob');
  try {
    const result = await get(BLOB_PATH, { access: 'private', token, useCache: false });
    if (!result || result.statusCode === 304 || result.statusCode === 404 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (error) {
    const status = error?.status ?? error?.statusCode;
    if (status === 404 || error?.name === 'BlobNotFoundError') return null;
    const message = String(error?.message ?? error);
    if (/not found|404/i.test(message)) return null;
    throw error;
  }
}

async function writeBlob(token, state) {
  const { put } = await import('@vercel/blob');
  await put(BLOB_PATH, JSON.stringify(state), {
    access: 'private',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export function createStorage(env = process.env) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (token) return blobStorage(token);
  return memoryStorage(null);
}
