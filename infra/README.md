# Infrastructure

```
infra/
├── base/        # Pulumi: VPC, KMS, CloudWatch logging
├── workers/     # Pulumi: Lambda and ECS worker execution; worker Dockerfiles and image scripts
├── platform/    # Pulumi: ECS backend, RDS, S3, SES email, Amplify frontend
├── kubernetes/  # Helm chart (chart/) and the local cluster helper (scripts/local.py)
└── caddy/       # Caddyfile for the `https` profile of docker-compose.prod.yml
```

There are three ways to run Viberglass outside development:

- One host with Docker: `docker-compose.prod.yml` in the repository root ([install guide](../docs/guide/admin/install-docker.md)).
- Kubernetes: the Helm chart in `kubernetes/chart` ([install guide](../docs/guide/admin/install-kubernetes.md), [local cluster](../docs/local-kubernetes.md)).
- AWS: the Pulumi stacks below ([install guide](../docs/guide/admin/install-aws.md)).

## AWS (Pulumi)

Three stacks. Base must deploy first; workers and platform read its outputs, and platform reads the workers stack's.

### Prerequisites

- Pulumi CLI
- AWS credentials
- Node.js 20+

### Deploy

The platform stack's config isn't committed: copy `platform/Pulumi.dev.yaml.example` to `platform/Pulumi.dev.yaml` and fill it in first.

```bash
# Set up S3 state backend
./setup-pulumi-state.sh
pulumi login s3://viberglass-pulumi-state

# Deploy in order
cd infra/base && npm install && pulumi stack select dev && pulumi up
cd infra/workers && npm install && pulumi stack select dev && pulumi up
cd infra/platform && npm install && pulumi stack select dev && pulumi up
```

### Teardown

Destroy in reverse order: platform → workers → base.

```bash
cd infra/platform && pulumi destroy
cd infra/workers && pulumi destroy
cd infra/base && pulumi destroy
```
