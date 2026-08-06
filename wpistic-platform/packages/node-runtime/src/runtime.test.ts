/**
 * Tests for the self-hosted adapters.
 *
 * The interesting cases are the ones where a naive implementation would differ
 * from Cloudflare's in a way that changes behaviour: expiry that is enforced on
 * read rather than by a sweeper, blob keys that try to escape their volume, and
 * background work that must be drained rather than dropped on shutdown.
 */
import { describe, it, expect, vi } from 'vitest';
import { createExecutionContext } from './context.ts';
import { createOutboxQueue } from './queue.ts';
import { createPostgresKV } from './kv.ts';
import { createDiskBlobStore } from './blob.ts';

/**
 * Minimal tagged-template stand-in for postgres.js. Records each call and
 * replays queued responses, which is enough to assert what SQL was issued
 * without standing up a database.
 */
function mockSql() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const queue: unknown[][] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve(queue.shift() ?? []);
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    json: (v: unknown) => unknown;
    calls: typeof calls;
    reply: (rows: unknown[]) => void;
  };
  sql.json = (v: unknown) => v;
  sql.calls = calls;
  sql.reply = (rows: unknown[]) => queue.push(rows);
  return sql;
}

describe('Postgres KV', () => {
  it('filters expired rows in the query rather than trusting a sweeper', async () => {
    const sql = mockSql();
    sql.reply([]);
    const kv = createPostgresKV(sql as never, 'session_cache');
    await kv.get('stepup:user-1');

    // A row past its deadline must be invisible even if cleanup has not run,
    // or a lapsed step-up window could come back because the janitor was slow.
    expect(sql.calls[0]!.text).toContain('expires_at IS NULL OR expires_at > NOW()');
  });

  it('scopes every operation to its namespace', async () => {
    const sql = mockSql();
    sql.reply([]);
    const kv = createPostgresKV(sql as never, 'pkce');
    await kv.put('code-hash', 'challenge', { expirationTtl: 300 });
    // Two KV namespaces sharing one table must not be able to read each other.
    expect(sql.calls[0]!.values).toContain('pkce');
  });

  it('treats a non-positive TTL as no expiry rather than writing a dead row', async () => {
    const sql = mockSql();
    sql.reply([]);
    const kv = createPostgresKV(sql as never, 'session_cache');
    await kv.put('k', 'v', { expirationTtl: 0 });
    expect(sql.calls[0]!.values).toContain(null);
  });

  it('escapes LIKE metacharacters in a list prefix', async () => {
    const sql = mockSql();
    sql.reply([]);
    const kv = createPostgresKV(sql as never, 'session_cache');
    // An unescaped `%` would make a prefix match everything in the namespace.
    await kv.list({ prefix: '100%_' });
    expect(sql.calls[0]!.values).toContain('100\\%\\_%');
  });
});

describe('disk blob store', () => {
  it('refuses a key that escapes the storage root', async () => {
    const sql = mockSql();
    const store = createDiskBlobStore(sql as never, 'update_packages', '/var/lib/wpistic/blobs');
    // Package keys come from an authenticated admin upload — which is not the
    // same as being trusted with a filesystem path.
    await expect(store.put('../../etc/passwd', new Uint8Array([1]))).rejects.toThrow(
      /outside the storage root/
    );
  });

  it('refuses a key containing a null byte', async () => {
    const sql = mockSql();
    const store = createDiskBlobStore(sql as never, 'update_packages', '/var/lib/wpistic/blobs');
    await expect(store.put('good\0../bad', new Uint8Array([1]))).rejects.toThrow(/Invalid blob key/);
  });

  it('reports a miss when metadata exists but the bytes do not', async () => {
    const sql = mockSql();
    sql.reply([
      { key: 'p/1.zip', size_bytes: '10', sha256: 'abc', content_type: null, custom_meta: {}, updated_at: new Date().toISOString() },
    ]);
    const store = createDiskBlobStore(sql as never, 'update_packages', '/nonexistent-root-for-test');
    // A volume restored from a backup predating the upload should read as "not
    // found", not explode — the caller's 404 path is the honest answer.
    expect(await store.get('p/1.zip')).toBeNull();
  });
});

describe('outbox queue', () => {
  it('writes the event to the outbox instead of dispatching inline', async () => {
    const sql = mockSql();
    sql.reply([]);
    await createOutboxQueue(sql as never).send({
      type: 'license.activated',
      data: { license_id: 'l1', org_id: 'o1', domain: 'example.com' },
    });
    // Durability is the point: a committed row survives a crash between the
    // mutation and the handler, and inherits the outbox's retry semantics.
    expect(sql.calls[0]!.text).toContain('INSERT INTO event_outbox');
    expect(sql.calls[0]!.values).toContain('license.activated');
    expect(sql.calls[0]!.values).toContain('o1');
  });

  it('rejects an event with no type rather than writing a poison row', async () => {
    const sql = mockSql();
    // The consumer switches on `type`; a row without one could never drain.
    await expect(createOutboxQueue(sql as never).send({ data: {} })).rejects.toThrow(/without a type/);
  });
});

describe('execution context', () => {
  it('drains background work rather than dropping it on shutdown', async () => {
    const ctx = createExecutionContext();
    let landed = false;
    ctx.waitUntil(new Promise<void>((resolve) => setTimeout(() => { landed = true; resolve(); }, 25)));

    expect(ctx.pending()).toBe(1);
    await ctx.drain();
    // Without this, every redeploy silently loses the background writes queued
    // by the last few requests.
    expect(landed).toBe(true);
    expect(ctx.pending()).toBe(0);
  });

  it('reports a failed background task without taking the process down', async () => {
    const onError = vi.fn();
    const ctx = createExecutionContext(onError);
    ctx.waitUntil(Promise.reject(new Error('webhook unreachable')));
    await ctx.drain();
    expect(onError).toHaveBeenCalledOnce();
    expect(ctx.pending()).toBe(0);
  });

  it('gives up on a wedged task rather than blocking shutdown forever', async () => {
    const ctx = createExecutionContext();
    ctx.waitUntil(new Promise(() => undefined)); // never settles
    const startedAt = Date.now();
    await ctx.drain(60);
    // Losing one stuck task beats never exiting.
    expect(Date.now() - startedAt).toBeLessThan(1500);
  });
});
