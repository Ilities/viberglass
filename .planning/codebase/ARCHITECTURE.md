# Architecture

**Analysis Date:** 2026-01-19

## Pattern Overview

**Overall:** Multi-tier monorepo with orchestrated AI agent workers and platform services

**Key Characteristics:**
- Monorepo with npm workspaces containing three main packages
- AI agent orchestrator using factory pattern for multiple coding agents
- REST API backend with PostgreSQL persistence using Kysely query builder
- Next.js frontend with app router and server components
- Ephemeral worker pattern for containerized AI task execution
- Infrastructure as Code using Pulumi for AWS deployments

## Layers

### Orchestrator Layer
- Purpose: AI agent selection, coordination, and execution for bug fixing
- Location: `viberator/app/src/`
- Contains: Agent implementations, orchestration logic, SCM integration, worker handlers
- Depends on: AI coding CLIs (claude-code, qwen, codex, mistral), git operations, configuration
- Used by: Platform backend (via job queue), Lambda/ECS workers

**Key components:**
- `orchestrator/AgentOrchestrator.ts` - Scores and selects agents, manages execution lifecycle
- `agents/` - Factory pattern with BaseAgent abstract class and concrete implementations
- `scm/` - Source control management authentication (GitHub, GitLab, Bitbucket)
- `workers/` - CLI and Lambda entry points for ephemeral execution

### API Layer
- Purpose: HTTP REST API for platform functionality
- Location: `platform/backend/src/api/`
- Contains: Express server, route handlers, middleware
- Depends on: Persistence layer, services, integrations
- Used by: Frontend, external webhooks

**Key components:**
- `app.ts` - Express application setup with CORS, middleware, route mounting
- `server.ts` - HTTP server with graceful shutdown
- `routes/` - Modular route handlers (tickets, projects, clankers, webhooks, jobs)

### Persistence Layer
- Purpose: Database access and data modeling
- Location: `platform/backend/src/persistence/`
- Contains: DAOs for each entity, database connection, type definitions
- Depends on: PostgreSQL via Kysely query builder
- Used by: API routes, services

**Key components:**
- `config/database.ts` - Kysely connection with connection pooling
- `clanker/ClankerDAO.ts` - Clanker entity CRUD with config file management
- `ticketing/TicketDAO.ts` - Ticket CRUD with media asset joins
- `project/ProjectDAO.ts` - Project entity operations
- `types/database.ts` - Database schema type definitions

### Service Layer
- Purpose: Business logic for jobs, file uploads, messaging
- Location: `platform/backend/src/services/`
- Contains: Job queue management, file upload to S3, message queue operations
- Depends on: Persistence layer, AWS SDK
- Used by: API routes

**Key components:**
- `JobService.ts` - Job lifecycle management (submit, update status, query)
- `FileUploadService.ts` - S3 integration for ticket media

### Integration Layer
- Purpose: External system integration (GitHub, PM systems)
- Location: `platform/backend/src/integrations/`
- Contains: Abstract base classes for PM integrations, GitHub integration
- Depends on: External APIs (GitHub REST API)
- Used by: Webhook handlers, ticket creation flow

**Key components:**
- `BasePMIntegration.ts` - Abstract class with auto-fix detection logic
- `GitHubIntegration.ts` - GitHub-specific API operations

### Frontend Layer
- Purpose: Web UI for project and clanker management
- Location: `platform/frontend/src/`
- Contains: Next.js app router pages, components, API clients, contexts
- Depends on: Platform backend API, Headless UI components
- Used by: End users via browser

**Key components:**
- `app/` - Next.js app router with route groups `(app)` and `(auth)`
- `components/` - Reusable UI components (using Headless UI)
- `service/api/` - Type-safe API client functions
- `context/` - React contexts for theme and project state

### Infrastructure Layer
- Purpose: Cloud resource provisioning
- Location: `viberator/infrastructure/infra/`
- Contains: Pulumi definitions for ECR, ECS, Lambda, SQS, IAM
- Depends on: AWS provider, ECR images
- Used by: Deployment pipelines

**Key components:**
- `index.ts` - Complete AWS stack (ECR repository, Lambda function, ECS cluster, SQS queue)

## Data Flow

### Bug Fix Flow (Orchestrator to Worker)

1. **Job submission**: Platform backend receives bug report via API
2. **Job queuing**: `JobService.submitJob()` stores job in PostgreSQL with status "queued"
3. **Worker invocation**: Lambda/ECS worker triggered via SQS or ECS RunTask API
4. **Worker execution**: `ViberatorWorker.executeTask()` clones repository, creates branch
5. **Agent execution**: `AgentOrchestrator.executeAgent()` runs selected AI agent CLI
6. **Result commit**: `GitService` commits changes, pushes branch, creates PR
7. **Status update**: Worker updates job status to "completed" or "failed"

### Ticket Creation Flow

