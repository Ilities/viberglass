# Deployment Secrets

Infrastructure-level secrets for the AWS deployment and CI/CD. Distinct from workspace secrets (model keys, GitHub tokens, Jira tokens), which admins manage under Settings → Secrets. Workspace secrets stored in SSM rather than the database live under `/viberator/secrets/` (the backend's `SECRETS_SSM_PREFIX`).

## SSM Parameter Paths

```
/viberglass/{env}/database/username                        # String — DB master user
/viberglass/{env}/database/password                        # SecureString — generated DB password
/viberglass/{env}/database/url                             # SecureString — DB connection string
/viberglass/{env}/database/host                            # String — DB endpoint
/viberglass/{env}/backend/secrets-encryption-key           # SecureString — generated, encrypts database secrets
/viberglass/{env}/backend/webhook-secret-encryption-key    # SecureString — generated, encrypts webhook secrets
/viberglass/{env}/frontend/apiUrl                          # String — backend URL for frontend, ends in /api
/viberglass/{env}/amplify/appId                            # String — Amplify app ID
/viberglass/{env}/amplify/branchName                       # String — Amplify branch
/viberglass/{env}/amplify/region                           # String — Amplify region
/viberglass/{env}/ecs/cluster                              # String — backend ECS cluster name
/viberglass/{env}/ecs/service                              # String — backend ECS service name
/viberglass/{env}/deployment/region                        # String — AWS region
/viberglass/{env}/deployment/oidcRoleArn                   # SecureString — from the stack's oidcRoleArn config, else "not-configured"
/viberglass/{env}/deployment/ecrRepository                 # String — backend ECR repo name
```

Parameters are created by `pulumi up` on the platform stack (`infra/platform`). Environments: `dev`, `prod`. SecureStrings are encrypted with the base stack's KMS key, `alias/viberglass-{env}-ssm`.

The backend ECS task reads `DATABASE_URL`, `SECRETS_ENCRYPTION_KEY` and `WEBHOOK_SECRET_ENCRYPTION_KEY` from these parameters. Rotating `secrets-encryption-key` makes secrets already stored in the database unreadable.

## GitHub Secrets and Variables

| Name | Kind | Used by | Source |
|------|------|---------|--------|
| `AWS_ROLE_ARN` | Secret, per environment (`dev`, `prod`) and at repository level for `pulumi-preview` | Deploy and Pulumi workflows | The role described in [operations/github-actions-role.md](operations/github-actions-role.md) |
| `PULUMI_CONFIG_PASSPHRASE` | Secret | Pulumi workflows | The passphrase the stacks were created with |
| `PULUMI_PLATFORM_CONFIG_DEV` | Secret | `pulumi-deploy-dev`, `pulumi-preview` | Contents of `infra/platform/Pulumi.dev.yaml` (not committed) |
| `PULUMI_PLATFORM_CONFIG_PROD` | Secret | `pulumi-deploy-prod` | Contents of `infra/platform/Pulumi.prod.yaml` (not committed) |
| `PULUMI_BACKEND_URL` | Variable, optional | Pulumi workflows | State backend; defaults to `s3://viberglass-pulumi-state` |
| `NPM_TOKEN` | Secret | `publish-cli` | npm access token for the `viberglass` package |

The GHCR image workflows use the built-in `GITHUB_TOKEN`. The frontend workflows read the Amplify app ID and region from SSM, so they need no Amplify secrets.

## SSM Commands

```bash
# List all parameters for environment
aws ssm get-parameters-by-path --path "/viberglass/dev" --recursive

# Get a parameter (decrypted)
aws ssm get-parameter --name "/viberglass/dev/database/url" --with-decryption

# Create/update a parameter
aws ssm put-parameter \
  --name "/viberglass/dev/database/url" \
  --value "postgresql://..." \
  --type SecureString \
  --key-id "alias/viberglass-dev-ssm" \
  --overwrite

# Delete a parameter
aws ssm delete-parameter --name "/viberglass/dev/database/url"
```

## Troubleshooting

**ParameterNotFound** — Run `pulumi up` for the environment's platform stack.

**AccessDenied** — Attach SSM read policy to the IAM role: `ssm:GetParameter` on `arn:aws:ssm:*:*:parameter/viberglass/*`, plus `kms:Decrypt` for SecureStrings.

**ECS using stale secret** — Secrets inject at container startup. Force new deployment:
```bash
aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

The cluster and service names are in `/viberglass/{env}/ecs/cluster` and `/viberglass/{env}/ecs/service`.

**OIDC role trust mismatch** — Check trust relationship condition matches your repo:
```bash
aws iam get-role --role-name <role-name> --query Role.AssumeRolePolicyDocument
```
