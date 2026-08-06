/**
 * Blob storage presenting the subset of the R2 surface the platform uses —
 * `get`, `put`, and `head` on update packages.
 *
 * Two drivers, chosen by `BLOB_DRIVER`:
 *
 *  - **disk** (default): bytes under a mounted volume, metadata in Postgres.
 *    Nothing else to run or pay for on a single VPS. The volume has to be in
 *    your backup routine — losing it means customers cannot download updates
 *    until the packages are re-uploaded.
 *  - **s3**: any S3-compatible endpoint (MinIO, Backblaze B2, Cloudflare R2's
 *    S3 API). Packages survive a VPS rebuild and are not bounded by one disk.
 *
 * Metadata lives in Postgres for both drivers, so a `head` is an indexed row
 * read rather than a network round trip or a `stat()` on a path that may not be
 * local — and `updates/routes.ts` calls `head` on the hot path of every
 * download authorization.
 *
 * Keys are treated as opaque and are never joined into a filesystem path
 * without validation: they arrive from an admin upload, and `../` in a key
 * would otherwise write outside the volume.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Sql } from 'postgres';

export interface BlobObject {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  checksums: { sha256?: string };
  customMetadata: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface BlobStore {
  get(key: string): Promise<BlobObject | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<BlobObject>;
  head(key: string): Promise<BlobObject | null>;
  delete(key: string): Promise<void>;
}

async function toBytes(
  value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  const reader = value.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Reject anything that would escape the storage root. Package keys come from
 * an authenticated admin upload, but "authenticated" is not "trusted with a
 * filesystem path".
 */
