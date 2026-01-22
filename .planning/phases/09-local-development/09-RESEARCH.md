# Phase 09: Local Development - Research

**Researched:** 2026-01-22
**Domain:** Docker Compose, Development Environment, Multi-Service Orchestration
**Confidence:** HIGH

## Summary

This phase focuses on creating a complete Docker Compose environment for local development. The research reveals that the project already has partial Docker Compose configurations but lacks a unified, all-in-one development environment. Existing components include:

- Individual docker-compose files in `platform/backend/` (postgres + redis only)
- E2E test docker-compose in `e2e-tests/docker/` (postgres + localstack + redis)
- Worker docker-compose in `viberator/infrastructure/` (worker only)
- Extensive documentation in `docs/LOCAL_DOCKER_SETUP.md` (manual multi-terminal setup)

**Primary recommendation:** Create a unified docker-compose configuration at the repository root that starts all services (postgres, redis, backend, frontend) with proper hot-reload for development. Use Docker Compose's native features for health checks, volume mounting, and cross-platform networking.

**Key insight:** The existing LOCAL_DOCKER_SETUP.md documents a complex multi-terminal setup. A docker-compose that eliminates manual terminal management would significantly improve developer experience.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Docker Compose | 3.8+ | Multi-service orchestration | De facto standard for local development, native to Docker Desktop/Engine |
| PostgreSQL | 16-alpine | Database | Latest stable Alpine image, used in E2E tests |
| Redis | 7-alpine | Message queue (future) | Required for planned Bull queue functionality |
| Node.js | 20-alpine | Runtime base image | Matches project's engines requirement |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| nodemon | Backend hot-reload | Already used in dev script (`nodemon --exec tsx`) |
| Next.js dev server | Frontend hot-reload | Built-in HMR with Fast Refresh |
| CHOKIDAR_USEPOLLING | File watching in containers | Required for Docker volume mounts on some hosts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Docker Compose | Vagrant / Podman Compose | Docker Compose is native to Docker, no VM overhead |
| Single compose file | Multiple compose files (docker-compose.override.yml) | Single file simpler for documentation, override files for power users |

**Installation:**
```bash
# All services already required
docker --version      # Docker Desktop or Engine 20.10+
docker-compose version  # Built into Docker Desktop, or `docker compose` v2
```

## Architecture Patterns

### Recommended Project Structure

```
viberator/
├── docker-compose.yml        # Root: all services for local dev
├── docker-compose.dev.yml    # Development overrides (hot-reload, debugging)
├── .env.example              # Template for environment variables
├── platform/
│   ├── backend/
│   │   ├── Dockerfile        # Backend production image
│   │   ├── Dockerfile.dev    # Backend development image
│   │   └── docker-compose.yaml  # Legacy: may deprecate
│   └── frontend/
│       ├── Dockerfile        # Frontend production image
│       └── Dockerfile.dev    # Frontend development image
└── docs/
    └── LOCAL_DEVELOPMENT.md  # New: simplified one-command setup guide
```

### Pattern 1: Unified Root Docker Compose

**What:** Single docker-compose.yml at repository root that defines all services

**When to use:** Standard practice for multi-service applications in 2025

**Example structure:**
```yaml
# Source: Best practices from Docker multi-service guides
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: viberator
      POSTGRES_USER: viberator
      POSTGRES_PASSWORD: viberator_dev
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U viberator"]
      interval: 5s
      timeout: 5s
      retries: 5
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./platform/backend
      dockerfile: Dockerfile.dev
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=viberator
      - DB_USER=viberator
      - DB_PASSWORD=viberator_dev
      - REDIS_HOST=redis
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true  # For hot-reload in container
    ports:
      - "8888:8888"
    volumes:
      - ./platform/backend:/app:cached
      - /app/node_modules  # Prevent overwriting container's node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./platform/frontend
      dockerfile: Dockerfile.dev
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8888
      - NODE_ENV=development
    ports:
      - "3000:3000"
    volumes:
      - ./platform/frontend:/app:cached
      - /app/node_modules
    depends_on:
      - backend

volumes:
  postgres-data:

networks:
  default:
    name: viberator-dev-network
```

### Pattern 2: Development Dockerfiles

**What:** Separate Dockerfiles for development vs production

**When to use:** Development needs source mounting and dev dependencies; production needs optimized builds

**Backend Dockerfile.dev example:**
```dockerfile
# Source: Standard Node.js development container pattern
FROM node:20-alpine

WORKDIR /app

# Install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

# Copy source code (mounted in compose for development)
COPY . .

# Expose port
EXPOSE 8888

# Use nodemon for hot-reload
CMD ["npm", "run", "dev"]
```

