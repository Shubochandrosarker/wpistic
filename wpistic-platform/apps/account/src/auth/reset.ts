/**
 * Password reset. The request endpoint always answers 200 (no account
 * enumeration). Delivery goes through EMAIL_WEBHOOK_URL when configured —
 * a relay endpoint that receives { to, template, data } and hands off to
 * the transactional email provider.
 */
import type { Context } from 'hono';
import type { AppContext } from '../env';
import { hashPassword, randomToken, sha256Hex } from '../utils/crypto';
import { findUserByEmail, recordSecurityEvent, revokeAllSessions } from '../db/schema';
import { getClientIp } from './sessions';

export async function handlePasswordResetRequest(c: Context<AppContext>, input: { email: string }) {
  const sql = c.get('sql');
  const user = await findUserByEmail(sql, input.email);

  if (user) {
    const token = randomToken(32);
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${await sha256Hex(token)}, NOW() + INTERVAL '1 hour')`;
    await recordSecurityEvent(sql, {
      userId: user.id,
      eventType: 'password_reset.requested',
      ipAddress: getClientIp(c),
    });

    if (c.env.EMAIL_WEBHOOK_URL) {
      const resetUrl = `${c.env.ISSUER}/reset?token=${token}`;
      c.executionCtx.waitUntil(
        fetch(c.env.EMAIL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            template: 'password_reset',
            data: { reset_url: resetUrl, first_name: user.first_name },
          }),
        }).catch(() => undefined)
      );
    }
  }

  return c.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
}

export async function handlePasswordResetConfirm(c: Context<AppContext>, input: { token: string; password: string }) {
  const sql = c.get('sql');
  const tokenHash = await sha256Hex(input.token);

  const rows = await sql<Array<{ id: string; user_id: string }>>`
    SELECT id, user_id FROM password_reset_tokens
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
    LIMIT 1`;
  const reset = rows[0];
  if (!reset) {
    return c.json({ error: { code: 'invalid_token', message: 'Reset link is invalid or expired' } }, 400);
  }

  const passwordHash = await hashPassword(input.password);
  await sql.begin(async (tx) => {
    await tx`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${reset.id}`;
    await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${reset.user_id}`;
  });

  // Credential change revokes every session everywhere.
  await revokeAllSessions(sql, reset.user_id);
  await recordSecurityEvent(sql, {
    userId: reset.user_id,
    eventType: 'password_reset.completed',
    severity: 'warning',
    ipAddress: getClientIp(c),
  });

  return c.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
}
