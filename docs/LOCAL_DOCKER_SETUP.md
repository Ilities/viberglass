# Local Docker Clanker Setup

This guide walks you through setting up Viberator for local development using Docker clankers. After completing these steps, you'll be able to create tickets and have them automatically fixed by coding agents running in local Docker containers.

## Overview

**What this covers:**
- Running Viberator platform locally (backend + frontend + database)
- Building and configuring Docker worker containers
- Creating clankers that invoke workers via Docker
- End-to-end ticket execution flow

**Architecture:**
```
Frontend (Next.js)     Backend (Express)     Docker Daemon
     :                        :                      :
     |--- POST /run --------->|                      |
     |   Ticket + Clanker     |                      |
     |                        |--- Docker API ------>|
     |                        |                      |---> Container
     |                        |                      |     (ViberatorWorker)
     |                        |                      |          :
     |<-------- Job ID -------|                      |          :
     :                        |                      :          |
     |                        |<--- Callback -------|<---------|
     |                        |   (Result + PR URL) |          |
     |--- GET /jobs/:id ------>|                      |          |
```

## Prerequisites

Before starting, ensure you have:

| Prerequisite | Version Check | Installation |
|--------------|---------------|--------------|
| **Docker** | `docker --version` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine |
| **Node.js** | `node --version` (18+) | [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org/) |
| **PostgreSQL** | `psql --version` (15+) | Docker (see below) or local installation |
| **Git** | `git --version` | [git-scm.com](https://git-scm.com/) |
| **GitHub PAT** | Has `repo` scope | Create at GitHub Settings > Developer Settings > Personal Access Tokens |
| **Anthropic API Key** | Starts with `sk-ant-` | [console.anthropic.com](https://console.anthropic.com/) |

**Verify Docker access:**
```bash
docker info
```
If this fails with permission denied, add your user to the docker group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

## Step 1: Build Worker Image

The worker container contains the ViberatorWorker that runs coding agents.

```bash
# Build from the infrastructure directory (where Dockerfile is located)
cd /path/to/viberator/viberator/infrastructure
docker build -f docker/viberator-docker-worker.Dockerfile -t viberator-worker:local ../app
```

**Verify image exists:**
```bash
docker images | grep viberator-worker
# Expected output:
# viberator-worker:local   <image-id>   <time ago>   <size>
```

**Image size note:** The image is ~1.5GB because it includes Node.js, Git, and agent CLI tools.

## Step 2: Start Platform Services

### 2.1 Start PostgreSQL

Using Docker Compose (recommended):
```bash
cd /path/to/viberator/platform/backend
docker-compose up -d postgres
```

Or verify PostgreSQL is running locally:
```bash
psql postgres -c "SELECT version();"
```

### 2.2 Run Database Migrations

```bash
cd /path/to/viberator/platform/backend
npm install
npm run db:migrate
```

Expected output: `Migrations completed successfully`

### 2.3 Start Backend

```bash
cd /path/to/viberator/platform/backend
npm run dev
```

Backend starts on `http://localhost:8888`

**Verify:**
```bash
curl http://localhost:8888/health
# Expected: {"status":"healthy"}
```

### 2.4 Start Frontend (New Terminal)

```bash
cd /path/to/viberator/platform/frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:3000`

**Verify:** Open http://localhost:3000 in your browser

## Step 3: Configure Deployment Strategy

Before creating a clanker, you need a Docker deployment strategy.

1. Navigate to **Clankers** page in the UI (http://localhost:3000/clankers)

2. Click **New Deployment Strategy** and create:
   - **Name:** `Docker Strategy`
   - **Type:** `docker`
   - **Status:** `Active`

3. Note the deployment strategy ID (shown after creation)

## Step 4: Create Docker Clanker

1. On the **Clankers** page, click **New Clanker**

2. Configure:
   - **Name:** `Local Docker`
   - **Deployment Strategy:** Select the Docker strategy created in Step 3
   - **Status:** `Active`

3. **Deployment Config** (JSON):
   ```json
   {
     "containerImage": "viberator-worker:local",
     "networkMode": "host",
     "environmentVariables": {
       "PLATFORM_API_URL": "http://host.docker.internal:8888",
       "GITHUB_TOKEN": "ghp_your_github_token_here",
       "ANTHROPIC_API_KEY": "sk-ant-your-anthropic-key-here"
     }
   }
   ```

**Important notes:**
- Replace `ghp_your_github_token_here` with your actual GitHub PAT
- Replace `sk-ant-your-anthropic-key-here` with your actual Anthropic API key
- **Linux users:** Replace `host.docker.internal` with `172.17.0.1` (Docker bridge IP)
  ```bash
  # On Linux, verify the bridge IP:
  docker network inspect bridge | grep Gateway
  ```

4. Click **Create**

**Network configuration explanation:**
- `host` mode (Linux): Container shares host network, can reach `localhost:8888`
- `bridge` mode (Mac/Windows): Use `host.docker.internal` to reach host from container

## Step 5: Create Project

1. Navigate to **Projects** page

2. Click **New Project**

3. Configure:
   - **Name:** Your project name
   - **Repository URL:** `https://github.com/your-username/your-repo.git`
   - **Description:** (optional)

4. Click **Create**

## Step 6: Create and Run Ticket

1. On the project page, click **New Ticket**

2. Configure:
   - **Title:** Bug or feature description
   - **Description:** Detailed explanation of the issue
   - **Context:** (optional) Steps to reproduce, expected behavior, etc.

3. Click **Create**

4. Click the **Run** button on the ticket

5. Select the `Local Docker` clanker

6. Click **Start Job**

7. You'll be redirected to the Job page. Status will be `pending` initially.

8. Refresh the page periodically to see status updates:
   - `pending` -> `running` -> `completed` / `failed`

9. On completion, check the **Pull Request URL** link to view the created PR on GitHub

## Verification Commands

```bash
# Check backend health
curl http://localhost:8888/health

# Check active jobs
curl http://localhost:8888/api/jobs | jq

# List running containers (should see viberator-job-* containers)
docker ps

# View worker logs (replace <jobId> with actual job ID)
docker logs viberator-job-<jobId>

# Check Docker socket access
ls -l /var/run/docker.sock
# Expected: srw-rw---- 1 root docker (your user should be in docker group)
```

## Troubleshooting

### Docker Socket Permission Denied

**Error:** `ECONNREFUSED` or `EACCES` when starting container

**Solution:** Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
# Log out and back in, or run:
newgrp docker
```

**Verify:** `docker ps` should work without `sudo`

---

### Container Cannot Reach Platform API

**Error:** Callback fails with connection refused, job stays in `running` state

**Solution depends on OS:**

**Linux:**
Use Docker bridge IP instead of `host.docker.internal`:
```json
{
  "environmentVariables": {
    "PLATFORM_API_URL": "http://172.17.0.1:8888"
  }
}
```
Verify bridge IP:
```bash
docker network inspect bridge | grep Gateway
```

**Mac/Windows:**
Verify `host.docker.internal` resolves inside container:
```bash
docker run --rm alpine ping -c 1 host.docker.internal
```

---

### Image Not Found

**Error:** `no such image: viberator-worker:local` or `Error: image not found`

**Solution:** Rebuild the image:
```bash
cd /path/to/viberator/viberator/infrastructure
docker build -f docker/viberator-docker-worker.Dockerfile -t viberator-worker:local ../app
```

**Verify:** `docker images | grep viberator-worker`

---

### GitHub Push Fails

**Error:** `remote: Permission denied` or `authentication failed`

**Solution:** Ensure your GitHub PAT has the correct scope:
1. Go to GitHub Settings > Developer Settings > Personal Access Tokens
2. Verify token has `repo` scope (full control of private repositories)
3. Regenerate token if needed
4. Update clanker deployment config with new token

**Verify token works:**
```bash
curl -H "Authorization: token ghp_your_token" https://api.github.com/user
```

---

### Clanker Not Ready

**Error:** "Clanker not ready" or "No active clanker found"

**Solution:** Verify clanker configuration:
1. Clanker status must be `active` (not `inactive`)
2. Deployment Strategy must be set
3. Deployment config must have valid JSON

**Verify via API:**
```bash
curl http://localhost:8888/api/clankers | jq '.clankers[] | select(.name=="Local Docker")'
```

---

### Container Exits Immediately

**Error:** Container starts but exits immediately

**Solution:** Check container logs:
```bash
docker logs viberator-job-<jobId>
```

Common causes:
- Missing environment variables (GITHUB_TOKEN, ANTHROPIC_API_KEY)
- Invalid JSON in deployment config
- Backend not reachable from container

---

### Job Stuck in Running State

**Error:** Job stays `running` forever, container has exited

**Solution:** Check if callback reached backend:
```bash
curl http://localhost:8888/api/jobs | jq '.jobs[] | select(.id=="<jobId>")'
```

If job exists but status didn't update:
1. Check container logs for callback errors
2. Verify `PLATFORM_API_URL` is correct
3. Check backend logs for POST `/api/jobs/:id/result`

---

## Known Limitations

| Limitation | Impact | Future Phase |
|-----------|--------|--------------|
| **No log streaming** | Logs only visible via `docker logs`, not in UI | Phase 7 |
| **Manual refresh** | Job status requires page refresh to update | Phase 5 (polling), Phase 7 (SSE) |
| **Single tenant** | Tenant ID hardcoded to "api-server" | Multi-tenant support |
| **No progress updates** | No real-time feedback during agent execution | Phase 7 |

## Quick Reference

**Start all services:**
```bash
# Terminal 1: Database
cd platform/backend && docker-compose up -d postgres

# Terminal 2: Backend
cd platform/backend && npm run dev

# Terminal 3: Frontend
cd platform/frontend && npm run dev
```

**Stop all services:**
```bash
# Stop containers
docker-compose down

# Kill any remaining viberator-job containers
docker ps -q --filter "name=viberator-job" | xargs -r docker stop
```

**Rebuild worker image:**
```bash
cd viberator/infrastructure
docker build -f docker/viberator-docker-worker.Dockerfile -t viberator-worker:local ../app
```

---

**Next steps:** See [AWS_ECS_SETUP.md](./AWS_ECS_SETUP.md) for cloud deployment guide.
