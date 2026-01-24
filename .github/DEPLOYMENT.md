# GitHub Deployment Quick Reference

**Purpose:** Quick reference for deploying Viberator to all environments (dev, staging, prod).

For comprehensive secret management documentation, see [docs/DEPLOYMENT_SECRETS.md](../docs/DEPLOYMENT_SECRETS.md).

---

## Quick Start by Environment

| Environment | Trigger | Approval | Auto-deploy |
|-------------|---------|-----------|------------|
| **Dev** | Push to `main` branch | No | Yes (on backend/frontend changes) |
| **Staging** | Manual workflow dispatch | No | Manual only |
| **Prod** | Manual workflow dispatch | Yes | Manual only |

### Dev Deployment

**Automatic:** Push to `main` branch

```bash
# Backend deploys on these paths:
apps/platform-backend/**
packages/types/**
.github/workflows/deploy-backend-dev.yml
apps/platform-backend/Dockerfile.prod

# Frontend deploys on these paths:
apps/platform-frontend/**
packages/types/**
.github/workflows/deploy-frontend-dev.yml
```

**Manual trigger (if needed):**
```bash
gh workflow run deploy-backend-dev.yml
gh workflow run deploy-frontend-dev.yml
```

### Staging Deployment

**Manual only:**

```bash
# Backend staging
gh workflow run deploy-backend-staging.yml

# Frontend staging
gh workflow run deploy-frontend-staging.yml
```

**Monitor deployment:**
```bash
gh run list --workflow=deploy-backend-staging.yml
gh run view --log
```

### Production Deployment

**Manual with approval:**

```bash
# Backend production
gh workflow run deploy-backend-prod.yml

# Frontend production
gh workflow run deploy-frontend-prod.yml
```

**Approve in GitHub UI:**
1. Go to **Actions** tab
2. Click on the latest `deploy-backend-prod` or `deploy-frontend-prod` run
3. Click **Review deployments**
4. Approve the `prod` environment

---

## Prerequisites Checklist

Before deploying, ensure:

### GitHub Environments Created

- [ ] Go to **Settings** → **Environments**
- [ ] Create environments: `dev`, `staging`, `prod`
- [ ] For `prod`, enable **Required reviewers**

### GitHub Environment Secrets Configured

For each environment (`dev`, `staging`, `prod`):

- [ ] Go to **Settings** → **Environments** → `{environment}` → **Secrets**
- [ ] Add secrets:
  - [ ] `AWS_ROLE_ARN` - OIDC role for GitHub Actions authentication
  - [ ] `AMPLIFY_APP_ID` - Amplify app ID for frontend deployment
  - [ ] `AMPLIFY_BRANCH` - Branch name (optional, defaults to environment name)

### SSM Parameters Created via Pulumi

- [ ] Run `pulumi up` for the environment stack
- [ ] Verify parameters exist:
  ```bash
  aws ssm get-parameters-by-path --path "/viberator/dev" --recursive
  ```

### OIDC Role Configured

- [ ] IAM role exists: `ViberatorDeployRole` (or environment-specific)
- [ ] Trust relationship includes your GitHub repository
- [ ] Role has `ssm:GetParameter` permissions
- [ ] Role has ECS/ECR/Amplify permissions

---

## Secret Requirements

### GitHub Environment Secrets

| Secret | Environment | Example Value | Source |
|--------|-------------|---------------|--------|
| `AWS_ROLE_ARN` | dev/staging/prod | `arn:aws:iam::111111111111:role/ViberatorDeployRole` | IAM role creation (via Pulumi or AWS Console) |
| `AMPLIFY_APP_ID` | dev/staging/prod | `d1234567890abc` | AWS Amplify Console → App → General Settings |
| `AMPLIFY_BRANCH` | dev/staging/prod | `main` | Amplify branch listing (optional, defaults to environment name) |

**Getting AWS_ROLE_ARN:**

```bash
# From Pulumi (recommended)
pulumi stack output oidcRoleArn

# Or from AWS Console
aws iam get-role --role-name ViberatorDeployRole --query Role.Arn --output text
```

**Getting AMPLIFY_APP_ID:**

```bash
# From AWS Console
# Amplify → App → General Settings → App ARN
# Extract ID from: arn:aws:amplify:us-east-1:111111111111:apps/d1234567890abc
```

### SSM Parameters

| Parameter | Type | Example Value |
|-----------|------|---------------|
| `/viberator/{env}/database/url` | SecureString | `postgresql://user:pass@db.xxx.us-east-1.rds.amazonaws.com:5432/viberator` |
| `/viberator/{env}/database/host` | SecureString | `dev-db.xxx.us-east-1.rds.amazonaws.com` |
| `/viberator/{env}/frontend/apiUrl` | String | `https://dev-api.viberator.com` |
| `/viberator/{env}/amplify/appId` | String | `d1234567890abc` |
| `/viberator/{env}/amplify/branch` | String | `main` |
| `/viberator/{env}/ecs/cluster` | String | `dev-viberator-cluster` |
| `/viberator/{env}/ecs/service` | String | `dev-viberator-backend` |
| `/viberator/{env}/deployment/region` | String | `us-east-1` |
| `/viberator/{env}/deployment/oidcRoleArn` | SecureString | `arn:aws:iam::111111111111:role/ViberatorDeployRole` |
| `/viberator/{env}/deployment/ecrRepository` | String | `viberator-backend` |