**Frontend Dockerfile.dev example:**
```dockerfile
# Source: Next.js development container best practices
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Use Next.js dev server with polling for hot-reload
CMD ["npm", "run", "dev"]
```

### Pattern 3: Cross-Platform Container-to-Host Networking

**What:** Enable containers to reach services running on the host machine

**When to use:** Workers in containers need to callback to platform API on host

**Solution for all platforms:**
```yaml
# Source: Docker networking best practices 2025
services:
  worker:
    extra_hosts:
      # Works on macOS/Windows natively, Linux via host-gateway
      - "host.docker.internal:host-gateway"
```

**Alternative for Linux-only:**
```yaml
# Linux-specific: use bridge gateway IP
environment:
  - PLATFORM_API_URL=http://172.17.0.1:8888
```

### Anti-Patterns to Avoid

- **Hardcoded host IPs:** `172.17.0.1` only works on Linux. Use `host.docker.internal:host-gateway` for cross-platform.
- **Mounting node_modules:** Causes conflicts between host and container architectures. Use anonymous volume to preserve container's node_modules.
- **Missing healthchecks:** Services start before dependencies are ready. Use healthchecks with `depends_on:condition:service_healthy`.
- **No volume caching:** Slow file watching on macOS/Windows. Use `:cached` or `:delegated` on volume mounts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service orchestration | Custom start scripts with tmux/gnu screen | docker-compose up | Built-in dependency management, health checks, logging |
| Process management | Background processes with nohup/disown | Docker's restart policies | Automatic restart on failure, cleaner logs |
| Hot-reload setup | Custom file watching scripts | Nodemon/Next.js built-in HMR | Battle-tested, handles edge cases |
| Network routing | Manual IP configuration | Docker networks with DNS | Service discovery by name, works across platforms |
| Environment management | Multiple .env files for each service | Single .env with docker-compose env_file | Centralized configuration, docker-compose handles interpolation |

**Key insight:** Docker Compose handles the complexity of multi-service development environments. Custom scripts add maintenance burden without adding value.

## Common Pitfalls

### Pitfall 1: Hot-Reload Not Working in Containers

**What goes wrong:** File changes on host don't trigger reload in container

**Why it happens:** Docker volume mounts on some systems (especially macOS/Windows) don't generate file system events that chokidar/nodemon detect

**How to avoid:**
```yaml
environment:
  - CHOKIDAR_USEPOLLING=true  # Force polling for file watching
```

**Warning signs:** Files edited on host but application doesn't reload

### Pitfall 2: Container Starts Before Database is Ready

**What goes wrong:** Application crashes with "connection refused" to database

**Why it happens:** `depends_on` only waits for container to start, not for service to be ready

**How to avoid:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U viberator"]
  interval: 5s
  timeout: 5s
  retries: 5

depends_on:
  postgres:
    condition: service_healthy
```

**Warning signs:** Intermittent startup failures, logs show "ECONNREFUSED"

### Pitfall 3: node_modules Architecture Mismatch

**What goes wrong:** `Error: Module not found` or binary executable errors

**Why it happens:** Host's node_modules (built for host OS/arch) mounted into container

**How to avoid:**
```yaml
volumes:
  - ./platform/backend:/app:cached
  - /app/node_modules  # Anonymous volume preserves container's node_modules
```

**Warning signs:** Errors about `.node` files being wrong format, or sharp/esbuild failing

### Pitfall 4: Cross-Platform Networking Differences

**What goes wrong:** `host.docker.internal` works on Mac/Windows but fails on Linux

**Why it happens:** Linux doesn't include host.docker.internal by default (added in Docker 20.10+ but requires extra_hosts)

**How to avoid:**
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"  # Works on all platforms
```

**Warning signs:** Worker containers can't reach host's API endpoint

### Pitfall 5: Port Conflicts with Existing Services

**What goes wrong:** `Port already in use` errors

**Why it happens:** Developer already has PostgreSQL, Redis, or other services on standard ports

**How to avoid:**
```yaml
# Document ports in README, provide alternative ports if needed
# Or use docker-compose's ability to not expose ports to host
ports:
  - "127.0.0.1:5432:5432"  # Only bind to localhost
```

**Warning signs:** Docker compose fails to start, connection errors

## Code Examples

### Verified Healthcheck Pattern

```yaml
# Source: Official Docker docs for PostgreSQL
postgres:
  image: postgres:16-alpine
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U viberator"]
    interval: 5s
    timeout: 5s
    retries: 5
```

### Cross-Platform Host Access

```yaml
# Source: Docker networking best practices 2025
# Works on macOS, Windows, and Linux (Docker 20.10+)
services:
  worker:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - PLATFORM_API_URL=http://host.docker.internal:8888
```

### Volume Mount for Development

