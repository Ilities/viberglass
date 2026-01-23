---
phase: 11-deployment-process
plan: 05
subsystem: infra
tags: [pulumi, github-actions, oidc, cicd, infrastructure-as-code]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    provides: Pulumi project structure with infrastructure components
  - phase: 11-03
    provides: GitHub Actions OIDC authentication pattern for AWS
provides:
  - Pulumi preview workflow for pull request validation
  - Automated dev infrastructure deployment on main merge
  - Manual prod infrastructure deployment with approval gates
  - Complete Pulumi CI/CD pipeline for infrastructure management
affects: [12-operations, future infrastructure changes]

# Tech tracking
tech-stack:
  added: [pulumi/actions@v6, Pulumi Cloud integration]
  patterns: [Infrastructure preview via PR comments, Environment-based deployment gates]

key-files:
  created: [.github/workflows/pulumi-preview.yml, .github/workflows/pulumi-deploy-dev.yml, .github/workflows/pulumi-deploy-prod.yml]
  modified: []

key-decisions:
  - "Dev stack for preview - PRs preview against dev stack as baseline"
  - "Manual prod deployment - workflow_dispatch only, no auto-trigger"
  - "Environment protection gates - prod workflow uses environment: prod for approval"
  - "Concurrency control - prevents simultaneous Pulumi operations"

patterns-established:
  - "Pulumi Actions pattern: uses pulumi/actions@v6 with work-dir for monorepo support"
  - "OIDC authentication: aws-actions/configure-aws-credentials@v4 with role-to-assume"
  - "PR comment preview: comment-on-pr: true for inline feedback"
  - "Separate stacks per environment: dev and prod only (no staging)"

# Metrics
duration: 8min
completed: 2026-01-23
---

# Phase 11: Pulumi CI/CD Workflows Summary

**Complete Pulumi CI/CD pipeline with preview on PR, automated dev deployment, and manual prod deployment with approval gates**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-23T08:10:00Z
- **Completed:** 2026-01-23T08:18:00Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments

- **PR preview workflow**: Infrastructure changes show pulumi preview output as PR comments
- **Automated dev deployment**: Infrastructure deploys to dev on merge to main
- **Manual prod deployment**: Production infrastructure requires manual trigger with approval
- **Stack configuration verified**: Dev and prod stack configs are complete and documented

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Pulumi preview workflow for PR validation** - `67046ec` (feat)
2. **Task 2: Create dev infrastructure deployment workflow** - `d494126` (feat)
3. **Task 3: Create prod infrastructure deployment workflow with approval** - `2fc9b40` (feat)
4. **Task 4: Verify stack configuration examples** - N/A (no changes needed - files already exist)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `.github/workflows/pulumi-preview.yml` - PR validation with pulumi preview and comment output
- `.github/workflows/pulumi-deploy-dev.yml` - Automated dev infrastructure deployment on main merge
- `.github/workflows/pulumi-deploy-prod.yml` - Manual prod deployment with approval gates

## Decisions Made

- **Dev stack for preview**: PRs run `pulumi preview` against dev stack as the baseline comparison
- **No staging environment**: Only dev and prod stacks per project decisions (staging handled via dev)
- **Manual prod trigger**: Prod deployment only via workflow_dispatch, not auto-triggered on main push
- **Environment protection**: Uses GitHub environment `prod` for required approval gates
- **Concurrency control**: All workflows use `group: pulumi-${{ github.workflow }}` to prevent simultaneous operations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without issues.

## Authentication Gates

This plan requires external setup before first use:

1. **Pulumi access token**:
   - Create at https://app.pulumi.com/account/tokens
   - Add as `PULUMI_ACCESS_TOKEN` to GitHub repository secrets

2. **GitHub OIDC role permissions**:
   - Ensure GitHubActions-Viberator IAM role has Pulumi permissions
   - Add AdministratorAccess or scoped Pulumi permissions to the role

3. **Stack configuration**:
   - Ensure `infrastructure/Pulumi.dev.yaml` and `infrastructure/Pulumi.prod.yaml` exist
   - Copy from `.example` files if needed

4. **Production environment**:
   - Configure production environment protection rules in GitHub repository settings
   - Add required reviewers for production deployments

## Next Phase Readiness

**Complete** - Pulumi CI/CD pipeline ready for use.

**Prerequisites for first use:**
- Pulumi access token must be added to GitHub secrets
- Stack configuration files must be in place
- Production environment protection rules should be configured

**Remaining work in Phase 11:**
- Plan 11-06: Documentation and runbooks

---
*Phase: 11-deployment-process*
*Completed: 2026-01-23*
