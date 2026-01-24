# Infrastructure Renaming - Deployment Guide

**Phase:** 15 - Infrastructure Renaming
**Plan:** 15-04 - Deployment
**Date:** 2026-01-24

## Overview

This document covers the deployment of infrastructure resource renaming from "viberator" to "viberglass" branding across all AWS environments (dev, staging, production). The deployment uses Pulumi Infrastructure as Code.

**Key changes:**
- Pulumi stack renamed from "viberator" to "viberglass"
- All AWS resource names updated to "viberglass" prefix
- SSM parameter paths changed from `/viberator/` to `/viberglass/`
- CloudWatch log groups updated to "viberglass" naming
- ECS, Lambda, RDS, SQS, S3, and ALB resources renamed

**Deployment approach:**
- Sequential deployment: dev → staging → prod
- Zero-downtime for resources with Pulumi aliases (Lambda, ECS, IAM)
- Data recreation acceptable for dev (no critical data)
- Staging and production require careful validation

---

## Deployment Timeline

| Environment | Status | Date | Notes |
|------------|--------|------|-------|
| **Dev** | ✅ Deployed | 2026-01-24 | pulumi up successful |
| **Staging** | ⏳ Pending | TBD | Manual deployment required |
| **Production** | ⏳ Pending | TBD | Manual deployment required |

---

## Dev Environment Deployment

### Status: COMPLETE ✅

**Deployment Date:** 2026-01-24
**Deployed By:** User (manual pulumi up)
**Result:** SUCCESS

### Resources Changed

**Pulumi Configuration:**
- Stack name: `viberator` → `viberglass`
- Config keys: `viberator:*` → `viberglass:*`

**Network Resources:**
- VPC: `dev-viberator-vpc` → `dev-viberglass-vpc`
- Subnets: `dev-viberator-*` → `dev-viberglass-*`
- Security Groups: `dev-viberator-*` → `dev-viberglass-*`
- Route Tables: `dev-viberator-*` → `dev-viberglass-*`

**Compute Resources:**
- Lambda Function: `viberator-dev-worker` → `viberglass-dev-worker` (with alias, no downtime)
- ECS Task Definitions: `dev-viberator-*` → `dev-viberglass-*` (with alias)
- ECS Cluster: `dev-viberator-ecs-cluster` → `dev-viberglass-ecs-cluster`

**Storage Resources:**
- RDS Instance: `dev-viberator-db` → `dev-viberglass-db` (recreated)
- S3 Buckets: `dev-viberator-*` → `dev-viberglass-*` (recreated)
- CloudWatch Log Groups: `/aws/lambda/viberator-*` → `/aws/lambda/viberglass-*` (new groups)

**Integration Resources:**
- SQS Queues: `dev-viberator-*` → `dev-viberglass-*`
- SSM Parameters: `/viberator/dev/*` → `/viberglass/dev/*`
- Amplify App: `dev-viberator-frontend` → `dev-viberglass-frontend`
- Load Balancer: `dev-viberator-alb*` → `dev-viberglass-alb*`
- ECR Repository: `viberator-*` → `viberglass-*`

### Verification Commands

```bash
# Check stack outputs
cd infrastructure
pulumi stack select dev
pulumi stack output

# Verify Lambda function
aws lambda get-function --function-name viberglass-dev-worker --query 'Configuration.FunctionName'

# Verify ECS cluster
aws ecs describe-clusters --clusters dev-viberglass-ecs-cluster

# Verify RDS instance
aws rds describe-db-instances --db-instance-identifier dev-viberglass-db

# Verify SSM parameter paths
aws ssm get-parameters-by-path --path /viberglass/dev/ --recursive

# Test health endpoint (if backend deployed)
pulumi stack output -j | jq -r '.albDnsName.value'
curl http://$(pulumi stack output -j | jq -r '.albDnsName.value')/health
```

### Expected Results

- Stack outputs show "viberglass" resource names
- Lambda function named `viberglass-dev-worker` exists and is active
- ECS cluster named `dev-viberglass-ecs-cluster` is active
- RDS instance `dev-viberglass-db` is available
- SSM parameters exist under `/viberglass/dev/` path
- No "viberator" resources remain (except in CloudWatch old logs)

---

## Staging Environment Deployment

### Status: PENDING ⏳

### Pre-Deployment Checklist

- [ ] Dev deployment verified and tested
- [ ] Dev smoke tests passing
- [ ] Staging database backup created (if test data exists)
- [ ] Rollback procedure documented (see below)

### Deployment Steps

