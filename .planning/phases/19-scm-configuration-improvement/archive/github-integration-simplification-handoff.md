# GitHub Integration Simplification Handoff

**Date:** 2026-02-12  
**Status:** Investigation Complete / Ready for Implementation

## Objective

Simplify GitHub integration configuration so it reflects the real SCM workflow:

1. GitHub inbound events create Viberglass tickets.
2. Matching inbound events (and optional label rules) can trigger jobs.
3. Outbound feedback always goes back to the originating GitHub issue/comment context.
4. Routing remains deterministic for project-scoped integrations.

This should remove the current disjoint UX split between generic configuration and webhook sections.

## Browser Audit (Live UI Findings)

Validated with `agent-browser` on `http://localhost:3000` as of 2026-02-12.

### `/settings/integrations/new/github`

Current behavior:
- Shows only generic `Configuration` form.
- Requires token + repository owner/repo before integration exists.
- No inbound/outbound webhook controls until after save.

### `/settings/integrations/:id` (configured GitHub)

Current behavior:
- Still shows generic `Configuration` section.
- Separate `GitHub Inbound Webhook` section.
- Separate `GitHub Outbound Events` section.

Current friction:
1. Source-of-truth is split:
   - Repo mapping comes from integration `values.owner/repo` fallback.
   - Inbound/outbound runtime behavior comes from webhook configs.
2. Inbound section has no Viberglass project selector for per-webhook routing.
3. Outbound section behaves like optional generic webhook config:
   - event toggles,
   - create/remove semantics.
   This conflicts with desired GitHub behavior (always feedback to origin issue).
4. GitHub differs from Jira/Shortcut in UX flow even though all are now webhook-first.

## Recommended GitHub Target State

Keep GitHub distinct from Jira/Shortcut, but align architecture and UX consistency.

### 1) GitHub becomes webhook-first on `/settings/integrations/new/github`

- Auto-create integration instance when opening `/settings/integrations/new/github`.
- Redirect to `/settings/integrations/:id`.
- Hide generic `Configuration` section for GitHub.

### 2) Inbound becomes source configuration

Per inbound GitHub config, include:
- Viberglass project mapping (`projectId`, optional).
- GitHub repository mapping (`providerProjectId`, required format: `owner/repo`).
- Allowed events (`issues.opened`, `issue_comment.created`).
- Auto-execute policy:
  - off,
  - on for matching events,
  - optional label-gated mode (GitHub-specific) for issue labels.

This keeps multi-repo and multi-project routing deterministic.

### 3) Outbound becomes always-on feedback channel

GitHub outbound should model feedback invariants, not generic event subscription:
- Force events to `['job_started', 'job_ended']`.
- Remove outbound event toggles from UI.
- Remove outbound delete action from UI.
- Backend rejects outbound delete for GitHub (same invariant pattern used for Jira/Shortcut).
- UI copy explicitly states feedback targets the originating GitHub issue/comment context.

### 4) Preserve project-scoped integration model

- Inbound config owns `projectId` for ticket routing.
- Outbound resolution continues to prefer context from the originating ticket metadata + inbound config.
- Keep compatibility with project-linked integrations (`/api/integrations/project/:projectId/*`).

## Backend Plan

### A. Remove GitHub dependency on generic integration values for routing

Files:
- `apps/platform-backend/src/api/services/integrations/shared.ts`
- `apps/platform-backend/src/api/services/integrations/IntegrationWebhookService.ts`

Changes:
1. Stop treating integration `values.owner/repo` as long-term routing source-of-truth.
2. Require or strongly prefer inbound/outbound `providerProjectId` for GitHub.
3. Keep temporary compatibility fallback only during migration window.

### B. Enforce GitHub outbound invariants

File:
- `apps/platform-backend/src/api/services/integrations/IntegrationWebhookService.ts`

Changes:
1. Force GitHub outbound events to `getDefaultOutboundEvents()` on create/update.
2. Reject GitHub outbound delete with 400 and clear error message.

### C. Add GitHub label-gated auto-execute support (GitHub-specific)

Files:
- `apps/platform-backend/src/api/services/integrations/types.ts`
- `apps/platform-backend/src/api/services/integrations/IntegrationWebhookService.ts`
- `apps/platform-backend/src/webhooks/inbound-processors/GitHubInboundProcessor.ts`

Changes:
1. Extend inbound webhook config input/output to include label rule settings (stored in `labelMappings`).
2. In `GitHubInboundProcessor`, gate auto-execute by configured label policy when enabled.

