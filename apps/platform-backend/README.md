# Platform Backend

Backend service for project/ticket orchestration, worker execution, integrations, webhooks, and secret management.

## Documentation
- Architecture: [docs/architecture.md](./docs/architecture.md)
- Refactor backlog: [docs/refactor-backlog.md](./docs/refactor-backlog.md)
- Contributor map: [docs/contributor-map.md](./docs/contributor-map.md)

## Quick Start

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

### 4) Start dev server
```bash
npm run dev
```

Default API URL: `http://localhost:8888`
Health endpoint: `GET /health`
