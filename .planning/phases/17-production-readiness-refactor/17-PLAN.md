# Phase 17: Production Readiness Refactor Plan

**Created:** 2026-02-09  
**Owner:** Codex + Jussi  
**Status:** Completed

## Goal

Improve production readiness with low-risk refactors that:
- remove dead paths / stale patterns
- extract small, reusable abstractions
- tighten typing and reduce `any`/unsafe casts
- preserve behavior (no feature changes)

## Sequence

### Item 1: API Routes Cleanup (Completed)

**Scope**
- `apps/platform-backend/src/api/routes/**`

**Context**
- We recently stabilized webhook route behavior and unit coverage.
- Remaining cleanup targets are mostly cast noise and duplicated route glue logic.
- This is the safest first slice because route logic is already covered by unit tests.

**Planned work**
1. Remove unsafe casts where type-safe alternatives exist (`as any`, inline import casts).
2. Consolidate raw-body extraction in webhook routes.
3. Keep response behavior unchanged while tightening types.
4. Validate with backend build + unit suite.

**Done when**
- No route-level `as any` remains in touched files unless strictly required.
- Webhook route typing is explicit and reusable.
- `npm run build -w @viberglass/platform-backend` passes.
- `npm run test:unit -w @viberglass/platform-backend` passes.

### Item 2: Shared DAO Query Helpers in Auth/Project Middleware (Completed)

**Scope**
- `apps/platform-backend/src/api/middleware/**`

**Context**
- Authorization middleware currently duplicates query flow and response handling patterns.
- We want small helper extraction only, no auth behavior changes.

**Planned work**
1. Identify repeated user-project/ticket-project query patterns.
2. Extract focused helpers (private module-level) with explicit return types.
3. Keep middleware contract and response payloads stable.
4. Re-verify middleware unit tests.

### Item 3: Workers Module Light Abstraction Pass (Completed)

**Scope**
- `apps/platform-backend/src/workers/**`

**Context**
- Worker invoker and execution paths are already well tested.
- Goal is readability and consistency cleanup, not retry-policy changes.

**Planned work**
1. Remove minor duplication in error mapping and config validation.
2. Extract helper functions where they reduce branching complexity.
3. Preserve error-classification semantics exactly.
4. Re-run worker-focused and full backend unit tests.

### Item 4: Frontend UI Layer Type Tightening + Form Helper Extraction (Completed)

**Scope**
- `apps/platform-frontend/src/components/**`
- `apps/platform-frontend/src/pages/**`
- `apps/platform-frontend/src/lib/**`

**Context**
- Frontend pages still had duplicated project-form logic and unsafe casts in interaction/integration flows.
- Goal is no visual or API behavior change, only safer types and reduced duplication.

**Planned work**
1. Remove unsafe casts in interaction handlers and project integration link actions.
2. Extract shared project-form helpers for repository URL normalization and credential shaping.
3. Replace `catch (err: any)` patterns with typed unknown/error handling.
4. Validate with frontend build and unit command availability check.

**Done when**
- No `as any`/`unknown as` remains in touched frontend files.
- Project create/settings pages reuse shared helper logic for credentials and repository URLs.
- `npm run build -w @viberglass/frontend` passes.
- Frontend unit command is executed and outcome is documented.

### Item 5: Viberator Agent/Config Type Safety + CLI Parsing Helper Pass (Completed)

**Scope**
- `apps/viberator/src/agents/**`
- `apps/viberator/src/config/**`
- `apps/viberator/src/services/**`
- `apps/viberator/src/types/**`

**Context**
- Agent implementations repeated CLI JSON parsing and used several `any`-typed paths.
- We want light abstraction and typing improvements only, no orchestration behavior changes.

**Planned work**
1. Extract shared CLI JSON parsing and command-not-found detection into `BaseAgent`.
2. Replace `any` paths in agents/config/service factories with typed alternatives.
3. Remove stale agent helper code paths that are no longer referenced.
4. Validate with orchestrator build and unit command.

**Done when**
- No `any` remains in touched viberator files.
- Agent CLI parsing is centralized and reused.
- `npm run build -w @viberator/orchestrator` passes.
- `npm run test:unit -w @viberator/orchestrator -- --passWithNoTests` passes.

## Tracking Log

- 2026-02-09: Plan created. Started Item 1 (API Routes Cleanup).
- 2026-02-09: Item 1 completed.
  - Removed route-level unsafe casts in webhook/integration/project routes.
  - Added `getRequestRawBody` helper for webhook routes.
  - Tightened webhook provider typing in management routes.
  - Validation:
    - `npm run build -w @viberglass/platform-backend`
    - `npm run test:unit -w @viberglass/platform-backend`
- 2026-02-09: Started Item 2 (Shared DAO Query Helpers in Auth/Project Middleware).
- 2026-02-09: Item 2 completed.
  - Extracted shared ID and DAO lookup helpers in `projectAuthorization`.
  - Reused shared user-project lookup helper across middleware and helper API.
  - Validation:
    - `npm run build -w @viberglass/platform-backend`
    - `npm run test:unit -w @viberglass/platform-backend`
- 2026-02-09: Started and completed Item 3 (Workers Module Light Abstraction Pass).
  - Extracted shared worker `projectConfig` mapper used by Docker/ECS/Lambda invokers.
  - Removed duplicate payload mapping blocks while preserving payload shape.
  - Validation:
    - `npm run build -w @viberglass/platform-backend`
    - `npm run test:unit -w @viberglass/platform-backend`
- 2026-02-09: Started and completed Item 4 (Frontend UI Layer Type Tightening + Form Helper Extraction).
  - Added shared project-form helpers for repository URL normalization, credential extraction, and typed error messages.
  - Removed unsafe casts in interaction and project integration pages.
  - Replaced `catch (err: any)` with typed unknown handling in touched ticket/project pages.
  - Validation:
    - `npm run build -w @viberglass/frontend`
    - `npm run test:unit -w @viberglass/frontend -- --passWithNoTests` (fails due missing `next` dependency required by existing Jest config)
- 2026-02-09: Started and completed Item 5 (Viberator Agent/Config Type Safety + CLI Parsing Helper Pass).
  - Added shared `BaseAgent` helpers for CLI JSON parsing and command-not-found detection.
  - Removed `any` usage in touched agent/config/service/type files and deleted unused Claude agent helper methods.
  - Updated agents to reuse shared CLI output parsing and key extraction.
  - Validation:
    - `npm run build -w @viberator/orchestrator`
    - `npm run test:unit -w @viberator/orchestrator -- --passWithNoTests`
