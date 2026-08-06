import { defineMiddleware } from 'astro:middleware';
import { resolveAdminSession } from './lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/auth/callback', '/logout']);

function secure(response: Response, environment: 'staging' | 'production'): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https://account.wpistic.com https://account-staging.wpistic.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  headers.set('X-Frame-Options', 'DENY');
  if (environment === 'staging') headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Self-hosted (Node adapter) shim: the Cloudflare adapter populates
  // locals.runtime; under @astrojs/node it is absent, so surface process.env
  // through the same shape. Middleware runs before every page and API route,
  // so downstream `Astro.locals.runtime.env` reads keep working unchanged.
  if (!context.locals.runtime) {
    (context.locals as { runtime: unknown }).runtime = { env: process.env };
  }
  const path = new URL(context.request.url).pathname;
  // Cloudflare supplies bindings through `locals.runtime.env`. The standalone
  // Node adapter does not, so expose process.env through the same interface.
  const env = context.locals.runtime?.env ?? process.env;
  if (PUBLIC_PATHS.has(path) || path.startsWith('/_')) return secure(await next(), env.ENVIRONMENT);

  const session = await resolveAdminSession(context.request, context.cookies, env);
  if (!session) {
    const returnTo = path + new URL(context.request.url).search;
    return secure(context.redirect('/login?return_to=' + encodeURIComponent(returnTo), 302), env.ENVIRONMENT);
  }
  context.locals.admin = session;
  return secure(await next(), env.ENVIRONMENT);
});
