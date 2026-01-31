# Deployment Secrets Management

**Purpose:** Complete guide for setting up and managing deployment secrets across all environments (dev, staging, prod).

## Overview

Deployment secrets are infrastructure-level credentials and configuration values used **during deployment** - they're distinct from runtime tenant credentials (see [Phase 1: Multi-Tenant Security Foundation](../.planning/phases/01-multi-tenant-security-foundation/01-04-SUMMARY.md) for tenant credential management).

**Key differences:**

| Aspect | Deployment Secrets (Phase 12) | Tenant Credentials (Phase 1) |
|--------|------------------------------|------------------------------|
| **Purpose** | CI/CD authentication, infrastructure config | Runtime application data (API tokens, webhooks) |
| **Scope** | Environment-wide (dev/staging/prod) | Per-tenant isolation |
| **Accessed by** | GitHub Actions, Pulumi, ECS task definitions | Application code at runtime |
| **SSM Path Pattern** | `/viberator/{environment}/{category}/{key}` | `/viberator/tenants/{tenantId}/{key}` |
| **Examples** | Database URLs, OIDC role ARNs, Amplify app IDs | GitHub PATs, Jira API tokens, webhook secrets |

**Two-tier architecture:**

1. **GitHub Environments** - Provide environment-specific secrets for CI/CD (OIDC role ARNs, Amplify app IDs)
2. **AWS SSM Parameter Store** - Central storage for all deployment configuration (database URLs, API endpoints, etc.)

This separation ensures:
- **CI/CD can authenticate** without long-lived credentials (GitHub OIDC → AWS)
- **Workflows are environment-agnostic** - same workflow code works for dev/staging/prod
- **Secrets never hardcoded** - all sensitive values fetched at runtime from SSM
- **Pulumi is single source of truth** - infrastructure changes automatically propagate to deployments

---

## SSM Parameter Hierarchy

All deployment secrets follow this naming pattern:

```
/viberator/{environment}/{category}/{key}
```

**Categories:**

| Category | Purpose | Type | Example |
|----------|---------|------|---------|
| `database` | Database connection details | SecureString | `/viberator/dev/database/url` |
| `frontend` | Frontend build configuration | String | `/viberator/dev/frontend/apiUrl` |
| `amplify` | Amplify app configuration | String | `/viberator/dev/amplify/appId` |
| `ecs` | ECS cluster/service names | String | `/viberator/dev/ecs/cluster` |
| `deployment` | Deployment configuration | Mixed | `/viberator/dev/deployment/oidcRoleArn` |

**Type meanings:**

- **SecureString**: KMS-encrypted sensitive values (database URLs, OIDC role ARNs)
- **String**: Plain text non-sensitive values (API URLs, region, cluster names)

**Examples by environment:**

```bash
# Development
/viberator/dev/database/url          # postgresql://dev-db.xxx.eu-west-1.rds.amazonaws.com...
/viberator/dev/frontend/apiUrl       # https://dev-api.viberator.com
/viberator/dev/amplify/appId         # d1234567890abc
/viberator/dev/deployment/region     # eu-west-1
/viberator/dev/deployment/oidcRoleArn # arn:aws:iam::...:role/ViberatorDeployRole

# Staging
/viberator/staging/database/url
/viberator/staging/frontend/apiUrl
/viberator/staging/amplify/appId

# Production
/viberator/prod/database/url
/viberator/prod/frontend/apiUrl
/viberator/prod/amplify/appId
```

---

## GitHub Environment Setup

GitHub Environments provide environment-isolated secrets for CI/CD workflows.

### Step 1: Create Environments

1. Go to **GitHub Repository** → **Settings** → **Environments**
2. Click **New environment** and create:
   - `dev`
   - `staging`
   - `prod`

3. For `prod` environment, enable **Required reviewers** (approval gate)

### Step 2: Add Environment Secrets

For each environment (`dev`, `staging`, `prod`), add these secrets:

**Settings** → **Environments** → `{environment}` → **Secrets and variables** → **Secrets** → **New repository secret**

| Secret Name | Example Value | Source | Purpose |
|-------------|---------------|--------|---------|
| `AWS_ROLE_ARN` | `arn:aws:iam::111111111111:role/ViberatorDeployRole` | IAM role creation (via Pulumi) | OIDC authentication for GitHub Actions |
| `AMPLIFY_APP_ID` | `d1234567890abc` | AWS Amplify Console → App → General Settings | Amplify app ID for frontend deployment |
| `AMPLIFY_BRANCH` | `main` | Amplify branch listing | Branch to deploy (optional, defaults to environment name) |

