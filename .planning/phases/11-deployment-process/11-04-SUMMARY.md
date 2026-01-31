---
phase: 11-deployment-process
plan: 04
subsystem: frontend, cicd, github-actions
tags: nextjs, amplify, aws, github-actions, deployment

# Dependency graph
requires:
  - phase: 11-deployment-process
    plan: 02
    provides: Amplify SSR configuration, amplify.yml build config
provides:
  - Frontend CI workflow for PR validation
  - Automated dev deployment to Amplify
  - Manual staging deployment to Amplify
  - Manual prod deployment with approval gate to Amplify
affects:
  - future: Deployment process is automated via GitHub Actions

# Tech tracking
tech-stack:
  added: GitHub Actions CI/CD workflows, AWS Amplify deployment automation
  patterns: OIDC authentication, workflow_dispatch triggers, environment protection rules

key-files:
  created:
    - .github/workflows/frontend-ci.yml
    - .github/workflows/deploy-frontend-dev.yml
    - .github/workflows/deploy-frontend-staging.yml
    - .github/workflows/deploy-frontend-prod.yml
  modified: []

key-decisions:
  - "AWS Amplify CLI deployment instead of S3 sync (follows plan 11-02 SSR approach)"
  - "GitHub environment protection rules for production approval gates"
  - "SSM parameter lookup for backend API URLs per environment"
  - "Deployment wait loops with timeout for verification"

patterns-established:
  - "Monorepo path filtering for workflow triggers"
  - "Amplify start-deployment + get-job polling pattern"
  - "Environment-specific secrets for Amplify app IDs"
  - "GitHub deployment URL output for environment linking"

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 11 Plan 4: Frontend Deployment Workflows Summary

**GitHub Actions CI/CD pipeline for frontend with Amplify deployment automation across dev/staging/prod environments**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-01-23T05:49:15Z
- **Completed:** 2026-01-23T05:51:45Z
- **Tasks:** 4 (4/4 complete)
- **Files created:** 4

## Accomplishments

- Created CI workflow for PR validation (lint, test, build)
- Created dev deployment workflow with auto-trigger on main push
- Created staging deployment workflow with manual trigger
- Created prod deployment workflow with approval gate
- All workflows use AWS OIDC authentication (no long-lived credentials)
- Deployment waits for Amplify jobs to complete with status verification
- Environment-specific secrets for Amplify app IDs and branches

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Create frontend CI workflow | 3b51b93 | .github/workflows/frontend-ci.yml |
| 2 | Create dev deployment workflow | 0c80539 | .github/workflows/deploy-frontend-dev.yml |
| 3 | Create staging deployment workflow | 58b5ee3 | .github/workflows/deploy-frontend-staging.yml |
| 4 | Create prod deployment workflow | 438afa9 | .github/workflows/deploy-frontend-prod.yml |

**Plan metadata:** (pending final commit)

## Files Created

### `.github/workflows/frontend-ci.yml` (56 lines)
- **Triggers:** `pull_request` with paths: `platform/frontend/**`, `packages/types/**`
- **Jobs:** lint, test:unit, build verification
- **Special:** Verifies `.next/server` directory exists (SSR build output)

### `.github/workflows/deploy-frontend-dev.yml` (141 lines)
- **Triggers:** `push` to `main` branch with frontend paths
- **Environment:** `dev`
- **Process:**
  1. Fetches backend URL from SSM parameter `/viberator/dev/frontend/apiUrl`
  2. Builds frontend with `NEXT_PUBLIC_API_URL`
  3. Triggers Amplify deployment via `aws amplify start-deployment`
  4. Waits for job completion with 10-minute timeout
  5. Outputs app URL for GitHub deployment UI

### `.github/workflows/deploy-frontend-staging.yml` (149 lines)
- **Triggers:** `workflow_dispatch` (manual)
- **Environment:** `staging`
- **Inputs:** Deployment reason (optional)
- **Process:** Same as dev, with staging-specific secrets and deployment summary

### `.github/workflows/deploy-frontend-prod.yml` (162 lines)
- **Triggers:** `workflow_dispatch` (manual) with required reason input
- **Environment:** `prod` (enforces approval gates)
- **Inputs:**
  - `reason`: Required deployment justification
  - `version`: Optional tag to deploy (defaults to main branch)
- **Process:** Same as staging with 15-minute timeout and detailed summary

## Architecture

### Deployment Flow (Amplify-based)

```
GitHub Push/Dispatch
    |
    v
GitHub Actions Workflow
    |
    +-- npm ci --legacy-peer-deps
    |
    +-- aws ssm get-parameter (backend URL)
    |
    +-- npm run build (with NEXT_PUBLIC_API_URL)
    |
    +-- aws amplify start-deployment
    |
    +-- Poll aws amplify get-job (wait for completion)
    |
    v
Deployment Complete (URL output)
```

