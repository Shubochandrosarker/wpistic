/**
 * Same-origin mutation proxy for interactive islands. Keeps the staff access
 * token server-side — the browser never holds a credential that works against
 * api.wpistic.com directly.
 *
 * Two independent gates, both required:
 *
 *  1. an authenticated admin session (the Astro middleware has already run and
 *     populated `locals.admin`), and
 *  2. a same-origin `Origin` header, so a cross-site page cannot drive this
 *     endpoint with the operator's cookies.
 *
 * The endpoint allowlist is a positive list of path patterns, not a prefix
 * match. Adding a management surface to the API is not enough to make it
 * reachable from a browser — it has to be named here too.
 */
import type { APIRoute } from 'astro';

const UUID = '[0-9a-f-]{36}';

/** Every path the portal is allowed to reach, per HTTP method. */
const ALLOWED: Record<string, RegExp[]> = {
  POST: [
    new RegExp(`^/step-up$`),
    new RegExp(`^/licenses/${UUID}/action$`),
    new RegExp(`^/subscriptions/${UUID}/cancel$`),
    new RegExp(`^/webhooks/${UUID}/retry$`),
    new RegExp(`^/organizations/${UUID}/grant$`),
    // catalog
    new RegExp(`^/catalog/products$`),
    new RegExp(`^/catalog/products/${UUID}/(plans|features|retire)$`),
    new RegExp(`^/catalog/plans/${UUID}/prices$`),
    // tenancy
    new RegExp(`^/tenancy/organizations$`),
    new RegExp(`^/tenancy/organizations/${UUID}/(status|grants|members)$`),
    new RegExp(`^/tenancy/users/${UUID}/(status|reset-mfa|password-reset|revoke-sessions)$`),
    // licensing
    new RegExp(`^/licensing$`),
    new RegExp(`^/licensing/${UUID}/(change-plan|seats|extend|transfer)$`),
  ],
  PATCH: [
    new RegExp(`^/catalog/(products|plans|prices|features)/${UUID}$`),
    new RegExp(`^/tenancy/organizations/${UUID}$`),
    new RegExp(`^/tenancy/organizations/${UUID}/(grants|members)/${UUID}$`),
    new RegExp(`^/tenancy/users/${UUID}$`),
  ],
  PUT: [new RegExp(`^/catalog/plans/${UUID}/entitlements$`)],
  DELETE: [
    new RegExp(`^/step-up$`),
    new RegExp(`^/catalog/(products|plans|prices|features)/${UUID}$`),
    new RegExp(`^/tenancy/organizations/${UUID}/(grants|members)/${UUID}$`),
  ],
};

function deny(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const session = locals.admin;
  const origin = request.headers.get('Origin');
  if (!session || !origin || origin !== new URL(request.url).origin) {
    return deny('Authenticated same-origin request required', 403);
  }

  const { endpoint, body, method } = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    body?: unknown;
    method?: string;
  };

  const verb = (method ?? 'POST').toUpperCase();
  const patterns = ALLOWED[verb];
  if (!patterns) return deny(`Method ${verb} is not proxied`, 400);
  if (!endpoint || !patterns.some((p) => p.test(endpoint))) {
    return deny('Endpoint not allowed', 400);
  }

  const upstream = await fetch(`${env.API_URL}/api/v1/admin${endpoint}`, {
    method: verb,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    // GET is not proxied at all (server-rendered pages read data directly), so
    // every proxied verb carries a body — DELETE included, since destructive
    // routes take a reason and an MFA code.
    body: JSON.stringify(body ?? {}),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
