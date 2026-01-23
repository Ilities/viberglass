---
phase: 10-aws-infrastructure
plan: 03
subsystem: infra
tags: [aws, rds, postgresql, pulumi, ssm, vpc, database]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    plan: 02
    provides: VPC with private subnets and security groups
provides:
  - RDS PostgreSQL instance in private subnets
  - Database subnet group for multi-AZ placement
  - Database parameter group for PostgreSQL performance tuning
  - SSM SecureString parameters for database credentials
  - Database connection string available via SSM
affects: [10-04-ecs-backend, 10-05-load-balancer]

# Tech tracking
tech-stack:
  added: [@pulumi/random, aws.rds.Instance, aws.rds.SubnetGroup, aws.rds.ParameterGroup, aws.ssm.Parameter]
  patterns: [SSM SecureString for credentials, random password generation, environment-aware defaults]

key-files:
  created: [infrastructure/components/database.ts, infrastructure/components/vpc.ts]
  modified: [infrastructure/config.ts, infrastructure/index.ts, infrastructure/Pulumi.dev.yaml.example, infrastructure/Pulumi.staging.yaml.example, infrastructure/Pulumi.prod.yaml.example]

key-decisions:
  - "Random password generation via pulumi/random instead of hardcoded credentials"
  - "Environment-aware RDS sizing: dev=db.t4g.micro, staging=db.t4g.large, prod=db.m6g.xlarge"
  - "SSM SecureString for all database credentials (password, connection URL)"
  - "Connection URL parameter interpolates random password with RDS endpoint"
  - "Multi-AZ only for production to balance HA vs cost"

patterns-established:
  - "Database component pattern: createDatabase() with VPC dependencies and SSM credential storage"
  - "Credential storage pattern: RandomPassword -> SSM SecureString with KMS encryption"
  - "Environment defaults: getConfig() provides sensible per-environment database sizing"

# Metrics
duration: 18min
completed: 2026-01-22
---

# Phase 10 Plan 03: RDS PostgreSQL Database Summary

**RDS PostgreSQL 16 with random password generation, SSM SecureString credentials, and environment-aware instance sizing**

## Performance

- **Duration:** 18 min
- **Started:** 2026-01-22T16:56:36Z
- **Completed:** 2026-01-22T17:14:41Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created RDS PostgreSQL component with subnet group and parameter group
- Implemented secure credential storage using SSM SecureString parameters
- Added VPC component from old infrastructure location to new top-level directory
- Integrated database into main stack with environment-aware configuration
- Updated Pulumi stack templates with database-specific configuration options

## Task Commits

Each task was committed atomically:

1. **Task 1-2: Create RDS subnet group, parameter group, and SSM credentials** - `422ddb7` (feat)
2. **Task 3: Create RDS PostgreSQL instance** - (part of task 1 commit - combined)
3. **Task 4: Wire database component to main stack** - `8ab924c` (feat)
4. **Stack configuration templates** - `7beb6f9` (feat)

**Note:** Tasks were combined during execution due to the interconnected nature of RDS resources.

## Files Created/Modified

- `infrastructure/components/database.ts` - RDS PostgreSQL component with subnet group, parameter group, random password, and SSM storage
- `infrastructure/components/vpc.ts` - VPC component copied from old location
- `infrastructure/config.ts` - Added dbInstanceClass, dbAllocatedStorage, singleNatGateway options
- `infrastructure/index.ts` - Integrated VPC and database components, exported outputs
- `infrastructure/Pulumi.dev.yaml.example` - Added database config comments
- `infrastructure/Pulumi.staging.yaml.example` - Added database config comments
- `infrastructure/Pulumi.prod.yaml.example` - Added database config comments

## Decisions Made

