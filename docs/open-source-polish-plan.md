# Viberator Open-Source Polish Plan

Plan to bring the viberator system to open-source readiness, scoped to `apps/viberator/`, `packages/types/`, `infra/workers/`, and viberator-related code in `apps/platform-backend/`.

---

## Phase 1: Foundation (Tests Green, Builds Clean)

### 1.1 Fix failing unit tests in platform-backend
**Files:** `apps/platform-backend/src/__tests__/unit/workers/`
- Add `jobKind` to all worker test fixtures (`WorkerExecutionService.test.ts`, `DockerInvoker.test.ts`, `EcsInvoker.test.ts`, `LambdaInvoker.test.ts`)
- Fix `TicketPlanningApprovalService.test.ts` behavioral mismatch (test expects rejection but service resolves)
- Verify `npm run test:unit` passes across all workspaces

### 1.2 Audit and fix viberator app tests
**Files:** `apps/viberator/src/**/*.test.ts`
- Run `npm run test:unit -w @viberglass/viberator` and fix any failures
- Verify coverage report is accurate

### 1.3 Clean build verification
- Verify `npm run build` succeeds for all workspaces
- Confirm the smoke start check (`npm run smoke:start`) passes for platform-backend
- Verify `tsup` bundles for viberator produce valid output

---

## Phase 2: Naming and Terminology Cleanup

### 2.1 Unify "viberglass" vs "viberator" naming
The codebase uses both names inconsistently:
- Package names: `@viberglass/types`, `@viberglass/platform-backend` vs `@viberator/infra`, `@viberator/e2e-tests`
- SSM paths: `/viberglass-viberator/`, `/viberator/secrets/`, `/viberglass/secrets/`
- Docker images: `viberator-*`
- Infra resources: `viberglass-{env}-*`
- Monorepo name: `viberglass-monorepo`

**Decision needed:** Pick one name and use it everywhere. If "viberator" is the open-source name:
- Rename packages to `@viberator/*`
- Unify SSM path prefixes
- Update infra resource naming
- Update `package.json` name field

### 2.2 Clean up "clanker" terminology
"Clanker" is the internal name for a worker deployment target. For open-source clarity:
- **Option A:** Keep "clanker" but document it prominently in README and architecture docs
- **Option B:** Rename to something more intuitive (e.g., "worker-config", "agent-deployment", "harness")
- This touches: types, backend routes, backend services, frontend, infra

### 2.3 Remove internal references
- Audit for any internal company names, URLs, email addresses in code/comments
- Check `.env.example` files for internal defaults
- Review README examples for internal URLs

---

## Phase 3: Viberator App Code Quality

### 3.1 Extract retry logic from CallbackClient (770 LOC)
**File:** `apps/viberator/src/workers/infrastructure/CallbackClient.ts`

This is the worst offender in the viberator app. Five methods (`sendResult`, `sendProgress`, `sendCodexAuthCache`, `sendLog`, `sendLogBatch`) each contain nearly identical retry loops with exponential backoff. ~600 lines of duplicated retry scaffolding.

**Refactor:**
- Extract a generic `retryableFetch(url, options, retryConfig)` method
- Each public method becomes ~10 lines: build URL, build body, call `retryableFetch`
- Target: ~200 LOC (down from 770)

### 3.2 Split ConfigManager (574 LOC)
**File:** `apps/viberator/src/config/ConfigManager.ts`

Mixed responsibilities: agent config defaults, environment variable parsing, SSM fetching, configuration merging.

**Refactor:**
- Extract `AgentDefaults` constant/config file for hardcoded agent configs
- Extract `SsmConfigLoader` for AWS SSM parameter fetching
- Keep `ConfigManager` as orchestrator that composes these

### 3.3 Split BaseAgent (450 LOC)
**File:** `apps/viberator/src/agents/BaseAgent.ts`

Mixes agent execution with git operations (clone, branch, commit, push, create PR).

**Refactor:**
- Git operations are already available in `GitService.ts` -- remove duplicates from `BaseAgent`
- BaseAgent should only handle: agent execution, command spawning, log streaming
- Target: ~200 LOC

### 3.4 Reduce GitService (415 LOC)
**File:** `apps/viberator/src/services/GitService.ts`
- Review for overlap with git operations in `BaseAgent`
- After 3.3, GitService becomes the single source for git ops

### 3.5 Reduce ViberatorWorker (338 LOC)
**File:** `apps/viberator/src/workers/core/ViberatorWorker.ts`
- Extract credential resolution to a dedicated `CredentialResolver`
- Extract instruction file handling (already partially in `InstructionFileManager`)
- Target: ~200 LOC focused on orchestration

### 3.6 Simplify runCodingJob / runResearchJob / runPlanningJob
**Files:** `apps/viberator/src/workers/core/run*.ts`

`runResearchJob` (237 LOC) and `runPlanningJob` (237 LOC) share significant scaffolding with `runCodingJob` (342 LOC).

**Refactor:**
- Extract shared job setup (clone, branch, instruction files, settings merge) into a `JobSetup` collaborator
- Each runner focuses only on its unique behavior

### 3.7 Remove stale test file
**File:** `apps/viberator/test-qwen-api.js`
- This is a loose JS file in the app root, not part of the test suite. Remove it.

---

## Phase 4: Platform Backend Worker Code Quality

### 4.1 Split JobService (799 LOC)
**File:** `apps/platform-backend/src/services/JobService.ts`

