/**
 * Login: password + optional TOTP/recovery-code MFA in one call.
 * Failed attempts are rate-limited per IP (10/15min) and recorded as security
 * events. New-device logins emit a security alert event.
 */
import type { Context } from 'hono';
import type { LoginInput } from '@wpistic/types';
import type { AppContext } from '../env';
import { decryptSecret, deviceFingerprint, verifyPassword, verifyTotp } from '../utils/crypto';
import bcrypt from 'bcryptjs';
import { establishSession, getClientIp } from './sessions';
import { findUserByEmail, listUserOrganizations, recordSecurityEvent, touchLogin } from '../db/schema';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;

/**
 * Failed-attempt counting is a single atomic statement in Postgres.
 *
 * It used to be a KV read, a parseInt, and a write. Under the concurrent
 * guessing this limiter exists to stop, every request read the same value
 * before any write landed, so ten parallel attempts recorded one failure. The
 * INSERT ... ON CONFLICT DO UPDATE below serializes on the row lock, so N
 * concurrent attempts produce N distinct counts.
 *
 * Reads and writes share the counter: `peek` looks without incrementing so a
 * legitimate user who is already locked out is rejected before their password
 * is checked, and `record` increments only on an actual failure.
 */
async function peekFailedAttempts(c: Context<AppContext>, ip: string): Promise<number> {
  const windowStart = currentWindowStart();
  const rows = await c.get('sql')<{ count: number }[]>`
    SELECT count FROM rate_limit_counters
    WHERE bucket = ${`login-fail:${ip}`} AND window_start = ${windowStart}
    LIMIT 1`;
  return rows[0]?.count ?? 0;
}

async function recordFailedAttempt(c: Context<AppContext>, ip: string): Promise<void> {
  await c.get('sql')`
    SELECT rate_limit_bump(${`login-fail:${ip}`}, ${currentWindowStart()}, ${WINDOW_SECONDS * 2})`;
}

function currentWindowStart(): Date {
  const windowMs = WINDOW_SECONDS * 1000;
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

export async function handleLogin(c: Context<AppContext>, input: LoginInput) {
  const sql = c.get('sql');
  const ip = getClientIp(c);
  const userAgent = c.req.header('User-Agent') ?? null;

  if ((await peekFailedAttempts(c, ip)) >= MAX_ATTEMPTS) {
    return c.json(
      { error: { code: 'rate_limited', message: 'Too many failed attempts. Try again in a few minutes.' } },
      429
    );
  }

  const user = await findUserByEmail(sql, input.email);
  // Awaited, not fired into waitUntil: the count has to be durable before the
  // rejection goes out, or a fast attacker outruns their own failure counter.
  const invalid = async () => {
    await recordFailedAttempt(c, ip);
    return c.json({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } }, 401);
  };

  if (!user || user.status !== 'active') return await invalid();
  if (!(await verifyPassword(input.password, user.password_hash))) {
    await recordSecurityEvent(sql, {
      userId: user.id,
      eventType: 'login.failed',
      severity: 'warning',
      ipAddress: ip,
      userAgent,
    });
    return await invalid();
  }

  // MFA gate — TOTP first, then single-use recovery codes.
  if (user.mfa_enabled) {
    if (!input.mfa_code) {
      return c.json({ error: { code: 'mfa_required', message: 'MFA code required' } }, 401);
    }
    let mfaOk = false;
    if (user.mfa_secret) {
      const secret = await decryptSecret(user.mfa_secret, c.env.MFA_ENC_KEY);
      mfaOk = verifyTotp(secret, input.mfa_code.replace(/\s/g, ''));
    }
    if (!mfaOk) {
      // Bounded on purpose: each row costs a bcrypt comparison, and bcrypt is
      // deliberately slow. Enrolment issues 10 codes, so the limit is headroom
      // rather than a constraint — but without it a malformed account with
      // hundreds of unused codes would turn one wrong digit into a CPU stall.
      const codes = await sql<{ id: string; code_hash: string }[]>`
        SELECT id, code_hash FROM mfa_recovery_codes
        WHERE user_id = ${user.id} AND used_at IS NULL
        ORDER BY created_at LIMIT 20`;
      for (const row of codes) {
        if (await bcrypt.compare(input.mfa_code.toUpperCase(), row.code_hash)) {
          await sql`UPDATE mfa_recovery_codes SET used_at = NOW() WHERE id = ${row.id}`;
          await recordSecurityEvent(sql, {
            userId: user.id,
            eventType: 'mfa.recovery_code_used',
            severity: 'warning',
            ipAddress: ip,
            userAgent,
          });
          mfaOk = true;
          break;
        }
      }
    }
    if (!mfaOk) {
      await recordFailedAttempt(c, ip);
      return c.json({ error: { code: 'mfa_invalid', message: 'Invalid MFA code' } }, 401);
    }
  }

  // New-device detection for security alerts.
  const fingerprint = await deviceFingerprint(userAgent ?? '', c.req.header('Accept-Language') ?? '', ip);
  const known = await sql`
    SELECT 1 FROM trusted_devices WHERE user_id = ${user.id} AND device_fingerprint = ${fingerprint} LIMIT 1`;
  if (known.length === 0) {
    await sql`
      INSERT INTO trusted_devices (user_id, device_fingerprint, device_name)
      VALUES (${user.id}, ${fingerprint}, ${userAgent?.slice(0, 120) ?? 'Unknown device'})
      ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_used_at = NOW()`;
    await recordSecurityEvent(sql, {
      userId: user.id,
      eventType: 'login.new_device',
      severity: 'warning',
      ipAddress: ip,
      userAgent,
    });
  } else {
    await sql`
      UPDATE trusted_devices SET last_used_at = NOW()
      WHERE user_id = ${user.id} AND device_fingerprint = ${fingerprint}`;
  }

  const organizations = await listUserOrganizations(sql, user.id);
  const currentOrg = organizations[0] ?? null;
  await establishSession(c, user, currentOrg?.id ?? null, input.remember_me ?? false);
  await touchLogin(sql, user.id);
  await recordSecurityEvent(sql, {
    userId: user.id,
    eventType: 'login.success',
    ipAddress: ip,
    userAgent,
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      mfa_enabled: user.mfa_enabled,
    },
    organizations,
    current_org: currentOrg,
  });
}
