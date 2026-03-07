# Platform Backend Refactor Backlog

This backlog focuses on open-source readiness: reliability, contributor clarity, and maintainability.

## P0 (Resolved)

### 1) Production build/start mismatch (ESM vs CJS)
- Evidence:
  - `package.json` uses `"type": "module"`.
  - `tsconfig.json` compiles with `"module": "commonjs"`.
  - `node dist/api/server.js` fails at runtime (`exports is not defined in ES module scope`).
- Resolution:
  - Build now writes `dist/package.json` with `type: commonjs`, so `node dist/api/server.js` runs correctly under the dist package boundary.
  - CI now runs a startup smoke check (`npm run smoke:start`) after build.
- Follow-up:
  - Keep smoke check in CI to prevent regressions.

### 2) Unit test suite is not green in current mainline state
- Evidence:
  - `npm run test:unit -w @viberglass/platform-backend` previously failed.
  - Behavioral mismatch:
    - `src/__tests__/unit/services/TicketPlanningApprovalService.test.ts` expects rejection for non-planning phase, but service resolves.
  - Type drift in worker tests:
    - `src/__tests__/unit/workers/WorkerExecutionService.test.ts`
    - `src/__tests__/unit/workers/invokers/DockerInvoker.test.ts`
    - `src/__tests__/unit/workers/invokers/EcsInvoker.test.ts`
    - `src/__tests__/unit/workers/invokers/LambdaInvoker.test.ts`
    - each fails because `JobData.jobKind` is now required but missing from fixtures.
- Impact:
  - OSS contributors do not have a reliable red/green baseline.
  - CI signal quality is reduced for unrelated pull requests.
- Refactor/Fix:
  - Update stale worker test fixtures to include `jobKind`.
  - Resolve planning approval behavior mismatch (either implementation or test expectation).
  - Enforce green `test:unit` before additional structural refactors.
- Resolution (2026-03-07):
  - Added explicit planning-phase guards in `TicketPlanningApprovalService.requestApproval` and `TicketPlanningApprovalService.approve`.
  - Updated worker invoker/execution unit fixtures to include required `jobKind`.
  - Verified green baseline: `npm run test:unit -w @viberglass/platform-backend` (57/57 passing, 556 tests).

## P1 (High)

### 3) Oversized files with mixed responsibilities
- Evidence (examples):
  - `src/api/routes/tickets.ts` (~1530 LOC)
  - `src/services/JobService.ts` (~799 LOC)
  - `src/persistence/ticketing/TicketDAO.ts` (~756 LOC)
  - `src/persistence/clanker/ClankerDAO.ts` (~620 LOC)
  - `src/services/TicketResearchService.ts` (~560 LOC)
  - `src/services/TicketExecutionService.ts` (~414 LOC)
  - `src/services/TicketPlanningService.ts` (~407 LOC)
- Impact:
  - Hard to review, reason about, and change safely.
  - Raises onboarding cost for outside contributors.
- Refactor:
  - Split route files by bounded capabilities.
  - Split large services into orchestration + pure collaborators.
  - Extract repeated DTO mapping/query-builder logic from DAOs.
- Progress (2026-03-07):
  - Extracted workflow/phase endpoints from `src/api/routes/tickets.ts` into `src/api/routes/tickets/workflowPhaseRoutes.ts`.
  - Extracted CRUD/media endpoints into `src/api/routes/tickets/crudMediaRoutes.ts`.
  - Extracted execution/override endpoints into `src/api/routes/tickets/executionRoutes.ts`.
  - `tickets.ts` reduced from ~1530 LOC to ~73 LOC (composition-only router) while preserving route behavior.

### 4) Duplicate orchestration logic across phase services
- Evidence:
  - `TicketResearchService` and `TicketPlanningService` duplicate clanker readiness checks, instruction merging, job bootstrap assembly, and worker invocation patterns.
  - `TicketExecutionService` repeats similar scaffolding with execution-specific additions.
- Impact:
  - Bug fixes must be replicated in multiple places.
  - Behavior drift risk over time.
- Refactor:
  - Introduce shared phase-run orchestration collaborator(s):
    - clanker readiness gate
    - instruction file pipeline
    - job + bootstrap builder
- Progress (2026-03-07):
  - Added shared run-preparation orchestrator: `src/services/ticketRunOrchestration.ts`.
  - `TicketResearchService`, `TicketPlanningService`, and `TicketExecutionService` now reuse `prepareTicketRunContext(...)` for:
    - project/repository resolution
    - clanker readiness checks and status synchronization
    - SCM credential secret attachment
    - instruction merge + storage/upload strategy
  - Service-specific task/context/bootstrap differences remain in each service, but duplicated setup logic is centralized.

