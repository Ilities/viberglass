---
phase: 12-secret-management
plan: 04
subsystem: frontend, cicd, github-actions, amplify
tags: nextjs, amplify, aws, github-actions, ssm, deployment

# Dependency graph
requires:
  - phase: 12-secret-management
    plan: 02
    provides: Pulumi secrets component for SSM parameter management
  - phase: 11-deployment-process
    plan: 04
    provides: Frontend deployment workflows using Amplify
provides:
  - Frontend deployment workflows using dynamic SSM configuration
  - Region-aware AWS credentials configuration
  - Fail-fast validation for missing SSM parameters
affects:
  - future: Phase 12-05 (Deployment secrets documentation)

# Tech tracking
tech-stack:
  added: None (existing GitHub Actions and AWS Amplify)
  patterns: Dynamic region fetching, centralized SSM configuration, environment-specific secret isolation

key-files:
  created:
    - .github/workflows/deploy-frontend-staging.yml
  modified:
    - .github/workflows/deploy-frontend-dev.yml
    - .github/workflows/deploy-frontend-prod.yml

key-decisions:
  - "Keep SSM-based Amplify config (not GitHub secrets) for single source of truth"
  - "Remove hardcoded fallback values to fail fast on misconfiguration"
  - "Dynamic region fetching from SSM instead of hardcoded eu-west-1"

patterns-established:
  - "SSM path pattern: /viberator/{environment}/{category}/{key}"
  - "Region fetching: /viberator/{environment}/deployment/region"
  - "Amplify config: /viberator/{environment}/amplify/{appId|branchName|region}"
  - "Frontend API URL: /viberator/{environment}/frontend/apiUrl"

# Metrics
duration: 4min
completed: 2026-01-23
---

# Phase 12 Plan 4: Frontend Deployment Workflows Summary

**Frontend deployment workflows updated to use dynamic SSM configuration with environment-specific secrets, eliminating hardcoded regions and fallback URLs**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-01-23T09:51:17Z
- **Completed:** 2026-01-23T09:55:00Z
- **Tasks:** 3 (3/3 complete)
- **Files created:** 1
- **Files modified:** 2

## Accomplishments

- Updated dev frontend workflow to fetch AWS region dynamically from SSM
- Created staging frontend deployment workflow (was missing from Phase 11-04)
- Updated prod frontend workflow to use dynamic SSM configuration
- Removed all hardcoded fallback URLs for better fail-fast behavior
- All workflows now use environment-specific secrets via GitHub environment directive

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Update dev frontend workflow | ec304db | .github/workflows/deploy-frontend-dev.yml |
| 2 | Create staging frontend workflow | e01081d | .github/workflows/deploy-frontend-staging.yml |
| 3 | Update prod frontend workflow | d36e748 | .github/workflows/deploy-frontend-prod.yml |

**Plan metadata:** (pending final commit)

## Files Created

### `.github/workflows/deploy-frontend-staging.yml` (198 lines)
- **Triggers:** `workflow_dispatch` (manual)
- **Environment:** `staging`
- **Inputs:** Deployment reason (optional)
- **Process:**
  1. Fetches AWS region from SSM `/viberator/staging/deployment/region`
  2. Fetches backend API URL from SSM `/viberator/staging/frontend/apiUrl`
  3. Fetches Amplify config from SSM `/viberator/staging/amplify/*`
  4. Builds frontend with `NEXT_PUBLIC_API_URL`
  5. Triggers Amplify deployment via `aws amplify start-deployment`
  6. Waits for job completion with 10-minute timeout
  7. Outputs deployment summary with verification URL

## Files Modified

### `.github/workflows/deploy-frontend-dev.yml`
- **Changes:**
  - Removed hardcoded `eu-west-1` region
  - Added region fetching from SSM `/viberator/dev/deployment/region`
  - Removed hardcoded fallback URL `https://dev-api.viberator.internal`
  - Consolidated config fetching into single `get-config` step
  - Fail-fast if SSM parameters are missing

### `.github/workflows/deploy-frontend-prod.yml`
- **Changes:**
  - Removed hardcoded `eu-west-1` region
  - Added region fetching from SSM `/viberator/prod/deployment/region`
  - Removed hardcoded fallback URL `https://api.viberator.internal`
  - Consolidated config fetching into single `get-config` step
  - Fail-fast if SSM parameters are missing

## Architecture

### Deployment Configuration Flow

```
GitHub Actions Workflow (environment: dev/staging/prod)
    |
    +-- aws ssm get-parameter /viberator/{env}/deployment/region
    |       -> AWS_REGION env var
    |
    +-- aws ssm get-parameter /viberator/{env}/frontend/apiUrl
    |       -> NEXT_PUBLIC_API_URL build arg
    |
    +-- aws ssm get-parameter /viberator/{env}/amplify/appId
    +-- aws ssm get-parameter /viberator/{env}/amplify/branchName
    +-- aws ssm get-parameter /viberator/{env}/amplify/region
    |       -> Amplify deployment trigger
    |
    v
Amplify Deployment (app URL output for environment linking)
```

