---
phase: 12-secret-management
plan: 02
subsystem: infra
tags: [pulumi, ssm, kms, aws, secrets-management]

# Dependency graph
requires:
  - phase: 12-secret-management
    plan: 01
    provides: KMS key for SSM encryption (kms.keyId)
provides:
  - SSM parameters for deployment secrets (database, frontend, amplify, ecs, deployment)
  - SecureString encryption using customer-managed KMS key
  - Parameter outputs for workflow references (ssmPaths, ARNs)
affects: [13-deployment-workflows]

# Tech tracking
tech-stack:
  added: [aws.ssm.Parameter]
  patterns:
    - SSM parameter naming convention: /viberator/{environment}/{category}/{key}
    - SecureString for sensitive values, String for non-sensitive
    - KMS keyId passed to SecureString parameters for encryption

key-files:
  created:
    - infrastructure/components/secrets.ts
  modified:
    - infrastructure/Pulumi.yaml
    - infrastructure/index.ts

key-decisions:
  - "Separate kmsKeyId parameter in DeploymentSecretsOptions (InfrastructureConfig doesn't include it)"
  - "Use keyId property (not kmsKeyId) for aws.ssm.Parameter KMS encryption"
  - "Place secrets creation after all dependencies (VPC, loadBalancer, registry, ECS) to avoid forward references"

patterns-established:
  - "SSM parameter creation via helper function with type-based KMS encryption"
  - "Category-based parameter organization (database, frontend, amplify, ecs, deployment)"
  - "Exports provide both ARNs and paths for workflow flexibility"

# Metrics
duration: 4min
completed: 2026-01-23
---

# Phase 12: Secret Management Plan 02 Summary

**Pulumi secrets component creating SSM parameters with SecureString encryption for sensitive deployment values (database URLs, OIDC roles) and String type for non-sensitive values (API URLs, region)**

## Performance

- **Duration:** 4 minutes
- **Started:** 2025-01-23T09:42:40Z
- **Completed:** 2025-01-23T09:46:43Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `infrastructure/components/secrets.ts` with `createDeploymentSecrets()` function
- SSM parameters organized by category: database (SecureString), frontend (String), amplify (String), ecs (String), deployment (mixed)
- KMS encryption applied to SecureString parameters via `keyId` property
- Secrets component wired into infrastructure stack with exports for workflow references
- Pulumi.yaml documented secret configuration methods and types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Pulumi secrets component** - `fa3a952` (feat)
2. **Task 2: Update Pulumi configuration for secrets** - `2df2a5c` (docs)
3. **Task 3: Wire secrets component into infrastructure stack** - `93a1891` (feat)

**Plan metadata:** (to be added after summary creation)

## Files Created/Modified

- `infrastructure/components/secrets.ts` - Pulumi component for SSM Parameter Store secret management
  - `DeploymentSecretsOptions` interface with config, kmsKeyId, and secret values
  - `DeploymentSecretsOutputs` interface with ARNs and paths for all parameters
  - `createDeploymentSecrets()` function creating 11 SSM parameters across 5 categories
  - Helper function for parameter creation with type-based KMS encryption

- `infrastructure/Pulumi.yaml` - Added documentation for secret configuration
  - Comment block explaining pulumi config set commands for SecureString vs String
  - Reference to AWS Console/CLI for operational updates
  - Example template showing which secrets are secure vs non-secure

- `infrastructure/index.ts` - Integrated secrets component into infrastructure stack
  - Import `createDeploymentSecrets` and `DeploymentSecretsOutputs`
  - Added `pulumiConfig` for reading optional config values
  - Called `createDeploymentSecrets()` after Amplify frontend creation
  - Exported secrets outputs: `secretsSsmPaths`, `deploymentRegionArn`, `deploymentOidcRoleArn`, `deploymentEcrRepositoryArn`

## Decisions Made

1. **Separate kmsKeyId parameter** - `InfrastructureConfig` interface doesn't include `kmsKeyId`, so added it as a separate parameter in `DeploymentSecretsOptions` rather than modifying the config interface.

2. **Use keyId property** - Pulumi's `aws.ssm.Parameter` uses `keyId` (not `kmsKeyId`) for KMS encryption key reference. Fixed TypeScript compilation error by using the correct property name.

3. **Place secrets creation after dependencies** - Initially placed secrets creation after KMS key, but this caused forward reference errors for `loadBalancer`, `ecsWorker`, `backendService`. Moved secrets creation after all dependent components are defined.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed kmsKeyId property name in aws.ssm.Parameter**
- **Found during:** Task 1 (Create Pulumi secrets component)
- **Issue:** TypeScript compilation error - "kmsKeyId does not exist in type ParameterArgs". Pulumi uses `keyId` not `kmsKeyId`.
- **Fix:** Changed `kmsKeyId: type === "SecureString" ? options.kmsKeyId : undefined` to use `keyId` property instead.
- **Files modified:** infrastructure/components/secrets.ts
- **Verification:** TypeScript compiles successfully (`npx tsc --noEmit`)
- **Committed in:** fa3a952 (Task 1 commit)

**2. [Rule 1 - Bug] Added kmsKeyId parameter to DeploymentSecretsOptions**
- **Found during:** Task 1 (Create Pulumi secrets component)
- **Issue:** Plan specified `config: InfrastructureConfig` should contain `kmsKeyId`, but `InfrastructureConfig` interface doesn't have this field.
- **Fix:** Added `kmsKeyId: pulumi.Input<string>` as a separate parameter in `DeploymentSecretsOptions` interface rather than modifying `InfrastructureConfig`.
- **Files modified:** infrastructure/components/secrets.ts
- **Verification:** TypeScript compiles successfully, secrets component can access KMS key ID
- **Committed in:** fa3a952 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed forward reference errors by adding pulumiConfig**
- **Found during:** Task 3 (Wire secrets component into infrastructure stack)
- **Issue:** Used `config.get("amplifyAppId")` and `config.get("oidcRoleArn")`, but `InfrastructureConfig` is an interface, not a `pulumi.Config` object, so it doesn't have a `get()` method.
- **Fix:** Added `const pulumiConfig = new pulumi.Config()` and used `pulumiConfig.get()` for optional string values.
- **Files modified:** infrastructure/index.ts
- **Verification:** TypeScript compiles successfully
- **Committed in:** 93a1891 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes were necessary for correct TypeScript compilation and proper Pulumi resource configuration. No scope creep.

## Issues Encountered

- **TypeScript property name mismatch**: Pulumi's SSM Parameter uses `keyId` not `kmsKeyId`. Resolved by checking Pulumi documentation and using correct property name.
- **Interface vs Config object confusion**: `InfrastructureConfig` is a TypeScript interface, not `pulumi.Config`. Resolved by creating separate `pulumiConfig` instance for reading optional values.
- **Forward reference errors**: Initial placement of secrets creation caused errors for undefined resources. Resolved by moving creation after all dependencies.

## User Setup Required

None - all infrastructure provisioned via Pulumi, no external service configuration required.

## Next Phase Readiness

- Secrets component creates all required SSM parameters on `pulumi up`
- KMS encryption applied to SecureString parameters (database URLs, OIDC roles)
- Outputs provide ARNs and paths for GitHub Actions workflows to reference
- Ready for Phase 13: Deployment Workflows to use SSM parameters instead of hardcoded secrets

---
*Phase: 12-secret-management*
*Completed: 2026-01-23*
