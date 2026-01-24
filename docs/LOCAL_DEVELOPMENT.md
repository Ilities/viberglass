# Local Development with Docker Compose

One-command setup for complete Viberator platform locally.

## Prerequisites

- **Docker Desktop** or **Docker Engine** 20.10+
- **docker compose** v2 (built into Docker Desktop)
- No need to install Node.js, PostgreSQL, or Redis separately - all run in containers

## Quick Start

```bash
# Clone and navigate to repository
cd viberator

# Start all services (postgres, redis, backend, frontend)
docker compose up

# Or run in detached mode (background)
docker compose up -d
```

Once running:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8888
- **PostgreSQL:** localhost:5432
- **Redis:** localhost:6379

## First-Time Setup

After starting the services, run database migrations:

```bash
# Run migrations from the backend container
docker compose exec backend npm run migrate:latest
```

For worker setup and local Docker clankers, see [LOCAL_DOCKER_SETUP.md](./LOCAL_DOCKER_SETUP.md).

## Hot-Reload

Code changes in `apps/platform-backend` or `apps/platform-frontend` automatically reload.

- Source files are mounted as volumes from your host
- No need to rebuild images when editing code
- Backend uses nodemon for hot-reload
- Frontend uses Next.js built-in HMR (Fast Refresh)

## Services

| Service | Description | Port |
|---------|-------------|------|
| **postgres** | PostgreSQL 16 database | 5432 |
| **redis** | Redis 7 message queue | 6379 |
| **backend** | Express API server | 8888 |
| **frontend** | Next.js web UI | 3000 |

Data persists in Docker volumes across restarts.

## Useful Commands

```bash
# View logs for a service
docker compose logs -f backend
docker compose logs -f frontend

# Restart a specific service
docker compose restart backend

# Stop all services
docker compose down

# Stop and remove volumes (cleans database)
docker compose down -v

# Rebuild a service
docker compose up -d --build backend

# Run backend command in container
docker compose exec backend npm test
docker compose exec backend npm run migrate:latest

# Check service status
docker compose ps
```

## Troubleshooting

### Port Conflicts

If ports 3000, 8888, 5432, or 6379 are already in use:

1. Stop the conflicting service on your host
2. Or edit port mappings in `docker-compose.yml`:
   ```yaml
   ports:
     - "5433:5432"  # Use alternate host port
   ```

### Hot-Reload Not Working

If code changes don't trigger reload:

- Ensure `CHOKIDAR_USEPOLLING=true` is set (already in compose file)
- On macOS/Windows, file watching may use polling - this is normal

### Database Connection Issues

If backend can't connect to database:

```bash
# Check postgres is healthy
docker compose logs postgres

# Verify database is accepting connections
docker compose exec postgres pg_isready -U viberator
```

### Frontend Build Errors

If frontend shows errors during initial build:

```bash
# Rebuild frontend service
docker compose up -d --build frontend

# Check build logs
docker compose logs frontend
```

## Next Steps

- For **worker setup** and **local Docker clankers**, see [LOCAL_DOCKER_SETUP.md](./LOCAL_DOCKER_SETUP.md)
- For **AWS ECS deployment**, see [AWS_ECS_SETUP.md](./AWS_ECS_SETUP.md)

## Architecture Notes

The docker-compose configuration uses:

- **Healthcheck-based service ordering:** Backend waits for postgres/redis to be healthy
- **Anonymous node_modules volumes:** Prevents host/container architecture mismatch
- **Cached volume mounts:** Better performance on macOS/Windows
- **Cross-platform networking:** Uses `host.docker.internal` for container-to-host communication