```yaml
# Source: Best practices for Node.js in Docker
volumes:
  # Mount source with caching for better performance on macOS/Windows
  - ./platform/backend:/app:cached
  # Preserve container's node_modules (prevents architecture mismatch)
  - /app/node_modules
```

### Environment Variable Configuration

```yaml
# Source: Docker Compose env_file pattern
services:
  backend:
    env_file:
      - .env.development
    environment:
      # Override specific values
      - NODE_ENV=development
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| docker-compose (v1) | docker compose (v2, integrated into Docker) | 2023 | v2 is now standard, `docker-compose` command deprecated |
| Multiple terminals for services | Single `docker compose up` command | ~2018 | Standard practice for microservices |
| `depends_on` without conditions | `depends_on` with `condition: service_healthy` | ~2020 | More reliable service startup |
| Polling always required | Polling only when needed (docker-compose watch) | 2023-2024 | Better performance, but polling still needed for some setups |

**Deprecated/outdated:**
- `docker-compose` (standalone v1): Use `docker compose` (v2 plugin) instead
- `links` directive: Use service names for DNS resolution instead
- `container_name` for networking: Use service names for inter-service communication

## Open Questions

1. **Local worker execution without queue (DEV-02)**
   - What we know: Current architecture uses dockerode to invoke workers directly
   - What's unclear: Should local development use the same DockerInvoker pattern, or should workers run as long-running services?
   - Recommendation: Keep DockerInvoker pattern for consistency. The docker-compose can include a "worker" service that runs in CLI mode for testing.

2. **Database migrations**
   - What we know: Backend has `npm run migrate:latest` script
   - What's unclear: Should migrations run automatically on container start, or manually?
   - Recommendation: Manual migration is safer for development. Document migration step in README.

## Sources

### Primary (HIGH confidence)
- [Docker Official Docs - Multi-container Applications](https://docs.docker.com/get-started/docker-concepts/running-containers/multi-container-applications/) - Official Docker documentation
- [Docker Compose Guide - DataCamp](https://www.datacamp.com/tutorial/docker-compose-guide) - Comprehensive guide (May 2025)
- [Existing codebase](file:///home/jussi/Development/viberator/viberator/infrastructure/docker-compose.yml) - Current worker compose
- [Existing codebase](file:///home/jussi/Development/viberator/e2e-tests/docker/docker-compose.e2e.yaml) - E2E compose with healthchecks
- [Existing codebase](file:///home/jussi/Development/viberator/docs/LOCAL_DOCKER_SETUP.md) - Existing local setup guide
- [Existing codebase](file:///home/jussi/Development/viberator/platform/backend/docker-compose.yaml) - Backend compose

### Secondary (MEDIUM confidence)
- [Building & Running Multiple Services with Docker Compose - Dev.to](https://dev.to/devcorner/building-running-multiple-services-with-docker-compose-59ba) (September 2025)
- [Setting Up a Local Development Environment with Next.js - GitConnected](https://levelup.gitconnected.com/setting-up-a-local-development-environment-with-next-js-0049cfd6d437) (May 2024)
- [Fixing "host.docker.internal" Issue in Docker Compose on Linux - Medium](https://abhihyder.medium.com/fixing-host-docker-internal-issue-in-docker-compose-on-linux-f733006dfa12) - Cross-platform networking solution

### Tertiary (LOW confidence)
- [Next.js Local Development with Docker (Hot Reload Working) - Medium](https://medium.com/@hitesh.jangra01/next-js-local-development-with-docker-hot-reload-working-9f78a41fe229) - Hot reload techniques
- [Using Next.js 13+ App Directory with Hot-Reload in Docker - DevOps.dev](https://blog.devops.dev/using-next-js-13-app-directory-with-hot-reload-enabled-in-docker-simple-guide-60de42840d7e) (November 2023)
- [Running Multiple Development Environments - Waificloud](https://wafaicloud.com/blog/running-multiple-development-environments-with-docker-compose-on-linux/) (December 2024)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Docker Compose is industry standard, versions based on existing codebase
- Architecture: HIGH - Patterns verified with official Docker docs and existing codebase
- Pitfalls: HIGH - All pitfalls documented with solutions, verified against official sources

**Research date:** 2026-01-22
**Valid until:** 90 days (Docker Compose is stable, but minor versions may introduce new features)

**Existing documentation to update:**
- `docs/LOCAL_DOCKER_SETUP.md` - Simplify to reference docker-compose
- `platform/backend/README.md` - Update to reference root docker-compose
- `viberator/infrastructure/WORKERS.md` - Already comprehensive, keep as-is

**Files to create:**
- `docker-compose.yml` - Root development environment
- `docker-compose.dev.yml` - Development overrides (optional)
- `.env.development.example` - Environment template
- `docs/LOCAL_DEVELOPMENT.md` - New simplified guide
