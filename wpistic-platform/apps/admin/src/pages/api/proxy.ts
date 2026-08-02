/**
 * Same-origin mutation proxy for interactive islands (license actions,
 * webhook replays). Keeps the staff access token server-side. Only allowlisted
 * admin endpoints can be reached.
 */
import type { APIRoute } from 'astro';

const ALLOWED = [
  /^\/licenses\/[0-9a-f-]{36}\/action$/,
  /^\/subscriptions\/[0-9a-f-]{36}\/cancel$/,
  /^\/webhooks\/[0-9a-f-]{36}\/retry$/,
  /^\/organizations\/[0-9a-f-]{36}\/grant$/,
];

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const session = locals.admin;
  const origin = request.headers.get('Origin');
  if (!session || !origin || origin !== new URL(request.url).origin) {
    return new Response(JSON.stringify({ error: { message: 'Authenticated same-origin request required' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const { endpoint, body } = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    body?: unknown;
  };

  if (!endpoint || !ALLOWED.some((p) => p.test(endpoint))) {
    return new Response(JSON.stringify({ error: { message: 'Endpoint not allowed' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(`${env.API_URL}/api/v1/admin${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
