# Database Migration Procedures

This document describes how to safely manage database migrations in production and staging environments.

## Overview

Viberglass uses [Kysely](https://kysely.dev/) for database migrations. Migrations are versioned TypeScript files that modify the database schema.

## Migration Files

Location: `apps/platform-backend/src/migrations/`

Naming convention: `XXX_description.ts` where XXX is a sequential number.

Example:
```
001_initial_schema.ts
002_add_users_table.ts
003_add_integrations.ts
```

## Running Migrations

### Development Environment

```bash
# Run all pending migrations
npm run migrate -w @viberglass/platform-backend

# Check migration status
npm run migrate:status -w @viberglass/platform-backend

# Rollback last migration (use with caution!)
npm run migrate:rollback -w @viberglass/platform-backend
```

### Staging/Production Environments

Use the migration runner script for added safety:

```bash
# Staging
./apps/platform-backend/scripts/run-migrations.sh staging

# Production (requires confirmation)
./apps/platform-backend/scripts/run-migrations.sh prod

# Dry run (see what would happen)
./apps/platform-backend/scripts/run-migrations.sh prod --dry-run
```

The script will:
1. Fetch database credentials from AWS SSM Parameter Store
2. Check for recent RDS backups (production only)
3. Verify pending migrations
4. Run migrations
5. Verify success

## Pre-Migration Checklist

Before running migrations in production:

- [ ] Test migrations in development environment
- [ ] Test migrations in staging environment
- [ ] Review migration code for data loss risks
- [ ] Verify RDS backup exists and is recent (<24 hours)
- [ ] Plan rollback strategy
- [ ] Schedule during low-traffic window (if schema changes are breaking)
- [ ] Notify team of upcoming migration
- [ ] Have database credentials ready
- [ ] Monitor CloudWatch during migration

## Migration Safety Guidelines

### Do's

✅ **Test thoroughly in dev/staging first**
✅ **Make migrations backwards compatible when possible**
✅ **Use transactions for data migrations**
✅ **Add indexes CONCURRENTLY in separate migrations**
✅ **Verify backups before production migration**
✅ **Document breaking changes clearly**

### Don'ts

❌ **Don't run untested migrations in production**
❌ **Don't drop columns without a deprecation period**
❌ **Don't modify existing migrations after they've run**
❌ **Don't forget to handle existing data**
❌ **Don't run long-running migrations during peak hours**

## Common Migration Patterns

### Adding a Column

```typescript
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("phone", "varchar(20)", (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("phone")
    .execute();
}
```

### Adding an Index

```typescript
export async function up(db: Kysely<any>): Promise<void> {
  // Add index concurrently to avoid locking table
  await sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
    ON users(email)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_users_email")
    .execute();
}
```

### Data Migration

```typescript
export async function up(db: Kysely<any>): Promise<void> {
  // Use transaction for data migrations
  await db.transaction().execute(async (trx) => {
    // Add new column
    await trx.schema
      .alterTable("tickets")
      .addColumn("priority", "varchar(20)")
      .execute();

    // Migrate existing data
    await trx
      .updateTable("tickets")
      .set({ priority: "medium" })
      .where("priority", "is", null)
      .execute();

    // Make column not null
    await trx.schema
      .alterTable("tickets")
      .alterColumn("priority", (col) => col.setNotNull())
      .execute();
  });
}
```

### Renaming a Column (Safe)

Don't rename columns directly - use a multi-step approach:

1. **Migration 1**: Add new column, copy data
```typescript
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("display_name", "text")
    .execute();

  await db
    .updateTable("projects")
    .set({ display_name: sql`name` })
    .execute();
}
```

2. **Deploy code that reads/writes both columns**

3. **Migration 2**: Drop old column (after confirming new column works)
```typescript
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .dropColumn("name")
    .execute();
}
```

## Troubleshooting

### Migration Fails Midway

1. Check error message in logs
2. Verify database state (some changes may have applied)
3. Fix the migration code
4. If needed, manually rollback partial changes
5. Re-run migration

### Migration Hangs

Possible causes:
- Lock contention (another process holding lock)
- Long-running operation (adding index on large table)
- Network timeout

Solutions:
- Check active connections: `SELECT * FROM pg_stat_activity;`
- Check locks: `SELECT * FROM pg_locks;`
- Consider CONCURRENTLY for index creation
- Increase statement timeout

### Migration Causes Downtime

Prevention:
- Add columns as nullable first
- Use CONCURRENTLY for index creation
- Avoid ALTER TABLE on large tables during peak hours
- Use multi-step migrations for breaking changes

### Rollback Needed

See [Disaster Recovery Documentation](./disaster-recovery.md) for rollback procedures.

## Monitoring

After running migrations:

```bash
# Check application health
curl https://api.yourdomain.com/health

# Check CloudWatch logs
aws logs tail /ecs/viberglass-prod-backend --follow

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Verify migration status
npm run migrate:status -w @viberglass/platform-backend
```

## Emergency Rollback

If a migration causes critical issues:

1. **Stop application traffic** (if necessary)
   ```bash
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --desired-count 0
   ```

2. **Restore from RDS snapshot** (see disaster-recovery.md)

3. **Or manually rollback migration**
   ```bash
   npm run migrate:rollback -w @viberglass/platform-backend
   ```

4. **Verify rollback success**

5. **Restart application**

## Migration Review Process

For production migrations:

1. Create migration in development
2. Test locally with sample data
3. Deploy to staging and test
4. Create PR with migration
5. Team reviews migration code
6. Merge to main
7. Run migration in staging (automated or manual)
8. Verify staging works correctly
9. Schedule production migration
10. Run migration in production during maintenance window
11. Monitor for issues
12. Mark as complete

## Reference

- Kysely documentation: https://kysely.dev/
- PostgreSQL migration best practices: https://www.postgresql.org/docs/current/ddl-alter.html
- Internal rollback procedures: [disaster-recovery.md](./disaster-recovery.md)
