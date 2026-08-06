# Database production gate

Production is blocked until every item below has evidence attached to the release.

## Required topology

- PostgreSQL 16+.
- Separate staging and production databases or isolated branches.
- Hyperdrive points to restricted runtime role wpistic_app, never the schema owner or superuser.
- Migrations use a separate migration role.
- Backups are encrypted, retained, and restored into a scratch database at least once.

## Tenant isolation gate

1. Create the runtime role with no superuser and no BYPASSRLS.
2. Grant only required schema, table, and sequence privileges.
3. Apply FORCE ROW LEVEL SECURITY to every tenant table.
4. Ensure every request transaction sets app.current_org_id before tenant queries.
5. Run cross-organization read, insert, update, delete, license, website, download, audit, and admin tests.
6. Confirm missing or invalid tenant context returns no tenant rows and cannot mutate another organization.

Existing repository audits record that prior runtime wiring connected as an owner and did not consistently activate withOrg. This must be re-tested on a production-like database; documentation is not evidence.

## Commands

    DATABASE_URL="$MIGRATION_DATABASE_URL" npm run db:migrate
    DATABASE_URL="$MIGRATION_DATABASE_URL" npm run db:seed
    pg_dump "$PRODUCTION_DATABASE_URL" | gzip > backup.sql.gz
    gunzip -c backup.sql.gz | psql "$SCRATCH_DATABASE_URL"

Record migration version, schema diff, role grants, RLS table list, backup checksum, restore timestamp, and tenant-test results. Never run migrations through the runtime role.
