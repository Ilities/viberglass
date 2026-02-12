# Integrations UX Design (Current)

## Overview

Integrations are configured globally and managed from settings routes that are scoped to integration entities, not projects.

- List page: `/settings/integrations`
- Create page: `/settings/integrations/new/:integrationSystem`
- Detail page: `/settings/integrations/:integrationEntityId`

Project settings can link/unlink configured integrations, but webhook configuration itself is handled on integration detail pages.

## UX Structure

### 1. Integrations List

The integrations list shows:
- available integration types
- configured integration instances
- status and manage actions

Configured cards navigate to `/settings/integrations/:integrationEntityId`.

### 2. Integration Detail

Each integration detail page contains:
- authentication + provider fields
- provider-targeted inbound webhook section
- provider-targeted outbound webhook section
- delivery history scoped to selected webhook config

Provider-specific behavior:
- GitHub/Jira/Shortcut: provider-specific labels, setup steps, and event toggles
- Custom: multiple inbound endpoints and multiple outbound destinations

### 3. Project Linking

Project settings (`/project/:project/settings/integrations`) handle project-to-integration linking only.

## API Contract

### Integration management

- `GET /api/integrations`
- `POST /api/integrations`
- `GET /api/integrations/:id`
- `PUT /api/integrations/:id`
- `DELETE /api/integrations/:id`
- `POST /api/integrations/:id/test`

### Project links

- `GET /api/integrations/project/:projectId`
- `POST /api/integrations/project/:projectId/link`
- `DELETE /api/integrations/project/:projectId/link/:integrationId`
- `PUT /api/integrations/project/:projectId/primary/:integrationId`

### Targeted inbound webhooks

- `GET /api/integrations/:id/webhooks/inbound`
- `POST /api/integrations/:id/webhooks/inbound`
- `PUT /api/integrations/:id/webhooks/inbound/:configId`
- `DELETE /api/integrations/:id/webhooks/inbound/:configId`
- `GET /api/integrations/:id/webhooks/inbound/:configId/deliveries`
- `POST /api/integrations/:id/webhooks/inbound/:configId/deliveries/:deliveryId/retry`

### Targeted outbound webhooks

- `GET /api/integrations/:id/webhooks/outbound`
- `POST /api/integrations/:id/webhooks/outbound`
- `GET /api/integrations/:id/webhooks/outbound/:configId`
- `PUT /api/integrations/:id/webhooks/outbound/:configId`
- `DELETE /api/integrations/:id/webhooks/outbound/:configId`
- `GET /api/integrations/:id/webhooks/outbound/:configId/deliveries`

### Provider ingress endpoints

- `POST /api/webhooks/github`
- `POST /api/webhooks/jira`
- `POST /api/webhooks/shortcut`
- `POST /api/webhooks/custom/:configId`

## Removed Legacy Routes

The following routes were removed and are no longer supported:
- `/api/projects/:projectId/integrations/:integrationId/webhook`
- `/api/projects/:projectId/integrations/:integrationId/deliveries`
- `/api/projects/:projectId/integrations/:integrationId/deliveries/:deliveryId/retry`
- `/api/webhooks/configs`
- `/api/webhooks/deliveries`
- `/api/webhooks/trigger-autofix`

Use integration-targeted routes under `/api/integrations/:id/webhooks/*`.
