# Integrations Configuration UX Design

## Overview

This document describes the new User Experience flow for configuring integrations in the Viberglass platform. The goal is to separate integration configuration from project creation, allowing users to preconfigure and manage integrations independently.

## Current State

- Integration configuration is embedded in the project creation form
- Users must configure the ticket system when creating a project
- No way to see all available integrations at a glance
- No way to preconfigure integrations before project creation

## New UX Flow

### 1. Integrations Settings Page

**URL:** `/project/[project]/settings/integrations`

A dedicated settings page that displays all available integrations as a grid of cards.

#### Integration Card Design

Each card contains:
- **Icon**: Visual representation of the integration (GitHub, Jira, Linear, etc.)
- **Name**: Human-readable name (e.g., "GitHub Issues", "Jira Cloud")
- **Description**: Brief description of what the integration does
- **Category Badge**: "SCM" or "Ticketing" to indicate the type
- **Status Indicator**: Shows if the integration is:
  - ✅ **Configured** (green) - Integration is set up and ready
  - ⚠️ **Not Configured** (gray) - Integration needs configuration
  - 🔧 **Stub** (yellow) - Integration is not fully implemented yet

#### Card Interactions

- **Clicking a card** navigates to the integration configuration page
- **Hover state** shows subtle elevation and border highlight
- **Configured cards** may show a "Configured" badge or checkmark

### 2. Integration Configuration Page

**URL:** `/project/[project]/settings/integrations/[integrationId]`

A dedicated page for configuring a specific integration.

#### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Integrations                                      │
│                                                             │
│ [Icon] Integration Name                        [Status]     │
│ Description of what this integration does.                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Authentication                                              │
│ ──────────────────────────────────────────────────────────  │
│ Auth Type: [OAuth ▼]                                        │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ OAuth Configuration                                 │     │
│ │                                                     │     │
│ │ Client ID     [________________]                    │     │
│ │ Client Secret [________________]                    │     │
│ │                                                     │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ Configuration                                               │
│ ──────────────────────────────────────────────────────────  │
│ Repository Owner [________________]                         │
│ Repository Name  [________________]                         │
│ Default Labels   [________________]                         │
│                                                             │
│ [Test Connection]                              [Save Changes]│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Dynamic Form Fields

The form is dynamically generated based on the integration's `configFields` definition from the backend:

- **String fields** → Text input
- **Number fields** → Number input
- **Boolean fields** → Toggle switch
- **Select fields** → Dropdown
- **Multiselect fields** → Multi-select component
- **Secret fields** → Password input with show/hide toggle

#### Actions

- **Test Connection**: Validates the configuration without saving
- **Save Changes**: Saves the configuration and returns to integrations list
- **Cancel**: Discards changes and returns to integrations list
- **Remove Integration** (if configured): Removes the configuration

### 3. Updated Project Creation Flow

The project creation form will be simplified:

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Project                                          │
│                                                             │
│ Project Name                                                    │
│ [________________]                                          │
│                                                             │
│ Repository URL                                              │
│ [________________]                                          │
│                                                             │
│ Primary Integration                                         │
│ [Select an integration... ▼]                               │
│                                                             │
│ [?] Only configured integrations are shown.                 │
│     Configure more in Settings → Integrations               │
│                                                             │
│ Enable Auto-fix                                             │
│ [Toggle]                                                    │
│                                                             │
│ [Create Project]                                            │
└─────────────────────────────────────────────────────────────┘
```

The ticket system dropdown now only shows integrations that have been preconfigured.

### 4. Settings Navigation Update

The settings sidebar will include a new "Integrations" link:

```
Settings
├── Widget
├── AI Agent
├── Integrations  ← NEW
└── Webhooks
```

## Type Definitions

### Frontend Types (for @viberglass/types extension)

```typescript
// Integration configuration status
export type IntegrationStatus = 'configured' | 'not_configured' | 'stub';

// Integration metadata from backend
export interface IntegrationMetadata {
  id: TicketSystem;
  label: string;
  category: 'scm' | 'ticketing';
  description: string;
  authTypes: AuthCredentialType[];
  configFields: IntegrationFieldDefinition[];
  supports: IntegrationSupport;
  status: 'ready' | 'stub';
}

// Integration with configuration status
export interface IntegrationSummary extends IntegrationMetadata {
  status: IntegrationStatus;
  configuredAt?: string;
  lastTestedAt?: string;
}

// Integration configuration form values
export interface IntegrationConfigFormValues {
  authType: AuthCredentialType;
  // Dynamic fields based on integration's configFields
  [key: string]: unknown;
}
```

## Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Integrations   │────▶│   Integration    │────▶│   Save Config    │
│   List Page      │     │   Config Page    │     │   API Call       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
  GET /integrations/      GET /integrations/         PUT /integrations/
    [projectId]             [projectId]/               [projectId]/
                              [integrationId]            [integrationId]
```

## API Endpoints Required

### Backend API Extensions

1. **GET /api/projects/:projectId/integrations**
   - Returns all integrations with their configuration status
   - Includes metadata from plugin definitions
   - Includes configuration status for the project

2. **GET /api/projects/:projectId/integrations/:integrationId**
   - Returns detailed configuration for a specific integration
   - Includes current config values (with secrets masked)

3. **PUT /api/projects/:projectId/integrations/:integrationId**
   - Saves/updates integration configuration
   - Validates configuration before saving

4. **POST /api/projects/:projectId/integrations/:integrationId/test**
   - Tests the integration connection
   - Returns success/error without saving

5. **DELETE /api/projects/:projectId/integrations/:integrationId**
   - Removes the integration configuration

## Implementation Plan

### Phase 1: Core UI Components
1. Create `IntegrationCard` component
2. Create `IntegrationGrid` component
3. Create `IntegrationConfigForm` component
4. Update settings navigation

### Phase 2: Pages
1. Create `/settings/integrations` page
2. Create `/settings/integrations/[integrationId]` page

### Phase 3: API Integration
1. Create integration API service
2. Connect UI to API endpoints
3. Add loading and error states

### Phase 4: Project Creation Updates
1. Update project creation form
2. Filter ticket system dropdown to configured integrations only
3. Add link to integrations settings

## Accessibility Considerations

- All cards are keyboard navigable
- Status indicators have appropriate ARIA labels
- Form fields have proper labels and descriptions
- Color is not the only indicator of status (icons + text)
- Focus indicators are clearly visible

## Responsive Design

### Desktop (> 1024px)
- 3-column grid for integration cards
- Full sidebar navigation

### Tablet (768px - 1024px)
- 2-column grid for integration cards
- Collapsed sidebar

### Mobile (< 768px)
- 1-column stack for integration cards
- Bottom sheet or full-screen for configuration
