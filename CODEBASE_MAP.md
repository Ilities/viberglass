# Codebase Map

**Purpose:** LLM navigation reference. Find any file, understand architecture, know where to make changes.
**Last updated:** 2026-04-25

---

## Table of Contents

1. [Top-Level Structure](#1-top-level-structure)
2. [Apps](#2-apps)
   - [platform-backend](#21-apps-platform-backend)
   - [platform-frontend](#22-apps-platform-frontend)
   - [viberator (orchestrator worker)](#23-apps-viberator)
3. [Packages](#3-packages)
4. [Key Files Index — Common Tasks](#4-key-files-index--common-tasks)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Integration Plugin System](#7-integration-plugin-system)
8. [Agent Plugin System](#8-agent-plugin-system)
9. [Testing](#9-testing)
10. [Scripts](#10-scripts)

---

## 1. Top-Level Structure

```
viberator/
├── apps/
│   ├── platform-backend/    Express API server
│   ├── platform-frontend/   React/Vite SPA
│   └── viberator/           Worker process (runs inside Docker/Lambda/ECS)
├── packages/
│   ├── types/               @viberglass/types — shared TypeScript types
│   ├── agent-core/          @viberglass/agent-core — base agent framework
│   ├── agents/              Individual agent plugins (claude-code, codex, gemini…)
│   ├── integration-core/    @viberglass/integration-core — base integration framework
│   ├── integrations/        Individual integration plugins (github, jira, slack…)
│   ├── platform-ui/         @viberglass/platform-ui — shared UI primitives
│   └── chat-slack/          @viberglass/chat-slack — Slack chat adapter
├── infra/
│   ├── base/                Shared Pulumi infra primitives
│   └── platform/            AWS platform infra (ECS, RDS, ALB, Amplify…)
├── tests/
│   └── e2e/                 Playwright end-to-end test package (@viberator/e2e-tests)
├── scripts/
│   ├── new-integration.sh   Scaffold a new integration plugin
│   └── new-agent.sh         Scaffold a new agent plugin
├── docs/                    Operations docs, ADRs
├── TESTING.md               Detailed testing guide
├── docker-compose.yml       Local dev stack
└── package.json             Monorepo root (npm workspaces)
```

---

## 2. Apps

### 2.1 `apps/platform-backend`

npm name: `@viberglass/platform-backend`
Entry point: `src/api/server.ts` → `src/api/app.ts`

```
src/
├── api/
│   ├── app.ts               Express app config, middleware mount, route mount
│   ├── server.ts            HTTP server, background sweepers, migration on startup
│   ├── auth/                Passport.js config, auth context types
│   ├── middleware/           authentication.ts, validation.ts, schemas.ts, tenantValidation.ts,
│   │                        callbackTokenValidation.ts, maliciousRequestBlocker.ts, projectAuthorization.ts
│   ├── routes/              One file per resource group (see Route Map below)
│   └── services/integrations/  IntegrationManagementService, IntegrationWebhookService,
│                                ProjectIntegrationLinkService
├── config/
│   ├── env.ts               Env var loading
│   ├── logger.ts            Winston logger
│   └── deployment/          Deployment-mode detection
├── credentials/
│   └── providers/           AwsSsmProvider, EnvironmentProvider, FileProvider
├── integration-plugins/     DEPRECATED backward-compat re-exports → use packages/integrations instead
├── integrations/
│   └── registerIntegrationPlugins.ts   Composition root: builds IntegrationRegistry singleton
├── migrations/              Kysely migrations 001–057 + migrator.ts
├── models/                  PMIntegration model types
├── persistence/
│   ├── config/database.ts   Kysely + pg Pool singleton
│   ├── types/database.ts    Full Kysely DB schema type + JsonValue/JsonObject
│   ├── agentSession/        AgentSessionDAO, AgentTurnDAO, AgentSessionEventDAO, AgentPendingRequestDAO
│   ├── chat/                ChatSessionThreadDAO, ChatTicketThreadDAO
│   ├── clanker/             ClankerDAO, DeploymentStrategyDAO
│   ├── claw/                ClawTaskTemplateDAO, ClawScheduleDAO, ClawExecutionDAO
│   ├── integrations/        IntegrationDAO, IntegrationConfigDAO, IntegrationCredentialDAO,
│   │                        ProjectIntegrationLinkDAO
│   ├── project/             ProjectDAO, ProjectScmConfigDAO
│   ├── promptTemplate/      PromptTemplateDAO (exports PromptType, PROMPT_TYPE, ALL_PROMPT_TYPES)
│   ├── secret/              SecretDAO
│   ├── ticketing/           TicketDAO, TicketPhaseApprovalDAO, TicketPhaseDocumentDAO,
│   │                        TicketPhaseDocumentRevisionDAO, TicketPhaseDocumentCommentDAO, TicketPhaseRunDAO
│   ├── user/                UserDAO, UserSessionDAO
│   └── webhook/             WebhookConfigDAO, WebhookDeliveryDAO
├── provisioning/            Clanker provisioning: Docker, ECS, Lambda strategies + ports/adapters
├── services/
│   ├── agentSession/        AgentSessionLaunchService, AgentSessionQueryService,
│   │                        AgentSessionWorkerEventService, AgentSessionInteractionService
│   ├── claw/                ClawTaskTemplateService, ClawScheduleService, ClawExecutionService,
│   │                        ClawOrchestrationService, ClawSchedulingEngine, ClawWebhookService
│   ├── errors/              Domain error classes (DomainError, TicketServiceError, JobServiceError,
│   │                        AgentSessionServiceError, ClawServiceError, SecretServiceError,
│   │                        ClankerServiceError)
│   ├── instructions/        InstructionStorageService
│   ├── job/                 (Job-related service helpers)
│   ├── ticket-media/        TicketMediaService helpers
│   ├── ClankerHealthService.ts
│   ├── ClankerProvisioningService.ts
│   ├── CredentialRequirementsService.ts
│   ├── FileUploadService.ts
│   ├── JobService.ts
│   ├── PromptTemplateService.ts
│   ├── SecretResolutionService.ts
│   ├── SecretService.ts
│   ├── TicketExecutionService.ts
│   ├── TicketLifecycleStatusService.ts
│   ├── TicketMediaExecutionService.ts
│   ├── TicketPhaseDocumentCommentService.ts
│   ├── TicketPhaseDocumentRevisionService.ts
│   ├── TicketPhaseDocumentService.ts
│   ├── TicketPhaseOrchestrationService.ts
│   ├── TicketPlanningApprovalService.ts
│   ├── TicketPlanningService.ts
│   ├── TicketResearchService.ts
│   ├── TicketWorkflowOverrideService.ts
│   ├── TicketWorkflowService.ts
│   ├── metrics.ts
│   └── ticketRunOrchestration.ts   Shared logic for prepareTicketRunContext + submitJobWithBootstrapAndInvoke
├── types/
│   ├── Job.ts               JobData, ResearchJobData, etc.
│   └── agentSession.ts      AGENT_SESSION_MODE, AGENT_SESSION_EVENT_TYPE, statuses
├── utils/                   Misc utility functions
├── webhooks/
│   ├── feedback/            FeedbackService, provider-behaviors
│   ├── inbound-processors/  Webhook payload processors per provider
│   ├── middleware/          rawBody middleware
│   ├── providers/           GitHub, Jira, Shortcut, Slack webhook verifiers
│   ├── FeedbackService.ts
│   └── webhookServiceFactory.ts
├── workers/
│   ├── WorkerExecutionService.ts   Submits jobs to invokers
│   ├── WorkerInvoker.ts            Interface
│   ├── WorkerInvokerFactory.ts     Picks Docker/ECS/Lambda based on config
│   ├── HeartbeatSweeper.ts
│   ├── OrphanSweeper.ts
│   └── invokers/                  DockerInvoker, EcsInvoker, LambdaInvoker
├── chat/                    Chat SDK integration (Slack bot)
└── clanker-config/          Clanker agent/strategy config builders
```

#### Route Map (`src/api/routes/`)

| File | Prefix | Key endpoints |
|------|--------|---------------|
| `auth.ts` | `/api/auth` | POST /login, /register, /logout, GET /me |
| `projects.ts` | `/api/projects` | CRUD projects; GET/PUT/DELETE project integrations & SCM config; GET/PUT/DELETE project prompt-templates |
| `tickets.ts` | `/api/tickets` | CRUD tickets; phase docs; phase approvals; agent sessions per ticket |
| `jobs.ts` | `/api/jobs` | GET/POST/DELETE jobs; POST /:id/result, /progress, /logs, /logs/batch, /session-events/batch, /acp-session-id |
| `integrations.ts` | `/api/integrations` | CRUD global integrations; link/unlink projects; inbound/outbound webhook config; credentials |
| `clankers.ts` | `/api/clankers` | CRUD clankers |
| `deployment-strategies.ts` | `/api/deployment-strategies` | CRUD deployment strategies |
| `secrets.ts` | `/api/secrets` | CRUD secrets |
| `users.ts` | `/api/users` | CRUD users |
| `webhooks/` | `/api/webhooks` | github, jira, shortcut, custom, management |
| `claw/` | `/api/claw` | task-templates, schedules, executions, stats |
| `agentSessions.ts` | `/api/agent-sessions` | GET /:sessionId, GET /:sessionId/events |
| `promptTemplates.ts` | `/api/prompt-templates` | GET/PUT system-level prompt templates |

---

### 2.2 `apps/platform-frontend`

npm name: `@viberglass/frontend`
Entry: `src/main.tsx` → `src/App.tsx` → `src/routes.tsx`

```
src/
├── App.tsx                  Root component; wraps with AuthProvider, ThemeProvider, Router
├── routes.tsx               All React Router routes (see Route Table below)
├── layouts/
│   ├── ApplicationLayout.tsx   Main authenticated layout: sidebar nav + topbar + Outlet
│   │                           Contains platformNavItems and projectNavItems arrays
│   └── SettingsLayout.tsx      Nested settings layout with sub-tabs
├── pages/
│   ├── auth/                LoginPage, RegisterPage, ForgotPasswordPage
│   ├── DashboardPage.tsx    Home dashboard
│   ├── NewProjectPage.tsx
│   ├── NotFoundPage.tsx
│   ├── clankers/            ClankersPage, ClankerDetailPage, NewClankerPage, EditClankerPage
│   ├── dashboard/           ProjectConstellationCard, EmptyBay, helpers
│   ├── project/
│   │   ├── ProjectHomePage.tsx
│   │   ├── claws/           ClawsPage (tab container), schedules-tab.tsx, templates-tab.tsx
│   │   ├── jobs/            JobsPage, JobDetailPage, jobs-table.tsx
│   │   ├── prompt-templates/ PromptTemplatesPage.tsx (project-scoped)
│   │   ├── sessions/        SessionPage, LaunchSessionDialog, TranscriptPanel, PendingRequestCard
│   │   ├── settings/        ProjectSettingsPage, ProjectIntegrationsPage
│   │   └── tickets/         TicketsPage, TicketDetailPage, CreateTicketPage, TicketMediaPage,
│   │                        TicketPhaseView, InlineSessionPanel, phase-document-*.tsx,
│   │                        ticket-display.ts (helpers: getSeverityBadge, formatDate…)
│   ├── secrets/             SecretsPage
│   └── settings/
│       ├── IntegrationDetailPage.tsx   Uses integrationFrontendRegistry
│       ├── IntegrationsPage.tsx
│       ├── UsersPage.tsx
│       ├── PromptTemplatesPage.tsx     System-level prompt templates
│       └── integration-detail/        Per-integration webhook sections (GitHub, Jira, Shortcut,
│                                       Slack, Custom) + OutboundWebhookSection, DeliveryHistoryTable
├── components/              Shared UI: Alert, Badge, Button, Dialog, Dropdown, Input, Select,
│                            Table, TabButton, Textarea, Spinner, Breadcrumbs, Sidebar, Navbar,
│                            LogViewer, ProgressTimeline, EmptyState, etc.
├── context/
│   ├── auth-context.tsx     AuthProvider, useAuth() → {user, status, login, logout}
│   ├── project-context.tsx  ProjectProvider, useProject() → {project, isLoading}
│   ├── project-theme.tsx    ProjectTheme (per-project color theming)
│   └── theme-context.tsx    ThemeProvider, useTheme() → {theme, toggleTheme}
├── hooks/
│   ├── useInterval.ts
│   ├── useJobStatus.ts
│   ├── usePolling.ts
│   └── useSessionEventStream.ts   SSE hook for agent session events
├── integrations/
│   └── registerFrontendIntegrationPlugins.ts   Builds IntegrationFrontendRegistry singleton
├── lib/
│   ├── index.ts             Exports API_BASE_URL
│   ├── formatters.ts        Number, date, byte formatters
│   └── project-colors.ts   Project color palette helpers
└── service/
    ├── auth-storage.ts      localStorage token storage
    └── api/
        ├── client.ts        apiFetch() — adds Bearer token from storage
        ├── auth-api.ts      login, logout, register, getCurrentUser
        ├── clanker-api.ts
        ├── claw-api.ts
        ├── integration-api.ts
        ├── job-api.ts
        ├── project-api.ts
        ├── prompt-template-api.ts
        ├── secret-api.ts
        ├── session-api.ts
        ├── ticket-api.ts
        └── user-api.ts
```

#### Frontend Route Table

| Path | Component |
|------|-----------|
| `/login` | `LoginPage` |
| `/register` | `RegisterPage` |
| `/forgot-password` | `ForgotPasswordPage` |
| `/` | `DashboardPage` |
| `/new` | `NewProjectPage` |
| `/clankers` | `ClankersPage` |
| `/clankers/new` | `NewClankerPage` |
| `/clankers/:slug` | `ClankerDetailPage` |
| `/clankers/:slug/edit` | `EditClankerPage` |
| `/secrets` | `SecretsPage` |
| `/settings/integrations` | `IntegrationsPage` |
| `/settings/integrations/new/:integrationSystem` | `IntegrationDetailPage` |
| `/settings/integrations/:integrationEntityId` | `IntegrationDetailPage` |
| `/settings/users` | `UsersPage` |
| `/settings/prompt-templates` | `PromptTemplatesPage` (system) |
| `/project/:project` | `ProjectHomePage` |
| `/project/:project/tickets` | `TicketsPage` |
| `/project/:project/tickets/create` | `CreateTicketPage` |
| `/project/:project/tickets/:id` | `TicketDetailPage` |
| `/project/:project/tickets/:id/media` | `TicketMediaPage` |
| `/project/:project/jobs` | `JobsPage` |
| `/project/:project/jobs/:jobId` | `JobDetailPage` |
| `/project/:project/claws` | `ClawsPage` |
| `/project/:project/sessions/:sessionId` | `SessionPage` |
| `/project/:project/settings/project` | `ProjectSettingsPage` |
| `/project/:project/settings/integrations` | `ProjectIntegrationsPage` |
| `/project/:project/settings/prompt-templates` | `PromptTemplatesPage` (project) |

---

### 2.3 `apps/viberator`

The **worker process** — runs inside Docker containers, ECS tasks, or Lambda functions. Clones repositories, invokes AI agents, reports results back via callback APIs.

```
src/
├── agents/
│   └── registerPlugins.ts   Builds AgentRegistry; imports all agent plugins
├── acp/                     ACP client, event mapper, session event forwarder
├── config/
│   ├── ConfigManager.ts     Loads config from files/SSM
│   ├── SsmConfigLoader.ts
│   └── clankerConfig.ts
├── orchestrator/
│   └── AgentOrchestrator.ts Selects and runs the appropriate agent
├── scm/
│   ├── SCMAuthFactory.ts
│   └── providers/           GithubAuthProvider, GitlabAuthProvider, BitbucketAuthProvider
├── services/
│   └── GitService.ts        Clone, checkout, commit, push
├── types/                   Worker-internal types
├── utils/
│   └── secrets.ts
└── workers/
    ├── core/
    │   ├── ViberatorWorker.ts   Main worker orchestration class
    │   ├── jobPipeline.ts
    │   ├── runClawJob.ts        Claw (scheduled task) job runner
    │   ├── runSessionTurnJob.ts ACP session turn job runner
    │   ├── phasePrompts.ts      Research/planning prompt builders
    │   ├── pullRequestContent.ts
    │   ├── workerConfig.ts
    │   └── workerHelpers.ts
    ├── entrypoints/
    │   ├── lambda-handler.ts    AWS Lambda entry point
    │   └── cli-handler.ts       CLI / Docker entry point
    ├── infrastructure/
    │   ├── CallbackClient.ts    POSTs results/progress to platform API
    │   ├── CredentialProvider.ts
    │   └── ConfigLoader.ts
    └── runtime/
        ├── InstructionFileManager.ts
        ├── EnvironmentManager.ts
        ├── LogForwarder.ts
        ├── SessionStateManager.ts
        ├── ClankerAgentAuthLifecycleFactory.ts
        └── ClankerAgentEndpointEnvironmentFactory.ts
```

---

## 3. Packages

| Package (npm name) | Location | Purpose | Key exports |
|---|---|---|---|
| `@viberglass/types` | `packages/types/` | Shared TypeScript types used everywhere | `TicketSystem`, `TICKET_SYSTEMS`, `IntegrationSummary`, `IntegrationConfig`, `JOB_KIND`, `TICKET_WORKFLOW_PHASE`, `ClawTaskTemplateSummary`, `ClawScheduleSummary`, `AgentSession`, `AgentSessionEvent`, `INTEGRATION_DESCRIPTIONS`, all ticket/project/claw/job types |
| `@viberglass/integration-core` | `packages/integration-core/` | Base framework for integration plugins | **Backend (`.`):** `IntegrationPlugin`, `IntegrationRegistry`, `BasePMIntegration`, `UnimplementedIntegration`; **Frontend (`./frontend`):** `IntegrationFrontendPlugin`, `IntegrationFrontendRegistry`, `DeliveryHistoryTable`, prop types |
| `@viberglass/integration-github` | `packages/integrations/integration-github/` | GitHub SCM + issue integration | `GitHubIntegration` (backend), `githubFrontendPlugin` (frontend) |
| `@viberglass/integration-jira` | `packages/integrations/integration-jira/` | Jira ticketing integration | `JiraIntegration`, frontend plugin |
| `@viberglass/integration-slack` | `packages/integrations/integration-slack/` | Slack channel integration | `SlackIntegration`, frontend plugin |
| `@viberglass/integration-shortcut` | `packages/integrations/integration-shortcut/` | Shortcut ticketing integration | `ShortcutIntegration`, frontend plugin |
| `@viberglass/integration-gitlab` | `packages/integrations/integration-gitlab/` | GitLab SCM integration | Integration class, frontend plugin |
| `@viberglass/integration-bitbucket` | `packages/integrations/integration-bitbucket/` | Bitbucket SCM integration | Integration class, frontend plugin |
| `@viberglass/integration-linear` | `packages/integrations/integration-linear/` | Linear ticketing integration | Integration class, frontend plugin |
| `@viberglass/integration-monday` | `packages/integrations/integration-monday/` | Monday.com integration | Integration class, frontend plugin |
| `@viberglass/integration-custom` | `packages/integrations/integration-custom/` | Custom inbound webhook integration | `CustomInboundIntegration`, frontend plugin (special-cased in UI) |
| `@viberglass/agent-core` | `packages/agent-core/` | Base framework for agent plugins | `BaseAgent`, `AgentPlugin`, `AgentRegistry`, `AcpExecutor`, `AcpClient`, `AgentAuthLifecycle`, `AgentEndpointEnvironment` |
| `@viberglass/agent-claude-code` | `packages/agents/agent-claude-code/` | Claude Code agent | `claudeCodePlugin` (default export) |
| `@viberglass/agent-codex` | `packages/agents/agent-codex/` | OpenAI Codex agent | `codexPlugin` |
| `@viberglass/agent-gemini` | `packages/agents/agent-gemini/` | Google Gemini CLI agent | `geminiCLIPlugin` |
| `@viberglass/agent-kimi` | `packages/agents/agent-kimi/` | Kimi Code agent | `kimiCodePlugin` |
| `@viberglass/agent-mistral-vibe` | `packages/agents/agent-mistral-vibe/` | Mistral Vibe agent (vibe-acp) | `mistralVibePlugin` |
| `@viberglass/agent-opencode` | `packages/agents/agent-opencode/` | OpenCode agent | `openCodePlugin` |
| `@viberglass/agent-pi` | `packages/agents/agent-pi/` | Pi coding agent | `piPlugin` |
| `@viberglass/agent-qwen` | `packages/agents/agent-qwen/` | Qwen Code agent | `qwenCodePlugin` |
| `@viberglass/platform-ui` | `packages/platform-ui/` | Shared React UI primitives for integration packages | `Button`, `Badge`, `Heading`, `Input`, `Select`, `Text`, `Link`, `FieldProvider` |
| `@viberglass/chat-slack` | `packages/chat-slack/` | Slack chat SDK adapter | Slack bot handler helpers |

---

## 4. Key Files Index — Common Tasks

### Add a new API route/endpoint

1. Create/edit route file in `apps/platform-backend/src/api/routes/`
2. If new resource: add `router.use('/api/<resource>', <router>)` in `apps/platform-backend/src/api/app.ts`
3. Add request validation schema to `apps/platform-backend/src/api/middleware/schemas.ts`
4. Add validator middleware to `apps/platform-backend/src/api/middleware/validation.ts`
5. Add frontend API client function in `apps/platform-frontend/src/service/api/<resource>-api.ts`

### Add a new frontend page

1. Create component in `apps/platform-frontend/src/pages/<section>/MyPage.tsx`
2. Register route in `apps/platform-frontend/src/routes.tsx`
3. If needed, add nav item to `platformNavItems` or `projectNavItems` array in `apps/platform-frontend/src/layouts/ApplicationLayout.tsx`

### Add a new service (backend)

1. Create `apps/platform-backend/src/services/MyService.ts`
2. Instantiate and inject dependencies in the relevant route file (manual DI at route level)
3. Add typed domain error class in `apps/platform-backend/src/services/errors/` if needed

### Add a new DAO / database model

1. Create `apps/platform-backend/src/persistence/<domain>/MyDAO.ts`
2. Extend the Kysely `Database` type in `apps/platform-backend/src/persistence/types/database.ts`
3. Write migration: create `apps/platform-backend/src/migrations/<NNN>_describe_change.ts`

### Add a database migration

1. Create `apps/platform-backend/src/migrations/<NNN>_<description>.ts` (next sequential number)
2. Each migration must export `up` and optionally `down` using Kysely schema builder
3. Run: `npm run platform-backend:migrate`

### Add a new type to shared types

1. Edit or create a file in `packages/types/src/`
2. Export it from `packages/types/src/index.ts`
3. Run: `npm run types:build`

### Add a new integration plugin

Run: `npm run new:integration <kebab-name>`

This scaffolds `packages/integrations/integration-<name>/` from `packages/integrations/_template/`.

Then:
1. Implement `src/backend/<PascalName>Integration.ts` (extends `BasePMIntegration`)
2. Fill in `configFields` + `supports` in `src/backend/plugin.ts`
3. Add custom React sections to `src/frontend/` if needed
4. Add to `apps/platform-backend/package.json` and `apps/platform-frontend/package.json`
5. Register in `apps/platform-backend/src/integrations/registerIntegrationPlugins.ts`
6. Register in `apps/platform-frontend/src/integrations/registerFrontendIntegrationPlugins.ts`
7. Add the `id` to `TICKET_SYSTEMS` in `packages/types/src/common.ts` if not already present
8. Run: `npm install && npm run build`

### Add a new agent plugin

Run: `npm run new:agent <kebab-name>`

This scaffolds `packages/agents/agent-<name>/` from `packages/agents/_template/`.

Then:
1. Implement `src/<PascalName>Agent.ts` (extends `BaseAgent`)
2. Fill in `src/plugin.ts` with `AgentPlugin` metadata
3. Register in `apps/viberator/src/agents/registerPlugins.ts`
4. Add to viberator's `package.json`

---

## 5. Backend Architecture

### Pattern

The backend follows a layered architecture with manual dependency injection at the route level:

```
HTTP Request
    ↓
Middleware (auth, validation, rate-limit, malicious-request-blocker)
    ↓
Route Handler (apps/platform-backend/src/api/routes/*.ts)
    ↓
Service Layer (apps/platform-backend/src/services/*.ts)
    ↓
DAO Layer (apps/platform-backend/src/persistence/*/*.ts)
    ↓
Kysely ORM → PostgreSQL
```

### Dependency Injection

There is no IoC container. Services and DAOs are instantiated directly in route files:

```typescript
// In src/api/routes/tickets.ts
const ticketService = new TicketDAO();
const agentSessionLaunchService = new AgentSessionLaunchService(
  new AgentSessionDAO(),
  new AgentTurnDAO(),
  new AgentSessionEventDAO(),
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);
```

For services with complex deps, use constructor injection. Route files serve as the composition root.

### Database Access

- ORM: **Kysely** (type-safe SQL query builder)
- Connection: `apps/platform-backend/src/persistence/config/database.ts` exports `db` singleton
- Schema type: `apps/platform-backend/src/persistence/types/database.ts` — `Database` interface maps every table
- `JsonObject` type (not `Record<string,unknown>`) for strongly-typed JSON columns

### Migrations

- Files: `apps/platform-backend/src/migrations/001_initial_schema.ts` through `057_xml_tag_templates.ts`
- Run: `npm run platform-backend:migrate` (runs `src/migrations/migrator.ts`)
- Each migration exports `up(db: Kysely<any>): Promise<void>` (and optionally `down`)
- Current count: 57 migrations

### Middleware Stack (app.ts)

1. Helmet (security headers)
2. `maliciousRequestBlocker` + `suspiciousIpTracker`
3. HTTP request logger (Winston)
4. JSON body parser (captures raw body for webhook routes)
5. Cookie parser
6. Static files
7. CORS
8. Passport + `attachAuthContext`
9. Routes

### Authentication

- Passport.js with `passport-local` and `passport-custom` (token strategy)
- `requireAuth` middleware: validates Bearer token → attaches `req.auth: AuthContext`
- Auth disabled by `AUTH_ENABLED` env var for local/E2E dev
- Worker callbacks: tenant middleware + callback token validation (no session auth)

### Error Handling

Domain errors extend `DomainError` and are thrown from services. Routes catch and map:
- `AgentSessionServiceError` → 409, 404
- `TicketServiceError` → varies
- `JobServiceError` → varies
- Integration route errors: `isIntegrationRouteServiceError(e)` → `e.statusCode + e.body`

---

## 6. Frontend Architecture

### Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, react-router-dom v7, Sonner (toasts)

### Application Entry

```
src/main.tsx
  └── App.tsx
        ├── ThemeProvider (theme-context.tsx)
        ├── AuthProvider (auth-context.tsx)
        ├── BrowserRouter
        └── AppRoutes (routes.tsx)
              ├── AuthLayout  → /login, /register, /forgot-password
              └── ApplicationLayout → all authenticated routes
                    ├── ProjectProvider (project-context.tsx)
                    ├── ProjectTheme
                    ├── StackedLayout (sidebar + navbar)
                    └── <Outlet /> (page content)
```

### API Communication

All API calls go through `apiFetch` in `apps/platform-frontend/src/service/api/client.ts`:

```typescript
// Reads token from localStorage, adds Bearer header
apiFetch('/api/resource', { method: 'POST', body: JSON.stringify(data) })
```

Base URL: `API_BASE_URL` from `apps/platform-frontend/src/lib/index.ts` (env var `VITE_API_URL` or `http://localhost:8888`).

### State Management

No global state library. State is managed via:
- React context: `useAuth()`, `useProject()`, `useTheme()`
- Local `useState` + `useEffect` for page-level data fetching
- Props for component data

### Contexts

| Hook | Context File | What it provides |
|------|-------------|-----------------|
| `useAuth()` | `src/context/auth-context.tsx` | `user`, `status`, `login`, `logout`, `register` |
| `useProject()` | `src/context/project-context.tsx` | `project`, `isLoading`, `error` |
| `useTheme()` | `src/context/theme-context.tsx` | `theme`, `toggleTheme` |

### UI Conventions

- Toast notifications: `import { toast } from 'sonner'` → `toast.success()` / `toast.error()`
- Error pattern: `throwApiError(res, fallback)` — parse body then throw
- Empty states: `<EmptyState>` component with dashed border, heading, description, CTA button
- Tab switching: `<TabButton>` component from `src/components/tab-button.tsx`
- Dialogs: `<Dialog>` from `src/components/dialog.tsx` (Radix-based)
- Confirmation: `<Alert>` from `src/components/alert.tsx`

### Adding nav items

Edit the `platformNavItems` or `projectNavItems` array in `apps/platform-frontend/src/layouts/ApplicationLayout.tsx`.

---

## 7. Integration Plugin System

### Overview

Each integration is a self-contained npm package with dual entry points (backend + frontend). A registry pattern wires them into the platform.

### Package Structure (per integration)

```
packages/integrations/integration-<name>/
├── src/
│   ├── backend/
│   │   ├── <Name>Integration.ts   Implements BasePMIntegration
│   │   ├── plugin.ts              IntegrationPlugin<Config> definition
│   │   ├── types.ts               Config interface
│   │   └── index.ts               Exports
│   ├── frontend/
│   │   ├── <Name>InboundWebhookSection.tsx
│   │   ├── <Name>OutboundWebhookSection.tsx
��   │   ├── plugin.ts              IntegrationFrontendPlugin definition
│   │   └── index.ts               Exports
│   └── index.ts                   Barrel export (both)
├── package.json                   name: @viberglass/integration-<name>
│                                  exports: "." (backend) + "./frontend" (ESM React)
└── tsup.config.ts
```

### IntegrationPlugin interface (backend)

Defined in `packages/integration-core/src/backend/IntegrationPlugin.ts`:

```typescript
interface IntegrationPlugin<TConfig> {
  id: TicketSystem           // Matches TICKET_SYSTEMS enum in @viberglass/types
  label: string
  category: 'ticketing' | 'scm' | 'inbound'
  authTypes: ('token' | 'oauth' | 'basic')[]
  configFields: IntegrationFieldDefinition[]
  supports: { issues: boolean; webhooks: boolean; pullRequests: boolean }
  createIntegration(config: TConfig): BasePMIntegration
  status?: 'ready' | 'stub'
  webhookProvider?: string
  getProviderProjectId?: (config: TConfig) => string | null
}
```

### IntegrationFrontendPlugin interface

Defined in `packages/integration-core/src/frontend/types.ts`:

```typescript
interface IntegrationFrontendPlugin {
  id: string
  InboundWebhookSection?: ComponentType<InboundWebhookSectionProps>
  OutboundWebhookSection?: ComponentType<OutboundWebhookSectionProps>
  AuthSection?: ComponentType<AuthSetupSectionProps>
}
```

### Backend Registry

- Composition root: `apps/platform-backend/src/integrations/registerIntegrationPlugins.ts`
- Creates `integrationRegistry` singleton via `IntegrationRegistry.register(...)`
- Imported in `apps/platform-backend/src/api/routes/projects.ts` and `integrations.ts`

### Frontend Registry

- Composition root: `apps/platform-frontend/src/integrations/registerFrontendIntegrationPlugins.ts`
- Creates `integrationFrontendRegistry` singleton
- Used in `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`

### Backward-Compat Shim

`apps/platform-backend/src/integration-plugins/index.ts` — marked `@deprecated`, re-exports from the new package locations. Existing code that imports from here will continue to work.

---

## 8. Agent Plugin System

### Overview

Each agent is a self-contained npm package. The `apps/viberator` worker loads them via an `AgentRegistry`. Agents extend `BaseAgent` from `@viberglass/agent-core`.

### Package Structure (per agent)

```
packages/agents/agent-<name>/
├── src/
│   ├── <Name>Agent.ts       Extends BaseAgent; implements runTask()
│   ├── plugin.ts            AgentPlugin definition (id, displayName, docker config, envAliases…)
│   ├── config.ts            Config interface
│   └── index.ts             Default export: plugin
├── test/
│   └── <Name>Agent.test.ts  Unit tests
└── package.json             name: @viberglass/agent-<name>
```

### AgentPlugin interface

Defined in `packages/agent-core/src/AgentPlugin.ts`:

```typescript
interface AgentPlugin<TConfig extends BaseAgentConfig = BaseAgentConfig> {
  id: string
  displayName: string
  create(config: TConfig, logger: Logger, gitService?: IAgentGitService): BaseAgent
  defaultConfig: TConfig
  envAliases?: Record<string, string[]>
  stateDir?: string          // Where agent stores session state (e.g. ".vibe/logs/session")
  docker?: {
    variant: string
    repositoryName: string
    scriptImageName: string
    supportedAgents: string[]
    defaultForAgents: string[]
  }
}
```

### Registry

- Composition root: `apps/viberator/src/agents/registerPlugins.ts`
- `buildAgentRegistry()` returns `AgentRegistry` with all 8 agents registered
- `agentRegistry()` returns lazy singleton

### Registered Agents

| Agent ID | Package | Notes |
|----------|---------|-------|
| `claude-code` | `@viberglass/agent-claude-code` | Anthropic Claude |
| `qwen` | `@viberglass/agent-qwen` | Alibaba Qwen |
| `codex` | `@viberglass/agent-codex` | OpenAI Codex |
| `opencode` | `@viberglass/agent-opencode` | OpenCode |
| `kimi-code` | `@viberglass/agent-kimi` | Kimi Code |
| `mistral-vibe` | `@viberglass/agent-mistral-vibe` | Mistral via vibe-acp; stateDir `.vibe/logs/session` |
| `gemini` | `@viberglass/agent-gemini` | Google Gemini CLI |
| `pi` | `@viberglass/agent-pi` | Pi coding agent |

### ACP (Agent Communication Protocol)

- `packages/agent-core/src/acp/` — ACP client, event mapper
- `packages/agent-core/src/AcpExecutor.ts` — orchestrates multi-turn ACP sessions
- Worker: `apps/viberator/src/workers/core/runSessionTurnJob.ts` — runs one ACP turn
- Platform callback: `POST /api/jobs/:jobId/session-events/batch` + `POST /api/jobs/:jobId/acp-session-id`

### Docker Image Generation

- `npm run generate:catalog` → `packages/types/src/workerImageCatalog.json`
- `npm run generate:dockerfiles` → `infra/workers/docker/generated/<variant>.Dockerfile`
- Each agent plugin's `plugin.ts` declares its `docker.variant`

---

## 9. Testing

### Test Layers

| Layer | Framework | Location pattern |
|-------|-----------|-----------------|
| Unit | Jest + ts-jest | Co-located: `MyFile.test.ts` next to `MyFile.ts` |
| Integration | Jest + testcontainers (real PostgreSQL) | `src/__tests__/integration/*.integration.test.ts` |
| E2E | Playwright | `tests/e2e/tests/` |

### Running Tests

```bash
# All unit tests (all workspaces)
npm run test:unit

# Backend unit tests
npm run test:unit -w @viberglass/platform-backend

# Backend unit tests watch mode
npm run test:watch -w @viberglass/platform-backend

# Backend integration tests
npm run test:integration -w @viberglass/platform-backend

# Frontend tests
npm run test:unit -w @viberglass/frontend

# E2E setup + run + teardown
npm run test:e2e:setup
npm run test:e2e
npm run test:e2e:teardown

# Agent package tests (example)
npm run test -w @viberglass/agent-codex
```

### Jest Config Files

- `apps/platform-backend/jest.config.js` — backend unit tests
- `apps/platform-backend/jest.integration.config.js` — backend integration tests (testcontainers)
- `apps/platform-frontend/jest.config.js` — frontend tests (jsdom environment)
- `apps/viberator/jest.config.js` — orchestrator unit tests

### Integration Test Helpers

- `apps/platform-backend/src/__tests__/helpers/testContainers.ts` — start/stop PostgreSQL container
- `apps/platform-backend/src/__tests__/helpers/testServer.ts` — create test Express server

### Frontend Testing

- `@testing-library/react` + `@testing-library/jest-dom` for component tests
- Jest environment: `jsdom`
- Test files: `*.test.tsx` co-located with pages/components

---

## 10. Scripts

### Root-level npm scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start both backend and frontend in dev mode (concurrently) |
| `npm run build` | Build all packages in dependency order |
| `npm run build:worker` | Build types + agent-core + all agent packages + viberator |
| `npm run platform:dev` | Alias for `dev` |
| `npm run platform-backend:dev` | Backend only (nodemon + tsx) |
| `npm run platform-backend:migrate` | Run Kysely migrations to latest |
| `npm run frontend:dev` | Frontend only (Vite) |
| `npm run types:build` | Build @viberglass/types |
| `npm run types:dev` | Watch-build @viberglass/types |
| `npm run generate:catalog` | Regenerate `workerImageCatalog.json` from agent plugins |
| `npm run generate:dockerfiles` | Regenerate worker Dockerfiles from agent plugin fragments |
| `npm run new:integration <name>` | Scaffold new integration package from template |
| `npm run new:agent <name>` | Scaffold new agent package from template |
| `npm run test` | Run unit tests across all workspaces |
| `npm run test:unit` | Alias |
| `npm run test:integration` | Run integration tests across all workspaces |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:setup` | Start Docker services for E2E |
| `npm run test:e2e:teardown` | Stop Docker services |
| `npm run lint` | ESLint on platform-backend |
| `npm run lint:fix` | ESLint auto-fix |

### Backend-specific scripts (`apps/platform-backend/package.json`)

| Script | What it does |
|--------|-------------|
| `npm start` | `node ./dist/api/server.js` |
| `npm run dev` | `nodemon --exec tsx ./src/api/server.ts` |
| `npm run build` | `tsup` + write dist package.json |
| `npm run migrate:latest` | Run migrations CLI |

### Frontend-specific scripts (`apps/platform-frontend/package.json`)

| Script | What it does |
|--------|-------------|
| `npm run dev` | `vite` (hot reload) |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | `vite preview` |

### Infrastructure

- `npm run infra:up` — Deploy with Pulumi (`@viberator/infra`)
- `npm run infra:preview` — Preview Pulumi changes
