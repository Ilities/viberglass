# 05 · AWS deployment

Deploys the three Pulumi stacks (base, platform, workers) to a dev environment in eu-west-1, then exercises the product on ECS and Lambda compute.

## Contents

- [Known issues](#known-issues)
- [Before you deploy (AWS-00)](#before-you-deploy-aws-00)
- [Infrastructure (AWS-01 – AWS-05)](#infrastructure-aws-01--aws-05)
- [Delivery (AWS-06 – AWS-08)](#delivery-aws-06--aws-08)
- [Product on AWS (AWS-10 – AWS-22)](#product-on-aws-aws-10--aws-22)
- [Teardown (AWS-30)](#teardown-aws-30)

## Known issues

Found in the code on 2026-10-05. Record whether each still happens.

| # | Issue | Where it shows |
|---|---|---|
| K3 | Without `apiDomain` + `appDomain` + `route53ZoneId`, the HTTPS Amplify app calls an `http://` ALB and the `secure` session cookie is cross-site: login likely fails | AWS-07 |
| K4 | Managed ECS task definitions and invoker overrides don't pass `AWS_S3_BUCKET`, so conversation state falls back to the task's `/tmp` | AWS-13 |
| K5 | `assignPublicIp` defaults to DISABLED and isn't passed from the workers stack; in `standard` network mode (no NAT) workers have no egress | AWS-12 |
| K6 | The GitHub OIDC provider and Amplify role are created per environment; dev and prod can't share an account | AWS-02 |
| K7 | Prod S3 lifecycle moves objects to Glacier/Deep Archive after 90/180 days; old media and session state become unreadable | Prod only |
| K8 | `deploy-backend-prod.yml` smoke steps read a missing SSM key and probe `/api/projects` and `/api/version` | Prod only |
| K9 | Alarms, SNS and the logging component exist but aren't wired; `enableAlarms`/`enableSpot`/autoscaling settings do nothing | AWS-03 |
| K10 | The SQS queue and worker Lambda in the workers stack are unused legacy | AWS-04 |
| K11 | Docs with stale names: `DEPLOYMENT_SECRETS.md` (`/viberator/{env}` paths), `database-migrations.md` (cluster names), the `aws logs tail` group name | Wherever you follow them |

## Before you deploy (AWS-00)

1. Tools: AWS CLI v2 signed in to the target account, Pulumi CLI, Node 24, Docker with buildx (amd64 builds).
2. A Route53 hosted zone; choose `api.dev.<domain>` and `app.dev.<domain>` under one registrable domain (K3).
3. Pulumi state: run `infra/setup-pulumi-state.sh`, then `pulumi login s3://viberglass-pulumi-state`.
4. Create `infra/platform/Pulumi.dev.yaml` from the example; set `viberglass:baseStack`, `apiDomain`, `appDomain`, `route53ZoneId`, optionally `emailDomain`/`emailFrom`, and `amplifyGithubAccessToken` (secret).
5. Create the GitHub deploy role and OIDC provider per [../../operations/github-actions-role.md](../../operations/github-actions-role.md); set `AWS_ROLE_ARN` in the GitHub `dev` environment.

Expect: `pulumi whoami` shows the S3 backend; stack config files ready.

## Infrastructure (AWS-01 – AWS-05)

### AWS-01 · Base stack
1. `cd infra/base && npm install && pulumi stack select dev && pulumi up`.

Expect: VPC with 2 public + 2 private subnets, NAT (enterprise mode), security groups, KMS alias `alias/viberglass-dev-ssm`, log groups `/ecs/viberglass-dev-backend`, `/ecs/viberglass-dev-worker`.

### AWS-02 · Platform stack (first pass)
1. `cd infra/platform && pulumi stack select dev && pulumi up`.
2. In the console check: RDS `dev-viberglass-db` (Postgres 18), ECR `dev-viberglass-repo`, S3 `dev-viberglass-uploads`, ALB with HTTPS listener and certificate, Amplify app `dev-viberglass-frontend`, SSM parameters under `/viberglass/dev/`, SES identity with DKIM records (if email configured).

Expect: all resources present; the ALB target group is unhealthy until a backend image exists.

### AWS-03 · Worker images to ECR
1. GitHub → Actions → **deploy-viberators** → Run workflow: environment `dev`, harness `all` (or at least `multi-agent`, `opencode`, `lambda`). Or locally: `infra/workers/scripts/setup-harness-images.sh dev all`.

Expect: `viberator-worker-*`, `viberator-base-worker` and `viberator-lambda-worker` repositories with fresh `latest` tags.

### AWS-04 · Workers stack
1. `cd infra/workers && pulumi stack select dev && pulumi up` (set `tenantIds` to avoid wildcard SSM grants).

Expect: ECS worker cluster, worker roles, reference task definition `dev-viberglass-worker`; outputs `ecsClusterArn`, `ecsTaskRoleArn`, `workerSubnets`, `workerSecurityGroup`.

### AWS-05 · Platform stack (second pass)
1. `pulumi config set viberglass:workerStack <org>/viberglass-workers/dev` in `infra/platform`; `pulumi up`.
2. `aws ecs describe-task-definition` on the backend family: check the `VIBERATOR_ECS_*`, `VIBERATOR_WORKER_REGISTRY`, `VIBERATOR_LAMBDA_*` variables.

Expect: variables present, per [../../../infra/platform/DEPLOY_WORKER_INTEGRATION.md](../../../infra/platform/DEPLOY_WORKER_INTEGRATION.md).

## Delivery (AWS-06 – AWS-08)

### AWS-06 · Backend deploy
1. Push to `main` touching `apps/platform-backend/**`, or run **deploy-backend-dev**.
2. Watch the new task revision roll out; `curl https://api.dev.<domain>/health`.
3. Check CloudWatch `/ecs/viberglass-dev-backend` for "migrations completed".

Expect: new revision pinned by digest; health 200; migrations ran at start.

### AWS-07 · Frontend on Amplify
1. Push to `main` (Amplify builds from git) and wait for the job.
2. Open `https://app.dev.<domain>`; register the first admin; sign in again in a new window.

Expect: the app loads and calls the API over HTTPS; the session survives reload (K3 if it doesn't).

### AWS-08 · Redeploy during a run
1. Start a long agent turn (AWS-12), then redeploy the backend.

Expect: the worker keeps running; its result is recorded once the new backend is up.

## Product on AWS (AWS-10 – AWS-22)

### AWS-10 · Setup on ECS
1. Run first-run setup (model key, repository, space).

Expect: the agent step reports ECS compute; Agents & runners shows the default agent on AWS ECS, Ready.

### AWS-11 · Secrets in SSM
1. Workspace settings → Secrets: check the storage default is SSM. Create a secret.
2. `aws ssm get-parameter --name /viberator/secrets/<NAME> --with-decryption`.

Expect: stored as a SecureString at `/viberator/secrets/<NAME>`; the UI never shows the value; a database-stored secret on an ECS runner is reported as unusable.

### AWS-12 · An ECS run
1. Ask for research.
2. In ECS, find the worker task (family `viberator-worker-<slug>`); open its logs in `/ecs/viberglass-dev-worker`.

Expect: the task starts in the private subnets (K5 in standard mode), calls back to `PLATFORM_API_URL`, the research appears; logs stream in the task's run detail too.

### AWS-13 · Session continuity
1. Ask a follow-up on the same task.

Expect: "continued its session" and an object under `s3://dev-viberglass-uploads/conversation-state/`. If it starts fresh, record K4.

### AWS-14 · Media on S3
1. Upload a screenshot to a task; open it from Media; open its link in a private window after it expires.

Expect: stored under `ticket-media/`; served by signed URL; expired links refused.

### AWS-15 · Cancel on ECS
1. Cancel a running turn.

Expect: the ECS task stops (StopTask) within a minute; the turn shows stopped.

### AWS-16 · Code and PR from ECS
1. Run GH-03 on the AWS space.

Expect: a PR opened from the ECS worker; GH-05 merge detection works on AWS.

### AWS-17 · Lambda runner
1. New agent runner with the Lambda strategy (managed); start it.
2. Run a short research turn; cancel another.

Expect: function `viberator-<runner>` created; the research arrives; cancel can't stop Lambda, and its late result is refused. Turns longer than 15 minutes fail by design.

### AWS-18 · Email through SES
1. Verify the SES identity and DKIM (`pulumi stack output emailSetupSteps`); in the SES sandbox, verify your recipient address.
2. Your settings → Notifications → **Send a test email**; invite someone.

Expect: emails delivered from `EMAIL_FROM`; first real run of SES.

### AWS-19 · Webhooks and Slack on AWS
1. Repeat GH-07 against the deployed backend (`https://api.dev.<domain>/api/webhooks/github/<webhook id>`).
2. Set the Slack signing secret and bot token in SSM (`/viberglass/dev/backend/slack-*`), redeploy, run SLACK-02 to SLACK-04.

Expect: same results as locally.

### AWS-20 · Logs and health
1. Check backend, worker and Lambda log groups for the runs above; RDS logs exist.

Expect: every run traceable by its job ID; no secret values in logs.

### AWS-21 · Smoke subset
1. Run the README's smoke subset on AWS-DEV.

Expect: same results as locally.

### AWS-22 · Prod differences (only when deploying prod)
1. Check Multi-AZ, deletion protection, 30-day backups; deploy via the manual **deploy-backend-prod** workflow (confirm `YES`).

Expect: K8 on the smoke step; otherwise the same as dev.

## Teardown (AWS-30)

1. Destroy in reverse: `pulumi destroy` in platform, workers, then base. Delete the leftover managed task definitions and `viberator-*` Lambda functions created by runners.
2. Check for leftover ECR images, the S3 bucket and log groups.

Expect: nothing billing remains, apart from what you keep on purpose.
