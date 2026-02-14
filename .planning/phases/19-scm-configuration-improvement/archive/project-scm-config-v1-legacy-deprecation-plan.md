# Legacy Project Fields - Deprecation & Migration Plan

## Overview

This document outlines the migration plan for removing deprecated fields from the project model and transitioning to the new integration-centric architecture.

## Deprecated Fields

### 1. `projects.credentials` (JSON)
- **Status**: Deprecated
- **Replacement**: Integration credentials stored in `integration_credentials` table
- **Migration Path**: 
  - Existing credentials should be migrated to new Integration entities
  - Create appropriate Integration records for each project's credentials
  - Link integrations to projects

### 2. `projects.ticket_system` (enum)
- **Status**: Deprecated
- **Replacement**: `projects.primary_ticketing_integration_id` + linked integrations
- **Migration Path**:
  - Use `primary_ticketing_integration_id` to determine the project's ticketing system
  - The ticketing system can be derived from the linked integration's `system` field

### 3. `projects.custom_field_mappings` (JSON)
- **Status**: Deprecated
- **Replacement**: Per-integration field mappings
- **Migration Path**:
  - Migrate to integration-specific storage if needed
  - Most field mappings are now handled per-integration

### 4. `project_integrations.is_primary` (boolean)
- **Status**: Deprecated (kept for backward compatibility)
- **Replacement**: `projects.primary_ticketing_integration_id` and `projects.primary_scm_integration_id`
- **Migration Path**:
  - Migration 028 backfills the new columns from existing `is_primary` data
  - New code should use category-specific primary columns

## Migration Timeline

### Phase 1: Dual-write Period (Completed)
- ✅ New primary integration columns are populated alongside `is_primary`
- ✅ Both old and new fields are maintained
- ✅ Backfills run during migration

### Phase 2: Read-from-New (Current)
- 🔄 Update all read paths to use new columns
- Keep `is_primary` for backward compatibility
- Deprecation warnings in API responses

### Phase 3: Removal (Target: Future releases)
- Remove `project_integrations.is_primary` column
- Remove deprecated fields from API responses
- Remove legacy credential handling code

## API Changes

### Current (Transition Period)
```typescript
// Project response includes both old and new
{
  id: string,
  ticketSystem: string,  // @deprecated
  primaryTicketingIntegrationId: string | null,  // new
  primaryScmIntegrationId: string | null,        // new
  // ...
}
```

### Future (After Migration)
```typescript
{
  id: string,
  primaryTicketingIntegrationId: string | null,
  primaryScmIntegrationId: string | null,
  // ticketSystem, credentials removed
}
```

## Database Migrations Required

1. **Migration 027**: `integration_credentials` table (completed)
2. **Migration 028**: Primary integration columns (completed)
3. **Future Migration 029**: Remove `is_primary` column
4. **Future Migration 030**: Remove deprecated project columns

## Code Changes Required

### Backend
- [x] Create `IntegrationCredentialDAO`
- [x] Update `ProjectDAO` to handle primary integration columns
- [x] Update `ProjectScmConfigDAO` to support integration credentials
- [x] Update integration routes for credential management
- [x] Update project routes to validate integration credentials
- [x] Update `ProjectIntegrationLinkService` to maintain primary columns

### Frontend
- [x] Update ProjectSettingsPage to show integration credential selector
- [x] Add Integration Credential management UI in integration detail page
- [x] Deprecation warnings for legacy credential configuration

### Worker/Runtime
- No changes required - SCM credentials are resolved via existing secret resolution path

## Rollback Plan

If issues arise:
1. Revert to using `is_primary` for primary integration lookups
2. The deprecated columns are preserved until explicit removal migration

## Testing Checklist

- [x] Migration 027 applies cleanly
- [x] Migration 028 applies cleanly with backfill
- [x] Integration credentials CRUD works
- [x] Project SCM config can reference integration credentials
- [x] Setting primary integration updates correct category column
- [x] Backfill correctly populates primary columns from existing data
- [x] Frontend: ProjectSettingsPage shows integration credential selector
- [x] Frontend: Integration detail page has credential management UI
- [x] Frontend: All builds and tests pass
