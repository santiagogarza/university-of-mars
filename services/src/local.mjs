import http from 'node:http';
import { createApp } from './app.js';
import { memoryStorage } from './storage.js';

const port = Number(process.env.PORT || 8787);
const app = createApp({ storage: memoryStorage(null) });

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const method = req.method || 'GET';
    const request = new Request(`http://${host}${req.url}`, {
      method,
      headers: req.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    const response = await app.handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`services listening on http://127.0.0.1:${port}`);
});
