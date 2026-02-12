# Phase 12: Secret Management - Research

**Researched:** 2026-01-23
**Domain:** CI/CD Secret Management, Multi-Environment Secret Injection
**Confidence:** HIGH

## Summary

Phase 12 focuses on deployment-time secret management across all deployment targets (ECS Fargate, Lambda, Amplify). This is distinct from Phase 1's `CredentialProvider` which handles runtime tenant credentials (GitHub tokens, API keys) used by the application. Phase 12 addresses:

1. **CI/CD secrets**: Authentication for deployments (OIDC role ARNs, ECR credentials, Amplify app IDs)
2. **Environment-specific configuration**: Different secrets for dev/staging/prod (database URLs, API endpoints)
3. **Container secret injection**: Passing secrets to ECS containers and Lambda functions at startup
4. **Secret synchronization**: Ensuring secrets are properly stored in SSM Parameter Store for all environments

Current state analysis shows:
- **Good**: OIDC authentication is configured for all workflows (no long-lived AWS credentials)
- **Good**: SSM Parameter Store is used for DATABASE_URL in ECS task definitions
- **Gap**: Hardcoded environment values in workflows (AWS_ROLE_ARN, ECR_REPOSITORY, AMPLIFY_APP_ID)
- **Gap**: No unified secret management for different deployment targets
- **Gap**: Secrets scattered across workflow files, SSM, and GitHub environment secrets

**Primary recommendation:** Implement a deployment secret provider pattern that centralizes secret configuration and enables environment-specific secret injection without hardcoding values in workflow files.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AWS SSM Parameter Store | N/A (AWS service) | Central secret storage | Industry standard, native AWS integration, already in use |
| GitHub Environments | N/A (GitHub feature) | Environment-specific secrets | Provides isolation, approval gates, auditability |
| GitHub OIDC | @v4 | Secretless AWS authentication | Eliminates long-lived credentials, security best practice |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| aws-actions/configure-aws-credentials | v4 | OIDC-based AWS auth | All AWS deployments |
| aws-actions/amazon-ecr-login | v2 | ECR authentication | Container image pushes |
| aws-ssm-parameters-to-env-action | latest | Bulk SSM to env var loading | Complex deployments with many secrets |

### Existing Project Infrastructure
| Component | Purpose | Current State |
|-----------|---------|---------------|
| `CredentialProvider` interface (Phase 1) | Runtime tenant credentials | Fully implemented |
| `AwsSsmProvider` | SSM Parameter Store backend | Used for tenant credentials |
| `CredentialProviderFactory` | Fallback chain for credential lookup | Environment -> File -> AWS |

**Installation:**
```bash
# No new npm packages required - using AWS SDK v3 (already installed)
# GitHub Actions are configured in workflow files
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/config/
├── deployment/
│   ├── SecretProvider.ts         # Deployment secret provider interface
│   ├── SsmSecretProvider.ts      # SSM-based implementation
│   ├── EnvSecretProvider.ts      # Environment variable fallback
│   └── DeploymentSecretFactory.ts # Factory for provider selection
infrastructure/
├── components/
│   ├── secrets.ts                # Pulumi secret resource definitions
│   └── backend-ecs.ts            # (existing, uses SSM in task defs)
.github/
├── workflows/
│   └── *-deploy.yml              # Updated to use centralized secrets
```

### Pattern 1: Deployment Secret Provider Interface

**What:** A provider interface similar to `CredentialProvider` but for deployment-time secrets.

**When to use:** When deploying to different environments (dev/staging/prod) that have different secret values.

**Example:**
```typescript
// Source: Based on existing CredentialProvider pattern from Phase 1
interface SecretProvider {
  readonly name: string;

  /**
   * Get deployment secret for a specific environment and key
   * @param environment - dev, staging, prod
   * @param key - secret key (e.g., "database.url", "amplify.appId")
   * @returns Secret value or null if not found
   */
  getSecret(environment: string, key: string): Promise<string | null>;

  /**
   * Check if provider is available
   */
  isAvailable(): Promise<boolean>;
}
```

### Pattern 2: SSM Parameter Hierarchy for Deployment Secrets

**What:** Hierarchical SSM parameter structure for deployment secrets.

**When to use:** Storing environment-specific configuration and secrets.

**SSM Path Structure:**
```
/viberator/{environment}/{category}/{key}

Examples:
/viberator/dev/database/url
/viberator/dev/database/host
/viberator/dev/frontend/apiUrl
/viberator/dev/amplify/appId
/viberator/prod/database/url
/viberator/prod/frontend/apiUrl
```

**Example:**
```typescript
// Source: AWS ECS Task Definition pattern (from backend-ecs.ts)
// Container secrets reference SSM parameters
secrets: [
  {
    name: "DATABASE_URL",
    valueFrom: "arn:aws:ssm:eu-west-1:123456789012:parameter/viberator/dev/database/url"
  }
]
```

### Pattern 3: GitHub Environment Secrets

**What:** Using GitHub Environments for environment-specific secrets.

**When to use:** For CI/CD specific secrets that shouldn't be in SSM (OIDC role ARNs, ECR repository names).

