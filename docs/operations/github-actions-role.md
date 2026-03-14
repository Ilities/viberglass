# GitHub Actions IAM role

The `deploy-viberators` workflow authenticates to AWS via OIDC (no long-lived credentials). The role it assumes needs the following policy attached.

Replace `<ACCOUNT_ID>` with your AWS account ID and `<REGION>` with the region where your infrastructure is deployed (e.g. `eu-west-1`).

## Policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ReadDeploymentParams",
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameter"
            ],
            "Resource": [
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/deployment/*",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/ecs/*",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/database/url",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/frontend/apiUrl",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/amplify/appId",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/amplify/branchName",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/amplify/region",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/prod/deployment/*",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/prod/ecs/*",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/prod/database/url",
                "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/prod/frontend/apiUrl"
            ]
        },
        {
            "Sid": "DecryptSecureStrings",
            "Effect": "Allow",
            "Action": [
                "kms:Decrypt"
            ],
            "Resource": "arn:aws:kms:<REGION>:<ACCOUNT_ID>:key/*",
            "Condition": {
                "StringEquals": {
                    "kms:ViaService": "ssm.<REGION>.amazonaws.com"
                },
                "StringLike": {
                    "kms:EncryptionContext:PARAMETER_ARN": [
                        "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/dev/*",
                        "arn:aws:ssm:<REGION>:<ACCOUNT_ID>:parameter/viberglass/prod/*"
                    ]
                }
            }
        },
        {
            "Sid": "ECRLogin",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken"
            ],
            "Resource": "*"
        },
        {
            "Sid": "ECRPushPull",
            "Effect": "Allow",
            "Action": [
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:CompleteLayerUpload",
                "ecr:DescribeImages",
                "ecr:DescribeRepositories",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:PutImage",
                "ecr:UploadLayerPart"
            ],
            "Resource": [
                "arn:aws:ecr:*:<ACCOUNT_ID>:repository/dev-viberglass-repo",
                "arn:aws:ecr:*:<ACCOUNT_ID>:repository/prod-viberglass-repo",
                "arn:aws:ecr:*:<ACCOUNT_ID>:repository/viberator-base-worker",
                "arn:aws:ecr:*:<ACCOUNT_ID>:repository/viberator-worker-*",
                "arn:aws:ecr:*:<ACCOUNT_ID>:repository/viberator-lambda-worker"
            ]
        },
        {
            "Sid": "ECRCreateRepository",
            "Effect": "Allow",
            "Action": [
                "ecr:CreateRepository",
                "ecr:PutLifecyclePolicy"
            ],
            "Resource": "arn:aws:ecr:*:<ACCOUNT_ID>:repository/viberator-worker*"
        },
        {
            "Sid": "ECSDeploy",
            "Effect": "Allow",
            "Action": [
                "ecs:DescribeTaskDefinition",
                "ecs:RegisterTaskDefinition",
                "ecs:UpdateService",
                "ecs:DescribeServices",
                "ecs:ListTasks",
                "ecs:DescribeTasks"
            ],
            "Resource": "*"
        },
        {
            "Sid": "PassECSRoles",
            "Effect": "Allow",
            "Action": [
                "iam:PassRole"
            ],
            "Resource": [
                "arn:aws:iam::<ACCOUNT_ID>:role/dev-viberglass-backend-task-exec-role",
                "arn:aws:iam::<ACCOUNT_ID>:role/dev-viberglass-backend-task-role",
                "arn:aws:iam::<ACCOUNT_ID>:role/prod-viberglass-backend-task-exec-role",
                "arn:aws:iam::<ACCOUNT_ID>:role/prod-viberglass-backend-task-role"
            ],
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": "ecs-tasks.amazonaws.com"
                }
            }
        },
        {
            "Sid": "AmplifyDeploy",
            "Effect": "Allow",
            "Action": [
                "amplify:StartDeployment",
                "amplify:GetApp"
            ],
            "Resource": "arn:aws:amplify:<REGION>:<ACCOUNT_ID>:apps/*"
        }
    ]
}
```

## What each statement does

| Sid                    | Purpose                                                                                                                                                                               |
|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ReadDeploymentParams` | Reads SSM parameters the workflow needs: DB URL, ECS cluster name, Amplify app ID, etc. Scoped to `viberglass/dev/*` and `viberglass/prod/*` paths.                                   |
| `DecryptSecureStrings` | Allows KMS decryption of SSM SecureString parameters, but only when the request comes from SSM and only for the viberglass parameter paths.                                           |
| `ECRLogin`             | Gets a temporary ECR auth token. Required before any push or pull.                                                                                                                    |
| `ECRPushPull`          | Push and pull access for the specific repositories the workflow writes to: the platform repos, the base worker image, all `viberator-worker-*` harness images, and the lambda worker. |
| `ECRCreateRepository`  | Lets the `setup-harness-images.sh` script create new ECR repositories on first push (also sets lifecycle policy). Scoped to `viberator-worker*` repos only.                           |
| `ECSDeploy`            | Registers new ECS task definitions and updates services during platform deploys. Uses `*` resource because `RegisterTaskDefinition` doesn't support resource-level restrictions.      |
| `PassECSRoles`         | Allows the workflow to pass the backend task execution and task roles when registering task definitions. Restricted to `ecs-tasks.amazonaws.com` as the receiving service.            |
| `AmplifyDeploy`        | Triggers frontend deployments via Amplify.                                                                                                                                            |

## Trust policy

The role's trust policy allows GitHub Actions to assume it via OIDC. Note the two `sub` entries — GitHub's OIDC token uses the exact casing of the organization name from the repo URL, so listing both cases avoids auth failures if the org name appears inconsistently.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": [
                        "repo:<YOUR_GITHUB_ORG>/<YOUR_REPO>:*",
                        "repo:<your_github_org>/<your_repo>:*"
                    ]
                }
            }
        }
    ]
}
```

The OIDC provider (`token.actions.githubusercontent.com`) must exist in your AWS account before this trust policy will work. Create it once per account via IAM → Identity providers → Add provider.
