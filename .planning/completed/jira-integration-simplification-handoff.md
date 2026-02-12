# Jira Integration Simplification Handoff

**Date:** 2026-02-11  
**Status:** Investigation Complete / Ready for Implementation

## Objective

Apply the same simplification model used for Shortcut to Jira, while keeping Jira-specific behavior where needed.

Primary intent:
1. Jira should behave as a webhook-driven integration first.
2. Configuration should not be split across generic integration config + inbound + outbound in a confusing way.
3. Routing must remain deterministic for project-scoped integrations.
4. Legacy integration-level coupling that is no longer used should be removed.

## Shortcut Patterns Introduced (Source Pattern)

These are the patterns already implemented for Shortcut and should be mirrored for Jira:

1. **Provider-specific config moved to webhook config level**
   - Inbound/outbound configs carry `providerProjectId` and `projectId`.
   - Integration-level `values` is no longer the routing source of truth.

2. **Deterministic project resolution**
   - If `projectId` is explicitly provided for webhook config, use it.
   - Otherwise fall back to first linked project, ordered by `is_primary DESC, created_at DESC`.
   - No arbitrary ordering.

3. **Explicit nullable semantics**
   - `projectId` and `providerProjectId` accept `undefined | null | string`.
   - `undefined` means “no change/fallback behavior”.
   - `null` means “clear stored value”.

4. **Provider invariants enforced server-side**
   - Shortcut outbound always forces `['job_started', 'job_ended']`.
   - Shortcut outbound delete is blocked.
   - UI mirrors this, but backend is authoritative.

5. **Integration detail UX simplified**
   - Auto-create integration when opening `/settings/integrations/new/<provider>` for webhook-first providers.
   - Hide generic `Configuration` section for providers that no longer need it.
   - Show provider-specific inbound/outbound sections immediately.

6. **Legacy path removal**
   - Removed fallback/compat code paths that depended on old generic config workflow.
   - Removed dead frontend API methods tied to legacy per-project config endpoints.

## Current Jira State (Investigation Findings)

### Frontend

1. Jira still depends on generic `Configuration` (`instanceUrl`, `projectKey`, `issueTypeId`, auth fields).
2. Jira inbound and outbound sections both depend on integration-level `projectKey`.
3. Save/create handlers block if `projectKey` is missing.
4. Outbound has event toggles and allows delete.

Key files:
- `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/JiraInboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/JiraOutboundWebhookSection.tsx`

### Backend

1. Jira provider project mapping still falls back from integration `values.projectKey`.
2. Outbound event forcing currently applies only to Shortcut.
3. Outbound delete protection currently applies only to Shortcut.

Key files:
- `apps/platform-backend/src/api/services/integrations/shared.ts`
- `apps/platform-backend/src/api/services/integrations/IntegrationWebhookService.ts`
- `apps/platform-backend/src/integrations/plugins/jira/jiraUtils.ts`

### Important Technical Finding

The targeted webhook path already carries enough Jira context from inbound payload metadata (`jiraIssueKey`, `jiraIssueApiUrl`, derived `jiraApiBaseUrl`) for outbound feedback dispatch. This means integration-level `projectKey` coupling is legacy for the webhook-driven Jira flow.

Relevant files:
- `apps/platform-backend/src/webhooks/inbound-processors/JiraInboundProcessor.ts`
- `apps/platform-backend/src/webhooks/feedback/provider-behaviors/JiraFeedbackProviderBehavior.ts`
- `apps/platform-backend/src/webhooks/feedback/FeedbackOutboundConfigResolver.ts`

## Recommended Jira Target State

Apply the Shortcut model to Jira with Jira naming/copy:

1. Jira becomes webhook-first from `/settings/integrations/new/jira` (auto-create integration entity).
2. Hide generic `Configuration` section for Jira.
3. Store project routing on webhook configs:
   - Inbound: optional Jira project key (`providerProjectId`) + optional Viberglass `projectId`.
   - Outbound: project mapping derived from inbound-selected `providerProjectId` or outbound config.
4. Outbound feedback is always lifecycle-based (`job_started`, `job_ended`).
5. Outbound delete is disallowed for Jira (same invariant model as Shortcut).
6. Remove integration-level fallback to `values.projectKey` when resolving webhook config mapping.

## File-by-File Jira Implementation Plan

### Backend

1. `apps/platform-backend/src/integrations/plugins/jira/jiraUtils.ts`
   - Remove legacy `configFields` dependency for webhook-driven flow (`configFields: []`).
   - Keep auth types only if still needed elsewhere; otherwise align to actual usage.

