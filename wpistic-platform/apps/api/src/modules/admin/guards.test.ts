/**
 * Authorization tests for the super-admin surfaces.
 *
 * The two things worth pinning here are the ones a reviewer cannot verify by
 * reading a route file: that the role ladder actually blocks a lower tier, and
 * that the step-up window opens, gates, expires, and closes the way the UI
 * assumes it does.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  closeStepUp,
  openStepUp,
  requireAdmin,
  requireAdminRole,
  requireStepUp,
  stepUpStatus,
  STEP_UP_TTL_SECONDS,
} from './guards';
import { createMockKV, testData } from '../../test/setup';
import { ApiError } from '../../errors';

vi.mock('../../utils/totp', () => ({
  // The MFA primitives have their own coverage; here the only interesting
  // distinction is "the operator typed the right code" vs "they did not".
  decryptMfaSecret: vi.fn(async () => 'DECRYPTED_SECRET'),
  verifyTotpCode: vi.fn(async (_secret: string, code: string) => code === '123456'),
}));

interface ContextOverrides {
  authKind?: string;
  adminRole?: string;
  user?: { id: string; email: string };
  adminEmails?: string;
  adminRoles?: string;
  scopes?: string[];
  allowLegacyToken?: string;
  kv?: KVNamespace;
  mfaEnabled?: boolean;
}

function makeContext(overrides: ContextOverrides = {}) {
  const vars: Record<string, unknown> = {
    authKind: overrides.authKind,
    adminRole: overrides.adminRole,
    user: overrides.user,
    scopes: overrides.scopes,
  };
  const sql = vi.fn(async () => [
    { mfa_enabled: overrides.mfaEnabled ?? true, mfa_secret: 'encrypted' },
  ]) as unknown as (...args: unknown[]) => Promise<unknown>;
  vars.sql = sql;

  return {
    req: { method: 'POST', path: '/api/v1/admin/catalog/products', header: () => undefined },
    env: {
      SESSION_CACHE: overrides.kv ?? createMockKV(),
      ADMIN_EMAILS: overrides.adminEmails ?? '',
      ADMIN_ROLES: overrides.adminRoles,
      ALLOW_LEGACY_ADMIN_TOKEN: overrides.allowLegacyToken,
      MFA_ENC_KEY: 'key',
    },
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
  } as never;
}

describe('requireAdmin', () => {
  it('assigns the configured role from ADMIN_ROLES, not from anything client-supplied', async () => {
    const c = makeContext({
      authKind: 'jwt',
      user: { id: testData.uuids.user, email: 'Owner@Wpistic.com' },
      adminEmails: 'owner@wpistic.com',
      adminRoles: 'owner@wpistic.com=super_admin',
      scopes: ['admin'],
    });
    const next = vi.fn();
    await requireAdmin(c, next);
    expect(next).toHaveBeenCalled();
    expect((c as never as { get(k: string): unknown }).get('adminRole')).toBe('super_admin');
  });

  it('defaults an allowlisted staff member to the least privileged role', async () => {
    const c = makeContext({
      authKind: 'jwt',
      user: { id: testData.uuids.user, email: 'support@wpistic.com' },
      adminEmails: 'support@wpistic.com',
      scopes: ['admin'],
    });
    await requireAdmin(c, vi.fn());
    expect((c as never as { get(k: string): unknown }).get('adminRole')).toBe('support_agent');
  });

  it('rejects an allowlisted email whose token lacks the admin scope', async () => {
    const c = makeContext({
      authKind: 'jwt',
      user: { id: testData.uuids.user, email: 'support@wpistic.com' },
      adminEmails: 'support@wpistic.com',
      scopes: ['openid', 'org'],
    });
    await expect(requireAdmin(c, vi.fn())).rejects.toThrow(ApiError);
  });

  it('rejects a valid admin scope from an email outside the allowlist', async () => {
    const c = makeContext({
      authKind: 'jwt',
      user: { id: testData.uuids.user, email: 'outsider@example.com' },
      adminEmails: 'owner@wpistic.com',
      scopes: ['admin'],
    });
    await expect(requireAdmin(c, vi.fn())).rejects.toThrow(ApiError);
  });
});

describe('requireAdminRole', () => {
  it('lets an exact-match role through', async () => {
    const c = makeContext({ adminRole: 'platform_admin' });
    const next = vi.fn();
    await requireAdminRole('platform_admin', 'super_admin')(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('lets a higher role through a lower floor', async () => {
    const c = makeContext({ adminRole: 'super_admin' });
    const next = vi.fn();
    await requireAdminRole('billing_admin')(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks a support agent from catalog management', async () => {
    const c = makeContext({ adminRole: 'support_agent' });
    await expect(requireAdminRole('platform_admin', 'super_admin')(c, vi.fn())).rejects.toThrow(
      /requires one of/
    );
  });

  it('blocks the automation token from every management surface', async () => {
    // The legacy CI token is not a person, so nothing it does is attributable.
    const c = makeContext({ adminRole: 'automation' });
    await expect(requireAdminRole('billing_admin')(c, vi.fn())).rejects.toThrow(/personal staff session/);
  });
});

describe('step-up window', () => {
  it('opens on a correct code and reports the deadline', async () => {
    const kv = createMockKV();
    const c = makeContext({ kv, user: { id: testData.uuids.user, email: 'owner@wpistic.com' } });

    const result = await openStepUp(c, '123456');
    const expiresIn = new Date(result.expires_at).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan((STEP_UP_TTL_SECONDS - 5) * 1000);
    expect(await stepUpStatus(c)).toMatchObject({ active: true });
  });

  it('refuses to open on a wrong code', async () => {
    const c = makeContext({ user: { id: testData.uuids.user, email: 'owner@wpistic.com' } });
    await expect(openStepUp(c, '999999')).rejects.toThrow(/invalid or expired/);
  });

  it('refuses to open when staff MFA is not enrolled', async () => {
    const c = makeContext({ user: { id: testData.uuids.user, email: 'owner@wpistic.com' }, mfaEnabled: false });
    await expect(openStepUp(c, '123456')).rejects.toThrow(/MFA must be enabled/);
  });

  it('gates a mutation until the window is open', async () => {
    const kv = createMockKV();
    const c = makeContext({ kv, user: { id: testData.uuids.user, email: 'owner@wpistic.com' } });

    await expect(requireStepUp(c, vi.fn())).rejects.toMatchObject({ code: 'step_up_required' });

    await openStepUp(c, '123456');
    const next = vi.fn();
    await requireStepUp(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('treats a stale KV read past the stored deadline as closed', async () => {
    // KV expiry is eventually consistent, so the stored ISO deadline — not the
    // key's presence — is what decides whether the window is still open.
    const kv = createMockKV();
    const c = makeContext({ kv, user: { id: testData.uuids.user, email: 'owner@wpistic.com' } });
    await kv.put(`stepup:${testData.uuids.user}`, new Date(Date.now() - 1000).toISOString());

    expect(await stepUpStatus(c)).toEqual({ active: false, expires_at: null });
    await expect(requireStepUp(c, vi.fn())).rejects.toMatchObject({ code: 'step_up_required' });
  });

  it('closes on demand', async () => {
    const kv = createMockKV();
    const c = makeContext({ kv, user: { id: testData.uuids.user, email: 'owner@wpistic.com' } });
    await openStepUp(c, '123456');
    await closeStepUp(c);
    expect(await stepUpStatus(c)).toEqual({ active: false, expires_at: null });
  });

  it('reports closed for an unauthenticated context rather than throwing', async () => {
    const c = makeContext({ user: undefined });
    expect(await stepUpStatus(c)).toEqual({ active: false, expires_at: null });
  });
});
