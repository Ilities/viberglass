# Platform Backend

Backend service for spaces and tasks, agent turns, worker execution, integrations, webhooks, and secret management.

## Documentation
- Architecture: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- Decisions: [docs/adr](../../docs/adr/)

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
