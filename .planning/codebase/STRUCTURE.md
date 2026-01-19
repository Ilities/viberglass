# Codebase Structure

**Analysis Date:** 2026-01-19

## Directory Layout

```
[project-root]/
├── packages/              # Shared types package (workspace, not yet created)
├── platform/              # Platform UI and backend
│   ├── backend/          # Express API server
│   └── frontend/         # Next.js web application
├── viberator/            # AI Agent Orchestrator
│   ├── app/              # Core orchestrator code
│   └── infrastructure/   # Cloud infrastructure (Pulumi)
├── e2e-tests/            # End-to-end tests (workspace)
├── .planning/            # Planning documents (GSD)
└── package.json          # Monorepo root
```

## Directory Purposes

**`platform/backend/`**
- Purpose: REST API server for ticket capture, project management, clanker deployment
- Contains: Express application, database DAOs, service layer, integrations
- Key files: `src/api/app.ts`, `src/api/server.ts`, `src/persistence/`, `src/services/`

**`platform/frontend/`**
- Purpose: Web UI for managing projects, tickets, and clankers
- Contains: Next.js app router pages, components, API clients
- Key files: `src/app/`, `src/components/`, `src/service/api/`

**`viberator/app/`**
- Purpose: AI agent orchestration for automated bug fixing
- Contains: Agent implementations, worker handlers, git operations, SCM auth
- Key files: `src/orchestrator/`, `src/agents/`, `src/workers/`, `src/scm/`

**`viberator/infrastructure/`**
- Purpose: Cloud infrastructure as code
- Contains: Pulumi stack definitions, Dockerfile references
- Key files: `infra/index.ts`, `docker/`

**`e2e-tests/`**
- Purpose: End-to-end testing across services
- Contains: Playwright or similar E2E test framework
- Key files: Test scenarios and helper utilities

**`.planning/`**
- Purpose: Project planning documents (GSD framework)
- Contains: Codebase analysis, phase plans, session history
- Generated: By GSD commands like `/gsd:map-codebase`

## Key File Locations

### Entry Points

**Orchestrator API Server:**
- `viberator/app/src/index.ts` - Main VibugViberator class with Express routes
- Run: `npm run dev:api -w @viberator/orchestrator`

**Orchestrator CLI Worker:**
- `viberator/app/src/workers/cli-handler.ts` - CLI entry point for ephemeral workers
- Run: `npm run dev:worker -w @viberator/orchestrator`

**Orchestrator Lambda Handler:**
- `viberator/app/src/workers/lambda-handler.ts` - AWS Lambda entry point
- Deployed via: Pulumi in `viberator/infrastructure/infra/index.ts`

**Platform Backend Server:**
- `platform/backend/src/api/server.ts` - Express HTTP server entry point
- Run: `npm run dev -w @viberator/platform-backend`

**Platform Frontend:**
- `platform/frontend/src/app/layout.tsx` - Root layout with ThemeProvider
- Run: `npm run dev -w @viberator/frontend`

### Configuration

**Monorepo:**
- `package.json` - Root workspace configuration, npm scripts

**Backend:**
- `platform/backend/.env.example` - Environment variable template
- `platform/backend/tsconfig.json` - TypeScript configuration
- `platform/backend/jest.config.js` - Unit test configuration
- `platform/backend/jest.integration.config.js` - Integration test configuration

**Frontend:**
- `platform/frontend/next.config.mjs` - Next.js configuration
- `platform/frontend/tsconfig.json` - TypeScript configuration
- `platform/frontend/tailwindcss` configuration (PostCSS)
- `platform/frontend/jest.config.js` - Jest configuration

**Orchestrator:**
- `viberator/app/src/config/ConfigManager.ts` - Configuration loader
- `viberator/app/tsconfig.json` - TypeScript configuration
- Environment variables: `CONFIG_PATH`, `LOG_LEVEL`, `WORK_DIR`

**Infrastructure:**
- `viberator/infrastructure/infra/index.ts` - Pulumi stack definition
- `viberator/infrastructure/WORKERS.md` - Worker architecture documentation

### Core Logic

**Agent System:**
- `viberator/app/src/agents/BaseAgent.ts` - Abstract base class for all agents
- `viberator/app/src/agents/AgentFactory.ts` - Factory for creating agent instances
- `viberator/app/src/agents/ClaudeCodeAgent.ts` - Claude Code CLI implementation
- `viberator/app/src/agents/QwenCodeAgent.ts` - Qwen CLI/API implementation
- `viberator/app/src/agents/CodexAgent.ts` - OpenAI Codex implementation
- `viberator/app/src/agents/MistralVibeAgent.ts` - Mistral AI implementation
- `viberator/app/src/agents/GeminiCLIAgent.ts` - Google Gemini CLI implementation

**Orchestration:**
- `viberator/app/src/orchestrator/AgentOrchestrator.ts` - Agent selection and execution
- `viberator/app/src/workers/viberator.ts` - Worker task execution logic

**Git Operations:**
- `viberator/app/src/services/GitService.ts` - Git clone, commit, push, PR creation
- `viberator/app/src/scm/SCMAuthFactory.ts` - SCM authentication URL factory
- `viberator/app/src/scm/providers/GithubAuthProvider.ts` - GitHub auth
- `viberator/app/src/scm/providers/GitlabAuthProvider.ts` - GitLab auth
- `viberator/app/src/scm/providers/BitbucketAuthProvider.ts` - Bitbucket auth

