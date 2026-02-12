# Integrations Implementation Summary (Current)

## Summary

The integrations stack is now integration-entity scoped with targeted webhook configuration.

- Frontend manages integration instances under `/settings/integrations/*`.
- Backend exposes webhook config and delivery APIs under `/api/integrations/:id/webhooks/*`.
- Legacy generic and project-scoped webhook routes have been removed.

## Frontend

### Core pages

- `apps/platform-frontend/src/pages/settings/IntegrationsPage.tsx`
- `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`
- `apps/platform-frontend/src/pages/project/settings/ProjectIntegrationsPage.tsx`

### Targeted webhook sections

- `apps/platform-frontend/src/pages/settings/integration-detail/GitHubInboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/GitHubOutboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/JiraInboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/JiraOutboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/ShortcutInboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/ShortcutOutboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/CustomInboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/CustomOutboundWebhookSection.tsx`
- `apps/platform-frontend/src/pages/settings/integration-detail/DeliveryHistoryTable.tsx`

### API client

- `apps/platform-frontend/src/service/api/integration-api.ts`

This client provides targeted inbound/outbound CRUD and delivery/retry APIs by integration entity + config ID.

## Backend

### Integration routes

- `apps/platform-backend/src/api/routes/integrations.ts`

Targeted webhook API surface:
- inbound config CRUD
- outbound config CRUD
- config-scoped delivery history
- config-scoped delivery retry

### Webhook ingress routes

- `apps/platform-backend/src/api/routes/webhooks/github.routes.ts`
- `apps/platform-backend/src/api/routes/webhooks/jira.routes.ts`
- `apps/platform-backend/src/api/routes/webhooks/shortcut.routes.ts`
- `apps/platform-backend/src/api/routes/webhooks/custom.routes.ts`

### Removed legacy route surfaces

- project-scoped webhook routes previously in `apps/platform-backend/src/api/routes/projects.ts`
- generic webhook config/delivery management routes previously in `apps/platform-backend/src/api/routes/webhooks/management.routes.ts`

## Testing Coverage

### Backend

- `apps/platform-backend/src/__tests__/unit/api/routes/integrations.webhooks.routes.test.ts`
- `apps/platform-backend/src/test/api.test.ts`

### Frontend/E2E

- `tests/e2e/tests/integrations/integration-config.e2e.test.ts`

Coverage includes provider-targeted inbound/outbound UX and custom multi-inbound/multi-outbound behavior.