- **Random password generation**: Used `@pulumi/random` RandomPassword resource instead of hardcoded credentials or manual generation
- **Environment-aware defaults**: Database instance class scales with environment (db.t4g.micro → db.t4g.large → db.m6g.xlarge)
- **SSM for all credentials**: Password stored as SecureString, connection URL includes interpolated password, host endpoint also stored
- **Multi-AZ production only**: Dev/staging use single-AZ for cost savings, prod uses multi-AZ for HA
- **PostgreSQL 16**: Using latest PostgreSQL major version for new installations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed VPC component location**

- **Found during:** Task 1 (database component creation)
- **Issue:** VPC component was in old location `viberator/infrastructure/` but new infrastructure is at top-level
- **Fix:** Copied VPC component to `infrastructure/components/vpc.ts` for new infrastructure location
- **Files modified:** infrastructure/components/vpc.ts (created)
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 422ddb7 (part of Task 1 commit)

**2. [Rule 2 - Missing Critical] Fixed password generation flow**

- **Found during:** Task 2 (credential creation)
- **Issue:** Initial implementation used placeholder password that wouldn't match SSM-stored password
- **Fix:** Generate random password first, use it for RDS instance, then create SSM parameters with actual endpoint
- **Files modified:** infrastructure/components/database.ts
- **Verification:** RDS password and SSM password use same random source
- **Committed in:** 422ddb7 (part of Task 1 commit)

**3. [Rule 2 - Missing Critical] Fixed TypeScript import for random module**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `aws.random.RandomPassword` doesn't exist, need separate `@pulumi/random` package
- **Fix:** Added `import * as random from "@pulumi/random"` and installed package
- **Files modified:** infrastructure/components/database.ts, infrastructure/package.json
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 422ddb7 (part of Task 1 commit)

**4. [Rule 2 - Missing Critical] Fixed createVpc function call**

- **Found during:** Task 4 (index.ts integration)
- **Issue:** createVpc expects 2 arguments (name, config) but was called with 1
- **Fix:** Updated call to `createVpc(`${config.environment}-viberator`, { ... })`
- **Files modified:** infrastructure/index.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 8ab924c (Task 4 commit)

**5. [Rule 2 - Missing Critical] Removed Performance Insights configuration**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `enablePerformanceInsights` property doesn't exist in current @pulumi/aws version
- **Fix:** Removed Performance Insights configuration from RDS instance
- **Files modified:** infrastructure/components/database.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 422ddb7 (part of Task 1 commit)

---

**Total deviations:** 5 auto-fixed (1 bug, 4 missing critical)
**Impact on plan:** All auto-fixes necessary for correct compilation and functionality. No scope creep.

## Issues Encountered

- **TypeScript compiler showing help instead of compiling**: The `tsc` binary was returning help output regardless of arguments. Workaround: Used `node node_modules/typescript/lib/_tsc.js` directly for compilation checks.
- **VPC component in old location**: Plan 10-02 created VPC component at old location. Copied to new infrastructure/ directory for consistency.

## User Setup Required

Before running `pulumi up` for this plan:

1. Install Pulumi CLI:
   ```bash
   curl -fsSL https://get.pulumi.com | sh
   ```

2. Update Pulumi stack configuration (optional - defaults provided):
   ```bash
   cd infrastructure
   pulumi stack select dev
   pulumi config set dbInstanceClass db.t4g.micro  # optional, has default
   pulumi config set dbAllocatedStorage 20          # optional, has default
   ```

3. Deploy:
   ```bash
   pulumi up
   ```

4. Retrieve database connection string from SSM:
   ```bash
   aws ssm get-parameter --name "/viberator/dev/database/url" --with-decryption
   ```

## Next Phase Readiness

- RDS PostgreSQL instance will be available in private subnets
- Database credentials stored securely in SSM Parameter Store
- VPC outputs (privateSubnetIds, security group IDs) ready for ECS backend deployment
- Database connection details exported as stack outputs
- Backend services can reference SSM parameters for database connection without hardcoding credentials

---
*Phase: 10-aws-infrastructure*
*Completed: 2026-01-22*