```bash
# 1. Navigate to infrastructure directory
cd infrastructure

# 2. Select staging stack
pulumi stack select staging

# 3. Preview changes (REVIEW CAREFULLY)
pulumi preview

# 4. If preview is acceptable, deploy
pulumi up -y

# 5. Verify deployment
pulumi stack output
aws ssm get-parameters-by-path --path /viberglass/staging/ --recursive

# 6. Run smoke tests
# (Add your smoke test commands here)
```

### Expected Changes

Same as dev environment, but with `staging-` prefix:
- `staging-viberator-*` → `staging-viberglass-*`
- SSM paths: `/viberator/staging/*` → `/viberglass/staging/*`

### Verification

```bash
# Check Lambda function
aws lambda get-function --function-name viberglass-staging-worker

# Check ECS cluster
aws ecs describe-clusters --clusters staging-viberglass-ecs-cluster

# Check RDS instance
aws rds describe-db-instances --db-instance-identifier staging-viberglass-db
```

---

## Production Environment Deployment

### Status: PENDING ⏳

### Pre-Deployment Checklist

**CRITICAL:** Complete ALL items before deploying to production

- [ ] All changes validated in dev and staging
- [ ] Staging smoke tests passing
- [ ] Production database snapshot created
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback plan documented and tested
- [ ] Monitoring and alerts configured
- [ ] Team available for immediate response

### Pre-Deployment Steps

```bash
# 1. Create production RDS snapshot (CRITICAL)
aws rds create-db-snapshot \
  --db-instance-identifier prod-viberator-db \
  --db-snapshot-id pre-rename-viberglass-$(date +%Y%m%d)

# 2. Verify snapshot created
aws rds describe-db-snapshots \
  --db-snapshot-identifier pre-rename-viberglass-$(date +%Y%m%d)
```

### Deployment Steps

```bash
# 1. Navigate to infrastructure directory
cd infrastructure

# 2. Select production stack
pulumi stack select prod

# 3. Preview changes (SAVE OUTPUT FOR REVIEW)
pulumi preview > /tmp/prod-preview.txt
cat /tmp/prod-preview.txt

# 4. Carefully review production preview
#    Confirm changes match expected patterns

# 5. If preview is acceptable, deploy
pulumi up -y

# 6. Verify deployment
pulumi stack output
aws ssm get-parameters-by-path --path /viberglass/prod/ --recursive

# 7. Run smoke tests against production endpoints
# (Add your smoke test commands here)
```

### Post-Deployment Verification

```bash
# Check Lambda function
aws lambda get-function --function-name viberglass-prod-worker

# Check ECS cluster
aws ecs describe-clusters --clusters prod-viberglass-ecs-cluster

# Check RDS instance
aws rds describe-db-instances --db-instance-identifier prod-viberglass-db

# Check SSM parameters
aws ssm get-parameters-by-path --path /viberglass/prod/ --recursive --max-items 20

# Test application health endpoints
# (Add your health check commands here)
```

---

## Rollback Procedures

### Dev Environment Rollback

**Risk Level:** Low (dev can be destroyed/recreated)

```bash
cd infrastructure
pulumi stack select dev

# Option 1: Revert code changes and redeploy
git checkout <previous-commit>
pulumi up -y

# Option 2: Destroy and recreate
pulumi destroy -y
pulumi up -y
```

### Staging Environment Rollback

**Risk Level:** Medium (may have test data)

```bash
cd infrastructure
pulumi stack select staging

# Option 1: Revert code changes
git checkout <previous-commit>
pulumi up -y

# Option 2: Keep old stack as backup
pulumi stack init viberglass-staging-old
# (Advanced: use pulumi state move to preserve resources)
```

### Production Environment Rollback

**Risk Level:** High (real user data)

**IMPORTANT:** Test rollback procedure in staging first!

#### Option 1: Code Revert (Fastest)

```bash
cd infrastructure
pulumi stack select prod

# Revert to previous infrastructure code
git checkout <commit-before-rename>

# Redeploy (PulumI will recreate old resources)
pulumi up -y
```

**Note:** This works if you used aliases for resources. Lambda functions, ECS tasks, and IAM roles will update without recreation.

#### Option 2: RDS Snapshot Restore (If Database Issues)

```bash
# List available snapshots
aws rds describe-db-snapshots --db-instance-identifier prod-viberator-db

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier prod-viberglass-db \
  --db-snapshot-identifier pre-rename-viberglass-YYYYMMDD

# Wait for restore to complete
aws rds wait db-instance-available --db-instance-identifier prod-viberator-db
```

#### Option 3: Blue-Green Rollback (Advanced)

If you kept old resources running:

```bash
# Switch DNS/routing back to old resources
# (Depends on your routing setup - ALB, Route53, etc.)
```

---

## Known Issues and Workarounds

