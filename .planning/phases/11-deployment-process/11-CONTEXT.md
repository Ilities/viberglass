# Phase 11: Deployment Process - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

CI/CD pipeline and environment-specific configs — automated testing, Docker image builds, and deployments to:
- Backend: AWS ECS Fargate
- Frontend: AWS Amplify with SSR
- Infrastructure: Pulumi stacks (dev/prod)

This phase delivers the automation that moves code from commits to running deployments.

</domain>

<decisions>
## Implementation Decisions

### Deployment Environments
- **2 environments:** dev and prod (no staging)
- **Naming convention:** `{env}-viberator-{resource}` (e.g., `dev-viberator-backend`, `prod-viberator-backend`)
- **Cost strategy:** Same instance types for both environments (dev uses Spot for worker compute, prod uses On-Demand — this is from earlier decisions)
- **Dev infrastructure:** Auto-stop to save costs (scheduled teardown outside business hours)

### Git Workflow
- **Branch strategy:** `main` branch deploys to dev; prod is manual workflow
- **CI requirement:** Tests block PR merging — required, not advisory
- **Test selection:** Smart test selection based on changed files (faster feedback)
- **Path filtering:** Workflows trigger on specific path patterns to build only affected workspaces

### Manual Gates & Approvals
- **Prod approval:** Production deployment requires manual approval gate
- **Who can approve:** Anyone with repo access (no restricted reviewer lists)
- **Approval timing:** You decide — pre-deployment or mid-deployment gate (Claude's discretion)

### Infrastructure Automation (Pulumi)
- **PR behavior:** Infrastructure PRs run `pulumi preview` as check
- **Dev deployment:** Merged PRs to `infrastructure/` paths trigger `pulumi up` for dev
- **Path-based triggering:** Only infrastructure changes run pulumi — app changes don't trigger infrastructure updates
- **Prod deployment:** Manual pulumi up for prod (not automated)

### Frontend Deployment (AWS Amplify)
- **Provisioning:** Infrastructure as code — Amplify app provisioned via Pulumi/CloudFormation
- **Deployment workflow:** Preview URLs for feature branches + `main` = production
- **SSR mode:** Full SSR enabled — Next.js server-side rendering in Amplify

### Claude's Discretion
- Exact approval gate timing (pre-deployment vs mid-deployment)
- Dev infrastructure teardown schedule specifics
- Amplify SSR configuration details
- CloudFront invalidation strategy (if still needed for Amplify)
- Rollback procedures for failed deployments

</decisions>

<specifics>
## Specific Ideas

- Frontend should use AWS Amplify instead of S3+CloudFront static hosting
- Amplify should support full SSR with Next.js
- Preview URLs for feature branches enable faster iteration
- Smart test selection keeps CI fast even as test suite grows
- Path-based workflows prevent unnecessary builds

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-deployment-process*
*Context gathered: 2026-01-23*
