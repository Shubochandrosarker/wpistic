/**
 * TOTP MFA: setup returns the otpauth:// URI + one-time-visible recovery
 * codes; verify confirms possession and flips mfa_enabled; disable requires
 * password + a current code.
 */
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import type { AppContext } from '../env';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyPassword,
  verifyTotp,
} from '../utils/crypto';
import { findUserById, recordSecurityEvent } from '../db/schema';
import { getClientIp } from './sessions';

export async function handleMfaSetup(c: Context<AppContext>) {
  const sql = c.get('sql');
  const session = c.get('session')!;
  const user = await findUserById(sql, session.userId);
  if (!user) return c.json({ error: { code: 'not_found', message: 'User not found' } }, 404);
  if (user.mfa_enabled) {
    return c.json({ error: { code: 'mfa_already_enabled', message: 'MFA is already enabled' } }, 409);
  }

  const secret = generateTotpSecret();
  const encrypted = await encryptSecret(secret, c.env.MFA_ENC_KEY);
  const recoveryCodes = generateRecoveryCodes(10);

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET mfa_secret = ${encrypted}, mfa_enabled = FALSE, mfa_verified_at = NULL
             WHERE id = ${user.id}`;
    await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${user.id}`;
    for (const code of recoveryCodes) {
      const hash = await bcrypt.hash(code, 10);
      await tx`INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (${user.id}, ${hash})`;
    }
  });

  return c.json({
    otpauth_uri: totpUri(secret, user.email),
    secret, // shown once for manual entry
    recovery_codes: recoveryCodes, // shown once — user must store them now
  });
}

export async function handleMfaVerify(c: Context<AppContext>, input: { code: string }) {
  const sql = c.get('sql');
  const session = c.get('session')!;
  const user = await findUserById(sql, session.userId);
  if (!user?.mfa_secret) {
    return c.json({ error: { code: 'mfa_not_setup', message: 'Run /mfa/setup first' } }, 400);
  }

  const secret = await decryptSecret(user.mfa_secret, c.env.MFA_ENC_KEY);
  if (!verifyTotp(secret, input.code.replace(/\s/g, ''))) {
    return c.json({ error: { code: 'mfa_invalid', message: 'Invalid code — check your authenticator app' } }, 400);
  }

  await sql`UPDATE users SET mfa_enabled = TRUE, mfa_verified_at = NOW() WHERE id = ${user.id}`;
  await recordSecurityEvent(sql, {
    userId: user.id,
    eventType: 'mfa.enabled',
    ipAddress: getClientIp(c),
  });
  return c.json({ enabled: true });
}

export async function handleMfaDisable(c: Context<AppContext>, input: { password: string; code: string }) {
  const sql = c.get('sql');
  const session = c.get('session')!;
  const user = await findUserById(sql, session.userId);
  if (!user) return c.json({ error: { code: 'not_found', message: 'User not found' } }, 404);
  if (!user.mfa_enabled || !user.mfa_secret) {
    return c.json({ error: { code: 'mfa_not_enabled', message: 'MFA is not enabled' } }, 400);
  }

  if (!(await verifyPassword(input.password, user.password_hash))) {
    return c.json({ error: { code: 'invalid_credentials', message: 'Password is incorrect' } }, 401);
  }
  const secret = await decryptSecret(user.mfa_secret, c.env.MFA_ENC_KEY);
  if (!verifyTotp(secret, input.code.replace(/\s/g, ''))) {
    return c.json({ error: { code: 'mfa_invalid', message: 'Invalid MFA code' } }, 401);
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_verified_at = NULL WHERE id = ${user.id}`;
    await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${user.id}`;
  });
  await recordSecurityEvent(sql, {
    userId: user.id,
    eventType: 'mfa.disabled',
    severity: 'warning',
    ipAddress: getClientIp(c),
  });
  return c.json({ enabled: false });
}
