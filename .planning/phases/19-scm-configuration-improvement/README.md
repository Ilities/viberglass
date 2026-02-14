# SCM Configuration Improvement - Status

**Phase:** 19 - SCM Configuration Improvement  
**Last Updated:** 2026-02-14  
**Status:** Complete ✅

---

## Overview

This phase delivered:
1. **Project-level SCM configuration** - Each project can configure source/base/PR branch settings and SCM credentials
2. **GitHub Integration Simplification** - Webhook-first UX with label-gated auto-execute
3. **Durable SCM Credential Model** - Productized credential management with integration credentials table
4. **Project Integration Linking Cleanup** - Category-specific primary integration columns

---

## Completed Work ✅

### 1. Project SCM Config V1
| Component | Status |
|-----------|--------|
| DB Migration 026 (`project_scm_configs` table) | ✅ Complete |
| ProjectScmConfigDAO with CRUD | ✅ Complete |
| Backend API routes with validation | ✅ Complete |
| TicketExecutionService wiring | ✅ Complete |
| Frontend ProjectSettingsPage SCM section | ✅ Complete |
| Backend route tests | ✅ Complete |
| Frontend unit tests | ✅ Complete |

### 2. GitHub Integration Simplification
| Component | Status |
|-----------|--------|
| Auto-create on `/new/github` | ✅ Complete |
| Hide generic Configuration section | ✅ Complete |
| Inbound: Project + repository mapping | ✅ Complete |
| Inbound: Label-gated auto-execute | ✅ Complete |
| Outbound: Force `job_started` + `job_ended` | ✅ Complete |
| Outbound: Remove delete action | ✅ Complete |
| Backend unit tests | ✅ Complete |
| Frontend unit tests | ✅ Complete |

### 3. Durable SCM Credential Model
| Component | Status |
|-----------|--------|
| DB Migration 027 (`integration_credentials` table) | ✅ Complete |
| IntegrationCredentialDAO with CRUD | ✅ Complete |
| Backend API routes | ✅ Complete |
| Frontend IntegrationCredentialSection | ✅ Complete |
| Project SCM config credential selector | ✅ Complete |

### 4. Project Integration Linking Semantics
| Component | Status |
|-----------|--------|
| DB Migration 028 (primary integration columns) | ✅ Complete |
| Backfill from `is_primary` | ✅ Complete |
| ProjectIntegrationLinkService updates | ✅ Complete |
| ProjectDAO updates | ✅ Complete |

### 5. Worker SCM Consumption
| Component | Status |
|-----------|--------|
| `ScmPayload` type with all fields | ✅ Complete |
| GitService PR destination override | ✅ Complete |
| GitService PR base branch override | ✅ Complete |
| Branch naming template | ✅ Complete |
| SCM credential secret resolution | ✅ Complete |

### 6. Legacy Field Cleanup - Phase 2
| Component | Status |
|-----------|--------|
| `ProjectIntegrationLinkWithCategory` type | ✅ Complete |
| `getPrimaryTicketingIntegration()` method | ✅ Complete |
| `getPrimaryScmIntegration()` method | ✅ Complete |
| `getProjectIntegrationsWithCategory()` method | ✅ Complete |
| Mark legacy methods as deprecated | ✅ Complete |
| Clear primary columns on unlink | ✅ Complete |

### 7. GitHubInboundProcessor SCM Support
| Component | Status |
|-----------|--------|
| `ProjectScmConfigDAO` dependency injection | ✅ Complete |
| Fetch SCM config when submitting jobs | ✅ Complete |
| Use SCM config repository/base branch | ✅ Complete |
| Pass SCM config in job data | ✅ Complete |

---

## Remaining Work 🔄

### 1. Manual End-to-End Runtime Validation
**Priority:** High  
**Effort:** Medium

Validate the full SCM configuration flow in a real environment:

**Setup:**
```bash
# Start platform and worker
npm run dev
# Or with real infra:
npm run deploy:staging
```

**Test Steps:**
1. Configure project settings:
   - Link an SCM integration (GitHub)
   - Set source repository and base branch
   - Configure PR repository/branch overrides (optional)
   - Set branch naming template (optional)
   - Select integration credential

2. Trigger ticket execution via:
   - Manual ticket run, OR
   - GitHub webhook with label-gated auto-execute

3. Verify in worker logs:
   - Repository checkout uses `scm.sourceRepository`
   - Base branch matches `scm.baseBranch`
   - Feature branch name follows `scm.branchNameTemplate`
   - PR created against `scm.pullRequestRepository` + `scm.pullRequestBaseBranch`
   - SCM credential is available and used

**Success Criteria:**
- [ ] Job completes successfully
- [ ] PR is created with correct target repository
- [ ] PR is created with correct base branch
- [ ] Branch name follows template if configured
- [ ] SCM credential authenticated successfully

---

## Database Migrations Applied

| Migration | Description | Status |
|-----------|-------------|--------|
| 026_add_project_scm_configs.ts | Project SCM configuration table | ✅ Applied |
| 027_add_integration_credentials.ts | Integration credentials table | ✅ Applied |
| 028_add_project_primary_integrations.ts | Primary integration columns | ✅ Applied |

---

## Key Architecture Decisions

1. **Webhook-first providers** (GitHub, Jira, Shortcut): No generic Configuration section, inbound/outbound webhook sections only
2. **Label-gated auto-execute** (GitHub-specific): Issues only auto-execute if they have specific labels
3. **Integration credentials**: Separate table referencing secrets, allows rotation without changing project config
4. **Category-specific primary integrations**: Separate columns for ticketing vs SCM instead of generic `is_primary`

---

## Quick Commands

```bash
# Verify builds
npm run build -w @viberglass/types
npm run build -w @viberglass/platform-backend
npm run build -w @viberglass/frontend
npm run build -w @viberator/orchestrator

# Run related tests
npm run test -w @viberglass/platform-backend -- src/__tests__/unit/api/routes/projects.scm-config.routes.test.ts --runInBand
npm run test -w @viberglass/platform-backend -- src/__tests__/unit/api/routes/integrations.webhooks.routes.test.ts --runInBand
npm run test -w @viberglass/platform-backend -- src/__tests__/unit/services/TicketExecutionService.test.ts --runInBand
npm run test -w @viberglass/frontend -- src/pages/project/settings/ProjectSettingsPage.test.tsx --runInBand
npm run test -w @viberglass/frontend -- src/pages/settings/integration-detail/GitHubWebhookSections.test.tsx --runInBand

# Apply migrations
npm run migrate:latest -w @viberglass/platform-backend
```

---

## Archived Documents

The following historical handoff documents have been archived to `./archive/`:
- `github-integration-simplification-handoff.md` - Original GitHub simplification plan
- `project-scm-config-v1-handoff.md` - Original SCM config implementation plan
- `project-scm-config-v1-remaining-handoff.md` - Mid-implementation status update
- `project-scm-config-v1-legacy-deprecation-plan.md` - Legacy deprecation plan

This README supersedes all archived documents.
