---
phase: 07-clanker-runtime-status
plan: 01
subsystem: Database Schema
tags: [kysely, migration, typescript, postgresql, jobs, progress, heartbeat]
completed: 2026-01-21
---

# Phase 7 Plan 1: Database Schema for Heartbeat and Progress Summary

Added database support for heartbeat tracking, progress history, and log streaming to enable workers to report liveness and execution status.

## One-Liner

Database migration and TypeScript types for job heartbeat tracking with progress history table and log lines buffer.

## Artifact Deliverables

| Artifact | Status | Location |
|----------|--------|----------|
| Migration file | Complete | `platform/backend/migrations/007_add_job_heartbeat_and_progress.ts` |
| TypeScript types | Complete | `platform/backend/src/persistence/types/database.ts` |

## Changes Made

### 1. Database Migration (007_add_job_heartbeat_and_progress.ts)

**Added to jobs table:**
- `last_heartbeat` (timestamp, nullable) - Tracks when job last sent progress/heartbeat
- `last_heartbeat_grace_period_seconds` (integer, default 300) - Configurable grace period (5 minutes default)

**Created job_progress_updates table:**
- `id` (uuid, primary key)
- `job_id` (varchar(255), foreign key to jobs.id ON DELETE CASCADE)
- `step` (varchar(100), nullable) - Current step name
- `message` (text, not null) - Human-readable status message
- `details` (jsonb, nullable) - Additional structured data
- `created_at` (timestamp) - Progress timestamp
- Index on (job_id, created_at DESC) for efficient querying

**Created job_log_lines table:**
- `id` (uuid, primary key)
- `job_id` (varchar(255), foreign key to jobs.id ON DELETE CASCADE)
- `level` (varchar(20), check constraint: info/warn/error/debug)
- `message` (text, not null) - Log content
- `source` (varchar(100), nullable) - Component name
- `created_at` (timestamp) - Log timestamp
- Index on (job_id, created_at DESC) for streaming

**Created index for stale job detection:**
- `idx_jobs_last_heartbeat` on jobs(last_heartbeat) WHERE status = 'active'

### 2. TypeScript Types (database.ts)

**Extended JobsTable interface:**
- `last_heartbeat: Generated<Timestamp> | null`
- `last_heartbeat_grace_period_seconds: Generated<number>`

**Added JobProgressUpdatesTable interface:**
- Full type definition matching migration schema
- Proper Generated<Timestamp> handling for created_at

**Added JobLogLinesTable interface:**
- Level as union type: "debug" | "error" | "info" | "warn"
- Proper nullable handling for optional fields

**Updated Database interface:**
- Added `job_progress_updates: JobProgressUpdatesTable`
- Added `job_log_lines: JobLogLinesTable`

## Tech Stack Tracking

**Added:**
- None (existing Kysely, PostgreSQL)

**Patterns:**
- Kysely migration pattern with up/down functions
- Foreign key cascade cleanup for data integrity
- Partial index (WHERE status = 'active') for query optimization

## Dependency Graph

**Requires:**
- Phase 4.4: Jobs table (migration 005)

**Provides:**
- Schema for progress update API (plan 07-02)
- Schema for log streaming API (plan 07-03)
- Schema for stale job detection (plan 07-04)

**Affects:**
- JobProgressService (to be created)
- JobLoggingService (to be created)
- Stale job monitor (to be created)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| UUID primary keys for new tables | Consistent with modern PostgreSQL practices |
| ON DELETE CASCADE foreign keys | Automatic cleanup when jobs are deleted |
| Partial index on last_heartbeat | Optimizes stale job queries without index bloat |
| Separated progress from log tables | Different query patterns (history vs streaming) |
| Default 300-second grace period | Balances responsiveness with false-positive prevention |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Migration file follows Kysely pattern from 005_add_jobs_table.ts
- [x] TypeScript types match migration schema exactly
- [x] `npm run build` in platform/backend succeeds
- [x] All foreign key relationships defined with ON DELETE CASCADE
- [x] Indexes created for query performance (job_id lookups, stale jobs)

## Metrics

- **Duration:** ~100 seconds
- **Commits:** 2
- **Files modified:** 2
- **Tables added:** 2
- **Columns added:** 2 (to jobs table)
- **Indexes added:** 3