**Getting the values:**

**AWS_ROLE_ARN:**
- Created by Pulumi when running `pulumi up` for your stack
- Find in AWS Console: **IAM** → **Roles** → Search for `ViberatorDeployRole`
- Or export from Pulumi: `pulumi stack output oidcRoleArn`

**AMPLIFY_APP_ID:**
- Created by Pulumi's `createAmplifyHosting()` component
- Find in AWS Console: **Amplify** → **App** → **App settings** → **General** → **App ARN**
- Extract ID from ARN: `arn:aws:amplify:eu-west-1:111111111111:apps/{AMPLIFY_APP_ID}`

**AMPLIFY_BRANCH:**
- Defaults to environment name (`dev`, `staging`, `main` for prod)
- Check Amplify Console → **Branches** tab for available branches

---

## Initial SSM Setup

SSM parameters are created by Pulumi's `createDatabase()` (database connection) and `createDeploymentSecrets()` (non-database) components, but you can also create them manually for testing.

### Prerequisites

1. **AWS CLI installed and configured:**
   ```bash
   aws --version
   aws configure
   ```

2. **KMS key for encryption:**
   ```bash
   # List existing KMS keys
   aws kms list-aliases --query 'Aliases[?AliasName==`alias/viberator-dev-ssm`].AliasName'

   # Or create via Pulumi (recommended)
   pulumi stack init dev
   pulumi up
   ```

### Creating Parameters Manually

**Database URL (SecureString - encrypted):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/database/url" \
  --value "postgresql://dbuser:dbpass@dev-db.xxx.eu-west-1.rds.amazonaws.com:5432/viberator" \
  --type "SecureString" \
  --key-id "alias/viberator-dev-ssm" \
  --overwrite
```

**Database Host (SecureString - encrypted):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/database/host" \
  --value "dev-db.xxx.eu-west-1.rds.amazonaws.com" \
  --type "SecureString" \
  --key-id "alias/viberator-dev-ssm" \
  --overwrite
```

**Frontend API URL (String - not sensitive):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/frontend/apiUrl" \
  --value "https://dev-api.viberator.com" \
  --type "String" \
  --overwrite
```

**Amplify App ID (String - not sensitive):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/amplify/appId" \
  --value "d1234567890abc" \
  --type "String" \
  --overwrite
```

**ECS Cluster (String - not sensitive):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/ecs/cluster" \
  --value "dev-viberator-cluster" \
  --type "String" \
  --overwrite
```

**Deployment Region (String - not sensitive):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/deployment/region" \
  --value "eu-west-1" \
  --type "String" \
  --overwrite
```

**OIDC Role ARN (SecureString - encrypted):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/deployment/oidcRoleArn" \
  --value "arn:aws:iam::111111111111:role/ViberatorDeployRole" \
  --type "SecureString" \
  --key-id "alias/viberator-dev-ssm" \
  --overwrite
```

**ECR Repository (String - not sensitive):**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/deployment/ecrRepository" \
  --value "viberator-backend" \
  --type "String" \
  --overwrite
```

### Verifying Parameters

```bash
# List all parameters for an environment
aws ssm get-parameters-by-path \
  --path "/viberator/dev" \
  --recursive \
  --query 'Parameters[].Name'

# Get a specific parameter (decrypted)
aws ssm get-parameter \
  --name "/viberator/dev/database/url" \
  --with-decryption \
  --query Parameter.Value \
  --output text

# Get all parameters with values (decrypted)
aws ssm get-parameters-by-path \
  --path "/viberator/dev" \
  --recursive \
  --with-decryption \
  --query 'Parameters[].{Name:Name,Value:Value}'
```

### Deleting Parameters

```bash
# Single parameter
aws ssm delete-parameter --name "/viberator/dev/database/url"

# All parameters for environment (use with caution)
aws ssm get-parameters-by-path \
  --path "/viberator/dev" \
  --recursive \
  --query 'Parameters[].Name' \
  --output text | xargs -I {} aws ssm delete-parameter --name {}
```

---

## Pulumi Integration

The `createDeploymentSecrets()` component in `infra/platform/components/secrets.ts` provisions non-database SSM parameters. Database connection parameters are created by `createDatabase()` in `infra/platform/components/database.ts`.

### Setting Secret Values via Pulumi Config

Secret values are set using Pulumi's `--secret` flag:

