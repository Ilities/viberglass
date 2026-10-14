# Viberglass Documentation

Welcome to the Viberglass documentation. This directory contains technical documentation for the platform.

## Quick Links

| Document | Description |
|----------|-------------|
| [guide/README.md](guide/README.md) | User and administrator guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and design |
| [local-development.md](local-development.md) | Running the dev stack with Docker Compose |
| [DEPLOYMENT_SECRETS.md](DEPLOYMENT_SECRETS.md) | Secret management for deployments |
| [../README.md](../README.md) | Quick start and overview |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |
| [../TESTING.md](../TESTING.md) | Testing setup and commands |
| [../packages/agents/README.md](../packages/agents/README.md) | Adding an agent harness |
| [../packages/integrations/README.md](../packages/integrations/README.md) | Adding an integration: code host, tracker, webhooks or chat |
| [operations/slack-integration.md](operations/slack-integration.md) | Slack app setup and operations |

## Documentation Sections

### Guide

- [guide/README.md](guide/README.md) - Using Viberglass with your team, and installing and running it

### Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) - Complete system architecture
- Architecture diagrams and data flow
- Technology stack details
- Security architecture
- [adr/README.md](adr/README.md) - Product and architecture decision records
- [artifact-spaces-plan.md](artifact-spaces-plan.md) - Spaces without Git, persistent files and artifact previews (implemented); publishing is still planned
- [model-hosting-plan.md](model-hosting-plan.md) - Custom endpoints, Bedrock, model deployments and implementation progress
- [eval-plan.md](eval-plan.md) - Grading agent runs

### Development

- [local-development.md](local-development.md) - Docker Compose stack, optional services, email and Slack locally
- [telemetry-local.md](telemetry-local.md) - Looking at traces locally (stdout, Langfuse, other OTLP backends)
- [testing/e2e-manual/README.md](testing/e2e-manual/README.md) - Manual end-to-end test suite

### Deployment

- [guide/admin/install-docker.md](guide/admin/install-docker.md) - Install with Docker Compose, locally or on one server
- [guide/admin/install-kubernetes.md](guide/admin/install-kubernetes.md) - Install on your own Kubernetes cluster
- [guide/admin/install-aws.md](guide/admin/install-aws.md) - Install on AWS with the Pulumi stacks
- [kubernetes-deployment.md](kubernetes-deployment.md) - Kubernetes upgrades, backups and operations
- [local-kubernetes.md](local-kubernetes.md) - Disposable local cluster and platform verification
- [kubernetes-ovh-deployment-plan.md](kubernetes-ovh-deployment-plan.md) - The OVHcloud managed-cluster target
- [portable-storage-and-credentials.md](portable-storage-and-credentials.md) - S3-compatible storage settings and how workers get credentials
- [DEPLOYMENT_SECRETS.md](DEPLOYMENT_SECRETS.md) - Managing secrets
- [operations/database-migrations.md](operations/database-migrations.md) - Database migration guide
- [operations/github-actions-role.md](operations/github-actions-role.md) - GitHub Actions setup

### Operations

- [operations/](operations/) - Operational runbooks and guides
- [operations/slack-integration.md](operations/slack-integration.md) - Slack integration setup

## Contributing to Documentation

When adding documentation:

1. Use Markdown format
2. Include a table of contents for documents longer than 100 lines
3. Link to related documents where appropriate
4. Keep examples up to date with code changes
5. Use clear, concise language

## Documentation Standards

- **Code blocks**: Use language-specific syntax highlighting
- **Paths**: Use absolute paths from repo root or clearly relative paths
- **Commands**: Show full commands that can be copied and run
- **Screenshots**: Store in `guide/images/` with descriptive names

## Questions?

If you have questions about the documentation, please:
- Open a [GitHub issue](https://github.com/Ilities/viberglass/issues)
- Start a [GitHub discussion](https://github.com/Ilities/viberglass/discussions)
