# Phase 11: Deployment Process - Research

**Researched:** 2026-01-22
**Domain:** CI/CD, AWS deployment, Pulumi automation
**Confidence:** HIGH

## Summary

This phase requires implementing a CI/CD pipeline for a monorepo with npm workspaces deploying to AWS infrastructure managed by Pulumi. The project consists of:
- `@viberator/platform-backend` (Express API) deployed to ECS Fargate
- `@viberator/frontend` (Next.js 15) deployed to S3 + CloudFront
- Infrastructure as Code using Pulumi with three stacks (dev, staging, prod)
- Database migrations using Kysely with PostgreSQL on RDS

**Primary recommendation:** Use GitHub Actions with OIDC authentication for AWS, following the official Pulumi GitHub Actions workflow patterns. The monorepo structure requires path-based filtering to build only changed components.

## Standard Stack

### Core CI/CD Platform

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions | Latest | CI/CD orchestration | Native GitHub integration, OIDC support, free tier adequate |
| pulumi/actions | v6 | Pulumi CLI in CI | Official Pulumi action, supports preview/up workflows |
| aws-actions/configure-aws-credentials | v4 | AWS OIDC auth | Official AWS action, eliminates long-lived credentials |

### AWS Deployment Actions

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| aws-actions/amazon-ecr-login | Latest | ECR authentication | Official AWS action for container registry |
| aws-actions/amazon-ecs-deploy-task-definition | Latest | ECS deployment | Official AWS action, handles task definition updates |
| jakejarvis/s3-sync-action | v1 | S3 sync | Community standard for static site deployment |

### Build Tools

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| docker/build-push-action | v6 | Docker build and push | Official GitHub action, supports cache |
| docker/setup-buildx-action | v3 | BuildKit setup | Required for layer caching |
| docker/setup-qemu-action | v3 | Multi-platform support | Needed for amd64/arm64 builds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions | GitLab CI | Better if using GitLab, but project is on GitHub |
| GitHub Actions OIDC | Long-lived AWS keys | OIDC is more secure; avoid keys |
| Pulumi Cloud | Self-hosted Pulumi | Self-hosted requires Business Critical edition (~$500+/month) |
| aws-actions ECS deploy | ECS CodeDeploy | CodeDeploy adds complexity; deploy-action sufficient |

## Architecture Patterns

### Recommended Workflow Structure

```
.github/
└── workflows/
    ├── pr-preview.yml          # pulumi preview on PRs
    ├── deploy-dev.yml          # auto-deploy on push to main (dev)
    ├── deploy-staging.yml      # manual deploy to staging
    ├── deploy-prod.yml         # manual deploy to prod with approval
    ├── backend-ci.yml          # backend tests and lint
    └── frontend-ci.yml         # frontend tests and lint
```

### Pattern 1: Monorepo Path Filtering

**What:** Use `paths` filter to run jobs only when relevant files change

**When to use:** All workflows in a monorepo

**Example:**
```yaml
on:
  pull_request:
    paths:
      - 'platform/backend/**'
      - 'packages/types/**'
      - 'infrastructure/**'
      - '.github/workflows/backend-ci.yml'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test --workspace=@viberator/platform-backend
```

### Pattern 2: Pulumi Preview on PR

**What:** Run `pulumi preview` and comment results on the PR

**When to use:** All infrastructure changes