2. `apps/platform-backend/src/api/services/integrations/shared.ts`
   - Keep Jira default inbound events as desired product behavior.
   - Remove Jira fallback from `getProviderProjectIdFromIntegration` (or stop using this fallback for Jira in resolver path).

3. `apps/platform-backend/src/api/services/integrations/IntegrationWebhookService.ts`
   - Extend forced outbound events behavior to Jira:
     - create/update outbound for Jira should force `getDefaultOutboundEvents()`.
   - Extend outbound delete protection to Jira:
     - reject delete with clear error message.
   - Keep explicit nullable handling for `projectId` and `providerProjectId` (already in place).

4. `apps/platform-backend/src/__tests__/unit/api/routes/integrations.webhooks.routes.test.ts`
   - Add Jira equivalents of Shortcut invariant tests:
     - outbound create ignores partial events and stores both lifecycle events.
     - outbound delete rejected with 400.

### Frontend

1. `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`
   - Auto-create Jira integration on `/settings/integrations/new/jira` (same flow as custom/shortcut).
   - Load projects for Jira detail page for per-webhook project mapping.
   - Hide generic configuration section for Jira.
   - Remove `requireJiraProjectKey()` gating tied to integration config.
   - Wire Jira inbound save/create/generate to use webhook-level `providerProjectId` and `projectId`.
   - Force Jira outbound save with `forcedEvents: ['job_started', 'job_ended']`.

2. `apps/platform-frontend/src/pages/settings/integration-detail/useIntegrationWebhookSettings.ts`
   - Reuse existing state for:
     - `selectedInboundProviderProjectId`
     - `selectedInboundProjectId`
   - Pass these values from Jira handlers just like Shortcut path.

3. `apps/platform-frontend/src/pages/settings/integration-detail/JiraInboundWebhookSection.tsx`
   - Replace “integration project key required” block with editable per-config controls:
     - Viberglass project select
     - Jira project key input (optional, but recommended for deterministic routing)
   - Keep Jira-specific setup instructions and event descriptions.

4. `apps/platform-frontend/src/pages/settings/integration-detail/JiraOutboundWebhookSection.tsx`
   - Remove event toggles.
   - Remove delete button.
   - Reframe copy to “always-on feedback events”.
   - Keep token input and save action.

5. `apps/platform-frontend/src/pages/settings/integration-detail/JiraWebhookSections.test.tsx`
   - Update tests for new section copy and control behavior.
   - Remove tests expecting project-key-missing disable behavior from generic config.

### E2E

1. `tests/e2e/tests/integrations/integration-config.e2e.test.ts`
   - Update Jira creation helper:
     - no generic config form fill.
     - expect auto-create redirect from `/new/jira`.
   - Update Jira section heading and copy assertions.
   - Remove event-toggle expectations for Jira outbound.
   - Verify save button label pattern (similar to Shortcut feedback section).

## Legacy Code Deletion Targets (Jira Scope)

1. Integration-level `projectKey` gating in Jira UI handlers.
2. Jira mapping fallback from integration values in webhook config resolution path.
3. Jira outbound event toggle state usage in Jira-only UI path.
4. Jira outbound delete action in UI and corresponding behavioral expectations in tests.

## Acceptance Criteria

1. Opening `/settings/integrations/new/jira` auto-creates and redirects to detail.
2. Jira detail page has no generic configuration section.
3. Jira inbound can be configured without integration-level `projectKey`.
4. Jira inbound supports per-config `projectId` and optional `providerProjectId`.
5. Jira outbound always stores `job_started` + `job_ended`.
6. Jira outbound delete is rejected (backend) and absent (UI).
7. Project-scoped routing remains deterministic when multiple project links/configs exist.

## Validation Checklist

Run these after implementation:

1. Backend unit tests:
   - `npm run test -w @viberglass/platform-backend -- integrations.webhooks.routes.test.ts`
2. Frontend unit tests:
   - `npm run test -w @viberglass/frontend -- JiraWebhookSections.test.tsx`
3. E2E subset:
   - `npm run test:e2e -- integration-config.e2e.test.ts` (or repo-specific e2e command)
4. Builds:
   - `npm run build -w @viberglass/platform-backend`
   - `npm run build -w @viberglass/frontend`

## Risk Notes

1. If any non-webhook Jira flow still depends on integration `values.projectKey` (legacy `JiraIntegration` create-ticket paths), removing config fields may impact those paths.
2. If keeping any Jira generic fields temporarily, keep them hidden from UX but supported in backend reads until full cleanup.
3. Keep backend invariants as source of truth even if UI enforces the same constraints.
