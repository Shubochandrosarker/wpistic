/**
 * Node HTTP server for a Hono app built against Cloudflare bindings.
 *
 * `app.fetch(request, env, ctx)` already takes the environment and execution
 * context as arguments, so hosting a Workers-shaped app on Node needs no
 * change to the app itself — only a server that constructs a `Request`,
 * supplies the adapters as `env`, and writes the `Response` back out.
 *
 * Implemented on `node:http` rather than pulling in `@hono/node-server`: the
 * conversion is about sixty lines, and a deployment whose selling point is
 * "one command on your own box" benefits from one fewer dependency to audit
 * and update.
 *
 * Shutdown is deliberate. On SIGTERM the server stops accepting connections,
 * lets in-flight requests finish, drains outstanding `waitUntil` work, then
 * closes the database pool. Without that, every redeploy would drop the
 * background writes queued by the last few requests.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Sql } from 'postgres';
import {
  createExecutionContext,
  type ExecutionContextTracker,
  type NodeExecutionContext,
} from './context.ts';

/**
 * Generic over the environment so the app's own `fetch` signature stays
 * satisfiable. Hono types its env parameter as `{} | Env | undefined`, which a
 * plain `unknown` cannot be assigned to — parameters are contravariant — so
 * pinning TEnv from the caller's `env` is what lets a real Hono app be passed
 * here without a cast.
 */
export interface ServeOptions<TEnv> {
  app: { fetch: (request: Request, env: TEnv, ctx: NodeExecutionContext) => Response | Promise<Response> };
  env: TEnv;
  sql: Sql;
  port: number;
  hostname?: string;
  name: string;
  /** Called on SIGTERM before connections close, for extra teardown. */
  onShutdown?: () => Promise<void>;
}

export interface RunningServer {
  server: Server;
  ctx: ExecutionContextTracker;
  close(): Promise<void>;
}

function log(level: 'info' | 'error', message: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, ...extra, time: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function toRequest(req: IncomingMessage, hostHeader: string): Request {
  // The scheme is always http here — TLS is terminated upstream, by the
  // Cloudflare Tunnel or reverse proxy in front of this process. Trusting
  // X-Forwarded-Proto to build the URL would let a caller forge it.
  const url = new URL(req.url ?? '/', `http://${hostHeader}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    // Required by undici whenever a body is a stream.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    // Set-Cookie is the one header that legitimately repeats; Headers folds
    // duplicates into one comma-joined value, which browsers mis-parse.
    if (key.toLowerCase() === 'set-cookie') {
      const existing = headers['set-cookie'];
      headers['set-cookie'] = Array.isArray(existing) ? [...existing, value] : existing ? [existing as string, value] : [value];
    } else {
      headers[key] = value;
    }
  });
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as never)
      .on('error', reject)
      .on('end', resolve)
      .pipe(res);
  });
}

export function serveHonoApp<TEnv>(options: ServeOptions<TEnv>): RunningServer {
  const ctx = createExecutionContext((error) =>
    log('error', 'background task failed', {
      service: options.name,
      error: error instanceof Error ? error.message : String(error),
    })
  );

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const request = toRequest(req, req.headers.host ?? `localhost:${options.port}`);
        const response = await options.app.fetch(request, options.env, ctx);
        await writeResponse(response, res);
      } catch (error) {
        log('error', 'unhandled request error', {
          service: options.name,
          path: req.url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        // Never leak the message: the app's own error handler already shapes
        // anything it can classify, so reaching here means something unexpected.
        res.end(JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong' } }));
      }
    })();
  });

  const hostname = options.hostname ?? '0.0.0.0';
  server.listen(options.port, hostname, () => {
    log('info', 'listening', { service: options.name, port: options.port, hostname });
  });

  let closing: Promise<void> | null = null;
  const close = async (): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      log('info', 'shutting down', { service: options.name, pending: ctx.pending() });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await options.onShutdown?.();
      await ctx.drain();
      await options.sql.end({ timeout: 5 }).catch(() => undefined);
      log('info', 'shutdown complete', { service: options.name });
    })();
    return closing;
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void close().then(() => process.exit(0));
    });
  }

  return { server, ctx, close };
}