1. **Frontend submission**: User creates ticket with screenshot/recording via form
2. **API routing**: `POST /api/tickets` route handler
3. **File upload**: `FileUploadService` uploads media to S3
4. **Database persistence**: `TicketDAO.createTicket()` stores ticket with media asset references
5. **PM integration**: If `ticketSystem` specified, `BasePMIntegration` creates external ticket
6. **Webhook trigger**: If auto-fix enabled, job queued for AI worker

### Clanker Deployment Flow

1. **Clanker creation**: User creates clanker via `POST /api/clankers`
2. **Strategy association**: Clanker linked to `DeploymentStrategy` with config schema
3. **Config storage**: `ClankerDAO.upsertConfigFiles()` stores deployment configurations
4. **Start request**: `POST /api/clankers/:id/start` triggers deployment
5. **Status update**: Clanker status transitions: inactive -> deploying -> active

**State Management:**
- Database-driven for tickets, jobs, clankers (PostgreSQL)
- In-memory for orchestrator agent selection (Map-based registry)
- React Context for frontend theme and project state

## Key Abstractions

**Agent (Abstract Base Class Pattern):**
- Purpose: Encapsulate AI coding CLI interactions
- Examples: `ClaudeCodeAgent`, `QwenCodeAgent`, `CodexAgent`, `MistralVibeAgent`, `GeminiCLIAgent`
- Pattern: `BaseAgent` abstract class defines template method `execute()`, subclasses implement `executeAgentCLI()` and `requiresApiKey()`

**DAO (Data Access Object Pattern):**
- Purpose: Abstract database operations per entity
- Examples: `ClankerDAO`, `TicketDAO`, `ProjectDAO`, `DeploymentStrategyDAO`
- Pattern: Each DAO handles CRUD for its entity with Kysely queries

**PM Integration (Strategy Pattern):**
- Purpose: Abstract project management system integrations
- Examples: `GitHubIntegration` (extends `BasePMIntegration`)
- Pattern: `BasePMIntegration` defines interface, concrete implementations handle API specifics

**SCM Authentication (Factory Pattern):**
- Purpose: Provide authenticated URLs for git operations
- Examples: `GithubAuthProvider`, `GitlabAuthProvider`, `BitbucketAuthProvider`
- Pattern: `SCMAuthFactory.authenticateUrl()` detects provider and returns authenticated URL

**Worker (Ephemeral Execution Pattern):**
- Purpose: Single-job container execution
- Examples: `ViberatorWorker`, `cli-handler.ts`, `lambda-handler.ts`
- Pattern: Container spins up, processes one job, exits with status code

## Entry Points

**Orchestrator API Server:**
- Location: `viberator/app/src/index.ts`
- Triggers: `npm run dev:api` or `MODE=server` environment variable
- Responsibilities: Initialize configuration, setup HTTP routes, start Express server

**Orchestrator CLI Worker:**
- Location: `viberator/app/src/workers/cli-handler.ts`
- Triggers: `npm run dev:worker` or Docker container entrypoint
- Responsibilities: Parse CLI arguments, initialize `ViberatorWorker`, execute single job, exit

**Orchestrator Lambda Handler:**
- Location: `viberator/app/src/workers/lambda-handler.ts`
- Triggers: AWS Lambda invocation (SQS event source)
- Responsibilities: Parse SQS messages, invoke `ViberatorWorker`, return response

**Platform Backend Server:**
- Location: `platform/backend/src/api/server.ts`
- Triggers: `npm run dev` or `node ./bin/www`
- Responsibilities: Start Express HTTP server, handle graceful shutdown

**Platform Frontend Server:**
- Location: `platform/frontend/` (Next.js)
- Triggers: `npm run dev` (Next.js dev server)
- Responsibilities: Serve React application, API routes, static assets

**Infrastructure Deployment:**
- Location: `viberator/infrastructure/infra/index.ts`
- Triggers: `pulumi up` in infrastructure directory
- Responsibilities: Provision AWS resources (ECR, ECS, Lambda, SQS, IAM)

## Error Handling

**Strategy:** Try-catch with HTTP status codes and logging

**Patterns:**
- API routes: Wrap route handlers in try-catch, return 500 on error with error message
- DAO methods: Throw errors, let API layer handle HTTP response
- Workers: Log errors, exit with status code 1, include `errorMessage` in result JSON
- Frontend: Error boundaries and toast notifications for user feedback

**Cross-cutting error handlers:**
- `platform/backend/src/api/app.ts` - Global Express error handler
- `viberator/app/src/agents/BaseAgent.ts` - Agent execution error handling

## Cross-Cutting Concerns

**Logging:** Winston logger in orchestrator, Morgan middleware in backend, console in workers
- Format: JSON for production, text for development
- Destinations: Console, file (viberglass-viberator.log)

**Validation:** Joi schemas in `platform/backend/src/api/middleware/schemas.ts`
- Request validation middleware applied to route handlers
- Type safety with TypeScript throughout

**Authentication:**
- Orchestrator: SCM tokens via environment variables or SSM Parameter Store
- Platform: Not implemented (open API currently)
- Multi-tenancy: `tenantId` for credential isolation in workers

---

*Architecture analysis: 2026-01-19*