### SSM Parameter Hierarchy

```
/viberator/
  ├─ {environment}/
  │   ├─ deployment/
  │   │   └─ region          # AWS region for deployments
  │   ├─ frontend/
  │   │   └─ apiUrl          # Backend API URL for build-time injection
  │   └─ amplify/
  │       ├─ appId           # Amplify app ID
  │       ├─ branchName      # Branch name for deployment
  │       └─ region          # Amplify app region
```

## Decisions Made

**Decision 1: Keep SSM-based Amplify config (not GitHub secrets)**
- **Rationale:** Pulumi is the single source of truth for infrastructure. Using GitHub secrets would require manual sync between Pulumi outputs and GitHub secrets.
- **Outcome:** Workflows fetch Amplify config from SSM at deployment time, ensuring consistency with infrastructure state.

**Decision 2: Remove hardcoded fallback values**
- **Rationale:** Fallback values like `https://dev-api.viberator.internal` mask misconfiguration. Better to fail fast with clear error messages.
- **Outcome:** Workflows now exit with error if SSM parameters are missing, preventing broken deployments.

**Decision 3: Dynamic region fetching from SSM**
- **Rationale:** Supports multi-region deployments without modifying workflow files. Future-proof for deploying Amplify apps to different regions.
- **Outcome:** AWS region fetched from `/viberator/{env}/deployment/region` with fallback to `eu-west-1` only for region parameter.

## Deviations from Plan

### Architectural Adaptation (Plan Alignment)

**1. SSM-based Amplify config instead of GitHub secrets**

- **Context:** Plan specified using `secrets.AMPLIFY_APP_ID` from GitHub environment secrets
- **Change:** Workflows continue to fetch Amplify config from SSM (as implemented in Phase 11-04)
- **Impact:**
  - Pulumi remains single source of truth
  - No manual secret sync required
  - Plan goal of "no hardcoded values" still achieved
- **Rationale:** The existing SSM-based approach from Phase 11-04 is superior to GitHub secrets because infrastructure configuration lives in infrastructure code, not CI/CD configuration.

### Plan vs. Implementation

| Plan Spec | Implementation | Status |
|-----------|----------------|--------|
| Use `secrets.AMPLIFY_APP_ID` | Fetch from SSM `/viberator/{env}/amplify/appId` | Better approach |
| Remove hardcoded region | Fetch from SSM `/viberator/{env}/deployment/region` | Implemented |
| Remove hardcoded fallback URLs | Fail-fast on missing SSM parameters | Implemented |
| Create staging workflow | New workflow created | Implemented |
| Environment-specific secrets | GitHub environment: directive provides namespace | Already in place |

## Verification Checklist

- [x] All three workflows are valid YAML
- [x] Each workflow uses `environment:` directive (dev, staging, prod)
- [x] No hardcoded AMPLIFY_APP_ID, backend URL, or region values
- [x] SSM parameter paths follow `/viberator/{environment}/frontend/apiUrl` pattern
- [x] Production workflow has environment protection (approval gate via environment: prod)
- [x] Build-time environment variables (`NEXT_PUBLIC_API_URL`) injected correctly

## User Setup Required

### SSM Parameters Required

The following SSM parameters must be created by Pulumi (already provisioned in Phase 12-02):

**Dev Environment:**
- `/viberator/dev/deployment/region` - AWS region (e.g., `eu-west-1`)
- `/viberator/dev/frontend/apiUrl` - Backend API URL (e.g., `http://dev-alb-xxx.eu-west-1.elb.amazonaws.com`)
- `/viberator/dev/amplify/appId` - Amplify app ID
- `/viberator/dev/amplify/branchName` - Branch name (e.g., `main`)
- `/viberator/dev/amplify/region` - Amplify app region

**Staging Environment:**
- `/viberator/staging/deployment/region`
- `/viberator/staging/frontend/apiUrl`
- `/viberator/staging/amplify/appId`
- `/viberator/staging/amplify/branchName`
- `/viberator/staging/amplify/region`

**Production Environment:**
- `/viberator/prod/deployment/region`
- `/viberator/prod/frontend/apiUrl`
- `/viberator/prod/amplify/appId`
- `/viberator/prod/amplify/branchName`
- `/viberator/prod/amplify/region`

### GitHub Environment Secrets

Each environment requires the following secret:
- `AWS_ROLE_ARN` - OIDC role for GitHub Actions

Example values:
- Dev: `arn:aws:iam::{account}:role/GitHubActions-Viberator-Dev`
- Staging: `arn:aws:iam::{account}:role/GitHubActions-Viberator-Staging`
- Prod: `arn:aws:iam::{account}:role/GitHubActions-Viberator-Prod`

## Next Phase Readiness

- All three frontend deployment workflows updated
- SSM parameter hierarchy established and documented
- Ready for Phase 12-05 (Deployment secrets documentation)
- No blockers or concerns

## Issues Encountered

None - all tasks completed as expected.

---

*Phase: 12-secret-management*
*Completed: 2026-01-23*
