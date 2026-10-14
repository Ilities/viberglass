# Database Migrations

Uses [Kysely](https://kysely.dev/)'s `Migrator`. Migration files: `apps/platform-backend/src/migrations/NNN_description.ts`, each exporting `up` and `down`. Kysely records applied migrations in the `kysely_migration` table and runs them in name order.

## When migrations run

- Docker Compose (dev and `docker-compose.prod.yml`) and the AWS backend ECS task set `RUN_MIGRATIONS_ON_STARTUP=true`, so the backend migrates to the latest version before it starts serving. The dev backend runs a new migration file as soon as it's saved, through hot reload.
- The Helm chart sets `RUN_MIGRATIONS_ON_STARTUP=false` and runs a migration Job (`viberglass-migrate-<revision>`) on each Helm revision instead. Backend Pods wait until every migration shipped in their image is applied. See [Kubernetes deployment](../kubernetes-deployment.md).

## Commands

```bash
# Run pending migrations against the database in DB_* or DATABASE_URL
npm run migrate:latest -w @viberglass/platform-backend
npm run platform-backend:migrate   # same, from the repository root

# Against an AWS environment, with DATABASE_URL from SSM (/viberglass/<env>/database/url)
DATABASE_URL="$(aws ssm get-parameter --name /viberglass/prod/database/url --with-decryption --query Parameter.Value --output text)" \
  npm run migrate:latest -w @viberglass/platform-backend
```

Set `DB_SSL=true` when the database requires TLS. There are no status or rollback commands; check `kysely_migration` for what has run.

## Before production migrations

- Test in dev first
- Verify a database backup exists (<24h old)
- Schedule during low-traffic window

## Safety rules

- Add columns as nullable, then add constraints in a follow-up migration
- Keep locks short on large tables. The migrator runs migrations inside a transaction, so `CREATE INDEX CONCURRENTLY` fails there
- Never modify a migration that has already run
- Multi-step approach for column renames: add new → migrate data → drop old
- Old backend Pods can keep running during a Kubernetes upgrade, so a migration must not break the previous release

## Emergency rollback

Redeploying an older backend doesn't reverse migrations. Restore the database from a backup or snapshot taken before the migration, then deploy the matching backend version. On AWS:

```bash
# Stop traffic
aws ecs update-service --cluster <cluster> --service <env>-viberglass-backend --desired-count 0

# Restore the RDS snapshot, point the stack at it, deploy the matching backend

# Restart
aws ecs update-service --cluster <cluster> --service <env>-viberglass-backend --desired-count 1
```

The cluster name is in `/viberglass/<env>/ecs/cluster`. For Kubernetes, see [Backups and restore](../kubernetes-deployment.md#backups-and-restore).

## Troubleshooting

**Migration hangs** — Check locks: `SELECT * FROM pg_locks;`

**Migration fails midway** — All pending migrations run in one transaction, so a failure rolls back the whole batch. Check the error, fix the migration, re-run.

**Migration out of order** — The migrator refuses to run when a pending migration sorts before one already applied. Rename the new file so it sorts after the latest applied migration.
