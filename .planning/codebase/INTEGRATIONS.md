# External Integrations

**Analysis Date:** 2026-01-19

## APIs & External Services

**AI/LLM Providers:**
- Anthropic Claude - AI coding agent via `@anthropic-ai/claude-code`
  - SDK/Client: `@anthropic-ai/claude-code`, `@anthropic-ai/claude-agent-sdk`
  - Auth: `ANTHROPIC_API_KEY` (also accepts `CLAUDE_CODE_API_KEY`)
  - Location: `viberator/app/src/agents/ClaudeCodeAgent.ts`

**Additional AI Agents (Configurable):**
- Qwen (Alibaba) - `QWEN_API_KEY`, `QWEN_CLI_API_KEY`
- OpenAI Codex - `CODEX_API_KEY`
- Mistral - `MISTRAL_VIBE_API_KEY`
- Gemini CLI - `GEMINI_CLI_API_KEY`

**Project Management Systems:**
- GitHub - Repository access and issue management
  - Auth: `GITHUB_TOKEN` or `GH_TOKEN`
  - Implementation: `viberator/app/src/scm/providers/GithubAuthProvider.ts`
- Jira - Ticket/issue management (placeholder implementation)
  - Auth: `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_USERNAME`
  - Webhook endpoint: `POST /api/webhooks/jira`
- Linear - Ticket/issue management (placeholder implementation)
  - Auth: `LINEAR_API_KEY`
  - Webhook endpoint: `POST /api/webhooks/linear`

## Data Storage

**Databases:**
- PostgreSQL (Primary relational database)
  - Connection: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`
  - Client: Kysely (type-safe query builder) with `pg` driver
  - Config: `platform/backend/src/persistence/config/database.ts`
  - Migrations: `platform/backend/migrations/` using Kysely

**File Storage:**
- AWS S3 - Media asset storage (screenshots, recordings, uploads)
  - SDK: `aws-sdk` v2
  - Config: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`
  - Service: `platform/backend/src/services/FileUploadService.ts`
  - Signed URL generation for private files

**Caching:**
- Redis - Message queue backend and caching
  - Connection: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - Client: `redis` npm package
  - Used by: Bull job queues in `platform/backend/src/services/MessageQueueService.ts`

## Authentication & Identity

**Auth Provider:**
- Custom multi-provider authentication
  - Implementation: `viberator/app/src/scm/SCMAuthFactory.ts`
  - Providers:
    - GitHub: Personal access token support (`GITHUB_TOKEN`)
    - URL-based token injection for git operations

**API Authentication:**
- API key-based authentication for backend endpoints
  - Config: `API_KEY_SECRET`
  - Implementation: Express middleware in `platform/backend/src/api/app.ts`

**Tenant-Aware Secrets:**
- AWS SSM Parameter Store for multi-tenant configuration
  - Path prefix: `/viberator/tenants/{tenantId}/{key}`
  - Utility: `viberator/app/src/utils/secrets.ts`
  - Used in: Lambda/ECS worker deployments

## Monitoring & Observability

**Error Tracking:**
- None currently integrated

**Logs:**
- Winston 3.11 - Structured logging (orchestrator)
  - Config: `LOG_LEVEL`, `LOG_FORMAT` (json or text)
- Morgan - HTTP request logging (backend Express)
- CloudWatch Logs - AWS Lambda/ECS logging via awslogs driver

## CI/CD & Deployment

**Hosting:**
- AWS ECS Fargate - Long-running worker containers
- AWS Lambda - Event-driven worker jobs
- Self-hosted - Docker Compose for local development

**CI Pipeline:**
- None configured (monorepo uses npm workspaces with local builds)

**Infrastructure as Code:**
- Pulumi (`viberator/infrastructure/infra/index.ts`)
  - ECR repositories for container images
  - SQS queues for job dispatch
  - Lambda functions with SQS triggers
  - ECS Fargate cluster and task definitions
  - IAM roles for SSM access

## Environment Configuration

**Required env vars:**

**Platform Backend (`platform/backend`):**
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vibug_receiver
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=vibug-media
PORT=3000
API_KEY_SECRET=your_api_key_secret
```

**PM System Integrations:**
```
JIRA_BASE_URL=
JIRA_USERNAME=
JIRA_API_TOKEN=
GITHUB_TOKEN=
LINEAR_API_KEY=
```

**Orchestrator (`viberator/app`):**
```
MODE=server|worker|lambda
PORT=3000
LOG_LEVEL=info
LOG_FORMAT=json
MAX_CONCURRENT_JOBS=3
DEFAULT_TIMEOUT=2700
RETRY_ATTEMPTS=2
AWS_REGION=us-west-2
SSM_PARAMETER_PATH=/vibug-viberator
CLAUDE_CODE_API_KEY=your_claude_api_key_here
QWEN_CLI_API_KEY=your_qwen_api_key_here
```

**Secrets location:**
- Development: `.env` files (not committed)
- Production: AWS SSM Parameter Store (tenant-scoped paths)
- Docker: Environment variables in containers or Docker secrets

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/jira` - Jira ticket events (placeholder)
  - Implementation: `platform/backend/src/api/routes/webhooks.ts`
- `POST /api/webhooks/linear` - Linear ticket events (placeholder)
  - Implementation: `platform/backend/src/api/routes/webhooks.ts`
- `POST /api/webhooks/trigger-autofix` - Manual auto-fix trigger
  - Body: `{ ticketId, ticketSystem, repositoryUrl }`

**Outgoing:**
- GitHub API calls via axios for repository operations
  - Implementation: `viberator/app/src/services/GitService.ts`

**Internal Message Queues:**
- Bull queues (Redis-backed):
  - `auto-fix-queue` - Jobs for AI agent auto-fixes
  - `bug-report-queue` - Bug report processing jobs

## Development & Testing Services

**Testcontainers:**
- PostgreSQL containerized for integration tests
  - Package: `@testcontainers/postgresql`
- LocalStack container for AWS mock testing
  - Package: `@testcontainers/localstack`

**E2E Testing:**
- Playwright browsers (Chromium, Firefox)
- Docker Compose services for E2E environment
  - Config: `e2e-tests/docker/docker-compose.e2e.yaml`

---

*Integration audit: 2026-01-19*
