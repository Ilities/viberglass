---
phase: 12-secret-management
plan: 05
subsystem: documentation, deployment, secrets, ssm
tags: documentation, github-actions, ssm, deployment-secrets, amplify, aws

# Dependency graph
requires:
  - phase: 12-secret-management
    plan: 01
    provides: Pulumi secrets component for deployment secret management
  - phase: 12-secret-management
    plan: 02
    provides: SSM parameter hierarchy and provider implementation
  - phase: 12-secret-management
    plan: 03
    provides: Backend deployment workflows using SSM
  - phase: 12-secret-management
    plan: 04
    provides: Frontend deployment workflows using SSM
  - phase: 01-multi-tenant-security-foundation
    plan: 04
    provides: Runtime tenant credential management (CredentialProvider)
provides:
  - Comprehensive deployment secrets documentation (docs/DEPLOYMENT_SECRETS.md)
  - GitHub deployment quick reference (.github/DEPLOYMENT.md)
  - Complete guide for secret setup across all environments
  - Troubleshooting guide for common deployment secret issues
affects:
  - future: None (Phase 12 complete, Phase 13 would be v1.0 release preparation)

# Tech tracking
tech-stack:
  added: None (documentation only)
  patterns: SSM parameter hierarchy (/viberator/{environment}/{category}/{key}), two-tier secret architecture (GitHub Environments + SSM), environment-specific secret isolation

key-files:
  created:
    - docs/DEPLOYMENT_SECRETS.md
    - .github/DEPLOYMENT.md
  modified: None

key-decisions:
  - "Documentation-first approach: complete setup guide before enabling production deployments"
  - "Separation of deployment secrets vs. tenant credentials for clarity and security"
  - "Cross-references to Phase 1 documentation for runtime credential management"

patterns-established:
  - "SSM path pattern: /viberator/{environment}/{category}/{key}"
  - "SecureString for sensitive values, String for non-sensitive"
  - "GitHub environment directive for environment-specific secret injection"
  - "Pulumi as single source of truth for deployment configuration"

# Metrics
duration: 44min
completed: 2026-01-23
---

# Phase 12 Plan 5: Deployment Secrets Documentation Summary

**Comprehensive documentation created for deployment secret management, covering GitHub environment setup, SSM Parameter Store configuration, and troubleshooting for all environments (dev, staging, prod)**

## Performance

- **Duration:** 44 minutes
- **Started:** 2026-01-23T10:02:14Z
- **Completed:** 2026-01-23T10:46:58Z
- **Tasks:** 2 (2/2 complete, checkpoint approved)
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- Created comprehensive deployment secrets documentation (docs/DEPLOYMENT_SECRETS.md)
- Created GitHub deployment quick reference (.github/DEPLOYMENT.md)
- Documented SSM parameter hierarchy with all categories
- Provided step-by-step GitHub environment setup instructions
- Included CLI commands for initial SSM setup
- Documented Pulumi integration for secret provisioning
- Added comprehensive troubleshooting section covering common issues
- Documented security best practices for secret management
- Cross-referenced Phase 1 tenant credential documentation
- Separated deployment-time secrets from runtime tenant credentials

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Files |
| ---- | ----- | ------ | ----- |
| 1 | Create deployment secrets documentation | fb9dfe8 | docs/DEPLOYMENT_SECRETS.md |
| 2 | Create GitHub deployment quick reference | 98f35ca | .github/DEPLOYMENT.md |

**Plan metadata:** (pending final commit)

## Files Created

### `docs/DEPLOYMENT_SECRETS.md` (815 lines)

Complete guide for deployment secret management covering:

**1. Overview Section**
- Distinction between deployment secrets (Phase 12) vs. tenant credentials (Phase 1)
- Two-tier architecture: GitHub Environments + SSM Parameter Store
- Why secrets are separate (deployment-time vs. runtime)

**2. SSM Parameter Hierarchy**
```
/viberator/{environment}/{category}/{key}

Categories:
- database: url, host (SecureString)
- frontend: apiUrl (String)
- amplify: appId, branch (String)
- ecs: cluster, service (String)
- deployment: oidcRoleArn, ecrRepository, region (SecureString for role)
```

**3. GitHub Environment Setup**
- Step-by-step instructions for creating dev, staging, prod environments
- Environment secrets configuration (AWS_ROLE_ARN, AMPLIFY_APP_ID, AMPLIFY_BRANCH)
- How to extract values from AWS Console and Pulumi outputs

