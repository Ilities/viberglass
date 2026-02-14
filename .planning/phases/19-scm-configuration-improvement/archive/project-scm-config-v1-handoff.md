# Project SCM Config V1 - Implementation Handoff

## Goal
Add first-class project-level SCM configuration so each project can:
- choose an SCM integration
- define source/base/PR branch settings
- provide SCM credentials that are passed to clankers at execution time

## Current Status
Partially implemented and compiling.

Implemented:
- DB migration and schema for `project_scm_configs`
- backend DAO for project SCM config
- backend project routes for SCM config CRUD
- request validation for SCM config payload
- ticket execution wiring to use SCM config repository/base branch and include SCM credential secret in runtime secret resolution
- shared types (`ProjectScmConfig`, `UpsertProjectScmConfigRequest`)
- frontend API methods for project SCM config CRUD
- project settings UI refactor to split Ticketing and SCM configuration

Build status:
- `@viberglass/types`: pass
- `@viberglass/platform-backend`: pass
- `@viberglass/frontend`: pass

Targeted test status:
- `TicketExecutionService` unit test: pass (`--runInBand`)

Known test environment issue:
- full backend unit suite in this sandbox hits unrelated `EPERM listen 0.0.0.0` failures in some route tests.

## Files Changed
Modified:
- `packages/types/src/project.ts`
- `apps/platform-backend/src/persistence/types/database.ts`
- `apps/platform-backend/src/api/middleware/schemas.ts`
- `apps/platform-backend/src/api/middleware/validation.ts`
- `apps/platform-backend/src/api/routes/projects.ts`
- `apps/platform-backend/src/services/TicketExecutionService.ts`
- `apps/platform-backend/src/__tests__/unit/services/TicketExecutionService.test.ts`
- `apps/platform-frontend/src/service/api/project-api.ts`
- `apps/platform-frontend/src/pages/project/settings/ProjectSettingsPage.tsx`

Added:
- `apps/platform-backend/src/migrations/026_add_project_scm_configs.ts`
- `apps/platform-backend/src/persistence/project/ProjectScmConfigDAO.ts`

Unrelated existing untracked file (not part of this work):
- `.planning/github-integration-simplification-handoff.md`

## Data Model Added
Table: `project_scm_configs`
- `id` uuid pk
- `project_id` uuid fk -> `projects.id`
- `integration_id` uuid fk -> `integrations.id`
- `source_repository` varchar(500) not null
- `base_branch` varchar(255) not null default `main`
- `pr_repository` varchar(500) nullable
- `pr_base_branch` varchar(255) nullable
- `branch_name_template` varchar(255) nullable
- `credential_secret_id` uuid nullable fk -> `secrets.id`
- `created_at`, `updated_at`

Indexes:
- unique on `project_id` (1 SCM config per project)
- indexes on `integration_id`, `credential_secret_id`

## API Endpoints Added
In `projects` routes:
- `GET /api/projects/:projectId/scm-config`
- `PUT /api/projects/:projectId/scm-config`
- `DELETE /api/projects/:projectId/scm-config`

PUT payload shape:
- `integrationId` (uuid, required)
- `sourceRepository` (required)
- `baseBranch` (optional, default `main`)
- `pullRequestRepository` (optional)
- `pullRequestBaseBranch` (optional)
- `branchNameTemplate` (optional)
- `credentialSecretId` (optional uuid)

Validation/invariants enforced:
- project must exist
- integration must exist
- integration must be category `scm`
- integration must be linked to the project
- if provided, `credentialSecretId` must exist

## Runtime Behavior Implemented
In `TicketExecutionService.runTicket`:
- reads project SCM config
- repository used for job is now:
  - `scmConfig.sourceRepository` if present
  - fallback to existing project `repositoryUrls[0]` / `repositoryUrl`
- base branch used for job is now:
  - `scmConfig.baseBranch` if present
  - fallback `main`
- secret IDs passed to resolution are merged:
  - clanker `secretIds`
  - plus SCM `credentialSecretId` (if configured)
- merged secret IDs are used both for metadata resolution and worker invocation
- bootstrap payload now contains an `scm` block

## Frontend Behavior Implemented
Project settings page now has explicit sections:
- Ticketing Integration:
  - chooses from linked non-SCM integrations
  - updates project `ticketSystem` accordingly
- SCM Execution:
  - chooses from linked SCM integrations
  - edits source repo/base branch/PR repo/PR base/template/credential secret
  - saves/deletes SCM config via new project SCM endpoints

Secrets dropdown reads from global `GET /api/secrets`.

## What Is Still Left To Do
1. Add backend route tests for SCM config endpoints.
- cover all invariants, 404/409/400 branches, and happy path
- files likely: `apps/platform-backend/src/__tests__/unit/api/routes/...`

2. Add frontend tests for new project settings behavior.
- linked ticketing + linked SCM selection
- SCM save/delete flows
- form validation behavior

3. Make worker consume full SCM payload (currently partial).
- `scm` block is stored in bootstrap payload but worker does not use PR override/template yet
- add usage in worker/git flow for:
  - PR destination repository override
  - PR base branch override
  - optional branch naming template

4. Decide and implement durable SCM credential model.
- current v1 uses `credentialSecretId` + existing secret resolution path
- still missing productized flow for creating/rotating SCM credentials from integration screens
- integration `values` are still plain JSON in `integrations.config` and should not be treated as secure secret storage

5. Improve project integration linking semantics.
- current project link model has only `isPrimary` generic flag
- consider explicit primary by category (`primaryTicketingIntegrationId`, `primaryScmIntegrationId`) to remove ambiguity

6. Clean up legacy project settings paths.
- legacy `credentials JSON` path was removed from project settings UI, but backend/project model still carries deprecated `credentials` and `ticketSystem`
- plan migration to remove deprecated fields after compatibility window

7. Manual validation in app.
- verify end-to-end run from ticket uses configured SCM repo/base branch and credential secret in real worker environment

## Immediate Next Steps (Recommended Order)
1. Run migration locally:
- `npm run migrate:latest -w @viberglass/platform-backend`

2. Run and verify app:
- `npm run dev`
- configure project settings Ticketing + SCM
- run a ticket and inspect job payload/logs

3. Add tests before more feature changes:
- backend route tests for `/api/projects/:id/scm-config`
- frontend unit tests for `ProjectSettingsPage`

4. Implement worker-side SCM override consumption (PR repo/base/template).

## Quick Resume Commands
- `git status --short`
- `npm run build -w @viberglass/types`
- `npm run build -w @viberglass/platform-backend`
- `npm run build -w @viberglass/frontend`
- `npm run test -w @viberglass/platform-backend -- src/__tests__/unit/services/TicketExecutionService.test.ts --runInBand`

## Notes
- No commit has been created yet.
- This handoff file captures the state as of this workspace snapshot.
