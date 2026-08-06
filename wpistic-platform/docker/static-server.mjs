import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const root = process.env.STATIC_ROOT || '/app/dashboard';
const port = Number(process.env.PORT || 8080);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function fileFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = join(root, relative);
  try {
    if (statSync(candidate).isFile()) return candidate;
  } catch {
    // Unknown routes are handled by the SPA below.
  }
  return join(root, 'index.html');
}

createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end('{"ok":true,"service":"wpistic-dashboard"}');
    return;
  }

  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const file = fileFor(pathname);
  if (!file) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Bad Request');
    return;
  }
  const immutable = pathname.startsWith('/assets/') && file !== join(root, 'index.html');
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`WPistic dashboard listening on :${port}`);
});
