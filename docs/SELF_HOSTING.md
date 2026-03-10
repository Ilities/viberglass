# Self-Hosting Viberglass

This guide explains how to self-host Viberglass on your own infrastructure.

## Overview

Viberglass can be deployed in two ways:

1. **Self-hosted** (this guide) - Run on your own servers/cloud
2. **Hosted SaaS** - Multi-tenant hosted version on AWS (internal use)

This document focuses on self-hosting for teams who want full control over their data and infrastructure.

## Architecture

Viberglass consists of:

- **Backend API** (Node.js/Express) - Core application server
- **Frontend** (React) - Web interface
- **PostgreSQL** - Primary database
- **Workers** - Background job processing (Docker-based)

## Minimum Requirements

### Hardware

- **CPU**: 2 cores minimum, 4+ cores recommended
- **RAM**: 4GB minimum, 8GB+ recommended
- **Storage**: 20GB minimum, 50GB+ recommended
- **Network**: Public internet access for webhooks

### Software

- **Docker** 20.10+ and Docker Compose 2.0+
- **PostgreSQL** 14+ (can run in Docker)
- **Node.js** 18+ (for local development only)
- **Git** (for repository cloning)

## Quick Start with Docker Compose

The fastest way to get started is with Docker Compose:

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/viberglass.git
cd viberglass
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
DATABASE_URL=postgresql://postgres:password@postgres:5432/viberglass

# Application
NODE_ENV=production
PORT=8888
FRONTEND_URL=http://localhost:3000

# Session & Security
SESSION_SECRET=your-random-session-secret-here
JWT_SECRET=your-random-jwt-secret-here