```bash
# Set non-sensitive values
pulumi config set frontendApiUrl "https://dev-api.viberator.com"
pulumi config set amplifyAppId "d1234567890abc"
pulumi config set ecsCluster "dev-viberator-cluster"

# Set deployment config
pulumi config set awsRegion "eu-west-1"
pulumi config set --secret oidcRoleArn "arn:aws:iam::...:role/ViberatorDeployRole"
pulumi config set ecrRepository "viberator-backend"
```

### KMS Key Configuration

The component requires a KMS key for SecureString encryption:

```typescript
// KMS key creation
const kmsKey = new aws.kms.Key(`${env}-viberator-ssm-key`, {
  description: `KMS key for Viberator ${env} SSM parameters`,
  enableKeyRotation: true,
  tags: config.tags,
});

const kmsAlias = new aws.kms.Alias(`${env}-viberator-ssm-alias`, {
  name: `alias/viberator-${env}-ssm`,
  targetKeyId: kmsKey.keyId,
});

// Pass to secrets component
const secrets = createDeploymentSecrets({
  config: config,
  kmsKeyId: kmsKey.arn,
  frontendApiUrl: frontendApiUrl,
  // ... other options
});
```

### Updating Secrets

To update secret values:

1. **Update Pulumi config:**
   ```bash
   pulumi config set frontendApiUrl "new-api-url"
   ```

2. **Run Pulumi up:**
   ```bash
   pulumi up
   ```

3. **Verify in AWS Console:**
   - **Systems Manager** → **Parameter Store** → `/viberator/{environment}/database/url`

---

## Workflow Usage

GitHub Actions workflows fetch secrets from SSM during deployment.

### Environment: Directive

Each workflow job specifies its environment:

```yaml
jobs:
  deploy:
    environment: dev  # Loads dev environment secrets
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}  # From dev environment
```

This ensures:
- Dev workflow uses `dev.AWS_ROLE_ARN`
- Staging workflow uses `staging.AWS_ROLE_ARN`
- Prod workflow uses `prod.AWS_ROLE_ARN`

### Fetching from SSM

Workflows fetch parameters after AWS authentication:

```yaml
- name: Configure AWS credentials via OIDC
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: eu-west-1

- name: Get deployment config from SSM
  id: get-config
  run: |
    # Fetch region
    AWS_REGION=$(aws ssm get-parameter \
      --name "/viberator/${{ env.ENVIRONMENT }}/deployment/region" \
      --query Parameter.Value \
      --output text)
    echo "aws_region=$AWS_REGION" >> $GITHUB_OUTPUT

    # Fetch ECR repository
    ECR_REPOSITORY=$(aws ssm get-parameter \
      --name "/viberator/${{ env.ENVIRONMENT }}/deployment/ecrRepository" \
      --query Parameter.Value \
      --output text)
    echo "ecr_repository=$ECR_REPOSITORY" >> $GITHUB_OUTPUT
```

### OIDC Authentication

GitHub Actions use OpenID Connect for AWS authentication - no long-lived credentials needed.

**Benefits:**

- No access key rotation required
- Short-lived tokens (auto-expire)
- Scoped permissions (role-based)
- Audit trail in CloudTrail

**How it works:**

1. GitHub Actions OIDC provider generates a JWT
2. AWS validates JWT against trust relationship
3. AWS assumes the specified role
4. Role permissions granted for workflow duration

**Trust relationship (on IAM role):**

```json
{
  "Effect": "Allow",
  "Principal": {
    "Federated": "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:your-org/viberator:ref:refs/heads/main"
    }
  }
}
```

---

## Troubleshooting

### "Parameter doesn't exist" Error

**Symptom:**
```
An error occurred (ParameterNotFound) when calling the GetParameter operation:
Parameter: /viberator/dev/database/url does not exist
```

**Cause:** SSM parameters haven't been created yet.

**Solution:**

1. Run `pulumi up` for the environment stack:
   ```bash
   pulumi stack select dev
   pulumi up
   ```

2. Verify parameters exist:
   ```bash
   aws ssm get-parameters-by-path \
     --path "/viberator/dev" \
     --recursive \
     --query 'Parameters[].Name'
   ```

