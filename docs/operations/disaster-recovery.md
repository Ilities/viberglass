# Disaster Recovery

## RTO/RPO

| Component | RTO | RPO |
|-----------|-----|-----|
| RDS Database | 30 min | 5 min (PITR) |
| ECS Services | 10 min | N/A (stateless) |
| S3 | 24 h | 24 h |
| Amplify Frontend | 15 min | N/A (git-based) |

RDS: daily snapshots (30-day retention), 5-minute PITR enabled.

## Database restore (PITR)

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier viberglass-prod-db \
  --target-db-instance-identifier viberglass-prod-db-restored \
  --restore-time "2024-01-15T10:30:00Z"

aws rds wait db-instance-available --db-instance-identifier viberglass-prod-db-restored

NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier viberglass-prod-db-restored \
  --query 'DBInstances[0].Endpoint.Address' --output text)

aws ssm put-parameter --name "/viberglass/prod/database/url" \
  --value "postgresql://user:pass@$NEW_ENDPOINT:5432/viberglass" \
  --overwrite --type SecureString

aws ecs update-service --cluster viberglass-prod-backend-cluster \
  --service viberglass-prod-backend --force-new-deployment
```

## Bad deployment rollback

```bash
PREVIOUS_TASK=$(aws ecs describe-services \
  --cluster viberglass-prod-backend-cluster \
  --services viberglass-prod-backend \
  --query 'services[0].deployments[1].taskDefinition' --output text)

aws ecs update-service \
  --cluster viberglass-prod-backend-cluster \
  --service viberglass-prod-backend \
  --task-definition $PREVIOUS_TASK
```

If a migration was part of the bad deployment, roll it back first — see [database-migrations.md](./database-migrations.md).

## Security breach containment

```bash
# Stop service
aws ecs update-service --cluster viberglass-prod-backend-cluster \
  --service viberglass-prod-backend --desired-count 0

# Rotate DB password
NEW_DB_PASSWORD=$(openssl rand -base64 32)
aws rds modify-db-instance --db-instance-identifier viberglass-prod-db \
  --master-user-password $NEW_DB_PASSWORD --apply-immediately
aws ssm put-parameter --name "/viberglass/prod/database/password" \
  --value "$NEW_DB_PASSWORD" --overwrite --type SecureString
```

Then investigate via CloudWatch logs and CloudTrail before resuming.

## Manual snapshot (before major operations)

```bash
aws rds create-db-snapshot \
  --db-instance-identifier viberglass-prod-db \
  --db-snapshot-identifier viberglass-prod-manual-$(date +%Y%m%d-%H%M%S)
```
