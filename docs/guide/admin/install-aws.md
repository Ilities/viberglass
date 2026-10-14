# Install on AWS

Three Pulumi stacks deploy Viberglass into your AWS account: the backend on ECS with RDS PostgreSQL and S3, the frontend on Amplify, and agent runs on ECS Fargate or Lambda.

## Before you start

- AWS CLI v2, signed in to the target account.
- Pulumi CLI, Node.js 24, and Docker with buildx for building amd64 images.
- A Route 53 hosted zone for a domain you control. Use one registrable domain for the API and the app, such as `api.viberglass.example.com` and `app.viberglass.example.com`; sign-in relies on it.

## Deploy

Set up the Pulumi state bucket and log in to it:

```bash
./infra/setup-pulumi-state.sh
pulumi login s3://viberglass-pulumi-state
```

Copy `infra/platform/Pulumi.dev.yaml.example` to `Pulumi.dev.yaml` and set at least the base stack, `apiDomain`, `appDomain` and `route53ZoneId`. Set `workerStack` to the workers stack, such as `organization/viberglass-workers/dev`; without it, runners on ECS and Lambda get no default cluster, roles or images, and need them entered by hand. Set `previewDomain` too for artifact previews; see below. Then deploy the stacks in order:

```bash
cd infra/base && npm install && pulumi stack select dev && pulumi up       # VPC, KMS, logging
cd infra/workers && npm install && pulumi stack select dev && pulumi up    # ECS and Lambda workers
cd infra/platform && npm install && pulumi stack select dev && pulumi up   # ECS backend, RDS, S3, Amplify frontend
```

ECS runners pull the published worker images from `ghcr.io/ilities`, so there's nothing to push for them. Lambda runners use a Lambda worker image in the stack's ECR repository; push it before creating one:

```bash
./infra/workers/scripts/setup-harness-images.sh dev lambda
```

To run ECS runners from your own ECR instead, set `workerImageRegistry: ecr` in the platform stack, which needs `workerStack` set. Push every harness image to the workers stack's ECR, run `pulumi up` in the platform stack, then the backend deploy workflow so the backend picks up the new registry:

```bash
./infra/workers/scripts/setup-harness-images.sh dev all
cd infra/platform && pulumi up
```

The images are tagged `latest` and, with `IMAGE_TAG` set or from the `deploy-viberators` workflow, a tag of your own or the commit. Set `workerImageTag` to one of those to pin it; the default is `latest`.

Open your app address, create the administrator and go through setup as described in [Install with Docker](install-docker.md#first-run-setup). The default agent runs on ECS.

## Artifact previews

HTML, image and PDF artifacts preview from a host of their own, so the agent's scripts never run where the app's sign-in cookies go. Set `previewDomain` in the platform stack to a hostname in the same Route 53 zone that isn't `apiDomain` or `appDomain`, such as `preview.viberglass.example.com`. The stack gives it a certificate, a DNS alias to the API's load balancer and a listener rule that sends it to the backend's preview port, 8890. The base stack opens that port to the load balancer. Without `previewDomain`, those artifacts can only be downloaded.

The backend service ignores task definition changes, because the deploy workflow registers its own. When you turn previews on for an existing stack, update the base stack first, then run `pulumi up` in the platform stack and the backend deploy workflow, which picks up the new task definition with the preview port. If ECS refuses the service's new target group because the running task definition has no port 8890, run `pulumi up` in the platform stack once more after the deploy.

## Files spaces

Files spaces keep their files and artifacts in the platform's S3 bucket; nothing extra is needed. ECS workers fetch and save a space's files through short-lived signed URLs from the backend, so they need outbound HTTPS to S3 like their other traffic, and no S3 permissions of their own. Lambda runners can't run in Files spaces. A stopped worker task gets 60 seconds to save its files before ECS kills it; a task definition you supply yourself keeps its own `stopTimeout`, 30 seconds unless set. In production the bucket moves objects to Glacier Instant Retrieval after 90 days, which S3 still serves directly, so a space left alone for months can still be restored. The dev stack deletes objects after 90 days, including the files of a space nobody changed in that time.

## Email

Set `emailDomain` in the platform stack to send invites and notifications through SES. The stack creates the domain identity with DKIM and gives the backend permission to send. `pulumi up` lists any steps still open: the DNS records to add when the domain isn't in Route 53, and requesting SES production access, since a new SES account only delivers to verified addresses.

## Secrets on AWS

Secrets can be stored encrypted in the database, as on any install, or in AWS SSM Parameter Store, where ECS and Lambda workers read them. See [Secrets](secrets.md).

## Teardown

Destroy the stacks in reverse order: platform, then workers, then base.

## More detail

- [Infrastructure README](https://github.com/Ilities/viberglass/blob/main/infra/README.md): the stacks and what they create.
- [AWS test plan](https://github.com/Ilities/viberglass/blob/main/docs/testing/e2e-manual/05-aws.md): a full walkthrough of a deployment, with the known issues to check for.