3. If manually creating, see [Initial SSM Setup](#initial-ssm-setup)

---

### "Access denied" Error

**Symptom:**
```
An error occurred (AccessDenied) when calling the GetParameter operation:
User: arn:aws:sts::111111111111:assumed-role/... is not authorized to perform: ssm:GetParameter
```

**Cause:** IAM role lacks SSM permissions.

**Solution:**

1. Check IAM role permissions:
   ```bash
   # Get role ARN from GitHub OIDC setup
   aws iam get-role --role-name ViberatorDeployRole --query Role.Arn

   # List attached policies
   aws iam list-attached-role-policies --role-name ViberatorDeployRole
   ```

2. Ensure SSM policy is attached:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
         "Resource": "arn:aws:ssm:eu-west-1:111111111111:parameter/viberator/*"
       }
     ]
   }
   ```

3. For ECS task execution roles, ensure `AmazonECSTaskExecutionRolePolicy` is attached (includes `ssm:GetParameter`).

---

### "Wrong value in production" Error

**Symptom:** Production deployment uses dev database URL or API endpoint.

**Cause:** Using wrong environment in SSM path.

**Solution:**

1. Check workflow environment directive:
   ```yaml
   environment: prod  # Should match intended environment
   ```

2. Verify SSM path uses environment variable:
   ```yaml
   --name "/viberator/${{ env.ENVIRONMENT }}/database/url"
   # Not: --name "/viberator/dev/database/url"
   ```

3. List all production parameters:
   ```bash
   aws ssm get-parameters-by-path \
     --path "/viberator/prod" \
     --recursive \
     --with-decryption
   ```

---

### "Secrets not updating in ECS" Error

**Symptom:** Updated SSM parameter but ECS still uses old value.

**Cause:** ECS containers inject secrets at startup. Changes don't propagate to running containers.

**Solution:**

1. Force new deployment:
   ```bash
   aws ecs update-service \
     --cluster dev-viberator-cluster \
     --service dev-viberator-backend \
     --force-new-deployment
   ```

2. Or via Pulumi (recommended - already configured):
   ```typescript
   // infra/platform/components/backend-ecs.ts
   const backendService = new aws.ecs.Service(..., {
     forceNewDeployment: true,  // Always on
   });
   ```

3. Verify new task has updated secret:
   ```bash
   # Get task ID
   TASK_ARN=$(aws ecs list-tasks \
     --cluster dev-viberator-cluster \
     --service dev-viberator-backend \
     --query 'taskArns[0]' \
     --output text)

   # Describe task (shows secret ARNs)
   aws ecs describe-tasks \
     --cluster dev-viberator-cluster \
     --tasks $TASK_ARN \
     --query 'tasks[0].overrides'
   ```

---

### "OIDC role trust mismatch" Error

**Symptom:**
```
Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

**Cause:** IAM role trust relationship doesn't match GitHub repository.

**Solution:**

1. Check trust relationship:
   ```bash
   aws iam get-role --role-name ViberatorDeployRole --query Role.AssumeRolePolicyDocument
   ```

2. Verify condition matches your repo:
   ```json
   "StringLike": {
     "token.actions.githubusercontent.com:sub": "repo:your-username/viberator:*"
   }
   ```

3. Update trust relationship if needed:
   ```bash
   aws iam update-assume-role-policy \
     --role-name ViberatorDeployRole \
     --policy-document file://trust-policy.json
   ```

---

### "Amplify deployment fails" Error

**Symptom:** Frontend deployment fails with "App not found" or "Invalid branch".

**Cause:** Wrong Amplify app ID or branch name for environment.

**Solution:**

1. Verify Amplify app ID in SSM:
   ```bash
   aws ssm get-parameter \
     --name "/viberator/dev/amplify/appId" \
     --query Parameter.Value \
     --output text
   ```

2. Check app exists in Amplify Console:
   - **Amplify** → **App** → Verify app ID matches

3. Verify branch name:
   ```bash
   aws ssm get-parameter \
     --name "/viberator/dev/amplify/branch" \
     --query Parameter.Value \
     --output text
   ```

4. Check branch exists in Amplify:
   - **Amplify** → **App** → **Branches** tab

---

## Security Best Practices

### 1. Use SecureString for Sensitive Values

**DO:**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/database/url" \
  --value "postgresql://..." \
  --type "SecureString" \
  --key-id "alias/viberator-dev-ssm"
```

**DON'T:**
```bash
aws ssm put-parameter \
  --name "/viberator/dev/database/url" \
  --value "postgresql://..." \
  --type "String"  # Wrong - unencrypted
```

### 2. Use KMS Customer-Managed Keys

**DO:**
```bash
# Create KMS key with rotation
aws kms create-key \
  --description "Viberator Dev SSM encryption" \
  --origin AWS_KMS \
  --key-usage ENCRYPT_DECRYPT

# Enable annual rotation
aws kms enable-key-rotation --key-id <key-id>

