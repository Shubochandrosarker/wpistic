#!/usr/bin/env node
// Zero-dependency static file server for the customer dashboard SPA.
//
// Serves DASHBOARD_ROOT (default /app/dashboard) with an index.html fallback
// for unknown paths — the SPA routes client-side, and without the fallback a
// refresh on /licenses would 404. Hashed assets under /assets are immutable;
// index.html is never cached so a redeploy is picked up on the next load.
//
// Used by docker/entrypoint.node.sh role `dashboard`. Never expose this to the
// host directly — it sits on the internal Docker network behind cloudflared.

import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const ROOT = process.env.DASHBOARD_ROOT ?? '/app/dashboard';
const PORT = Number(process.env.DASHBOARD_PORT ?? 8080);
const HOST = process.env.DASHBOARD_HOST ?? '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

async function resolveFile(urlPath) {
  // Normalize and confine to ROOT — reject traversal before touching the fs.
  const clean = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, clean);
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const s = await stat(candidate);
    if (s.isFile()) return candidate;
  } catch {
    /* fall through to SPA fallback */
  }
  return null;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('ok');
  }

  let filePath = await resolveFile(decodeURIComponent(url.pathname));
  let isFallback = false;
  if (!filePath) {
    filePath = join(ROOT, 'index.html'); // SPA fallback
    isFallback = true;
  }

  try {
    const body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const immutable = !isFallback && url.pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'Content-Length': body.byteLength,
      ...SECURITY_HEADERS,
    });
    return res.end(method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dashboard] serving ${ROOT} on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
