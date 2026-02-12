# Disaster Recovery Procedures

This document outlines procedures for recovering from catastrophic failures in production.

## Overview

Viberglass production infrastructure includes:
- **RDS PostgreSQL Database** (primary data store)
- **ECS Fargate Services** (backend API)
- **AWS Amplify** (frontend hosting)
- **S3 Buckets** (file storage)

## Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

| Component | RTO | RPO | Backup Frequency |
|-----------|-----|-----|------------------|
| RDS Database | 30 minutes | 5 minutes | Continuous + Daily snapshots |
| ECS Services | 10 minutes | N/A | Stateless (redeploy) |
| S3 Files | 24 hours | 24 hours | Versioning enabled |
| Amplify Frontend | 15 minutes | N/A | Git-based (redeploy) |

## Automated Backups

### RDS Database Backups

**Automated Snapshots:**
- Frequency: Daily during maintenance window (3-4 AM UTC)
- Retention: 30 days (production), 7 days (staging)
- Type: Full database snapshot
- Location: Same region as RDS instance

**Point-in-Time Recovery:**
- Enabled: Yes
- Granularity: 5 minutes
- Retention: 30 days
- Use case: Recover from data corruption or accidental deletion

### S3 Versioning

- Enabled on all production buckets
- Retention: 90 days for deleted objects
- Use case: Recover accidentally deleted or overwritten files

## Disaster Scenarios

### Scenario 1: Database Corruption

**Symptoms:**
- Application errors related to database queries
- Data inconsistency
- Failed migrations

**Recovery Steps:**

1. **Assess the damage**
   ```bash
   # Connect to database
   psql $DATABASE_URL

   # Check table counts
   SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

   # Look for corruption
   SELECT * FROM pg_stat_database WHERE datname = 'viberglass';
   ```

2. **If corruption is recent (< 30 days), use Point-in-Time Recovery**
   ```bash
   # Identify recovery time (before corruption occurred)
   RESTORE_TIME="2024-01-15T10:30:00Z"

   # Create new RDS instance from PITR
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier viberglass-prod-db \
     --target-db-instance-identifier viberglass-prod-db-restored \
     --restore-time $RESTORE_TIME \
     --db-subnet-group-name viberglass-prod-db-subnet \
     --publicly-accessible false

   # Wait for restore to complete (15-30 minutes)
   aws rds wait db-instance-available \
     --db-instance-identifier viberglass-prod-db-restored
   ```

3. **Update application to use restored database**
   ```bash
   # Get new database endpoint
   NEW_ENDPOINT=$(aws rds describe-db-instances \
     --db-instance-identifier viberglass-prod-db-restored \
     --query 'DBInstances[0].Endpoint.Address' \
     --output text)

   # Update SSM parameter
   aws ssm put-parameter \
     --name "/viberglass/prod/database/url" \
     --value "postgresql://user:pass@$NEW_ENDPOINT:5432/viberglass" \
     --overwrite \
     --type SecureString

   # Restart ECS service to pick up new connection string
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --force-new-deployment
   ```

4. **Verify recovery**
   ```bash
   # Check application health
   curl https://api.yourdomain.com/health

   # Verify data
   psql $NEW_DATABASE_URL -c "SELECT count(*) FROM projects;"
   ```

5. **Retire old database** (after confirming new one works)
   ```bash
   # Create final snapshot of old database
   aws rds create-db-snapshot \
     --db-instance-identifier viberglass-prod-db \
     --db-snapshot-identifier viberglass-prod-db-final-snapshot

   # Delete old instance (after snapshot completes)
   aws rds delete-db-instance \
     --db-instance-identifier viberglass-prod-db \
     --skip-final-snapshot
   ```

### Scenario 2: Accidental Data Deletion

**Symptoms:**
- Users report missing projects/tickets
- Data was deleted within last 30 days

**Recovery Steps:**

1. **Stop writes to prevent further data loss**
   ```bash
   # Scale down ECS service
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --desired-count 0
   ```

2. **Identify when data was deleted**
   - Check application logs
   - Check CloudWatch logs for delete operations
   - Ask users when they last saw the data

3. **Restore from Point-in-Time or Snapshot**

   **Option A: Full restore (if extensive deletion)**
   - Follow Scenario 1 steps above

   **Option B: Partial restore (if limited deletion)**
   ```bash
   # Create temporary database from backup
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier viberglass-prod-db \
     --target-db-instance-identifier viberglass-temp-restore \
     --restore-time "2024-01-15T09:00:00Z"

   # Wait for restore
   aws rds wait db-instance-available \
     --db-instance-identifier viberglass-temp-restore

   # Export deleted data
   pg_dump -t projects -t tickets \
     postgresql://user:pass@temp-endpoint:5432/viberglass \
     > deleted_data.sql

   # Import into production (carefully!)
   psql $PROD_DATABASE_URL < deleted_data.sql

   # Delete temporary database
   aws rds delete-db-instance \
     --db-instance-identifier viberglass-temp-restore \
     --skip-final-snapshot
   ```

4. **Verify recovered data**

5. **Resume operations**
   ```bash
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --desired-count 2
   ```

### Scenario 3: Region Outage

**Symptoms:**
- All AWS services in region unavailable
- Cannot access RDS, ECS, or S3

**Recovery Steps:**

Viberglass currently operates in a single region. Full recovery requires:

