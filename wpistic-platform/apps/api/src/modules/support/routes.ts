import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createTicketSchema, ticketMessageSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { ApiError } from '../../errors';
import { requireOrg } from '../../middleware/tenant';

export const supportRoutes = new Hono<AppContext>();

supportRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const tickets = await c.get('sql')`
    SELECT t.id, t.subject, t.severity, t.category, t.status, t.created_at, t.updated_at,
           p.slug AS product,
           (SELECT COUNT(*)::int FROM support_messages m
             WHERE m.ticket_id = t.id AND m.is_internal = FALSE) AS message_count
    FROM support_tickets t
    LEFT JOIN products p ON p.id = t.product_id
    WHERE t.organization_id = ${orgId}
    ORDER BY t.updated_at DESC LIMIT 100`;
  return c.json({ tickets });
});

supportRoutes.post('/', zValidator('json', createTicketSchema), async (c) => {
  const { orgId } = requireOrg(c);
  const user = c.get('user')!;
  const body = c.req.valid('json');
  const sql = c.get('sql');

  const products = body.product
    ? await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${body.product} LIMIT 1`
    : [];

  // website_id/license_id are client-supplied — verify they actually belong to
  // this org before attaching them, so a ticket can't reference another org's
  // resources (broken tenant isolation).
  const websiteId = body.website_id
    ? (await sql<{ id: string }[]>`SELECT id FROM websites WHERE id = ${body.website_id} AND organization_id = ${orgId} LIMIT 1`)[0]?.id ?? null
    : null;
  const licenseId = body.license_id
    ? (await sql<{ id: string }[]>`SELECT id FROM licenses WHERE id = ${body.license_id} AND organization_id = ${orgId} LIMIT 1`)[0]?.id ?? null
    : null;

  const rows = await sql<{ id: string }[]>`
    INSERT INTO support_tickets (organization_id, user_id, product_id, website_id, license_id,
                                 subject, body, severity, category, environment_details)
    VALUES (${orgId}, ${user.id}, ${products[0]?.id ?? null}, ${websiteId},
            ${licenseId}, ${body.subject}, ${body.body}, ${body.severity},
            ${body.category ?? null}, ${sql.json((body.environment_details ?? {}) as never)})
    RETURNING id`;
  const ticketId = rows[0]!.id;

  await sql`
    INSERT INTO support_messages (ticket_id, user_id, body)
    VALUES (${ticketId}, ${user.id}, ${body.body})`;

  await c.get('events').publish('support.ticket.created', {
    ticket_id: ticketId,
    org_id: orgId,
    severity: body.severity,
  });
  return c.json({ ticket: { id: ticketId } }, 201);
});

supportRoutes.get('/:ticketId', async (c) => {
  const { orgId } = requireOrg(c);
  const sql = c.get('sql');
  const tickets = await sql`
    SELECT t.id, t.subject, t.body, t.severity, t.category, t.status, t.created_at,
           p.slug AS product
    FROM support_tickets t
    LEFT JOIN products p ON p.id = t.product_id
    WHERE t.id = ${c.req.param('ticketId')} AND t.organization_id = ${orgId} LIMIT 1`;
  if (!tickets[0]) throw ApiError.notFound('Ticket');
  const messages = await sql`
    SELECT m.id, m.body, m.attachments, m.created_at, u.email AS author_email,
           u.first_name AS author_first_name
    FROM support_messages m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.ticket_id = ${c.req.param('ticketId')} AND m.is_internal = FALSE
    ORDER BY m.created_at ASC`;
  return c.json({ ticket: tickets[0], messages });
});

supportRoutes.post('/:ticketId/messages', zValidator('json', ticketMessageSchema), async (c) => {
  const { orgId } = requireOrg(c);
  const user = c.get('user')!;
  const sql = c.get('sql');
  const tickets = await sql<{ id: string }[]>`
    SELECT id FROM support_tickets
    WHERE id = ${c.req.param('ticketId')} AND organization_id = ${orgId} LIMIT 1`;
  if (!tickets[0]) throw ApiError.notFound('Ticket');

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO support_messages (ticket_id, user_id, body)
      VALUES (${tickets[0]!.id}, ${user.id}, ${c.req.valid('json').body})`;
    await tx`
      UPDATE support_tickets SET status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
      WHERE id = ${tickets[0]!.id}`;
  });
  return c.json({ ok: true }, 201);
});
