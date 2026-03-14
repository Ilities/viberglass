# Deployment Secrets

Infrastructure-level secrets for CI/CD. Distinct from runtime tenant credentials (GitHub PATs, Jira tokens).

## SSM Parameter Paths

```
/viberator/{env}/database/url          # SecureString — DB connection string
/viberator/{env}/database/host         # SecureString — DB endpoint
/viberator/{env}/frontend/apiUrl       # String — backend URL for frontend
/viberator/{env}/amplify/appId         # String — Amplify app ID
/viberator/{env}/amplify/branchName    # String — Amplify branch
/viberator/{env}/ecs/cluster           # String — ECS cluster name
/viberator/{env}/deployment/region     # String — AWS region
/viberator/{env}/deployment/oidcRoleArn # SecureString — GitHub Actions OIDC role
/viberator/{env}/deployment/ecrRepository # String — ECR repo name
```

Parameters are created by `pulumi up`. Environments: `dev`, `staging`, `prod`.

## GitHub Environment Secrets

For each environment (`dev`, `staging`, `prod`) in **Settings → Environments → Secrets**:

| Secret | Source |
|--------|--------|
| `AWS_ROLE_ARN` | `pulumi stack output oidcRoleArn` |
| `AMPLIFY_APP_ID` | AWS Amplify Console → App settings |
| `AMPLIFY_BRANCH` | Amplify Console → Branches |

## SSM Commands

```bash
# List all parameters for environment
aws ssm get-parameters-by-path --path "/viberator/dev" --recursive

# Get a parameter (decrypted)
aws ssm get-parameter --name "/viberator/dev/database/url" --with-decryption

# Create/update a parameter
aws ssm put-parameter \
  --name "/viberator/dev/database/url" \
  --value "postgresql://..." \
  --type SecureString \
  --key-id "alias/viberator-dev-ssm" \
  --overwrite

# Delete a parameter
aws ssm delete-parameter --name "/viberator/dev/database/url"
```

## Troubleshooting

**ParameterNotFound** — Run `pulumi up` for the environment stack.

**AccessDenied** — Attach SSM read policy to the IAM role: `ssm:GetParameter` on `arn:aws:ssm:*:*:parameter/viberator/*`.

**ECS using stale secret** — Secrets inject at container startup. Force new deployment:
```bash
aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

**OIDC role trust mismatch** — Check trust relationship condition matches your repo:
```bash
aws iam get-role --role-name ViberatorDeployRole --query Role.AssumeRolePolicyDocument
```