**Database Access:**
- `platform/backend/src/persistence/config/database.ts` - Kysely connection
- `platform/backend/src/persistence/clanker/ClankerDAO.ts` - Clanker CRUD
- `platform/backend/src/persistence/ticketing/TicketDAO.ts` - Ticket CRUD
- `platform/backend/src/persistence/project/ProjectDAO.ts` - Project CRUD
- `platform/backend/src/persistence/clanker/DeploymentStrategyDAO.ts` - Strategy CRUD

**API Routes:**
- `platform/backend/src/api/routes/tickets.ts` - Ticket endpoints
- `platform/backend/src/api/routes/projects.ts` - Project endpoints
- `platform/backend/src/api/routes/clankers.ts` - Clanker endpoints
- `platform/backend/src/api/routes/webhooks.ts` - Webhook receivers
- `platform/backend/src/api/routes/jobs.ts` - Job queue endpoints
- `platform/backend/src/api/routes/deployment-strategies.ts` - Strategy endpoints

**Services:**
- `platform/backend/src/services/JobService.ts` - Job lifecycle management
- `platform/backend/src/services/FileUploadService.ts` - S3 file uploads
- `platform/backend/src/services/MessageQueueService.ts` - SQS operations

### Testing

**Backend Tests:**
- `platform/backend/src/__tests__/unit/` - Unit tests (not yet created)
- `platform/backend/src/__tests__/integration/` - Integration tests
- `platform/backend/src/__tests__/helpers/` - Test utilities (testContainers, testServer)

**Orchestrator Tests:**
- `viberator/app/src/__tests__/` - Test directory (newly added)
- `viberator/app/src/agents/AgentFactory.test.ts` - Agent factory tests
- `viberator/app/src/services/GitService.test.ts` - Git service tests

**E2E Tests:**
- `e2e-tests/` - End-to-end test suite (workspace package)

### Types

**Orchestrator Types:**
- `viberator/app/src/types/index.ts` - Core orchestrator types (AgentConfig, BugReport, ExecutionContext, etc.)

**Backend Types:**
- `platform/backend/src/persistence/types/database.ts` - Kysely database schema types
- `platform/backend/src/types/Job.ts` - Job-related types

**Shared Types:**
- `packages/types/` - Shared types package (referenced but not yet created)

## Naming Conventions

**Files:**
- PascalCase for TypeScript classes and React components: `AgentFactory.ts`, `BaseAgent.ts`, `navbar.tsx`
- kebab-case for utilities and configs: `cli-handler.ts`, `docker-compose.yml`
- `*.test.ts` or `*.integration.test.ts` for test files
- `*.spec.ts` for Jest spec files

**Directories:**
- kebab-case for feature directories: `deployment-strategies/`, `ticketing/`, `clanker/`
- plural nouns for entity collections: `agents/`, `routes/`, `components/`
- `__tests__` for test directories colocated with source

**Database Tables:**
- snake_case: `clankers`, `deployment_strategies`, `media_assets`, `clanker_config_files`

**API Endpoints:**
- kebab-case path parameters: `/api/clankers/:slug`
- RESTful naming: `/api/tickets`, `/api/jobs`, `/api/deployment-strategies`

## Where to Add New Code

**New Agent:**
- Implementation: `viberator/app/src/agents/[AgentName]Agent.ts`
- Factory registration: Add case to `viberator/app/src/agents/AgentFactory.ts`
- Type definition: Add to AgentConfig name union in `viberator/app/src/types/index.ts`
- Tests: `viberator/app/src/agents/[AgentName]Agent.test.ts`

**New API Route:**
- Route handler: `platform/backend/src/api/routes/[resource].ts`
- DAO (if new entity): `platform/backend/src/persistence/[entity]/[Entity]DAO.ts`
- Validation schema: `platform/backend/src/api/middleware/schemas.ts`
- Mount in app: Add to `platform/backend/src/api/app.ts`

**New Frontend Page:**
- Page component: `platform/frontend/src/app/(app)/[route]/page.tsx`
- Layout (if needed): `platform/frontend/src/app/(app)/[route]/layout.tsx`
- Reusable component: `platform/frontend/src/components/[name].tsx`
- API client: `platform/frontend/src/service/api/[resource]-api.ts`

**New Service:**
- Service class: `platform/backend/src/services/[ServiceName].ts`
- Register in DI (if applicable): Inject in route constructors

**New Integration:**
- Base class extension: `platform/backend/src/integrations/[System]Integration.ts`
- Extend `BasePMIntegration` for PM systems
- Webhook handler: Add route to `platform/backend/src/api/routes/webhooks.ts`

**New Deployment Strategy:**
- DAO methods: `platform/backend/src/persistence/clanker/DeploymentStrategyDAO.ts`
- Pulumi resources: `viberator/infrastructure/infra/index.ts`

**Utilities:**
- Backend utility: `platform/backend/src/utils/[name].ts` (create if needed)
- Orchestrator utility: `viberator/app/src/utils/[name].ts`
- Frontend utility: `platform/frontend/src/lib/[name].ts` or `src/utils/[name].ts`

## Special Directories

**`dist/` directories:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by `tsc` or `tsup`)
- Committed: No (gitignored)

**`node_modules/` directories:**
- Purpose: npm package dependencies
- Generated: Yes (by `npm install`)
- Committed: No (gitignored)

**`.next/` directory (frontend):**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (gitignored)

**`workdir/` directory (orchestrator):**
- Purpose: Temporary workspace for git cloning during agent execution
- Generated: Yes (at runtime)
- Committed: No

**`migrations/` directory (backend):**
- Purpose: Database migration scripts
- Location: `platform/backend/migrations/`
- Generated: Manually created
- Committed: Yes

**`public/` directory (frontend):**
- Purpose: Static assets (images, logos, flags)
- Location: `platform/frontend/public/`
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-01-19*
