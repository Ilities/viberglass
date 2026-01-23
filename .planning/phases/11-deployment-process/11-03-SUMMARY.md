---
phase: 11-deployment-process
plan: 03
subsystem: ci-cd
tags: github-actions, ecs, ecr, oidc, docker, migrations

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    provides: ECS clusters, ECR registry, RDS databases, security groups
provides:
  - Backend CI workflow for pull request testing
  - Automated dev deployment workflow triggered on main branch push
  - Manual prod deployment workflow with approval gates
  - OIDC-based AWS authentication (no access keys)
affects: phase-12-secret-management

# Tech tracking
tech-stack:
  added: []
  patterns:
    - OIDC role assumption for GitHub Actions AWS authentication
    - Migration-before-deployment pattern (run migrations before ECS service update)
    - Service stability waiting (wait-for-service-stability: true)
    - Git SHA tagging for Docker images

key-files:
  created: []
  modified:
    - .github/workflows/backend-ci.yml
    - .github/workflows/deploy-backend-dev.yml
    - .github/workflows/deploy-backend-prod.yml

key-decisions:
  - "OIDC authentication over access keys for GitHub Actions"
  - "Migration-before-deployment ordering prevents compatibility issues"
  - "Git SHA image tags enable precise rollbacks"

patterns-established:
  - "Pattern: All workflows use aws-actions/configure-aws-credentials with role-to-assume"
  - "Pattern: Migrations run via docker run --rm with DATABASE_URL from SSM"
  - "Pattern: ECS deployments use aws-actions/amazon-ecs-deploy-task-definition"
  - "Pattern: Prod deployments require environment: prod with approval gates"

# Metrics
duration: 3min
completed: 2026-01-23
---

# Phase 11 Plan 03: Backend CI/CD Workflows Summary

**Backend CI/CD pipeline with OIDC authentication, migration-before-deployment pattern, and environment-specific controls**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-23T12:15:00Z
- **Completed:** 2026-01-23T12:18:00Z
- **Tasks:** 3 (all verification)
- **Files modified:** 0 (workflows already complete)

## Accomplishments

- Verified backend CI workflow runs tests and TypeScript checks on PRs
- Verified dev deployment workflow auto-deploys on main branch push
- Verified prod deployment workflow requires manual approval with environment gates
- Confirmed all workflows use OIDC authentication (no hardcoded access keys)

## Task Commits

No commits required - all workflow files were already complete and verified as correct:

1. **Task 1: Verify backend CI workflow** - `N/A` (verification only)
2. **Task 2: Verify dev deployment workflow** - `N/A` (verification only)
3. **Task 3: Verify prod deployment workflow** - `N/A` (verification only)

**Plan metadata:** None (no git changes made)

## Files Created/Modified

All workflow files already existed and were verified as complete:

- `.github/workflows/backend-ci.yml` - Runs tests and TypeScript check on PRs affecting backend code
- `.github/workflows/deploy-backend-dev.yml` - Automated dev deployment on main push with migrations
- `.github/workflows/deploy-backend-prod.yml` - Manual prod deployment with approval gates

## Deviations from Plan

None - plan executed exactly as written. All workflow files were already present and correctly configured.

## Issues Encountered

None - all workflows were already complete.

## User Setup Required

**External services require manual configuration.** See plan 11-03 frontmatter for:

### AWS Setup

1. **Create IAM role for GitHub Actions OIDC**
   - Location: AWS Console -> IAM -> Roles -> Create role -> Web identity
   - Provider: `token.actions.githubusercontent.com`
   - Trust relationship: `repo:YOUR_ORG/viberator:*`

2. **Configure IAM permissions**
   - Attach policies for ECS, ECR, SSM access
   - Include `sts:AssumeRole` with OIDC condition

### GitHub Setup

1. **Add AWS_ROLE_ARN to GitHub secrets**
   - Location: GitHub repo -> Settings -> Secrets and variables -> Actions
   - Name: `AWS_ROLE_ARN`
   - Value: ARN of the IAM role created above

2. **Configure deployment environments**
   - Create `dev` environment (no protection rules needed)
   - Create `prod` environment with protection rules:
     - Required reviewers: Specify who can approve
     - Wait timer: Optional delay before deployment proceeds

3. **Verify workflow permissions**
   - GitHub repo -> Settings -> Actions -> General
   - Ensure "Read and write permissions" is enabled for workflow permissions

## Next Phase Readiness

- Backend CI/CD workflows verified and ready for execution
- User must complete AWS OIDC role setup and GitHub environment configuration before workflows can run
- Next phase (11-04) covers frontend deployment workflows with Amplify

---
*Phase: 11-deployment-process*
*Plan: 03*
*Completed: 2026-01-23*
