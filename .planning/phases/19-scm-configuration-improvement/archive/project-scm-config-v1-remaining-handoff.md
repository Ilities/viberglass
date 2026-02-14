# Project SCM Config V1 - Remaining Handoff

## Purpose
This file captures the remaining work after the latest implementation pass on `project-scm-config-v1`.

## Completed In Latest Pass

### 0. GitService SCM Authentication Fix ✅
**Issue**: GitService expected `GITHUB_TOKEN` or `GH_TOKEN` environment variables, but when users created secrets with different names (e.g., `my-project-token`), the credential was injected as `MY_PROJECT_TOKEN` which GitService didn't recognize.

**Fix**: Updated all SCM auth providers to search for fallback tokens:
- GitHub: Searches for any env var containing "GITHUB" and "TOKEN"
- GitLab: Searches for any env var containing "GITLAB" and "TOKEN" or "PASSWORD"  
- Bitbucket: Searches for any env var containing "BITBUCKET" and "TOKEN" or "PASSWORD"

**Files Modified**:
- `apps/viberator/src/scm/providers/GithubAuthProvider.ts`
- `apps/viberator/src/scm/providers/GitlabAuthProvider.ts`
- `apps/viberator/src/scm/providers/BitbucketAuthProvider.ts`

### 1. Durable SCM Credential Product Model ✅
**Implementation**:
- Created `integration_credentials` table (Migration 027)
- Created `IntegrationCredentialDAO` with full CRUD operations
- Credentials belong to an integration and reference a secret
- Supports credential types: `token`, `ssh_key`, `oauth`, `basic`
- Includes `isDefault` flag for automatic selection
- Added credential management routes:
  - `GET /api/integrations/:id/credentials`
  - `POST /api/integrations/:id/credentials`
  - `GET /api/integrations/:id/credentials/:credentialId`
  - `PUT /api/integrations/:id/credentials/:credentialId`
  - `DELETE /api/integrations/:id/credentials/:credentialId`

**Files Created/Modified**:
- `apps/platform-backend/src/migrations/027_add_integration_credentials.ts`
- `apps/platform-backend/src/persistence/integrations/IntegrationCredentialDAO.ts`
- `apps/platform-backend/src/api/routes/integrations.ts`

### 2. Project Integration Linking Semantics Cleanup ✅
**Implementation**:
- Added `primary_ticketing_integration_id` and `primary_scm_integration_id` columns (Migration 028)
- Backfills from existing `is_primary` data during migration
- Updated `ProjectIntegrationLinkService` to maintain new columns when:
  - Linking an integration as primary
  - Setting an existing link as primary
- SCM vs Ticketing category determined by integration registry plugin

**Files Created/Modified**:
- `apps/platform-backend/src/migrations/028_add_project_primary_integrations.ts`
- `apps/platform-backend/src/persistence/project/ProjectDAO.ts`
- `apps/platform-backend/src/api/services/integrations/ProjectIntegrationLinkService.ts`

### 3. Legacy Project Fields Deprecation Plan ✅
**Implementation**:
- Created comprehensive deprecation plan document
- Documented migration timeline and phases
- Identified all deprecated fields and their replacements
- Created rollback plan

**Files Created**:
- `.planning/project-scm-config-v1-legacy-deprecation-plan.md`

### 4. Project SCM Config Enhancement ✅
**Implementation**:
- Added `integration_credential_id` column to `project_scm_configs`
- Updated `ProjectScmConfigDAO` to support the new field
- Updated project SCM config routes to validate integration credentials
- Updated shared types for all new fields

**Files Modified**:
- `apps/platform-backend/src/persistence/project/ProjectScmConfigDAO.ts`
- `apps/platform-backend/src/persistence/types/database.ts`
- `apps/platform-backend/src/api/routes/projects.ts`
- `packages/types/src/project.ts`
- `packages/types/src/integration.ts`

## Completed Work

### 1. Frontend Integration Credential UI ✅
**Implemented:**
- ✅ Integration credential management UI in integration detail page (`IntegrationCredentialSection` component)
- ✅ ProjectSettingsPage SCM section shows integration credential selector with loading states
- ✅ Users can navigate to integration settings to create/manage credentials

