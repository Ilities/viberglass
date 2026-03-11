# Viberglass

Agent orchestrator and ticket management platform. Users create tickets that AI coding agents (Viberators) automatically fix.

## Quick Start

```bash
docker compose up
```

Frontend: http://localhost:3000

## Project Structure

```
apps/
├── platform-backend/   # Express API
├── platform-frontend/  # React UI
├── slack-app/          # Slack integration
└── viberator/          # Worker agent
packages/
└── types/              # Shared TypeScript types
infra/
├── base/               # VPC, KMS (Pulumi)
├── platform/           # Backend, DB, Amplify (Pulumi)
└── workers/            # Lambda, ECS workers (Pulumi)
tests/
└── e2e/                # Playwright E2E tests
docker-compose.yml
```

## Requirements

- Docker Engine 20.10+
- docker compose v2