### Issue 1: SSM Parameter Path References

**Problem:** Application code may reference old `/viberator/` SSM paths.

**Workaround:**
1. Search codebase for hardcoded `/viberator/` references
2. Update to use environment variables or configuration
3. Verify application code reads from correct paths

**Search command:**
```bash
grep -r "/viberator/" --exclude-dir=infrastructure --exclude-dir=node_modules .
```

### Issue 2: CloudWatch Log Groups Split

**Problem:** Old logs remain in `/viberator/` log groups, new logs in `/viberglass/` groups.

**Workaround:** This is expected behavior. Old logs will expire based on retention policy. Update CloudWatch dashboards and alarms to reference new log groups.

**Query across both log groups:**
```sql
fields @timestamp, @message
| filter @logGroup like /viberator/ or @logGroup like /viberglass/
| sort @timestamp desc
```

### Issue 3: RDS Data Loss (Dev/Staging)

**Problem:** RDS instance identifier change causes database recreation.

**Workaround:** Acceptable for dev/staging (no critical data). For production, export data before deployment and import after.

### Issue 4: Amplify Domain Change

**Problem:** Amplify app name change may cause default domain change.

**Workaround:** Use custom domains (not default Amplify domains). If using default domains, update DNS and set up redirects.

---

## Resource Migration Summary

### Resources with Aliases (Zero-Downtime)

These resources use Pulumi aliases and update without recreation:

| Resource Type | Old Name | New Name | Downtime |
|--------------|----------|----------|----------|
| Lambda Function | `viberator-{env}-worker` | `viberglass-{env}-worker` | None |
| ECS Task Definitions | `{env}-viberator-*` | `{env}-viberglass-*` | None |
| IAM Roles | `{env}-viberator-*` | `{env}-viberglass-*` | None |

### Resources Recreated (Data Loss Risk)

These resources are deleted and recreated:

| Resource Type | Old Name | New Name | Data Loss |
|--------------|----------|----------|-----------|
| RDS Instances | `{env}-viberator-db` | `{env}-viberglass-db` | Yes (export first) |
| S3 Buckets | `{env}-viberator-*` | `{env}-viberglass-*` | Yes (backup first) |
| CloudWatch Log Groups | `/aws/lambda/viberator-*` | `/aws/lambda/viberglass-*` | No (old logs persist) |

### New Resources Created

| Resource Type | New Name | Purpose |
|--------------|----------|---------|
| SSM Parameters | `/viberglass/{env}/*` | New parameter paths |
| Amplify Apps | `{env}-viberglass-frontend` | New Amplify apps |

---

## Verification Steps Completed

### Dev Environment ✅

- [x] pulumi up completed successfully
- [x] Stack outputs show "viberglass" resource names
- [x] Lambda function `viberglass-dev-worker` exists
- [x] ECS cluster `dev-viberglass-ecs-cluster` exists
- [x] RDS instance `dev-viberglass-db` is available
- [x] SSM parameters exist under `/viberglass/dev/` path

### Staging Environment ⏳

- [ ] pulumi preview reviewed
- [ ] pulumi up completed
- [ ] Stack outputs verified
- [ ] Resources verified in AWS console
- [ ] Smoke tests passing

### Production Environment ⏳

- [ ] Pre-deployment checklist completed
- [ ] RDS snapshot created
- [ ] pulumi preview reviewed
- [ ] pulumi up completed
- [ ] Stack outputs verified
- [ ] Resources verified in AWS console
- [ ] Smoke tests passing
- [ ] Monitoring shows no errors

---

## Support and Escalation

### Deployment Team

- **Infrastructure Lead:** [Add name/contact]
- **On-Call Engineer:** [Add name/contact]

### Emergency Contacts

- **AWS Support:** [Add support link/phone]
- **Pulumi Support:** https://www.pulumi.com/support/

### Useful Commands

```bash
# Check Pulumi stack history
pulumi history

# View stack outputs
pulumi stack output

# Check resource state
pulumi stack export

# View CloudWatch logs
aws logs tail /aws/lambda/viberglass-dev-worker --follow

# Check ECS task status
aws ecs list-tasks --cluster dev-viberglass-ecs-cluster

# Check Lambda function status
aws lambda get-function-configuration --function-name viberglass-dev-worker
```

---

## Next Steps

1. **Complete staging deployment** (manual pulumi up required)
2. **Complete production deployment** (manual pulumi up required)
3. **Update application code** to reference new SSM parameter paths if needed
4. **Update CI/CD pipelines** to use new resource names
5. **Update monitoring and alerting** to reference new resource names
6. **Clean up old resources** after verification period (optional)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-24
**Next Review:** After production deployment
