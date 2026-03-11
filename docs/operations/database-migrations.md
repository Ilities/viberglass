# Database Migrations

Uses [Kysely](https://kysely.dev/). Migration files: `apps/platform-backend/src/migrations/XXX_description.ts`

## Commands

```bash
# Development
npm run migrate -w @viberglass/platform-backend
npm run migrate:status -w @viberglass/platform-backend
npm run migrate:rollback -w @viberglass/platform-backend  # use with caution

# Staging/Production
./apps/platform-backend/scripts/run-migrations.sh staging
./apps/platform-backend/scripts/run-migrations.sh prod
./apps/platform-backend/scripts/run-migrations.sh prod --dry-run
```

## Before production migrations

- Test in dev and staging first
- Verify RDS backup exists (<24h old)
- Schedule during low-traffic window

## Safety rules

- Add columns as nullable, then add constraints in a follow-up migration
- Use `CREATE INDEX CONCURRENTLY` to avoid table locks
- Never modify a migration that has already run
- Multi-step approach for column renames: add new → migrate data → drop old

## Emergency rollback

```bash
# Stop traffic
aws ecs update-service --cluster viberglass-prod-backend-cluster \
  --service viberglass-prod-backend --desired-count 0

# Roll back migration
npm run migrate:rollback -w @viberglass/platform-backend

# Or restore from RDS snapshot — see disaster-recovery.md

# Restart
aws ecs update-service --cluster viberglass-prod-backend-cluster \
  --service viberglass-prod-backend --desired-count 2
```

## Troubleshooting

**Migration hangs** — Check locks: `SELECT * FROM pg_locks;` Consider `CONCURRENTLY` for index creation.

**Migration fails midway** — Check error, verify DB state, fix migration, re-run.