### Authentication Pattern

All workflows use OIDC authentication:

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read

- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: eu-west-1
```

### Secret Requirements

| Secret | Environment | Description |
|--------|-------------|-------------|
| `AWS_ROLE_ARN` | All | OIDC role for GitHub Actions |
| `DEV_AMPLIFY_APP_ID` | Dev | Amplify app ID for dev environment |
| `DEV_AMPLIFY_BRANCH` | Dev | Branch name (default: main) |
| `STAGING_AMPLIFY_APP_ID` | Staging | Amplify app ID for staging |
| `STAGING_AMPLIFY_BRANCH` | Staging | Branch name (default: staging) |
| `PROD_AMPLIFY_APP_ID` | Prod | Amplify app ID for production |
| `PROD_AMPLIFY_BRANCH` | Prod | Branch name (default: production) |

## Deviations from Plan

### Architectural Adaptation (User-Context Informed)

**1. Adapted deployment target from S3+CloudFront to AWS Amplify**

- **Context:** User specified plan 11-02 was modified to use Amplify instead of S3+CloudFront
- **Change:** Workflows use `aws amplify start-deployment` instead of `aws s3 sync`
- **Impact:**
  - No S3 bucket or CloudFront distribution ID secrets needed
  - Deployment uses Amplify's Git integration model
  - Amplify manages its own CloudFront distribution with Lambda@Edge
  - Phase 10's S3+CloudFront infrastructure remains unused
- **Rationale:** Amplify SSR supports Next.js 15 dynamic routes, bypassing static export limitations

### Plan vs. Implementation

| Plan Spec | Implementation |
|-----------|----------------|
| S3 sync with cache headers | Amplify build (amplify.yml) handles caching |
| CloudFront invalidation | Amplify manages cache invalidation automatically |
| DEV_FRONTEND_BUCKET secret | DEV_AMPLIFY_APP_ID secret |
| DEV_CLOUDFRONT_ID secret | Not needed (Amplify manages) |
| Manual bucket sync CLI | `aws amplify start-deployment` API |

## User Setup Required

### 1. Create Amplify Apps (per environment)

For each environment (dev, staging, prod):

```bash
# Using AWS CLI
aws amplify create-app \
  --name "viberator-${ENV}" \
  --repository "https://github.com/YOUR_ORG/viberator" \
  --platform "WEB" \
  --build-spec "file://platform/frontend/amplify.yml"
```

Or via AWS Console:
1. Navigate to Amplify Console
2. Click "New app" > "Host web app"
3. Connect GitHub repository
4. Select branch (main for dev, staging, production)
5. Amplify will auto-detect Next.js

### 2. Configure GitHub Secrets

Add to GitHub repository settings:

```bash
# AWS Authentication
AWS_ROLE_ARN=arn:aws:iam::{account}:role/GitHubActions-Viberator

# Dev Environment
DEV_AMPLIFY_APP_ID=d2xxxxxxxxx
DEV_AMPLIFY_BRANCH=main

# Staging Environment
STAGING_AMPLIFY_APP_ID=d3xxxxxxxxx
STAGING_AMPLIFY_BRANCH=staging

# Production Environment
PROD_AMPLIFY_APP_ID=d1xxxxxxxxx
PROD_AMPLIFY_BRANCH=production
```

### 3. Configure Amplify Environment Variables

For each Amplify app, in Amplify Console:

1. Go to App Settings > Environment Variables
2. Add `NEXT_PUBLIC_API_URL` with backend ALB URL
3. Example values:
   - Dev: From Pulumi stack output or SSM `/viberator/dev/frontend/apiUrl`
   - Staging: From Pulumi stack output or SSM `/viberator/staging/frontend/apiUrl`
   - Prod: From Pulumi stack output or SSM `/viberator/prod/frontend/apiUrl`

### 4. Configure GitHub Environment Protection Rules

For production approval gates:

1. Go to repository Settings > Environments
2. Create/prod environment
3. Add required reviewers
4. Optionally: Add wait timer for manual review

## Next Phase Readiness

- All 4 workflows created and committed
- YAML syntax validated
- Environment-specific secrets documented
- SSM parameter paths documented for backend URL lookup
- Ready for GitHub secret configuration and first deployment test

## Verification Checklist

After setup, verify:

- [ ] PR to `platform/frontend/**` triggers CI workflow
- [ ] CI workflow runs lint, test, and build successfully
- [ ] Push to `main` triggers dev deployment
- [ ] Dev deployment completes and app is accessible
- [ ] Staging deployment runs via workflow_dispatch
- [ ] Production deployment requires approval
- [ ] Environment URLs appear in GitHub deployment UI

---

*Phase: 11-deployment-process*
*Completed: 2026-01-23*