**Example:**
```yaml
# .github/workflows/deploy-backend-dev.yml
jobs:
  deploy:
    environment: dev  # Loads dev-specific secrets
    steps:
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}  # From dev environment
```

### Anti-Patterns to Avoid
- **Hardcoding environment values in workflows**: Makes deployment fragile and environment-specific values difficult to update
- **Storing sensitive values in Pulumi config**: Pulumi config is not encrypted by default, use SSM instead
- **Mixing tenant credentials with deployment secrets**: Keep Phase 1 (runtime tenant data) separate from Phase 12 (deployment secrets)
- **Using GitHub Secrets for application secrets**: GitHub Secrets have size limits and aren't accessible by running containers

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret rotation | Custom rotation scripts | AWS Secrets Manager (for auto-rotation) | Built-in rotation, audit logging |
| Secret injection at runtime | Custom sidecar containers | ECS secrets reference or Lambda extension | AWS-native, no additional infrastructure |
| Encryption at rest | Custom encryption | SSM SecureString / KMS | AWS-managed, compliant |
| Secret synchronization | Custom sync scripts | Infrastructure as Code (Pulumi) | Declarative, reproducible |

**Key insight:** AWS provides managed solutions for most secret management problems. Custom solutions introduce security risks, maintenance burden, and operational complexity.

## Common Pitfalls

### Pitfall 1: Container Environment Variable Staleness
**What goes wrong:** Secrets injected as environment variables aren't updated until container restart.

**Why it happens:** ECS injects secret values at container start time. Changes to SSM parameters don't propagate to running containers.

**How to avoid:**
- Use `forceNewDeployment: true` when updating ECS services (already in backend-ecs.ts)
- Document that secret changes require service restart
- For frequently changing secrets, consider runtime fetching via AWS SDK

**Warning signs:** Application continues using old secret values after SSM update.

### Pitfall 2: OIDC Role ARN in Workflow File
**What goes wrong:** Role ARN hardcoded in workflow (`${{ secrets.AWS_ROLE_ARN }}` from default secrets namespace).

**Why it happens:** GitHub recommends environment-specific secrets but doesn't enforce the pattern.

**How to avoid:**
- Always specify `environment: <name>` in workflow jobs
- Use environment-specific secrets (e.g., `dev.AWS_ROLE_ARN`)
- Document secret setup in deployment documentation

**Warning signs:** Same role ARN used across all environments.

### Pitfall 3: Mixing Tenant and Deployment Secrets
**What goes wrong:** Confusing Phase 1's tenant credentials (multi-tenant data) with Phase 12's deployment secrets (infrastructure configuration).

**Why it happens:** Both use SSM Parameter Store and similar naming patterns.

**How to avoid:**
- Use distinct path prefixes:
  - `/viberator/tenants/{tenantId}/{key}` for tenant credentials
  - `/viberator/{environment}/{category}/{key}` for deployment secrets
- Document the distinction in team guidelines

**Warning signs:** Attempting to inject tenant secrets via ECS task definitions.

### Pitfall 4: Missing Task Execution Role Permissions
**What goes wrong:** ECS task fails to start because execution role lacks SSM permissions.

**Why it happens:** ECS `secrets` reference requires `ssm:GetParameter` permission on TASK EXECUTION ROLE, not task role.

**How to avoid:**
- Attach `AmazonECSTaskExecutionRolePolicy` to execution role (already done)
- Add custom SSM policy for specific parameters
- Test in dev environment before staging/prod

**Warning signs:** `CannotPullContainerError` or `CannotPullContainerError: AccessDenied` in ECS events.

### Pitfall 5: Amplify Build-Time Secrets
**What goes wrong:** Frontend needs secrets at build time, but Amplify build runs before deployment.

**Why it happens:** Amplify builds frontend static assets, which can embed environment variables.

**How to avoid:**
- Store build-time secrets in Amplify console OR SSM with Amplify build role access
- For runtime-only secrets, fetch via API call from browser
- Never embed sensitive values in static JavaScript bundles

**Warning signs:** Secrets visible in browser network tab or bundled JS files.

## Code Examples

### SSM Secret Reference in ECS Task Definition
```typescript
// Source: infrastructure/components/backend-ecs.ts (lines 227-232)
secrets: [
  {
    name: "DATABASE_URL",
    valueFrom: options.databaseSsm.urlPath,  // Full SSM parameter ARN
  }
]
```

### GitHub Environment-Specific Secrets
```yaml
# Source: .github/workflows/deploy-backend-prod.yml
jobs:
  deploy:
    environment: prod  # Loads prod environment secrets
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}  # From prod env
```

### SSM Policy for Task Execution Role
```typescript
// Source: infrastructure/components/backend-ecs.ts (lines 132-147)
const ssmPolicy = new aws.iam.Policy(`${options.config.environment}-viberator-backend-ssm-policy`, {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["ssm:GetParameter", "ssm:GetParameters"],
        Effect: "Allow",
        Resource: [
          options.databaseSsm.urlPath,
          options.databaseSsm.hostPath,
        ],
      },
    ],
  },
});
```

