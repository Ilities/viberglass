---
phase: 15-infrastructure-renaming
plan: 03
type: execute
status: complete

title: "ECS, Lambda, RDS, and Storage Resource Naming to Viberglass"

one-liner: "Updated compute and storage infrastructure resources from 'viberator' to 'viberglass' naming with backwards-compatible aliases"

duration: "5 minutes"
completed: "2025-01-24"

tech-stack:
  added: []
  patterns: []

dependency-graph:
  requires:
    - "Phase 15 Plan 01 - Root documentation branding established naming pattern"
    - "Phase 15 Plan 02 - Network and infrastructure index updated"
  provides:
    - "All compute/storage resources use 'viberglass' naming convention"
    - "SSM paths use '/viberglass/' prefix for platform resources"
  affects:
    - "Phase 15 Plan 04 - SSM parameter migration will be needed"
    - "Production deployment will require data export/import for RDS"

key-files:
  created: []
  modified:
    - file: "infrastructure/components/backend-ecs.ts"
      changes: "Updated all resource names from 'viberator' to 'viberglass', added alias"
    - file: "infrastructure/components/worker-ecs.ts"
      changes: "Updated resource names and SSM paths to 'viberglass', kept worker container name as 'viberator'"
    - file: "infrastructure/components/worker-lambda.ts"
      changes: "Updated resource names and SSM paths to 'viberglass', added alias"
    - file: "infrastructure/components/database.ts"
      changes: "Updated all resource names, SSM paths, and default credentials to 'viberglass', added aliases"
    - file: "infrastructure/components/queue.ts"
      changes: "Updated queue and DLQ names to 'viberglass', added aliases"
    - file: "infrastructure/components/storage.ts"
      changes: "Updated bucket names and prefixes to 'viberglass', added alias"
    - file: "infrastructure/components/load-balancer.ts"
      changes: "Updated ALB, TG, SG names to 'viberglass', added aliases"

decisions:

next-phase-readiness:
  - "SSM parameters at old paths (/viberator/tenants/*, /viberator/{env}/database) will need migration"
  - "RDS instance recreation requires data export/import for production databases"
  - "ECS task definitions with aliases should allow zero-downtime deployment"
  - "SQS queues with aliases should preserve existing messages"

deviations:
  auto-fixed: []
  architectural: []
---

# Phase 15 Plan 03: Compute and Storage Resource Naming Summary

## Overview

Updated all ECS, Lambda, RDS, SQS, S3, and Load Balancer resources from "viberator" to "viberglass" naming convention with backwards-compatible aliases to enable zero-downtime migration.

## Changes Made

### 1. Backend ECS (infrastructure/components/backend-ecs.ts)
- **Resource names updated:**
  - Image: `{env}-viberator-backend-image` → `{env}-viberglass-backend-image`
  - Task Execution Role: `{env}-viberator-backend-task-exec-role` → `{env}-viberglass-backend-task-exec-role`
  - Task Role: `{env}-viberator-backend-task-role` → `{env}-viberglass-backend-task-role`
  - Policies: SSM, logs, execute command all updated to `viberglass`
  - Task Definition: `{env}-viberator-backend` → `{env}-viberglass-backend`
  - Service: `{env}-viberator-backend-service` → `{env}-viberglass-backend-service`
  - Scaling Target: `{env}-viberator-backend-scaling-target` → `{env}-viberglass-backend-scaling-target`
  - Scaling Policies: CPU and memory updated to `viberglass`
- **Container name:** `viberator-backend` → `viberglass-backend`
- **Alias added:** `{env}-viberator-backend` for backwards compatibility

### 2. Worker ECS (infrastructure/components/worker-ecs.ts)
- **Resource names updated:**
  - Cluster: `{env}-viberator-ecs-cluster` → `{env}-viberglass-ecs-cluster`
  - Image: `{env}-viberator-ecs-worker-image` → `{env}-viberglass-ecs-worker-image`
  - Roles and policies updated to `viberglass`
  - Task Definition: `{env}-viberator-ecs-worker` → `{env}-viberglass-ecs-worker`
- **SSM paths updated:**
  - `/viberator/tenants/*` → `/viberglass/tenants/*`
  - `TENANT_CONFIG_PATH_PREFIX` → `/viberglass/tenants`
- **Preserved (intentional):**
  - Container name: `viberator-worker` (workers are Viberators)
  - WORK_DIR: `/tmp/viberator-work` (local worker directory)
- **Alias added:** `{env}-viberator-ecs-worker` for backwards compatibility

### 3. Worker Lambda (infrastructure/components/worker-lambda.ts)
- **Resource names updated:**
  - Image: `{env}-viberator-worker-image` → `{env}-viberglass-worker-image`
  - Role: `{env}-viberator-lambda-role` → `{env}-viberglass-lambda-role`
  - Policies and attachments updated to `viberglass`
  - Function: `viberator-{env}-worker` → `viberglass-{env}-worker`
  - Event Source Mapping: `{env}-viberator-sqs-trigger` → `{env}-viberglass-sqs-trigger`
- **SSM paths updated:**
  - `/viberator/tenants/*` → `/viberglass/tenants/*`
  - `TENANT_CONFIG_PATH_PREFIX` → `/viberglass/tenants`
