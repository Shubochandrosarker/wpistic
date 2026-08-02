/**
 * Same-origin mutation proxy for interactive islands (license actions,
 * webhook replays). Keeps ADMIN_API_TOKEN server-side. Only allowlisted
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
      Authorization: `Bearer ${env.ADMIN_API_TOKEN}`,
      'X-Admin-Role': 'super_admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
