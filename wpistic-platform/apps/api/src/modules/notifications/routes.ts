import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { notificationPreferenceSchema } from '@wpistic/types';
import type { AppContext } from '../../env';
import { requireOrg } from '../../middleware/tenant';

export const notificationRoutes = new Hono<AppContext>();

notificationRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const user = c.get('user')!;
  const unreadOnly = c.req.query('unread') === '1';
  const notifications = await c.get('sql')`
    SELECT id, type, severity, title, body, action_url, read_at, created_at
    FROM notifications
    WHERE user_id = ${user.id}
      AND (organization_id IS NULL OR organization_id = ${orgId})
      AND (${!unreadOnly} OR read_at IS NULL)
    ORDER BY created_at DESC LIMIT 100`;
  return c.json({ notifications });
});

notificationRoutes.post('/:notificationId/read', async (c) => {
  const user = c.get('user')!;
  await c.get('sql')`
    UPDATE notifications SET read_at = NOW()
    WHERE id = ${c.req.param('notificationId')} AND user_id = ${user.id} AND read_at IS NULL`;
  return c.body(null, 204);
});

notificationRoutes.post('/read-all', async (c) => {
  const { orgId } = requireOrg(c);
  const user = c.get('user')!;
  const rows = await c.get('sql')`
    UPDATE notifications SET read_at = NOW()
    WHERE user_id = ${user.id} AND read_at IS NULL
      AND (organization_id IS NULL OR organization_id = ${orgId})
    RETURNING id`;
  return c.json({ marked_read: rows.length });
});

notificationRoutes.get('/preferences', async (c) => {
  const user = c.get('user')!;
  const preferences = await c.get('sql')`
    SELECT channel, category, enabled FROM notification_preferences
    WHERE user_id = ${user.id} ORDER BY category, channel`;
  return c.json({ preferences });
});

notificationRoutes.put('/preferences', zValidator('json', notificationPreferenceSchema), async (c) => {
  const user = c.get('user')!;
  const body = c.req.valid('json');
  // Security and critical billing notifications cannot be suppressed.
  if (['security', 'billing_critical'].includes(body.category) && !body.enabled) {
    return c.json(
      { error: { code: 'not_suppressible', message: 'Security and critical billing notifications cannot be disabled' } },
      400
    );
  }
  await c.get('sql')`
    INSERT INTO notification_preferences (user_id, channel, category, enabled)
    VALUES (${user.id}, ${body.channel}, ${body.category}, ${body.enabled})
    ON CONFLICT (user_id, channel, category) DO UPDATE SET enabled = ${body.enabled}`;
  return c.json({ ok: true });
});