**Example:**
```yaml
name: Pulumi Preview
on:
  pull_request:
    paths:
      - 'infrastructure/**'

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: package.json
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
      - run: npm install
        working-directory: infrastructure
      - uses: pulumi/actions@v6
        with:
          command: preview
          stack-name: dev
          work-dir: infrastructure
          comment-on-pr: true
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### Pattern 3: ECS Deployment with Image Update

**What:** Build Docker image, push to ECR, update ECS task definition

**When to use:** Backend/worker deployments

**Example:**
```yaml
name: Deploy Backend
on:
  push:
    branches: [main]
    paths: ['platform/backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: platform/backend/Dockerfile
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/viberator-backend:${{ github.sha }}
            ${{ steps.login-ecr.outputs.registry }}/viberator-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Update ECS service
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: .aws/backend-task-definition.json
          service: viberator-backend
          cluster: viberator-cluster
          image: ${{ steps.login-ecr.outputs.registry }}/viberator-backend:${{ github.sha }}
          wait-for-service-stability: true
```

### Pattern 4: Frontend S3 + CloudFront Deployment

**What:** Build Next.js static export, sync to S3, invalidate CloudFront

**When to use:** Frontend deployments

**Example:**
```yaml
name: Deploy Frontend
on:
  push:
    branches: [main]
    paths: ['platform/frontend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: package.json
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Build frontend
        run: npm run build --workspace=@viberator/frontend
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Sync to S3
        run: |
          aws s3 sync platform/frontend/.next/static s3://${{ env.BUCKET_NAME }}/_next/static \
            --delete --cache-control "public, max-age=31536000, immutable"
          aws s3 sync platform/frontend/out s3://${{ env.BUCKET_NAME }} \
            --delete --cache-control "public, max-age=86400"

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ env.DISTRIBUTION_ID }} \
            --paths "/*"
