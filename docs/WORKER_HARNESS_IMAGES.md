# Worker Harness Images Setup

This guide covers setting up the worker harness images used by Viberator clankers. Harness images are container images that provide specific execution environments for different types of work (e.g., multi-agent collaboration, testing, deployment).

## Overview

**What are harness images?**
- Pre-built container images with specific tooling and configurations
- Used by the platform's clanker provisioning service
- Enable different execution patterns (multi-agent, single-agent, task-specific)

**Available harness types:**
| Harness | Description | Dockerfile |
|---------|-------------|------------|
| `claude` | Standard Docker worker with Claude Code | `viberator-docker-worker.Dockerfile` |
| `multi-agent` | Multiple agents collaborating together | `viberator-worker-multi-agent.Dockerfile` |
| `qwen` | Qwen AI model worker | `viberator-worker-qwen.Dockerfile` |
| `gemini` | Google Gemini worker | `viberator-worker-gemini.Dockerfile` |
| `mistral` | Mistral AI worker | `viberator-worker-mistral.Dockerfile` |
| `codex` | OpenAI Codex worker | `viberator-worker-codex.Dockerfile` |
| `testing` | Test execution harness | `viberator-worker-testing.Dockerfile` |
| `deployment` | Deployment automation harness | `viberator-worker-deployment.Dockerfile` |

**Note:** The `ecs-worker` and `lambda-worker` images are managed by Pulumi and are NOT included in this setup.

## Quick Start (One Command)

The easiest way to set up all harness images is with the provided setup script:

```bash
# Set up all harness images for dev environment
./infra/workers/scripts/setup-harness-images.sh dev

# Set up specific harness only
./infra/workers/scripts/setup-harness-images.sh dev multi-agent

# Set up for production
./infra/workers/scripts/setup-harness-images.sh prod

# Set up with specific image tag
IMAGE_TAG=v1.0.0 ./infra/workers/scripts/setup-harness-images.sh dev
```

**What the script does:**
1. Logs into ECR
2. Creates ECR repositories (if they don't exist)
3. Builds all harness images
4. Pushes images to ECR
5. Sets up lifecycle policies (keeps last 10 images)

## Prerequisites

| Prerequisite | Check | Setup |
|--------------|-------|-------|
| **AWS CLI** | `aws --version` | `pip install awscli` |
| **AWS credentials** | `aws sts get-caller-identity` | `aws configure` |
| **Docker** | `docker --version` | Docker Desktop or Engine |
| **ECR access** | `aws ecr describe-repositories` | IAM permissions |

## Required AWS Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:CreateRepository",
        "ecr:DescribeRepositories",
        "ecr:PutLifecyclePolicy",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

## Manual Setup (If Script Fails)

If you need to manually build and push a specific image:

```bash
# 1. Login to ECR
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-1.amazonaws.com

# 2. Create ECR repository (if needed)
aws ecr create-repository --repository-name viberator-worker-multi-agent

# 3. Build the image
cd /path/to/viberglass
docker build -f infra/workers/docker/viberator-worker-multi-agent.Dockerfile \
  -t <account-id>.dkr.ecr.eu-west-1.amazonaws.com/viberator-worker-multi-agent:latest .

# 4. Push to ECR
docker push <account-id>.dkr.ecr.eu-west-1.amazonaws.com/viberator-worker-multi-agent:latest
```

## CI/CD Automation

The harness images are automatically built and pushed via GitHub Actions:

### Automatic Triggers
- Push to `main` branch with changes to:
  - `infra/workers/docker/**`
  - `apps/viberator/**`
  - `.github/workflows/deploy-worker-harness.yml`

### Manual Trigger
Go to Actions → Deploy Worker Harness Images → Run workflow

**Workflow options:**
- **environment:** `dev` or `prod`
- **harness:** `all`, `claude`, `multi-agent`, `qwen`, `gemini`, `mistral`, `codex`, `testing`, `deployment`
- **image_tag:** Custom tag (default: `latest`)

## Verification

After setup, verify images are available:

```bash
# List all ECR repositories
aws ecr describe-repositories --query 'repositories[].repositoryName' --output table

# Check specific repository
aws ecr describe-images --repository-name viberator-worker-multi-agent --query 'imageDetails[].imageTags' --output table
```

## Troubleshooting

### Image pull errors

If you see `CannotPullContainerError: ... not found`:

1. Verify the image exists in ECR:
   ```bash
   aws ecr describe-images --repository-name viberator-worker-multi-agent
   ```

2. Check the image name in the task definition matches ECR

3. Re-run the setup script for the specific harness

### Permission denied errors

If you see permission errors during push:

1. Verify your AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Re-login to ECR:
   ```bash
   aws ecr get-login-password --region eu-west-1 | \
     docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-1.amazonaws.com
   ```

### Build failures

If an image fails to build:

1. Check the Dockerfile exists:
   ```bash
   ls -la infra/workers/docker/
   ```

2. Verify you're in the repository root:
   ```bash
   pwd  # Should show .../viberglass
   ```

3. Try building manually to see detailed errors:
   ```bash
   docker build -f infra/workers/docker/viberator-worker-multi-agent.Dockerfile -t test .
   ```

## Available Scripts

| Script | Description |
|--------|-------------|
| `setup-harness-images.sh` | **Main script** - Creates repos, builds, and pushes all images |
| `build-workers.sh` | Build images locally (doesn't push) |
| `push-workers.sh` | Push already-built images to registry |