- **Alias added:** `{env}-viberator-worker` for backwards compatibility

### 4. Database (infrastructure/components/database.ts)
- **Default credentials updated:**
  - dbName: `viberator` → `viberglass`
  - masterUsername: `viberator` → `viberglass`
- **Resource names updated:**
  - Subnet Group: `{env}-viberator-db-subnet-group` → `{env}-viberglass-db-subnet-group`
  - Parameter Group: `{env}-viberator-db-pg` → `{env}-viberglass-db-pg`
  - SSM Parameters: `{env}-viberator-db-*` → `{env}-viberglass-db-*`
  - Instance: `{env}-viberator-db` → `{env}-viberglass-db`
- **SSM paths updated:**
  - `/viberator/{env}/database` → `/viberglass/{env}/database`
- **Descriptions updated:** "Viberator" → "Viberglass"
- **Tags updated:** Application: `viberator` → `viberglass`
- **Aliases added:** SubnetGroup, ParameterGroup, Instance for backwards compatibility

### 5. Queue (infrastructure/components/queue.ts)
- **Resource names updated:**
  - DLQ: `{env}-viberator-worker-dlq` → `{env}-viberglass-worker-dlq`
  - Queue: `{env}-viberator-worker-queue` → `{env}-viberglass-worker-queue`
- **Aliases added:** Both queues have `{env}-viberator-*` aliases for backwards compatibility

### 6. Storage (infrastructure/components/storage.ts)
- **Resource names updated:**
  - Bucket: `{env}-viberator-uploads-bucket` → `{env}-viberglass-uploads-bucket`
  - Encryption: `{env}-viberator-uploads-encryption` → `{env}-viberglass-uploads-encryption`
  - Public Block: `{env}-viberator-uploads-public-block` → `{env}-viberglass-uploads-public-block`
  - Versioning: `{env}-viberator-uploads-versioning` → `{env}-viberglass-uploads-versioning`
  - Lifecycle: `{env}-viberator-uploads-lifecycle` → `{env}-viberglass-uploads-lifecycle`
  - Policy: `{env}-viberator-s3-access-policy` → `{env}-viberglass-s3-access-policy`
- **Bucket prefix:** `viberator-uploads` → `viberglass-uploads`
- **Alias added:** `{env}-viberator-uploads-bucket` for backwards compatibility

### 7. Load Balancer (infrastructure/components/load-balancer.ts)
- **Resource names updated:**
  - Security Group: `{env}-viberator-alb-sg` → `{env}-viberglass-alb-sg`
  - SG Rules: `{env}-viberator-alb-to-backend` → `{env}-viberglass-alb-to-backend`
  - Target Group: `{env}-viberator-backend-tg` → `{env}-viberglass-backend-tg`
  - Load Balancer: `{env}-viberator-alb` → `{env}-viberglass-alb`
  - HTTP Listener: `{env}-viberator-http-listener` → `{env}-viberator-http-listener`
  - HTTPS Listener: `{env}-viberator-https-listener` → `{env}-viberator-https-listener`
- **Description updated:** "Viberator" → "Viberglass"
- **Aliases added:** Target Group and Load Balancer for backwards compatibility

## Success Criteria Verified

- [x] ECS task definitions use "viberglass" family names with aliases
- [x] Lambda function names use "viberglass" prefix with aliases
- [x] RDS instances use "viberglass" identifier with aliases
- [x] SSM paths use "/viberglass/" prefix for platform resources
- [x] SQS queue names use "viberglass" prefix
- [x] S3 bucket names use "viberglass" prefix
- [x] Load balancer resources use "viberglass" prefix
- [x] Worker container names keep "viberator" (workers are Viberators)

## Deviations from Plan

**None** - All tasks completed exactly as specified in the plan.

## Migration Considerations

### Zero-Downtime Deployment
- **ECS Task Definitions:** Aliases allow new task definitions to be created while old tasks continue running
- **SQS Queues:** Aliases preserve existing messages during migration
- **Lambda Functions:** Alias allows graceful function migration

### Data Migration Required
- **RDS Instance:** Changing the identifier will create a new instance and delete the old one
  - **Dev/Staging:** Acceptable - data loss is expected
  - **Production:** Requires data export/import before and after migration

### SSM Parameter Migration
- **Tenant credentials** (`/viberator/tenants/*` → `/viberglass/tenants/*`) need migration
- **Database credentials** (`/viberator/{env}/database` → `/viberglass/{env}/database`) need migration
- Migration scripts will be needed in Phase 15 Plan 04

## Commits

1. `21fd03a` - refactor(15-03): update backend-ecs.ts resource names to viberglass
2. `331ef66` - refactor(15-03): update worker-ecs.ts resource names and SSM paths to viberglass
3. `1d2d8b7` - refactor(15-03): update worker-lambda.ts resource names and SSM paths to viberglass
4. `2102b5e` - refactor(15-03): update database.ts resource names and SSM paths to viberglass
5. `e80ab15` - refactor(15-03): update queue.ts, storage.ts, and load-balancer.ts to viberglass

## Next Steps

Phase 15 Plan 04 will:
1. Update the infrastructure index.ts to wire all the renamed components
2. Create SSM parameter migration scripts
3. Update Pulumi stack references to use new resource names
4. Document the full migration process for production deployment