### D. Plugin metadata cleanup

File:
- `apps/platform-backend/src/integrations/plugins/github/githubUtils.ts`

Changes:
1. Remove or reduce GitHub `configFields` used only by legacy generic configuration flow.
2. Keep auth capability metadata only if still required by non-webhook paths.

### E. Backend tests

File:
- `apps/platform-backend/src/__tests__/unit/api/routes/integrations.webhooks.routes.test.ts`

Add tests for:
1. GitHub outbound create/update forces `job_started` + `job_ended`.
2. GitHub outbound delete rejected.
3. GitHub inbound accepts repository/project mapping and label-gated policy inputs.

## Frontend Plan

### A. GitHub route and section layout

File:
- `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`

Changes:
1. Add GitHub to auto-create provider list (`/new/github`).
2. Hide generic `Configuration` section for GitHub.
3. Load projects for GitHub detail page (same way as custom/jira/shortcut) for inbound project mapping.

### B. GitHub inbound section redesign

File:
- `apps/platform-frontend/src/pages/settings/integration-detail/GitHubInboundWebhookSection.tsx`

Changes:
1. Add Viberglass project selector.
2. Add repository field (`owner/repo`) mapped to `providerProjectId`.
3. Add GitHub-specific auto-execute label rule controls.
4. Keep setup steps, secret handling, event checkboxes, delivery history.

### C. GitHub outbound section simplification

File:
- `apps/platform-frontend/src/pages/settings/integration-detail/GitHubOutboundWebhookSection.tsx`

Changes:
1. Remove event toggles.
2. Remove delete button.
3. Reframe section as always-on feedback channel.
4. Keep token input + save action.

### D. Webhook state hook updates

File:
- `apps/platform-frontend/src/pages/settings/integration-detail/useIntegrationWebhookSettings.ts`

Changes:
1. Track GitHub inbound `projectId` and `providerProjectId` like Jira/Shortcut.
2. Add state for GitHub label-gated auto-execute settings.
3. Force GitHub outbound saves with `['job_started', 'job_ended']`.

### E. API client types

File:
- `apps/platform-frontend/src/service/api/integration-api.ts`

Changes:
1. Extend inbound webhook payload typing for label-rule fields and ensure compatibility with backend response shape.

### F. Frontend tests

Files:
- `apps/platform-frontend/src/pages/settings/integration-detail/GitHubWebhookSections.test.tsx` (new)
- `tests/e2e/tests/integrations/integration-config.e2e.test.ts`

Add/update tests for:
1. `/new/github` auto-create redirect.
2. No generic `Configuration` heading on GitHub detail.
3. GitHub inbound includes project + repository mapping controls.
4. GitHub outbound shows always-on feedback copy and no delete/event toggles.

## Migration / Compatibility Plan

1. For existing GitHub integrations, backfill missing webhook `providerProjectId` from legacy integration `values.owner/repo`.
2. Keep read fallback to integration values during transition only.
3. After backfill confidence, remove fallback and deprecate legacy values in UI.

## Acceptance Criteria

1. Opening `/settings/integrations/new/github` auto-creates and redirects to detail page.
2. GitHub detail page has no generic configuration section.
3. GitHub inbound supports:
   - per-config Viberglass project mapping,
   - per-config repository mapping (`owner/repo`),
   - optional label-gated auto-execute rules.
4. GitHub outbound always persists `job_started` + `job_ended`.
5. GitHub outbound delete is rejected backend-side and not shown in UI.
6. Outbound feedback posts to the originating GitHub issue/comment context for tickets created from inbound webhooks.
7. Deterministic routing works across multiple GitHub inbound configs and project links.

## Validation Checklist

1. Backend unit tests:
   - `npm run test -w @viberglass/platform-backend -- integrations.webhooks.routes.test.ts`
2. Frontend unit tests:
   - `npm run test -w @viberglass/frontend -- GitHubWebhookSections.test.tsx`
3. E2E subset:
   - `npm run test:e2e -- integration-config.e2e.test.ts`
4. Builds:
   - `npm run build -w @viberglass/platform-backend`
   - `npm run build -w @viberglass/frontend`

## Risks

1. Legacy non-webhook GitHub paths may still read integration `values.owner/repo`; keep temporary compatibility until all consumers are audited.
2. Label-gated auto-execute introduces provider-specific inbound semantics; document clearly in UI copy and tests.
3. Existing GitHub integrations missing outbound token or repository mapping may fail outbound feedback until migration/backfill is complete.
