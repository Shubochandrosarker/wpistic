/**
 * Tests for tenant isolation: membership enforcement, API-key org binding,
 * and that the RLS safety-net (app.current_org_id) is actually set per
 * request — the wiring that was previously missing entirely.
 */
import { describe, it, expect, vi } from 'vitest';
import { injectOrgContext, requireOrg, requireRole } from './tenant';
import { createMockSql, createMockKV, testData } from '../test/setup';
import { ApiError } from '../errors';

const ORG_A = testData.uuids.org;
const ORG_B = '99999999-9999-9999-9999-999999999999';

function makeContext(overrides: {
  method?: string;
  paramOrgId?: string;
  headerOrgId?: string;
  user?: { id: string; email: string } | undefined;
  authKind?: string;
  tokenOrgId?: string | null;
  sql?: any;
  kv?: KVNamespace;
}) {
  const vars: Record<string, unknown> = {
    user: overrides.user,
    authKind: overrides.authKind,
    tokenOrgId: overrides.tokenOrgId ?? null,
    sql: overrides.sql,
  };
  return {
    req: {
      method: overrides.method ?? 'GET',
      param: (key: string) => (key === 'orgId' ? overrides.paramOrgId : undefined),
      header: (key: string) => (key === 'X-Organization-Id' ? overrides.headerOrgId : undefined),
    },
    env: { SESSION_CACHE: overrides.kv },
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
  } as any;
}

describe('injectOrgContext', () => {
  it('passes through unauthenticated requests untouched', async () => {
    const c = makeContext({ user: undefined });
    const next = vi.fn();
    await injectOrgContext(c, next);
    expect(next).toHaveBeenCalled();
    expect(c.get('orgId')).toBeUndefined();
  });

  it('rejects a non-UUID org id', async () => {
    const c = makeContext({ user: { id: 'u1', email: 'u1@example.com' }, paramOrgId: 'not-a-uuid' });
    await expect(injectOrgContext(c, vi.fn())).rejects.toThrow(ApiError);
  });

  it('forbids access when the user is not an active member of the requested org', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([]); // no membership row
    const c = makeContext({
      user: { id: 'u1', email: 'u1@example.com' },
      paramOrgId: ORG_A,
      sql: mockSql,
      kv: createMockKV(),
    });
    await expect(injectOrgContext(c, vi.fn())).rejects.toThrow(/not a member/i);
  });

  it('sets orgId/orgRole and issues set_config(app.current_org_id) on successful membership', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]); // membership lookup
    mockSql.mockResolvedValueOnce([]); // set_config call
    const c = makeContext({
      user: { id: 'u1', email: 'u1@example.com' },
      paramOrgId: ORG_A,
      sql: mockSql,
      kv: createMockKV(),
    });
    const next = vi.fn();
    await injectOrgContext(c, next);

    expect(c.get('orgId')).toBe(ORG_A);
    expect(c.get('orgRole')).toBe('admin');
    expect(next).toHaveBeenCalled();

    const setConfigCall = mockSql.mock.calls.find((call: unknown[]) => (call[0] as string[]).join('').includes('set_config'));
    expect(setConfigCall).toBeTruthy();
    expect(setConfigCall).toContain(ORG_A);
  });

  it('API key bound to org A is forbidden from acting on org B', async () => {
    const c = makeContext({
      user: { id: 'u1', email: 'u1@example.com' },
      authKind: 'api_key',
      tokenOrgId: ORG_A,
      paramOrgId: ORG_B,
      sql: createMockSql(),
      kv: createMockKV(),
    });
    await expect(injectOrgContext(c, vi.fn())).rejects.toThrow(/does not belong/i);
  });

  it('API key matching its bound org sets RLS context and proceeds', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([]); // set_config call
    const c = makeContext({
      user: { id: 'u1', email: 'u1@example.com' },
      authKind: 'api_key',
      tokenOrgId: ORG_A,
      paramOrgId: ORG_A,
      sql: mockSql,
      kv: createMockKV(),
    });
    const next = vi.fn();
    await injectOrgContext(c, next);
    expect(c.get('orgId')).toBe(ORG_A);
    expect(next).toHaveBeenCalled();
    expect(mockSql.mock.calls[0]).toContain(ORG_A);
  });
});

describe('requireOrg / requireRole', () => {
  it('requireOrg throws when no org is resolved', () => {
    const c = makeContext({});
    expect(() => requireOrg(c)).toThrow(ApiError);
  });

  it('requireRole allows an owner regardless of the specific roles list', () => {
    const c = makeContext({});
    c.set('orgId', ORG_A);
    c.set('orgRole', 'owner');
    expect(requireRole(c, ['billing_manager'])).toEqual({ orgId: ORG_A, role: 'owner' });
  });

  it('requireRole rejects a role outside the allowed list', () => {
    const c = makeContext({});
    c.set('orgId', ORG_A);
    c.set('orgRole', 'viewer');
    expect(() => requireRole(c, ['billing_manager'])).toThrow(ApiError);
  });
});
