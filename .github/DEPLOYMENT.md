# GitHub Deployment Quick Reference

Quick reference for the GitHub Actions workflows that deploy Viberglass to AWS (dev and prod) and publish its images and packages.

For secret management in depth, see [docs/DEPLOYMENT_SECRETS.md](../docs/DEPLOYMENT_SECRETS.md).

---

## Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `backend-ci.yml`, `frontend-ci.yml` | Pull requests touching the app or its packages | Unit tests and build (frontend also lints; backend also runs a startup smoke check) |
| `deploy-backend-dev.yml` | Push to `main` (backend paths) | Builds the backend image to ECR and rolls the dev ECS service |
| `deploy-frontend-dev.yml` | Push to `main` (frontend paths) | Validates the build; Amplify builds and deploys from git |
| `deploy-backend-prod.yml` | Manual, input `confirm=YES`, `prod` environment | Same as dev, plus health and API checks after the rollout |
| `deploy-frontend-prod.yml` | Manual, `prod` environment | Validates, then waits for Amplify's deployment and checks the pages load |
| `pulumi-preview.yml` | Pull requests touching `infra/` | `pulumi preview` of the stacks |
| `pulumi-deploy-dev.yml` | Push to `main` (`infra/` paths) or manual | `pulumi up` on dev: base, workers, platform |
| `pulumi-deploy-prod.yml` | Manual, `prod` environment | `pulumi up` on prod |
| `deploy-viberators.yml` | Push to `main` (worker paths) or manual | Builds the Lambda worker image (on push) or the chosen harness images (manual, `all` for every one) and pushes them to ECR as `latest` and the commit sha |
| `publish-worker-images.yml` | Push to `main` (worker paths), releases | Worker images to GHCR, amd64 and arm64 |
| `publish-platform-images.yml` | Push to `main` (app paths), releases | `viberglass-backend` and `viberglass-frontend` images to GHCR, used by `docker-compose.prod.yml` and the Helm chart |
| `install-smoke.yml` | After `publish-platform-images` on a release, or manual with a tag | Installs the release from its published images with `docker-compose.prod.yml` (upgrading from the previous release, then stopping and starting) and with the Helm chart on kind, and runs `platformSmoke.py` with the fake agent against each |
| `publish-cli.yml` | `v*` tags or manual | Publishes the `viberglass` CLI to npm |
| `release-chrome-extension.yml` | `v*` tags | Attaches the built Chrome extension to the release |

### Dev Deployment

Automatic on push to `main`. Backend deploys on changes to:

```
apps/platform-backend/**
packages/types/**
packages/model-hosting-verda/**
apps/platform-backend/Dockerfile.prod
.github/workflows/deploy-backend-dev.yml
```

Frontend deploys on changes to:

```
apps/platform-frontend/**
packages/types/**
packages/platform-ui/**
packages/integration-core/**
packages/integrations/**
.github/workflows/deploy-frontend-dev.yml
```

Manual trigger (if needed):
```bash
gh workflow run deploy-backend-dev.yml
gh workflow run deploy-frontend-dev.yml
```

### Production Deployment

Manual, with approval:

```bash
gh workflow run deploy-backend-prod.yml -f confirm=YES
gh workflow run deploy-frontend-prod.yml -f reason="..."
gh workflow run pulumi-deploy-prod.yml -f reason="..."
```

Approve in the GitHub UI:
1. Go to the Actions tab
2. Open the waiting run
3. Click Review deployments
4. Approve the `prod` environment

---

## Prerequisites Checklist

### GitHub Environments

- [ ] Settings → Environments: create `dev` and `prod`
- [ ] For `prod`, enable Required reviewers

### GitHub Secrets

- [ ] `AWS_ROLE_ARN` in each environment (and at repository level for `pulumi-preview.yml`)
- [ ] `PULUMI_CONFIG_PASSPHRASE`, `PULUMI_PLATFORM_CONFIG_DEV`, `PULUMI_PLATFORM_CONFIG_PROD` for the Pulumi workflows
- [ ] `NPM_TOKEN` for `publish-cli.yml`

### SSM Parameters Created via Pulumi

- [ ] Run `pulumi up` for the platform stack
- [ ] Verify parameters exist:
  ```bash
  aws ssm get-parameters-by-path --path "/viberglass/dev" --recursive --query 'Parameters[].Name'
  ```

### OIDC Role

- [ ] An IAM role GitHub Actions can assume through OIDC, trusting your repository
- [ ] It can read the SSM parameters below, push to ECR, update ECS, query Amplify, and run the Pulumi stacks

The platform stack creates a role for the Amplify steps (output `amplifyOidcRoleArn`), but it only allows the Amplify calls and `ssm:GetParameter`. The backend, worker and Pulumi workflows need a role with more; [docs/operations/github-actions-role.md](../docs/operations/github-actions-role.md) has the policy.

### Artifact Preview Host (optional)

HTML, image and PDF artifacts preview from a host of their own, so the agent's scripts never run where the app's cookies go. Without one, those artifacts can only be downloaded.

