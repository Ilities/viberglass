# Viberglass

Agent Orchestrator and Ticket Management Platform. Users create bug tickets that coding agents (called Viberators) automatically fix, with results flowing back through the system.

## Quick Start

Start all services locally with a single command:

```bash
# Clone and navigate to repository
cd viberglass

# Start all services (postgres, redis, backend, frontend)
docker compose up
```

Access the frontend at http://localhost:3000

## Local Development

For complete setup instructions, see [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)

- One-command setup with Docker Compose
- Hot-reload for backend and frontend
- Database migrations
- Troubleshooting guide

## Production Ready 🚀

Viberglass is production-ready for both **self-hosted** and **AWS SaaS** deployments.

### Self-Hosted Deployment

Deploy on your own infrastructure with Docker Compose in < 15 minutes.

**Features:**
- ✅ Simple Docker Compose setup
- ✅ Automated database backups
- ✅ Security hardening (rate limiting, CORS, Helmet.js)
- ✅ Health checks and monitoring
- ✅ Comprehensive documentation

**Get started:** [Self-Hosting Guide](docs/SELF_HOSTING.md)

### AWS SaaS Deployment

Fully automated AWS infrastructure with Pulumi.

**Features:**
- ✅ Multi-tenant architecture with strict isolation
- ✅ Automated RDS backups (30-day retention)
- ✅ CloudWatch monitoring with 16+ alarms
- ✅ ECS Fargate for zero-server management
- ✅ CI/CD with automated testing and deployment validation
- ✅ Disaster recovery procedures

**Security:**
- Project-level access control
- Rate limiting on all endpoints
- Security headers (Helmet.js)
- Encrypted secrets (AWS SSM)
- Database encryption at rest

See [Productionization Status](docs/PRODUCTIONIZATION_STATUS.md) for complete details.

## Documentation

| Guide | Description |
|-------|-------------|
| [Self-Hosting](docs/SELF_HOSTING.md) | **Production deployment guide for self-hosted** |
| [Productionization Status](docs/PRODUCTIONIZATION_STATUS.md) | Complete production-readiness checklist |
| [Local Development](docs/LOCAL_DEVELOPMENT.md) | Docker Compose setup guide |
| [Shortcut to PR Quickstart](docs/USER_QUICKSTART_SHORTCUT_TO_PR.md) | Fast setup path for Shortcut -> Viberglass -> automated PR flow |
| [Shortcut to PR Setup](docs/USER_SETUP_SHORTCUT_TO_PR.md) | User-facing setup for Shortcut -> Viberglass -> automated PR flow |
| [Ticket Create/Run Quickstart](docs/USER_QUICKSTART_CREATE_AND_RUN_TICKET.md) | Fast path for creating a ticket with specific info and running it |
| [Ticket Create/Run Guide](docs/USER_SETUP_CREATE_AND_RUN_TICKET.md) | Full user guide for ticket quality, execution, and troubleshooting |
| [Local Docker Clanker Setup](docs/LOCAL_DOCKER_SETUP.md) | Worker containers and local execution |
| [Worker Harness Images](docs/WORKER_HARNESS_IMAGES.md) | **Setup worker harness images (multi-agent, etc.)** |
| [AWS ECS Setup](docs/AWS_ECS_SETUP.md) | AWS SaaS deployment |
| [Database Migrations](docs/operations/database-migrations.md) | Production migration procedures |
| [Disaster Recovery](docs/operations/disaster-recovery.md) | Recovery procedures and RTO/RPO |

## Project Structure

```
viberglass/
├── apps/
│   ├── platform-backend/   # Express API server
│   ├── platform-frontend/  # React web UI
│   ├── slack-app/          # Slack app for workspace install
│   └── viberator/          # Viberator worker implementation
├── packages/
│   └── types/              # Shared TypeScript types
├── infra/
│   ├── base/               # Base cloud resources infrastructure (Pulumi)
│   ├── platform/           # Platform infrastructure (Pulumi)
│   └── workers/            # Viberator infrastructure (Pulumi + Docker)
├── tests/
│   └── e2e/                # Playwright E2E tests
└── docker-compose.yml      # Local development environment
```

**Note:** The repository is `viberglass` (the platform), with `apps/viberator` containing the worker/agent components (Viberators).

## Core Features

- **Multi-repository ticket management** - Create tickets spanning multiple GitHub repositories
- **Agent execution** - Integration with Claude Code, Qwen, and other AI agents (called Viberators)
- **Clanker configuration** - Define runtime environments (Docker, ECS) with agent instructions
- **Viberator orchestration** - Ephemeral workers in local Docker, AWS Lambda, or ECS Fargate
- **Webhook integration** - GitHub and Jira webhooks trigger ticket creation

## Requirements

- Docker Desktop or Docker Engine 20.10+
- docker compose v2
