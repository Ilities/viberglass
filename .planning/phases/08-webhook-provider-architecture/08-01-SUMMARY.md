---
phase: 08-webhook-provider-architecture
plan: 01
subsystem: database
tags: [webhooks, postgres, kysely, github, jira, deduplication]

# Dependency graph
requires:
  - phase: 07-clanker-runtime-status
    provides: job tracking infrastructure with progress and logging
provides:
  - webhook_provider_configs table for per-project webhook configuration
  - webhook_delivery_attempts table for idempotency tracking
  - api_token_encrypted storage for outbound API credentials (GitHub PAT, Jira API token)
affects: [08-webhook-provider-architecture, 08-webhook-provider]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - UUID primary keys with varchar(255) for webhook tables
    - Foreign key with ON DELETE CASCADE for orphan cleanup
    - Unique constraint on delivery_id for idempotency
    - JSONB for allowed_events and label_mappings
    - Check constraints for provider and status enums

key-files:
  created:
    - platform/backend/migrations/008_add_webhook_provider_config.ts
  modified:
    - platform/backend/src/persistence/types/database.ts

key-decisions:
  - "project_id foreign key is nullable - allows tenant-level default configs without project binding"
  - "api_token_encrypted stored in same table as webhook config - simplifies credential management"
  - "Unique constraint on delivery_id for deduplication - prevents duplicate webhook processing"
  - "provider column uses check constraint (github | jira) - type-safe enum at database level"

patterns-established:
  - "Pattern: webhook_provider_configs stores per-project provider settings with nullable project_id for defaults"
  - "Pattern: webhook_delivery_attempts tracks all webhook events with unique delivery_id for idempotency"
  - "Pattern: JSONB columns for flexible configuration (allowed_events array, label_mappings object)"

# Metrics
duration: 1min
completed: 2026-01-22
---

# Phase 8 Plan 1: Webhook Provider Database Schema Summary

**Database schema for provider-agnostic webhook configuration with secret storage, deduplication tracking, and outbound API credentials**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-22T11:15:10Z
- **Completed:** 2026-01-22T11:16:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `webhook_provider_configs` table with per-project provider configuration (GitHub/Jira)
- Created `webhook_delivery_attempts` table for idempotency tracking and retry handling
- Added `api_token_encrypted` column for outbound API credentials (posting results back to platforms)
- TypeScript interfaces provide type-safe database access for webhook tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Create webhook provider database migration** - `f1e12f3` (feat)
2. **Task 2: Add TypeScript types for webhook tables** - `0e17269` (feat)

## Files Created/Modified

- `platform/backend/migrations/008_add_webhook_provider_config.ts` - Creates webhook_provider_configs and webhook_delivery_attempts tables
- `platform/backend/src/persistence/types/database.ts` - Added WebhookProviderConfigsTable and WebhookDeliveryAttemptsTable interfaces

## Decisions Made

- **Nullable project_id on webhook_provider_configs** - Allows tenant-level default configurations without being bound to a specific project
- **api_token_encrypted in provider config table** - Stores outbound API credentials (GitHub PAT, Jira API token) alongside webhook config for simplified management
- **Unique constraint on delivery_id** - Database-level idempotency prevents duplicate webhook processing from retries
- **Check constraints for enums** - provider and status fields use CHECK constraints for type safety at database level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database schema ready for webhook provider implementation
- TypeScript types provide compile-time safety for webhook configuration access
- Migration can be run to create tables in development/staging/production
- Next plan (08-02) will implement webhook provider interfaces and services using these tables

---
*Phase: 08-webhook-provider-architecture*
*Completed: 2026-01-22*