- [ ] Set `viberglass:previewDomain` in the platform stack to a hostname in the Route 53 zone that isn't the API's or the app's, e.g. `preview.viberglass.io`
- [ ] Run `pulumi up` in `infra/base` first: it opens the backend's preview port, 8890, to the load balancer
- [ ] Run `pulumi up` in `infra/platform`: it creates the certificate, DNS alias, listener rule and target group, and a backend task definition with `PREVIEW_PORT`, `PREVIEW_PUBLIC_URL` and the port mapping
- [ ] Run the backend deploy workflow, so the service runs that task definition; if the platform `pulumi up` stopped at the ECS service because its task definition had no port 8890, run it again now
- [ ] Check `pulumi stack output previewUrl`, and that `curl -s -o /dev/null -w '%{http_code}' <previewUrl>/` answers `404` (the preview host serves only signed links)

---

## Secret Requirements

### GitHub Secrets

| Secret | Scope | Example Value | Source |
|--------|-------|---------------|--------|
| `AWS_ROLE_ARN` | `dev`/`prod` environments, repository | `arn:aws:iam::111111111111:role/ViberglassDeployRole` | The OIDC role above |
| `PULUMI_CONFIG_PASSPHRASE` | repository | the stacks' passphrase | The passphrase the stacks were created with (`encryptionsalt` in `Pulumi.<stack>.yaml`) |
| `PULUMI_PLATFORM_CONFIG_DEV`, `PULUMI_PLATFORM_CONFIG_PROD` | repository | contents of `infra/platform/Pulumi.<stack>.yaml` | The platform stack's config, which isn't committed |
| `NPM_TOKEN` | repository | npm automation token | npmjs.com |

The Pulumi workflows (`pulumi-preview.yml`, `pulumi-deploy-dev.yml`, `pulumi-deploy-prod.yml`) use the S3 state backend, `s3://viberglass-pulumi-state` unless the repository variable `PULUMI_BACKEND_URL` names another.

### SSM Parameters

Written by the platform stack and read by the deploy workflows.

| Parameter | Type |
|-----------|------|
| `/viberglass/{env}/database/url` | SecureString |
| `/viberglass/{env}/database/host` | String |
| `/viberglass/{env}/database/username` | String |
| `/viberglass/{env}/database/password` | SecureString |
| `/viberglass/{env}/frontend/apiUrl` | String |
| `/viberglass/{env}/amplify/appId` | String |
| `/viberglass/{env}/amplify/branchName` | String |
| `/viberglass/{env}/amplify/region` | String |
| `/viberglass/{env}/ecs/cluster` | String |
| `/viberglass/{env}/ecs/service` | String |
| `/viberglass/{env}/deployment/region` | String |
| `/viberglass/{env}/deployment/oidcRoleArn` | SecureString |
| `/viberglass/{env}/deployment/ecrRepository` | String |

Verifying SSM parameters:

```bash
# List all parameters for environment
aws ssm get-parameters-by-path \
  --path "/viberglass/dev" \
  --recursive \
  --query 'Parameters[].Name' \
  --output text

# Get specific parameter (decrypted)
aws ssm get-parameter \
  --name "/viberglass/dev/database/url" \
  --with-decryption \
  --query Parameter.Value \
  --output text
```

---

## Checking Deployment Status

```bash
# List recent runs for a workflow
gh run list --workflow=deploy-backend-prod.yml

# View logs for a run
gh run view --log

# Watch logs in real-time
gh run watch

# Cancel a run
gh run cancel <run-id>
```

---

## Deployment Flow

### Backend

1. Build the Docker image (`apps/platform-backend/Dockerfile.prod`) with the GitHub Actions cache and push it to ECR with `sha` and `latest` tags
2. Register a new task definition with the new image, copied from the latest revision, so settings Pulumi added there (such as the preview port) ship with it
3. Update the ECS service and wait for it to stabilize
4. Prod only: check `/health` and a few API endpoints, and the running task count

Migrations run when the new backend starts (`RUN_MIGRATIONS_ON_STARTUP=true` in the task definition).

### Frontend

Amplify builds and deploys the frontend from git (`amplify.yml`). The workflows build it once as validation; the prod one also waits for Amplify's job and checks the deployed pages.

---

## Troubleshooting

### Workflow fails immediately

1. `AWS_ROLE_ARN` is set for the environment
2. The OIDC role's trust relationship includes your repository
3. For Pulumi workflows, `PULUMI_CONFIG_PASSPHRASE` and the platform config secret are set

### "ParameterNotFound"

The SSM parameters don't exist yet. Run `pulumi up` in `infra/platform` for that stack and check again with `aws ssm get-parameters-by-path --path "/viberglass/dev" --recursive`.

### ECS deployment fails

1. ECR repository exists and is accessible
2. Docker image built successfully (check build step logs)
3. Database is reachable from the ECS tasks (security groups)
4. The backend logs, in `/ecs/viberglass-{env}-backend`

### Deployment stuck "In Progress"

```bash
aws ecs describe-services \
  --cluster "$(aws ssm get-parameter --name /viberglass/dev/ecs/cluster --query Parameter.Value --output text)" \
  --services dev-viberglass-backend \
  --query 'services[0].events'
```

---

## Related Documentation

- [Deployment Secrets Management](../docs/DEPLOYMENT_SECRETS.md)
- [Infrastructure README](../infra/README.md)
- [AWS install guide](../docs/guide/admin/install-aws.md)
- [Local development](../docs/local-development.md)
