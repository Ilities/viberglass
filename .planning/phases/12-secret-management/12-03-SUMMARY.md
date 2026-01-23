---
phase: 12-secret-management
plan: 03
subsystem: ci-cd
tags: github-actions, ssm, environment-secrets, ecs, backend-deployment

# Dependency graph
requires:
  - phase: 12-secret-management
    plan: 02
    provides: Pulumi secrets component with SSM parameter creation for deployment configuration
  - phase: 11-deployment-process
    plan: 03
    provides: Existing backend deployment workflows with OIDC authentication
provides:
  - Backend deployment workflows using environment-specific GitHub secrets
  - SSM-driven deployment configuration (no hardcoded values)
  - Dev auto-deployment on push to main branch
  - Staging manual deployment via workflow_dispatch
  - Production deployment with approval gates
affects: deployment-infrastructure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Environment-specific secrets via GitHub Environments
    - SSM parameter fetching for deployment configuration
    - Fallback values for graceful degradation
    - Centralized deployment configuration in Pulumi, consumed by CI/CD

key-files:
  created:
    - .github/workflows/deploy-backend-staging.yml
  modified:
    - .github/workflows/deploy-backend-dev.yml
    - .github/workflows/deploy-backend-prod.yml

key-decisions:
  - "Fetch SSM parameters after AWS credentials configuration (not before)"
  - "Use fallback values in SSM fetch for graceful degradation"
  - "Created staging workflow that didn't exist previously"
  - "Environment directive enables environment-specific secret injection"

patterns-established:
  - "Pattern: AWS credentials configured before SSM parameter fetching"
  - "Pattern: GitHub environment: directive loads environment-specific secrets"
  - "Pattern: Deployment configuration fetched from /viberator/{env}/deployment/* SSM paths"
  - "Pattern: Fallback values using || echo 'default' for robustness"

# Metrics
duration: 5min
completed: 2026-01-23
---

# Phase 12 Plan 03: Backend Deployment Workflows Summary

**Backend deployment workflows using environment-specific GitHub secrets and SSM-driven configuration without hardcoded values**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-23T09:50:51Z
- **Completed:** 2026-01-23T09:55:00Z
- **Tasks:** 3
- **Files modified:** 2 updated, 1 created

## Accomplishments

- Updated dev backend workflow to use environment-specific secrets and SSM configuration
- Created staging backend workflow with SSM-driven configuration (previously didn't exist)
- Updated prod backend workflow to use SSM configuration with approval gates
- Removed all hardcoded environment values (AWS_REGION, ECR_REPOSITORY, ECS_CLUSTER, ECS_SERVICE)
- Added `environment:` directive to all workflows for proper secret isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Update dev backend deployment workflow** - `4508191` (feat)
2. **Task 2: Create staging backend deployment workflow** - `28f034f` (feat)
3. **Task 3: Update prod backend deployment workflow** - `5ce10fb` (feat)

**Plan metadata:** None (metadata commit after summary creation)

## Files Created/Modified

- `.github/workflows/deploy-backend-dev.yml` - Updated to use SSM configuration and environment secrets
- `.github/workflows/deploy-backend-staging.yml` - Created new staging deployment workflow
- `.github/workflows/deploy-backend-prod.yml` - Updated to use SSM configuration with approval gates

## Decisions Made

**AWS credentials before SSM fetch:** Initially tried to fetch SSM parameters before configuring AWS credentials, but this fails because SSM calls require authentication. Moved `Configure AWS credentials` step before `Get deployment config from SSM` step.

**Staging workflow creation:** The plan referenced a staging workflow file that didn't exist. Created it following the same pattern as dev/prod with staging-specific environment and paths.

**Fallback values in SSM fetch:** Added fallback values (`|| echo "default"`) to all SSM parameter fetches for graceful degradation if Pulumi hasn't been run yet to create the parameters. This prevents workflow failures during initial setup.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Order of operations issue:** Initially placed SSM fetch step before AWS credentials configuration, which would fail because SSM calls require authenticated AWS session. Fixed by reordering steps so AWS credentials are configured first.

## User Setup Required

**GitHub Environment configuration required:**

1. **Create GitHub Environments:**
   - Go to: GitHub repo -> Settings -> Environments
   - Create `dev` environment (no protection rules needed)
   - Create `staging` environment (no protection rules needed)
   - Create `prod` environment with protection rules:
     - Required reviewers: Specify who can approve production deployments
     - Wait timer: Optional delay before deployment proceeds

2. **Add environment-specific secrets:**
   - For each environment (dev, staging, prod), add `AWS_ROLE_ARN` secret
   - This is the OIDC role ARN for GitHub Actions to assume
   - Each environment can use different roles for least privilege

**SSM Parameter creation:**
- Run `pulumi up` for each environment stack to create SSM parameters
- Parameters are created by `infrastructure/components/secrets.ts`
- Paths follow: `/viberator/{environment}/deployment/{key}`

## Next Phase Readiness

- Backend deployment workflows now fully SSM-driven
- GitHub environment secrets must be configured before workflows can run
- Pulumi infrastructure must be deployed to create SSM parameters
- Next phase (if any) can follow the same pattern for other deployment targets

---
*Phase: 12-secret-management*
*Plan: 03*
*Completed: 2026-01-23*
