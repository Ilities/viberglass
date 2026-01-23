---
phase: 10-aws-infrastructure
plan: 05
subsystem: infra
tags: [kms, ssm, encryption, pulumi, aws]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    plan: 01
    provides: Pulumi infrastructure reorganization with component structure
  - phase: 10-aws-infrastructure
    plan: 03
    provides: Database component with SSM parameter storage
provides:
  - Customer-managed KMS key for SSM Parameter Store encryption
  - KMS key with annual rotation enabled
  - KMS decrypt permissions for Lambda and ECS roles
  - KMS alias for easy reference (alias/viberator-{env}-ssm)
affects: []

# Tech tracking
tech-stack:
  added: ["@pulumi/random"]
  patterns: ["Customer-managed KMS keys for SSM encryption", "IAM inline policies for KMS permissions", "KMS key alias for resource reference"]

key-files:
  created: ["infrastructure/components/kms.ts"]
  modified: ["infrastructure/components/database.ts", "infrastructure/index.ts", "infrastructure/components/registry.ts", "infrastructure/components/worker-ecs.ts", "infrastructure/components/worker-lambda.ts"]

key-decisions:
  - "Customer-managed KMS key instead of AWS default for better control and visibility"
  - "Annual key rotation enabled for compliance without manual intervention"
  - "KMS decrypt permissions granted via inline IAM policies on compute roles"
  - "KMS key created before database component to establish dependency order"

patterns-established:
  - "KMS component pattern: createKmsKey() returns keyId, keyArn, aliasName"
  - "KMS alias pattern: alias/viberator-{environment}-ssm for consistent naming"
  - "SSM parameter encryption: keyId property references customer-managed KMS key"
  - "IAM policy for KMS: kms:Decrypt and kms:GenerateDataKey* actions only"

# Metrics
duration: 19min
completed: 2026-01-22
---

# Phase 10: AWS Infrastructure Summary

**Customer-managed KMS key for SSM Parameter Store encryption with annual rotation and Lambda/ECS role permissions**

## Performance

- **Duration:** 19 min
- **Started:** 2026-01-22T16:56:26Z
- **Completed:** 2026-01-22T17:15:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Customer-managed KMS key for SSM SecureString encryption with automatic rotation
- Database SSM parameters (password, connection URL) now use customer-managed KMS key
- Lambda and ECS roles have KMS decrypt permissions via inline IAM policies
- KMS alias created for easy reference in CloudTrail and compliance reports

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KMS key component** - `2db1e67` (feat)
2. **Task 2: Update SSM parameters to use KMS key** - `e953d65` (feat)
3. **Task 3: Wire KMS component to main stack** - `9de6984` (feat)

## Files Created/Modified

- `infrastructure/components/kms.ts` - KMS key component with createKmsKey() function
- `infrastructure/components/database.ts` - Added kmsKeyArn parameter, SSM parameters use KMS key
- `infrastructure/index.ts` - KMS component integration with IAM policies for compute roles
- `infrastructure/components/registry.ts` - Fixed repositoryArn/repositoryId property access
- `infrastructure/components/worker-ecs.ts` - Added taskRoleName output, fixed ClusterSetting type
- `infrastructure/components/worker-lambda.ts` - Added lambdaRoleArn output

## Decisions Made

- Used customer-managed KMS key instead of AWS default key for better control and compliance visibility
- Annual key rotation enabled (AWS KMS default) without additional configuration
- KMS decrypt permissions granted via inline IAM policies attached to Lambda/ECS roles
- KMS key created before database component to establish proper dependency order in Pulumi
- KMS alias naming: `alias/viberator-{environment}-ssm` for consistent cross-environment reference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in existing components**
- **Found during:** Task 1 (KMS component creation)
- **Issue:** registry.ts referenced non-existent repositoryArn/repositoryId properties; worker-ecs.ts used wrong ClusterSetting type
- **Fix:** Updated registry.ts to use repo.repository.arn and repo.repository.id; fixed ClusterSetting type in worker-ecs.ts
- **Files modified:** infrastructure/components/registry.ts, infrastructure/components/worker-ecs.ts
- **Verification:** TypeScript compilation passes

**2. [Rule 3 - Blocking] Installed missing @pulumi/random package**
- **Found during:** Task 2 (database component KMS integration)
- **Issue:** @pulumi/random package not installed, RandomPassword resource import failing
- **Fix:** Ran `npm install @pulumi/random` in infrastructure directory
- **Files modified:** infrastructure/package.json, infrastructure/package-lock.json
- **Verification:** Import succeeds, TypeScript compilation passes

**3. [Rule 3 - Blocking] Fixed database.ts output type declarations**
- **Found during:** Task 2 (database SSM parameter updates)
- **Issue:** Interface declared string types but Pulumi resources return pulumi.Output<string>
- **Fix:** Updated DatabaseSubnetOutputs, DatabaseSsmOutputs interfaces to use pulumi.Output<string>
- **Files modified:** infrastructure/components/database.ts
- **Verification:** TypeScript compilation passes

**4. [Rule 1 - Bug] Added lambdaRoleArn to WorkerLambdaOutputs**
- **Found during:** Task 3 (KMS IAM policy attachment)
- **Issue:** Lambda role ARN needed for KMS key policy but not exported from component
- **Fix:** Added lambdaRoleArn to interface and return statement in worker-lambda.ts
- **Files modified:** infrastructure/components/worker-lambda.ts
- **Verification:** KMS policy creation compiles successfully

**5. [Rule 1 - Bug] Added taskRoleName to WorkerEcsOutputs**
- **Found during:** Task 3 (KMS IAM policy attachment)
- **Issue:** ECS task role name needed for IAM policy attachment but not exported
- **Fix:** Added taskRoleName to interface and return statement in worker-ecs.ts
- **Files modified:** infrastructure/components/worker-ecs.ts
- **Verification:** IAM policy attachment compiles successfully

---

**Total deviations:** 5 auto-fixed (1 bug fix, 3 blocking fixes, 1 additional bug)
**Impact on plan:** All auto-fixes necessary for compilation and correctness. No scope creep.

## Issues Encountered

- File kept being modified by linter/pre-commit hook during index.ts edits - worked around by writing file in single operations
- Pulumi CLI not installed locally - verified changes via TypeScript compilation instead of pulumi preview

## User Setup Required

None - no external service configuration required. KMS key will be created during `pulumi up`.

## Next Phase Readiness

- KMS component ready for use by other components needing encrypted SSM parameters
- Lambda and ECS roles can decrypt SSM SecureString parameters encrypted with this key
- Database credentials encrypted with customer-managed key for compliance
- Future components can reference kmsKeyArn output for their own SSM parameters

---
*Phase: 10-aws-infrastructure*
*Completed: 2026-01-22*