**4. Initial SSM Setup**
- CLI commands for creating parameters manually
- SecureString vs. String type selection
- KMS key configuration examples
- Verification commands for existing parameters

**5. Pulumi Integration**
- How `createDeploymentSecrets()` provisions parameters
- Setting secret values via `pulumi config set --secret`
- KMS key configuration for SecureString encryption
- Updating secret values via Pulumi

**6. Workflow Usage**
- How workflows fetch from SSM during deployment
- Environment: directive for secret namespace isolation
- OIDC authentication flow and benefits
- Trust relationship configuration

**7. Troubleshooting Section**
- "Parameter doesn't exist" → Run Pulumi up to create parameters
- "Access denied" → Check IAM role has ssm:GetParameter permission
- "Wrong value in production" → Check using correct environment in SSM path
- "Secrets not updating in ECS" → Force new deployment after SSM change
- "OIDC role trust mismatch" → Update trust relationship
- "Amplify deployment fails" → Verify app ID and branch configuration

**8. Security Best Practices**
- Use SecureString for sensitive values
- Use KMS customer-managed keys (not AWS default)
- Never log secret values
- Separate deployment and runtime secrets
- Use GitHub environment secrets, not repository secrets
- Rotate OIDC role permissions quarterly
- Use least privilege for SSM access

**9. Cross-References**
- Link to Phase 1 tenant credential documentation
- Link to GitHub deployment quick reference
- Link to infrastructure README
- Link to AWS ECS setup guide

### `.github/DEPLOYMENT.md` (364 lines)

Quick reference for deployment workflows covering:

**1. Quick Start by Environment**
- Dev: Auto-deploys on push to main
- Staging: Manual trigger via workflow_dispatch
- Prod: Manual trigger + approval required

**2. Prerequisites Checklist**
- GitHub environments created (dev, staging, prod)
- Environment secrets configured (AWS_ROLE_ARN, AMPLIFY_APP_ID)
- SSM parameters created via Pulumi
- OIDC role configured with trust relationship

**3. Secret Requirements**
- GitHub environment secrets table (AWS_ROLE_ARN, AMPLIFY_APP_ID, AMPLIFY_BRANCH)
- SSM parameter reference table with types and examples
- How to extract values from AWS Console and Pulumi

**4. Deployment Commands**
- Manual deployment triggers for all environments
- Checking deployment status with gh CLI
- Canceling deployments
- Approving production deployments

**5. Deployment Flow**
- Backend deployment flow (build, migrate, update ECS, verify)
- Frontend deployment flow (fetch config, build, deploy via Amplify, verify)

**6. Troubleshooting**
- Workflow fails immediately
- ParameterNotFound errors
- AccessDenied when fetching SSM
- ECS deployment failures
- Amplify deployment failures
- Deployment stuck "In Progress"

**7. Full Documentation Link**
- References docs/DEPLOYMENT_SECRETS.md for comprehensive guide

## Architecture

### Two-Tier Secret Architecture

```
GitHub Environments (dev, staging, prod)
    |
    | environment: directive
    | injects environment-specific secrets
    v
GitHub Actions Workflows
    |
    | OIDC authentication (no long-lived credentials)
    v
AWS Assume Role (ViberatorDeployRole)
    |
    | ssm:GetParameter permission
    v
AWS SSM Parameter Store
    |
    | /viberator/{environment}/{category}/{key}
    v
Deployment Configuration
```

### SSM Parameter Hierarchy

```
/viberator/
  ├─ dev/
  │   ├─ database/
  │   │   ├─ url (SecureString)
  │   │   └─ host (SecureString)
  │   ├─ frontend/
  │   │   └─ apiUrl (String)
  │   ├─ amplify/
  │   │   ├─ appId (String)
  │   │   ├─ branch (String)
  │   │   └─ region (String)
  │   ├─ ecs/
  │   │   ├─ cluster (String)
  │   │   └─ service (String)
  │   └─ deployment/
  │       ├─ region (String)
  │       ├─ oidcRoleArn (SecureString)
  │       └─ ecrRepository (String)
  ├─ staging/
  │   └─ (same structure)
  └─ prod/
      └─ (same structure)
```

### Deployment Secrets vs. Tenant Credentials

