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

Copy `infra/platform/Pulumi.dev.yaml.example` to `Pulumi.dev.yaml` and set at least the base stack, `apiDomain`, `appDomain` and `route53ZoneId`. Then deploy the stacks in order:

```bash
cd infra/base && npm install && pulumi stack select dev && pulumi up       # VPC, KMS, logging
cd infra/platform && npm install && pulumi stack select dev && pulumi up   # ECS backend, RDS, S3, Amplify frontend
cd infra/workers && npm install && pulumi stack select dev && pulumi up    # ECS and Lambda workers
```

Push the worker images to ECR before creating runners:

```bash
./infra/workers/scripts/setup-harness-images.sh dev multi-agent
```

Use `all` instead of `multi-agent` for one image per coding agent. Open your app address, create the administrator and go through setup as described in [Install with Docker](install-docker.md#first-run-setup). The default agent runs on ECS.

## Email

Set `emailDomain` in the platform stack to send invites and notifications through SES. The stack creates the domain identity with DKIM and gives the backend permission to send. `pulumi up` lists any steps still open: the DNS records to add when the domain isn't in Route 53, and requesting SES production access, since a new SES account only delivers to verified addresses.

## Secrets on AWS

Secrets can be stored encrypted in the database, as on any install, or in AWS SSM Parameter Store, where ECS and Lambda workers read them. See [Secrets](secrets.md).

## Teardown

Destroy the stacks in reverse order: workers, then platform, then base.

## More detail

- [Infrastructure README](https://github.com/Ilities/viberglass/blob/main/infra/README.md): the stacks and what they create.
- [AWS test plan](https://github.com/Ilities/viberglass/blob/main/docs/testing/e2e-manual/05-aws.md): a full walkthrough of a deployment, with the known issues to check for.