# Create alias for easy reference
aws kms create-alias \
  --alias-name alias/viberator-dev-ssm \
  --target-key-id <key-id>
```

**DON'T:**
- Use AWS default KMS key (`alias/aws/ssm`) - no audit trail, can't rotate
- Hardcode KMS key ARN in multiple places - use alias instead

### 3. Never Log Secret Values

**DO:**
```yaml
# GitHub Actions - echo secrets with secret masking
- name: Use secret
  run: |
    echo "Using database at ${{ secrets.DATABASE_URL_HOST }}"  # Only host, not full URL
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}  # GitHub auto-masks in logs
```

**DON'T:**
```yaml
- name: Debug secret
  run: |
    echo "Database URL is $DATABASE_URL"  # Leaks secret in logs
```

### 4. Separate Deployment and Runtime Secrets

**Deployment secrets (SSM):**
- Database URLs
- OIDC role ARNs
- ECR repository names
- Amplify app IDs

**Runtime tenant credentials (Phase 1):**
- GitHub PATs
- Jira API tokens
- Webhook secrets
- OAuth client secrets

**Why:** Deployment secrets are infrastructure-level. Runtime credentials are tenant-specific and change frequently.

### 5. Use GitHub Environment Secrets, Not Repository Secrets

**DO:**
```yaml
jobs:
  deploy:
    environment: dev  # Loads dev-specific secrets
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}  # From dev environment
```

**DON'T:**
```yaml
jobs:
  deploy:
    # No environment directive - uses repository secrets (shared across all environments)
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}  # Same role for dev and prod
```

### 6. Rotate OIDC Role Permissions

OIDC eliminates credential rotation for access keys, but role permissions should be reviewed:

- **Quarterly:** Audit role permissions (remove unused actions)
- **After incident:** Immediately revoke compromised role permissions
- **Trust relationship:** Review `StringLike` conditions (should match exact repo)

### 7. Use Least Privilege for SSM Access

**DO:**
```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": [
    "arn:aws:ssm:eu-west-1:111111111111:parameter/viberator/dev/database/*",
    "arn:aws:ssm:eu-west-1:111111111111:parameter/viberator/dev/frontend/*"
  ]
}
```

**DON'T:**
```json
{
  "Effect": "Allow",
  "Action": ["ssm:*"],  # Too broad - can create/delete parameters
  "Resource": "*"  # Too broad - all parameters across all accounts
}
```

---

## Cross-References

- **[Phase 1: Multi-Tenant Security Foundation](../.planning/phases/01-multi-tenant-security-foundation/01-04-SUMMARY.md)** - Runtime tenant credential management (GitHub PATs, Jira tokens)
- **[GitHub Deployment Quick Reference](../.github/DEPLOYMENT.md)** - Deployment commands and workflow usage
- **[Infrastructure README](../infra/README.md)** - Pulumi component documentation
- **[AWS ECS Setup Guide](AWS_ECS_SETUP.md)** - Backend deployment infrastructure
- **[Local Docker Setup](LOCAL_DOCKER_SETUP.md)** - Local development environment

---

## Quick Reference

**Common SSM paths:**
```bash
/viberator/{env}/database/url          # Database connection string
/viberator/{env}/database/host         # Database endpoint
/viberator/{env}/frontend/apiUrl       # Backend API URL for frontend
/viberator/{env}/amplify/appId         # Amplify app ID
/viberator/{env}/amplify/branch        # Amplify branch name
/viberator/{env}/ecs/cluster           # ECS cluster name
/viberator/{env}/ecs/service           # ECS service name
/viberator/{env}/deployment/region     # AWS region
/viberator/{env}/deployment/oidcRoleArn # GitHub Actions OIDC role
/viberator/{env}/deployment/ecrRepository # ECR repository name
```

**GitHub environment secrets:**
```bash
AWS_ROLE_ARN    # OIDC role for GitHub Actions authentication
AMPLIFY_APP_ID  # Amplify app ID for frontend deployment
AMPLIFY_BRANCH  # Branch to deploy (optional, defaults to environment name)
```

**Useful CLI commands:**
```bash
# List all parameters for environment
aws ssm get-parameters-by-path --path "/viberator/dev" --recursive

# Get specific parameter (decrypted)
aws ssm get-parameter --name "/viberator/dev/database/url" --with-decryption

# Update parameter
aws ssm put-parameter --name "/viberator/dev/database/url" --value "new-url" --overwrite

# Delete parameter
aws ssm delete-parameter --name "/viberator/dev/database/url"
```