1. **Deploy infrastructure in new region**
   ```bash
   cd infra/platform
   pulumi stack init prod-us-west-2
   pulumi config set aws:region us-west-2
   pulumi up
   ```

2. **Restore database from snapshot**
   - Copy latest snapshot to new region
   - Restore in new region
   - Update DNS to point to new region

3. **Update DNS records**

**Note:** Multi-region disaster recovery is planned for Month 3. Current RTO for region outage: 4-6 hours.

### Scenario 4: Bad Deployment

**Symptoms:**
- Application errors after deployment
- Increased error rate in CloudWatch
- Failed health checks

**Recovery Steps:**

1. **Immediate rollback via ECS**
   ```bash
   # Get previous task definition
   PREVIOUS_TASK=$(aws ecs describe-services \
     --cluster viberglass-prod-backend-cluster \
     --services viberglass-prod-backend \
     --query 'services[0].deployments[1].taskDefinition' \
     --output text)

   # Rollback to previous task definition
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --task-definition $PREVIOUS_TASK

   # Wait for rollback to complete
   aws ecs wait services-stable \
     --cluster viberglass-prod-backend-cluster \
     --services viberglass-prod-backend
   ```

2. **Or rollback via container image tag**
   ```bash
   # Get previous image tag from ECR
   PREVIOUS_IMAGE=$(aws ecr describe-images \
     --repository-name prod-viberglass-repo \
     --query 'sort_by(imageDetails,& imagePushedAt)[-2].imageTags[0]' \
     --output text)

   # Update task definition to use previous image
   # (Similar to deploy process but with old image tag)
   ```

3. **Verify rollback**
   ```bash
   curl https://api.yourdomain.com/health
   ```

4. **If database migration was part of bad deployment**
   - Assess if migration can be rolled back safely
   - Use migration rollback if possible:
     ```bash
     npm run migrate:rollback -w @viberglass/platform-backend
     ```
   - Otherwise, restore database from pre-deployment snapshot

### Scenario 5: Security Breach

**Symptoms:**
- Unauthorized access detected
- Suspicious database activity
- Compromised credentials

**Recovery Steps:**

1. **Immediate containment**
   ```bash
   # Stop all services
   aws ecs update-service \
     --cluster viberglass-prod-backend-cluster \
     --service viberglass-prod-backend \
     --desired-count 0

   # Update security groups to block external access
   aws ec2 revoke-security-group-ingress \
     --group-id sg-xxxxx \
     --protocol tcp \
     --port 443 \
     --cidr 0.0.0.0/0
   ```

2. **Rotate all credentials**
   ```bash
   # Generate new database password
   NEW_DB_PASSWORD=$(openssl rand -base64 32)

   # Update RDS password
   aws rds modify-db-instance \
     --db-instance-identifier viberglass-prod-db \
     --master-user-password $NEW_DB_PASSWORD \
     --apply-immediately

   # Update SSM parameters with new password
   aws ssm put-parameter \
     --name "/viberglass/prod/database/password" \
     --value "$NEW_DB_PASSWORD" \
     --overwrite \
     --type SecureString

   # Rotate API keys, session secrets, etc.
   ./scripts/provision-secrets.sh prod
   ```

3. **Investigate breach**
   - Review CloudWatch logs for suspicious activity
   - Check CloudTrail for unauthorized API calls
   - Identify compromised credentials or vulnerabilities

4. **Restore from clean backup if data was compromised**

5. **Implement additional security measures**

6. **Resume operations after securing**

## Testing Recovery Procedures

**Quarterly Disaster Recovery Drills:**

1. **Database Restore Test**
   - Restore staging database from production snapshot
   - Verify data integrity
   - Measure restore time

2. **Application Rollback Test**
   - Deploy intentionally broken version to staging
   - Practice rollback procedure
   - Verify rollback time

3. **File Recovery Test**
   - Delete test file from S3
   - Recover from S3 versioning
   - Verify file integrity

## Manual Backup Procedures

For critical operations (e.g., major migrations), create manual snapshot:

```bash
# Create manual RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier viberglass-prod-db \
  --db-snapshot-identifier viberglass-prod-manual-$(date +%Y%m%d-%H%M%S)

# Wait for snapshot to complete
aws rds wait db-snapshot-available \
  --db-snapshot-identifier viberglass-prod-manual-20240115-100000

# Verify snapshot
aws rds describe-db-snapshots \
  --db-snapshot-identifier viberglass-prod-manual-20240115-100000
```

## Contact Information

**During Disaster Recovery:**
- Incident Commander: [Name]
- Database Admin: [Name]
- Infrastructure Lead: [Name]
- Security Lead: [Name]

**Escalation:**
- AWS Support: Enterprise tier (response time: 15 minutes)
- Phone: [AWS Support Number]

## Post-Incident Review

After any disaster recovery:

1. Document timeline of events
2. Identify root cause
3. Calculate actual RTO/RPO
4. Identify improvements to procedures
5. Update runbooks
6. Conduct team retrospective
7. Implement preventive measures

## Backup Monitoring

Regular checks (automated via CloudWatch):
- Verify RDS automated backups are running
- Check S3 versioning is enabled
- Verify backup retention policies
- Test backup restore process quarterly

## Related Documentation

- [Database Migrations](./database-migrations.md)
- [Deployment Checklist](./deployment-checklist.md)
- [Incident Response](./incident-response.md)