Mixed responsibilities: job CRUD, callback handling, sweeper queries, bootstrap payload, progress tracking.

**Refactor:**
- Extract `JobCallbackService` (result/progress/log handling)
- Extract sweeper query methods to `JobMonitoringQueries`
- Keep `JobService` for submission, status, and CRUD
- Each service: ~200 LOC

### 4.2 Consolidate phase service orchestration
**Files:**
- `apps/platform-backend/src/services/TicketResearchService.ts` (560 LOC)
- `apps/platform-backend/src/services/TicketPlanningService.ts` (407 LOC)
- `apps/platform-backend/src/services/TicketExecutionService.ts` (414 LOC)

All three duplicate: clanker readiness checks, instruction file merging, job bootstrap assembly, worker invocation.

**Refactor:**
- Extract `PhaseRunOrchestrator` with shared logic:
  - `validateClankerReady(clankerId)` -- readiness gate
  - `mergeInstructionFiles(clanker, project)` -- file pipeline
  - `buildBootstrapPayload(job, clanker, project)` -- payload assembly
  - `invokeWorker(job, clanker)` -- invocation
- Each phase service becomes a thin wrapper calling the orchestrator with phase-specific configuration

### 4.3 Split ClankerDAO (620 LOC)
**File:** `apps/platform-backend/src/persistence/clanker/ClankerDAO.ts`
- Extract `ClankerConfigFileDAO` for config file operations
- Keep `ClankerDAO` for clanker CRUD only

### 4.4 Reduce worker invoker duplication
**Files:** `apps/platform-backend/src/workers/invokers/*.ts`
- `LambdaInvoker` (381 LOC), `DockerInvoker` (323 LOC), `EcsInvoker` (288 LOC)
- All share: payload building, secret resolution, error classification, logging patterns

**Refactor:**
- Extract `WorkerPayloadBuilder` for shared payload construction
- Extract `SecretResolver` for credential resolution
- Each invoker focuses only on AWS/Docker API specifics

### 4.5 Introduce typed domain errors
**Current:** Routes map HTTP status codes with `message.includes(...)` checks.

**Refactor:**
- Create `DomainError` base class with `code` and `httpStatus`
- Specific errors: `ClankerNotFoundError`, `JobNotFoundError`, `ClankerUnavailableError`, etc.
- Central error mapping middleware replaces scattered `.includes()` checks

---

## Phase 5: Shared Types Cleanup

### 5.1 Remove deprecated fields from Project type
**File:** `packages/types/src/project.ts`
- `ticketSystem` and `credentials` are marked deprecated
- If they're no longer used in backend, remove them
- If still used, add migration plan to remove

### 5.2 Consolidate SSM path constants
SSM parameter paths are constructed in multiple places with different patterns:
- `apps/viberator/src/workers/runtime/CodexAuthManager.ts`
- `apps/viberator/src/workers/infrastructure/CredentialProvider.ts`
- `apps/platform-backend/src/services/SecretService.ts`

**Refactor:**
- Define SSM path templates in shared types or a shared constants module

---

## Phase 6: Infrastructure Cleanup

### 6.1 Consolidate Docker base image
**File:** `infra/workers/docker/base/base-worker.Dockerfile`
- Review if all tools installed in base are actually needed (curl, wget, ripgrep)
- Document why each tool is included

### 6.2 Remove unused image variants
- Verify which variants from `workerImageCatalog.json` are actually used in production
- Remove any that exist only for historical reasons

### 6.3 Clean up infra resource naming
- After Phase 2 naming decision, update Pulumi resource names
- Ensure consistent `{project}-{env}-{resource}` pattern

---

## Phase 7: Documentation and Onboarding

### 7.1 Write contributor guide
- Where to add a new agent (create class, register in factory, add to catalog)
- Where to add a new deployment strategy (invoker + provisioning handler)
- How to run locally with Docker Compose
- How to run tests

### 7.2 Update README.md files
- `apps/viberator/README.md` references Redis/BullMQ queue which is no longer used (jobs come via CLI args or Lambda events, not a queue)
- Update architecture diagram to match actual flow
- Remove references to internal infrastructure

### 7.3 Add .env.example for local development
- `apps/viberator/.env.example` -- verify it's complete and accurate
- `apps/platform-backend/.env.example` -- ensure it covers all env vars

### 7.4 License and legal
- Add LICENSE file if not present
- Review all files for license headers if needed
- Audit dependencies for license compatibility

---

## Suggested Execution Order

| Order | Phase | Effort | Impact |
|-------|-------|--------|--------|
| 1 | 1.1-1.3 Foundation | S | Critical -- tests must be green first |
| 2 | 2.1-2.3 Naming | M | High -- sets the public identity |
| 3 | 3.1 CallbackClient | S | High -- most egregious duplication |
| 4 | 4.5 Typed errors | S | High -- enables safer refactoring |
| 5 | 4.2 Phase service consolidation | M | High -- biggest backend duplication |
| 6 | 3.6 Job runner consolidation | M | Medium -- viberator duplication |
| 7 | 3.2-3.5 Viberator splits | M | Medium -- code clarity |
| 8 | 4.1, 4.3-4.4 Backend splits | M | Medium -- code clarity |
| 9 | 5.1-5.2 Types cleanup | S | Low -- housekeeping |
| 10 | 6.1-6.3 Infra cleanup | S | Low -- housekeeping |
| 11 | 7.1-7.4 Documentation | M | High -- but can be done any time |

**S** = Small (< 1 day), **M** = Medium (1-3 days)