```

### Anti-Patterns to Avoid

- **Don't use `aws-access-key-id` and `aws-secret-access-key`:** Use OIDC instead
- **Don't deploy to all environments on every push:** Use path filters and environment-specific triggers
- **Don't invalidate CloudFront with `/*` on every build:** Use smart invalidation for changed files only
- **Don't run migrations outside the deployment:** Include migration step in deployment workflow
- **Don't skip `wait-for-service-stability`:** Always wait for ECS to stabilize before marking deployment successful

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AWS OIDC authentication | Custom JWT handling | `aws-actions/configure-aws-credentials@v4` | AWS-managed, handles token exchange |
| ECS deployment updates | Custom boto3 scripts | `aws-actions/amazon-ecs-deploy-task-definition` | Handles task definition registration and service updates |
| S3 sync with CloudFront invalidation | Custom aws CLI wrappers | `jakejarvis/s3-sync-action` + built-in invalidation | Community-tested, handles edge cases |
| Docker layer caching | Custom cache logic | `docker/build-push-action@v6` with cache args | BuildKit-native, faster |
| Pulumi state management | Custom state storage | Pulumi Cloud or self-hosted | Handles locking, history, secrets |
| Secret management | GitHub Secrets only | Pulumi ESC (optional) | Hierarchical, environment-specific |

## Common Pitfalls

### Pitfall 1: Building All Workspace Packages

**What goes wrong:** CI runs `npm install` and builds all packages even when only one file changed

**Why it happens:** Missing path filters or running root npm scripts without workspace targeting

**How to avoid:**
```yaml
# Use paths filter at workflow level
on:
  push:
    paths:
      - 'platform/backend/**'
      - 'packages/types/**'

# Or use workspace-specific commands
- run: npm run build --workspace=@viberator/platform-backend
```

**Warning signs:** Workflow runs >10 minutes for a single file change

### Pitfall 2: Missing Database Migrations

**What goes wrong:** New code deploys but database schema is not updated, causing runtime errors

**Why it happens:** Migration step omitted from deployment workflow

**How to avoid:** Add migration step before ECS service update:
```yaml
- name: Run database migrations
  run: |
    aws ssm get-parameter --name /viberator/${{ env.ENVIRONMENT }}/database/url \
      --with-decryption --query Parameter.Value --output text > db_url.txt
    export DATABASE_URL=$(cat db_url.txt)
    npm run migrate:latest --workspace=@viberator/platform-backend
```

**Warning signs:** Application logs show "relation does not exist" or "column does not exist"

### Pitfall 3: CloudFront Serving Stale Content

**What goes wrong:** Users see old frontend after deployment

**Why it happens:** S3 sync succeeded but CloudFront cache was not invalidated

**How to avoid:** Always include invalidation step:
```yaml
- name: Invalidate CloudFront
  run: |
    aws cloudfront create-invalidation \
      --distribution-id ${{ env.DISTRIBUTION_ID }} \
      --paths "/index.html" "/_next/*"
```

**Warning signs:** Users report seeing old UI features

### Pitfall 4: ECS Deployment Failing Health Checks

**What goes wrong:** ECS marks deployment as failed but logs are unclear

**Why it happens:** Health check timeout shorter than application startup time

**How to avoid:** Ensure health check `startPeriod` exceeds application startup:
```typescript
healthCheck: {
  command: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
  interval: 30,
  timeout: 5,
  retries: 3,
  startPeriod: 60, // Must be >= application startup time
}
```

**Warning signs:** ECS tasks constantly restarting

### Pitfall 5: Pulumi State Conflicts

**What goes wrong:** Multiple workflows try to update the same stack simultaneously

**Why it happens:** Missing concurrency controls

**How to avoid:** Use Pulumi's built-in locking or GitHub Actions concurrency:
```yaml
concurrency:
  group: pulumi-${{ github.ref }}
  cancel-in-progress: false
```

**Warning signs:** "another update is currently in progress" errors

## Code Examples

### AWS OIDC Authentication Pattern

```yaml
# Source: https://docs.github.com/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services

permissions:
  id-token: write   # Required for OIDC
  contents: read    # Required for checkout

- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActions-Viberator
    aws-region: us-east-1
```

### IAM Trust Policy for OIDC

```json
// Source: https://docs.github.com/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/viberator:*"
        },
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

### Monorepo Docker Build with Workspace Dependencies

```dockerfile
# Source: Based on existing backend/Dockerfile.dev pattern
# Production Dockerfile for monorepo workspace

FROM node:20-alpine AS build
WORKDIR /app

# Copy workspace files first
COPY package*.json ./
COPY packages/types/package.json ./packages/types/
COPY platform/backend/package.json ./platform/backend/

# Install all workspace dependencies
RUN npm ci --legacy-peer-deps

# Copy source files
COPY packages/types ./packages/types
COPY platform/backend ./platform/backend

# Build TypeScript
RUN npm run build --workspace=@viberator/types
RUN npm run build --workspace=@viberator/platform-backend

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/platform/backend ./dist
COPY --from=build /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/api/server.js"]
```

### Database Migration in CI/CD

```yaml
# Source: Based on existing migrations/migrator.ts pattern
- name: Run database migrations
  env:
    DB_HOST: ${{ steps.rds.outputs.endpoint }}
    DB_NAME: viberator_${{ env.ENVIRONMENT }}
    DB_USER: ${{ steps.ssm.outputs.db_user }}
    DB_PASSWORD: ${{ steps.ssm.outputs.db_password }}
  run: |
    npm run migrate:latest --workspace=@viberator/platform-backend
```

### Pulumi Stack Selection by Environment

```yaml
# Source: https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/

- name: Select Pulumi stack
  run: |
    if [ "${{ github.ref }}" == "refs/heads/main" ]; then
      pulumi stack select dev
    elif [ "${{ github.ref }}" == "refs/heads/staging" ]; then
      pulumi stack select staging
    elif [ "${{ github.ref }}" == "refs/heads/production" ]; then
      pulumi stack select prod
    fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS Access Keys | OIDC authentication | 2022-2023 | No more long-lived credentials, automatic rotation |
| Pulumi Action v1 | Pulumi Action v6 | 2021 | Native execution, explicit dependency installation |
| Blue/Green via CodeDeploy | ECS native blue/green | July 2025 | Built-in lifecycle hooks, simpler configuration |
| Global cache API | GitHub Cache v2 only | April 2025 | v1 deprecated, must use v2 |

**Deprecated/outdated:**
- **Pulumi GitHub Action v1:** EOL August 2021, must use v6
- **GitHub Cache API v1:** Support ends April 15, 2025
- **`aws-actions/configure-aws-credentials` with keys:** Use OIDC instead

## Open Questions

1. **Pulumi Backend Choice**
   - What we know: Project currently uses Pulumi (likely Pulumi Cloud based on `PULUMI_ACCESS_TOKEN` pattern)
   - What's unclear: Whether to use Pulumi Cloud free tier or self-hosted backend
   - Recommendation: Start with Pulumi Cloud free tier; self-hosting requires Business Critical edition (~$500+/month)

2. **Production Deployment Approval**
   - What we know: Environments support approval workflows
   - What's unclear: Who should approve production deployments
   - Recommendation: Configure environment protection rules with required reviewers

3. **Rollback Strategy**
   - What we know: ECS maintains previous task definitions, CloudFront has versioned S3 objects
   - What's unclear: Automated vs manual rollback process
   - Recommendation: Implement manual rollback workflow initially; consider automated rollback on health check failure

## Sources

### Primary (HIGH confidence)

- **[Using Pulumi GitHub Actions](https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/)** - Official Pulumi documentation for CI/CD with GitHub Actions, including workflow examples and action configuration
- **[Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)** - Official GitHub documentation for OIDC authentication with AWS
- **[Deploying to Amazon Elastic Container Service](https://docs.github.com/actions/guides/deploying-to-amazon-elastic-container-service)** - Official GitHub documentation for ECS deployment workflows
- **[AWS ECS Deploy Task Definition](https://github.com/aws-actions/amazon-ecs-deploy-task-definition)** - Official AWS action for ECS deployments
- **[Configure AWS Credentials](https://github.com/aws-actions/configure-aws-credentials)** - Official AWS action for authentication with OIDC support
- **[Docker Build Cache with GitHub Actions](https://docs.docker.com/build/ci/github-actions/cache/)** - Official Docker documentation for caching strategies
- **[Deployments and Rollbacks Using ECS](https://www.aviator.co/blog/deployments-and-rollbacks-using-ecs-and-github-actions/)** - July 2024 article on ECS deployment patterns

### Secondary (MEDIUM confidence)

- **[Pulumi ESC: Secrets Management Guide](https://www.pulumi.com/blog/secrets-management-tools-guide/)** - July 2025 Pulumi blog post on ESC capabilities
- **[Automating Docker Deployments to AWS ECS Fargate](https://aws.plainenglish.io/ci-cd-with-github-actions-automating-docker-deployments-to-aws-ecs-fargate-3b575c7bdd92)** - December 2025 guide on ECS automation
- **[ECS Native Blue/Green Deployments](https://aws.amazon.com/blogs/aws/accelerate-safe-software-releases-with-new-built-in-blue-green-deployments-in-amazon-ecs/)** - July 2025 AWS blog announcing native blue/green support
- **[Deploy Next.js to S3 and CloudFront](https://itugui.com/blog/deploy-nextjs-s3-cloudfront-github-actions)** - June 2025 tutorial for Next.js static deployment
- **[Monorepo CI/CD Best Practices](https://dev.to/pockit_tools/github-actions-in-2026-the-complete-guide-to-monorepo-cicd-and-self-hosted-runners-1jop)** - January 2026 guide on monorepo workflows
- **[Kysely Zero-Downtime Migrations](https://blog.csdn.net/gitblog_00653/article/details/153179822)** - October 2025 article on Kysely migration strategies

### Tertiary (LOW confidence)

- **[CloudFront Invalidations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html)** - AWS documentation reference
- **[Stop Using AWS Access Keys in GitHub Actions](https://dev.to/alizgheib/stop-using-aws-access-keys-in-github-actions-the-oidc-guide-you-need-4c8l)** - December 2025 best practices article

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on official documentation and current best practices (2025-2026)
- Architecture: HIGH - Verified with official GitHub, AWS, and Pulumi documentation
- Pitfalls: MEDIUM - Some patterns from community sources; should be validated during implementation

**Research date:** 2026-01-22
**Valid until:** 2026-03-22 (90 days - GitHub Actions and AWS evolve rapidly)