### Retrieving Secrets in GitHub Actions
```yaml
# Source: .github/workflows/deploy-backend-dev.yml (lines 61-69)
- name: Get DATABASE_URL from SSM
  id: get-db-url
  run: |
    DB_URL=$(aws ssm get-parameter \
      --name "/viberator/${{ env.ENVIRONMENT }}/database/url" \
      --with-decryption \
      --query Parameter.Value \
      --output text)
    echo "DATABASE_URL=$DB_URL" >> $GITHUB_ENV
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived AWS access keys | OIDC token authentication | 2023-2024 | No credential rotation needed, scoped access |
| Environment variables for secrets | ECS `secrets` block with SSM | 2019+ | Secrets injected at launch, not in env vars |
| GitHub repository secrets | GitHub environment secrets | 2021+ | Environment isolation, approval gates |
| Direct SDK calls for secrets | Lambda Parameters and Secrets Extension | 2021+ | Cached secrets, reduced latency/cost |

**AWS Parameters and Secrets Lambda Extension:**
- Layer ARN for eu-west-1 (x86_64): `arn:aws:lambda:eu-west-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:21`
- Layer ARN for eu-west-1 (ARM64): `arn:aws:lambda:eu-west-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:21`
- Default TTL: 300 seconds (5 minutes)
- Local port: 2773

**Deprecated/outdated:**
- AWS IAM access keys for CI/CD: Replaced by OIDC
- Environment variable injection for sensitive data: Use ECS `secrets` block
- Passing secrets as plaintext files: Use SSM SecureString

## Open Questions

### Question 1: Amplify Secret Management for Different Environments
**What we know:** Amplify Gen 2 uses SSM Parameter Store with path `/amplify/{app-id}/secrets/{secret-name}`.

**What's unclear:** How to manage secrets across dev/staging/prod Amplify apps when using the same GitHub repository.

**Recommendation:** Research Amplify environment branching strategy and document the SSM path naming convention for each environment.

### Question 2: Lambda Worker Secret Caching
**What we know:** AWS Parameters and Secrets Lambda Extension provides local caching with configurable TTL.

**What's unclear:** Whether worker Lambda functions benefit from the extension given infrequent invocations vs. always-on containers.

**Recommendation:** Measure Lambda cold start duration with and without extension. For low-frequency workers, standard SDK calls may be simpler.

### Question 3: Cross-Account Secret Access
**What we know:** Current design assumes single AWS account per environment.

**What's unclear:** Whether Phase 12 should support cross-account secret access (e.g., prod account accessing shared secrets in security account).

**Recommendation:** Defer to v2 requirements. Single-account per environment is sufficient for v1.0.

## Sources

### Primary (HIGH confidence)
- [AWS ECS Secrets with SSM Parameter Store](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html) - Official ECS secret injection pattern
- [AWS Lambda Parameters and Secrets Extension](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html) - Lambda extension for cached secret access
- [Pulumi AWS ECS TaskDefinition](https://www.pulumi.com/registry/packages/aws/api-docs/ecs/taskdefinition/) - Pulumi API for ECS task definitions with secrets
- [Pulumi SSM Parameter](https://www.pulumi.com/registry/packages/aws/api-docs/ssm/parameter/) - Pulumi SSM parameter resource
- [GitHub Environments for Deployment](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html) - Environment-based secret management

### Secondary (MEDIUM confidence)
- [Secretless GitHub Actions to AWS using OIDC](https://www.codecentric.de/en/knowledge-hub/blog/secretless-connections-from-github-actions-to-aws-using-oidc) - OIDC implementation guide
- [Best Practices for Managing Secrets in GitHub Actions](https://www.blacksmith.sh/blog/best-practices-for-managing-secrets-in-github-actions) - 2025 best practices
- [AWS Secrets Manager vs SSM Parameter Store](https://tutorialsdojo.com/aws-secrets-manager-vs-systems-manager-parameter-store/) - Service comparison (Nov 2024)

### Tertiary (LOW confidence)
- [A Practical Guide to MultiCloud Secrets Management](https://taibi.net/a-practical-guide-to-multi-cloud-secrets-management/) - Multi-cloud patterns (for future v2 consideration)
- [Managing Application Secrets Across Cloud Platforms](https://www.bitcot.com/managing-application-secrets-across-cloud-platforms-aws-azure-gcp-and-github/) - Cross-platform considerations (May 2025)

### Internal Project Sources
- `platform/backend/src/credentials/CredentialProvider.ts` - Existing credential provider interface pattern
- `platform/backend/src/credentials/providers/AwsSsmProvider.ts` - SSM implementation reference
- `infrastructure/components/backend-ecs.ts` - Current ECS secret injection implementation
- `infrastructure/components/worker-lambda.ts` - Current Lambda environment variable pattern
- `.github/workflows/deploy-backend-*.yml` - Current deployment workflow patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - AWS SSM and GitHub Environments are industry standards
- Architecture: HIGH - Based on existing project patterns (CredentialProvider) and AWS best practices
- Pitfalls: HIGH - Verified against AWS documentation and known ECS/Lambda gotchas

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - AWS and GitHub practices are stable, minor updates possible)
