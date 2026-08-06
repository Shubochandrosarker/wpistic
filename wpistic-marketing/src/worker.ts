interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ENVIRONMENT: 'staging' | 'production';
  CANONICAL_HOST: string;
}

const securityHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://account.wpistic.com https://account-staging.wpistic.com",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://account.wpistic.com https://account-staging.wpistic.com https://api.wpistic.com https://api-staging.wpistic.com",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

function withHeaders(response: Response, url: URL, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);

  const isNotFound = response.status === 404;
  const isHealth = url.pathname === '/__health';
  const isHtml = headers.get('content-type')?.includes('text/html') ?? false;
  const isImmutableAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.[a-f0-9]{8,}\.(?:css|js|png|jpg|jpeg|gif|svg|webp|woff2?)$/i.test(url.pathname);

  if (isHealth || isNotFound || isHtml) {
    headers.set('Cache-Control', 'no-store');
  } else if (isImmutableAsset) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (url.pathname === '/robots.txt' || url.pathname.startsWith('/sitemap')) {
    headers.set('Cache-Control', 'public, max-age=3600, must-revalidate');
  } else {
    headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
  }

  if (env.ENVIRONMENT === 'staging') headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (env.ENVIRONMENT === 'production' && url.hostname === 'wpistic.com') {
      const target = new URL(url);
      target.hostname = env.CANONICAL_HOST;
      return Response.redirect(target.toString(), 308);
    }

    if (url.pathname === '/__health') {
      return withHeaders(
        new Response(JSON.stringify({ ok: true, service: 'wpistic-marketing', environment: env.ENVIRONMENT }), {
          headers: { 'Content-Type': 'application/json' },
        }),
        url,
        env,
      );
    }

    return withHeaders(await env.ASSETS.fetch(request), url, env);
  },
};
export default worker;
