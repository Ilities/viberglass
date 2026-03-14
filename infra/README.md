# Infrastructure

Pulumi-based AWS infrastructure in three stacks. Base must deploy first; platform and workers depend on it.

```
infra/
├── base/      # VPC, KMS, CloudWatch logging
├── platform/  # ECS backend, RDS, S3, Amplify frontend
└── workers/   # Lambda and ECS worker execution
```

## Prerequisites

- Pulumi CLI
- AWS credentials
- Node.js 20+

## Deploy

```bash
# Set up S3 state backend
./setup-pulumi-state.sh
pulumi login s3://viberglass-pulumi-state

# Deploy in order
cd infra/base && npm install && pulumi stack select dev && pulumi up
cd infra/platform && npm install && pulumi stack select dev && pulumi up
cd infra/workers && npm install && pulumi stack select dev && pulumi up
```

## Teardown

Destroy in reverse order: workers → platform → base.

```bash
cd infra/workers && pulumi destroy
cd infra/platform && pulumi destroy
cd infra/base && pulumi destroy
```
