import { defineMiddleware } from 'astro:middleware';
import { resolveAdminSession } from './lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/auth/callback', '/logout']);

export const onRequest = defineMiddleware(async (context, next) => {
  const path = new URL(context.request.url).pathname;
  if (PUBLIC_PATHS.has(path) || path.startsWith('/_')) return next();

  const env = context.locals.runtime.env;
  const session = await resolveAdminSession(context.request, context.cookies, env);
  if (!session) {
    const returnTo = `${path}${new URL(context.request.url).search}`;
    return context.redirect(`/login?return_to=${encodeURIComponent(returnTo)}`, 302);
  }
  context.locals.admin = session;
  return next();
});