function safeRelativePath(root: string, key: string): string {
  if (key.includes('\0')) throw new Error('Invalid blob key');
  const target = resolve(root, key);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Invalid blob key "${key}" — resolves outside the storage root`);
  }
  return target;
}

interface MetaRow {
  key: string;
  size_bytes: string;
  sha256: string | null;
  content_type: string | null;
  custom_meta: Record<string, string>;
  updated_at: string;
}

function describe(row: MetaRow, bytes: Uint8Array | null): BlobObject {
  const sha = row.sha256 ?? '';
  return {
    key: row.key,
    size: Number(row.size_bytes),
    etag: sha,
    httpEtag: `"${sha}"`,
    uploaded: new Date(row.updated_at),
    checksums: row.sha256 ? { sha256: row.sha256 } : {},
    customMetadata: row.custom_meta ?? {},
    body:
      bytes === null
        ? null
        : new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
    async arrayBuffer() {
      if (bytes === null) throw new Error('Blob body was not loaded');
      // Copy into a standalone buffer: the caller may hold it past our scope.
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
  };
}

async function readMeta(sql: Sql, bucket: string, key: string): Promise<MetaRow | null> {
  const rows = await sql<MetaRow[]>`
    SELECT key, size_bytes::text AS size_bytes, sha256, content_type, custom_meta, updated_at
    FROM blob_objects WHERE bucket = ${bucket} AND key = ${key} LIMIT 1`;
  return rows[0] ?? null;
}

async function writeMeta(
  sql: Sql,
  bucket: string,
  key: string,
  bytes: Uint8Array,
  sha256: string,
  contentType: string | null,
  customMeta: Record<string, string>
): Promise<MetaRow> {
  const rows = await sql<MetaRow[]>`
    INSERT INTO blob_objects (bucket, key, size_bytes, sha256, content_type, custom_meta, updated_at)
    VALUES (${bucket}, ${key}, ${bytes.length}, ${sha256}, ${contentType}, ${sql.json(customMeta as never)}, NOW())
    ON CONFLICT (bucket, key) DO UPDATE SET
      size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256,
      content_type = EXCLUDED.content_type, custom_meta = EXCLUDED.custom_meta, updated_at = NOW()
    RETURNING key, size_bytes::text AS size_bytes, sha256, content_type, custom_meta, updated_at`;
  return rows[0]!;
}

/** Bytes on a mounted volume, metadata in Postgres. */
export function createDiskBlobStore(sql: Sql, bucket: string, rootDir: string): BlobStore {
  const root = resolve(rootDir);

  return {
    async head(key) {
      const meta = await readMeta(sql, bucket, key);
      return meta ? describe(meta, null) : null;
    },

    async get(key) {
      const meta = await readMeta(sql, bucket, key);
      if (!meta) return null;
      try {
        const bytes = new Uint8Array(await readFile(safeRelativePath(root, key)));
        return describe(meta, bytes);
      } catch {
        // Metadata without bytes means the volume was restored from a backup
        // that predates the upload, or was never mounted. Report a miss rather
        // than a 500 — the caller's "not found" path is the honest answer.
        return null;
      }
    },

    async put(key, value, options) {
      const bytes = await toBytes(value);
      const path = safeRelativePath(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const meta = await writeMeta(
        sql,
        bucket,
        key,
        bytes,
        sha256,
        options?.httpMetadata?.contentType ?? null,
        options?.customMetadata ?? {}
      );
      return describe(meta, bytes);
    },

    async delete(key) {
      await rm(safeRelativePath(root, key), { force: true });
      await sql`DELETE FROM blob_objects WHERE bucket = ${bucket} AND key = ${key}`;
    },
  };
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style addressing — MinIO needs it; AWS and R2 accept it. */
  forcePathStyle?: boolean;
}

/**
 * S3-compatible driver using SigV4 over plain fetch.
 *
 * Deliberately not the AWS SDK: this needs four operations, and the SDK would
 * add tens of megabytes to an image whose whole point is being easy to deploy.
 */
export function createS3BlobStore(sql: Sql, bucketName: string, config: S3Config): BlobStore {
  const objectUrl = (key: string): string => {
    const base = config.endpoint.replace(/\/$/, '');
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return config.forcePathStyle === false
      ? `${base}/${encoded}`
      : `${base}/${config.bucket}/${encoded}`;
  };

  async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  }

  const hex = (buffer: ArrayBuffer): string =>
    [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function sha256Hex(data: Uint8Array | string): Promise<string> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return hex(await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer));
  }

  async function signedFetch(method: string, key: string, body?: Uint8Array): Promise<Response> {
    const url = new URL(objectUrl(key));
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(body ?? new Uint8Array());

    const canonicalHeaders =
      `host:${url.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    let signingKey: ArrayBuffer | Uint8Array = new TextEncoder().encode(
      `AWS4${config.secretAccessKey}`
    );
    for (const part of [dateStamp, config.region, 's3', 'aws4_request']) {
      signingKey = await hmac(signingKey, part);
    }
    const signature = hex(await hmac(signingKey, stringToSign));

    return fetch(url, {
      method,
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      body: body as BodyInit | undefined,
    });
  }

  return {
    async head(key) {
      const meta = await readMeta(sql, bucketName, key);
      return meta ? describe(meta, null) : null;
    },

    async get(key) {
      const meta = await readMeta(sql, bucketName, key);
      if (!meta) return null;
      const response = await signedFetch('GET', key);
      if (!response.ok) return null;
      return describe(meta, new Uint8Array(await response.arrayBuffer()));
    },

    async put(key, value, options) {
      const bytes = await toBytes(value);
      const response = await signedFetch('PUT', key, bytes);
      if (!response.ok) {
        throw new Error(`S3 upload failed (${response.status}): ${await response.text()}`);
      }
      const sha256 = await sha256Hex(bytes);
      const meta = await writeMeta(
        sql,
        bucketName,
        key,
        bytes,
        sha256,
        options?.httpMetadata?.contentType ?? null,
        options?.customMetadata ?? {}
      );
      return describe(meta, bytes);
    },

    async delete(key) {
      await signedFetch('DELETE', key);
      await sql`DELETE FROM blob_objects WHERE bucket = ${bucketName} AND key = ${key}`;
    },
  };
}

/** Verify the configured driver can actually store and retrieve bytes. */
export async function blobHealthCheck(store: BlobStore): Promise<void> {
  const key = `.health/${Date.now()}`;
  const payload = new TextEncoder().encode('ok');
  await store.put(key, payload);
  const read = await store.get(key);
  await store.delete(key);
  if (!read) throw new Error('Blob store wrote an object it could not read back');
}