| Aspect | Deployment Secrets (Phase 12) | Tenant Credentials (Phase 1) |
|--------|------------------------------|------------------------------|
| **Purpose** | CI/CD authentication, infrastructure config | Runtime application data (API tokens, webhooks) |
| **Scope** | Environment-wide (dev/staging/prod) | Per-tenant isolation |
| **Accessed by** | GitHub Actions, Pulumi, ECS task definitions | Application code at runtime |
| **SSM Path Pattern** | `/viberator/{environment}/{category}/{key}` | `/viberator/tenants/{tenantId}/{key}` |
| **Examples** | Database URLs, OIDC role ARNs, Amplify app IDs | GitHub PATs, Jira API tokens, webhook secrets |

## Decisions Made

**Decision 1: Documentation-first approach**
- **Rationale:** Production deployments require correct secret configuration. Without comprehensive documentation, teams cannot maintain secrets effectively.
- **Outcome:** Complete setup guide with troubleshooting enables confident secret management across all environments.

**Decision 2: Clear separation of deployment vs. runtime secrets**
- **Rationale:** Deployment secrets are infrastructure-level credentials used during CI/CD. Runtime credentials are tenant-specific data used by the application.
- **Outcome:** Documentation clearly distinguishes between the two with cross-references to Phase 1 for runtime credential management.

**Decision 3: Comprehensive troubleshooting section**
- **Rationale:** Secret-related issues are common blockers during deployment. Troubleshooting guide reduces time to resolution.
- **Outcome:** Six common issues documented with symptoms, causes, and solutions including CLI commands for verification and fixes.

**Decision 4: Security best practices section**
- **Rationale:** Secret management has security implications. Teams need clear guidance on best practices.
- **Outcome:** Seven security practices documented with DO/DON'T examples covering SecureString usage, KMS key management, secret logging, and least privilege access.

## Deviations from Plan

None - plan executed exactly as written. Both tasks completed as specified, checkpoint approved by user.

## Verification Checklist

- [x] docs/DEPLOYMENT_SECRETS.md exists with all required sections
- [x] .github/DEPLOYMENT.md provides quick reference for deployment
- [x] SSM parameter hierarchy matches implementation from plans 01-04
- [x] GitHub environment setup instructions are actionable
- [x] Troubleshooting covers common secret-related issues
- [x] Clear distinction between deployment secrets and tenant credentials
- [x] Cross-references to Phase 1 documentation included
- [x] Security best practices documented
- [x] CLI commands for SSM setup are correct
- [x] Pulumi integration documented

## User Setup Required

### GitHub Environment Setup

Users must create GitHub environments and add secrets before deploying:

**1. Create Environments**
- Go to **Settings** → **Environments**
- Create: `dev`, `staging`, `prod`
- Enable **Required reviewers** for `prod`

**2. Add Environment Secrets**

For each environment (`dev`, `staging`, `prod`):

| Secret | Example Value | Source |
|--------|---------------|--------|
| `AWS_ROLE_ARN` | `arn:aws:iam::111111111111:role/ViberatorDeployRole` | IAM role creation (via Pulumi) |
| `AMPLIFY_APP_ID` | `d1234567890abc` | AWS Amplify Console → App → General Settings |
| `AMPLIFY_BRANCH` | `main` | Amplify branch listing (optional) |

### SSM Parameters

SSM parameters are created by Pulumi's `createDeploymentSecrets()` component. No manual setup required if infrastructure is provisioned via Pulumi.

**Verification commands:**
```bash
# List all parameters for environment
aws ssm get-parameters-by-path --path "/viberator/dev" --recursive

# Get specific parameter (decrypted)
aws ssm get-parameter --name "/viberator/dev/database/url" --with-decryption
```

## Next Phase Readiness

**Phase 12 Complete:** All plans in Phase 12 (Secret Management) are now complete:

- 12-01: Pulumi secrets component
- 12-02: DeploymentSecretsProvider implementation
- 12-03: Backend deployment workflows
- 12-04: Frontend deployment workflows
- 12-05: Deployment secrets documentation

**v1.0 Readiness:** The project now has:

- Complete secret management system (deployment + runtime)
- Automated deployment workflows for all environments (dev, staging, prod)
- Comprehensive documentation for setup and troubleshooting
- OIDC authentication (no long-lived credentials)
- Single source of truth (Pulumi infrastructure as code)

**Next Steps:** Phase 13 would typically be v1.0 release preparation, but that phase is not defined in the current roadmap. The project appears to be ready for v1.0 release.

## Issues Encountered

None - all tasks completed as expected. Documentation checkpoint was approved by user without requiring revisions.

---

*Phase: 12-secret-management*
*Completed: 2026-01-23*
