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

## Documentation

| Guide | Description |
|-------|-------------|
| [Local Development](docs/LOCAL_DEVELOPMENT.md) | Docker Compose setup guide |
| [Local Docker Clanker Setup](docs/LOCAL_DOCKER_SETUP.md) | Worker containers and local execution |
| [AWS ECS Setup](docs/AWS_ECS_SETUP.md) | Production deployment |

## Project Structure

```
viberglass/
├── platform/
│   ├── backend/     # Express API server
│   └── frontend/    # Next.js web UI
├── viberator/
│   ├── app/         # Viberator worker implementation
│   └── infrastructure/  # Docker infrastructure
├── packages/
│   └── types/       # Shared TypeScript types
└── docker-compose.yml   # Local development environment
```

**Note:** The repository is `viberglass` (the platform), with `viberator/app` containing the worker/agent components (Viberators).

## Core Features

- **Multi-repository ticket management** - Create tickets spanning multiple GitHub repositories
- **Agent execution** - Integration with Claude Code, Qwen, and other AI agents (called Viberators)
- **Clanker configuration** - Define runtime environments (Docker, ECS) with agent instructions
- **Viberator orchestration** - Ephemeral workers in local Docker, AWS Lambda, or ECS Fargate
- **Webhook integration** - GitHub and Jira webhooks trigger ticket creation

## Requirements

- Docker Desktop or Docker Engine 20.10+
- docker compose v2
