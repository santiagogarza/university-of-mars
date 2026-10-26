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
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const record = await readBlobRecord(token);
          const next = await mutator(record ? structuredClone(record.state) : null);
          try {
            await writeBlob(token, next, record?.etag ?? null);
            return structuredClone(next);
          } catch (error) {
            if (!isConflict(error) || attempt === 3) throw error;
          }
        }
        throw new Error('Could not save state.');
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
  const record = await readBlobRecord(token);
  return record ? record.state : null;
}

async function readBlobRecord(token) {
  const { get, head } = await import('@vercel/blob');
  try {
    // The etag from head() is the one put({ ifMatch }) compares against. The
    // download response's etag header can differ, so read it first, then the body.
    const meta = await head(BLOB_PATH, { token });
    const result = await get(BLOB_PATH, { access: 'private', token, useCache: false });
    if (!result || result.statusCode === 304 || result.statusCode === 404 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return { state: JSON.parse(text), etag: meta?.etag ?? result.blob?.etag ?? null };
  } catch (error) {
    const status = error?.status ?? error?.statusCode;
    if (status === 404 || error?.name === 'BlobNotFoundError') return null;
    const message = String(error?.message ?? error);
    if (/not found|404/i.test(message)) return null;
    throw error;
  }
}

async function writeBlob(token, state, etag) {
  const { put } = await import('@vercel/blob');
  const options = {
    access: 'private',
    token,
    addRandomSuffix: false,
    contentType: 'application/json',
  };
  if (etag) options.ifMatch = etag;
  else options.allowOverwrite = false;
  await put(BLOB_PATH, JSON.stringify(state), options);
}

function isConflict(error) {
  const status = error?.status ?? error?.statusCode;
  if (error?.name === 'BlobPreconditionFailedError' || status === 409 || status === 412) return true;
  return /precondition|already exists|conflict/i.test(String(error?.message ?? error));
}

export function createStorage(env = process.env) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (token) return blobStorage(token);
  return memoryStorage(null);
}