# Integrations (optional)
GITHUB_TOKEN=ghp_your_github_token
GITHUB_WEBHOOK_SECRET=your-webhook-secret
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Email (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password
```

### 3. Start Services

```bash
docker compose up -d
```

This will start:
- PostgreSQL database on port 5432
- Backend API on port 8888
- Frontend on port 3000

### 4. Initialize Database

```bash
docker compose exec backend npm run migrate:latest
```

### 5. Access the Application

Open your browser to `http://localhost:3000`

First time setup:
- Create an admin account. Account creation is disabled after initial setup.

## Production Deployment Options

### Option 1: Docker Compose (Simple)

Best for: Single-server deployments, small teams

**Advantages:**
- Simple setup
- All-in-one deployment
- Easy to maintain

**Disadvantages:**
- Single point of failure
- Limited scalability
- Manual backups required

See "Quick Start" above for setup instructions.

#### Production Docker Compose Setup

For production, use this `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_DB: viberglass
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d viberglass"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: viberglass/backend:latest
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/viberglass
      NODE_ENV: production
      PORT: 8888
      SESSION_SECRET: ${SESSION_SECRET}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "8888:8888"
    volumes:
      - ./uploads:/app/uploads

  frontend:
    image: viberglass/frontend:latest
    restart: always
    depends_on:
      - backend
    environment:
      VITE_API_URL: http://backend:8888
    ports:
      - "3000:3000"

  # Automated backups
  backup:
    image: postgres:16
    depends_on:
      - postgres
    volumes:
      - ./backups:/backups
    command: >
      bash -c "
      while true; do
        PGPASSWORD=${DB_PASSWORD} pg_dump -h postgres -U postgres viberglass | gzip > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql.gz
        find /backups -name '*.sql.gz' -mtime +7 -delete
        sleep 86400
      done"

volumes:
  postgres-data:
```

### Option 2: AWS ECS (Recommended)

See infra folder for AWS ECS deployment IAC.


### Option 3: Cloud VMs (Flexible)

Best for: Mid-size teams, existing cloud infrastructure

Deploy on cloud VMs (AWS EC2, GCP Compute, Azure VMs, etc.):

1. Provision VM (Ubuntu 22.04+ recommended)
2. Install Docker and Docker Compose
3. Follow Docker Compose steps above
4. Configure reverse proxy (Nginx/Caddy) for HTTPS
5. Set up automated backups to cloud storage

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name viberglass.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name viberglass.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/viberglass.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/viberglass.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8888;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `NODE_ENV` | Yes | `development` | Environment (development/production) |
| `PORT` | No | `8888` | Backend API port |
| `FRONTEND_URL` | Yes | - | Frontend URL for CORS |
| `SESSION_SECRET` | Yes | - | Secret for session signing |
| `JWT_SECRET` | Yes | - | Secret for JWT tokens |
| `GITHUB_TOKEN` | No | - | GitHub personal access token |
| `GITHUB_WEBHOOK_SECRET` | No | - | GitHub webhook secret |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Viberator |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | CORS allowed origins (comma-separated) |
| `CLOUDWATCH_METRICS_ENABLED` | No | `false` | Enable CloudWatch metrics (AWS only) |

### Generating Secrets

Generate secure random secrets for production:

```bash
# Session secret
openssl rand -base64 32

# JWT secret
openssl rand -base64 32

# GitHub webhook secret
openssl rand -hex 20
```

## Database Setup

### PostgreSQL Configuration

Recommended PostgreSQL settings for production:

```sql
-- Increase connection limit
ALTER SYSTEM SET max_connections = 200;

-- Optimize for workload
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';

-- Enable logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

-- Reload configuration
SELECT pg_reload_conf();
```

### Running Migrations

Migrations run automatically on startup if `RUN_MIGRATIONS_ON_STARTUP=true`.

To run manually:

```bash
# Via Docker
docker-compose exec backend npm run migrate:latest

# Via npm (local)
npm run migrate:latest -w @viberglass/platform-backend
```

### Database Backups

#### Automated Daily Backups

The production Docker Compose file includes automated daily backups.

Backups are stored in `./backups/` and kept for 7 days.

#### Manual Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres viberglass | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip < backup_20240115.sql.gz | docker-compose exec -T postgres psql -U postgres viberglass
```

#### Cloud Backup

For production, sync backups to cloud storage:

```bash
# AWS S3
aws s3 sync ./backups s3://your-bucket/viberglass-backups/

# Google Cloud Storage
gsutil rsync -r ./backups gs://your-bucket/viberglass-backups/

# Backblaze B2
b2 sync ./backups b2://your-bucket/viberglass-backups/
```

## Monitoring

### Health Checks

Backend health endpoint: `GET /health`

Returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### Logging

Logs are written to:
- **Console** (captured by Docker)
- **Files** (if configured): `./logs/application-%DATE%.log`

View logs:

```bash
# Backend logs
docker-compose logs -f backend

# Database logs
docker-compose logs -f postgres

# All logs
docker-compose logs -f
```

### Metrics (Optional)

If deployed on AWS with `CLOUDWATCH_METRICS_ENABLED=true`, metrics are automatically sent to CloudWatch.

For self-hosted deployments, consider:
- **Prometheus** + Grafana for metrics
- **Loki** for log aggregation
- **Sentry** for error tracking

## Scaling

### Horizontal Scaling

To run multiple backend instances:

1. **Use external PostgreSQL** (not Docker-managed)
2. **Add Redis** for shared rate limiting
3. **Use load balancer** (Nginx, HAProxy, or cloud LB)

Example with Redis:

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: always

  backend:
    # ... existing config
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    deploy:
      replicas: 3
```

### Vertical Scaling

Increase resources for Docker containers:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

## Security Checklist

- [ ] Change default admin password immediately
- [ ] Use strong, random secrets (SESSION_SECRET, JWT_SECRET)
- [ ] Enable HTTPS (use Let's Encrypt with Certbot)
- [ ] Configure firewall (allow only 80, 443, and SSH)
- [ ] Keep Docker images updated
- [ ] Enable automated security patches on host OS
- [ ] Restrict database access (localhost or private network only)
- [ ] Regular backup testing
- [ ] Configure ALLOWED_ORIGINS strictly
- [ ] Use environment variables, never commit secrets
- [ ] Enable Docker content trust: `export DOCKER_CONTENT_TRUST=1`
- [ ] Review Docker image vulnerabilities: `docker scan viberglass/backend`

## Troubleshooting

### Backend won't start

**Check logs:**
```bash
docker-compose logs backend
```

**Common issues:**
- Database not ready: Wait for PostgreSQL to be healthy
- Missing environment variables: Check `.env` file
- Port already in use: Change PORT in `.env`

### Database connection errors

**Test connection:**
```bash
docker-compose exec backend psql $DATABASE_URL -c "SELECT 1"
```

**Check PostgreSQL status:**
```bash
docker-compose exec postgres pg_isready
```

### Frontend can't reach backend

**Check CORS configuration:**
- Ensure `ALLOWED_ORIGINS` includes frontend URL
- Check `VITE_API_URL` points to correct backend

### Migrations failing

**Reset database** (WARNING: destroys all data):
```bash
docker-compose down -v
docker-compose up -d
docker-compose exec backend npm run migrate:latest
```

### Out of disk space

**Check disk usage:**
```bash
df -h
docker system df
```

**Clean up Docker:**
```bash
docker system prune -a
docker volume prune
```

## Updates and Upgrades

### Updating Viberglass

1. **Backup database first!**
2. Pull latest code: `git pull origin main`
3. Rebuild images: `docker-compose build`
4. Stop services: `docker-compose down`
5. Start services: `docker-compose up -d`
6. Run migrations: `docker-compose exec backend npm run migrate:latest`

### Rolling back

If update fails:

1. Stop services: `docker-compose down`
2. Checkout previous version: `git checkout <previous-tag>`
3. Restore database backup (if needed)
4. Start services: `docker-compose up -d`

## Support

- **GitHub Issues**: https://github.com/yourusername/viberglass/issues
- **Documentation**: https://docs.viberglass.dev
- **Community**: https://discord.gg/viberglass

## License

Viberglass is open source software licensed under [LICENSE_TYPE].
