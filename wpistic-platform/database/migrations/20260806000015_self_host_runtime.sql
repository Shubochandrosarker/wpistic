-- Self-hosted runtime support, plus an atomic rate limiter.
--
-- The platform was written against Cloudflare bindings: KV for caches and
-- one-shot tokens, R2 for update packages, Queues for domain events. None of
-- those exist on a plain VPS. Rather than fork the application code, the Node
-- runtime supplies objects satisfying the same interfaces, backed by the two
-- things a VPS always has: this database and a disk. These tables are the
-- database half.

-- ---------------------------------------------------------------------------
-- 1. Key/value store — the KV replacement.
--
-- Deliberately not Redis. A single-VPS deployment should not need a second
-- stateful service to keep running and backing up, and every value stored here
-- is small, short-lived, and already adjacent to data in this database.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kv_store (
    namespace   VARCHAR(40) NOT NULL,
    key         TEXT        NOT NULL,
    value       TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace, key)
);

-- Expiry is enforced on read (a lazy sweep cannot be trusted for correctness),
-- so this index exists only to make the janitor's bulk delete cheap.
CREATE INDEX IF NOT EXISTS idx_kv_store_expiry ON kv_store (expires_at)
    WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting — fixed-window counters.
--
-- This replaces an in-isolate Map that could not work in production: Workers
-- run many isolates across many colos, so a per-isolate counter meant the real
-- limit was 100 x isolate-count, and the map never evicted. The KV version
-- before it was worse — a non-atomic get -> +1 -> put loses nearly every
-- increment under exactly the concurrent burst a limiter exists to stop.
--
-- A single INSERT ... ON CONFLICT DO UPDATE is atomic under concurrency
-- because Postgres takes a row lock for the duration, so N concurrent requests
-- produce N distinct counts rather than all reading the same stale value.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    bucket      TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count       INTEGER     NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expiry ON rate_limit_counters (expires_at);

/**
 * Increment a window's counter and return the new value, atomically.
 *
 * Returns the count *after* this request, so a caller compares against its
 * limit with `>`. The window start is truncated by the caller so every request
 * inside the same window collides on the same row on purpose — that collision
 * is what makes the count correct.
 */
CREATE OR REPLACE FUNCTION rate_limit_bump(
    p_bucket TEXT,
    p_window_start TIMESTAMPTZ,
    p_ttl_seconds INTEGER
) RETURNS INTEGER AS $$
    INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at)
    VALUES (p_bucket, p_window_start, 1, NOW() + make_interval(secs => p_ttl_seconds))
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- 3. Blob metadata — the R2 replacement's index.
--
-- Bytes live on disk (or in S3); this row is the catalogue entry. Keeping the
-- metadata in Postgres means a HEAD request is a cheap indexed lookup rather
-- than a stat() on a path that may not be local, and it gives the janitor a way
-- to find orphans.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blob_objects (
    bucket        VARCHAR(40) NOT NULL,
    key           TEXT        NOT NULL,
    size_bytes    BIGINT      NOT NULL,
    sha256        VARCHAR(64),
    content_type  VARCHAR(255),
    custom_meta   JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket, key)
);

-- ---------------------------------------------------------------------------
-- 4. License expiry reconciliation.
--
-- `license.expired` had a queue handler and customer-facing notification copy
-- but no emitter anywhere, and nothing ever moved a lapsed license out of
-- 'active'. Enforcement was unaffected — that is computed on read — but the
-- stored status was permanently wrong, so admin counts treated expired
-- licenses as active and the status filter could never match one.
--
-- This column records the last time the reconciler emitted for a license, so a
-- restart or an overlapping run cannot notify the same customer twice.
-- ---------------------------------------------------------------------------
ALTER TABLE licenses
    ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_licenses_expiry_sweep
    ON licenses (expires_at)
    WHERE status = 'active' AND expires_at IS NOT NULL;
