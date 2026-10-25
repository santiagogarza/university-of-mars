import { handle } from '../src/server.js';

export default async function vercel(req, res) {
  const host = req.headers.host || 'localhost';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const method = req.method || 'GET';
  const request = new Request(`https://${host}${req.url}`, {
    method,
    headers: req.headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
  const response = await handle(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes);
}
