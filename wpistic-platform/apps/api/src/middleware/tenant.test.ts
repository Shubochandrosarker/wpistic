/**
 * Tests for tenant isolation: path-vs-header org resolution, membership
 * enforcement, API-key org binding, and impersonation scoping.
 *
 * Note what is NOT covered here, because it is not wired: the Row Level
 * Security policies from migration 0010 are inert. `withOrg()` in db.ts is the
 * only code that sets `app.current_org_id`, and it has no call sites, so
 * `app_current_org_id()` is NULL on every request. Isolation currently rests
 * entirely on the explicit organization_id predicates these tests do cover.
 */
import { describe, it, expect, vi } from 'vitest';
import { injectOrgContext, requireOrg, requireRole } from './tenant';
import { createMockSql, createMockKV, testData } from '../test/setup';
import { ApiError } from '../errors';

const ORG_A = testData.uuids.org;
const ORG_B = '99999999-9999-9999-9999-999999999999';

function makeContext(overrides: {
  method?: string;
  path?: string;
  paramOrgId?: string;
  headerOrgId?: string;
  user?: { id: string; email: string } | undefined;
  authKind?: string;
  tokenOrgId?: string | null;
  impersonation?: boolean;
  orgRole?: string;
  sql?: any;
  kv?: KVNamespace;
}) {
  const vars: Record<string, unknown> = {
    user: overrides.user,
    authKind: overrides.authKind,
    tokenOrgId: overrides.tokenOrgId ?? null,
    impersonation: overrides.impersonation,
    orgRole: overrides.orgRole,
    sql: overrides.sql,
  };
  return {
    req: {
      method: overrides.method ?? 'GET',
      path: overrides.path ?? '/api/v1/organizations/x',
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

  it('sets orgId/orgRole on successful membership', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([{ role: 'admin' }]); // membership lookup
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

  it('API key matching its bound org proceeds without roaming', async () => {
    const mockSql: any = createMockSql();
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
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('admin routes skip customer-membership resolution entirely', async () => {
    const c = makeContext({
      user: { id: 'staff1', email: 'staff@wpistic.com' },
      path: '/api/v1/admin/licenses',
      paramOrgId: ORG_A, // even if present, must not trigger a membership lookup
      sql: createMockSql(),
      kv: createMockKV(),
    });
    const next = vi.fn();
    await injectOrgContext(c, next);
    expect(next).toHaveBeenCalled();
    expect(c.get('orgId')).toBeUndefined();
  });

  it('an impersonation token binds strictly to its own org', async () => {
    const mockSql: any = createMockSql();
    const c = makeContext({
      user: { id: 'staff1', email: 'staff@wpistic.com' },
      impersonation: true,
      tokenOrgId: ORG_A,
      paramOrgId: ORG_A,
      sql: mockSql,
      kv: createMockKV(),
    });
    const next = vi.fn();
    await injectOrgContext(c, next);
    expect(c.get('orgId')).toBe(ORG_A);
    expect(c.get('orgRole')).toBe('admin');
    expect(next).toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('an impersonation token cannot be redirected to a different org', async () => {
    const c = makeContext({
      user: { id: 'staff1', email: 'staff@wpistic.com' },
      impersonation: true,
      tokenOrgId: ORG_A,
      paramOrgId: ORG_B,
      sql: createMockSql(),
      kv: createMockKV(),
    });
    await expect(injectOrgContext(c, vi.fn())).rejects.toThrow(/does not grant access/i);
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