**Verifying SSM parameters:**

```bash
# List all parameters for environment
aws ssm get-parameters-by-path \
  --path "/viberator/dev" \
  --recursive \
  --query 'Parameters[].Name' \
  --output text

# Get specific parameter (decrypted)
aws ssm get-parameter \
  --name "/viberator/dev/database/url" \
  --with-decryption \
  --query Parameter.Value \
  --output text
```

---

## Deployment Commands

### Manual Deployment Triggers

```bash
# Backend deployments
gh workflow run deploy-backend-dev.yml
gh workflow run deploy-backend-staging.yml
gh workflow run deploy-backend-prod.yml

# Frontend deployments
gh workflow run deploy-frontend-dev.yml
gh workflow run deploy-frontend-staging.yml
gh workflow run deploy-frontend-prod.yml
```

### Checking Deployment Status

```bash
# List recent runs for a workflow
gh run list --workflow=deploy-backend-prod.yml

# View latest run details
gh run list --workflow=deploy-backend-prod.yml --limit 1 --json databaseId,status,conclusion,displayTitle

# View logs for a run
gh run view --log

# Watch logs in real-time
gh run watch
```

### Canceling Deployments

```bash
# Cancel latest run
gh run cancel

# Cancel specific run
gh run cancel <run-id>
```

### Approving Production Deployments

```bash
# List pending deployments awaiting approval
gh run list --workflow=deploy-backend-prod.yml --json databaseId,status --jq '.[] | select(.status == "queued")'

# Approve via UI (recommended for security)
# Go to Actions tab → Click run → Review deployments → Approve
```

---

## Deployment Flow

### Backend Deployment Flow

1. **Build Docker image**
   - Buildx cache from GitHub Actions cache
   - Push to ECR with `sha` and `latest` tags

2. **Run database migrations**
   - Fetch `DATABASE_URL` from SSM
   - Run `npm run migrate:latest`

3. **Update ECS task definition**
   - Register new task definition with new image
   - Update ECS service with new task definition
   - Wait for service stability

4. **Verification**
   - ECS service reaches steady state
   - Health checks pass
   - Deployment summary in GitHub Actions log

### Frontend Deployment Flow

1. **Fetch Amplify configuration from SSM**
   - Get `AMPLIFY_APP_ID`
   - Get `AMPLIFY_BRANCH`
   - Get AWS region

2. **Build and deploy via Amplify CLI**
   - Start deployment job
   - Poll for completion (max 10 minutes)
   - Verify deployment status

3. **Verification**
   - Amplify deployment succeeds
   - Frontend accessible via CloudFront CDN

---

## Troubleshooting

### Workflow Fails Immediately

**Check:**
1. GitHub environment secrets are set (`AWS_ROLE_ARN`, `AMPLIFY_APP_ID`)
2. OIDC role trust relationship includes your repository
3. Run `gh auth status` to verify GitHub CLI authentication

### "ParameterNotFound" Error

**Cause:** SSM parameters don't exist.

**Solution:**
```bash
# Run Pulumi up to create parameters
pulumi stack select dev
pulumi up

# Verify parameters exist
aws ssm get-parameters-by-path --path "/viberator/dev" --recursive
```

### "AccessDenied" When Fetching SSM

**Cause:** IAM role lacks SSM permissions.

**Solution:**
```bash
# Check role permissions
aws iam get-role --role-name ViberatorDeployRole --query Role.Arn

# Verify SSM policy attached
aws iam list-attached-role-policies --role-name ViberatorDeployRole
```

### ECS Deployment Fails

**Check:**
1. ECR repository exists and is accessible
2. Docker image built successfully (check build step logs)
3. ECS task definition references correct image URI
4. Database is accessible from ECS tasks (security groups)

### Amplify Deployment Fails

**Check:**
1. Amplify app ID is correct for environment
2. Branch exists in Amplify console
3. Amplify build role has SSM permissions
4. Frontend build succeeds locally

### Deployment Stuck "In Progress"

**Check:**
```bash
# View ECS events
aws ecs describe-services \
  --cluster dev-viberator-cluster \
  --services dev-viberator-backend \
  --query 'services[0].events'

# View Amplify job status
aws amplify get-job \
  --app-id d1234567890abc \
  --branch-name main \
  --job-id <job-id>
```

---

## Full Documentation

For comprehensive documentation on:

- SSM Parameter Store setup
- GitHub environment configuration
- Pulumi integration
- Security best practices
- Detailed troubleshooting

See: **[docs/DEPLOYMENT_SECRETS.md](../docs/DEPLOYMENT_SECRETS.md)**

---

## Related Documentation

- **[Deployment Secrets Management](../docs/DEPLOYMENT_SECRETS.md)** - Complete secret setup guide
- **[Infrastructure README](../infrastructure/README.md)** - Pulumi infrastructure components
- **[AWS ECS Setup Guide](../docs/AWS_ECS_SETUP.md)** - Backend infrastructure details
- **[Local Development Guide](../docs/LOCAL_DEVELOPMENT.md)** - Local setup instructions
- **[Phase 12: Secret Management](../.planning/phases/12-secret-management/)** - Implementation details