### 5) Split webhook paths with partially duplicated behavior
- Evidence:
  - Most providers route through `WebhookService`.
  - `src/api/routes/webhooks/custom.routes.ts` has a separate manual flow for signature verification, deduplication, and delivery tracking.
- Impact:
  - Inconsistent behavior, logging, and retry semantics between providers.
- Refactor:
  - Move custom provider ingress onto `WebhookService` pipeline.
  - Keep provider-specific parsing only in provider class/processor.

### 6) Dual integration architecture increases confusion
- Evidence:
  - `src/integration-plugins/*` (plugin registry + provider integration model).
  - `src/api/services/integrations/*` (new orchestrators/services).
  - Legacy compatibility DAO: `IntegrationConfigDAO` comment indicates transitional behavior.
- Impact:
  - Unclear extension path for contributors adding a provider.
- Refactor:
  - Define one canonical integration extension surface.
  - Mark transitional layers as deprecated, then remove after migration.

### 7) Error handling relies on message-string matching
- Evidence:
  - Routes often map status codes with `message.includes(...)` checks.
- Impact:
  - Brittle and hard to refactor safely.
- Refactor:
  - Introduce typed domain errors with stable error codes.
  - Centralize route error mapping.
- Progress (2026-03-07):
  - Added typed ticket domain errors in `src/services/errors/TicketServiceError.ts`.
  - Migrated ticket execution/research/planning/approval/override services to throw typed errors for routeable domain failures.
  - Added shared ticket route mapper: `src/api/routes/tickets/routeErrors.ts`.
  - Removed `message.includes(...)` mapping from `src/api/routes/tickets/executionRoutes.ts` and `src/api/routes/tickets/workflowPhaseRoutes.ts`.
  - Added typed secret/job domain errors in:
    - `src/services/errors/SecretServiceError.ts`
    - `src/services/errors/JobServiceError.ts`
  - Removed message-based mapping from:
    - `src/api/routes/secrets.ts`
    - `src/api/routes/jobs.ts` (delete + codex auth cache paths)
  - Remaining scope: migrate the rest of message-equality checks in ticket routes and other modules to shared typed errors.

### 8) Dependency wiring is distributed and hard to override
- Evidence:
  - Route modules instantiate DAOs/services at module scope.
  - Services instantiate other services/DAOs internally (`new` chains).
- Impact:
  - Reduced testability and composability.
  - Hard to run alt implementations in OSS examples/local setups.
- Refactor:
  - Add explicit application composition root for service graph.
  - Pass dependencies via constructor for major orchestration services.

### 9) Repeated environment parsing and config sprawl
- Evidence:
  - DB URL parser duplicated in:
    - `src/persistence/config/database.ts`
    - `src/migrations/migrator.ts`
  - Many modules read `process.env` directly.
- Impact:
  - Drift and inconsistent defaults.
- Refactor:
  - Consolidate config parsing/validation into a typed config module.
  - Reuse shared DB config for runtime and migrator.

## P2 (Medium)

### 10) Documentation and onboarding drift
- Evidence:
  - Previous README content referenced old setup assumptions and endpoints.
- Refactor:
  - Keep architecture + refactor docs versioned in `docs/`.
  - Add contributor map (where to add route/service/provider/DAO/tests).
- Progress (2026-03-07):
  - Added `docs/contributor-map.md` and linked it from backend `README.md`.

### 11) Inconsistent logging strategy
- Evidence:
  - Mix of `logger.*` and direct `console.*` calls.
- Refactor:
  - Standardize on structured logger throughout request paths.

### 12) Security hardening follow-ups
- Evidence:
  - Callback token validation currently uses direct string equality in `JobService.validateCallbackToken`.
  - `tenantMiddleware` defaults tenant when header missing (necessary for some flows but should be explicit by route intent).
- Refactor:
  - Use timing-safe token comparison.
  - Split strict vs fallback tenant middleware modes by endpoint class.

### 13) Unused/partially integrated middleware modules
- Evidence:
  - `projectAuthorization` middleware has tests but is not wired to active routes.
- Refactor:
  - Either integrate it into route guards or remove/archive it.

## Suggested Execution Order
1. Keep P0 build/runtime alignment protected by smoke CI.
2. Maintain green `test:unit` baseline while refactoring.
3. Extract typed errors + central error mapping (in progress; ticket routes completed).
4. Unify webhook ingress path (including custom).
5. Factor shared phase-run orchestration.
6. Slice largest route/service/DAO files incrementally with tests.
7. Consolidate config/env loading.
8. Clean integration transitional layers.