**Files Created/Modified:**
- `apps/platform-frontend/src/pages/settings/integration-detail/IntegrationCredentialSection.tsx` (new)
- `apps/platform-frontend/src/pages/settings/IntegrationDetailPage.tsx`
- `apps/platform-frontend/src/pages/project/settings/ProjectSettingsPage.tsx`
- `apps/platform-frontend/src/service/api/integration-api.ts`

## Remaining Work

### 2. Legacy Field Cleanup (In Progress)
Per the deprecation plan:
- ✅ Phase 1 (Completed): Dual-write period with backfill migration
- 🔄 Phase 2 (Current): Update all read paths to use new primary columns
- ⏳ Phase 3 (Future): Remove deprecated columns

### 3. Manual End-to-End Runtime Validation
Still needed:
- Run platform + worker with real infra credentials
- Configure Ticketing + SCM in project settings
- Trigger ticket execution and verify:
  - repo checkout uses SCM source repository/base branch
  - branch naming template is applied
  - PR target repo/base branch overrides are honored
  - SCM credential secret is available and used at runtime

## Database Migrations

Run migrations in order:
```bash
npm run migrate:latest -w @viberglass/platform-backend
```

Migrations to apply:
1. **026_add_project_scm_configs.ts** (existing, may already be applied)
2. **027_add_integration_credentials.ts** (new)
3. **028_add_project_primary_integrations.ts** (new)

## API Changes Summary

### New Endpoints
```
GET    /api/integrations/:id/credentials
POST   /api/integrations/:id/credentials
GET    /api/integrations/:id/credentials/:credentialId
PUT    /api/integrations/:id/credentials/:credentialId
DELETE /api/integrations/:id/credentials/:credentialId
```

### Updated Types
```typescript
// New: Integration Credential
interface IntegrationCredential {
  id: string
  integrationId: string
  name: string
  credentialType: 'token' | 'ssh_key' | 'oauth' | 'basic'
  secretId: string
  isDefault: boolean
  description?: string
  expiresAt?: string
  lastUsedAt?: string
}

// Updated: ProjectScmConfig
interface ProjectScmConfig {
  // ... existing fields
  integrationCredentialId?: string | null  // NEW
}

// Updated: Project
interface Project {
  // ... existing fields
  primaryTicketingIntegrationId?: string | null  // NEW
  primaryScmIntegrationId?: string | null        // NEW
}
```

## Validation Snapshot From Latest Pass

All builds and tests passing:
```bash
✅ npm run build -w @viberglass/types
✅ npm run build -w @viberglass/platform-backend  
✅ npm run build -w @viberglass/frontend
✅ npm run build -w @viberator/orchestrator
✅ npm run test -w @viberglass/platform-backend -- src/__tests__/unit/api/routes/projects.scm-config.routes.test.ts
✅ npm run test -w @viberglass/platform-backend -- src/__tests__/unit/services/TicketExecutionService.test.ts
✅ npm run test -w @viberglass/frontend -- src/pages/project/settings/ProjectSettingsPage.test.tsx
```

Run these to verify:

```bash
# Build all packages
npm run build -w @viberglass/types
npm run build -w @viberglass/platform-backend
npm run build -w @viberglass/frontend
npm run build -w @viberator/orchestrator

# Run specific tests
npm run test -w @viberglass/platform-backend -- src/__tests__/unit/api/routes/projects.scm-config.routes.test.ts --runInBand
npm run test -w @viberglass/platform-backend -- src/__tests__/unit/services/TicketExecutionService.test.ts --runInBand
npm run test -w @viberglass/frontend -- src/pages/project/settings/ProjectSettingsPage.test.tsx --runInBand

# Apply migrations
npm run migrate:latest -w @viberglass/platform-backend
```

## Notes
- No breaking API changes - all new fields are optional
- `is_primary` column is maintained for backward compatibility
- Backfill migration automatically populates new primary columns
