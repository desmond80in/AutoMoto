// GET http://localhost:8787/token?email=… -> { access_token }. Local Supabase only; used by authMode "dev".
import { createServer } from 'node:http';
import { assertLocal, mintDevToken } from './dev-token';

assertLocal();
const PORT = Number(process.env.DEV_TOKEN_PORT ?? 8787);
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);

createServer(async (req, res) => {
  const origin = req.headers.origin ?? '';
  if (ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'content-type' }).end();
    return;
  }
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (req.method !== 'GET' || url.pathname !== '/token') {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"NOT_FOUND"}');
    return;
  }
  try {
    const { access_token } = await mintDevToken(url.searchParams.get('email') ?? '');
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ access_token }));
  } catch (e) {
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`dev token server on http://localhost:${PORT}/token?email=…`));
