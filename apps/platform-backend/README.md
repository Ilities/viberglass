# Platform Backend

Backend service for spaces and tasks, files and artifacts, agent turns, worker execution, integrations, webhooks, and secret management.

## Documentation
- Architecture: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- Local development: [docs/local-development.md](../../docs/local-development.md)
- Decisions: [docs/adr](../../docs/adr/)

## Quick Start

The usual way to run it is `docker compose -f docker-compose.dev.yml up` from the repository root, after `npm run backend:build-deps`. It also starts Postgres, MinIO and the frontend and runs migrations on start. To run the backend on its own:

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
```bash
cp .env.example .env
```
Update `.env` values for your local PostgreSQL and any optional AWS/webhook integrations.

### 3) Run migrations
```bash
npm run migrate:latest
```
Or set `RUN_MIGRATIONS_ON_STARTUP=true` to migrate when the server starts.

### 4) Start dev server
```bash
npm run dev
```

Default API URL: `http://localhost:8888`
Health endpoint: `GET /health`
