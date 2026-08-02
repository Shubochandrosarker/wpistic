#!/usr/bin/env node
/**
 * WPistic control plane migration runner.
 *
 * Usage:
 *   DATABASE_URL=postgresql://wpistic:password@localhost:5432/wpistic node migrate.js up
 *   node migrate.js status   — show applied vs pending migrations
 *   node migrate.js seed     — apply seed files (idempotent, dev/staging use)
 *   node migrate.js schema   — regenerate schema.sql from the migration files
 *
 * Migrations are plain SQL files in ./migrations, applied in filename order,
 * each inside a transaction, tracked in the schema_migrations table.
 */
import postgres from 'postgres';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const SEEDS_DIR = join(ROOT, 'seeds');

const command = process.argv[2] ?? 'up';

async function listSqlFiles(dir) {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

async function regenerateSchema() {
  const files = await listSqlFiles(MIGRATIONS_DIR);
  let out =
    '-- WPistic control plane — canonical schema.\n' +
    '-- GENERATED from database/migrations by `npm run schema`. Do not edit directly;\n' +
    '-- add a new timestamped migration instead.\n\n';
  for (const file of files) {
    out += `-- ============================================================\n`;
    out += `-- ${file}\n`;
    out += `-- ============================================================\n\n`;
    out += await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    out += '\n';
  }
  await writeFile(join(ROOT, 'schema.sql'), out);
  console.log(`schema.sql regenerated from ${files.length} migrations`);
}

async function main() {
  if (command === 'schema') {
    await regenerateSchema();
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (e.g. postgresql://wpistic:password@localhost:5432/wpistic)');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

    const appliedRows = await sql`SELECT name FROM schema_migrations ORDER BY name`;
    const applied = new Set(appliedRows.map((r) => r.name));
    const files = await listSqlFiles(MIGRATIONS_DIR);

    if (command === 'status') {
      for (const file of files) {
        console.log(`${applied.has(file) ? '[applied]' : '[pending]'} ${file}`);
      }
      return;
    }

    if (command === 'up') {
      const pending = files.filter((f) => !applied.has(f));
      if (pending.length === 0) {
        console.log('Database is up to date.');
        return;
      }
      for (const file of pending) {
        const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
        process.stdout.write(`Applying ${file} ... `);
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
        });
        console.log('done');
      }
      console.log(`Applied ${pending.length} migration(s).`);
      return;
    }

    if (command === 'seed') {
      const seeds = await listSqlFiles(SEEDS_DIR);
      for (const file of seeds) {
        const body = await readFile(join(SEEDS_DIR, file), 'utf8');
        process.stdout.write(`Seeding ${file} ... `);
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
        });
        console.log('done');
      }
      console.log(`Applied ${seeds.length} seed file(s).`);
      return;
    }

    console.error(`Unknown command: ${command} (expected up | status | seed | schema)`);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
